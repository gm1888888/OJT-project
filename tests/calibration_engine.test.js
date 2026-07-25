// tests/calibration_engine.test.js
//
// Unit tests for services/calibration_engine.js — pure ISO 376 math, no I/O.
//
// Expected values in these tests are computed independently (via standalone
// scripts mirroring the documented formulas, not by calling the engine
// itself) and hard-coded here. This guards against the exact class of silent
// bug documented in LESSONS_LEARNED.md ("UI/Codebase Maintenance" /
// "Mistake 4"): server.js once passed snake_case keys
// (cal_uncertainty_percent, temperature_change_c) into
// processCalibrationPoint, which actually expects camelCase
// (calUncertainty_percent, temperatureChange_c) at that call boundary, and
// calculateUncertainty in turn expects snake_case
// (cal_uncertainty_percent, temperature_change_c, sensitivity_ppm_per_c).
// A parameter-name typo at either boundary does NOT throw — it silently
// produces NaN/null uncertainty instead of an error, which is exactly why
// exact-value regression coverage (not just "is a number") matters here.

const CalibrationEngine = require('../services/calibration_engine');

describe('CalibrationEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new CalibrationEngine();
  });

  // ---------------------------------------------------------------------
  // calculateEquivalentForce — F = AD + BD^2 + CD^3
  // ---------------------------------------------------------------------
  describe('calculateEquivalentForce', () => {
    test('computes the polynomial exactly for known coefficients', () => {
      // D=2, A=1.5, B=0.01, C=0.001
      // F = 1.5*2 + 0.01*2^2 + 0.001*2^3 = 3 + 0.04 + 0.008 = 3.048
      const result = engine.calculateEquivalentForce(2, 1.5, 0.01, 0.001);
      expect(result).toBeCloseTo(3.048, 12);
    });

    test('returns 0 when deflection is 0 regardless of coefficients', () => {
      const result = engine.calculateEquivalentForce(0, 5, 5, 5);
      expect(result).toBe(0);
    });

    test('handles negative deflection correctly (odd powers flip sign)', () => {
      // D=-2, A=1.5, B=0.01, C=0.001
      // F = 1.5*(-2) + 0.01*4 + 0.001*(-8) = -3 + 0.04 - 0.008 = -2.968
      const result = engine.calculateEquivalentForce(-2, 1.5, 0.01, 0.001);
      expect(result).toBeCloseTo(-2.968, 12);
    });

    test('linear-only coefficients (B=C=0) reduce to F = A*D', () => {
      const result = engine.calculateEquivalentForce(7.25, 3, 0, 0);
      expect(result).toBeCloseTo(21.75, 12);
    });
  });

  // ---------------------------------------------------------------------
  // calculateSampleVariance
  // ---------------------------------------------------------------------
  describe('calculateSampleVariance', () => {
    test('returns 0 for fewer than 2 values', () => {
      expect(engine.calculateSampleVariance([5])).toBe(0);
      expect(engine.calculateSampleVariance([])).toBe(0);
    });

    test('applies Bessel correction (n-1 denominator) for known values', () => {
      // values 1000, 1002, 998 -> mean 1000, sq diffs 0,4,4 -> sum 8 -> /(3-1)=4
      const variance = engine.calculateSampleVariance([1000, 1002, 998]);
      expect(variance).toBeCloseTo(4, 12);
    });
  });

  // ---------------------------------------------------------------------
  // calculateUncertainty
  // ---------------------------------------------------------------------
  describe('calculateUncertainty', () => {
    test('computes u_rep from rep_b_percent (Type B rectangular distribution)', () => {
      // u_rep = (rep_b_percent/100 * abs_ref) / sqrt(12)
      // rep_b_percent=0.4, abs_ref=1000 -> u_rep = (0.004*1000)/sqrt(12) = 4/3.4641016151377544
      // w_rep = (u_rep/abs_ref)*100 = 0.11547005383792515
      const result = engine.calculateUncertainty({
        rep_b_percent: 0.4,
        resolution_kn: 0.01,
        tare_uncertainty_kn: 1e-7,
        cal_uncertainty_percent: 0.03,
        drift_percent: 0.05,
        temperature_change_c: 1.5,
        sensitivity_ppm_per_c: 40,
        reference_force_kn: 1000
      });

      expect(result.components.repeatability).toBeCloseTo(0.1154701, 7);
      expect(result.relative_uncertainty_percent).toBeCloseTo(0.2402311, 7);
      expect(result.expanded_uncertainty_kn).toBeCloseTo(2.402311387, 9);
    });

    test('short-circuits to all-zero/null when reference_force_kn is ~0', () => {
      const result = engine.calculateUncertainty({
        repeatability_kn: 1,
        resolution_kn: 1,
        tare_uncertainty_kn: 1,
        cal_uncertainty_percent: 1,
        temperature_change_c: 1,
        sensitivity_ppm_per_c: 1,
        reference_force_kn: 0
      });

      expect(result.combined_uncertainty_kn).toBe(0);
      expect(result.expanded_uncertainty_kn).toBe(0);
      expect(result.relative_combined_percent).toBeNull();
      expect(result.relative_uncertainty_percent).toBeNull();
      expect(result.components.repeatability).toBeNull();
    });

    test('REGRESSION (naming-contract guard): calculateUncertainty\'s own params are snake_case; wrong-cased keys silently NaN instead of throwing', () => {
      // Not the literal LESSONS_LEARNED incident (that was at the
      // processCalibrationPoint -> server.js boundary, covered separately
      // below) -- this locks down calculateUncertainty's OWN contract: it
      // requires cal_uncertainty_percent / temperature_change_c /
      // sensitivity_ppm_per_c. Passing the camelCase names that happen to be
      // processCalibrationPoint's *own* param names here is silently
      // swallowed rather than erroring.
      const result = engine.calculateUncertainty({
        rep_b_percent: 0.4,
        resolution_kn: 0.001,
        tare_uncertainty_kn: 0.0005,
        calUncertainty_percent: 0.05, // WRONG KEY (should be cal_uncertainty_percent)
        drift_percent: 0.05,
        temperatureChange_c: 2,       // WRONG KEY (should be temperature_change_c)
        sensitivity_ppm: 50,          // WRONG KEY (should be sensitivity_ppm_per_c)
        reference_force_kn: 10
      });

      // Does NOT throw, and does NOT fall back to a sane default -- silently NaN.
      // (Note: JSON.stringify/console.log would print these as `null` since
      // JSON has no NaN representation -- but the actual in-memory value the
      // caller receives is NaN, which is what matters for downstream math.)
      expect(Number.isNaN(result.combined_uncertainty_kn)).toBe(true);
      expect(Number.isNaN(result.expanded_uncertainty_kn)).toBe(true);
      expect(Number.isNaN(result.components.calibration)).toBe(true);
      expect(Number.isNaN(result.components.temperature)).toBe(true);
      // Unaffected components (correctly-named keys) still compute fine,
      // which is exactly what makes this bug easy to miss visually.
      // u_rep = (rep_b_percent/100 * abs_ref) / sqrt(12), w_rep = rep_b_percent/sqrt(12)
      // rep_b_percent=0.4 -> w_rep = 0.4/sqrt(12) = 0.11547005383792515
      expect(result.components.repeatability).toBeCloseTo(0.1154701, 7);
    });
  });

  // ---------------------------------------------------------------------
  // classifyMeasurement — ISO 7500-1:2015 Table 2
  // ---------------------------------------------------------------------
  describe('classifyMeasurement', () => {
    test('exact Class 0.5 boundary values classify as Class 0.5', () => {
      expect(engine.classifyMeasurement(0.5, 0.5, 0.05, 0.25)).toBe('Class 0.5');
    });

    test('just over the Class 0.5 q-limit bumps to Class 1', () => {
      expect(engine.classifyMeasurement(0.51, 0.5, 0.05, 0.25)).toBe('Class 1');
    });

    test('exact Class 1 boundary values classify as Class 1', () => {
      expect(engine.classifyMeasurement(1.0, 1.0, 0.10, 0.50)).toBe('Class 1');
    });

    test('exact Class 2 boundary values classify as Class 2', () => {
      expect(engine.classifyMeasurement(2.0, 2.0, 0.20, 1.00)).toBe('Class 2');
    });

    test('exact Class 3 boundary values classify as Class 3', () => {
      expect(engine.classifyMeasurement(3.0, 3.0, 0.30, 1.50)).toBe('Class 3');
    });

    test('values beyond every class limit classify as Outside Class', () => {
      expect(engine.classifyMeasurement(3.01, 3.0, 0.30, 1.50)).toBe('Outside Class');
      expect(engine.classifyMeasurement(3.5, 3.5, 0.5, 2.0)).toBe('Outside Class');
    });

    test('negative inputs are handled via absolute value', () => {
      expect(engine.classifyMeasurement(-0.5, -0.5, -0.05, -0.25)).toBe('Class 0.5');
    });

    test('v=null omits reversibility from the check (defaults to satisfied)', () => {
      // q/b/f0/a all within Class 0.5, v is huge but null -> still Class 0.5
      expect(engine.classifyMeasurement(0.5, 0.5, 0.05, 0.25, null)).toBe('Class 0.5');
    });

    test('v provided and within Class 0.5 v-limit keeps Class 0.5', () => {
      expect(engine.classifyMeasurement(0.5, 0.5, 0.05, 0.25, 0.75)).toBe('Class 0.5');
    });

    test('v provided but exceeding Class 0.5 v-limit (0.75) bumps to Class 1', () => {
      // q/b/f0/a still satisfy Class 0.5, but v=1.0 only satisfies Class 1's v<=1.5
      expect(engine.classifyMeasurement(0.5, 0.5, 0.05, 0.25, 1.0)).toBe('Class 1');
    });

    test('v provided and exceeding every class v-limit (4.5) is Outside Class', () => {
      expect(engine.classifyMeasurement(0.5, 0.5, 0.05, 0.25, 5.0)).toBe('Outside Class');
    });
  });

  // ---------------------------------------------------------------------
  // processCalibrationPoint — full end-to-end pipeline
  // ---------------------------------------------------------------------
  describe('processCalibrationPoint', () => {
    test('end-to-end result matches hand-computed values for a realistic 3-series point', () => {
      // See PR notes for the full independent derivation of every field below.
      // Setup: coeffA=1, coeffB=0, coeffC=0 so calculateEquivalentForce(D) = D
      // exactly, series_m == targetForceKgf so interpolation is the identity,
      // and unit_scale=1 so targetForceKn == targetForceKgf, all chosen to make
      // hand-verification of every intermediate tractable.
      const params = {
        targetForceKgf: 1000,
        unit_scale: 1,
        series1_m: 1000, series2_m: 1000, series3_m: 1000,
        series1_mvv: 1000.0, series2_mvv: 1002.0, series3_mvv: 998.0,
        zeroBaseline1: 0, zeroBaseline2: 0, zeroBaseline3: 0,
        coeffA: 1, coeffB: 0, coeffC: 0,
        calUncertainty_percent: 0.03,
        drift_percent: 0.05,
        temperatureChange_c: 1.5,
        sensitivity_ppm: 40,
        resolution_kgf: 0.01,
        residualIndication: 0,
        maxRangeForce: 1000
      };

      const result = engine.processCalibrationPoint(params);

      // Per-series equivalent force (kN), mean and repeatability (sample std dev)
      expect(result.series1_kn).toBeCloseTo(1000, 9);
      expect(result.series2_kn).toBeCloseTo(1002, 9);
      expect(result.series3_kn).toBeCloseTo(998, 9);
      expect(result.meanForceKn).toBeCloseTo(1000, 9);
      expect(result.repeatability_kn).toBeCloseTo(2, 9);

      // Error analysis (ISO 7500-1 §6.5)
      expect(result.accuracy_error_percent).toBeCloseTo(0.000267, 6);
      expect(result.repeatability_error_percent).toBeCloseTo(0.400002, 6);
      expect(result.relative_resolution_percent).toBeCloseTo(0.001, 6);
      expect(result.zero_error_percent).toBe(0);

      // Uncertainty budget (camelCase params correctly wired into the
      // snake_case calculateUncertainty call internally -- this is the
      // exact boundary LESSONS_LEARNED flags as previously broken)
      expect(result.uncertainty_kn).toBeCloseTo(2.402311387, 9);
      expect(result.relative_uncertainty_percent).toBeCloseTo(0.2402311, 7);
      expect(result.w_comb_percent).toBeCloseTo(0.1201156, 7);

      // Classification: q~0.000267, b~0.400002, f0=0, a=0.001 -- all within
      // Class 0.5 limits (0.5 / 0.5 / 0.05 / 0.25)
      expect(result.classification).toBe('Class 0.5');
    });

    test('REGRESSION (LESSONS_LEARNED Mistake 4, literal boundary): passing snake_case uncertainty keys into processCalibrationPoint (which requires camelCase) silently NaNs the uncertainty', () => {
      // This is the ACTUAL historical incident: server.js built a live-recalc
      // payload using cal_uncertainty_percent / temperature_change_c
      // (snake_case) and passed it to processCalibrationPoint, which
      // destructures calUncertainty_percent / temperatureChange_c
      // (camelCase). Same fixture as the good-path test above (verified
      // expected values), only the uncertainty-related keys are wrong-cased.
      const badParams = {
        targetForceKgf: 1000,
        unit_scale: 1,
        series1_m: 1000, series2_m: 1000, series3_m: 1000,
        series1_mvv: 1000.0, series2_mvv: 1002.0, series3_mvv: 998.0,
        zeroBaseline1: 0, zeroBaseline2: 0, zeroBaseline3: 0,
        coeffA: 1, coeffB: 0, coeffC: 0,
        cal_uncertainty_percent: 0.03,  // WRONG (engine reads params.calUncertainty_percent)
        temperature_change_c: 1.5,      // WRONG (engine reads params.temperatureChange_c)
        resolution_kgf: 0.01,
        residualIndication: 0,
        maxRangeForce: 1000
      };

      const result = engine.processCalibrationPoint(badParams);

      // Geometry/classification (unaffected by the uncertainty mismatch)
      // still compute correctly, which is exactly why this bug is easy to
      // miss in a manual smoke test -- everything LOOKS fine except the
      // uncertainty figure.
      expect(result.meanForceKn).toBeCloseTo(1000, 9);
      expect(result.classification).toBe('Class 0.5');

      // Uncertainty silently NaNs instead of throwing or erroring.
      expect(Number.isNaN(result.uncertainty_kn)).toBe(true);
      expect(Number.isNaN(result.relative_uncertainty_percent)).toBe(true);
      expect(Number.isNaN(result.w_comb_percent)).toBe(true);
    });

    test('REGRESSION (naming-contract guard): a wrong-cased sensitivity_ppm_per_c key is silently ignored in favor of the hardcoded 50 ppm/C default -- a plausible-looking WRONG number, not NaN', () => {
      // The most dangerous variant of this bug class: params.sensitivity_ppm
      // is read with `|| 50`, so a caller who (mis-)supplies
      // sensitivity_ppm_per_c instead of sensitivity_ppm gets no error and
      // no NaN -- just a silently substituted default that may not match
      // the transducer's actual temperature sensitivity.
      const base = {
        targetForceKgf: 1000, unit_scale: 1,
        series1_m: 1000, series2_m: 1000, series3_m: 1000,
        series1_mvv: 1000.0, series2_mvv: 1002.0, series3_mvv: 998.0,
        zeroBaseline1: 0, zeroBaseline2: 0, zeroBaseline3: 0,
        coeffA: 1, coeffB: 0, coeffC: 0,
        calUncertainty_percent: 0.03,
        temperatureChange_c: 1.5,
        resolution_kgf: 0.01,
        residualIndication: 0,
        maxRangeForce: 1000
      };

      const wrongKey = engine.processCalibrationPoint({ ...base, sensitivity_ppm_per_c: 999 });
      const correctKeyDefault = engine.processCalibrationPoint({ ...base, sensitivity_ppm: 50 });
      const correctKeyExplicit = engine.processCalibrationPoint({ ...base, sensitivity_ppm: 999 });

      // The wrong-cased key of 999 is fully ignored -- output matches the
      // hardcoded default (50), not a value derived from 999.
      expect(wrongKey.uncertainty_kn).toBeCloseTo(correctKeyDefault.uncertainty_kn, 9);
      expect(wrongKey.uncertainty_kn).not.toBeCloseTo(correctKeyExplicit.uncertainty_kn, 6);
      // Locks the exact default-fallback value so a future engine change is caught.
      expect(wrongKey.uncertainty_kn).toBeCloseTo(2.403996672, 9);
    });

    test('the zero / return-to-zero point (targetForceKgf=0) is not classified', () => {
      const result = engine.processCalibrationPoint({
        targetForceKgf: 0,
        unit_scale: 1,
        series1_m: 1000, series2_m: 1000, series3_m: 1000,
        series1_mvv: 0.001, series2_mvv: -0.001, series3_mvv: 0.0005,
        zeroBaseline1: 0, zeroBaseline2: 0, zeroBaseline3: 0,
        coeffA: 1, coeffB: 0, coeffC: 0,
        calUncertainty_percent: 0.03,
        temperatureChange_c: 1.5,
        sensitivity_ppm: 40
      });

      expect(result.classification).toBe('');
    });

    test('missing series data (all null) does not throw and yields zeroed forces', () => {
      const result = engine.processCalibrationPoint({
        targetForceKgf: 500,
        unit_scale: 1,
        coeffA: 1, coeffB: 0, coeffC: 0,
        calUncertainty_percent: 0.03,
        temperatureChange_c: 1.5,
        sensitivity_ppm: 40
      });

      expect(result.meanForceKn).toBe(0);
      expect(result.repeatability_kn).toBe(0);
      expect(result.classification).toBe('');
    });
  });
});
