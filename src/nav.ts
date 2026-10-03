// 飞行/浏览导航：设置目标地标 → 画虚线航线 + 目标脉冲点 + 底部 chip + 飞行 HUD 方向箭头，
// 进入 250m 判定到达。依据 docs/DESIGN-LANDMARKS-2026-10-03.md 第 2 节。
//
// 当前位置语义：飞行中取飞机 state；浏览时取相机中心（map.getCenter()）。
// 飞行中由 onFrame 每帧驱动 update(state)；浏览时由 main 在 moveend 驱动 update()。

import type { Map } from 'maplibre-gl';
import type { Landmark } from './landmarks';
import { distanceMeters, bearingTo, type FlightState } from './flight';

const NAV_SOURCE = 'nav-route';
const NAV_LAYER = 'nav-route';
const ARRIVE_RADIUS_M = 250;
const UI_THROTTLE_MS = 100; // 渲染节流（setData/文本/箭头），到达判定不受限

export interface NavCallbacks {
  /** 到达目标（进入 ARRIVE_RADIUS_M）时触发一次，参数为目标地标 */
  onArrive?: (lm: Landmark) => void;
  /** 目标变化（设置/取消）时触发，参数为当前目标或 null */
  onTargetChange?: (lm: Landmark | null) => void;
  /** 出生/首帧采样就在到达半径内：提示「已在附近」，不算完成航程（V1R2-004） */
  onNearby?: (lm: Landmark) => void;
}

export interface Nav {
  setTarget(lm: Landmark): void;
  clear(): void;
  getTarget(): Landmark | null;
  /** 飞行中每帧调用（带 state）；浏览时在 moveend 调用（无参，用相机中心） */
  update(state?: FlightState): void;
}

export function createNav(map: Map, cb: NavCallbacks = {}): Nav {
  let target: Landmark | null = null;
  let arrived = false;
  let layerReady = false;
  let lastUiT = 0; // 渲染节流时间戳（V1-011）
  // V1R2-004：出生/首帧就在 250m 内不算「到达」——先提示「已在附近」并保留目标，
  // 真正离开半径后再次进入才算完成航程。
  let hasLeftRadius = false;
  let nearbyNotified = false;

  // ---- DOM：底部导航 chip ----
  const chip = document.createElement('div');
  chip.id = 'nav-chip';
  chip.className = 'hidden';
  chip.innerHTML =
    '<span class="nav-compass" id="nav-compass">➤</span>' +
    '<span class="nav-name" id="nav-name"></span>' +
    '<span class="nav-dist" id="nav-dist"></span>' +
    '<button class="nav-cancel" id="nav-cancel" title="取消导航">✕</button>';
  document.getElementById('app')?.appendChild(chip);

  // chip 上的箭头按相对方位旋转（浏览态：相对正北）
  const compass = chip.querySelector<HTMLElement>('#nav-compass');
  const nameEl = chip.querySelector<HTMLElement>('#nav-name');
  const distEl = chip.querySelector<HTMLElement>('#nav-dist');
  chip.querySelector('#nav-cancel')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clear();
  });

  // ---- DOM：目标脉冲点 ----
  const marker = document.createElement('div');
  marker.id = 'nav-marker';
  marker.className = 'hidden';
  document.getElementById('app')?.appendChild(marker);

  // ---- HUD 方向格（飞行中显示），节点在 index.html 的 #flight-hud 内 ----
  const hudNav = document.getElementById('hud-nav');
  const hudArrow = document.getElementById('hud-nav-arrow');
  const hudDist = document.getElementById('hud-nav-dist');

  function ensureLayer(): void {
    if (layerReady || map.getSource(NAV_SOURCE)) {
      layerReady = true;
      return;
    }
    map.addSource(NAV_SOURCE, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
    });
    map.addLayer({
      id: NAV_LAYER,
      type: 'line',
      source: NAV_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#4a9ecf',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 15, 2.5, 17, 4],
        'line-opacity': 0.85,
        'line-dasharray': [2, 1.5],
      },
    });
    layerReady = true;
  }

  function setRouteData(from: [number, number]): void {
    const source = map.getSource(NAV_SOURCE) as import('maplibre-gl').GeoJSONSource | undefined;
    if (!source || !target) return;
    source?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [from, [target.lon, target.lat]] },
      properties: {},
    });
  }

  function clearRouteData(): void {
    const source = map.getSource(NAV_SOURCE) as import('maplibre-gl').GeoJSONSource | undefined;
    source?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: {},
    });
  }

  function setTarget(lm: Landmark): void {
    ensureLayer();
    target = lm;
    arrived = false;
    hasLeftRadius = false;
    nearbyNotified = false;
    chip.classList.remove('hidden');
    marker.classList.remove('hidden');
    if (nameEl) nameEl.textContent = lm.name;
    cb.onTargetChange?.(lm);
    update();
  }

  function clear(): void {
    target = null;
    arrived = false;
    hasLeftRadius = false;
    nearbyNotified = false;
    lastUiT = 0;
    chip.classList.add('hidden');
    marker.classList.add('hidden');
    marker.style.left = '';
    marker.style.top = '';
    hudNav?.classList.add('hidden');
    clearRouteData();
    cb.onTargetChange?.(null);
  }

  function update(state?: FlightState): void {
    if (!target) return;

    // 起点：飞行中用飞机位置，否则用相机中心
    const fromLngLat = state
      ? ([state.lng, state.lat] as [number, number])
      : ([map.getCenter().lng, map.getCenter().lat] as [number, number]);

    const dist = distanceMeters(fromLngLat[0], fromLngLat[1], target.lon, target.lat);

    // 到达判定（V1-003 + V1R2-004 + V1R3-001）：航程资格（hasLeftRadius/
    // nearbyNotified/arrived）**只能由真实的飞行/观影样本更新**——浏览态
    // （无 state）的相机移动只更新显示。此前浏览相机落在目标外会把
    // hasLeftRadius 置真，随后飞机出生在目标附近即误报到达并清空目标。
    if (state) {
      if (!arrived && dist < ARRIVE_RADIUS_M) {
        if (hasLeftRadius) {
          arrived = true;
          cb.onArrive?.(target);
          clear();
          return;
        }
        if (!nearbyNotified) {
          nearbyNotified = true;
          cb.onNearby?.(target);
        }
      } else if (dist >= ARRIVE_RADIUS_M) {
        hasLeftRadius = true;
      }
    }

    // 渲染节流（V1-011）：飞行中每帧调用时，setData/文本/箭头按 ~100ms 更新，
    // 到达判定保持逐帧不漏
    const now = Date.now();
    if (now - lastUiT < UI_THROTTLE_MS) return;
    lastUiT = now;

    setRouteData(fromLngLat);

    // 目标点贴地投影
    const pt = map.project([target.lon, target.lat]);
    marker.style.left = pt.x + 'px';
    marker.style.top = pt.y + 'px';

    // chip：距离 +（飞行中）ETA
    const distText = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    let eta = '';
    if (state && state.speed > 1) {
      const secs = dist / state.speed;
      eta = ` · 约 ${Math.max(1, Math.round(secs))}s`;
    }
    if (distEl) distEl.textContent = distText + eta;

    // 相对方位（displayHeading 为 0 时指正上）
    const bearing = bearingTo(fromLngLat[0], fromLngLat[1], target.lon, target.lat);
    const refHeading = state ? state.heading : 0;
    const rel = (bearing - refHeading + 360) % 360;
    if (compass) compass.style.transform = `rotate(${rel.toFixed(1)}deg)`;

    if (hudNav && state) {
      hudNav.classList.remove('hidden');
      if (hudArrow) hudArrow.style.transform = `rotate(${rel.toFixed(1)}deg)`;
      if (hudDist) hudDist.textContent = distText;
    }
  }

  return {
    setTarget,
    clear,
    getTarget: () => target,
    update,
  };
}
