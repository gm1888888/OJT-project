class DMP41CalibrationApp {
  constructor() {
    this.currentProject = null;
    this.currentHistoricalData = null; // Store data for history view
    this.currentReadings = [];
    this.isPolling = false;
    this.calibrationSequence = [];
    this.pollInterval = null;
    this.chart = null;
    this.lastResults = []; // Cache for CSV export
    this.selectedCell = null; // For native data logger
    this.loadCells = [];
    this.currentUnit = 'kgf';
    this.demoMode = false;
    this.unitConstants = {
      'kgf': 0.00980665,
      'kN': 1.0,
      'lbf': 0.004448222,
      'N': 0.001
    };
    this.loggerData = {
      preloading: [
        { target: 0, runs: [{ m: 0, r: 0 }, { m: 0, r: 0 }, { m: 0, r: 0 }] },
        { target: 100, runs: [{ m: 0, r: 0 }, { m: 0, r: 0 }, { m: 0, r: 0 }] }
      ],
      measured: Array.from({ length: 11 }, (_, i) => ({
        point: i,
        target: i * 10,
        runs: [{ m: 0, r: 0 }, { m: 0, r: 0 }, { m: 0, r: 0 }],
        mean: 0,
        meanForce: 0, // In Selected Unit
        uncertainty: 0,
        class: 'N/A'
      }))
    };
    
    this.initEventListeners();
    this.initChart();
    this.checkHardwareStatus(); // Initial check
    this.loadSettings();
    
    // Setup blank workspace on load
    this.resetWorkspace();

    // Aggressive UI state enforcer to prevent any desync
    setInterval(() => this.enforceUIState(), 500);
    // Continuously monitor actual hardware connection state to auto-sync UI
    setInterval(() => this.checkHardwareStatus(), 2000);
  }

  resetWorkspace() {
    this.currentProject = null;
    this.demoMode = false;
    
    // Clear Table 1 Inputs
    ['t1-date', 't1-ref-no', 't1-capacity', 't1-item', 't1-range', 't1-make', 't1-increment', 't1-sn', 't1-resolution'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    
    // Clear Table 5 Inputs
    ['t5-temp-b', 't5-temp-a', 't5-hum-b', 't5-hum-a'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Clear Table 4 Inputs
    ['t4-model', 't4-cap', 't4-sn', 't4-cert', 't4-date', 't4-a', 't4-b', 't4-c', 't4-u'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Clear Logger Data internally
    this.loggerData.preloading.forEach(r => r.runs.forEach(run => { run.m = 0; run.r = 0; }));
    this.loggerData.measured.forEach(r => {
      r.target = 0;
      r.runs.forEach(run => { run.m = 0; run.r = 0; });
      r.mean = 0; r.uncertainty = 0; r.class = 'N/A';
    });
    
    this.renderLogger();
    
    // Force the "New Project" modal to show on startup
    const modalNewProject = document.getElementById('modal-new-project');
    if (modalNewProject) modalNewProject.style.display = 'block';
  }

  stdev(arr) {
    const n = arr.length;
    if (n < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (n - 1));
  }

  enforceUIState() {
    const btnStartPolling = document.getElementById('btn-start-polling');
    const btnStopPolling = document.getElementById('btn-stop-polling');
    const connStatusEl = document.getElementById('conn-status');
    const terminalInput = document.getElementById('terminal-input');
    const btnTerminalSend = document.getElementById('btn-terminal-send');
    const isActuallyConnected = connStatusEl && connStatusEl.textContent === 'Connected';

    // 1. Sync Polling buttons and Terminal with actual connection state
    if (isActuallyConnected) {
      if (terminalInput) terminalInput.disabled = false;
      if (btnTerminalSend) btnTerminalSend.disabled = false;

      if (this.isPolling) {
        if (btnStartPolling) btnStartPolling.disabled = true;
        if (btnStopPolling) btnStopPolling.disabled = false;
      } else {
        if (btnStartPolling) btnStartPolling.disabled = false;
        if (btnStopPolling) btnStopPolling.disabled = true;
      }
    } else {
      // Not connected - disable both polling buttons and terminal
      if (btnStartPolling) btnStartPolling.disabled = true;
      if (btnStopPolling) btnStopPolling.disabled = true;
      if (terminalInput) terminalInput.disabled = true;
      if (btnTerminalSend) btnTerminalSend.disabled = true;
      // Force polling to stop if it was running
      if (this.isPolling) this.stopPolling();
    }

    // 2. Enforce Mandatory Workflow Locking
    const hwPanel = document.getElementById('hardware-status');
    const monitorPanel = document.getElementById('live-monitor');
    const excelPanel = document.getElementById('excel-full-replica');

    const manualRefNo = document.getElementById('t1-ref-no')?.value.trim();
    const manualCapacity = document.getElementById('t1-capacity')?.value.trim();
    const hasValidProject = this.currentProject || (manualRefNo && manualCapacity);

    if (!hasValidProject) {
      if (hwPanel) hwPanel.classList.add('workflow-locked');
      if (monitorPanel) monitorPanel.classList.add('workflow-locked');
      if (excelPanel) excelPanel.classList.add('workflow-locked');
    } else if (!isActuallyConnected && !this.demoMode) {
      if (hwPanel) hwPanel.classList.remove('workflow-locked');
      if (monitorPanel) monitorPanel.classList.add('workflow-locked');
      if (excelPanel) excelPanel.classList.add('workflow-locked');
    } else {
      if (hwPanel) hwPanel.classList.remove('workflow-locked');
      if (monitorPanel) monitorPanel.classList.remove('workflow-locked');
      if (excelPanel) excelPanel.classList.remove('workflow-locked');
    }
  }

  async loadSettings() {
    try {
      const res = await fetch('/api/settings/load');
      const settings = await res.json();
      if (!settings || Object.keys(settings).length === 0) return;

      if (settings.connection) {
        if (settings.connection.tcp) {
          if (document.getElementById('set-ip')) document.getElementById('set-ip').value = settings.connection.tcp.ip || '';
          if (document.getElementById('set-port')) document.getElementById('set-port').value = settings.connection.tcp.port || '';
          if (document.getElementById('main-ip')) document.getElementById('main-ip').value = settings.connection.tcp.ip || '192.168.1.100';
          if (document.getElementById('main-port')) document.getElementById('main-port').value = settings.connection.tcp.port || '1234';
        }
      }

      if (settings.instrument) {
        if (document.getElementById('set-instrument')) document.getElementById('set-instrument').value = settings.instrument;
        if (document.getElementById('disp-instrument')) document.getElementById('disp-instrument').textContent = settings.instrument;
      }
      if (settings.channel) {
        if (document.getElementById('set-channel')) document.getElementById('set-channel').value = settings.channel;
        if (document.getElementById('disp-channel')) document.getElementById('disp-channel').textContent = settings.channel;
      }

      // Coefficients
      if (settings.coeff_a) document.getElementById('set-coeff-a').value = settings.coeff_a;
      if (settings.coeff_b) document.getElementById('set-coeff-b').value = settings.coeff_b;
      if (settings.coeff_c) document.getElementById('set-coeff-c').value = settings.coeff_c;
      if (settings.ref_unc) document.getElementById('set-ref-unc').value = settings.ref_unc;
      if (settings.sensitivity_ppm) document.getElementById('set-sensitivity').value = settings.sensitivity_ppm;
      if (settings.resolution_kgf) document.getElementById('set-resolution').value = settings.resolution_kgf;
      if (settings.stability_threshold) document.getElementById('set-stability').value = settings.stability_threshold;

      // Ensure the system updates with new settings
      this.renderLogger();
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  initEventListeners() {
    // Top Bar Actions
    document.getElementById('btn-connect').addEventListener('click', () => this.triggerConnection());
    document.getElementById('btn-config').addEventListener('click', () => document.getElementById('modal-settings').style.display = 'block');
    document.getElementById('nav-settings').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('modal-settings').style.display = 'block';
    });
    
    // Terminal Actions
    const modalTerminal = document.getElementById('modal-terminal');
    document.getElementById('btn-terminal').addEventListener('click', () => {
      modalTerminal.style.display = 'block';
      document.getElementById('terminal-input').focus();
    });
    document.getElementById('btn-terminal-send').addEventListener('click', () => this.sendTerminalCommand());
    document.getElementById('terminal-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendTerminalCommand();
      }
    });
    
    // Hardware Mode Toggle
    document.getElementById('hw-mode-select').addEventListener('change', (e) => {
      document.getElementById('btn-connect').disabled = false;
      this.setHardwareMode(e.target.value);
    });

    // Monitor Actions
    document.getElementById('btn-start-polling').addEventListener('click', () => this.startPolling());
    document.getElementById('btn-stop-polling').addEventListener('click', () => this.stopPolling());

    document.getElementById('btn-add-t2-row').addEventListener('click', () => this.addTestPoint('preloading'));
    document.getElementById('btn-add-t3-row').addEventListener('click', () => this.addTestPoint('measured'));

    // Live Monitor Nav fix
    const btnMonitor = document.querySelector('a[href="#live-monitor"]');
    if (btnMonitor) {
      btnMonitor.addEventListener('click', (e) => {
        // e.preventDefault();
        const el = document.getElementById('live-monitor');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
        // Optionally start polling if not active
        if (this.connectionState === 'connected' && !this.isPolling) {
            this.startPolling();
        }
      });
    }

    // History Nav
    const btnHistory = document.getElementById('nav-history-link-btn');
    if (btnHistory) {
      btnHistory.addEventListener('click', () => {
        document.getElementById('modal-history-list').style.display = 'block';
        this.loadHistory();
      });
    }

    // Archive Nav
    const btnArchive = document.getElementById('nav-archive-link-btn');
    if (btnArchive) {
      btnArchive.addEventListener('click', () => {
        document.getElementById('modal-archive-list').style.display = 'block';
        this.loadHistory('', true); // true for archived
      });
    }

    const btnSaveHistory = document.getElementById('btn-save-history');
    if (btnSaveHistory) {
      btnSaveHistory.addEventListener('click', () => this.saveToHistory(true));
    }

    // History & Archive Search & Navigation
    const histSearch = document.getElementById('history-search');
    if (histSearch) {
      histSearch.addEventListener('input', () => this.loadHistory(histSearch.value, false));
    }
    const archSearch = document.getElementById('archive-search');
    if (archSearch) {
      archSearch.addEventListener('input', () => this.loadHistory(archSearch.value, true));
    }
    const btnHistBack = document.getElementById('btn-hist-back');
    if (btnHistBack) {
      btnHistBack.addEventListener('click', () => {
        document.getElementById('modal-history-view').style.display = 'none';
        if (this.currentHistoricalData && this.currentHistoricalData.is_archived) {
            document.getElementById('modal-archive-list').style.display = 'block';
            this.loadHistory('', true);
        } else {
            document.getElementById('modal-history-list').style.display = 'block';
            this.loadHistory();
        }
      });
    }

    // Logger Actions
    document.getElementById('btn-excel-capture').addEventListener('click', () => this.captureToSelectedCell());
    document.getElementById('btn-excel-clear').addEventListener('click', () => this.clearLoggerData());
    document.getElementById('btn-excel-export').addEventListener('click', () => this.syncLoggerToExcel());

    document.getElementById('btn-load-demo').addEventListener('click', () => this.loadDemoData());

    // Load Cell & Unit Actions
    this.initLoadCellSelector();
    document.querySelectorAll('.unit-btn').forEach(btn => {
      btn.onclick = () => this.setSystemUnit(btn.dataset.unit);
    });

    document.getElementById('btn-config')?.addEventListener('click', () => document.getElementById('modal-settings').style.display = 'block');
    document.getElementById('nav-settings')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('modal-settings').style.display = 'block';
    });

    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => {
        this.saveSettings();
        document.getElementById('modal-settings').style.display = 'none';
      });
    }

    // Dynamic UI unlocking based on Table 1 manual entry
    const table1Inputs = ['t1-ref-no', 't1-capacity', 't1-item', 't1-date', 't1-sn', 't1-mode', 't1-range', 't1-make', 't1-increment', 't1-resolution'];
    table1Inputs.forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        this.enforceUIState();
        // If we want the system to "update", maybe render logger too if anything depends on it
        this.renderLogger(); 
      });
    });

    const btnDefaultSettings = document.getElementById('btn-default-settings');
    if (btnDefaultSettings) {
      btnDefaultSettings.addEventListener('click', () => this.restoreDefaultSettings());
    }

    // Real-time recalculation listeners
    ['t4-a', 't4-b', 't4-c', 't4-u', 'set-coeff-a', 'set-coeff-b', 'set-coeff-c', 'set-ref-unc', 't5-temp-b', 't5-temp-a', 't5-hum-b', 't5-hum-a'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => {
          this.renderLogger();
      });
    });

    // --- Modals ---
    // New Project Modal
    const modalNewProject = document.getElementById('modal-new-project');
    const btnNewProject = document.getElementById('btn-new-project');
    if (btnNewProject) {
      btnNewProject.addEventListener('click', () => modalNewProject.style.display = 'block');
    }
    const btnSubmitProject = document.getElementById('btn-submit-project');
    if (btnSubmitProject) {
      btnSubmitProject.addEventListener('click', () => this.createProject());
    }

    // Close Modals
    document.querySelectorAll('.close').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal').style.display = 'none';
      });
    });

    // Close Modals on outside click
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
      }
    });

    // Scroll listener for Live Monitor Mini Window
    window.addEventListener('scroll', () => {
      const monitor = document.getElementById('live-monitor');
      const placeholder = document.getElementById('live-monitor-placeholder');
      if (!monitor || !placeholder) return;

      const rect = placeholder.getBoundingClientRect();
      
      if (!monitor.classList.contains('mini-window')) {
        placeholder.dataset.origHeight = monitor.offsetHeight;
        placeholder.dataset.origMargin = window.getComputedStyle(monitor).marginBottom;
      }

      const origHeight = parseInt(placeholder.dataset.origHeight || 0);
      
      // Trigger when the placeholder's top is scrolled up past the viewport 
      // by an amount equal to the monitor's original height + a small buffer
      if (rect.top < -(origHeight + 20)) {
        if (!monitor.classList.contains('mini-window')) {
          placeholder.style.height = `${origHeight}px`;
          placeholder.style.marginBottom = placeholder.dataset.origMargin;
          monitor.classList.add('mini-window');
        }
      } else {
        if (monitor.classList.contains('mini-window')) {
          monitor.classList.remove('mini-window');
          placeholder.style.height = '0px';
          placeholder.style.marginBottom = '0px';
        }
      }
    });
  }

  restoreDefaultSettings() {
    if (!confirm("Are you sure you want to restore all settings to their factory defaults? This will overwrite your current configuration in the form.")) {
      return;
    }

    // Connection
    if (document.getElementById('set-ip')) document.getElementById('set-ip').value = '192.168.1.100';
    if (document.getElementById('set-port')) document.getElementById('set-port').value = '1234';

    // Instrument
    if (document.getElementById('set-instrument')) document.getElementById('set-instrument').value = 'DMP41';
    if (document.getElementById('set-channel')) document.getElementById('set-channel').value = '1';

    // Coefficients
    if (document.getElementById('set-coeff-a')) document.getElementById('set-coeff-a').value = '1.0';
    if (document.getElementById('set-coeff-b')) document.getElementById('set-coeff-b').value = '0.0';
    if (document.getElementById('set-coeff-c')) document.getElementById('set-coeff-c').value = '0.0';
    if (document.getElementById('set-ref-unc')) document.getElementById('set-ref-unc').value = '0.02';
    if (document.getElementById('set-sensitivity')) document.getElementById('set-sensitivity').value = '50';
    if (document.getElementById('set-resolution')) document.getElementById('set-resolution').value = '0.01';
    if (document.getElementById('set-stability')) document.getElementById('set-stability').value = '0.000010';

    alert("Defaults restored in the form. Please click 'Save All Settings' to apply them to the system.");
  }

  async saveSettings() {
    const settings = {
      connection: {
        tcp: {
          ip: document.getElementById('set-ip')?.value,
          port: document.getElementById('set-port')?.value
        }
      },
      instrument: document.getElementById('set-instrument')?.value,
      channel: document.getElementById('set-channel')?.value,
      coeff_a: document.getElementById('set-coeff-a')?.value,
      coeff_b: document.getElementById('set-coeff-b')?.value,
      coeff_c: document.getElementById('set-coeff-c')?.value,
      ref_unc: document.getElementById('set-ref-unc')?.value,
      sensitivity_ppm: document.getElementById('set-sensitivity')?.value,
      resolution_kgf: document.getElementById('set-resolution')?.value,
      stability_threshold: document.getElementById('set-stability')?.value
    };

    try {
      const response = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        alert("Settings saved successfully.");
        await this.loadSettings(); 
      } else {
        alert("Failed to save settings.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving settings.");
    }
  }

  initChart() {
    const ctx = document.getElementById('chart-readings');
    if (!ctx) return;
    
    this.chart = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Force (mV/V)',
          data: [],
          borderColor: '#001D53',
          backgroundColor: 'rgba(0, 86, 179, 0.1)',
          tension: 0.1,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { beginAtZero: false }
        }
      }
    });
  }

  async sendTerminalCommand() {
    const inputEl = document.getElementById('terminal-input');
    let command = inputEl.value.trim();
    if (!command) return;

    // Auto-uppercase hardware commands (local commands start with /)
    if (!command.startsWith('/')) {
      command = command.toUpperCase();
    }

    this.appendTerminalOutput(`> ${command}`, '#00ff00');
    inputEl.value = '';

    // Handle local commands
    if (command.toLowerCase() === '/help') {
      this.appendTerminalOutput('--- DMP41 TERMINAL HELP & USAGE ---', '#ffcc00');
      this.appendTerminalOutput('Command Format Guide:', '#ffcc00');
      this.appendTerminalOutput('  Query a value:   Type the 3-letter command followed by "?" (e.g., MSV?, IDT?)', '#d4d4d4');
      this.appendTerminalOutput('  Set a value:     Type the 3-letter command followed by the parameter (e.g., CHS1)', '#d4d4d4');
      this.appendTerminalOutput('  Execute action:  Type the 3-letter command alone (e.g., TAR)', '#d4d4d4');
      this.appendTerminalOutput(' ', '#d4d4d4');
      this.appendTerminalOutput('Terminal Output Guide:', '#ffcc00');
      this.appendTerminalOutput('  [OK]    : Command was successfully executed by the hardware.', '#99CC33');
      this.appendTerminalOutput('  [ERROR] : Hardware rejected the command (Syntax error, unsupported, or lacks Admin Rights).', '#ff5555');
      this.appendTerminalOutput('  Reply   : Data requested from the hardware.', '#00d2ff');
      this.appendTerminalOutput(' ', '#d4d4d4');
      this.appendTerminalOutput('Common ASCII Commands:', '#ffcc00');
      this.appendTerminalOutput('  MSV?24        - Read Net mV/V value (Primary reading)', '#d4d4d4');
      this.appendTerminalOutput('  MSV?0         - Read Gross/Display value', '#d4d4d4');
      this.appendTerminalOutput('  TAR           - Tare the instrument (Needs Admin Rights)', '#d4d4d4');
      this.appendTerminalOutput('  TDT           - Remove/Delete Tare (Needs Admin Rights)', '#d4d4d4');
      this.appendTerminalOutput('  CHS<n>        - Select channel (e.g., CHS1, CHS2)', '#d4d4d4');
      this.appendTerminalOutput('  RAR<password> - Request Admin Rights (Default: RAR1234)', '#d4d4d4');
      this.appendTerminalOutput('  IDT?          - Request device identification type', '#d4d4d4');
      this.appendTerminalOutput('  NOV?          - Request firmware version', '#d4d4d4');
      this.appendTerminalOutput('  /clear        - (Local) Clear the terminal screen', '#d4d4d4');
      this.appendTerminalOutput('------------------------------------', '#ffcc00');
      return;
    }

    if (command.toLowerCase() === '/clear') {
      document.getElementById('terminal-output').innerHTML = '';
      this.appendTerminalOutput('Terminal cleared.', '#00ff00');
      return;
    }

    try {
      const response = await fetch('/api/hardware/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      const data = await response.json();
      
      if (response.ok) {
        const reply = data.response;
        // Interpret standard DMP41 responses for better feedback
        if (reply === '0') {
          this.appendTerminalOutput(`  [OK] Command accepted successfully (0)`, '#99CC33'); // Green
        } else if (reply === '?') {
          this.appendTerminalOutput(`  [ERROR] Hardware rejected the command: Syntax error, unsupported, or lacks Admin Rights (?)`, '#ff5555'); // Red
        } else {
          this.appendTerminalOutput(`  Reply: ${reply}`, '#00d2ff'); // Cyan
        }
      } else {
        this.appendTerminalOutput(`  Error: ${data.error}`, '#ff5555');
      }
    } catch (err) {
      this.appendTerminalOutput(`  Request failed: ${err.message}`, '#ff5555');
    }
  }

  appendTerminalOutput(text, color) {
    const outputEl = document.getElementById('terminal-output');
    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = color;
    outputEl.appendChild(div);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  updateStatusBar(text, percent) {
    const bar = document.getElementById('calibration-status-bar');
    const textEl = document.getElementById('status-text');
    const progressEl = document.getElementById('progress-bar');
    const percentEl = document.getElementById('status-percent');

    if (!bar) return;

    if (text === null) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';
    if (textEl) textEl.textContent = text;
    if (progressEl) progressEl.style.width = percent + '%';
    if (percentEl) percentEl.textContent = Math.round(percent) + '%';
  }

  async checkHardwareStatus() {
    try {
      const response = await fetch('/api/hardware/status');
      const status = await response.json();
      
      const connStatusEl = document.getElementById('conn-status');
      if (status.connectionState === 'connected') {
        connStatusEl.textContent = 'Connected';
        connStatusEl.style.color = 'var(--success-color)';
        if (!this.isPolling) {
          document.getElementById('btn-start-polling').disabled = false;
        }
      } else if (status.connectionState === 'standby') {
        connStatusEl.textContent = 'Standby';
        connStatusEl.style.color = 'var(--warning-color)';
        document.getElementById('btn-start-polling').disabled = true;
        if (this.isPolling) this.stopPolling();
      } else {
        connStatusEl.textContent = 'Disconnected';
        connStatusEl.style.color = 'var(--danger-color)';
        document.getElementById('btn-start-polling').disabled = true;
        if (this.isPolling) this.stopPolling();
      }
      
      const modeSelect = document.getElementById('hw-mode-select');
      if (modeSelect && modeSelect.value !== '') {
        modeSelect.value = status.mode || 'demo';
      }
    } catch (err) {
      console.error('Connection check failed:', err);
      const connStatusEl = document.getElementById('conn-status');
      connStatusEl.textContent = 'Error';
      connStatusEl.style.color = 'var(--danger-color)';
      document.getElementById('btn-start-polling').disabled = true;
      if (this.isPolling) this.stopPolling();
    }
  }

  async syncProjectData() {
    const date = document.getElementById('t1-date')?.value;
    const mode = document.getElementById('t1-mode')?.value;
    const refNo = document.getElementById('t1-ref-no')?.value;
    const capacity = document.getElementById('t1-capacity')?.value;
    const item = document.getElementById('t1-item')?.value;
    const range = document.getElementById('t1-range')?.value;
    const make = document.getElementById('t1-make')?.value;
    const increment = document.getElementById('t1-increment')?.value;
    const sn = document.getElementById('t1-sn')?.value;
    const resolution = document.getElementById('t1-resolution')?.value;

    const coeffA = document.getElementById('t4-a')?.value || document.getElementById('set-coeff-a')?.value;
    const coeffB = document.getElementById('t4-b')?.value || document.getElementById('set-coeff-b')?.value;
    const coeffC = document.getElementById('t4-c')?.value || document.getElementById('set-coeff-c')?.value;
    const refUnc = document.getElementById('t4-u')?.value || document.getElementById('set-ref-unc')?.value;

    const refModel = document.getElementById('t4-model')?.value;
    const refCap = document.getElementById('t4-cap')?.value;
    const refSn = document.getElementById('t4-sn')?.value;
    const refCert = document.getElementById('t4-cert')?.value;
    const refDate = document.getElementById('t4-date')?.value;

    const tempB = document.getElementById('t5-temp-b')?.value;
    const tempA = document.getElementById('t5-temp-a')?.value;
    const humB = document.getElementById('t5-hum-b')?.value;
    const humA = document.getElementById('t5-hum-a')?.value;

    if (!refNo || !capacity) return false;

    const payload = {
        project_name: refNo,
        calibration_date: date,
        mode: mode,
        capacity_kgf: parseFloat(capacity) || 0,
        instrument_name: item,
        range_text: range,
        make_model: make,
        increment: increment,
        serial_number: sn,
        resolution: resolution,
        coeff_a: parseFloat(coeffA) || 1.0,
        coeff_b: parseFloat(coeffB) || 0.0,
        coeff_c: parseFloat(coeffC) || 0.0,
        ref_unc: parseFloat(refUnc) || 0.02,
        ref_model: refModel,
        ref_capacity: refCap,
        ref_sn: refSn,
        ref_cert: refCert,
        ref_date: refDate,
        temperature_before: parseFloat(tempB) || 0,
        temperature_after: parseFloat(tempA) || 0,
        humidity_before: parseFloat(humB) || 0,
        humidity_after: parseFloat(humA) || 0,
        output_unit: this.currentUnit
    };

    try {
      if (this.currentProject) {
         await fetch(`/api/calibration/projects/${this.currentProject.id}`, {
             method: 'PUT',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(payload)
         });
         Object.assign(this.currentProject, payload);
      } else {
         const res = await fetch('/api/calibration/projects', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(payload)
         });
         const data = await res.json();
         if(data.project_id) {
             this.currentProject = { id: data.project_id, ...payload };
         }
      }
      return true;
    } catch(e) {
      console.error("Failed to sync project data:", e);
      return false;
    }
  }

  async triggerConnection() {
    await this.syncProjectData(); // Sync manual edits before connecting hardware
    
    document.getElementById('conn-status').textContent = 'Connecting...';
    document.getElementById('conn-status').style.color = 'black';
    
    const payload = { 
      tcp: {
        ip: document.getElementById('main-ip')?.value || '192.168.1.100',
        port: document.getElementById('main-port')?.value || '1234'
      }
    };

    try {
      const res = await fetch('/api/hardware/connect', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await res.json();
    } catch (err) {
      console.error(err);
    }
    this.checkHardwareStatus();
  }

  async setHardwareMode(mode) {
    try {
      const res = await fetch('/api/hardware/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      await res.json();
      this.checkHardwareStatus(); // Refresh status
    } catch (err) {
      console.error('Failed to set hardware mode:', err);
      alert('Failed to change hardware mode.');
    }
  }

  async startPolling() {
    this.isPolling = true;
    document.getElementById('btn-start-polling').disabled = true;
    document.getElementById('btn-stop-polling').disabled = false;

    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/hardware/read?channel=1&type=24');
        const data = await response.json();

        this.currentReadings.push({
          timestamp: new Date(),
          raw_mvv: data.raw_deflection
        });

        if (this.currentReadings.length > 50) {
          this.currentReadings.shift();
        }

        const def = data.raw_deflection || 0;
        document.getElementById('reading-mvv').textContent = def.toFixed(6);

        // Calculate KGF
        const a = parseFloat(document.getElementById('set-coeff-a')?.value || 1);
        const b = parseFloat(document.getElementById('set-coeff-b')?.value || 0);
        const c = parseFloat(document.getElementById('set-coeff-c')?.value || 0);

        // F = AD + BD^2 + CD^3 (Result is in kN from sensor coeffs)
        const forceKn = (a * def) + (b * Math.pow(def, 2)) + (c * Math.pow(def, 3));
        
        // Convert from kN to Selected Unit
        // Constant conversion: 1 kN = (1/target_constant) units
        const kgfConst = this.unitConstants['kgf']; // 0.00980665
        const targetConst = this.unitConstants[this.currentUnit];
        const displayValue = forceKn / targetConst;

        const kgfEl = document.getElementById('reading-kgf'); 
        if (kgfEl) kgfEl.textContent = displayValue.toFixed(this.currentUnit === 'kN' ? 6 : 3);   

        this.updateChart(def);

      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 150);  }

  stopPolling() {
    this.isPolling = false;
    clearInterval(this.pollInterval);
    document.getElementById('btn-start-polling').disabled = false;
    document.getElementById('btn-stop-polling').disabled = true;
    
    // Set reading to 0 when stopped
    document.getElementById('reading-mvv').textContent = '0.000000';
    const kgfEl = document.getElementById('reading-kgf');
    if (kgfEl) kgfEl.textContent = '0.000';
    
    this.updateChart(0);
  }

  // --- Project Actions ---
  
  async createProject() {
    const date = document.getElementById('np-date').value;
    const mode = document.getElementById('np-mode').value;
    const refNo = document.getElementById('np-name').value;
    const capacity = document.getElementById('np-capacity').value;
    const item = document.getElementById('np-item').value;
    const range = document.getElementById('np-range').value;
    const make = document.getElementById('np-make').value;
    const increment = document.getElementById('np-increment').value;
    const sn = document.getElementById('np-sn').value;
    const resolution = document.getElementById('np-resolution').value;

    if (!refNo || !capacity) {
      alert("Request Ref. No. and Capacity are required.");
      return;
    }

    try {
      await fetch('/api/calibration/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: refNo,
          calibration_date: date,
          mode: mode,
          capacity_kgf: parseFloat(capacity) || 0,
          instrument_name: item,
          range_text: range,
          make_model: make,
          increment: increment,
          serial_number: sn,
          resolution: resolution
        })
      });
      document.getElementById('modal-new-project').style.display = 'none';
      await this.loadProjects();
      alert("Project created successfully.");
    } catch (err) {
      console.error('Error creating project:', err);
      alert("Failed to create project.");
    }
  }

  updateChart(value) {
    if (!this.chart) return;
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    
    this.chart.data.labels.push(timeStr);
    this.chart.data.datasets[0].data.push(value);
    
    if (this.chart.data.labels.length > 50) {
      this.chart.data.labels.shift();
      this.chart.data.datasets[0].data.shift();
    }
    
    this.chart.update();
  }

  async saveToHistory(manualClick = false) {
    if (manualClick && !confirm("Are you sure you want to save the current data to history?")) return;
    await this.syncProjectData(); // Sync manual edits & settings snapshot
    await this.syncPointsData(); // Save all points (Measured & Preloading)

    if (!this.currentProject) return;
    try {
      const res = await fetch(`/api/calibration/projects/${this.currentProject.id}/save`, { method: 'PUT' });
      if (res.ok) {
        if (manualClick) alert("Project successfully saved to History!");
        this.loadHistory();
        if (manualClick) this.resetWorkspace(); // Force a clean slate for the next calibration
      }
    } catch (err) {
      console.error('Failed to save to history:', err);
    }
  }

  async syncPointsData() {
    if (!this.currentProject) return;

    const points = [];

    // Add Preloading points
    this.loggerData.preloading.forEach((row, idx) => {
        points.push({
            stage: 'Pre-loading',
            target: row.target || 0,
            m1: row.runs[0].m,
            m2: row.runs[1].m,
            m3: row.runs[2].m,
            s1: row.runs[0].r,
            s2: row.runs[1].r,
            s3: row.runs[2].r,
            idx: idx
        });
    });

    // Add Measured points
    this.loggerData.measured.forEach((row, idx) => {
        points.push({
            stage: 'Measured',
            target: row.target,
            m1: row.runs[0].m,
            m2: row.runs[1].m,
            m3: row.runs[2].m,
            s1: row.runs[0].r,
            s2: row.runs[1].r,
            s3: row.runs[2].r,
            idx: idx
        });
    });

    try {
        await fetch('/api/calibration/test-points/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: this.currentProject.id, points })
        });
    } catch (e) {
        console.error("Failed to sync points:", e);
    }
  }

  async loadHistory(filterText = '', archived = false) {
    try {
      const response = await fetch(`/api/calibration/history?archived=${archived}`);
      let projects = await response.json();
      const gridId = archived ? 'archive-grid' : 'history-grid';
      const grid = document.getElementById(gridId);
      if (!grid) return;

      if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        projects = projects.filter(p => 
          (p.project_name || '').toLowerCase().includes(lowerFilter) ||
          (p.serial_number || '').toLowerCase().includes(lowerFilter) ||
          new Date(p.updated_at).toLocaleString().toLowerCase().includes(lowerFilter)
        );
      }

      if (projects.length === 0) {
        if (archived) {
          grid.innerHTML = filterText ? '<p>No matching archived records found.</p>' : '<p>No archived data found.</p>';
        } else {
          grid.innerHTML = filterText ? '<p>No matching records found.</p>' : '<p>No history found. Complete a calibration and click "Save to History".</p>';
        }
        return;
      }

      window.appContext = this;
      grid.innerHTML = projects.map(p => `
        <button style="display:flex; flex-direction:column; padding: 15px; border: 1px solid #ccc; border-radius: 8px; background: #fff; text-align: left; cursor: pointer;" onclick="window.appContext.viewHistoryProject(${p.id})">
          <strong style="font-size: 1.1em; color: #001D53; margin-bottom: 5px;">${p.project_name}</strong>
          <span style="font-size: 0.85em; color: #555;">Date: ${new Date(p.updated_at).toLocaleString()}</span>
          <span style="font-size: 0.85em; color: #555;">S/N: ${p.serial_number || 'N/A'}</span>
          <span style="font-size: 0.85em; color: #555;">Capacity: ${p.capacity_kgf || 'N/A'} kgf</span>
        </button>
      `).join('');
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  async viewHistoryProject(projectId) {
    try {
      // 1. Fetch Processed Historical Data
      const res = await fetch(`/api/calibration/process/${projectId}`);
      const data = await res.json();
      const project = data.metadata;
      const results = data.results;

      // 2. Fill Table 1 (Historical Metadata)
      document.getElementById('hist-t1-date').textContent = project.calibration_date ? new Date(project.calibration_date).toLocaleDateString() : 'N/A';
      document.getElementById('hist-t1-mode').textContent = project.mode || 'N/A';
      document.getElementById('hist-t1-ref-no').textContent = project.project_name || 'N/A';
      document.getElementById('hist-t1-capacity').textContent = (project.capacity_kgf || '0') + ' kgf';
      document.getElementById('hist-t1-item').textContent = project.instrument_name || 'N/A';
      document.getElementById('hist-t1-range').textContent = project.range_text || 'N/A';
      document.getElementById('hist-t1-make').textContent = project.make_model || 'N/A';
      document.getElementById('hist-t1-increment').textContent = project.increment || 'N/A';
      document.getElementById('hist-t1-sn').textContent = project.serial_number || 'N/A';
      document.getElementById('hist-t1-resolution').textContent = project.resolution || '0.01';

      // 3. Fill Environmental (Historical Snapshot)
      document.getElementById('hist-t5-temp-b').textContent = project.temperature_before || '-';
      document.getElementById('hist-t5-temp-a').textContent = project.temperature_after || '-';
      document.getElementById('hist-t5-hum-b').textContent = project.humidity_before || '-';
      document.getElementById('hist-t5-hum-a').textContent = project.humidity_after || '-';

      // 4. Fill Transducer Coefficients (Historical Snapshot)
      document.getElementById('hist-t4-model').textContent = project.ref_model || 'Saved Standard';
      document.getElementById('hist-t4-cap').textContent = project.ref_capacity || 'N/A';
      document.getElementById('hist-t4-sn').textContent = project.ref_sn || 'N/A';
      document.getElementById('hist-t4-cert').textContent = project.ref_cert || 'N/A';
      document.getElementById('hist-t4-date').textContent = project.ref_date || 'N/A';
      document.getElementById('hist-t4-u').textContent = project.ref_unc ?? '0.02';
      document.getElementById('hist-t4-a').textContent = project.coeff_a ?? '1.0';
      document.getElementById('hist-t4-b').textContent = project.coeff_b ?? '0.0';
      document.getElementById('hist-t4-c').textContent = project.coeff_c ?? '0.0';

      // 5. Map Historical Points to loggerData structure
      const preGrouped = {};
      data.preloading.forEach(p => {
        const seq = p.measurement_sequence;
        if (!preGrouped[seq]) preGrouped[seq] = { target: p.target_value_kgf || 0, runs: [{m:0,r:0},{m:0,r:0},{m:0,r:0}] };
        preGrouped[seq].runs[p.series_number - 1] = { m: p.machine_indicated_kgf ?? 0, r: p.raw_reading_mvv || 0 };
      });

      this.currentHistoricalData = {
        preloading: Object.keys(preGrouped).sort((a,b) => a-b).map(k => preGrouped[k]),
        measured: results.map((r, idx) => {
            const unit = project.output_unit || 'kgf';
            const scale = this.unitConstants[unit] || 0.00980665;
            
            // Calculate raw averages for Table 3
            const runs = [
                { m: r.series1_m ?? r.targetForceKgf, r: r.series1_mvv || 0 },
                { m: r.series2_m ?? r.targetForceKgf, r: r.series2_mvv || 0 },
                { m: r.series3_m ?? r.targetForceKgf, r: r.series3_mvv || 0 }
            ];
            const activeMs = runs.map(run => run.m).filter(m => m !== 0);
            const activeRs = runs.map(run => run.r).filter(r => r !== 0);
            const meanIndicatedForce = activeMs.length > 0 ? activeMs.reduce((acc, v) => acc + v, 0) / activeMs.length : 0;
            const meanRawDeflection = activeRs.length > 0 ? activeRs.reduce((acc, v) => acc + v, 0) / activeRs.length : 0;

            return {
                point: idx,
                target: r.targetForceKgf || 0,
                runs: runs,
                meanIndicatedForce: meanIndicatedForce,
                meanRawDeflection: meanRawDeflection,
                mean: r.meanNetDeflection || 0,
                meanForce: (r.meanForceKn || 0) / scale,
                netValues: r.netValues || [0,0,0],
                runForcesKn: r.runForcesKn || [0,0,0],
                uncertainty: r.expandedUncertaintyPercent || 0,
                class: r.classification || 'N/A'
            };
        })
      };

      this.calculateFullSuite('hist-');
      this.renderReplicaTables('hist-');

      // 6. Modal Toggling
      document.getElementById('modal-history-list').style.display = 'none';
      document.getElementById('modal-archive-list').style.display = 'none';
      document.getElementById('modal-history-view').style.display = 'block';

      // Update View Title and Buttons
      const isArchived = project.is_archived === 1;
      this.currentHistoricalData.is_archived = isArchived;
      document.getElementById('history-view-title').textContent = isArchived ? 'Archived Calibration Data (Read-Only)' : 'Historical Calibration Data (Read-Only)';
      
      const btnArchive = document.getElementById('btn-hist-archive');
      const btnUnarchive = document.getElementById('btn-hist-unarchive');
      const btnDelete = document.getElementById('btn-hist-delete');
      if (btnArchive) btnArchive.style.display = isArchived ? 'none' : 'inline-block';
      if (btnUnarchive) btnUnarchive.style.display = isArchived ? 'inline-block' : 'none';

      // 7. Action Button Overrides (scoped to this project)
      document.getElementById('btn-hist-cert').onclick = async () => {
        if (!confirm(`Are you sure you want to generate a certificate for ${project.project_name}?`)) return;
        alert("Generating Certificate for " + project.project_name);
        window.location.href = `/api/export/certificate/${project.id}`;
      };

      document.getElementById('btn-hist-excel').onclick = () => {
        if (!confirm(`Are you sure you want to export ${project.project_name} to an Excel report?`)) return;
        alert("Populating Legacy Excel Template...");
        window.location.href = `/api/export/excel/${project.id}`;
      };

      document.getElementById('btn-hist-csv').onclick = () => {
        if (results.length === 0) return;
        if (!confirm(`Are you sure you want to export ${project.project_name} to CSV?`)) return;
        let csvContent = "data:text/csv;charset=utf-8,Target (kgf),Run 1 (mV/V),Run 2 (mV/V),Run 3 (mV/V),Mean (kN),Repeatability,Uncertainty,Classification\n";
        results.forEach(r => {
          csvContent += [r.target_force_kgf, r.series1_mvv.toFixed(6), r.series2_mvv.toFixed(6), r.series3_mvv.toFixed(6), r.mean_force_kn.toFixed(6), r.repeatability_kn.toFixed(6), r.uncertainty_kn.toFixed(6), r.classification].join(",") + "\n";
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `historical_results_${project.id}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

      document.getElementById('btn-hist-print').onclick = () => {
        if (confirm("Prepare document for printing?")) {
            window.print();
        }
      };

      if (btnArchive) btnArchive.onclick = async () => {
        if (confirm(`Move project ${project.project_name} to Archive?`)) {
            const res = await fetch(`/api/calibration/projects/${project.id}/archive`, { method: 'PUT' });
            if (res.ok) {
              document.getElementById('modal-history-view').style.display = 'none';
              document.getElementById('modal-history-list').style.display = 'block';
              this.loadHistory();
            }
        }
      };

      if (btnUnarchive) btnUnarchive.onclick = async () => {
        if (confirm(`Restore project ${project.project_name} from Archive?`)) {
            const res = await fetch(`/api/calibration/projects/${project.id}/unarchive`, { method: 'PUT' });
            if (res.ok) {
              document.getElementById('modal-history-view').style.display = 'none';
              document.getElementById('modal-archive-list').style.display = 'block';
              this.loadHistory('', true);
            }
        }
      };

    } catch (err) {
      console.error('Failed to view history project:', err);
    }
  }

  async loadProjects() {
    try {
      const response = await fetch('/api/calibration/projects');
      const projects = await response.json();
      if (projects.length > 0) {
        this.currentProject = projects[projects.length - 1]; // Select latest
        
        // Update Table 1: Description of the Instrument
        const refNoInput = document.getElementById('t1-ref-no');
        const itemInput = document.getElementById('t1-item');
        const snInput = document.getElementById('t1-sn');
        const capacityInput = document.getElementById('t1-capacity');
        
        const dateInput = document.getElementById('t1-date');
        const modeInput = document.getElementById('t1-mode');
        const rangeInput = document.getElementById('t1-range');
        const makeInput = document.getElementById('t1-make');
        const incrementInput = document.getElementById('t1-increment');
        const resolutionInput = document.getElementById('t1-resolution');

        if (refNoInput) refNoInput.value = this.currentProject.project_name || '';
        if (itemInput) itemInput.value = this.currentProject.instrument_name || '';
        if (snInput) snInput.value = this.currentProject.serial_number || '';
        if (capacityInput) capacityInput.value = this.currentProject.capacity_kgf ? this.currentProject.capacity_kgf + ' kgf' : '';

        if (dateInput) {
            if (this.currentProject.calibration_date) {
                dateInput.value = this.currentProject.calibration_date.split('T')[0];
            } else {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
        }
        if (modeInput) modeInput.value = this.currentProject.mode || 'Compression';
        if (rangeInput) rangeInput.value = this.currentProject.range_text || '';
        if (makeInput) makeInput.value = this.currentProject.make_model || '';
        if (incrementInput) incrementInput.value = this.currentProject.increment || '';
        if (resolutionInput) resolutionInput.value = this.currentProject.resolution || '';

      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }

  openManualEntry(project, results) {
    const modal = document.getElementById('modal-manual-entry');
    const info = document.getElementById('me-project-info');
    const tbody = document.getElementById('me-table-body');
    
    info.textContent = `Project: ${project.project_name} (${project.client_name})`;
    tbody.innerHTML = '';

    // If we have existing results, populate them
    if (results && results.length > 0) {
      results.forEach(r => this.addManualEntryRow(r.target_force_kgf, r.series1_mvv, r.series2_mvv, r.series3_mvv));
    } else {
      // Default empty rows
      [10, 20, 30, 40, 50].forEach(t => this.addManualEntryRow(t, 0, 0, 0));
    }

    document.getElementById('btn-me-add-row').onclick = () => this.addManualEntryRow(0, 0, 0, 0);
    document.getElementById('btn-me-save').onclick = () => this.saveManualEntry(project.id);
    document.getElementById('close-manual-entry').onclick = () => modal.style.display = 'none';

    modal.style.display = 'block';
  }

  addManualEntryRow(target = 0, s1 = 0, s2 = 0, s3 = 0) {
    const tbody = document.getElementById('me-table-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" class="me-target" value="${target}" style="width: 80px;"></td>
      <td><input type="number" step="0.000001" class="me-s1" value="${s1}" style="width: 120px;"></td>
      <td><input type="number" step="0.000001" class="me-s2" value="${s2}" style="width: 120px;"></td>
      <td><input type="number" step="0.000001" class="me-s3" value="${s3}" style="width: 120px;"></td>
      <td><button onclick="this.parentElement.parentElement.remove()" style="background:#001D53; padding: 2px 8px;">&times;</button></td>
    `;
    tbody.appendChild(tr);
  }

  async saveManualEntry(projectId) {
    const rows = document.querySelectorAll('#me-table-body tr');
    const points = [];
    rows.forEach(row => {
      points.push({
        target: parseFloat(row.querySelector('.me-target').value),
        s1: parseFloat(row.querySelector('.me-s1').value),
        s2: parseFloat(row.querySelector('.me-s2').value),
        s3: parseFloat(row.querySelector('.me-s3').value)
      });
    });

    try {
      const res = await fetch('/api/calibration/test-points/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, points })
      });

      if (res.ok) {
        alert("Data saved successfully. You can now export to Excel or view results.");
        document.getElementById('modal-manual-entry').style.display = 'none';
        this.viewHistoryProject(projectId); // Refresh the view
      } else {
        alert("Failed to save data.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving data.");
    }
  }

  // --- Load Cell & Unit Integration ---

  async initLoadCellSelector() {
    try {
      const res = await fetch('/api/config/load-cells');
      this.loadCells = await res.json();
      
      const sel = document.getElementById('lc-selector');
      sel.innerHTML = '<option value="">-- Select Standard --</option>';
      this.loadCells.forEach(lc => {
        sel.innerHTML += `<option value="${lc.id}">${lc.model} (${lc.capacity})</option>`;
      });

      sel.onchange = (e) => {
        const selected = this.loadCells.find(lc => lc.id == e.target.value);
        if (selected) {
          document.getElementById('set-coeff-a').value = selected.coeff_a;
          document.getElementById('set-coeff-b').value = selected.coeff_b;
          document.getElementById('set-coeff-c').value = selected.coeff_c;
          document.getElementById('set-ref-unc').value = selected.uncertainty;

          // Update Table 4: Force Transducer Info
          const elModel = document.getElementById('t4-model');
          const elCap = document.getElementById('t4-cap');
          const elSn = document.getElementById('t4-sn');
          const elCert = document.getElementById('t4-cert');
          const elU = document.getElementById('t4-u');
          const elA = document.getElementById('t4-a');
          const elB = document.getElementById('t4-b');
          const elC = document.getElementById('t4-c');
          const elDate = document.getElementById('t4-date');

          if (elModel) elModel.value = selected.model || '';
          if (elCap) elCap.value = selected.capacity || '';
          if (elSn) elSn.value = selected.sn || '';
          if (elCert) elCert.value = selected.cert_no || 'N/A';
          if (elU) elU.value = selected.uncertainty || '';
          if (elA) elA.value = selected.coeff_a || '';
          if (elB) elB.value = selected.coeff_b || '';
          if (elC) elC.value = selected.coeff_c || '';
          if (elDate) elDate.value = selected.cal_date || 'N/A';

          alert(`Coefficients loaded for ${selected.model}`);
          this.renderLogger(); 
        }
      };
    } catch (e) {
      console.error('Failed to load sensor DB', e);
    }
  }

  setSystemUnit(unit) {
    this.currentUnit = unit;
    document.querySelectorAll('.unit-btn').forEach(btn => {
      btn.style.background = btn.dataset.unit === unit ? '#001D53' : '#eee';
      btn.style.color = btn.dataset.unit === unit ? 'white' : 'black';
    });
    
    // Update live monitor label
    const label = document.getElementById('reading-unit');
    if (label) label.textContent = unit;

    // Trigger re-calculation of everything
    this.renderLogger();
  }

  addTestPoint(tableType) {
    const newPoint = {
      target: 0,
      runs: [{ m: 0, r: 0 }, { m: 0, r: 0 }, { m: 0, r: 0 }]
    };

    if (tableType === 'measured') {
      newPoint.point = this.loggerData.measured.length;
      newPoint.mean = 0;
      newPoint.meanForce = 0;
      newPoint.uncertainty = 0;
      newPoint.class = 'N/A';
      this.loggerData.measured.push(newPoint);
    } else {
      // Insert before the last element (which is always Max Cap)
      const lastIndex = this.loggerData.preloading.length - 1;
      this.loggerData.preloading.splice(lastIndex, 0, newPoint);
    }

    this.renderLogger();
  }

  // --- Native Logger Methods ---

  renderLogger() {
    this.renderReplicaTables('');
  }

  formatCellValue(val, isTarget = false, isReading = false) {
    if (val === 0 || val === "0" || val === null || val === undefined) {
      return ""; // Return empty string for placeholders
    }
    return isReading ? parseFloat(val).toFixed(6) : parseFloat(val);
  }

  renderReplicaTables(prefix = '') {
    // Only calculate suite for main view
    if (prefix === '') {
      this.calculateFullSuite();
    }
    
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    if (!data) return;

    const targetConst = this.unitConstants[this.currentUnit];

    // Table 2: Pre-loading
    const t2Body = document.getElementById(`${prefix}t2-body`);
    if (t2Body) {
      t2Body.innerHTML = data.preloading.map((row, idx) => {
        const getCls = (v) => v === "" ? 'l-cell-t2 placeholder-dull' : 'l-cell-t2';
        const v1m = this.formatCellValue(row.runs[0].m);
        const v1r = this.formatCellValue(row.runs[0].r, false, true);
        const v2m = this.formatCellValue(row.runs[1].m);
        const v2r = this.formatCellValue(row.runs[1].r, false, true);
        const v3m = this.formatCellValue(row.runs[2].m);
        const v3r = this.formatCellValue(row.runs[2].r, false, true);

        const rowLabel = idx === 0 ? '0.0' : (idx === data.preloading.length - 1 ? 'Max Cap' : idx + (idx === 1 ? 'st' : idx === 2 ? 'nd' : idx === 3 ? 'rd' : 'th'));

        return `
        <tr>
          <td>${rowLabel}</td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="1" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v1m)}" value="${v1m}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="m"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="1" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v1r)}" value="${v1r}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="r"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="2" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v2m)}" value="${v2m}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="m"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="2" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v2r)}" value="${v2r}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="r"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="3" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v3m)}" value="${v3m}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="m"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="3" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v3r)}" value="${v3r}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="r"></td>
        </tr>`;
      }).join('');
    }

    const t3Body = document.getElementById(`${prefix}t3-body`);
    if (t3Body) {
      t3Body.innerHTML = data.measured.map((row, idx) => {
        const getCls = (v) => v === "" ? 'l-cell-t3 placeholder-dull' : 'l-cell-t3';
        const vt = this.formatCellValue(row.target, true);
        const v1m = this.formatCellValue(row.runs[0].m);
        const v1r = this.formatCellValue(row.runs[0].r, false, true);
        const v2m = this.formatCellValue(row.runs[1].m);
        const v2r = this.formatCellValue(row.runs[1].r, false, true);
        const v3m = this.formatCellValue(row.runs[2].m);
        const v3r = this.formatCellValue(row.runs[2].r, false, true);

        return `
        <tr>
          <td>${idx === 0 ? '0.0' : idx + (idx === 1 ? 'st' : idx === 2 ? 'nd' : idx === 3 ? 'rd' : 'th')}</td>
          <td><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${vt === "" ? 'l-t placeholder-dull' : 'l-t'}" data-idx="${idx}" value="${vt}" placeholder="- -"></td>
          
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="1" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v1m)}" value="${v1m}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="m"></td>
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="1" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v1r)}" value="${v1r}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="r"></td>
          
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="2" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v2m)}" value="${v2m}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="m"></td>
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="2" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v2r)}" value="${v2r}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="r"></td>
          
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="3" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v3m)}" value="${v3m}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="m"></td>
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="3" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v3r)}" value="${v3r}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="r"></td>
          
          <td class="calculated" id="${prefix}t3-meanforce-${idx}">${row.meanIndicatedForce ? row.meanIndicatedForce.toFixed(this.currentUnit === 'kN' ? 6 : 3) : '- -'}</td>
          <td class="calculated" id="${prefix}t3-meandef-${idx}">${row.meanRawDeflection ? row.meanRawDeflection.toFixed(6) : '- -'}</td>
        </tr>`;
      }).join('');
    }

    this.renderTable6(prefix);
    this.renderTable7(prefix);
    this.renderTable8(prefix);
    this.renderTable9(prefix);

    // Attach listeners to all inputs (only for non-historical)
    if (prefix === '') {
      document.querySelectorAll('.l-cell-t2, .l-cell-t3, .l-t, .env-input').forEach(el => {
        el.oninput = (e) => {
          const valStr = e.target.value.trim();
          const val = (valStr === "- -" || valStr === "") ? 0 : (parseFloat(valStr) || 0);
          
          if (el.classList.contains('l-t')) {
              const idx = e.target.dataset.idx;
              this.loggerData.measured[idx].target = val;
              this.calculateFullSuite();
          } else if (el.classList.contains('env-input')) {
              this.calculateFullSuite();
          } else {
              const { idx, row, run, type, tab } = e.target.parentElement.dataset;
              if (tab === "2") {
                  this.loggerData.preloading[row].runs[run-1][type] = val;
                  this.calculateFullSuite();
                  // When Table 2 (Zeroes) change, all Table 3 calculated cells must update
                  this.loggerData.measured.forEach((_, i) => this.updateRowUI(i));
              }
              else if (tab === "3") {
                this.loggerData.measured[idx].runs[run-1][type] = val;
                this.calculateFullSuite();
                this.updateRowUI(idx);
              }
          }
        };
        el.onfocus = () => {
          if (this.selectedCell) this.selectedCell.classList.remove('selected-cell');
          this.selectedCell = el.parentElement;
          this.selectedCell.classList.add('selected-cell');
        };
      });
    }
  }

  updateRowUI(idx) {
    const row = this.loggerData.measured[idx];
    const forceEl = document.getElementById(`t3-meanforce-${idx}`);
    const defEl = document.getElementById(`t3-meandef-${idx}`);
    if (forceEl) forceEl.textContent = (row.meanIndicatedForce || 0).toFixed(this.currentUnit === 'kN' ? 6 : 3);
    if (defEl) defEl.textContent = (row.meanRawDeflection || 0).toFixed(6);
  }

  calculateFullSuite(prefix = '') {
    let a, b, c, targetConst;
    if (prefix === '') {
        a = parseFloat(document.getElementById('t4-a')?.value || document.getElementById('set-coeff-a')?.value || 1);
        b = parseFloat(document.getElementById('t4-b')?.value || document.getElementById('set-coeff-b')?.value || 0);
        c = parseFloat(document.getElementById('t4-c')?.value || document.getElementById('set-coeff-c')?.value || 0);
    } else {
        a = parseFloat(document.getElementById('hist-t4-a')?.textContent || 1);
        b = parseFloat(document.getElementById('hist-t4-b')?.textContent || 0);
        c = parseFloat(document.getElementById('hist-t4-c')?.textContent || 0);
    }
    targetConst = this.unitConstants[this.currentUnit];

    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    if (!data) return;

    // Zeros from Table 2 (index 0 is "0.0" row)
    const z1 = data.preloading[0].runs[0].r || 0;
    const z2 = data.preloading[0].runs[1].r || 0;
    const z3 = data.preloading[0].runs[2].r || 0;

    data.measured.forEach((row, idx) => {
      // 1. Raw averages for Table 3 columns
      const activeMs = row.runs.map(r => r.m).filter(m => m !== 0);
      const activeRs = row.runs.map(r => r.r).filter(r => r !== 0);
      row.meanIndicatedForce = activeMs.length > 0 ? activeMs.reduce((acc, v) => acc + v, 0) / activeMs.length : 0;
      row.meanRawDeflection = activeRs.length > 0 ? activeRs.reduce((acc, v) => acc + v, 0) / activeRs.length : 0;

      // 2. Net calculations for math engine
      const n1 = row.runs[0].r !== 0 ? row.runs[0].r - z1 : 0;
      const n2 = row.runs[1].r !== 0 ? row.runs[1].r - z2 : 0;
      const n3 = row.runs[2].r !== 0 ? row.runs[2].r - z3 : 0;
      
      row.netValues = [n1, n2, n3];
      const activeNets = row.netValues.filter((v, i) => row.runs[i].r !== 0);
      
      // Mean Net Deflection (row.mean)
      row.mean = activeNets.length > 0 ? activeNets.reduce((acc, v) => acc + v, 0) / activeNets.length : 0;
      
      // Calculate Force in kN (Polynomial) for each run
      row.runForcesKn = row.netValues.map(n => n !== 0 ? (a * n) + (b * Math.pow(n, 2)) + (c * Math.pow(n, 3)) : 0);
      
      // Calculate Mean Force in kN using Mean Net Deflection
      const forceKn = (a * row.mean) + (b * Math.pow(row.mean, 2)) + (c * Math.pow(row.mean, 3));
      
      // Calculate Mean Force (True Reference) in Selected Unit
      row.meanForce = forceKn / targetConst;
    });

    this.renderTable6(prefix);
    this.renderTable7(prefix);
    this.renderTable8(prefix);
    this.renderTable9(prefix);
  }

  renderTable6(prefix = '') {
    const body = document.getElementById(`${prefix}t6-body`);
    if (!body) return;
    const targetConst = this.unitConstants[this.currentUnit];
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    if (!data) return;
    
    const activeRows = data.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    
    body.innerHTML = activeRows.map((row) => {
      const tKn = ((row.target || 0) * targetConst).toFixed(4);
      const nets = row.netValues || [0, 0, 0];
      return `
        <tr>
          <td>${row.point}</td>
          <td class="calculated">${nets[0] !== 0 ? tKn : '- -'}</td>
          <td class="calculated">${nets[0] !== 0 ? nets[0].toFixed(6) : '- -'}</td>
          <td class="calculated">${nets[1] !== 0 ? tKn : '- -'}</td>
          <td class="calculated">${nets[1] !== 0 ? nets[1].toFixed(6) : '- -'}</td>
          <td class="calculated">${nets[2] !== 0 ? tKn : '- -'}</td>
          <td class="calculated">${nets[2] !== 0 ? nets[2].toFixed(6) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 ? tKn : '- -'}</td>
          <td class="calculated">${row.mean !== 0 ? row.mean.toFixed(6) : '- -'}</td>
        </tr>
      `;
    }).join('');
  }

  renderTable7(prefix = '') {
    const body = document.getElementById(`${prefix}t7-body`);
    if (!body) return;
    const targetConst = this.unitConstants[this.currentUnit];
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    if (!data) return;
    
    const activeRows = data.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    
    body.innerHTML = activeRows.map((row) => {
      const targetKn = (row.target || 0) * targetConst;
      const nets = row.netValues || [0, 0, 0];
      return `
        <tr>
          <td class="calculated">${targetKn.toFixed(4)}</td>
          <td class="calculated">${nets[0] !== 0 ? nets[0].toFixed(6) : '- -'}</td>
          <td class="calculated">${nets[1] !== 0 ? nets[1].toFixed(6) : '- -'}</td>
          <td class="calculated">${nets[2] !== 0 ? nets[2].toFixed(6) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 ? row.mean.toFixed(6) : '- -'}</td>
        </tr>
      `;
    }).join('');
  }

  renderTable8(prefix = '') {
    const body = document.getElementById(`${prefix}t8-body`);
    if (!body) return;
    const targetConst = this.unitConstants[this.currentUnit];
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    if (!data) return;
    
    const activeRows = data.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    
    body.innerHTML = activeRows.map((row) => {
      const targetKn = (row.target || 0) * targetConst;
      const fKn = row.runForcesKn || [0, 0, 0];
      const meanKn = row.meanForce * targetConst;
      return `
        <tr>
          <td class="calculated">${targetKn.toFixed(4)}</td>
          <td class="calculated">${fKn[0] !== 0 ? fKn[0].toFixed(6) : '- -'}</td>
          <td class="calculated">${fKn[1] !== 0 ? fKn[1].toFixed(6) : '- -'}</td>
          <td class="calculated">${fKn[2] !== 0 ? fKn[2].toFixed(6) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 ? meanKn.toFixed(6) : '- -'}</td>
        </tr>
      `;
    }).join('');
  }

  renderTable9(prefix = '') {
    const body = document.getElementById(`${prefix}t9-body`);
    if (!body) return;

    let refUnc, resolution;
    if (prefix === '') {
        refUnc = parseFloat(document.getElementById('t4-u')?.value || document.getElementById('set-ref-unc')?.value || 0.02);
        resolution = parseFloat(document.getElementById('t1-resolution')?.value || 0.01);
    } else {
        refUnc = parseFloat(document.getElementById('hist-t4-u')?.textContent || 0.02);
        resolution = parseFloat(document.getElementById('hist-t1-resolution')?.textContent || 0.01);
    }

    const targetConst = this.unitConstants[this.currentUnit];
    const kgfConst = this.unitConstants['kgf'];
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    if (!data) return;

    const activeRows = data.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));

    body.innerHTML = activeRows.map((row) => {
      const activeNets = (row.netValues || []).filter((v, i) => row.runs[i].r !== 0);
      
      let w_rep = 0;
      let w_res = 0;
      let w_std = Math.sqrt(Math.pow(refUnc / 2, 2) + Math.pow(0.05 / Math.sqrt(3), 2));
      let w_comb = 0;
      let W_exp = 0;
      let accu_q = 0;
      let rep_b = 0;
      let zero_f0 = 0;
      let className = '-';

      if (activeNets.length > 0 && row.mean !== 0 && row.target !== 0) {
        // Standard Deviation of Net Values
        const sd = this.stdev(activeNets);
        
        // w_rep = ((stdev / sqrt(3)) / |row.mean|) * 100
        w_rep = (Math.abs(row.mean) > 0) ? ((sd / Math.sqrt(3)) / Math.abs(row.mean)) * 100 : 0;
        
        // w_res = (resolution / (mean_force_kgf * 2 * sqrt(3))) * 100
        const meanKgf = row.meanForce * (targetConst / kgfConst);
        w_res = meanKgf !== 0 ? (resolution / (Math.abs(meanKgf) * 2 * Math.sqrt(3))) * 100 : 0;
        
        // w_comb = sqrt(w_rep^2 + w_res^2 + w_std^2)
        w_comb = Math.sqrt(Math.pow(w_rep, 2) + Math.pow(w_res, 2) + Math.pow(w_std, 2));
        
        // W_exp = w_comb * 2
        W_exp = w_comb * 2; 

        // Errors (qi, bi, f0)
        accu_q = row.meanForce !== 0 ? ((row.target - row.meanForce) / row.meanForce) * 100 : 0;
        
        const fKn = row.runForcesKn || [0,0,0];
        const activeForces = fKn.filter(f => f !== 0);
        const range = activeForces.length > 1 ? Math.max(...activeForces) - Math.min(...activeForces) : 0;
        const meanKn = row.meanForce * targetConst;
        rep_b = meanKn !== 0 ? (range / Math.abs(meanKn)) * 100 : 0;
        
        zero_f0 = 0;
        
        // Classification based on Uncertainty (Previous Logic)
        if (W_exp < 0.05) className = 'Class 0';
        else if (W_exp < 0.1) className = 'Class 1';
        else if (W_exp < 0.2) className = 'Class 2';
        else className = 'Class 3';
      }

      return `
        <tr>
          <td>${row.point}</td>
          <td class="calculated">${row.mean !== 0 ? w_rep.toFixed(4) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 ? w_res.toFixed(4) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 ? w_std.toFixed(4) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 ? w_comb.toFixed(4) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 ? W_exp.toFixed(4) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 && row.target !== 0 ? accu_q.toFixed(4) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 && row.target !== 0 ? rep_b.toFixed(4) : '- -'}</td>
          <td class="calculated">${row.mean !== 0 && row.target !== 0 ? zero_f0.toFixed(4) : '- -'}</td>
          <td class="calculated">${className}</td>
        </tr>
      `;
    }).join('');
  }

  async captureToSelectedCell() {
    if (!this.selectedCell) {
      alert("Please select a cell in the table first.");
      return;
    }

    const { type, run, idx, row, tab } = this.selectedCell.dataset;
    
    // Read from hardware
    try {
      const res = await fetch('/api/hardware/read');
      const data = await res.json();
      const value = data.raw_deflection || 0;

      if (tab === "2") {
          // Preload table
          this.loggerData.preloading[row].runs[run-1][type] = value;
      } else if (tab === "3") {
          // Measured Data table
          this.loggerData.measured[idx].runs[run-1][type] = value;
      }
      
      this.renderReplicaTables();
    } catch (e) {
      alert("Capture failed: Hardware not connected.");
    }
  }

  clearLoggerData() {
    if (confirm("Clear all data in the logger tables?")) {
      this.loggerData.preloading.forEach(r => r.runs.forEach(run => { run.m = 0; run.r = 0; }));
      this.loggerData.measured.forEach(r => {
        r.runs.forEach(run => { run.m = 0; run.r = 0; });
        r.mean = 0; r.uncertainty = 0; r.class = 'N/A';
      });
      this.renderReplicaTables();
    }
  }

  async syncLoggerToExcel() {
    if (!this.currentProject) {
      alert("Please save the project first before exporting.");
      return;
    }
    if (!confirm("Are you sure you want to export the current data to an Excel report?")) return;
    alert("Syncing current table state to Excel Template...");
    window.location.href = `/api/export/excel/${this.currentProject.id}?data=${JSON.stringify(this.loggerData)}`;
  }

  loadDemoData() {
    if (!confirm("Load test data from Excel legacy file? This will unlock all tables and overwrite current entries.")) return;

    this.demoMode = true;
    const refNoEl = document.getElementById('t1-ref-no');
    const capEl = document.getElementById('t1-capacity');
    if (refNoEl) refNoEl.value = "DEMO-2026-XLS";
    if (capEl) capEl.value = "100";
    
    if (refNoEl) refNoEl.dispatchEvent(new Event('input'));
    if (capEl) capEl.dispatchEvent(new Event('input'));

    const sel = document.getElementById('lc-selector');
    sel.value = "3"; 
    sel.dispatchEvent(new Event('change'));

    this.setSystemUnit('kgf');

    const demoPoints = [
      { target: 20, r1: 0.038718, r2: 0.038906, r3: 0.039014 },
      { target: 40, r1: 0.079760, r2: 0.079224, r3: 0.079328 },
      { target: 60, r1: 0.119572, r2: 0.119712, r3: 0.119382 },
      { target: 80, r1: 0.160726, r2: 0.160792, r3: 0.160394 },
      { target: 100, r1: 0.201072, r2: 0.200842, r3: 0.200508 }
    ];

    const baseline = { target: 0, r1: -0.002132, r2: -0.002134, r3: -0.002132 };
    this.loggerData.preloading[0].target = baseline.target;
    this.loggerData.preloading[0].runs[0].m = baseline.target; this.loggerData.preloading[0].runs[0].r = baseline.r1;
    this.loggerData.preloading[0].runs[1].m = baseline.target; this.loggerData.preloading[0].runs[1].r = baseline.r2;
    this.loggerData.preloading[0].runs[2].m = baseline.target; this.loggerData.preloading[0].runs[2].r = baseline.r3;

    this.loggerData.measured.forEach(row => {
      row.target = 0;
      row.runs.forEach(run => { run.m = 0; run.r = 0; });
    });

    const zeroRow = this.loggerData.measured[0];
    zeroRow.target = baseline.target;
    zeroRow.runs[0].m = baseline.target; zeroRow.runs[0].r = baseline.r1;
    zeroRow.runs[1].m = baseline.target; zeroRow.runs[1].r = baseline.r2;
    zeroRow.runs[2].m = baseline.target; zeroRow.runs[2].r = baseline.r3;

    demoPoints.forEach((p, i) => {
      const row = this.loggerData.measured[i + 1];
      if (row) {
        row.target = p.target;
        row.runs[0].m = p.target; row.runs[0].r = p.r1;
        row.runs[1].m = p.target; row.runs[1].r = p.r2;
        row.runs[2].m = p.target; row.runs[2].r = p.r3;
      }
    });
    
    this.calculateFullSuite(); 

    document.getElementById('t5-temp-b').value = 23.0;
    document.getElementById('t5-temp-a').value = 23.0;
    document.getElementById('t5-hum-b').value = 39.0;
    document.getElementById('t5-hum-a').value = 39.0;

    this.renderReplicaTables();
    alert("Excel Demo Data loaded successfully. Calculations updated.");
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new DMP41CalibrationApp();
});
