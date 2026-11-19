# 族谱微信小程序（uni-app + Vue 3）

功能：微信一键登录（手机号绑定已有账号）/ 手机号密码登录、家族列表与首页、族人搜索、人物档案、**五代树**（Canvas 2D，拖动、双指缩放、点击换中心）、**亲属关系查询**、我在谱中、族人通讯录、活动与公告（报名、签到）、生日忌日提醒（农历）、消息中心。

```bash
npm run build:shared                       # 在仓库根目录：先构建 @zupu/shared
cd apps/miniapp && npm install             # 独立安装（不在根 workspaces 中）
npm run dev:h5                             # 浏览器预览，/api 代理到 API_URL（默认 http://localhost:3000）
VITE_API_BASE=https://你的域名/api npm run build:mp-weixin   # 用微信开发者工具导入 dist/build/mp-weixin
npm run type-check
```

页面位于 `src/pages`，API 客户端见 `src/api.ts`（`uni.request` 适配 `@zupu/shared` 的 `createApiClient` / `createInteractionApi`）。

上线前需要完成的事项（AppID、备案域名、类目、订阅消息模板、隐私指引等）见 [docs/m4-implementation.md](../../docs/m4-implementation.md#4-发布小程序需要您完成的事项)。
