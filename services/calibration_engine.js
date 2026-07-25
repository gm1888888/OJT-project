class CalibrationEngine {
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
      resolution_kn,
      tare_uncertainty_kn,
      cal_uncertainty_percent,
      drift_percent = 0.05,
      temperature_change_c,
      sensitivity_ppm_per_c,
      reference_force_kn
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
    // Legacy mapping: Type B rectangular distribution using relative range b_i (params.rep_b_percent)
    const u_rep = (params.rep_b_percent / 100 * abs_ref) / Math.sqrt(12);
    const u_res = resolution_kn / (2 * Math.sqrt(3));
    const u_tare = tare_uncertainty_kn;

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

  // ISO 7500-1:2015 Clause 7 / Table 2 classification.
  // A calibration point (or range) conforms to a class only if EVERY relevant
  // characteristic is within that class's maximum permissible value. The best
  // (tightest) class whose limits are all satisfied is returned.
  // v (reversibility) is only assessed "when required" (Table 2 footnote a); pass
  // null to omit it from the check.
  classifyMeasurement(q, b, f0, a, v = null) {
    const aq = Math.abs(parseFloat(q));
    const ab = Math.abs(parseFloat(b));
    const af0 = Math.abs(parseFloat(f0));
    const aa = Math.abs(parseFloat(a));
    const av = (v === null || v === undefined || isNaN(parseFloat(v))) ? null : Math.abs(parseFloat(v));

    // Table 2 — maximum permissible values (%)
    const CLASSES = [
      { name: 'Class 0.5', q: 0.5, b: 0.5, v: 0.75, f0: 0.05, a: 0.25 },
      { name: 'Class 1',   q: 1.0, b: 1.0, v: 1.5,  f0: 0.10, a: 0.50 },
      { name: 'Class 2',   q: 2.0, b: 2.0, v: 3.0,  f0: 0.20, a: 1.00 },
      { name: 'Class 3',   q: 3.0, b: 3.0, v: 4.5,  f0: 0.30, a: 1.50 }
    ];

    for (const c of CLASSES) {
      if (aq <= c.q && ab <= c.b && af0 <= c.f0 && aa <= c.a && (av === null || av <= c.v)) {
        return c.name;
      }
    }
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

    // Error analysis — ISO 7500-1:2015 §6.5
    const targetForceKn = targetForceKgf * unit_scale;
    const abs_mean_kn = Math.abs(mean_kn) || 1e-9;

    // §6.5.1 Formulae (10)-(13): relative indication error is computed PER SERIES,
    // then averaged. Fi = the nominal indicated (target) force, held constant across
    // the three series; F = the per-series reference force from the proving instrument.
    const qSeries = runForcesKn.map(f =>
      (f !== null && Math.abs(f) > 1e-9) ? ((targetForceKn - f) / f) * 100 : null
    );
    const activeQ = qSeries.filter(v => v !== null);
    const accu_q = activeQ.length > 0 ? activeQ.reduce((a, b) => a + b, 0) / activeQ.length : 0;

    // §6.5.2 Formula (14): relative repeatability error b = qmax − qmin
    // (algebraic maximum and minimum of the per-series q values).
    const rep_b = activeQ.length > 1 ? (Math.max(...activeQ) - Math.min(...activeQ)) : 0;

    // §6.3 Formula (4): relative resolution a = r / Fi × 100 at this calibration point,
    // where r is the machine indicator's resolution and Fi is the indicated (target) force.
    const res_unit = parseFloat(params.resolution_kgf) || 0.01;
    const rel_res_a = Math.abs(targetForceKgf) > 1e-9 ? (Math.abs(res_unit) / Math.abs(targetForceKgf)) * 100 : 0;

    // Legacy repeatability range (%), retained ONLY to feed the unchanged uncertainty
    // budget below (Annex C); it does not drive classification.
    let rep_b_legacy = 0;
    if (abs_mean_kn > 1e-9) {
        const range = activeForces.length > 1 ? Math.max(...activeForces) - Math.min(...activeForces) : 0;
        rep_b_legacy = (range / abs_mean_kn) * 100;
    }

    // Uncertainty
    const res_kn = (parseFloat(params.resolution_kgf) || 0.01) * unit_scale;

    const uncertaintyParams = {
      rep_b_percent: rep_b_legacy,
      resolution_kn: res_kn,
      tare_uncertainty_kn: 1e-7,
      cal_uncertainty_percent: calUncertainty_percent,
      drift_percent: drift_percent,
      temperature_change_c: temperatureChange_c,
      sensitivity_ppm_per_c: params.sensitivity_ppm || 50,
      reference_force_kn: mean_kn
    };

    const uncertainty = this.calculateUncertainty(uncertaintyParams);

    // §6.4.5 Formula (5): relative zero error f0 = Fi0 / FN × 100, where
    // Fi0 is the residual indication of the machine after force removal and
    // FN is the maximum value of the calibrated range (both in the selected unit,
    // so the ratio is unit-independent). The sign is retained for reporting; the
    // magnitude is used for the Table 2 comparison.
    let f0 = 0;
    const Fi0 = parseFloat(params.residualIndication);
    const FN = parseFloat(params.maxRangeForce);
    if (!isNaN(Fi0) && !isNaN(FN) && Math.abs(FN) > 1e-9) {
        f0 = (Fi0 / FN) * 100;
    }

    // Classification — ISO 7500-1:2015 Clause 7 / Table 2 (q, b, f0, a).
    // The zero / return-to-zero point (no applied force) is not classified.
    const classification = (targetForceKgf === 0 || activeForces.length === 0)
        ? ''
        : this.classifyMeasurement(accu_q, rep_b, f0, rel_res_a);

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
      meanForce: mean_kn / unit_scale,
      repeatability_kn: s_dev_kn,
      uncertainty_kn: uncertainty.expanded_uncertainty_kn,
      relative_uncertainty_percent: uncertainty.relative_uncertainty_percent,
      accuracy_error_percent: parseFloat(accu_q.toFixed(6)),        // q  (§6.5.1)
      relative_error_percent: parseFloat(accu_q.toFixed(6)),        // q  (alias)
      repeatability_error_percent: parseFloat(rep_b.toFixed(6)),    // b  (§6.5.2)
      relative_resolution_percent: parseFloat(rel_res_a.toFixed(6)),// a  (§6.3)
      zero_error_percent: parseFloat(f0.toFixed(6)),                // f0 (§6.4.5)
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
