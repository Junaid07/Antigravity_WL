/* ==========================================================================
   Small Dams Dashboard Controller Logic (app.js)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE VARIABLES ---
  let rawParsedData = [];
  let damsMetadata = {}; // Location -> { static columns }
  let damsData = [];     // Array of parsed rows
  let timelineDates = []; // Sorted unique date strings
  let damNames = [];      // Sorted unique dam names
  
  // Active Interactive State
  let activeDateIndex = 0;
  let selectedDam = '';
  let selectedMetric = 'feet'; // 'feet' or 'percent'
  let isPlaying = false;
  let playbackIntervalId = null;
  let statusFilter = 'ALL';
  
  // Dashboard Visual Instances
  let mapInstance = null;
  let mapMarkers = {}; // Location -> Leaflet Marker
  let trendsChartInstance = null;
  
  // Dam color palettes (with hex codes)
  const damColors = {
    'Dharabi': { border: '#3b82f6', rgba: 'rgba(59, 130, 246, opacity)' },
    'Mial': { border: '#10b981', rgba: 'rgba(16, 185, 129, opacity)' },
    'Dhurnal': { border: '#f97316', rgba: 'rgba(249, 115, 22, opacity)' },
    'Gurabh': { border: '#8b5cf6', rgba: 'rgba(139, 92, 246, opacity)' },
    'Bhugtal': { border: '#ec4899', rgba: 'rgba(236, 72, 153, opacity)' },
    'Pira': { border: '#eab308', rgba: 'rgba(234, 179, 8, opacity)' },
    'Dhok Hum': { border: '#14b8a6', rgba: 'rgba(20, 184, 166, opacity)' },
    'U-Lakhwal': { border: '#ef4444', rgba: 'rgba(239, 68, 68, opacity)' }
  };
  
  // Fallback color utility for dynamic names
  function getDamColor(name, opacity = 1) {
    if (damColors[name]) {
      return damColors[name].rgba.replace('opacity', opacity);
    }
    // Generate a consistent HSL color based on string hash
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsla(${h}, 70%, 55%, ${opacity})`;
  }
  
  // --- DOM ELEMENT REFERENCES ---
  const loadingOverlay = document.getElementById('loadingOverlay');
  const latestUpdateDate = document.getElementById('latestUpdateDate');
  const damQuickSelect = document.getElementById('damQuickSelect');
  
  // KPIs
  const kpiTotalDams = document.getElementById('kpiTotalDams');
  const kpiTotalLiveStorage = document.getElementById('kpiTotalLiveStorage');
  const kpiLiveStorageCap = document.getElementById('kpiLiveStorageCap');
  const kpiAvgCapacity = document.getElementById('kpiAvgCapacity');
  const kpiSpillAlerts = document.getElementById('kpiSpillAlerts');
  const kpiAlertDetail = document.getElementById('kpiAlertDetail');
  const alertKpiCard = document.getElementById('alertKpiCard');
  
  // Timeline controls
  const dateRangeSlider = document.getElementById('dateRangeSlider');
  const startDateLabel = document.getElementById('startDateLabel');
  const endDateLabel = document.getElementById('endDateLabel');
  const playTimelineBtn = document.getElementById('playTimelineBtn');
  const calendarDatePicker = document.getElementById('calendarDatePicker');
  
  // Selected Dam Panels
  const selectedDamBadge = document.getElementById('selectedDamBadge');
  const detailsDamName = document.getElementById('detailsDamName');
  const detailsCompletionYear = document.getElementById('detailsCompletionYear');
  const detailsRiver = document.getElementById('detailsRiver');
  const statWaterLevel = document.getElementById('statWaterLevel');
  const statWaterLevelDate = document.getElementById('statWaterLevelDate');
  const statLiveStorage = document.getElementById('statLiveStorage');
  
  // Gauges & Water Tank
  const gaugeNPL = document.getElementById('gaugeNPL');
  const gaugeDSL = document.getElementById('gaugeDSL');
  const waterLevelFill = document.getElementById('waterLevelFill');
  const waterWave = document.getElementById('waterWave');
  const waterWaveBack = document.getElementById('waterWaveBack');
  const tankPercentageText = document.getElementById('tankPercentageText');
  
  // Details Metas
  const metaCost = document.getElementById('metaCost');
  const metaGrossStorage = document.getElementById('metaGrossStorage');
  const metaCatchment = document.getElementById('metaCatchment');
  const metaCCA = document.getElementById('metaCCA');
  const metaCanal = document.getElementById('metaCanal');
  const metaHFL = document.getElementById('metaHFL');
  const metaCoords = document.getElementById('metaCoords');
  
  // Table & Filters
  const tableBody = document.getElementById('tableBody');
  const statusFilterSelect = document.getElementById('statusFilterSelect');
  
  // Metric toggle buttons
  const btnMetricFeet = document.getElementById('btnMetricFeet');
  const btnMetricPercent = document.getElementById('btnMetricPercent');

  // --- INITIALIZATION ---
  fetchData();

  // --- FUNCTIONS ---
  
  // 1. Fetch CSV file
  function fetchData() {
    fetch('dams_data_new.csv')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load CSV file. Please make sure dams_data_new.csv is in the same directory.');
        }
        return response.text();
      })
      .then(csvText => {
        parseCSVData(csvText);
      })
      .catch(error => {
        alert(error.message);
        console.error(error);
        loadingOverlay.querySelector('.loading-text').innerText = error.message;
      });
  }

  // Custom CSV parser to avoid external dependency issues
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = [];
      let current = '';
      let inQuotes = false;
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index].replace(/^"|"$/g, '') : '';
      });
      results.push(row);
    }
    return results;
  }

  // 2. Parse CSV text
  function parseCSVData(csvText) {
    try {
      rawParsedData = parseCSV(csvText);
      processDamsData();
      initDashboard();
    } catch (err) {
      console.error('CSV Parsing error:', err);
      alert('Error parsing CSV file: ' + err.message);
      loadingOverlay.querySelector('.loading-text').innerText = 'Error parsing CSV: ' + err.message;
    }
  }

  // 3. Process parsed rows & extract static features + timeline
  function processDamsData() {
    damsMetadata = {};
    damsData = [];
    let uniqueDatesSet = new Set();
    let uniqueDamsSet = new Set();

    rawParsedData.forEach((row, index) => {
      const location = row['Location'] ? row['Location'].trim() : '';
      const dateStr = row['Date'] ? row['Date'].trim() : '';
      if (!location || !dateStr) return; // skip malformed lines
      
      uniqueDamsSet.add(location);
      uniqueDatesSet.add(dateStr);
      
      const waterLevel = parseFloat(row['Water_Level_ft']);
      
      // If static columns are populated, capture them in metadata
      const lat = parseFloat(row['Latitude']);
      const lon = parseFloat(row['Longitude']);
      const dsl = parseFloat(row['DSL (ft)']);
      const npl = parseFloat(row['NPL (ft)']);
      
      if (!isNaN(lat) && !isNaN(lon) && !isNaN(dsl) && !isNaN(npl)) {
        damsMetadata[location] = {
          latitude: lat,
          longitude: lon,
          DSL: dsl,
          NPL: npl,
          HFL: parseFloat(row['HFL (ft)']) || npl + 5, // fallback
          height: parseFloat(row['Height (ft)']) || 0,
          cost: row['Completion Cost'] ? row['Completion Cost'].trim() : '-',
          grossCapacity: parseFloat(row['Gross Storage Capacity (Aft)']) || 0,
          liveStorage: parseFloat(row['Live storage (Aft)']) || 0,
          cca: row['C.C.A. (Acres)'] ? row['C.C.A. (Acres)'].trim() : '-',
          canalCap: row['Capacity of Channel (Cfs)'] ? row['Capacity of Channel (Cfs)'].trim() : '-',
          canalLen: row['Length of Canal (ft)'] ? row['Length of Canal (ft)'].trim() : '-',
          river: row['River / Nullah'] ? row['River / Nullah'].trim() : '-',
          year: row['Year of Completion'] ? row['Year of Completion'].trim() : '-',
          catchment: parseFloat(row['Catchment Area (Sq. Km)']) || 0
        };
      }

      damsData.push({
        dateStr: dateStr,
        location: location,
        waterLevel: isNaN(waterLevel) ? null : waterLevel
      });
    });

    damNames = Array.from(uniqueDamsSet).sort();
    
    // Sort unique dates chronologically
    // In our CSV, dates are DD/MM/YYYY
    timelineDates = Array.from(uniqueDatesSet).sort((a, b) => {
      return parseDate(a) - parseDate(b);
    });

    // Default state: select the last date (latest) and first dam
    activeDateIndex = timelineDates.length - 1;
    selectedDam = damNames[0] || '';
  }

  // Safe Date parsing helper for DD/MM/YYYY
  function parseDate(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    return new Date(dateStr);
  }

  // Format date for displays (e.g. "01 Jun 2026")
  function formatDateFriendly(dateStr) {
    const dObj = parseDate(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${dObj.getDate().toString().padStart(2, '0')} ${months[dObj.getMonth()]} ${dObj.getFullYear()}`;
  }

  // Helper to convert DD/MM/YYYY (from CSV) to YYYY-MM-DD (for HTML date input)
  function convertDDMMYYYYToYYYYMMDD(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  // Helper to find closest date index in timelineDates from a YYYY-MM-DD input
  function findClosestDateIndex(targetDateStr) {
    const targetDate = new Date(targetDateStr);
    if (isNaN(targetDate.getTime())) return activeDateIndex;
    
    let closestIndex = 0;
    let minDiff = Infinity;
    
    for (let i = 0; i < timelineDates.length; i++) {
      const d = parseDate(timelineDates[i]);
      const diff = Math.abs(d - targetDate);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    return closestIndex;
  }

  // 4. Calculate status metrics for any water level
  function getWaterLevelStatus(waterLevel, metadata) {
    if (!metadata || waterLevel === null) {
      return { percent: 0, status: 'Unknown', color: '#6b7280', badgeClass: 'badge-below-dsl' };
    }
    const dsl = metadata.DSL;
    const npl = metadata.NPL;
    
    // Percent calculated between DSL (0%) and NPL (100%)
    let percent = 0;
    if (npl > dsl) {
      percent = ((waterLevel - dsl) / (npl - dsl)) * 100;
    }
    
    let status = 'Medium Storage';
    let color = 'var(--color-medium)';
    let badgeClass = 'badge-medium';

    if (waterLevel > npl) {
      status = 'Spilling';
      color = 'var(--color-spilling)';
      badgeClass = 'badge-spilling';
    } else if (waterLevel === npl) {
      status = 'Spill Watch';
      color = 'var(--color-spill-watch)';
      badgeClass = 'badge-watch';
    } else if (percent >= 75) {
      status = 'High Storage';
      color = 'var(--color-high)';
      badgeClass = 'badge-high';
    } else if (percent >= 50) {
      status = 'Medium Storage';
      color = 'var(--color-medium)';
      badgeClass = 'badge-medium';
    } else if (percent >= 25) {
      status = 'Low Storage';
      color = 'var(--color-low)';
      badgeClass = 'badge-low';
    } else {
      status = 'Very Low Storage';
      color = 'var(--color-below-dsl)'; // Keep same slate grey color
      badgeClass = 'badge-below-dsl';   // Keep same badge styling class
    }

    return {
      percent: percent,
      status: status,
      color: color,
      badgeClass: badgeClass
    };
  }

  // 5. Initialize layout, map, and charts
  function initDashboard() {
    // Populate Quick Select Dam options
    damQuickSelect.innerHTML = damNames.map(name => `<option value="${name}">${name}</option>`).join('');
    damQuickSelect.value = selectedDam;

    // Timeline elements
    dateRangeSlider.min = 0;
    dateRangeSlider.max = timelineDates.length - 1;
    dateRangeSlider.value = activeDateIndex;
    startDateLabel.innerText = formatDateFriendly(timelineDates[0]);
    endDateLabel.innerText = formatDateFriendly(timelineDates[timelineDates.length - 1]);
    
    // Set Calendar Date Picker bounds and value
    if (calendarDatePicker) {
      calendarDatePicker.min = convertDDMMYYYYToYYYYMMDD(timelineDates[0]);
      calendarDatePicker.max = convertDDMMYYYYToYYYYMMDD(timelineDates[timelineDates.length - 1]);
      calendarDatePicker.value = convertDDMMYYYYToYYYYMMDD(timelineDates[activeDateIndex]);
    }
    
    // Bind Event Listeners
    setupEvents();
    
    // Build Leaflet Map
    initMap();
    
    // Build ChartJS Line Chart
    initChart();
    
    // Hide loader overlay with transition
    loadingOverlay.style.opacity = '0';
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
    }, 500);

    // Initial Dashboard Refresh
    updateDashboard();
  }

  // 6. Setup interactive DOM events
  function setupEvents() {
    // Quick focus selector
    damQuickSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        selectedDam = e.target.value;
        updateDashboard();
        // Center map on the selected dam
        const meta = damsMetadata[selectedDam];
        if (meta && mapInstance) {
          mapInstance.setView([meta.latitude, meta.longitude], 12);
          if (mapMarkers[selectedDam]) {
            mapMarkers[selectedDam].openPopup();
          }
        }
      }
    });

    // Date range slider input
    dateRangeSlider.addEventListener('input', (e) => {
      activeDateIndex = parseInt(e.target.value, 10);
      updateDashboard();
    });

    // Calendar Date Picker input
    if (calendarDatePicker) {
      calendarDatePicker.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          activeDateIndex = findClosestDateIndex(val);
          dateRangeSlider.value = activeDateIndex;
          calendarDatePicker.value = convertDDMMYYYYToYYYYMMDD(timelineDates[activeDateIndex]);
          updateDashboard();
        }
      });
    }

    // Play/Pause Playback Timeline
    playTimelineBtn.addEventListener('click', () => {
      if (isPlaying) {
        pauseTimeline();
      } else {
        playTimeline();
      }
    });

    // Metric Toggle Buttons
    btnMetricFeet.addEventListener('click', () => {
      selectedMetric = 'feet';
      btnMetricFeet.classList.add('active');
      btnMetricPercent.classList.remove('active');
      updateChartData();
    });

    btnMetricPercent.addEventListener('click', () => {
      selectedMetric = 'percent';
      btnMetricPercent.classList.add('active');
      btnMetricFeet.classList.remove('active');
      updateChartData();
    });

    // Status Filter Table Dropdown
    statusFilterSelect.addEventListener('change', (e) => {
      statusFilter = e.target.value;
      renderStatusTable();
    });
  }

  // 7. Initialize Leaflet Map with beautiful Dark style
  function initMap() {
    // Punjab cluster center around Chakwal: ~32.88 N, 72.45 E
    mapInstance = L.map('damsMap', {
      zoomControl: true,
      maxZoom: 16,
      minZoom: 7
    }).setView([32.88, 72.4], 10);

    // Define base maps layers (Streets, Satellite, Terrain)
    const baseLayers = {
      "Light / Streets": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }),
      "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 18
      }),
      "Terrain": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Database: Esri, DeLorme, HERE, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC',
        maxZoom: 18
      })
    };

    // Add default Streets layer to map
    baseLayers["Light / Streets"].addTo(mapInstance);

    // Add layers switcher controller overlay
    L.control.layers(baseLayers, null, { position: 'topright' }).addTo(mapInstance);

    // Create markers for each dam
    damNames.forEach(name => {
      const meta = damsMetadata[name];
      if (!meta) return;

      // Custom HTML layout for marker dot
      const customIcon = L.divIcon({
        className: 'custom-dam-marker',
        html: `
          <div class="marker-pulse status-medium" id="pulse-${name.replace(/\s+/g, '')}"></div>
          <div class="marker-pin status-medium" id="pin-${name.replace(/\s+/g, '')}">
            <i class="fa-solid fa-water"></i>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -32]
      });

      const marker = L.marker([meta.latitude, meta.longitude], { icon: customIcon })
        .addTo(mapInstance);

      // Create Popup template
      marker.bindPopup(`
        <div class="map-popup-card">
          <div class="map-popup-title" style="color: #ea580c">${name} Dam</div>
          <div class="map-popup-row">
            <span class="map-popup-label">Water Level:</span>
            <span class="map-popup-val" id="pop-level-${name.replace(/\s+/g, '')}">- ft</span>
          </div>
          <div class="map-popup-row">
            <span class="map-popup-label">NPL / DSL:</span>
            <span class="map-popup-val">${meta.NPL} / ${meta.DSL} ft</span>
          </div>
          <div class="map-popup-row">
            <span class="map-popup-label">Current Capacity:</span>
            <span class="map-popup-val" id="pop-cap-${name.replace(/\s+/g, '')}">-%</span>
          </div>
          <div class="map-popup-row">
            <span class="map-popup-label">Status:</span>
            <span class="map-popup-val" id="pop-status-${name.replace(/\s+/g, '')}">-</span>
          </div>
          <button onclick="window.focusDamSelect('${name}')" 
                  style="width: 100%; border: 1px solid rgba(249, 115, 22, 0.4); 
                         background: rgba(249, 115, 22, 0.08); color: #ea580c; 
                         font-size: 0.725rem; font-weight: 600; padding: 0.25rem; 
                         border-radius: 4px; margin-top: 0.5rem; cursor: pointer;">
            Show Full Insights
          </button>
        </div>
      `);

      // Populate popup values dynamically upon Leaflet popup opening
      marker.on('popupopen', () => {
        const activeDateStr = timelineDates[activeDateIndex];
        const entry = damsData.find(d => d.location === name && d.dateStr === activeDateStr);
        const waterLevel = entry ? entry.waterLevel : null;
        const details = getWaterLevelStatus(waterLevel, meta);
        
        const nameClean = name.replace(/\s+/g, '');
        const popLevelEl = document.getElementById(`pop-level-${nameClean}`);
        const popCapEl = document.getElementById(`pop-cap-${nameClean}`);
        const popStatusEl = document.getElementById(`pop-status-${nameClean}`);
        
        if (popLevelEl) popLevelEl.innerText = `${waterLevel !== null ? waterLevel.toFixed(1) : '-'} ft`;
        if (popCapEl) popCapEl.innerText = `${details.percent.toFixed(1)}%`;
        if (popStatusEl) {
          popStatusEl.innerText = details.status;
          popStatusEl.style.color = details.color;
        }
      });

      // Mouse hover event listeners for spatial interactivity
      marker.on('mouseover', function (e) {
        this.openPopup();
      });

      marker.on('click', () => {
        selectDamByName(name);
      });

      mapMarkers[name] = marker;
    });

    // Expose select callback to window for button clicks inside popup
    window.focusDamSelect = (name) => {
      selectDamByName(name);
    };
  }

  // 8. Initialize Chart.js Trend Lines (Single Selected Dam + NPL + DSL lines)
  function initChart() {
    const ctx = document.getElementById('trendsChart').getContext('2d');
    
    trendsChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: timelineDates.map(d => formatDateFriendly(d)),
        datasets: [
          {
            label: 'Water Level',
            data: [],
            borderColor: '#f97316', // Orange Accent
            backgroundColor: 'rgba(249, 115, 22, 0.05)',
            borderWidth: 3,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 5,
            fill: true,
            spanGaps: true
          },
          {
            label: 'Normal Pool Level (NPL)',
            data: [],
            borderColor: '#dc2626', // Red
            borderWidth: 2,
            borderDash: [6, 6],
            pointRadius: 0,
            fill: false
          },
          {
            label: 'Dead Storage Level (DSL)',
            data: [],
            borderColor: '#475569', // Slate Grey
            borderWidth: 2,
            borderDash: [6, 6],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#0f172a',
              font: { family: 'Outfit', size: 11, weight: '500' },
              boxWidth: 12,
              boxHeight: 12,
              padding: 12
            }
          },
          tooltip: {
            padding: 10,
            titleFont: { family: 'Outfit', size: 12, weight: '700' },
            bodyFont: { family: 'Outfit', size: 12 },
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label.indexOf('(') !== -1) {
                  // extract baseline name for legend values
                  label = label.split(' (')[0] + ': ';
                } else if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += context.parsed.y.toFixed(1);
                  label += selectedMetric === 'percent' ? '%' : ' ft';
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(0, 0, 0, 0.03)' },
            ticks: { 
              color: '#64748b', 
              font: { family: 'Outfit', size: 10 },
              maxTicksLimit: 12
            }
          },
          y: {
            grid: { color: 'rgba(0, 0, 0, 0.03)' },
            ticks: { 
              color: '#64748b', 
              font: { family: 'Outfit', size: 10 }
            },
            title: {
              display: true,
              text: selectedMetric === 'percent' ? 'Capacity Fill (%)' : 'Elevation Level (ft)',
              color: '#64748b',
              font: { family: 'Outfit', size: 11, weight: '600' }
            }
          }
        }
      }
    });
  }

  // 9. Update the Line Chart dataset values for the selected dam
  function updateChartData() {
    if (!trendsChartInstance || !selectedDam) return;

    const meta = damsMetadata[selectedDam];
    if (!meta) return;

    const isFeet = selectedMetric === 'feet';
    trendsChartInstance.options.scales.y.title.text = isFeet ? 'Elevation Level (ft)' : 'Capacity Fill (%)';

    // 1. Core water Level / capacity values over time
    const dataPoints = timelineDates.map(date => {
      const entry = damsData.find(d => d.location === selectedDam && d.dateStr === date);
      if (!entry || entry.waterLevel === null) return null;
      
      if (!isFeet) {
        if (meta.NPL > meta.DSL) {
          return ((entry.waterLevel - meta.DSL) / (meta.NPL - meta.DSL)) * 100;
        }
        return 0;
      }
      return entry.waterLevel;
    });

    // 2. NPL reference line
    const nplVal = isFeet ? meta.NPL : 100;
    const nplPoints = timelineDates.map(() => nplVal);

    // 3. DSL reference line
    const dslVal = isFeet ? meta.DSL : 0;
    const dslPoints = timelineDates.map(() => dslVal);

    // Populate datasets
    trendsChartInstance.data.datasets[0].label = isFeet ? `${selectedDam} Level` : `${selectedDam} Capacity`;
    trendsChartInstance.data.datasets[0].data = dataPoints;

    trendsChartInstance.data.datasets[1].label = isFeet ? `NPL (${meta.NPL} ft)` : 'NPL (100%)';
    trendsChartInstance.data.datasets[1].data = nplPoints;

    trendsChartInstance.data.datasets[2].label = isFeet ? `DSL (${meta.DSL} ft)` : 'DSL (0%)';
    trendsChartInstance.data.datasets[2].data = dslPoints;

    trendsChartInstance.update();
  }

  // 10. Core controller logic: Update all dashboard visual elements
  function updateDashboard() {
    const activeDateStr = timelineDates[activeDateIndex];
    if (!activeDateStr) return;

    // A. Header metadata updates
    latestUpdateDate.innerText = formatDateFriendly(activeDateStr);
    
    // Update Calendar Date Picker input value
    if (calendarDatePicker) {
      calendarDatePicker.value = convertDDMMYYYYToYYYYMMDD(activeDateStr);
    }
    
    // B. Collect active date metrics for each dam
    const activeDamsState = [];
    let accumulatedLiveStorage = 0;
    let accumulatedTotalLiveStorageCap = 0;
    const alertNames = [];
    const dslNames = [];

    damNames.forEach(name => {
      const entry = damsData.find(d => d.location === name && d.dateStr === activeDateStr);
      const meta = damsMetadata[name];
      const waterLevel = entry ? entry.waterLevel : null;
      
      const details = getWaterLevelStatus(waterLevel, meta);
      activeDamsState.push({
        name: name,
        waterLevel: waterLevel,
        percent: details.percent,
        status: details.status,
        color: details.color,
        badgeClass: details.badgeClass,
        meta: meta
      });

      // Accumulate storage and alert counts
      if (meta && waterLevel !== null) {
        if (details.status === 'Spilling' || details.status === 'Spill Watch') {
          alertNames.push(name);
        }
        
        if (waterLevel < meta.DSL) {
          dslNames.push(name);
        }
        
        // Capped active live storage calculation
        const liveCap = meta.liveStorage;
        let computedLiveStorage = 0;
        if (meta.NPL > meta.DSL) {
          const ratio = (waterLevel - meta.DSL) / (meta.NPL - meta.DSL);
          computedLiveStorage = Math.max(0, Math.min(liveCap, liveCap * ratio));
        }
        accumulatedLiveStorage += computedLiveStorage;
        accumulatedTotalLiveStorageCap += liveCap;
      }
    });

    // C. Update Top KPI Cards
    kpiTotalDams.innerText = damNames.length;
    kpiTotalLiveStorage.innerText = accumulatedLiveStorage.toLocaleString('en-US', { maximumFractionDigits: 0 });
    kpiLiveStorageCap.innerText = accumulatedTotalLiveStorageCap.toLocaleString('en-US', { maximumFractionDigits: 0 });
    
    // True volumetric weighted capacity (Total Active Live Storage vs. Total Capacity)
    const avgCapVal = accumulatedTotalLiveStorageCap > 0 ? (accumulatedLiveStorage / accumulatedTotalLiveStorageCap) * 100 : 0;
    kpiAvgCapacity.innerText = `${avgCapVal.toFixed(1)}%`;
    
    // Spill / Watch Alerts Card
    kpiSpillAlerts.innerText = alertNames.length;
    if (alertNames.length > 0) {
      alertKpiCard.querySelector('.kpi-icon-box').style.background = 'rgba(220, 38, 38, 0.08)';
      alertKpiCard.querySelector('.kpi-icon-box').style.color = '#dc2626';
      kpiAlertDetail.innerText = alertNames.join(', ');
      kpiAlertDetail.style.color = '#dc2626';
    } else {
      alertKpiCard.querySelector('.kpi-icon-box').style.background = '';
      alertKpiCard.querySelector('.kpi-icon-box').style.color = '';
      kpiAlertDetail.innerText = 'None';
      kpiAlertDetail.style.color = '';
    }

    // Dams Under DSL KPI Card
    const kpiDamsUnderDsl = document.getElementById('kpiDamsUnderDsl');
    const kpiDslDetail = document.getElementById('kpiDslDetail');
    const dslKpiCard = document.getElementById('dslKpiCard');

    if (kpiDamsUnderDsl && kpiDslDetail && dslKpiCard) {
      kpiDamsUnderDsl.innerText = dslNames.length;
      if (dslNames.length > 0) {
        dslKpiCard.querySelector('.kpi-icon-box').style.background = 'rgba(220, 38, 38, 0.08)';
        dslKpiCard.querySelector('.kpi-icon-box').style.color = '#dc2626';
        kpiDslDetail.innerText = dslNames.join(', ');
        kpiDslDetail.style.color = '#dc2626';
      } else {
        dslKpiCard.querySelector('.kpi-icon-box').style.background = '';
        dslKpiCard.querySelector('.kpi-icon-box').style.color = '';
        kpiDslDetail.innerText = 'None';
        kpiDslDetail.style.color = '';
      }
    }

    // D. Update Map markers color classes and details dynamically
    activeDamsState.forEach(dam => {
      const pinEl = document.getElementById(`pin-${dam.name.replace(/\s+/g, '')}`);
      const pulseEl = document.getElementById(`pulse-${dam.name.replace(/\s+/g, '')}`);
      
      if (pinEl && pulseEl) {
        // Reset classes
        pinEl.className = 'marker-pin';
        pulseEl.className = 'marker-pulse';
        
        // Add color status classes
        let statusClass = 'status-medium';
        if (dam.status === 'Spilling') statusClass = 'status-spilling';
        else if (dam.status === 'Spill Watch') statusClass = 'status-watch';
        else if (dam.status === 'High Storage') statusClass = 'status-high';
        else if (dam.status === 'Low Storage') statusClass = 'status-low';
        else if (dam.status === 'Very Low Storage') statusClass = 'status-below-dsl';
        
        pinEl.classList.add(statusClass);
        pulseEl.classList.add(statusClass);
      }

      // Update values in existing popups
      const popLevelEl = document.getElementById(`pop-level-${dam.name.replace(/\s+/g, '')}`);
      const popCapEl = document.getElementById(`pop-cap-${dam.name.replace(/\s+/g, '')}`);
      const popStatusEl = document.getElementById(`pop-status-${dam.name.replace(/\s+/g, '')}`);
      if (popLevelEl) popLevelEl.innerText = `${dam.waterLevel !== null ? dam.waterLevel.toFixed(1) : '-'} ft`;
      if (popCapEl) popCapEl.innerText = `${dam.percent.toFixed(1)}%`;
      if (popStatusEl) {
        popStatusEl.innerText = dam.status;
        popStatusEl.style.color = dam.color;
      }
    });

    // E. Update Selected Dam Sidebar Panel
    const activeSelectedDamState = activeDamsState.find(d => d.name === selectedDam);
    updateSelectedDamCard(activeSelectedDamState);

    // F. Re-render the status grid table
    renderStatusTable(activeDamsState);

    // G. Recolor lines and highlight on ChartJS
    updateChartData();
  }

  // 11. Populate details sidebar card & animate water fill tank
  function updateSelectedDamCard(damState) {
    if (!damState) return;
    
    const meta = damState.meta;
    
    // Header labels
    detailsDamName.innerText = `${damState.name} Dam`;
    selectedDamBadge.innerText = damState.status;
    selectedDamBadge.className = `badge ${damState.badgeClass}`;
    
    if (meta) {
      detailsCompletionYear.innerText = meta.year;
      detailsRiver.innerText = meta.river;
      
      // Stat highlights
      statWaterLevel.innerText = `${damState.waterLevel !== null ? damState.waterLevel.toFixed(1) : '-'} ft`;
      statWaterLevelDate.innerText = `Recorded: ${formatDateFriendly(timelineDates[activeDateIndex])}`;
      
      // Calculate storage
      let computedLive = 0;
      if (meta.NPL > meta.DSL && damState.waterLevel !== null) {
        const ratio = (damState.waterLevel - meta.DSL) / (meta.NPL - meta.DSL);
        computedLive = Math.max(0, Math.min(meta.liveStorage, meta.liveStorage * ratio));
      }
      statLiveStorage.innerText = `${computedLive.toLocaleString('en-US', { maximumFractionDigits: 0 })} Aft`;
      
      // Gauge Labels
      gaugeNPL.innerText = `NPL: ${meta.NPL} ft`;
      gaugeDSL.innerText = `DSL: ${meta.DSL} ft`;
      
      // Tank Animations
      // Cap visual fill percentage between 0% and 100%
      const visualPercent = Math.max(0, Math.min(100, damState.percent));
      waterLevelFill.style.height = `${visualPercent}%`;
      
      tankPercentageText.innerText = `${damState.percent.toFixed(1)}%`;
      
      // Metas List
      metaCost.innerText = `${meta.cost} Million Rs.`;
      metaGrossStorage.innerText = `${meta.grossCapacity.toLocaleString('en-US')} Aft`;
      metaCatchment.innerText = `${meta.catchment} Sq. Km`;
      metaCCA.innerText = `${meta.cca} Acres`;
      metaCanal.innerText = `${meta.canalCap} Cfs / ${meta.canalLen} ft`;
      metaHFL.innerText = `${meta.HFL} ft`;
      metaCoords.innerText = `${meta.latitude.toFixed(5)}, ${meta.longitude.toFixed(5)}`;
    } else {
      detailsCompletionYear.innerText = '-';
      detailsRiver.innerText = '-';
      statWaterLevel.innerText = '-';
      statLiveStorage.innerText = '-';
      gaugeNPL.innerText = 'NPL: - ft';
      gaugeDSL.innerText = 'DSL: - ft';
      waterLevelFill.style.height = '0%';
      tankPercentageText.innerText = '0%';
    }
  }

  // 12. Render grid list status table
  function renderStatusTable(optionalStates) {
    const activeDateStr = timelineDates[activeDateIndex];
    if (!activeDateStr) return;

    let states = [];
    if (optionalStates) {
      states = optionalStates;
    } else {
      // Re-calculate states if none passed (e.g. from filter changes)
      damNames.forEach(name => {
        const entry = damsData.find(d => d.location === name && d.dateStr === activeDateStr);
        const meta = damsMetadata[name];
        const waterLevel = entry ? entry.waterLevel : null;
        const details = getWaterLevelStatus(waterLevel, meta);
        states.push({
          name: name,
          waterLevel: waterLevel,
          percent: details.percent,
          status: details.status,
          color: details.color,
          badgeClass: details.badgeClass,
          meta: meta
        });
      });
    }

    // Filter table rows
    const filteredStates = states.filter(dam => {
      if (statusFilter === 'ALL') return true;
      return dam.status === statusFilter;
    });

    tableBody.innerHTML = '';

    if (filteredStates.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
            <i class="fa-solid fa-folder-open" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
            No dams found matching the status filter: <strong>${statusFilter}</strong>
          </td>
        </tr>
      `;
      return;
    }

    filteredStates.forEach(dam => {
      const isSelected = dam.name === selectedDam;
      const row = document.createElement('tr');
      if (isSelected) row.className = 'active';
      
      const meta = dam.meta;
      const liveCapacityStr = meta ? `${meta.liveStorage.toLocaleString()} Aft` : '-';

      // Capped live storage
      let computedLive = 0;
      if (meta && meta.NPL > meta.DSL && dam.waterLevel !== null) {
        const ratio = (dam.waterLevel - meta.DSL) / (meta.NPL - meta.DSL);
        computedLive = Math.max(0, Math.min(meta.liveStorage, meta.liveStorage * ratio));
      }
      const activeLiveStorageStr = meta ? `${computedLive.toLocaleString('en-US', { maximumFractionDigits: 0 })} Aft` : '-';

      row.innerHTML = `
        <td style="font-weight: 700; color: var(--text-main);">
          <i class="fa-solid fa-anchor" style="color: ${isSelected ? '#f97316' : 'rgba(0,0,0,0.15)'}; margin-right: 0.5rem;"></i>
          ${dam.name}
        </td>
        <td>${dam.waterLevel !== null ? dam.waterLevel.toFixed(1) : '-'} ft</td>
        <td>${meta ? meta.DSL : '-'} ft</td>
        <td>${meta ? meta.NPL : '-'} ft</td>
        <td style="font-weight: 600; color: ${dam.color}">${dam.percent.toFixed(1)}%</td>
        <td>${activeLiveStorageStr} <span style="font-size: 0.7rem; color: var(--text-muted)">/ ${liveCapacityStr}</span></td>
        <td><span class="badge ${dam.badgeClass}">${dam.status}</span></td>
      `;

      row.addEventListener('click', () => {
        selectDamByName(dam.name);
      });

      tableBody.appendChild(row);
    });
  }

  // 13. Select a dam, update selection drop-down, center map
  function selectDamByName(name) {
    if (selectedDam === name) return;
    selectedDam = name;
    damQuickSelect.value = selectedDam;
    
    // Highlight table row
    Array.from(tableBody.children).forEach(row => {
      const firstColText = row.cells[0] ? row.cells[0].innerText.trim() : '';
      if (firstColText.includes(name)) {
        row.className = 'active';
      } else {
        row.className = '';
      }
    });

    // Animate map transition to center on target dam coordinates
    const meta = damsMetadata[name];
    if (meta && mapInstance) {
      mapInstance.setView([meta.latitude, meta.longitude], 12);
      if (mapMarkers[name]) {
        mapMarkers[name].openPopup();
      }
    }

    // Refresh dashboards panels
    updateDashboard();
  }

  // --- TIMELINE AUTO-PLAYBACK CONTROLS ---

  function playTimeline() {
    isPlaying = true;
    playTimelineBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
    playTimelineBtn.classList.add('active');

    playbackIntervalId = setInterval(() => {
      activeDateIndex++;
      if (activeDateIndex >= timelineDates.length) {
        // Loop back to start when reaching index bounds
        activeDateIndex = 0;
      }
      dateRangeSlider.value = activeDateIndex;
      updateDashboard();
    }, 400); // 400ms tick speed (gives a fast, smooth visualization)
  }

  function pauseTimeline() {
    isPlaying = false;
    playTimelineBtn.innerHTML = '<i class="fa-solid fa-play"></i> Run';
    playTimelineBtn.classList.remove('active');
    
    if (playbackIntervalId) {
      clearInterval(playbackIntervalId);
      playbackIntervalId = null;
    }
  }
});
