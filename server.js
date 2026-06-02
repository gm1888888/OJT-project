require('dotenv').config();
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const DMP41Interface = require('./services/dmp41_interface');
const CalibrationEngine = require('./services/calibration_engine');
const ExcelEngine = require('./services/excel_engine');

const app = express();
const PORT = process.env.PORT || 3000;
const SETTINGS_FILE = path.join(__dirname, 'config', 'dmp41_settings.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize services
const dmp41 = new DMP41Interface(process.env.DMP41_HOST, process.env.DMP41_PORT);

// Load saved settings if they exist to initialize DMP41 connection configuration
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    const savedSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (savedSettings.connection && savedSettings.connection.tcp) {
      dmp41.host = savedSettings.connection.tcp.ip || dmp41.host;
      dmp41.port = savedSettings.connection.tcp.port || dmp41.port;
    }
    if (savedSettings.channel) {
      dmp41.currentChannel = parseInt(savedSettings.channel);
    }
  } catch (err) {
    console.error('Failed to load initial dmp41 settings:', err);
  }
}

const calibEngine = new CalibrationEngine();

// Database setup using built-in node:sqlite
const db = new DatabaseSync(process.env.DB_PATH || './calibration_data.db');
console.log('Connected to the built-in SQLite database.');
initDatabase();

function initDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS calibration_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_name TEXT NOT NULL,
    client_name TEXT,
    client_address TEXT,
    instrument_name TEXT,
    serial_number TEXT,
    capacity_kgf REAL,
    range_min_kgf REAL,
    range_max_kgf REAL,
    input_unit TEXT DEFAULT 'kgf',
    output_unit TEXT DEFAULT 'kN',
    calibration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    mode TEXT DEFAULT 'Compression',
    status TEXT DEFAULT 'In Progress',
    temperature_before REAL,
    temperature_after REAL,
    humidity_before REAL,
    humidity_after REAL,
    coeff_a REAL,
    coeff_b REAL,
    coeff_c REAL,
    ref_unc REAL,
    resolution REAL,
    zero_return_mvv REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS test_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    stage_name TEXT,
    target_value_kgf REAL,
    measurement_sequence INTEGER,
    angular_position TEXT,
    raw_reading_mvv REAL,
    zero_corrected_mvv REAL,
    equivalent_force_kn REAL,
    machine_indicated_kgf REAL,
    series_number INTEGER DEFAULT 1,
    is_zero_return BOOLEAN DEFAULT 0,
    reading_timestamp DATETIME,
    is_valid BOOLEAN DEFAULT 1,
    notes TEXT,
    FOREIGN KEY (project_id) REFERENCES calibration_projects(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS transducer_coefficients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    load_cell_model TEXT,
    load_cell_sn TEXT,
    capacity_kn REAL,
    calibration_cert_no TEXT,
    calibration_date DATE,
    coefficient_a REAL,
    coefficient_b REAL,
    coefficient_c REAL,
    uncertainty_percent REAL,
    coverage_factor REAL DEFAULT 2,
    compression_mode BOOLEAN DEFAULT 1,
    tension_mode BOOLEAN DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES calibration_projects(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS calibration_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    measurement_point INTEGER,
    target_force_kgf REAL,
    series1_reading_kn REAL,
    series2_reading_kn REAL,
    series3_reading_kn REAL,
    mean_force_kn REAL,
    repeatability_kn REAL,
    resolution_uncertainty_kn REAL,
    tare_uncertainty_kn REAL,
    temperature_uncertainty_kn REAL,
    drift_uncertainty_kn REAL,
    combined_uncertainty_kn REAL,
    expanded_uncertainty_kn REAL,
    relative_uncertainty_percent REAL,
    relative_error_percent REAL,
    accuracy_error_percent REAL,
    repeatability_error_percent REAL,
    classification TEXT,
    FOREIGN KEY (project_id) REFERENCES calibration_projects(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS environmental_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    temperature_celsius REAL,
    humidity_percent REAL,
    pressure_pa REAL,
    notes TEXT,
    FOREIGN KEY (project_id) REFERENCES calibration_projects(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS load_cells_reference (
    id INTEGER PRIMARY KEY,
    model TEXT UNIQUE,
    description TEXT,
    capacity_kn REAL,
    serial_number TEXT,
    calibration_certificate TEXT,
    calibration_date DATE,
    coeff_a_compression REAL,
    coeff_b_compression REAL,
    coeff_c_compression REAL,
    uncertainty_compression_percent REAL,
    coeff_a_tension REAL,
    coeff_b_tension REAL,
    coeff_c_tension REAL,
    uncertainty_tension_percent REAL,
    next_calibration_date DATE
  )`);

  // Migrate existing tables
  try { db.exec("ALTER TABLE test_points ADD COLUMN is_zero_return BOOLEAN DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE test_points ADD COLUMN machine_indicated_kgf REAL"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN make_model TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN increment TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN resolution TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN range_text TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN coeff_a REAL"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN coeff_b REAL"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN coeff_c REAL"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN ref_unc REAL"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN temperature_before REAL"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN temperature_after REAL"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN humidity_before REAL"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN humidity_after REAL"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN output_unit TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN ref_model TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN ref_capacity TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN ref_sn TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN ref_cert TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN ref_date TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN is_archived BOOLEAN DEFAULT 0"); } catch (e) {}
  
  // Separated Load Cell and Indicator info
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN lc_make TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN lc_sn TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN ind_make TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN ind_sn TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN client_address TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN capacity_text TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN standard_id TEXT"); } catch (e) {}

  // --- SEED DEFAULT RECORD ---
  try {
    const defaultProject = db.prepare("SELECT count(*) as cnt FROM calibration_projects WHERE project_name = '11-2025-FORC-0272(1)'").get();
    if (defaultProject.cnt === 0) {
      const seedPath = path.join(__dirname, 'config', 'seed_data.json');
      if (fs.existsSync(seedPath)) {
        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        const p = seedData.project;
        
        // Insert Project
        const pStmt = db.prepare(`
          INSERT INTO calibration_projects (
            project_name, client_name, instrument_name, serial_number, capacity_kgf, range_min_kgf, range_max_kgf, 
            input_unit, output_unit, calibration_date, mode, status, temperature_before, temperature_after, 
            humidity_before, humidity_after, zero_return_mvv, notes, make_model, increment, resolution, range_text, 
            coeff_a, coeff_b, coeff_c, ref_unc, ref_model, ref_capacity, ref_sn, ref_cert, ref_date, is_archived, 
            lc_make, lc_sn, ind_make, ind_sn, client_address, capacity_text, standard_id
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);
        
        const res = pStmt.run(
          p.project_name, p.client_name, p.instrument_name, p.serial_number, p.capacity_kgf, p.range_min_kgf, p.range_max_kgf, 
          p.input_unit, p.output_unit, p.calibration_date, p.mode, p.status, p.temperature_before, p.temperature_after, 
          p.humidity_before, p.humidity_after, p.zero_return_mvv, p.notes, p.make_model, p.increment, p.resolution, p.range_text, 
          p.coeff_a, p.coeff_b, p.coeff_c, p.ref_unc, p.ref_model, p.ref_capacity, p.ref_sn, p.ref_cert, p.ref_date, p.is_archived, 
          p.lc_make, p.lc_sn, p.ind_make, p.ind_sn, p.client_address, p.capacity_text, p.standard_id
        );
        
        const newProjectId = res.lastInsertRowid;
        
        // Insert Points
        const ptStmt = db.prepare(`
          INSERT INTO test_points (
            project_id, stage_name, measurement_sequence, series_number, target_value_kgf, raw_reading_mvv, machine_indicated_kgf
          ) VALUES (?,?,?,?,?,?,?)
        `);
        
        seedData.points.forEach(pt => {
          ptStmt.run(newProjectId, pt.stage_name, pt.measurement_sequence, pt.series_number, pt.target_value_kgf, pt.raw_reading_mvv, pt.machine_indicated_kgf);
        });
        
        console.log("Seeded default record: 11-2025-FORC-0272(1)");
      }
    }
  } catch (err) {
    console.error("Failed to seed default database records:", err);
  }
}

// ============================================
// HARDWARE ROUTES
// ============================================

app.get('/api/hardware/status', async (req, res) => {
  try {
    res.json({
      connected: dmp41.isConnected,
      connectionState: dmp41.connectionState,
      ip: dmp41.host,
      port: dmp41.port,
      mode: dmp41.demoMode ? 'demo' : 'live',
      channel: dmp41.currentChannel
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message });
  }
});

app.post('/api/hardware/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    const isDemo = mode === 'demo';
    await dmp41.setDemoMode(isDemo);
    res.json({ status: 'success', mode: isDemo ? 'demo' : 'live' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hardware/connect', async (req, res) => {
  try {
    // Dynamically apply settings from the UI payload
    if (req.body && req.body.tcp) {
      dmp41.host = req.body.tcp.ip || dmp41.host;
      dmp41.port = req.body.tcp.port || dmp41.port;
    }
    
    await dmp41.connect();
    res.json({ status: 'success', connected: true });
  } catch (err) {
    // If it fails, it's caught here, but dmp41_interface sets it to standby.
    res.status(500).json({ status: 'failed', error: err.message });
  }
});

app.post('/api/hardware/config', async (req, res) => {
  try {
    const { host, port, channel } = req.body;
    dmp41.host = host;
    dmp41.port = port;
    if (channel) dmp41.currentChannel = parseInt(channel);
    await dmp41.connect();
    res.json({ status: 'success', message: 'Connected to DMP41' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hardware/read', async (req, res) => {
  try {
    if (!dmp41.isConnected) {
      return res.json({ raw_deflection: 0, unit: 'mV/V', tare_mode: 'ERR', status_code: '0' });
    }
    const { channel = 1, type = 24 } = req.query;
    const reading = await dmp41.readMeasurementValue(parseInt(type));
    res.json(reading);
  } catch (err) {
    // If not connected, gracefully return 0 instead of throwing an error 
    // so the live monitor graph goes to 0 as requested by the user.
    res.json({ raw_deflection: 0, unit: 'mV/V', tare_mode: 'ERR', status_code: '0' });
  }
});

app.get('/api/hardware/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendData = async () => {
    try {
      const reading = await dmp41.readMeasurementValue(24);
      
      // Calculate variance manually using readingBuffer if needed, or just send stability state
      let variance = 0;
      if (dmp41.readingBuffer && dmp41.readingBuffer.length >= 2) {
        const mean = dmp41.readingBuffer.reduce((a, b) => a + b) / dmp41.readingBuffer.length;
        variance = dmp41.readingBuffer.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (dmp41.readingBuffer.length - 1);
      }
      
      res.write(`data: ${JSON.stringify({
        timestamp: new Date().toISOString(),
        raw_mvv: reading.raw_deflection,
        variance: variance,
        stable: dmp41.isStable()
      })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  };

  const interval = setInterval(sendData, 1000);
  req.on('close', () => clearInterval(interval));
});

app.get('/api/hardware/is-stable', (req, res) => {
  const threshold = parseFloat(req.query.threshold || 0.000010);
  res.json({ stable: dmp41.isStable(threshold) });
});

app.post('/api/hardware/command', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command is required' });
    }
    
    const sanitizedCmd = command.trim().toUpperCase();
    
    // Validate DMP41 command structure: 3 letters optionally followed by ? and/or alphanumeric parameters
    if (!/^[A-Z]{3}(\?[A-Z0-9.\-]*|[A-Z0-9.\-]*)?$/.test(sanitizedCmd)) {
      return res.status(400).json({ error: 'Invalid command format. DMP41 commands must be 3 letters (e.g., TAR, MSV?, CHS1).' });
    }

    const response = await dmp41.sendCommand(sanitizedCmd);
    res.json({ response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CALIBRATION ROUTES
// ============================================

app.post('/api/calibration/projects', (req, res) => {
  try {
    const { 
      project_name, client_name, client_address, instrument_name, serial_number, capacity_kgf, calibration_date, mode, 
      range_text, make_model, increment, resolution,
      coeff_a, coeff_b, coeff_c, ref_unc,
      temperature_before, temperature_after, humidity_before, humidity_after,
      output_unit, ref_model, ref_capacity, ref_sn, ref_cert, ref_date,
      lc_make, lc_sn, ind_make, ind_sn, capacity_text, standard_id
    } = req.body;

    if (!project_name) {
      return res.status(400).json({ error: 'Project name is required.' });
    }

    const stmt = db.prepare(`
      INSERT INTO calibration_projects 
      (project_name, client_name, client_address, instrument_name, serial_number, capacity_kgf, calibration_date, mode, range_text, make_model, increment, resolution,
       coeff_a, coeff_b, coeff_c, ref_unc,
       temperature_before, temperature_after, humidity_before, humidity_after,
       output_unit, ref_model, ref_capacity, ref_sn, ref_cert, ref_date,
       lc_make, lc_sn, ind_make, ind_sn, capacity_text, standard_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      project_name ?? null, client_name ?? null, client_address ?? null, instrument_name ?? null, serial_number ?? null, capacity_kgf ?? null, calibration_date ?? null, mode ?? 'Compression', 
      range_text ?? null, make_model ?? null, increment ?? null, resolution ?? null,
      coeff_a ?? null, coeff_b ?? null, coeff_c ?? null, ref_unc ?? null,
      temperature_before ?? null, temperature_after ?? null, humidity_before ?? null, humidity_after ?? null,
      output_unit ?? 'kgf', ref_model ?? null, ref_capacity ?? null, ref_sn ?? null, ref_cert ?? null, ref_date ?? null,
      lc_make ?? null, lc_sn ?? null, ind_make ?? null, ind_sn ?? null, capacity_text ?? null, standard_id ?? null
    );
    res.json({ project_id: result.lastInsertRowid, status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calibration/projects', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM calibration_projects WHERE status != \'Saved\'');
    const rows = stmt.all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calibration/history', (req, res) => {
  try {
    const isArchived = req.query.archived === 'true' ? 1 : 0;
    const stmt = db.prepare('SELECT * FROM calibration_projects WHERE status = \'Saved\' AND is_archived = ? ORDER BY updated_at DESC');
    const rows = stmt.all(isArchived);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/calibration/projects/:id/archive', (req, res) => {
  try {
    db.prepare('UPDATE calibration_projects SET is_archived = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/calibration/projects/:id/unarchive', (req, res) => {
  try {
    db.prepare('UPDATE calibration_projects SET is_archived = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/calibration/projects/:id/save', (req, res) => {
  try {
    db.prepare(`UPDATE calibration_projects SET status = 'Saved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/calibration/projects/:id', (req, res) => {
  try {
    const { 
      project_name, client_name, client_address, instrument_name, serial_number, capacity_kgf, calibration_date, mode, 
      range_text, make_model, increment, resolution,
      coeff_a, coeff_b, coeff_c, ref_unc,
      temperature_before, temperature_after, humidity_before, humidity_after,
      output_unit, ref_model, ref_capacity, ref_sn, ref_cert, ref_date,
      lc_make, lc_sn, ind_make, ind_sn, capacity_text, standard_id
    } = req.body;
    db.prepare(`
      UPDATE calibration_projects
      SET project_name = ?, client_name = ?, client_address = ?, instrument_name = ?, serial_number = ?, capacity_kgf = ?, calibration_date = ?, mode = ?, range_text = ?, make_model = ?, increment = ?, resolution = ?,
          coeff_a = ?, coeff_b = ?, coeff_c = ?, ref_unc = ?,
          temperature_before = ?, temperature_after = ?, humidity_before = ?, humidity_after = ?,
          output_unit = ?, ref_model = ?, ref_capacity = ?, ref_sn = ?, ref_cert = ?, ref_date = ?,
          lc_make = ?, lc_sn = ?, ind_make = ?, ind_sn = ?, capacity_text = ?, standard_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      project_name ?? null, client_name ?? null, client_address ?? null, instrument_name ?? null, serial_number ?? null, capacity_kgf ?? null, calibration_date ?? null, mode ?? 'Compression', 
      range_text ?? null, make_model ?? null, increment ?? null, resolution ?? null,
      coeff_a ?? null, coeff_b ?? null, coeff_c ?? null, ref_unc ?? null,
      temperature_before ?? null, temperature_after ?? null, humidity_before ?? null, humidity_after ?? null,
      output_unit ?? 'kgf', ref_model ?? null, ref_capacity ?? null, ref_sn ?? null, ref_cert ?? null, ref_date ?? null,
      lc_make ?? null, lc_sn ?? null, ind_make ?? null, ind_sn ?? null, capacity_text ?? null, standard_id ?? null, req.params.id
    );
    res.json({ success: true });
  } catch (err) {    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/calibration/projects/:id', (req, res) => {
  // Permanently disabled to enforce non-destructive archival workflow
  res.status(403).json({ error: "Permanent deletion is disabled. Please archive the record instead." });
});

app.get('/api/calibration/process/:project_id', (req, res) => {
  try {
    const project_id = req.params.project_id;
    
    // 1. Fetch project to get saved coefficients
    const project = db.prepare('SELECT * FROM calibration_projects WHERE id = ?').get(project_id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // 2. Fetch test points sorted by sequence
    const points = db.prepare('SELECT * FROM test_points WHERE project_id = ? ORDER BY measurement_sequence ASC, series_number ASC').all(project_id);
    
    const coeffA = parseFloat(project.coeff_a ?? 1.0) || 1.0;
    const coeffB = parseFloat(project.coeff_b ?? 0.0) || 0.0;
    const coeffC = parseFloat(project.coeff_c ?? 0.0) || 0.0;
    const calUnc = parseFloat(project.ref_unc ?? 0.02) || 0.02;
    const sensitivity_ppm = 50; // Fallback
    const resolution_kgf = parseFloat(project.resolution) || 0.01;

    // 3. Separate stages
    const preloadingPoints = points.filter(p => p.stage_name === 'Pre-loading');
    const measuredPoints = points.filter(p => p.stage_name === 'Measured');

    // 4. Group Measured points by sequence
    const pointsBySeq = {};
    let maxDeflectionMvv = 0.0001; 

    measuredPoints.forEach(pt => {
      if (pt.raw_reading_mvv > maxDeflectionMvv) maxDeflectionMvv = pt.raw_reading_mvv;

      const seq = pt.measurement_sequence;
      if (!pointsBySeq[seq]) {
          pointsBySeq[seq] = { target: pt.target_value_kgf, s1: 0, s2: 0, s3: 0, m1: pt.target_value_kgf, m2: pt.target_value_kgf, m3: pt.target_value_kgf };
      }
      if (pt.series_number === 1) { pointsBySeq[seq].s1 = pt.raw_reading_mvv; pointsBySeq[seq].m1 = pt.machine_indicated_kgf ?? pt.target_value_kgf; }
      if (pt.series_number === 2) { pointsBySeq[seq].s2 = pt.raw_reading_mvv; pointsBySeq[seq].m2 = pt.machine_indicated_kgf ?? pt.target_value_kgf; }
      if (pt.series_number === 3) { pointsBySeq[seq].s3 = pt.raw_reading_mvv; pointsBySeq[seq].m3 = pt.machine_indicated_kgf ?? pt.target_value_kgf; }
    });

    // Zeros from Pre-loading (index 0 is baseline)
    const baselinePoints = preloadingPoints.filter(p => p.measurement_sequence === 0);
    const z1 = baselinePoints.find(p => p.series_number === 1)?.raw_reading_mvv || 0;
    const z2 = baselinePoints.find(p => p.series_number === 2)?.raw_reading_mvv || 0;
    const z3 = baselinePoints.find(p => p.series_number === 3)?.raw_reading_mvv || 0;

    // 5. Process Measured Groups
    const sortedSeqs = Object.keys(pointsBySeq).map(Number).sort((a, b) => a - b);
    
    const unitConstants = {
      'kgf': 0.00980665,
      'kN': 1.0,
      'lbf': 0.004448222,
      'N': 0.001,
      'tf': 9.80665
    };
    const unit_scale = unitConstants[project.output_unit] || 0.00980665;
    
    const results = sortedSeqs.map(seq => {
      const data = pointsBySeq[seq];
      return calibEngine.processCalibrationPoint({
        targetForceKgf: data.target,
        unit_scale: unit_scale,
        series1_m: data.m1,
        series2_m: data.m2,
        series3_m: data.m3,
        series1_mvv: data.s1,
        series2_mvv: data.s2,
        series3_mvv: data.s3,
        zeroBaseline1: z1,
        zeroBaseline2: z2,
        zeroBaseline3: z3,
        max_deflection_mvv: maxDeflectionMvv,
        coeffA, coeffB, coeffC,
        calUncertainty_percent: calUnc,
        sensitivity_ppm: sensitivity_ppm,
        resolution_kgf: resolution_kgf,
        temperatureChange_c: (project.temperature_after || 0) - (project.temperature_before || 0)
      });
    });

    res.json({
        metadata: project,
        preloading: preloadingPoints,
        results: results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SETTINGS ROUTES
// ============================================

app.get('/api/settings/load', (req, res) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/save', (req, res) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(req.body, null, 2), 'utf8');

    // Apply new TCP connection settings directly to the hardware interface
    if (req.body.connection && req.body.connection.tcp) {
      dmp41.host = req.body.connection.tcp.ip || dmp41.host;
      dmp41.port = req.body.connection.tcp.port || dmp41.port;
    }

    if (req.body.channel) {
      dmp41.currentChannel = parseInt(req.body.channel);
    }

    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
function buildExportData(projectId) {
  // 1. Fetch Project Metadata
  const project = db.prepare('SELECT * FROM calibration_projects WHERE id = ?').get(projectId);
  if (!project) throw new Error('Project not found');
  if (project.is_archived === 1) throw new Error('Archived records cannot be exported. Restore to history first.');

  // 2. Fetch Test Points
  const points = db.prepare('SELECT * FROM test_points WHERE project_id = ? ORDER BY measurement_sequence ASC, series_number ASC').all(projectId);

  // 3. Separate stages and format
  const preloadingPoints = {};
  const measuredPoints = {};

  points.forEach(pt => {
    const stage = pt.stage_name === 'Pre-loading' ? preloadingPoints : measuredPoints;
    const target = pt.target_value_kgf;
    const seq = pt.measurement_sequence;
    const key = `${stage === preloadingPoints ? 'pre' : 'meas'}_${seq}_${target}`;
    
    if (!stage[key]) {
      stage[key] = { target: target, s1: 0, s2: 0, s3: 0, m1: target, m2: target, m3: target };
    }
    if (pt.series_number === 1) { stage[key].s1 = pt.raw_reading_mvv; stage[key].m1 = pt.machine_indicated_kgf ?? target; }
    if (pt.series_number === 2) { stage[key].s2 = pt.raw_reading_mvv; stage[key].m2 = pt.machine_indicated_kgf ?? target; }
    if (pt.series_number === 3) { stage[key].s3 = pt.raw_reading_mvv; stage[key].m3 = pt.machine_indicated_kgf ?? target; }
  });

  // 5. Process Measured Groups to get calculated results
  const sortedSeqs = Object.keys(measuredPoints).map(k => parseInt(k.split('_')[1])).sort((a, b) => a - b);
  
  const unitConstants = {
    'kgf': 0.00980665,
    'kN': 1.0,
    'lbf': 0.004448222,
    'N': 0.001,
    'tf': 9.80665
  };
  const unit_scale = unitConstants[project.output_unit] || 0.00980665;
  
  const baselineKey = Object.keys(measuredPoints).find(k => k.startsWith('meas_0_'));
  const z1 = measuredPoints[baselineKey]?.s1 || 0;
  const z2 = measuredPoints[baselineKey]?.s2 || 0;
  const z3 = measuredPoints[baselineKey]?.s3 || 0;

  const coeffA = parseFloat(project.coeff_a ?? 1.0) || 1.0;
  const coeffB = parseFloat(project.coeff_b ?? 0.0) || 0.0;
  const coeffC = parseFloat(project.coeff_c ?? 0.0) || 0.0;
  const calUnc = parseFloat(project.ref_unc ?? 0.02) || 0.02;
  const resolution_kgf = parseFloat(project.resolution) || 0.01;

  const results = sortedSeqs.map(seq => {
    const key = Object.keys(measuredPoints).find(k => k.startsWith(`meas_${seq}_`));
    const data = measuredPoints[key];
    return calibEngine.processCalibrationPoint({
      targetForceKgf: data.target,
      unit_scale: unit_scale,
      series1_m: data.m1,
      series2_m: data.m2,
      series3_m: data.m3,
      series1_mvv: data.s1,
      series2_mvv: data.s2,
      series3_mvv: data.s3,
      zeroBaseline1: z1,
      zeroBaseline2: z2,
      zeroBaseline3: z3,
      coeffA, coeffB, coeffC,
      calUncertainty_percent: calUnc,
      resolution_kgf: resolution_kgf,
      temperatureChange_c: (project.temperature_after || 0) - (project.temperature_before || 0)
    });
  });

 return {
    id: project.id,
    project_name: project.project_name,
    client_name: project.client_name,
    client_address: project.client_address,
    date: project.calibration_date || project.updated_at,
    capacity: project.capacity_kgf,
    
    // Instrument Information
    instrument: project.instrument_name || 'N/A',
    serial: project.serial_number || 'N/A',
    mode: project.mode || 'Compression',
    make: project.make_model || 'N/A',
    range: project.range_text || 'N/A',
    increment: project.increment || 'N/A',
    resolution: project.resolution || 'N/A',
    
    // Load Cell & Indicator Specifics
    lc_make: project.lc_make || 'N/A',
    lc_sn: project.lc_sn || project.serial_number || 'N/A',
    ind_make: project.ind_make || 'N/A',
    ind_sn: project.ind_sn || 'N/A',
    
    // Standard Metadata & Coefficients
    ref_model: project.ref_model || 'N/A',
    ref_sn: project.ref_sn || 'N/A',
    ref_cert: project.ref_cert || 'N/A',
    ref_date: project.ref_date || 'N/A',
    coeff_a: project.coeff_a || 0,
    coeff_b: project.coeff_b || 0,
    coeff_c: project.coeff_c || 0,
    ref_unc: project.ref_unc || 0,
    ref_drift: project.drift_percent || 0.05,
    
    // Environmental Conditions
    temp_before: project.temperature_before || 0,
    temp_after: project.temperature_after || 0,
    hum_before: project.humidity_before || 0,
    hum_after: project.humidity_after || 0,
    unit_scale: unit_scale,
    output_unit: project.output_unit || 'kgf',
    
    preloading: Object.values(preloadingPoints),
    measured: Object.values(measuredPoints),
    results: results
  };
}

app.get('/api/export/pdf/:project_id', async (req, res) => {
  try {
    const exportData = buildExportData(req.params.project_id);
    const reportPath = await ExcelEngine.generateReport(exportData);
    const pdfPath = await ExcelEngine.generatePDF(reportPath);
    res.download(pdfPath, `Calibration_Report_${exportData.project_name}.pdf`);
  } catch (err) {
    console.error('PDF Export Error:', err);
    res.status(err.message.includes('not found') ? 404 : (err.message.includes('Archived') ? 403 : 500)).json({ error: err.message });
  }
});

// ============================================
// EXPORT ROUTES
// ============================================

app.get('/api/export/excel/:project_id', async (req, res) => {
  try {
    const exportData = buildExportData(req.params.project_id);
    const reportPath = await ExcelEngine.generateReport(exportData);
    res.download(reportPath, `Calibration_Report_${exportData.project_name}.xlsx`);
  } catch (err) {
    console.error('Excel Export Error:', err);
    res.status(err.message.includes('not found') ? 404 : (err.message.includes('Archived') ? 403 : 500)).json({ error: err.message });
  }
});

app.post('/api/calibration/test-points/batch', (req, res) => {
  try {
    const { project_id, points } = req.body;
    
    // Clear existing points for this project to avoid duplicates on re-save
    db.prepare('DELETE FROM test_points WHERE project_id = ?').run(project_id);
    
    const stmt = db.prepare(`
      INSERT INTO test_points 
      (project_id, stage_name, target_value_kgf, raw_reading_mvv, machine_indicated_kgf, series_number, measurement_sequence, reading_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN TRANSACTION');
    points.forEach(p => {
      // Run 1
      stmt.run(project_id, p.stage || 'Measured', p.target, p.s1, p.m1 || p.target, 1, p.idx || 0, new Date().toISOString());
      // Run 2
      stmt.run(project_id, p.stage || 'Measured', p.target, p.s2, p.m2 || p.target, 2, p.idx || 0, new Date().toISOString());
      // Run 3
      stmt.run(project_id, p.stage || 'Measured', p.target, p.s3, p.m3 || p.target, 3, p.idx || 0, new Date().toISOString());
    });
    db.exec('COMMIT');

    res.json({ status: 'success' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/load-cells', (req, res) => {
  try {
    let standards = [];
    const pathCells = path.join(__dirname, 'config', 'load_cells.json');
    if (fs.existsSync(pathCells)) {
      standards = JSON.parse(fs.readFileSync(pathCells, 'utf8')).map(s => ({ ...s, is_system: true }));
    }
    
    const customStandards = db.prepare('SELECT * FROM load_cells_reference').all();
    const mappedCustom = customStandards.map(s => ({
      id: `custom_${s.id}`,
      db_id: s.id,
      model: s.model,
      capacity: s.capacity_kn + ' kN',
      sn: s.serial_number,
      coeff_a: s.coeff_a_compression,
      coeff_b: s.coeff_b_compression,
      coeff_c: s.coeff_c_compression,
      uncertainty: s.uncertainty_compression_percent,
      cert_no: s.calibration_certificate,
      cal_date: s.calibration_date,
      is_system: false
    }));

    res.json([...standards, ...mappedCustom]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/load-cells', (req, res) => {
  try {
    const { model, capacity_kn, sn, coeff_a, coeff_b, coeff_c, uncertainty, cert_no, cal_date } = req.body;
    
    // Check for duplicate serial number
    const existing = db.prepare('SELECT id FROM load_cells_reference WHERE serial_number = ?').get(sn);
    if (existing) {
      return res.status(400).json({ error: 'A standard with this Serial Number already exists.' });
    }

    const stmt = db.prepare(`
      INSERT INTO load_cells_reference 
      (model, capacity_kn, serial_number, coeff_a_compression, coeff_b_compression, coeff_c_compression, uncertainty_compression_percent, calibration_certificate, calibration_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(model, capacity_kn, sn, coeff_a, coeff_b, coeff_c, uncertainty, cert_no, cal_date);
    res.json({ id: result.lastInsertRowid, status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/load-cells/:id', (req, res) => {
  try {
    const { model, capacity_kn, sn, coeff_a, coeff_b, coeff_c, uncertainty, cert_no, cal_date } = req.body;
    
    // Check for duplicate serial number (excluding the current record)
    const existing = db.prepare('SELECT id FROM load_cells_reference WHERE serial_number = ? AND id != ?').get(sn, req.params.id);
    if (existing) {
      return res.status(400).json({ error: 'A standard with this Serial Number already exists.' });
    }

    db.prepare(`
      UPDATE load_cells_reference
      SET model = ?, capacity_kn = ?, serial_number = ?, coeff_a_compression = ?, coeff_b_compression = ?, coeff_c_compression = ?, uncertainty_compression_percent = ?, calibration_certificate = ?, calibration_date = ?
      WHERE id = ?
    `).run(model, capacity_kn, sn, coeff_a, coeff_b, coeff_c, uncertainty, cert_no, cal_date, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/config/load-cells/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM load_cells_reference WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/mapping', (req, res) => {
  const mappingPath = path.join(__dirname, 'config', 'excel_mapping.json');
  if (fs.existsSync(mappingPath)) {
    res.json(JSON.parse(fs.readFileSync(mappingPath, 'utf8')));
  } else {
    res.status(404).json({ error: 'Mapping config not found' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`DMP41 Calibration System running at http://localhost:${PORT}`);
  // We no longer auto-connect or auto-fallback on startup. The user must initiate connection.
});