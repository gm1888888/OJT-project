// validation.js
//
// Zod schemas for the two import endpoints in server.js:
//   POST /api/import/project
//   POST /api/import/standards
//
// These endpoints take arbitrary JSON from an uploaded export file and feed
// fields straight into parameterized SQL INSERTs. Kept separate from
// server.js so the schemas can be unit tested without requiring server.js
// (which opens a real DB connection and binds a real port at module load).
//
// Design notes:
//  - Fields that are optional in the DB schema are made `.nullish()` and
//    transformed to `null` when absent, because node:sqlite's DatabaseSync
//    throws ("Provided value cannot be bound to SQLite parameter N") if a
//    bind parameter is `undefined`. Coercing missing optional fields to
//    `null` avoids that crash while still rejecting genuinely wrong types.
//  - Numeric fields: z.coerce.number() is deliberately AVOIDED: export
//    files are expected to carry real JSON numbers (as produced by our own
//    /api/export/* routes), so we validate strict number types rather than
//    silently coercing strings, to catch corrupted/hand-edited files.

const { z } = require('zod');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Optional string: undefined/null -> null; must be a string if present.
const optionalString = () => z.string().nullish().transform((v) => v ?? null);

// Optional number: undefined/null -> null; must be a finite number if present.
const optionalNumber = () =>
  z.number().finite().nullish().transform((v) => v ?? null);

// Optional integer: undefined/null -> null; must be an integer if present.
const optionalInt = () =>
  z.number().int().nullish().transform((v) => v ?? null);

// `resolution` on calibration_projects is nominally REAL in the original
// CREATE TABLE, but production data shows it is actually used as a free-text
// display field (e.g. "0.01 kN") -- server.js itself defensively does
// `parseFloat(project.resolution) || 0.01` at every read site (see
// server.js:658, 825, 1175, 1275) rather than trusting it to be numeric.
// Accept either shape here so a real exported project round-trips cleanly.
const optionalNumberOrString = () =>
  z.union([z.number().finite(), z.string()]).nullish().transform((v) => v ?? null);

// Optional "boolean-ish" 0/1 flag as stored in SQLite (no native boolean type).
const optionalFlag = () =>
  z
    .union([z.number().int().min(0).max(1), z.boolean()])
    .nullish()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      return v === true ? 1 : v === false ? 0 : v;
    });

// ---------------------------------------------------------------------------
// Task 1a: POST /api/import/project
// ---------------------------------------------------------------------------

const testPointSchema = z.object({
  stage_name: optionalString(),
  target_value_kgf: optionalNumber(),
  measurement_sequence: optionalInt(),
  angular_position: optionalString(),
  raw_reading_mvv: optionalNumber(),
  zero_corrected_mvv: optionalNumber(),
  equivalent_force_kn: optionalNumber(),
  machine_indicated_kgf: optionalNumber(),
  series_number: optionalInt(),
  is_zero_return: optionalFlag(),
  reading_timestamp: optionalString(),
  is_valid: optionalFlag(),
  notes: optionalString()
});

const projectPayloadSchema = z.object({
  project_name: z.string().trim().min(1, 'project_name is required'),
  client_name: optionalString(),
  client_address: optionalString(),
  instrument_name: optionalString(),
  serial_number: optionalString(),
  capacity_kgf: optionalNumber(),
  range_min_kgf: optionalNumber(),
  range_max_kgf: optionalNumber(),
  input_unit: optionalString(),
  output_unit: optionalString(),
  calibration_date: optionalString(),
  mode: optionalString(),
  temperature_before: optionalNumber(),
  temperature_after: optionalNumber(),
  humidity_before: optionalNumber(),
  humidity_after: optionalNumber(),
  coeff_a: optionalNumber(),
  coeff_b: optionalNumber(),
  coeff_c: optionalNumber(),
  ref_unc: optionalNumber(),
  resolution: optionalNumberOrString(),
  zero_return_mvv: optionalNumber(),
  notes: optionalString(),
  make_model: optionalString(),
  increment: optionalString(),
  range_text: optionalString(),
  ref_model: optionalString(),
  ref_capacity: optionalString(),
  ref_sn: optionalString(),
  ref_cert: optionalString(),
  ref_date: optionalString(),
  is_archived: optionalFlag(),
  lc_make: optionalString(),
  lc_sn: optionalString(),
  ind_make: optionalString(),
  ind_sn: optionalString(),
  capacity_text: optionalString(),
  standard_id: optionalString()
});

const importProjectSchema = z.object({
  type: z.literal('DMP41_PROJECT_EXPORT', {
    message: "type must be 'DMP41_PROJECT_EXPORT'"
  }),
  project: projectPayloadSchema,
  points: z.array(testPointSchema).nullish().transform((v) => v ?? []),
  duplicate_strategy: z.enum(['copy', 'skip', 'replace']).default('copy')
});

// ---------------------------------------------------------------------------
// Task 1b: POST /api/import/standards
// ---------------------------------------------------------------------------

const referenceStandardSchema = z.object({
  model: z.string().trim().min(1, 'model is required'),
  serial_number: z.string().trim().min(1, 'serial_number is required'),
  description: optionalString(),
  capacity_kn: optionalNumber(),
  calibration_certificate: optionalString(),
  calibration_date: optionalString(),
  coeff_a_compression: optionalNumber(),
  coeff_b_compression: optionalNumber(),
  coeff_c_compression: optionalNumber(),
  uncertainty_compression_percent: optionalNumber(),
  coeff_a_tension: optionalNumber(),
  coeff_b_tension: optionalNumber(),
  coeff_c_tension: optionalNumber(),
  uncertainty_tension_percent: optionalNumber(),
  next_calibration_date: optionalString()
});

const importStandardsSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('REFERENCE_STANDARDS_BUNDLE'),
    // Empty is legitimate here: /api/export/standards/all returns
    // { standards: [] } for a database with no reference standards yet,
    // and that payload must still import cleanly (as a no-op, processed: 0).
    standards: z.array(referenceStandardSchema)
  }),
  z.object({
    type: z.literal('REFERENCE_STANDARD_SINGLE'),
    standard: referenceStandardSchema
  })
]);

// ---------------------------------------------------------------------------
// Formatting helper: turn a ZodError into a compact, safe client message.
// Never includes raw SQL / internal details — just field paths + issue text.
// ---------------------------------------------------------------------------

function formatZodError(zodError) {
  const issues = zodError.issues || [];
  const details = issues
    .slice(0, 10) // cap to keep the response small
    .map((issue) => {
      const path = issue.path && issue.path.length ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    });
  return {
    error: 'Invalid request payload.',
    details
  };
}

module.exports = {
  importProjectSchema,
  importStandardsSchema,
  projectPayloadSchema,
  testPointSchema,
  referenceStandardSchema,
  formatZodError
};
