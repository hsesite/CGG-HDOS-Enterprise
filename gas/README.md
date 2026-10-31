# Google Apps Script backend

`Code.gs` is the version-controlled source for the HDOS Google Apps Script Web App. It is separate from the React/GitHub Pages deployment: merging this file into `main` does **not** update an already-deployed Apps Script Web App.

## Required Script Properties

Configure these in **Apps Script → Project Settings → Script Properties** before deployment:

- `HDOS_SPREADSHEET_ID`: ID of the production or test Google Spreadsheet used by this deployment.
- `GOOGLE_CLIENT_ID`: OAuth Web Client ID used by Google Sign-In; must match the frontend `VITE_GOOGLE_CLIENT_ID`.
- `CGG_EMAIL_DOMAINS`: comma- or semicolon-separated approved CGG email domains (for example `ptcgg.com`; default `ptcgg.com`).
- `CGG_ALLOWED_EMAILS`: optional comma- or semicolon-separated exact email allowlist. Use this to permit specific CGG personnel who use Gmail or another personal email provider without allowing every public Gmail account to self-register as CGG.
- `HDOS_REPOSITORY_FOLDER_ID`: optional Google Drive folder ID for controlled Repository documents. If absent, the script creates a folder on first upload/authorization.

Never commit Spreadsheet IDs, OAuth secrets, session tokens, passwords, or production data to this public repository. Use separate test and production Script Properties and spreadsheets.

## Deployment checklist

1. Back up the target Spreadsheet and Apps Script project.
2. Configure the Script Properties above, using a non-production spreadsheet for acceptance tests.
3. Replace the Apps Script project's `Code.gs` with this file.
4. Run `setup()` once and authorize requested Spreadsheet/Drive scopes.
5. Run `authorizeRepositoryDriveAccess()` if Repository upload/download is enabled.
6. Deploy as a **new version** of the Web App with the approved access policy.
7. Point the test frontend's `VITE_GAS_URL` to the deployed test Web App.
8. Run the role, tenant-scope, CRUD, Repository, Google Sign-In, and offline-sync acceptance tests before promoting the same source to production.
9. Verify the live Web App URL and version; GitHub Pages deployment alone does not deploy this backend.

## Authorization changes in this revision

- Elevated roles start with `roleVerified=false`; Admin CGG must explicitly verify them.
- `Superintendent`, `Supervisor`, and `Foreman` are accepted consistently by account creation and role update routes.
- PJO, SPV HSE, and Foreman Safety cannot create operational records; their permitted PICA approval/closure flow remains separate.
- Spreadsheet selection comes from the `HDOS_SPREADSHEET_ID` Script Property rather than a hardcoded production ID.

Run local authorization checks with `npm run test:gas`.
