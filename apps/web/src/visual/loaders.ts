// 国内地图 JS API 按需加载：高德 JS API 2.0 / 腾讯地图 GL JS
declare global {
  interface Window {
    AMap?: any;
    TMap?: any;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

const cache = new Map<string, Promise<void>>();
function script(src: string): Promise<void> {
  if (!cache.has(src))
    cache.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          cache.delete(src);
          reject(new Error('地图脚本加载失败'));
        };
        document.head.appendChild(s);
      }),
    );
  return cache.get(src)!;
}

export async function loadAmap(key: string, securityJsCode: string | null) {
  if (securityJsCode) window._AMapSecurityConfig = { securityJsCode };
  await script(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.MoveAnimation,AMap.Scale,AMap.ToolBar`);
  return window.AMap;
}

export async function loadTencent(key: string) {
  await script(`https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`);
  return window.TMap;
}
