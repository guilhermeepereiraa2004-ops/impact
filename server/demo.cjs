function seedDemo(store,today) {
  const day=new Date(today+'T12:00:00Z');
  while(!store.settings().days.includes(day.getUTCDay()))day.setUTCDate(day.getUTCDate()+1);
  const date=day.toISOString().slice(0,10);
  const examples=[
    {name:'Ana Souza',vehicle:'Fiat Argo branco',services:['basica'],time:'08:00',status:'completed'},
    {name:'Carlos Lima',vehicle:'Toyota Corolla prata',services:['detalhada'],time:'09:00',status:'confirmed'},
    {name:'Mariana Oliveira',vehicle:'Honda Civic cinza',services:['higienizacao'],time:'11:00',status:'pending'},
    {name:'Rafael Santos',vehicle:'Volkswagen Gol preto',services:['basica'],time:'14:00',status:'pending'}
  ];
  for(const item of examples){
    const booking=store.createBooking({...item,date,category:'PM',phone:'00000000000',email:'',notes:'Agendamento fictício para apresentação do MVP.'});
    if(item.status!=='pending')store.updateBooking(booking.id,{status:item.status});
  }
}
module.exports={seedDemo};
