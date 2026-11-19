# 微信小程序（M4，尚未实现）

技术方案：uni-app（Vue 3）。本目录为预留位置，M4 阶段在此初始化 uni-app 工程。

复用方式：

- **类型与 API 客户端**：`@zupu/shared` 中的 `createApiClient(transport)` 与传输层无关，小程序端传入基于 `uni.request` 的适配器即可：

  ```ts
  import { createApiClient } from '@zupu/shared';
  export const api = createApiClient((req) =>
    new Promise((resolve, reject) =>
      uni.request({
        url: BASE_URL + req.url,
        method: req.method,
        data: req.method === 'GET' ? req.params : req.data,
        header: { Authorization: `Bearer ${uni.getStorageSync('zupu_token')}` },
        success: (r) => (r.statusCode < 400 ? resolve(r.data) : reject(r)),
        fail: reject,
      }),
    ),
  );
  ```

- **五代树布局**：`layoutFamilyTree()` 输出节点坐标，小程序端用 Canvas 2D 直接绘制。
- **亲属称谓、字辈推算、重名消歧**：`@zupu/shared` 中的纯函数，前后端一致。
- **微信登录**：后端 `AuthService` 已预留 `wechat_openid / wechat_unionid` 字段，M4 新增 `POST /auth/wechat`（code 换 openid）签发同样的 JWT。
