// Galgame 式漫画故事查看器 + 飞行接近提示。
// 纯 DOM/SVG，零新依赖。依据 docs/DESIGN-LANDMARKS-2026-10-03.md 第 3 节。
//
// - createStoryViewer()：全屏 overlay，SVG 漫画画格（5 种场景原型 × 天色）+ 打字机对话框
// - createStoryTrigger()：飞行中接近未读故事地标 350m 时浮出「点击阅读故事」提示
// 阅读期间通过回调暂停飞行物理（main 侧接 flight.setPaused）。

import {
  findStory,
  isStoryRead,
  markStoryRead,
  type LandmarkStory,
  type StoryMood,
} from './stories';
import { distanceMeters, type FlightState } from './flight';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag) as SVGElement;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

// ---- 打字机 ----
// 一格的全部文案一次打出；略快于阅读语速，避免等待。
const CHARS_PER_SEC = 40;

// ============================================================
// 场景原型：5 种 × 天色。每个 scene 函数返回一个填充好的 <svg>。
// 视觉语言：深海军蓝剪影 + 主色描边 + 半调网点 + 漫画画格。
// ============================================================
type Variant =
  | 'spheres' // 东方明珠：串球塔
  | 'twist' // 上海中心：收分塔
  | 'hole' // 环球金融中心：孔洞塔
  | 'pagoda' // 金茂：密檐塔
  | 'colonnade' // 外滩：列柱建筑群
  | 'curved' // 武康大楼：三角弧楼
  | 'shikumen' // 新天地：石库门里弄
  | 'pavilion' // 豫园：亭台湖石
  | 'temple' // 静安寺：鎏金殿宇
  | 'neon' // 南京路：霓虹街面
  | 'square' // 人民广场：开阔广场
  | 'crown'; // 中华艺术宫：倒置斗拱

const VARIANT_BY_STORY: Record<string, Variant> = {
  onboarding: 'spheres',
  about: 'colonnade',
  'oriental-pearl': 'spheres',
  'shanghai-tower': 'twist',
  swfc: 'hole',
  jinmao: 'pagoda',
  'the-bund': 'colonnade',
  yuyuan: 'pavilion',
  'nanjing-road': 'neon',
  'peoples-square': 'square',
  xintiandi: 'shikumen',
  'jingan-temple': 'temple',
  'wukang-mansion': 'curved',
  'china-art-museum': 'crown',
  // ---- 2026-10-03 扩充 ----
  chenghuangmiao: 'temple',
  tianzifang: 'shikumen',
  'shanghai-museum': 'colonnade',
  'xujiahui-cathedral': 'colonnade',
  'fudan-university': 'colonnade',
  'mansion-1933': 'curved',
  'ccp-site': 'shikumen',
  'qibao-old-street': 'neon',
  'shanghai-grand-theatre': 'square',
  'longhua-temple': 'temple',
  m50: 'neon',
  zhujiajiao: 'pavilion',
  // ---- 2026-10-03 参赛轮扩充 12 篇 ----
  dashijie: 'twist',
  'jade-buddha-temple': 'temple',
  'tongji-university': 'colonnade',
  'binjiang-avenue': 'neon',
  'shanghai-science-museum': 'square',
  'shanghai-ocean-aquarium': 'curved',
  'power-station-art': 'hole',
  'west-bund': 'neon',
  'shanghai-library': 'colonnade',
  'sinan-residences': 'colonnade',
  'century-park': 'square',
  sjtu: 'colonnade',
};

// 副色：窗户/描边的亮色，取自故事 accent
const SILHOUETTE = '#0c1f30';
const SILHOUETTE_2 = '#16324c';

function makeSvg(): SVGElement {
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', '0 0 320 180');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.classList.add('story-svg');
  return svg;
}

function addMood(svg: SVGElement, mood: StoryMood): void {
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient');
  grad.setAttribute('id', 'sky');
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0');
  grad.setAttribute('y2', '1');
  if (mood === 'dusk') {
    grad.append(stop('0%', '#1c3a5c'), stop('62%', '#3d5a78'), stop('100%', '#c9a876'));
  } else {
    grad.append(stop('0%', '#081423'), stop('60%', '#0f2740'), stop('100%', '#163450'));
  }
  defs.appendChild(grad);
  svg.appendChild(defs);

  const sky = svgEl('rect');
  sky.setAttribute('x', '0');
  sky.setAttribute('y', '0');
  sky.setAttribute('width', '320');
  sky.setAttribute('height', '180');
  sky.setAttribute('fill', 'url(#sky)');
  svg.appendChild(sky);

  if (mood === 'dusk') {
    const sun = svgEl('circle');
    sun.setAttribute('cx', '232');
    sun.setAttribute('cy', '150');
    sun.setAttribute('r', '17');
    sun.setAttribute('fill', '#e8c98f');
    sun.setAttribute('opacity', '0.9');
    svg.appendChild(sun);
    const halo = svgEl('circle');
    halo.setAttribute('cx', '232');
    halo.setAttribute('cy', '150');
    halo.setAttribute('r', '34');
    halo.setAttribute('fill', '#e8c98f');
    halo.setAttribute('opacity', '0.18');
    svg.appendChild(halo);
  } else {
    // 星点
    for (const [sx, sy, sr] of [
      [30, 26, 1.1],
      [78, 52, 0.8],
      [140, 18, 1.2],
      [196, 40, 0.8],
      [258, 24, 1.1],
      [300, 62, 0.9],
      [52, 84, 0.7],
      [226, 96, 0.7],
    ]) {
      const star = svgEl('circle');
      star.setAttribute('cx', String(sx));
      star.setAttribute('cy', String(sy));
      star.setAttribute('r', String(sr));
      star.setAttribute('fill', '#c1def3');
      star.setAttribute('opacity', '0.75');
      svg.appendChild(star);
    }
  }
}

function stop(off: string, color: string): SVGStopElement {
  const s = svgEl('stop') as SVGStopElement;
  s.setAttribute('offset', off);
  s.setAttribute('stop-color', color);
  return s;
}

// 半调网点覆盖层（漫画质感）
function addHalftone(svg: SVGElement): void {
  const defs = svgEl('defs');
  const pat = svgEl('pattern');
  pat.setAttribute('id', 'halftone');
  pat.setAttribute('width', '9');
  pat.setAttribute('height', '9');
  pat.setAttribute('patternUnits', 'userSpaceOnUse');
  const dot = svgEl('circle');
  dot.setAttribute('cx', '2');
  dot.setAttribute('cy', '2');
  dot.setAttribute('r', '1.1');
  dot.setAttribute('fill', '#0a1c2c');
  dot.setAttribute('opacity', '0.16');
  pat.appendChild(dot);
  defs.appendChild(pat);
  svg.appendChild(defs);
  const rect = svgEl('rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '320');
  rect.setAttribute('height', '180');
  rect.setAttribute('fill', 'url(#halftone)');
  svg.appendChild(rect);
}

// 地面
function addGround(svg: SVGElement): void {
  const g = svgEl('rect');
  g.setAttribute('x', '0');
  g.setAttribute('y', '162');
  g.setAttribute('width', '320');
  g.setAttribute('height', '18');
  g.setAttribute('fill', '#0a1c2c');
  svg.appendChild(g);
}

// 窗户排：给塔楼加亮色窗格
function addWindows(svg: SVGElement, x: number, y: number, w: number, h: number, cols: number, rows: number, accent: string): void {
  const gap = 2;
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = (h - gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const win = svgEl('rect');
      win.setAttribute('x', String(x + c * (cw + gap)));
      win.setAttribute('y', String(y + r * (ch + gap)));
      win.setAttribute('width', String(Math.max(0.6, cw)));
      win.setAttribute('height', String(Math.max(0.6, ch)));
      win.setAttribute('fill', accent);
      win.setAttribute('opacity', '0.55');
      svg.appendChild(win);
    }
  }
}

function buildScene(story: LandmarkStory, mood: StoryMood): SVGElement {
  const svg = makeSvg();
  addMood(svg, mood);
  const accent = story.accent;
  const variant: Variant = VARIANT_BY_STORY[story.id] ?? 'twist';
  addGround(svg);

  switch (variant) {
    case 'spheres': {
      // 东方明珠（V1R3-004 定稿）：背景三件套（金茂/环球/上海中心）/
      // 主塔串球 + 斜撑（中景）/ 江畔基座与水中倒影（前景）。
      // 背景：陆家嘴三件套（左后，小且淡）
      const far = svgEl('g');
      far.setAttribute('opacity', '0.5');
      // 金茂：密檐
      let jy = 150;
      for (let i = 0; i < 4; i++) {
        const w = 18 - i * 2.5;
        const seg = svgEl('rect');
        seg.setAttribute('x', String(16 - w / 2 + 8));
        seg.setAttribute('y', String(jy - 12));
        seg.setAttribute('width', String(w));
        seg.setAttribute('height', '12');
        seg.setAttribute('fill', i % 2 ? SILHOUETTE_2 : SILHOUETTE);
        seg.setAttribute('stroke', accent);
        seg.setAttribute('stroke-width', '0.5');
        far.appendChild(seg);
        jy -= 12;
      }
      // 环球：方塔 + 顶部孔洞
      towerRect(far, 56, 88, 15, 62, SILHOUETTE_2, accent);
      const holeF = svgEl('rect');
      holeF.setAttribute('x', '59');
      holeF.setAttribute('y', '94');
      holeF.setAttribute('width', '9');
      holeF.setAttribute('height', '12');
      holeF.setAttribute('fill', '#1c3a5c');
      far.appendChild(holeF);
      // 上海中心：收分塔 + 环带
      towerRect(far, 100, 70, 12, 80, SILHOUETTE_2, accent);
      towerRect(far, 103, 52, 7, 20, SILHOUETTE, accent);
      for (const by of [86, 102, 118]) {
        const band = svgEl('rect');
        band.setAttribute('x', '100');
        band.setAttribute('y', String(by));
        band.setAttribute('width', '12');
        band.setAttribute('height', '1.8');
        band.setAttribute('fill', accent);
        band.setAttribute('opacity', '0.7');
        far.appendChild(band);
      }
      svg.appendChild(far);
      // 前景：江水（盖住地面条）
      const river = svgEl('rect');
      river.setAttribute('x', '0');
      river.setAttribute('y', '156');
      river.setAttribute('width', '320');
      river.setAttribute('height', '24');
      river.setAttribute('fill', '#123049');
      svg.appendChild(river);
      // 塔在江中的倒影（低透明，被波纹打断）
      const refl = svgEl('g');
      refl.setAttribute('opacity', '0.2');
      const rCol = svgEl('rect');
      rCol.setAttribute('x', '202');
      rCol.setAttribute('y', '156');
      rCol.setAttribute('width', '12');
      rCol.setAttribute('height', '24');
      rCol.setAttribute('fill', SILHOUETTE);
      refl.appendChild(rCol);
      const rBall = svgEl('circle');
      rBall.setAttribute('cx', '208');
      rBall.setAttribute('cy', '190');
      rBall.setAttribute('r', '13');
      rBall.setAttribute('fill', SILHOUETTE);
      refl.appendChild(rBall);
      svg.appendChild(refl);
      for (const wy of [163, 173]) {
        const wave = svgEl('path');
        wave.setAttribute('d', `M0 ${wy} q 20 -2 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0`);
        wave.setAttribute('fill', 'none');
        wave.setAttribute('stroke', '#4a7899');
        wave.setAttribute('stroke-width', '0.9');
        wave.setAttribute('opacity', '0.35');
        svg.appendChild(wave);
      }
      // 主塔：柱身 + 串球（大珠小珠落玉盘）
      towerRect(svg, 202, 60, 12, 96, SILHOUETTE, accent);
      for (const [cy, r] of [
        [122, 15],
        [94, 10],
        [72, 6],
        [60, 4.5],
      ]) {
        const c = svgEl('circle');
        c.setAttribute('cx', '208');
        c.setAttribute('cy', String(cy));
        c.setAttribute('r', String(r));
        c.setAttribute('fill', SILHOUETTE);
        c.setAttribute('stroke', accent);
        c.setAttribute('stroke-width', '1.2');
        svg.appendChild(c);
      }
      spire(svg, 208, 50, 26, accent);
      addWindows(svg, 205, 130, 6, 24, 1, 6, accent);
      // 三根斜撑（东方明珠标志性的结构）
      for (const [x1, y1, x2, y2] of [
        [196, 150, 202, 122],
        [220, 150, 214, 122],
        [208, 156, 208, 122],
      ]) {
        const brace = svgEl('line');
        brace.setAttribute('x1', String(x1));
        brace.setAttribute('y1', String(y1));
        brace.setAttribute('x2', String(x2));
        brace.setAttribute('y2', String(y2));
        brace.setAttribute('stroke', accent);
        brace.setAttribute('stroke-width', '1.6');
        brace.setAttribute('opacity', '0.8');
        svg.appendChild(brace);
      }
      // 江畔基座
      const base = svgEl('rect');
      base.setAttribute('x', '182');
      base.setAttribute('y', '146');
      base.setAttribute('width', '52');
      base.setAttribute('height', '10');
      base.setAttribute('fill', SILHOUETTE_2);
      svg.appendChild(base);
      break;
    }
    case 'twist': {
      // 上海中心：收分塔 + 环带
      towerRect(svg, 146, 118, 28, 44, SILHOUETTE, accent);
      towerRect(svg, 152, 62, 16, 58, SILHOUETTE_2, accent);
      towerRect(svg, 156, 26, 8, 38, SILHOUETTE, accent);
      for (const y of [78, 94, 110]) {
        const band = svgEl('rect');
        band.setAttribute('x', '150');
        band.setAttribute('y', String(y));
        band.setAttribute('width', '20');
        band.setAttribute('height', '2.4');
        band.setAttribute('fill', accent);
        band.setAttribute('opacity', '0.8');
        svg.appendChild(band);
      }
      addWindows(svg, 156, 70, 8, 44, 2, 10, accent);
      // 旁楼
      towerRect(svg, 96, 132, 20, 30, SILHOUETTE, accent);
      towerRect(svg, 214, 128, 18, 34, SILHOUETTE_2, accent);
      break;
    }
    case 'hole': {
      // 环球金融中心：方塔 + 顶部矩形孔洞
      towerRect(svg, 148, 44, 24, 118, SILHOUETTE, accent);
      const hole = svgEl('rect');
      hole.setAttribute('x', '152');
      hole.setAttribute('y', '52');
      hole.setAttribute('width', '16');
      hole.setAttribute('height', '22');
      hole.setAttribute('fill', 'url(#sky)');
      svg.appendChild(hole);
      addWindows(svg, 152, 84, 16, 72, 3, 12, accent);
      towerRect(svg, 118, 130, 18, 32, SILHOUETTE_2, accent);
      towerRect(svg, 196, 126, 16, 36, SILHOUETTE, accent);
      break;
    }
    case 'pagoda': {
      // 金茂：密檐塔一段段收分
      let y = 160;
      for (let i = 0; i < 7; i++) {
        const w = 46 - i * 5;
        const h = 15;
        const x = 160 - w / 2;
        const seg = svgEl('rect');
        seg.setAttribute('x', String(x));
        seg.setAttribute('y', String(y - h));
        seg.setAttribute('width', String(w));
        seg.setAttribute('height', String(h));
        seg.setAttribute('fill', i % 2 ? SILHOUETTE_2 : SILHOUETTE);
        seg.setAttribute('stroke', accent);
        seg.setAttribute('stroke-width', '0.8');
        svg.appendChild(seg);
        addWindows(svg, x + 3, y - h + 3, w - 6, h - 6, 5, 1, accent);
        y -= h;
      }
      spire(svg, 160, 26, 24, accent);
      break;
    }
    case 'colonnade': {
      // 外滩（V1R3-004 定稿）：三层景深——对岸陆家嘴塔群（远景）/
      // 万国建筑博览群（中景，海关钟楼为峰）/ 黄浦江水与堤岸路灯（前景）。
      // 远景：对岸塔群（更淡、更小，笼在江雾里）
      const farGroup = svgEl('g');
      farGroup.setAttribute('opacity', '0.55');
      for (const [fx, fy, fw] of [
        [6, 74, 11],
        [22, 58, 15],
        [44, 82, 9],
        [62, 52, 13],
        [84, 76, 8],
        [98, 66, 7],
      ]) {
        towerRect(farGroup, fx, fy, fw, 140 - fy, SILHOUETTE_2, accent);
      }
      svg.appendChild(farGroup);
      // 前景：黄浦江水（盖住地面条）+ 波纹
      const river = svgEl('rect');
      river.setAttribute('x', '0');
      river.setAttribute('y', '140');
      river.setAttribute('width', '320');
      river.setAttribute('height', '40');
      river.setAttribute('fill', '#123049');
      svg.appendChild(river);
      for (const wy of [150, 159, 170]) {
        const wave = svgEl('path');
        wave.setAttribute('d', `M0 ${wy} q 20 -2.5 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0`);
        wave.setAttribute('fill', 'none');
        wave.setAttribute('stroke', '#4a7899');
        wave.setAttribute('stroke-width', '1');
        wave.setAttribute('opacity', '0.35');
        svg.appendChild(wave);
      }
      // 堤岸
      const bund = svgEl('rect');
      bund.setAttribute('x', '0');
      bund.setAttribute('y', '132');
      bund.setAttribute('width', '320');
      bund.setAttribute('height', '9');
      bund.setAttribute('fill', '#0a1c2c');
      svg.appendChild(bund);
      // 中景：万国建筑群（含海关钟楼），基线 132
      const bases: Array<[number, number, number]> = [
        [6, 104, 28],
        [34, 84, 48],
        [68, 100, 32],
        [102, 60, 60], // 海关钟楼（主峰）
        [166, 96, 36],
        [200, 78, 54],
        [250, 92, 40],
        [288, 108, 24],
      ];
      for (const [x, y] of bases) {
        const b = svgEl('rect');
        b.setAttribute('x', String(x));
        b.setAttribute('y', String(y));
        b.setAttribute('width', '30');
        b.setAttribute('height', String(132 - y));
        b.setAttribute('fill', SILHOUETTE);
        b.setAttribute('stroke', accent);
        b.setAttribute('stroke-width', '0.8');
        svg.appendChild(b);
        // 三角屋顶
        const roof = svgEl('polygon');
        roof.setAttribute('points', `${x - 2},${y} ${x + 32},${y} ${x + 15},${y - 10}`);
        roof.setAttribute('fill', SILHOUETTE_2);
        svg.appendChild(roof);
        addWindows(svg, x + 4, y + 6, 22, 132 - y - 12, 3, Math.max(2, Math.floor((132 - y - 12) / 9)), accent);
      }
      // 钟楼顶（钟面）
      const clock = svgEl('circle');
      clock.setAttribute('cx', '117');
      clock.setAttribute('cy', '72');
      clock.setAttribute('r', '6');
      clock.setAttribute('fill', SILHOUETTE_2);
      clock.setAttribute('stroke', '#e8c98f');
      clock.setAttribute('stroke-width', '1');
      svg.appendChild(clock);
      // 堤岸路灯（暖光，与黄昏定妆一致）
      for (const lx of [50, 130, 236, 286]) {
        const pole = svgEl('rect');
        pole.setAttribute('x', String(lx));
        pole.setAttribute('y', '102');
        pole.setAttribute('width', '1.8');
        pole.setAttribute('height', '30');
        pole.setAttribute('fill', SILHOUETTE);
        svg.appendChild(pole);
        const lamp = svgEl('circle');
        lamp.setAttribute('cx', String(lx + 0.9));
        lamp.setAttribute('cy', '100');
        lamp.setAttribute('r', '3.2');
        lamp.setAttribute('fill', '#e8c98f');
        svg.appendChild(lamp);
        const halo = svgEl('circle');
        halo.setAttribute('cx', String(lx + 0.9));
        halo.setAttribute('cy', '100');
        halo.setAttribute('r', '8');
        halo.setAttribute('fill', '#e8c98f');
        halo.setAttribute('opacity', '0.2');
        svg.appendChild(halo);
      }
      break;
    }
    case 'curved': {
      // 武康大楼：三角形弧楼
      const body = svgEl('polygon');
      body.setAttribute('points', '96,160 176,160 158,58');
      body.setAttribute('fill', SILHOUETTE);
      body.setAttribute('stroke', accent);
      body.setAttribute('stroke-width', '1.2');
      svg.appendChild(body);
      // 弧形沿街面
      const arc = svgEl('path');
      arc.setAttribute('d', 'M96 160 Q 130 120 158 58');
      arc.setAttribute('fill', 'none');
      arc.setAttribute('stroke', accent);
      arc.setAttribute('stroke-width', '1.2');
      svg.appendChild(arc);
      addWindows(svg, 122, 92, 14, 56, 2, 7, accent);
      // 周边里弄
      towerRect(svg, 196, 118, 30, 42, SILHOUETTE_2, accent);
      towerRect(svg, 238, 132, 22, 28, SILHOUETTE, accent);
      break;
    }
    case 'shikumen': {
      // 新天地：石库门里弄
      for (let i = 0; i < 4; i++) {
        const x = 20 + i * 74;
        const b = svgEl('rect');
        b.setAttribute('x', String(x));
        b.setAttribute('y', '78');
        b.setAttribute('width', '62');
        b.setAttribute('height', '84');
        b.setAttribute('fill', SILHOUETTE);
        b.setAttribute('stroke', accent);
        b.setAttribute('stroke-width', '0.8');
        svg.appendChild(b);
        // 门头（石库门标志性的半圆/三角门楣）
        const lintel = svgEl('polygon');
        lintel.setAttribute('points', `${x + 18},78 ${x + 44},78 ${x + 31},64`);
        lintel.setAttribute('fill', SILHOUETTE_2);
        svg.appendChild(lintel);
        addWindows(svg, x + 6, 88, 50, 44, 4, 4, accent);
        addWindows(svg, x + 24, 128, 14, 26, 1, 3, '#e3edf5');
      }
      // 弄堂地面
      const alley = svgEl('rect');
      alley.setAttribute('x', '0');
      alley.setAttribute('y', '150');
      alley.setAttribute('width', '320');
      alley.setAttribute('height', '12');
      alley.setAttribute('fill', '#132535');
      svg.appendChild(alley);
      break;
    }
    case 'pavilion': {
      // 豫园（V1R3-004 定稿）：园墙瓦檐（背景）/ 湖心重檐亭（中景）/
      // 九曲桥与湖水倒影（前景）。一池静水被城市高楼围住。
      // 背景：园墙瓦檐一抹
      const wall = svgEl('rect');
      wall.setAttribute('x', '0');
      wall.setAttribute('y', '30');
      wall.setAttribute('width', '320');
      wall.setAttribute('height', '7');
      wall.setAttribute('fill', SILHOUETTE_2);
      wall.setAttribute('opacity', '0.55');
      svg.appendChild(wall);
      for (let wx = 8; wx < 320; wx += 24) {
        const tile = svgEl('path');
        tile.setAttribute('d', `M${wx} 30 q 6 -5 12 0`);
        tile.setAttribute('fill', 'none');
        tile.setAttribute('stroke', SILHOUETTE_2);
        tile.setAttribute('stroke-width', '1.6');
        tile.setAttribute('opacity', '0.55');
        svg.appendChild(tile);
      }
      // 湖石移到右后（太湖石：叠落的圆弧）
      const rock = svgEl('path');
      rock.setAttribute('d', 'M250 150 Q 240 128 254 116 Q 246 102 262 96 Q 276 88 272 76 L 288 82 Q 300 98 286 110 Q 302 124 292 140 Q 302 150 290 150 Z');
      rock.setAttribute('fill', SILHOUETTE_2);
      rock.setAttribute('stroke', accent);
      rock.setAttribute('stroke-width', '1');
      svg.appendChild(rock);
      // 水（池面盖住地面条）
      const water = svgEl('rect');
      water.setAttribute('x', '0');
      water.setAttribute('y', '142');
      water.setAttribute('width', '320');
      water.setAttribute('height', '38');
      water.setAttribute('fill', '#123049');
      svg.appendChild(water);
      // 亭子在池中的倒影（拉长、低透明，被水纹打断）
      const refl = svgEl('g');
      refl.setAttribute('opacity', '0.22');
      const rPillars = svgEl('rect');
      rPillars.setAttribute('x', '108');
      rPillars.setAttribute('y', '142');
      rPillars.setAttribute('width', '64');
      rPillars.setAttribute('height', '34');
      rPillars.setAttribute('fill', SILHOUETTE);
      refl.appendChild(rPillars);
      const rRoof = svgEl('polygon');
      rRoof.setAttribute('points', '92,142 188,142 140,160');
      rRoof.setAttribute('fill', SILHOUETTE);
      refl.appendChild(rRoof);
      svg.appendChild(refl);
      for (const ry of [152, 166]) {
        const ripple = svgEl('path');
        ripple.setAttribute('d', `M96 ${ry} q 14 -2 28 0 t 28 0 t 28 0`);
        ripple.setAttribute('fill', 'none');
        ripple.setAttribute('stroke', '#4a7899');
        ripple.setAttribute('stroke-width', '0.9');
        ripple.setAttribute('opacity', '0.4');
        svg.appendChild(ripple);
      }
      // 九曲桥：左下折向湖心亭（桥面 + 矮栏）
      const bridge = svgEl('polygon');
      bridge.setAttribute('points', '0,138 58,138 58,150 0,150');
      bridge.setAttribute('fill', SILHOUETTE_2);
      svg.appendChild(bridge);
      const bridge2 = svgEl('polygon');
      bridge2.setAttribute('points', '52,138 108,138 108,150 52,150');
      bridge2.setAttribute('fill', SILHOUETTE_2);
      svg.appendChild(bridge2);
      for (const bx of [10, 34, 66, 90]) {
        const rail = svgEl('rect');
        rail.setAttribute('x', String(bx));
        rail.setAttribute('y', '132');
        rail.setAttribute('width', '1.6');
        rail.setAttribute('height', '8');
        rail.setAttribute('fill', SILHOUETTE);
        svg.appendChild(rail);
      }
      // 湖心亭：重檐（基线 138，立于水中）
      const pillars = svgEl('rect');
      pillars.setAttribute('x', '108');
      pillars.setAttribute('y', '104');
      pillars.setAttribute('width', '64');
      pillars.setAttribute('height', '36');
      pillars.setAttribute('fill', SILHOUETTE);
      svg.appendChild(pillars);
      addWindows(svg, 114, 110, 52, 24, 4, 2, '#e3edf5');
      // 翘檐屋顶（两重）
      roofCurved(svg, 92, 102, 96, 18, accent);
      roofCurved(svg, 104, 84, 72, 15, accent);
      // 顶饰
      const finial = svgEl('circle');
      finial.setAttribute('cx', '140');
      finial.setAttribute('cy', '76');
      finial.setAttribute('r', '3');
      finial.setAttribute('fill', accent);
      svg.appendChild(finial);
      // 亭柱下半（没入水中）
      const stilts = svgEl('rect');
      stilts.setAttribute('x', '112');
      stilts.setAttribute('y', '140');
      stilts.setAttribute('width', '56');
      stilts.setAttribute('height', '6');
      stilts.setAttribute('fill', SILHOUETTE_2);
      svg.appendChild(stilts);
      break;
    }
    case 'temple': {
      // 静安寺：鎏金大殿 + 塔
      // 大殿
      const hall = svgEl('rect');
      hall.setAttribute('x', '88');
      hall.setAttribute('y', '112');
      hall.setAttribute('width', '128');
      hall.setAttribute('height', '50');
      hall.setAttribute('fill', SILHOUETTE);
      svg.appendChild(hall);
      // 金顶（重檐）
      roofCurved(svg, 78, 110, 148, 22, accent);
      roofCurved(svg, 92, 88, 120, 18, accent);
      addWindows(svg, 96, 122, 112, 34, 6, 2, '#e3edf5');
      // 金塔
      towerRect(svg, 248, 118, 20, 44, SILHOUETTE_2, accent);
      roofCurved(svg, 244, 116, 28, 12, accent);
      const spireC = svgEl('circle');
      spireC.setAttribute('cx', '258');
      spireC.setAttribute('cy', '100');
      spireC.setAttribute('r', '3');
      spireC.setAttribute('fill', accent);
      svg.appendChild(spireC);
      break;
    }
    case 'neon': {
      // 南京路：街面 + 招牌
      towerRect(svg, 8, 74, 80, 88, SILHOUETTE, accent);
      towerRect(svg, 232, 70, 84, 92, SILHOUETTE_2, accent);
      addWindows(svg, 14, 84, 68, 70, 5, 6, accent);
      addWindows(svg, 240, 82, 72, 72, 5, 6, accent);
      // 霓虹招牌（横竖灯箱）
      const signs: Array<[number, number, number, number, string]> = [
        [96, 96, 40, 12, accent],
        [150, 104, 26, 34, '#c9a876'],
        [186, 90, 30, 40, accent],
      ];
      for (const [x, y, w, h, col] of signs) {
        const s = svgEl('rect');
        s.setAttribute('x', String(x));
        s.setAttribute('y', String(y));
        s.setAttribute('width', String(w));
        s.setAttribute('height', String(h));
        s.setAttribute('fill', SILHOUETTE);
        s.setAttribute('stroke', col);
        s.setAttribute('stroke-width', '1.6');
        svg.appendChild(s);
        addWindows(svg, x + 3, y + 3, w - 6, h - 6, Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 8)), col);
      }
      // 街面人影
      for (const px of [112, 138, 164, 190]) {
        const person = svgEl('circle');
        person.setAttribute('cx', String(px));
        person.setAttribute('cy', '152');
        person.setAttribute('r', '2.4');
        person.setAttribute('fill', '#0a1c2c');
        svg.appendChild(person);
      }
      break;
    }
    case 'square': {
      // 人民广场：开阔 + 环楼
      for (const [x, y, w] of [
        [14, 86, 56],
        [86, 66, 44],
        [196, 72, 40],
        [252, 84, 58],
      ]) {
        towerRect(svg, x, y, w, 162 - y, SILHOUETTE, accent);
        addWindows(svg, x + 4, y + 8, w - 8, 160 - y, Math.max(2, Math.round(w / 10)), 8, accent);
      }
      // 喷泉
      const basin = svgEl('ellipse');
      basin.setAttribute('cx', '160');
      basin.setAttribute('cy', '152');
      basin.setAttribute('rx', '26');
      basin.setAttribute('ry', '7');
      basin.setAttribute('fill', '#123049');
      svg.appendChild(basin);
      const jet = svgEl('path');
      jet.setAttribute('d', 'M160 152 Q 152 136 160 124 Q 168 136 160 152');
      jet.setAttribute('fill', accent);
      jet.setAttribute('opacity', '0.75');
      svg.appendChild(jet);
      // 博物馆圆顶
      const dome = svgEl('circle');
      dome.setAttribute('cx', '108');
      dome.setAttribute('cy', '66');
      dome.setAttribute('r', '10');
      dome.setAttribute('fill', SILHOUETTE_2);
      dome.setAttribute('stroke', accent);
      svg.appendChild(dome);
      break;
    }
    case 'crown': {
      // 中华艺术宫：倒置斗拱——上宽下窄的层叠柱
      const tiers: Array<[number, number, number]> = [
        [160, 34, 60],
        [160, 54, 96],
        [160, 76, 124],
        [160, 98, 148],
      ];
      for (const [cx, cy, w] of tiers) {
        const tier = svgEl('polygon');
        tier.setAttribute('points', `${cx - w / 2 - 8},${cy} ${cx + w / 2 + 8},${cy} ${cx + w / 2},${cy + 14} ${cx - w / 2},${cy + 14}`);
        tier.setAttribute('fill', SILHOUETTE);
        tier.setAttribute('stroke', accent);
        tier.setAttribute('stroke-width', '1');
        svg.appendChild(tier);
      }
      // 56 根柱子的意象（取密集竖线）
      for (let i = 0; i < 16; i++) {
        const x = 92 + i * 10.5;
        const pillar = svgEl('rect');
        pillar.setAttribute('x', String(x));
        pillar.setAttribute('y', '114');
        pillar.setAttribute('width', '3');
        pillar.setAttribute('height', '48');
        pillar.setAttribute('fill', SILHOUETTE_2);
        pillar.setAttribute('stroke', accent);
        pillar.setAttribute('stroke-width', '0.5');
        svg.appendChild(pillar);
      }
      break;
    }
  }

  addHalftone(svg);
  // 漫画速度线（右上角的爆发线，增强「画格」感）
  const speed = svgEl('path');
  speed.setAttribute('d', 'M300 8 L 244 40 M312 30 L 258 58 M296 58 L 252 84');
  speed.setAttribute('stroke', '#e3edf5');
  speed.setAttribute('stroke-width', '1.4');
  speed.setAttribute('opacity', '0.2');
  speed.setAttribute('fill', 'none');
  svg.appendChild(speed);
  return svg;
}

function towerRect(svg: SVGElement, x: number, y: number, w: number, h: number, fill: string, accent: string): void {
  const r = svgEl('rect');
  r.setAttribute('x', String(x));
  r.setAttribute('y', String(y));
  r.setAttribute('width', String(w));
  r.setAttribute('height', String(h));
  r.setAttribute('fill', fill);
  r.setAttribute('stroke', accent);
  r.setAttribute('stroke-width', '0.8');
  svg.appendChild(r);
}

function spire(svg: SVGElement, cx: number, baseY: number, h: number, accent: string): void {
  const p = svgEl('polygon');
  p.setAttribute('points', `${cx - 3},${baseY} ${cx + 3},${baseY} ${cx},${baseY - h}`);
  p.setAttribute('fill', accent);
  svg.appendChild(p);
}

// 翘檐屋顶：两端上翘的宽带
function roofCurved(svg: SVGElement, x: number, y: number, w: number, h: number, accent: string): void {
  const p = svgEl('path');
  p.setAttribute('d', `M${x} ${y} Q ${x + w / 2} ${y - h} ${x + w} ${y} L ${x + w - 4} ${y + 3} Q ${x + w / 2} ${y - h + 7} ${x + 4} ${y + 3} Z`);
  p.setAttribute('fill', SILHOUETTE_2);
  p.setAttribute('stroke', accent);
  p.setAttribute('stroke-width', '0.8');
  svg.appendChild(p);
}

// ============================================================
// 故事查看器
// 交互模型（2026-10-03 修订）：四格漫画式——一格一点。
// 每格的完整文案（panel.lines）一次打出（打字机效果），点击 = 下一格；
// 最后一格打字完成即显示「完成」。精确 4 次点击读完一篇 4 格故事。
// ============================================================
export interface StoryViewerCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
}

export interface OpenOptions {
  /** 任何方式关闭（读完/跳过/Esc）都标记已读——新手引导用，避免每次刷新重复弹出 */
  markReadOnClose?: boolean;
}

export interface StoryViewer {
  open(storyId: string, opts?: OpenOptions): void;
  close(): void;
  isOpen(): boolean;
}

export function createStoryViewer(cb: StoryViewerCallbacks = {}): StoryViewer {
  const overlay = el('div', 'story-overlay hidden');
  overlay.id = 'story-overlay';

  const stage = el('div', 'story-stage');
  const stageInner = el('div', 'story-stage-inner');
  stage.appendChild(stageInner);

  const dialog = el('div', 'story-dialog');
  const nameplate = el('div', 'story-name');
  const textEl = el('div', 'story-text');
  const hint = el('div', 'story-hint');
  hint.textContent = '点击继续 ▼';
  const dots = el('div', 'story-dots');
  const doneBtn = el('button', 'story-done');
  doneBtn.textContent = '完成';
  doneBtn.classList.add('hidden');
  const skipBtn = el('button', 'story-skip') as HTMLButtonElement;
  skipBtn.type = 'button';
  skipBtn.textContent = '跳过';
  dialog.append(nameplate, textEl, hint, dots, doneBtn);
  overlay.append(stage, dialog, skipBtn);
  document.getElementById('app')?.appendChild(overlay);

  let story: LandmarkStory | null = null;
  let panelIndex = 0;
  let typing = false;
  let typeTimer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let charIdx = 0;
  let currentText = '';
  let markReadOnClose = false;

  function clearTimer(): void {
    if (typeTimer !== undefined) {
      clearTimeout(typeTimer);
      typeTimer = undefined;
    }
  }

  function setDots(): void {
    if (!story) return;
    dots.innerHTML = '';
    for (let i = 0; i < story.panels.length; i++) {
      const d = el('span', 'story-dot' + (i < panelIndex ? ' done' : '') + (i === panelIndex ? ' current' : ''));
      dots.appendChild(d);
    }
  }

  function renderPanel(): void {
    if (!story) return;
    const panel = story.panels[panelIndex];
    stageInner.innerHTML = '';
    const sceneSvg = buildScene(story, panel.mood);
    stageInner.appendChild(sceneSvg);
  }

  // 一格的完整文案一次性打出（多句用换行分隔，CSS white-space: pre-line 渲染）
  function typePanel(): void {
    if (!story) return;
    currentText = story.panels[panelIndex].lines.join('\n');
    charIdx = 0;
    typing = true;
    textEl.textContent = '';
    hint.classList.remove('blink');
    tick();
  }

  function tick(): void {
    if (!typing || !story) return;
    charIdx += 1;
    textEl.textContent = currentText.slice(0, charIdx);
    if (charIdx >= currentText.length) {
      typing = false;
      hint.classList.add('blink');
      // 最后一格打完：直接进入完成态（不再多点一次）
      if (panelIndex >= story.panels.length - 1) finishReading();
      return;
    }
    typeTimer = setTimeout(tick, 1000 / CHARS_PER_SEC);
  }

  function finishReading(): void {
    if (!story || finished) return;
    finished = true;
    markStoryRead(story.id);
    doneBtn.classList.remove('hidden');
    hint.classList.add('hidden');
  }

  // 点击 = 下一格（打字中点击会跳过当前剩余打字直接翻页）
  function advance(): void {
    if (!story) return;
    if (finished) {
      close();
      return;
    }
    clearTimer();
    typing = false;
    panelIndex += 1;
    if (panelIndex >= story.panels.length) {
      // 边界保护：正常流程打完最后一格即 finishReading，不会走到这
      finishReading();
      return;
    }
    renderPanel();
    setDots();
    typePanel();
  }

  function open(storyId: string, opts: OpenOptions = {}): void {
    // 策展故事与新手引导篇章统一查找
    const s = findStory(storyId);
    if (!s) return;
    story = s;
    markReadOnClose = opts.markReadOnClose ?? false;
    panelIndex = 0;
    finished = false;
    nameplate.textContent = s.title;
    doneBtn.classList.add('hidden');
    hint.classList.remove('hidden');
    overlay.classList.remove('hidden');
    renderPanel();
    setDots();
    typePanel();
    cb.onOpen?.();
  }

  function close(): void {
    clearTimer();
    typing = false;
    if (story && markReadOnClose) markStoryRead(story.id);
    story = null;
    overlay.classList.add('hidden');
    cb.onClose?.();
  }

  function isOpen(): boolean {
    return !overlay.classList.contains('hidden');
  }

  overlay.addEventListener('click', () => advance());
  doneBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  // 仅在打开时监听键盘。故事打开期间「吃掉」 Space/Enter/Escape：
  // stopImmediatePropagation 阻止后注册的监听器（飞行控制器的模式退出键、
  // 观影的 Esc 退出等）在同一次事件里误触发。
  // V1R2-002：必须用 capture 阶段注册——真实键盘事件的 target 是 body，
  // 捕获阶段从 window 起向下；若注册在冒泡阶段，观影的 capture 监听会先执行
  // 并 stopPropagation，故事收不到 Escape（合成 dispatchEvent 的 target 是
  // window 本身，AT_TARGET 按注册顺序——曾让该缺陷在合成测试下藏了数轮）。
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (!isOpen()) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        advance();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    },
    true,
  );

  return { open, close, isOpen };
}

// ============================================================
// 接近提示（飞行中接近未读故事地标 → 浮出「点击阅读」）
// ============================================================
const APPROACH_RADIUS_M = 350;

export interface StoryTrigger {
  update(state: FlightState): void;
  hide(): void;
}

export function createStoryTrigger(
  viewer: StoryViewer,
  landmarks: Array<{ id: string; name: string; lon: number; lat: number }>,
): StoryTrigger {
  const prompt = el('button', 'story-prompt hidden') as HTMLButtonElement;
  prompt.id = 'story-prompt';
  prompt.type = 'button';
  document.getElementById('app')?.appendChild(prompt);

  let currentId: string | null = null;

  prompt.addEventListener('click', () => {
    if (currentId) {
      viewer.open(currentId);
      hide();
    }
  });

  function hide(): void {
    currentId = null;
    prompt.classList.add('hidden');
    prompt.classList.remove('show');
  }

  function update(state: FlightState): void {
    let best: { id: string; name: string; dist: number } | null = null;
    for (const lm of landmarks) {
      if (isStoryRead(lm.id)) continue; // 只提示未读
      const d = distanceMeters(state.lng, state.lat, lm.lon, lm.lat);
      if (d < APPROACH_RADIUS_M && (!best || d < best.dist)) {
        best = { id: lm.id, name: lm.name, dist: d };
      }
    }
    if (best) {
      if (currentId !== best.id) {
        currentId = best.id;
        prompt.innerHTML = `<span class="sp-mark">❕</span> 前方 ${best.name} <span class="sp-sub">点击阅读故事</span>`;
        prompt.classList.remove('hidden');
        // 强制重排后再加 show，触发过渡
        void prompt.offsetWidth;
        prompt.classList.add('show');
      }
    } else if (currentId !== null) {
      hide();
    }
  }

  return { update, hide };
}
