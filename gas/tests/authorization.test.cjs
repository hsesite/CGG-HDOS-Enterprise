const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const picaUiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'PICAModule.tsx'), 'utf8');
const syncUiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'SyncModule.tsx'), 'utf8');
const picaStoreSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
const p2hUiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'ContractorModule.tsx'), 'utf8');
const syncEngineSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
const syncTypesSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'types.ts'), 'utf8');
const syncDbSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'db.ts'), 'utf8');
const authStateSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'auth-state.ts'), 'utf8');
const apiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'api.ts'), 'utf8');

test('stale login responses cannot replace a newer active session or undo its logout', () => {
  assert.match(apiSource, /let sessionMutationGeneration = 0/);
  assert.match(apiSource, /function beginSessionMutation\(\): number/);
  assert.match(apiSource, /function commitSessionToken\(token: string, generation: number\): void/);
  for (const method of ['async login(', 'async loginWithGoogle(', 'async submitGoogleProfile(']) {
    const start = apiSource.indexOf(method);
    assert.ok(start >= 0, method + ' exists');
    const end = apiSource.indexOf('  },', start);
    const block = apiSource.slice(start, end);
    assert.match(block, /beginSessionMutation\(\)/);
    assert.match(block, /commitSessionToken\(/);
  }
  const logoutStart = apiSource.indexOf('async logout(');
  const logoutEnd = apiSource.indexOf('me(authToken?', logoutStart);
  const logoutBlock = apiSource.slice(logoutStart, logoutEnd);
  assert.match(logoutBlock, /ownsCurrentSession &&/);
  assert.match(logoutBlock, /sessionGeneration === sessionMutationGeneration/);
  assert.match(logoutBlock, /getToken\(\) === tokenToRevoke/);
});

test('IndexedDB getById surfaces transaction setup failures instead of reporting a missing record', () => {
  const start = syncDbSource.indexOf('async getById<');
  assert.ok(start >= 0);
  const getByIdBlock = syncDbSource.slice(start);
  assert.match(getByIdBlock, /getById exception for \$\{storeName\}\/\$\{id\}[\s\S]*?reject\(new Error\(/);
  assert.doesNotMatch(getByIdBlock, /resolve\(null\)/);
});
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
    isReadOnlyController_: u => (u.roles || []).some(r => ['KTT','SPT','SPV','Project Manager','PJO','SPV HSE','Foreman Safety'].includes(r)),
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

test('KTT client permission matrix does not expose PICA create, update, or oversight read access', () => {
  const row = authStateSource.split('\n').find(line => line.trim().startsWith("KTT: ")) || '';
  assert.match(row, /'inspection\.read'/);
  assert.match(row, /'hazard\.read'/);
  assert.doesNotMatch(row, /'pica\.(?:read|create|update)'/);
  assert.match(source, /function canMonitorPicas_\(user\)[\s\S]*\['Foreman Safety', 'SPV HSE'\]/);
});

test('GAS source parses as valid JavaScript', () => assert.doesNotThrow(() => new vm.Script(source)));
test('conflict resolution resumes dependent UPDATE and DELETE operations for the same record', () => {
  const resolutionStart = syncEngineSource.indexOf('async resolveConflict(');
  const resolutionEnd = syncEngineSource.indexOf('async retryFailedItems()', resolutionStart);
  assert.ok(resolutionStart >= 0 && resolutionEnd > resolutionStart);
  const resolutionBlock = syncEngineSource.slice(resolutionStart, resolutionEnd);
  assert.match(resolutionBlock, /\(queued\.action === 'UPDATE' \|\| queued\.action === 'DELETE'\)/);
  assert.match(resolutionBlock, /queued\.status === 'CONFLICT'/);
  assert.match(resolutionBlock, /status: 'PENDING' as const/);
});
test('same-record sync operations use CREATE then UPDATE then DELETE when timestamps tie', () => {
  assert.ok(syncEngineSource.includes("const actionOrder: Record<SyncQueueItem['action'], number> = {"));
  assert.ok(syncEngineSource.includes('CREATE: 0,\n      UPDATE: 1,\n      DELETE: 2,'));
  assert.ok(syncEngineSource.includes('if (timeOrder) return timeOrder;'));
  assert.ok(syncEngineSource.includes('if (actionDifference) return actionDifference;'));
});
test('manual sync conflict resolution preserves every tenant ownership field from server snapshot', () => {
  assert.ok(syncEngineSource.includes("for (const key of ['companyCode', 'contractorCode', 'parentCompanyCode', 'subcontractorCode', 'subkonCode', 'ownerCompanyCode'])"));
  assert.ok(syncEngineSource.includes('protectedPayload[key] = serverRecord[key]'));
});
test('non-Admin CGG cannot change operational record tenant ownership fields', () => {
  const context = {
    isAdminCGG_: user => (user.roles || []).includes('Admin CGG'),
    httpError_: (status, message) => Object.assign(new Error(message), {status})
  };
  vm.createContext(context);
  const start = source.indexOf('function assertTenantOwnershipUnchanged_(');
  const end = source.indexOf('function applyRecordScope_(', start + 1);
  assert.notEqual(start, -1); assert.notEqual(end, -1);
  vm.runInContext(source.slice(start, end), context);
  const old = {companyCode:'SLS',contractorCode:'SLS',parentCompanyCode:'',subcontractorCode:'BCJ'};
  assert.doesNotThrow(() => context.assertTenantOwnershipUnchanged_(old, {companyCode:'sls',subcontractorCode:'BCJ'}, {roles:['Company Admin']}));
  for (const field of ['companyCode','contractorCode','parentCompanyCode','subcontractorCode','subkonCode','ownerCompanyCode']) {
    assert.throws(() => context.assertTenantOwnershipUnchanged_(old, {[field]:'VIP'}, {roles:['Company Admin']}), error => error.status === 403);
  }
  assert.doesNotThrow(() => context.assertTenantOwnershipUnchanged_(old, {companyCode:'VIP'}, {roles:['Admin CGG']}));
});
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
test('CGG self-registration requires an approved corporate domain or exact allowlist', () => {
  assert.ok(source.includes('isCggEmailAllowed_(email, companyCode)'));
  const properties = { CGG_EMAIL_DOMAINS: null, CGG_ALLOWED_EMAILS: '' };
  const context = { PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] }) } };
  vm.createContext(context);
  const helperStart = source.indexOf('function isCggEmailAllowed_(');
  const helperEnd = source.indexOf('function appendUniqueUser_(', helperStart + 1);
  vm.runInContext(source.slice(helperStart, helperEnd), context);

  assert.equal(context.isCggEmailAllowed_('worker@ptcgg.com', 'CGG'), false);
  assert.equal(context.isCggEmailAllowed_('staff@gmail.com', 'CGG'), false);
  assert.equal(context.isCggEmailAllowed_('person@yahoo.com', 'CGG'), false);
  assert.equal(context.isCggEmailAllowed_('worker@sls.co.id', 'SLS'), true);
  assert.equal(context.isCggEmailAllowed_('worker@subkon.co.id', 'SUBKON1'), true);
  assert.equal(context.isCggEmailAllowed_('not-an-email', 'CGG'), false);
  assert.equal(context.isCggEmailAllowed_('', 'CGG'), false);

  properties.CGG_EMAIL_DOMAINS = 'ptcgg.com; cgg.co.id';
  assert.equal(context.isCggEmailAllowed_('worker@ptcgg.com', 'CGG'), true);
  properties.CGG_ALLOWED_EMAILS = 'approved@gmail.com';
  assert.equal(context.isCggEmailAllowed_('user@cgg.co.id', 'CGG'), true);
  assert.equal(context.isCggEmailAllowed_('approved@gmail.com', 'CGG'), true);
  assert.equal(context.isCggEmailAllowed_('other@gmail.com', 'CGG'), false);
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
  const lockEvents = [];
  const context = {
    isObject_: value => value && typeof value === 'object' && !Array.isArray(value),
    isAdminCGG_: actor => (actor.roles || []).includes('Admin CGG'),
    isCompanyAdmin_: actor => (actor.roles || []).includes('Company Admin'),
    canManageCompany_: () => true,
    findCompanyRegistry_: () => ({status:'ACTIVE',role:'Contractor',parentCompanyCode:''}),
    getSheet_: () => sheet,
    error_: (status,message) => ({success:false,status,message}),
    success_: data => ({success:true,data}),
    LockService: { getScriptLock: () => ({ waitLock: () => lockEvents.push('lock'), releaseLock: () => lockEvents.push('unlock') }) },
    SpreadsheetApp: { flush: () => lockEvents.push('flush') },
    revokeUserSessions_: userId => lockEvents.push('revoke:' + userId),
    logAudit_: () => lockEvents.push('audit')
  };
  vm.createContext(context);
  const coreStart=source.indexOf('function updateUserAccessCore_(');
  const wrapperStart=source.indexOf('function updateUserAccess_(',coreStart+1);
  const end=source.indexOf('function isOversightRole_(',wrapperStart+1);
  assert.notEqual(coreStart,-1); assert.notEqual(wrapperStart,-1); assert.notEqual(end,-1);
  vm.runInContext(source.slice(coreStart,end),context);
  const actor={id:'admin-sls',roles:['Company Admin'],companyCode:'SLS'};
  const result=context.updateUserAccess_('user-1',{role:'Foreman Safety',position:'Foreman',status:'ACTIVE'},actor);
  assert.equal(result.success,true);
  assert.equal(result.data.roleVerified,false);
  assert.ok(writes.some(write=>write.args[0]===2 && write.args[1]===5 && write.value==='Foreman Safety'));
  assert.deepEqual(lockEvents.slice(0,5),['lock','flush','unlock','revoke:user-1','audit']);
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
    isOversightRole_: user => (user.roles || []).some(role => ['KTT','SPT','SPV','Project Manager','PJO','SPV HSE','Foreman Safety'].includes(role)),
    findCompanyRegistry_: code => code === 'CGG' ? null : ({status:'ACTIVE',role:'Contractor',parentCompanyCode:''}),
    getSheet_: () => ({ getDataRange: () => ({ getValues: () => [
      ['companyCode','companyName','role','parentCompanyCode','emailDomains','autoProvision','status'],
      ['SLS','PT SLS','Contractor','','','FALSE','ACTIVE'],
      ['VIP','PT VIP','Contractor','','','FALSE','ACTIVE'],
      ['BCJ','PT BCJ','Subkon','SLS','','FALSE','ACTIVE'],
      ['CHN','PT CHN','Subkon','VIP','','FALSE','ACTIVE'],
      ['NUS','PT Nusantara','Contractor','','','FALSE','ACTIVE'],
      ['DTA','PT Duta','Subkon','NUS','','FALSE','ACTIVE'],
      ['OTHER','Other Subkon','Subkon','OTHERCO','','FALSE','ACTIVE']
    ]}) })
  };
  vm.createContext(context);
  const start=source.indexOf('function getOversightCompanyCodes_(');
  const end=source.indexOf('function requiresRoleVerification_(',start+1);
  assert.notEqual(start,-1); assert.notEqual(end,-1);
  vm.runInContext(source.slice(start,end),context);
  for (const role of ['KTT','SPT','SPV','Project Manager','PJO','SPV HSE','Foreman Safety']) {
    const user={roles:[role],companyCode:'CGG',roleVerified:true};
    assert.equal(context.isRecordVisibleToUser_({companyCode:'SLS'},user),true);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'VIP'},user),true);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'BCJ',parentCompanyCode:'SLS'},user),true);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'CHN',parentCompanyCode:'VIP'},user),true);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'OTHER'},user),false);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'NUS'},user),true);
    assert.equal(context.isRecordVisibleToUser_({companyCode:'DTA',parentCompanyCode:'NUS'},user),true);
  }
});
test('unverified KTT, SPT, and SPV cannot view cross-company records', () => {
  const context = {
    isAdminCGG_: () => false,
    isCompanyScopedRole_: () => true,
    isOversightRole_: user => (user.roles || []).some(role => ['KTT','SPT','SPV'].includes(role)),
    findCompanyRegistry_: () => null,
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
test('verified CGG oversight can read redacted company master dynamically', () => {
  assert.ok(source.includes("const isVerifiedCggOversight = user.roleVerified === true"));
  assert.ok(source.includes("!isAdminCGG_(user) && !isCompanyAdmin_(user) && !isVerifiedCggOversight && !isCompanyPassportViewer"));
  assert.ok(source.includes("emailDomains: '',"));
  assert.ok(source.includes("autoProvision: false,"));
  assert.ok(source.includes("return success_(visibleCompanies.map(function(company)"));
  assert.ok(source.includes("const isCggOversight = isOversightRole_(user) && user.roleVerified === true && ownCompany === 'CGG'"));
  assert.ok(source.includes("String(user.companyCode || '').trim().toUpperCase() === 'CGG'"));
  assert.ok(source.includes("const isCompanyPassportViewer = roles.some(function(role)"));
  assert.ok(source.includes("company.role === 'Subkon' && parent === ownCode"));
});
test('verified oversight reader scope is separate from operational write-controller roles', () => {
  assert.ok(source.includes("return roles.some(function(role) { return ['KTT', 'SPT', 'SPV', 'PJO', 'SPV HSE', 'Foreman Safety'].indexOf(role) >= 0; });"));
  assert.ok(source.includes("return roles.some(function(role) { return ['KTT', 'SPT', 'SPV', 'Project Manager', 'PJO', 'SPV HSE', 'Foreman Safety'].indexOf(role) >= 0; });"));
  assert.ok(source.includes("roles.indexOf('Project Manager') >= 0"));
});


test('Company Admin cannot overwrite a published form outside its tenant or change form ownership', () => {
  assert.ok(source.includes("if (!isAdminCGG_(user) && !isRecordVisibleToUser_(existing, user)) return error_(403, 'Anda tidak memiliki akses untuk memperbarui formulir perusahaan lain.')"));
  assert.ok(source.includes("safeForm.companyCode = String(existing.companyCode || user.companyCode || '').trim().toUpperCase();"));
  assert.ok(source.includes("safeForm.parentCompanyCode = String(existing.parentCompanyCode || user.parentCompanyCode || '').trim().toUpperCase();"));
});

test('Repository upload derives parent company from master registry and is idempotent before Drive upload', () => {
  const routeStart = source.indexOf("if (path === '/api/repository' && method === 'POST')");
  const routeEnd = source.indexOf('const repositoryDeleteMatch', routeStart);
  const route = source.slice(routeStart, routeEnd);
  const helperStart = source.indexOf('function createRepositoryDocument_(');
  const helperEnd = source.indexOf('function canPreviewRepositoryDocument_(', helperStart);
  const helper = source.slice(helperStart, helperEnd);
  assert.match(route, /const parentCompanyCode = registeredCompany && registeredCompany\.role === 'Subkon'/);
  assert.ok(route.includes('createRepositoryDocument_(input, bytes, fileMetadata, companyCode, parentCompanyCode, user)'));
  assert.ok(helper.includes('getExistingRecordForCreate_(sheet, id, user)'));
  assert.ok(helper.indexOf('getExistingRecordForCreate_') < helper.indexOf('folder.createFile(blob)'));
});


test('New published forms derive tenant parent from active company registry, not request payload', () => {
  assert.ok(source.includes("const registeredCompany = companyCode === 'CGG' ? null : findCompanyRegistry_(companyCode);"));
  assert.ok(source.includes("const parentCompanyCode = registeredCompany && registeredCompany.role === 'Subkon' ? String(registeredCompany.parentCompanyCode || '').trim().toUpperCase() : '';"));
  assert.ok(source.includes("parentCompanyCode: parentCompanyCode,"));
  assert.ok(!source.includes("parentCompanyCode: String(input.parentCompanyCode || user.parentCompanyCode || '')"));
});


test('Company Admin cannot change PICA approval stages or close PICA outside HSE validation', () => {
  assert.ok(source.includes("if (entity === 'picas' && isCompanyAdmin_(user) && !isAdminCGG_(user))"));
  assert.ok(source.includes("return error_(403, 'Admin Perusahaan tidak dapat mengubah tahapan persetujuan PICA.')"));
  assert.ok(source.includes("if (requestedStatusForCompanyAdmin === 'CLOSED')"));
  assert.ok(source.includes('Admin Perusahaan tidak dapat menutup PICA. Validasi hanya dapat dilakukan Foreman Safety atau SPV HSE'));
});
test('Operational tenant ownership remains immutable during PATCH for non-CGG admins', () => {
  assert.ok(source.includes("['companyCode', 'contractorCode', 'parentCompanyCode', 'subcontractorCode', 'subkonCode'].forEach(function(key)"));
});


test('Oversight scope follows all active Contractor roots and excludes inactive roots', () => {
  const context = {
    getSheet_: () => ({ getDataRange: () => ({ getValues: () => [
      ['companyCode','companyName','role','parentCompanyCode','emailDomains','autoProvision','status'],
      ['SLS','PT SLS','Contractor','','','FALSE','INACTIVE'],
      ['VIP','PT VIP','Contractor','','','FALSE','ACTIVE'],
      ['BCJ','PT BCJ','Subkon','SLS','','FALSE','ACTIVE'],
      ['CHN','PT CHN','Subkon','VIP','','FALSE','ACTIVE'],
      ['NUS','PT Nusantara','Contractor','','','FALSE','ACTIVE'],
      ['DTA','PT Duta','Subkon','NUS','','FALSE','ACTIVE']
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
  assert.equal(Boolean(allowed.NUS),true);
  assert.equal(Boolean(allowed.DTA),true);
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
  const start=source.indexOf('function upsertCompanyRegistryCore_(');
  const end=source.indexOf('function upsertCompanyRegistry_(',start+1);
  const fn=source.slice(start,end);
  const wrapperEnd=source.indexOf('function findCompanyRegistry_(',end+1);
  const wrapper=source.slice(end,wrapperEnd);
  assert.ok(fn.includes("if (code === 'CGG') return error_(400,"));
  assert.ok(wrapper.includes('LockService.getScriptLock()'));
  assert.ok(wrapper.indexOf('revokeCompanySessions_(code)') < wrapper.indexOf('lock.releaseLock()'));
  assert.ok(wrapper.indexOf('lock.releaseLock()') < wrapper.indexOf('logAudit_('));
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

test('company master changes revoke sessions for the company and its subcontractors only', () => {
  const properties = {
    'session:contractor': JSON.stringify({id:'u1',companyCode:'SLS'}),
    'session:subkon': JSON.stringify({id:'u2',companyCode:'BCJ',parentCompanyCode:'SLS'}),
    'session:other': JSON.stringify({id:'u3',companyCode:'VIP',parentCompanyCode:'VIP'}),
    'session:unrelated': JSON.stringify({id:'u4',companyCode:'CGG'}),
    'app:setting': 'keep'
  };
  const removed = [];
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperties: () => Object.assign({}, properties),
      deleteProperty: key => { removed.push(key); delete properties[key]; }
    }) },
    CacheService: { getScriptCache: () => ({ remove: key => removed.push('cache:' + key) }) }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('revokeCompanySessions_', 'upsertCompanyRegistryCore_'), context);
  assert.equal(context.revokeCompanySessions_('sls'), 2);
  assert.equal(properties['session:contractor'], undefined);
  assert.equal(properties['session:subkon'], undefined);
  assert.ok(properties['session:other']);
  assert.ok(properties['session:unrelated']);
  assert.equal(properties['app:setting'], 'keep');
  assert.ok(removed.includes('cache:session:contractor'));
  assert.ok(removed.includes('cache:session:subkon'));
});

test('user access changes revoke every persistent session belonging to that user ID', () => {
  const properties = {
    'session:token-a': JSON.stringify({id:'u1',email:'one@example.com'}),
    'session:token-b': JSON.stringify({id:'u1',email:'one@example.com'}),
    'session:other-user': JSON.stringify({id:'u2',email:'two@example.com'}),
    'unrelated-setting': 'keep'
  };
  const removed = [];
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperties: () => Object.assign({}, properties),
      deleteProperty: key => { removed.push(key); delete properties[key]; }
    }) },
    CacheService: { getScriptCache: () => ({ remove: key => removed.push('cache:' + key) }) }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('revokeUserSessions_', 'updateUserAccessCore_'), context);
  assert.equal(context.revokeUserSessions_('u1'), 2);
  assert.equal(properties['session:token-a'], undefined);
  assert.equal(properties['session:token-b'], undefined);
  assert.ok(properties['session:other-user']);
  assert.equal(properties['unrelated-setting'], 'keep');
  assert.ok(removed.includes('cache:session:token-a'));
  assert.ok(removed.includes('cache:session:token-b'));
});

test('expired sessions are deleted and rejected before account lookup', () => {
  let propertyDeleted = false;
  let cacheDeleted = false;
  let userLookupCalled = false;
  const context = {
    Date: { now: () => 200000 },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => key === 'session:expired' ? JSON.stringify({id:'u1',email:'worker@example.com',expiresAt:199999}) : null,
      deleteProperty: key => { if (key === 'session:expired') propertyDeleted = true; }
    }) },
    CacheService: { getScriptCache: () => ({
      get: () => null,
      remove: key => { if (key === 'session:expired') cacheDeleted = true; }
    }) },
    findUserByEmail_: () => { userLookupCalled = true; return null; },
    httpError_: (status,message) => Object.assign(new Error(message),{status})
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('requireAuth_', 'publicUser_'), context);
  assert.throws(() => context.requireAuth_('expired'), error => error.status === 401);
  assert.equal(propertyDeleted, true);
  assert.equal(cacheDeleted, true);
  assert.equal(userLookupCalled, false);
});

test('a session token cannot authenticate a different account reusing the same email', () => {
  let propertyDeleted = false;
  let cacheDeleted = false;
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => key === 'session:token-reused' ? JSON.stringify({id:'old-user',email:'shared@example.com',expiresAt:Date.now()+60000}) : null,
      deleteProperty: key => { if (key === 'session:token-reused') propertyDeleted = true; }
    }) },
    CacheService: { getScriptCache: () => ({
      get: () => null,
      remove: key => { if (key === 'session:token-reused') cacheDeleted = true; }
    }) },
    findUserByEmail_: () => ({id:'new-user',email:'shared@example.com',displayName:'New Account',roles:['Employee'],status:'ACTIVE',companyCode:'CGG'}),
    isUserCompanyActive_: () => true,
    httpError_: (status,message) => Object.assign(new Error(message),{status})
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('requireAuth_', 'publicUser_'), context);
  assert.throws(() => context.requireAuth_('token-reused'), error => error.status === 401);
  assert.equal(propertyDeleted, true);
  assert.equal(cacheDeleted, true);
});

test('an inactive tenant invalidates an otherwise active user session', () => {
  let deleted = false;
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => key === 'session:token-1' ? JSON.stringify({id:'u1',email:'worker@sls.co.id',expiresAt:Date.now()+60000}) : null,
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

test('PICA can be submitted by its assigned PIC and closed after Foreman and SPV HSE approvals', () => {
  const context = {
    error_: (status, message) => ({status, message}),
    Utilities: { formatDate: () => '2026-11-01' },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'tenant-folder' }) },
    DriveApp: { getFileById: () => ({
      getUrl: () => 'https://drive.example/evidence.jpg',
      getMimeType: () => 'image/jpeg',
      getParents: () => { let parentRead = false; return { hasNext: () => !parentRead, next: () => { parentRead = true; return { getId: () => 'tenant-folder' }; } }; }
    }) }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('enforcePicaClosureRules_', 'createSessionResponse_'), context);

  const open = {status:'PROGRESS',assignedToEmail:'pic@example.com',companyCode:'CGG',completionDate:''};
  const submit = {status:'WAITING_HSE',correctiveAction:'Guardrail repaired',evidencePhotoUrl:'https://drive.example/evidence.jpg',evidencePhotoFileId:'photo-1'};
  assert.equal(context.enforcePicaClosureRules_(open,submit,{roles:['Employee'],email:'pic@example.com',roleVerified:false}),null);
  assert.ok(submit.submittedAt);
  assert.ok(submit.closeRequestedAt);

  const noPhoto = {status:'WAITING_HSE',correctiveAction:'Done',evidencePhotoUrl:'https://drive.example/evidence.jpg'};
  assert.equal(context.enforcePicaClosureRules_(open,noPhoto,{roles:['Employee'],email:'pic@example.com'}).status,400);
  assert.equal(context.enforcePicaClosureRules_(open,{status:'WAITING_HSE',correctiveAction:'Done',evidencePhotoUrl:'x',evidencePhotoFileId:'photo-1'},{roles:['Employee'],email:'other@example.com'}).status,403);

  const waiting = {status:'WAITING_HSE',assignedToEmail:'pic@example.com',companyCode:'CGG',completionDate:'',approvalStages:{foreman:true,spvHse:true}};
  const close = {status:'CLOSED'};
  assert.equal(context.enforcePicaClosureRules_(waiting,close,{roles:['Employee','Foreman Safety'],displayName:'HSE Foreman',roleVerified:true}),null);
  assert.equal(close.hseValidatedBy,'HSE Foreman');
  assert.equal(close.hseValidatedRole,'Foreman Safety');
  assert.match(close.completionDate,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(context.enforcePicaClosureRules_(waiting,{status:'CLOSED'},{roles:['KTT'],roleVerified:true}).status,403);
  assert.equal(context.enforcePicaClosureRules_(waiting,{status:'CLOSED'},{roles:['Employee','Foreman Safety'],roleVerified:false}).status,403);

  const returned = {status:'PROGRESS',rejectionReason:'Foto belum jelas'};
  assert.equal(context.enforcePicaClosureRules_({...waiting,approvalStages:{foreman:false,spvHse:false}},returned,{roles:['SPV HSE'],roleVerified:true}),null);
  assert.equal(context.enforcePicaClosureRules_({status:'CLOSED'},{status:'OPEN'},{roles:['Foreman Safety'],roleVerified:true}).status,403);
});
test('PICA approval changes are included in the existing audit record', () => {
  assert.ok(source.includes('approvalStageChanges: stageChanges'));
  assert.ok(source.includes('statusFrom: oldStatus'));
  assert.match(source, /details:\s*details\s*\|\|\s*\{\}/);
  assert.match(source, /updateRecord_\(entity,\s*id,\s*scopedPayload,\s*user,\s*auditDetails,\s*expectedPicaState,\s*expectedRecordUpdatedAt\)/);
});

test('central company master returns Contractor Passport profile fields', () => {
  const context = {
    getSheet_: () => ({
      getDataRange: () => ({
        getValues: () => [
          ['companyCode','companyName','role','parentCompanyCode','emailDomains','autoProvision','status','passportStatus','picName','picContact','safetyPassportExpiry'],
          ['SLS','Sentosa Laju Sejahtera','Contractor','','sls.co.id','FALSE','ACTIVE','WARNING','Budi Safety','08123456789','2027-06-30'],
          ['SUB1','Subkon Mitra','Subkon','SLS','','FALSE','ACTIVE','ACTIVE','Sari HSE','08111111111','2027-03-31']
        ]
      })
    }),
    success_: data => ({success:true,data})
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('listCompanyRegistry_', 'revokeCompanySessions_'), context);
  const result = context.listCompanyRegistry_();
  assert.equal(result.data.length, 2);
  assert.equal(result.data[0].passportStatus, 'WARNING');
  assert.equal(result.data[0].picName, 'Budi Safety');
  assert.equal(result.data[0].picContact, '08123456789');
  assert.equal(result.data[0].safetyPassportExpiry, '2027-06-30');
  assert.equal(result.data[1].parentCompanyCode, 'SLS');
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

test('PICA approval sequence requires Foreman, then SPV HSE', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractFunction('isPicaApprovalSequenceValid_', 'enforcePicaClosureRules_'), context);
  assert.equal(context.isPicaApprovalSequenceValid_({foreman:false,spvHse:false,ktt:false},'foreman'),true);
  assert.equal(context.isPicaApprovalSequenceValid_({foreman:false,spvHse:true,ktt:false},'spvHse'),false);
  assert.equal(context.isPicaApprovalSequenceValid_({foreman:true,spvHse:false},'spvHse'),true);
  assert.equal(context.isPicaApprovalSequenceValid_({foreman:true,spvHse:true},'spvHse'),true);
  assert.equal(context.isPicaApprovalSequenceValid_({foreman:true,spvHse:true},'ktt'),false);
});

test('PICA monitoring permission is centralized and requires verified HSE roles', () => {
  const context = {
    isAdminCGG_: user => Boolean(user && (user.roles || []).includes('Admin CGG')),
    isCompanyAdmin_: user => Boolean(user && (user.roles || []).includes('Company Admin'))
  };
  vm.createContext(context);
  const helperStart = source.indexOf('function canMonitorPicas_(user) {');
  const helperEnd = source.indexOf('function isReadOnlyController_(user) {', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  vm.runInContext(source.slice(helperStart, helperEnd), context);
  assert.equal(context.canMonitorPicas_(null), false);
  assert.equal(context.canMonitorPicas_({ roles: ['Foreman Safety'], roleVerified: true }), true);
  assert.equal(context.canMonitorPicas_({ roles: ['SPV HSE'], roleVerified: true }), true);
  assert.equal(context.canMonitorPicas_({ roles: ['Foreman Safety'], roleVerified: false }), false);
  assert.equal(context.canMonitorPicas_({ roles: ['KTT'], roleVerified: true }), false);
  assert.equal(context.canMonitorPicas_({ roles: ['Project Manager'], roleVerified: true }), false);
  assert.equal(context.canMonitorPicas_({ roles: ['Company Admin'] }), true);
  assert.equal(context.canMonitorPicas_({ roles: ['Admin CGG'] }), true);
  const routeStart = source.indexOf("path.match(\n      /^\\/api\\/(inspections|hazards|picas|incidents)");
  const getAllEnd = source.indexOf('// GET ONE', routeStart);
  const getOneEnd = source.indexOf('// CREATE', getAllEnd);
  assert.match(source.slice(routeStart, getAllEnd), /canMonitorPicas_\(user\)/);
  assert.match(source.slice(getAllEnd, getOneEnd), /canMonitorPicas_\(user\)/);
});

test('PICA oversight reads and updates are limited to Foreman Safety and SPV HSE', () => {
  assert.match(source, /function canMonitorPicas_\(user\) \{/);
  assert.equal((source.match(/canMonitorPicas_\(user\)/g) || []).length, 3);
  assert.ok(source.includes("const isHSEValidator = roles.some(function(role) { return ['Foreman Safety', 'SPV HSE'].indexOf(role) >= 0; }) && user.roleVerified === true"));
  const routeStart = source.indexOf("path.match(\n      /^\\/api\\/(inspections|hazards|picas|incidents)");
  const getAllEnd = source.indexOf('// GET ONE', routeStart);
  const getOneEnd = source.indexOf('// CREATE', getAllEnd);
  const getAllRoute = source.slice(routeStart, getAllEnd);
  const getOneRoute = source.slice(getAllEnd, getOneEnd);
  assert.match(getAllRoute, /canMonitorPicas_\(user\)/);
  assert.match(getOneRoute, /canMonitorPicas_\(user\)/);
  assert.doesNotMatch(getAllRoute, /\['Foreman Safety', 'SPV HSE', 'KTT', 'Project Manager'\]/);
  assert.doesNotMatch(getOneRoute, /Project Manager/);
});
test('operational photo upload requires an active registered tenant', () => {
  assert.ok(source.includes("const registeredCompany = findCompanyRegistry_(companyCode);\n      if (!registeredCompany || registeredCompany.status !== 'ACTIVE') return error_(403, 'Perusahaan akun belum terdaftar aktif pada master perusahaan.');"));
});
test('PICA register limits non-HSE users to assigned records and enforces PIC/HSE lifecycle', () => {
  assert.ok(source.includes("String(record.assignedToEmail || '').trim().toLowerCase() === String(user.email || '').trim().toLowerCase()"));
  assert.ok(source.includes("const isHSEValidator = roles.some(function(role) { return ['Foreman Safety', 'SPV HSE'].indexOf(role) >= 0; }) && user.roleVerified === true"));
  assert.ok(source.includes("Hanya PIC yang ditugaskan dapat mengajukan penutupan PICA."));
  assert.ok(source.includes("Penutupan PICA hanya dapat divalidasi Foreman Safety atau SPV HSE"));
  assert.ok(source.includes("PICA belum diajukan PIC untuk validasi HSE."));
  assert.ok(source.includes("'WAITING_HSE'"));
  assert.ok(source.includes("PICA ini tidak ditugaskan kepada akun Anda."));
  assert.ok(source.includes("user.roleVerified === true && roles.some(function(role) { return ['Foreman Safety', 'SPV HSE'].indexOf(role) >= 0; })"));
  assert.ok(source.includes("PICA hasil inspeksi wajib memiliki departemen, nama PIC, dan email akun PIC."));
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

test('Repository Drive file ownership fails closed unless the file belongs to the configured folder', () => {
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'HDOS_REPOSITORY_FOLDER_ID' ? 'repository-folder' : null }) }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('isRepositoryDriveFile_', 'canPreviewRepositoryDocument_'), context);
  const inFolder = { getParents: () => {
    let read = false;
    return { hasNext: () => !read, next: () => { read = true; return { getId: () => 'repository-folder' }; } };
  } };
  const outsideFolder = { getParents: () => {
    let read = false;
    return { hasNext: () => !read, next: () => { read = true; return { getId: () => 'other-folder' }; } };
  } };
  assert.equal(context.isRepositoryDriveFile_(inFolder), true);
  assert.equal(context.isRepositoryDriveFile_(outsideFolder), false);
  assert.equal(context.isRepositoryDriveFile_(null), false);
  context.PropertiesService.getScriptProperties = () => ({ getProperty: () => '' });
  assert.equal(context.isRepositoryDriveFile_(inFolder), false);
  context.PropertiesService.getScriptProperties = () => { throw new Error('Drive unavailable'); };
  assert.equal(context.isRepositoryDriveFile_(inFolder), false);
});

test('Repository upload transaction locks idempotency, Drive creation, and metadata commit together', () => {
  const start = source.indexOf('function createRepositoryDocument_(');
  const end = source.indexOf('function canPreviewRepositoryDocument_(', start + 1);
  assert.ok(start >= 0 && end > start);
  const helper = source.slice(start, end);
  assert.match(helper, /lock\.waitLock\(10000\)/);
  assert.match(helper, /getExistingRecordForCreate_\(sheet, id, user\)/);
  assert.ok(helper.indexOf('getExistingRecordForCreate_') < helper.indexOf('folder.createFile(blob)'));
  assert.ok(helper.indexOf('folder.createFile(blob)') < helper.indexOf("sheet.appendRow(buildEntityRow_('repository'"));
  assert.match(helper, /createdFile\.setTrashed\(true\)/);
  assert.match(helper, /finally\s*\{\s*lock\.releaseLock\(\)/);
  assert.ok(helper.indexOf('lock.releaseLock()') < helper.indexOf("logAudit_(user, 'CREATE', 'repository', id)"));
  const routeStart = source.indexOf("if (path === '/api/repository' && method === 'POST')");
  const routeEnd = source.indexOf('const repositoryDeleteMatch', routeStart);
  const route = source.slice(routeStart, routeEnd);
  assert.match(route, /createRepositoryDocument_\(input, bytes, fileMetadata, companyCode, parentCompanyCode, user\)/);
});

test('Repository preview and download accesses are recorded in the audit log', () => {
  assert.ok(source.includes("logAudit_(user, 'REPOSITORY_DOCUMENT_PREVIEWED', 'repository', doc.id"));
  assert.ok(source.includes("logAudit_(user, 'REPOSITORY_DOCUMENT_DOWNLOADED', 'repository', doc.id"));
});

test('Repository file validation rejects MIME-spoofed and unsupported uploads', () => {
  const context = {
    httpError_: (status,message) => Object.assign(new Error(message),{status})
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('getRepositoryFileMetadata_', 'publicRepositoryDocument_'), context);
  const pdfMetadata = context.getRepositoryFileMetadata_('safe.pdf',[37,80,68,70,45,49]);
  assert.equal(pdfMetadata.fileType,'PDF');
  assert.equal(pdfMetadata.mimeType,'application/pdf');
  assert.throws(()=>context.getRepositoryFileMetadata_('spoofed.pdf',[60,104,116,109,108]),error=>error.status===400);
  assert.equal(context.getRepositoryFileMetadata_('procedure.docx',[80,75,3,4]).mimeType,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(context.getRepositoryFileMetadata_('register.xlsx',[80,75,3,4]).fileType,'XLSX');
  assert.throws(()=>context.getRepositoryFileMetadata_('script.html',[60,115,99,114]),error=>error.status===400);
});

test('operational updates reject stale record versions to prevent concurrent overwrite', () => {
  const context = {};
  vm.createContext(context);
  const start = source.indexOf('function isExpectedRecordVersionCurrent_(');
  const end = source.indexOf('function updateRecord_(', start + 1);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  const current = { updatedAt: '2026-11-01T10:05:00.000Z' };
  assert.equal(context.isExpectedRecordVersionCurrent_(current, '2026-11-01T10:05:00.000Z'), true);
  assert.equal(context.isExpectedRecordVersionCurrent_(current, '2026-11-01T10:00:00.000Z'), false);
  assert.equal(context.isExpectedRecordVersionCurrent_(current, null), true);
  assert.ok(source.includes('expectedRecordUpdatedAt'));
  assert.ok(source.includes("throw httpError_(409, 'Data telah diperbarui oleh pengguna lain. Muat ulang data sebelum menyimpan perubahan.')"));
});

test('PICA updates reject stale approval states to prevent concurrent stage overwrite', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractFunction('isExpectedPicaStateCurrent_', 'updateRecord_'), context);
  const expected={status:'PROGRESS',approvalStages:{foreman:true,spvHse:false,ktt:false}};
  assert.equal(context.isExpectedPicaStateCurrent_({status:'PROGRESS',approvalStages:{foreman:true,spvHse:false,ktt:false}},expected),true);
  assert.equal(context.isExpectedPicaStateCurrent_({status:'PROGRESS',approvalStages:{foreman:true,spvHse:true,ktt:false}},expected),false);
  assert.equal(context.isExpectedPicaStateCurrent_({status:'CLOSED',approvalStages:{foreman:true,spvHse:false,ktt:false}},expected),false);
});

test('login attempts are atomically rate-limited per normalized email and can be cleared', () => {
  const values = new Map();
  const context = {
    Utilities: {
      DigestAlgorithm: {SHA_256:'SHA_256'},
      Charset: {UTF_8:'UTF_8'},
      computeDigest: () => [1,2,3],
      base64EncodeWebSafe: () => 'hashed-email'
    },
    CacheService: {getScriptCache: () => ({
      get: key => values.get(key) || null,
      put: (key,value,ttl) => { assert.equal(ttl,300); values.set(key,value); },
      remove: key => values.delete(key)
    })},
    LockService: {getScriptLock: () => ({waitLock:ms=>assert.equal(ms,5000),releaseLock:()=>{}})}
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('loginRateLimitKey_', 'reserveLoginAttempt_'),context);
  vm.runInContext(extractFunction('reserveLoginAttempt_', 'clearLoginFailures_'),context);
  vm.runInContext(extractFunction('clearLoginFailures_', 'login_'),context);
  for(let i=0;i<10;i++) assert.equal(context.reserveLoginAttempt_('Worker@Example.com'),true);
  assert.equal(context.reserveLoginAttempt_('worker@example.com'),false);
  context.clearLoginFailures_('worker@example.com');
  assert.equal(context.reserveLoginAttempt_('worker@example.com'),true);
});

test('password hash comparison checks the full fixed-format value', () => {
  const context = {};
  vm.createContext(context);
  const start = source.indexOf('function constantTimeStringEquals_(');
  const end = source.indexOf('function migrateLegacyPassword_(', start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.constantTimeStringEquals_('same-hash-value', 'same-hash-value'), true);
  assert.equal(context.constantTimeStringEquals_('same-hash-value', 'xame-hash-value'), false);
  assert.equal(context.constantTimeStringEquals_('same-hash-value', 'same-hash-valuX'), false);
  assert.equal(context.constantTimeStringEquals_('short', 'longer'), false);
  assert.equal(context.constantTimeStringEquals_('', ''), true);
  assert.ok(source.includes('constantTimeStringEquals_(passwordHash_(password, user.passwordSalt), user.passwordHash)'));
});


test('central mining area master is readable by authenticated sessions and writes are CGG-admin only', () => {
  assert.ok(source.includes("if (path === '/api/locations' && method === 'GET')"));
  assert.ok(source.includes("if (path === '/api/locations' && method === 'POST')"));
  assert.ok(source.includes("if (!isAdminCGG_(user)) return error_(403, 'Hanya Admin CGG yang dapat mengubah master Area Kerja.')"));
  assert.ok(source.includes("if (!isAdminCGG_(user)) return error_(403, 'Hanya Admin CGG yang dapat menghapus master Area Kerja.')"));
  assert.ok(source.includes("locations: ['id', 'name', 'utm', 'lat', 'lng', 'description', 'zoneType'"));
  assert.ok(source.includes("logAudit_(user, 'CREATE', 'locations'"));
  assert.ok(source.includes("logAudit_(user, 'DELETE', 'locations'"));
});

test('central mining area master validates coordinates, category, and duplicate name/category under lock', () => {
  assert.ok(source.includes("lat < -90 || lat > 90"));
  assert.ok(source.includes("lng < -180 || lng > 180"));
  assert.ok(source.includes("allowedZones.indexOf(zoneType) === -1"));
  assert.ok(source.includes("Area dengan nama dan kategori yang sama sudah terdaftar."));
  assert.ok(source.includes("lock.waitLock(10000)"));
});

test('operational store queues Inspection, Hazard, generated PICA, Incident, and PICA approvals for central sync', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const inspectionStart = storeSource.indexOf('async addInspection(');
  const hazardStart = storeSource.indexOf('async addHazard(');
  const incidentStart = storeSource.indexOf('async addIncident(');
  const picaUpdateStart = storeSource.indexOf('async updatePICAStatus(');
  assert.ok(inspectionStart >= 0 && hazardStart > inspectionStart && incidentStart > hazardStart && picaUpdateStart > incidentStart);

  const inspection = storeSource.slice(inspectionStart, hazardStart);
  const hazard = storeSource.slice(hazardStart, incidentStart);
  const incident = storeSource.slice(incidentStart, picaUpdateStart);
  const picaUpdate = storeSource.slice(picaUpdateStart);

  assert.match(inspection, /action: 'CREATE'[\s\S]*?entity: 'pica'/);
  assert.match(inspection, /action: 'CREATE'[\s\S]*?entity: 'inspection'/);
  assert.match(hazard, /action: 'CREATE'[\s\S]*?entity: 'pica'/);
  assert.match(hazard, /action: 'CREATE'[\s\S]*?entity: 'hazard'/);
  assert.match(incident, /action: 'CREATE'[\s\S]*?entity: 'incident'/);
  assert.match(picaUpdate, /action: 'UPDATE'[\s\S]*?entity: 'pica'/);
  assert.match(storeSource, /await hdosSync\.enqueueBatch\(/);
});

test('GAS operational creates preserve client IDs and are idempotent under a script lock', () => {
  const createStart = source.indexOf('function createRecord_(');
  const createEnd = source.indexOf('function isExpectedPicaStateCurrent_(', createStart + 1);
  assert.ok(createStart >= 0 && createEnd > createStart);
  const create = source.slice(createStart, createEnd);
  assert.match(create, /safePayload\.id/);
  assert.match(create, /getExistingRecordForCreate_\(sheet, id, user\)/);
  assert.match(create, /getScriptLock\(\)/);
  assert.match(create, /lock\.waitLock\(\s*10000\s*\)/);
  assert.match(create, /SpreadsheetApp\.flush\(\)/);
});


test('operational GET ALL returns a complete unpaginated tenant-filtered snapshot', () => {
  const routeStart = source.indexOf("path.match(\n      /^\\/api\\/(inspections|hazards|picas|incidents)");
  const routeEnd = source.indexOf('// GET ONE', routeStart);
  assert.notEqual(routeStart, -1);
  assert.notEqual(routeEnd, -1);
  const getAllRoute = source.slice(routeStart, routeEnd);
  assert.match(getAllRoute, /const records = readAll_\(entity\)/);
  assert.match(getAllRoute, /records\.filter\(function\(record\) \{/);
  assert.match(getAllRoute, /isRecordVisibleToUser_\(record, user\)/);
  assert.match(getAllRoute, /assignedToEmail/);

  const readAllStart = source.indexOf('function readAll_(');
  const readOneStart = source.indexOf('function readOne_(', readAllStart + 1);
  assert.notEqual(readAllStart, -1);
  assert.notEqual(readOneStart, -1);
  const readAll = source.slice(readAllStart, readOneStart);
  assert.match(readAll, /const lastRow =\s*sheet\.getLastRow\(\)/);
  assert.match(readAll, /getRange\(1, 1, lastRow, columnCount\)/);
  assert.match(readAll, /values\.slice\(1\)/);
  assert.doesNotMatch(readAll, /LIMIT|OFFSET|pageToken|nextPage/);
});


test('contractor reads own records and its registered subkon only', () => {
  const companies = {
    SLS: {status:'ACTIVE',role:'Contractor',parentCompanyCode:''},
    VIP: {status:'ACTIVE',role:'Contractor',parentCompanyCode:''},
    BCJ: {status:'ACTIVE',role:'Subkon',parentCompanyCode:'SLS'},
    CHN: {status:'ACTIVE',role:'Subkon',parentCompanyCode:'VIP'}
  };
  const context = {
    isAdminCGG_: user => (user.roles || []).includes('Admin CGG'),
    isCompanyScopedRole_: () => true,
    isOversightRole_: () => false,
    findCompanyRegistry_: code => companies[code] || null
  };
  vm.createContext(context);
  const start=source.indexOf('function isRecordVisibleToUser_(');
  const end=source.indexOf('function requiresRoleVerification_(',start+1);
  assert.notEqual(start,-1); assert.notEqual(end,-1);
  vm.runInContext(source.slice(start,end),context);
  const user={roles:['Employee'],companyCode:'SLS',parentCompanyCode:''};
  assert.equal(context.isRecordVisibleToUser_({companyCode:'SLS'},user),true);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'BCJ',parentCompanyCode:'SLS'},user),true);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'VIP'},user),false);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'CHN',parentCompanyCode:'VIP'},user),false);
});

test('subkon reads only its own tenant records, not parent or sibling records', () => {
  const companies = {
    SLS: {status:'ACTIVE',role:'Contractor',parentCompanyCode:''},
    BCJ: {status:'ACTIVE',role:'Subkon',parentCompanyCode:'SLS'},
    BKR: {status:'ACTIVE',role:'Subkon',parentCompanyCode:'SLS'}
  };
  const context = {
    isAdminCGG_: () => false,
    isCompanyScopedRole_: () => true,
    isOversightRole_: () => false,
    findCompanyRegistry_: code => companies[code] || null
  };
  vm.createContext(context);
  const start=source.indexOf('function isRecordVisibleToUser_(');
  const end=source.indexOf('function requiresRoleVerification_(',start+1);
  vm.runInContext(source.slice(start,end),context);
  const user={roles:['Employee'],companyCode:'BCJ',parentCompanyCode:'SLS'};
  assert.equal(context.isRecordVisibleToUser_({companyCode:'BCJ',parentCompanyCode:'SLS'},user),true);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'SLS'},user),false);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'BKR',parentCompanyCode:'SLS'},user),false);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'VIP'},user),false);
});


test('offline sync queue is bound to the authenticated user and company before replay', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');

  // Every newly queued item receives immutable owner metadata from the active
  // authenticated profile; legacy ownerless items are quarantined, not replayed.
  assert.match(syncSource, /ownerUserId:\s*owner\.userId/);
  assert.match(syncSource, /ownerCompanyCode:\s*owner\.companyCode/);
  assert.match(syncSource, /!item\.ownerUserId\s*\|\|\s*!item\.ownerCompanyCode/);
  assert.match(syncSource, /item\.status\s*=\s*'CONFLICT'/);

  // A queue snapshot is filtered to the current user AND tenant, then identity
  // is refreshed from the server before any queued write is sent.
  assert.match(syncSource, /item\.ownerUserId\s*===\s*owner\.userId\s*&&\s*item\.ownerCompanyCode\s*===\s*owner\.companyCode/);
  assert.match(syncSource, /const verifiedProfile\s*=\s*await hseApi\.me\(syncToken\)/);
  assert.match(syncSource, /verifiedOwner\.userId\s*!==\s*owner\.userId/);
  assert.match(syncSource, /verifiedOwner\.companyCode\s*!==\s*owner\.companyCode/);
  assert.match(syncSource, /hseApi\.create<Record<string, unknown>>\(endpoint, createPayload, syncToken\)/);

  // Cloud snapshots must not erase local records still waiting in this tenant's
  // queue, and must not expose another tenant's cached operational records.
  assert.match(storeSource, /isLocalRecordVisible\(record as unknown as Record<string, unknown>, currentUser, allowedCompanyCodes\)/);
  assert.match(storeSource, /pendingIds\.has\(local\.id\)/);
  assert.match(storeSource, /\.filter\(local => !remoteIds\.has\(local\.id\) && !pendingIds\.has\(local\.id\)\)/);
});


test('store initialization preserves operational offline data during upgrades', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  assert.doesNotMatch(storeSource, /cgg_hdos_empty_start_v1/);
  assert.doesNotMatch(storeSource, /for\s*\([^)]*storeName[^)]*\)\s*\{[\s\S]{0,300}hdosDB\.delete\(storeName/);
  assert.match(storeSource, /const seededDemoDocument = storedDocuments\.find\(\(doc\) => doc\.id === 'doc_1'\)/);
  assert.match(storeSource, /Only explicitly identified demo seed records are removed below/);
});


test('same-tab login scopes the tenant cache and queue before revealing the authenticated workspace', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.tsx'), 'utf8');
  const start = appSource.indexOf('async function handleLoggedIn()');
  const end = appSource.indexOf('async function handleLogout()', start + 1);
  assert.ok(start >= 0 && end > start);
  const handler = appSource.slice(start, end);
  assert.ok(handler.indexOf('await hdosStore.init()') >= 0);
  assert.ok(handler.indexOf('setIsAuthenticated(true)') > handler.indexOf('await hdosStore.init()'));
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const storeInitStart = storeSource.indexOf('async init(): Promise<void>');
  const queueInit = storeSource.indexOf('await hdosSync.init()', storeInitStart);
  const localLoad = storeSource.indexOf('// Preserve all operational offline data', storeInitStart);
  assert.ok(storeInitStart >= 0 && queueInit > storeInitStart && localLoad > queueInit,
    'the active account queue is loaded before local workspace hydration');
  assert.match(handler, /hseApi\.authToken !== loginToken/);
  assert.match(handler, /activeUser\.id !== user\.id/);
  assert.match(handler, /setIsAuthenticated\(false\)/);
});


test('operational create and approval methods commit records and queue before publishing in-memory success', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const methods = [
    ['async addInspection(', 'async addHazard(', 'this.inspections.unshift(newInspection)'],
    ['async addHazard(', 'async addIncident(', 'this.hazards.unshift(newHazard)'],
    ['async addIncident(', 'async updatePICAStatus(', 'this.incidents.unshift(newInc)'],
    ['async updatePICAStatus(', '}\n\nexport const hdosStore', 'this.picas[index] = updated']
  ];
  for (const [startMarker, endMarker, publishMarker] of methods) {
    const start = storeSource.indexOf(startMarker);
    const end = storeSource.indexOf(endMarker, start + 1);
    assert.ok(start >= 0 && end > start, 'method boundaries exist: ' + startMarker);
    const method = storeSource.slice(start, end);
    const bundlePosition = method.indexOf('await hdosSync.enqueueBatch(');
    const publishPosition = method.indexOf(publishMarker);
    assert.ok(bundlePosition >= 0 && publishPosition > bundlePosition, 'bundle commits before UI publish: ' + startMarker);
    assert.doesNotMatch(method, /hdosDB\.put\(/);
    assert.doesNotMatch(method, /hdosSync\.enqueue\(/);
  }
});

test('operational records and matching sync queue entries use one atomic IndexedDB bundle', () => {
  const dbSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'db.ts'), 'utf8');
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  assert.match(dbSource, /db\.transaction\(storeNames, 'readwrite'\)/);
  assert.match(dbSource, /tx\.oncomplete = \(\) => resolve\(\)/);
  assert.match(dbSource, /async putBundle(?:<[^>]+>)?\(/);
  assert.match(syncSource, /async enqueueBatch\(/);
  assert.match(syncSource, /await hdosDB\.reconcileSnapshotBundle\(/);
  assert.match(syncSource, /ownerUserId: owner\.userId/);
  assert.match(syncSource, /ownerCompanyCode: owner\.companyCode/);
  for (const marker of ['async addInspection(', 'async addHazard(', 'async addIncident(', 'async updatePICAStatus(']) {
    const start = storeSource.indexOf(marker);
    const next = storeSource.indexOf('\n  async ', start + marker.length);
    const method = storeSource.slice(start, next < 0 ? storeSource.length : next);
    assert.match(method, /hdosSync\.enqueueBatch\(/, marker + ' uses atomic bundle');
    assert.doesNotMatch(method, /hdosDB\.put\(/, marker + ' does not write records separately');
    assert.doesNotMatch(method, /hdosSync\.enqueue\(/, marker + ' does not queue separately');
  }
});


test('sync initialization recovers interrupted items only when the tenant lock is available or lease expired', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const initStart = syncSource.indexOf('async init(): Promise<void>');
  const initEnd = syncSource.indexOf('getIsOnline(): boolean', initStart + 1);
  const initMethod = syncSource.slice(initStart, initEnd);
  const ownerFilter = initMethod.indexOf('this.queue = owner ? storedQueue.filter');
  const recovery = initMethod.indexOf('const recoverInterruptedQueue');
  assert.ok(ownerFilter >= 0 && recovery > ownerFilter, 'owner filter precedes interrupted-item recovery');
  assert.match(initMethod, /navigator\.locks\.request\(/);
  assert.match(initMethod, /\{ mode: 'exclusive', ifAvailable: true \}/);
  assert.match(initMethod, /if \(lock && !abandonStaleInitialization\(\)\) await recoverInterruptedQueue\(\)/);
  assert.match(initMethod, /Date\.now\(\) - 2 \* 60 \* 1000/);
  assert.match(initMethod, /item\.status = 'PENDING'/);
  assert.match(initMethod, /item\.syncStartedAt = undefined/);
  assert.match(initMethod, /await hdosDB\.put\('queue', item\)/);
  assert.match(syncSource, /item\.syncStartedAt = new Date\(\)\.toISOString\(\)/);
});
test('sync retries transient failures but holds permanent API errors for manual correction', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  assert.ok(sync.includes('function isRetryableSyncError(error: unknown): boolean'));
  assert.ok(sync.includes('if (!(error instanceof ApiError)) return false;'));
  assert.ok(sync.includes('status === 0 || status === 408 || status === 425 ||'));
  assert.ok(sync.includes('status === 429 || status >= 500'));
  assert.ok(sync.includes("item.status === 'PENDING' &&"));
  assert.ok(sync.includes("item.status = retryable && item.retryCount < MAX_RETRIES"));
  assert.ok(sync.includes('Perlu pemeriksaan atau retry manual.'));
  assert.ok(sync.includes('if (!(error instanceof ApiError)) return false;'));
});

test('operational DELETE is tenant-authorized, locked, and idempotent after a lost response', () => {
  const routeStart = source.indexOf('// DELETE — admin-only and idempotent so a lost response can be safely replayed.');
  const routeEnd = source.indexOf('// UPDATE', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = source.slice(routeStart, routeEnd);
  assert.match(route, /isAdminCGG_\(user\).*isCompanyAdmin_\(user\)/);
  assert.match(route, /deleteLock\.waitLock\(10000\)/);
  assert.match(route, /const targetRow = findRecordRow_\(targetSheet, id\)/);
  assert.match(route, /if \(!targetRow\) return success_\(\{ id: id, deleted: true, alreadyDeleted: true \}\)/);
  assert.match(route, /const existingRecord = parseRow_\(targetSheet, targetRow\)/);
  assert.match(route, /isRecordVisibleToUser_\(existingRecord, user\)/);
  assert.doesNotMatch(route, /readOne_\(entity, id\)/);
  assert.match(route, /deleteLock\.releaseLock\(\)/);
  assert.match(route, /SpreadsheetApp\.flush\(\)/);
  assert.match(route, /if \(deleted\) logAudit_\(user, 'OPERATIONAL_RECORD_DELETED'/);
});


test('cloud snapshot merge cannot publish stale account data after an account switch', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const start = storeSource.indexOf('async mergeCloudOperationalRecords(');
  const end = storeSource.indexOf('\n  subscribe(', start);
  assert.ok(start >= 0 && end > start);
  const merge = storeSource.slice(start, end);
  assert.match(merge, /const ownerKey = currentUser\?\.id/);
  assert.match(merge, /if \(!currentUser \|\| !ownerKey \|\| activeOwnerKey\(\) !== ownerKey \|\| !isCurrentMerge\(\)\) return;/);
  assert.match(merge, /hdosSync\.getOwnerSnapshot\(\)/);
  assert.match(merge, /queueMatchesOwner/);
  assert.match(merge, /if \(activeOwnerKey\(\) !== ownerKey \|\| !isCurrentMerge\(\)\) return/);
  const publish = merge.indexOf('if (activeOwnerKey() !== ownerKey || !isCurrentMerge()) return');
  const assign = merge.indexOf('this.inspections = snapshot');
  assert.ok(publish >= 0 && assign > publish, 'identity is rechecked before in-memory publication');
});


test('unexpected sync engine errors release current-owner SYNCING items for retry', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const triggerStart = sync.indexOf('  async triggerSync()');
  const errorLog = sync.indexOf("[HDOS Sync] Sync engine error:", triggerStart);
  const start = sync.lastIndexOf('    } catch (error) {', errorLog);
  const end = sync.indexOf('    } finally {', errorLog);
  const catchBlock = sync.slice(start, end);
  assert.match(catchBlock, /activeOwnerAfterError/);
  assert.match(catchBlock, /queued\.status !== 'SYNCING'/);
  assert.match(catchBlock, /queued\.ownerUserId !== owner\.userId/);
  assert.match(catchBlock, /status: 'PENDING' as const/);
  assert.match(catchBlock, /await hdosDB\.put\('queue', recovered\)/);
  assert.match(catchBlock, /hseApi\.authToken === syncToken/);
  assert.ok(catchBlock.lastIndexOf('await hdosDB.put') < catchBlock.indexOf('this.scheduleRetry()'));
});

test('successful sync removes its queue item and local evidence in one atomic transaction', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const cleanupStart = sync.indexOf('// Commit queue acknowledgement and local binary cleanup together.');
  const cleanupEnd = sync.indexOf('this.queue =', cleanupStart);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart);
  const cleanup = sync.slice(cleanupStart, cleanupEnd);
  assert.match(cleanup, /const completedPhotoId/);
  assert.match(cleanup, /await hdosDB\.reconcileSnapshotBundle\(/);
  assert.match(cleanup, /storeName: 'queue', deleteIds: \[item\.id\]/);
  assert.match(cleanup, /storeName: 'photos' as const, deleteIds: \[completedPhotoId\]/);
  assert.doesNotMatch(cleanup, /await hdosDB\.delete\(/);
});

test('unexpected sync recovery clears the interrupted lease timestamp', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const errorLog = sync.indexOf('[HDOS Sync] Sync engine error:');
  const start = sync.lastIndexOf('    } catch (error) {', errorLog);
  const end = sync.indexOf('    } finally {', errorLog);
  const recovery = sync.slice(start, end);
  assert.match(recovery, /status: 'PENDING' as const/);
  assert.match(recovery, /syncStartedAt: undefined/);
  assert.match(recovery, /await hdosDB\.put\('queue', recovered\)/);
});

test('offline sync replays queue by creation time and blocks later writes to a failed record', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  assert.match(sync, /function compareQueueItemsByTime\(a: SyncQueueItem, b: SyncQueueItem\)/);
  assert.match(sync, /storedQueue\.filter\(item => item\.ownerUserId === owner\.userId && item\.ownerCompanyCode === owner\.companyCode\)\.sort\(compareQueueItemsByTime\)/);
  assert.match(sync, /const orderedQueueIds = \[\.\.\.this\.queue\][\s\S]*?\.map\(queued => queued\.id\)/);
  assert.match(sync, /for \(const queuedId of orderedQueueIds\) \{\s*const item = this\.queue\.find\(queued => queued\.id === queuedId\)/);
  assert.match(sync, /const blockedRecordIds = new Set<string>\(\)/);
  assert.match(sync, /if \(itemRecordId && blockedRecordIds\.has\(itemRecordId\)\)/);
  assert.match(sync, /Perubahan ditahan karena sinkronisasi perubahan sebelumnya untuk record ini belum berhasil/);
  assert.match(sync, /if \(itemRecordId\) blockedRecordIds\.add\(itemRecordId\)/);
});


test('a retried update whose first response was lost is accepted without a second write or audit', () => {
  const current = {
    id: 'haz-1',
    title: 'Guardrail repaired',
    status: 'CLOSED',
    riskMatrix: { severity: 2, likelihood: 1 },
    updatedAt: '2026-11-01T10:05:00.000Z'
  };
  const payload = {
    id: 'haz-1',
    title: 'Guardrail repaired',
    status: 'CLOSED',
    riskMatrix: { likelihood: 1, severity: 2 },
    updatedAt: '2026-11-01T10:00:00.000Z'
  };
  let writes = 0;
  let audits = 0;
  const context = {
    ENTITY_SCHEMAS: { hazards: ['id','title','status','riskMatrix','updatedAt'] },
    isObject_: value => value && typeof value === 'object' && !Array.isArray(value),
    getSheet_: () => ({ getRange: () => ({ setValues: () => { writes++; } }) }),
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    findRecordRow_: () => 2,
    parseRow_: () => current,
    isExpectedPicaStateCurrent_: () => true,
    isExpectedRecordVersionCurrent_: (record, expected) => String(record.updatedAt) === String(expected),
    httpError_: (status, message) => Object.assign(new Error(message), {status}),
    buildEntityRow_: (_entity, record) => [record.id,record.title,record.status,record.riskMatrix,record.updatedAt],
    SpreadsheetApp: { flush: () => {} },
    logAudit_: () => { audits++; },
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('areUpdateValuesEqual_', 'isUpdatePayloadAlreadyApplied_') +
    extractFunction('isUpdatePayloadAlreadyApplied_', 'updateRecord_') +
    extractFunction('updateRecord_', 'parseRow_'), context);
  const result = context.updateRecord_('hazards','haz-1',payload,{id:'user-1',roles:['Employee']},{},null,'2026-11-01T10:00:00.000Z');
  assert.equal(result.updatedAt, current.updatedAt);
  assert.equal(writes, 0);
  assert.equal(audits, 0);
  // Nested objects are merged by the backend; a replay with only the
  // submitted subset must still be recognized as already committed.
  assert.equal(context.isUpdatePayloadAlreadyApplied_(current, { riskMatrix: { severity: 2 } }), true);
  assert.equal(context.isUpdatePayloadAlreadyApplied_(current, { riskMatrix: { severity: 3 } }), false);
  assert.equal(context.isUpdatePayloadAlreadyApplied_(current, { riskMatrix: { severity: 2, likelihood: 1, exposure: 5 } }), false);
  assert.throws(
    () => context.updateRecord_('hazards','haz-1',{...payload,status:'OPEN'},{id:'user-1',roles:['Employee']},{},null,'2026-11-01T10:00:00.000Z'),
    error => error.status === 409
  );
});


test('normalized sheet schema migration maps values by header and preserves unknown columns', () => {
  const rows = [
    ['id','payload','status','createdAt','updatedAt','legacyNote'],
    ['haz-1','{"severity":3}','OPEN','2026-11-01T00:00:00.000Z','2026-11-01T01:00:00.000Z','retain-me']
  ];
  const sheet = {
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0].length,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => Array.from({ length: rowCount }, (_, rowOffset) =>
        Array.from({ length: columnCount }, (_, columnOffset) =>
          (rows[row - 1 + rowOffset] || [])[column - 1 + columnOffset] ?? ''
        )
      ),
      setValues: values => values.forEach((newRow, rowOffset) => {
        const targetRow = row - 1 + rowOffset;
        while (rows.length <= targetRow) rows.push([]);
        newRow.forEach((value, columnOffset) => {
          rows[targetRow][column - 1 + columnOffset] = value;
        });
      })
    }),
    setFrozenRows: () => {}
  };
  const context = {
    isLegacySchema_: headers => headers.length === 6 &&
      headers[0] === 'id' && headers[1] === 'code' &&
      headers[2] === 'payload' && headers[3] === 'status' &&
      headers[4] === 'createdAt' && headers[5] === 'updatedAt',
    migrateLegacyEntityRows_: () => { throw new Error('legacy path should not run'); }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('ensureSheetSchema_', 'isLegacySchema_'), context);

  context.ensureSheetSchema_(sheet, ['id','status','createdAt','updatedAt','payload','newField']);

  assert.deepEqual(rows[0], ['id','status','createdAt','updatedAt','payload','newField','legacyNote']);
  assert.equal(rows[1][0], 'haz-1');
  assert.equal(rows[1][1], 'OPEN');
  assert.equal(rows[1][2], '2026-11-01T00:00:00.000Z');
  assert.equal(rows[1][3], '2026-11-01T01:00:00.000Z');
  assert.equal(rows[1][4], '{"severity":3}');
  assert.equal(rows[1][5], '');
  assert.equal(rows[1][6], 'retain-me');
});


test('normalized row parser restores nested Hazard and PICA fields from canonical payload', () => {
  const context = {};
  vm.createContext(context);
  const start = source.indexOf('function parseRowValues_(');
  const end = source.indexOf('function parseRow_(', start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInContext(source.slice(start, end), context);

  const hazard = context.parseRowValues_('hazards',
    ['id', 'severity', 'likelihood', 'riskScore', 'riskLevel', 'payload'],
    ['h-1', 4, 3, 12, 'HIGH', JSON.stringify({ title: 'Guardrail damage', riskMatrix: { severity: 2, likelihood: 2, score: 4, level: 'LOW' } })]
  );
  assert.equal(hazard.title, 'Guardrail damage');
  assert.deepEqual(JSON.parse(JSON.stringify(hazard.riskMatrix)), { severity: 4, likelihood: 3, score: 12, level: 'HIGH' });

  const pica = context.parseRowValues_('picas',
    ['id', 'foremanApproval', 'spvHseApproval', 'kttApproval', 'payload'],
    ['p-1', true, true, false, JSON.stringify({ findingDescription: 'Missing berm', approvalStages: { foreman: false, spvHse: false, ktt: true } })]
  );
  assert.equal(pica.findingDescription, 'Missing berm');
  assert.deepEqual(JSON.parse(JSON.stringify(pica.approvalStages)), { foreman: true, spvHse: true });
});

test('readAll reads the full register once instead of issuing per-row Spreadsheet reads', () => {
  const values = [
    ['id', 'code', 'status', 'payload'],
    ['h-1', 'HAZ-2026-001', 'OPEN', JSON.stringify({ title: 'First hazard' })],
    ['', '', '', ''],
    ['h-2', 'HAZ-2026-002', 'CLOSED', JSON.stringify({ title: 'Second hazard' })]
  ];
  let rangeReads = 0;
  const sheet = {
    getLastRow: () => values.length,
    getLastColumn: () => values[0].length,
    getName: () => 'hazards',
    getRange: () => ({ getValues: () => { rangeReads += 1; return values; } })
  };
  const context = { getSheet_: () => sheet };
  vm.createContext(context);
  const parseStart = source.indexOf('function parseRowValues_(');
  const parseEnd = source.indexOf('function parseRow_(', parseStart + 1);
  const readStart = source.indexOf('function readAll_(');
  const readEnd = source.indexOf('function readOne_(', readStart + 1);
  assert.notEqual(parseStart, -1);
  assert.notEqual(parseEnd, -1);
  assert.notEqual(readStart, -1);
  assert.notEqual(readEnd, -1);
  vm.runInContext(source.slice(parseStart, parseEnd) + source.slice(readStart, readEnd), context);

  const records = context.readAll_('hazards');
  assert.equal(rangeReads, 1);
  assert.equal(records.length, 2);
  assert.equal(records[0].title, 'First hazard');
  assert.equal(records[1].title, 'Second hazard');
});


test('users and companies master setup use safe header-based schema reconciliation', () => {
  const companiesStart = source.indexOf('function setupCompaniesSheet_(ss) {');
  const usersStart = source.indexOf('function setupUsersSheet_(ss) {');
  const dataSetupStart = source.indexOf('function setupDataSheets_(', usersStart);
  assert.notEqual(companiesStart, -1);
  assert.notEqual(usersStart, -1);
  assert.notEqual(dataSetupStart, -1);
  const companiesSetup = source.slice(companiesStart, usersStart);
  const usersSetup = source.slice(usersStart, dataSetupStart);
  assert.match(companiesSetup, /ensureSheetSchema_\(sheet, headers\)/);
  assert.match(usersSetup, /ensureSheetSchema_\(sheet, headers\)/);
  assert.doesNotMatch(companiesSetup, /headers\.forEach\(function\(header, index\)/);
  assert.doesNotMatch(usersSetup, /headers\.forEach\(function\(header, index\)/);
});


test('central database backup is serialized, uniquely named, verified, and audited', () => {
  assert.ok(source.includes('backup_logs: ['));
  const start = source.indexOf('function createDatabaseBackup()');
  const end = source.indexOf('function installDailyDatabaseBackupTrigger()', start);
  assert.ok(start >= 0 && end > start);
  const backup = source.slice(start, end);
  assert.ok(backup.includes('LockService.getScriptLock()'));
  assert.ok(backup.includes('lock.waitLock(30000)'));
  assert.ok(backup.includes('yyyyMMdd_HHmmss_SSS'));
  assert.ok(backup.includes('makeCopy(fileName, folder)'));
  assert.ok(backup.includes('getMimeType() !== MimeType.GOOGLE_SHEETS'));
  assert.ok(backup.includes("'SUCCESS'"));
  assert.ok(backup.includes("'FAILED'"));
  assert.ok(backup.includes('lock.releaseLock()'));
  assert.ok(source.includes('function installDailyDatabaseBackupTrigger()'));
  assert.ok(source.includes('HDOS_BACKUP_FOLDER_ID'));
});



test('database recovery creates a validated isolated copy and never overwrites the live database', () => {
  const start = source.indexOf('function createDatabaseRecoveryCopy(backupFileId)');
  const end = source.indexOf('function installDailyDatabaseBackupTrigger()', start);
  assert.ok(start >= 0 && end > start);
  const recovery = source.slice(start, end);
  assert.ok(recovery.includes("sourceFile.getName().indexOf('CGG_HDOS_DB_BACKUP_') !== 0"));
  assert.ok(recovery.includes('sourceFile.getMimeType() !== MimeType.GOOGLE_SHEETS'));
  assert.ok(recovery.includes("parents.next().getId() === backupFolderId"));
  assert.ok(recovery.includes('sourceFile.makeCopy(recoveryName, folder)'));
  assert.ok(recovery.includes('validateDatabaseSpreadsheet_(recoveredSpreadsheet)'));
  assert.ok(source.includes('function validateDatabaseSpreadsheet_(spreadsheet)'));
  assert.ok(recovery.includes("'RECOVERY_COPY_VERIFIED'"));
  assert.ok(recovery.includes('recoveryFile.setTrashed(true)'));
  assert.ok(recovery.includes('liveDatabaseChanged: false'));
  assert.doesNotMatch(recovery, /setProperty\(['"]HDOS_SPREADSHEET_ID/);
  assert.doesNotMatch(recovery, /deleteSheet\(|clearContents\(|setValues\(/);
});


test('central audit trail is readable only by Admin CGG and returns bounded recent events', () => {
  const routeStart = source.indexOf("if (path === '/api/audit' && method === 'GET')");
  const routeEnd = source.indexOf('// CURRENT USER', routeStart);
  assert.notEqual(routeStart, -1);
  assert.notEqual(routeEnd, -1);
  const route = source.slice(routeStart, routeEnd);
  assert.match(route, /if \(!isAdminCGG_\(user\)\) return error_\(403/);
  assert.match(route, /readRecentAuditLogs_\(500\)/);
  assert.match(source, /function readRecentAuditLogs_\(limit\)/);
  assert.match(source, /lastRow - safeLimit \+ 1/);
  assert.match(route, /email: row\.email/);
  assert.match(route, /details: isObject_\(row\.details\)/);
});


test('incident investigation updates, KTT review, and closure are role- and state-gated', () => {
  const incidentRuleStart = source.indexOf("if (entity === 'incidents') {", source.indexOf('const isPrivilegedEditor') - 7000);
  assert.notEqual(incidentRuleStart, -1);
  const route = source.slice(incidentRuleStart, source.indexOf('const isPrivilegedEditor', incidentRuleStart));
  assert.match(route, /Foreman Safety.*SPV HSE/);
  assert.match(route, /KTT.*SPT.*SPV/);
  assert.match(route, /whys\.filter[\s\S]{0,180}length < 5/);
  assert.match(route, /oldIncidentStatus !== 'REVIEWED_KTT'/);
  assert.match(route, /oldIncidentStatus === 'CLOSED'/);
  assert.match(route, /isKTT/);
});

test('successful sync advances server version for later queued updates of the same record', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  assert.match(syncSource, /serverUpdatedAt/);
  assert.match(syncSource, /queued\.status === 'PENDING'/);
  assert.match(syncSource, /queued\.ownerUserId !== owner\.userId/);
  assert.match(syncSource, /queued\.ownerCompanyCode !== owner\.companyCode/);
  assert.match(syncSource, /this\.queueOwnerKey === requestedOwnerKey/);
  assert.match(syncSource, /versionedQueueItems = persistedQueue\.filter[\s\S]{0,700}updatedAt: serverUpdatedAt/);
  assert.match(syncSource, /await hdosDB\.putBundle\(versionBundle\)/);
  assert.match(syncSource, /versionBundle\.push\(\.\.\.versionedQueueItems\.map/);
  assert.doesNotMatch(syncSource, /hdosDB\.put\(localStoreName, \{ \.\.\.localRecord, updatedAt: serverUpdatedAt \}\)/);
});


test('operational reference codes are year-scoped and unique across client devices', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  assert.match(storeSource, /INS-\$\{new Date\(\)\.getFullYear\(\)\}-\$\{id\.slice\(0, 8\)\.toUpperCase\(\)\}/);
  assert.match(storeSource, /HAZ-\$\{year\}-\$\{id\.slice\(0, 8\)\.toUpperCase\(\)\}/);
  assert.match(storeSource, /INC-\$\{new Date\(\)\.getFullYear\(\)\}-\$\{id\.slice\(0, 8\)\.toUpperCase\(\)\}/);
});

test('a queued update after CREATE inherits the server-created updatedAt version', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  assert.match(syncSource, /hseApi\.create<Record<string, unknown>>/);
  assert.match(syncSource, /serverRecord = await hseApi\.create<Record<string, unknown>>/);
  assert.match(syncSource, /queued\.action === 'UPDATE'/);
  assert.match(syncSource, /updatedAt: serverUpdatedAt/);
});


test('dashboard and repository access follow the registered company master', () => {
  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'DashboardModule.tsx'), 'utf8');
  const repositorySource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'RepositoryModule.tsx'), 'utf8');
  assert.match(dashboardSource, /store\.contractors\.some\(company => company\.code\.toUpperCase\(\) === companyCode/);
  assert.match(dashboardSource, /new Set\(store\.contractors\.flatMap/);
  assert.ok(dashboardSource.includes('recordParent === companyCode'));
  assert.ok(dashboardSource.includes("const isOversight = companyCode === 'CGG'"));
  assert.match(repositorySource, /new Set\(store\.contractors\.flatMap/);
  assert.match(repositorySource, /'KTT', 'SPT', 'SPV', 'Project Manager', 'PJO', 'SPV HSE', 'Foreman Safety'/);
  assert.equal(dashboardSource.includes("['SLS', 'VIP']"), false);
  assert.equal(repositorySource.includes("['SLS', 'VIP']"), false);
});

test('frontend local tenant visibility follows registered contractor scope, not hard-coded SLS/VIP codes', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  assert.match(storeSource, /if \(own === 'CGG' && user\.roleVerified === true && oversightRoles\.some/);
  assert.match(storeSource, /user\?\.roles \|\| \[\]\)\.includes\('Admin CGG'\) \? 'CGG' : ''/);
  assert.match(storeSource, /allowedCompanyCodes: ReadonlySet<string>/);
  assert.match(storeSource, /'KTT', 'SPT', 'SPV', 'Project Manager', 'PJO', 'SPV HSE', 'Foreman Safety'/);
  assert.match(storeSource, /allowedCompanyCodes\.has\(company\)/);
  assert.match(storeSource, /allowedCompanyCodes\.has\(subkon\)/);
  assert.equal(storeSource.includes("['SLS', 'VIP']"), false);
  assert.equal(storeSource.includes('private getAllowedCompanyCodes(): Set<string>'), true);
  assert.equal(storeSource.includes('const allowedCompanyCodes = this.getAllowedCompanyCodes()'), true);
});


test('contractor compliance report validates reporting period and aggregate counts', () => {
  const context = {
    isObject_: value => value !== null && typeof value === 'object' && !Array.isArray(value),
    httpError_: (status, message) => Object.assign(new Error(message), { status })
  };
  vm.createContext(context);
  const start = source.indexOf('function normalizeContractorComplianceReport_(');
  const end = source.indexOf('function canSubmitContractorComplianceReport_(', start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInContext(source.slice(start, end), context);
  const valid = context.normalizeContractorComplianceReport_({
    period: '2026-11', manpowerCount: 120, equipmentCount: 35,
    mcuEligibleCount: 100, mcuFitCount: 96,
    inductionRequiredCount: 120, inductionCompletedCount: 118,
    safeHours: 250000, ltiCount: 0, remarks: 'Rekap bulan November'
  });
  assert.equal(valid.period, '2026-11');
  assert.equal(valid.manpowerCount, 120);
  assert.throws(() => context.normalizeContractorComplianceReport_({
    period: '2026-13', manpowerCount: 1, equipmentCount: 1,
    mcuEligibleCount: 1, mcuFitCount: 1, inductionRequiredCount: 1,
    inductionCompletedCount: 1, safeHours: 1, ltiCount: 0
  }), error => error.status === 400);
  assert.throws(() => context.normalizeContractorComplianceReport_({
    period: '2026-11', manpowerCount: 1, equipmentCount: 1,
    mcuEligibleCount: 2, mcuFitCount: 3, inductionRequiredCount: 1,
    inductionCompletedCount: 1, safeHours: 1, ltiCount: 0
  }), error => error.status === 400);
});

test('contractor compliance report endpoints enforce submit, review, and view roles', () => {
  assert.ok(source.includes("if (path === '/api/contractor/reports' && method === 'GET')"));
  assert.ok(source.includes("if (path === '/api/contractor/reports' && method === 'POST')"));
  assert.ok(source.includes("const contractorReportMatch = path.match(/^\\/api\\/contractor\\/reports\\/([^/]+)$/)"));
  assert.ok(source.includes("['Company Admin', 'Contractor', 'Subkon', 'Contractor PIC']"));
  assert.ok(source.includes("['Foreman Safety', 'SPV HSE'].indexOf(role) >= 0"));
  assert.ok(source.includes("emailDomains: '',"));
  assert.ok(source.includes("contractor_reports: ["));
});


test('Contractor Passport master read is limited to own company hierarchy and redacts provisioning data', () => {
  assert.ok(source.includes("const isCompanyPassportViewer = roles.some(function(role)"));
  assert.ok(source.includes("['Contractor', 'Subkon', 'Contractor PIC'].indexOf(role) >= 0"));
  assert.ok(source.includes("return code === ownCode || Boolean(ownRegistry && ownRegistry.role === 'Contractor'"));
  assert.ok(source.includes("company.role === 'Subkon' && parent === ownCode"));
  assert.ok(source.includes("emailDomains: '',"));
  assert.ok(source.includes("autoProvision: false,"));
});


test('contractor fleet register schema, API, tenant ownership, and input validation are defined', () => {
  assert.ok(source.includes("'contractor_fleet'"));
  assert.ok(source.includes("function createContractorFleetUnit_(payload, user)"));
  assert.ok(source.includes("function updateContractorFleetUnit_(id, payload, user)"));
  assert.ok(source.includes("function normalizeContractorFleetInput_(payload, existing)"));
  assert.ok(source.includes("parentCompanyCode: company.role === 'Subkon' ? String(company.parentCompanyCode || '').trim().toUpperCase() : ''"));
  assert.ok(source.includes("ownCompany !== String(existing.companyCode || '').trim().toUpperCase()"));
  assert.ok(source.includes("path === '/api/contractor/fleet' && method === 'GET'"));

  const context = {
    isObject_: value => value && typeof value === 'object' && !Array.isArray(value),
    httpError_: (status, message) => Object.assign(new Error(message), { status })
  };
  vm.createContext(context);
  const start = source.indexOf('function normalizeContractorFleetInput_(');
  const end = source.indexOf('function createContractorFleetUnit_(', start + 1);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);

  const normalized = context.normalizeContractorFleetInput_({
    unitNumber: 'DT-001',
    unitType: 'Dump Truck',
    brand: 'XCMG',
    model: 'XDE400',
    ownershipType: 'LEASED',
    p2hStatus: 'READY',
    siaExpiry: '2027-05-10'
  });
  assert.equal(normalized.unitNumber, 'DT-001');
  assert.equal(normalized.ownershipType, 'LEASED');
  assert.equal(normalized.p2hStatus, 'READY');
  assert.throws(() => context.normalizeContractorFleetInput_({
    unitNumber: 'DT-002', unitType: 'Dump Truck', ownershipType: 'UNKNOWN',
    p2hStatus: 'READY', siaExpiry: ''
  }), error => error.status === 400);
});


test('contractor fleet input validates unit identity, P2H state, ownership, and SIA expiry', () => {
  const context = {
    isObject_: value => value !== null && typeof value === 'object' && !Array.isArray(value),
    httpError_: (status, message) => Object.assign(new Error(message), { status })
  };
  vm.createContext(context);
  const start = source.indexOf('function normalizeContractorFleetInput_(');
  const end = source.indexOf('function createContractorFleetUnit_(', start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInContext(source.slice(start, end), context);
  const valid = context.normalizeContractorFleetInput_({
    unitNumber: 'DT-001', unitType: 'Dump Truck', brand: 'XCMG',
    model: 'DH400', ownershipType: 'RENTAL', p2hStatus: 'READY',
    siaExpiry: '2027-06-30'
  });
  assert.equal(valid.unitNumber, 'DT-001');
  assert.equal(valid.p2hStatus, 'READY');
  assert.throws(() => context.normalizeContractorFleetInput_({
    unitNumber: 'DT-002', unitType: 'Dump Truck', ownershipType: 'OWNED',
    p2hStatus: 'UNKNOWN', siaExpiry: ''
  }), error => error.status === 400);
  assert.throws(() => context.normalizeContractorFleetInput_({
    unitNumber: 'DT-003', unitType: 'Dump Truck', ownershipType: 'OWNED',
    p2hStatus: 'READY', siaExpiry: '2027-02-31'
  }), error => error.status === 400);
});

test('Contractor SIA preview and replacement cleanup verify the tenant Drive folder', () => {
  assert.match(source, /function isContractorSiaDriveFile_\(file, companyCode\)/);
  assert.match(source, /const expectedFolderId = String\(PropertiesService\.getScriptProperties\(\)\.getProperty\(folderKey\) \|\| ''\)\.trim\(\)/);
  assert.match(source, /if \(!isContractorSiaDriveFile_\(file, unit\.companyCode\)\) return error_\(403/);
  assert.match(source, /if \(isContractorSiaDriveFile_\(oldFile, companyCode\)\) \{\s*oldFile\.setTrashed\(true\)/);
  assert.match(source, /Fail closed: Drive metadata must prove tenant-folder ownership/);
});

test('contractor fleet API applies company-scoped read and write rules', () => {
  assert.ok(source.includes("if (path === '/api/contractor/fleet' && method === 'GET')"));
  assert.ok(source.includes("if (path === '/api/contractor/fleet' && method === 'POST')"));
  assert.ok(source.includes("const contractorFleetMatch = path.match(/^\\/api\\/contractor\\/fleet\\/([^/]+)$/)"));
  assert.ok(source.includes("return isRecordVisibleToUser_(unit, user);"));
  assert.ok(source.includes("String(item.companyCode || '').trim().toUpperCase() === companyCode"));
  assert.ok(source.includes("String(existing.companyCode || '').trim().toUpperCase()"));
  assert.ok(source.includes("logAudit_(user, 'CREATE', 'contractor_fleet'"));
  assert.ok(source.includes('p2hLastCheckedAt: normalized.p2hStatus'));
  assert.ok(source.includes('p2hCheckedBy: normalized.p2hStatus'));
  assert.ok(source.includes("'FLT-' + String(existing.companyCode"));
  assert.ok(source.includes("ownCompany === 'CGG'"));

});


test('verified oversight roles assigned to a contractor tenant do not bypass inactive-company restrictions', () => {
  const context = {
    isAdminCGG_: () => false,
    isCompanyScopedRole_: () => true,
    isOversightRole_: user => (user.roles || []).includes('Foreman Safety'),
    findCompanyRegistry_: () => ({ status: 'INACTIVE', role: 'Contractor', parentCompanyCode: '' }),
    getSheet_: () => ({ getDataRange: () => ({ getValues: () => [
      ['companyCode','companyName','role','parentCompanyCode','emailDomains','autoProvision','status'],
      ['SLS','PT SLS','Contractor','','','FALSE','INACTIVE']
    ]}) })
  };
  vm.createContext(context);
  const start = source.indexOf('function getOversightCompanyCodes_(');
  const end = source.indexOf('function requiresRoleVerification_(', start + 1);
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.isRecordVisibleToUser_({companyCode:'SLS'}, {
    roles:['Foreman Safety'], companyCode:'SLS', roleVerified:true
  }), false);
});

test('successful HTTP responses with unreadable bodies are classified as retryable gateway failures', () => {
  const apiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'api.ts'), 'utf8');
  assert.match(apiSource, /throw new ApiError\(\s*0,/);
  assert.match(apiSource, /response\.ok \? 502 : \(response\.status \|\| 502\)/);
  assert.match(apiSource, /body\?\.status \|\|\s*\(response\.ok \? 502 : \(response\.status \|\| 500\)\)/);
  assert.match(apiSource, /idempotent CREATE/);
});

test('P2H idempotency helper accepts exact replay and rejects changed inspection data', () => {
  const start = source.indexOf('function isSameContractorP2HRequest_(');
  const end = source.indexOf('function createContractorP2HRecord_(', start);
  assert.ok(start >= 0 && end > start);
  const helper = vm.runInNewContext('(' + source.slice(start, end).trim() + ')');
  const original = {
    fleetId: 'fleet-01', companyCode: 'SLS', inspectionDate: '2026-11-09',
    status: 'NOT_READY', hourMeter: 1234, operatorName: 'Operator A',
    findings: 'Rem bermasalah', correctiveAction: 'Hentikan unit dan perbaiki',
    photoFileId: 'photo123456789', photoFileName: 'p2h.jpg', photoMimeType: 'image/jpeg'
  };
  assert.equal(helper(original, { ...original, companyCode: 'sls', status: 'not_ready', photoMimeType: 'IMAGE/JPEG' }), true);
  assert.equal(helper(original, { ...original, findings: 'Temuan diubah' }), false);
  assert.equal(helper(original, { ...original, fleetId: 'fleet-02' }), false);
  assert.equal(helper(original, { ...original, photoFileId: 'photo987654321' }), false);
  assert.equal(helper(original, { ...original, hourMeter: 1235 }), false);
});

test('P2H submission uses a stable request key and backend idempotency', () => {
  assert.match(p2hUiSource, /const requestId = p2hRequestId \|\|/);
  assert.match(p2hUiSource, /await hdosSync\.enqueue\(\{/);
  assert.match(p2hUiSource, /setP2hRequestId\(''\)/);
  assert.match(source, /const requestId = String\(input\.requestId \|\| ''\)\.trim\(\)/);
  assert.match(source, /const existingRequestRow = findRecordRow_\(historySheet, requestId\)/);
  assert.match(source, /const sameRequest = isSameContractorP2HRequest_\(existingRequest, \{/);
  assert.match(source, /if \(!sameRequest\) return error_\(409/);
  assert.match(source, /function isSameContractorP2HRequest_\(existing, requested\)/);
  assert.match(source, /if \(!sameRequest\) return error_\(409/);
  const offlinePhotoSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'offline-photos.ts'), 'utf8');
  assert.match(offlinePhotoSource, /uploadKey: `hdos-\$\{photo\.id\}`/);
  assert.match(p2hUiSource, /saveOfflineOperationalPhoto\(file\)/);
  assert.match(p2hUiSource, /localPhotoId: p2hLocalPhotoId \|\| undefined/);
  assert.match(p2hUiSource, /capture="environment"/);
  assert.match(syncEngineSource, /hdosDB\.delete\('photos', String\(\(item\.payload as Record<string, unknown>\)\.localPhotoId\)\)/);
  assert.doesNotMatch(p2hUiSource, /p2hPhotoFile && !p2hPhotoReference/);
  assert.match(p2hUiSource, /photoReference: p2hPhotoReference/);
  assert.match(p2hUiSource, /setP2hPhotoReference\(null\)/);
  assert.match(source, /id: requestId, code: 'P2H-'/);
});

test('Sync queue displays readable descriptions for Contractor P2H and monthly reports', () => {
  assert.match(syncUiSource, /Laporan kepatuhan periode/);
  assert.match(syncUiSource, /P2H \$\{unit\}/);
  assert.match(p2hUiSource, /unitNumber: unit\.unitNumber/);
});

test('Contractor fleet register and P2H history use tenant-scoped offline caches', () => {
  assert.match(p2hUiSource, /contractor-fleet-cache:\$\{sessionUser\.id\}:\$\{ownCompanyCode\}/);
  assert.match(p2hUiSource, /contractor-p2h-history:\$\{sessionUser\.id\}:\$\{ownCompanyCode\}:\$\{unit\.id\}/);
  assert.match(p2hUiSource, /ownerUserId === String\(sessionUser\?\.id \|\| ''\)/);
  assert.match(p2hUiSource, /ownerCompanyCode === ownCompanyCode/);
  assert.match(p2hUiSource, /Register fleet ditampilkan dari cache perangkat/);
  assert.match(p2hUiSource, /Riwayat P2H ditampilkan dari cache perangkat/);
});

test('Contractor monthly compliance reports enter the offline queue and replay through the report endpoint', () => {
  assert.match(p2hUiSource, /entity: 'contractor-report'/);
  assert.match(p2hUiSource, /contractor-report:\$\{requestId\}/);
  assert.match(p2hUiSource, /tersimpan di perangkat dan akan dikirim otomatis saat koneksi kembali/);
  assert.match(syncEngineSource, /case 'contractor-report':[\s\S]*?return 'contractor-report'/);
  assert.match(syncEngineSource, /submitContractorComplianceReport\(payload\.input/);
  assert.match(syncEngineSource, /Antrean Contractor hanya mendukung operasi CREATE/);
});

test('Contractor P2H submissions enter the owner-scoped offline queue and replay with photo evidence', () => {
  assert.match(p2hUiSource, /hdosSync\.enqueue\([\s\S]*?entity: 'contractor'/);
  assert.match(p2hUiSource, /fleetId: unit\.id,[\s\S]*?input:[\s\S]*?requestId,[\s\S]*?localPhotoId: p2hLocalPhotoId \|\| undefined/);
  assert.match(p2hUiSource, /tersimpan di antrean offline perangkat/);
  assert.match(syncEngineSource, /case 'contractor':[\s\S]*?return 'contractor-p2h'/);
  assert.match(syncEngineSource, /createContractorP2HRecord\(payload\.fleetId, input/);
  assert.match(syncEngineSource, /uploadOfflineOperationalPhoto\(localPhoto\)/);
});

test('Contractor P2H and compliance report drafts persist locally with tenant ownership', () => {
  assert.match(p2hUiSource, /contractor-p2h-draft:/);
  assert.match(p2hUiSource, /getById<\{id:string;ownerUserId:string;ownerCompanyCode:string;draft:ContractorP2HInput/);
  assert.match(p2hUiSource, /ownerUserId === draftOwner\.ownerUserId && saved\.ownerCompanyCode === draftOwner\.ownerCompanyCode/);
  assert.match(p2hUiSource, /hdosDB\.put\('contractor', \{ id: p2hDraftKey/);
  assert.match(p2hUiSource, /localPhotoId: p2hLocalPhotoId \|\| undefined/);
  assert.match(p2hUiSource, /loadedP2HDraftKey\.current !== p2hDraftKey/);
  assert.match(p2hUiSource, /contractor-report-draft:/);
  assert.match(p2hUiSource, /hdosDB\.put\('contractor', \{ id: reportDraftKey/);
  assert.match(p2hUiSource, /hdosDB\.delete\('contractor', p2hDraftKey\)/);
});

test('Contractor fleet refresh and P2H history ignore responses from a previous tenant session', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'ContractorModule.tsx'), 'utf8');
  assert.match(moduleSource, /const isCurrentSessionScope = \(scopeKey: string\) =>/);
  assert.match(moduleSource, /const units = await hseApi\.listContractorFleet\(\);[\s\S]*?if \(!isCurrentSessionScope\(requestScope\)\) return;[\s\S]*?setFleetUnits\(units\)/);
  assert.match(moduleSource, /const history = await hseApi\.listContractorP2HHistory\(unit\.id\);[\s\S]*?if \(!isCurrentSessionScope\(requestScope\)\) return;[\s\S]*?setP2hHistory\(history\)/);
  assert.match(moduleSource, /if \(isCurrentSessionScope\(requestScope\)\) setP2hLoading\(false\)/);
});

test('Contractor SIA/photo previews and compliance refresh ignore stale tenant responses', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'ContractorModule.tsx'), 'utf8');
  const siaPreviewStart = moduleSource.indexOf('const previewSiaDocument = async');
  const photoPreviewStart = moduleSource.indexOf('const openP2HPhoto = async');
  const reportsRefreshStart = moduleSource.indexOf('const refreshComplianceReports = async');
  assert.ok(siaPreviewStart >= 0 && photoPreviewStart > siaPreviewStart && reportsRefreshStart > photoPreviewStart);
  const siaPreview = moduleSource.slice(siaPreviewStart, photoPreviewStart);
  const photoPreview = moduleSource.slice(photoPreviewStart, reportsRefreshStart);
  const reportsRefresh = moduleSource.slice(reportsRefreshStart, moduleSource.indexOf('const submitComplianceReport = async', reportsRefreshStart));
  assert.ok(siaPreview.includes('const requestScope = sessionScopeKey;'));
  assert.ok(siaPreview.includes('if (!isCurrentSessionScope(requestScope)) return;'));
  assert.ok(photoPreview.includes('const requestScope = sessionScopeKey;'));
  assert.ok(photoPreview.includes('if (!isCurrentSessionScope(requestScope)) return;'));
  assert.ok(reportsRefresh.includes('const reports = await hseApi.listContractorComplianceReports();'));
  assert.ok(reportsRefresh.includes('if (isCurrentSessionScope(requestScope)) setComplianceReports(reports);'));
  assert.ok(reportsRefresh.includes('if (isCurrentSessionScope(requestScope)) setReportsLoading(false);'));
});

test('Sync initialization revalidates tenant after asynchronous queue recovery before publishing', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  assert.match(syncSource, /const abandonStaleInitialization = \(\): boolean =>/);
  assert.match(syncSource, /initGeneration !== this\.initGeneration \|\| this\.queueOwnerKey !== requestedOwnerKey/);
  assert.match(syncSource, /if \(initGeneration === this\.initGeneration && this\.queueOwnerKey === requestedOwnerKey\) \{\s*this\.queue = \[\];\s*this\.queueOwnerKey = '';\s*hdosEvents\.emit\('sync:queue_updated', \[\]\);/);
  const emit = syncSource.indexOf("hdosEvents.emit('sync:queue_updated', [...this.queue]);");
  assert.ok(syncSource.lastIndexOf('if (abandonStaleInitialization()) return;', emit) < emit);
});

test('Contractor Passport clears tenant-scoped registers and ignores stale responses on account changes', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'ContractorModule.tsx'), 'utf8');
  assert.match(moduleSource, /const sessionScopeKey = sessionUser/);
  assert.match(moduleSource, /setComplianceReports\(\[\]\);[\s\S]*?\}, \[sessionScopeKey\]\);/);
  assert.match(moduleSource, /setFleetUnits\(\[\]\);[\s\S]*?setP2hHistory\(\[\]\);[\s\S]*?\}, \[sessionScopeKey\]\);/);
  assert.match(moduleSource, /if \(active\) setComplianceReports\(reports\)/);
  assert.match(moduleSource, /if \(active\) setFleetUnits\(units\)/);
});

test('Contractor write operations suppress stale tenant UI updates after account changes', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'ContractorModule.tsx'), 'utf8');
  const blocks = [
    ['uploadSiaDocument', 'const previewSiaDocument = async'],
    ['submitP2HRecord', 'const submitFleetUnit = async'],
    ['submitFleetUnit', 'const updateFleetUnit = async'],
    ['updateFleetUnit', 'const refreshComplianceReports = async'],
    ['submitComplianceReport', 'const reviewComplianceReport = async'],
    ['reviewComplianceReport', 'const startReportCorrection =']
  ];
  for (const [name, nextName] of blocks) {
    const start = moduleSource.indexOf(`const ${name} = async`);
    const end = moduleSource.indexOf(nextName, start + 1);
    assert.ok(start >= 0 && end > start, `missing function block: ${name}`);
    const block = moduleSource.slice(start, end);
    assert.ok(block.includes('const requestScope = sessionScopeKey;'), `${name} must capture its session scope`);
    assert.ok(block.includes('if (isCurrentSessionScope(requestScope))'), `${name} must guard state updates`);
  }
  const p2hBlock = moduleSource.slice(moduleSource.indexOf('const submitP2HRecord = async'), moduleSource.indexOf('const submitFleetUnit = async'));
  assert.ok(p2hBlock.includes('if (!isCurrentSessionScope(requestScope)) return;'), 'P2H must stop between photo upload and record creation when the session changes');
});

test('Manual sync retry revalidates tenant after asynchronous IndexedDB persistence', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const start = syncSource.indexOf('async retryFailedItems()');
  const end = syncSource.indexOf('async triggerSync()', start);
  assert.ok(start >= 0 && end > start);
  const retryBlock = syncSource.slice(start, end);
  const writeIndex = retryBlock.indexOf("await hdosDB.put('queue', item);");
  const recheckIndex = retryBlock.indexOf('const ownerAfterWrite = this.getCurrentOwner();', writeIndex);
  const publishIndex = retryBlock.indexOf('this.queue = this.queue.map', writeIndex);
  assert.ok(writeIndex >= 0 && recheckIndex > writeIndex && publishIndex > recheckIndex);
  assert.ok(retryBlock.slice(recheckIndex, publishIndex).includes('this.queueOwnerKey !== ownerKey'));
});

test('Overlapping sync initialization cannot let an older IndexedDB read clear a newer tenant snapshot', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  assert.match(syncSource, /private initGeneration = 0;/);
  assert.ok(syncSource.includes('const initGeneration = ++this.initGeneration;'));
  const initStart = syncSource.indexOf('async init(): Promise<void>');
  const initEnd = syncSource.indexOf('getIsOnline(): boolean', initStart);
  assert.ok(initStart >= 0 && initEnd > initStart);
  const initBlock = syncSource.slice(initStart, initEnd);
  const queueRead = initBlock.indexOf("storedQueue = await hdosDB.getAll<SyncQueueItem>('queue')");
  const queuePublish = initBlock.indexOf("hdosEvents.emit('sync:queue_updated', [...this.queue]);");
  assert.ok(queueRead >= 0 && initBlock.indexOf('if (abandonStaleInitialization()) return;', queueRead) > queueRead);
  assert.ok(initBlock.lastIndexOf('if (abandonStaleInitialization()) return;', queuePublish) < queuePublish);
});


test('Frontend module access and PICA approval helper match server-enforced roles', () => {
  const authSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'auth.ts'), 'utf8');
  const policySource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'access-policy.ts'), 'utf8');
  assert.ok(authSource.includes("return canAccessModule(sessionUser, moduleName as import('./access-policy').HDOSModule);"));
  const picaApprovalStart = authSource.indexOf('canApprovePICA(): boolean {');
  const picaApprovalEnd = authSource.indexOf('\n  }', picaApprovalStart);
  assert.ok(picaApprovalStart >= 0 && picaApprovalEnd > picaApprovalStart);
  const picaApproval = authSource.slice(picaApprovalStart, picaApprovalEnd);
  assert.match(picaApproval, /user\.roleVerified !== true/);
  assert.match(picaApproval, /role === 'Foreman Safety' \|\| role === 'SPV HSE'/);
  const executablePicaApproval = picaApproval.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(executablePicaApproval, /Admin CGG|KTT|Project Manager|PJO/);
  assert.ok(policySource.includes("if (requiresRoleVerification(user) && user.roleVerified !== true)"));
  assert.ok(policySource.includes("if (roles.includes('Employee'))"));
});


test('CGG self-registration is restricted to approved domains or exact allowlisted emails', () => {
  const gasSource = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const start = gasSource.indexOf('function isCggEmailAllowed_(email, companyCode) {');
  const end = gasSource.indexOf('function appendUniqueUser_', start);
  assert.ok(start >= 0 && end > start);
  const block = gasSource.slice(start, end);
  assert.ok(block.includes("properties.getProperty('CGG_EMAIL_DOMAINS')"));
  assert.ok(block.includes("properties.getProperty('CGG_ALLOWED_EMAILS')"));
  assert.ok(block.includes("properties.getProperty('CGG_EMAIL_DOMAINS')"));
  assert.ok(block.includes("domains.indexOf(emailDomain) >= 0 || allowlist.indexOf(normalizedEmail) >= 0"));
  assert.ok(block.includes("if (String(companyCode || '').trim().toUpperCase() !== 'CGG') return true;"));
});


test('GAS readiness validates required sheet headers without exposing configuration secrets', () => {
  assert.ok(source.includes("if (path === '/api/health/ready' && method === 'GET')"));
  const properties = {
    HDOS_SPREADSHEET_ID: 'test-sheet-id',
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    CGG_EMAIL_DOMAINS: 'cgg.example',
    CGG_ALLOWED_EMAILS: ''
  };
  const requiredSheets = ['users','companies','locations','forms','inspections','hazards','picas','incidents','audit_logs','backup_logs','contractor_reports','contractor_fleet','contractor_p2h_history','repository'];
  const headersBySheet = {
    users: ['id','email','password','displayName','role','status','passwordHash','passwordSalt','googleSub','companyCode','parentCompanyCode','position','department','section','roleVerified'],
    companies: ['companyCode','companyName','role','parentCompanyCode','emailDomains','autoProvision','status','passportStatus','picName','picContact','safetyPassportExpiry']
  };
  const schemaNames = ['locations','repository','forms','hazards','picas','inspections','incidents','audit_logs','backup_logs','contractor_reports','contractor_fleet','contractor_p2h_history'];
  schemaNames.forEach(name => {
    const match = source.match(new RegExp('\\b' + name + ': \\[([\\s\\S]*?)\\]'));
    assert.ok(match, 'schema exists for ' + name);
    headersBySheet[name] = Array.from(match[1].matchAll(/'([^']+)'/g), item => item[1]);
  });
  const sheets = {};
  requiredSheets.forEach(name => {
    sheets[name] = {
      getLastColumn: () => headersBySheet[name].length,
      getRange: () => ({ getValues: () => [headersBySheet[name]] })
    };
  });
  const context = {
    CONFIG: { SPREADSHEET_ID: '', SHEETS: requiredSheets.slice(0, -1) },
    ENTITY_SCHEMAS: Object.fromEntries(schemaNames.map(name => [name, headersBySheet[name]])),
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? null }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => sheets[name] || null }) },
    success_: data => ({ success: true, data }),
    error_: (status, message) => ({ success: false, status, message })
  };
  vm.createContext(context);
  const validatorStart = source.indexOf('function validateDatabaseSpreadsheet_(spreadsheet) {');
  const validatorEnd = source.indexOf('function getHealthReadiness_()', validatorStart + 1);
  const helperStart = source.indexOf('function getHealthReadiness_() {');
  const helperEnd = source.indexOf('function getSpreadsheet_()', helperStart + 1);
  assert.ok(validatorStart >= 0 && validatorEnd > validatorStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  vm.runInContext(source.slice(validatorStart, validatorEnd) + source.slice(helperStart, helperEnd), context);
  const ready = context.getHealthReadiness_();
  assert.equal(ready.success, true);
  assert.equal(ready.data.status, 'ready');
  assert.deepEqual(JSON.parse(JSON.stringify(ready.data.checks)), {
    spreadsheetAccessible: true,
    schemaReady: true,
    googleOAuthConfigured: true,
    cggRegistrationPolicyConfigured: true,
    missingSheetCount: 0,
    invalidSchemaSheetCount: 0
  });
  assert.equal(JSON.stringify(ready).includes('test-sheet-id'), false);
  assert.equal(JSON.stringify(ready).includes('test-client.apps'), false);

  headersBySheet.hazards = headersBySheet.hazards.filter(header => header !== 'riskScore');
  const invalidSchema = context.getHealthReadiness_();
  assert.equal(invalidSchema.data.status, 'not_ready');
  assert.equal(invalidSchema.data.checks.schemaReady, false);
  assert.equal(invalidSchema.data.checks.invalidSchemaSheetCount, 1);

  sheets.hazards = null;
  const missingSheet = context.getHealthReadiness_();
  assert.equal(missingSheet.data.status, 'not_ready');
  assert.equal(missingSheet.data.checks.missingSheetCount, 1);
  assert.equal(missingSheet.data.checks.invalidSchemaSheetCount, 0);

  properties.CGG_EMAIL_DOMAINS = '';
  properties.CGG_ALLOWED_EMAILS = '';
  const notReady = context.getHealthReadiness_();
  assert.equal(notReady.data.status, 'not_ready');
  assert.equal(notReady.data.checks.cggRegistrationPolicyConfigured, false);
});


test('browser authentication token and cached user profile are scoped to the current tab session', () => {
  const apiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'api.ts'), 'utf8');
  const authStateSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'auth-state.ts'), 'utf8');
  assert.match(apiSource, /window\.sessionStorage\.getItem\(\s*TOKEN_KEY\s*\)/);
  assert.match(apiSource, /window\.sessionStorage\.setItem\(\s*TOKEN_KEY/);
  assert.match(apiSource, /window\.sessionStorage\.removeItem\(\s*TOKEN_KEY/);
  assert.doesNotMatch(apiSource, /window\.localStorage\.(?:getItem|setItem|removeItem)\(\s*TOKEN_KEY/);
  assert.match(authStateSource, /sessionStorage\.setItem\('hdos_current_user'/);
  assert.match(authStateSource, /sessionStorage\.getItem\('hdos_current_user'/);
  assert.match(authStateSource, /sessionStorage\.removeItem\('hdos_current_user'/);
  assert.doesNotMatch(authStateSource, /localStorage\.(?:getItem|setItem|removeItem)\('hdos_current_user'/);
});


test('login attempt reservation atomically checks and increments the five-minute limit', () => {
  const reserve = extractFunction('reserveLoginAttempt_', 'clearLoginFailures_');
  assert.match(reserve, /LockService\.getScriptLock\(\)/);
  assert.match(reserve, /lock\.waitLock\(5000\)/);
  assert.match(reserve, /attempts >= 10/);
  assert.match(reserve, /cache\.put\(key, String\(attempts \+ 1\), 300\)/);
  assert.match(reserve, /lock\.releaseLock\(\)/);
  const loginStart = source.indexOf('function login_(payload)');
  const loginEnd = source.indexOf('function register_(payload)', loginStart);
  const login = source.slice(loginStart, loginEnd);
  assert.match(login, /reserveLoginAttempt_\(email\)/);
  assert.doesNotMatch(login, /isLoginRateLimited_|recordLoginFailure_/);
});

test('Concurrent operational CREATE allocates row-dependent codes inside the Script Lock', () => {
  const start = source.indexOf('function createRecord_(');
  const end = source.indexOf('function isExpectedPicaStateCurrent_(', start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const create = source.slice(start, end);
  const lockStart = create.indexOf('lock.waitLock(');
  const rowAllocation = create.indexOf('const rowNum = sheet.getLastRow()');
  const codeAllocation = create.indexOf('buildEntityCode_(entity, rowNum)');
  const append = create.indexOf('sheet.appendRow(');
  assert.ok(lockStart >= 0 && rowAllocation > lockStart);
  assert.ok(codeAllocation > rowAllocation);
  assert.ok(append > codeAllocation);
  assert.ok(create.indexOf('getExistingRecordForCreate_(sheet, id, user)') < rowAllocation);
  assert.ok(create.indexOf('getExistingRecordForCreate_(sheet, id, user)', create.indexOf('lock.waitLock(')) > lockStart);
});


test('PICA approval stages must follow Foreman → SPV HSE sequence', () => {
  const context = {};
  vm.createContext(context);
  const start = source.indexOf('function isPicaApprovalSequenceValid_(');
  const end = source.indexOf('function enforcePicaClosureRules_(', start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInContext(source.slice(start, end), context);

  const valid = context.isPicaApprovalSequenceValid_;
  assert.equal(valid({ foreman: false, spvHse: false, ktt: false }, 'foreman'), true);
  assert.equal(valid({ foreman: false, spvHse: true, ktt: false }, 'spvHse'), false);
  assert.equal(valid({ foreman: true, spvHse: false }, 'spvHse'), true);
  assert.equal(valid({ foreman: true, spvHse: true }, 'spvHse'), true);
  assert.equal(valid({ foreman: true, spvHse: true }, 'ktt'), false);
  assert.equal(valid({ foreman: true, spvHse: true }, 'unknown'), false);
});


test('PICA approval updates enforce verified role, one stage at a time, and strict sequence', () => {
  const context = {
    isObject_: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    error_: (status, message) => ({ status, message })
  };
  vm.createContext(context);
  const start = source.indexOf('function enforcePicaApprovalStageRules_(');
  const end = source.indexOf('function enforcePicaClosureRules_(', start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInContext(source.slice(start, end), context);
  const enforce = context.enforcePicaApprovalStageRules_;

  const base = { status: 'WAITING_HSE', approvalStages: { foreman: false, spvHse: false } };
  const foreman = { roles: ['Foreman Safety'], roleVerified: true };
  const spv = { roles: ['SPV HSE'], roleVerified: true };
  const ktt = { roles: ['KTT'], roleVerified: true };
  const admin = { roles: ['Admin CGG'], roleVerified: true };

  assert.equal(enforce(base, { approvalStages: { foreman: true } }, foreman), null);
  assert.equal(enforce(base, { approvalStages: { spvHse: true } }, spv).status, 409);
  assert.equal(enforce(base, { approvalStages: { foreman: true } }, spv).status, 403);
  assert.equal(enforce(base, { approvalStages: { foreman: true } }, { roles: ['Foreman Safety'], roleVerified: false }).status, 403);
  assert.equal(enforce(base, { approvalStages: { foreman: true, spvHse: true } }, foreman).status, 403);
  assert.equal(enforce(base, { approvalStages: { foreman: true } }, admin).status, 403);
  assert.equal(enforce(base, { approvalStages: { ktt: true } }, ktt).status, 400);
  assert.equal(enforce({ ...base, approvalStages: { foreman: true } }, { approvalStages: { foreman: true, spvHse: true } }, spv), null);
  assert.equal(enforce(base, { approvalStages: { ktt: true } }, ktt).status, 400);
  assert.equal(enforce({ ...base, approvalStages: { foreman: true } }, { approvalStages: { foreman: false } }, foreman).status, 403);
  assert.equal(enforce(base, { approvalStages: [] }, foreman).status, 400);
  assert.equal(enforce({ ...base, status: 'OPEN' }, { approvalStages: { foreman: true } }, foreman).status, 409);
});


test('PICA closure rules reject unauthorized, incomplete, and invalid status transitions', () => {
  const context = {
    error_: (status, message) => ({ status, message }),
    Utilities: { formatDate: () => '2026-11-09' },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta' }
  };
  vm.createContext(context);
  const start = source.indexOf('function enforcePicaClosureRules_(');
  const end = source.indexOf('function ', start + 12);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInContext(source.slice(start, end), context);
  const enforce = context.enforcePicaClosureRules_;

  const pic = { email: 'pic@example.test', roles: ['Employee'], roleVerified: false };
  const foreman = { email: 'foreman@example.test', displayName: 'Foreman', roles: ['Foreman Safety'], roleVerified: true };
  const pica = { status: 'OPEN', assignedToEmail: 'pic@example.test', correctiveAction: '', evidencePhotoUrl: '', evidencePhotoFileId: '', approvalStages: { foreman: false, spvHse: false, ktt: false } };

  assert.equal(enforce({ ...pica, status: 'CLOSED' }, { status: 'PROGRESS' }, pic).status, 403);
  assert.equal(enforce(pica, { completionDate: '2026-11-09' }, pic).status, 403);
  assert.equal(enforce(pica, { status: 'WAITING_HSE' }, { ...pic, email: 'other@example.test' }).status, 403);
  assert.equal(enforce(pica, { status: 'WAITING_HSE' }, pic).status, 400);
  assert.equal(enforce({ ...pica, correctiveAction: 'Perbaikan dilakukan' }, { status: 'WAITING_HSE' }, pic).status, 400);
  assert.equal(enforce(pica, { status: 'CLOSED' }, foreman).status, 409);
  assert.equal(enforce({ ...pica, status: 'WAITING_HSE' }, { status: 'CLOSED' }, { ...foreman, roleVerified: false }).status, 403);
  assert.equal(enforce({ ...pica, status: 'WAITING_HSE' }, { status: 'CLOSED' }, foreman).status, 409);
  assert.equal(enforce({ ...pica, status: 'WAITING_HSE', approvalStages: { foreman: true, spvHse: true, ktt: true } }, { status: 'CLOSED' }, foreman), null);
  assert.equal(enforce({ ...pica, status: 'WAITING_HSE', approvalStages: { foreman: true } }, { status: 'PROGRESS', rejectionReason: 'Perlu perbaikan' }, foreman).status, 409);
  assert.equal(enforce({ ...pica, status: 'WAITING_HSE' }, { status: 'PROGRESS' }, foreman).status, 400);
  assert.equal(enforce(pica, { status: 'NOT_A_STATUS' }, pic).status, 400);
});

test('PICA two-stage approval is required before final HSE closure', () => {
  assert.ok(source.includes("const approvalStages = existingRecord.approvalStages || {};\n    if (approvalStages.foreman !== true || approvalStages.spvHse !== true)"));
  assert.ok(source.includes("PICA tidak dapat dikembalikan setelah proses persetujuan dimulai."));
  assert.ok(source.includes("Persetujuan PICA hanya dapat dilakukan setelah PIC mengajukan penyelesaian."));
  assert.ok(source.includes("const requiredRole = stageKey === 'foreman' ? 'Foreman Safety' : 'SPV HSE';"));
  assert.ok(source.includes("roles.indexOf(requiredRole) < 0"));
});

test('PICA close action requires only Foreman Safety and SPV HSE approvals', () => {
  assert.match(picaUiSource, /approvalStagesFor\(selectedPica\)\.foreman\s*&&\s*approvalStagesFor\(selectedPica\)\.spvHse\s*\?/);
  assert.doesNotMatch(picaUiSource, /approvalStagesFor\(selectedPica\)\.ktt/);
  assert.match(picaUiSource, /Penutupan memerlukan persetujuan berurutan Foreman Safety dan SPV HSE/);
  assert.match(picaStoreSource, /approvalStages: current\.approvalStages \|\| \{ foreman: false, spvHse: false \}/);
  assert.match(picaStoreSource, /if \(currentStages\.foreman !== true \|\| currentStages\.spvHse !== true\)/);
  assert.match(picaStoreSource, /const requiredRole = stage === 'foreman' \? 'Foreman Safety' : 'SPV HSE'/);
  assert.match(picaStoreSource, /Satu permintaan hanya boleh menyetujui satu tahapan yang belum disetujui/);
  assert.match(picaStoreSource, /PICA tidak dapat dikembalikan setelah proses persetujuan dimulai/);
});


test('sync refreshes persisted tenant queue after acquiring the cross-tab lock', () => {
  assert.match(syncEngineSource, /if \(!lock\) \{[\s\S]*?this\.scheduleRetry\(\);[\s\S]*?return false;/);
  assert.match(syncEngineSource, /const persistedQueue = await hdosDB\.getAll<SyncQueueItem>\('queue'\)/);
  assert.match(syncEngineSource, /const ownerAfterQueueRead = this\.getCurrentOwner\(\)/);
  assert.match(syncEngineSource, /this\.queue = persistedQueue\.filter\(item =>/);
  assert.match(syncEngineSource, /hseApi\.authToken !== syncToken/);
});

test('sync safely defers when persisted queue cannot be read', () => {
  assert.match(syncEngineSource, /let persistedQueue: SyncQueueItem\[\]/);
  assert.match(syncEngineSource, /try \{\s*persistedQueue = await hdosDB\.getAll<SyncQueueItem>\('queue'\);\s*\} catch \(error\) \{/);
  assert.match(syncEngineSource, /Antrean lokal gagal dibaca/);
  assert.match(syncEngineSource, /this\.scheduleRetry\(\);\s*return false;/);
});

test('unresolved conflict items are not replayed by an unrelated sync trigger', () => {
  assert.match(syncEngineSource, /if \(item\.status === 'CONFLICT'\) \{[\s\S]*?blockedRecordIds\.add\(itemRecordId\);[\s\S]*?continue;/);
});

test('sync recovery does not reset another tab active lease and timestamps each attempt', () => {
  assert.match(syncEngineSource, /navigator\.locks\.request\(\s*recoveryLockName/);
  assert.match(syncEngineSource, /\{ mode: 'exclusive', ifAvailable: true \}/);
  assert.match(syncEngineSource, /if \(lock && !abandonStaleInitialization\(\)\) await recoverInterruptedQueue\(\)/);
  assert.match(syncEngineSource, /Date\.now\(\) - 2 \* 60 \* 1000/);
  assert.match(syncEngineSource, /item\.syncStartedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(syncEngineSource, /item\.ownerUserId !== owner\?\.userId/);
  assert.match(syncTypesSource, /syncStartedAt\?: string/);
});


test('server version propagation commits local record and follow-up queue updates atomically', () => {
  const createStart = syncEngineSource.indexOf("item.action === 'CREATE'");
  const updateStart = syncEngineSource.indexOf("item.action === 'UPDATE'", createStart);
  const deleteStart = syncEngineSource.indexOf("item.action === 'DELETE'", updateStart);
  assert.ok(createStart >= 0 && updateStart > createStart && deleteStart > updateStart);
  const createBlock = syncEngineSource.slice(createStart, updateStart);
  const updateBlock = syncEngineSource.slice(updateStart, deleteStart);
  for (const block of [createBlock, updateBlock]) {
    assert.match(block, /const versionBundle:/);
    assert.match(block, /versionBundle\.push\(\.\.\.versionedQueueItems\.map/);
    assert.match(block, /await hdosDB\.putBundle\(versionBundle\)/);
    assert.doesNotMatch(block, /await hdosDB\.put\(/);
  }
  assert.match(syncDbSource, /const tx = db\.transaction\(storeNames, 'readwrite'\)/);
});


test('overlapping cloud reconciliation ignores superseded snapshots before cache mutation and publication', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  assert.match(storeSource, /private cloudMergeGeneration = new Map<'inspections' \| 'hazards' \| 'picas' \| 'incidents', number>\(\)/);
  const start = storeSource.indexOf('async mergeCloudOperationalRecords(');
  const end = storeSource.indexOf('async refreshCloudData()', start);
  assert.ok(start >= 0 && end > start);
  const merge = storeSource.slice(start, end);
  assert.match(merge, /const generation = \(this\.cloudMergeGeneration\.get\(entity\) \|\| 0\) \+ 1/);
  assert.match(merge, /const isCurrentMerge = \(\): boolean => this\.cloudMergeGeneration\.get\(entity\) === generation/);
  assert.match(merge, /!isCurrentMerge\(\) \|\| activeOwnerKey\(\) !== ownerKey/);
  assert.match(merge, /activeOwnerKey\(\) !== ownerKey \|\| !isCurrentMerge\(\)/);
});


test('version conflicts preserve local queue payload and capture a tenant-scoped server comparison snapshot', () => {
  assert.match(syncTypesSource, /conflictServerRecord\?: Record<string, unknown>/);
  assert.match(syncTypesSource, /conflictDetectedAt\?: string/);
  const conflictStart = syncEngineSource.indexOf('// Preserve both sides of an optimistic-concurrency conflict.');
  const conflictEnd = syncEngineSource.indexOf('if (itemRecordId) blockedRecordIds.add(itemRecordId);', conflictStart);
  assert.ok(conflictStart >= 0 && conflictEnd > conflictStart);
  const conflictBlock = syncEngineSource.slice(conflictStart, conflictEnd);
  assert.match(conflictBlock, /status === 409 && item\.action === 'UPDATE' && itemRecordId/);
  assert.match(conflictBlock, /hseApi\.getOperationalRecord\(/);
  assert.match(conflictBlock, /String\(remoteRecord\.id \|\| ''\) === itemRecordId/, 'snapshot must match the exact requested record ID');
  assert.match(conflictBlock, /itemRecordId,\s*syncToken/);
  assert.match(conflictBlock, /ownerAfterConflictRead\.userId === owner\.userId/);
  assert.match(conflictBlock, /ownerAfterConflictRead\.companyCode === owner\.companyCode/);
  assert.match(conflictBlock, /item\.conflictServerRecord = remoteRecord/);
  assert.match(conflictBlock, /item\.error = .*perubahan lokal tidak ditimpa/);
  assert.match(syncEngineSource, /await hdosDB\.put\(\s*'queue',\s*item\s*\)/);
  assert.match(syncUiSource, /Bandingkan versi server/);
  assert.match(syncUiSource, /JSON\.stringify\(item\.conflictServerRecord, null, 2\)/);
  assert.match(syncTypesSource, /'RESOLVED'/);
  assert.match(syncTypesSource, /resolvedQueueItemId\?: string/);
  const resolutionStart = syncEngineSource.indexOf('async resolveConflict(');
  const resolutionEnd = syncEngineSource.indexOf('async retryFailedItems()', resolutionStart);
  assert.ok(resolutionStart >= 0 && resolutionEnd > resolutionStart);
  const resolutionBlock = syncEngineSource.slice(resolutionStart, resolutionEnd);
  assert.match(resolutionBlock, /original\.status !== 'CONFLICT'/);
  assert.match(resolutionBlock, /original\.ownerUserId !== owner\.userId/);
  assert.match(resolutionBlock, /hseApi\.authToken !== resolutionToken/, 'resolution must remain bound to the same login session');
  assert.match(resolutionBlock, /serverRecordId !== recordId \|\| !serverUpdatedAt/);
  assert.match(resolutionBlock, /updatedAt: serverUpdatedAt/);
  assert.match(resolutionBlock, /protectedPayload\[key\] = serverRecord\[key\]/);
  assert.match(resolutionBlock, /status: 'RESOLVED'/);
  assert.match(resolutionBlock, /resolvedBy: owner\.userId/);
  assert.match(resolutionBlock, /resolutionOfQueueItemId: original\.id/);
  assert.match(resolutionBlock, /await hdosDB\.putBundle\(/);
  assert.match(resolutionBlock, /persistedQueue\.filter\(/);
  assert.match(resolutionBlock, /startsWith\('Perubahan ditahan karena sinkronisasi perubahan sebelumnya'/);
  assert.match(resolutionBlock, /status: 'PENDING' as const/);
  assert.match(resolutionBlock, /dependentItems\.map\(item => \(\{ storeName: 'queue' as const, item \}\)\)/);
  assert.match(syncEngineSource, /sameRecord && Boolean\(a\.resolutionOfQueueItemId\) !== Boolean\(b\.resolutionOfQueueItemId\)/);

  assert.match(syncEngineSource, /if \(!item \|\| item\.status === 'RESOLVED'\) continue;/);
  assert.match(syncUiSource, /Simpan Revisi & Antrekan Ulang/);
  assert.match(syncUiSource, /JSON\.parse\(rawDraft\)/);

});


test('Repository DELETE serializes lookup, tenant authorization, Drive trashing, and row removal', () => {
  const routeStart = source.indexOf('const repositoryDeleteMatch = path.match(');
  const routeEnd = source.indexOf('const repositoryPreviewMatch =', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = source.slice(routeStart, routeEnd);
  assert.ok(route.includes('deleteLock.waitLock(10000)'));
  assert.ok(route.includes('finally {\n      deleteLock.releaseLock();'));
  assert.ok(route.indexOf('findRecordRow_(sheet, documentId)') < route.indexOf("String(doc.companyCode || '')"));
  assert.ok(route.indexOf('isRepositoryDriveFile_(repositoryFile)') < route.indexOf('sheet.deleteRow(rowNumber)'));
  assert.ok(route.indexOf('sheet.deleteRow(rowNumber)') < route.indexOf('logAudit_(user, \'REPOSITORY_DOCUMENT_DELETED\''));
  assert.match(route, /alreadyDeleted: true/);
});


test('manual retry never reactivates unresolved CONFLICT or RESOLVED queue items', () => {
  const start = syncEngineSource.indexOf('async retryFailedItems()');
  const end = syncEngineSource.indexOf('async triggerSync()', start + 1);
  assert.ok(start >= 0 && end > start);
  const retryBlock = syncEngineSource.slice(start, end);
  assert.match(retryBlock, /item\.status === 'CONFLICT'/);
  assert.match(retryBlock, /item\.status === 'RESOLVED'/);
  assert.match(retryBlock, /item\.retryCount < MAX_RETRIES/);
  assert.ok(retryBlock.indexOf("item.status === 'CONFLICT'") < retryBlock.indexOf("item.status = 'PENDING'"));
  assert.ok(retryBlock.indexOf("item.status === 'RESOLVED'") < retryBlock.indexOf("item.status = 'PENDING'"));
});

test('IndexedDB synchronous open exceptions do not leave a cached failed initialization promise', () => {
  const initStart = syncDbSource.indexOf('async init(): Promise<IDBDatabase | null>');
  const initEnd = syncDbSource.indexOf('private getFallbackKey(', initStart);
  assert.ok(initStart >= 0 && initEnd > initStart);
  const initBlock = syncDbSource.slice(initStart, initEnd);
  assert.ok(initBlock.indexOf('request = indexedDB.open(DB_NAME, DB_VERSION)') < initBlock.indexOf('this.initPromise = new Promise'));
  const openCatch = initBlock.slice(initBlock.indexOf('} catch (err) {'), initBlock.indexOf('this.initPromise = new Promise'));
  assert.match(openCatch, /this\.initPromise = null/);
  assert.match(openCatch, /return Promise\.reject\(new Error\(/);
});

test('IndexedDB open failures reject instead of silently switching to a split localStorage queue', () => {
  const initStart = syncDbSource.indexOf('async init(): Promise<IDBDatabase | null>');
  const initEnd = syncDbSource.indexOf('private getFallbackKey(', initStart);
  const initBlock = syncDbSource.slice(initStart, initEnd);
  assert.match(initBlock, /return Promise\.reject\(new Error\('IndexedDB tidak dapat dibuka/);
  assert.match(initBlock, /request\.onerror = \(\) => \{[\s\S]*?this\.initPromise = null;[\s\S]*?reject\(new Error\('IndexedDB gagal dibuka/);
  assert.match(initBlock, /typeof window === 'undefined' \|\| !window\.indexedDB\)[\s\S]*?return null/);
});

test('repository and published-form snapshots reconcile atomically without partial cache updates', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const bundleStart = syncDbSource.indexOf('async reconcileSnapshotBundle(');
  const bundleEnd = syncDbSource.indexOf('async putBundle', bundleStart);
  assert.ok(bundleStart >= 0 && bundleEnd > bundleStart);
  const bundle = syncDbSource.slice(bundleStart, bundleEnd);
  assert.match(bundle, /db\.transaction\(storeNames, 'readwrite'\)/);
  assert.match(bundle, /for \(const id of change\.deleteIds\) store\.delete\(id\)/);
  assert.match(bundle, /for \(const record of change\.records\.values\(\)\) store\.put\(record\)/);
  assert.match(bundle, /for \(const \[key, value\] of snapshots\)/);
  assert.match(bundle, /Multi-store snapshot rollback failed/);

  const refreshStart = storeSource.indexOf('async refreshCloudData()');
  const refreshEnd = storeSource.indexOf('subscribe(listener:', refreshStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  const refresh = storeSource.slice(refreshStart, refreshEnd);
  assert.match(refresh, /await hdosDB\.reconcileSnapshotBundle\(\[/);
  assert.match(refresh, /storeName: 'repository', deleteIds: staleCloudDocuments\.map/);
  assert.match(refresh, /storeName: 'photos', deleteIds: staleCloudDocuments\.map/);
  assert.doesNotMatch(refresh, /await hdosDB\.put\('repository'/);
  assert.doesNotMatch(refresh, /await hdosDB\.delete\('repository'/);

  const formsStart = storeSource.indexOf('async mergePublishedFormDefinitions(');
  const formsEnd = storeSource.indexOf('async addInspection(', formsStart);
  assert.ok(formsStart >= 0 && formsEnd > formsStart);
  const forms = storeSource.slice(formsStart, formsEnd);
  assert.match(forms, /await hdosDB\.reconcileSnapshot\('form-definition', staleIds, nextVisible\)/);
  assert.match(forms, /previousOtherTenants = previous\.filter\(form => !isVisibleToActiveTenant\(form\)\)/);
  assert.match(forms, /getFormVisibilityRecord\(remote, this\.documents\)/);
  assert.match(forms, /if \(shouldPublish && !shouldPublish\(\)\) return;\s*await hdosDB\.reconcileSnapshot/);
  assert.doesNotMatch(forms, /await hdosDB\.put\('form-definition'/);
  assert.doesNotMatch(forms, /await hdosDB\.delete\('form-definition'/);
  assert.match(refresh, /Rekonsiliasi repository gagal; cache sebelumnya dipertahankan/);
  assert.match(refresh, /Rekonsiliasi formulir gagal; cache sebelumnya dipertahankan/);
  assert.match(refresh, /Rekonsiliasi snapshot \$\{entities\[index\]\} gagal; cache lokal dipertahankan/);
  assert.match(forms, /shouldPublish && !shouldPublish\(\)/);
  assert.doesNotMatch(refresh, /this\.formDefinitions = this\.formDefinitions\.filter/);
});

test('standalone published forms survive startup and partial repository refreshes', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const initStart = storeSource.indexOf('async init(): Promise<void>');
  const initEnd = storeSource.indexOf('async refreshCloudData()', initStart);
  assert.ok(initStart >= 0 && initEnd > initStart);
  const init = storeSource.slice(initStart, initEnd);
  assert.match(init, /this\.formDefinitions = this\.formDefinitions\.filter\(form =>\s*isLocalRecordVisible\(\s*getFormVisibilityRecord\(form, this\.documents\)/);
  assert.doesNotMatch(init, /this\.formDefinitions = this\.formDefinitions\.filter\(form => this\.documents\.some/);

  const refreshStart = storeSource.indexOf('async refreshCloudData()');
  const refreshEnd = storeSource.indexOf('subscribe(listener:', refreshStart);
  const refresh = storeSource.slice(refreshStart, refreshEnd);
  assert.match(refresh, /const availableForms = formsResult\.value as unknown as FormDefinition\[\]/);
  assert.doesNotMatch(refresh, /availableDocumentIds/);
});

test('form definition updates cannot change tenant ownership metadata', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const updateStart = storeSource.indexOf('async updateFormDefinition(');
  const updateEnd = storeSource.indexOf('getFormDefinitionByDocumentId(', updateStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  const update = storeSource.slice(updateStart, updateEnd);
  assert.match(update, /const immutableTenantFields = \{[\s\S]*?companyCode: existingTenant\.companyCode[\s\S]*?ownerCompanyCode: existingTenant\.ownerCompanyCode/);
  for (const field of ['companyCode', 'contractorCode', 'parentCompanyCode', 'subcontractorCode', 'subkonCode', 'ownerCompanyCode']) {
    assert.match(update, new RegExp(field + ': existingTenant\\.' + field));
  }
  assert.match(update, /\.\.\.updates,\s*\.\.\.immutableTenantFields/);
});

test('locally generated form definitions inherit immutable tenant ownership from their source document', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const createStart = storeSource.indexOf('async addFormDefinition(');
  const createEnd = storeSource.indexOf('async updateFormDefinition(', createStart);
  assert.ok(createStart >= 0 && createEnd > createStart);
  const create = storeSource.slice(createStart, createEnd);
  assert.match(create, /const sourceTenant = sourceDocument as unknown as Record<string, unknown>/);
  assert.match(create, /const formTenantFields = \{/);
  assert.match(create, /sourceTenant\.companyCode/);
  assert.match(create, /sourceTenant\.contractorCode/);
  assert.match(create, /sourceTenant\.parentCompanyCode/);
  assert.match(create, /sourceTenant\.subcontractorCode/);
  assert.match(create, /\.\.\.input,\s*\.\.\.formTenantFields/);
});

test('cloud operational snapshot applies tenant-scoped deletes and upserts atomically', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  assert.match(syncDbSource, /async reconcileSnapshot<T extends \{ id: string \}>/);
  const start = syncDbSource.indexOf('async reconcileSnapshot<');
  const end = syncDbSource.indexOf('async putBundle', start);
  assert.ok(start >= 0 && end > start);
  const method = syncDbSource.slice(start, end);
  assert.match(method, /db\.transaction\(storeName, 'readwrite'\)/);
  assert.match(method, /for \(const id of deleteIds\) store\.delete\(id\)/);
  assert.match(method, /for \(const record of records\) store\.put\(record\)/);
  assert.match(method, /tx\.oncomplete = \(\) => resolve\(\)/);
  assert.match(method, /localStorage\.setItem\(key, previous\)/);
  assert.match(method, /let snapshotCaptured = false/);
  assert.match(method, /if \(snapshotCaptured\) \{/);
  const storeStart = storeSource.indexOf('async mergeCloudOperationalRecords(');
  const storeEnd = storeSource.indexOf('async refreshCloudData()', storeStart);
  const merge = storeSource.slice(storeStart, storeEnd);
  assert.match(merge, /await hdosDB\.reconcileSnapshot\(storeName, staleIds, snapshot\)/);
  assert.doesNotMatch(merge, /await hdosDB\.delete\(storeName, local\.id\)/);
});


test('repository deletion atomically removes local metadata, photo, forms, and queues offline delete', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const deleteStart = storeSource.indexOf('async deleteDocument(documentId: string)');
  const deleteEnd = storeSource.indexOf('async addFormDefinition(', deleteStart);
  assert.ok(deleteStart >= 0 && deleteEnd > deleteStart);
  const deletion = storeSource.slice(deleteStart, deleteEnd);
  assert.match(deletion, /const deletes = \[/);
  assert.match(deletion, /storeName: 'repository'/);
  assert.match(deletion, /storeName: 'photos'/);
  assert.match(deletion, /storeName: 'form-definition'/);
  assert.match(deletion, /await hdosSync\.enqueueBatch\(\[\], \[[\s\S]*?\], deletes\)/);
  assert.match(deletion, /existing\.cloudStored && hseApi\.baseUrl && hseApi\.isAuthenticated && hdosSync\.getIsOnline\(\)/);
  assert.match(deletion, /await hseApi\.deleteRepositoryDocument\(documentId\);[\s\S]*?await hdosDB\.reconcileSnapshotBundle/);
  assert.doesNotMatch(deletion, /await hdosDB\.delete\(/);
  assert.match(syncSource, /deletes: Array<\{ storeName: StoreName; id: string \}> = \[\]/);
  assert.match(syncSource, /await hdosDB\.reconcileSnapshotBundle\(/);
  assert.match(syncSource, /deleteIds: deletes\.filter\(entry => entry\.storeName === storeName\)/);
});


test('repository metadata and original binary are committed atomically during upload', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'RepositoryModule.tsx'), 'utf8');
  const addStart = storeSource.indexOf('async addDocument(');
  const addEnd = storeSource.indexOf('async updateDocument(', addStart);
  assert.ok(addStart >= 0 && addEnd > addStart);
  const add = storeSource.slice(addStart, addEnd);
  assert.match(add, /localFile\?: \{ blob: Blob/);
  assert.match(add, /await hdosDB\.putBundle\(\[/);
  assert.match(add, /storeName: 'repository', item: newDocument/);
  assert.match(add, /storeName: 'photos'/);
  assert.match(add, /id: `document-file-\$\{newDocument\.id\}`/);
  const uploadStart = moduleSource.indexOf('const handleCreateDoc');
  const uploadEnd = moduleSource.indexOf('const closeOriginalPreview', uploadStart);
  assert.ok(uploadStart >= 0 && uploadEnd > uploadStart);
  const upload = moduleSource.slice(uploadStart, uploadEnd);
  assert.match(upload, /store\.addDocument\([\s\S]*?blob: selectedFile[\s\S]*?ownerCompanyCode:/);
  assert.doesNotMatch(upload, /await hdosDB\.put\('photos', storedFile\)/);
});


test('Repository preview and form generation abort when the active account changes mid-operation', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'RepositoryModule.tsx'), 'utf8');
  assert.match(moduleSource, /const captureRepositorySession = \(\): RepositorySessionSnapshot =>/);
  assert.match(moduleSource, /const isRepositorySessionCurrent = \(snapshot: RepositorySessionSnapshot\): boolean =>/);
  assert.match(moduleSource, /hseApi\.authToken === snapshot\.token/);
  const previewStart = moduleSource.indexOf('const handlePreviewOriginal = async');
  const previewEnd = moduleSource.indexOf('const handleDownloadDoc = async', previewStart);
  const preview = moduleSource.slice(previewStart, previewEnd);
  assert.match(preview, /const sessionSnapshot = captureRepositorySession\(\)/);
  assert.match(preview, /await hseApi\.previewRepositoryFile\(doc\.id\);\s*assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.ok(preview.indexOf('assertRepositorySessionCurrent(sessionSnapshot)') < preview.indexOf('URL.createObjectURL(blob)'));
  const generateStart = moduleSource.indexOf('const handleGenerateForm = async');
  const generateEnd = moduleSource.indexOf('// Automatically convert existing local Repository documents', generateStart);
  const generate = moduleSource.slice(generateStart, generateEnd);
  assert.match(generate, /const sessionSnapshot = captureRepositorySession\(\)/);
  assert.match(generate, /await extractDocumentText\([\s\S]*?assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.match(generate, /await extractChecklistItemsFromDocument\([\s\S]*?assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.match(generate, /assertRepositorySessionCurrent\(sessionSnapshot\);\s*if \(existingForm\)/);
  assert.match(generate, /await store\.addFormDefinition\(formInput\);\s*assertRepositorySessionCurrent\(sessionSnapshot\)/);
});

test('Repository upload and delete flows stop after the active account changes', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'RepositoryModule.tsx'), 'utf8');
  const createStart = moduleSource.indexOf('const handleCreateDoc = async');
  const createEnd = moduleSource.indexOf('const closeOriginalPreview =', createStart);
  const create = moduleSource.slice(createStart, createEnd);
  assert.match(create, /const sessionSnapshot = captureRepositorySession\(\)/);
  assert.match(create, /await hdosDB\.init\(\);\s*assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.match(create, /await fileToBase64\(selectedFile\);\s*assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.match(create, /await hseApi\.uploadRepositoryDocument\([\s\S]*?assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.match(create, /await store\.updateDocument\([\s\S]*?assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.match(create, /if \(!isRepositorySessionCurrent\(sessionSnapshot\)\) return/);
  assert.match(create, /assertRepositorySessionCurrent\(sessionSnapshot\);\s*await store\.deleteDocument\(newDoc\.id\)/);
  const deleteStart = moduleSource.indexOf('const handleDeleteDocument = async');
  const deleteEnd = moduleSource.indexOf('const handleGenerateForm = async', deleteStart);
  const remove = moduleSource.slice(deleteStart, deleteEnd);
  assert.match(remove, /const sessionSnapshot = captureRepositorySession\(\)/);
  assert.match(remove, /await store\.deleteDocument\(doc\.id\);\s*assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.match(remove, /if \(isRepositorySessionCurrent\(sessionSnapshot\)\)/);
});

test('Repository store document mutations bind ownership and publication to the initiating session', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const addStart = storeSource.indexOf('async addDocument(');
  const updateStart = storeSource.indexOf('async updateDocument(', addStart);
  const deleteStart = storeSource.indexOf('async deleteDocument(', updateStart);
  const formStart = storeSource.indexOf('async addFormDefinition(', deleteStart);
  assert.ok(addStart >= 0 && updateStart > addStart && deleteStart > updateStart && formStart > deleteStart);
  const add = storeSource.slice(addStart, updateStart);
  const update = storeSource.slice(updateStart, deleteStart);
  const remove = storeSource.slice(deleteStart, formStart);
  assert.match(add, /const sessionToken = hseApi\.authToken/);
  assert.match(add, /ownerUserId: sessionUser\.id/);
  assert.match(add, /\.\.\.tenantFields/);
  assert.match(add, /if \(!isCurrentSession\(\)\)[\s\S]*?Dokumen tidak dipublikasikan ke akun yang baru/);
  assert.match(update, /if \(!isCurrentSession\(\)\)[\s\S]*?Perubahan tidak dipublikasikan ke akun yang baru/);
  assert.match(update, /const immutableTenantFields: Pick<DocumentItem, 'companyCode' \| 'parentCompanyCode' \| 'ownerUserId'> = \{[\s\S]*?parentCompanyCode: existing\.parentCompanyCode[\s\S]*?ownerUserId: existing\.ownerUserId/);
  assert.match(update, /\.\.\.immutableTenantFields/);
  assert.match(remove, /await hseApi\.deleteRepositoryDocument\(documentId\);\s*if \(!isCurrentSession\(\)\)/);
  assert.match(remove, /await hdosSync\.enqueueBatch\([\s\S]*?if \(!isCurrentSession\(\)\)/);
  assert.match(remove, /if \(!isCurrentSession\(\)\)[\s\S]*?Muat ulang Repository akun aktif/);
});

test('Repository clears selected document and preview state when the tenant changes', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'RepositoryModule.tsx'), 'utf8');
  assert.match(moduleSource, /Clear account-bound UI state immediately when the active tenant changes/);
  assert.match(moduleSource, /setSelectedDoc\(null\);[\s\S]*?setModalNewDocOpen\(false\);[\s\S]*?URL\.revokeObjectURL\(originalFileUrl\)/);
  assert.match(moduleSource, /\[sessionUser\?\.id, sessionUser\?\.companyCode, sessionUser\?\.parentCompanyCode\]\);/);
  assert.match(moduleSource, /hseApi\.authToken, hseApi\.baseUrl, store\.documents\.length/);
});

test('form-definition store writes do not publish into a newer account session', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const addStart = storeSource.indexOf('async addFormDefinition(');
  const addEnd = storeSource.indexOf('async updateFormDefinition(', addStart);
  const updateStart = addEnd;
  const updateEnd = storeSource.indexOf('getFormDefinitionByDocumentId(', updateStart);
  assert.ok(addStart >= 0 && addEnd > addStart && updateEnd > updateStart);
  const add = storeSource.slice(addStart, addEnd);
  const update = storeSource.slice(updateStart, updateEnd);
  for (const method of [add, update]) {
    assert.match(method, /const sessionToken = hseApi\.authToken/);
    assert.match(method, /const sessionGeneration = this\.initGeneration/);
    assert.match(method, /currentUser\?\.id === sessionUser\?\.id/);
    assert.match(method, /hseApi\.authToken === sessionToken/);
    assert.match(method, /await hdosDB\.put\('form-definition'/);
    assert.match(method, /if \(!isCurrentSession\(\)\)[\s\S]*?Data tidak dipublikasikan ke akun yang baru/);
  }
});

test('central Repository snapshots are tenant-filtered before entering the shared client store', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const setterStart = storeSource.indexOf('setCentralRepositoryDocuments(documents: DocumentItem[]): void');
  const setterEnd = storeSource.indexOf('async mergeCloudOperationalRecords(', setterStart);
  assert.ok(setterStart >= 0 && setterEnd > setterStart);
  const setter = storeSource.slice(setterStart, setterEnd);
  assert.match(setter, /const user = AuthState\.getUser\(\)/);
  assert.match(setter, /const allowedCompanyCodes = this\.getAllowedCompanyCodes\(\)/);
  assert.match(setter, /const isGlobalDocument = !companyCode && !parentCompanyCode/);
  assert.match(setter, /return Boolean\(user\) && \(isGlobalDocument \|\| isLocalRecordVisible\(/);
  assert.match(setter, /Boolean\(user\) && \(isGlobalDocument \|\| isLocalRecordVisible\(/);
  assert.match(setter, /this\.documents = documents\.filter\(document =>/);
  assert.match(setter, /this\.notify\(\)/);
  assert.doesNotMatch(setter, /this\.documents = documents;/);
});

test('tenant store initialization cannot publish stale account snapshots after a session switch', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const initStart = storeSource.indexOf('async init(): Promise<void>');
  const initEnd = storeSource.indexOf('setCentralRepositoryDocuments(', initStart);
  assert.ok(initStart >= 0 && initEnd > initStart);
  const init = storeSource.slice(initStart, initEnd);
  assert.ok(storeSource.includes('private initGeneration = 0'));
  assert.ok(init.includes('const generation = ++this.initGeneration'));
  assert.ok(init.includes('const initialOwnerKey = initialUser?.id'));
  assert.ok(init.includes('const initialToken = hseApi.authToken'));
  assert.ok(init.includes('generation === this.initGeneration'));
  assert.ok(init.includes('activeOwnerKey === initialOwnerKey'));
  assert.ok(init.includes('hseApi.authToken === initialToken'));
  assert.ok(init.includes("await hdosSync.init();\n    if (!isCurrentInitialization()) return;"));
  assert.ok(init.includes("const storedInspections = await hdosDB.getAll<Inspection>('inspection');\n    if (!isCurrentInitialization()) return;"));
  assert.ok(init.includes('const centralLocations = await hseApi.listLocations();\n        if (!isCurrentInitialization()) return;'));
  assert.ok(init.includes('await this.refreshCloudData();\n      if (!isCurrentInitialization()) return;'));
  assert.ok(storeSource.includes('setContractorsFromCompanyMaster(centralCompanies, isCurrentInitialization)'));
});


test('sync queue recovery stops after account, token, or initialization generation changes', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const initStart = syncSource.indexOf('async init(): Promise<void>');
  const initEnd = syncSource.indexOf('getIsOnline(): boolean', initStart);
  assert.ok(initStart >= 0 && initEnd > initStart);
  const init = syncSource.slice(initStart, initEnd);
  assert.match(init, /if \(this\.queueOwnerKey !== requestedOwnerKey\) \{[\s\S]*?this\.queue = \[\];[\s\S]*?hdosEvents\.emit\('sync:queue_updated', \[\]\)/);
  assert.match(init, /const requestedToken = hseApi\.authToken/);
  assert.match(init, /initGeneration !== this\.initGeneration/);
  assert.match(init, /activeOwnerKey === requestedOwnerKey && hseApi\.authToken === requestedToken/);
  assert.match(init, /const abandonStaleInitialization = \(\): boolean =>/);
  assert.match(init, /if \(abandonStaleInitialization\(\)\) return;/);
  assert.match(init, /await hdosDB\.put\('queue', item\);\s*if \(abandonStaleInitialization\(\)\) return;/);
  assert.match(init, /if \(lock && !abandonStaleInitialization\(\)\) await recoverInterruptedQueue\(\)/);
  assert.match(init, /if \(isCurrentInitialization\(\)\) void this\.triggerSync\(\)/);
  assert.match(init, /Do not clear a newer initialization's queue snapshot/);
});


test('store tenant ownership keys use the same Admin CGG company fallback as sync engine', () => {
  const storeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'), 'utf8');
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  assert.match(storeSource, /function getUserCompanyCode\(user: ReturnType<typeof AuthState\.getUser>\): string/);
  assert.match(storeSource, /user\?\.companyCode \|\| \(\(user\?\.roles \|\| \[\]\)\.includes\('Admin CGG'\) \? 'CGG' : ''\)/);
  assert.match(storeSource, /getUserCompanyCode\(initialUser\)/);
  assert.match(storeSource, /getUserCompanyCode\(activeUser\)/);
  assert.match(storeSource, /getUserCompanyCode\(currentUser\)/);
  assert.match(storeSource, /getUserCompanyCode\(active\)/);
  assert.match(syncSource, /user\.companyCode \|\| \(\(user\.roles \|\| \[\]\)\.includes\('Admin CGG'\) \? 'CGG' : ''\)/);
});


test('sync initialization invalidates its queue scope when persisted queue read fails', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const initStart = syncSource.indexOf('async init(): Promise<void>');
  const initEnd = syncSource.indexOf('getIsOnline(): boolean', initStart);
  assert.ok(initStart >= 0 && initEnd > initStart);
  const init = syncSource.slice(initStart, initEnd);
  const readStart = init.indexOf("storedQueue = await hdosDB.getAll<SyncQueueItem>('queue')");
  const readEnd = init.indexOf('if (abandonStaleInitialization()) return;', readStart);
  assert.ok(readStart >= 0 && readEnd > readStart);
  const read = init.slice(readStart, readEnd);
  assert.match(read, /catch \(error\)/);
  assert.match(read, /this\.queue = \[\]/);
  assert.match(read, /this\.queueOwnerKey = ''/);
  assert.match(read, /hdosEvents\.emit\('sync:queue_updated', \[\]\)/);
  assert.match(read, /throw error/);
});


test('sync replay reads each queued operation from the latest snapshot after server-version propagation', () => {
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const replayStart = syncSource.indexOf('const blockedRecordIds = new Set<string>()');
  const replayEnd = syncSource.indexOf('this.lastSyncTime =', replayStart);
  assert.ok(replayStart >= 0 && replayEnd > replayStart);
  const replay = syncSource.slice(replayStart, replayEnd);
  assert.match(replay, /const orderedQueueIds = \[\.\.\.this\.queue\][\s\S]*?\.map\(queued => queued\.id\)/);
  assert.match(replay, /for \(const queuedId of orderedQueueIds\) \{\s*const item = this\.queue\.find\(queued => queued\.id === queuedId\)/);
  assert.match(replay, /this\.queue = this\.queue\.map\(current => updatedById\.get\(current\.id\) \|\| current\)/);
  assert.doesNotMatch(replay, /for \(const item of \[\.\.\.this\.queue\]\.sort\(compareQueueItemsByTime\)\)/);
});


test('mobile field evidence inputs prefer the rear camera for inspections and hazards', () => {
  const inspection = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'InspectionModule.tsx'), 'utf8');
  const hazard = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'HazardModule.tsx'), 'utf8');
  for (const source of [inspection, hazard]) {
    assert.match(source, /type="file" accept="image\/jpeg,image\/png,image\/webp" capture="environment" required/);
    assert.match(source, /5 \* 1024 \* 1024/);
  }
});


test('operational photo uploads carry an idempotency key and GAS reuses committed evidence on retry', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'api.ts'), 'utf8');
  const offlinePhotos = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'offline-photos.ts'), 'utf8');
  const gas = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  assert.match(api, /fileBase64: string; uploadKey: string/);
  assert.match(offlinePhotos, /uploadKey: `hdos-\$\{photo\.id\}`/);
  assert.match(gas, /HDOS_UPLOAD_KEY:/);
  assert.match(gas, /existingFile\.getDescription\(\)/);
  assert.match(gas, /existingFile\.getId\(\)/);
  assert.match(gas, /file\.setDescription\(marker\)/);
});


test('inspection and hazard evidence is persisted locally and uploaded during queue replay', () => {
  const inspection = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'InspectionModule.tsx'), 'utf8');
  const hazard = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'HazardModule.tsx'), 'utf8');
  const offlinePhotos = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'offline-photos.ts'), 'utf8');
  const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const backup = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'backup.ts'), 'utf8');
  for (const ui of [inspection, hazard]) {
    assert.match(ui, /saveOfflineOperationalPhoto\(/);
    assert.match(ui, /localPhotoId,/);
    assert.doesNotMatch(ui, /uploadOperationalPhoto/);
  }
  assert.match(offlinePhotos, /await hdosDB\.put\('photos', record\)/);
  assert.match(offlinePhotos, /photo\.ownerUserId !== owner\.userId/);
  assert.match(offlinePhotos, /uploadKey: `hdos-\$\{photo\.id\}`/);
  assert.match(sync, /getById<OfflineOperationalPhoto>\('photos', localPhotoId\)/);
  assert.match(sync, /uploadOfflineOperationalPhoto\(localPhoto\)/);
  assert.match(sync, /delete cloudPayload\.localPhotoId/);
  assert.match(sync, /hdosDB\.delete\('photos', String\(/);
  assert.match(backup, /await encodeBinary\(scoped\)/);
  assert.match(backup, /storeName === 'photos'/);
  assert.match(backup, /photo\.ownerUserId === owner\.userId/);
  assert.match(backup, /item\.ownerUserId !== owner\.userId/);
  assert.match(backup, /new Blob\(\[bytes\]/);
});

test('PICA evidence photos are stored offline and uploaded during queued UPDATE replay', () => {
  assert.match(picaUiSource, /saveOfflineOperationalPhoto\(evidencePhotoFile\)/);
  assert.match(picaUiSource, /offline:\$\{localPhotoId\}/);
  assert.match(picaUiSource, /diunggah otomatis saat sinkronisasi/);
  assert.match(syncTypesSource, /evidencePhotoFileId\?: string;[\s\S]*?localPhotoId\?: string;/);
  assert.match(syncEngineSource, /item\.action === 'UPDATE'[\s\S]*?originalPayload\.localPhotoId/);
  assert.match(syncEngineSource, /delete \(updatePayload as Record<string, unknown>\)\.localPhotoId/);
  assert.match(syncEngineSource, /const laterUpdates = persistedQueue\.filter/);
  assert.match(syncEngineSource, /evidencePhotoFileId: photoFileId,[\s\S]*?evidencePhotoUrl: photoUrl/);
  assert.match(syncEngineSource, /item\.action === 'CREATE' \|\| item\.action === 'UPDATE'/);
});


test('Contractor SIA documents are stored offline and replayed with an idempotent upload key', () => {
  const helper = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'offline-documents.ts'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'ContractorModule.tsx'), 'utf8');
  const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'api.ts'), 'utf8');
  const gas = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  assert.match(helper, /kind: 'contractor-sia'/);
  assert.match(helper, /10 \* 1024 \* 1024/);
  assert.match(helper, /uploadKey: `hdos-\$\{document\.id\}`/);
  assert.match(moduleSource, /saveOfflineContractorSia\(file, unit\.id\)/);
  assert.match(moduleSource, /entity: 'contractor-sia'/);
  assert.match(sync, /endpoint === 'contractor-sia'/);
  assert.match(sync, /uploadOfflineContractorSia\(localDocument\)/);
  assert.match(sync, /localDocument\.kind !== 'contractor-sia'/);
  assert.match(api, /uploadKey\?: string/);
  assert.match(gas, /HDOS_SIA_UPLOAD_KEY:/);
  assert.match(gas, /candidate\.getDescription\(\)/);
});

test('Repository digital-form generation uses tenant-authorized cloud preview and never falls back after a denied preview', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'RepositoryModule.tsx'), 'utf8');
  const start = moduleSource.indexOf('const handleGenerateForm = async');
  const end = moduleSource.indexOf('// Automatically convert existing local Repository documents', start);
  assert.ok(start >= 0 && end > start);
  const generate = moduleSource.slice(start, end);
  assert.match(generate, /const sessionSnapshot = captureRepositorySession\(\)/);
  assert.match(generate, /if \(hseApi\.baseUrl && sessionUser\) \{[\s\S]*?await hseApi\.previewRepositoryFile\(doc\.id\)[\s\S]*?assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.doesNotMatch(generate, /downloadRepositoryDocument/);
  assert.match(generate, /if \(\(!hseApi\.baseUrl \|\| !sessionUser\) && !canUseLocalDocumentFile\(/);
  assert.match(generate, /await extractDocumentText\([\s\S]*?assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.match(generate, /await extractChecklistItemsFromDocument\([\s\S]*?assertRepositorySessionCurrent\(sessionSnapshot\)/);
  assert.match(generate, /catch \(error\) \{[\s\S]*?if \(!isRepositorySessionCurrent\(sessionSnapshot\)\) return false/);
});

test('Contractor SIA idempotency lookup and Drive creation are serialized with the Spreadsheet commit', () => {
  const gas = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const start = gas.indexOf('function uploadContractorSia_(');
  const end = gas.indexOf('function previewContractorSia_(', start);
  assert.ok(start >= 0 && end > start);
  const upload = gas.slice(start, end);
  const lock = upload.indexOf('lock.waitLock(10000)');
  const folderLookup = upload.indexOf('folder.getFiles()');
  const driveCreate = upload.indexOf('folder.createFile(');
  const sheetCommit = upload.indexOf('.setValues([buildEntityRow_');
  const release = upload.indexOf('lock.releaseLock()');
  assert.ok(lock >= 0 && folderLookup > lock && driveCreate > lock && sheetCommit > driveCreate && release > sheetCommit);
  assert.match(upload, /HDOS_SIA_UPLOAD_KEY:' \+ uploadKey \+ ':FLEET:' \+ fleetId/);
  assert.match(upload, /if \(!createdFile && latest\.siaFileId === file\.getId\(\)\) \{[\s\S]*?alreadyApplied = true/);
  assert.match(upload, /if \(committed && !alreadyApplied && oldFileId/);
  assert.match(upload, /if \(!alreadyApplied\) logAudit_\(user, 'CONTRACTOR_SIA_UPLOADED'/);
  assert.match(upload, /if \(createdFile && file\) \{[\s\S]*?file\.setTrashed\(true\)/);
});

test('Contractor SIA queue and offline Blob are removed in one IndexedDB snapshot transaction after upload', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'), 'utf8');
  const start = sync.indexOf("if (endpoint === 'contractor-sia') {");
  const end = sync.indexOf("} else if (endpoint === 'contractor-p2h')", start);
  assert.ok(start >= 0 && end > start);
  const replay = sync.slice(start, end);
  assert.match(replay, /await uploadOfflineContractorSia\(localDocument\)/);
  assert.match(replay, /await hdosDB\.reconcileSnapshotBundle\(\[[\s\S]*?storeName: 'photos', deleteIds: \[payload\.localDocumentId\], records: \[\][\s\S]*?storeName: 'queue', deleteIds: \[item\.id\], records: \[\]/);
  assert.doesNotMatch(replay, /await hdosDB\.delete\('photos', payload\.localDocumentId\)/);
});


test('backup and recovery copies preserve every required sheet dimension and header', () => {
  const names = ['users','companies','locations','forms','inspections','hazards','picas','incidents','audit_logs','backup_logs','contractor_reports','contractor_fleet','contractor_p2h_history','repository'];
  const context = { CONFIG: { SHEETS: names.slice(0, -1) } };
  vm.createContext(context);
  const start = source.indexOf('function compareDatabaseSpreadsheetSnapshots_(');
  const end = source.indexOf('function getHealthReadiness_(', start + 1);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  function makeSpreadsheet(overrides = {}) {
    const sheets = {};
    names.forEach(name => {
      const rows = overrides[name] || [['id','payload'],['record-1','{}']];
      sheets[name] = {
        getLastRow: () => rows.length,
        getLastColumn: () => rows[0].length,
        getRange: () => ({ getValues: () => [rows[0]] })
      };
    });
    return { getSheetByName: name => sheets[name] || null };
  }
  assert.equal(context.compareDatabaseSpreadsheetSnapshots_(makeSpreadsheet(), makeSpreadsheet()).valid, true);
  const rowMismatch = context.compareDatabaseSpreadsheetSnapshots_(makeSpreadsheet(), makeSpreadsheet({hazards:[['id','payload'],['h1','{}'],['h2','{}']]}));
  assert.equal(rowMismatch.valid, false);
  assert.ok(rowMismatch.mismatches.some(item => item.includes('hazards: dimensi')));
  const headerMismatch = context.compareDatabaseSpreadsheetSnapshots_(makeSpreadsheet(), makeSpreadsheet({picas:[['id','wrong'],['p1','{}']]}));
  assert.equal(headerMismatch.valid, false);
  assert.ok(headerMismatch.mismatches.some(item => item.includes('picas: header berbeda')));
});
