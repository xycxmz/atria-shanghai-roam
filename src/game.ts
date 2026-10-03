// 飞行玩法层：飞行尾迹 + 地标飞越打卡。
// 依据 docs/DESIGN-FLIGHT-V2-2026-10-02.md（P1 尾迹 + P2 打卡，穿越门未纳入本轮范围）。

import type { Map } from 'maplibre-gl';
import { landmarks } from './landmarks';
import { distanceMeters, BOUNDS, type FlightState } from './flight';

const TRAIL_SOURCE = 'flight-trail';
const TRAIL_LAYER = 'flight-trail';
const TRAIL_MIN_STEP_M = 30; // 每移动此距离追加一个轨迹点
const TRAIL_MAX_POINTS = 400; // 点数封顶，超出删头
const TRAIL_COLOR = '#4a9ecf';

const LANDMARK_RADIUS_M = 250; // 飞越判定半径
const CHECK_INTERVAL_MS = 200; // 打卡检测节流（1.5× 速度下 200ms 移动约 27m，远小于判定半径）
const TOAST_MS = 3200;

// V1-012：只有飞行软边界内的地标才参与「飞越」分母（朱家角等范围外点可预览/
// 读故事，但物理上飞不过去，不能进可集齐的统计）。
const FLYABLE_LANDMARKS = landmarks.filter(
  (lm) => lm.lon > BOUNDS.minLng && lm.lon < BOUNDS.maxLng && lm.lat > BOUNDS.minLat && lm.lat < BOUNDS.maxLat,
);

export interface Game {
  update(state: FlightState): void;
  setActive(active: boolean): void;
}

export function createGame(map: Map): Game {
  const trailPoints: [number, number][] = [];
  let trailReady = false;
  let lastTrailPoint: [number, number] | null = null;

  const visited = new Set<string>();
  let lastCheckT = 0;

  const toast = document.createElement('div');
  toast.id = 'flight-toast';
  toast.className = 'hidden';
  document.getElementById('app')?.appendChild(toast);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  // 打卡进度面板（右下角，仅飞行时显示）
  const panel = document.createElement('div');
  panel.id = 'lm-progress';
  panel.className = 'hidden';
  const panelTitle = document.createElement('div');
  panelTitle.className = 'lmp-title';
  const dots = document.createElement('div');
  dots.className = 'lmp-dots';
  panel.append(panelTitle, dots);
  document.getElementById('app')?.appendChild(panel);

  for (const lm of FLYABLE_LANDMARKS) {
    const dot = document.createElement('span');
    dot.className = 'lmp-dot';
    dot.dataset.id = lm.id;
    dot.title = lm.name;
    dots.appendChild(dot);
  }

  function refreshPanel(): void {
    panelTitle.textContent = `地标飞越 ${visited.size}/${FLYABLE_LANDMARKS.length}`;
    for (const dot of Array.from(dots.children) as HTMLElement[]) {
      dot.classList.toggle('done', visited.has(dot.dataset.id ?? ''));
    }
  }

  function showToast(title: string, note: string): void {
    toast.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'ft-title';
    t.textContent = title;
    toast.appendChild(t);
    if (note) {
      const n = document.createElement('div');
      n.className = 'ft-note';
      n.textContent = note;
      toast.appendChild(n);
    }
    toast.classList.remove('hidden');
    toast.classList.add('show');
    if (toastTimer !== undefined) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hidden');
    }, TOAST_MS);
  }

  // 尾迹源/层只建一次，之后复用
  function ensureTrail(): void {
    if (trailReady || map.getSource(TRAIL_SOURCE)) {
      trailReady = true;
      return;
    }
    map.addSource(TRAIL_SOURCE, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
    });
    map.addLayer({
      id: TRAIL_LAYER,
      type: 'line',
      source: TRAIL_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': TRAIL_COLOR,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 15, 3, 17, 5],
        'line-opacity': 0.6,
      },
    });
    trailReady = true;
  }

  function setTrailData(): void {
    const source = map.getSource(TRAIL_SOURCE) as import('maplibre-gl').GeoJSONSource | undefined;
    source?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: trailPoints },
      properties: {},
    });
  }

  function updateTrail(state: FlightState): void {
    ensureTrail();
    const p: [number, number] = [state.lng, state.lat];
    if (lastTrailPoint === null) {
      lastTrailPoint = p;
      trailPoints.push(p);
      setTrailData();
      return;
    }
    const moved = distanceMeters(lastTrailPoint[0], lastTrailPoint[1], p[0], p[1]);
    if (moved < TRAIL_MIN_STEP_M) return;
    trailPoints.push(p);
    lastTrailPoint = p;
    if (trailPoints.length > TRAIL_MAX_POINTS) trailPoints.splice(0, trailPoints.length - TRAIL_MAX_POINTS);
    setTrailData();
  }

  function updateChecklist(state: FlightState, t: number): void {
    if (t - lastCheckT < CHECK_INTERVAL_MS) return;
    lastCheckT = t;
    for (const lm of FLYABLE_LANDMARKS) {
      if (visited.has(lm.id)) continue;
      const d = distanceMeters(state.lng, state.lat, lm.lon, lm.lat);
      if (d < LANDMARK_RADIUS_M) {
        visited.add(lm.id);
        refreshPanel();
        showToast('飞越 · ' + lm.name, lm.note);
        if (visited.size === FLYABLE_LANDMARKS.length) {
          setTimeout(() => showToast('全部 ' + FLYABLE_LANDMARKS.length + ' 个地标已飞越', '可继续自由漫游，或按 Esc 退出飞行模式'), TOAST_MS + 400);
        }
      }
    }
  }

  function update(state: FlightState): void {
    updateTrail(state);
    updateChecklist(state, performance.now());
  }

  function setActive(active: boolean): void {
    if (active) {
      // 进场：清空尾迹与打卡进度
      trailPoints.length = 0;
      lastTrailPoint = null;
      visited.clear();
      if (map.getSource(TRAIL_SOURCE)) setTrailData();
      refreshPanel();
      panel.classList.remove('hidden');
      toast.classList.add('hidden');
      toast.classList.remove('show');
    } else {
      // 退场：尾迹保留供回看，面板与 toast 隐藏
      panel.classList.add('hidden');
      toast.classList.remove('show');
      toast.classList.add('hidden');
    }
  }

  return { update, setActive };
}
