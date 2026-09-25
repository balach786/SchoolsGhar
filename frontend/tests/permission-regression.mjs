import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4001/api';
const suffix = Date.now();
let passed = 0, failed = 0;
async function call(path, token, method = 'GET', body) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
  return { status:r.status, body:await r.json().catch(()=>null) };
}
function check(name, actual, expected) { if(actual===expected){passed++;console.log('PASS '+name);}else{failed++;console.log(`FAIL ${name}: expected ${expected}, got ${actual}`);} }
async function login(email,password='Password123') { const r=await call('/auth/login',null,'POST',{email,password}); assert.equal(r.status,200,email); return r.body.data; }
const sessions={};
for(const role of ['superadmin','admin','teacher','student','accountant','receptionist']) {
  sessions[role]=await login(`${role}@school.test`);
  check(`${role} Users gate`,(await call('/users',sessions[role].accessToken)).status,['admin','superadmin'].includes(role)?200:403);
  check(`${role} platform separation`,(await call('/platform/customers',sessions[role].accessToken)).status,403);
}
check('accountant cannot write marks',(await call('/marks/bulk',sessions.accountant.accessToken,'POST',{})).status,403);
const p=await call('/platform/auth/login',null,'POST',{email:'platformadmin@saas.school',password:'PlatformAdmin2026!'});
check('platform login',p.status,200);
check('platform cannot enter tenant Users',(await call('/users',p.body.data.accessToken)).status,403);
const schools=[];
for(const letter of ['a','b']) {
 const r=await call('/public/register',null,'POST',{schoolName:`Motion QA ${letter} ${suffix}`,ownerName:'QA Owner',email:`motion-${letter}-${suffix}@school.test`,phone:'+923001234567',city:'Karachi',country:'Pakistan',password:'Password123',confirmPassword:'Password123'});
 assert.equal(r.status,201); schools.push(r.body.data);
}
const [a,b]=schools;
const roleRes=await call('/roles',a.accessToken); assert.equal(roleRes.status,200);
const roles=roleRes.body.data;
const teacher=roles.find(r=>r.slug==='teacher'), admin=roles.find(r=>r.slug==='admin');
const email=`motion-user-${suffix}@school.test`;
const created=await call('/users',a.accessToken,'POST',{name:'Motion QA User',email,password:'Password123',roleId:teacher._id,isActive:true});
assert.equal(created.status,201);const user=created.body.data.user;
const oldSession=await login(email);
check('teacher rejected before promotion',(await call('/users',oldSession.accessToken)).status,403);
check('owner assigns admin',(await call(`/users/${user._id}`,a.accessToken,'PATCH',{roleId:admin._id})).status,200);
check('promoted admin works with existing access token',(await call('/users',oldSession.accessToken)).status,200);
const adminSession=await login(email);
check('owner restores teacher',(await call(`/users/${user._id}`,a.accessToken,'PATCH',{roleId:teacher._id})).status,200);
check('demotion immediately enforced',(await call('/users',oldSession.accessToken)).status,403);
check('old admin token loses access after demotion',(await call('/users',adminSession.accessToken)).status,403);
check('cross-school user read',(await call(`/users/${user._id}`,b.accessToken)).status,404);
check('cross-school user edit',(await call(`/users/${user._id}`,b.accessToken,'PATCH',{name:'Cross School Attempt'})).status,404);
check('cross-school activation',(await call(`/users/${user._id}/activate`,b.accessToken,'POST')).status,404);
check('cross-school deactivation',(await call(`/users/${user._id}/deactivate`,b.accessToken,'POST')).status,404);
check('same-school activation',(await call(`/users/${user._id}/activate`,a.accessToken,'POST')).status,200);
check('school A filters users',(await call(`/users?search=${email}&role=teacher&status=active`,a.accessToken)).body?.pagination?.total,1);
check('school B cannot list school A user',(await call(`/users?search=${email}`,b.accessToken)).body?.pagination?.total,0);
const assigned=await call(`/roles/${teacher._id}/users`,b.accessToken);
check('role member list stays in school',assigned.body?.data?.some(u=>u._id===user._id),false);
// A permission change in A must not grant B's teacher access.
const bUser=await call('/users',b.accessToken,'POST',{name:'Other QA Teacher',email:`motion-other-${suffix}@school.test`,password:'Password123',roleId:teacher._id,isActive:true});
assert.equal(bUser.status,201);
const bSession=await login(`motion-other-${suffix}@school.test`);
const permissions=Object.fromEntries(teacher.permissions.map(p=>[p.module,p.actions]));
try {
 check('school A can customize permissions',(await call(`/roles/${teacher._id}/permissions`,a.accessToken,'PUT',{permissions:{...permissions,users:['view']}})).status,200);
 check('school B permissions unaffected',(await call('/users',bSession.accessToken)).status,403);
 check('users manager can load Users role options',(await call('/users/roles',oldSession.accessToken)).status,200);
 check('users manager cannot enter role editor',(await call('/roles',oldSession.accessToken)).status,403);
} finally { await call(`/roles/${teacher._id}/permissions`,a.accessToken,'PUT',{permissions}); }
for(const school of schools) for(const path of ['/students','/teachers','/classes','/student-attendance','/exams','/student-fees','/school-settings']) {
 const r=await call(path,school.accessToken);check(`new school isolated ${path}`,r.status,200);
 if(Array.isArray(r.body?.data)) check(`new school empty ${path}`,r.body.data.length,0);
}
console.log(`Permission regression: ${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
