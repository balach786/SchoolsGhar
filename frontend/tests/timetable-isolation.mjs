import assert from 'node:assert/strict';
const base='http://127.0.0.1:4001/api';
async function api(path,token,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
const a=(await api('/auth/login',null,'POST',{email:'superadmin@school.test',password:'Password123'})).body.data.accessToken;
const registration=await api('/public/register',null,'POST',{schoolName:'Timetable QA '+Date.now(),ownerName:'QA Owner',email:'timetable-'+Date.now()+'@school.test',phone:'+923001234567',city:'Karachi',country:'Pakistan',password:'Password123',confirmPassword:'Password123'});
assert.equal(registration.status,201);const b=registration.body.data.accessToken;
const sessions=(await api('/academic-sessions?limit=100',a)).body.data;
const sessionId=sessions.find(s=>s.isActive)._id;
const classId=(await api('/classes?sessionId='+sessionId,a)).body.data[0]._id;
const sectionId=(await api('/sections?classId='+classId,a)).body.data[0]._id;
const body={sessionId,classId,sectionId,periods:[{dayOfWeek:6,periodNumber:20,startTime:'23:00',endTime:'23:45',isBreak:true}]};
const made=await api('/timetables',a,'POST',body);assert.equal(made.status,201,JSON.stringify(made.body));const id=made.body.data[0]._id;
let passed=0;function check(name,actual,expected){assert.equal(actual,expected,name);passed++;console.log('PASS '+name);}
const query=new URLSearchParams({sessionId,classId,sectionId});
try {
 check('own period can be read',(await api('/timetables?'+query,a)).body.data.some(p=>p._id===id),true);
 check('cross-school timetable read blocked',(await api('/timetables?'+query,b)).status,404);
 check('cross-school reference creation blocked',(await api('/timetables',b,'POST',body)).status,404);
 check('cross-school period edit blocked',(await api('/timetables/periods/'+id,b,'PATCH',{startTime:'22:00'})).status,404);
 check('cross-school period deletion removes nothing',(await api('/timetables/periods',b,'DELETE',{periodIds:[id]})).body.data.removed,0);
 check('owner period survives cross-school attempts',(await api('/timetables?'+query,a)).body.data.some(p=>p._id===id),true);
}finally{check('owner can remove its disposable period',(await api('/timetables/periods',a,'DELETE',{periodIds:[id]})).body.data.removed,1);}
console.log(`Timetable isolation: ${passed} passed, 0 failed`);
