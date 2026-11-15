# HDOS Production UAT Checklist

Status: prepared for execution after the latest Google Apps Script backend is deployed.
Scope: live Google Apps Script Web App, central Google Spreadsheet, Google Drive photo/repository/backup folders, and representative user accounts.

> A green GitHub Actions workflow validates source code, automated tests, and the GitHub Pages build. It does not prove that the live Apps Script deployment, Spreadsheet permissions, Drive folders, OAuth configuration, or real user workflows are correct. Do not approve production until every critical test below has recorded evidence.

## 1. Deployment and central database

- [ ] Confirm the deployed Apps Script version is the same source revision as the release commit in GitHub.
- [ ] Confirm the Web App deployment URL used by the frontend points to the intended Apps Script project.
- [ ] Confirm Script Properties: `HDOS_SPREADSHEET_ID`, `GOOGLE_CLIENT_ID`, `CGG_EMAIL_DOMAINS` or `CGG_ALLOWED_EMAILS`, `HDOS_BACKUP_FOLDER_ID`.
- [ ] Confirm the executing identity can read/write the central Spreadsheet and required Drive folders.
- [ ] Open `/api/health/ready`; require `status=ready`, all schema checks, OAuth/registration policy, backup folder, daily trigger, and recent successful backup.
- [ ] Confirm required sheets and headers exist; record missing/invalid schema counts as zero.
- [ ] Create one approved test record, verify its row and audit entry in the central Spreadsheet, then verify the API returns the same record.
- [ ] Confirm no production data is written to a test Spreadsheet and no test data is written to production.

## 2. Tenant isolation and role access

Use separate, real test accounts for CGG Admin, CGG KTT/SPT/SPV/Foreman Safety/SPV HSE, Contractor Admin/PIC, Subkon PIC, and Employee. Record the company code and verified role for each account.

- [ ] CGG Admin can access the authorized enterprise-wide operational scope and company master.
- [ ] Verified CGG oversight roles can read active Contractor/Subkon operational records only; they cannot write operational records unless a specific workflow grants it.
- [ ] Project Manager is limited to the backend-authorized scope; a frontend label must not grant cross-company data.
- [ ] Contractor account sees its own records and only its registered active Subkon records.
- [ ] Subkon account sees only its own tenant records, not parent Contractor or sibling Subkon records.
- [ ] Employee can submit only permitted operational reports and cannot access PICA monitoring, administrative writes, or another tenant's records.
- [ ] Multi-role Employee + Company Admin account is evaluated as Company Admin within its own company; Employee-only account remains restricted.
- [ ] Multi-role Employee + Admin CGG account retains CGG administration; no secondary role downgrades the primary privileged authority.
- [ ] Inactive/suspended company accounts and orphaned Subkon accounts cannot read or create operational records.
- [ ] Direct API GET-one, GET-all, PATCH, DELETE, and file-preview attempts across tenant boundaries return denied/not found as appropriate.
- [ ] Changing a user's company, role, or verification status revokes/refreshes existing sessions and does not reveal stale cached records.

## 3. Inspection and Hazard evidence

- [ ] Submit an Inspection with a valid photo while online; verify metadata and image are saved in the correct tenant Drive folder.
- [ ] Submit an Inspection while offline; verify the local record, Blob, and queue entry persist together.
- [ ] Reconnect; verify photo upload happens before record creation and the queue is acknowledged exactly once.
- [ ] Submit an Inspection with a FAIL finding; verify department, PIC name, active PIC email, and target date are mandatory.
- [ ] Submit a Hazard with photo and assigned PIC; verify generated PICA is assigned to the active PIC in the same tenant.
- [ ] Attempt missing, unsupported, oversized, or foreign-tenant photo evidence; require rejection.
- [ ] Repeat the same submit action rapidly; verify no duplicate record or duplicate upload is created.

## 4. PICA lifecycle

- [ ] Assigned PIC sees only PICA assigned to their account and can submit corrective action/evidence.
- [ ] Foreman Safety validates first; SPV HSE validates second; reversed or skipped stages are rejected.
- [ ] Only verified SPV HSE can perform final closure after both required approvals.
- [ ] Rejection/return requires a reason and returns the item to the assigned PIC.
- [ ] Closing a Hazard-origin PICA closes only its matching Hazard in the same tenant.
- [ ] Simulate a failed Spreadsheet flush in test environment; verify PICA and linked Hazard roll back together.
- [ ] Closed PICA leaves the active worklist but remains available in history/audit.

## 5. Incident workflow

- [ ] Eligible roles can submit an incident; ineligible and unverified elevated roles cannot.
- [ ] Verified Foreman Safety/SPV HSE can complete investigation fields.
- [ ] Reviewer role can review only after mandatory investigation fields are present.
- [ ] Only the authorized closer can close the incident.
- [ ] Every state transition records actor, role, timestamp, and audit event.
- [ ] Verify a second tenant cannot read or modify the incident.

## 6. Offline/online sync and conflict handling

- [ ] Create multiple records offline, including Inspection/Hazard photo and PICA updates; close/reopen the browser and verify queue persistence.
- [ ] Reconnect on a slow/unstable connection; verify retryable network/5xx/429 errors retry with backoff.
- [ ] Verify 4xx validation/permission errors are held for manual correction and are not retried indefinitely.
- [ ] Simulate a lost response after a cloud commit; replay must be idempotent and must not duplicate the record or audit event.
- [ ] Update the same record on two devices; stale version must enter CONFLICT and preserve both server snapshot and local payload.
- [ ] Resolve conflict; verify the revised payload is tenant-bound and dependent queue operations resume in order.
- [ ] Open two tabs and verify the same queue item is not concurrently replayed.
- [ ] Switch accounts/tenants during pending sync; verify old queue items never replay under the new identity.
- [ ] Confirm a failed local acknowledgement does not remove the queue item or local evidence.

## 7. Backup and recovery

- [ ] Create the first central Spreadsheet backup using `createDatabaseBackup()`.
- [ ] Verify backup file is a Google Spreadsheet in the configured Drive folder and has a SUCCESS row in `backup_logs`.
- [ ] Run `installDailyDatabaseBackupTrigger()`; verify exactly one daily trigger exists.
- [ ] Confirm readiness rejects missing, stale, failed, inaccessible, wrong-folder, or non-Spreadsheet backup files.
- [ ] Run `createDatabaseRecoveryCopy(backupFileId)` against a known backup; verify the isolated copy's required sheets, headers, dimensions, and cell contents.
- [ ] Do not replace the live database during this test. A production cutover requires a separate approved maintenance window and rollback plan.
- [ ] Export local device backup containing photos/queue; restore it on the same account/tenant and verify Blob evidence and queue references.
- [ ] Attempt restore using another account, another tenant, altered checksum, duplicate IDs, missing attachment references, or unsupported MIME; require rejection without partial writes.

## 8. Acceptance and evidence

For each test record: tester, account role/company, timestamp, expected result, actual result, screenshot or redacted evidence, API response/status, and pass/fail.

Release blockers:
- Any cross-tenant read/write or file access.
- Any unauthorized approval/closure.
- Any lost or duplicated operational record/photo during offline replay.
- Any backup marked successful when its copy cannot be opened or verified.
- Any failed restore that partially overwrites local data.
- Any critical API or PWA error preventing operational reporting.

Production approval requires all critical cases to pass, no unresolved critical/high defects, a verified recent central backup, a tested recovery copy, and sign-off from the authorized CGG operational/HSE owner.
