window.Impact = {
  money: value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value),
  duration: minutes => `${Math.floor(minutes/60) ? Math.floor(minutes/60)+'h' : ''}${minutes%60 ? ' '+minutes%60+'min' : ''}`.trim(),
  date: value => new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value+'T12:00:00-03:00')),
  escape: value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  async api(path,options={}) {
    const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers},body:options.body?JSON.stringify(options.body):undefined});
    let data;try {data=await response.json();}catch {throw new Error('Não foi possível conectar ao servidor. Abra o projeto pelo endereço local.');}
    if(!response.ok) {const error=new Error(data.error||'Não foi possível concluir.');error.status=response.status;throw error;}
    return data;
  },
  icon(name='arrow') {
    const paths={wallet:'M3 6h16v14H3zM3 6l13-3v3m3 5h2v5h-5v-5h3m-1 2.5h.01',arrow:'M5 19 19 5M5 5h14v14',back:'m14 6-6 6 6 6M8 12h12',check:'m5 12 4 4L19 6',clock:'M12 8v5l3 2',wash:'m3 16 2-7h14l2 7M4 16h16v5H4zM7 9l2-5h6l2 5M7 18h1m8 0h1',shine:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',drop:'M12 2C9 7 5 11 5 16a7 7 0 0 0 14 0c0-5-4-9-7-14ZM9 16a3 3 0 0 0 3 3',shield:'m12 2 9 3v7c0 5-4 8-9 10-5-2-9-5-9-10V5l9-3Zm-4 10 3 3 5-6',calendar:'M5 5h14v16H5zM8 2v6m8-6v6M5 11h14',users:'M16 21v-3c0-3-8-3-8 0v3M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM20 13c2 0 3 2 3 4v4M19 4c4 1 4 7 0 8',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',lock:'M5 10h14v12H5zM8 10V6a4 4 0 0 1 8 0v4',logout:'M10 3H4v18h6m4-14 5 5-5 5M8 12h11',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',close:'m6 6 12 12M6 18 18 6',search:'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm6 14 5 5',plus:'M12 4v16M4 12h16',car:'m3 15 2-6h14l2 6M4 15h16v6H4zM7 9l2-5h6l2 5M7 17h1m8 0h1'};
    return `<svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name==='clock'?'<circle cx="12" cy="12" r="9"/>':''}<path d="${paths[name]||paths.arrow}"/></svg>`;
  }
};
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=Impact.icon(el.dataset.icon));
