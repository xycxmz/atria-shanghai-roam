// 图鉴进度面板：全部故事地标一览 + 已读/未读 + 点击直接开故事。
// 依据 docs/DESIGN-COMPETITION-2026-10-03.md 第 3 节。
// 与飞行内的 #lm-progress 打卡面板互补：那是飞行内「飞越」口径，图鉴是全篇「阅读」口径。

import { landmarks, type LandmarkCategory } from './landmarks';
import { isStoryRead, hasStory } from './stories';

const CATEGORY_ORDER: LandmarkCategory[] = [
  '摩天楼',
  '历史',
  '街区',
  '文化',
  '宗教',
  '校园',
  '公园',
];

const CATEGORY_LABEL: Record<string, string> = {
  摩天楼: '摩天楼',
  历史: '历史人文',
  街区: '街 区',
  文化: '文化艺术',
  宗教: '寺 庙',
  校园: '校 园',
  公园: '公 园',
};

export interface GalleryCallbacks {
  onOpenStory?: (id: string) => void;
}

export interface Gallery {
  refresh(): void;
  show(): void;
  hide(): void;
}

export function createGallery(cb: GalleryCallbacks = {}): Gallery {
  const overlay = document.createElement('div');
  overlay.id = 'gallery';
  overlay.className = 'hidden';

  const wrap = document.createElement('div');
  wrap.className = 'gal-wrap';

  const head = document.createElement('div');
  head.className = 'gal-head';
  const title = document.createElement('span');
  title.className = 'gal-title';
  title.textContent = '故事图鉴';
  const progress = document.createElement('span');
  progress.className = 'gal-progress';
  progress.id = 'gal-progress';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'gal-close';
  closeBtn.textContent = '✕';
  closeBtn.title = '关闭';
  closeBtn.addEventListener('click', () => hide());
  head.append(title, progress, closeBtn);

  const barOuter = document.createElement('div');
  barOuter.className = 'gal-bar-outer';
  const barInner = document.createElement('div');
  barInner.className = 'gal-bar-inner';
  barInner.id = 'gal-bar-inner';
  barOuter.appendChild(barInner);

  const list = document.createElement('div');
  list.className = 'gal-list';

  wrap.append(head, barOuter, list);
  overlay.appendChild(wrap);
  document.getElementById('app')?.appendChild(overlay);

  // 背景点击关闭（点 wrap 内不触发）
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  function buildList(): void {
    list.innerHTML = '';
    for (const cat of CATEGORY_ORDER) {
      // 图鉴只收录有故事的地标
      const items = landmarks.filter((lm) => lm.category === cat && hasStory(lm.id));
      if (!items.length) continue;

      const groupTitle = document.createElement('div');
      groupTitle.className = 'gal-group-title';
      groupTitle.textContent = CATEGORY_LABEL[cat] ?? cat;
      list.appendChild(groupTitle);

      const grid = document.createElement('div');
      grid.className = 'gal-group';
      for (const lm of items) {
        const read = isStoryRead(lm.id);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'gal-item' + (read ? ' read' : '');
        item.title = lm.name;
        const mark = document.createElement('span');
        mark.className = 'gal-mark';
        mark.textContent = read ? '●' : '○';
        const name = document.createElement('span');
        name.className = 'gal-name';
        name.textContent = lm.name;
        const note = document.createElement('span');
        note.className = 'gal-note';
        note.textContent = lm.note;
        item.append(mark, name, note);
        item.addEventListener('click', () => {
          cb.onOpenStory?.(lm.id);
        });
        grid.appendChild(item);
      }
      list.appendChild(grid);
    }
  }

  // 图鉴只在 show 时刷新，避免频繁重建
  function refresh(): void {
    const items = landmarks.filter((lm) => hasStory(lm.id));
    const total = items.length;
    const read = items.filter((lm) => isStoryRead(lm.id)).length;
    const pct = total > 0 ? Math.round((read / total) * 100) : 0;
    progress.textContent = `已读 ${read} / ${total}`;
    const bar = document.getElementById('gal-bar-inner');
    if (bar) bar.style.width = `${pct}%`;
    buildList();
  }

  function show(): void {
    refresh();
    overlay.classList.remove('hidden');
  }

  function hide(): void {
    overlay.classList.add('hidden');
  }

  // V1R2-002：Escape 归属阅读层优先——图鉴打开时 Esc 关图鉴，
  // 不冒泡给观影/飞行的模式退出键（capture 注册 + stopImmediatePropagation）。
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (overlay.classList.contains('hidden')) return;
      if (e.code !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      hide();
    },
    true,
  );

  return { refresh, show, hide };
}
