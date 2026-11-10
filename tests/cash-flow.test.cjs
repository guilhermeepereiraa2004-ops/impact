const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createApp } = require('../server.cjs');

test('Caixa reúne pedidos, recebimentos e saídas sem duplicar lançamentos', async t => {
  const { server } = createApp({ database: ':memory:', clock: () => new Date('2026-11-10T10:00:00-03:00') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cashRoute = '/api/admin/cash-flow';
  let cookie;
  function request(route, method = 'GET', body) {
    const headers = { Origin: base, 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    return fetch(base + route, { method, headers, body: body && JSON.stringify(body) });
  }
  async function book(time, services) {
    const response = await request('/api/bookings', 'POST', {
      name: 'Cliente de teste', phone: '71999990000', vehicle: 'Corolla', category: 'PM',
      date: '2026-11-11', time, services,
    });
    assert.equal(response.status, 201);
    return response.json();
  }
  async function listEntries() {
    const response = await request(cashRoute);
    assert.equal(response.status, 200);
    return (await response.json()).entries;
  }

  const booking = await book('09:00', ['basica']);
  const estimate = await book('10:00', ['farol']);
  const cancelled = await book('12:00', ['basica']);
  assert.equal((await request(cashRoute)).status, 401);
  const setup = await request('/api/setup', 'POST', { email: 'caixa@example.com', password: 'senha-teste-caixa' });
  assert.equal(setup.status, 201);
  cookie = setup.headers.get('set-cookie').split(';')[0];

  const forecasts = await listEntries();
  assert.equal(forecasts.length, 3);
  assert.deepEqual(forecasts.find(entry => entry.id === booking.id), {
    id: booking.id, type: 'pending', date: '2026-11-11', description: 'Lavagem Básica',
    protocol: booking.protocol, customer: 'Cliente de teste', amountCents: 10000,
  });
  assert.equal(forecasts.find(entry => entry.id === estimate.id).amountCents, null);

  const receiptRoute = `${cashRoute}/receipts/${booking.id}`;
  const receipt = { date: '2026-11-10', amountCents: 10345 };
  const expense = { id: randomUUID(), date: '2026-11-10', description: 'Compra de produtos', amountCents: 2590 };
  const income = { id: randomUUID(), date: '2026-11-10', description: 'Venda de produto', amountCents: 3650 };
  for (const [route, movement] of [[receiptRoute, receipt], [`${cashRoute}/expenses`, expense], [`${cashRoute}/income`, income]]) {
    const responses = await Promise.all([request(route, 'POST', movement), request(route, 'POST', movement)]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.equal((await request(route, 'POST', { ...movement, amountCents: 101 })).status, 409);
  }
  assert.equal((await request(`${cashRoute}/expenses`, 'POST', { ...expense, date: '2026-11-11' })).status, 400);
  for (const id of [cancelled.id, booking.id]) {
    assert.equal((await request(`/api/admin/bookings/${id}`, 'PATCH', { status: 'cancelled' })).status, 200);
  }
  assert.equal((await request(`${cashRoute}/receipts/${cancelled.id}`, 'POST', receipt)).status, 409);
  const entries = await listEntries();
  assert.equal(entries.length, 4);
  assert.ok(!entries.some(entry => entry.id === cancelled.id));
  const received = entries.filter(entry => entry.type === 'received');
  assert.equal(received.length, 2);
  assert.ok(received.some(entry => entry.id === booking.id && entry.amountCents === receipt.amountCents && entry.date === receipt.date));
  assert.deepEqual(received.find(entry => entry.id === income.id), { ...income, type: 'received' });
  assert.deepEqual(entries.filter(entry => entry.type === 'expense').map(entry => entry.amountCents), [2590]);
});
