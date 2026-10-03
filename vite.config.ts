import { defineConfig, type Plugin, type Connect } from 'vite';
import { cpSync, mkdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// MapLibre 的 worker 以「URL 字符串 + 原样 module 加载」方式运行，不能交给 Vite 打包
// （?url 不会处理它对 maplibre-gl-shared.mjs 的相对导入）。把两个文件原样同步到
// public/workers/，再由 setWorkerUrl 指过去，dev/preview/任意静态服务器行为一致。
function syncMaplibreWorker(): Plugin {
  const destDir = join(__dirname, 'public', 'workers');
  const doSync = () => {
    // maplibre-gl 可能被 npm 提升（hoist）到上层 node_modules，用 resolve 定位真实路径
    const workerSrc = require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs');
    const sharedSrc = require.resolve('maplibre-gl/dist/maplibre-gl-shared.mjs');
    mkdirSync(destDir, { recursive: true });
    cpSync(workerSrc, join(destDir, 'maplibre-gl-worker.mjs'));
    cpSync(sharedSrc, join(destDir, 'maplibre-gl-shared.mjs'));
  };
  return {
    name: 'sync-maplibre-worker',
    // serve 与 build 都要同步：build 时 public/ 内容会被原样拷进 dist/
    config() {
      doSync();
    },
  };
}

// 本地 PMTiles（Planetiler 生成的上海高清晰瓦片）通过 /tiles/*.pmtiles 暴露给
// pmtiles:// 协议。PMTiles 客户端按字节范围读取，所以必须正确处理 Range 请求。
function servePmtiles(): Plugin {
  const dataDir = join(__dirname, 'data');
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const path = req.url ?? '';
    const prefix = '/tiles/';
    if (!path.startsWith(prefix)) return next();
    const name = path.slice(prefix.length).split('?')[0];
    // 只放行 data/ 下形如 xxx.pmtiles 的文件，避免目录穿越
    if (!/^[\w.-]+\.pmtiles$/.test(name)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const file = join(dataDir, name);
    if (!existsSync(file)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const size = statSync(file).size;
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', size);
      res.end();
      return;
    }
    const range = req.headers['range'];
    if (range) {
      // bytes=start-end（pmtiles 客户端总是给闭区间）
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
      createReadStream(file, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', size);
      createReadStream(file).pipe(res);
    }
  };
  return {
    name: 'serve-pmtiles',
    // dev 与 preview 都要挂上，保证两条链路行为一致
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// 生产构建把 data/*.pmtiles 原样拷进 dist/tiles/，使静态托管（GitHub Pages 等）
// 也能提供本地高清瓦片——pmtiles 客户端本身按 Range 请求读取，静态服务器
// 只要支持 Range 即可（V1-001：此前 build 产物不含瓦片，只有 dev/preview 有）。
function copyPmtilesToDist(): Plugin {
  const dataDir = join(__dirname, 'data');
  return {
    name: 'copy-pmtiles-to-dist',
    apply: 'build',
    generateBundle() {
      mkdirSync(join(__dirname, 'dist', 'tiles'), { recursive: true });
      const file = join(dataDir, 'shanghai.pmtiles');
      if (existsSync(file)) {
        cpSync(file, join(__dirname, 'dist', 'tiles', 'shanghai.pmtiles'));
        console.log(`[copy-pmtiles] dist/tiles/shanghai.pmtiles (${statSync(file).size} bytes)`);
      } else {
        console.warn('[copy-pmtiles] data/shanghai.pmtiles 缺失，静态包将回退在线瓦片');
      }
    },
  };
}

export default defineConfig({
  plugins: [syncMaplibreWorker(), servePmtiles(), copyPmtilesToDist()],
  server: {
    host: '127.0.0.1',
    port: 5183,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5183,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
