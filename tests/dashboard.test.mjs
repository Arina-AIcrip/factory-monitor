import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, sample, objects } from '../telemetry.mjs';
import { createApp } from '../server.mjs';
const now = Date.UTC(2026, 10, 9, 12, 0, 0);
test('общие KPI равны сумме линий и графиков', () => {
  const d = buildSnapshot({ now });
  assert.equal(d.lines.length, 3);
  assert.equal(d.kpi.units, d.lines.reduce((s, l) => s + l.units, 0));
  assert.equal(d.kpi.units, d.bins.reduce((s, b) => s + b.units, 0));
  assert.ok(Math.abs(d.kpi.energy - d.bins.reduce((s, b) => s + b.energy, 0)) < 1e-8);
  assert.equal(d.kpi.defectRate, d.kpi.rejected / d.kpi.units * 100);
});
test('фильтр объекта применяется к KPI, графикам, линиям и событиям', () => {
  const all = buildSnapshot({ now });
  for (const object of objects) {
    const d = buildSnapshot({ object: object.id, now });
    assert.equal(d.lines.length, 1);
    assert.equal(d.kpi.units, all.lines.find(l => l.id === object.id).units);
    assert.equal(d.kpi.units, d.bins.reduce((s, b) => s + b.units, 0));
    assert.ok(d.events.every(e => e.object === object.id));
    assert.ok(d.events.length > 0);
  }
});
test('период ограничивает измерения и события; значения за 24ч больше часовых', () => {
  let previous = 0;
  for (const [period, duration] of [['1h', 3600000], ['6h', 21600000], ['24h', 86400000]]) {
    const d = buildSnapshot({ period, now });
    assert.equal(d.window.end - d.window.start, duration);
    assert.ok(d.kpi.units > previous); previous = d.kpi.units;
    assert.ok(d.events.every(e => e.t > d.window.start && e.t <= d.window.end));
    assert.ok(d.events.length <= 20);
    assert.ok(d.events.every((e, i) => i === 0 || e.t <= d.events[i - 1].t));
    assert.equal(new Set(d.events.map(e => e.id)).size, d.events.length);
  }
});
test('источник воспроизводим, поток обновляется каждые пять секунд', () => {
  assert.deepEqual(buildSnapshot({ now }), buildSnapshot({ now }));
  const a = buildSnapshot({ now }), b = buildSnapshot({ now: now + 5000 });
  assert.equal(b.revision, a.revision + 1);
  assert.notDeepEqual(a.bins, b.bins);
  for (let i = 0; i < 300; i++) for (let j = 0; j < 3; j++) {
    const s = sample(now + i * 5000, j);
    assert.ok(s.units >= 0 && s.rejected <= s.units && s.energy > 0);
  }
});
test('API: ошибки фильтров, методы, статические файлы и восстановление клиента', async () => {
  const server = createApp(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const query of ['period=wrong', 'object=missing', 'object=%3Cscript%3E']) assert.equal((await fetch(`${url}/api/dashboard?${query}`)).status, 400);
    assert.equal((await fetch(`${url}/api/dashboard`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${url}/server.mjs`)).status, 404);
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    const response = await fetch(`${url}/api/dashboard?period=6h&object=packing`);
    assert.equal(response.status, 200); assert.equal((await response.json()).filters.object, 'packing');
    const page = await fetch(url); assert.match(await page.text(), /Обзор производства/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    for (const path of ['/app.js', '/style.css', '/vendor/chart.umd.js']) assert.equal((await fetch(url + path)).status, 200);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
