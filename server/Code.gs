// ========== HDOS Google Apps Script Backend ==========
// Google Sheets-based REST API untuk HDOS
// Jangan edit bagian ini kecuali Anda tahu apa yang Anda lakukan

const SHEETS = ['users', 'inspections', 'hazards', 'picas', 'incidents', 'audit_logs'];
const SESSION_TTL = 21600; // 6 jam

// ===== SETUP =====
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Buat tabs
  SHEETS.forEach(name => {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
    }
  });
  
  // Setup users tab dengan admin default
  const users = ss.getSheetByName('users');
  if (users.getLastRow() === 0) {
    users.appendRow(['id','email','password','displayName','role','status']);
  }
  if (users.getLastRow() === 1) {
    users.appendRow([
      Utilities.getUuid(),
      'admin@ptcgg.com',
      'GantiDenganPassword123!',
      'HDOS Administrator',
      'KTT',
      'ACTIVE'
    ]);
  }
  
  // Setup data tabs
  ['inspections','hazards','picas','incidents','audit_logs'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['id','code','payload','status','createdAt','updatedAt']);
    }
  });
  
  Logger.log('Setup selesai! Database siap digunakan.');
}

// ===== REQUEST HANDLER =====
function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  return handleRequest_(Object.assign({}, e.parameter || {}, body));
}

function handleRequest_(params) {
  try {
    const result = handleRoute_(
      params.method || 'GET',
      params.path || '/',
      params
    );
    return respondWithCallback_(result, params.callback);
  } catch (err) {
    const error = {
      success: false,
      data: null,
      message: String(err.message || err),
      timestamp: new Date().toISOString()
    };
    return respondWithCallback_(error, params.callback);
  }
}

// ===== ROUTING =====
function handleRoute_(method, path, params) {
  // Health check
  if (path === '/api/health/live') {
    return success_({status: 'live'});
  }
  
  // Login
  if (path === '/api/auth/login' && method === 'POST') {
    const input = parseJSON_(params.payload || params.body || '{}');
    const email = String(input.email || '').toLowerCase();
    const password = String(input.password || '');
    
    if (!email || !password) {
      throw new Error('Email dan password diperlukan');
    }
    
    const user = findUserByEmail_(email);
    if (!user || user.password !== password || user.status !== 'ACTIVE') {
      throw new Error('Email atau password salah');
    }
    
    // Buat token
    const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('session:' + token, JSON.stringify(user), SESSION_TTL);
    
    return success_({
      token: token,
      user: publicUser_(user)
    });
  }
  
  // Validate token untuk semua endpoint lainnya
  const user = requireAuth_(params.token);
  
  // Logout
  if (path === '/api/auth/logout' && method === 'POST') {
    if (params.token) {
      CacheService.getScriptCache().remove('session:' + params.token);
    }
    return success_(null);
  }
  
  // Get current user
  if (path === '/api/me') {
    return success_(publicUser_(user));
  }
  
  // CRUD routes: /api/{entity}/{id?}
  const match = path.match(/^\/api\/(inspections|hazards|picas|incidents)(?:\/([^/]+))?$/);
  if (match) {
    const entity = match[1];
    const id = match[2];
    
    if (method === 'GET') {
      return success_(id ? readOne_(entity, id) : readAll_(entity));
    }
    if (method === 'POST') {
      const payload = parseJSON_(params.payload || '{}');
      const created = createRecord_(entity, payload, user);
      return success_(created);
    }
    if (method === 'PATCH') {
      const payload = parseJSON_(params.payload || '{}');
      const updated = updateRecord_(entity, id, payload, user);
      return success_(updated);
    }
  }
  
  throw new Error('Route not found');
}

// ===== RESPONSE =====
function success_(data) {
  return {
    success: true,
    data: data,
    message: '',
    timestamp: new Date().toISOString()
  };
}

function respondWithCallback_(body, callback) {
  const json = JSON.stringify(body);
  
  // JSONP response: jika ada callback parameter
  if (callback && typeof callback === 'string' && callback.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  // JSON response biasa
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== USER FUNCTIONS =====
function findUserByEmail_(email) {
  const sheet = getSheet_('users');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).toLowerCase() === email.toLowerCase()) {
      return {
        id: String(rows[i][0]),
        email: String(rows[i][1]),
        password: String(rows[i][2]),
        displayName: String(rows[i][3]),
        roles: [String(rows[i][4])],
        status: String(rows[i][5])
      };
    }
  }
  return null;
}

function requireAuth_(token) {
  if (!token) throw new Error('Unauthorized: Token required');
  
  const cached = CacheService.getScriptCache().get('session:' + token);
  if (!cached) throw new Error('Unauthorized: Invalid or expired token');
  
  return JSON.parse(cached);
}

function publicUser_(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles
  };
}

// ===== CRUD FUNCTIONS =====
function getSheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function readAll_(entity) {
  const sheet = getSheet_(entity);
  const rows = sheet.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      results.push(parseRow_(rows[i]));
    }
  }
  return results;
}

function readOne_(entity, id) {
  const items = readAll_(entity);
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) {
      return items[i];
    }
  }
  throw new Error('Record not found');
}

function createRecord_(entity, payload, user) {
  const sheet = getSheet_(entity);
  const now = new Date().toISOString();
  const id = Utilities.getUuid();
  const rowNum = sheet.getLastRow();
  const code = entity.slice(0, 3).toUpperCase() + '-' + new Date().getFullYear() + '-' + String(rowNum).padStart(3, '0');
  
  const item = Object.assign({}, payload, {
    id: id,
    code: code,
    createdAt: now,
    status: payload.status || 'OPEN'
  });
  
  sheet.appendRow([
    id,
    code,
    JSON.stringify(item),
    item.status,
    now,
    now
  ]);
  
  logAudit_(user, 'CREATE', entity, id);
  return item;
}

function updateRecord_(entity, id, payload, user) {
  const sheet = getSheet_(entity);
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      const old = parseRow_(rows[i]);
      const item = Object.assign({}, old, payload, {
        id: id,
        updatedAt: new Date().toISOString()
      });
      
      sheet.getRange(i + 1, 3, 1, 4).setValues([[
        JSON.stringify(item),
        item.status || old.status,
        old.createdAt,
        item.updatedAt
      ]]);
      
      logAudit_(user, 'UPDATE', entity, id);
      return item;
    }
  }
  
  throw new Error('Record not found');
}

function parseRow_(row) {
  let payload = {};
  try {
    payload = JSON.parse(String(row[2] || '{}'));
  } catch (e) {
    // ignore parse error
  }
  
  return Object.assign(payload, {
    id: String(row[0]),
    code: String(row[1]),
    status: String(row[3]),
    createdAt: String(row[4]),
    updatedAt: String(row[5])
  });
}

// ===== AUDIT LOGGING =====
function logAudit_(user, action, entity, recordId) {
  const sheet = getSheet_('audit_logs');
  sheet.appendRow([
    Utilities.getUuid(),
    action,
    entity + ':' + recordId,
    user.email,
    new Date().toISOString()
  ]);
}

// ===== UTILITY =====
function parseJSON_(text) {
  try {
    return typeof text === 'string' ? JSON.parse(text) : (text || {});
  } catch (e) {
    return {};
  }
}
