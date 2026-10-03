// 附近地标面板：按当前位置排序，默认展示最近 5 个，其余折叠。
// 依据 docs/DESIGN-POLISH-2026-10-03.md 第 1 节。
// 当前位置语义同导航：飞行中 = 飞机位置（update(state)）；浏览时 = 相机中心（update()）。

import type { Map } from 'maplibre-gl';
import type { Landmark } from './landmarks';
import { landmarks } from './landmarks';
import { hasStory, isStoryRead } from './stories';
import { distanceMeters, type FlightState } from './flight';

const NEAR_COUNT = 5;
// 刷新时间门控（调用方已按帧/事件驱动，这里再防高频重建）
const REFRESH_MS = 500;

export interface NearbyPanelCallbacks {
  onPick?: (lm: Landmark) => void;
  onStory?: (id: string) => void;
}

export interface NearbyPanel {
  update(state?: FlightState): void;
  setActive(id: string | null): void;
}

export function createNearbyPanel(map: Map, cb: NearbyPanelCallbacks = {}): NearbyPanel {
  const listEl = document.getElementById('landmark-list');
  if (!listEl) {
    const noop = { update: () => {}, setActive: (_id: string | null) => {} };
    return noop;
  }
  const list = listEl;

  let expanded = false; // 用户主动展开后，不自动收起
  let lastFullKey = ''; // 最近 N 个 + 展开态 + 排序的指纹，避免每帧重建 DOM
  let lastActiveId: string | null = null;
  let lastT = 0;

  function buildItem(lm: Landmark): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'landmark-item';
    li.dataset.id = lm.id;
    if (lm.id === lastActiveId) li.classList.add('active');
    if (hasStory(lm.id) && isStoryRead(lm.id)) li.classList.add('story-read');

    const nameEl = document.createElement('span');
    nameEl.className = 'lm-name';
    nameEl.textContent = lm.name;
    const catEl = document.createElement('span');
    catEl.className = 'lm-cat';
    catEl.textContent = lm.category;
    li.append(nameEl, catEl);

    if (hasStory(lm.id)) {
      const storyBtn = document.createElement('button');
      storyBtn.type = 'button';
      storyBtn.className = 'lm-story' + (isStoryRead(lm.id) ? ' read' : '');
      storyBtn.dataset.id = lm.id;
      storyBtn.title = `阅读「${lm.name}」的故事`;
      storyBtn.textContent = '📖';
      storyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cb.onStory?.(lm.id);
      });
      li.appendChild(storyBtn);
    }

    li.addEventListener('click', () => {
      lastActiveId = lm.id;
      list.querySelectorAll('.landmark-item.active').forEach((el) => el.classList.remove('active'));
      li.classList.add('active');
      cb.onPick?.(lm);
    });
    return li;
  }

  function buildHeader(restCount: number): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'landmark-toggle';
    li.textContent = expanded ? `▾ 收起其他（${restCount} 个地标）` : `▸ 其他 ${restCount} 个地标`;
    li.addEventListener('click', () => {
      expanded = !expanded;
      render(true); // 用户操作立即重渲染，不受时间门控影响
    });
    return li;
  }

  function render(force = false): void {
    const now = Date.now();
    if (!force && now - lastT < REFRESH_MS) return;
    lastT = now;

    // 排序基准：飞行中用飞机位置，否则用相机中心
    const center = map.getCenter();
    const from = { lng: center.lng, lat: center.lat };
    const sorted = [...landmarks].sort((a, b) => {
      const da = distanceMeters(from.lng, from.lat, a.lon, a.lat);
      const db = distanceMeters(from.lng, from.lat, b.lon, b.lat);
      return da - db;
    });

    const near = sorted.slice(0, NEAR_COUNT);
    const rest = sorted.slice(NEAR_COUNT);
    const nearKey = near.map((l) => l.id).join('|');
    const fullKey = nearKey + '|' + rest.map((l) => l.id).join('|');
    const key = (expanded ? 'x:' + fullKey : 'n:' + nearKey) + '|a:' + (lastActiveId ?? '');

    if (!force && key === lastFullKey) return; // 无变化不重建
    lastFullKey = key;

    list.innerHTML = '';
    for (const lm of near) list.appendChild(buildItem(lm));
    if (rest.length > 0) {
      list.appendChild(buildHeader(rest.length));
      if (expanded) for (const lm of rest) list.appendChild(buildItem(lm));
    }
  }

  return { update: () => render(false), setActive: (id: string | null) => { setActiveId(id); } };

  function setActiveId(id: string | null): void {
    lastActiveId = id;
    list.querySelectorAll('.landmark-item.active').forEach((el) => el.classList.remove('active'));
    if (id) list.querySelector(`.landmark-item[data-id="${id}"]`)?.classList.add('active');
  }
}