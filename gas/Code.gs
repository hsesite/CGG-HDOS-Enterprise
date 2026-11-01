// ============================================================
// CGG HDOS — Google Apps Script Backend
// C-1E-B Normalized HSE Register Connector
//
// Architecture:
//   GitHub Pages
//        ↓
//   Google Apps Script Web App
//        ↓
//   Google Spreadsheet
//
// IMPORTANT:
// - No Render
// - No Express
// - No PostgreSQL
// - IndexedDB remains the local/offline source
//
// C-1E-B:
// - Normalized Hazard Register
// - Normalized PICA Register
// - Legacy 6-column migration
// - Local ID preservation
// - Idempotent CREATE
// - CRUD compatible with frontend
// - Audit trail
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  // Configure the spreadsheet ID in Script Properties as HDOS_SPREADSHEET_ID.
  SPREADSHEET_ID: '',

  SHEETS: [
    'users',
    'companies',
    'locations',
    'forms',
    'inspections',
    'hazards',
    'picas',
    'incidents',
    'audit_logs'
  ],

  SESSION_TTL:
    21600 // 6 jam
};


// ============================================================
// ENTITY SCHEMAS
// ============================================================

const ENTITY_SCHEMAS = {

  locations: ['id', 'name', 'utm', 'lat', 'lng', 'description', 'zoneType', 'activeHazards', 'activeInspections', 'safetyStatus', 'createdAt', 'updatedAt', 'payload'],
  repository: ['id', 'code', 'title', 'status', 'createdAt', 'updatedAt', 'driveFileId', 'fileName', 'mimeType', 'companyCode', 'parentCompanyCode', 'payload'],
  forms: ['id', 'code', 'title', 'status', 'createdAt', 'updatedAt', 'companyCode', 'parentCompanyCode', 'payload'],


  // ----------------------------------------------------------
  // HAZARD REGISTER
  // ----------------------------------------------------------

  hazards: [
    'id',
    'code',
    'title',
    'category',
    'location',
    'specificLocation',
    'severity',
    'likelihood',
    'riskScore',
    'riskLevel',
    'reporter',
    'reporterRole',
    'status',
    'actionTaken',
    'picaId',
    'photoUrl',
    'aiDetected',
    'aiSuggestions',
    'createdAt',
    'updatedAt',
    'payload'
  ],


  // ----------------------------------------------------------
  // PICA REGISTER
  // ----------------------------------------------------------

  picas: [
    'id',
    'code',
    'source',
    'sourceRefCode',
    'findingDescription',
    'correctiveAction',
    'preventiveAction',
    'picDepartment',
    'picName',
    'targetDate',
    'completionDate',
    'status',
    'daysAging',
    'foremanApproval',
    'spvHseApproval',
    'kttApproval',
    'evidencePhotoUrl',
    'createdAt',
    'updatedAt',
    'payload'
  ],


  // ----------------------------------------------------------
  // INSPECTION
  // ----------------------------------------------------------

  inspections: [
    'id',
    'code',
    'status',
    'createdAt',
    'updatedAt',
    'payload'
  ],


  // ----------------------------------------------------------
  // INCIDENT
  // ----------------------------------------------------------

  incidents: [
    'id',
    'code',
    'status',
    'createdAt',
    'updatedAt',
    'payload'
  ],


  // ----------------------------------------------------------
  // AUDIT LOG
  // ----------------------------------------------------------

  audit_logs: [
    'id',
    'code',
    'payload',
    'status',
    'createdAt',
    'updatedAt'
  ]
};


// ============================================================
// SETUP
// ============================================================

function setup() {
  const ss =
    getSpreadsheet_();

  CONFIG.SHEETS.forEach(
    function(name) {
      if (!ss.getSheetByName(name)) {
        ss.insertSheet(name);
      }
    }
  );

  setupUsersSheet_(
    ss
  );

  setupCompaniesSheet_(ss);

  setupDataSheets_(
    ss
  );

  SpreadsheetApp.flush();

  Logger.log(
    'HDOS C-1E-C setup selesai. Database siap digunakan.'
  );
}


// ============================================================
// USERS SETUP
// ============================================================

function setupCompaniesSheet_(ss) {
  let sheet = ss.getSheetByName('companies');
  if (!sheet) sheet = ss.insertSheet('companies');
  const headers = ['companyCode', 'companyName', 'role', 'parentCompanyCode', 'emailDomains', 'autoProvision', 'status', 'passportStatus', 'picName', 'picContact', 'safetyPassportExpiry'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0].map(String);
    headers.forEach(function(header, index) { if (!existing[index] || existing[index] !== header) sheet.getRange(1, index + 1).setValue(header); });
  }
  sheet.setFrozenRows(1);
  // Populate this protected master sheet with approved companies and verified corporate email domains.
  // Never put public email domains (gmail.com, yahoo.com, outlook.com) in emailDomains.
}

function setupUsersSheet_(ss) {
  const sheet = ss.getSheetByName('users');
  if (!sheet) throw new Error('Sheet users tidak ditemukan.');

  const headers = ['id', 'email', 'password', 'displayName', 'role', 'status', 'passwordHash', 'passwordSalt', 'googleSub', 'companyCode', 'parentCompanyCode', 'position', 'department', 'section', 'roleVerified'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0].map(String);
    headers.forEach(function(header, index) { if (!existing[index] || existing[index] !== header) sheet.getRange(1, index + 1).setValue(header); });
  }
  sheet.setFrozenRows(1);
  // Intentionally do not create a hard-coded demo administrator or default password.
  // Bootstrap the first Admin CGG account manually in the protected users sheet.
}

// ============================================================
// DATA SHEET SETUP
// ============================================================

function setupDataSheets_(
  ss
) {
  const names = [
    'repository',
    'locations',
    'forms',
    'inspections',
    'hazards',
    'picas',
    'incidents',
    'audit_logs'
  ];

  names.forEach(
    function(name) {
      const existingSheet = ss.getSheetByName(name);
      const desiredHeaders = ENTITY_SCHEMAS[name];
      if (!desiredHeaders) return;
      const sheet = existingSheet || ss.insertSheet(name);
      ensureSheetSchema_(sheet, desiredHeaders);
    }
  );
}


// ============================================================
// SCHEMA ENSURE / MIGRATION
// ============================================================

function ensureSheetSchema_(
  sheet,
  desiredHeaders
) {
  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();

  let existingHeaders = [];

  if (
    lastRow >= 1 &&
    lastColumn >= 1
  ) {
    existingHeaders =
      sheet
        .getRange(
          1,
          1,
          1,
          lastColumn
        )
        .getValues()[0]
        .map(
          function(value) {
            return String(
              value || ''
            ).trim();
          }
        );
  }


  // ----------------------------------------------------------
  // OLD LEGACY SCHEMA
  //
  // id | code | payload | status | createdAt | updatedAt
  // ----------------------------------------------------------

  if (
    lastRow > 1 &&
    isLegacySchema_(
      existingHeaders
    )
  ) {
    migrateLegacyEntityRows_(
      sheet,
      existingHeaders,
      desiredHeaders
    );

    return;
  }


  // ----------------------------------------------------------
  // EMPTY SHEET
  // ----------------------------------------------------------

  if (
    lastRow === 0 ||
    existingHeaders.length === 0
  ) {
    sheet
      .getRange(
        1,
        1,
        1,
        desiredHeaders.length
      )
      .setValues([
        desiredHeaders
      ]);

    sheet.setFrozenRows(1);
    return;
  }


  // ----------------------------------------------------------
  // EXISTING NORMALIZED SHEET
  // ----------------------------------------------------------

  sheet
    .getRange(
      1,
      1,
      1,
      desiredHeaders.length
    )
    .setValues([
      desiredHeaders
    ]);

  sheet.setFrozenRows(1);
}


// ============================================================
// LEGACY SCHEMA DETECTOR
// ============================================================

function isLegacySchema_(
  headers
) {
  return (
    headers.length === 6 &&
    headers[0] === 'id' &&
    headers[1] === 'code' &&
    headers[2] === 'payload' &&
    headers[3] === 'status' &&
    headers[4] === 'createdAt' &&
    headers[5] === 'updatedAt'
  );
}


// ============================================================
// MIGRATE OLD DATA
// ============================================================

function migrateLegacyEntityRows_(
  sheet,
  oldHeaders,
  desiredHeaders
) {
  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < 2
  ) {
    sheet
      .getRange(
        1,
        1,
        1,
        desiredHeaders.length
      )
      .setValues([
        desiredHeaders
      ]);

    sheet.setFrozenRows(1);
    return;
  }

  const rows =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        oldHeaders.length
      )
      .getValues();

  const oldIndex = {};

  oldHeaders.forEach(
    function(header, index) {
      oldIndex[header] =
        index;
    }
  );

  const migrated =
    rows.map(
      function(row) {
        let payload = {};

        try {
          payload =
            JSON.parse(
              String(
                row[
                  oldIndex.payload
                ] || '{}'
              )
            );
        } catch (error) {
          payload = {};
        }

        const record =
          Object.assign(
            {},
            payload,
            {
              id:
                String(
                  row[
                    oldIndex.id
                  ] || ''
                ),

              code:
                String(
                  row[
                    oldIndex.code
                  ] || ''
                ),

              status:
                String(
                  row[
                    oldIndex.status
                  ] || ''
                ),

              createdAt:
                String(
                  row[
                    oldIndex.createdAt
                  ] || ''
                ),

              updatedAt:
                String(
                  row[
                    oldIndex.updatedAt
                  ] || ''
                )
            }
          );

        return buildEntityRow_(
          sheet.getName(),
          record,
          desiredHeaders
        );
      }
    );

  sheet.clearContents();

  sheet
    .getRange(
      1,
      1,
      1,
      desiredHeaders.length
    )
    .setValues([
      desiredHeaders
    ]);

  if (
    migrated.length > 0
  ) {
    sheet
      .getRange(
        2,
        1,
        migrated.length,
        desiredHeaders.length
      )
      .setValues(
        migrated
      );
  }

  sheet.setFrozenRows(1);

  Logger.log(
    'Migrasi selesai: ' +
    sheet.getName() +
    ' (' +
    migrated.length +
    ' record)'
  );
}


// ============================================================
// WEB APP — GET
// ============================================================

function doGet(
  e
) {
  try {
    const params =
      e &&
      e.parameter
        ? e.parameter
        : {};


    // --------------------------------------------------------
    // DIRECT HEALTH CHECK
    // --------------------------------------------------------

    if (
      params.path ===
        '/api/health/live' ||
      (
        !params.path &&
        !params.method
      )
    ) {
      return respond_(
        success_({
          status: 'live',
          service:
            'CGG HDOS Google Apps Script',
          version:
            'C-1E-B'
        })
      );
    }


    const result =
      handleRoute_(
        String(
          params.method ||
            'GET'
        ).toUpperCase(),

        String(
          params.path ||
            '/'
        ),

        {
          token:
            params.token ||
            '',

          payload:
            parseJSON_(
              params.payload ||
                '{}'
            )
        }
      );

    return respond_(
      result
    );

  } catch (err) {
    return respond_(
      error_(
        getErrorStatus_(
          err
        ),
        err
      )
    );
  }
}


// ============================================================
// WEB APP — POST
// ============================================================

function doPost(
  e
) {
  try {
    const body =
      parseRequestBody_(
        e
      );

    const method =
      String(
        body.method ||
          'POST'
      ).toUpperCase();

    const path =
      String(
        body.path ||
          '/'
      );

    const token =
      String(
        body.token ||
          ''
      );

    const payload =
      body.payload !==
      undefined
        ? body.payload
        : {};

    const result =
      handleRoute_(
        method,
        path,
        {
          token:
            token,

          payload:
            payload
        }
      );

    return respond_(
      result
    );

  } catch (err) {
    return respond_(
      error_(
        getErrorStatus_(
          err
        ),
        err
      )
    );
  }
}


// ============================================================
// ROUTING
// ============================================================

function getRepositoryFileMetadata_(fileName, bytes) {
  const extension = String(fileName || '').split('.').pop().toLowerCase();
  const data = bytes || [];

  if (extension === 'pdf') {
    let header = '';
    for (let i = 0; i < Math.min(data.length, 1024); i++) {
      header += String.fromCharCode((Number(data[i]) + 256) % 256);
    }
    if (header.indexOf('%PDF-') < 0) throw httpError_(400, 'Isi berkas tidak sesuai dengan format PDF.');
    return { fileType: 'PDF', mimeType: 'application/pdf' };
  }

  if (extension === 'docx' || extension === 'xlsx') {
    if (data.length < 4 || Number(data[0]) !== 0x50 || Number(data[1]) !== 0x4B || Number(data[2]) !== 0x03 || Number(data[3]) !== 0x04) {
      throw httpError_(400, 'Isi berkas Office tidak valid atau tidak sesuai dengan ekstensi.');
    }
    return extension === 'docx'
      ? { fileType: 'DOCX', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
      : { fileType: 'XLSX', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }

  throw httpError_(400, 'Repository hanya menerima berkas PDF, DOCX, atau XLSX.');
}

function publicRepositoryDocument_(doc) {
  if (!doc) return doc;
  const safe = Object.assign({}, doc);
  delete safe.driveFileId;
  delete safe.fileBase64;
  return safe;
}

function canPreviewRepositoryDocument_(doc, user) {
  return Boolean(doc && isRecordVisibleToUser_(doc, user));
}

function canDownloadRepositoryDocument_(doc, user) {
  if (!doc) return false;
  if (isAdminCGG_(user)) return true;
  const userCompanyCode = String(user.companyCode || '').trim().toUpperCase();
  return userCompanyCode === 'CGG' && isRecordVisibleToUser_(doc, user);
}

function handleRoute_(
  method,
  path,
  params
) {

  // ----------------------------------------------------------
  // HEALTH
  // ----------------------------------------------------------

  if (
    path ===
      '/api/health/live' &&
    method === 'GET'
  ) {
    return success_({
      status: 'live',
      service:
        'CGG HDOS Google Apps Script',
      version:
        'C-1E-C'
    });
  }


  // ----------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------

  if (
    path ===
      '/api/auth/login' &&
    method === 'POST'
  ) {
    return login_(
      params.payload
    );
  }


  if (path === '/api/auth/google' && method === 'POST') {
    return googleLogin_(params.payload);
  }

  if (path === '/api/auth/google/onboard' && method === 'POST') {
    return googleOnboard_(params.payload);
  }

  if (path === '/api/public/companies' && method === 'GET') {
    return listPublicCompanies_();
  }

  // ----------------------------------------------------------
  // AUTHENTICATED ROUTES
  // ----------------------------------------------------------

  const user =
    requireAuth_(
      params.token
    );


  // ----------------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------------

  if (
    path ===
      '/api/auth/logout' &&
    method === 'POST'
  ) {
    if (
      params.token
    ) {
      CacheService
        .getScriptCache()
        .remove(
          'session:' +
          params.token
        );
      PropertiesService.getScriptProperties().deleteProperty('session:' + params.token);
    }

    return success_(
      null
    );
  }


  // ----------------------------------------------------------
  // CURRENT USER
  // ----------------------------------------------------------

  if (
    path === '/api/me' &&
    method === 'GET'
  ) {
    return success_(
      publicUser_(
        user
      )
    );
  }


  // ----------------------------------------------------------
  // ACCOUNT MANAGEMENT — ADMIN CGG ONLY
  // ----------------------------------------------------------
  if (path === '/api/users' && method === 'GET') {
    if (!isAdminCGG_(user) && !isCompanyAdmin_(user)) return error_(403, 'Hanya Admin CGG atau Admin Perusahaan yang dapat mengelola daftar akun.');
    const users = listPublicUsers_();
    return success_(isAdminCGG_(user) ? users : users.filter(function(account) { return canManageCompany_(user, account.companyCode); }));
  }
  if (path === '/api/companies' && method === 'GET') {
    if (!isAdminCGG_(user) && !isCompanyAdmin_(user)) return error_(403, 'Hanya Admin CGG atau Admin Perusahaan yang dapat melihat master perusahaan.');
    const response = listCompanyRegistry_();
    if (isAdminCGG_(user)) return response;
    const companyData = response.data || [];
    return success_(companyData.filter(function(company) { return canManageCompany_(user, company.code); }));
  }
  if (path === '/api/companies' && method === 'POST') {
    if (!isAdminCGG_(user)) return error_(403, 'Hanya Admin CGG yang dapat menambah atau mengubah master perusahaan.');
    return upsertCompanyRegistry_(params.payload, user);
  }
  if (path === '/api/users' && method === 'POST') {
    if (!isAdminCGG_(user) && !isCompanyAdmin_(user)) return error_(403, 'Hanya Admin CGG atau Admin Perusahaan yang dapat menambahkan akun.');
    return createManagedUser_(params.payload, user);
  }

  const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && method === 'PATCH') {
    if (!isAdminCGG_(user) && !isCompanyAdmin_(user)) return error_(403, 'Hanya Admin CGG atau Admin Perusahaan yang dapat mengelola akun.');
    return updateUserAccess_(decodeURIComponent(userMatch[1]), params.payload, user);
  }

  // ----------------------------------------------------------
  // CENTRAL REPOSITORY — shared metadata + Google Drive files
  // ----------------------------------------------------------
  if (path === '/api/repository' && method === 'GET') {
    const rows = readAll_('repository');
    const visible = rows.filter(function(doc) {
      if (isAdminCGG_(user)) return true;
      return isRecordVisibleToUser_(doc, user);
    }).map(function(doc) { return publicRepositoryDocument_(doc); });
    return success_(visible);
  }
  if (path === '/api/repository' && method === 'POST') {
    if (!isAdminCGG_(user) && !isCompanyAdmin_(user)) return error_(403, 'Hanya Admin CGG atau Admin Perusahaan yang dapat mengunggah dokumen.');
    const input = isObject_(params.payload) ? params.payload : {};
    const base64 = String(input.fileBase64 || '');
    if (!base64 || base64.length > 14000000) return error_(400, 'Berkas wajib diisi dan maksimal 10 MB.');
    const companyCode = String(isAdminCGG_(user) ? (input.companyCode || user.companyCode || 'CGG') : (user.companyCode || '')).trim().toUpperCase();
    if (!companyCode) return error_(403, 'Akun belum memiliki perusahaan untuk Repository.');
    if (!isAdminCGG_(user) && companyCode !== String(user.companyCode || '').trim().toUpperCase()) return error_(403, 'Anda hanya dapat mengunggah dokumen untuk perusahaan Anda.');
    const registeredCompany = companyCode === 'CGG' ? null : findCompanyRegistry_(companyCode);
    if (companyCode !== 'CGG' && (!registeredCompany || registeredCompany.status !== 'ACTIVE')) return error_(400, 'Perusahaan dokumen tidak terdaftar aktif pada master perusahaan.');
    const parentCompanyCode = registeredCompany && registeredCompany.role === 'Subkon' ? String(registeredCompany.parentCompanyCode || '').trim().toUpperCase() : '';
    const id = String(input.id || Utilities.getUuid());
    const existingDocument = findRecordRow_(getSheet_('repository'), id);
    if (existingDocument) {
      const existing = readOne_('repository', id);
      if (!isAdminCGG_(user) && !isRecordVisibleToUser_(existing, user)) return error_(403, 'ID dokumen sudah digunakan di luar cakupan perusahaan Anda.');
      return success_(publicRepositoryDocument_(existing));
    }
    const bytes = Utilities.base64Decode(base64);
    const fileName = String(input.fileName || 'document.bin');
    const fileMetadata = getRepositoryFileMetadata_(fileName, bytes);
    const mimeType = fileMetadata.mimeType;
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty('HDOS_REPOSITORY_FOLDER_ID');
    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.createFolder('CGG HDOS Repository');
    if (!folderId) props.setProperty('HDOS_REPOSITORY_FOLDER_ID', folder.getId());
    const file = folder.createFile(blob);
    const doc = Object.assign({}, input, { id: id, code: String(input.docNumber || input.code || id), driveFileId: file.getId(), fileName: fileName, fileType: fileMetadata.fileType, mimeType: mimeType, fileBase64: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), companyCode: companyCode, parentCompanyCode: parentCompanyCode });
    delete doc.fileBase64;
    return success_(publicRepositoryDocument_(createRecord_('repository', doc, user)));
  }
  const repositoryDeleteMatch = path.match(/^\/api\/repository\/([^/]+)$/);
  if (repositoryDeleteMatch && method === 'DELETE') {
    if (!isAdminCGG_(user) && !isCompanyAdmin_(user)) return error_(403, 'Hanya Admin CGG atau Admin Perusahaan yang dapat menghapus dokumen Repository.');
    const documentId = decodeURIComponent(repositoryDeleteMatch[1]);
    const sheet = getSheet_('repository');
    const rowNumber = findRecordRow_(sheet, documentId);
    if (!rowNumber) return success_({ id: documentId, deleted: true, alreadyDeleted: true });
    const doc = parseRow_(sheet, rowNumber);
    if (!isAdminCGG_(user) && String(doc.companyCode || '').trim().toUpperCase() !== String(user.companyCode || '').trim().toUpperCase()) return error_(403, 'Anda tidak dapat menghapus dokumen perusahaan lain.');
    const driveFileId = String(doc.driveFileId || '');
    if (driveFileId) {
      try { DriveApp.getFileById(driveFileId).setTrashed(true); }
      catch (driveError) { throw httpError_(500, 'Metadata tidak dihapus karena berkas Drive gagal dipindahkan ke Sampah: ' + driveError.message); }
    }
    sheet.deleteRow(rowNumber);
    // Remove published form definitions sourced from this document so they cannot remain as orphaned forms.
    try {
      const formsSheet = getSheet_('forms');
      const formRows = formsSheet.getDataRange().getValues();
      for (let formIndex = formRows.length - 1; formIndex >= 1; formIndex--) {
        const formRecord = parseRow_(formsSheet, formIndex + 1);
        if (String(formRecord.sourceDocumentId || '') === documentId) formsSheet.deleteRow(formIndex + 1);
      }
    } catch (formDeleteError) {
      // Repository deletion remains successful; the failure is captured in audit for administrator follow-up.
      logAudit_(user, 'REPOSITORY_FORM_CLEANUP_FAILED', 'repository', documentId);
    }
    logAudit_(user, 'REPOSITORY_DOCUMENT_DELETED', 'repository', documentId);
    return success_({ id: documentId, deleted: true });
  }

  const repositoryPreviewMatch = path.match(/^\/api\/repository\/([^/]+)\/preview$/);
  if (repositoryPreviewMatch && method === 'GET') {
    const doc = readOne_('repository', decodeURIComponent(repositoryPreviewMatch[1]));
    if (!doc) return error_(404, 'Dokumen Repository tidak ditemukan.');
    if (!canPreviewRepositoryDocument_(doc, user)) return error_(403, 'Anda tidak memiliki akses pratinjau dokumen ini.');
    const fileId = String(doc.driveFileId || '');
    if (!fileId) return error_(404, 'Berkas pusat tidak ditemukan.');
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const fileMetadata = getRepositoryFileMetadata_(doc.fileName || file.getName(), blob.getBytes());
    blob.setContentType(fileMetadata.mimeType);
    logAudit_(user, 'REPOSITORY_DOCUMENT_PREVIEWED', 'repository', doc.id, {
      fileName: file.getName(),
      mimeType: fileMetadata.mimeType
    });
    return success_({ fileName: file.getName(), mimeType: fileMetadata.mimeType, base64: Utilities.base64Encode(blob.getBytes()) });
  }

  const repositoryFileMatch = path.match(/^\/api\/repository\/([^/]+)\/file$/);
  if (repositoryFileMatch && method === 'GET') {
    const doc = readOne_('repository', decodeURIComponent(repositoryFileMatch[1]));
    if (!doc) return error_(404, 'Dokumen Repository tidak ditemukan.');
    // Download is restricted to CGG internal accounts; preview uses a separate scoped route.
    if (!canDownloadRepositoryDocument_(doc, user)) return error_(403, 'Unduhan dokumen Repository hanya tersedia untuk personel internal CGG yang memiliki akses ke dokumen ini.');
    const fileId = String(doc.driveFileId || '');
    if (!fileId) return error_(404, 'Berkas pusat tidak ditemukan.');
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const fileMetadata = getRepositoryFileMetadata_(doc.fileName || file.getName(), blob.getBytes());
    blob.setContentType(fileMetadata.mimeType);
    logAudit_(user, 'REPOSITORY_DOCUMENT_DOWNLOADED', 'repository', doc.id, {
      fileName: file.getName(),
      mimeType: fileMetadata.mimeType
    });
    return success_({ fileName: file.getName(), mimeType: fileMetadata.mimeType, base64: Utilities.base64Encode(blob.getBytes()) });
  }

  // ----------------------------------------------------------
  // CENTRAL MINING AREA MASTER — readable by authenticated users,
  // writable only by Admin CGG.
  // ----------------------------------------------------------
  if (path === '/api/locations' && method === 'GET') {
    return success_(readAll_('locations'));
  }
  if (path === '/api/locations' && method === 'POST') {
    if (!isAdminCGG_(user)) return error_(403, 'Hanya Admin CGG yang dapat mengubah master Area Kerja.');
    const input = isObject_(params.payload) ? params.payload : {};
    const name = String(input.name || '').trim();
    const zoneType = String(input.zoneType || '').trim().toUpperCase();
    const allowedZones = ['PIT', 'HAUL_ROAD', 'STOCKPILE', 'PREPARASI', 'NURSERY', 'JETTY', 'ETO', 'SAMPLE_HOUSE', 'PORT', 'FACILITY'];
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (name.length < 2 || name.length > 120) return error_(400, 'Nama area wajib 2–120 karakter.');
    if (allowedZones.indexOf(zoneType) === -1) return error_(400, 'Kategori area tidak valid.');
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return error_(400, 'Latitude harus berada pada rentang -90 sampai 90.');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return error_(400, 'Longitude harus berada pada rentang -180 sampai 180.');
    const sheet = getSheet_('locations');
    const lock = LockService.getScriptLock();
    let item;
    lock.waitLock(10000);
    try {
      const existing = readAll_('locations');
      const duplicate = existing.some(function(area) {
        return String(area.name || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase() &&
          String(area.zoneType || '').toUpperCase() === zoneType;
      });
      if (duplicate) return error_(409, 'Area dengan nama dan kategori yang sama sudah terdaftar.');
      const now = new Date().toISOString();
      item = {
        id: String(input.id || Utilities.getUuid()),
        name: name,
        utm: String(input.utm || '').trim(),
        lat: lat,
        lng: lng,
        description: String(input.description || '').trim(),
        zoneType: zoneType,
        activeHazards: 0,
        activeInspections: 0,
        safetyStatus: 'SAFE',
        createdAt: now,
        updatedAt: now
      };
      if (findRecordRow_(sheet, item.id)) return error_(409, 'ID area sudah digunakan.');
      sheet.appendRow(buildEntityRow_('locations', item, ENTITY_SCHEMAS.locations));
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    logAudit_(user, 'CREATE', 'locations', item.id, { name: item.name, zoneType: item.zoneType });
    return success_(item);
  }
  const locationDeleteMatch = path.match(/^\/api\/locations\/([^/]+)$/);
  if (locationDeleteMatch && method === 'DELETE') {
    if (!isAdminCGG_(user)) return error_(403, 'Hanya Admin CGG yang dapat menghapus master Area Kerja.');
    const id = decodeURIComponent(locationDeleteMatch[1]);
    const sheet = getSheet_('locations');
    const lock = LockService.getScriptLock();
    let deleted = false;
    lock.waitLock(10000);
    try {
      const rowNumber = findRecordRow_(sheet, id);
      if (rowNumber) {
        sheet.deleteRow(rowNumber);
        SpreadsheetApp.flush();
        deleted = true;
      }
    } finally {
      lock.releaseLock();
    }
    if (deleted) logAudit_(user, 'DELETE', 'locations', id);
    return success_({ id: id, deleted: deleted });
  }

  // ----------------------------------------------------------
  // CENTRAL PUBLISHED FORMS — shared between authorized users
  // ----------------------------------------------------------
  if (path === '/api/forms' && method === 'GET') {
    const forms = readAll_('forms').filter(function(form) {
      return String(form.status || '').toUpperCase() === 'PUBLISHED' && isRecordVisibleToUser_(form, user);
    });
    return success_(forms);
  }
  if (path === '/api/forms' && method === 'POST') {
    if (!canPublishForms_(user)) return error_(403, 'Penerbitan formulir hanya untuk Admin CGG atau Admin Perusahaan.');
    const input = isObject_(params.payload) ? params.payload : {};
    if (String(input.status || '').toUpperCase() !== 'PUBLISHED' || !Array.isArray(input.fields) || input.fields.length === 0) return error_(400, 'Formulir harus berstatus PUBLISHED dan memiliki minimal satu pertanyaan.');
    const companyCode = String(isAdminCGG_(user) ? (input.companyCode || user.companyCode || 'CGG') : (user.companyCode || '')).trim().toUpperCase();
    if (!companyCode) return error_(403, 'Akun belum memiliki perusahaan untuk menerbitkan formulir.');
    if (!isAdminCGG_(user) && companyCode !== String(user.companyCode || '').trim().toUpperCase()) return error_(403, 'Admin Perusahaan hanya dapat menerbitkan formulir untuk perusahaannya.');
    const registeredCompany = companyCode === 'CGG' ? null : findCompanyRegistry_(companyCode);
    if (companyCode !== 'CGG' && (!registeredCompany || registeredCompany.status !== 'ACTIVE')) return error_(400, 'Perusahaan formulir tidak terdaftar aktif pada master perusahaan.');
    const parentCompanyCode = registeredCompany && registeredCompany.role === 'Subkon' ? String(registeredCompany.parentCompanyCode || '').trim().toUpperCase() : '';
    const safeForm = Object.assign({}, input, {
      id: String(input.id || Utilities.getUuid()),
      code: String(input.formNumber || input.code || input.id || Utilities.getUuid()),
      title: String(input.title || 'Form Inspeksi'),
      status: 'PUBLISHED', companyCode: companyCode,
      parentCompanyCode: parentCompanyCode,
      updatedAt: new Date().toISOString()
    });
    const existingRow = findRecordRow_(getSheet_('forms'), safeForm.id);
    if (existingRow) {
      const existing = readOne_('forms', safeForm.id);
      // A Company Admin may update only a form already visible within its tenant scope.
      if (!isAdminCGG_(user) && !isRecordVisibleToUser_(existing, user)) return error_(403, 'Anda tidak memiliki akses untuk memperbarui formulir perusahaan lain.');
      // Form ownership is immutable for Company Admins; only Admin CGG may move a form between tenants.
      if (!isAdminCGG_(user)) {
        safeForm.companyCode = String(existing.companyCode || user.companyCode || '').trim().toUpperCase();
        safeForm.parentCompanyCode = String(existing.parentCompanyCode || user.parentCompanyCode || '').trim().toUpperCase();
      }
      return success_(updateRecord_('forms', safeForm.id, Object.assign({}, existing, safeForm, { createdAt: existing.createdAt || safeForm.createdAt || new Date().toISOString() }), user));
    }
    safeForm.createdAt = safeForm.createdAt || new Date().toISOString();
    return success_(createRecord_('forms', safeForm, user));
  }

  // ----------------------------------------------------------
  // ENTITY ROUTES
  // ----------------------------------------------------------

  const match =
    path.match(
      /^\/api\/(inspections|hazards|picas|incidents)(?:\/([^/]+))?$/
    );

  if (!match) {
    return error_(
      404,
      'Route not found'
    );
  }

  const entity =
    match[1];

  // Enforce the same basic-module boundary on the server; client-side navigation is not a security control.
  if (requiresRoleVerification_(user) && user.roleVerified !== true && ['inspections', 'hazards', 'picas'].indexOf(entity) === -1) {
    return error_(403, 'Jabatan belum diverifikasi. Akses sementara hanya untuk Inspeksi dan Hazard.');
  }
  if ((user.roles || []).indexOf('Employee') !== -1 && ['inspections', 'hazards', 'picas'].indexOf(entity) === -1) {
    return error_(403, 'Akun Employee hanya memiliki akses ke Inspeksi dan Hazard.');
  }

  // Reporting remains available to authenticated staff even while elevated roles await verification.
  // Privileged role verification still gates administrative modules in the frontend and account policy.

  const id =
    match[2] || '';

  const roles = user.roles || [];
  const isLimitedEmployee = roles.indexOf('Employee') >= 0 && !isAdminCGG_(user) && !isCompanyAdmin_(user);
  // All authenticated company-scoped staff can read operational records in their company.

  // GET ALL
  if (
    method === 'GET' &&
    !id
  ) {
    const records = readAll_(entity);
    return success_(records.filter(function(record) {
      if (!isRecordVisibleToUser_(record, user)) return false;
      if (entity !== 'picas') return true;
      const role = String((user.roles || [])[0] || '');
      const canMonitorPicas = isAdminCGG_(user) || isCompanyAdmin_(user) || ['Foreman', 'Foreman Safety', 'SPV HSE'].indexOf(role) >= 0;
      return canMonitorPicas || String(record.assignedToEmail || '').trim().toLowerCase() === String(user.email || '').trim().toLowerCase();
    }));
  }


  // GET ONE
  if (
    method === 'GET' &&
    id
  ) {
    const record = readOne_(entity, id);
    if (!record) return error_(404, 'Record not found');
    if (!isRecordVisibleToUser_(record, user)) return error_(403, 'Anda tidak memiliki akses ke data ini.');
    if (entity === 'picas') {
      const role = String((user.roles || [])[0] || '');
      const canMonitorPicas = isAdminCGG_(user) || isCompanyAdmin_(user) || ['Foreman', 'Foreman Safety', 'SPV HSE'].indexOf(role) >= 0;
      if (!canMonitorPicas && String(record.assignedToEmail || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase()) {
        return error_(403, 'PICA ini tidak ditugaskan kepada akun Anda.');
      }
    }
    return success_(record);
  }


  // CREATE
  if (
    method === 'POST' &&
    !id
  ) {
    // Employees may submit new operational records; edits remain restricted below.
    const scopedCreatePayload = applyRecordScope_(entity, params.payload || {}, user, true);
    if (entity === 'picas' && String(scopedCreatePayload.source || '').toUpperCase() === 'INSPECTION') {
      const assignedEmail = String(scopedCreatePayload.assignedToEmail || '').trim().toLowerCase();
      if (!String(scopedCreatePayload.picDepartment || '').trim() ||
          !String(scopedCreatePayload.picName || '').trim() || !assignedEmail) {
        return error_(400, 'PICA hasil inspeksi wajib memiliki departemen, nama PIC, dan email akun PIC.');
      }
      const assignedUser = findUserByEmail_(assignedEmail);
      if (!assignedUser || assignedUser.status !== 'ACTIVE') return error_(400, 'Akun PIC tidak ditemukan atau tidak aktif.');
      if (String(assignedUser.companyCode || '').trim().toUpperCase() !== String(scopedCreatePayload.companyCode || '').trim().toUpperCase()) {
        return error_(403, 'PIC harus berasal dari perusahaan yang sama dengan pemilik PICA.');
      }
    }
    return success_(createRecord_(entity, scopedCreatePayload, user));
  }


  // DELETE — admin-only and idempotent so a lost response can be safely replayed.
  if (method === 'DELETE' && id) {
    if (!isAdminCGG_(user) && !isCompanyAdmin_(user)) return error_(403, 'Penghapusan data operasional hanya dapat dilakukan Admin CGG atau Admin Perusahaan.');
    const deleteLock = LockService.getScriptLock();
    let deleted = false;
    deleteLock.waitLock(10000);
    try {
      const existingRecord = readOne_(entity, id);
      // A prior DELETE may have succeeded while its response was lost.
      // Return success without exposing whether an unknown ID exists.
      if (!existingRecord) return success_({ id: id, deleted: true, alreadyDeleted: true });
      if (!isAdminCGG_(user) && !isRecordVisibleToUser_(existingRecord, user)) return error_(403, 'Anda tidak memiliki akses untuk menghapus data perusahaan lain.');
      const targetSheet = getSheet_(entity);
      const targetRow = findRecordRow_(targetSheet, id);
      if (targetRow) {
        targetSheet.deleteRow(targetRow);
        SpreadsheetApp.flush();
        deleted = true;
      }
    } finally {
      deleteLock.releaseLock();
    }
    if (deleted) logAudit_(user, 'OPERATIONAL_RECORD_DELETED', entity, id);
    return success_({ id: id, deleted: true, alreadyDeleted: !deleted });
  }

  // UPDATE
  if (
    method === 'PATCH' &&
    id
  ) {
    const requestedPayload = Object.assign({}, isObject_(params.payload) ? params.payload : {});
    const existingRecord = readOne_(entity, id);
    if (!existingRecord) return error_(404, 'Record not found');
    if (!isRecordVisibleToUser_(existingRecord, user)) return error_(403, 'Anda tidak memiliki akses untuk mengubah data ini.');
    if (entity === 'picas') {
      const role = String((user.roles || [])[0] || '');
      const canMonitorPicas = isAdminCGG_(user) || isCompanyAdmin_(user) || ['Foreman', 'Foreman Safety', 'SPV HSE'].indexOf(role) >= 0;
      if (!canMonitorPicas && String(existingRecord.assignedToEmail || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase()) {
        return error_(403, 'PICA ini tidak ditugaskan kepada akun Anda.');
      }
    }
    if (entity === 'picas') {
      const closureError = enforcePicaClosureRules_(existingRecord, requestedPayload, user);
      if (closureError) return closureError;
    }
    const isPrivilegedEditor = isAdminCGG_(user) || isCompanyAdmin_(user);
    // Company Admin may manage PICA details in its tenant, but cannot bypass the
    // operational approval chain or directly mark a PICA closed.
    if (entity === 'picas' && isCompanyAdmin_(user) && !isAdminCGG_(user)) {
      const oldStagesForCompanyAdmin = existingRecord.approvalStages || {};
      const requestedStagesForCompanyAdmin = requestedPayload.approvalStages || oldStagesForCompanyAdmin;
      if (Object.prototype.hasOwnProperty.call(requestedPayload, 'approvalStages') &&
          JSON.stringify(requestedStagesForCompanyAdmin) !== JSON.stringify(oldStagesForCompanyAdmin)) {
        return error_(403, 'Admin Perusahaan tidak dapat mengubah tahapan persetujuan PICA.');
      }
      const requestedStatusForCompanyAdmin = String(requestedPayload.status || existingRecord.status || '').toUpperCase();
      if (requestedStatusForCompanyAdmin === 'CLOSED' &&
          !(oldStagesForCompanyAdmin.foreman === true && oldStagesForCompanyAdmin.spvHse === true && oldStagesForCompanyAdmin.ktt === true)) {
        return error_(403, 'Penutupan PICA membutuhkan seluruh tahap verifikasi.');
      }
      if (['OPEN', 'PROGRESS', 'CLOSED'].indexOf(requestedStatusForCompanyAdmin) === -1) {
        return error_(403, 'Status PICA tidak valid.');
      }
    }
    if (!isPrivilegedEditor) {
      if (entity !== 'picas') return error_(403, 'Data operasional yang sudah dikirim tidak dapat diedit atau dihapus.');
      const role = String((user.roles || [])[0] || 'Employee');
      const email = String(user.email || '').trim().toLowerCase();
      const isAssignedPIC = Boolean(existingRecord.assignedToEmail && String(existingRecord.assignedToEmail).trim().toLowerCase() === email);
      const isHSEValidator = ['Foreman', 'Foreman Safety', 'SPV HSE'].indexOf(role) >= 0 && user.roleVerified === true;
      const oldStatus = String(existingRecord.status || 'OPEN').toUpperCase();
      const nextStatus = String(requestedPayload.status || oldStatus).toUpperCase();
      const allowedKeys = nextStatus === 'CLOSED' || (nextStatus === 'PROGRESS' && oldStatus === 'WAITING_HSE')
        ? ['status', 'rejectionReason', 'hseValidatedBy', 'hseValidatedRole', 'hseValidatedAt', 'completionDate', 'updatedAt']
        : nextStatus === 'WAITING_HSE'
          ? ['status', 'correctiveAction', 'evidencePhotoUrl', 'submittedAt', 'closeRequestedAt', 'rejectionReason', 'updatedAt']
          : ['status', 'correctiveAction', 'evidencePhotoUrl', 'updatedAt'];
      const changedKeys = Object.keys(requestedPayload).filter(function(key) {
        return JSON.stringify(requestedPayload[key]) !== JSON.stringify(existingRecord[key]);
      });
      if (changedKeys.some(function(key) { return allowedKeys.indexOf(key) === -1; })) return error_(403, 'Perubahan PICA tidak diizinkan untuk tahap akun ini.');
      if (nextStatus === 'WAITING_HSE' || (nextStatus === 'PROGRESS' && oldStatus !== 'WAITING_HSE')) {
        if (!isAssignedPIC) return error_(403, 'Hanya PIC yang ditugaskan dapat memperbarui tindak lanjut PICA.');
      } else if (nextStatus === 'CLOSED' || (nextStatus === 'PROGRESS' && oldStatus === 'WAITING_HSE')) {
        if (!isHSEValidator) return error_(403, 'Aksi ini hanya dapat dilakukan Foreman Safety atau SPV HSE terverifikasi.');
      }
    }
    const scopedPayload = (!isPrivilegedEditor && entity === 'picas')
      ? Object.assign({}, existingRecord, requestedPayload)
      : applyRecordScope_(entity, Object.assign({}, existingRecord, requestedPayload), user, false);
    // Organization ownership is immutable through normal record updates.
    ['companyCode', 'contractorCode', 'parentCompanyCode', 'subcontractorCode', 'subkonCode'].forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(existingRecord, key)) scopedPayload[key] = existingRecord[key];
      else delete scopedPayload[key];
    });
    let auditDetails = null;
    if (entity === 'picas') {
      const oldStages = existingRecord.approvalStages || {};
      const nextStages = scopedPayload.approvalStages || oldStages;
      const stageChanges = {};
      ['foreman', 'spvHse', 'ktt'].forEach(function(stage) {
        if (nextStages[stage] !== oldStages[stage]) {
          stageChanges[stage] = { from: oldStages[stage] === true, to: nextStages[stage] === true };
        }
      });
      const oldStatus = String(existingRecord.status || '').toUpperCase();
      const nextStatus = String(scopedPayload.status || oldStatus).toUpperCase();
      if (Object.keys(stageChanges).length > 0 || oldStatus !== nextStatus) {
        auditDetails = {
          approvalStageChanges: stageChanges,
          statusFrom: oldStatus,
          statusTo: nextStatus,
          completionDate: scopedPayload.completionDate || null
        };
      }
    }
    const expectedPicaState = entity === 'picas' ? { status: existingRecord.status, approvalStages: existingRecord.approvalStages || {} } : null;
    // The client sends the updatedAt value it last read. Preserve it as an optimistic
    // concurrency token so an older full-record edit cannot overwrite newer server data.
    const expectedRecordUpdatedAt = Object.prototype.hasOwnProperty.call(requestedPayload, 'updatedAt')
      ? String(requestedPayload.updatedAt || '')
      : null;
    return success_(updateRecord_(entity, id, scopedPayload, user, auditDetails, expectedPicaState, expectedRecordUpdatedAt));
  }


  return error_(
    405,
    'Method not allowed'
  );
}


// ============================================================
// LOGIN
// ============================================================

function loginRateLimitKey_(email) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(email || '').trim().toLowerCase(),
    Utilities.Charset.UTF_8
  );
  return 'login-fail:' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function isLoginRateLimited_(email) {
  const attempts = Number(CacheService.getScriptCache().get(loginRateLimitKey_(email)) || 0);
  return attempts >= 10;
}

function recordLoginFailure_(email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const cache = CacheService.getScriptCache();
    const key = loginRateLimitKey_(email);
    const attempts = Number(cache.get(key) || 0);
    cache.put(key, String(attempts + 1), 300);
  } finally {
    lock.releaseLock();
  }
}

function clearLoginFailures_(email) {
  CacheService.getScriptCache().remove(loginRateLimitKey_(email));
}

function login_(payload) {
  const input = isObject_(payload) ? payload : {};
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  if (!email || !password) return error_(400, 'Email dan password diperlukan');
  if (isLoginRateLimited_(email)) return error_(429, 'Terlalu banyak percobaan login. Coba kembali setelah 5 menit.');

  const user = findUserByEmail_(email);
  let validPassword = false;
  if (user && user.passwordHash && user.passwordSalt) {
    validPassword = constantTimeStringEquals_(passwordHash_(password, user.passwordSalt), user.passwordHash);
  } else if (user && user.password) {
    // Backward compatibility for existing accounts; migrate the row to a hash after successful login.
    validPassword = user.password === password;
    if (validPassword) migrateLegacyPassword_(user, password);
  }
  if (!user || !validPassword || user.status !== 'ACTIVE') {
    recordLoginFailure_(email);
    return error_(401, 'Email atau password salah atau akun tidak aktif');
  }
  clearLoginFailures_(email);
  return createSessionResponse_(user);
}

function register_(payload) {
  return error_(403, 'Pendaftaran mandiri dinonaktifkan. Akun hanya dapat dibuat oleh Admin CGG.');
}


function googleLogin_(payload) {
  const input = isObject_(payload) ? payload : {};
  const credential = String(input.credential || '');
  if (!credential) return error_(400, 'Kredensial Google diperlukan.');
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) return error_(503, 'Google OAuth belum dikonfigurasi oleh administrator.');

  let tokenInfo;
  try {
    const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return error_(401, 'Token Google tidak valid.');
    tokenInfo = JSON.parse(response.getContentText());
  } catch (err) {
    return error_(502, 'Verifikasi token Google gagal.');
  }
  if (String(tokenInfo.aud || '') !== clientId || String(tokenInfo.email_verified || '') !== 'true' || !tokenInfo.email) {
    return error_(401, 'Identitas Google tidak dapat diverifikasi untuk aplikasi ini.');
  }

  const email = String(tokenInfo.email).trim().toLowerCase();
  let user = findUserByEmail_(email);
  if (user && user.status === 'PENDING') return error_(403, 'Profil akun sudah diterima dan sedang menunggu persetujuan Admin CGG.');
  if (user && user.status !== 'ACTIVE') return error_(403, 'Akun tidak aktif. Hubungi administrator.');
  if (!user) return error_(403, 'Akun Google belum didaftarkan. Lengkapi profil untuk mengajukan akses HDOS.');
  if (user && user.googleSub && String(user.googleSub) !== String(tokenInfo.sub || '')) return error_(403, 'Akun Google tidak cocok dengan akun yang telah ditautkan. Hubungi Admin CGG.');
  if (user && tokenInfo.sub) {
    setGoogleSubject_(user.id, String(tokenInfo.sub));
  }
  return createSessionResponse_(user);
}

function isCggEmailAllowed_(email, companyCode) {
  // All valid, Google-verified email addresses may self-register for any company.
  // Company existence/status and tenant assignment are validated separately in googleOnboard_.
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
}

function appendUniqueUser_(email, rowValues) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (findUserByEmail_(email)) return false;
    getSheet_('users').appendRow(rowValues);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function googleOnboard_(payload) {
  const input = isObject_(payload) ? payload : {};
  const credential = String(input.credential || '');
  const displayName = String(input.displayName || '').trim();
  const companyCode = String(input.companyCode || '').trim().toUpperCase();
  const position = String(input.position || '').trim();
  const department = String(input.department || '').trim();
  const section = String(input.section || '').trim();
  if (!credential) return error_(400, 'Kredensial Google diperlukan.');
  if (displayName.length < 2 || !companyCode || !department || !section) return error_(400, 'Nama lengkap, perusahaan, departemen, dan bagian wajib diisi.');
  if (!/^[A-Z0-9][A-Z0-9 .&_-]{1,39}$/.test(companyCode)) return error_(400, 'Kode/nama perusahaan tidak valid. Gunakan kode seperti CGG, SLS, atau VIP.');
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) return error_(503, 'Google OAuth belum dikonfigurasi oleh administrator.');
  let tokenInfo;
  try {
    const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return error_(401, 'Token Google tidak valid. Silakan mulai ulang login Google.');
    tokenInfo = JSON.parse(response.getContentText());
  } catch (err) {
    return error_(502, 'Verifikasi token Google gagal.');
  }
  if (String(tokenInfo.aud || '') !== clientId || String(tokenInfo.email_verified || '') !== 'true' || !tokenInfo.email || !tokenInfo.sub) {
    return error_(401, 'Identitas Google tidak dapat diverifikasi untuk aplikasi ini.');
  }
  const email = String(tokenInfo.email).trim().toLowerCase();
  if (!isCggEmailAllowed_(email, companyCode)) return error_(403, companyCode === 'CGG' ? 'Email tidak diizinkan untuk pendaftaran personel CGG. Gunakan domain resmi atau minta Admin CGG memasukkan email Anda ke allowlist.' : 'Alamat email tidak valid.');
  let parentCode = '';
  if (companyCode === 'CGG') {
    // CGG personnel may register using their own verified Google/Gmail account.
    // Self-registration always receives only the Employee role and roleVerified=false.
    // Admin CGG must verify senior positions before elevated access is granted.
  } else {
    const company = findCompanyRegistry_(companyCode);
    if (!company || company.status !== 'ACTIVE') {
      return error_(400, 'Perusahaan belum terdaftar atau belum aktif pada master perusahaan HDOS. Hubungi Admin CGG untuk menambahkan perusahaan.');
    }
    const role = String(company.role || '').trim();
    if (['Contractor', 'Subkon'].indexOf(role) === -1) return error_(400, 'Kategori perusahaan pada master tidak valid.');
    parentCode = role === 'Subkon' ? String(company.parentCompanyCode || '').trim().toUpperCase() : '';
    if (role === 'Subkon') {
      const parent = findCompanyRegistry_(parentCode);
      if (!parent || parent.status !== 'ACTIVE' || String(parent.role || '') !== 'Contractor') {
        return error_(409, 'Master perusahaan Subkon belum memiliki Contractor induk aktif yang valid.');
      }
    }
  }
  // Self-registration activates an Employee account immediately. The job title is profile metadata only;
  // elevated application roles are assigned separately by Admin CGG, never inferred from free-text fields.
  const id = Utilities.getUuid();
  const userRow = [id, email, '', displayName, 'Employee', 'ACTIVE', '', '', String(tokenInfo.sub), companyCode, parentCode, '', department, section, false];
  if (!appendUniqueUser_(email, userRow)) return error_(409, 'Email ini sudah terdaftar. Silakan masuk atau hubungi Admin CGG.');
  logAudit_({ id: 'SYSTEM', email: 'system@hdos.local', roles: ['SYSTEM'] }, 'GOOGLE_SELF_REGISTERED_ACTIVE_ACCOUNT', 'users', id, { targetEmail: email, role: 'Employee', companyCode: companyCode, parentCompanyCode: parentCode, status: 'ACTIVE', roleVerified: false });
  return success_({ pending: false, message: 'Akun berhasil dibuat dan langsung aktif. Akun CGG memiliki akses internal sesuai kebijakan perusahaan; akun kontraktor/subkon tetap terbatas pada akses lihat.' });
}

function listPublicCompanies_() {
  const sheet = getSheet_('companies');
  const rows = sheet.getDataRange().getValues();
  const companies = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][6] || '').toUpperCase() !== 'ACTIVE') continue;
    companies.push({ code: String(rows[i][0] || '').trim().toUpperCase(), name: String(rows[i][1] || '').trim(), role: String(rows[i][2] || '').trim(), parentCompanyCode: String(rows[i][3] || '').trim().toUpperCase() });
  }
  companies.sort(function(a, b) {
    const roleOrder = (a.role === 'Contractor' ? 0 : 1) - (b.role === 'Contractor' ? 0 : 1);
    if (roleOrder !== 0) return roleOrder;
    if (a.role === 'Subkon' && b.role === 'Subkon' && a.parentCompanyCode !== b.parentCompanyCode) return a.parentCompanyCode.localeCompare(b.parentCompanyCode);
    return a.name.localeCompare(b.name, 'id');
  });
  return success_(companies);
}

function listCompanyRegistry_() {
  const sheet = getSheet_('companies');
  const rows = sheet.getDataRange().getValues();
  const companies = [];
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][0] || '').trim().toUpperCase();
    if (!code) continue;
    companies.push({
      code: code,
      name: String(rows[i][1] || '').trim(),
      role: String(rows[i][2] || '').trim(),
      parentCompanyCode: String(rows[i][3] || '').trim().toUpperCase(),
      emailDomains: String(rows[i][4] || '').trim(),
      autoProvision: String(rows[i][5] || '').toUpperCase() === 'TRUE',
      status: String(rows[i][6] || 'INACTIVE').toUpperCase(),
      passportStatus: String(rows[i][7] || 'ACTIVE').toUpperCase(),
      picName: String(rows[i][8] || '').trim(),
      picContact: String(rows[i][9] || '').trim(),
      safetyPassportExpiry: String(rows[i][10] || '').trim()
    });
  }
  return success_(companies);
}


function revokeCompanySessions_(companyCode) {
  const targetCode = String(companyCode || '').trim().toUpperCase();
  if (!targetCode) return 0;
  const properties = PropertiesService.getScriptProperties();
  const allProperties = properties.getProperties();
  const cache = CacheService.getScriptCache();
  let revokedCount = 0;
  Object.keys(allProperties).forEach(function(key) {
    if (key.indexOf('session:') !== 0) return;
    let session = null;
    try { session = JSON.parse(allProperties[key]); } catch (err) { session = null; }
    if (!session) return;
    const ownCode = String(session.companyCode || '').trim().toUpperCase();
    const parentCode = String(session.parentCompanyCode || '').trim().toUpperCase();
    if (ownCode === targetCode || parentCode === targetCode) {
      properties.deleteProperty(key);
      cache.remove(key);
      revokedCount += 1;
    }
  });
  return revokedCount;
}

function upsertCompanyRegistryCore_(payload, actor, auditOut) {
  const input = isObject_(payload) ? payload : {};
  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const role = String(input.role || '').trim();
  const parentCode = String(input.parentCompanyCode || '').trim().toUpperCase();
  const domains = String(input.emailDomains || '').trim().toLowerCase();
  const autoProvision = input.autoProvision === true || String(input.autoProvision || '').toUpperCase() === 'TRUE';
  const status = String(input.status || 'ACTIVE').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,29}$/.test(code)) return error_(400, 'Kode perusahaan harus 2–30 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.');
  if (code === 'CGG') return error_(400, 'Kode CGG dicadangkan untuk perusahaan pemilik aplikasi dan tidak boleh digunakan sebagai kode kontraktor/Subkon.');
  if (name.length < 2) return error_(400, 'Nama perusahaan minimal 2 karakter.');
  if (['Contractor', 'Subkon'].indexOf(role) === -1) return error_(400, 'Kategori perusahaan harus Contractor atau Subkon.');
  if (['ACTIVE', 'INACTIVE'].indexOf(status) === -1) return error_(400, 'Status perusahaan tidak valid.');
  if (role === 'Contractor' && parentCode) return error_(400, 'Contractor tidak boleh memiliki perusahaan induk.');
  if (role === 'Subkon') {
    if (!parentCode || parentCode === code) return error_(400, 'Subkon wajib memilih Contractor induk yang berbeda.');
    const parent = findCompanyRegistry_(parentCode);
    if (!parent || parent.status !== 'ACTIVE' || parent.role !== 'Contractor') return error_(400, 'Contractor induk tidak terdaftar atau tidak aktif.');
  }
  if (autoProvision && !domains) return error_(400, 'Domain email resmi wajib diisi sebelum aktivasi otomatis.');
  const domainList = domains.split(/[;,\s]+/).filter(Boolean);
  const publicDomains = ['gmail.com', 'yahoo.com', 'yahoo.co.id', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com'];
  if (autoProvision && domainList.some(function(domain) { return publicDomains.indexOf(domain) >= 0 || domain.indexOf('.') < 1; })) return error_(400, 'Domain email untuk aktivasi otomatis harus domain perusahaan yang terverifikasi, bukan email publik.');
  const sheet = getSheet_('companies');
  const rows = sheet.getDataRange().getValues();
  let rowNumber = -1;
  for (let i = 1; i < rows.length; i++) if (String(rows[i][0] || '').trim().toUpperCase() === code) { rowNumber = i + 1; break; }
  const existingRow = rowNumber > 0 ? rows[rowNumber - 1] : [];
  const passportStatus = String(input.passportStatus || existingRow[7] || 'ACTIVE').trim().toUpperCase();
  if (['ACTIVE', 'WARNING', 'SUSPENDED'].indexOf(passportStatus) === -1) return error_(400, 'Status Safety Passport tidak valid.');
  const picName = Object.prototype.hasOwnProperty.call(input, 'picName') ? String(input.picName || '').trim() : String(existingRow[8] || '');
  const picContact = Object.prototype.hasOwnProperty.call(input, 'picContact') ? String(input.picContact || '').trim() : String(existingRow[9] || '');
  const safetyPassportExpiry = Object.prototype.hasOwnProperty.call(input, 'safetyPassportExpiry') ? String(input.safetyPassportExpiry || '').trim() : String(existingRow[10] || '');
  if (safetyPassportExpiry && !/^\\d{4}-\\d{2}-\\d{2}$/.test(safetyPassportExpiry)) return error_(400, 'Tanggal masa berlaku Safety Passport harus YYYY-MM-DD.');
  const values = [code, name, role, role === 'Subkon' ? parentCode : '', domains, autoProvision ? 'TRUE' : 'FALSE', status, passportStatus, picName, picContact, safetyPassportExpiry];
  if (rowNumber > 0) sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  auditOut.push({
    action: rowNumber > 0 ? 'COMPANY_MASTER_UPDATED' : 'COMPANY_MASTER_CREATED',
    details: { companyName: name, role: role, parentCompanyCode: role === 'Subkon' ? parentCode : '', status: status }
  });
  return success_({ code: code, name: name, role: role, parentCompanyCode: role === 'Subkon' ? parentCode : '', emailDomains: domains, autoProvision: autoProvision, status: status });
}

function upsertCompanyRegistry_(payload, actor) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  const auditOut = [];
  let result;
  const input = isObject_(payload) ? payload : {};
  const code = String(input.code || '').trim().toUpperCase();
  try {
    result = upsertCompanyRegistryCore_(payload, actor, auditOut);
    SpreadsheetApp.flush();
    // Keep tenant changes and session revocation in the same critical section.
    // This prevents a concurrent reactivation from racing with stale-token revocation.
    if (result && result.success) revokeCompanySessions_(code);
  } finally {
    lock.releaseLock();
  }

  // logAudit_ takes the same script lock; append it after the company row is committed.
  if (result && result.success && auditOut.length) {
    const audit = auditOut[0];
    logAudit_(actor, audit.action, 'companies', code, audit.details);
  }
  return result;
}

function findCompanyRegistry_(companyCode) {
  const code = String(companyCode || '').trim().toUpperCase();
  if (!code) return null;
  const rows = getSheet_('companies').getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() === code) {
      return { companyCode: code, companyName: String(rows[i][1] || '').trim(), role: String(rows[i][2] || '').trim(), parentCompanyCode: String(rows[i][3] || '').trim().toUpperCase(), emailDomains: String(rows[i][4] || ''), autoProvision: rows[i][5], status: String(rows[i][6] || '').toUpperCase() };
    }
  }
  return null;
}

function isUserCompanyActive_(user) {
  if (isAdminCGG_(user)) return true;
  const companyCode = String(user && user.companyCode || '').trim().toUpperCase();
  if (companyCode === 'CGG') return true;
  if (!companyCode) return false;

  const company = findCompanyRegistry_(companyCode);
  if (!company || company.status !== 'ACTIVE') return false;
  if (company.role === 'Contractor') return true;
  if (company.role !== 'Subkon') return false;

  const parentCode = String(company.parentCompanyCode || '').trim().toUpperCase();
  const userParentCode = String(user.parentCompanyCode || '').trim().toUpperCase();
  if (!parentCode || userParentCode !== parentCode) return false;
  const parent = findCompanyRegistry_(parentCode);
  return Boolean(parent && parent.status === 'ACTIVE' && parent.role === 'Contractor');
}

function isPicaApprovalSequenceValid_(stages, stageKey) {
  if (stageKey === 'spvHse') return stages.foreman === true;
  if (stageKey === 'ktt') return stages.foreman === true && stages.spvHse === true;
  return stageKey === 'foreman';
}

function enforcePicaClosureRules_(existingRecord, requestedPayload, user) {
  const oldStatus = String(existingRecord && existingRecord.status || '').trim().toUpperCase();
  const nextStatus = String(requestedPayload.status || oldStatus).trim().toUpperCase();
  const role = String((user.roles || [])[0] || 'Employee');
  const email = String(user.email || '').trim().toLowerCase();
  const assignedEmail = String(existingRecord.assignedToEmail || '').trim().toLowerCase();
  const isAssignedPIC = Boolean(assignedEmail && assignedEmail === email);
  const isHSEValidator = ['Foreman', 'Foreman Safety', 'SPV HSE'].indexOf(role) >= 0 && user.roleVerified === true;

  if (oldStatus === 'CLOSED' && nextStatus !== 'CLOSED') return error_(403, 'PICA yang sudah ditutup tidak dapat dibuka kembali.');
  if (Object.prototype.hasOwnProperty.call(requestedPayload, 'completionDate') &&
      String(requestedPayload.completionDate || '') !== String(existingRecord.completionDate || '')) {
    return error_(403, 'Tanggal penyelesaian ditetapkan otomatis oleh server.');
  }

  if (nextStatus === 'WAITING_HSE' && oldStatus !== 'WAITING_HSE') {
    if (!isAssignedPIC) return error_(403, 'Hanya PIC yang ditugaskan dapat mengajukan penutupan PICA.');
    if (['OPEN', 'PROGRESS'].indexOf(oldStatus) === -1) return error_(409, 'Status PICA tidak dapat diajukan dari status saat ini.');
    if (!String(requestedPayload.correctiveAction || existingRecord.correctiveAction || '').trim()) return error_(400, 'Tindakan perbaikan wajib diisi.');
    if (!String(requestedPayload.evidencePhotoUrl || existingRecord.evidencePhotoUrl || '').trim()) return error_(400, 'Bukti foto penyelesaian wajib dilampirkan.');
    requestedPayload.submittedAt = new Date().toISOString();
    requestedPayload.closeRequestedAt = requestedPayload.submittedAt;
    requestedPayload.rejectionReason = '';
  }

  if (nextStatus === 'CLOSED' && oldStatus !== 'CLOSED') {
    if (!isHSEValidator) return error_(403, 'Penutupan PICA hanya dapat divalidasi Foreman Safety atau SPV HSE yang telah diverifikasi.');
    if (oldStatus !== 'WAITING_HSE') return error_(409, 'PICA belum diajukan PIC untuk validasi HSE.');
    requestedPayload.hseValidatedBy = String(user.displayName || user.email || '');
    requestedPayload.hseValidatedRole = role;
    requestedPayload.hseValidatedAt = new Date().toISOString();
    requestedPayload.completionDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  }

  if (nextStatus === 'PROGRESS' && oldStatus === 'WAITING_HSE') {
    if (!isHSEValidator) return error_(403, 'Hanya Foreman Safety atau SPV HSE yang dapat mengembalikan PICA kepada PIC.');
    if (!String(requestedPayload.rejectionReason || '').trim()) return error_(400, 'Alasan pengembalian wajib diisi.');
  }

  if (nextStatus !== oldStatus && ['OPEN', 'PROGRESS', 'WAITING_HSE', 'CLOSED', 'OVERDUE'].indexOf(nextStatus) === -1) {
    return error_(400, 'Status PICA tidak valid.');
  }
  return null;
}

function createSessionResponse_(user) {
  if (!isUserCompanyActive_(user)) return error_(403, 'Perusahaan akun tidak aktif atau relasi Contractor induk tidak valid.');
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const sessionUser = { id: user.id, email: user.email, displayName: user.displayName, roles: user.roles, status: user.status, companyCode: user.companyCode || '', parentCompanyCode: user.parentCompanyCode || '', position: user.position || '', department: user.department || '', section: user.section || '', roleVerified: user.roleVerified === true };
  const sessionRecord = Object.assign({}, sessionUser, {
    issuedAt: Date.now(),
    expiresAt: Date.now() + (CONFIG.SESSION_TTL * 1000)
  });
  PropertiesService.getScriptProperties().setProperty('session:' + token, JSON.stringify(sessionRecord));
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(sessionRecord), CONFIG.SESSION_TTL);
  return success_({ token: token, user: publicUser_(sessionUser) });
}

function passwordHash_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + ':' + String(password), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes);
}

// Compare fixed-format password hashes without stopping at the first differing character.
// This reduces timing leakage during hash verification; it does not replace a slow password KDF.
function constantTimeStringEquals_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  const maxLength = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let i = 0; i < maxLength; i++) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return difference === 0;
}

function migrateLegacyPassword_(user, password) {
  const sheet = getSheet_('users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(user.id)) {
      const salt = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      sheet.getRange(i + 1, 3).setValue('');
      sheet.getRange(i + 1, 7, 1, 2).setValues([[passwordHash_(password, salt), salt]]);
      user.password = '';
      user.passwordHash = passwordHash_(password, salt);
      user.passwordSalt = salt;
      break;
    }
  }
}

function setGoogleSubject_(userId, subject) {
  const sheet = getSheet_('users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (String(rows[i][0]) === String(userId)) { sheet.getRange(i + 1, 9).setValue(subject); return; }
}

function isAdminCGG_(user) {
  // KTT is a technical role, never an administrator role. Only explicit Admin CGG grants administration.
  return Boolean(user && user.roles && user.roles.indexOf('Admin CGG') !== -1);
}

function isCompanyAdmin_(user) {
  return Boolean(user && user.roles && user.roles.indexOf('Company Admin') !== -1);
}

function canPublishForms_(user) {
  return isAdminCGG_(user) || isCompanyAdmin_(user);
}

function isReadOnlyController_(user) {
  const roles = user && user.roles || [];
  return roles.some(function(role) { return ['KTT', 'SPT', 'SPV', 'PJO', 'SPV HSE', 'Foreman Safety'].indexOf(role) >= 0; });
}

function isCompanyScopedRole_(user) {
  const roles = user && user.roles || [];
  return roles.some(function(role) { return ['Company Admin', 'Contractor', 'Subkon', 'Employee', 'Crew', 'Foreman', 'Supervisor', 'Superintendent', 'KTT', 'SPT', 'SPV', 'Project Manager', 'PJO', 'SPV HSE', 'Foreman Safety', 'Safety Officer', 'Paramedis', 'Contractor PIC'].indexOf(role) >= 0; });
}

function canManageCompany_(actor, targetCompanyCode) {
  if (isAdminCGG_(actor)) return true;
  if (!isCompanyAdmin_(actor)) return false;
  const ownCode = String(actor.companyCode || '').trim().toUpperCase();
  const targetCode = String(targetCompanyCode || '').trim().toUpperCase();
  if (!ownCode || !targetCode) return false;
  if (ownCode === 'CGG' && targetCode === 'CGG') return true;
  const ownCompany = findCompanyRegistry_(ownCode);
  if (!ownCompany || ownCompany.status !== 'ACTIVE') return false;
  if (ownCode === targetCode) return true;
  const targetCompany = findCompanyRegistry_(targetCode);
  return Boolean(ownCompany.role === 'Contractor' && targetCompany && targetCompany.status === 'ACTIVE' && targetCompany.role === 'Subkon' && targetCompany.parentCompanyCode === ownCode);
}

function listPublicUsers_() {
  const sheet = getSheet_('users');
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(row => row[0]).map(row => ({
    id: String(row[0]), email: String(row[1] || ''), displayName: String(row[3] || ''),
    roles: [String(row[4] || 'Subkon')], status: String(row[5] || 'INACTIVE'),
    companyCode: String(row[9] || ''), parentCompanyCode: String(row[10] || ''),
    position: String(row[11] || ''), department: String(row[12] || ''), section: String(row[13] || ''), roleVerified: String(row[14] || '').toUpperCase() === 'TRUE' || row[14] === true
  }));
}

function createManagedUser_(payload, actor) {
  const input = isObject_(payload) ? payload : {};
  const displayName = String(input.displayName || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  const role = String(input.role || 'Employee');
  const companyCode = String(input.companyCode || actor.companyCode || '').trim().toUpperCase();
  const isCGG = isAdminCGG_(actor);
  const isCGGCompanyAdmin = isCompanyAdmin_(actor) && String(actor.companyCode || '').trim().toUpperCase() === 'CGG' && companyCode === 'CGG';
  const canManageCGGUsers = isCGG || isCGGCompanyAdmin;
  const isInternalCGG = companyCode === 'CGG' && canManageCGGUsers;
  const company = companyCode && !isInternalCGG ? findCompanyRegistry_(companyCode) : null;
  const parentCompanyCode = company && company.role === 'Subkon' ? company.parentCompanyCode : '';
  const companyAdminRoles = ['PJO', 'SPV HSE', 'Foreman Safety', 'Superintendent', 'Supervisor', 'Foreman', 'Safety Officer', 'Paramedis', 'Contractor PIC', 'Employee'];
  const cggRoles = ['Company Admin', 'KTT', 'SPT', 'SPV', 'Project Manager', 'Superintendent', 'Supervisor', 'Foreman', 'SPV HSE', 'Foreman Safety', 'PJO', 'Safety Officer', 'Paramedis', 'Contractor PIC', 'Employee'];
  const seniorRoles = ['KTT', 'SPT', 'SPV', 'Project Manager', 'Superintendent', 'Supervisor', 'Foreman', 'SPV HSE', 'Foreman Safety', 'PJO'];
  if (displayName.length < 2) return error_(400, 'Nama karyawan minimal 2 karakter.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error_(400, 'Format email tidak valid.');
  if (password.length < 12) return error_(400, 'Password minimal 12 karakter.');
  if ((canManageCGGUsers && cggRoles.indexOf(role) === -1) || (!canManageCGGUsers && companyAdminRoles.indexOf(role) === -1)) return error_(403, 'Jenis akun tidak diizinkan untuk peran Anda. Admin hanya dapat mendaftarkan akun sesuai cakupan perusahaannya.');
  if (role === 'Company Admin' && !isCGG) return error_(403, 'Hanya Admin CGG yang dapat menunjuk Admin Perusahaan.');
  if (findUserByEmail_(email)) return error_(409, 'Email sudah terdaftar.');
  if (isInternalCGG) {
    // Internal CGG personnel may use their verified Google/Gmail account.
    // Privileged access still requires server-side role verification.
  } else {
    if (!company || company.status !== 'ACTIVE') return error_(400, 'Perusahaan harus terdaftar aktif pada master perusahaan.');
    if (!isCGG && !canManageCompany_(actor, companyCode)) return error_(403, 'Admin Perusahaan hanya dapat membuat akun dalam cakupan perusahaan sendiri dan subkon yang terdaftar di bawahnya.');
    if ((role === 'Contractor' && company.role !== 'Contractor') || (role === 'Subkon' && company.role !== 'Subkon')) return error_(400, 'Jenis akun Contractor/Subkon harus sesuai kategori master perusahaan.');
  }
  if (role === 'Company Admin' && !isCGG) return error_(403, 'Hanya Admin CGG yang dapat menunjuk Admin Perusahaan.');
  // New elevated roles must be explicitly verified in the Admin CGG verification panel.
  const roleVerified = false;
  const salt = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const user = { id: Utilities.getUuid(), email: email, password: '', displayName: displayName, roles: [role], status: 'ACTIVE', passwordSalt: salt, passwordHash: passwordHash_(password, salt), googleSub: '', companyCode: isInternalCGG ? 'CGG' : companyCode, parentCompanyCode: parentCompanyCode, position: String(input.position || role).trim(), department: String(input.department || '').trim(), section: String(input.section || '').trim(), roleVerified: roleVerified };
  const userRow = [user.id, user.email, '', user.displayName, role, 'ACTIVE', user.passwordHash, user.passwordSalt, '', user.companyCode, user.parentCompanyCode, user.position, user.department, user.section, roleVerified];
  if (!appendUniqueUser_(email, userRow)) return error_(409, 'Email sudah terdaftar.');
  logAudit_(actor, 'USER_CREATED_' + role.toUpperCase().replace(/ /g, '_'), 'users', user.id, { targetEmail: user.email, role: role, companyCode: user.companyCode, status: 'ACTIVE', roleVerified: roleVerified });
  return success_(publicUser_(user));
}


function revokeUserSessions_(userId) {
  const properties = PropertiesService.getScriptProperties();
  const allProperties = properties.getProperties();
  const cache = CacheService.getScriptCache();
  let revokedCount = 0;
  Object.keys(allProperties).forEach(function(key) {
    if (key.indexOf('session:') !== 0) return;
    let session = null;
    try { session = JSON.parse(allProperties[key]); } catch (err) { session = null; }
    if (session && String(session.id || '') === String(userId)) {
      properties.deleteProperty(key);
      cache.remove(key);
      revokedCount += 1;
    }
  });
  return revokedCount;
}

function updateUserAccessCore_(userId, payload, actor, auditOut) {
  const input = isObject_(payload) ? payload : {};
  const allowedRoles = ['Company Admin', 'Contractor', 'Subkon', 'KTT', 'SPT', 'SPV', 'Project Manager', 'Superintendent', 'Supervisor', 'Foreman', 'PJO', 'SPV HSE', 'Foreman Safety', 'Safety Officer', 'Paramedis', 'Contractor PIC', 'Employee'];
  const role = input.role === undefined ? null : String(input.role);
  const status = input.status === undefined ? null : String(input.status).toUpperCase();
  const companyCode = input.companyCode === undefined ? null : String(input.companyCode || '').trim().toUpperCase();
  const parentCompanyCode = input.parentCompanyCode === undefined ? null : String(input.parentCompanyCode || '').trim().toUpperCase();
  const hasVerificationUpdate = Object.prototype.hasOwnProperty.call(input, 'roleVerified');
  if (!isAdminCGG_(actor) && hasVerificationUpdate) return error_(403, 'Hanya Admin CGG yang dapat memverifikasi jabatan.');
  if (hasVerificationUpdate && typeof input.roleVerified !== 'boolean') return error_(400, 'roleVerified harus berupa boolean.');
  if (role !== null && allowedRoles.indexOf(role) === -1) return error_(400, 'Jenis akun tidak valid.');
  if (!isAdminCGG_(actor) && (companyCode !== null || parentCompanyCode !== null)) return error_(403, 'Admin Perusahaan tidak dapat mengubah relasi perusahaan akun.');
  const companyAdminAssignableRoles = ['PJO', 'SPV HSE', 'Foreman Safety', 'Superintendent', 'Supervisor', 'Foreman', 'Safety Officer', 'Paramedis', 'Contractor PIC', 'Employee'];
  if (!isAdminCGG_(actor) && role !== null && (!isCompanyAdmin_(actor) || companyAdminAssignableRoles.indexOf(role) === -1)) return error_(403, 'Admin Perusahaan hanya dapat menetapkan jabatan operasional dalam cakupan perusahaannya.');
  if (status !== null && ['ACTIVE', 'INACTIVE'].indexOf(status) === -1) return error_(400, 'Status akun tidak valid.');
  const sheet = getSheet_('users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(userId)) continue;
    const previousRole = String(rows[i][4] || 'Employee');
    const previousStatus = String(rows[i][5] || 'ACTIVE');
    const previousCompanyCode = String(rows[i][9] || '').trim().toUpperCase();
    const previousRoleVerified = String(rows[i][14] || '').toUpperCase() === 'TRUE' || rows[i][14] === true;
    const nextRole = role || previousRole;
    const existingCompanyCode = previousCompanyCode;
    if (!isAdminCGG_(actor) && (!canManageCompany_(actor, existingCompanyCode) || String(rows[i][4] || '') === 'Company Admin')) return error_(403, 'Admin Perusahaan tidak dapat mengelola akun di luar cakupannya atau mengubah Admin Perusahaan.');
    const nextCompany = companyCode === null ? String(rows[i][9] || '') : companyCode;
    const nextParent = parentCompanyCode === null ? String(rows[i][10] || '') : parentCompanyCode;
    if (role !== null || companyCode !== null || parentCompanyCode !== null) {
      if (nextCompany !== 'CGG') {
        if (!nextCompany) return error_(400, 'Kode perusahaan wajib untuk akun perusahaan.');
        const company = findCompanyRegistry_(nextCompany);
        if (!company || company.status !== 'ACTIVE') return error_(400, 'Perusahaan tidak terdaftar aktif pada master perusahaan.');
        if (['Contractor', 'Subkon'].indexOf(nextRole) >= 0 && company.role !== nextRole) return error_(400, 'Jenis akun Contractor/Subkon harus sesuai kategori master perusahaan.');
        if (company.role === 'Subkon') {
          const parent = findCompanyRegistry_(company.parentCompanyCode);
          if (!parent || parent.status !== 'ACTIVE' || parent.role !== 'Contractor') return error_(400, 'Relasi Contractor induk pada master perusahaan tidak valid.');
        }
      } else if (!isAdminCGG_(actor)) {
        return error_(403, 'Hanya Admin CGG yang dapat menetapkan akun internal CGG.');
      }
    }
    const storedCompanyCode = nextRole === 'Admin CGG' ? '' : nextCompany;
    const nextCompanyRecord = storedCompanyCode && storedCompanyCode !== 'CGG' ? findCompanyRegistry_(storedCompanyCode) : null;
    const storedParentCode = nextRole === 'Admin CGG' ? '' : (nextCompanyRecord ? nextCompanyRecord.parentCompanyCode : '');
    let roleVerified = String(rows[i][14] || '').toUpperCase() === 'TRUE' || rows[i][14] === true;
    if (role !== null && role !== String(rows[i][4] || '')) roleVerified = false;
    if (hasVerificationUpdate) roleVerified = input.roleVerified;
    if (roleVerified && ['KTT', 'SPT', 'SPV', 'Project Manager', 'Superintendent', 'Supervisor', 'Foreman', 'SPV HSE', 'Foreman Safety', 'PJO'].indexOf(nextRole) === -1) roleVerified = false;
    const position = input.position === undefined ? String(rows[i][11] || '') : String(input.position || '').trim();
    if (input.position !== undefined && !isAdminCGG_(actor) && !isCompanyAdmin_(actor)) return error_(403, 'Hanya Admin CGG atau Admin Perusahaan yang dapat menetapkan jabatan dalam cakupannya.');
    sheet.getRange(i + 1, 5).setValue(nextRole);
    if (status !== null) sheet.getRange(i + 1, 6).setValue(status);
    sheet.getRange(i + 1, 10, 1, 2).setValues([[storedCompanyCode, storedParentCode]]);
    sheet.getRange(i + 1, 12).setValue(position);
    sheet.getRange(i + 1, 15).setValue(roleVerified);
    auditOut.push({
      action: hasVerificationUpdate ? (roleVerified ? 'ROLE_VERIFIED' : 'ROLE_VERIFICATION_REVOKED') : 'USER_ACCESS_UPDATED',
      details: {
        roleFrom: previousRole,
        roleTo: nextRole,
        statusFrom: previousStatus,
        statusTo: status || previousStatus,
        companyCodeFrom: previousCompanyCode,
        companyCodeTo: storedCompanyCode,
        roleVerifiedFrom: previousRoleVerified,
        roleVerifiedTo: roleVerified,
        position: position
      }
    });
    return success_({ id: String(rows[i][0]), email: String(rows[i][1] || ''), displayName: String(rows[i][3] || ''), roles: [nextRole], status: status || String(rows[i][5] || 'ACTIVE'), companyCode: storedCompanyCode, parentCompanyCode: storedParentCode, position: position, department: String(rows[i][12] || ''), section: String(rows[i][13] || ''), roleVerified: roleVerified });
  }
  return error_(404, 'Akun tidak ditemukan.');
}

function updateUserAccess_(userId, payload, actor) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  const auditOut = [];
  let result;
  try {
    result = updateUserAccessCore_(userId, payload, actor, auditOut);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  // Invalidate every previously issued token for this account after the
  // authoritative user row has been committed. A later reactivation must not
  // resurrect sessions issued before the access change.
  if (result && result.success) revokeUserSessions_(userId);

  // Audit logging acquires the same script lock, so it must run after the
  // user-row transaction releases its lock.
  if (result && result.success && auditOut.length) {
    const audit = auditOut[0];
    logAudit_(actor, audit.action, 'users', userId, audit.details);
  }
  return result;
}

function isOversightRole_(user) {
  const roles = user && user.roles || [];
  return roles.some(function(role) { return ['KTT', 'SPT', 'SPV'].indexOf(role) >= 0; });
}

function getOversightCompanyCodes_() {
  const allowed = {};
  const sheet = getSheet_('companies');
  const rows = sheet.getDataRange().getValues();
  // Oversight roots are only the active SLS/VIP contractor registrations.
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][0] || '').trim().toUpperCase();
    const role = String(rows[i][2] || '').trim();
    const status = String(rows[i][6] || '').trim().toUpperCase();
    if ((code === 'SLS' || code === 'VIP') && role === 'Contractor' && status === 'ACTIVE') allowed[code] = true;
  }
  // Include only active subcontracts whose registered parent is an active oversight root.
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][0] || '').trim().toUpperCase();
    const parent = String(rows[i][3] || '').trim().toUpperCase();
    const role = String(rows[i][2] || '').trim();
    const status = String(rows[i][6] || '').trim().toUpperCase();
    if (code && role === 'Subkon' && status === 'ACTIVE' && allowed[parent]) allowed[code] = true;
  }
  return allowed;
}

function isRecordVisibleToUser_(record, user) {
  if (!record) return false;
  if (isAdminCGG_(user)) return true;
  if (!isCompanyScopedRole_(user)) return false;
  const ownCompany = String(user.companyCode || '').trim().toUpperCase();
  const parentCompany = String(user.parentCompanyCode || '').trim().toUpperCase();
  const recordCompany = String(record.companyCode || record.contractorCode || record.ownerCompanyCode || '').trim().toUpperCase();
  const recordSubkon = String(record.subcontractorCode || record.subkonCode || '').trim().toUpperCase();
  const recordParent = String(record.parentCompanyCode || '').trim().toUpperCase();
  if (!ownCompany) return false;

  // Disabled or orphaned companies must lose access even if their user account remains active.
  if (!isOversightRole_(user) && ownCompany !== 'CGG') {
    const ownRegistry = findCompanyRegistry_(ownCompany);
    if (!ownRegistry || ownRegistry.status !== 'ACTIVE') return false;
    if (ownRegistry.role === 'Subkon') {
      const parentRegistry = findCompanyRegistry_(ownRegistry.parentCompanyCode);
      if (!parentRegistry || parentRegistry.status !== 'ACTIVE' || parentRegistry.role !== 'Contractor') return false;
    }
  }

  // KTT/SPT/SPV share one oversight scope: active SLS, VIP, and active subcontracts below either contractor.
  if (isOversightRole_(user) && user.roleVerified === true) {
    const allowed = getOversightCompanyCodes_();
    return Boolean(allowed[recordCompany] || allowed[recordSubkon] || allowed[recordParent]);
  }
  // Unverified supervisory accounts behave like crew and remain within their own tenant.

  if (parentCompany) return recordCompany === ownCompany || recordSubkon === ownCompany;
  const ownRegistry = findCompanyRegistry_(ownCompany);
  if (ownRegistry && ownRegistry.role === 'Contractor') {
    return recordCompany === ownCompany || recordSubkon === ownCompany || recordParent === ownCompany;
  }
  return recordCompany === ownCompany || recordSubkon === ownCompany;
}

function requiresRoleVerification_(user) {
  const roles = user && user.roles || [];
  const elevatedRoles = ['KTT', 'SPT', 'SPV', 'Project Manager', 'Superintendent', 'Supervisor', 'Foreman', 'SPV HSE', 'Foreman Safety', 'PJO'];
  return roles.some(function(role) { return elevatedRoles.indexOf(role) !== -1; });
}

function assertVerifiedRole_(user, actionLabel) {
  if (requiresRoleVerification_(user) && user.roleVerified !== true) {
    throw httpError_(403, 'Jabatan belum diverifikasi. Akun hanya dapat menggunakan akses dasar sampai verifikasi disetujui.');
  }
}

function applyRecordScope_(entity, record, user, creating) {
  const roles = user.roles || [];
  if (isAdminCGG_(user)) return record;
  if (isReadOnlyController_(user) && user.roleVerified === true) throw httpError_(403, 'Akun pengawas KTT/SPT/SPV/PJO/SPV HSE/Foreman Safety bersifat baca-saja; gunakan alur persetujuan khusus jika tersedia.');
  const role = String(roles[0] || 'Employee');
  const ownCompany = String(user.companyCode || '').trim().toUpperCase();
  const parentCompany = String(user.parentCompanyCode || '').trim().toUpperCase();
  if (!ownCompany) throw httpError_(403, 'Akun belum dikaitkan ke perusahaan. Hubungi administrator perusahaan.');
  if (ownCompany !== 'CGG') {
    const ownRegistry = findCompanyRegistry_(ownCompany);
    if (!ownRegistry || ownRegistry.status !== 'ACTIVE') throw httpError_(403, 'Perusahaan akun tidak aktif atau tidak terdaftar pada master perusahaan.');
    if (ownRegistry.role === 'Subkon') {
      const parentRegistry = findCompanyRegistry_(ownRegistry.parentCompanyCode);
      if (!parentRegistry || parentRegistry.status !== 'ACTIVE' || parentRegistry.role !== 'Contractor' || String(user.parentCompanyCode || '').trim().toUpperCase() !== String(ownRegistry.parentCompanyCode || '').trim().toUpperCase()) {
        throw httpError_(403, 'Relasi perusahaan induk Subkon tidak aktif atau tidak valid.');
      }
    }
  }
  if (requiresRoleVerification_(user) && user.roleVerified !== true && ['inspections', 'hazards'].indexOf(entity) === -1) throw httpError_(403, 'Jabatan belum diverifikasi. Akses sementara hanya untuk laporan Inspeksi dan Hazard.');
  if (role === 'Employee' && ['inspections', 'hazards'].indexOf(entity) === -1) throw httpError_(403, 'Akun umum hanya dapat membuat laporan Inspeksi dan Hazard.');
  if (['Company Admin', 'Contractor', 'Subkon', 'Employee', 'Crew', 'Foreman', 'Supervisor', 'Superintendent', 'KTT', 'Project Manager', 'PJO', 'SPV HSE', 'Foreman Safety', 'Safety Officer', 'Paramedis', 'Contractor PIC'].indexOf(role) === -1) throw httpError_(403, 'Akses penulisan data ditolak.');
  const next = Object.assign({}, record);
  if (creating) {
    const targetSubkon = String(next.subcontractorCode || next.subkonCode || '').trim().toUpperCase();
    if (parentCompany) {
      if (targetSubkon && targetSubkon !== ownCompany) throw httpError_(403, 'Subkon hanya dapat membuat data untuk perusahaannya sendiri.');
      next.subcontractorCode = ownCompany;
    } else if (targetSubkon) {
      const subkon = findCompanyRegistry_(targetSubkon);
      if (!subkon || subkon.role !== 'Subkon' || subkon.status !== 'ACTIVE' || subkon.parentCompanyCode !== ownCompany) throw httpError_(403, 'Data hanya dapat ditugaskan ke Subkon aktif yang terdaftar di bawah perusahaan ini.');
    }
    next.companyCode = ownCompany;
    next.contractorCode = parentCompany || ownCompany;
    next.parentCompanyCode = parentCompany;
    return next;
  }
  if (!isRecordVisibleToUser_(next, user)) throw httpError_(403, 'Anda tidak memiliki akses untuk mengubah data ini.');
  return next;
}

function findCompanyUser_(companyCode) {
  const rows = getSheet_('users').getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][9] || '').trim().toUpperCase() === String(companyCode).trim().toUpperCase() && String(rows[i][5] || '') === 'ACTIVE') {
      return { id: String(rows[i][0] || ''), email: String(rows[i][1] || ''), displayName: String(rows[i][3] || ''), roles: [String(rows[i][4] || 'Subkon')], status: String(rows[i][5] || ''), companyCode: String(rows[i][9] || ''), parentCompanyCode: String(rows[i][10] || '') };
    }
  }
  return null;
}

// ============================================================
// RESPONSE
// ============================================================

function success_(
  data
) {
  return {
    success:
      true,

    data:
      data,

    message:
      '',

    status:
      200,

    timestamp:
      new Date().toISOString()
  };
}


function error_(
  status,
  message
) {
  return {
    success:
      false,

    data:
      null,

    message:
      message instanceof
      Error
        ? String(
            message.message ||
              message
          )
        : String(
            message ||
              'HDOS request failed'
          ),

    status:
      Number(
        status ||
          500
      ),

    timestamp:
      new Date().toISOString()
  };
}


function respond_(
  body
) {
  return ContentService
    .createTextOutput(
      JSON.stringify(
        body
      )
    )
    .setMimeType(
      ContentService
        .MimeType
        .JSON
    );
}


// ============================================================
// REQUEST BODY
// ============================================================

function parseRequestBody_(
  e
) {
  if (
    !e ||
    !e.postData ||
    !e.postData.contents
  ) {
    return {};
  }

  try {
    const body =
      JSON.parse(
        e.postData.contents
      );

    return isObject_(
      body
    )
      ? body
      : {};
  } catch (err) {
    throw new Error(
      'Payload JSON tidak valid'
    );
  }
}


// ============================================================
// USER FUNCTIONS
// ============================================================

function findUserByEmail_(email) {
  const sheet = getSheet_('users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() !== String(email).trim().toLowerCase()) continue;
    return {
      id: String(rows[i][0] || ''), email: String(rows[i][1] || ''), password: String(rows[i][2] || ''),
      displayName: String(rows[i][3] || ''), roles: [String(rows[i][4] || 'Employee')], status: String(rows[i][5] || 'INACTIVE'),
      passwordHash: String(rows[i][6] || ''), passwordSalt: String(rows[i][7] || ''), googleSub: String(rows[i][8] || ''), companyCode: String(rows[i][9] || ''), parentCompanyCode: String(rows[i][10] || ''), position: String(rows[i][11] || ''), department: String(rows[i][12] || ''), section: String(rows[i][13] || ''), roleVerified: String(rows[i][14] || '').toUpperCase() === 'TRUE' || rows[i][14] === true
    };
  }
  return null;
}

function requireAuth_(token) {
  if (!token) throw httpError_(401, 'Unauthorized: Token required');
  const properties = PropertiesService.getScriptProperties();
  // Script Properties are the authoritative session registry. Do not fall
  // back to CacheService: a revoked persistent token must never be revived by
  // a stale cache entry.
  const raw = properties.getProperty('session:' + token);
  if (!raw) {
    CacheService.getScriptCache().remove('session:' + token);
    throw httpError_(401, 'Unauthorized: Session invalid. Silakan masuk kembali.');
  }
  let session;
  try {
    session = JSON.parse(raw);
  } catch (error) {
    properties.deleteProperty('session:' + token);
    CacheService.getScriptCache().remove('session:' + token);
    throw httpError_(401, 'Data sesi tidak valid. Silakan masuk kembali.');
  }
  const now = Date.now();
  if (!Number.isFinite(Number(session.expiresAt)) || Number(session.expiresAt) <= now) {
    properties.deleteProperty('session:' + token);
    CacheService.getScriptCache().remove('session:' + token);
    throw httpError_(401, 'Sesi telah kedaluwarsa. Silakan masuk kembali.');
  }
  const current = findUserByEmail_(session.email);
  // Bind every session to the immutable user ID captured at issuance. An email
  // address may be changed or reused; an old token must never authenticate a
  // different account that later receives the same email address.
  if (!current || !session.id || String(current.id) !== String(session.id) || current.status !== 'ACTIVE') {
    properties.deleteProperty('session:' + token);
    CacheService.getScriptCache().remove('session:' + token);
    throw httpError_(401, 'Akun tidak aktif, berubah, atau tidak ditemukan. Silakan masuk kembali.');
  }
  if (!isUserCompanyActive_(current)) {
    properties.deleteProperty('session:' + token);
    CacheService.getScriptCache().remove('session:' + token);
    throw httpError_(401, 'Perusahaan akun tidak aktif atau relasi Contractor induk tidak valid.');
  }
  // Always trust current role/status from the users sheet, not stale client session data.
  return { id: current.id, email: current.email, displayName: current.displayName, roles: current.roles, status: current.status, companyCode: current.companyCode || '', parentCompanyCode: current.parentCompanyCode || '', position: current.position || '', department: current.department || '', section: current.section || '', roleVerified: current.roleVerified === true };
}

function publicUser_(
  user
) {
  return {
    id:
      user.id,

    email:
      user.email,

    displayName:
      user.displayName,

    roles:
      user.roles,
    status:
      user.status,
    companyCode: user.companyCode || '',
    parentCompanyCode: user.parentCompanyCode || '',
    position: user.position || '', department: user.department || '', section: user.section || '', roleVerified: user.roleVerified === true
  };
}


// ============================================================
// SPREADSHEET FUNCTIONS
// ============================================================

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('HDOS_SPREADSHEET_ID') || CONFIG.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('Script Property HDOS_SPREADSHEET_ID belum dikonfigurasi.');
  return SpreadsheetApp.openById(spreadsheetId);
}


function getSheet_(
  name
) {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet && ENTITY_SCHEMAS[name]) {
    sheet = spreadsheet.insertSheet(name);
    sheet.getRange(1, 1, 1, ENTITY_SCHEMAS[name].length).setValues([ENTITY_SCHEMAS[name]]);
    sheet.setFrozenRows(1);
  }
  if (!sheet) throw new Error('Sheet tidak ditemukan: ' + name);
  return sheet;
}


// ============================================================
// CRUD — READ ALL
// ============================================================

function readAll_(
  entity
) {
  const sheet =
    getSheet_(
      entity
    );

  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < 2
  ) {
    return [];
  }

  const results = [];

  for (
    let rowNumber = 2;
    rowNumber <= lastRow;
    rowNumber++
  ) {
    const id =
      sheet
        .getRange(
          rowNumber,
          1,
          1,
          1
        )
        .getValue();

    if (!id) {
      continue;
    }

    results.push(
      parseRow_(
        sheet,
        rowNumber
      )
    );
  }

  return results;
}


// ============================================================
// CRUD — READ ONE
// ============================================================

function readOne_(
  entity,
  id
) {
  const sheet =
    getSheet_(
      entity
    );

  const rowNumber =
    findRecordRow_(
      sheet,
      id
    );

  if (!rowNumber) {
    throw httpError_(
      404,
      'Record not found'
    );
  }

  return parseRow_(
    sheet,
    rowNumber
  );
}


// ============================================================
// CRUD — CREATE
// ============================================================

function getExistingRecordForCreate_(sheet, id, user) {
  const rowNumber = findRecordRow_(sheet, id);
  if (!rowNumber) return null;
  const existing = parseRow_(sheet, rowNumber);
  if (!isAdminCGG_(user) && !isRecordVisibleToUser_(existing, user)) {
    throw httpError_(403, 'ID record sudah digunakan di luar cakupan perusahaan Anda.');
  }
  return existing;
}

function createRecord_(
  entity,
  payload,
  user
) {
  const sheet =
    getSheet_(
      entity
    );

  const safePayload =
    isObject_(
      payload
    )
      ? payload
      : {};

  const now =
    new Date().toISOString();


  // ----------------------------------------------------------
  // PRESERVE LOCAL ID
  // ----------------------------------------------------------

  const id =
    typeof safePayload.id ===
      'string' &&
    safePayload.id.trim()
      ? safePayload.id.trim()
      : Utilities.getUuid();


  // ----------------------------------------------------------
  // IDEMPOTENCY
  // ----------------------------------------------------------

  const existing = getExistingRecordForCreate_(sheet, id, user);
  if (existing) return existing;


  // ----------------------------------------------------------
  // CODE
  // ----------------------------------------------------------

  const rowNum =
    sheet.getLastRow();

  const code =
    typeof safePayload.code ===
      'string' &&
    safePayload.code.trim()
      ? safePayload.code.trim()
      : buildEntityCode_(
          entity,
          rowNum
        );


  // ----------------------------------------------------------
  // TIMESTAMP
  // ----------------------------------------------------------

  const createdAt =
    typeof safePayload.createdAt ===
        'string' &&
      safePayload.createdAt
      ? safePayload.createdAt
      : now;

  const updatedAt =
    typeof safePayload.updatedAt ===
        'string' &&
      safePayload.updatedAt
      ? safePayload.updatedAt
      : now;


  // ----------------------------------------------------------
  // CANONICAL ITEM
  // ----------------------------------------------------------

  const item =
    Object.assign(
      {},
      safePayload,
      {
        id:
          id,

        code:
          code,

        createdAt:
          createdAt,

        updatedAt:
          updatedAt,

        status:
          safePayload.status ||
          'OPEN'
      }
    );


  // ----------------------------------------------------------
  // SCHEMA
  // ----------------------------------------------------------

  const headers =
    ENTITY_SCHEMAS[
      entity
    ];

  if (!headers) {
    throw new Error(
      'Schema entity tidak ditemukan: ' +
        entity
    );
  }


  // ----------------------------------------------------------
  // LOCK CONCURRENT CREATE
  // ----------------------------------------------------------

  const lock =
    LockService
      .getScriptLock();

  lock.waitLock(
    10000
  );

  try {

    // Recheck after lock to prevent race condition.
    const duplicate = getExistingRecordForCreate_(sheet, id, user);
    if (duplicate) return duplicate;

    sheet.appendRow(
      buildEntityRow_(
        entity,
        item,
        headers
      )
    );

    SpreadsheetApp.flush();

  } finally {
    lock.releaseLock();
  }


  // ----------------------------------------------------------
  // AUDIT
  // ----------------------------------------------------------

  logAudit_(
    user,
    'CREATE',
    entity,
    id
  );

  return item;
}


// ============================================================
// CRUD — UPDATE
// ============================================================

function isExpectedPicaStateCurrent_(current, expected) {
  if (!expected) return true;
  const currentStages = current && current.approvalStages || {};
  const expectedStages = expected.approvalStages || {};
  return String(current && current.status || '').toUpperCase() === String(expected.status || '').toUpperCase() &&
    ['foreman', 'spvHse', 'ktt'].every(function(stage) {
      return (currentStages[stage] === true) === (expectedStages[stage] === true);
    });
}

function isExpectedRecordVersionCurrent_(current, expectedUpdatedAt) {
  if (expectedUpdatedAt === null || expectedUpdatedAt === undefined || expectedUpdatedAt === '') return true;
  return String(current && current.updatedAt || '') === String(expectedUpdatedAt);
}

function areUpdateValuesEqual_(left, right) {
  if (left === right) return true;
  if (left === null || right === null || left === undefined || right === undefined) return left === right;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) {
      if (!areUpdateValuesEqual_(left[index], right[index])) return false;
    }
    return true;
  }
  if (typeof left === 'object' || typeof right === 'object') {
    if (typeof left !== 'object' || typeof right !== 'object') return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index++) {
      if (leftKeys[index] !== rightKeys[index] ||
          !areUpdateValuesEqual_(left[leftKeys[index]], right[rightKeys[index]])) return false;
    }
    return true;
  }
  return false;
}

function isUpdatePayloadAlreadyApplied_(current, payload) {
  if (!current || !isObject_(payload)) return false;
  const keys = Object.keys(payload).filter(function(key) {
    // updatedAt is deliberately changed by the server after each successful write.
    return key !== 'updatedAt';
  });
  if (keys.length === 0) return false;
  return keys.every(function(key) {
    return areUpdateValuesEqual_(current[key], payload[key]);
  });
}

function updateRecord_(
  entity,
  id,
  payload,
  user,
  auditDetails,
  expectedPicaState,
  expectedRecordUpdatedAt
) {
  const sheet = getSheet_(entity);
  const headers = ENTITY_SCHEMAS[entity];
  if (!headers) throw new Error('Schema entity tidak ditemukan: ' + entity);
  const safePayload = isObject_(payload) ? payload : {};
  const lock = LockService.getScriptLock();
  let item;
  let replayedUpdate = false;

  lock.waitLock(10000);
  try {
    const rowNumber = findRecordRow_(sheet, id);
    if (!rowNumber) throw httpError_(404, 'Record not found');
    const old = parseRow_(sheet, rowNumber);

    const recordVersionCurrent = isExpectedRecordVersionCurrent_(old, expectedRecordUpdatedAt);
    replayedUpdate = !recordVersionCurrent && isUpdatePayloadAlreadyApplied_(old, safePayload);

    // A successful update may reach the Spreadsheet while its response is lost.
    // When the same queued payload is replayed against the newer version, accept
    // it as already applied instead of converting a successful write into 409.
    if (replayedUpdate) {
      item = old;
    } else {
      // Reject PICA writes validated against a stale approval state.
      if (entity === 'picas' && !isExpectedPicaStateCurrent_(old, expectedPicaState)) {
        throw httpError_(409, 'PICA telah diperbarui oleh pengguna lain. Muat ulang data sebelum melanjutkan persetujuan.');
      }

      // Reject stale edits for every operational entity, not only PICA approvals.
      if (!recordVersionCurrent) {
        throw httpError_(409, 'Data telah diperbarui oleh pengguna lain. Muat ulang data sebelum menyimpan perubahan.');
      }

      item = Object.assign({}, old, safePayload, {
        id: String(id),
        code: old.code,
        createdAt: old.createdAt,
        updatedAt: new Date().toISOString()
      });

      if (entity === 'hazards' && safePayload.riskMatrix && isObject_(safePayload.riskMatrix)) {
        item.riskMatrix = Object.assign({}, old.riskMatrix || {}, safePayload.riskMatrix);
      }

      if (entity === 'picas' && safePayload.approvalStages && isObject_(safePayload.approvalStages)) {
        item.approvalStages = Object.assign({}, old.approvalStages || {}, safePayload.approvalStages);
      }

      sheet.getRange(rowNumber, 1, 1, headers.length).setValues([
        buildEntityRow_(entity, item, headers)
      ]);
      SpreadsheetApp.flush();
    }
  } finally {
    lock.releaseLock();
  }

  // A replay that already matches the current record must not create a second audit event.
  if (!replayedUpdate) {
    // Audit is written after releasing the record lock; logAudit_ obtains its own lock.
    logAudit_(user, 'UPDATE', entity, id, auditDetails);
  }
  return item;
}

// ============================================================
// PARSE SHEET ROW
// ============================================================

function parseRow_(
  sheet,
  rowNumber
) {
  const columnCount =
    sheet.getLastColumn();

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        columnCount
      )
      .getValues()[0]
      .map(
        function(value) {
          return String(
            value || ''
          ).trim();
        }
      );

  const row =
    sheet
      .getRange(
        rowNumber,
        1,
        1,
        columnCount
      )
      .getValues()[0];

  const normalized = {};

  headers.forEach(
    function(
      header,
      index
    ) {
      if (
        header ===
          'payload'
      ) {
        return;
      }

      normalized[
        header
      ] =
        row[index];
    }
  );


  let payload = {};

  const payloadIndex =
    headers.indexOf(
      'payload'
    );

  if (
    payloadIndex >= 0
  ) {
    try {
      payload =
        JSON.parse(
          String(
            row[
              payloadIndex
            ] ||
              '{}'
          )
        );
    } catch (error) {
      payload = {};
    }
  }


  const result =
    Object.assign(
      {},
      payload,
      normalized
    );


  // ----------------------------------------------------------
  // REBUILD HAZARD NESTED RISK MATRIX
  // ----------------------------------------------------------

  if (
    sheet.getName() ===
      'hazards'
  ) {
    result.riskMatrix = {
      severity:
        Number(
          normalized.severity ||
            (
              payload.riskMatrix &&
              payload.riskMatrix.severity
            ) ||
            0
        ),

      likelihood:
        Number(
          normalized.likelihood ||
            (
              payload.riskMatrix &&
              payload.riskMatrix.likelihood
            ) ||
            0
        ),

      score:
        Number(
          normalized.riskScore ||
            (
              payload.riskMatrix &&
              payload.riskMatrix.score
            ) ||
            0
        ),

      level:
        String(
          normalized.riskLevel ||
            (
              payload.riskMatrix &&
              payload.riskMatrix.level
            ) ||
            ''
        )
    };
  }


  // ----------------------------------------------------------
  // REBUILD PICA NESTED APPROVAL STAGES
  // ----------------------------------------------------------

  if (
    sheet.getName() ===
      'picas'
  ) {
    result.approvalStages = {
      foreman:
        Boolean(
          normalized.foremanApproval ||
            (
              payload.approvalStages &&
              payload.approvalStages.foreman
            )
        ),

      spvHse:
        Boolean(
          normalized.spvHseApproval ||
            (
              payload.approvalStages &&
              payload.approvalStages.spvHse
            )
        ),

      ktt:
        Boolean(
          normalized.kttApproval ||
            (
              payload.approvalStages &&
              payload.approvalStages.ktt
            )
        )
    };
  }

  return result;
}


// ============================================================
// BUILD NORMALIZED SHEET ROW
// ============================================================

function buildEntityRow_(
  entity,
  item,
  headers
) {
  return headers.map(
    function(header) {

      // ------------------------------------------------------
      // CANONICAL JSON
      // ------------------------------------------------------

      if (
        header ===
          'payload'
      ) {
        return JSON.stringify(
          item
        );
      }


      // ------------------------------------------------------
      // HAZARD NESTED RISK MATRIX
      // ------------------------------------------------------

      if (
        entity ===
          'hazards' &&
        header ===
          'severity'
      ) {
        return getNestedValue_(
          item,
          [
            'riskMatrix',
            'severity'
          ],
          ''
        );
      }

      if (
        entity ===
          'hazards' &&
        header ===
          'likelihood'
      ) {
        return getNestedValue_(
          item,
          [
            'riskMatrix',
            'likelihood'
          ],
          ''
        );
      }

      if (
        entity ===
          'hazards' &&
        header ===
          'riskScore'
      ) {
        return getNestedValue_(
          item,
          [
            'riskMatrix',
            'score'
          ],
          ''
        );
      }

      if (
        entity ===
          'hazards' &&
        header ===
          'riskLevel'
      ) {
        return getNestedValue_(
          item,
          [
            'riskMatrix',
            'level'
          ],
          ''
        );
      }


      // ------------------------------------------------------
      // HAZARD AI SUGGESTIONS
      // ------------------------------------------------------

      if (
        header ===
          'aiSuggestions'
      ) {
        const value =
          item.aiSuggestions;

        return Array.isArray(
          value
        )
          ? value.join(
              ' | '
            )
          : String(
              value || ''
            );
      }


      // ------------------------------------------------------
      // PICA NESTED APPROVAL
      // ------------------------------------------------------

      if (
        entity ===
          'picas' &&
        header ===
          'foremanApproval'
      ) {
        return Boolean(
          getNestedValue_(
            item,
            [
              'approvalStages',
              'foreman'
            ],
            false
          )
        );
      }

      if (
        entity ===
          'picas' &&
        header ===
          'spvHseApproval'
      ) {
        return Boolean(
          getNestedValue_(
            item,
            [
              'approvalStages',
              'spvHse'
            ],
            false
          )
        );
      }

      if (
        entity ===
          'picas' &&
        header ===
          'kttApproval'
      ) {
        return Boolean(
          getNestedValue_(
            item,
            [
              'approvalStages',
              'ktt'
            ],
            false
          )
        );
      }


      // ------------------------------------------------------
      // NULL / UNDEFINED
      // ------------------------------------------------------

      const value =
        item[header];

      if (
        value ===
          undefined ||
        value ===
          null
      ) {
        return '';
      }


      // ------------------------------------------------------
      // ARRAY
      // ------------------------------------------------------

      if (
        Array.isArray(
          value
        )
      ) {
        return value.join(
          ' | '
        );
      }


      // ------------------------------------------------------
      // OBJECT
      // ------------------------------------------------------

      if (
        typeof value ===
          'object'
      ) {
        return JSON.stringify(
          value
        );
      }


      return value;
    }
  );
}


// ============================================================
// FIND RECORD BY ID
// ============================================================

function findRecordRow_(
  sheet,
  id
) {
  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < 2
  ) {
    return null;
  }

  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getValues();

  for (
    let i = 0;
    i < ids.length;
    i++
  ) {
    if (
      String(
        ids[i][0]
      ) ===
      String(id)
    ) {
      return i + 2;
    }
  }

  return null;
}


// ============================================================
// ENTITY CODE
// ============================================================

function buildEntityCode_(
  entity,
  rowNum
) {
  const prefixMap = {
    inspections:
      'INS',

    hazards:
      'HAZ',

    picas:
      'PICA',

    incidents:
      'INC'
  };

  const prefix =
    prefixMap[entity] ||
    entity
      .slice(
        0,
        3
      )
      .toUpperCase();

  return (
    prefix +
    '-' +
    new Date()
      .getFullYear() +
    '-' +
    String(
      rowNum
    ).padStart(
      3,
      '0'
    )
  );
}


// ============================================================
// AUDIT TRAIL
// ============================================================

function logAudit_(
  user,
  action,
  entity,
  recordId,
  details
) {
  const sheet = getSheet_('audit_logs');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = new Date().toISOString();
    const id = Utilities.getUuid();
    const rowNum = sheet.getLastRow();
    const code = 'AUD-' + new Date().getFullYear() + '-' + String(rowNum).padStart(3, '0');
    const auditPayload = {
      action: action,
      entity: entity,
      recordId: recordId,
      userId: user.id,
      email: user.email,
      roles: user.roles || [],
      timestamp: now,
      details: details || {}
    };
    sheet.appendRow([
      id,
      code,
      JSON.stringify(auditPayload),
      'RECORDED',
      now,
      now
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// UTILITIES
// ============================================================

function getNestedValue_(
  object,
  path,
  fallback
) {
  let current =
    object;

  for (
    let i = 0;
    i < path.length;
    i++
  ) {
    if (
      current ===
        null ||
      current ===
        undefined
    ) {
      return fallback;
    }

    current =
      current[
        path[i]
      ];
  }

  return (
    current ===
        undefined ||
      current ===
        null
  )
    ? fallback
    : current;
}


function parseJSON_(
  text
) {
  try {
    return typeof text ===
      'string'
      ? JSON.parse(
          text
        )
      : (
          text || {}
        );
  } catch (err) {
    return {};
  }
}


function isObject_(
  value
) {
  return (
    value !==
      null &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value
    )
  );
}


function httpError_(
  status,
  message
) {
  const err =
    new Error(
      message
    );

  err.status =
    Number(
      status
    );

  return err;
}


function getErrorStatus_(
  err
) {
  return (
    err &&
    Number(
      err.status
    )
  ) || 500;
}
/**
 * Run manually ONLY after making a Spreadsheet backup.
 * Clears operational/demo rows while preserving headers, users, and audit history.
 * This helper is intentionally not called by setup() or by web requests.
 */
function clearOperationalDataForCleanStart() {
  const confirmation = PropertiesService.getScriptProperties().getProperty('CONFIRM_CLEAN_START');
  if (confirmation !== 'DELETE_HDOS_OPERATIONAL_DATA') {
    throw new Error('Untuk mengonfirmasi penghapusan, set Script Property CONFIRM_CLEAN_START=DELETE_HDOS_OPERATIONAL_DATA setelah membuat backup.');
  }
  const ss = getSpreadsheet_();
  const sheetNames = ['inspections', 'hazards', 'picas', 'incidents', 'repository', 'form-definition', 'contractor', 'maps', 'photos', 'inspection-draft'];
  const result = [];
  sheetNames.forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow > 1 && lastColumn > 0) {
      sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
      result.push(name + ': ' + (lastRow - 1) + ' baris dihapus');
    } else {
      result.push(name + ': kosong');
    }
  });
  PropertiesService.getScriptProperties().deleteProperty('CONFIRM_CLEAN_START');
  Logger.log('Pembersihan data operasional selesai. Akun users dan audit_logs dipertahankan. ' + result.join(' | '));
  return result;
}


/**
 * Jalankan fungsi ini secara manual dari editor Apps Script satu kali
 * untuk memunculkan dialog otorisasi Google Drive bagi pemilik/deployer script.
 */
function authorizeRepositoryDriveAccess() {
  var folderName = 'CGG HDOS Repository';
  var folders = DriveApp.getFoldersByName(folderName);
  var props = PropertiesService.getScriptProperties();
  var configuredId = props.getProperty('HDOS_REPOSITORY_FOLDER_ID');
  if (configuredId) {
    var configuredFolder = DriveApp.getFolderById(configuredId);
    Logger.log('Otorisasi Drive berhasil. Folder Repository: ' + configuredFolder.getId());
    return configuredFolder.getId();
  }
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  props.setProperty('HDOS_REPOSITORY_FOLDER_ID', folder.getId());
  Logger.log('Otorisasi Drive berhasil. Folder Repository: ' + folder.getId());
  return folder.getId();
}