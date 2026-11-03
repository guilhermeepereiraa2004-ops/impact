const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createStore, AppError, localDate } = require('./server/store.cjs');

function createApp({ database = path.join(__dirname,'data','impact.sqlite'), clock, demo = false } = {}) {
  const now=clock || (()=>new Date());
  let seeding=demo;
  const store=createStore(demo?':memory:':database,()=>seeding?new Date(localDate(now())+'T00:00:00-03:00'):now());
  if(demo)require('./server/demo.cjs').seedDemo(store,localDate(now()));
  seeding=false;
  const limits=new Map();
  function limit(req,key,max,windowMs) {
    const id=key+req.socket.remoteAddress; const now=Date.now(); const entry=limits.get(id);
    if(!entry || entry.until<now) limits.set(id,{count:1,until:now+windowMs});
    else { entry.count++; if(entry.count>max) throw new AppError('Muitas tentativas. Aguarde alguns minutos e tente novamente.',429); }
    if(limits.size>2000) for(const [key,value] of limits) if(value.until<now) limits.delete(key);
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      const host=req.headers.host||'';
      if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw new AppError('Host não autorizado.',403);
      const url=new URL(req.url,'http://'+host); const route=url.pathname; const method=req.method;
      if(route.startsWith('/api/')) {
        let body={};
        if(!['GET','HEAD'].includes(method)) {
          if(req.headers.origin!=='http://'+host) throw new AppError('Origem da requisição inválida.',403);
          if(!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Envie JSON.',415);
          let raw=''; for await(const chunk of req) { raw+=chunk; if(Buffer.byteLength(raw)>16384) throw new AppError('Requisição muito grande.',413); }
          try { body=JSON.parse(raw||'{}'); } catch { throw new AppError('JSON inválido.'); }
          if(!body || Array.isArray(body)||typeof body!=='object') throw new AppError('Dados inválidos.');
        }
        const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('impact_session='))?.split('=')[1];
        const authenticated=demo || store.authenticate(token);
        if(route.startsWith('/api/admin/')&&!authenticated) throw new AppError('Entre novamente para continuar.',401);
        const cookie=value=>res.setHeader('Set-Cookie',`impact_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value?43200:0}`);
        if(method==='GET' && route==='/api/catalog') return send(200,{ services:store.catalog(), settings:store.settings(), today:localDate(clock?.()),timezone:'America/Bahia' });
        if(method==='GET' && route==='/api/availability') return send(200,store.availability(url.searchParams.get('date'),(url.searchParams.get('services')||'').split(',').filter(Boolean),url.searchParams.get('category')));
        if(method==='POST' && route==='/api/bookings') {limit(req,'booking',20,3600000); const b=store.createBooking(body); const {adminNotes,...receipt}=b;return send(201,receipt);}
        if(method==='GET' && route==='/api/auth') return send(200,{demo,setupRequired:demo?false:store.setupRequired(),authenticated,email:demo?'Acesso sem login':authenticated?store.adminEmail():undefined});
        if(demo && ['/api/setup','/api/login','/api/admin/password'].includes(route)) throw new AppError('O modo de demonstração não usa contas ou senhas.',403);
        if(method==='POST' && route==='/api/setup') {limit(req,'auth',10,900000);store.setup(body.email,body.password);cookie(store.login(body.email,body.password));return send(201,{ok:true});}
        if(method==='POST' && route==='/api/login') {limit(req,'auth',10,900000);cookie(store.login(body.email,body.password));return send(200,{ok:true});}
        if(method==='POST' && route==='/api/logout') {store.logout(token);cookie('');return send(200,{ok:true});}
        if(method==='GET' && route==='/api/admin/bookings') return send(200,{bookings:store.listBookings(),blocks:store.listBlocks()});
        if(method==='PATCH' && /^\/api\/admin\/bookings\/[\w-]+$/.test(route)) return send(200,store.updateBooking(route.split('/').pop(),body));
        if(method==='PUT' && route==='/api/admin/settings') return send(200,store.saveSettings(body));
        if(method==='POST' && route==='/api/admin/blocks') return send(201,store.addBlock(body));
        if(method==='DELETE' && /^\/api\/admin\/blocks\/[\w-]+$/.test(route)) {store.deleteBlock(route.split('/').pop());return send(200,{ok:true});}
        if(method==='POST' && route==='/api/admin/password') {store.changePassword(body.current,body.next);cookie('');return send(200,{ok:true});}
        throw new AppError('Recurso não encontrado.',404);
      }
      if(!['GET','HEAD'].includes(method)) throw new AppError('Método não permitido.',405);
      const pages={'/':'index.html','/index.html':'index.html','/agendar':'agendar.html','/agendar.html':'agendar.html','/admin':'admin.html','/admin.html':'admin.html'};
      const relative=pages[route] || (route.startsWith('/assets/') ? decodeURIComponent(route).slice(1):route==='/catalogo_impact_detail_com_medidas.pdf'?route.slice(1):null);
      if(!relative) throw new AppError('Página não encontrada.',404);
      const filename=path.resolve(__dirname,relative);
      if(!filename.startsWith(__dirname+path.sep)) throw new AppError('Página não encontrada.',404);
      const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.pdf':'application/pdf'};
      const type=types[path.extname(filename)]; if(!type) throw new AppError('Página não encontrada.',404);
      const data=await fs.promises.readFile(filename);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(method==='HEAD'?undefined:data);
    } catch(e) { if(e.status || e.code==='ENOENT') send(e.status||404,{error:e.message && e.status?e.message:'Página não encontrada.'}); else {console.error(e);send(500,{error:'Não foi possível concluir. Tente novamente.'});} }
  });
  server.on('close',()=>store.close());
  return {server,store};
}
if(require.main===module) { const demo=process.argv.includes('--demo');const {server}=createApp({demo});const port=Number(process.env.PORT)||5500;server.listen(port,'127.0.0.1',()=>console.log(`Impact Detail${demo?' — demonstração sem login':''}: http://127.0.0.1:${port}\nAgendamento: http://127.0.0.1:${port}/agendar\nAdmin: http://127.0.0.1:${port}/admin`)); }
module.exports={createApp};
