// Each suite has a fresh server/rate-limit state; all data stays in the named QA database.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../backend');
require(path.join(root,'node_modules/dotenv')).config({path:path.join(root,'.env'),quiet:true});
const uri=new URL(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/school_management');uri.pathname='/school_motion_permission_qa_20260909';
const env={...process.env,MONGODB_URI:uri.toString(),NODE_ENV:'test',PORT:'4002',AUTH_RATE_LIMIT_MAX:'200',API_RATE_LIMIT_MAX:'1000',UPLOAD_DIR:path.join(__dirname,'qa-uploads'),PLATFORM_ADMIN_EMAIL:'platformadmin@saas.school',PLATFORM_ADMIN_INITIAL_PASSWORD:'PlatformAdmin2026!'};
const loader=require.resolve('tsx/cjs',{paths:[root]});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const summaries=[];
 for(const suite of process.argv.slice(2)) {
  if(!/^[a-z0-9_]+$/.test(suite))throw new Error('Invalid suite');
  uri.pathname='/smsqa_'+suite.slice(0,10)+'_'+Date.now().toString(36);env.MONGODB_URI=uri.toString();
  for(const script of ['seed','migrateSaas','bootstrapPlatformAdmin']) {
   const setup=spawn(process.execPath,['--require',loader,`src/scripts/${script}.ts`],{cwd:root,env,stdio:['ignore','ignore','pipe']});
   let errors='';setup.stderr.on('data',d=>errors+=d);
   if(await new Promise(r=>setup.on('close',r))!==0)throw new Error('Isolated setup failed: '+errors);
  }
  const server=spawn(process.execPath,['--require',loader,'src/server.ts'],{cwd:root,env,stdio:['ignore','ignore','pipe']});
  let serverErrors='';server.stderr.on('data',d=>serverErrors+=d);
  try {
   let ready=false;
   for(let attempt=0;attempt<45;attempt++){try{ready=(await fetch('http://127.0.0.1:4002/api/health')).ok;}catch{}if(ready)break;await sleep(1000);}
   if(!ready)throw new Error('QA server not ready: '+serverErrors);
   const output=fs.createWriteStream(path.join(__dirname,'qa-results',suite+'.log'));
   const test=spawn(process.execPath,[`tests/${suite}.test.mjs`,'http://127.0.0.1:4002'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
   test.stdout.pipe(output);test.stderr.pipe(output);
   const exit=await new Promise(resolve=>test.on('close',resolve));
   const result={suite,exit};summaries.push(result);console.log(JSON.stringify(result));
  }finally{server.kill();await new Promise(r=>server.once('close',r));}
 }
 fs.writeFileSync(path.join(__dirname,'qa-results','isolated-summary.json'),JSON.stringify(summaries,null,2));
 process.exitCode=summaries.some(r=>r.exit!==0)?1:0;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
