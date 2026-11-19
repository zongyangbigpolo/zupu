// 按需引入 ECharts（地图、迁徙线、时间轴）
import * as echarts from 'echarts/core';
import { CustomChart, EffectScatterChart, LinesChart, MapChart, ScatterChart } from 'echarts/charts';
import { DataZoomComponent, GeoComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  CustomChart,
  EffectScatterChart,
  LinesChart,
  MapChart,
  ScatterChart,
  DataZoomComponent,
  GeoComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

let chinaLoaded: Promise<void> | null = null;

/** 离线中国地图（public/geo/china.json，DataV.GeoAtlas 省级边界，含南海诸岛） */
export function ensureChinaMap(): Promise<void> {
  chinaLoaded ??= fetch('/geo/china.json')
    .then((r) => r.json())
    .then((geo) => echarts.registerMap('china', geo));
  return chinaLoaded;
}

export { echarts };
