import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { buildSnapshot, objects } from './telemetry.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), 'public');
const files = new Set(['index.html', 'app.js', 'style.css', 'vendor/chart.umd.js']);
export function createApp() {
  return createServer(async (req, res) => {
    const send = (code, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method !== 'GET') return send(405, { error: 'Метод не поддерживается' });
      if (url.pathname === '/api/health') return send(200, { status: 'ok', mode: 'demo' });
      if (url.pathname === '/api/objects') return send(200, objects);
      if (url.pathname === '/api/dashboard') {
        const period = url.searchParams.get('period') || '1h';
        const object = url.searchParams.get('object') || 'all';
        if (!['1h', '6h', '24h'].includes(period) || (object !== 'all' && !objects.some(x => x.id === object))) return send(400, { error: 'Неизвестный период или объект' });
        return send(200, buildSnapshot({ period, object }));
      }
      const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (!files.has(file)) return send(404, { error: 'Страница не найдена' });
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
      send(200, await readFile(join(root, file)), types[extname(file)]);
    } catch (error) {
      console.error('[request]', error.message);
      send(500, { error: 'Не удалось получить данные. Повторите запрос.' });
    }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 3008);
  const host = process.env.HOST || '0.0.0.0';
  const server = createApp().listen(port, host, () => console.log(`Умный завод: http://127.0.0.1:${port} (учебные данные)`));
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Порт ${port} занят. Закройте предыдущий сервер или задайте PORT.` : e.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
