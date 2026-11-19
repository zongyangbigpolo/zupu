// 内置常用地名坐标（GCJ-02，近似到县/镇级），用于未配置地图 key 时快速填写坐标。
// 配置高德/腾讯地图后可直接用其地理编码服务，这里只是离线兜底。

export interface GazetteerEntry {
  name: string;
  lng: number;
  lat: number;
}

export const GAZETTEER: GazetteerEntry[] = [
  { name: '北京', lng: 116.4074, lat: 39.9042 },
  { name: '天津', lng: 117.2009, lat: 39.0842 },
  { name: '上海', lng: 121.4737, lat: 31.2304 },
  { name: '重庆', lng: 106.5516, lat: 29.563 },
  { name: '石家庄', lng: 114.5149, lat: 38.0428 },
  { name: '太原', lng: 112.5489, lat: 37.8706 },
  { name: '洪洞', lng: 111.6745, lat: 36.2537 },
  { name: '呼和浩特', lng: 111.7519, lat: 40.8415 },
  { name: '沈阳', lng: 123.4315, lat: 41.8057 },
  { name: '长春', lng: 125.3245, lat: 43.8868 },
  { name: '哈尔滨', lng: 126.535, lat: 45.8038 },
  { name: '南京', lng: 118.7969, lat: 32.0603 },
  { name: '苏州', lng: 120.5853, lat: 31.2989 },
  { name: '杭州', lng: 120.1551, lat: 30.2741 },
  { name: '合肥', lng: 117.2272, lat: 31.8206 },
  { name: '徽州', lng: 118.3375, lat: 29.7146 },
  { name: '福州', lng: 119.2965, lat: 26.0745 },
  { name: '泉州', lng: 118.6759, lat: 24.8741 },
  { name: '宁化石壁', lng: 116.5, lat: 26.27 },
  { name: '南昌', lng: 115.8579, lat: 28.6829 },
  { name: '吉安', lng: 114.9927, lat: 27.1138 },
  { name: '泰和', lng: 114.9083, lat: 26.7905 },
  { name: '瓦屑坝', lng: 116.47, lat: 29.0 },
  { name: '济南', lng: 117.1201, lat: 36.6512 },
  { name: '青岛', lng: 120.3826, lat: 36.0671 },
  { name: '郑州', lng: 113.6254, lat: 34.7466 },
  { name: '开封', lng: 114.3075, lat: 34.7972 },
  { name: '洛阳', lng: 112.454, lat: 34.6197 },
  { name: '固始', lng: 115.6543, lat: 32.1683 },
  { name: '武汉', lng: 114.3055, lat: 30.5928 },
  { name: '汉口', lng: 114.2833, lat: 30.5866 },
  { name: '麻城', lng: 115.0083, lat: 31.1732 },
  { name: '长沙', lng: 112.9388, lat: 28.2282 },
  { name: '湘潭', lng: 112.9445, lat: 27.8297 },
  { name: '湘潭县白石铺', lng: 112.7342, lat: 27.6316 },
  { name: '湘潭县花石镇', lng: 112.5846, lat: 27.5518 },
  { name: '湘潭县易俗河', lng: 112.9614, lat: 27.7736 },
  { name: '湘乡', lng: 112.5357, lat: 27.7346 },
  { name: '衡山', lng: 112.8686, lat: 27.2306 },
  { name: '衡阳', lng: 112.572, lat: 26.8932 },
  { name: '广州', lng: 113.2644, lat: 23.1291 },
  { name: '深圳', lng: 114.0579, lat: 22.5431 },
  { name: '梅州', lng: 116.1225, lat: 24.2886 },
  { name: '南宁', lng: 108.3669, lat: 22.817 },
  { name: '海口', lng: 110.1999, lat: 20.044 },
  { name: '成都', lng: 104.0665, lat: 30.5723 },
  { name: '贵阳', lng: 106.6302, lat: 26.6477 },
  { name: '昆明', lng: 102.8329, lat: 24.8801 },
  { name: '拉萨', lng: 91.1409, lat: 29.6456 },
  { name: '西安', lng: 108.9402, lat: 34.3416 },
  { name: '兰州', lng: 103.8343, lat: 36.0611 },
  { name: '陇西', lng: 104.6345, lat: 35.0035 },
  { name: '西宁', lng: 101.7782, lat: 36.6171 },
  { name: '银川', lng: 106.2309, lat: 38.4872 },
  { name: '乌鲁木齐', lng: 87.6168, lat: 43.8256 },
  { name: '台北', lng: 121.5654, lat: 25.033 },
  { name: '香港', lng: 114.1694, lat: 22.3193 },
  { name: '澳门', lng: 113.5439, lat: 22.1987 },
];

/** 按名称模糊查找：完全匹配 > 地名包含词条（取最具体者）> 词条包含地名 */
export function lookupPlace(name: string | null | undefined): GazetteerEntry | null {
  const q = (name ?? '').trim();
  if (!q) return null;
  const exact = GAZETTEER.find((g) => g.name === q);
  if (exact) return exact;
  // 地名由大到小书写（省→府→县→镇），取在原文中位置最靠后者，同位置取较长者
  const contained = GAZETTEER.filter((g) => q.includes(g.name)).sort(
    (a, b) => q.lastIndexOf(b.name) + b.name.length - (q.lastIndexOf(a.name) + a.name.length) || b.name.length - a.name.length,
  );
  if (contained.length) return contained[0];
  return GAZETTEER.find((g) => g.name.includes(q)) ?? null;
}
