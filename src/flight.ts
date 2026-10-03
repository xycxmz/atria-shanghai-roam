// 模拟飞行器视角控制器（街机式，非物理仿真）
// 依据 docs/DESIGN-FLIGHT-CAMERA-2026-10-02.md，用户已批准实施。
//
// maplibre-gl v6 是「围绕中心点的轨道相机」，本模块把飞行器姿态映射到
// {center, zoom, pitch, bearing, roll}：
//   center  = 飞机经纬度（追尾）或由 calculateCameraOptionsFromTo 反解（座舱）
//   bearing = 航向 ψ
//   pitch   = 追尾固定 ~78°；座舱由「相机位置→前视点」反解（接近 90° 平视）
//   roll    = 机身横滚 φ（v6 一等参数，直接对应压坡画面倾斜）
//
// 飞行模型（stepFlight）是纯函数，不依赖 map/DOM，方便无浏览器回归。

import { MercatorCoordinate, LngLat, type Map } from 'maplibre-gl';

export type FlightViewMode = 'chase' | 'cockpit';

export interface FlightState {
  lng: number;
  lat: number;
  heading: number; // 度，0=北，顺时针
  pitch: number; // 度，抬机头为正
  roll: number; // 度，右翼下为正
  speed: number; // m/s
  throttle: number; // 0..1
  alt: number; // m，语义高度（无地形层，仅 HUD 与座舱反解用）
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const deg2rad = (d: number): number => (d * Math.PI) / 180;

// ---- 飞行模型调参（F4 阶段集中调整）----
export const SPEED_SCALE = 1.5; // 整体速度倍率（体验调参，1.5×）
export const MAX_SPEED = 90 * SPEED_SCALE; // m/s ≈ 486 km/h，城市上空
export const MIN_SPEED = 8 * SPEED_SCALE; // m/s，油门归零仍保持蠕行，避免完全停住
export const LOW_SPEED_LIMIT = 8 * SPEED_SCALE; // 低于此速度限制大坡度，避免原地打转
export const PITCH_RATE = 30; // 度/秒，拉/压杆速率
export const ROLL_RATE = 65; // 度/秒，压杆速率
export const MAX_ROLL = 55; // 度，最大坡度
export const MAX_ROLL_LOW_SPEED = 12; // 度，低速下允许的最大坡度
export const MAX_PITCH = 22; // 度，抬/压机头上限
export const ROLL_DAMP = 2.6; // 1/秒，松杆横滚回中阻尼
export const PITCH_DAMP = 1.4; // 1/秒，松杆俯仰回中阻尼
export const TURN_COEF = 1.15; // 度/秒/度坡度，协调转弯：横滚驱动偏航
export const THROTTLE_RATE = 0.8; // 1/秒，油门推/收速率
export const SPEED_APPROACH = 1.6; // 1/秒，速度趋近油门目标的快慢
export const SPACE_PITCH_BOOST = 3.2; // 空格紧急爬升的拉杆倍率

// ---- 追尾镜头 ----
// pitch 从 v1 的 78° 降到 62°：更靠俯视，既让顶视图飞机剪影读感更正，
// 也让转弯时尾迹能扫进视野（追尾镜头里飞机正后方永远在镜头背后，
// 只有更陡的俯角+转弯才能看到尾迹弧线）。
export const CHASE_PITCH = 62; // 度，后上方俯视
export const CHASE_PITCH_DROP = 5; // 度，油门推满时镜头压平一点，速度感更强
export const CHASE_ZOOM_NEAR = 15.5; // 慢速时镜头近
export const CHASE_ZOOM_FAR = 14.5; // 快速时镜头远

// ---- 座舱镜头 ----
export const COCKPIT_LOOK_AHEAD = 400; // 米，前视点距离（需 ≥50m，否则 fromTo 抛错）
// 座舱视角的下视偏置：前视点比飞机低 LOOK_AHEAD×sin(12°)，
// 平飞时 camera pitch ≈ 78°（能看见前方城市），而非 90°（纯水平地平线看不到地图）。
export const COCKPIT_LOOK_DOWN_DEG = 12;
export const MAX_PITCH_LIMIT = 120; // 放宽 pitch 上限以支持平视/座舱（>60 为官方实验性区间）

// ---- 高度软边界（语义高度，无地形参照）----
// 整体抬高约 2×（2026-10-03）：出生 600m 高于陆家嘴群楼，上限留出俯冲与爬升空间。
export const ALT_MIN = 400;
export const ALT_MAX = 1000;
export const SPAWN_ALT = 600;

// ---- 地理边界：上海市域外环内，越界时航向向内拉回 ----
export const BOUNDS = {
  minLng: 121.25,
  maxLng: 121.65,
  minLat: 31.12,
  maxLat: 31.35,
  centerLng: 121.4905,
  centerLat: 31.229,
};
export const BOUND_TURN_RATE = 60; // 度/秒，越界后航向回转速率

// 出生点：陆家嘴上海中心大厦上方
export const SPAWN: Readonly<FlightState> = {
  lng: 121.505,
  lat: 31.2336,
  heading: 30,
  pitch: 0,
  roll: 0,
  speed: 45,
  throttle: 0.4,
  alt: SPAWN_ALT,
};

// 游戏按键（用 e.code 物理键位，WASD 不受输入法/布局影响）
const HANDLED_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyV', 'KeyR',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Escape',
]);

export function bearingTo(lng: number, lat: number, toLng: number, toLat: number): number {
  const dLng = deg2rad(toLng - lng);
  const lat1 = deg2rad(lat);
  const lat2 = deg2rad(toLat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// 沿最短路径把 heading 转向 target，单帧最多转 maxDelta 度
export function rotateToward(heading: number, target: number, maxDelta: number): number {
  let diff = ((target - heading + 540) % 360) - 180;
  diff = clamp(diff, -maxDelta, maxDelta);
  return (heading + diff + 360) % 360;
}

// 米制 ENU 位移 → 经纬度。MercatorCoordinate 是保角投影，1 米在任意方向
// 对应同样的 mercator 单位，所以用 meterInMercatorCoordinateUnits() 一个因子即可。
export function advanceMeters(lng: number, lat: number, east: number, north: number): [number, number] {
  const mc = MercatorCoordinate.fromLngLat([lng, lat]);
  const units = mc.meterInMercatorCoordinateUnits();
  mc.x += east * units;
  mc.y -= north * units; // mercator y 向南增长，北向位移取负
  const ll = mc.toLngLat();
  return [ll.lng, ll.lat];
}

const hasAny = (keys: Set<string>, codes: string[]): boolean => codes.some((c) => keys.has(c));

// 两点间地面距离（米），等距圆柱近似。Demo 精度足够（打卡/穿环检测用）。
export function distanceMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const cosLat = Math.cos(deg2rad((lat1 + lat2) / 2));
  return Math.hypot((lng2 - lng1) * 111320 * cosLat, (lat2 - lat1) * 110540);
}

// 飞行模型积分（纯函数，原地修改 state）。keys 为当前按下的 e.code 集合。
export function stepFlight(state: FlightState, keys: Set<string>, dt: number): void {
  const s = state;

  // 油门：Shift 推 / Ctrl、Z 收
  const throttleDir = (hasAny(keys, ['ShiftLeft', 'ShiftRight']) ? 1 : 0) - (hasAny(keys, ['ControlLeft', 'ControlRight', 'KeyZ']) ? 1 : 0);
  s.throttle = clamp(s.throttle + throttleDir * THROTTLE_RATE * dt, 0, 1);

  // 横滚：A/← 压左坡，D/→ 压右坡；松杆阻尼回中
  const rollDir = (hasAny(keys, ['KeyD', 'ArrowRight']) ? 1 : 0) - (hasAny(keys, ['KeyA', 'ArrowLeft']) ? 1 : 0);
  if (rollDir !== 0) {
    s.roll = clamp(s.roll + rollDir * ROLL_RATE * dt, -MAX_ROLL, MAX_ROLL);
  } else {
    s.roll *= Math.exp(-ROLL_DAMP * dt);
  }

  // 俯仰：W/↑ 抬机头，S/↓ 压机头；空格紧急爬升（V1-005 修复：单按空格真实抬头；
  // 空格与 S 冲突时 S 优先压杆）；松杆阻尼回中
  let pitchDir = (hasAny(keys, ['KeyW', 'ArrowUp']) ? 1 : 0) - (hasAny(keys, ['KeyS', 'ArrowDown']) ? 1 : 0);
  if (pitchDir === 0 && keys.has('Space')) pitchDir = 1;
  const pitchRate = PITCH_RATE * (keys.has('Space') ? SPACE_PITCH_BOOST : 1);
  if (pitchDir !== 0) {
    s.pitch = clamp(s.pitch + pitchDir * pitchRate * dt, -MAX_PITCH, MAX_PITCH);
  } else {
    s.pitch *= Math.exp(-PITCH_DAMP * dt);
  }

  // 低速禁大坡度，避免原地打转
  if (s.speed < LOW_SPEED_LIMIT) {
    s.roll = clamp(s.roll, -MAX_ROLL_LOW_SPEED, MAX_ROLL_LOW_SPEED);
  }

  // 协调转弯：横滚驱动偏航，坡度越大转得越快
  s.heading = (s.heading + s.roll * TURN_COEF * dt + 360) % 360;

  // 速度趋近油门目标
  const target = MIN_SPEED + s.throttle * (MAX_SPEED - MIN_SPEED);
  s.speed = clamp(s.speed + (target - s.speed) * SPEED_APPROACH * dt, MIN_SPEED, MAX_SPEED);

  // 位置推进（ENU 系）
  const hr = deg2rad(s.heading);
  const pr = deg2rad(s.pitch);
  const cosP = Math.cos(pr);
  const e = s.speed * dt * cosP * Math.sin(hr);
  const n = s.speed * dt * cosP * Math.cos(hr);
  const u = s.speed * dt * Math.sin(pr);
  const [lng, lat] = advanceMeters(s.lng, s.lat, e, n);
  s.lng = lng;
  s.lat = lat;
  s.alt = clamp(s.alt + u, ALT_MIN, ALT_MAX);

  // 越界软约束：航向向市中心回转
  const inside = s.lng > BOUNDS.minLng && s.lng < BOUNDS.maxLng && s.lat > BOUNDS.minLat && s.lat < BOUNDS.maxLat;
  if (!inside) {
    const desired = bearingTo(s.lng, s.lat, BOUNDS.centerLng, BOUNDS.centerLat);
    s.heading = rotateToward(s.heading, desired, BOUND_TURN_RATE * dt);
  }
}

export interface FlightController {
  toggle(): void;
  enter(): void;
  exit(): void;
  isActive(): boolean;
  getState(): FlightState;
  getViewMode(): FlightViewMode;
  // 故事查看器等场景暂停物理与相机驱动（rAF 循环本身保持运转）
  setPaused(paused: boolean): void;
}

export interface FlightControllerOptions {
  // 每帧（飞行激活时）回调，把状态与当前视角分发给视图/玩法层
  onFrame?: (state: FlightState, viewMode: FlightViewMode) => void;
  // 进出飞行模式时回调（视图/玩法层据此显隐、重置）
  onActiveChange?: (active: boolean) => void;
}

export function createFlightController(map: Map, opts: FlightControllerOptions = {}): FlightController {
  let active = false;
  let engaged = false; // 入场/视角过渡动画结束后才接管逐帧驱动
  let paused = false; // 故事查看器等场景暂停物理（rAF 循环不停）
  let viewMode: FlightViewMode = 'chase';
  let state: FlightState = { ...SPAWN };
  let prevMaxPitch = 60;
  let rafId = 0;
  let lastT = 0;
  let engageTimer: ReturnType<typeof setTimeout> | undefined;

  const keys = new Set<string>();

  const hud = {
    root: document.getElementById('flight-hud'),
    speed: document.getElementById('hud-speed'),
    alt: document.getElementById('hud-alt'),
    heading: document.getElementById('hud-heading'),
    throttleFill: document.getElementById('hud-throttle-fill'),
    view: document.getElementById('hud-view'),
  };
  const flightBtn = document.getElementById('flight-btn');

  function chaseParams(): { center: [number, number]; zoom: number; pitch: number; bearing: number; roll: number } {
    const speedT = clamp((state.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0, 1);
    return {
      center: [state.lng, state.lat],
      zoom: CHASE_ZOOM_NEAR - speedT * (CHASE_ZOOM_NEAR - CHASE_ZOOM_FAR),
      pitch: CHASE_PITCH - state.throttle * CHASE_PITCH_DROP,
      bearing: state.heading,
      roll: state.roll,
    };
  }

  function cockpitParams(): Record<string, unknown> {
    const hr = deg2rad(state.heading);
    const pr = deg2rad(state.pitch);
    const e = COCKPIT_LOOK_AHEAD * Math.cos(pr) * Math.sin(hr);
    const n = COCKPIT_LOOK_AHEAD * Math.cos(pr) * Math.cos(hr);
    const u = COCKPIT_LOOK_AHEAD * Math.sin(pr);
    // 下视偏置：让座舱镜头始终低于飞行路径 COCKPIT_LOOK_DOWN_DEG，
    // 平飞时也能俯看城市，而不是盯着水平地平线。
    const down = COCKPIT_LOOK_AHEAD * Math.sin(deg2rad(COCKPIT_LOOK_DOWN_DEG));
    const [tlng, tlat] = advanceMeters(state.lng, state.lat, e, n);
    // Map 类的 calculateCameraOptionsFromTo 重载要求 LngLat 实例（非 LngLatLike）
    const opts = map.calculateCameraOptionsFromTo(
      LngLat.convert([state.lng, state.lat]),
      state.alt,
      LngLat.convert([tlng, tlat]),
      state.alt + u - down,
    );
    return { ...opts, roll: state.roll };
  }

  function driveCamera(): void {
    map.jumpTo(viewMode === 'chase' ? chaseParams() : cockpitParams());
  }

  function updateHud(): void {
    if (!hud.root || hud.root.classList.contains('hidden')) return;
    if (hud.speed) hud.speed.textContent = String(Math.round(state.speed * 3.6));
    if (hud.alt) hud.alt.textContent = String(Math.round(state.alt));
    if (hud.heading) {
      const h = Math.round(state.heading);
      hud.heading.textContent = String(h).padStart(3, '0') + '°';
    }
    if (hud.throttleFill) hud.throttleFill.style.width = (state.throttle * 100).toFixed(0) + '%';
    if (hud.view) hud.view.textContent = viewMode === 'chase' ? '追尾' : '座舱';
  }

  const loop = (t: number): void => {
    if (!active) return;
    // dt 截断：合成器停恢复后避免一次积分跨越几秒造成瞬移
    const dt = lastT === 0 ? 1 / 60 : Math.min((t - lastT) / 1000, 0.1);
    lastT = t;
    if (engaged && !paused) {
      stepFlight(state, keys, dt);
      driveCamera();
    }
    updateHud();
    // 视图/玩法层挂同一循环：精灵定位、座舱仪表、尾迹、打卡检测
    opts.onFrame?.(state, viewMode);
    rafId = requestAnimationFrame(loop);
  };

  function clearEngageTimer(): void {
    if (engageTimer !== undefined) {
      clearTimeout(engageTimer);
      engageTimer = undefined;
    }
  }

  // 等当前相机动画（入场飞越 / 视角切换）结束后再接管逐帧驱动，
  // 避免 jumpTo 与 flyTo 互相打架。moveend 正常会触发；兜底超时保证
  // 合成器停转等异常环境下也能恢复。
  function armEngage(): void {
    clearEngageTimer();
    map.once('moveend', () => {
      if (active) engaged = true;
    });
    engageTimer = setTimeout(() => {
      if (active) engaged = true;
    }, 2100);
  }

  function disableHandlers(): void {
    map.keyboard.disable();
    map.dragPan.disable();
    map.dragRotate.disable();
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
  }

  function enableHandlers(): void {
    map.keyboard.enable();
    map.dragPan.enable();
    map.dragRotate.enable();
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!active) return;
    // 故事阅读等暂停态：不响应任何操纵键（含 Esc，退出由故事 overlay 自己处理）
    if (paused) return;
    if (HANDLED_CODES.has(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyV') {
      viewMode = viewMode === 'chase' ? 'cockpit' : 'chase';
      if (engaged) {
        // 暂停物理，用短飞越把镜头带到新视角，结束后恢复逐帧驱动
        engaged = false;
        map.flyTo({ ...(viewMode === 'chase' ? chaseParams() : cockpitParams()), duration: 500, essential: true });
        armEngage();
      }
    } else if (e.code === 'Escape' || e.code === 'KeyR') {
      exit();
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    keys.delete(e.code);
  }

  // 窗口失焦时清空按键状态，避免切走再回来时飞机持续转弯
  function onBlur(): void {
    keys.clear();
  }

  function enter(): void {
    if (active) return;
    active = true;
    engaged = false;
    viewMode = 'chase';
    state = { ...SPAWN };
    keys.clear();

    prevMaxPitch = map.getMaxPitch();
    disableHandlers();
    map.stop(); // 打断可能进行中的地标 flyTo
    map.setMaxPitch(MAX_PITCH_LIMIT);

    // 从当前视角平滑过渡到出生点追尾视角，再切换到逐帧驱动
    map.flyTo({ ...chaseParams(), duration: 1800, essential: true });
    armEngage();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    if (hud.root) hud.root.classList.remove('hidden');
    if (flightBtn) flightBtn.classList.add('active');
    opts.onActiveChange?.(true);
    lastT = 0;
    rafId = requestAnimationFrame(loop);
  }

  function exit(): void {
    if (!active) return;
    active = false;
    engaged = false;
    clearEngageTimer();
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    keys.clear();
    enableHandlers();

    if (hud.root) hud.root.classList.add('hidden');
    if (flightBtn) flightBtn.classList.remove('active');
    opts.onActiveChange?.(false);

    // 先把 pitch 缓回 60 以内，再恢复原来的 pitch 上限，
    // 避免在 78°/座舱大 pitch 下直接收紧上限造成画面瞬切
    map.easeTo({ pitch: 55, duration: 700, essential: true });
    map.once('moveend', () => {
      if (!active) map.setMaxPitch(prevMaxPitch);
    });
  }

  function toggle(): void {
    if (active) exit();
    else enter();
  }

  return {
    toggle,
    enter,
    exit,
    isActive: () => active,
    getState: () => state,
    getViewMode: () => viewMode,
    setPaused: (p: boolean) => {
      paused = p;
      if (p) keys.clear(); // 阅读故事期间清空按键状态，避免恢复时飞机持续转弯
    },
  };
}
