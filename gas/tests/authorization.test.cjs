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
    isReadOnlyController_: u => (u.roles || []).some(r => ['PJO','SPV HSE','Foreman Safety'].includes(r)),
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
test('email validation accepts all verified email domains without allowlisting', () => {
  const context = {};
  vm.createContext(context);
  const helperStart = source.indexOf('function isCggEmailAllowed_(');
  const helperEnd = source.indexOf('function googleOnboard_(', helperStart + 1);
  vm.runInContext(source.slice(helperStart, helperEnd), context);
  for (const email of ['worker@ptcgg.com','staff@gmail.com','person@yahoo.com','user@outlook.com','worker@other-company.co.id']) {
    assert.equal(context.isCggEmailAllowed_(email), true);
  }
  assert.equal(context.isCggEmailAllowed_('not-an-email'), false);
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
