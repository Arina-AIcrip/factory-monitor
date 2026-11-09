'use strict';
const $ = id => document.getElementById(id);
const number = (n, digits = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
const time = (t, seconds = false) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(t);
const dateTime = t => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(t);
let timer, controller, sequence = 0, failures = 0, simulate = false, snapshot = null, recoveryTimer;
Chart.defaults.font.family = 'Segoe UI, Arial, sans-serif';
Chart.defaults.color = '#819087';
Chart.defaults.font.size = 10;
const base = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0 } }, y: { beginAtZero: true, border: { display: false }, grid: { color: '#edf1eb' }, ticks: { maxTicksLimit: 5 } } } };
const trend = new Chart($('trend'), { type: 'line', data: { labels: [], datasets: [{ label: 'Выпуск, шт.', data: [], borderColor: '#287252', backgroundColor: '#eaf2e6', fill: true, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 }] }, options: structuredClone(base) });
const energyChart = new Chart($('energy-chart'), { type: 'bar', data: { labels: [], datasets: [{ label: 'Энергия, кВт·ч', data: [], backgroundColor: ['#2b7155', '#83a681', '#bfd19f'], borderRadius: 5, maxBarThickness: 60 }] }, options: structuredClone(base) });
function connection(state, message) { $('connection').className = `connection ${state}`; $('connection-text').textContent = message; }
function notice(text, recovered = false) { clearTimeout(recoveryTimer); $('notice').hidden = !text; $('notice').textContent = text; $('notice').className = `notice${recovered ? ' recovered' : ''}`; }
function node(tag, text, className) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; }
function render(data) {
  $('units').textContent = number(data.kpi.units);
  $('availability').textContent = number(data.kpi.availability, 1);
  $('energy').textContent = number(data.kpi.energy, 1);
  $('defect').textContent = number(data.kpi.defectRate, 2);
  $('defect-note').textContent = `${number(data.kpi.rejected)} изделий с браком`;
  $('bin-caption').textContent = `Количество изделий за ${data.filters.period === '1h' ? '1 минуту' : data.filters.period === '6h' ? '7,5 минуты' : '30 минут'}`;
  trend.data.labels = data.bins.map(b => time(b.t)); trend.data.datasets[0].data = data.bins.map(b => b.units); trend.update('none');
  energyChart.data.labels = data.lines.map(l => l.name.replace('Линия ', '')); energyChart.data.datasets[0].data = data.lines.map(l => Number(l.energy.toFixed(2))); energyChart.update('none');
  $('trend-summary').textContent = `${dateTime(data.window.start)} — ${dateTime(data.window.end)} МСК · Итого ${number(data.kpi.units)} шт.`;
  $('energy-summary').textContent = data.lines.map(l => `${l.code}: ${number(l.energy, 1)} кВт·ч`).join(' · ');
  $('lines').replaceChildren(...data.lines.map(l => {
    const card = node('article', undefined, 'line');
    const top = node('div', undefined, 'line-top'); top.append(node('span', l.code, 'line-code'), node('span', { running: 'В работе', warning: 'Внимание', stopped: 'Остановлена' }[l.status], `badge ${l.status}`));
    const bottom = node('div', undefined, 'line-bottom'); bottom.append(node('span', `${number(l.units)} шт.`), node('span', `${number(l.temperature, 1)} °C`));
    card.append(top, node('h3', l.name), bottom); return card;
  }));
  $('line-count').textContent = `Объектов: ${data.lines.length}`;
  $('event-count').textContent = data.events.length;
  const rows = data.events.map(e => {
    const row = node('tr'); const severity = node('td'); severity.append(node('span', { info: 'Информация', warning: 'Внимание', critical: 'Критическое' }[e.severity], `badge ${e.severity}`));
    row.append(node('td', dateTime(e.t)), node('td', e.name), severity, node('td', e.message)); return row;
  });
  if (!rows.length) { const row = node('tr'); const cell = node('td', 'За выбранный период событий нет.', 'empty'); cell.colSpan = 4; row.append(cell); rows.push(row); }
  $('event-rows').replaceChildren(...rows);
  $('updated').textContent = `Обновлено в ${time(data.generatedAt, true)} МСК`;
  $('dashboard').dataset.revision = data.revision;
  $('dashboard').dataset.object = data.filters.object;
  $('dashboard').dataset.period = data.filters.period;
}
async function refresh() {
  clearTimeout(timer); controller?.abort();
  const id = ++sequence;
  controller = new AbortController();
  const currentController = controller;
  const timeout = setTimeout(() => currentController.abort(), 7000);
  if (!snapshot) $('dashboard').setAttribute('aria-busy', 'true');
  $('refresh').disabled = true;
  try {
    if (simulate) throw new Error('demo-offline');
    const response = await fetch(`/api/dashboard?period=${encodeURIComponent($('period').value)}&object=${encodeURIComponent($('object').value)}`, { signal: currentController.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (id !== sequence) return;
    if (!data.kpi || !Array.isArray(data.bins) || !Array.isArray(data.lines) || !Array.isArray(data.events)) throw new Error('Invalid snapshot');
    const recovering = failures > 0;
    render(data); snapshot = data; failures = 0;
    connection('', 'Данные поступают');
    if (recovering) { notice('Связь восстановлена. Данные обновлены с учётом выбранных фильтров.', true); recoveryTimer = setTimeout(() => notice(''), 8000); }
    else if (!$('notice').classList.contains('recovered')) notice('');
    $('dashboard').setAttribute('aria-busy', 'false');
  } catch (error) {
    if (id !== sequence) return;
    failures++;
    connection('offline', simulate ? 'Проверка: связь прервана' : 'Нет связи с сервером');
    const oldFilters = snapshot ? ` Последний снимок: ${$('period').querySelector(`[value="${snapshot.filters.period}"]`).textContent}, ${$('object').querySelector(`[value="${snapshot.filters.object}"]`).textContent}.` : ' Первый снимок пока не получен.';
    notice((simulate ? 'Включена имитация потери связи.' : 'Не удалось обновить данные.') + oldFilters + ' Автоматическое подключение продолжается.');
    $('dashboard').setAttribute('aria-busy', 'false');
  } finally {
    clearTimeout(timeout);
    if (id === sequence) { $('refresh').disabled = false; timer = setTimeout(refresh, failures ? Math.min(15000, 3000 * 2 ** Math.min(failures - 1, 3)) : 3000); }
  }
}
for (const id of ['period', 'object']) $(id).addEventListener('change', () => { $('dashboard').setAttribute('aria-busy', 'true'); refresh(); });
$('refresh').addEventListener('click', refresh);
$('simulate').addEventListener('click', () => { simulate = !simulate; $('simulate').setAttribute('aria-pressed', String(simulate)); $('simulate').textContent = simulate ? 'Восстановить связь' : 'Проверить потерю связи'; refresh(); });
window.addEventListener('online', refresh);
window.addEventListener('offline', () => { connection('offline', 'Нет подключения к сети'); notice('Браузер сообщает об отсутствии сети. Сохранён последний полученный снимок.'); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
refresh();
