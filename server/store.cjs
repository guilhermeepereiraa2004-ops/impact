const { DatabaseSync } = require('node:sqlite');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SERVICES = [
  { id: 'basica', name: 'Lavagem Básica', description: 'Limpeza essencial para o dia a dia.', duration: 60, prices: { PM: 100, G: 140, GG: null }, icon: 'wash' },
  { id: 'detalhada', name: 'Lavagem Detalhada', description: 'Atenção a grades, emblemas e cada cantinho.', duration: 120, prices: { PM: 200, G: 240, GG: null }, icon: 'shine' },
  { id: 'higienizacao', name: 'Higienização', description: 'Limpeza profunda dos bancos e do interior.', duration: 180, prices: { PM: 350, G: 350, GG: null }, icon: 'drop' },
  { id: 'polimento', name: 'Polimento', description: 'Correção da pintura e recuperação do brilho.', duration: 240, prices: { PM: 500, G: 650, GG: null }, icon: 'shine' },
  { id: 'vitrificacao', name: 'Polimento + Vitrificação', description: 'Brilho espelhado e proteção para a pintura.', duration: 480, prices: { PM: 1800, G: 2000, GG: null }, icon: 'shield' },
  { id: 'motor', name: 'Tratamento do Motor', description: 'Limpeza técnica e cuidadosa do motor.', duration: 60, prices: { PM: 150, G: 150, GG: null }, icon: 'wash' },
  { id: 'chassi', name: 'Tratamento do Chassi', description: 'Limpeza inferior detalhada.', duration: 60, prices: { PM: 170, G: 170, GG: null }, icon: 'shield' },
  { id: 'parabrisa', name: 'Para-brisa', description: 'Descontaminação e cristalização.', duration: 60, prices: { PM: 100, G: 100, GG: null }, icon: 'drop' },
  { id: 'farol', name: 'Farol com Polímero', description: 'Restauração da transparência dos faróis.', duration: 90, prices: { PM: null, G: null, GG: null }, icon: 'shine' }
];
const DEFAULT_SETTINGS = { days: [1,2,3,4,5,6], open: '08:00', close: '18:00', interval: 30, leadMinutes: 60, horizonDays: 60, capacity: 1, durations: Object.fromEntries(SERVICES.map(s => [s.id, s.duration])) };
const STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function demand(value, message, status = 400) { if (!value) throw new AppError(message, status); }
function text(value, max = 150) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function minute(time) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Number(time.slice(0,2))*60 + Number(time.slice(3)) : NaN; }
function timeLabel(n) { return String(Math.floor(n/60)).padStart(2,'0') + ':' + String(n%60).padStart(2,'0'); }
function localDate(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year:'numeric',month:'2-digit',day:'2-digit' }).format(now); }
function validDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date+'T12:00:00-03:00')) && new Date(date+'T12:00:00Z').toISOString().slice(0,10) === date; }
function passwordHash(password, salt = randomBytes(16).toString('hex')) { return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
function passwordMatches(password, hash) { const [salt, expected] = hash.split(':'); const actual = passwordHash(password, salt).split(':')[1]; return timingSafeEqual(Buffer.from(actual,'hex'), Buffer.from(expected,'hex')); }
const tokenHash = token => createHash('sha256').update(token).digest('hex');

function createStore(filename, clock = () => new Date()) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive:true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, protocol TEXT UNIQUE NOT NULL, date TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS bookings_date ON bookings(date,start);
    CREATE TABLE IF NOT EXISTS blocks (id TEXT PRIMARY KEY, date TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, reason TEXT NOT NULL);
  `);
  db.prepare('INSERT OR IGNORE INTO settings VALUES (1,?)').run(JSON.stringify(DEFAULT_SETTINGS));
  const settings = () => JSON.parse(db.prepare('SELECT value FROM settings WHERE id=1').get().value);
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  function catalog() { const config = settings(); return SERVICES.map(s => ({...s,duration:config.durations[s.id]})); }
  function selection(ids, category) {
    demand(Array.isArray(ids) && ids.length > 0 && ids.length <= SERVICES.length, 'Escolha pelo menos um serviço.');
    demand(['PM','G','GG'].includes(category), 'Escolha o porte do veículo.');
    demand(new Set(ids).size === ids.length, 'Há serviços repetidos.');
    const services = catalog().filter(s => ids.includes(s.id));
    demand(services.length === ids.length, 'Serviço inválido.');
    demand(!(ids.includes('basica') && ids.includes('detalhada')), 'Escolha apenas um tipo de lavagem.');
    demand(!(ids.includes('polimento') && ids.includes('vitrificacao')), 'A vitrificação já inclui o polimento.');
    const duration = services.reduce((n,s) => n+s.duration,0);
    const consultation = services.some(s => s.prices[category] === null);
    const total = services.reduce((n,s) => n+(s.prices[category] || 0),0);
    return { services: services.map(s=>({id:s.id,name:s.name,price:s.prices[category],duration:s.duration})), duration,total,consultation };
  }
  function checkDate(date) {
    const config = settings();
    demand(typeof date === 'string' && validDate(date), 'Escolha uma data válida.');
    const day = Math.floor((Date.parse(date+'T12:00:00Z') - Date.parse(localDate(clock())+'T12:00:00Z'))/86400000);
    demand(day >= 0 && day <= config.horizonDays, `Escolha uma data nos próximos ${config.horizonDays} dias.`);
    return config;
  }
  function isFree(date, start, end, exclude) {
    const config = settings();
    if (!config.days.includes(new Date(date+'T12:00:00Z').getUTCDay())) return false;
    if (start < minute(config.open) || end > minute(config.close) || (start-minute(config.open)) % config.interval !== 0) return false;
    if (Date.parse(date+'T'+timeLabel(start)+':00-03:00') < clock().getTime() + config.leadMinutes*60000) return false;
    if (db.prepare('SELECT id FROM blocks WHERE date=? AND start<? AND end>?').get(date,end,start)) return false;
    const occupied = db.prepare("SELECT id,start,end FROM bookings WHERE date=? AND status!='cancelled' AND start<? AND end>?").all(date,end,start).filter(b=>b.id!==exclude);
    const events = [{ at:start, delta:1 }, { at:end, delta:-1 }];
    occupied.forEach(b=>events.push({at:Math.max(start,b.start),delta:1},{at:Math.min(end,b.end),delta:-1}));
    events.sort((a,b)=>a.at-b.at || a.delta-b.delta);
    let count=0; for (const event of events) { count+=event.delta; if(count>config.capacity) return false; }
    return true;
  }
  function availability(date, ids, category) {
    const config = checkDate(date); const quote = selection(ids,category); const slots=[];
    for (let start=minute(config.open);start+quote.duration<=minute(config.close);start+=config.interval) if (isFree(date,start,start+quote.duration)) slots.push(timeLabel(start));
    return { date,slots,...quote,closed:!config.days.includes(new Date(date+'T12:00:00Z').getUTCDay()) };
  }
  const decode = row => row ? { ...JSON.parse(row.data),id:row.id,protocol:row.protocol,date:row.date,time:timeLabel(row.start),endTime:timeLabel(row.end),status:row.status,created:row.created,updated:row.updated } : null;
  function createBooking(body) {
    const customer = { name:text(body.name,100),phone:text(body.phone,25).replace(/\D/g,''),email:text(body.email,150).toLowerCase() };
    demand(customer.name.length >= 3,'Informe seu nome completo.');
    demand(/^\d{10,13}$/.test(customer.phone),'Informe um telefone com DDD.');
    demand(!customer.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email),'Confira seu e-mail.');
    const vehicle = text(body.vehicle,100); demand(vehicle.length>=2,'Informe o modelo do veículo.');
    checkDate(body.date); const quote = selection(body.services,body.category); const start = minute(body.time);
    demand(Number.isFinite(start),'Escolha um horário válido.');
    return transaction(()=> {
      demand(isFree(body.date,start,start+quote.duration),'Esse horário não está mais disponível. Escolha outro.',409);
      const id=randomUUID(); const protocol='ID-'+randomBytes(4).toString('hex').toUpperCase(); const stamp=clock().toISOString();
      const data={customer,vehicle,category:body.category,notes:text(body.notes,1000),adminNotes:'',...quote};
      db.prepare('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?)').run(id,protocol,body.date,start,start+quote.duration,'pending',JSON.stringify(data),stamp,stamp);
      return decode(db.prepare('SELECT * FROM bookings WHERE id=?').get(id));
    });
  }
  function updateBooking(id, body) { return transaction(()=>{
    const old=db.prepare('SELECT * FROM bookings WHERE id=?').get(id); demand(old,'Agendamento não encontrado.',404);
    const data=JSON.parse(old.data); const date=body.date ?? old.date; const start=body.time === undefined ? old.start : minute(body.time); const status=body.status ?? old.status;
    demand(STATUSES.includes(status),'Status inválido.'); demand(Number.isFinite(start),'Horário inválido.'); demand(validDate(date),'Data inválida.');
    const changed=date!==old.date || start!==old.start || (old.status==='cancelled' && status!=='cancelled');
    if(changed && status!=='cancelled') { checkDate(date); demand(isFree(date,start,start+data.duration,id),'O novo horário não está disponível.',409); }
    if(body.adminNotes !== undefined) data.adminNotes=text(body.adminNotes,2000);
    db.prepare('UPDATE bookings SET date=?,start=?,end=?,status=?,data=?,updated=? WHERE id=?').run(date,start,start+data.duration,status,JSON.stringify(data),clock().toISOString(),id);
    return decode(db.prepare('SELECT * FROM bookings WHERE id=?').get(id));
  }); }
  function saveSettings(value) {
    demand(Array.isArray(value.days) && value.days.length && value.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6),'Selecione os dias de atendimento.');
    demand(Number.isFinite(minute(value.open)) && Number.isFinite(minute(value.close)) && minute(value.close)>minute(value.open),'Confira a abertura e o fechamento.');
    demand([15,30,60].includes(value.interval),'Intervalo inválido.');
    demand(Number.isInteger(value.capacity)&&value.capacity>=1&&value.capacity<=10,'Informe entre 1 e 10 vagas simultâneas.');
    demand(Number.isInteger(value.leadMinutes)&&value.leadMinutes>=0&&value.leadMinutes<=1440,'Antecedência inválida.');
    demand(Number.isInteger(value.horizonDays)&&value.horizonDays>=1&&value.horizonDays<=180,'Prazo de agenda inválido.');
    demand(value.durations && SERVICES.every(s=>Number.isInteger(value.durations[s.id])&&value.durations[s.id]>=30&&value.durations[s.id]<=600),'Use durações de 30 a 600 minutos.');
    const config={days:[...new Set(value.days)],open:value.open,close:value.close,interval:value.interval,capacity:value.capacity,leadMinutes:value.leadMinutes,horizonDays:value.horizonDays,durations:Object.fromEntries(SERVICES.map(s=>[s.id,value.durations[s.id]]))};
    db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(config)); return config;
  }
  function addBlock(body) {
    demand(validDate(body.date),'Data inválida.'); const start=minute(body.start),end=minute(body.end);
    demand(Number.isFinite(start)&&Number.isFinite(end)&&end>start,'Confira o período do bloqueio.');
    return transaction(()=>{
      demand(!db.prepare("SELECT id FROM bookings WHERE date=? AND status!='cancelled' AND start<? AND end>?").get(body.date,end,start),'Há agendamentos nesse período. Reagende ou cancele antes de bloquear.',409);
      const block={id:randomUUID(),date:body.date,start,end,reason:text(body.reason,150)||'Indisponível'};
      db.prepare('INSERT INTO blocks VALUES (?,?,?,?,?)').run(block.id,block.date,start,end,block.reason); return block;
    });
  }
  function setup(email,password) {
    demand(!db.prepare('SELECT id FROM admins').get(),'O administrador já foi configurado.',409);
    demand(typeof email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=150,'Informe um e-mail válido.');
    demand(typeof password==='string'&&password.length>=10&&password.length<=128,'Use uma senha de 10 a 128 caracteres.');
    db.prepare('INSERT INTO admins VALUES(1,?,?)').run(email.trim().toLowerCase(),passwordHash(password));
  }
  function login(email,password) {
    const admin=db.prepare('SELECT * FROM admins WHERE id=1').get();
    // Calcule o hash mesmo para um usuário inexistente.
    const matches=passwordMatches(typeof password==='string'?password:'',admin?.password || passwordHash('invalid-password','00000000000000000000000000000000'));
    demand(admin && typeof email==='string' && admin.email===email.trim().toLowerCase() && matches,'E-mail ou senha incorretos.',401);
    const token=randomBytes(32).toString('hex'); db.prepare('DELETE FROM sessions WHERE expires<?').run(clock().getTime());
    db.prepare('INSERT INTO sessions VALUES(?,?)').run(tokenHash(token),clock().getTime()+12*3600000); return token;
  }
  return {
    db,settings,catalog,availability,createBooking,updateBooking,saveSettings,addBlock,setup,login,
    setupRequired:()=>!db.prepare('SELECT id FROM admins').get(),
    authenticate:token=> typeof token==='string' && token.length===64 && Boolean(db.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').get(tokenHash(token),clock().getTime())),
    logout:token=>db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token||'')),
    listBookings:()=>db.prepare('SELECT * FROM bookings ORDER BY date,start').all().map(decode),
    listBlocks:()=>db.prepare('SELECT * FROM blocks ORDER BY date,start').all(),
    deleteBlock:id=>{ demand(db.prepare('DELETE FROM blocks WHERE id=?').run(id).changes,'Bloqueio não encontrado.',404); },
    changePassword:(current,next)=>{ const admin=db.prepare('SELECT * FROM admins WHERE id=1').get(); demand(typeof current==='string'&&passwordMatches(current,admin.password),'Senha atual incorreta.',401); demand(typeof next==='string'&&next.length>=10&&next.length<=128,'Use uma senha de 10 a 128 caracteres.'); db.prepare('UPDATE admins SET password=? WHERE id=1').run(passwordHash(next)); db.exec('DELETE FROM sessions'); },
    adminEmail:()=>db.prepare('SELECT email FROM admins WHERE id=1').get()?.email,
    close:()=>db.close()
  };
}
module.exports={createStore,AppError,localDate,timeLabel};
