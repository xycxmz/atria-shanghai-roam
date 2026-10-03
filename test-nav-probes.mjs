// 导航航程资格探针（V1R3-001/002）：纯逻辑、无浏览器、断言化（失败非零退出）。
// 用法：node --experimental-strip-types probe-loader.mjs
// 覆盖外部评审 R3 的 6 个探针 + 换目标资格重置 + 导览穿越。
import { createNav } from './src/nav.ts';
import { searchLocal, resultToLandmark } from './src/search.ts';

let failures = 0;
let checks = 0;
const ok = (name) => { checks += 1; console.log('  ok   ' + name); };
const fail = (name, detail) => { failures += 1; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); };
const check = (name, cond, detail) => (cond ? ok(name) : fail(name, detail));

// ---- 最小 DOM/Map stub（createNav 只用到的 API 子集）----
function makeEl() {
  const el = {
    children: [],
    classList: {
      set: new Set(),
      add(...cs) { cs.forEach((c) => this.set.add(c)); },
      remove(...cs) { cs.forEach((c) => this.set.delete(c)); },
      contains(c) { return this.set.has(c); },
      toggle(c, force) { (force === undefined ? !this.set.has(c) : force) ? this.set.add(c) : this.set.delete(c); },
    },
    style: {},
    dataset: {},
    innerHTML: '',
    textContent: '',
    id: '',
    className: '',
    appendChild(c) { this.children.push(c); },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 10, height: 10 }; },
    contains() { return false; },
    remove() {},
    focus() {},
  };
  return el;
}
const appEl = makeEl();
globalThis.document = {
  getElementById: (id) => {
    if (id === 'app') return appEl;
    const el = makeEl();
    el.id = id;
    return el;
  },
  createElement: makeEl,
  addEventListener() {},
};
globalThis.window = globalThis;

function makeNav(center, cb) {
  const source = { setData: () => {} };
  const map = {
    getSource: () => source,
    addSource: () => {},
    addLayer: () => {},
    getCenter: () => ({ lng: center[0], lat: center[1] }),
    project: () => ({ x: 10, y: 20 }),
  };
  const calls = { arrive: 0, nearby: 0, targetChange: 0 };
  const nav = createNav(map, {
    onArrive: () => { calls.arrive += 1; },
    onNearby: () => { calls.nearby += 1; },
    onTargetChange: () => { calls.targetChange += 1; },
  });
  return { nav, calls };
}
const ST = (lng, lat) => ({ lng, lat, speed: 45, heading: 90, pitch: 0, roll: 0, alt: 600, throttle: 0.4 });

// 评审探针的目标点
const lm = { id: 'near', name: 'near', category: 'test', lon: 121.5, lat: 31.2, note: '' };

console.log('N1 浏览预览落在目标上：不判到达、目标保留');
{
  const { nav, calls } = makeNav([lm.lon, lm.lat]);
  nav.setTarget(lm);
  nav.update();
  check('arrive 0 次', calls.arrive === 0, JSON.stringify(calls));
  check('目标保留', nav.getTarget() === lm);
}

console.log('N2 真实飞行从外飞入目标：到达一次');
{
  const { nav, calls } = makeNav([121.4, 31.2]);
  nav.setTarget(lm);
  nav.update(ST(121.4, 31.2));
  nav.update(ST(121.5, 31.2));
  nav.update(ST(121.5, 31.2));
  check('arrive 恰好 1 次', calls.arrive === 1, JSON.stringify(calls));
  check('到达后目标清空', nav.getTarget() === null);
}

console.log('N3 首个飞行样本即在目标附近：不判到达、提示「已在附近」、目标保留');
{
  const { nav, calls } = makeNav([121.4, 31.2]);
  nav.setTarget(lm);
  nav.update(ST(lm.lon, lm.lat));
  check('arrive 0 次', calls.arrive === 0, JSON.stringify(calls));
  check('nearby 恰好 1 次', calls.nearby === 1, JSON.stringify(calls));
  check('目标保留', nav.getTarget() === lm);
}

console.log('N4 扩展 POI 解析为可导航地标');
{
  const r = searchLocal('上海火车站').find((x) => x.origin === 'extra');
  check('命中 extra 结果', !!r);
  if (r) {
    const l = resultToLandmark(r);
    check('坐标一致', l.id === 'shanghai-railway' && l.lon === 121.458 && l.lat === 31.252, JSON.stringify(l));
  }
}

console.log('N5 在线结果保留自身坐标');
{
  const l = resultToLandmark({ name: 'fixture', category: 'test', origin: 'online', lon: 121.2, lat: 31.1 });
  check('坐标与名称保留', l.lon === 121.2 && l.lat === 31.1 && l.name === 'fixture', JSON.stringify(l));
}

console.log('N6（R3 红→绿）相机在目标外 → 出生在目标内：不误报到达，只提示附近');
{
  const { nav, calls } = makeNav([121.4, 31.2]); // 相机在 ~9.5km 外
  nav.setTarget(lm); // 触发浏览态 update：旧实现会把 hasLeftRadius 置真
  nav.update(ST(lm.lon, lm.lat)); // 飞机出生在目标处
  check('arrive 0 次', calls.arrive === 0, JSON.stringify(calls));
  check('nearby 恰好 1 次', calls.nearby === 1, JSON.stringify(calls));
  check('目标保留', nav.getTarget() === lm);
  // 之后真实飞离再进入：才算到达
  nav.update(ST(121.4, 31.2));
  nav.update(ST(121.5, 31.2));
  check('飞离再进入 arrive 1 次', calls.arrive === 1, JSON.stringify(calls));
}

console.log('N7 换目标不沿用旧航程资格');
{
  const { nav, calls } = makeNav([121.4, 31.2]);
  const far = { id: 'far', name: 'far', category: 'test', lon: 121.6, lat: 31.2, note: '' };
  nav.setTarget(far);
  nav.update(ST(121.4, 31.2)); // 在 far 半径外，建立资格
  nav.setTarget(lm); // 换目标
  nav.update(ST(lm.lon, lm.lat)); // 出生在新目标处
  check('arrive 0 次（旧资格不沿用）', calls.arrive === 0, JSON.stringify(calls));
  check('nearby 1 次', calls.nearby === 1, JSON.stringify(calls));
  check('目标为 lm', nav.getTarget() === lm);
}

console.log('N8 导览真实穿越目标：到达一次（state 连续）');
{
  const { nav, calls } = makeNav([121.4, 31.2]);
  nav.setTarget(lm);
  nav.update(ST(121.45, 31.2));
  nav.update(ST(121.5, 31.2)); // 进入半径
  nav.update(ST(121.55, 31.2)); // 穿越离开
  check('arrive 恰好 1 次', calls.arrive === 1, JSON.stringify(calls));
}

console.log(`\n${checks} 项断言，${failures} 失败`);
if (failures > 0) {
  console.error('PROBE FAILURE');
  process.exit(1);
}
