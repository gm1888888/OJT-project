class DMP41CalibrationApp {
  constructor() {
    this.currentProject = null;
    this.currentHistoricalData = null; 
    this.currentReadings = [];
    this.isPolling = false;
    this.calibrationSequence = [];
    this.pollInterval = null;
    this.chart = null;
    this.lastResults = []; 
    this.selectedCell = null; 
    this.loadCells = [];
    this.currentUnit = 'kgf';
    this.demoMode = false;
    this.unitConstants = {
      'kgf': 0.00980665,
      'kN': 1.0,
      'lbf': 0.004448222,
      'N': 0.001,
      'tf': 9.80665
    };
    this.loggerData = {
      preloading: [
        { target: 0, runs: [{ m: null, r: null }, { m: null, r: null }, { m: null, r: null }] },
        { target: 100, runs: [{ m: null, r: null }, { m: null, r: null }, { m: null, r: null }] }
      ],
      measured: Array.from({ length: 11 }, (_, i) => ({
        point: i,
        target: i * 10,
        runs: [{ m: null, r: null }, { m: null, r: null }, { m: null, r: null }],
        mean: 0,
        meanForce: 0, 
        uncertainty: 0,
        class: 'N/A'
      }))
    };
    
    this.initEventListeners();
    this.initChart();
    this.checkHardwareStatus(); 
    this.loadSettings();
    this.resetWorkspace();

    setInterval(() => this.enforceUIState(), 500);
    setInterval(() => this.checkHardwareStatus(), 2000);
  }

  resetWorkspace() {
    this.currentProject = null;
    this.demoMode = false;
    ['t1-date', 't1-ref-no', 't1-capacity', 't1-item', 't1-range', 't1-increment', 't1-resolution', 't1-lc-make', 't1-lc-sn', 't1-ind-make', 't1-ind-sn', 't1-client-name', 't1-client-address'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['t5-temp-b', 't5-temp-a', 't5-hum-b', 't5-hum-a'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['t4-model', 't4-cap', 't4-sn', 't4-cert', 't4-date', 't4-a', 't4-b', 't4-c', 't4-u', 't4-drift'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this.loggerData.preloading.forEach(r => r.runs.forEach(run => { run.m = null; run.r = null; }));
    this.loggerData.measured.forEach(r => {
      r.target = 0;
      r.runs.forEach(run => { run.m = null; run.r = null; });
      r.mean = 0; r.uncertainty = 0; r.class = 'N/A';
    });
    this.renderLogger();
  }

  async clearLoggerData() {
    if (confirm("Reset all worksheet data and project information? This will start a fresh workspace.")) {
      this.resetWorkspace();
      const modalNewProject = document.getElementById('modal-new-project');
      if (modalNewProject) modalNewProject.style.display = 'flex';
    }
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
      if (btnStartPolling) btnStartPolling.disabled = true;
      if (btnStopPolling) btnStopPolling.disabled = true;
      if (terminalInput) terminalInput.disabled = true;
      if (btnTerminalSend) btnTerminalSend.disabled = true;
      if (this.isPolling) this.stopPolling();
    }

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
      if (settings.connection && settings.connection.tcp) {
          const ip = settings.connection.tcp.ip || '192.168.1.100';
          const port = settings.connection.tcp.port || '1234';
          if (document.getElementById('main-ip')) document.getElementById('main-ip').value = ip;
          if (document.getElementById('main-port')) document.getElementById('main-port').value = port;
      }
      if (settings.channel) {
        if (document.getElementById('set-channel')) document.getElementById('set-channel').value = settings.channel;
      }
      if (settings.coeff_a) document.getElementById('t4-a').value = settings.coeff_a;
      if (settings.coeff_b) document.getElementById('t4-b').value = settings.coeff_b;
      if (settings.coeff_c) document.getElementById('t4-c').value = settings.coeff_c;
      if (settings.ref_unc) document.getElementById('t4-u').value = settings.ref_unc;
      if (settings.resolution_kgf) document.getElementById('t1-resolution').value = settings.resolution_kgf;
      this.renderLogger();
    } catch (err) { console.error('Failed to load settings:', err); }
  }

  initEventListeners() {
    document.getElementById('btn-connect').addEventListener('click', () => this.triggerConnection());
    
    const btnAddStd = document.getElementById('btn-add-standard');
    if(btnAddStd) btnAddStd.onclick = () => this.openStandardModal();
    const btnEditStd = document.getElementById('btn-edit-standard');
    if(btnEditStd) btnEditStd.onclick = () => this.openStandardModal(document.getElementById('lc-selector').value);
    const btnDelStd = document.getElementById('btn-del-standard');
    if(btnDelStd) btnDelStd.onclick = () => this.deleteStandard(document.getElementById('lc-selector').value);
    const btnSaveStd = document.getElementById('btn-save-standard');
    if(btnSaveStd) btnSaveStd.onclick = () => this.saveStandard();
    const btnCloseStd = document.getElementById('close-standard');
    if(btnCloseStd) btnCloseStd.onclick = () => document.getElementById('modal-standard').style.display = 'none';

    const modalTerminal = document.getElementById('modal-terminal');
    document.getElementById('btn-terminal').addEventListener('click', () => {
      modalTerminal.style.display = 'flex';
      document.getElementById('terminal-input').focus();
    });
    document.getElementById('btn-terminal-send').addEventListener('click', () => this.sendTerminalCommand());
    document.getElementById('terminal-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendTerminalCommand();
    });
    
    document.getElementById('hw-mode-select').addEventListener('change', (e) => {
      document.getElementById('btn-connect').disabled = false;
      this.setHardwareMode(e.target.value);
    });

    document.getElementById('btn-start-polling').addEventListener('click', () => this.startPolling());
    document.getElementById('btn-stop-polling').addEventListener('click', () => this.stopPolling());
    document.getElementById('btn-add-t2-row').addEventListener('click', () => this.addTestPoint('preloading'));
    document.getElementById('btn-add-t3-row').addEventListener('click', () => this.addTestPoint('measured'));
    document.getElementById('btn-del-t2-row').addEventListener('click', () => this.deleteTestPoint('preloading'));
    document.getElementById('btn-del-t3-row').addEventListener('click', () => this.deleteTestPoint('measured'));

    const btnMonitor = document.querySelector('a[href="#live-monitor"]');
    if (btnMonitor) {
      btnMonitor.addEventListener('click', (e) => {
        const el = document.getElementById('live-monitor');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
        if (this.connectionState === 'connected' && !this.isPolling) this.startPolling();
      });
    }

    const btnHistory = document.getElementById('nav-history-link-btn');
    if (btnHistory) btnHistory.addEventListener('click', () => { document.getElementById('modal-history-list').style.display = 'flex'; this.loadHistory(); });
    const btnArchive = document.getElementById('nav-archive-link-btn');
    if (btnArchive) btnArchive.addEventListener('click', () => { document.getElementById('modal-archive-list').style.display = 'flex'; this.loadHistory('', true); });
    
    const btnSaveHistory = document.getElementById('btn-save-history');
    if (btnSaveHistory) btnSaveHistory.addEventListener('click', () => this.saveToHistory(true, false));

    const btnSaveAs = document.getElementById('btn-save-as');
    if (btnSaveAs) btnSaveAs.addEventListener('click', () => this.saveToHistory(true, true));

    const histSearch = document.getElementById('history-search');
    if (histSearch) histSearch.addEventListener('input', () => this.loadHistory(histSearch.value, false));
    const archSearch = document.getElementById('archive-search');
    if (archSearch) archSearch.addEventListener('input', () => this.loadHistory(archSearch.value, true));
    
    const btnHistBack = document.getElementById('btn-hist-back');
    if (btnHistBack) btnHistBack.addEventListener('click', () => {
        document.getElementById('modal-history-view').style.display = 'none';
        if (this.currentHistoricalData && this.currentHistoricalData.is_archived) {
            document.getElementById('modal-archive-list').style.display = 'flex';
            this.loadHistory('', true);
        } else {
            document.getElementById('modal-history-list').style.display = 'flex';
            this.loadHistory();
        }
    });

    const btnHistArchive = document.getElementById('btn-hist-archive');
    if (btnHistArchive) btnHistArchive.onclick = () => this.archiveHistoricalRecord();
    const btnHistUnarchive = document.getElementById('btn-hist-unarchive');
    if (btnHistUnarchive) btnHistUnarchive.onclick = () => this.unarchiveHistoricalRecord();
    const btnHistLoadDemo = document.getElementById('btn-hist-load-demo');
    if (btnHistLoadDemo) btnHistLoadDemo.onclick = () => this.loadHistoricalAsDemo();
    const btnHistExcel = document.getElementById('btn-hist-excel');
    if (btnHistExcel) btnHistExcel.onclick = () => this.exportHistoricalExcel();
    const btnHistPrint = document.getElementById('btn-hist-print');
    if (btnHistPrint) btnHistPrint.onclick = () => {
      if (!this.currentHistoricalData || !this.currentHistoricalData.id) return;
      window.open(`/api/export/pdf/${this.currentHistoricalData.id}`, '_blank');
    };

    document.getElementById('btn-excel-capture').addEventListener('click', () => this.captureToSelectedCell());
    document.getElementById('btn-excel-clear').addEventListener('click', () => this.clearLoggerData());
    document.getElementById('btn-excel-export').addEventListener('click', () => this.syncLoggerToExcel());

    this.initLoadCellSelector();
    document.querySelectorAll('.unit-btn').forEach(btn => {
      btn.onclick = () => this.setSystemUnit(btn.dataset.unit);
    });

    ['t1-ref-no', 't1-capacity', 't1-item', 't1-date', 't1-lc-sn', 't1-ind-sn', 't1-lc-make', 't1-ind-make', 't1-mode', 't1-range', 't1-increment', 't1-resolution', 't1-client-name', 't1-client-address'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => { this.enforceUIState(); this.renderLogger(); });
    });

    ['t4-a', 't4-b', 't4-c', 't4-u', 't4-drift', 't5-temp-b', 't5-temp-a', 't5-hum-b', 't5-hum-a'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.renderLogger());
    });

    const btnNewProject = document.getElementById('btn-new-project');
    if (btnNewProject) btnNewProject.addEventListener('click', () => {
      if (confirm("Clear current workspace and start a new project? Unsaved changes will be lost.")) {
        this.resetWorkspace();
      }
    });
    const btnSubmitProject = document.getElementById('btn-submit-project');
    if (btnSubmitProject) btnSubmitProject.addEventListener('click', () => this.createProject());

    document.querySelectorAll('.close').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal').style.display = 'none'));
    window.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; });

    window.addEventListener('scroll', () => {
      const monitor = document.getElementById('live-monitor'), placeholder = document.getElementById('live-monitor-placeholder');
      if (!monitor || !placeholder) return;
      const rect = placeholder.getBoundingClientRect();
      if (!monitor.classList.contains('mini-window')) { placeholder.dataset.origHeight = monitor.offsetHeight; placeholder.dataset.origMargin = window.getComputedStyle(monitor).marginBottom; }
      const origHeight = parseInt(placeholder.dataset.origHeight || 0);
      if (rect.top < -(origHeight + 20)) {
        if (!monitor.classList.contains('mini-window')) { placeholder.style.height = `${origHeight}px`; placeholder.style.marginBottom = placeholder.dataset.origMargin; monitor.classList.add('mini-window'); }
      } else if (monitor.classList.contains('mini-window')) { monitor.classList.remove('mini-window'); placeholder.style.height = '0px'; placeholder.style.marginBottom = '0px'; }
    });
  }

  // --- Standard Management ---
  openStandardModal(standardId = null) {
    const modal = document.getElementById('modal-standard'), title = document.getElementById('std-modal-title'), dbIdInput = document.getElementById('std-db-id');
    ['std-model', 'std-sn', 'std-cap', 'std-u', 'std-coeff-a', 'std-coeff-b', 'std-coeff-c', 'std-cert', 'std-date'].forEach(id => { 
        const el = document.getElementById(id);
        if (el) el.value = ''; 
    });
    if (standardId && (typeof standardId === 'string') && standardId.startsWith('custom_')) {
        const s = this.loadCells.find(x => x.id === standardId);
        if (s) {
            title.textContent = "Edit Custom Standard"; dbIdInput.value = s.db_id;
            document.getElementById('std-model').value = s.model || ''; document.getElementById('std-sn').value = s.sn || '';
            document.getElementById('std-cap').value = parseFloat(s.capacity) || ''; document.getElementById('std-u').value = s.uncertainty || '';
            document.getElementById('std-coeff-a').value = s.coeff_a || ''; document.getElementById('std-coeff-b').value = s.coeff_b || '';
            document.getElementById('std-coeff-c').value = s.coeff_c || ''; document.getElementById('std-cert').value = s.cert_no || '';
            document.getElementById('std-date').value = s.cal_date || '';
        }
    } else if (standardId && standardId !== "") { alert("System standards cannot be edited."); return; }
    else { title.textContent = "Add New Standard"; dbIdInput.value = ''; }
    modal.style.display = 'flex';
  }

  async saveStandard() {
    const dbId = document.getElementById('std-db-id').value;
    const payload = {
        model: document.getElementById('std-model').value.trim(), 
        sn: document.getElementById('std-sn').value.trim(),
        capacity_kn: parseFloat(document.getElementById('std-cap').value), 
        uncertainty: parseFloat(document.getElementById('std-u').value),
        coeff_a: parseFloat(document.getElementById('std-coeff-a').value), 
        coeff_b: parseFloat(document.getElementById('std-coeff-b').value),
        coeff_c: parseFloat(document.getElementById('std-coeff-c').value), 
        cert_no: document.getElementById('std-cert').value.trim(), 
        cal_date: document.getElementById('std-date').value
    };

    // --- DEEPER VALIDATION ---
    const errors = [];
    if (!payload.model) errors.push("Model name is required.");
    if (!payload.sn) errors.push("Serial Number is required.");
    if (isNaN(payload.capacity_kn) || payload.capacity_kn <= 0) errors.push("Capacity must be a positive number.");
    
    // Check for NaN or extremely unrealistic coefficients (safety check)
    if (isNaN(payload.coeff_a)) errors.push("Coefficient A is invalid.");
    if (isNaN(payload.coeff_b)) errors.push("Coefficient B is invalid.");
    if (isNaN(payload.coeff_c)) errors.push("Coefficient C is invalid.");
    
    // ISO 376 coefficients are typically small or within predictable ranges
    // but we primarily want to ensure they are present and numeric.
    if (isNaN(payload.uncertainty) || payload.uncertainty < 0) errors.push("Uncertainty must be a non-negative number.");

    if (errors.length > 0) {
        alert("Validation Errors:\n- " + errors.join("\n- "));
        return;
    }

    try {
        const url = dbId ? `/api/config/load-cells/${dbId}` : '/api/config/load-cells';
        const method = dbId ? 'PUT' : 'POST';
        const res = await fetch(url, { 
            method, 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        const result = await res.json();
        
        if (res.ok) { 
            alert("Standard saved successfully."); 
            document.getElementById('modal-standard').style.display = 'none'; 
            await this.initLoadCellSelector(); 
        } else {
            alert(result.error || "Failed to save standard.");
        }
    } catch (e) { 
        console.error(e); 
        alert("An error occurred while saving the standard.");
    }
  }

  async deleteStandard(standardId) {
    if (!standardId || !standardId.startsWith('custom_')) { alert("Cannot delete this standard."); return; }
    if (!confirm("Delete this custom standard?")) return;
    try {
        const res = await fetch(`/api/config/load-cells/${standardId.replace('custom_', '')}`, { method: 'DELETE' });
        if (res.ok) { alert("Standard deleted."); await this.initLoadCellSelector(); }
    } catch (e) { console.error(e); }
  }

  async initLoadCellSelector() {
    try {
      const res = await fetch('/api/config/load-cells'); this.loadCells = await res.json();
      const sel = document.getElementById('lc-selector'); sel.innerHTML = '<option value="">-- Select Standard --</option>';
      const sys = this.loadCells.filter(lc => lc.is_system), cst = this.loadCells.filter(lc => !lc.is_system);
      const addGrp = (lbl, arr) => {
        if (arr.length === 0) return;
        const g = document.createElement('optgroup'); g.label = lbl;
        arr.forEach(lc => { const o = document.createElement('option'); o.value = lc.id; o.textContent = `${lc.model} (${lc.capacity})`; g.appendChild(o); });
        sel.appendChild(g);
      };
      addGrp("System Standards", sys); addGrp("User Defined Standards", cst);
      sel.onchange = (e) => {
        const s = this.loadCells.find(lc => lc.id == e.target.value);
        if (s) {
          ['t4-a', 'set-coeff-a'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = s.coeff_a; });
          ['t4-b', 'set-coeff-b'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = s.coeff_b; });
          ['t4-c', 'set-coeff-c'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = s.coeff_c; });
          ['t4-u', 'set-ref-unc'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = s.uncertainty; });
          const map = { 't4-model': s.model, 't4-cap': s.capacity, 't4-sn': s.sn, 't4-cert': s.cert_no, 't4-date': s.cal_date };
          Object.entries(map).forEach(([id, val]) => { if(document.getElementById(id)) document.getElementById(id).value = val || ''; });
          alert(`Standard loaded: ${s.model}`); this.renderLogger(); 
        }
      };
    } catch (e) { console.error(e); }
  }

  async checkHardwareStatus() {
    try {
      const res = await fetch('/api/hardware/status');
      const status = await res.json();
      this.connectionState = status.connectionState;
      const el = document.getElementById('conn-status');
      if (el) {
          if (status.connected) {
              el.textContent = 'Connected';
              el.style.color = '#10b981';
          } else {
              el.textContent = status.connectionState === 'standby' ? 'Standby' : 'Disconnected';
              el.style.color = '#ef4444';
          }
      }
      this.enforceUIState();
    } catch (err) {
      console.error(err);
    }
  }

  async triggerConnection() {
    await this.syncProjectData();
    document.getElementById('conn-status').textContent = 'Connecting...';
    const ip = document.getElementById('main-ip')?.value || '192.168.1.100', port = document.getElementById('main-port')?.value || '1234', ch = document.getElementById('set-channel')?.value || '1';
    try {
      await fetch('/api/hardware/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tcp: { ip, port }, channel: ch }) });
      await fetch('/api/settings/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connection: { tcp: { ip, port } }, channel: ch }) });
    } catch (err) { console.error(err); }
    this.checkHardwareStatus();
  }

  async setHardwareMode(mode) {
    try { await fetch('/api/hardware/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) }); this.checkHardwareStatus(); }
    catch (err) { console.error(err); }
  }

  async startPolling() {
    this.isPolling = true; document.getElementById('btn-start-polling').disabled = true; document.getElementById('btn-stop-polling').disabled = false;
    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/hardware/read?channel=1&type=24'); const d = await res.json();
        const def = d.raw_deflection || 0; this.currentReadings.push({ timestamp: new Date(), raw_mvv: def });
        if (this.currentReadings.length > 50) this.currentReadings.shift();
        document.getElementById('reading-mvv').textContent = def.toFixed(5);
        const a = parseFloat(document.getElementById('t4-a')?.value || 1), b = parseFloat(document.getElementById('t4-b')?.value || 0), c = parseFloat(document.getElementById('t4-c')?.value || 0);
        const f = (a * def) + (b * Math.pow(def, 2)) + (c * Math.pow(def, 3));
        const val = f / this.unitConstants[this.currentUnit];
        if (document.getElementById('reading-kgf')) document.getElementById('reading-kgf').textContent = val.toFixed(2);   
        this.updateChart(def);
      } catch (err) { console.error(err); }
    }, 150);
  }

  stopPolling() { this.isPolling = false; clearInterval(this.pollInterval); document.getElementById('btn-start-polling').disabled = false; document.getElementById('btn-stop-polling').disabled = true; document.getElementById('reading-mvv').textContent = '0.00000'; if (document.getElementById('reading-kgf')) document.getElementById('reading-kgf').textContent = '0.00'; this.updateChart(0); }

  async createProject() {
    const d = document.getElementById('np-date').value, m = document.getElementById('np-mode').value, n = document.getElementById('np-name').value, c = document.getElementById('np-capacity').value, i = document.getElementById('np-item').value, r = document.getElementById('np-range').value, lm = document.getElementById('np-lc-make')?.value || '', ls = document.getElementById('np-lc-sn')?.value || '', im = document.getElementById('np-ind-make')?.value || '', is = document.getElementById('np-ind-sn')?.value || '', inc = document.getElementById('np-increment').value, res = document.getElementById('np-resolution').value;
    const clientName = document.getElementById('np-client-name').value;
    const clientAddress = document.getElementById('np-client-address').value;

    if (!n || !c) { alert("Ref. No. and Capacity required."); return; }
    try {
      await fetch('/api/calibration/projects', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          project_name: n, 
          client_name: clientName,
          client_address: clientAddress,
          calibration_date: d, 
          mode: m, 
          capacity_kgf: parseFloat(c) || 0,
          capacity_text: c,
          instrument_name: i, 
          range_text: r, 
          lc_make: lm, 
          lc_sn: ls, 
          ind_make: im, 
          ind_sn: is, 
          increment: inc, 
          serial_number: ls, 
          resolution: res,
          output_unit: this.currentUnit,
          standard_id: document.getElementById('lc-selector')?.value || ''
        }) 
      });
      document.getElementById('modal-new-project').style.display = 'none'; await this.loadProjects(); alert("Project created.");
    } catch (err) { console.error(err); }
  }

  updateChart(v) {
    if (!this.chart) return;
    const now = new Date(), t = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    this.chart.data.labels.push(t); this.chart.data.datasets[0].data.push(v);
    if (this.chart.data.labels.length > 50) { this.chart.data.labels.shift(); this.chart.data.datasets[0].data.shift(); }
    this.chart.update();
  }

  async saveToHistory(manual = false, saveAs = false) {
    if (manual && !confirm(saveAs ? "Save as a new project?" : "Update the current project?")) return;
    if (saveAs) { this.currentProject = null; }

    const projectSynced = await this.syncProjectData();
    if (!projectSynced) {
        if (manual) alert("Failed to save project metadata. Please ensure Ref. No. and Capacity are filled.");
        return;
    }

    const pointsSynced = await this.syncPointsData();
    if (!pointsSynced) {
        if (manual) alert("Failed to save measurement data.");
        return;
    }

    try {
      const res = await fetch(`/api/calibration/projects/${this.currentProject.id}/save`, { method: 'PUT' });
      if (res.ok) { 
        if (manual) alert(saveAs ? "Saved as new project!" : "Project updated!"); 
        this.loadHistory(); 
      } else {
        if (manual) alert("Failed to finalize save. Please try again.");
      }
    } catch (err) { 
        console.error(err); 
        if (manual) alert("An error occurred while saving.");
    }
  }

  async syncProjectData() {
    const d = document.getElementById('t1-date')?.value, m = document.getElementById('t1-mode')?.value, n = document.getElementById('t1-ref-no')?.value, c = document.getElementById('t1-capacity')?.value, i = document.getElementById('t1-item')?.value, r = document.getElementById('t1-range')?.value, inc = document.getElementById('t1-increment')?.value, res = document.getElementById('t1-resolution')?.value, lm = document.getElementById('t1-lc-make')?.value, ls = document.getElementById('t1-lc-sn')?.value, im = document.getElementById('t1-ind-make')?.value, is = document.getElementById('t1-ind-sn')?.value, a = document.getElementById('t4-a')?.value, b = document.getElementById('t4-b')?.value, coeff_c = document.getElementById('t4-c')?.value, u = document.getElementById('t4-u')?.value, rm = document.getElementById('t4-model')?.value, rc = document.getElementById('t4-cap')?.value, rs = document.getElementById('t4-sn')?.value, rcert = document.getElementById('t4-cert')?.value, rd = document.getElementById('t4-date')?.value, tb = document.getElementById('t5-temp-b')?.value, ta = document.getElementById('t5-temp-a')?.value, hb = document.getElementById('t5-hum-b')?.value, ha = document.getElementById('t5-hum-a')?.value;
    const clientName = document.getElementById('t1-client-name')?.value;
    const clientAddress = document.getElementById('t1-client-address')?.value;
    
    if (!n || !c) return false;
    const payload = { 
      project_name: n, 
      client_name: clientName,
      client_address: clientAddress,
      calibration_date: d, 
      mode: m, 
      capacity_kgf: parseFloat(c) || 0, 
      instrument_name: i, 
      range_text: r, 
      lc_make: lm, 
      lc_sn: ls, 
      ind_make: im, 
      ind_sn: is, 
      increment: inc, 
      serial_number: ls, 
      resolution: res, 
      coeff_a: parseFloat(a)||1, 
      coeff_b: parseFloat(b)||0, 
      coeff_c: parseFloat(coeff_c)||0, 
      ref_unc: parseFloat(u)||0.02, 
      ref_model: rm, 
      ref_capacity: rc, 
      ref_sn: rs, 
      ref_cert: rcert, 
      ref_date: rd, 
      temperature_before: parseFloat(tb)||0, 
      temperature_after: parseFloat(ta)||0, 
      humidity_before: parseFloat(hb)||0, 
      humidity_after: parseFloat(ha)||0, 
      output_unit: this.currentUnit 
    };
    try {
      if (this.currentProject) { await fetch(`/api/calibration/projects/${this.currentProject.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); Object.assign(this.currentProject, payload); }
      else { const res = await fetch('/api/calibration/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await res.json(); if(data.project_id) this.currentProject = { id: data.project_id, ...payload }; }
      return true;
    } catch(e) { console.error(e); return false; }
  }

  async syncPointsData() {
    if (!this.currentProject) return false;
    const pts = [];
    this.loggerData.preloading.forEach((r, i) => pts.push({ stage: 'Pre-loading', target: r.target || 0, m1: r.runs[0].m, m2: r.runs[1].m, m3: r.runs[2].m, s1: r.runs[0].r, s2: r.runs[1].r, s3: r.runs[2].r, idx: i }));
    this.loggerData.measured.forEach((r, i) => pts.push({ stage: 'Measured', target: r.target, m1: r.runs[0].m, m2: r.runs[1].m, m3: r.runs[2].m, s1: r.runs[0].r, s2: r.runs[1].r, s3: r.runs[2].r, idx: i }));
    try { 
        const res = await fetch('/api/calibration/test-points/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: this.currentProject.id, points: pts }) }); 
        return res.ok;
    } catch (e) { console.error(e); return false; }
  }

  async loadHistory(filter = '', archived = false) {
    try {
      const res = await fetch(`/api/calibration/history?archived=${archived}`); let projects = await res.json();
      const grid = document.getElementById(archived ? 'archive-grid' : 'history-grid'); if (!grid) return;
      if (filter) { const f = filter.toLowerCase(); projects = projects.filter(p => (p.project_name || '').toLowerCase().includes(f) || (p.serial_number || '').toLowerCase().includes(f)); }
      if (projects.length === 0) { grid.innerHTML = '<p>No records found.</p>'; return; }
      window.appContext = this;
      grid.innerHTML = projects.map(p => `<button style="display:flex; flex-direction:column; padding: 15px; border: 1px solid #ccc; border-radius: 8px; background: #fff; text-align: left; cursor: pointer;" onclick="window.appContext.viewHistoryProject(${p.id})"><strong style="font-size: 1.1em; color: #001D53; margin-bottom: 5px;">${p.project_name}</strong><span style="font-size: 0.85em; color: #555;">Date: ${new Date(p.updated_at).toLocaleString()}</span><span style="font-size: 0.85em; color: #555;">S/N: ${p.serial_number || 'N/A'}</span></button>`).join('');
    } catch (err) { console.error(err); }
  }

  async viewHistoryProject(id) {
    try {
      const res = await fetch(`/api/calibration/process/${id}`); const d = await res.json();
      const p = d.metadata, r = d.results;
      const setTxt = (id, v) => { if(document.getElementById(id)) document.getElementById(id).textContent = v || 'N/A'; };
      setTxt('hist-t1-date', p.calibration_date ? new Date(p.calibration_date).toLocaleDateString() : 'N/A');
      setTxt('hist-client-name', p.client_name); setTxt('hist-client-address', p.client_address);
      setTxt('hist-t1-mode', p.mode); setTxt('hist-t1-ref-no', p.project_name); setTxt('hist-t1-capacity', (p.capacity_kgf || '0') + ' kgf');
      setTxt('hist-t1-item', p.instrument_name); setTxt('hist-t1-range', p.range_text); setTxt('hist-t1-lc-make', p.lc_make); setTxt('hist-t1-lc-sn', p.lc_sn); setTxt('hist-t1-ind-make', p.ind_make); setTxt('hist-t1-ind-sn', p.ind_sn); setTxt('hist-t1-increment', p.increment); setTxt('hist-t1-resolution', p.resolution || '0.01');
      setTxt('hist-t5-temp-b', p.temperature_before); setTxt('hist-t5-temp-a', p.temperature_after); setTxt('hist-t5-hum-b', p.humidity_before); setTxt('hist-t5-hum-a', p.humidity_after);
      setTxt('hist-t4-model', p.ref_model); setTxt('hist-t4-cap', p.ref_capacity); setTxt('hist-t4-sn', p.ref_sn); setTxt('hist-t4-cert', p.ref_cert); setTxt('hist-t4-date', p.ref_date); setTxt('hist-t4-u', p.ref_unc); setTxt('hist-t4-a', p.coeff_a); setTxt('hist-t4-b', p.coeff_b); setTxt('hist-t4-c', p.coeff_c);
      const pg = {}; d.preloading.forEach(x => { if(!pg[x.measurement_sequence]) pg[x.measurement_sequence] = { target: x.target_value_kgf || 0, runs: [{m:0,r:0},{m:0,r:0},{m:0,r:0}] }; pg[x.measurement_sequence].runs[x.series_number-1] = { m: x.machine_indicated_kgf ?? 0, r: x.raw_reading_mvv || 0 }; });
      this.currentHistoricalData = { 
        id: id,
        is_archived: p.is_archived === 1, 
        preloading: Object.keys(pg).sort((a,b)=>a-b).map(k=>pg[k]), 
        measured: r.map((x,i) => {
          const u = p.output_unit || 'kgf', s = this.unitConstants[u] || 0.00980665;
          const runs = [{ m: x.series1_m ?? x.targetForceKgf, r: x.series1_mvv || 0 }, { m: x.series2_m ?? x.targetForceKgf, r: x.series2_mvv || 0 }, { m: x.series3_m ?? x.targetForceKgf, r: x.series3_mvv || 0 }];
          const am = runs.map(z=>z.m).filter(z=>z!==0), ar = runs.map(z=>z.r).filter(z=>z!==0);
          return { point: i, target: x.targetForceKgf || 0, runs, meanIndicatedForce: am.length?am.reduce((a,b)=>a+b)/am.length:0, meanRawDeflection: ar.length?ar.reduce((a,b)=>a+b)/ar.length:0, mean: x.meanNetDeflection || 0, meanForce: (x.meanForceKn || 0) / s, netValues: x.netValues || [0,0,0], runForcesKn: x.runForcesKn || [0,0,0], uncertainty: x.expandedUncertaintyPercent || 0, class: x.classification || 'N/A' };
      })};
      this.calculateFullSuite('hist-'); this.renderReplicaTables('hist-');
      document.getElementById('modal-history-list').style.display = 'none'; document.getElementById('modal-archive-list').style.display = 'none'; document.getElementById('modal-history-view').style.display = 'flex';
      document.getElementById('history-view-title').textContent = this.currentHistoricalData.is_archived ? 'Archived Data' : 'Historical Data';
      document.getElementById('btn-hist-archive').style.display = this.currentHistoricalData.is_archived ? 'none' : 'inline-block';
      document.getElementById('btn-hist-unarchive').style.display = this.currentHistoricalData.is_archived ? 'inline-block' : 'none';
      document.getElementById('btn-hist-excel').style.display = this.currentHistoricalData.is_archived ? 'none' : 'inline-block';
      document.getElementById('btn-hist-print').style.display = this.currentHistoricalData.is_archived ? 'none' : 'inline-block';
      if (document.getElementById('btn-hist-load-demo')) document.getElementById('btn-hist-load-demo').style.display = this.currentHistoricalData.is_archived ? 'none' : 'inline-block';
    } catch (err) { console.error(err); }
  }

  async archiveHistoricalRecord() {
    if (!this.currentHistoricalData || !this.currentHistoricalData.id) return;
    if (!confirm("Are you sure you want to archive this record?")) return;
    try {
        const res = await fetch(`/api/calibration/projects/${this.currentHistoricalData.id}/archive`, { method: 'PUT' });
        if (res.ok) { 
            alert("Record archived."); 
            document.getElementById('modal-history-view').style.display = 'none';
            document.getElementById('modal-history-list').style.display = 'flex';
            this.loadHistory(); 
        }
    } catch (e) { console.error(e); }
  }

  async unarchiveHistoricalRecord() {
    if (!this.currentHistoricalData || !this.currentHistoricalData.id) return;
    if (!confirm("Restore this record from archive?")) return;
    try {
        const res = await fetch(`/api/calibration/projects/${this.currentHistoricalData.id}/unarchive`, { method: 'PUT' });
        if (res.ok) { 
            alert("Record restored."); 
            document.getElementById('modal-history-view').style.display = 'none';
            document.getElementById('modal-archive-list').style.display = 'flex';
            this.loadHistory('', true); 
        }
    } catch (e) { console.error(e); }
  }

  loadHistoricalAsDemo() {
    if (!this.currentHistoricalData) return;
    if (!confirm("Load this historical data into the live workspace?")) return;
    this.demoMode = true;
    this.currentProject = null; 
    
    const fetchMetadata = async () => {
        const res = await fetch(`/api/calibration/process/${this.currentHistoricalData.id}`);
        const d = await res.json();
        const p = d.metadata;
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) { el.value = val; el.dispatchEvent(new Event('input')); } };
        setVal('t1-ref-no', p.project_name); setVal('t1-capacity', p.capacity_kgf);
        setVal('t1-item', p.instrument_name); setVal('t1-range', p.range_text);
        setVal('t1-lc-make', p.lc_make); setVal('t1-lc-sn', p.lc_sn);
        setVal('t1-ind-make', p.ind_make); setVal('t1-ind-sn', p.ind_sn);
        setVal('t1-increment', p.increment); setVal('t1-resolution', p.resolution);
        setVal('t1-client-name', p.client_name); setVal('t1-client-address', p.client_address);
        setVal('t4-a', p.coeff_a); setVal('t4-b', p.coeff_b); setVal('t4-c', p.coeff_c); setVal('t4-u', p.ref_unc);
        setVal('t5-temp-b', p.temperature_before); setVal('t5-temp-a', p.temperature_after);
        setVal('t5-hum-b', p.humidity_before); setVal('t5-hum-a', p.humidity_after);
        
        this.loggerData.preloading = this.currentHistoricalData.preloading.map(x => JSON.parse(JSON.stringify(x)));
        this.loggerData.measured = this.currentHistoricalData.measured.map(x => {
            return { point: x.point, target: x.target, runs: JSON.parse(JSON.stringify(x.runs)), mean: x.mean, meanForce: x.meanForce, uncertainty: x.uncertainty, class: x.class };
        });
        document.getElementById('modal-history-view').style.display = 'none';
        this.renderLogger();
        alert("Historical data loaded as demo.");
    };
    fetchMetadata();
  }

  exportHistoricalExcel() {
    if (!this.currentHistoricalData || !this.currentHistoricalData.id) return;
    if (!confirm("Export this record to Excel?")) return;
    window.location.href = `/api/export/excel/${this.currentHistoricalData.id}`;
  }

  async loadProjects() {
    try {
      const res = await fetch('/api/calibration/projects'); const projects = await res.json();
      if (projects.length > 0) {
        this.currentProject = projects[projects.length - 1];
        const setVal = (id, v) => { if(document.getElementById(id)) document.getElementById(id).value = v || ''; };
        setVal('t1-ref-no', this.currentProject.project_name); setVal('t1-item', this.currentProject.instrument_name); 
        setVal('t1-lc-sn', this.currentProject.lc_sn); setVal('t1-ind-sn', this.currentProject.ind_sn); 
        setVal('t1-lc-make', this.currentProject.lc_make); setVal('t1-ind-make', this.currentProject.ind_make); 
        setVal('t1-capacity', this.currentProject.capacity_text || (this.currentProject.capacity_kgf ? this.currentProject.capacity_kgf + ' kgf' : ''));
        setVal('t1-client-name', this.currentProject.client_name); setVal('t1-client-address', this.currentProject.client_address);
        if (document.getElementById('t1-date')) document.getElementById('t1-date').value = this.currentProject.calibration_date ? this.currentProject.calibration_date.split('T')[0] : new Date().toISOString().split('T')[0];
        setVal('t1-mode', this.currentProject.mode || 'Compression'); setVal('t1-range', this.currentProject.range_text); setVal('t1-increment', this.currentProject.increment); setVal('t1-resolution', this.currentProject.resolution);
        
        if (this.currentProject.standard_id) {
           const sel = document.getElementById('lc-selector');
           if (sel) { sel.value = this.currentProject.standard_id; }
        }
        if (this.currentProject.output_unit) {
           this.setSystemUnit(this.currentProject.output_unit);
        } else {
           this.setSystemUnit('kgf');
        }
      }
    } catch (err) { console.error(err); }
  }

  setSystemUnit(unit) {
    this.currentUnit = unit;
    document.querySelectorAll('.unit-btn').forEach(btn => {
      btn.style.background = btn.dataset.unit === unit ? '#001D53' : '#eee';
      btn.style.color = btn.dataset.unit === unit ? 'white' : 'black';
    });
    const label = document.getElementById('reading-unit');
    if (label) label.textContent = unit;
    
    // Dynamically update UI table headers
    document.querySelectorAll('.sys-unit').forEach(el => {
      el.textContent = unit;
    });

    this.renderLogger();
  }

  formatCellValue(val, isTarget = false, isReading = false) {
    if (val === null || val === undefined || val === "") return "";
    return isReading ? parseFloat(val).toFixed(5) : parseFloat(val);
  }

  initChart() {
    const ctx = document.getElementById('chart-readings');
    if (!ctx) return;
    this.chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'mV/V Reading', data: [], borderColor: '#001D53', tension: 0.1, fill: false }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { beginAtZero: false } }, animation: false }
    });
  }

  async syncLoggerToExcel() {
    if (!this.currentProject) { alert("Save project first."); return; }
    if (!confirm("Export to Excel?")) return;
    await this.saveToHistory();
    window.location.href = `/api/export/excel/${this.currentProject.id}`;
  }

  addTestPoint(tableType) {
    const newPoint = { target: 0, runs: [{ m: null, r: null }, { m: null, r: null }, { m: null, r: null }] };
    if (tableType === 'measured') {
      newPoint.point = this.loggerData.measured.length;
      newPoint.mean = 0; newPoint.meanForce = 0; newPoint.uncertainty = 0; newPoint.class = 'N/A';
      this.loggerData.measured.push(newPoint);
    } else {
      const lastIndex = this.loggerData.preloading.length - 1;
      this.loggerData.preloading.splice(lastIndex, 0, newPoint);
    }
    this.renderLogger();
  }

  deleteTestPoint(tableType) {
    if (tableType === 'measured') {
      if (this.loggerData.measured.length <= 1) { alert("Cannot delete base point."); return; }
      const maxIdx = this.loggerData.measured.length - 1;
      const idxStr = prompt(`Enter test point index (1 to ${maxIdx}):`);
      if (!idxStr) return;
      const idx = parseInt(idxStr, 10);
      if (isNaN(idx) || idx < 1 || idx > maxIdx) { alert("Invalid index."); return; }
      this.loggerData.measured.splice(idx, 1);
      this.loggerData.measured.forEach((p, i) => { p.point = i; });
    } else {
      if (this.loggerData.preloading.length <= 2) { alert("Cannot delete base points."); return; }
      const lastIndex = this.loggerData.preloading.length - 1;
      const idxStr = prompt(`Enter test point index (1 to ${lastIndex - 1}):`);
      if (!idxStr) return;
      const idx = parseInt(idxStr, 10);
      if (isNaN(idx) || idx < 1 || idx >= lastIndex) { alert("Invalid index."); return; }
      this.loggerData.preloading.splice(idx, 1);
    }
    this.renderLogger();
  }

  renderLogger() { this.renderReplicaTables(''); }

  renderReplicaTables(prefix = '') {
    if (prefix === '') this.calculateFullSuite();
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    if (!data) return;
    const targetConst = this.unitConstants[this.currentUnit];

    const t2Body = document.getElementById(`${prefix}t2-body`);
    if (t2Body) {
      t2Body.innerHTML = data.preloading.map((row, idx) => {
        const getCls = (v) => v === "" ? 'l-cell-t2 placeholder-dull' : 'l-cell-t2';
        const v1m = this.formatCellValue(row.runs[0].m); const v1r = this.formatCellValue(row.runs[0].r, false, true);
        const v2m = this.formatCellValue(row.runs[1].m); const v2r = this.formatCellValue(row.runs[1].r, false, true);
        const v3m = this.formatCellValue(row.runs[2].m); const v3r = this.formatCellValue(row.runs[2].r, false, true);
        const rowLabel = idx === 0 ? '0.0' : (idx === data.preloading.length - 1 ? 'Max Cap' : idx + (idx === 1 ? 'st' : idx === 2 ? 'nd' : idx === 3 ? 'rd' : 'th'));
        return `<tr><td>${rowLabel}</td><td class="selectable" data-tab="2" data-row="${idx}" data-run="1" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v1m)}" value="${v1m}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="m"></td><td class="selectable" data-tab="2" data-row="${idx}" data-run="1" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v1r)}" value="${v1r}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="r"></td><td class="selectable" data-tab="2" data-row="${idx}" data-run="2" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v2m)}" value="${v2m}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="m"></td><td class="selectable" data-tab="2" data-row="${idx}" data-run="2" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v2r)}" value="${v2r}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="r"></td><td class="selectable" data-tab="2" data-row="${idx}" data-run="3" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v3m)}" value="${v3m}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="m"></td><td class="selectable" data-tab="2" data-row="${idx}" data-run="3" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v3r)}" value="${v3r}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="r"></td></tr>`;
      }).join('');
    }

    const t3Body = document.getElementById(`${prefix}t3-body`);
    if (t3Body) {
      t3Body.innerHTML = data.measured.map((row, idx) => {
        const getCls = (v) => v === "" ? 'l-cell-t3 placeholder-dull' : 'l-cell-t3';
        const vt = this.formatCellValue(row.target, true);
        const v1m = this.formatCellValue(row.runs[0].m); const v1r = this.formatCellValue(row.runs[0].r, false, true);
        const v2m = this.formatCellValue(row.runs[1].m); const v2r = this.formatCellValue(row.runs[1].r, false, true);
        const v3m = this.formatCellValue(row.runs[2].m); const v3r = this.formatCellValue(row.runs[2].r, false, true);
        return `<tr><td>${idx === 0 ? '0.0' : idx + (idx === 1 ? 'st' : idx === 2 ? 'nd' : idx === 3 ? 'rd' : 'th')}</td><td><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${vt === "" ? 'l-t placeholder-dull' : 'l-t'}" data-idx="${idx}" value="${vt}" placeholder="- -"></td><td class="selectable" data-tab="3" data-idx="${idx}" data-run="1" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v1m)}" value="${v1m}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="m"></td><td class="selectable" data-tab="3" data-idx="${idx}" data-run="1" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v1r)}" value="${v1r}" placeholder="- -" data-idx="${idx}" data-run="1" data-type="r"></td><td class="selectable" data-tab="3" data-idx="${idx}" data-run="2" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v2m)}" value="${v2m}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="m"></td><td class="selectable" data-tab="3" data-idx="${idx}" data-run="2" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v2r)}" value="${v2r}" placeholder="- -" data-idx="${idx}" data-run="2" data-type="r"></td><td class="selectable" data-tab="3" data-idx="${idx}" data-run="3" data-type="m"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v3m)}" value="${v3m}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="m"></td><td class="selectable" data-tab="3" data-idx="${idx}" data-run="3" data-type="r"><input type="text" ${prefix !== '' ? 'disabled' : ''} class="${getCls(v3r)}" value="${v3r}" placeholder="- -" data-idx="${idx}" data-run="3" data-type="r"></td><td class="calculated" id="${prefix}t3-meanforce-${idx}">${row.meanIndicatedForce ? row.meanIndicatedForce.toFixed(2) : '- -'}</td><td class="calculated" id="${prefix}t3-meandef-${idx}">${row.meanRawDeflection ? row.meanRawDeflection.toFixed(5) : '- -'}</td></tr>`;
      }).join('');
    }

    this.renderTable6(prefix); this.renderTable7(prefix); this.renderTable8(prefix); this.renderTable9(prefix);

    if (prefix === '') {
      document.querySelectorAll('.l-cell-t2, .l-cell-t3, .l-t, .env-input').forEach(el => {
        el.oninput = (e) => {
          const valStr = e.target.value.trim(); let val = (valStr !== "- -" && valStr !== "") ? parseFloat(valStr) : null;
          if (el.classList.contains('l-t')) { this.loggerData.measured[e.target.dataset.idx].target = val; this.calculateFullSuite(); }
          else if (el.classList.contains('env-input')) { this.calculateFullSuite(); }
          else {
              const { idx, row, run, type, tab } = e.target.parentElement.dataset;
              if (tab === "2") { this.loggerData.preloading[row].runs[run-1][type] = val; this.calculateFullSuite(); this.loggerData.measured.forEach((_, i) => this.updateRowUI(i)); }
              else if (tab === "3") { this.loggerData.measured[idx].runs[run-1][type] = val; this.calculateFullSuite(); this.updateRowUI(idx); }
          }
        };
        el.onfocus = () => { if (this.selectedCell) this.selectedCell.classList.remove('selected-cell'); this.selectedCell = el.parentElement; this.selectedCell.classList.add('selected-cell'); };
      });
    }
  }

  updateRowUI(idx) {
    const row = this.loggerData.measured[idx];
    const forceEl = document.getElementById(`t3-meanforce-${idx}`);
    const defEl = document.getElementById(`t3-meandef-${idx}`);
    if (forceEl) forceEl.textContent = (row.meanIndicatedForce || 0).toFixed(2);
    if (defEl) defEl.textContent = (row.meanRawDeflection || 0).toFixed(5);
  }

  calculateFullSuite(prefix = '') {
    let a, b, c, targetConst;
    if (prefix === '') { a = parseFloat(document.getElementById('t4-a')?.value || 1); b = parseFloat(document.getElementById('t4-b')?.value || 0); c = parseFloat(document.getElementById('t4-c')?.value || 0); }
    else { a = parseFloat(document.getElementById('hist-t4-a')?.textContent || 1); b = parseFloat(document.getElementById('hist-t4-b')?.textContent || 0); c = parseFloat(document.getElementById('hist-t4-c')?.textContent || 0); }
    targetConst = this.unitConstants[this.currentUnit];
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    if (!data) return;
    const z1 = data.measured[0].runs[0].r, z2 = data.measured[0].runs[1].r, z3 = data.measured[0].runs[2].r;
    data.measured.forEach((row, idx) => {
      const activeMs = row.runs.map(r => r.m).filter(m => m !== null), activeRs = row.runs.map(r => r.r).filter(r => r !== null);
      row.meanIndicatedForce = activeMs.length > 0 ? activeMs.reduce((acc, v) => acc + v, 0) / activeMs.length : null;
      row.meanRawDeflection = activeRs.length > 0 ? activeRs.reduce((acc, v) => acc + v, 0) / activeRs.length : null;
      const n1 = (row.runs[0].r !== null && z1 !== null) ? row.runs[0].r - z1 : null;
      const n2 = (row.runs[1].r !== null && z2 !== null) ? row.runs[1].r - z2 : null;
      const n3 = (row.runs[2].r !== null && z3 !== null) ? row.runs[2].r - z3 : null;
      row.netValues = [n1, n2, n3]; row.mean = row.netValues.filter(v => v !== null).reduce((a, b, i, arr) => a + (b || 0) / (arr.length || 1), 0);
      const i1 = (row.target === 0 && n1 !== null) ? 0 : ((row.runs[0].m && n1 !== null) ? (n1 / row.runs[0].m) * row.target : null);
      const i2 = (row.target === 0 && n2 !== null) ? 0 : ((row.runs[1].m && n2 !== null) ? (n2 / row.runs[1].m) * row.target : null);
      const i3 = (row.target === 0 && n3 !== null) ? 0 : ((row.runs[2].m && n3 !== null) ? (n3 / row.runs[2].m) * row.target : null);
      row.interpolatedValues = [i1, i2, i3]; row.meanInterpolated = row.interpolatedValues.filter(v => v !== null).reduce((a, b, i, arr) => a + (b || 0) / (arr.length || 1), 0);
      row.runForcesKn = row.interpolatedValues.map(i => i !== null ? (a * i) + (b * Math.pow(i, 2)) + (c * Math.pow(i, 3)) : null);
      row.meanForceKn = row.runForcesKn.filter(f => f !== null).reduce((a, b, i, arr) => a + (b || 0) / (arr.length || 1), 0);
      row.meanForce = row.meanForceKn !== null ? row.meanForceKn / targetConst : null;
    });
    this.renderTable6(prefix); this.renderTable7(prefix); this.renderTable8(prefix); this.renderTable9(prefix);
  }

  renderTable6(prefix = '') {
    const body = document.getElementById(`${prefix}t6-body`); if (!body) return;
    const targetConst = this.unitConstants[this.currentUnit];
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    const activeRows = data.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    body.innerHTML = activeRows.map((row) => {
      const nets = row.netValues || [null,null,null];
      const m1 = row.runs[0].m !== null ? (row.runs[0].m * targetConst).toFixed(4) : '';
      const m2 = row.runs[1].m !== null ? (row.runs[1].m * targetConst).toFixed(4) : '';
      const m3 = row.runs[2].m !== null ? (row.runs[2].m * targetConst).toFixed(4) : '';
      return `<tr><td>${row.point}</td><td class="calculated">${nets[0] !== null ? m1 : ''}</td><td class="calculated">${nets[0] !== null ? nets[0].toFixed(5) : ''}</td><td class="calculated">${nets[1] !== null ? m2 : ''}</td><td class="calculated">${nets[1] !== null ? nets[1].toFixed(5) : ''}</td><td class="calculated">${nets[2] !== null ? m3 : ''}</td><td class="calculated">${nets[2] !== null ? nets[2].toFixed(5) : ''}</td><td class="calculated">${row.meanForceKn ? (row.meanForceKn).toFixed(4) : ''}</td><td class="calculated">${row.mean ? row.mean.toFixed(5) : ''}</td></tr>`;
    }).join('');
  }

  renderTable7(prefix = '') {
    const body = document.getElementById(`${prefix}t7-body`); if (!body) return;
    const targetConst = this.unitConstants[this.currentUnit];
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    const activeRows = data.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    body.innerHTML = activeRows.map((row) => {
      const targetKn = (row.target || 0) * targetConst; const interps = row.interpolatedValues || [null,null,null];
      return `<tr><td class="calculated">${targetKn.toFixed(4)}</td><td class="calculated">${interps[0] !== null ? interps[0].toFixed(5) : ''}</td><td class="calculated">${interps[1] !== null ? interps[1].toFixed(5) : ''}</td><td class="calculated">${interps[2] !== null ? interps[2].toFixed(5) : ''}</td><td class="calculated">${row.meanInterpolated ? row.meanInterpolated.toFixed(5) : ''}</td></tr>`;
    }).join('');
  }

  renderTable8(prefix = '') {
    const body = document.getElementById(`${prefix}t8-body`); if (!body) return;
    const targetConst = this.unitConstants[this.currentUnit];
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    const activeRows = data.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    body.innerHTML = activeRows.map((row) => {
      const targetKn = (row.target || 0) * targetConst; const fKn = row.runForcesKn || [null,null,null];
      return `<tr><td class="calculated">${targetKn.toFixed(4)}</td><td class="calculated">${fKn[0] !== null ? fKn[0].toFixed(5) : ''}</td><td class="calculated">${fKn[1] !== null ? fKn[1].toFixed(5) : ''}</td><td class="calculated">${fKn[2] !== null ? fKn[2].toFixed(5) : ''}</td><td class="calculated">${row.meanForceKn ? row.meanForceKn.toFixed(5) : ''}</td></tr>`;
    }).join('');
  }

  renderTable9(prefix = '') {
    const body = document.getElementById(`${prefix}t9-body`); if (!body) return;
    let refU, res, drift;
    if (prefix === '') { refU = parseFloat(document.getElementById('t4-u')?.value || 0.02); res = parseFloat(document.getElementById('t1-resolution')?.value || 0.01); drift = parseFloat(document.getElementById('t4-drift')?.value || 0.05); }
    else { refU = parseFloat(document.getElementById('hist-t4-u')?.textContent || 0.02); res = parseFloat(document.getElementById('hist-t1-resolution')?.textContent || 0.01); drift = parseFloat(document.getElementById('hist-t4-drift')?.textContent || 0.05); }
    const targetConst = this.unitConstants[this.currentUnit];
    const data = prefix === '' ? this.loggerData : this.currentHistoricalData;
    const activeRows = data.measured.filter((row, idx) => idx === 0 || (row.target !== 0 && row.target !== "- -" && row.target !== ""));
    const lastActive = activeRows[activeRows.length - 1]; const maxCapKn = lastActive ? Math.abs((lastActive.target || 0) * targetConst) : 1e-9;
    const returnZero = data.measured[data.measured.length - 1]; const resInd = (returnZero && returnZero.target === 0) ? (returnZero.meanIndicatedForce || 0) : 0;

    body.innerHTML = activeRows.map((row) => {
      let w_rep = null, w_res = null, w_std = null;
      let w_comb = null, W_exp = null, accu_q = null, rep_b = null, zero_f0 = null, className = '';
      
      const hasData = row.meanInterpolated !== null && row.meanForceKn !== null;

      if (hasData) {
        // Base standard uncertainty components
        w_std = Math.sqrt(Math.pow(refU / 2, 2) + Math.pow(drift / Math.sqrt(3), 2));
        
        // Division by Zero Guard (for relative uncertainties)
        const meanKn = Math.abs(row.meanForceKn);
        if (meanKn > 1e-9) {
            const activeF = (row.runForcesKn || []).filter(f => f !== null); 
            const resKn = (res || 0) * targetConst; 
            const sd = this.stdev(activeF);
            
            w_rep = ((sd / Math.sqrt(activeF.length)) / meanKn) * 100; 
            w_res = (resKn / (meanKn * 2 * Math.sqrt(3))) * 100;
            w_comb = Math.sqrt(Math.pow(w_rep, 2) + Math.pow(w_res, 2) + Math.pow(w_std, 2)); 
            W_exp = w_comb * 2; 
            
            // Limit extreme values to prevent UI overflow
            W_exp = Math.min(W_exp, 999.999);
            w_rep = Math.min(w_rep, 999.999);
            w_res = Math.min(w_res, 999.999);
            w_comb = Math.min(w_comb, 999.999);

            accu_q = (((row.target * targetConst) - row.meanForceKn) / meanKn) * 100;
            rep_b = activeF.length > 1 ? ((Math.max(...activeF) - Math.min(...activeF)) / meanKn) * 100 : 0;
            zero_f0 = maxCapKn > 0 ? (Math.abs(resInd * targetConst) / maxCapKn) * 100 : 0;
            
            if (W_exp <= 0.05) className = 'Class 0'; 
            else if (W_exp <= 0.1) className = 'Class 1'; 
            else if (W_exp <= 0.2) className = 'Class 2'; 
            else if (W_exp <= 0.5) className = 'Class 3'; 
            else className = 'Outside Class';
        } else {
            // It's the zero point. Keep uncertainties null but errors can be calculated if needed.
            // But usually ISO 376 doesn't calculate error % for the 0 target point if force is 0.
            className = '';
            zero_f0 = maxCapKn > 0 ? (Math.abs(resInd * targetConst) / maxCapKn) * 100 : 0;
            accu_q = 0;
            rep_b = 0;
        }
      }
      
      const fmt = (v) => v !== null ? v.toFixed(6) : "";
      const fmtExp = (v) => v !== null ? v.toFixed(3) : "";
      const fmtErr = (v) => v !== null ? v.toFixed(2) : "";

      // 0 Target force point specifically shouldn't show relative uncertainties
      const isZero = row.target === 0;
      const displayClass = (!isZero && className === 'Outside Class') ? '' : className;

      return `<tr><td>${row.point}</td><td class="calculated">${!isZero ? fmt(w_rep) : ''}</td><td class="calculated">${!isZero ? fmt(w_res) : ''}</td><td class="calculated">${!isZero ? fmt(w_std) : ''}</td><td class="calculated">${!isZero ? fmt(w_comb) : ''}</td><td class="calculated">${!isZero ? fmtExp(W_exp) : ''}</td><td class="calculated">${!isZero ? fmtErr(accu_q) : ''}</td><td class="calculated">${!isZero ? fmtErr(rep_b) : ''}</td><td class="calculated">${!isZero ? fmtErr(zero_f0) : ''}</td><td class="calculated">${!isZero ? displayClass : ''}</td></tr>`;
    }).join('');
  }

  async captureToSelectedCell() {
    if (!this.selectedCell) { alert("Please select a cell first."); return; }
    const { type, run, idx, row, tab } = this.selectedCell.dataset;
    try {
      const res = await fetch('/api/hardware/read'); const data = await res.json();
      if (tab === "2") this.loggerData.preloading[row].runs[run-1][type] = data.raw_deflection || 0;
      else if (tab === "3") this.loggerData.measured[idx].runs[run-1][type] = data.raw_deflection || 0;
      this.renderReplicaTables();
    } catch (e) { alert("Capture failed."); }
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new DMP41CalibrationApp(); });
