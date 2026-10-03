// 深海军蓝主题矢量样式（基于 OpenMapTiles 数据模式）
// 瓦片源两套：本地 Planetiler 生成的高清晰 PMTiles（maxzoom 16）为首选，
// 未生成时回退到 OpenFreeMap 公共瓦片（maxzoom 14，零 Key 零限制）。
// 字体仍来自 OpenFreeMap 公共服务。

import type { StyleSpecification } from 'maplibre-gl';

export const REMOTE_TILES = {
  url: 'https://tiles.openfreemap.org/planet',
  maxzoom: 14,
};

export const LOCAL_TILES = {
  url: `pmtiles://${location.origin}/tiles/shanghai.pmtiles`,
  maxzoom: 16,
};

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export function createStyle(tileSource: { url: string; maxzoom: number }): StyleSpecification {
  return {
  version: 8,
  name: 'atria-shanghai-dusk',
  sources: {
    openmaptiles: {
      type: 'vector',
      url: tileSource.url,
      maxzoom: tileSource.maxzoom,
    },
    // 选中建筑高亮的数据源，由点击事件填充
    'selected-building': {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
  },
  glyphs: GLYPHS,
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#13203c' },
    },
    // 水系：黄浦江、苏州河
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: {
        'fill-color': '#16283f',
        'fill-antialias': true,
      },
    },
    // 水岸线：暖色描边，黄昏夕阳在江面上的反光边界
    {
      id: 'water-edge',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'water',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#c9a876',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 14, 1.4, 17, 3],
        'line-opacity': 0.6,
        'line-blur': 0.6,
      },
    },
    // 地块底色：城市建成区微微提亮，压住大片绿地。
    // 远景区域略提一档，减少远处死黑割裂的透视割裂感（空气感）。
    {
      id: 'landuse',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      paint: {
        'fill-color': '#14243a',
        'fill-opacity': 0.9,
      },
    },
    {
      id: 'landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      paint: {
        'fill-color': '#172c42',
        'fill-opacity': 0.7,
      },
    },
    // 道路骨架：深色基底上一条条更亮的蓝
    // 主干道（motorway/trunk）加亮加模糊，模拟黄昏光带；次级道路保持哑光
    {
      id: 'road-casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['!=', ['get', 'class'], 'path'],
      paint: {
        'line-color': [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk'],
          '#c9a876',
          '#123049',
        ],
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 10, 0.4, 14, 1.6, 17, 4],
        'line-blur': [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk'],
          0.9,
          0,
        ],
      },
    },
    {
      id: 'road',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['!=', ['get', 'class'], 'path'],
      paint: {
        'line-color': [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk'],
          '#1E4263',
          ['primary', 'secondary'],
          '#1A3A58',
          '#16324C',
        ],
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 10, 0.2, 14, 1.0, 17, 2.6],
        'line-opacity': 0.95,
      },
    },
    {
      id: 'road-path',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['==', ['get', 'class'], 'path'],
      paint: {
        'line-color': '#14293C',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.3, 17, 1.0],
      },
    },
    // 步行街等行人面域
    {
      id: 'road-pedestrian',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['==', ['get', 'class'], 'pedestrian'],
      paint: { 'fill-color': '#112B40', 'fill-opacity': 0.8 },
    },
    // 建筑平面（低视角时打底）
    {
      id: 'building-footprint',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      maxzoom: 14,
      paint: { 'fill-color': '#1a3048', 'fill-opacity': 0.9 },
    },
    // 3D 建筑：挤出高度取 OpenMapTiles 预计算的 render_height（已含 levels 回退）。
    // 黄昏定妆：蓝紫夜色中，只有高过夕阳高度线的塔楼被暖金点亮——
    // 城市天际线自下而上分层，最高的塔像被最后一缕阳光点燃。
    {
      id: 'building-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'render_height'], 6],
          0,
          '#142a40',
          40,
          '#1b3550',
          100,
          '#2a5070',
          200,
          '#6a5a55',
          320,
          '#b07c50',
          500,
          '#d6a068',
        ],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    // 选中建筑高亮层（由点击事件填充 GeoJSON）
    {
      id: 'building-selected',
      type: 'fill-extrusion',
      source: 'selected-building',
      paint: {
        'fill-extrusion-color': '#e8b06a',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    // 地名标注
    {
      id: 'label-suburb',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood']]],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 12, 17, 15],
        'text-max-width': 6,
        'text-padding': 4,
      },
      paint: {
        'text-color': '#92b0c8',
        'text-halo-color': '#06101a',
        'text-halo-width': 1.6,
      },
    },
    {
      id: 'label-city-town',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 15],
        'text-max-width': 8,
      },
      paint: {
        'text-color': '#b6cede',
        'text-halo-color': '#06101a',
        'text-halo-width': 1.8,
      },
    },
    {
      id: 'label-water',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Italic'],
        'text-size': 12,
        'text-letter-spacing': 0.4,
      },
      paint: {
        'text-color': '#3E6E93',
        'text-halo-color': '#0A1C2C',
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'label-road',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 14,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9, 17, 12],
        'symbol-placement': 'line',
        'text-max-angle': 30,
      },
      paint: {
        'text-color': '#5C7C96',
        'text-halo-color': '#0A1C2C',
        'text-halo-width': 1.0,
      },
    },
  ],
  };
}
