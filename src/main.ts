import * as maplibregl from 'maplibre-gl';
// worker 文件由 vite 插件原样同步到 public/workers/，绕开打包对 worker 相对导入的破坏
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { createStyle, LOCAL_TILES, REMOTE_TILES } from './style';
import { landmarks, SHANGHAI_CENTER, type Landmark } from './landmarks';
import { isStoryRead } from './stories';
import { createFlightController } from './flight';
import { createFlightView } from './flight-view';
import { createGame } from './game';
import { createNav } from './nav';
import { createStoryViewer, createStoryTrigger } from './story-view';
import { createNearbyPanel } from './nearby';
import { createGallery } from './gallery';
import { playEntry, playTour, type TourController } from './cinematic';
import {
  searchLocal,
  searchOnline,
  addUserPlace,
  getUserPlaces,
  resultToLandmark,
  type SearchResult,
} from './search';
import './style.css';

maplibregl.setWorkerUrl('/workers/maplibre-gl-worker.mjs');

// 本地 PMTiles 通过 pmtiles:// 协议读取（vite 中间件提供 /tiles/*.pmtiles）
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', (params, abortController) => pmtilesProtocol.tile(params, abortController));

const SELECTED_SOURCE = 'selected-building';

// 本地高清晰瓦片（maxzoom 16）存在就用它，否则回退 OpenFreeMap（maxzoom 14）。
// 探测用 Range GET + 魔数校验：静态托管的 SPA 伪 200（返回 HTML）会被识别排除；
// PMTiles v3 文件头前 7 字节即 ASCII 'PMTiles'（V1-001）。
async function pickTileSource(): Promise<{ url: string; maxzoom: number }> {
  try {
    const res = await fetch('/tiles/shanghai.pmtiles', {
      method: 'GET',
      headers: { Range: 'bytes=0-15' },
    });
    // 206 + 正确长度才可能是真 PMTiles；200/404/异常一律回退
    if (res.status === 206) {
      const buf = new Uint8Array(await res.arrayBuffer());
      // PMTiles v3 文件头：ASCII 'PMTiles' 7 字节（0x50 0x4d 0x54 0x69 0x6c 0x65 0x73）
      const magic =
        buf.length >= 7 &&
        buf[0] === 0x50 &&
        buf[1] === 0x4d &&
        buf[2] === 0x54 &&
        buf[3] === 0x69 &&
        buf[4] === 0x6c &&
        buf[5] === 0x65 &&
        buf[6] === 0x73;
      if (magic) return LOCAL_TILES;
    }
  } catch {
    // 本地服务异常时静默回退
  }
  return REMOTE_TILES;
}

async function init(): Promise<void> {
  const tileSource = await pickTileSource();
  const map = new maplibregl.Map({
    container: 'map',
    style: createStyle(tileSource) as maplibregl.StyleSpecification,
    center: SHANGHAI_CENTER,
    zoom: 14.2,
    pitch: 55,
    bearing: -20,
    minZoom: 9,
    maxZoom: 18,
    hash: true,
  });

  // 调试句柄（Demo 验收用）
  const w = window as unknown as { __map: maplibregl.Map; __errs: unknown[]; __nav?: unknown };
  w.__map = map;
  w.__errs = [];
  map.on('error', (e) => {
    const err = (e as unknown as { error?: Error }).error;
    w.__errs.push(err?.message ?? (e as unknown as { type?: string }).type ?? 'unknown map error');
  });
  window.addEventListener('error', (e) => w.__errs.push(e.message));

  map.addControl(
    new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }),
    'top-right',
  );

  // 选中建筑高亮层已在样式中声明（selected-building 源），由点击事件填充数据

  map.on('load', () => {
    enableBuildingPick(map);

    const nav = createNav(map, {
      onArrive: (lm) => showArrival(lm.name),
      onNearby: (lm) => showHint(`已在附近 · ${lm.name}`),
    });
    const storyViewer = createStoryViewer({
      onOpen: () => {
        flight.setPaused(true);
        tour?.pause(); // V1-004：观影中读故事冻结航线，不再后台继续飞
      },
      onClose: () => {
        flight.setPaused(false);
        tour?.resume();
        refreshStoryButtons();
      },
    });

    // 地标面板：附近 5 个 + 其余折叠；点击 = 预览 + 导航
    const nearby = createNearbyPanel(map, {
      onPick: (lm) => {
        flyToLandmark(map, lm);
        nav.setTarget(lm);
      },
      onStory: (id) => storyViewer.open(id),
    });
    nearbyRef = nearby;
    buildSearchUI(map, nav);
    buildUserPlaces(map, nav);
    refreshStoryButtons();
    w.__nav = nav; // 调试句柄（与 __map/__errs 一致，用于导航语义验收）

    const flightView = createFlightView(map);
    const game = createGame(map);
    const storyTrigger = createStoryTrigger(storyViewer, landmarks);

    const flight = createFlightController(map, {
      onFrame: (state, viewMode) => {
        flightView.update(state, viewMode);
        game.update(state);
        nav.update(state);
        storyTrigger.update(state);
        nearby.update(state);
        // V1R3-003：座舱时打卡进度让位座舱仪表（不与驾驶读数争夺视线）
        document.getElementById('lm-progress')?.classList.toggle('hidden', viewMode === 'cockpit');
      },
      onActiveChange: (active) => {
        flightView.setActive(active);
        game.setActive(active);
        if (!active) {
          storyTrigger.hide();
          // 退出飞行：航线改用相机中心重算一次
          nav.update();
          nearby.update();
        }
        // V1R2-003：按钮文案由模式状态派生，而非按钮点击猜测
        // （Esc/R 退出、首屏动作卡触发都从这里走同一出口）
        syncBtnLabels();
      },
    });
    // 浏览态：镜头移动结束后重算导航航线与附近地标（飞行中由 onFrame 驱动）
    map.on('moveend', () => {
      if (!flight.isActive()) {
        nav.update();
        nearby.update();
      }
    });

    // 顶栏飞行按钮 + 地标条目的 📖 由各自模块挂载，这里只接飞行按钮
    document.getElementById('flight-btn')?.addEventListener('click', () => {
      if (tour) stopTour(); // 互斥：先退出观影再进飞行
      flight.toggle();
    });

    // 操作指引四格故事：由「更多」菜单随时回看（首次链路改为首屏动作卡，见下方）

    // 更多菜单：点击展开/收起，点外部收起
    const moreBtn = document.getElementById('more-btn');
    const moreDropdown = document.getElementById('more-dropdown');
    moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      moreDropdown?.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (moreDropdown && !moreDropdown.contains(e.target as Node) && e.target !== moreBtn) {
        moreDropdown.classList.add('hidden');
      }
    });

    // 顶栏模式按钮文案：由模式状态派生（V1R2-003）。调用点：flight.onActiveChange、
    // startTour、teardownTour——所有进入/退出路径（按钮点击、Esc、首屏动作卡）都收口于此。
    const flightBtn = document.getElementById('flight-btn');
    const tourBtn = document.getElementById('tour-btn');
    const syncBtnLabels = () => {
      if (flightBtn) flightBtn.textContent = flightBtn.classList.contains('active') ? '退出飞行' : '开始城市飞行';
      if (tourBtn) tourBtn.textContent = tourBtn.classList.contains('active') ? '退出导览' : '跟随导览';
    };

    // 首屏动作卡（V1-006；V1R2-001 补样式/焦点/已看时序）：首次访问、开场镜头
    // 结束后出现，三个明确动作。与「操作指引」四格故事分开通路：动作卡管首次
    // 决策，指引随时从「更多」回看。仅在用户选择或主动略过后记已看状态。
    const INTRO_KEY = 'atria-intro-card-seen';
    let introSeen = false;
    try {
      introSeen = localStorage.getItem(INTRO_KEY) === '1';
    } catch {
      // 沙盒不可写时当首轮处理
    }
    const introCard = document.getElementById('intro-card');
    const dismissIntro = (): void => {
      if (!introCard || introCard.classList.contains('hidden')) return;
      introCard.classList.add('hidden');
      try {
        localStorage.setItem(INTRO_KEY, '1');
      } catch {
        // 沙盒不可写：本轮不显示即等效
      }
      // 关闭后焦点回到顶栏主按钮（键盘流不困在隐藏控件里）
      document.getElementById('flight-btn')?.focus();
    };
    document.getElementById('ic-flight')?.addEventListener('click', () => {
      dismissIntro();
      document.getElementById('flight-btn')?.click();
    });
    document.getElementById('ic-tour')?.addEventListener('click', () => {
      dismissIntro();
      document.getElementById('tour-btn')?.click();
    });
    document.getElementById('ic-explore')?.addEventListener('click', dismissIntro);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && introCard && !introCard.classList.contains('hidden')) dismissIntro();
    });
    const showIntroCard = (): void => {
      if (introSeen || !introCard) return;
      introCard.classList.remove('hidden');
      // 焦点进卡片（主按钮），键盘用户直接 Enter 起飞
      introCard.querySelector<HTMLButtonElement>('#ic-flight')?.focus();
    };

    document.getElementById('guide-btn')?.addEventListener('click', () =>
      storyViewer.open('onboarding', { markReadOnClose: true }),
    );
    document.getElementById('about-btn')?.addEventListener('click', () =>
      storyViewer.open('about', { markReadOnClose: true }),
    );

    // 图鉴：n/36 进度 + 条目点击直接开故事
    const gallery = createGallery({
      onOpenStory: (id) => {
        // 进入阅读层后图鉴收起：Esc 顺序为 故事 → 模式，不叠加（V1R2-002）
        gallery.hide();
        storyViewer.open(id);
      },
    });
    document.getElementById('gallery-btn')?.addEventListener('click', () => gallery.show());

    // 观影模式：沿固定航线自动飞行（合成状态复用 v2 管线），Esc/点击退出
    let tour: TourController | null = null;
    const hudPanel = document.getElementById('flight-hud');
    // V1R3-003：HUD 底部提示按模式切换——驾驶教学只在驾驶模式出现
    const setHudHint = (mode: 'flight' | 'tour'): void => {
      const keys = document.getElementById('hud-keys');
      const mini = document.getElementById('hud-mini');
      if (mode === 'tour') {
        keys?.classList.add('hidden');
        if (mini) {
          mini.innerHTML = '<span><b>Esc</b> 或点击离开导览</span><span>读故事会暂停航线</span>';
          mini.classList.remove('hidden');
        }
      } else {
        keys?.classList.remove('hidden');
        if (mini) {
          mini.innerHTML = '<span><b>V</b> 追尾视角</span><span><b>Esc</b> 退出</span>';
          mini.classList.add('hidden'); // 座舱时由 flight-view.update 控制
        }
      }
    };
    const teardownTour = (): void => {
      tour = null;
      hudPanel?.classList.add('hidden');
      document.getElementById('tour-btn')?.classList.remove('active');
      storyTrigger.hide();
      game.setActive(false);
      flightView.setActive(false);
      if (!flight.isActive()) nav.update();
      syncBtnLabels();
      setHudHint('flight');
    };
    const stopTour = (): void => {
      if (!tour) return;
      tour.stop(); // 内部会再触发 teardownTour
    };
    const startTour = (): void => {
      if (tour || flight.isActive()) return;
      tour = playTour(map, {
        // V1R2-002：阅读层打开时（故事/图鉴/首屏卡片），Esc 归它们，不退出导览
        isOverlayOpen: () =>
          storyViewer.isOpen() ||
          !document.getElementById('gallery')?.classList.contains('hidden') ||
          (document.getElementById('intro-card')?.classList.contains('hidden') === false),
        onUpdate: (state) => {
          flightView.update(state, 'chase');
          game.update(state);
          storyTrigger.update(state);
          // V1R2-004：观影也参与到达判定（此前注释声称飞行/观影到达，实际只飞行生效）
          nav.update(state);
          // HUD 手动刷（观影不进入飞行控制器，由 cinematic 驱动）
          const set = (id: string, v: string) => {
            const e = document.getElementById(id);
            if (e) e.textContent = v;
          };
          set('hud-speed', String(Math.round(state.speed * 3.6)));
          set('hud-alt', String(Math.round(state.alt)));
          set('hud-heading', `${String(Math.round(state.heading)).padStart(3, '0')}°`);
          set('hud-view', '观影');
        },
        onStop: teardownTour,
      });
      hudPanel?.classList.remove('hidden');
      document.getElementById('tour-btn')?.classList.add('active');
      // 进场态与飞行模式一致
      flightView.setActive(true);
      game.setActive(true);
      syncBtnLabels();
      // V1R3-003：导览不展示驾驶教学（W/S 等在导览中无效），只留离开与阅读提示
      setHudHint('tour');
    };
    document.getElementById('tour-btn')?.addEventListener('click', () => {
      if (flight.isActive()) {
        // V1R2-003：飞行中不静默忽略导览请求，明确告知切换路径
        showHint('先退出飞行（Esc），再开始跟随导览');
        return;
      }
      if (tour) stopTour();
      else startTour();
    });

    // 开场电影镜头：只首次播（localStorage）；点击/按键/滚轮可跳过
    const ENTRY_KEY = 'atria-entry-played';
    let entryPlayed = false;
    try {
      entryPlayed = localStorage.getItem(ENTRY_KEY) === '1';
      localStorage.setItem(ENTRY_KEY, '1');
    } catch {
      // 沙盒环境不可写时静默处理：本轮播放即可
    }
    if (!entryPlayed) {
      playEntry(map, { onDone: showIntroCard });
    } else {
      showIntroCard();
    }

    nearby.update();
  });

  // 鼠标悬停在建筑上时变为可点击手势
  map.on('mousemove', 'building-3d', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'building-3d', () => {
    map.getCanvas().style.cursor = '';
  });
}

function enableBuildingPick(map: maplibregl.Map): void {
  map.on('click', 'building-3d', (e) => {
    const feature = e.features?.[0];
    if (!feature) return;

    // 用点击到的要素几何填充高亮图层。
    // 查询结果携带 maplibre 内部类注册键（_classRegistryKey），直接喂给 setData
    // 会在 worker 序列化时报错，须先转成纯 GeoJSON。
    const source = map.getSource(SELECTED_SOURCE) as maplibregl.GeoJSONSource;
    const plain = JSON.parse(JSON.stringify(feature)) as maplibregl.MapGeoJSONFeature;
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: plain.geometry,
          properties: plain.properties ?? {},
        },
      ],
    });

    showBuildingCard(feature, e.lngLat);
  });
}

function showBuildingCard(
  feature: maplibregl.MapGeoJSONFeature,
  lngLat: maplibregl.LngLat,
): void {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const name = typeof props.name === 'string' && props.name ? props.name : '（未命名建筑）';
  const height = toNumber(props.render_height);
  const base = toNumber(props.render_min_height);
  const levels = toNumber(props.levels);

  const rows: Array<[string, string]> = [
    ['名称', name],
    ['估算高度', height != null ? `${height.toFixed(1)} m` : '数据缺失'],
    ['底部高度', base != null && base > 0 ? `${base.toFixed(1)} m` : '—'],
    ['楼层', levels != null ? `${levels} 层` : '数据缺失'],
    ['坐标', `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`],
    ['数据来源', 'OpenStreetMap'],
  ];

  const card = document.getElementById('info-card');
  if (!card) return;
  document.getElementById('info-title')!.textContent = name;
  const dl = document.getElementById('info-rows')!;
  dl.innerHTML = '';
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
  card.classList.remove('hidden');
}

function toNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// 刷新 📖 按钮与条目的「已读」外观（故事阅读完成、初始化时调用）
function refreshStoryButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.lm-story').forEach((btn) => {
    const id = btn.dataset.id ?? '';
    const read = isStoryRead(id);
    btn.classList.toggle('read', read);
    const li = btn.closest('.landmark-item');
    li?.classList.toggle('story-read', read);
  });
}

// 附近面板引用（flyToLandmark 同步激活态用）
let nearbyRef: { setActive: (id: string | null) => void } | null = null;

function flyToLandmark(map: maplibregl.Map, lm: Landmark): void {
  const view = lm.view ?? {};
  map.flyTo({
    center: [lm.lon, lm.lat],
    zoom: view.zoom ?? 16,
    pitch: view.pitch ?? 60,
    bearing: view.bearing ?? 0,
    duration: 2600,
    essential: true,
  });
  nearbyRef?.setActive(lm.id);
}

// 搜索到的地点（非故事地标）：飞过去 + 设为导航目标；
// 在线结果额外收入「我的地点」（扩展 POI 不收，避免面板被已知地点塞满）。
// V1-002 修复：此前扩展 POI 结果带 landmarkId 却只在 36 个故事地标里找，找不到
// 就静默无操作——现在一律按结果对象本身分派。
function flyToSearchPlace(
  map: maplibregl.Map,
  nav: ReturnType<typeof createNav>,
  r: SearchResult,
): void {
  map.flyTo({
    center: [r.lon, r.lat],
    zoom: 16,
    pitch: 58,
    duration: 2600,
    essential: true,
  });
  document.querySelectorAll('.landmark-item.active').forEach((el) => el.classList.remove('active'));

  const lm = resultToLandmark(r);
  nav.setTarget(lm);
  if (r.origin === 'online') {
    addUserPlace(lm);
    buildUserPlaces(map, nav);
  }
}

// 「我的地点」面板分组
function buildUserPlaces(map: maplibregl.Map, nav: ReturnType<typeof createNav>): void {
  const wrap = document.getElementById('user-places');
  const list = document.getElementById('user-place-list');
  if (!wrap || !list) return;
  list.innerHTML = '';

  const places = getUserPlaces();
  wrap.classList.toggle('hidden', places.length === 0);
  for (const lm of places) {
    const li = document.createElement('li');
    li.className = 'landmark-item user-place-item';
    li.dataset.id = lm.id;
    const nameEl = document.createElement('span');
    nameEl.className = 'lm-name';
    nameEl.textContent = lm.name;
    const catEl = document.createElement('span');
    catEl.className = 'lm-cat';
    catEl.textContent = lm.category;
    li.append(nameEl, catEl);
    li.addEventListener('click', () => {
      flyToPlace(map, lm);
      nav.setTarget(lm);
    });
    list.appendChild(li);
  }
}

function flyToPlace(map: maplibregl.Map, lm: Landmark): void {
  map.flyTo({
    center: [lm.lon, lm.lat],
    zoom: 16,
    pitch: 58,
    duration: 2600,
    essential: true,
  });
  document.querySelectorAll('.landmark-item.active').forEach((el) => el.classList.remove('active'));
  document.querySelector(`.user-place-item[data-id="${lm.id}"]`)?.classList.add('active');
}

// 底部通用提示（到达 / 模式切换提示共用）
function showHint(text: string): void {
  const toast = document.getElementById('arrival-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  window.setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, 2600);
}

// 到达提示（导航 onArrive）
function showArrival(name: string): void {
  showHint(`到达 · ${name}`);
}

// ---- 搜索框 UI：本地即时 + 在线补充 ----
function buildSearchUI(map: maplibregl.Map, nav: ReturnType<typeof createNav>): void {
  const input = document.getElementById('search-box') as HTMLInputElement | null;
  const results = document.getElementById('search-results');
  if (!input || !results) return;
  const inputEl: HTMLInputElement = input;
  const resultsEl: HTMLElement = results;

  let debounce: ReturnType<typeof setTimeout> | undefined;
  let currentQuery = '';

  // 在搜索框内打字时，阻止事件冒泡到 window，避免误触发飞行操纵键
  inputEl.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      inputEl.value = '';
      hideResults();
      inputEl.blur();
      return;
    }
    e.stopPropagation();
  });

  inputEl.addEventListener('input', () => {
    const q = inputEl.value;
    currentQuery = q;
    if (debounce !== undefined) clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(q), 500);
  });

  function hideResults(): void {
    resultsEl.classList.add('hidden');
    resultsEl.innerHTML = '';
  }

  async function runSearch(q: string): Promise<void> {
    const query = q.trim();
    if (!query) {
      hideResults();
      return;
    }
    // 1. 本地结果立即渲染
    const local = searchLocal(query);
    renderResults(local, false);
    // 2. 在线补充（≥2 字），结果回来后若查询未变则追加
    if (query.length < 2 || query !== currentQuery) return;
    const online = await searchOnline(query);
    if (query !== currentQuery) return; // 用户已改关键词，丢弃过期结果
    renderResults(online.length ? [...local, ...online] : local, true);
  }

  function renderResults(items: SearchResult[], onlineDone: boolean): void {
    resultsEl.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = onlineDone ? '没有匹配的地点' : '正在搜索…';
      resultsEl.appendChild(empty);
    } else {
      for (const r of items) {
        const row = document.createElement('div');
        row.className = 'search-result';
        const name = document.createElement('span');
        name.className = 'sr-name';
        name.textContent = r.name;
        const tag = document.createElement('span');
        tag.className = 'sr-tag' + (r.origin === 'online' ? ' online' : '');
        tag.textContent = r.origin === 'online' ? '在线' : r.category;
        row.append(name, tag);
        row.addEventListener('click', () => {
          // 命中内置故事地标：复用完整行为（flyTo 预设镜头 + 导航 + 激活态）；
          // 其余（扩展 POI / 用户地点 / 在线结果）一律按结果对象本身分派。
          // V1-002：此前 landmarkId 找不到内置地标时静默无操作，现统一走 flyToSearchPlace。
          const lm = r.landmarkId ? landmarks.find((l) => l.id === r.landmarkId) : undefined;
          if (lm) {
            flyToLandmark(map, lm);
            nav.setTarget(lm);
          } else {
            flyToSearchPlace(map, nav, r);
          }
          inputEl.value = '';
          hideResults();
        });
        resultsEl.appendChild(row);
      }
    }
    resultsEl.classList.remove('hidden');
  }

  // 点击页面其它地方时收起结果
  document.addEventListener('click', (e) => {
    if (!resultsEl.contains(e.target as Node) && e.target !== inputEl) hideResults();
  });
}

init();
