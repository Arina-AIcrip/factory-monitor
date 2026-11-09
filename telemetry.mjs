// Deterministic simulated telemetry. One record = five seconds of operation.
export const objects = [
  { id: 'cutting', name: 'Линия резки', code: 'Л-01', capacity: 12 },
  { id: 'assembly', name: 'Линия сборки', code: 'Л-02', capacity: 9 },
  { id: 'packing', name: 'Линия упаковки', code: 'Л-03', capacity: 15 }
];
const STEP = 5000;
const ranges = { '1h': 3600000, '6h': 21600000, '24h': 86400000 };
export function sample(t, index) {
  const tick = Math.floor(t / STEP);
  const wave = Math.sin(tick / 29 + index * 2);
  const stopped = ((tick + index * 37) % 241) < 8;
  const units = stopped ? 0 : Math.max(0, Math.round(objects[index].capacity * (0.78 + 0.17 * wave)));
  const rejected = units > 0 && ((tick + index * 11) % 23 === 0) ? 1 : 0;
  const temperature = 63 + 11 * Math.sin(tick / 47 + index) + 4 * Math.cos(tick / 13);
  return { t, units, rejected, energy: stopped ? 0.015 : 0.065 + index * 0.025 + (wave + 1) * 0.018, running: !stopped, temperature };
}
export function buildSnapshot({ period = '1h', object = 'all', now = Date.now() } = {}) {
  if (!ranges[period] || (object !== 'all' && !objects.some(o => o.id === object))) throw new Error('Invalid filter');
  const end = Math.floor(now / STEP) * STEP;
  const start = end - ranges[period];
  const selected = objects.map((o, i) => ({ ...o, index: i })).filter(o => object === 'all' || o.id === object);
  const binCount = period === '1h' ? 60 : 48;
  const bins = Array.from({ length: binCount }, (_, i) => ({ t: start + i * ranges[period] / binCount, units: 0, energy: 0 }));
  let units = 0, rejected = 0, energy = 0, running = 0, count = 0;
  const lines = selected.map(o => {
    let lineUnits = 0, lineRejected = 0, lineEnergy = 0, lineRunning = 0, lineCount = 0;
    for (let t = start + STEP; t <= end; t += STEP) {
      const s = sample(t, o.index);
      lineUnits += s.units; lineRejected += s.rejected; lineEnergy += s.energy; lineRunning += Number(s.running); lineCount++;
      const bin = bins[Math.min(binCount - 1, Math.floor((t - start - STEP) / ranges[period] * binCount))];
      bin.units += s.units; bin.energy += s.energy;
    }
    units += lineUnits; rejected += lineRejected; energy += lineEnergy; running += lineRunning; count += lineCount;
    const latest = sample(end, o.index);
    return { id: o.id, name: o.name, code: o.code, units: lineUnits, rejected: lineRejected, energy: lineEnergy, availability: lineRunning / lineCount * 100, temperature: latest.temperature, status: !latest.running ? 'stopped' : latest.temperature > 75 ? 'warning' : 'running' };
  });
  const events = [];
  // Events have stable identities; sorting and filtering share the snapshot's time window.
  for (const o of selected) { let eventCount = 0;
    for (let t = Math.floor(end / 60000) * 60000; t > start && eventCount < 20; t -= 60000) {
      const minute = Math.floor(t / 60000);
      if ((minute + o.index * 3) % 7 !== 0) continue;
      eventCount++; const kind = (Math.floor(minute / 7) + o.index) % 3;
      events.push({ id: `${o.id}-${t}`, t, object: o.id, name: o.name, severity: ['info', 'warning', 'critical'][kind], message: ['Контроль партии завершён', 'Температура выше порога: требуется проверка', 'Остановка линии: требуется осмотр'][kind] });
    }
  }
  events.sort((a, b) => b.t - a.t || a.object.localeCompare(b.object));
  return { mode: 'demo', revision: end / STEP, generatedAt: now, window: { start, end }, filters: { period, object }, kpi: { units, rejected, energy, defectRate: units ? rejected / units * 100 : 0, availability: count ? running / count * 100 : 0 }, bins, lines, events: events.slice(0, 20) };
}


