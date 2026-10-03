// 镜头漫游引擎：开场电影镜头 + 观影模式自动飞行。
// 依据 docs/DESIGN-COMPETITION-2026-10-03.md。
// 统一为「逐帧 jumpTo + 缓动」，不依赖 flyTo 链（moveend 时序在隐藏标签页等环境不可靠）。

import type { Map } from 'maplibre-gl';
import {
  bearingTo,
  rotateToward,
  advanceMeters,
  distanceMeters,
  clamp,
  deg2rad,
  MAX_ROLL,
  type FlightState,
} from './flight';

// 缓动：进出段都平滑
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// 角度按最短路径插值
function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + 540) % 360) - 180;
  return a + diff * t;
}

interface ViewKey {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
  durMs: number;
}

// ---- 开场镜头路径：上海西郊高空 → 外滩对望 → 陆家嘴塔群 → 定妆默认视角 ----
const ENTRY_PATH: ViewKey[] = [
  { lng: 121.42, lat: 31.238, zoom: 10.5, pitch: 34, bearing: 100, durMs: 2600 },
  { lng: 121.484, lat: 31.241, zoom: 13.5, pitch: 54, bearing: 96, durMs: 3600 },
  { lng: 121.5035, lat: 31.2355, zoom: 16, pitch: 62, bearing: -30, durMs: 3000 },
  { lng: 121.4905, lat: 31.229, zoom: 14.2, pitch: 55, bearing: -20, durMs: 1300 },
];

export interface EntryCallbacks {
  onDone?: () => void;
}

export function playEntry(map: Map, cb: EntryCallbacks = {}): void {
  const app = document.getElementById('app');

  // 透明拦截层：开场期间吸收一切点击，点击 = 跳过
  const scrim = document.createElement('div');
  scrim.id = 'entry-scrim';
  app?.appendChild(scrim);

  // 标题卡
  const card = document.createElement('div');
  card.id = 'entry-card';
  card.innerHTML =
    '<div class="ec-title">上海 · 3D 城市漫游</div>' +
    '<div class="ec-sub">atria-demo · 飞行 · 故事 · 打卡</div>';
  app?.appendChild(card);

  let active = true;
  let rafId = 0;
  // segIdx：当前「从 keyframe[segIdx] 飞向 keyframe[segIdx+1]」的段号；
  // 段时长取 keyframe[segIdx].durMs（起点 keyframe 的 dur 即离开它所用的时间）
  const SEGMENTS = ENTRY_PATH.length - 1;
  let segIdx = 0;
  let segT = 0;
  let lastTs = 0;

  const finish = (): void => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(rafId);
    // 直接落到终点视角
    const end = ENTRY_PATH[ENTRY_PATH.length - 1];
    map.jumpTo({ center: [end.lng, end.lat], zoom: end.zoom, pitch: end.pitch, bearing: end.bearing });
    card.classList.remove('show');
    // 拦截层立即移除：跳过后随即出现首屏动作卡，其按钮必须立即可点
    // （V1R2-001：此前 scrim 留到淡出动画结束，开场后 ~900ms 内动作卡点不动）。
    // 标题卡的淡出动画在动作卡下层进行，不受影响。
    scrim.remove();
    window.setTimeout(() => {
      card.remove();
    }, 900);
    cb.onDone?.();
  };

  const onUserInput = (): void => finish();
  window.addEventListener('pointerdown', onUserInput, { once: true });
  window.addEventListener('keydown', onUserInput, { once: true });
  window.addEventListener('wheel', onUserInput, { once: true, passive: true });

  // 起始帧先摆到第一格
  const first = ENTRY_PATH[0];
  map.jumpTo({ center: [first.lng, first.lat], zoom: first.zoom, pitch: first.pitch, bearing: first.bearing });

  const loop = (ts: number): void => {
    if (!active) return;
    const dt = lastTs === 0 ? 16 : Math.min(ts - lastTs, 64);
    lastTs = ts;
    segT += dt;

    const from = ENTRY_PATH[segIdx];
    const to = ENTRY_PATH[segIdx + 1];
    const t = Math.min(segT / from.durMs, 1);
    const e = easeInOutCubic(t);

    map.jumpTo({
      center: [lerp(from.lng, to.lng, e), lerp(from.lat, to.lat, e)],
      zoom: lerp(from.zoom, to.zoom, e),
      pitch: lerp(from.pitch, to.pitch, e),
      bearing: lerpAngle(from.bearing, to.bearing, e),
    });

    // 标题卡：从第 2 段（掠过外滩）起一直显示，finish() 时淡出
    if (segIdx >= 1) card.classList.add('show');

    if (t >= 1) {
      segIdx += 1;
      segT = 0;
      if (segIdx >= SEGMENTS) {
        finish();
        return;
      }
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

// ============================================================
// 观影模式：沿固定航线自动飞行（合成 FlightState，复用 v2 渲染管线）
// ============================================================

// 航线（lon, lat）：陆家嘴塔群 → 沿江北上 → 外滩 → 豫园 → 中华艺术宫 → 回到起点循环
const TOUR_WAYPOINTS: Array<[number, number]> = [
  [121.5165, 31.2415], // 塔群东侧
  [121.5065, 31.253], // 沿黄浦江北上
  [121.4955, 31.2475], // 折向外滩北段
  [121.4895, 31.239], // 外滩
  [121.492, 31.229], // 南下
  [121.4924, 31.2273], // 豫园
  [121.501, 31.205], // 世博一带
  [121.5033, 31.1838], // 中华艺术宫
  [121.512, 31.213], // 回程
  [121.505, 31.2336], // 陆家嘴（起点，循环）
];

const TOUR_SPEED = 80; // m/s 观光速度
const TOUR_TURN_RATE = 42; // 度/秒（比玩家柔和）
const TOUR_ALT_BASE = 620;
const TOUR_ARRIVE_M = 160;
const TOUR_ZOOM = 15.0;
const TOUR_PITCH = 60;

export interface TourCallbacks {
  /** 每帧驱动：合成状态交给 v2 管线（精灵/尾迹/打卡/故事提示） */
  onUpdate?: (state: FlightState, viewMode: 'chase') => void;
  /** 引擎停止（Esc/点击/外部 stop）后调用，统一做 HUD 复位等收尾 */
  onStop?: () => void;
  /** 冻结（如读故事）与恢复时调用 */
  onPause?: () => void;
  onResume?: () => void;
  /** V1R2-002：阅读层（故事/图鉴/首屏卡片）是否打开——打开时 Esc 不退出导览 */
  isOverlayOpen?: () => boolean;
}

export interface TourController {
  stop(): void;
  /** 冻结循环（如打开故事面板）；恢复用 resume()。与 stop 不同：不触发 teardown */
  pause(): void;
  resume(): void;
}

export function playTour(map: Map, cb: TourCallbacks = {}): TourController {
  let active = true;
  let rafId = 0;
  let wpIdx = 0;
  let heading = 30;
  let lng = 121.505;
  let lat = 31.2336;
  let lastTs = 0;
  let paused = false; // 故事面板等场景冻结循环（V1-004）

  const stop = (): void => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onClick, true);
    cb.onStop?.();
  };

  const pause = (): void => {
    if (!active || paused) return;
    paused = true;
    cancelAnimationFrame(rafId);
    cb.onPause?.();
  };

  const resume = (): void => {
    if (!active || !paused) return;
    paused = false;
    lastTs = 0; // 重置时间戳，避免冻结期间累积 dt 造成瞬移
    rafId = requestAnimationFrame(loop);
    cb.onResume?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      // V1R2-002：Escape 归属「阅读层」优先——故事/图鉴/首屏卡片打开时不退出
      // 导览（它们自己处理 Esc 关闭）。此前 capture 监听先于阅读层执行并
      // stopPropagation，导致第一次 Esc 退出导览、故事留在屏幕上。
      if (cb.isOverlayOpen?.()) return;
      e.preventDefault();
      e.stopPropagation();
      stop();
    }
  };
  // 点击退出：但点到 UI（顶栏按钮、图鉴侧栏）与故事 overlay/prompt 上不算——
  // 那些是有意义的交互，不应顺手退出观影。V1-004：补 #gallery/#panel。
  const onClick = (e: MouseEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && t.closest('#story-overlay, #story-prompt, #entry-card, #topbar, .maplibregl-ctrl-group, #panel, #gallery, #nav-chip')) return;
    stop();
  };
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onClick, true);

  const loop = (ts: number): void => {
    if (!active || paused) return;
    const dt = Math.min(lastTs === 0 ? 0.016 : (ts - lastTs) / 1000, 0.1);
    lastTs = ts;

    const [wLon, wLat] = TOUR_WAYPOINTS[wpIdx];
    const desired = bearingTo(lng, lat, wLon, wLat);
    heading = rotateToward(heading, desired, TOUR_TURN_RATE * dt);

    // 前进
    const hr = deg2rad(heading);
    const [nLng, nLat] = advanceMeters(lng, lat, TOUR_SPEED * dt * Math.sin(hr), TOUR_SPEED * dt * Math.cos(hr));
    lng = nLng;
    lat = nLat;

    // 航点切换
    if (distanceMeters(lng, lat, wLon, wLat) < TOUR_ARRIVE_M) {
      wpIdx = (wpIdx + 1) % TOUR_WAYPOINTS.length;
    }

    // 横滚随剩余转向量：转得越急压得越深
    let delta = ((desired - heading + 540) % 360) - 180;
    const roll = clamp(delta * 1.4, -MAX_ROLL, MAX_ROLL);
    const alt = TOUR_ALT_BASE + Math.sin(ts / 6200) * 70;

    const state: FlightState = {
      lng,
      lat,
      heading,
      pitch: 0,
      roll,
      speed: TOUR_SPEED,
      throttle: 0.6,
      alt,
    };

    map.jumpTo({
      center: [lng, lat],
      zoom: TOUR_ZOOM,
      pitch: TOUR_PITCH,
      bearing: heading,
      roll,
    });

    cb.onUpdate?.(state, 'chase');
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  return { stop, pause, resume };
}
