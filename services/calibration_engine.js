class CalibrationEngine {
  constructor() {
    this.gravityConstant = 0.00980665; // 1 kgf in kN
  }

  // F = AD + BD² + CD³ (Polynomial equation)
  calculateEquivalentForce(rawDeflectionMvv, coeffA, coeffB, coeffC) {
    const D = rawDeflectionMvv;
    const F = (coeffA * D) + (coeffB * Math.pow(D, 2)) + (coeffC * Math.pow(D, 3));
    return F;
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
      drift_percent = 0.05,
      temperature_change_c,
      sensitivity_ppm_per_c,
      reference_force_kn,
      num_runs = 3
    } = params;

    const abs_ref = Math.abs(reference_force_kn);
    if (abs_ref < 1e-9) {
      return {
        combined_uncertainty_kn: 0,
        expanded_uncertainty_kn: 0,
        relative_combined_percent: null,
        relative_uncertainty_percent: null,
        components: { repeatability: null, resolution: null, tare: null, calibration: null, drift: null, temperature: null }
      };
    }

    // Standard uncertainties (absolute in kN)
    const u_rep = repeatability_kn / Math.sqrt(num_runs);
    const u_res = resolution_kn / (2 * Math.sqrt(3)); 
    const u_tare = tare_uncertainty_kn;
    const u_cal = (cal_uncertainty_percent / 100) * abs_ref;
    const u_temp = (sensitivity_ppm_per_c * temperature_change_c / 1e6) * abs_ref;

    // Relative standard uncertainties (%) - Capped at 999.999% to prevent Excel '######'
    const cap = (v) => Math.min(v, 999.999);
    const w_rep = cap((u_rep / abs_ref) * 100);
    const w_res = cap((u_res / abs_ref) * 100);
    const w_tare = cap((u_tare / abs_ref) * 100);
    const w_cal = cal_uncertainty_percent / 2; 
    const w_drift = drift_percent / Math.sqrt(3);
    const w_temp = (sensitivity_ppm_per_c * temperature_change_c / 1e6) * 100;

    const w_combined = cap(Math.sqrt(
      Math.pow(w_rep, 2) + Math.pow(w_res, 2) + Math.pow(w_tare, 2) +
      Math.pow(w_cal, 2) + Math.pow(w_drift, 2) + Math.pow(w_temp, 2)
    ));

    const W_expanded = cap(2 * w_combined);
    const U_expanded = (W_expanded / 100) * abs_ref;

    return {
      combined_uncertainty_kn: parseFloat((U_expanded / 2).toFixed(9)),
      expanded_uncertainty_kn: parseFloat(U_expanded.toFixed(9)),
      relative_combined_percent: parseFloat(w_combined.toFixed(7)),
      relative_uncertainty_percent: parseFloat(W_expanded.toFixed(7)),
      components: {
        repeatability: parseFloat(w_rep.toFixed(7)),
        resolution: parseFloat(w_res.toFixed(7)),
        tare: parseFloat(w_tare.toFixed(7)),
        calibration: parseFloat(w_cal.toFixed(7)),
        drift: parseFloat(w_drift.toFixed(7)),
        temperature: parseFloat(w_temp.toFixed(7))
      }
    };
  }

  // ISO 376 Classification
  classifyMeasurement(relativeUncertaintyPercent) {
    const u = parseFloat(relativeUncertaintyPercent);
    if (u <= 0.05) return 'Class 0';
    if (u <= 0.1) return 'Class 1';
    if (u <= 0.2) return 'Class 2';
    if (u <= 0.5) return 'Class 3';
    return 'Outside Class';
  }

  // Full calibration result calculation
  processCalibrationPoint(params) {
    const {
      targetForceKgf,
      unit_scale = 0.00980665,
      series1_m = null, series2_m = null, series3_m = null,
      series1_mvv = null, series2_mvv = null, series3_mvv = null,
      zeroBaseline1 = null, zeroBaseline2 = null, zeroBaseline3 = null,
      residualZero1 = null, residualZero2 = null, residualZero3 = null,
      maxCapacityKn = null,
      coeffA, coeffB, coeffC,
      calUncertainty_percent,
      drift_percent = 0.05,
      temperatureChange_c
    } = params;

    // Apply per-series zero correction
    const s1_corrected = (series1_mvv !== null && zeroBaseline1 !== null) ? series1_mvv - zeroBaseline1 : null;
    const s2_corrected = (series2_mvv !== null && zeroBaseline2 !== null) ? series2_mvv - zeroBaseline2 : null;
    const s3_corrected = (series3_mvv !== null && zeroBaseline3 !== null) ? series3_mvv - zeroBaseline3 : null;
    
    const netValues = [s1_corrected, s2_corrected, s3_corrected];
    const activeNets = netValues.filter(v => v !== null);
    const activeRs = [series1_mvv, series2_mvv, series3_mvv].filter(v => v !== null);

    // Interpolated Deflection (Target is in selected unit, M is in selected unit)
    const i1 = (targetForceKgf === 0 && s1_corrected !== null) ? 0 : ((series1_m && s1_corrected !== null) ? (s1_corrected / series1_m) * targetForceKgf : null);
    const i2 = (targetForceKgf === 0 && s2_corrected !== null) ? 0 : ((series2_m && s2_corrected !== null) ? (s2_corrected / series2_m) * targetForceKgf : null);
    const i3 = (targetForceKgf === 0 && s3_corrected !== null) ? 0 : ((series3_m && s3_corrected !== null) ? (s3_corrected / series3_m) * targetForceKgf : null);
    
    const interpolatedValues = [i1, i2, i3];
    const activeInterps = interpolatedValues.filter(v => v !== null);
    const meanInterpolated = activeInterps.length > 0 ? activeInterps.reduce((a, b) => a + b, 0) / activeInterps.length : 0;

    // Apply polynomial on interpolated values (Yields kN)
    const s1_kn = i1 !== null ? this.calculateEquivalentForce(i1, coeffA, coeffB, coeffC) : null;
    const s2_kn = i2 !== null ? this.calculateEquivalentForce(i2, coeffA, coeffB, coeffC) : null;
    const s3_kn = i3 !== null ? this.calculateEquivalentForce(i3, coeffA, coeffB, coeffC) : null;
    
    const runForcesKn = [s1_kn, s2_kn, s3_kn];
    const activeForces = runForcesKn.filter(f => f !== null);

    let mean_kn = 0;
    let s_dev_kn = 0;
    
    if (activeForces.length > 0) {
      mean_kn = activeForces.reduce((a, b) => a + b) / activeForces.length;
      if (activeForces.length > 1) {
        s_dev_kn = Math.sqrt(this.calculateSampleVariance(activeForces));
      }
    }

    // Uncertainty
    const abs_mean_kn = Math.abs(mean_kn) || 1e-9;
    const res_kn = (parseFloat(params.resolution_kgf) || 0.01) * unit_scale;

    const uncertaintyParams = {
      repeatability_kn: s_dev_kn,
      resolution_kn: res_kn, 
      tare_uncertainty_kn: 1e-7,
      cal_uncertainty_percent: calUncertainty_percent,
      drift_percent: drift_percent,
      temperature_change_c: temperatureChange_c,
      sensitivity_ppm_per_c: params.sensitivity_ppm || 50,
      reference_force_kn: mean_kn,
      num_runs: activeForces.length
    };

    const uncertainty = this.calculateUncertainty(uncertaintyParams);

    // Classification
    const classification = this.classifyMeasurement(uncertainty.relative_uncertainty_percent);

    // Error analysis
    const targetForceKn = targetForceKgf * unit_scale;
    
    // Authoritative Guard: Avoid division by zero for error percentages
    let accu_q = 0;
    let rep_b = 0;
    
    if (abs_mean_kn > 1e-9) {
        // Relative accuracy error qi (%) = (Target - Reference) / Reference * 100
        accu_q = ((targetForceKn - mean_kn) / abs_mean_kn) * 100;

        // Relative repeatability error b (%) = (Max - Min) / Mean * 100
        const range = activeForces.length > 1 ? Math.max(...activeForces) - Math.min(...activeForces) : 0;
        rep_b = (range / abs_mean_kn) * 100;
    }

    // Relative zero error f0 (%) = (Residual Indication / Max Capacity) * 100
    let f0 = 0;
    if (maxCapacityKn && maxCapacityKn > 0) {
        const residuals = [residualZero1, residualZero2, residualZero3].filter(v => v !== null);
        if (residuals.length > 0) {
            const meanResidual = residuals.reduce((a, b) => a + b, 0) / residuals.length;
            f0 = (Math.abs(meanResidual * unit_scale) / maxCapacityKn) * 100;
        }
    }

    const meanRawDeflection = activeRs.length > 0 ? activeRs.reduce((a, b) => a + b) / activeRs.length : null;

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
      interpolatedValues: interpolatedValues,
      meanNetDeflection: meanInterpolated,
      meanRawDeflection: meanRawDeflection,
      runForcesKn: runForcesKn,
      series1_kn: s1_kn,
      series2_kn: s2_kn,
      series3_kn: s3_kn,
      meanForceKn: mean_kn,
      meanForce: mean_kn !== null ? mean_kn / unit_scale : null,
      repeatability_kn: s_dev_kn,
      uncertainty_kn: uncertainty.expanded_uncertainty_kn,
      relative_uncertainty_percent: uncertainty.relative_uncertainty_percent,
      accuracy_error_percent: accu_q !== null ? parseFloat(accu_q.toFixed(6)) : null,
      relative_error_percent: accu_q !== null ? parseFloat(accu_q.toFixed(6)) : null,
      repeatability_error_percent: rep_b !== null ? parseFloat(rep_b.toFixed(6)) : null,
      zero_error_percent: f0 !== null ? parseFloat(f0.toFixed(6)) : null,
      w_res_percent: uncertainty.components.resolution,
      w_rep_percent: uncertainty.components.repeatability,
      w_std_percent: uncertainty.components.calibration !== null ? Math.sqrt(Math.pow(uncertainty.components.calibration, 2) + Math.pow(uncertainty.components.drift, 2)) : null,
      w_comb_percent: uncertainty.relative_combined_percent,
      classification: classification,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = CalibrationEngine;
