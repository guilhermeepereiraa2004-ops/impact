(() => {
  const {api,icon,money,duration,date:formatDate,escape:e}=Impact;
  const statusNames={pending:'Aguardando confirmação',confirmed:'Confirmado',in_progress:'Em atendimento',completed:'Concluído',cancelled:'Cancelado'};
  let bookings=[],blocks=[],catalog=[],settings={},today='',range='today',view='agenda',setupRequired=false;
  const authScreen=document.querySelector('#auth-screen'),shell=document.querySelector('#admin-shell'),dialog=document.querySelector('#booking-dialog');
  const cashDialog = document.querySelector('#cash-dialog');
  const cashForm = document.querySelector('#cash-form');
  const cashMonth = document.querySelector('#cash-month');
  const cashList = document.querySelector('#cash-list');
  const cashError = document.querySelector('#cash-error');
  const cashMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const cashStatus = {
    pending: { label: 'A receber', className: 'pending' },
    received: { label: 'Recebido', className: 'confirmed' },
    expense: { label: 'Saída', className: 'cancelled' },
  };
  const cashActions = {
    income: { title: 'Nova entrada', confirm: 'Confirmar entrada', placeholder: 'Ex.: venda de produto', route: 'income', success: 'Entrada registrada.' },
    expense: { title: 'Nova saída', confirm: 'Salvar saída', placeholder: 'Ex.: compra de produtos', route: 'expenses', success: 'Saída registrada.' },
    receipt: { title: 'Registrar recebimento', confirm: 'Confirmar recebimento', success: 'Recebimento registrado.' },
  };
  let cashEntries = [];
  let cashTarget;
  let cashLoadId = 0;
  function notice(message,error=false) {const el=document.querySelector('#admin-notice');el.hidden=!message;el.textContent=message;el.className='notice '+(error?'error':'success');if(message)el.scrollIntoView({behavior:'smooth',block:'nearest'});}
  function authError(message){const el=document.querySelector('#auth-error');el.textContent=message;el.hidden=!message;}
  function authView(setup=false){setupRequired=setup;authScreen.hidden=false;shell.hidden=true;document.querySelector('#repeat-password-label').hidden=!setup;document.querySelector('#repeat-password').required=setup;document.querySelector('#auth-password').minLength=setup?10:1;document.querySelector('#auth-password').autocomplete=setup?'new-password':'current-password';document.querySelector('#auth-title').textContent=setup?'Seu primeiro acesso.':'Bem-vindo de volta.';document.querySelector('#auth-description').textContent=setup?'Crie o acesso administrativo para começar a organizar os atendimentos.':'Entre para acompanhar a agenda e cuidar da operação.';document.querySelector('#auth-submit').innerHTML=(setup?'Criar acesso e entrar':'Entrar no painel')+icon('arrow');document.querySelector('#auth-note').textContent=setup?'Escolha uma senha de pelo menos 10 caracteres. Guarde os dados de acesso.':'Acesso exclusivo da equipe Impact Detail.';}
  async function guarded(task) {try{return await task();}catch(error){if(error.status===401){document.querySelector('dialog[open]')?.close();authView();authError('Sua sessão terminou. Entre novamente.');}else notice(error.message,true);}}
  async function load(){const [data,config]=await Promise.all([api('/api/admin/bookings'),api('/api/catalog')]);bookings=data.bookings;blocks=data.blocks;catalog=config.services;settings=config.settings;today=config.today;renderAgenda();renderClients();renderBlocks();}
  function switchView(next) {
    view = next;
    document.querySelectorAll('.admin-view').forEach(el => el.hidden = el.id !== 'view-' + view);
    document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    document.querySelector('#view-breadcrumb').textContent = { agenda: 'Agenda', clientes: 'Clientes', caixa: 'Fluxo de caixa', configuracoes: 'Configurações' }[view];
    notice('');
    if (view === 'configuracoes') renderSettings();
    if (view === 'caixa') guarded(loadCashFlow);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadCashFlow() {
    const loadId = ++cashLoadId;
    const { entries } = await api('/api/admin/cash-flow');
    if (loadId !== cashLoadId) return;
    cashEntries = entries;
    renderCashFlow();
  }

  function renderCashFlow() {
    const month = cashMonth.value;
    const entries = cashEntries.filter(entry => !month || entry.date.startsWith(month + '-'));
    const totals = { pending: 0, received: 0, expense: 0 };
    let unpriced = 0;
    for (const entry of entries) {
      totals[entry.type] += entry.amountCents ?? 0;
      if (entry.amountCents === null) unpriced++;
    }
    const balance = totals.received - totals.expense;
    const formatted = cents => cashMoney.format(cents / 100);
    document.querySelector('#cash-pending').textContent = formatted(totals.pending);
    document.querySelector('#cash-pending-note').textContent = unpriced ? `${unpriced} ${unpriced === 1 ? 'pedido com valor a definir' : 'pedidos com valor a definir'}` : 'Pedidos com valor definido';
    document.querySelector('#cash-received').textContent = formatted(totals.received);
    document.querySelector('#cash-expenses').textContent = formatted(totals.expense);
    const balanceDisplay = document.querySelector('#cash-balance');
    balanceDisplay.textContent = formatted(balance);
    balanceDisplay.classList.toggle('cash-negative', balance < 0);
    document.querySelector('#cash-count').textContent = `${entries.length} ${entries.length === 1 ? 'lançamento' : 'lançamentos'}`;
    document.querySelector('#cash-clear-month').hidden = !month;

    if (!entries.length) {
      cashList.innerHTML = '<p class="empty-state">Nenhum lançamento neste período.</p>';
      return;
    }
    const rows = entries.map(entry => {
      const status = cashStatus[entry.type];
      const amount = entry.amountCents === null ? 'Sob consulta' : formatted(entry.amountCents);
      let source = '';
      if (entry.protocol) source = `<small>${e(entry.protocol)} · ${e(entry.customer)}</small>`;
      else if (entry.type === 'received') source = '<small>Entrada avulsa</small>';
      const action = entry.type === 'pending'
        ? `<button class="outline-btn small" type="button" data-receive="${e(entry.id)}" aria-label="Registrar recebimento do pedido ${e(entry.protocol)}">Registrar recebimento</button>` : '';
      return `<tr>
        <td>${formatDate(entry.date)}</td>
        <td><strong>${e(entry.description)}</strong>${source}</td>
        <td><span class="status ${status.className}">${status.label}</span></td>
        <td class="cash-amount${entry.type === 'expense' ? ' cash-negative' : ''}">${amount}</td>
        <td>${action}</td>
      </tr>`;
    }).join('');
    cashList.innerHTML = `<div class="table-scroll"><table class="bookings-table cash-table">
      <thead><tr><th>Data</th><th>Descrição</th><th>Status</th><th>Valor</th><th scope="col">Ação</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function openCashDialog(type, entry) {
    const action = cashActions[type];
    cashTarget = { id: entry?.id ?? crypto.randomUUID(), type };
    cashForm.reset();
    cashError.hidden = true;
    cashForm.elements.description.disabled = Boolean(entry);
    cashForm.elements.description.placeholder = action.placeholder ?? '';
    document.querySelector('#cash-description-field').hidden = Boolean(entry);
    document.querySelector('#cash-dialog-title').textContent = action.title;
    document.querySelector('#cash-submit-label').textContent = action.confirm;
    const orderLabel = document.querySelector('#cash-dialog-order');
    orderLabel.hidden = !entry;
    orderLabel.textContent = entry ? `${entry.protocol} · ${entry.customer}` : '';
    cashForm.elements.date.max = today;
    cashForm.elements.date.value = today;
    if (entry && entry.amountCents !== null) cashForm.elements.amount.value = (entry.amountCents / 100).toFixed(2);
    cashDialog.showModal();
  }

  document.querySelector('#new-cash-income').addEventListener('click', () => openCashDialog('income'));
  document.querySelector('#new-cash-expense').addEventListener('click', () => openCashDialog('expense'));
  cashMonth.addEventListener('change', renderCashFlow);
  document.querySelector('#cash-clear-month').addEventListener('click', () => {
    cashMonth.value = '';
    renderCashFlow();
    cashMonth.focus();
  });
  cashList.addEventListener('click', event => {
    const button = event.target.closest('[data-receive]');
    if (!button) return;
    const entry = cashEntries.find(item => item.id === button.dataset.receive && item.type === 'pending');
    if (entry) openCashDialog('receipt', entry);
  });
  const cashButtons = cashDialog.querySelectorAll('button');
  const cashSubmit = cashForm.querySelector('[type="submit"]');
  for (const id of ['close-cash-dialog', 'cancel-cash-dialog']) {
    document.querySelector('#' + id).addEventListener('click', () => cashDialog.close());
  }
  cashDialog.addEventListener('cancel', event => {
    if (cashSubmit.disabled) event.preventDefault();
  });
  cashForm.addEventListener('submit', event => {
    event.preventDefault();
    guarded(async () => {
      const action = cashActions[cashTarget.type];
      const receipt = cashTarget.type === 'receipt';
      const { amount, date, description } = Object.fromEntries(new FormData(cashForm));
      const body = { amountCents: Math.round(Number(amount) * 100), date };
      if (!receipt) Object.assign(body, { id: cashTarget.id, description });
      const route = receipt ? `receipts/${encodeURIComponent(cashTarget.id)}` : action.route;
      cashButtons.forEach(button => button.disabled = true);
      cashError.hidden = true;
      try {
        await api(`/api/admin/cash-flow/${route}`, { method: 'POST', body });
      } catch (error) {
        if (error.status === 401) throw error;
        cashError.textContent = error.message;
        cashError.hidden = false;
        return;
      } finally {
        cashButtons.forEach(button => button.disabled = false);
      }
      cashDialog.close();
      if (cashMonth.value) cashMonth.value = date.slice(0, 7);
      await loadCashFlow();
      notice(action.success);
    });
  });
  function filtered(){const selectedDate=document.querySelector('#filter-date').value;const status=document.querySelector('#filter-status').value;const query=document.querySelector('#search-bookings').value.toLowerCase().trim();return bookings.filter(b=>(selectedDate?b.date===selectedDate:range==='today'?b.date===today:range==='upcoming'?b.date>=today:true)&&(!status||b.status===status)&&(!query||[b.customer.name,b.customer.phone,b.vehicle,b.protocol].some(s=>s.toLowerCase().includes(query))));}
  function renderAgenda(){
    const list=filtered();const active=list.filter(b=>b.status!=='cancelled');
    document.querySelector('#stat-total').textContent=active.length;document.querySelector('#stat-pending').textContent=list.filter(b=>b.status==='pending').length;document.querySelector('#stat-confirmed').textContent=list.filter(b=>['confirmed','in_progress'].includes(b.status)).length;document.querySelector('#stat-revenue').textContent=money(list.filter(b=>b.status==='completed').reduce((n,b)=>n+b.total,0));
    document.querySelector('#agenda-count').textContent=`${list.length} ${list.length===1?'agendamento encontrado':'agendamentos encontrados'}${range==='today'&&!document.querySelector('#filter-date').value?' · '+formatDate(today):''}`;
    const container=document.querySelector('#bookings-list');
    if(!list.length){container.innerHTML=`<div class="empty-state">${icon('calendar')}<h3>Espaço para novos cuidados.</h3><p>Nenhum agendamento neste filtro. As solicitações dos clientes aparecerão aqui.</p><a class="outline-btn small" href="/agendar" target="_blank" rel="noopener">Criar um agendamento ${icon('arrow')}</a></div>`;return;}
    container.innerHTML=`<div class="table-scroll"><table class="bookings-table"><thead><tr><th>Horário / data</th><th>Cliente e veículo</th><th>Cuidados</th><th>Status</th><th>Estimativa</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${list.map(b=>`<tr><td><strong class="table-time">${b.time}</strong><small>${formatDate(b.date)}</small></td><td><strong>${e(b.customer.name)}</strong><small>${e(b.vehicle)} · ${e(b.category)}</small></td><td><span>${b.services.map(s=>e(s.name)).join('<br>')}</span><small>${duration(b.duration)} reservados</small></td><td><span class="status ${b.status}">${statusNames[b.status]}</span></td><td><strong>${b.consultation?(b.total?money(b.total)+' + avaliação':'Sob consulta'):money(b.total)}</strong></td><td><button class="table-detail" type="button" data-booking="${b.id}" aria-label="Detalhes de ${e(b.customer.name)}">Detalhes ${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderClients(){const query=document.querySelector('#search-clients').value.toLowerCase().trim();const map=new Map();bookings.forEach(b=>{const key=b.customer.phone;const customer=map.get(key)||{...b.customer,vehicles:new Set(),count:0,last:b.date};customer.vehicles.add(b.vehicle);customer.count++;if(b.date>customer.last)customer.last=b.date;map.set(key,customer);});const clients=[...map.values()].filter(c=>(c.name+' '+c.phone).toLowerCase().includes(query));document.querySelector('#clients-list').innerHTML=clients.length?`<div class="client-grid">${clients.map(c=>`<article class="client-card"><div class="client-card-top"><span class="client-avatar">${e(c.name.slice(0,1).toUpperCase())}</span><div><h3>${e(c.name)}</h3><a href="tel:+${c.phone.length<=11?'55':''}${e(c.phone)}">${e(c.phone)}</a></div></div>${c.email?`<p class="client-email">${e(c.email)}</p>`:''}<p>${[...c.vehicles].map(e).join(' · ')}</p><div class="client-card-footer"><span>${c.count} ${c.count===1?'agendamento':'agendamentos'}</span><span>Última data: ${formatDate(c.last)}</span></div></article>`).join('')}</div>`:`<div class="empty-state">${icon('users')}<h3>Nenhum cliente encontrado.</h3><p>Os contatos são organizados automaticamente a partir dos agendamentos.</p></div>`;}
  function renderSettings(){const form=document.querySelector('#settings-form');['open','close','interval','capacity','leadMinutes','horizonDays'].forEach(name=>form.elements[name].value=settings[name]);document.querySelector('#weekday-options').innerHTML=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((day,i)=>`<label><input type="checkbox" name="days" value="${i}" ${settings.days.includes(i)?'checked':''}><span>${day}</span></label>`).join('');document.querySelector('#duration-fields').innerHTML=catalog.map(s=>`<label class="duration-row"><span>${e(s.name)}</span><span><input type="number" name="duration-${s.id}" min="30" max="600" step="15" value="${settings.durations[s.id]}" aria-label="Duração de ${e(s.name)} em minutos" required> min</span></label>`).join('');document.querySelector('#block-form').elements.date.min=today;document.querySelector('#block-form').elements.date.value=today;}
  function renderBlocks(){const upcoming=blocks.filter(b=>b.date>=today);document.querySelector('#blocks-list').innerHTML=upcoming.length?`<h3>Períodos bloqueados</h3>${upcoming.map(b=>`<div class="block-row"><span><strong>${formatDate(b.date)} · ${String(Math.floor(b.start/60)).padStart(2,'0')}:${String(b.start%60).padStart(2,'0')}–${String(Math.floor(b.end/60)).padStart(2,'0')}:${String(b.end%60).padStart(2,'0')}</strong><small>${e(b.reason)}</small></span><button type="button" class="icon-btn" data-unblock="${b.id}" aria-label="Remover bloqueio de ${formatDate(b.date)}">${icon('close')}</button></div>`).join('')}`:'<p class="field-note">Nenhum bloqueio futuro cadastrado.</p>';}
  function details(id){const b=bookings.find(item=>item.id===id);if(!b)return;const form=document.querySelector('#detail-form');document.querySelector('#detail-title').textContent=b.protocol;document.querySelector('#detail-content').innerHTML=`<div class="detail-customer"><span class="client-avatar">${e(b.customer.name.slice(0,1))}</span><div><h3>${e(b.customer.name)}</h3><p>${e(b.vehicle)} · Porte ${e(b.category)}</p></div></div><div class="detail-contact"><a href="tel:+${b.customer.phone.length<=11?'55':''}${e(b.customer.phone)}">${e(b.customer.phone)}</a>${b.customer.email?`<span>${e(b.customer.email)}</span>`:''}</div><div class="detail-services">${b.services.map(s=>`<div><span>${e(s.name)}</span><strong>${s.price===null?'Sob consulta':money(s.price)}</strong></div>`).join('')}<p>${duration(b.duration)} reservados · ${b.time} às ${b.endTime}</p></div>${b.notes?`<div class="detail-notes"><strong>Observações do cliente</strong><p>${e(b.notes)}</p></div>`:''}`;form.elements.id.value=b.id;form.elements.status.value=b.status;form.elements.date.value=b.date;form.elements.time.value=b.time;form.elements.adminNotes.value=b.adminNotes;document.querySelector('#detail-error').hidden=true;dialog.showModal();}
  document.querySelector('#auth-form').addEventListener('submit',async event=>{event.preventDefault();authError('');const email=document.querySelector('#auth-email').value;const password=document.querySelector('#auth-password').value;if(setupRequired&&password!==document.querySelector('#repeat-password').value)return authError('As senhas precisam ser iguais.');const button=document.querySelector('#auth-submit');button.disabled=true;try{await api(setupRequired?'/api/setup':'/api/login',{method:'POST',body:{email,password}});document.querySelector('#auth-password').value='';document.querySelector('#repeat-password').value='';await enter();}catch(error){authError(error.message);}finally{button.disabled=false;}});
  async function enter(){const auth=await api('/api/auth');document.querySelector('#admin-loading').hidden=true;if(!auth.authenticated){authView(auth.setupRequired);return;}await load();document.querySelector('#admin-email').textContent=auth.email;document.querySelector('#demo-banner').hidden=!auth.demo;document.querySelector('#logout').hidden=auth.demo;document.querySelector('#password-form').hidden=auth.demo;document.querySelector('#admin-label').textContent=auth.demo?'Modo demonstração':'Administrador';document.querySelector('#connection-label').textContent=auth.demo?'Demonstração':'Agenda local';if(auth.demo){range='upcoming';document.querySelectorAll('[data-range]').forEach(el=>el.classList.toggle('active',el.dataset.range===range));renderAgenda();}authScreen.hidden=true;shell.hidden=false;switchView(view);}
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.view)));
  document.querySelector('#open-settings').addEventListener('click',event=>{event.preventDefault();switchView('configuracoes');});
  document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{range=button.dataset.range;document.querySelector('#filter-date').value='';document.querySelectorAll('[data-range]').forEach(el=>el.classList.toggle('active',el===button));renderAgenda();}));
  ['filter-date','filter-status'].forEach(id=>document.querySelector('#'+id).addEventListener('change',()=>{if(id==='filter-date')document.querySelectorAll('[data-range]').forEach(el=>el.classList.toggle('active',!document.querySelector('#filter-date').value&&el.dataset.range===range));renderAgenda();}));
  document.querySelector('#search-bookings').addEventListener('input',renderAgenda);document.querySelector('#search-clients').addEventListener('input',renderClients);
  document.querySelector('#bookings-list').addEventListener('click',event=>{const button=event.target.closest('[data-booking]');if(button)details(button.dataset.booking);});
  ['close-detail','cancel-detail'].forEach(id=>document.querySelector('#'+id).addEventListener('click',()=>dialog.close()));
  document.querySelector('#detail-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.target;const button=form.querySelector('[type=submit]');button.disabled=true;document.querySelector('#detail-error').hidden=true;try{await api('/api/admin/bookings/'+form.elements.id.value,{method:'PATCH',body:{status:form.elements.status.value,date:form.elements.date.value,time:form.elements.time.value,adminNotes:form.elements.adminNotes.value}});dialog.close();await load();notice('Agendamento atualizado.');}catch(error){if(error.status===401){dialog.close();authView();}else{const el=document.querySelector('#detail-error');el.hidden=false;el.textContent=error.message;}}finally{button.disabled=false;}});
  document.querySelector('#settings-form').addEventListener('submit',event=>{event.preventDefault();const form=event.target;const body={days:[...form.querySelectorAll('[name=days]:checked')].map(el=>Number(el.value)),open:form.elements.open.value,close:form.elements.close.value,durations:Object.fromEntries(catalog.map(s=>[s.id,Number(form.elements['duration-'+s.id].value)]))};['interval','capacity','leadMinutes','horizonDays'].forEach(name=>body[name]=Number(form.elements[name].value));guarded(async()=>{await api('/api/admin/settings',{method:'PUT',body});await load();notice('Disponibilidade salva. Os próximos agendamentos já usam a nova configuração.');});});
  document.querySelector('#block-form').addEventListener('submit',event=>{event.preventDefault();const form=event.target;guarded(async()=>{await api('/api/admin/blocks',{method:'POST',body:Object.fromEntries(new FormData(form))});form.elements.reason.value='';await load();notice('Período bloqueado na agenda.');});});
  document.querySelector('#blocks-list').addEventListener('click',event=>{const button=event.target.closest('[data-unblock]');if(button)guarded(async()=>{await api('/api/admin/blocks/'+button.dataset.unblock,{method:'DELETE',body:{}});await load();notice('Bloqueio removido.');});});
  document.querySelector('#password-form').addEventListener('submit',event=>{event.preventDefault();guarded(async()=>{await api('/api/admin/password',{method:'POST',body:Object.fromEntries(new FormData(event.target))});event.target.reset();authView();authError('Senha alterada. Entre com sua nova senha.');});});
  document.querySelector('#logout').addEventListener('click',()=>guarded(async()=>{await api('/api/logout',{method:'POST',body:{}});bookings=[];blocks=[];document.querySelector('#bookings-list').innerHTML='';document.querySelector('#clients-list').innerHTML='';authView();}));
  document.querySelector('#refresh').addEventListener('click', () => guarded(async () => {
    if (view === 'caixa') {
      await loadCashFlow();
      notice('Fluxo de caixa atualizado.');
      return;
    }
    await load();
    notice('Agenda atualizada.');
  }));
  window.addEventListener('focus', () => {
    if (view === 'caixa' && !shell.hidden && !cashDialog.open) guarded(loadCashFlow);
  });
  document.querySelector('#export-csv').addEventListener('click',()=>{const safe=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';const rows=[['Protocolo','Data','Hora','Cliente','Telefone','E-mail','Veículo','Porte','Serviços','Status','Estimativa','Sob consulta'],...filtered().map(b=>[b.protocol,b.date,b.time,b.customer.name,b.customer.phone,b.customer.email,b.vehicle,b.category,b.services.map(s=>s.name).join(', '),statusNames[b.status],b.total,b.consultation?'Sim':'Não'])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.map(safe).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='impact-agenda-'+today+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  enter().catch(error=>{document.querySelector('#admin-loading').hidden=true;authView();authError(error.message);});
})();
