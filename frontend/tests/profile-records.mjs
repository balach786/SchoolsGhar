import assert from 'node:assert/strict';
const base='http://127.0.0.1:4001/api';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'student@school.test',password:'Password123'})}).then(r=>r.json());
const headers={Authorization:'Bearer '+login.data.accessToken};
async function get(path){const res=await fetch(base+path,{headers});assert.equal(res.status,200,path);return res.json();}
const student=(await get('/students/me')).data;
const query=new URLSearchParams({studentId:student._id,sessionId:student.sessionId,limit:'20'});
const attendance=await get('/student-attendance?'+query);
const fees=await get('/student-fees?'+query);
const exams=await get('/exams?'+new URLSearchParams({sessionId:student.sessionId,classId:student.classId,published:'true',limit:'100'}));
assert.ok(attendance.data.length>0);assert.ok(fees.data.length>0);assert.ok(exams.data.length>0);
const result=(await get('/results/student?'+new URLSearchParams({studentId:student._id,examId:exams.data[0]._id}))).data;
assert.ok(result.subjects.length>0);assert.equal(typeof result.percentage,'number');
console.log(JSON.stringify({student:{id:student._id,name:student.fullName},attendance:attendance.data.length,fees:fees.data.length,resultSubjects:result.subjects.length,percentage:result.percentage}));
console.log('PASS populated student profile API contracts');
