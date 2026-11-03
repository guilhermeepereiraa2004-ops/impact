(() => {
  const {api,icon,money,duration,date:formatDate,escape:e}=Impact;
  const form=document.querySelector('#booking-form');const errorBox=document.querySelector('#booking-error');
  let catalog,settings,today,step=1,selected=[],category='PM',chosenTime='',slotVersion=0,receipt;
  const dateInput=document.querySelector('#booking-date');
  function showError(message) {errorBox.textContent=message;errorBox.hidden=!message;if(message)errorBox.scrollIntoView({behavior:'smooth',block:'center'});}
  function quote() {const services=catalog.filter(s=>selected.includes(s.id));return {services,total:services.reduce((n,s)=>n+(s.prices[category]||0),0),duration:services.reduce((n,s)=>n+s.duration,0),consultation:services.some(s=>s.prices[category]===null)};}
  function renderServices() {
    const focused=document.activeElement?.name==='services'?document.activeElement.value:null;
    document.querySelector('#service-options').innerHTML=catalog.map(s=>`<label class="service-option"><input type="checkbox" name="services" value="${s.id}" ${selected.includes(s.id)?'checked':''}><span class="service-card"><span class="service-card-top">${icon(s.icon)}<span class="service-check">${icon('check')}</span></span><strong>${e(s.name)}</strong><span class="service-description">${e(s.description)}</span><span class="service-card-bottom"><b>${s.prices[category]===null?'Sob consulta':money(s.prices[category])}</b><small>${duration(s.duration)}</small></span></span></label>`).join('');
    if(focused)document.querySelector(`#service-options [value="${focused}"]`)?.focus({preventScroll:true});
  }
  function renderSummary() {
    const q=quote();document.querySelector('#summary-services').innerHTML=q.services.length?q.services.map(s=>`<div class="summary-service"><span>${e(s.name)}</span><strong>${s.prices[category]===null?'A avaliar':money(s.prices[category])}</strong></div>`).join(''):'<p class="summary-empty">Escolha os serviços e acompanhe os detalhes por aqui.</p>';
    document.querySelector('#summary-category').textContent={PM:'Pequeno / Médio',G:'Grande',GG:'Extra grande'}[category];
    document.querySelector('#summary-duration').textContent=q.duration?duration(q.duration):'—';
    document.querySelector('#summary-date').textContent=chosenTime?formatDate(dateInput.value)+' às '+chosenTime:'A escolher';
    document.querySelector('#summary-total').textContent=q.services.length?(q.consultation?(q.total?money(q.total)+' + avaliação':'Sob consulta'):money(q.total)):'—';
    document.querySelector('#summary-footnote').textContent=q.consultation?'Serviços sob consulta serão orçados pela equipe antes da confirmação.':'Valor estimado. Sem pagamento antecipado.';
  }
  function go(next) {
    step=next;showError('');document.querySelectorAll('[data-step]').forEach(el=>el.hidden=Number(el.dataset.step)!==step);
    document.querySelectorAll('.stepper li').forEach((el,i)=>{el.classList.toggle('active',i+1===step);el.classList.toggle('done',i+1<step);if(i+1===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
    document.querySelector(`#step-title-${step}`).focus({preventScroll:true});document.querySelector('.stepper').scrollIntoView({behavior:'smooth',block:'start'});
    if(next===2) loadSlots();
  }
  function renderDates() {
    document.querySelector('#quick-dates').innerHTML=Array.from({length:6},(_,i)=>{const day=new Date(today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+i);const value=day.toISOString().slice(0,10);const closed=!settings.days.includes(day.getUTCDay());return `<button type="button" data-date="${value}" class="quick-date ${value===dateInput.value?'selected':''}" ${closed?'disabled':''}><small>${i===0?'Hoje':new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'}).format(day)}</small><strong>${String(day.getUTCDate()).padStart(2,'0')}</strong><small>${new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(day)}</small></button>`;}).join('');
  }
  async function loadSlots() {
    const version=++slotVersion;chosenTime='';renderSummary();renderDates();const container=document.querySelector('#time-slots');container.innerHTML='<p class="slots-message">Consultando horários…</p>';
    try {const result=await api(`/api/availability?date=${encodeURIComponent(dateInput.value)}&category=${category}&services=${selected.join(',')}`);if(version!==slotVersion)return;
      container.innerHTML=result.slots.length?result.slots.map(time=>`<label class="slot"><input type="radio" name="time" value="${time}"><span>${time}</span></label>`).join(''):`<p class="slots-message">${result.closed?'Não atendemos nesta data. Escolha um dia de funcionamento.':'Não há um período livre para esses serviços nesta data. Tente outro dia ou ajuste os cuidados escolhidos.'}</p>`;
    }catch(error){if(version===slotVersion)container.innerHTML=`<p class="slots-message">${e(error.message)}</p>`;}
  }
  form.addEventListener('change',event=>{
    if(event.target.name==='category'){category=event.target.value;chosenTime='';renderServices();}
    if(event.target.name==='services'){
      const id=event.target.value; if(event.target.checked){selected.push(id);const incompatible={basica:'detalhada',detalhada:'basica',polimento:'vitrificacao',vitrificacao:'polimento'}[id];selected=selected.filter(s=>s!==incompatible);}else selected=selected.filter(s=>s!==id);
      chosenTime='';renderServices();
    }
    if(event.target.name==='time')chosenTime=event.target.value;
    if(event.target.id==='booking-date')loadSlots();
    renderSummary();
  });
  document.querySelector('#quick-dates').addEventListener('click',event=>{const button=event.target.closest('[data-date]');if(button){dateInput.value=button.dataset.date;loadSlots();}});
  document.querySelector('#to-date').addEventListener('click',()=>{if(!selected.length)return showError('Escolha pelo menos um serviço para continuar.');go(2);});
  document.querySelector('#to-details').addEventListener('click',()=>{if(!chosenTime)return showError('Escolha um horário disponível.');go(3);});
  document.querySelectorAll('[data-back]').forEach(button=>button.addEventListener('click',()=>go(Number(button.dataset.back))));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(step!==3)return;if(!form.reportValidity())return;
    const button=document.querySelector('#submit-booking');button.disabled=true;button.textContent='Registrando seu pedido…';showError('');
    try {
      const data=Object.fromEntries(new FormData(form));receipt=await api('/api/bookings',{method:'POST',body:{name:data.name,phone:data.phone,email:data.email,vehicle:data.vehicle,notes:data.notes,date:dateInput.value,time:chosenTime,services:selected,category}});
      document.querySelector('#booking-layout').hidden=true;document.querySelector('.booking-heading').hidden=true;document.querySelector('#booking-success').hidden=false;
      document.querySelector('#receipt').innerHTML=`<div class="receipt-protocol"><span>SEU PROTOCOLO</span><strong>${e(receipt.protocol)}</strong><span class="status pending">Aguardando confirmação</span></div><dl><div><dt>Data e hora</dt><dd>${formatDate(receipt.date)} · ${receipt.time}</dd></div><div><dt>Veículo</dt><dd>${e(receipt.vehicle)}</dd></div><div><dt>Cuidados</dt><dd>${receipt.services.map(s=>e(s.name)).join(', ')}</dd></div><div><dt>Valor estimado</dt><dd>${receipt.consultation?(receipt.total?money(receipt.total)+' + serviços sob consulta':'Sob consulta'):money(receipt.total)}</dd></div></dl>`;
      document.querySelector('#success-title').focus();window.scrollTo({top:0,behavior:'smooth'});
    }catch(error){if(error.status===409){go(2);showError(error.message);}else showError(error.message);}
    finally {button.disabled=false;button.innerHTML='Solicitar agendamento '+icon('check');}
  });
  api('/api/catalog').then(data=>{
    catalog=data.services;settings=data.settings;today=data.today;dateInput.min=today;
    const max=new Date(today+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+settings.horizonDays);dateInput.max=max.toISOString().slice(0,10);
    let first=new Date(today+'T12:00:00Z');for(let i=0;i<7&&!settings.days.includes(first.getUTCDay());i++)first.setUTCDate(first.getUTCDate()+1);dateInput.value=first.toISOString().slice(0,10);
    document.querySelector('#hours-description').textContent='Atendimento das '+settings.open+' às '+settings.close+'. Antecedência mínima: '+duration(settings.leadMinutes)+'.';
    const preselect=new URLSearchParams(location.search).get('servico');if(catalog.some(s=>s.id===preselect))selected=[preselect];
    renderServices();renderSummary();document.querySelector('#loading-booking').hidden=true;form.hidden=false;
  }).catch(error=>{document.querySelector('#loading-booking').textContent='Não foi possível carregar o agendamento.';showError(error.message);});
})();
