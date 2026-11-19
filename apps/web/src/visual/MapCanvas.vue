<template>
  <div class="map-wrap">
    <div ref="el" class="map" :class="{ picking: pickMode }" />
    <div class="provider muted">
      {{ providerLabel }}
      <span v-if="fallbackReason" class="warn">（{{ fallbackReason }}）</span>
    </div>
    <div v-if="pickMode" class="pick-hint">点击地图选取坐标</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { MapProvider } from '@zupu/shared';
import { getMapConfig } from './api';
import { echarts, ensureChinaMap } from './echarts';
import { loadAmap, loadTencent } from './loaders';
import type { MapMarker, MapRoute } from './map-types';

const props = withDefaults(
  defineProps<{ markers?: MapMarker[]; routes?: MapRoute[]; pickMode?: boolean; animate?: boolean; fitKey?: string | number; forceOffline?: boolean }>(),
  { markers: () => [], routes: () => [], pickMode: false, animate: true, fitKey: 0, forceOffline: false },
);
const emit = defineEmits<{
  (e: 'marker-click', id: string): void;
  (e: 'pick', v: { lng: number; lat: number }): void;
  (e: 'ready', provider: MapProvider): void;
}>();

const el = ref<HTMLDivElement>();
const provider = ref<MapProvider>('offline');
const fallbackReason = ref('');
const providerLabel = computed(() => ({ amap: '高德地图', tencent: '腾讯地图', offline: '离线地图（未配置地图服务 key）' })[provider.value]);

interface Renderer {
  update(fit: boolean): void;
  focus(lng: number, lat: number, zoom?: number): void;
  resize(): void;
  dispose(): void;
}
let r: Renderer | null = null;

function bounds() {
  const pts: [number, number][] = [...props.markers.map((m) => [m.lng, m.lat] as [number, number]), ...props.routes.flatMap((x) => [x.from, x.to])];
  if (!pts.length) return null;
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return { minLng: Math.min(...lngs), maxLng: Math.max(...lngs), minLat: Math.min(...lats), maxLat: Math.max(...lats) };
}

// ---------------- 离线：ECharts 中国地图 ----------------
async function createOffline(): Promise<Renderer> {
  await ensureChinaMap();
  const chart = echarts.init(el.value!);
  let view = { center: [105, 34] as number[], zoom: 1.2 };
  const fitView = () => {
    const b = bounds();
    if (!b) return { center: [105, 34], zoom: 1.2 };
    const span = Math.max(b.maxLng - b.minLng, (b.maxLat - b.minLat) * 1.3, 2);
    return { center: [(b.minLng + b.maxLng) / 2, (b.minLat + b.maxLat) / 2], zoom: Math.min(9, Math.max(1.1, 38 / span)) };
  };
  const option = () => ({
    tooltip: { trigger: 'item', formatter: (p: any) => p.data?.tip ?? p.name ?? '' },
    geo: {
      map: 'china',
      roam: true,
      center: view.center,
      zoom: view.zoom,
      scaleLimit: { min: 0.8, max: 40 },
      label: { show: false },
      itemStyle: { areaColor: '#f4ecd9', borderColor: '#c9a45c', borderWidth: 0.8 },
      emphasis: { label: { show: true, color: '#8b1e1e' }, itemStyle: { areaColor: '#efe0bd' } },
      select: { disabled: true },
    },
    series: [
      {
        type: 'lines',
        coordinateSystem: 'geo',
        zlevel: 2,
        effect: { show: props.animate, period: 4, trailLength: 0.2, symbol: 'arrow', symbolSize: 8 },
        lineStyle: { curveness: 0.25, width: 2, opacity: 0.85 },
        data: props.routes.map((x) => ({
          coords: [x.from, x.to],
          tip: x.label,
          lineStyle: { color: x.color, width: x.highlight ? 4 : 2, opacity: x.highlight ? 1 : 0.7 },
        })),
      },
      {
        type: 'effectScatter',
        coordinateSystem: 'geo',
        zlevel: 3,
        rippleEffect: { scale: 3, brushType: 'stroke' },
        showEffectOn: 'render',
        data: props.routes.filter((x) => x.highlight).map((x) => ({ value: x.to, itemStyle: { color: x.color }, tip: x.label })),
        symbolSize: 10,
      },
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        zlevel: 3,
        data: props.markers.map((m) => ({
          id: m.id,
          name: m.name,
          value: [m.lng, m.lat],
          symbolSize: m.size ?? 9,
          itemStyle: { color: m.color ?? '#8b1e1e', borderColor: '#fff', borderWidth: 1 },
          tip: m.name,
        })),
        labelLayout: { hideOverlap: true },
        label: { show: true, position: 'right', formatter: '{b}', color: '#3a2a1a', fontSize: 12, textBorderColor: '#fff', textBorderWidth: 2 },
      },
    ],
  });
  chart.on('georoam', () => {
    const g = (chart.getOption() as any).geo?.[0];
    if (g) view = { center: g.center, zoom: g.zoom };
  });
  chart.on('click', (p: any) => {
    if (p.seriesType === 'scatter' && p.data?.id) emit('marker-click', p.data.id);
  });
  chart.getZr().on('click', (e: any) => {
    if (!props.pickMode) return;
    const pt = chart.convertFromPixel({ geoIndex: 0 }, [e.offsetX, e.offsetY]) as number[] | undefined;
    if (pt) emit('pick', { lng: +pt[0].toFixed(5), lat: +pt[1].toFixed(5) });
  });
  return {
    update(fit) {
      if (fit) view = fitView();
      chart.setOption(option(), { replaceMerge: ['series'] });
    },
    focus(lng, lat, zoom = 8) {
      zoom = Math.min(12, zoom);
      view = { center: [lng, lat], zoom };
      chart.setOption({ geo: { center: view.center, zoom } });
    },
    resize: () => chart.resize(),
    dispose: () => chart.dispose(),
  };
}

// ---------------- 高德地图 JS API 2.0 ----------------
async function createAmap(key: string, security: string | null): Promise<Renderer> {
  const AMap = await loadAmap(key, security);
  const map = new AMap.Map(el.value, { zoom: 5, center: [110, 32], mapStyle: 'amap://styles/whitesmoke' });
  map.addControl(new AMap.Scale());
  map.addControl(new AMap.ToolBar({ position: 'RT' }));
  map.on('click', (e: any) => props.pickMode && emit('pick', { lng: +e.lnglat.getLng().toFixed(5), lat: +e.lnglat.getLat().toFixed(5) }));
  let overlays: any[] = [];
  return {
    update(fit) {
      map.remove(overlays);
      overlays = [];
      for (const x of props.routes) {
        overlays.push(new AMap.Polyline({ path: [x.from, x.to], strokeColor: x.color, strokeWeight: x.highlight ? 6 : 4, strokeOpacity: 0.85, showDir: true, lineCap: 'round' }));
        if (props.animate && x.highlight) {
          const mover = new AMap.CircleMarker({ center: x.from, radius: 6, fillColor: x.color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, zIndex: 120 });
          overlays.push(mover);
          const run = () => mover.moveAlong?.([x.from, x.to], { duration: 3000, autoRotation: false });
          mover.on?.('movealong', run);
          setTimeout(run, 50);
        }
      }
      for (const m of props.markers) {
        const c = new AMap.CircleMarker({ center: [m.lng, m.lat], radius: (m.size ?? 9) / 2 + 2, fillColor: m.color ?? '#8b1e1e', fillOpacity: 0.95, strokeColor: '#fff', strokeWeight: 1.5, bubble: true, cursor: 'pointer', zIndex: 110 });
        c.on('click', () => emit('marker-click', m.id));
        overlays.push(c, new AMap.Text({ text: m.name, position: [m.lng, m.lat], offset: new AMap.Pixel(10, -6), anchor: 'middle-left', style: { border: 'none', background: 'transparent', color: '#3a2a1a', fontSize: '12px', textShadow: '0 0 2px #fff' } }));
      }
      map.add(overlays);
      if (fit && overlays.length) map.setFitView(null, false, [60, 60, 60, 60]);
    },
    focus: (lng, lat, zoom = 14) => map.setZoomAndCenter(zoom, [lng, lat]),
    resize: () => map.resize?.(),
    dispose: () => map.destroy(),
  };
}

// ---------------- 腾讯地图 GL JS ----------------
function dot(color: string) {
  return 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`);
}
async function createTencent(key: string): Promise<Renderer> {
  const TMap = await loadTencent(key);
  const LL = (p: [number, number]) => new TMap.LatLng(p[1], p[0]);
  const map = new TMap.Map(el.value, { center: new TMap.LatLng(32, 110), zoom: 5 });
  map.on('click', (e: any) => props.pickMode && emit('pick', { lng: +e.latLng.lng.toFixed(5), lat: +e.latLng.lat.toFixed(5) }));
  let layers: any[] = [];
  return {
    update(fit) {
      layers.forEach((l) => l.setMap(null));
      layers = [];
      const colors = [...new Set([...props.routes.map((x) => x.color), ...props.markers.map((m) => m.color ?? '#8b1e1e')])];
      const sid = (c: string) => 's' + colors.indexOf(c);
      if (props.routes.length) {
        const styles: any = {};
        for (const c of colors) {
          styles[sid(c)] = new TMap.PolylineStyle({ color: c, width: 4, showArrow: true, lineCap: 'round' });
          styles[sid(c) + 'h'] = new TMap.PolylineStyle({ color: c, width: 7, showArrow: true, lineCap: 'round' });
        }
        layers.push(
          new TMap.MultiPolyline({ map, styles, geometries: props.routes.map((x) => ({ id: x.id, styleId: sid(x.color) + (x.highlight ? 'h' : ''), paths: [LL(x.from), LL(x.to)] })) }),
        );
        const moving = props.routes.filter((x) => x.highlight && props.animate);
        if (moving.length) {
          const mstyles: any = {};
          for (const c of colors) mstyles[sid(c)] = new TMap.MarkerStyle({ width: 16, height: 16, anchor: { x: 8, y: 8 }, src: dot(c) });
          const mover = new TMap.MultiMarker({ map, styles: mstyles, geometries: moving.map((x) => ({ id: 'mv' + x.id, styleId: sid(x.color), position: LL(x.from) })) });
          const run = () => mover.moveAlong(Object.fromEntries(moving.map((x) => ['mv' + x.id, { path: [LL(x.from), LL(x.to)], speed: 1200000 }])), { autoRotation: false });
          mover.on('move_ended', run);
          run();
          layers.push(mover);
        }
      }
      if (props.markers.length) {
        const styles: any = {};
        for (const c of colors) styles[sid(c)] = new TMap.MarkerStyle({ width: 16, height: 16, anchor: { x: 8, y: 8 }, src: dot(c) });
        const mk = new TMap.MultiMarker({ map, styles, geometries: props.markers.map((m) => ({ id: m.id, styleId: sid(m.color ?? '#8b1e1e'), position: LL([m.lng, m.lat]) })) });
        mk.on('click', (e: any) => emit('marker-click', e.geometry.id));
        const labels = new TMap.MultiLabel({
          map,
          styles: { l: new TMap.LabelStyle({ color: '#3a2a1a', size: 12, offset: { x: 0, y: -16 } }) },
          geometries: props.markers.map((m) => ({ id: 'l' + m.id, styleId: 'l', position: LL([m.lng, m.lat]), content: m.name })),
        });
        layers.push(mk, labels);
      }
      const b = bounds();
      if (fit && b) map.fitBounds(new TMap.LatLngBounds(new TMap.LatLng(b.minLat, b.minLng), new TMap.LatLng(b.maxLat, b.maxLng)), { padding: 60 });
    },
    focus: (lng, lat, zoom = 14) => {
      map.setCenter(new TMap.LatLng(lat, lng));
      map.setZoom(zoom);
    },
    resize: () => undefined,
    dispose: () => map.destroy(),
  };
}

let ro: ResizeObserver | null = null;
onMounted(async () => {
  const cfg = props.forceOffline ? { provider: 'offline' as const, key: null, securityJsCode: null } : await getMapConfig();
  try {
    if (cfg.provider === 'amap' && cfg.key) r = await createAmap(cfg.key, cfg.securityJsCode);
    else if (cfg.provider === 'tencent' && cfg.key) r = await createTencent(cfg.key);
    provider.value = r ? cfg.provider : 'offline';
  } catch (e) {
    fallbackReason.value = `${cfg.provider === 'amap' ? '高德' : '腾讯'}地图加载失败，已切换离线地图`;
    console.warn(e);
  }
  if (!r) r = await createOffline();
  r.update(true);
  emit('ready', provider.value);
  ro = new ResizeObserver(() => r?.resize());
  ro.observe(el.value!);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  r?.dispose();
});

watch(() => [props.markers, props.routes, props.animate], () => r?.update(false), { deep: true });
watch(() => props.fitKey, () => r?.update(true));

defineExpose({ focus: (lng: number, lat: number, zoom?: number) => r?.focus(lng, lat, zoom), provider });
</script>

<style scoped>
.map-wrap { position: relative; width: 100%; height: 100%; min-height: 360px; }
.map { position: absolute; inset: 0; background: #e9eef2; }
.map.picking { cursor: crosshair; }
.provider { position: absolute; left: 8px; bottom: 6px; background: rgba(255, 255, 255, 0.8); padding: 1px 6px; border-radius: 3px; font-size: 12px; z-index: 5; }
.warn { color: #c0392b; }
.pick-hint { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: #8b1e1e; color: #fff; padding: 3px 10px; border-radius: 12px; font-size: 12px; z-index: 5; }
</style>
