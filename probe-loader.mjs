// 纯逻辑探针入口：注册 TS 解析钩子后跑断言脚本。
import { register } from 'node:module';
register('./ts-resolve.mjs', import.meta.url);
await import('./test-nav-probes.mjs');
