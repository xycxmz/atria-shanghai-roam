// 本地纯静态部署服务器（模拟真实静态托管：支持 Range、正确 MIME、无 Vite 中间件）。
// 用法：node serve-dist.mjs [port]  —— 默认 5199，serve dist/
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const ROOT = join(process.cwd(), 'dist');
const PORT = Number(process.argv[2] ?? 5199);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.pmtiles': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let path = urlPath;
  if (path.endsWith('/')) path += 'index.html';
  // 安全规范化，禁止穿越
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    res.end('404');
    return;
  }
  const size = statSync(file).size;
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  const range = req.headers['range'];
  if (range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!m) {
      res.statusCode = 416;
      res.end();
      return;
    }
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (start >= size || end >= size || start > end) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    res.setHeader('Content-Type', type);
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', size);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`static: http://127.0.0.1:${PORT}/ serving dist/ (${existsSync(join(ROOT, 'tiles', 'shanghai.pmtiles')) ? '含本地瓦片' : '无瓦片（将回退在线）'})`);
});
