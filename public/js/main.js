class DMP41CalibrationApp {
  constructor() {
    this.currentProject = null;
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
        if (settings.connection.type) {
          const typeSelect = document.getElementById('set-conn-type');
          if (typeSelect) {
            typeSelect.value = settings.connection.type;
            typeSelect.dispatchEvent(new Event('change'));
          }
        }
        if (settings.connection.tcp) {
          if (document.getElementById('set-ip')) document.getElementById('set-ip').value = settings.connection.tcp.ip || '';
          if (document.getElementById('set-port')) document.getElementById('set-port').value = settings.connection.tcp.port || '';
          
          if (settings.connection.type === 'tcp') {
            if (document.getElementById('disp-address')) document.getElementById('disp-address').textContent = settings.connection.tcp.ip || '...';
            if (document.getElementById('disp-port')) document.getElementById('disp-port').textContent = settings.connection.tcp.port || '...';
          }
        }
        if (settings.connection.serial) {
          if (document.getElementById('set-com')) document.getElementById('set-com').value = settings.connection.serial.com || '';
          if (document.getElementById('set-baud')) document.getElementById('set-baud').value = settings.connection.serial.baud || '';
          if (document.getElementById('set-parity')) document.getElementById('set-parity').value = settings.connection.serial.parity || '';
          if (document.getElementById('set-data-bits')) document.getElementById('set-data-bits').value = settings.connection.serial.data_bits || '';
          if (document.getElementById('set-stop-bits')) document.getElementById('set-stop-bits').value = settings.connection.serial.stop_bits || '';
          
          if (settings.connection.type === 'serial') {
            if (document.getElementById('disp-address')) document.getElementById('disp-address').textContent = settings.connection.serial.com || '...';
            if (document.getElementById('disp-port')) document.getElementById('disp-port').textContent = settings.connection.serial.baud || '...';
          }
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
      if (settings.reading_rate) {
        if (document.getElementById('set-reading-rate')) document.getElementById('set-reading-rate').value = settings.reading_rate;
        if (document.getElementById('disp-reading-rate')) document.getElementById('disp-reading-rate').textContent = settings.reading_rate;
      }
      if (settings.method) {
        if (document.getElementById('set-method')) document.getElementById('set-method').value = settings.method;
        if (document.getElementById('disp-method')) {
          const select = document.getElementById('set-method');
          document.getElementById('disp-method').textContent = select.options[select.selectedIndex].text;
        }
      }
      if (settings.meas_time) {
        if (document.getElementById('set-meas-time')) document.getElementById('set-meas-time').value = settings.meas_time;
        if (document.getElementById('disp-meas-time')) document.getElementById('disp-meas-time').textContent = settings.meas_time;
      }
      if (settings.save_style) {
        if (document.getElementById('set-save-style')) document.getElementById('set-save-style').value = settings.save_style;
        if (document.getElementById('disp-save-style')) document.getElementById('disp-save-style').textContent = settings.save_style;
      }
      if (settings.avg) {
        if (document.getElementById('set-avg')) document.getElementById('set-avg').value = settings.avg;
        if (document.getElementById('disp-avg')) document.getElementById('disp-avg').textContent = settings.avg;
      }

      // Coefficients
      if (settings.coeff_a) document.getElementById('set-coeff-a').value = settings.coeff_a;
      if (settings.coeff_b) document.getElementById('set-coeff-b').value = settings.coeff_b;
      if (settings.coeff_c) document.getElementById('set-coeff-c').value = settings.coeff_c;
      if (settings.ref_unc) document.getElementById('set-ref-unc').value = settings.ref_unc;
      if (settings.sensitivity_ppm) document.getElementById('set-sensitivity').value = settings.sensitivity_ppm;
      if (settings.resolution_kgf) document.getElementById('set-resolution').value = settings.resolution_kgf;
      if (settings.stability_threshold) document.getElementById('set-stability').value = settings.stability_threshold;

      if (settings.loading_points && document.getElementById('set-loading-points')) document.getElementById('set-loading-points').value = settings.loading_points;

      if (settings.sequences && Array.isArray(settings.sequences)) {
        settings.sequences.forEach(seq => {
          if (document.getElementById(`seq-enable-${seq.id}`)) document.getElementById(`seq-enable-${seq.id}`).checked = seq.enable;
          if (document.getElementById(`seq-preload-${seq.id}`)) document.getElementById(`seq-preload-${seq.id}`).value = seq.preload_num || 0;
          if (document.getElementById(`seq-load-${seq.id}`)) document.getElementById(`seq-load-${seq.id}`).value = seq.load_num || 0;
          if (document.getElementById(`seq-mode-${seq.id}`)) document.getElementById(`seq-mode-${seq.id}`).value = seq.mode || 'Inc';
        });
      }
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

    // History Nav
    const btnHistory = document.getElementById('nav-history-link-btn');
    if (btnHistory) {
      btnHistory.addEventListener('click', () => {
        document.getElementById('modal-history-list').style.display = 'block';
        this.loadHistory();
      });
    }

    const btnSaveHistory = document.getElementById('btn-save-history');
    if (btnSaveHistory) {
      btnSaveHistory.addEventListener('click', () => this.saveToHistory(true));
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

    // Settings Actions
    const connTypeSelect = document.getElementById('set-conn-type');
    if (connTypeSelect) {
      connTypeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'serial') {
          document.getElementById('tcp-settings').style.display = 'none';
          document.getElementById('serial-settings').style.display = 'block';
        } else {
          document.getElementById('tcp-settings').style.display = 'block';
          document.getElementById('serial-settings').style.display = 'none';
        }
      });
    }

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
    const table1Inputs = ['t1-ref-no', 't1-capacity', 't1-item', 't1-date', 't1-sn'];
    table1Inputs.forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.enforceUIState());
    });

    const btnDefaultSettings = document.getElementById('btn-default-settings');
    if (btnDefaultSettings) {
      btnDefaultSettings.addEventListener('click', () => this.restoreDefaultSettings());
    }

    // Real-time recalculation listeners
    ['set-coeff-a', 'set-coeff-b', 'set-coeff-c', 'set-ref-unc', 't5-temp-b', 't5-temp-a', 't5-hum-b', 't5-hum-a'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => {
          this.loggerData.measured.forEach((_, i) => this.calculateLoggerRow(i));
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
    const typeSelect = document.getElementById('set-conn-type');
    if (typeSelect) {
      typeSelect.value = 'tcp';
      typeSelect.dispatchEvent(new Event('change'));
    }
    if (document.getElementById('set-ip')) document.getElementById('set-ip').value = '192.168.1.100';
    if (document.getElementById('set-port')) document.getElementById('set-port').value = '1234';
    if (document.getElementById('set-com')) document.getElementById('set-com').value = 'COM1';
    if (document.getElementById('set-baud')) document.getElementById('set-baud').value = '4800';
    if (document.getElementById('set-parity')) document.getElementById('set-parity').value = 'None';
    if (document.getElementById('set-data-bits')) document.getElementById('set-data-bits').value = '8';
    if (document.getElementById('set-stop-bits')) document.getElementById('set-stop-bits').value = '1';

    // Instrument
    if (document.getElementById('set-instrument')) document.getElementById('set-instrument').value = 'DMP41';
    if (document.getElementById('set-channel')) document.getElementById('set-channel').value = '1';
    if (document.getElementById('set-reading-rate')) document.getElementById('set-reading-rate').value = '1 reading/sec';

    // Data Method
    if (document.getElementById('set-method')) document.getElementById('set-method').value = 'E';
    if (document.getElementById('set-meas-time')) document.getElementById('set-meas-time').value = '1';
    if (document.getElementById('set-save-style')) document.getElementById('set-save-style').value = 'KC';
    if (document.getElementById('set-avg')) document.getElementById('set-avg').value = 'Yes';

    // Coefficients
    if (document.getElementById('set-coeff-a')) document.getElementById('set-coeff-a').value = '1.0';
    if (document.getElementById('set-coeff-b')) document.getElementById('set-coeff-b').value = '0.0';
    if (document.getElementById('set-coeff-c')) document.getElementById('set-coeff-c').value = '0.0';
    if (document.getElementById('set-ref-unc')) document.getElementById('set-ref-unc').value = '0.02';
    if (document.getElementById('set-sensitivity')) document.getElementById('set-sensitivity').value = '50';
    if (document.getElementById('set-resolution')) document.getElementById('set-resolution').value = '0.01';
    if (document.getElementById('set-stability')) document.getElementById('set-stability').value = '0.000010';

    // Sequence
    if (document.getElementById('set-loading-points')) document.getElementById('set-loading-points').value = '10';
    for (let i = 1; i <= 15; i++) {
      if (document.getElementById(`seq-enable-${i}`)) document.getElementById(`seq-enable-${i}`).checked = false;
      if (document.getElementById(`seq-preload-${i}`)) document.getElementById(`seq-preload-${i}`).value = '0';
      if (document.getElementById(`seq-load-${i}`)) document.getElementById(`seq-load-${i}`).value = '0';
      if (document.getElementById(`seq-mode-${i}`)) document.getElementById(`seq-mode-${i}`).value = 'Inc';
    }

    alert("Defaults restored in the form. Please click 'Save All Settings' to apply them to the system.");
  }

  async saveSettings() {
    const settings = {
      connection: {
        type: document.getElementById('set-conn-type')?.value,
        tcp: {
          ip: document.getElementById('set-ip')?.value,
          port: document.getElementById('set-port')?.value
        },
        serial: {
          com: document.getElementById('set-com')?.value,
          baud: document.getElementById('set-baud')?.value,
          parity: document.getElementById('set-parity')?.value,
          data_bits: document.getElementById('set-data-bits')?.value,
          stop_bits: document.getElementById('set-stop-bits')?.value
        }
      },
      instrument: document.getElementById('set-instrument')?.value,
      channel: document.getElementById('set-channel')?.value,
      reading_rate: document.getElementById('set-reading-rate')?.value,
      method: document.getElementById('set-method')?.value,
      meas_time: document.getElementById('set-meas-time')?.value,
      save_style: document.getElementById('set-save-style')?.value,
      avg: document.getElementById('set-avg')?.value,
      coeff_a: document.getElementById('set-coeff-a')?.value,
      coeff_b: document.getElementById('set-coeff-b')?.value,
      coeff_c: document.getElementById('set-coeff-c')?.value,
      ref_unc: document.getElementById('set-ref-unc')?.value,
      sensitivity_ppm: document.getElementById('set-sensitivity')?.value,
      resolution_kgf: document.getElementById('set-resolution')?.value,
      stability_threshold: document.getElementById('set-stability')?.value,
      loading_points: document.getElementById('set-loading-points')?.value,
      sequences: []
    };

    for (let i = 1; i <= 15; i++) {
      settings.sequences.push({
        id: i,
        enable: document.getElementById(`seq-enable-${i}`)?.checked,
        preload_num: document.getElementById(`seq-preload-${i}`)?.value,
        load_num: document.getElementById(`seq-load-${i}`)?.value,
        mode: document.getElementById(`seq-mode-${i}`)?.value
      });
    }

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
        resolution: resolution
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
    try {
      const res = await fetch('/api/hardware/connect', { method: 'POST' });
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
    await this.syncProjectData(); // Sync manual edits
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

  async loadHistory() {
    try {
      const response = await fetch('/api/calibration/history');
      const projects = await response.json();
      const grid = document.getElementById('history-grid');
      if (!grid) return;

      if (projects.length === 0) {
        grid.innerHTML = '<p>No history found. Complete a calibration and click "Save to History".</p>';
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
      // Find the project data
      const response = await fetch('/api/calibration/history');
      const projects = await response.json();
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      // Populate summary
      const displayDiv = document.getElementById('history-project-display');
      displayDiv.innerHTML = `
        <strong>Project:</strong> ${project.project_name}<br>
        <strong>Instrument:</strong> ${project.instrument_name || 'N/A'} <br>
        <strong>S/N:</strong> ${project.serial_number || 'N/A'} | 
        <strong>Capacity:</strong> ${project.capacity_kgf || 'N/A'} kgf
      `;

      // Load results
      const resProcess = await fetch(`/api/calibration/process/${project.id}`);
      const results = await resProcess.json();

      const tbody = document.getElementById('history-table-body');
      if (results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No data available for this project.</td></tr>';
      } else {
        tbody.innerHTML = results.map((result, idx) => `
          <tr>
            <td>${idx}</td>
            <td>${result.target_force_kgf}</td>
            <td>${(result.series1_mvv).toFixed(6)}</td>
            <td>${(result.series2_mvv).toFixed(6)}</td>
            <td>${(result.series3_mvv).toFixed(6)}</td>
            <td>${result.mean_force_kn.toFixed(6)}</td>
            <td>${result.classification}</td>
          </tr>
        `).join('');
      }

      // Attach actions for THIS historical project specifically
      document.getElementById('btn-hist-cert').onclick = async () => {
        try {
          const certRes = await fetch('/api/certificate/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: project.id, format: 'html' })
          });
          const html = await certRes.text();
          const win = window.open('', '_blank');
          win.document.write(html);
          win.document.close();
        } catch(e) { alert('Failed to generate historical cert'); }
      };

      document.getElementById('btn-hist-csv').onclick = () => {
        if (results.length === 0) return;
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

      document.getElementById('btn-hist-print').onclick = () => window.print();

      document.getElementById('btn-hist-excel').onclick = () => {
        window.location.href = `/api/export/excel/${project.id}`;
      };

      document.getElementById('btn-hist-manual').onclick = () => {
        this.openManualEntry(project, results);
      };

      document.getElementById('btn-hist-delete').onclick = async () => {
        if (confirm("Are you sure you want to permanently erase this historical record? This action cannot be undone.")) {
          try {
            const deleteRes = await fetch(`/api/calibration/projects/${project.id}`, { method: 'DELETE' });
            if (deleteRes.ok) {
              alert("Historical record erased successfully.");
              document.getElementById('modal-history-view').style.display = 'none';
              this.loadHistory(); // Refresh the grid
            } else {
              alert("Failed to erase historical record.");
            }
          } catch (err) {
            console.error(err);
            alert("Error erasing historical record.");
          }
        }
      };

      // Hide list and show view modal
      document.getElementById('modal-history-list').style.display = 'none';
      document.getElementById('modal-history-view').style.display = 'block';

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

          if (elModel) elModel.textContent = selected.model;
          if (elCap) elCap.textContent = selected.capacity;
          if (elSn) elSn.textContent = selected.sn;
          if (elCert) elCert.textContent = selected.cert_no || 'N/A';
          if (elU) elU.textContent = selected.uncertainty;
          if (elA) elA.textContent = selected.coeff_a;
          if (elB) elB.textContent = selected.coeff_b;
          if (elC) elC.textContent = selected.coeff_c;
          if (elDate) elDate.textContent = selected.cal_date || 'N/A';

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

  // --- Native Logger Methods ---

  renderLogger() {
    this.renderReplicaTables();
  }

  formatCellValue(val, isTarget = false, isReading = false) {
    if (val === 0 || val === "0" || val === null || val === undefined) {
      return ""; // Return empty string for placeholders
    }
    return isReading ? parseFloat(val).toFixed(6) : parseFloat(val);
  }

  renderReplicaTables() {
    this.calculateFullSuite();

    // Table 2: Pre-loading
    const t2Body = document.getElementById('t2-body');
    if (t2Body) {
      t2Body.innerHTML = this.loggerData.preloading.map((row, idx) => {
        const getCls = (v) => v === "" ? 'l-cell-t2 placeholder-dull' : 'l-cell-t2';
        const v1m = this.formatCellValue(row.runs[0].m);
        const v1r = this.formatCellValue(row.runs[0].r, false, true);
        const v2m = this.formatCellValue(row.runs[1].m);
        const v2r = this.formatCellValue(row.runs[1].r, false, true);
        const v3m = this.formatCellValue(row.runs[2].m);
        const v3r = this.formatCellValue(row.runs[2].r, false, true);

        return `
        <tr>
          <td>${idx === 0 ? '0.0' : 'Max Cap'}</td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="1" data-type="m"><input type="text" class="${getCls(v1m)}" value="${v1m}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="m"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="1" data-type="r"><input type="text" class="${getCls(v1r)}" value="${v1r}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="r"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="2" data-type="m"><input type="text" class="${getCls(v2m)}" value="${v2m}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="m"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="2" data-type="r"><input type="text" class="${getCls(v2r)}" value="${v2r}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="r"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="3" data-type="m"><input type="text" class="${getCls(v3m)}" value="${v3m}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="m"></td>
          <td class="selectable" data-tab="2" data-row="${idx}" data-run="3" data-type="r"><input type="text" class="${getCls(v3r)}" value="${v3r}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="r"></td>
        </tr>`;
      }).join('');
    }

    // Table 3: Measured Data
    const t3Body = document.getElementById('t3-body');
    if (t3Body) {
      t3Body.innerHTML = this.loggerData.measured.map((row, idx) => {
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
          <td><input type="text" class="${vt === "" ? 'l-t placeholder-dull' : 'l-t'}" data-idx="${idx}" value="${vt}" placeholder="- -"></td>
          
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="1" data-type="m"><input type="text" class="${getCls(v1m)}" value="${v1m}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="m"></td>
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="1" data-type="r"><input type="text" class="${getCls(v1r)}" value="${v1r}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="r"></td>
          
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="2" data-type="m"><input type="text" class="${getCls(v2m)}" value="${v2m}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="m"></td>
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="2" data-type="r"><input type="text" class="${getCls(v2r)}" value="${v2r}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="r"></td>
          
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="3" data-type="m"><input type="text" class="${getCls(v3m)}" value="${v3m}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="m"></td>
          <td class="selectable" data-tab="3" data-idx="${idx}" data-run="3" data-type="r"><input type="text" class="${getCls(v3r)}" value="${v3r}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="r"></td>
          
          <td class="calculated" id="t3-meanforce-${idx}">${row.meanIndicatedForce ? row.meanIndicatedForce.toFixed(this.currentUnit === 'kN' ? 6 : 3) : '- -'}</td>
          <td class="calculated" id="t3-meandef-${idx}">${row.meanRawDeflection ? row.meanRawDeflection.toFixed(6) : '- -'}</td>
        </tr>`;
      }).join('');
    }

    // Attach listeners to all inputs
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
            if (tab === "2") this.loggerData.preloading[row].runs[run-1][type] = val;
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

  updateRowUI(idx) {
    const row = this.loggerData.measured[idx];
    const forceEl = document.getElementById(`t3-meanforce-${idx}`);
    const defEl = document.getElementById(`t3-meandef-${idx}`);
    if (forceEl) forceEl.textContent = (row.meanIndicatedForce || 0).toFixed(this.currentUnit === 'kN' ? 6 : 3);
    if (defEl) defEl.textContent = (row.meanRawDeflection || 0).toFixed(6);
  }

  calculateFullSuite() {
    const a = parseFloat(document.getElementById('set-coeff-a')?.value || 1);
    const b = parseFloat(document.getElementById('set-coeff-b')?.value || 0);
    const c = parseFloat(document.getElementById('set-coeff-c')?.value || 0);
    const targetConst = this.unitConstants[this.currentUnit];

    // Zeros from Table 2 (index 0 is "0.0" row)
    const z1 = this.loggerData.preloading[0].runs[0].r || 0;
    const z2 = this.loggerData.preloading[0].runs[1].r || 0;
    const z3 = this.loggerData.preloading[0].runs[2].r || 0;

    this.loggerData.measured.forEach((row, idx) => {
      // Data Logger (Table 3) direct averages
      const activeMs = row.runs.map(r => r.m).filter(m => m !== 0);
      const activeRs = row.runs.map(r => r.r).filter(r => r !== 0);
      row.meanIndicatedForce = activeMs.length > 0 ? activeMs.reduce((acc, v) => acc + v, 0) / activeMs.length : 0;
      row.meanRawDeflection = activeRs.length > 0 ? activeRs.reduce((acc, v) => acc + v, 0) / activeRs.length : 0;

      // Calculate Net Values (dij) by subtracting Run Zeros
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
      
      // Calculate Force in Current Unit
      row.meanForce = forceKn / targetConst;
    });

    this.renderTable6();
    this.renderTable7();
    this.renderTable8();
    this.renderTable9();
  }

  renderTable6() {
    const body = document.getElementById('t6-body');
    if (!body) return;
    const targetConst = this.unitConstants[this.currentUnit];
    
    // Filter adaptable rows (keep idx 0 for baseline, and valid targets)
    const activeRows = this.loggerData.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    
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

  renderTable7() {
    const body = document.getElementById('t7-body');
    if (!body) return;
    const targetConst = this.unitConstants[this.currentUnit];
    
    const activeRows = this.loggerData.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    
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

  renderTable8() {
    const body = document.getElementById('t8-body');
    if (!body) return;
    const targetConst = this.unitConstants[this.currentUnit];
    
    const activeRows = this.loggerData.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    
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

  renderTable9() {
    const body = document.getElementById('t9-body');
    if (!body) return;

    const refUnc = parseFloat(document.getElementById('set-ref-unc')?.value || 0.02);
    const resolution = parseFloat(document.getElementById('set-resolution')?.value || 0.01);
    const targetConst = this.unitConstants[this.currentUnit];
    const kgfConst = this.unitConstants['kgf'];

    const activeRows = this.loggerData.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));

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
        w_rep = ((sd / Math.sqrt(3)) / Math.abs(row.mean)) * 100;
        
        // w_res = (resolution / (mean_force_kgf * 2 * sqrt(3))) * 100
        const meanKgf = row.meanForce * (targetConst / kgfConst);
        w_res = meanKgf !== 0 ? (resolution / (Math.abs(meanKgf) * 2 * Math.sqrt(3))) * 100 : 0;
        
        // w_comb = sqrt(w_rep^2 + w_res^2 + w_std^2)
        w_comb = Math.sqrt(Math.pow(w_rep, 2) + Math.pow(w_res, 2) + Math.pow(w_std, 2));
        
        // W_exp = w_comb * 2
        W_exp = w_comb * 2; 

        // Errors (qi, bi, f0)
        // ISO 376 Relative Accuracy Error: (Indicated - True) / True
        accu_q = row.meanForce !== 0 ? ((row.target - row.meanForce) / row.meanForce) * 100 : 0;
        
        // Use polynomial calculated forces for repeatability error range to match backend and true ISO rules
        const fKn = row.runForcesKn || [0,0,0];
        const activeForces = fKn.filter(f => f !== 0);
        const range = activeForces.length > 1 ? Math.max(...activeForces) - Math.min(...activeForces) : 0;
        const meanKn = row.meanForce * targetConst;
        rep_b = meanKn !== 0 ? (range / Math.abs(meanKn)) * 100 : 0;
        
        zero_f0 = 0; // Simplified baseline
        
        // ISO 7500-1 Classification based on accuracy and repeatability
        const maxError = Math.max(Math.abs(accu_q), Math.abs(rep_b), Math.abs(zero_f0));
        if (maxError <= 0.5) className = '0.5';
        else if (maxError <= 1.0) className = '1.0';
        else if (maxError <= 2.0) className = '2.0';
        else if (maxError <= 3.0) className = '3.0';
        else className = 'Unclassified';
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

  calculateLoggerRow(idx) {
    const row = this.loggerData.measured[idx];
    const a = parseFloat(document.getElementById('set-coeff-a')?.value || 1);
    const b = parseFloat(document.getElementById('set-coeff-b')?.value || 0);
    const c = parseFloat(document.getElementById('set-coeff-c')?.value || 0);
    const targetConst = this.unitConstants[this.currentUnit];

    // Calculate Force for each run (D -> Force in kN)
    const runForces = row.runs.map(run => {
        if (run.r === 0) return 0;
        return (a * run.r) + (b * Math.pow(run.r, 2)) + (c * Math.pow(run.r, 3));
    });

    const activeForces = runForces.filter(f => f !== 0);
    
    if (activeForces.length > 0) {
      // Mean in kN
      const avgKn = activeForces.reduce((sum, f) => sum + f, 0) / activeForces.length;
      
      // Convert Mean to Display Unit
      row.mean = avgKn / targetConst;

      // Simple Uncertainty Mock (matching Excel behavior)
      if (activeForces.length === 3) {
          row.uncertainty = 0.025; 
          row.class = row.uncertainty < 0.05 ? 'Class 0' : 'Class 1';
      }
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
    // This will format the loggerData and send it to the /api/export/excel route
    alert("Syncing current table state to Excel Template...");
    window.location.href = `/api/export/excel/${this.currentProject.id}?data=${JSON.stringify(this.loggerData)}`;
  }

  loadDemoData() {
    if (!confirm("Load test data from Excel legacy file? This will unlock all tables and overwrite current entries.")) return;

    // 0. Bypass Workflow Locks
    this.demoMode = true;
    const refNoEl = document.getElementById('t1-ref-no');
    const capEl = document.getElementById('t1-capacity');
    if (refNoEl) refNoEl.value = "DEMO-2026-XLS";
    if (capEl) capEl.value = "100";
    
    // Trigger any dependent logic for these fields
    if (refNoEl) refNoEl.dispatchEvent(new Event('input'));
    if (capEl) capEl.dispatchEvent(new Event('input'));

    // 1. Set Load Cell (HBM/C3H3)
    const sel = document.getElementById('lc-selector');
    sel.value = "3"; // ID for HBM/C3H3
    sel.dispatchEvent(new Event('change'));

    // 2. Set Unit to kgf
    this.setSystemUnit('kgf');

    // 3. Populate Measured Data (Extracted from Excel Row 17-22)
    const demoPoints = [
      { target: 20, r1: 0.038718, r2: 0.038906, r3: 0.039014 },
      { target: 40, r1: 0.079760, r2: 0.079224, r3: 0.079328 },
      { target: 60, r1: 0.119572, r2: 0.119712, r3: 0.119382 },
      { target: 80, r1: 0.160726, r2: 0.160792, r3: 0.160394 },
      { target: 100, r1: 0.201072, r2: 0.200842, r3: 0.200508 }
    ];

    // Populate Baseline 0 in preloading
    const baseline = { target: 0, r1: -0.002132, r2: -0.002134, r3: -0.002132 };
    this.loggerData.preloading[0].target = baseline.target;
    this.loggerData.preloading[0].runs[0].m = baseline.target; this.loggerData.preloading[0].runs[0].r = baseline.r1;
    this.loggerData.preloading[0].runs[1].m = baseline.target; this.loggerData.preloading[0].runs[1].r = baseline.r2;
    this.loggerData.preloading[0].runs[2].m = baseline.target; this.loggerData.preloading[0].runs[2].r = baseline.r3;

    // Reset all measured points first
    this.loggerData.measured.forEach(row => {
      row.target = 0;
      row.runs.forEach(run => { run.m = 0; run.r = 0; });
    });

    // Populate measured[0] with the baseline point so it displays on the 0.0 row
    const zeroRow = this.loggerData.measured[0];
    zeroRow.target = baseline.target;
    zeroRow.runs[0].m = baseline.target; zeroRow.runs[0].r = baseline.r1;
    zeroRow.runs[1].m = baseline.target; zeroRow.runs[1].r = baseline.r2;
    zeroRow.runs[2].m = baseline.target; zeroRow.runs[2].r = baseline.r3;

    // Populate measured points starting at index 1
    demoPoints.forEach((p, i) => {
      const row = this.loggerData.measured[i + 1];
      if (row) {
        row.target = p.target;
        row.runs[0].m = p.target; row.runs[0].r = p.r1;
        row.runs[1].m = p.target; row.runs[1].r = p.r2;
        row.runs[2].m = p.target; row.runs[2].r = p.r3;
      }
    });
    
    this.calculateFullSuite(); // Update all tables

    // 4. Populate Env
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
