const CalibrationEngine = require('./services/calibration_engine');
const engine = new CalibrationEngine();

const params = {
    targetForceKgf: 20,
    series1_mvv: 0.038718,
    series2_mvv: 0.038906,
    series3_mvv: 0.039014,
    zeroBaseline_mvv: -0.002132666666666667,
    coeffA: 4.902632,
    coeffB: -0.0009307508,
    coeffC: -0.00006355071,
    calUncertainty_percent: 0.011, // HBM/C3H3 uncertainty
    temperatureChange_c: 0,
    sensitivity_ppm: 50,
    resolution_kgf: 0.01,
    max_deflection_mvv: 0.201
};

const result = engine.processCalibrationPoint(params);
console.log(JSON.stringify(result, null, 2));
