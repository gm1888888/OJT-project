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
    const relative_uncertainty_percent = (w_expanded / reference_force_kn) * 100;

    return {
      combined_uncertainty_kn: parseFloat(w_combined.toFixed(9)),
      expanded_uncertainty_kn: parseFloat(w_expanded.toFixed(9)),
      relative_uncertainty_percent: parseFloat(relative_uncertainty_percent.toFixed(4)),
      components: {
        repeatability: w_rep,
        resolution: w_res,
        tare: w_tare,
        calibration: w_cal,
        temperature: w_temp
      }
    };
  }

  // ISO 7500-1 Classification
  classifyMeasurement(relativeErrorPercent, repeatabilityErrorPercent, zeroErrorPercent = 0) {
    const maxError = Math.max(
        Math.abs(relativeErrorPercent), 
        Math.abs(repeatabilityErrorPercent),
        Math.abs(zeroErrorPercent)
    );
    
    if (maxError <= 0.5) return 'Class 0.5';
    if (maxError <= 1.0) return 'Class 1.0';
    if (maxError <= 2.0) return 'Class 2.0';
    if (maxError <= 3.0) return 'Class 3.0';
    return 'Unclassified';
  }

  // Full calibration result calculation
  processCalibrationPoint(params) {
    const {
      targetForceKgf,
      series1_mvv, series2_mvv, series3_mvv,
      zeroBaseline_mvv,
      coeffA, coeffB, coeffC,
      calUncertainty_percent,
      temperatureChange_c
    } = params;

    // Apply zero correction
    const s1_corrected = series1_mvv - zeroBaseline_mvv;
    const s2_corrected = series2_mvv - zeroBaseline_mvv;
    const s3_corrected = series3_mvv - zeroBaseline_mvv;

    // Apply polynomial
    const s1_kn = this.calculateEquivalentForce(s1_corrected, coeffA, coeffB, coeffC);
    const s2_kn = this.calculateEquivalentForce(s2_corrected, coeffA, coeffB, coeffC);
    const s3_kn = this.calculateEquivalentForce(s3_corrected, coeffA, coeffB, coeffC);

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

    // Classification (ISO 7500-1)
    const repeatabilityErrorPercent = (avgResult.variance > 0 && Math.abs(avgResult.mean_kn) > 0) ? 
        ((Math.max(s1_kn, s2_kn, s3_kn) - Math.min(s1_kn, s2_kn, s3_kn)) / Math.abs(avgResult.mean_kn)) * 100 : 0;
        
    // Error analysis
    // Indicated = targetForceKn (what the machine says)
    // True = avgResult.mean_kn (what the standard says)
    const targetForceKn = targetForceKgf * this.gravityConstant;
    const absoluteError = targetForceKn - avgResult.mean_kn;
    const relativeErrorPercent = (absoluteError / avgResult.mean_kn) * 100;

    // Zero return error (if available in params)
    let zeroReturnErrorPercent = 0;
    if (params.zero_return_mvv) {
        zeroReturnErrorPercent = (params.zero_return_mvv / params.max_deflection_mvv) * 100;
    }

    const classification = this.classifyMeasurement(relativeErrorPercent, repeatabilityErrorPercent, zeroReturnErrorPercent);

    return {
      target_force_kgf: targetForceKgf,
      target_force_kn: targetForceKn,
      series1_mvv: series1_mvv,
      series2_mvv: series2_mvv,
      series3_mvv: series3_mvv,
      series1_kn: s1_kn,
      series2_kn: s2_kn,
      series3_kn: s3_kn,
      mean_force_kn: avgResult.mean_kn,
      repeatability_kn: avgResult.repeatability_kn,
      variance: avgResult.variance,
      uncertainty_kn: uncertainty.expanded_uncertainty_kn,
      relative_uncertainty_percent: uncertainty.relative_uncertainty_percent,
      absolute_error_kn: absoluteError,
      relative_error_percent: relativeErrorPercent,
      zero_return_error_percent: zeroReturnErrorPercent,
      classification: classification,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = CalibrationEngine;