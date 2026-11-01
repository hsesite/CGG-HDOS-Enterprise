const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}
function loadScope() {
  const context = {
    isAdminCGG_: u => (u.roles || []).includes('Admin CGG'),
    isReadOnlyController_: u => (u.roles || []).some(r => ['KTT','SPT','SPV','PJO','SPV HSE','Foreman Safety'].includes(r)),
    requiresRoleVerification_: u => (u.roles || []).some(r => ['KTT','Project Manager','Superintendent','Supervisor','Foreman','SPV HSE','Foreman Safety','PJO'].includes(r)),
    isRecordVisibleToUser_: () => true,
    findCompanyRegistry_: code => (code === 'SLS' || code === 'VIP') ? {status:'ACTIVE',role:'Contractor',parentCompanyCode:''} : null,
    httpError_: (status, message) => Object.assign(new Error(message), {status})
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('applyRecordScope_', 'findCompanyUser_'), context);
  return context.applyRecordScope_;
}
const applyRecordScope = loadScope();
test('GAS source parses as valid JavaScript', () => assert.doesNotThrow(() => new vm.Script(source)));
test('PJO, SPV HSE, Foreman Safety cannot create operational records', () => {
  for (const role of ['PJO','SPV HSE','Foreman Safety']) assert.throws(
    () => applyRecordScope('hazards', {}, {roles:[role],roleVerified:true,companyCode:'SLS'}, true),
    e => e.status === 403
  );
});
test('unverified elevated roles can submit only inspections and hazards', () => {
  const user={roles:['Foreman'],roleVerified:false,companyCode:'SLS',parentCompanyCode:''};
  assert.equal(applyRecordScope('hazards',{},user,true).companyCode,'SLS');
  assert.equal(applyRecordScope('inspections',{},user,true).companyCode,'SLS');
  assert.throws(()=>applyRecordScope('incidents',{},user,true),e=>e.status===403);
});
test('Employee can submit only inspections and hazards', () => {
  const user={roles:['Employee'],companyCode:'VIP',parentCompanyCode:''};
  assert.equal(applyRecordScope('hazards',{},user,true).companyCode,'VIP');
  assert.equal(applyRecordScope('inspections',{},user,true).companyCode,'VIP');
  assert.throws(()=>applyRecordScope('picas',{},user,true),e=>e.status===403);
});
test('Admin CGG retains administrative bypass', () => {
  const record={id:'admin-created'};
  assert.equal(applyRecordScope('incidents',record,{roles:['Admin CGG']},true),record);
});
test('all supervisory roles are accepted and new elevated accounts start unverified', () => {
  assert.ok(source.includes("const companyAdminRoles = ['PJO', 'SPV HSE', 'Foreman Safety', 'Superintendent', 'Supervisor', 'Foreman'"));
  assert.ok(source.includes("const cggRoles = ['Company Admin', 'KTT', 'SPT', 'SPV', 'Project Manager'"));
  assert.ok(source.includes("const allowedRoles = ['Company Admin', 'Contractor', 'Subkon', 'KTT', 'SPT', 'SPV', 'Project Manager'"));
  assert.ok(source.includes('const roleVerified = false;'));
});
test('CGG self-registration requires an approved corporate domain or exact email allowlist', () => {
  assert.ok(source.includes('isCggEmailAllowed_(email, companyCode)'));
  let properties = { CGG_EMAIL_DOMAINS: '', CGG_ALLOWED_EMAILS: '' };
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] || '' }) }
  };
  vm.createContext(context);
  const helperStart = source.indexOf('function isCggEmailAllowed_(');
  const helperEnd = source.indexOf('function googleOnboard_(', helperStart + 1);
  vm.runInContext(source.slice(helperStart, helperEnd), context);

  assert.equal(context.isCggEmailAllowed_('worker@ptcgg.com', 'CGG'), false);
  assert.equal(context.isCggEmailAllowed_('staff@gmail.com', 'CGG'), false);
  assert.equal(context.isCggEmailAllowed_('person@yahoo.com', 'CGG'), false);
  assert.equal(context.isCggEmailAllowed_('worker@sls.co.id', 'SLS'), true);
  assert.equal(context.isCggEmailAllowed_('not-an-email', 'SLS'), false);

  properties = { CGG_EMAIL_DOMAINS: 'ptcgg.com;cgg.co.id', CGG_ALLOWED_EMAILS: 'admin@gmail.com;supervisor@yahoo.com' };
  assert.equal(context.isCggEmailAllowed_('worker@cgg.co.id', 'CGG'), true);
  assert.equal(context.isCggEmailAllowed_('admin@gmail.com', 'CGG'), true);
  assert.equal(context.isCggEmailAllowed_('other@gmail.com', 'CGG'), false);
  assert.equal(context.isCggEmailAllowed_('worker@other.co.id', 'CGG'), false);
});
test('Company Admin can assign an operational role in its own company but cannot verify it', () => {
  const rows = [
    ['id','email','password','displayName','role','status','passwordHash','passwordSalt','googleSub','companyCode','parentCompanyCode','position','department','section','roleVerified'],
    ['user-1','worker@sls.co.id','', 'Worker','Employee','ACTIVE','hash','salt','',
    'SLS','','Crew','','',false]
  ];
  const writes = [];
  const sheet = {
    getDataRange: () => ({ getValues: () => rows }),
    getRange: (...args) => ({
      setValue: value => writes.push({args,value}),
      setValues: value => writes.push({args,value})
    })
  };
  const context = {
    isObject_: value => value && typeof value === 'object' && !Array.isArray(value),
    isAdminCGG_: actor => (actor.roles || []).includes('Admin CGG'),
    isCompanyAdmin_: actor => (actor.roles || []).includes('Company Admin'),
    canManageCompany_: () => true,
    findCompanyRegistry_: () => ({status:'ACTIVE',role:'Contractor',parentCompanyCode:''}),
    getSheet_: () => sheet,
    error_: (status,message) => ({success:false,status,message}),
    success_: data => ({success:true,data}),
    logAudit_: () => {}
  };
  vm.createContext(context);
  const start=source.indexOf('function updateUserAccess_(');
  const end=source.indexOf('function isRecordVisibleToUser_(',start+1);
  assert.notEqual(start,-1); assert.notEqual(end,-1);
  vm.runInContext(source.slice(start,end),context);
  const actor={id:'admin-sls',roles:['Company Admin'],companyCode:'SLS'};
  const result=context.updateUserAccess_('user-1',{role:'Foreman Safety',position:'Foreman',status:'ACTIVE'},actor);
  assert.equal(result.success,true);
  assert.equal(result.data.roleVerified,false);
  assert.ok(writes.some(write=>write.args[0]===2 && write.args[1]===5 && write.value==='Foreman Safety'));
  const cannotVerify=context.updateUserAccess_('user-1',{roleVerified:true},actor);
  assert.equal(cannotVerify.status,403);
  const cannotMoveCompany=context.updateUserAccess_('user-1',{companyCode:'VIP'},actor);
  assert.equal(cannotMoveCompany.status,403);
});
test('only Admin CGG and Company Admin can publish shared forms', () => {
  const context = {
    isAdminCGG_: user => (user.roles || []).includes('Admin CGG'),
    isCompanyAdmin_: user => (user.roles || []).includes('Company Admin')
  };
  vm.createContext(context);
  const start=source.indexOf('function canPublishForms_(');
  const end=source.indexOf('function isReadOnlyController_(',start+1);
  assert.notEqual(start,-1); assert.notEqual(end,-1);
  vm.runInContext(source.slice(start,end),context);
  assert.equal(context.canPublishForms_({roles:['Admin CGG']}),true);
  assert.equal(context.canPublishForms_({roles:['Company Admin']}),true);
  for (const role of ['PJO','SPV HSE','Foreman Safety','Foreman','Supervisor','Employee']) {
    assert.equal(context.canPublishForms_({roles:[role],roleVerified:true}),false);
  }
});
test('Spreadsheet ID is configured via Script Properties, not hardcoded', () => {
  assert.ok(source.includes("getProperty('HDOS_SPREADSHEET_ID')"));
  assert.doesNotMatch(source,/14DIOz1lMeck-pYAJxAq3TQvlrKbWS9esP7W06xri1PI/);
});


test('KTT, SPT, and SPV share read-only oversight of SLS, VIP, and active subcontracts', () => {
  const context = {
    isAdminCGG_: () => false,
    isCompanyScopedRole_: () => true,
    isOversightRole_: user => (user.roles || []).some(role => ['KTT','SPT','SPV'].includes(role)),
    getSheet_: () => ({ getDataRange: () => ({ getValues: () => [
      ['companyCode','companyName','role','parentCompanyCode','emailDomains','autoProvision','status'],
      ['SLS','PT SLS','Contractor','','','FALSE','ACTIVE'],
      ['VIP','PT VIP','Contractor','','','FALSE','ACTIVE'],
      ['BCJ','PT BCJ','Subkon','SLS','','FALSE','ACTIVE'],
      ['CHN','PT CHN','Subkon','VIP','','FALSE','ACTIVE'],
      ['OTHER','Other Subkon','Subkon','OTHERCO','','FALSE','ACTIVE']
    ]}) })
  };
  vm.createContext(context);
  const start=source.indexOf('function getOversightCompanyCodes_(');
  const end=source.indexOf('function requiresRoleVerification_(',start+1);
  assert.notEqual(start,-1); assert.notEqual(end,-1);
  vm.runInContext(source.slice(start,end),context);
  for (const role of ['KTT','SPT','SPV']) {
    const user={roles:[role],companyCode:'CGG',roleVerified:true};
    assert.equal(context.isRecordVisibleToUser_({companyCode:'SLS'},user),true);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'VIP'},user),true);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'BCJ',parentCompanyCode:'SLS'},user),true);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'CHN',parentCompanyCode:'VIP'},user),true);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'OTHER'},user),false);
  }
});
test('unverified KTT, SPT, and SPV cannot view cross-company records', () => {
  const context = {
    isAdminCGG_: () => false,
    isCompanyScopedRole_: () => true,
    isOversightRole_: user => (user.roles || []).some(role => ['KTT','SPT','SPV'].includes(role)),
    getSheet_: () => ({ getDataRange: () => ({ getValues: () => [
      ['companyCode','companyName','role','parentCompanyCode','emailDomains','autoProvision','status'],
      ['SLS','PT SLS','Contractor','','','FALSE','ACTIVE'],
      ['VIP','PT VIP','Contractor','','','FALSE','ACTIVE']
    ]}) })
  };
  vm.createContext(context);
  const start=source.indexOf('function getOversightCompanyCodes_(');
  const end=source.indexOf('function requiresRoleVerification_(',start+1);
  vm.runInContext(source.slice(start,end),context);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'SLS'},{roles:['KTT'],companyCode:'CGG',roleVerified:false}),false);
});
test('all verified oversight roles are read-only for operational record writes', () => {
  assert.ok(source.includes("['KTT', 'SPT', 'SPV', 'PJO', 'SPV HSE', 'Foreman Safety']"));
  for (const role of ['KTT','SPT','SPV']) {
    assert.ok(source.includes("['KTT', 'SPT', 'SPV', 'Project Manager'"));
  }
});


test('Company Admin cannot overwrite a published form outside its tenant or change form ownership', () => {
  assert.ok(source.includes("if (!isAdminCGG_(user) && !isRecordVisibleToUser_(existing, user)) return error_(403, 'Anda tidak memiliki akses untuk memperbarui formulir perusahaan lain.')"));
  assert.ok(source.includes("safeForm.companyCode = String(existing.companyCode || user.companyCode || '').trim().toUpperCase();"));
  assert.ok(source.includes("safeForm.parentCompanyCode = String(existing.parentCompanyCode || user.parentCompanyCode || '').trim().toUpperCase();"));
});

test('Repository upload derives parent company from master registry and is idempotent before Drive upload', () => {
  assert.ok(source.includes("const registeredCompany = companyCode === 'CGG' ? null : findCompanyRegistry_(companyCode);"));
  assert.ok(source.includes("const parentCompanyCode = registeredCompany && registeredCompany.role === 'Subkon' ? String(registeredCompany.parentCompanyCode || '').trim().toUpperCase() : '';"));
  assert.ok(source.includes("const existingDocument = findRecordRow_(getSheet_('repository'), id);"));
  assert.ok(source.includes("parentCompanyCode: parentCompanyCode"));
});


test('New published forms derive tenant parent from active company registry, not request payload', () => {
  assert.ok(source.includes("const registeredCompany = companyCode === 'CGG' ? null : findCompanyRegistry_(companyCode);"));
  assert.ok(source.includes("const parentCompanyCode = registeredCompany && registeredCompany.role === 'Subkon' ? String(registeredCompany.parentCompanyCode || '').trim().toUpperCase() : '';"));
  assert.ok(source.includes("parentCompanyCode: parentCompanyCode,"));
  assert.ok(!source.includes("parentCompanyCode: String(input.parentCompanyCode || user.parentCompanyCode || '')"));
});


test('Company Admin cannot bypass PICA approval stages or close an unapproved PICA', () => {
  assert.ok(source.includes("if (entity === 'picas' && isCompanyAdmin_(user) && !isAdminCGG_(user))"));
  assert.ok(source.includes("return error_(403, 'Admin Perusahaan tidak dapat mengubah tahapan persetujuan PICA.')"));
  assert.ok(source.includes("if (requestedStatusForCompanyAdmin === 'CLOSED' &&"));
  assert.ok(source.includes("oldStagesForCompanyAdmin.foreman === true && oldStagesForCompanyAdmin.spvHse === true && oldStagesForCompanyAdmin.ktt === true"));
});
test('Operational tenant ownership remains immutable during PATCH for non-CGG admins', () => {
  assert.ok(source.includes("['companyCode', 'contractorCode', 'parentCompanyCode', 'subcontractorCode', 'subkonCode'].forEach(function(key)"));
});


test('Oversight scope excludes inactive SLS/VIP roots and their subcontracts', () => {
  const context = {
    getSheet_: () => ({ getDataRange: () => ({ getValues: () => [
      ['companyCode','companyName','role','parentCompanyCode','emailDomains','autoProvision','status'],
      ['SLS','PT SLS','Contractor','','','FALSE','INACTIVE'],
      ['VIP','PT VIP','Contractor','','','FALSE','ACTIVE'],
      ['BCJ','PT BCJ','Subkon','SLS','','FALSE','ACTIVE'],
      ['CHN','PT CHN','Subkon','VIP','','FALSE','ACTIVE']
    ]}) })
  };
  vm.createContext(context);
  const start=source.indexOf('function getOversightCompanyCodes_(');
  const end=source.indexOf('function isRecordVisibleToUser_(',start+1);
  vm.runInContext(source.slice(start,end),context);
  const allowed=context.getOversightCompanyCodes_();
  assert.equal(Boolean(allowed.SLS),false);
  assert.equal(Boolean(allowed.BCJ),false);
  assert.equal(Boolean(allowed.VIP),true);
  assert.equal(Boolean(allowed.CHN),true);
});

test('Inactive company accounts cannot read or create operational records', () => {
  const context = {
    isAdminCGG_: () => false,
    isReadOnlyController_: () => false,
    requiresRoleVerification_: () => false,
    isCompanyScopedRole_: () => true,
    isOversightRole_: () => false,
    findCompanyRegistry_: () => ({status:'INACTIVE',role:'Contractor',parentCompanyCode:''}),
    httpError_: (status,message) => Object.assign(new Error(message),{status}),
    getSheet_: () => ({getDataRange:()=>({getValues:()=>[['companyCode','companyName','role','parentCompanyCode','emailDomains','autoProvision','status'],['SLS','PT SLS','Contractor','','','FALSE','INACTIVE']]})})
  };
  vm.createContext(context);
  const start=source.indexOf('function applyRecordScope_(');
  const end=source.indexOf('function findCompanyUser_(',start+1);
  vm.runInContext(source.slice(start,end),context);
  assert.throws(()=>context.applyRecordScope_('hazards',{}, {roles:['Employee'],companyCode:'SLS'}, true),e=>e.status===403);
});


test('CGG tenant code is reserved and cannot be registered as a contractor or subcontractor', () => {
  const start=source.indexOf('function upsertCompanyRegistry_(');
  const end=source.indexOf('function findCompanyRegistry_(',start+1);
  const fn=source.slice(start,end);
  assert.ok(fn.includes("if (code === 'CGG') return error_(400,"));
});

test('Company Admin management scope requires active company registrations', () => {
  const context = {
    isAdminCGG_: () => false,
    isCompanyAdmin_: () => true,
    findCompanyRegistry_: code => code === 'SLS'
      ? {status:'INACTIVE',role:'Contractor',parentCompanyCode:''}
      : {status:'ACTIVE',role:'Subkon',parentCompanyCode:'SLS'}
  };
  vm.createContext(context);
  const start=source.indexOf('function canManageCompany_(');
  const end=source.indexOf('function listPublicUsers_(',start+1);
  vm.runInContext(source.slice(start,end),context);
  const actor={roles:['Company Admin'],companyCode:'SLS'};
  assert.equal(context.canManageCompany_(actor,'SLS'),false);
  assert.equal(context.canManageCompany_(actor,'BCJ'),false);
});

test('tenant activation is enforced for login sessions, including subcontractor parent status', () => {
  const context = {
    isAdminCGG_: user => (user.roles || []).includes('Admin CGG'),
    findCompanyRegistry_: code => ({
      SLS: {status:'ACTIVE',role:'Contractor',parentCompanyCode:''},
      VIP: {status:'INACTIVE',role:'Contractor',parentCompanyCode:''},
      BCJ: {status:'ACTIVE',role:'Subkon',parentCompanyCode:'SLS'},
      CHN: {status:'ACTIVE',role:'Subkon',parentCompanyCode:'VIP'}
    })[code] || null
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('isUserCompanyActive_', 'createSessionResponse_'), context);
  assert.equal(context.isUserCompanyActive_({roles:['Employee'],companyCode:'CGG'}), true);
  assert.equal(context.isUserCompanyActive_({roles:['Employee'],companyCode:'SLS'}), true);
  assert.equal(context.isUserCompanyActive_({roles:['Employee'],companyCode:'VIP'}), false);
  assert.equal(context.isUserCompanyActive_({roles:['Employee'],companyCode:'BCJ',parentCompanyCode:'SLS'}), true);
  assert.equal(context.isUserCompanyActive_({roles:['Employee'],companyCode:'CHN',parentCompanyCode:'VIP'}), false);
  assert.equal(context.isUserCompanyActive_({roles:['Employee'],companyCode:'BCJ',parentCompanyCode:'OTHER'}), false);
  assert.equal(context.isUserCompanyActive_({roles:['Admin CGG'],companyCode:''}), true);
});

test('an inactive tenant invalidates an otherwise active user session', () => {
  let deleted = false;
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => key === 'session:token-1' ? JSON.stringify({email:'worker@sls.co.id'}) : null,
      deleteProperty: key => { if (key === 'session:token-1') deleted = true; }
    }) },
    CacheService: { getScriptCache: () => ({ get: () => null, remove: () => {} }) },
    findUserByEmail_: () => ({id:'u1',email:'worker@sls.co.id',displayName:'Worker',roles:['Employee'],status:'ACTIVE',companyCode:'SLS'}),
    isUserCompanyActive_: () => false,
    httpError_: (status,message) => Object.assign(new Error(message),{status})
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('requireAuth_', 'publicUser_'), context);
  assert.throws(() => context.requireAuth_('token-1'), error => error.status === 401);
  assert.equal(deleted, true);
});

test('PICA closure is terminal for non-CGG admins and completion date is server-owned', () => {
  const context = {
    isAdminCGG_: user => (user.roles || []).includes('Admin CGG'),
    error_: (status, message) => ({status, message})
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('enforcePicaClosureRules_', 'createSessionResponse_'), context);

  const closed = {status:'CLOSED', completionDate:'2026-10-30', approvalStages:{foreman:true,spvHse:true,ktt:true}};
  assert.equal(context.enforcePicaClosureRules_(closed,{status:'OPEN'},{roles:['Foreman Safety']}).status,403);
  assert.equal(context.enforcePicaClosureRules_(closed,{status:'CLOSED',completionDate:'2026-10-31'},{roles:['Company Admin']}).status,403);
  assert.equal(context.enforcePicaClosureRules_(closed,{status:'CLOSED'},{roles:['Company Admin']}),null);

  const pending = {status:'PROGRESS',completionDate:'',approvalStages:{foreman:true,spvHse:true,ktt:false}};
  assert.equal(context.enforcePicaClosureRules_(pending,{status:'CLOSED'},{roles:['KTT']}).status,403);
  const allApproved = {status:'PROGRESS',completionDate:'',approvalStages:{foreman:true,spvHse:true,ktt:true}};
  const payload = {status:'CLOSED'};
  assert.equal(context.enforcePicaClosureRules_(allApproved,payload,{roles:['KTT']}),null);
  assert.match(payload.completionDate,/^\d{4}-\d{2}-\d{2}$/);

  const adminPayload = {status:'OPEN'};
  assert.equal(context.enforcePicaClosureRules_(closed,adminPayload,{roles:['Admin CGG']}),null);
});

test('PICA approval changes are included in the existing audit record', () => {
  assert.ok(source.includes('approvalStageChanges: stageChanges'));
  assert.ok(source.includes('statusFrom: oldStatus'));
  assert.ok(source.includes('details:\n      details || {}'));
  assert.ok(source.includes('updateRecord_(entity, id, scopedPayload, user, auditDetails)'));
});

test('Repository API strips internal Drive identifiers and file bytes from metadata', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractFunction('publicRepositoryDocument_', 'canPreviewRepositoryDocument_'), context);
  const safe = context.publicRepositoryDocument_({id:'doc-1',title:'SOP',driveFileId:'drive-secret',fileBase64:'private-bytes',companyCode:'SLS'});
  assert.equal(safe.id,'doc-1');
  assert.equal(safe.title,'SOP');
  assert.equal(Object.prototype.hasOwnProperty.call(safe,'driveFileId'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(safe,'fileBase64'),false);
});

test('Repository preview is tenant-scoped while original download is CGG-only', () => {
  const context = {
    isAdminCGG_: user => (user.roles || []).includes('Admin CGG'),
    isRecordVisibleToUser_: (doc,user) => Boolean(doc && doc.companyCode === user.companyCode)
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('canPreviewRepositoryDocument_', 'canDownloadRepositoryDocument_'), context);
  vm.runInContext(extractFunction('canDownloadRepositoryDocument_', 'handleRoute_'), context);
  const slsDoc={id:'sls-doc',companyCode:'SLS'};
  const sls={roles:['Employee'],companyCode:'SLS'};
  const cgg={roles:['Employee'],companyCode:'CGG'};
  const admin={roles:['Admin CGG'],companyCode:'CGG'};
  assert.equal(context.canPreviewRepositoryDocument_(slsDoc,sls),true);
  assert.equal(context.canPreviewRepositoryDocument_(slsDoc,cgg),false);
  assert.equal(context.canDownloadRepositoryDocument_(slsDoc,sls),false);
  assert.equal(context.canDownloadRepositoryDocument_({id:'cgg-doc',companyCode:'CGG'},cgg),true);
  assert.equal(context.canDownloadRepositoryDocument_(slsDoc,admin),true);
});

test('idempotent create returns existing records only within the caller tenant', () => {
  const context = {
    findRecordRow_: () => 2,
    parseRow_: () => ({id:'existing-id',companyCode:'VIP'}),
    isAdminCGG_: user => (user.roles || []).includes('Admin CGG'),
    isRecordVisibleToUser_: (record,user) => record.companyCode === user.companyCode,
    httpError_: (status,message) => Object.assign(new Error(message),{status})
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('getExistingRecordForCreate_', 'createRecord_'), context);
  assert.equal(context.getExistingRecordForCreate_({},'existing-id',{roles:['Employee'],companyCode:'VIP'}).id,'existing-id');
  assert.throws(
    () => context.getExistingRecordForCreate_({},'existing-id',{roles:['Employee'],companyCode:'SLS'}),
    error => error.status === 403
  );
  assert.equal(context.getExistingRecordForCreate_({},'existing-id',{roles:['Admin CGG'],companyCode:'CGG'}).id,'existing-id');
});

test('user creation enforces email uniqueness inside a script lock', () => {
  let locked = false;
  let released = false;
  let existing = null;
  const appended = [];
  const context = {
    LockService: { getScriptLock: () => ({
      waitLock: timeout => { assert.equal(timeout,10000); locked = true; },
      releaseLock: () => { released = true; }
    }) },
    findUserByEmail_: email => existing,
    getSheet_: () => ({ appendRow: row => appended.push(row) })
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('appendUniqueUser_', 'googleOnboard_'), context);
  assert.equal(context.appendUniqueUser_('worker@example.com',['id-1','worker@example.com']),true);
  assert.equal(locked,true);
  assert.equal(released,true);
  assert.equal(appended.length,1);
  existing = {id:'prior-user'};
  assert.equal(context.appendUniqueUser_('worker@example.com',['id-2','worker@example.com']),false);
  assert.equal(appended.length,1);
});

test('PICA approval sequence requires Foreman, then SPV HSE, then KTT', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractFunction('isPicaApprovalSequenceValid_', 'enforcePicaClosureRules_'), context);
  assert.equal(context.isPicaApprovalSequenceValid_({foreman:false,spvHse:false,ktt:false},'foreman'),true);
  assert.equal(context.isPicaApprovalSequenceValid_({foreman:false,spvHse:true,ktt:false},'spvHse'),false);
  assert.equal(context.isPicaApprovalSequenceValid_({foreman:true,spvHse:false,ktt:true},'ktt'),false);
  assert.equal(context.isPicaApprovalSequenceValid_({foreman:true,spvHse:true,ktt:true},'ktt'),true);
});

test('operational PICA status is derived from stage approvals and cannot be changed alone', () => {
  assert.ok(source.includes("const hasStageChange = JSON.stringify(stages) !== JSON.stringify(oldStages)"));
  assert.ok(source.includes("Status PICA ditetapkan otomatis sesuai tahapan persetujuan."));
  assert.ok(source.includes("changedKeys.indexOf('status') >= 0 && changedKeys.indexOf('approvalStages') === -1"));
});

test('missing records fail closed in tenant visibility checks', () => {
  const context = {
    isAdminCGG_: user => (user.roles || []).includes('Admin CGG'),
    isCompanyScopedRole_: () => true
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('isRecordVisibleToUser_', 'requiresRoleVerification_'), context);
  assert.equal(context.isRecordVisibleToUser_(null,{roles:['Admin CGG']}),false);
  assert.equal(context.isRecordVisibleToUser_(undefined,{roles:['Employee'],companyCode:'SLS'}),false);
});

test('unverified oversight roles behave like crew for own-tenant reporting and visibility', () => {
  const user={roles:['KTT'],roleVerified:false,companyCode:'CGG',parentCompanyCode:''};
  assert.equal(applyRecordScope('inspections',{},user,true).companyCode,'CGG');
  assert.equal(applyRecordScope('hazards',{},user,true).companyCode,'CGG');
  assert.throws(()=>applyRecordScope('incidents',{},user,true),error=>error.status===403);

  const context={
    isAdminCGG_:()=>false,
    isCompanyScopedRole_:()=>true,
    isOversightRole_:u=>(u.roles||[]).some(role=>['KTT','SPT','SPV'].includes(role)),
    getOversightCompanyCodes_:()=>({SLS:true,VIP:true}),
    findCompanyRegistry_:()=>null
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('isRecordVisibleToUser_', 'requiresRoleVerification_'),context);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'CGG'},{...user}),true);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'SLS'},{...user}),false);
});

test('Repository preview and download accesses are recorded in the audit log', () => {
  assert.ok(source.includes("logAudit_(user, 'REPOSITORY_DOCUMENT_PREVIEWED', 'repository', doc.id"));
  assert.ok(source.includes("logAudit_(user, 'REPOSITORY_DOCUMENT_DOWNLOADED', 'repository', doc.id"));
});
