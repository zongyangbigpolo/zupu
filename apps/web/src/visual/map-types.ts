// 地图组件数据（坐标 GCJ-02）
export interface MapMarker {
  id: string;
  name: string;
  lng: number;
  lat: number;
  color?: string;
  size?: number;
}
export interface MapRoute {
  id: string;
  from: [number, number];
  to: [number, number];
  color: string;
  label?: string;
  highlight?: boolean;
}
