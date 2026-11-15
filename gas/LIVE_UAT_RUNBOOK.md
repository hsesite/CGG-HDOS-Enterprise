# HDOS Live GAS UAT — Execution Runbook

## Deployment

Use the latest Web App URL from the deployment owner. Keep it in a local environment variable; do not commit it to GitHub. Separately verify the GitHub Actions repository secret `VITE_GAS_URL` points to this same deployment and `VITE_GOOGLE_CLIENT_ID` is the intended OAuth client. The deployment workflow validates that both secrets exist, but does not reveal their values.

## A. Automated, non-destructive smoke test

Requirements: Node.js 20+ and dedicated UAT accounts (not production operator accounts).

PowerShell:

```powershell
$env:HDOS_GAS_URL = "PASTE_GAS_WEB_APP_EXEC_URL"
$env:HDOS_UAT_ACCOUNTS_JSON = '[{"label":"CGG UAT Admin","email":"uat-admin@example.com","password":"TEMPORARY_UAT_PASSWORD"}]'
npm run uat:live
```

Bash:

```bash
export HDOS_GAS_URL='PASTE_GAS_WEB_APP_EXEC_URL'
export HDOS_UAT_ACCOUNTS_JSON='[{"label":"CGG UAT Admin","email":"uat-admin@example.com","password":"TEMPORARY_UAT_PASSWORD"}]'
npm run uat:live
```

The runner checks live health/version, readiness, public company registry, anonymous denial, login/current identity, and read-only list access for inspections, hazards, PICA, and incidents. An explicit `not_ready` response is reported as a warning so this smoke test can still verify reachable read-only endpoints; unavailable or invalid responses remain failures. Full UAT and production acceptance still require readiness to return `ready` with every check passing. It prints sanitized JSON evidence and never prints passwords or session tokens. Supply multiple dedicated UAT accounts for CGG, Contractor, and Subkon roles.

## B. Full seven-part UAT

Execute PRODUCTION_UAT_CHECKLIST.md with isolated test accounts and non-production records. Record tester, account role/company, timestamp, expected/actual result, API status, and redacted screenshot/evidence for each test.

1. Deployment/database: readiness must be ready; compare deployed GAS version with gas/Code.gs; verify central Spreadsheet and Drive permissions.
2. Tenant isolation: test GET-one/GET-all/PATCH/DELETE and file-preview denial using records owned by another tenant. Do not use production records for destructive probes.
3. Inspection/Hazard: test online/offline photo submissions, invalid photo rejection, FAIL finding assignment, and Hazard-to-PICA linkage.
4. PICA: test PIC submission, Foreman Safety approval, SPV HSE approval, final closure, return-with-reason, and linked Hazard close/rollback.
5. Incident: test investigator, reviewer, closer permissions and audit events.
6. Offline sync: use two browser profiles/devices; test queue persistence, photo-before-record ordering, lost response/replay, retry, account switching, and conflict resolution.
7. Backup/recovery/mobile/regression: verify Drive backup, SUCCESS log, exactly one daily trigger, isolated recovery copy, local backup/restore, mobile usability, and all regression tests.

## C. Safety gates

- Never run live write/delete tests against the production Spreadsheet.
- Never run setup/schema-mutating functions until the target Spreadsheet is verified and backed up.
- Do not share passwords, OAuth credentials, session tokens, Spreadsheet IDs, Drive IDs, or unredacted incident/employee records.
- Green CI or a passing read-only smoke run is not production sign-off.
- Production remains blocked by cross-tenant access, unauthorized workflow transitions, lost/duplicated evidence, or unverified backup/recovery.

## Evidence

The runner prints a UAT_RESULT_JSON block. Save it as a release attachment after removing personal identifiers. Add manual screenshots and outcomes to the checklist.
