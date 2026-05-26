class CalibrationEngine {
  constructor() {
    this.gravityConstant = 0.00980665; // 1 kgf in kN
  }

  // F = AD + BD² + CD³ (Polynomial equation)
  calculateEquivalentForce(rawDeflectionMvv, coeffA, coeffB, coeffC) {
    const D = rawDeflectionMvv;
    const F = (coeffA * D) + (coeffB * Math.pow(D, 2)) + (coeffC * Math.pow(D, 3));
    return parseFloat(F.toFixed(6));
  }

  // Calculate mean of 3 runs (0°, 120°, 240°)
  calculateThreeRunAverage(series1_kn, series2_kn, series3_kn) {
    const values = [series1_kn, series2_kn, series3_kn];
    const mean = values.reduce((a, b) => a + b) / 3;
    const variance = this.calculateSampleVariance(values);
    const stdDev = Math.sqrt(variance);
    
    return {
      mean_kn: parseFloat(mean.toFixed(6)),
      repeatability_kn: parseFloat(stdDev.toFixed(9)),
      variance: parseFloat(variance.toFixed(12))
    };
  }

  calculateSampleVariance(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b) / values.length;
    const sumSquaredDiff = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
    return sumSquaredDiff / (values.length - 1); // Bessel's correction
  }

  // ISO 376 Uncertainty Calculation
  calculateUncertainty(params) {
    const {
      repeatability_kn,
      resolution_kn,
      tare_uncertainty_kn,
      cal_uncertainty_percent,
      temperature_change_c,
      sensitivity_ppm_per_c,
      reference_force_kn
    } = params;

    // All uncertainties converted to kN
    const w_rep = repeatability_kn;
    const w_res = resolution_kn / Math.sqrt(3); // Rectangle distribution
    const w_tare = tare_uncertainty_kn;
    const w_cal = (cal_uncertainty_percent / 100) * reference_force_kn;
    const w_temp = (sensitivity_ppm_per_c * temperature_change_c / 1e6) * reference_force_kn;

    // Combined uncertainty (RSS method)
    const w_combined = Math.sqrt(
      Math.pow(w_rep, 2) +
      Math.pow(w_res, 2) +
      Math.pow(w_tare, 2) +
      Math.pow(w_cal, 2) +
      Math.pow(w_temp, 2)
    );

    // Expanded uncertainty (k = 2 for ~95% confidence)
    const w_expanded = 2 * w_combined;
    const relative_uncertainty_percent = (Math.abs(reference_force_kn) > 0) ? (w_expanded / reference_force_kn) * 100 : 0;

    return {
      combined_uncertainty_kn: parseFloat(w_combined.toFixed(9)),
      expanded_uncertainty_kn: parseFloat(w_expanded.toFixed(9)),
      relative_uncertainty_percent: parseFloat((relative_uncertainty_percent || 0).toFixed(4)),
      components: {
        repeatability: w_rep,
        resolution: w_res,
        tare: w_tare,
        calibration: w_cal,
        temperature: w_temp
      }
    };
  }

  // ISO 376 Classification
  classifyMeasurement(relativeUncertaintyPercent) {
    const u = parseFloat(relativeUncertaintyPercent);
    if (u < 0.05) return 'Class 0';
    if (u < 0.1) return 'Class 1';
    if (u < 0.2) return 'Class 2';
    return 'Class 3';
  }

  // Full calibration result calculation
  processCalibrationPoint(params) {
    const {
      targetForceKgf,
      series1_m = 0, series2_m = 0, series3_m = 0,
      series1_mvv, series2_mvv, series3_mvv,
      zeroBaseline1 = 0, zeroBaseline2 = 0, zeroBaseline3 = 0,
      coeffA, coeffB, coeffC,
      calUncertainty_percent,
      temperatureChange_c
    } = params;

    // Apply per-series zero correction
    const s1_corrected = series1_mvv !== 0 ? series1_mvv - zeroBaseline1 : 0;
    const s2_corrected = series2_mvv !== 0 ? series2_mvv - zeroBaseline2 : 0;
    const s3_corrected = series3_mvv !== 0 ? series3_mvv - zeroBaseline3 : 0;
    
    const netValues = [s1_corrected, s2_corrected, s3_corrected];
    const activeNets = netValues.filter((v, i) => [series1_mvv, series2_mvv, series3_mvv][i] !== 0);
    const meanNetDeflection = activeNets.length > 0 ? activeNets.reduce((a, b) => a + b, 0) / activeNets.length : 0;

    // Apply polynomial
    const s1_kn = this.calculateEquivalentForce(s1_corrected, coeffA, coeffB, coeffC);
    const s2_kn = this.calculateEquivalentForce(s2_corrected, coeffA, coeffB, coeffC);
    const s3_kn = this.calculateEquivalentForce(s3_corrected, coeffA, coeffB, coeffC);
    
    const runForcesKn = [s1_kn, s2_kn, s3_kn];

    // 3-run average
    const avgResult = this.calculateThreeRunAverage(s1_kn, s2_kn, s3_kn);

    // Uncertainty
    const uncertaintyParams = {
      repeatability_kn: avgResult.repeatability_kn,
      resolution_kn: (params.resolution_kgf || 0.01) * this.gravityConstant, 
      tare_uncertainty_kn: 1e-6,
      cal_uncertainty_percent: calUncertainty_percent,
      temperature_change_c: temperatureChange_c,
      sensitivity_ppm_per_c: params.sensitivity_ppm || 50,
      reference_force_kn: avgResult.mean_kn
    };

    const uncertainty = this.calculateUncertainty(uncertaintyParams);

    // Classification
    const classification = this.classifyMeasurement(uncertainty.relative_uncertainty_percent);

    // Error analysis
    const targetForceKn = targetForceKgf * this.gravityConstant;
    const absoluteError = avgResult.mean_kn - targetForceKn;
    const relativeErrorPercent = (Math.abs(targetForceKn) > 0) ? (absoluteError / targetForceKn) * 100 : 0;

    return {
      targetForceKgf: targetForceKgf,
      targetForceKn: targetForceKn,
      series1_m: series1_m,
      series2_m: series2_m,
      series3_m: series3_m,
      series1_mvv: series1_mvv,
      series2_mvv: series2_mvv,
      series3_mvv: series3_mvv,
      netValues: netValues,
      meanNetDeflection: meanNetDeflection,
      runForcesKn: runForcesKn,
      series1_kn: s1_kn,
      series2_kn: s2_kn,
      series3_kn: s3_kn,
      meanForceKn: avgResult.mean_kn,
      repeatability_kn: avgResult.repeatability_kn,
      variance: avgResult.variance,
      uncertainty_kn: uncertainty.expanded_uncertainty_kn,
      relative_uncertainty_percent: uncertainty.relative_uncertainty_percent,
      absolute_error_kn: absoluteError,
      relative_error_percent: relativeErrorPercent,
      classification: classification,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = CalibrationEngine;