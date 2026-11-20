# HDOS Read-only Live Diagnostics

## Purpose
This API provides a sanitized, aggregate-only view of the live HDOS Spreadsheet. It is separate from normal user sessions and does not provide any repair or write operation.

## Security setup
1. In the Apps Script project connected to the production Web App, open **Project Settings → Script Properties**.
2. Add `HDOS_DIAGNOSTICS_TOKEN` with a newly generated, high-entropy secret (at least 32 random bytes).
3. Do not put the secret in GitHub, source files, frontend configuration, URL query parameters, screenshots, or chat messages.
4. Deploy a new Apps Script Web App version after reviewing the code. Keep the deployment's existing execution identity and access policy; do not broaden public access for diagnostics.
5. Keep the token with the authorized database operator. Rotate it if exposed.

## Request
Send an HTTPS POST to the existing Apps Script `/exec` URL with JSON body:

```json
{
  "path": "/api/diagnostics/report",
  "method": "POST",
  "payload": {
    "diagnosticToken": "YOUR_SECRET"
  }
}
```

The response is a JSON envelope. The useful report is in `data`.

## Returned data
- Readiness status and boolean checks.
- Required sheet existence, row counts, column counts.
- Schema validity and missing/invalid sheet names.
- Aggregate Hazard/PICA integrity counters: missing photo/evidence, duplicate code groups, and orphan Hazard-origin PICA references.

No row contents, names, emails, passwords, password hashes/salts, session tokens, Drive file IDs, or free-text descriptions are returned.

## Read-only guarantees and limits
- The route accepts POST only and requires the dedicated secret.
- It uses `getSheetByName` and never calls `getSheet_`, which may create a missing sheet.
- It contains no Spreadsheet write, Drive write, schema migration, trigger installation, backup creation, or data deletion.
- It does read sheet values to calculate aggregate counters. Large registers may take time; monitor Apps Script execution limits.
- The existing `/api/health/ready` route remains available but is not a substitute for this detailed report.

## Rollout checklist
- [ ] Review the branch diff and automated tests.
- [ ] Merge through the repository's normal review process.
- [ ] Copy `gas/Diagnostics.gs` into the intended Apps Script project and deploy a new version.
- [ ] Set the Script Property secret directly in Apps Script.
- [ ] Run one POST from an authorized operator environment.
- [ ] Confirm `mode=READ_ONLY` and `liveDatabaseChanged=false`.
- [ ] Revoke/rotate the diagnostic token after any suspected exposure.

ChatGPT does not currently have a direct authenticated Google Apps Script caller in this conversation. Until a supported connector is installed and authorized, the operator must run the POST from an approved environment and share only the sanitized JSON `data` object for analysis.
