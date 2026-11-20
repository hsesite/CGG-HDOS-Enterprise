/**
 * HDOS Read-only Diagnostic API
 *
 * Security contract:
 * - POST only; dedicated Script Property secret (HDOS_DIAGNOSTICS_TOKEN).
 * - Does not use getSheet_(), because that helper can create missing sheets.
 * - Does not write, clear, create, migrate, flush, or trigger anything.
 * - Returns aggregate counts and schema metadata only; no row values, emails,
 *   credentials, Drive IDs, tokens, or operational descriptions.
 *
 * Request:
 * POST { "path": "/api/diagnostics/report",
 *        "payload": { "diagnosticToken": "<secret>" } }
 */
function handleReadOnlyDiagnostics_(params) {
  const properties = PropertiesService.getScriptProperties();
  const expectedToken = String(properties.getProperty('HDOS_DIAGNOSTICS_TOKEN') || '');
  const payload = params && params.payload && typeof params.payload === 'object'
    ? params.payload
    : {};
  const suppliedToken = String(payload.diagnosticToken || '');

  if (!expectedToken || !constantTimeDiagnosticTokenMatch_(suppliedToken, expectedToken)) {
    return error_(401, 'Diagnostic authorization failed.');
  }

  try {
    const spreadsheetId = String(properties.getProperty('HDOS_SPREADSHEET_ID') || CONFIG.SPREADSHEET_ID || '').trim();
    if (!spreadsheetId) return error_(503, 'Database belum dikonfigurasi.');

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const validation = validateDatabaseSpreadsheet_(spreadsheet);
    const requiredSheets = CONFIG.SHEETS.concat(['repository']);
    const sheetStats = {};
    requiredSheets.forEach(function(name) {
      const sheet = spreadsheet.getSheetByName(name);
      sheetStats[name] = sheet ? {
        exists: true,
        rows: Math.max(0, sheet.getLastRow() - 1),
        columns: sheet.getLastColumn()
      } : { exists: false, rows: 0, columns: 0 };
    });

    const integrity = collectReadOnlyIntegritySummary_(spreadsheet);
    const readiness = getHealthReadiness_();
    const readinessData = readiness && readiness.data ? readiness.data : {};

    return success_({
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      liveDatabaseChanged: false,
      readiness: readinessData,
      schema: {
        valid: validation.valid,
        missingSheetCount: validation.missingSheets.length,
        invalidSchemaSheetCount: validation.invalidSheets.length,
        missingSheets: validation.missingSheets,
        invalidSheets: validation.invalidSheets
      },
      sheets: sheetStats,
      integrity: integrity
    });
  } catch (error) {
    // Never return raw exception messages; they can contain infrastructure details.
    return error_(500, 'Diagnostic gagal dijalankan. Periksa Apps Script execution log.');
  }
}

function constantTimeDiagnosticTokenMatch_(provided, expected) {
  if (!provided || !expected) return false;
  let mismatch = provided.length ^ expected.length;
  const length = Math.max(provided.length, expected.length);
  for (let i = 0; i < length; i++) {
    mismatch |= (provided.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function collectReadOnlyIntegritySummary_(spreadsheet) {
  const result = {
    hazards: { records: 0, missingPhoto: 0, duplicateCodeGroups: 0 },
    picas: { records: 0, missingEvidencePhoto: 0, duplicateCodeGroups: 0, orphanSourceReferences: 0 }
  };

  const hazards = readDiagnosticTable_(spreadsheet, 'hazards');
  const picas = readDiagnosticTable_(spreadsheet, 'picas');
  result.hazards.records = hazards.rows.length;
  result.picas.records = picas.rows.length;

  result.hazards.missingPhoto = hazards.rows.filter(function(row) {
    return !String(row.photoUrl || '').trim();
  }).length;
  result.hazards.duplicateCodeGroups = countDuplicateGroups_(hazards.rows, 'code');

  result.picas.missingEvidencePhoto = picas.rows.filter(function(row) {
    return !String(row.evidencePhotoUrl || row.evidencePhotoFileId || '').trim();
  }).length;
  result.picas.duplicateCodeGroups = countDuplicateGroups_(picas.rows, 'code');

  const hazardCodes = {};
  hazards.rows.forEach(function(row) {
    const code = String(row.code || '').trim();
    if (code) hazardCodes[code] = true;
  });
  result.picas.orphanSourceReferences = picas.rows.filter(function(row) {
    const sourceCode = String(row.sourceRefCode || '').trim();
    return sourceCode && !hazardCodes[sourceCode];
  }).length;

  return result;
}

function readDiagnosticTable_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
    return { rows: [] };
  }
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values[0].map(function(value) { return String(value || '').trim(); });
  const rows = values.slice(1).filter(function(row) {
    return row[0] !== '' && row[0] !== null && row[0] !== undefined;
  }).map(function(row) {
    const record = {};
    headers.forEach(function(header, index) {
      if (header) record[header] = row[index];
    });
    return record;
  });
  return { rows: rows };
}

function countDuplicateGroups_(rows, field) {
  const counts = {};
  rows.forEach(function(row) {
    const value = String(row[field] || '').trim();
    if (value) counts[value] = (counts[value] || 0) + 1;
  });
  return Object.keys(counts).filter(function(key) { return counts[key] > 1; }).length;
}
