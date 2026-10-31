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
    findCompanyRegistry_: () => null,
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
  assert.ok(source.includes("const cggRoles = ['Company Admin', 'KTT', 'Project Manager', 'Superintendent', 'Supervisor', 'Foreman'"));
  assert.ok(source.includes("const allowedRoles = ['Company Admin', 'Contractor', 'Subkon', 'KTT', 'Project Manager', 'Superintendent', 'Supervisor', 'Foreman'"));
  assert.ok(source.includes('const roleVerified = false;'));
});
test('CGG onboarding accepts approved company domains and explicitly allowlisted Gmail only', () => {
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({
      CGG_EMAIL_DOMAINS: 'ptcgg.com; corp.cgg.id',
      CGG_ALLOWED_EMAILS: 'hse.personel@gmail.com; safety.lead@gmail.com'
    })[key] || '' }) }
  };
  vm.createContext(context);
  const helperStart = source.indexOf('function isCggEmailAllowed_(');
  const helperEnd = source.indexOf('function googleOnboard_(', helperStart + 1);
  assert.notEqual(helperStart, -1);
  assert.notEqual(helperEnd, -1);
  vm.runInContext(source.slice(helperStart, helperEnd), context);
  assert.equal(context.isCggEmailAllowed_('worker@ptcgg.com'), true);
  assert.equal(context.isCggEmailAllowed_('hse.personel@gmail.com'), true);
  assert.equal(context.isCggEmailAllowed_('unknown@gmail.com'), false);
  assert.equal(context.isCggEmailAllowed_('worker@other-company.com'), false);
});
test('Company Admin can assign an operational role in its own company but cannot verify it', () => {
  const rows = [[
    'user-1','worker@sls.co.id','', 'Worker','Employee','ACTIVE','hash','salt','',
    'SLS','','Crew','','',false
  ]];
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
  assert.ok(writes.some(write=>write.args[0]===1 && write.args[1]===5 && write.value==='Foreman Safety'));
  const cannotVerify=context.updateUserAccess_('user-1',{roleVerified:true},actor);
  assert.equal(cannotVerify.status,403);
  const cannotMoveCompany=context.updateUserAccess_('user-1',{companyCode:'VIP'},actor);
  assert.equal(cannotMoveCompany.status,403);
});
test('Spreadsheet ID is configured via Script Properties, not hardcoded', () => {
  assert.ok(source.includes("getProperty('HDOS_SPREADSHEET_ID')"));
  assert.doesNotMatch(source,/14DIOz1lMeck-pYAJxAq3TQvlrKbWS9esP7W06xri1PI/);
});
