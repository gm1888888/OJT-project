require('dotenv').config();
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const DMP41Interface = require('./services/dmp41_interface');
const CalibrationEngine = require('./services/calibration_engine');
const CertificateGenerator = require('./services/certificate_generator');
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
const calibEngine = new CalibrationEngine();
const certGen = new CertificateGenerator();

// Database setup using built-in node:sqlite
const db = new DatabaseSync(process.env.DB_PATH || './calibration_data.db');
console.log('Connected to the built-in SQLite database.');
initDatabase();

function initDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS calibration_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_name TEXT NOT NULL,
    client_name TEXT,
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

  // Schema migrations for existing databases
  try { db.exec("ALTER TABLE test_points ADD COLUMN is_zero_return BOOLEAN DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN make_model TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN increment TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN resolution TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE calibration_projects ADD COLUMN range_text TEXT"); } catch (e) {}
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

app.post('/api/hardware/mode', (req, res) => {
  try {
    const { mode } = req.body;
    const isDemo = mode === 'demo';
    dmp41.setDemoMode(isDemo);
    res.json({ status: 'success', mode: isDemo ? 'demo' : 'live' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hardware/connect', async (req, res) => {
  try {
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
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }
    const response = await dmp41.sendCommand(command);
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
    const { project_name, instrument_name, serial_number, capacity_kgf, calibration_date, mode, range_text, make_model, increment, resolution } = req.body;
    const stmt = db.prepare(`
      INSERT INTO calibration_projects 
      (project_name, instrument_name, serial_number, capacity_kgf, calibration_date, mode, range_text, make_model, increment, resolution)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(project_name ?? null, instrument_name ?? null, serial_number ?? null, capacity_kgf ?? null, calibration_date ?? null, mode ?? 'Compression', range_text ?? null, make_model ?? null, increment ?? null, resolution ?? null);
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
    const stmt = db.prepare('SELECT * FROM calibration_projects WHERE status = \'Saved\' ORDER BY updated_at DESC');
    const rows = stmt.all();
    res.json(rows);
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
    const { project_name, instrument_name, serial_number, capacity_kgf, calibration_date, mode, range_text, make_model, increment, resolution } = req.body;
    db.prepare(`
      UPDATE calibration_projects 
      SET project_name = ?, instrument_name = ?, serial_number = ?, capacity_kgf = ?, calibration_date = ?, mode = ?, range_text = ?, make_model = ?, increment = ?, resolution = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(project_name ?? null, instrument_name ?? null, serial_number ?? null, capacity_kgf ?? null, calibration_date ?? null, mode ?? 'Compression', range_text ?? null, make_model ?? null, increment ?? null, resolution ?? null, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/calibration/projects/:id', (req, res) => {
  try {
    const projectId = req.params.id;
    // Delete test points first (foreign key constraint might do this, but safe to be explicit)
    db.prepare(`DELETE FROM test_points WHERE project_id = ?`).run(projectId);
    // Delete the project
    db.prepare(`DELETE FROM calibration_projects WHERE id = ?`).run(projectId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calibration/process/:project_id', (req, res) => {
  try {
    const project_id = req.params.project_id;
    
    // 1. Fetch test points
    const points = db.prepare('SELECT * FROM test_points WHERE project_id = ?').all(project_id);
    
    // 2. Fetch current settings for coefficients and uncertainty
    let settings = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }

    const coeffA = parseFloat(settings.coeff_a || 1.0);
    const coeffB = parseFloat(settings.coeff_b || 0.0);
    const coeffC = parseFloat(settings.coeff_c || 0.0);
    const calUnc = parseFloat(settings.ref_unc || 0.02);
    const sensitivity_ppm = parseFloat(settings.sensitivity_ppm || 50);
    const resolution_kgf = parseFloat(settings.resolution_kgf || 0.01);

    // 3. Group points by target and run
    const pointsByTarget = {};
    const zeroReturnsByRun = { 1: 0, 2: 0, 3: 0 };
    let maxDeflectionMvv = 0.0001; 

    points.forEach(pt => {
      if (pt.raw_reading_mvv > maxDeflectionMvv) maxDeflectionMvv = pt.raw_reading_mvv;

      if (pt.is_zero_return || pt.target_value_kgf === 0) {
        zeroReturnsByRun[pt.series_number] = pt.raw_reading_mvv;
      } else {
        if (!pointsByTarget[pt.target_value_kgf]) {
          pointsByTarget[pt.target_value_kgf] = { s1: 0, s2: 0, s3: 0 };
        }
        if (pt.series_number === 1) pointsByTarget[pt.target_value_kgf].s1 = pt.raw_reading_mvv;
        if (pt.series_number === 2) pointsByTarget[pt.target_value_kgf].s2 = pt.raw_reading_mvv;
        if (pt.series_number === 3) pointsByTarget[pt.target_value_kgf].s3 = pt.raw_reading_mvv;
      }
    });

    // 4. Process each group
    const targets = Object.keys(pointsByTarget).map(Number).sort((a, b) => a - b).filter(t => t > 0);
    const results = targets.map(target => {
      const data = pointsByTarget[target];
      // Use the zero return from the last run (Run 3) or average them for the error calculation
      const avgZeroReturn = (zeroReturnsByRun[1] + zeroReturnsByRun[2] + zeroReturnsByRun[3]) / 3;
      
      return calibEngine.processCalibrationPoint({
        targetForceKgf: target,
        series1_mvv: data.s1,
        series2_mvv: data.s2,
        series3_mvv: data.s3,
        zero_return_mvv: avgZeroReturn, 
        max_deflection_mvv: maxDeflectionMvv,
        zeroBaseline_mvv: 0, 
        coeffA, coeffB, coeffC,
        calUncertainty_percent: calUnc,
        sensitivity_ppm: sensitivity_ppm,
        resolution_kgf: resolution_kgf,
        temperatureChange_c: 0 
      });
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// MATH ROUTES
// ============================================

app.post('/api/math/polynomial', (req, res) => {
  try {
    const { raw_deflection_mvv, a, b, c } = req.body;
    const result = calibEngine.calculateEquivalentForce(raw_deflection_mvv, a, b, c);
    res.json({ equivalent_force_kn: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/math/three-run-average', (req, res) => {
  try {
    const { series1_kn, series2_kn, series3_kn } = req.body;
    const result = calibEngine.calculateThreeRunAverage(series1_kn, series2_kn, series3_kn);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/math/uncertainty', (req, res) => {
  try {
    const result = calibEngine.calculateUncertainty(req.body);
    res.json(result);
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
    
    // Apply new TCP settings directly to the hardware interface
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

// ============================================
// CERTIFICATE ROUTES
// ============================================

app.post('/api/certificate/generate', async (req, res) => {
  try {
    const { project_id, format = 'pdf' } = req.body;
    
    // In a real app, you would fetch project and results data from DB here
    const projectData = { cert_no: 'CERT-' + project_id, instrument_name: 'Unknown', serial_number: 'N/A' };
    const resultsData = []; // Mock empty results for now
    
    if (format === 'html') {
      const html = await certGen.generateHTMLCertificate(projectData, resultsData);
      res.send(html);
    } else {
      res.json({ status: 'success', message: 'Certificate generated (mock)', project_id });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// EXPORT ROUTES
// ============================================

app.get('/api/export/excel/:project_id', async (req, res) => {
  try {
    const projectId = req.params.project_id;
    
    // 1. Fetch Project Metadata
    const project = db.prepare('SELECT * FROM calibration_projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // 2. Fetch Test Points
    const points = db.prepare('SELECT * FROM test_points WHERE project_id = ?').all(projectId);

    // 3. Format Data for Excel Bridge
    const pointsByTarget = {};
    points.forEach(pt => {
      if (!pointsByTarget[pt.target_value_kgf]) {
        pointsByTarget[pt.target_value_kgf] = { s1: 0, s2: 0, s3: 0 };
      }
      if (pt.series_number === 1) pointsByTarget[pt.target_value_kgf].s1 = pt.raw_reading_mvv;
      if (pt.series_number === 2) pointsByTarget[pt.target_value_kgf].s2 = pt.raw_reading_mvv;
      if (pt.series_number === 3) pointsByTarget[pt.target_value_kgf].s3 = pt.raw_reading_mvv;
    });

    const exportData = {
      id: project.id,
      project_name: project.project_name,
      client_name: project.client_name,
      date: project.updated_at,
      capacity: project.capacity_kgf,
      points: Object.keys(pointsByTarget).map(t => ({
        target: t,
        ...pointsByTarget[t]
      }))
    };

    // 4. Generate Excel via Python Bridge
    const reportPath = await ExcelEngine.generateReport(exportData);

    // 5. Send File to Client
    res.download(reportPath, `Calibration_Report_${project.project_name}.xls`);
  } catch (err) {
    console.error('Excel Export Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calibration/test-points/batch', (req, res) => {
  try {
    const { project_id, points } = req.body;
    
    // Clear existing points for this project to avoid duplicates on re-save
    db.prepare('DELETE FROM test_points WHERE project_id = ?').run(project_id);
    
    const stmt = db.prepare(`
      INSERT INTO test_points 
      (project_id, target_value_kgf, raw_reading_mvv, series_number, is_zero_return, reading_timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN TRANSACTION');
    points.forEach(p => {
      // Run 1
      stmt.run(project_id, p.target, p.s1, 1, 0, new Date().toISOString());
      // Run 2
      stmt.run(project_id, p.target, p.s2, 2, 0, new Date().toISOString());
      // Run 3
      stmt.run(project_id, p.target, p.s3, 3, 0, new Date().toISOString());
    });
    db.exec('COMMIT');

    res.json({ status: 'success' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/load-cells', (req, res) => {
  const pathCells = path.join(__dirname, 'config', 'load_cells.json');
  if (fs.existsSync(pathCells)) {
    res.json(JSON.parse(fs.readFileSync(pathCells, 'utf8')));
  } else {
    res.status(404).json({ error: 'Load cells config not found' });
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