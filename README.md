# Impact Detail

Site institucional, agendamento de serviços e painel administrativo local. HTML/CSS/JavaScript no navegador, Node.js 24 ou superior no servidor e SQLite para persistência. Sem dependências externas de execução.

## Executar

Na pasta do projeto:

```sh
npm start
```

- Site: http://127.0.0.1:5500/
- Agendamento: http://127.0.0.1:5500/agendar
- Administração: http://127.0.0.1:5500/admin

O comando `npm start` abre o **modo de demonstração do MVP**, sem login. A agenda contém quatro atendimentos fictícios e pode ser alterada livremente. Agendamento e painel usam o mesmo banco de demonstração, mantido em memória e reiniciado ao parar o servidor. O arquivo de reservas reais não é aberto nem alterado nesse modo.

Para voltar ao modo com login e dados persistentes, pare a demonstração e execute:

```sh
npm run start:protected
```

No primeiro acesso ao admin protegido, cadastre seu e-mail e uma senha de pelo menos 10 caracteres. Não há senha padrão. A sessão dura 12 horas; sair ou trocar a senha invalida o acesso correspondente.

O projeto precisa do servidor para reservar e acessar o painel; abrir os arquivos HTML diretamente não executa a API. O servidor escuta apenas na máquina local. Para acessar de outros dispositivos ou publicar na internet, será necessário preparar hospedagem, domínio/HTTPS e acesso de rede.

## Recursos

- Escolha de um ou vários serviços, porte do veículo, estimativa e horário disponível.
- Preços do catálogo existente; porte GG e faróis ficam sob consulta. Não há pagamento online.
- Solicitações pendentes reservam o período; cancelar libera a vaga. O servidor verifica duração, antecedência, dias de funcionamento, bloqueios e capacidade simultânea.
- Protocolo e resumo do atendimento ao finalizar a solicitação.
- Admin com filtros por período, data, status e cliente; confirmação, reagendamento, cancelamento e anotações internas.
- Histórico de contatos, exportação CSV e indicadores calculados com os dados existentes. O valor de concluídos é uma estimativa do catálogo, não um registro de recebimentos.
- Dias, horários, durações, antecedência, prazo da agenda e vagas simultâneas editáveis.
- Bloqueio de períodos para folgas, feriados e manutenção; bloqueios conflitantes com reservas são recusados.
- Senhas com hash scrypt, sessões em cookies HttpOnly/SameSite, verificação de origem, validação no servidor e limite de tentativas.

## Configuração inicial

Segunda a sábado, 08h–18h, horários a cada 30 minutos, antecedência de 60 minutos, agenda para os próximos 60 dias e 1 veículo simultâneo. São valores iniciais editáveis; confirme no admin conforme a operação. Todas as datas usam o fuso America/Bahia (UTC−03:00).

Tempos iniciais para reserva: lavagem básica 60 min, detalhada 120 min, higienização 180 min, polimento 240 min, polimento + vitrificação 480 min, motor/chassi/para-brisa 60 min e farol 90 min. A entrega final e serviços sob consulta precisam de avaliação da equipe.

No modo protegido, os dados ficam em `data/impact.sqlite`, fora dos arquivos servidos ao navegador. Para backup, pare o servidor e copie a pasta `data/` inteira. Não exclua essa pasta: ela contém as reservas e o acesso administrativo. A demonstração e os testes usam bancos separados e não adicionam clientes fictícios à agenda real.

WhatsApp, envio de e-mails e avisos automáticos não foram conectados. O cadastro de telefone/e-mail permite o contato manual; concluir o pedido registra uma solicitação, sem enviar mensagens externas.

## Verificação

```sh
npm run check
```

Confere sintaxe e executa os testes de regras e API: preços, validações, disponibilidade, concorrência, cancelamento, reagendamento, bloqueios, autenticação, demonstração e persistência. As capturas, relatórios visuais e ferramentas locais de navegador em `.qa/` não fazem parte do repositório.
