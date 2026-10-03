// 地标搜索：本地匹配（36 策展 + 34 扩展 + 用户地点）+ Nominatim 在线补充。
// 在线失败时静默降级到本地结果（搜索失败不算应用错误，不污染 __errs）。
// 依据 docs/DESIGN-LANDMARKS-2026-10-03.md 第 1 节。

import type { Landmark } from './landmarks';
import { landmarks, searchableLandmarks } from './landmarks';

// 策展地标（landmarks）有故事/导航联动；扩展集（extraPois）只用于搜索与浏览。
// searchableLandmarks 是两者拼接，靠 id 区分来源，新增条目时两边对齐即可。
const CURATED_IDS = new Set(landmarks.map((l) => l.id));

export type ResultOrigin = 'curated' | 'extra' | 'user' | 'online';

export interface SearchResult {
  name: string;
  category: string; // 显示用类别标签
  origin: ResultOrigin;
  lon: number;
  lat: number;
  note?: string;
  /** 命中的策展地标 id（若有）——搜索结果点击可联动故事/导航 */
  landmarkId?: string;
}

// ---- 用户地点（「我的地点」）：localStorage 持久化，失败静默降级 ----
const USER_KEY = 'atria-user-places';

function loadUserPlaces(): Landmark[] {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Landmark[]) : [];
  } catch {
    return [];
  }
}

function saveUserPlaces(places: Landmark[]): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(places));
  } catch {
    // 不可写时静默降级为会话内有效
  }
}

export function getUserPlaces(): Landmark[] {
  return loadUserPlaces();
}

export function addUserPlace(lm: Landmark): void {
  const places = loadUserPlaces();
  if (places.some((p) => p.id === lm.id)) return;
  places.push(lm);
  saveUserPlaces(places);
}

// ---- 本地匹配 ----
// 简单子串匹配 + 拼音首字母未来可扩展；当前中文名匹配已足够。
export function searchLocal(q: string): SearchResult[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const out: SearchResult[] = [];
  // 策展地标优先（有故事/导航联动），其次扩展集，最后用户地点
  for (const lm of searchableLandmarks) {
    if (lm.name.toLowerCase().includes(query)) {
      out.push({
        name: lm.name,
        category: lm.category,
        origin: CURATED_IDS.has(lm.id) ? 'curated' : 'extra',
        lon: lm.lon,
        lat: lm.lat,
        note: lm.note,
        landmarkId: lm.id,
      });
    }
  }
  for (const lm of loadUserPlaces()) {
    if (lm.name.toLowerCase().includes(query)) {
      out.push({
        name: lm.name,
        category: lm.category,
        origin: 'user',
        lon: lm.lon,
        lat: lm.lat,
        note: lm.note,
        landmarkId: lm.id,
      });
    }
  }
  return out;
}

// ---- 在线搜索（Nominatim，零 Key，支持 CORS）----
// 使用策略：≥2 字、防抖 500ms、会话缓存；尊重其 1 req/s 的使用政策。
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// 上海市域 viewbox：left,top,right,bottom
const SHANGHAI_VIEWBOX = '121.20,31.40,121.70,31.10';

const onlineCache = new Map<string, SearchResult[]>();
let lastOnlineRequestAt = 0;
const ONLINE_MIN_INTERVAL_MS = 1100; // 主动节流到 <1 req/s

// OSM class → 中文类别标签
function classToCategory(cls: string | undefined): string {
  switch (cls) {
    case 'tourism':
      return '景点';
    case 'amenity':
      return '设施';
    case 'leisure':
      return '休闲';
    case 'historic':
      return '历史';
    case 'shop':
      return '商业';
    case 'building':
      return '建筑';
    case 'place':
      return '地名';
    case 'public_transport':
      return '交通';
    default:
      return '地点';
  }
}

export async function searchOnline(q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const cached = onlineCache.get(query);
  if (cached) return cached;

  // 节流：距上次请求不足间隔时，等到间隔结束（调用方已防抖，这里兜底）
  const wait = ONLINE_MIN_INTERVAL_MS - (Date.now() - lastOnlineRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  const url =
    `${NOMINATIM_URL}?format=jsonv2&limit=8&accept-language=zh-CN` +
    `&viewbox=${SHANGHAI_VIEWBOX}&bounded=1&q=${encodeURIComponent(query)}`;

  try {
    lastOnlineRequestAt = Date.now();
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      class?: string;
      type?: string;
    }>;

    const results: SearchResult[] = data
      .filter((d) => d.lat && d.lon && d.display_name)
      .map((d) => {
        const name = d.display_name.split(',')[0].trim();
        return {
          name: name || d.display_name,
          category: classToCategory(d.class),
          origin: 'online' as const,
          lon: parseFloat(d.lon),
          lat: parseFloat(d.lat),
          note: d.type,
        };
      })
      .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat));

    onlineCache.set(query, results);
    return results;
  } catch {
    // 网络不可达 / 限速 / 返回异常：静默降级，本次无在线结果
    console.debug('[search] online unavailable, local only');
    return [];
  }
}

// 把任意搜索结果转成地标对象（V1-002：统一分派，扩展 POI / 在线 / 已存点都能飞、能设导航）
export function resultToLandmark(r: SearchResult): Landmark {
  return {
    id: r.landmarkId ?? `place-${r.lon.toFixed(5)}-${r.lat.toFixed(5)}`,
    name: r.name,
    // 扩展 POI 带真实类别；在线结果的类别是显示标签（'景点'等），统一归 '搜索'
    category: (r.origin === 'extra' || r.origin === 'user' || r.origin === 'curated'
      ? (r.category as Landmark['category'])
      : '搜索'),
    lon: r.lon,
    lat: r.lat,
    note: r.note ?? '',
  };
}

// 旧名保留兼容（仅在线结果收藏场景）
export const onlineResultToLandmark = resultToLandmark;
