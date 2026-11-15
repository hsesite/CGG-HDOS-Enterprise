#!/usr/bin/env node
// Non-destructive live smoke test for the CGG HDOS Google Apps Script Web App.
// Required: HDOS_GAS_URL. Optional: HDOS_UAT_ACCOUNTS_JSON (array of {label,email,password}).
import process from 'node:process';
const baseUrl = String(process.env.HDOS_GAS_URL || '').trim();
if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\/?$/.test(baseUrl)) { console.error('HDOS_GAS_URL harus berupa URL GAS /exec yang valid.'); process.exit(2); }
const results = []; let failures = 0;
function record(section, name, status, details = {}) { results.push({section,name,status,...details}); console.log('['+status+'] '+section+' — '+name+(details.message ? ': '+details.message : '')); if(status==='FAIL') failures++; }
async function api(method,path,payload={},token='') {
  const response=await fetch(baseUrl,{method:'POST',redirect:'follow',headers:{'content-type':'text/plain;charset=utf-8'},body:JSON.stringify({method,path,token,payload}),signal:AbortSignal.timeout(30000)});
  const raw=await response.text(); let envelope; try { envelope=JSON.parse(raw); } catch { throw new Error('Respons bukan JSON (HTTP '+response.status+'); periksa URL/deployment/akses GAS.'); }
  return {httpStatus:response.status,envelope};
}
const data = result => result?.envelope?.data;
const denied = result => !result?.envelope?.success && [401,403,404].includes(Number(result?.envelope?.status||0));
async function main() {
  console.log('CGG HDOS live UAT — READ ONLY; tidak membuat/mengubah/menghapus record.');
  try {
    const live=await api('GET','/api/health/live'); const d=data(live);
    if(live.envelope?.success && d?.status==='live') record('1 Deployment','health/live','PASS',{version:d.version||'unknown'});
    else record('1 Deployment','health/live','FAIL',{message:live.envelope?.message||'Status live tidak valid.'});
  } catch(e) { record('1 Deployment','health/live','FAIL',{message:e.message}); throw e; }
  try {
    const ready=await api('GET','/api/health/ready'); const d=data(ready); const checks=d?.checks||{};
    const required=['spreadsheetAccessible','schemaReady','googleOAuthConfigured','cggRegistrationPolicyConfigured','backupFolderAccessible','dailyBackupTriggerInstalled','recentSuccessfulBackup','backupReady'];
    const missing=required.filter(key=>checks[key]!==true);
    if(ready.envelope?.success && d?.status==='ready' && !missing.length) record('1 Deployment/database','health/ready','PASS',{checks});
    else if(ready.envelope?.success && d?.status==='not_ready') record('1 Deployment/database','health/ready','WARN',{readinessStatus:d.status,failedChecks:missing,checks,message:ready.envelope?.message||'Backend belum siap; deployment/database memerlukan konfigurasi.'});
    else record('1 Deployment/database','health/ready','FAIL',{readinessStatus:d?.status||'unavailable',failedChecks:missing,checks,message:ready.envelope?.message||'Readiness belum READY.'});
  } catch(e) { record('1 Deployment/database','health/ready','FAIL',{message:e.message}); }
  try { const r=await api('GET','/api/public/companies'); if(r.envelope?.success && Array.isArray(data(r))) record('1 Deployment/database','public companies','PASS',{count:data(r).length}); else record('1 Deployment/database','public companies','FAIL',{message:r.envelope?.message||'Respons registry tidak valid.'}); }
  catch(e) { record('1 Deployment/database','public companies','FAIL',{message:e.message}); }
  try { const r=await api('GET','/api/me'); if(denied(r)) record('2 Authorization','anonymous /api/me rejected','PASS',{apiStatus:r.envelope.status}); else record('2 Authorization','anonymous /api/me rejected','FAIL',{message:r.envelope?.success?'Anonymous request unexpectedly authenticated.':r.envelope?.message||'Unexpected denial status.'}); }
  catch(e) { record('2 Authorization','anonymous /api/me rejected','FAIL',{message:e.message}); }
  let accounts=[]; try { accounts=JSON.parse(process.env.HDOS_UAT_ACCOUNTS_JSON||'[]'); if(!Array.isArray(accounts)) throw new Error('must be an array'); } catch { record('2–6 Accounts','account config','FAIL',{message:'HDOS_UAT_ACCOUNTS_JSON must be a JSON array.'}); accounts=[]; }
  if(!accounts.length) record('2–6 Accounts','authenticated account checks','WARN',{message:'Belum ada akun UAT khusus; isi HDOS_UAT_ACCOUNTS_JSON. Jangan gunakan kredensial operator produksi.'});
  for(const [index,account] of accounts.entries()) {
    const label=String(account.label||('UAT account '+(index+1))); let token='';
    try {
      if(!account.email||!account.password) throw new Error('Akun wajib memiliki email dan password.');
      const login=await api('POST','/api/auth/login',{email:account.email,password:account.password}); const ld=data(login);
      if(!login.envelope?.success||!ld?.token||!ld?.user) { record('2 Authorization','login — '+label,'FAIL',{apiStatus:login.envelope?.status,message:login.envelope?.message||'Login failed.'}); continue; }
      token=String(ld.token); const me=await api('GET','/api/me',{},token); const user=data(me);
      if(!me.envelope?.success||!user?.id) { record('2 Authorization','identity — '+label,'FAIL',{message:me.envelope?.message||'/api/me identity missing.'}); continue; }
      record('2 Authorization','login and identity — '+label,'PASS',{companyCode:user.companyCode||'',roles:user.roles||[],roleVerified:user.roleVerified===true});
      for(const entity of ['inspections','hazards','picas','incidents']) {
        try { const r=await api('GET','/api/'+entity,{},token);
          if(r.envelope?.success&&Array.isArray(data(r))) { const codes=[...new Set(data(r).map(x=>String(x.companyCode||x.contractorCode||x.subkonCode||'').trim().toUpperCase()).filter(Boolean))].sort(); record('2 Authorization',entity+' list — '+label,'PASS',{count:data(r).length,observedCompanyCodes:codes,note:'Bandingkan cakupan dengan hak role pada checklist; hasil tidak otomatis dianggap lulus tenant isolation.'}); }
          else if(denied(r)) record('2 Authorization',entity+' list — '+label,'WARN',{apiStatus:r.envelope.status,message:r.envelope.message||'Denied; cocokkan dengan role.'});
          else record('2 Authorization',entity+' list — '+label,'FAIL',{apiStatus:r.envelope?.status,message:r.envelope?.message||'Invalid list response.'});
        } catch(e) { record('2 Authorization',entity+' list — '+label,'FAIL',{message:e.message}); }
      }
    } catch(e) { record('2 Authorization','account — '+label,'FAIL',{message:e.message}); }
    finally { if(token) try { await api('POST','/api/auth/logout',{},token); } catch(e) { record('2 Authorization','logout — '+label,'WARN',{message:e.message}); } }
  }
  const output={generatedAt:new Date().toISOString(),mode:'READ_ONLY',target:baseUrl.replace(/(\/s\/)[^/]+(\/exec)/,'$1[REDACTED]$2'),total:results.length,passed:results.filter(x=>x.status==='PASS').length,warnings:results.filter(x=>x.status==='WARN').length,failed:failures,results,limitations:['No operational records are created, updated, deleted, or uploaded.','Photo evidence, PICA/incident transitions, offline replay, two-device conflicts, and restore require isolated test data and browser/device interaction.','This smoke test is not production sign-off.']};
  console.log('\nUAT_RESULT_JSON='+JSON.stringify(output,null,2)); if(failures) process.exitCode=1;
}
main().catch(e=>{console.error('Live UAT stopped:',e.message);process.exitCode=1;});
