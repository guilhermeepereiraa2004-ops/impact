const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createApp}=require('../server.cjs');
const {createStore}=require('../server/store.cjs');
const clock=()=>new Date('2026-11-02T10:00:00-03:00');
test('Demonstração abre sem login e permite testar a agenda sem alterar o banco real',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'impact-demo-'));const database=path.join(directory,'real.sqlite');
  let real=createStore(database,clock);real.setup('real@example.com','senha-do-banco-real');real.close();
  const {server,store}=createApp({database,clock,demo:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const request=(route,method='GET',body)=>fetch(base+route,{method,headers:{Origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  try{
    const auth=await(await request('/api/auth')).json();assert.equal(auth.demo,true);assert.equal(auth.authenticated,true);assert.equal(auth.setupRequired,false);
    const response=await request('/api/admin/bookings');assert.equal(response.status,200);const {bookings}=await response.json();assert.equal(bookings.length,4);assert.ok(bookings.every(b=>b.notes.includes('fictício')));
    const pending=bookings.find(b=>b.status==='pending');assert.equal((await request('/api/admin/bookings/'+pending.id,'PATCH',{status:'confirmed'})).status,200);
    assert.equal(store.listBookings().find(b=>b.id===pending.id).status,'confirmed');
    assert.equal((await request('/api/admin/password','POST',{current:'qualquer',next:'nova-senha-teste'})).status,403);
    assert.equal((await request('/api/setup','POST',{email:'demo@example.com',password:'senha-exemplo'})).status,403);
    real=createStore(database,clock);assert.equal(real.listBookings().length,0);assert.equal(real.adminEmail(),'real@example.com');assert.equal(real.authenticate(real.login('real@example.com','senha-do-banco-real')),true);real.close();
  }finally{await new Promise(resolve=>server.close(resolve));const resolved=path.resolve(directory);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Pasta temporária inválida');fs.rmSync(resolved,{recursive:true,force:true});}
});
test('Demonstração cria exemplos também em um dia sem expediente',()=>{const {store}=createApp({demo:true,clock:()=>new Date('2026-11-08T23:30:00-03:00')});try{assert.equal(store.listBookings()[0].date,'2026-11-09');}finally{store.close();}});
