# HDOS CGG Security Validation Checklist

Status: **implementation changes are on `main`; automated and production/staging validation has not yet been run as a combined release test.**

## Automated validation

Run these together from the repository root after code changes are complete:

1. `bun install --frozen-lockfile`
2. `bun run lint`
3. `bun run test:gas`
4. `bun run build`

The GitHub Actions workflow `.github/workflows/ci.yml` runs the same validation stages on pushes to `main`.

## GAS staging / integration scenarios

Use a separate test spreadsheet and a staging GAS deployment. Do not run destructive scenarios against production data.

### Identity, registration, and tenant lifecycle
- [ ] Simultaneous Admin CGG/Company Admin user-access updates serialize without lost role, status, verification, or tenant fields; each successful update has exactly one audit event.
- [ ] Simultaneous company-master upserts for the same company code do not create duplicate rows or overwrite a newer parent/status relationship; successful changes are audited after the master row is committed.

- [ ] CGG self-registration rejects non-corporate domains by default (`ptcgg.com`) and accepts only explicitly configured `CGG_EMAIL_DOMAINS` or exact `CGG_ALLOWED_EMAILS`; verify alternate company domains in staging.
- [ ] CGG self-registration accepts only an explicitly configured corporate domain or exact allowlisted address.
- [ ] Contractor/Subkon registration accepts a verified Google email only when the selected company exists and is ACTIVE.
- [ ] Duplicate email registration is rejected, including concurrent requests.
- [ ] Inactive contractor accounts cannot log in or keep using an existing session.
- [ ] Subkon access is revoked when its own company or its parent Contractor becomes inactive.
- [ ] Unverified KTT/SPV/Foreman Safety accounts behave as Crew: only permitted base modules and own-tenant inspection/hazard reporting.
- [ ] Verified oversight roles see only the active Contractor/Subkon oversight scope.
- [ ] Company Admin cannot assign elevated roles or verify their own users; Admin CGG can perform approved verification.

### PICA workflow and audit integrity

- [ ] Foreman approval succeeds first; SPV HSE approval before Foreman is rejected.
- [ ] KTT approval before both Foreman and SPV HSE is rejected.
- [ ] Each role can update only its assigned approval stage.
- [ ] Operational users cannot change PICA status without a valid stage approval.
- [ ] Server derives PROGRESS/CLOSED status from approval stages and stamps completion date using the Apps Script timezone.
- [ ] Closed PICA cannot be reopened by operational or Company Admin accounts.
- [ ] Concurrent approval requests using stale state return HTTP 409 and do not overwrite the earlier approval.
- [ ] Audit rows record stage changes, status transitions, user verification changes, and unique audit sequence codes.

### Repository document control
- [ ] Offline repository binaries can only be read, migrated, or downloaded when the current account matches the document uploader and tenant; legacy file blobs may be used only when linked metadata confirms the same owner.
- [ ] Account switching in one browser cannot expose another account's cached document binary through preview, download, or form generation.

### Cached-download authorization
- [ ] When a CGG user has a cached local document and the API is online, download calls the server with the captured session token and produces a `REPOSITORY_DOCUMENT_DOWNLOADED` audit event.
- [ ] If the server returns 401, 403, or 404, a cached local copy is not used as a fallback.
- [ ] Local cached download fallback is permitted only for a confirmed transport outage (network/503) or when no GAS URL is configured, and only while the captured session token remains unchanged.
- [ ] Switching accounts while a download request is pending cancels the download rather than using the previous account's response.


- [ ] Contractors/Subkon can preview only documents visible to their tenant.
- [ ] Online preview always fetches through the server's tenant-scoped preview endpoint before considering any local cache; account/role/tenant changes cannot reuse a stale local copy while online.
- [ ] Contractor/Subkon users can generate digital forms from documents visible to their tenant through the preview endpoint; this workflow must not call the CGG-only download endpoint.
- [ ] Online form generation fetches the current tenant-authorized preview and does not create an additional unscoped IndexedDB copy of the source file.
- [ ] Contractors/Subkon receive HTTP 403 from the original-download endpoint.
- [ ] CGG users can download only documents visible within their permitted scope; Admin CGG retains administrative access.
- [ ] Repository metadata responses never expose `driveFileId` or embedded `fileBase64`.
- [ ] Upload rejects unsupported extensions and MIME-spoofed file content.
- [ ] Preview/download revalidates the stored file signature and returns a server-selected MIME type.
- [ ] XLSX cell values and sheet names containing HTML/script-like text render as literal text.
- [ ] Preview and download actions are written to the audit log.
- [ ] Confirm that preview-only is a UI access policy, not DRM: any bytes delivered to a browser can technically be copied.

### Incident investigation and approvals

- [ ] Foreman Safety/SPV HSE terverifikasi dapat menyimpan lima tahapan Why, akar penyebab, dan tindakan koreksi selama status INVESTIGATING.
- [ ] Akun Crew, Contractor PIC, dan Company Admin tidak dapat mengubah hasil investigasi.
- [ ] KTT/SPT/SPV terverifikasi dapat mereview hanya setelah lima Why, akar penyebab, dan tindakan koreksi lengkap.
- [ ] Hanya KTT terverifikasi atau Admin CGG yang dapat menutup insiden setelah status REVIEWED_KTT.
- [ ] Transisi review/closure menyimpan reviewedBy/reviewedAt/closedBy/closedAt dan satu audit event.
- [ ] Retry setelah respons review/closure hilang bersifat idempotent dan tidak menggandakan audit event.

### Cloud hydration, Repository delete, and data freshness

- [ ] Saat login, queue akun aktif dimuat sebelum snapshot cloud; pending create/update tidak tertimpa snapshot yang lebih lama.
- [ ] Snapshot Inspection, Hazard, PICA, Incident, Repository, dan formulir terbit hanya memuat tenant yang diizinkan.
- [ ] Pending DELETE Repository tidak muncul kembali dari snapshot cloud saat offline.
- [ ] Delete Repository online menghapus file Drive dan metadata pusat; kegagalan server tidak menghapus metadata lokal.
- [ ] Delete Repository offline masuk antrean, tetap tersembunyi setelah reload, lalu terhapus di Drive setelah koneksi pulih.
- [ ] Dashboard menunjukkan waktu snapshot pusat dan sumber yang gagal dimuat; status tidak membawa timestamp dari akun sebelumnya.
- [ ] Kode referensi yang dibuat serentak dari dua perangkat tidak bertabrakan.
- [ ] Rangkaian CREATE lalu beberapa UPDATE offline pada record yang sama disinkronkan berurutan dengan versi updatedAt server terbaru.

### Backup, audit trail, dashboard, and GIS

- [ ] `createDatabaseBackup()` membuat salinan Spreadsheet penuh di folder backup terproteksi dan menulis satu log SUCCESS.
- [ ] Kegagalan Drive membuat log FAILED dan tidak dilaporkan sebagai backup berhasil.
- [ ] `installDailyDatabaseBackupTrigger()` tidak memasang trigger harian ganda.
- [ ] Restore dari backup dilakukan di Spreadsheet staging dan seluruh sheet/header/record diverifikasi sebelum prosedur pemulihan produksi disetujui.
- [ ] Audit trail hanya dapat dibaca Admin CGG dan menampilkan paling banyak 500 aktivitas terbaru.
- [ ] Dashboard trend 7/14/30 hari cocok dengan tanggal aktual record, bukan angka sintetis.
- [ ] Dashboard company comparison hanya memakai perusahaan dari master perusahaan pusat.
- [ ] GIS plot hanya memetakan koordinat valid dan tidak menganggap koordinat 0,0 sebagai lokasi kerja.

### Offline sync and account switching

- [ ] Offline queue items remain bound to their original user ID and company code.
- [ ] A changed tenant profile causes the old queue to remain quarantined under its original owner.
- [ ] Sync uses the token captured for that run; a newer login is never used to submit an older account's queue.
- [ ] A stale 401 response never logs out or clears a newer account's session.
- [ ] Foreground create/update fallback queues retain the owner captured before the local write.
- [ ] Logout during an in-flight sync does not clear a different account's token/profile.
- [ ] A login/logout or role change in another browser tab refreshes the session profile and tenant-scoped local data before modules become available.
- [ ] Duplicate create IDs from another tenant return 403 and do not disclose the existing record.

### Authentication and legacy runtime
- [ ] Session records carry an absolute expiry based on `CONFIG.SESSION_TTL` (6 hours); expired, malformed, or legacy records without `expiresAt` are rejected and deleted before user lookup.
- [ ] Updating/deactivating a Contractor or Subkon company master revokes all sessions for that company and its direct Subkon tenants; reactivation cannot revive old sessions.
- [ ] Any successful user access/role/company/verification update revokes all previously issued persistent sessions for that user ID; reactivation cannot resurrect an old token.
- [ ] `requireAuth_` trusts only the persistent Script Properties session registry and never falls back to a stale CacheService session after revocation.
- [ ] Session token is bound to the immutable user ID captured at issuance; deleting/recreating or reassigning an email address cannot let an old token authenticate a different account.

- [ ] Ten failed password attempts for one normalized email cause HTTP 429 for the 5-minute cache window.
- [ ] Successful login clears that email's failure counter.
- [ ] Legacy Express/PostgreSQL startup fails outside `development`/`test` unless `ENABLE_LEGACY_EXPRESS_BACKEND=true` is explicitly set, including when `NODE_ENV` is missing.
- [ ] Confirm the active production GAS deployment version includes the current `gas/Code.gs` changes.
- [ ] Confirm Script Properties contain the actual company-approved `CGG_EMAIL_DOMAINS` and/or `CGG_ALLOWED_EMAILS`; no corporate email domain is assumed by the code.

## Release gate

Do not mark the security audit as passed until the automated commands, the staging scenarios above, and production GAS deployment/configuration checks have recorded results. Keep any failing scenario open and fix it on `main` before production rollout.
