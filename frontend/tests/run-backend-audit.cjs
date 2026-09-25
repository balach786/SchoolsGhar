const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
fs.mkdirSync(path.join(__dirname,'qa-results'),{recursive:true});
const results=[];
for(const suite of ['foundation','auth','academic','attendance','exams','finance','prompt7','prompt9','prompt10','saas','isolation_and_billing']) {
 const r=spawnSync(process.execPath,[path.join(__dirname,'qa-environment.cjs'),'--suite',suite],{encoding:'utf8',timeout:240000});
 fs.writeFileSync(path.join(__dirname,'qa-results',suite+'.log'),(r.stdout||'')+(r.stderr||''));
 const result={suite,exit:r.status,error:r.error?.message};results.push(result);console.log(JSON.stringify(result));
}
fs.writeFileSync(path.join(__dirname,'qa-results','summary.json'),JSON.stringify(results,null,2));
process.exitCode=results.some(r=>r.exit!==0)?1:0;
