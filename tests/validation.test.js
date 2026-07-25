// tests/validation.test.js
//
// Tests for the zod schemas backing the two import endpoints
// (POST /api/import/project, POST /api/import/standards).
//
// WHY THIS IS SCHEMA-ONLY (no supertest / HTTP integration test against
// server.js):
//   server.js cannot be required cleanly in a Jest process without real,
//   unavoidable side effects:
//     1. `app.listen(PORT, ...)` at server.js:~1477 runs unconditionally at
//        module load -- there is no `if (require.main === module)` guard
//        and `app` is never exported -- so merely requiring the file binds
//        a real TCP port.
//     2. `new DatabaseSync(process.env.DB_PATH || './calibration_data.db')`
//        runs unconditionally at module load too, opening the file in
//        read-WRITE mode and running `initDatabase()` (CREATE TABLE /
//        ALTER TABLE migrations) against the real production SQLite file
//        unless DB_PATH is overridden -- and even then it's a real file on
//        disk, not an isolated in-memory fixture, and the server never
//        closes it.
//     3. `new DMP41Interface(...)` is constructed at module load (though it
//        does not itself open a socket in the constructor).
//   Refactoring server.js's boot sequence (adding a require.main guard,
//   exporting `app`, parameterizing the DB connection for tests) is exactly
//   the kind of "risky refactor to make it testable" the task explicitly
//   said not to do. So instead, this file unit-tests the validation module
//   directly -- which is pure, has no I/O, and is exactly what server.js's
//   two import routes call before touching the database.
//
//   The one exception is the "real calibration_data.db round-trip" describe
//   block near the bottom of this file: that opens the SAME database file,
//   but explicitly `{ readOnly: true }`, issues only SELECT statements, and
//   calls `db.close()` in a `finally` block -- it never runs `initDatabase()`
//   or any migration/write, so it carries none of the risk described above.

const {
  importProjectSchema,
  importStandardsSchema,
  projectPayloadSchema,
  testPointSchema,
  referenceStandardSchema,
  formatZodError
} = require('../validation');

describe('importProjectSchema', () => {
  test('accepts a minimal valid payload and defaults duplicate_strategy to "copy"', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'Acme Load Cell 1' }
    });
    expect(result.success).toBe(true);
    expect(result.data.duplicate_strategy).toBe('copy');
    expect(result.data.points).toEqual([]);
  });

  test('accepts a fully-populated project + points payload', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      duplicate_strategy: 'replace',
      project: {
        project_name: 'Full Project',
        client_name: 'Client Co',
        capacity_kgf: 5000,
        range_min_kgf: 0,
        range_max_kgf: 5000,
        coeff_a: 1.001,
        coeff_b: 0.0002,
        coeff_c: 0.00003,
        ref_unc: 0.02,
        resolution: 0.5,
        zero_return_mvv: 0.0001,
        is_archived: 0
      },
      points: [
        {
          stage_name: 'Stage 1',
          target_value_kgf: 1000,
          raw_reading_mvv: 5.001,
          measurement_sequence: 1,
          series_number: 1,
          is_zero_return: 0,
          is_valid: 1
        }
      ]
    });
    expect(result.success).toBe(true);
    expect(result.data.project.project_name).toBe('Full Project');
    expect(result.data.points).toHaveLength(1);
  });

  test('rejects when type is missing or wrong', () => {
    const missing = importProjectSchema.safeParse({ project: { project_name: 'X' } });
    expect(missing.success).toBe(false);

    const wrong = importProjectSchema.safeParse({
      type: 'SOMETHING_ELSE',
      project: { project_name: 'X' }
    });
    expect(wrong.success).toBe(false);
  });

  test('rejects when project is missing entirely', () => {
    const result = importProjectSchema.safeParse({ type: 'DMP41_PROJECT_EXPORT' });
    expect(result.success).toBe(false);
  });

  test('rejects when project.project_name is missing', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: {}
    });
    expect(result.success).toBe(false);
  });

  test('rejects when project.project_name is an empty string', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: '   ' }
    });
    expect(result.success).toBe(false);
  });

  test('rejects when project.project_name is the wrong type', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 12345 }
    });
    expect(result.success).toBe(false);
  });

  test('rejects when a numeric project field has the wrong type', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'X', capacity_kgf: 'five thousand' }
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-finite numbers (NaN / Infinity) in numeric fields', () => {
    const nanResult = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'X', coeff_a: NaN }
    });
    expect(nanResult.success).toBe(false);

    const infResult = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'X', coeff_a: Infinity }
    });
    expect(infResult.success).toBe(false);
  });

  test('rejects when points is present but not an array', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'X' },
      points: { stage_name: 'not an array' }
    });
    expect(result.success).toBe(false);
  });

  test('rejects when a point entry has a malformed field type', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'X' },
      points: [{ stage_name: 'Stage 1', target_value_kgf: 'not a number' }]
    });
    expect(result.success).toBe(false);
  });

  test('rejects an invalid duplicate_strategy value', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'X' },
      duplicate_strategy: 'overwrite-everything'
    });
    expect(result.success).toBe(false);
  });

  test('accepts each valid duplicate_strategy value', () => {
    for (const strat of ['copy', 'skip', 'replace']) {
      const result = importProjectSchema.safeParse({
        type: 'DMP41_PROJECT_EXPORT',
        project: { project_name: 'X' },
        duplicate_strategy: strat
      });
      expect(result.success).toBe(true);
      expect(result.data.duplicate_strategy).toBe(strat);
    }
  });

  test('accepts project.resolution as either a number or a display string (real data uses "0.01 kN")', () => {
    // resolution is REAL in the original CREATE TABLE, but production rows
    // store free text like "0.01 kN" (server.js reads it defensively via
    // parseFloat(project.resolution) || 0.01 at every call site). The
    // schema must accept both shapes or a real exported project 400s on
    // re-import.
    const numeric = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'X', resolution: 0.01 }
    });
    expect(numeric.success).toBe(true);
    expect(numeric.data.project.resolution).toBe(0.01);

    const text = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'X', resolution: '0.01 kN' }
    });
    expect(text.success).toBe(true);
    expect(text.data.project.resolution).toBe('0.01 kN');
  });

  test('coerces missing optional project fields to null (never undefined)', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: { project_name: 'X' }
    });
    expect(result.success).toBe(true);
    // Every optional field the INSERT statement binds must resolve to null,
    // never undefined -- node:sqlite's DatabaseSync throws on undefined bind
    // params ("Provided value cannot be bound to SQLite parameter N").
    const p = result.data.project;
    for (const key of Object.keys(p)) {
      if (key === 'project_name') continue;
      expect(p[key]).not.toBeUndefined();
    }
    expect(p.client_name).toBeNull();
    expect(p.coeff_a).toBeNull();
  });
});

describe('importStandardsSchema', () => {
  test('accepts a valid REFERENCE_STANDARDS_BUNDLE payload', () => {
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARDS_BUNDLE',
      standards: [
        { model: 'HBM-100', serial_number: 'SN-001', capacity_kn: 100 },
        { model: 'HBM-200', serial_number: 'SN-002' }
      ]
    });
    expect(result.success).toBe(true);
    expect(result.data.standards).toHaveLength(2);
  });

  test('accepts a valid REFERENCE_STANDARD_SINGLE payload', () => {
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARD_SINGLE',
      standard: { model: 'HBM-100', serial_number: 'SN-001' }
    });
    expect(result.success).toBe(true);
    expect(result.data.standard.model).toBe('HBM-100');
  });

  test('rejects an unrecognized type discriminator', () => {
    const result = importStandardsSchema.safeParse({ type: 'GARBAGE' });
    expect(result.success).toBe(false);
  });

  test('rejects REFERENCE_STANDARDS_BUNDLE when standards is missing', () => {
    const result = importStandardsSchema.safeParse({ type: 'REFERENCE_STANDARDS_BUNDLE' });
    expect(result.success).toBe(false);
  });

  test('rejects REFERENCE_STANDARDS_BUNDLE when standards is not an array', () => {
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARDS_BUNDLE',
      standards: { model: 'HBM-100', serial_number: 'SN-001' }
    });
    expect(result.success).toBe(false);
  });

  test('accepts REFERENCE_STANDARDS_BUNDLE with an empty standards array (legitimate no-op export)', () => {
    // /api/export/standards/all on an empty load_cells_reference table
    // returns exactly this shape, and it must still import as a no-op
    // (processed: 0), not be rejected as malformed.
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARDS_BUNDLE',
      standards: []
    });
    expect(result.success).toBe(true);
    expect(result.data.standards).toEqual([]);
  });

  test('rejects REFERENCE_STANDARD_SINGLE when standard is missing', () => {
    const result = importStandardsSchema.safeParse({ type: 'REFERENCE_STANDARD_SINGLE' });
    expect(result.success).toBe(false);
  });

  test('rejects a standard missing the required model field', () => {
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARD_SINGLE',
      standard: { serial_number: 'SN-001' }
    });
    expect(result.success).toBe(false);
  });

  test('rejects a standard missing the required serial_number field', () => {
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARD_SINGLE',
      standard: { model: 'HBM-100' }
    });
    expect(result.success).toBe(false);
  });

  test('rejects a standard with an empty-string model', () => {
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARD_SINGLE',
      standard: { model: '', serial_number: 'SN-001' }
    });
    expect(result.success).toBe(false);
  });

  test('rejects a standard with a wrong-typed numeric coefficient field', () => {
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARD_SINGLE',
      standard: { model: 'HBM-100', serial_number: 'SN-001', coeff_a_compression: 'one' }
    });
    expect(result.success).toBe(false);
  });

  test('rejects when one entry within a bundle array is malformed', () => {
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARDS_BUNDLE',
      standards: [
        { model: 'HBM-100', serial_number: 'SN-001' },
        { model: 'HBM-200' } // missing serial_number
      ]
    });
    expect(result.success).toBe(false);
  });

  test('coerces missing optional standard fields to null (never undefined)', () => {
    const result = importStandardsSchema.safeParse({
      type: 'REFERENCE_STANDARD_SINGLE',
      standard: { model: 'HBM-100', serial_number: 'SN-001' }
    });
    expect(result.success).toBe(true);
    const s = result.data.standard;
    for (const key of Object.keys(s)) {
      if (key === 'model' || key === 'serial_number') continue;
      expect(s[key]).not.toBeUndefined();
    }
    expect(s.capacity_kn).toBeNull();
    expect(s.coeff_a_compression).toBeNull();
  });
});

describe('testPointSchema (used within importProjectSchema.points)', () => {
  test('accepts an empty object -- every field is optional', () => {
    const result = testPointSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('rejects a non-integer measurement_sequence', () => {
    const result = testPointSchema.safeParse({ measurement_sequence: 1.5 });
    expect(result.success).toBe(false);
  });

  test('strips unknown keys (e.g. id, project_id from a raw SELECT *) rather than rejecting them', () => {
    // Export payloads are built from `SELECT * FROM test_points`, which
    // includes `id` and `project_id` -- neither is a column the schema
    // knows about (project_id is supplied separately from
    // result.lastInsertRowid at insert time). Default zod object behavior
    // strips unrecognized keys; this locks that in so a future `.strict()`
    // wouldn't silently start 400-ing every real export.
    const result = testPointSchema.safeParse({ id: 7, project_id: 3, stage_name: 'S' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('id');
    expect(result.data).not.toHaveProperty('project_id');
  });
});

describe('projectPayloadSchema / referenceStandardSchema (direct)', () => {
  test('projectPayloadSchema trims whitespace-only project_name to a rejection', () => {
    expect(projectPayloadSchema.safeParse({ project_name: '' }).success).toBe(false);
  });

  test('projectPayloadSchema strips unknown keys (id, status, created_at, updated_at from a raw SELECT *)', () => {
    // A real exported project row carries id/status/created_at/updated_at;
    // status is hardcoded to 'Saved' by the INSERT regardless, and id is
    // never reused (a new row is always created on import). These must be
    // stripped, not rejected, or every real export would 400 on re-import.
    const result = projectPayloadSchema.safeParse({
      id: 1,
      project_name: 'X',
      status: 'Saved',
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00'
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('id');
    expect(result.data).not.toHaveProperty('status');
    expect(result.data).not.toHaveProperty('created_at');
    expect(result.data).not.toHaveProperty('updated_at');
  });

  test('referenceStandardSchema requires both model and serial_number simultaneously', () => {
    expect(referenceStandardSchema.safeParse({ model: 'X', serial_number: 'Y' }).success).toBe(true);
    expect(referenceStandardSchema.safeParse({ model: 'X' }).success).toBe(false);
    expect(referenceStandardSchema.safeParse({ serial_number: 'Y' }).success).toBe(false);
  });
});

describe('formatZodError', () => {
  test('never leaks raw SQL / internal error details, only field path + message', () => {
    const result = importProjectSchema.safeParse({ type: 'DMP41_PROJECT_EXPORT', project: {} });
    expect(result.success).toBe(false);
    const formatted = formatZodError(result.error);

    expect(formatted.error).toBe('Invalid request payload.');
    expect(Array.isArray(formatted.details)).toBe(true);
    expect(formatted.details.length).toBeGreaterThan(0);
    expect(formatted.details[0]).toContain('project_name');

    // Sanity check: nothing resembling a SQL fragment ends up in the response.
    const serialized = JSON.stringify(formatted);
    expect(serialized.toUpperCase()).not.toContain('INSERT INTO');
    expect(serialized.toUpperCase()).not.toContain('SELECT ');
  });

  test('caps the details list so large payloads cannot produce huge error responses', () => {
    const result = importProjectSchema.safeParse({
      type: 'DMP41_PROJECT_EXPORT',
      project: {
        project_name: 'X',
        capacity_kgf: 'a', range_min_kgf: 'b', range_max_kgf: 'c',
        coeff_a: 'd', coeff_b: 'e', coeff_c: 'f', ref_unc: 'g',
        resolution: 'h', zero_return_mvv: 'i', temperature_before: 'j',
        temperature_after: 'k', humidity_before: 'l', humidity_after: 'm'
      }
    });
    expect(result.success).toBe(false);
    const formatted = formatZodError(result.error);
    expect(formatted.details.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Real-data round-trip regression guard.
//
// Hand-authored payloads can miss shapes that only show up in real exported
// rows (e.g. the `resolution` column above). This reads the actual project
// SQLite file (read-only, no writes, connection closed at the end) and
// asserts every row currently in it round-trips through the export ->
// import schema shape without being rejected. If this ever fails, it means
// either (a) the schema is stricter than production data actually is (fix
// the schema), or (b) a genuinely malformed row exists in the DB (investigate
// separately) -- either way it should never be silently ignored.
// ---------------------------------------------------------------------------
describe('real calibration_data.db round-trip (regression guard)', () => {
  const path = require('path');
  const fs = require('fs');
  const dbPath = path.join(__dirname, '..', 'calibration_data.db');
  const hasDb = fs.existsSync(dbPath);
  const maybeTest = hasDb ? test : test.skip;

  maybeTest('every existing calibration_projects row parses as a valid DMP41_PROJECT_EXPORT payload', () => {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const projects = db.prepare('SELECT * FROM calibration_projects').all();
      const ptStmt = db.prepare('SELECT * FROM test_points WHERE project_id = ?');
      for (const p of projects) {
        const points = ptStmt.all(p.id);
        const result = importProjectSchema.safeParse({
          type: 'DMP41_PROJECT_EXPORT',
          project: p,
          points
        });
        if (!result.success) {
          throw new Error(
            `Project id=${p.id} name=${p.project_name} failed validation: ` +
            JSON.stringify(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`))
          );
        }
      }
    } finally {
      db.close();
    }
  });

  maybeTest('every existing load_cells_reference row parses as a valid REFERENCE_STANDARD_SINGLE payload', () => {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const standards = db.prepare('SELECT * FROM load_cells_reference').all();
      for (const s of standards) {
        const result = importStandardsSchema.safeParse({
          type: 'REFERENCE_STANDARD_SINGLE',
          standard: s
        });
        if (!result.success) {
          throw new Error(
            `Standard id=${s.id} model=${s.model} failed validation: ` +
            JSON.stringify(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`))
          );
        }
      }
    } finally {
      db.close();
    }
  });
});
