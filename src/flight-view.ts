// 飞行模式视图层：飞行器精灵（追尾视角）+ 座舱界面（座舱视角）
// 纯 DOM/SVG，零新依赖，每帧由 createFlightController 的 onFrame 驱动。
// 依据 docs/DESIGN-FLIGHT-V2-2026-10-02.md。

import type { Map } from 'maplibre-gl';
import { deg2rad, advanceMeters, type FlightState, type FlightViewMode } from './flight';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- 精灵姿态调参（方向/幅度以实测为准）----
const ROLL_SPRITE_K = 0.2; // 精灵随机身横滚的额外压坡系数（0=与倾斜的世界保持水平）
const PITCH_SQUASH = 0.008; // 每度俯仰的 scaleY 变化（抬机头看到更多机背）
const SPRITE_SCALE_MIN = 0.92; // 慢速时精灵缩放
const SPRITE_SCALE_RANGE = 0.16; // 快速时额外缩放
const SHADOW_K = 0.55; // 阴影相对高度的下移系数（俯视压缩）
const SHADOW_MAX_PX = 260;

// ---- 速度线触发 ----
const SPEED_LINE_THRESHOLD = 0.55; // 油门归一化速度超过此值显隐速度线
const SPRITE_JITTER_DEG = 1.2; // 高速时精灵高频抖动幅度

// ---- 姿态仪/阶梯符号（roll 方向需与追尾画面一致，实测对齐）----
const ROLL_SIGN = -1;
const PITCH_PX_DEG_ADI = 1.2; // 姿态仪内每度俯仰的像素位移
const PITCH_PX_DEG_RETICLE = 3; // 中心阶梯每度俯仰的像素位移
const PITCH_LADDER_MAX = 40; // 阶梯渲染钳制（座舱视角 pitch 近 90°，避免堆叠）

// ---- 航向带 ----
const HDG_PX_PER_DEG = 4;
const HDG_TAPE_DEG_FROM = -180;
const HDG_TAPE_DEG_TO = 540;

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function svgEl(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag) as SVGElement;
}

// 轻型小飞机顶视图剪影：机首朝上（远离镜头），主翼平直，尾翼+方向舵，机首螺旋桨。
function buildAircraftSvg(): SVGElement {
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', '0 0 80 84');
  svg.setAttribute('width', '72');
  svg.setAttribute('height', '76');
  svg.classList.add('ac-svg');

  const mk = (d: string, cls: string): SVGPathElement => {
    const p = svgEl('path') as SVGPathElement;
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    return p;
  };

  // 机身：浑圆的机身+机尾收敛
  svg.appendChild(mk('M40 6 C45 6 47 12 47 22 L47 56 C47 66 45 72 40 78 C35 72 33 66 33 56 L33 22 C33 12 35 6 40 6 Z', 'ac-body'));
  // 主翼：略微后掠、翼尖上反的平直翼
  svg.appendChild(mk('M6 40 C12 36 24 34 40 34 C56 34 68 36 74 40 C68 46 56 48 40 48 C24 48 12 46 6 40 Z', 'ac-wing'));
  // 水平尾翼
  svg.appendChild(mk('M18 66 C24 63 32 62 40 62 C48 62 56 63 62 66 C56 71 48 73 40 73 C32 73 24 71 18 66 Z', 'ac-tail'));
  // 方向舵
  svg.appendChild(mk('M37 62 L43 62 L41 78 L39 78 Z', 'ac-fin'));
  // 座舱玻璃
  svg.appendChild(mk('M34 18 C34 14 46 14 46 18 L46 30 C46 33 34 33 34 30 Z', 'ac-canopy'));

  // 螺旋桨桨毂 + 旋转桨叶（独立分组，CSS 动画自转）
  const prop = svgEl('g');
  prop.setAttribute('class', 'ac-prop');
  const hub = svgEl('circle');
  hub.setAttribute('cx', '40');
  hub.setAttribute('cy', '8');
  hub.setAttribute('r', '2.5');
  hub.setAttribute('class', 'ac-hub');
  const blade = svgEl('ellipse');
  blade.setAttribute('cx', '40');
  blade.setAttribute('cy', '8');
  blade.setAttribute('rx', '11');
  blade.setAttribute('ry', '3');
  blade.setAttribute('class', 'ac-blade');
  prop.appendChild(blade);
  prop.appendChild(hub);
  svg.appendChild(prop);

  return svg;
}

function buildHeadingStrip(): HTMLElement {
  const strip = el('div', 'hdg-strip');
  for (let d = HDG_TAPE_DEG_FROM; d <= HDG_TAPE_DEG_TO; d += 10) {
    const tick = el('div', 'hdg-tick');
    const label = ((d % 360) + 360) % 360;
    tick.style.left = ((d - HDG_TAPE_DEG_FROM) * HDG_PX_PER_DEG).toFixed(0) + 'px';
    if (d % 30 === 0) {
      tick.classList.add('hdg-tick-major');
      const t = el('span', 'hdg-label');
      t.textContent = String(label).padStart(3, '0');
      tick.appendChild(t);
    }
    strip.appendChild(tick);
  }
  return strip;
}

// 姿态仪：天/地两半 + 俯仰阶梯，整体按 roll 旋转、按 pitch 平移
function buildAdi(): SVGElement {
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('width', '118');
  svg.setAttribute('height', '118');
  svg.classList.add('adi-svg');

  const defs = svgEl('clipPath');
  defs.setAttribute('id', 'adi-clip');
  const clip = svgEl('circle');
  clip.setAttribute('cx', '60');
  clip.setAttribute('cy', '60');
  clip.setAttribute('r', '58');
  defs.appendChild(clip);
  svg.appendChild(defs);

  const g = svgEl('g');
  g.setAttribute('class', 'adi-inner');
  g.setAttribute('clip-path', 'url(#adi-clip)');

  const sky = svgEl('rect');
  sky.setAttribute('x', '-120');
  sky.setAttribute('y', '-240');
  sky.setAttribute('width', '360');
  sky.setAttribute('height', '300');
  sky.setAttribute('class', 'adi-sky');
  const ground = svgEl('rect');
  ground.setAttribute('x', '-120');
  ground.setAttribute('y', '60');
  ground.setAttribute('width', '360');
  ground.setAttribute('height', '300');
  ground.setAttribute('class', 'adi-ground');
  g.appendChild(sky);
  g.appendChild(ground);

  const mkLine = (deg: number): void => {
    const y = 60 + deg * PITCH_PX_DEG_ADI;
    const l = svgEl('line');
    l.setAttribute('x1', deg % 20 === 0 ? '20' : '36');
    l.setAttribute('y1', String(y));
    l.setAttribute('x2', deg % 20 === 0 ? '100' : '84');
    l.setAttribute('y2', String(y));
    l.setAttribute('class', 'adi-ladder' + (deg === 0 ? ' adi-horizon' : ''));
    g.appendChild(l);
    if (deg !== 0 && deg % 20 === 0) {
      const t = svgEl('text');
      t.setAttribute('x', '60');
      t.setAttribute('y', String(y - 4));
      t.setAttribute('class', 'adi-ladder-label');
      t.textContent = String(Math.abs(deg));
      g.appendChild(t);
    }
  };
  for (let d = -40; d <= 40; d += 10) mkLine(d);

  svg.appendChild(g);

  // 固定的飞机标记（中部小机翼符号）
  const ref = svgEl('g');
  ref.setAttribute('class', 'adi-ref');
  const l1 = svgEl('line');
  l1.setAttribute('x1', '26');
  l1.setAttribute('y1', '60');
  l1.setAttribute('x2', '50');
  l1.setAttribute('y2', '60');
  const l2 = svgEl('line');
  l2.setAttribute('x1', '70');
  l2.setAttribute('y1', '60');
  l2.setAttribute('x2', '94');
  l2.setAttribute('y2', '60');
  const dot = svgEl('circle');
  dot.setAttribute('cx', '60');
  dot.setAttribute('cy', '60');
  dot.setAttribute('r', '2.5');
  ref.appendChild(l1);
  ref.appendChild(l2);
  ref.appendChild(dot);
  svg.appendChild(ref);

  return svg;
}

// 中心 reticle：固定十字 + 俯仰阶梯（随 pitch 平移、随 roll 旋转）
function buildReticle(): SVGElement {
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', '-100 -100 200 200');
  svg.setAttribute('width', '200');
  svg.setAttribute('height', '200');
  svg.classList.add('reticle-svg');

  const g = svgEl('g');
  g.setAttribute('class', 'reticle-ladder');

  const mkLine = (deg: number): void => {
    const y = deg * PITCH_PX_DEG_RETICLE;
    const l = svgEl('line');
    l.setAttribute('x1', deg % 20 === 0 ? '-46' : '-26');
    l.setAttribute('y1', String(y));
    l.setAttribute('x2', deg % 20 === 0 ? '46' : '26');
    l.setAttribute('y2', String(y));
    l.setAttribute('class', 'reticle-line' + (deg === 0 ? ' reticle-horizon' : ''));
    g.appendChild(l);
  };
  for (let d = -PITCH_LADDER_MAX; d <= PITCH_LADDER_MAX; d += 10) mkLine(d);

  svg.appendChild(g);

  // 固定十字（飞行路径标记）
  const cross = svgEl('g');
  cross.setAttribute('class', 'reticle-cross');
  const mk = (x1: number, y1: number, x2: number, y2: number): void => {
    const l = svgEl('line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    cross.appendChild(l);
  };
  mk(-14, 0, -5, 0);
  mk(5, 0, 14, 0);
  mk(0, -14, 0, -5);
  mk(0, 5, 0, 14);
  const c = svgEl('circle');
  c.setAttribute('cx', '0');
  c.setAttribute('cy', '0');
  c.setAttribute('r', '1.6');
  cross.appendChild(c);
  svg.appendChild(cross);

  return svg;
}

export interface FlightView {
  update(state: FlightState, viewMode: FlightViewMode): void;
  setActive(active: boolean): void;
}

export function createFlightView(map: Map): FlightView {
  // ---- 飞行器精灵 ----
  const aircraft = el('div', 'ac-root hidden');
  aircraft.id = 'aircraft';
  const shadow = el('div', 'ac-shadow');
  const bank = el('div', 'ac-bank');
  bank.appendChild(buildAircraftSvg());
  aircraft.appendChild(shadow);
  aircraft.appendChild(bank);
  document.getElementById('app')?.appendChild(aircraft);

  // ---- 座舱 overlay ----
  const cockpit = el('div', 'ck-root hidden');
  cockpit.id = 'cockpit';

  const canopy = el('div', 'ck-canopy');
  cockpit.appendChild(canopy);

  // 航向带
  const tapeWrap = el('div', 'hdg-tape');
  const strip = buildHeadingStrip();
  tapeWrap.appendChild(strip);
  const pointer = el('div', 'hdg-pointer');
  tapeWrap.appendChild(pointer);
  cockpit.appendChild(tapeWrap);

  // 中心 reticle
  const reticle = el('div', 'ck-reticle');
  reticle.appendChild(buildReticle());
  cockpit.appendChild(reticle);

  // 底部仪表台
  const dash = el('div', 'ck-dash');
  const adi = el('div', 'ck-adi');
  adi.appendChild(buildAdi());
  dash.appendChild(adi);

  const instruments = el('div', 'ck-instruments');
  instruments.innerHTML =
    '<div class="ck-inst"><span class="ck-label">空速</span><b class="ck-val" id="ck-speed">0</b><i class="ck-unit">km/h</i></div>' +
    '<div class="ck-inst"><span class="ck-label">高度</span><b class="ck-val" id="ck-alt">0</b><i class="ck-unit">m</i></div>' +
    '<div class="ck-inst"><span class="ck-label">航向</span><b class="ck-val" id="ck-hdg">000°</b></div>' +
    '<div class="ck-inst"><span class="ck-label">油门</span><span class="ck-throttle"><span id="ck-throttle-fill"></span></span></div>';
  dash.appendChild(instruments);
  cockpit.appendChild(dash);

  document.getElementById('app')?.appendChild(cockpit);

  const hudPanel = document.getElementById('flight-hud');
  const speedLines = document.getElementById('speed-lines');
  const adiInner = cockpit.querySelector<SVGElement>('.adi-inner');
  const ladder = cockpit.querySelector<SVGElement>('.reticle-ladder');
  const ckSpeed = document.getElementById('ck-speed');
  const ckAlt = document.getElementById('ck-alt');
  const ckHdg = document.getElementById('ck-hdg');
  const ckThrottle = document.getElementById('ck-throttle-fill');

  // 1 米对应多少屏幕像素（用于阴影下移量）
  function pxPerMeter(lng: number, lat: number): number {
    const dLng = 100 / (111320 * Math.cos((lat * Math.PI) / 180));
    const a = map.project([lng, lat]);
    const b = map.project([lng + dLng, lat]);
    return Math.hypot(b.x - a.x, b.y - a.y) / 100;
  }

  function update(state: FlightState, viewMode: FlightViewMode): void {
    const speedT = Math.min(Math.max((state.speed - 12) / (135 - 12), 0), 1);
    // 速度线：高速时显隐（两种视角都适用）
    speedLines?.classList.toggle('show', speedT > SPEED_LINE_THRESHOLD);

    if (viewMode === 'chase') {
      cockpit.classList.add('hidden');
      aircraft.classList.remove('hidden');

      // 精灵贴合飞机屏幕位置
      const pt = map.project([state.lng, state.lat]);
      aircraft.style.left = pt.x + 'px';
      aircraft.style.top = pt.y + 'px';

      const sc = SPRITE_SCALE_MIN + speedT * SPRITE_SCALE_RANGE;
      const squash = Math.min(Math.max(1 + state.pitch * PITCH_SQUASH, 0.85), 1.15);
      // 高速时精灵加低频正弦抖动（气流感）
      const jitter = speedT > SPEED_LINE_THRESHOLD ? Math.sin(performance.now() * 0.07) * SPRITE_JITTER_DEG : 0;
      bank.style.transform = `rotate(${(state.roll * ROLL_SPRITE_K + jitter).toFixed(1)}deg) scaleY(${squash.toFixed(3)}) scale(${sc.toFixed(3)})`;

      // 地面阴影：随机身高度下移，给无地形层的高度一个视觉锚点
      const offset = Math.min(state.alt * pxPerMeter(state.lng, state.lat) * SHADOW_K, SHADOW_MAX_PX);
      shadow.style.transform = `translate(-50%, calc(-50% + ${offset.toFixed(0)}px))`;
      shadow.style.opacity = Math.min(Math.max(0.45 - offset / SHADOW_MAX_PX * 0.25, 0.18), 0.45).toFixed(2);
    } else {
      aircraft.classList.add('hidden');
      cockpit.classList.remove('hidden');

      const rollRot = (state.roll * ROLL_SIGN).toFixed(1);
      const pitchShift = (state.pitch * PITCH_PX_DEG_ADI).toFixed(1);
      if (adiInner) {
        adiInner.style.transform = `rotate(${rollRot}deg) translate(0px, ${pitchShift}px)`;
        adiInner.style.transformOrigin = '60px 60px';
      }
      if (ladder) {
        // 让 reticle 的地平线刻度贴合真实画面地平线（相机下视偏置后，真实地平线
        // 并不在画面正中，而在上方——此前仪表与画面差了 ~12°）。
        // 地平线屏幕位置 ≈ 沿航向很远地面点的投影收敛值（30km 已足够收敛）。
        const hr = deg2rad(state.heading);
        const [flng, flat] = advanceMeters(
          state.lng,
          state.lat,
          30000 * Math.sin(hr),
          30000 * Math.cos(hr),
        );
        const fp = map.project([flng, flat]);
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2; // reticle 居中于视口，其中心即视口中心
        // 横滚时探针点随画面一起转，先撤掉横滚，还原无滚转时的地平线偏移（纯垂直）。
        // 相机右滚 roll 使画面逆时针转 roll，故探针偏移顺时针转 roll 即可还原。
        const dx = fp.x - cx;
        const dy = fp.y - cy;
        const rr = deg2rad(state.roll);
        const ly = dx * Math.sin(rr) + dy * Math.cos(rr); // 无滚转地平线偏移
        // 视线中心相对地平线的俯角（maplibre pitch：0=朝下，90=水平）
        const elevDeg = map.getPitch() - 90;
        const pxPerDeg =
          Math.abs(elevDeg) > 0.5
            ? Math.abs(ly) / Math.abs(elevDeg)
            : PITCH_PX_DEG_RETICLE;
        const s = pxPerDeg / PITCH_PX_DEG_RETICLE;
        // 用 SVG 属性 transform（语义无歧义，绕局部原点=画面中心）：先缩放使阶梯
        // 度数比例对齐世界，再平移到地平线，最后绕中心旋转（相机横滚时地平线绕
        // 视口中心转——与真实画面一致）。
        ladder.setAttribute(
          'transform',
          `rotate(${rollRot}) translate(0 ${ly.toFixed(1)}) scale(${s.toFixed(3)})`,
        );
      }
      const tapeW = tapeWrap.clientWidth;
      strip.style.transform = `translateX(${(tapeW / 2 - (state.heading - HDG_TAPE_DEG_FROM) * HDG_PX_PER_DEG).toFixed(1)}px)`;

      if (ckSpeed) ckSpeed.textContent = String(Math.round(state.speed * 3.6));
      if (ckAlt) ckAlt.textContent = String(Math.round(state.alt));
      if (ckHdg) ckHdg.textContent = String(Math.round(state.heading)).padStart(3, '0') + '°';
      if (ckThrottle) ckThrottle.style.height = (state.throttle * 100).toFixed(0) + '%';
    }

    // V1R3-003：座舱视角 = 沉浸驾驶——左上 HUD 只留导航格与精简退出提示，
    // 隐藏与座舱仪表重复的速度/高度/航向/油门及驾驶教学（hud-keys）。
    const cockpitMode = viewMode === 'cockpit';
    hudPanel?.classList.toggle('cockpit-mode', cockpitMode);
    hudPanel?.classList.toggle('dimmed', false);
    const keysEl = document.getElementById('hud-keys');
    if (keysEl) keysEl.classList.toggle('hidden', cockpitMode);
    const miniEl = document.getElementById('hud-mini');
    if (miniEl) miniEl.classList.toggle('hidden', !cockpitMode);
  }

  function setActive(active: boolean): void {
    aircraft.classList.toggle('hidden', !active);
    cockpit.classList.add('hidden');
    speedLines?.classList.remove('show');
    hudPanel?.classList.remove('cockpit-mode');
    hudPanel?.classList.remove('dimmed');
    document.getElementById('hud-keys')?.classList.remove('hidden');
    document.getElementById('hud-mini')?.classList.add('hidden');
  }

  return { update, setActive };
}
