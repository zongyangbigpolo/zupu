# M1 实现说明与扩展约定

本文记录 M1 的实现取舍，以及 M2–M5 并行开发时需要遵守的扩展点。总体设计以 [design.md](design.md) 为准。

## 1. 亲属关系计算

实现位于 `packages/shared/src/kinship`，前后端共用；后端 `GET /clans/:id/kinship` 使用每个家族一份的内存关系图（`KinshipCache`，任何人员/关系写操作后失效）。

1. **找路径**：在"父母—子女—配偶"图上做加权最短路径（Dijkstra）。血缘边权 1，非主线（如出继后的生父）1.3，婚姻边 1.5；外姓父母 +0.01，使共同祖先优先取本族人。
2. **共同祖先 / 代数**：纯血缘路径为"先上 m 步、再下 n 步"，第 m 个节点即最近共同祖先（LCA）。
3. **转称谓链**："父→子"相邻的上下步合并为兄弟姐妹，按排行（同性别）或出生日期区分"哥哥/弟弟、姐姐/妹妹"；长幼未知时用"兄弟/姐妹"。
4. **标准称谓**：把链（如 `爸爸的哥哥的儿子`）交给 [relationship.js](https://github.com/mumuy/relationship)（MIT，npm `relationship.js@1.2.9`）得到双向称谓，并按长幼从候选中取舍（如 堂哥/堂弟）。
5. **库覆盖不到时**：
   - 出五服（双方距共同祖先均 ≥ 5 代）且路径全为男性：按规则生成"族兄 / 族叔 / 族伯祖 / 族侄孙"等；
   - 远代直系：relationship.js 已支持到"天祖 / 烈祖 / 始祖 / 来孙"等，更远时生成"N世祖 / N世孙"；
   - 其他情况：只给出文字链（如"父亲的妹妹的儿子的妻子"）与辈分差。
6. **辈分差**：同族双方都有世代号时取世代差，否则取路径上的层级差。

**为什么用 relationship.js**：MIT 许可、持续维护、覆盖父系/母系/堂表/姻亲等数百种称谓与双向称呼；我们只负责把族谱图转换成它的输入。它对 5 代以上的旁系族亲（如"五从兄弟"）不再给出称谓，这部分由上面的族亲规则补齐。

## 2. 五代树

- `GET /persons/:id/tree?up&down&line`：两条 `WITH RECURSIVE` 分别取祖先与后代（带环检测、深度上限 10、后代节点上限 3000），再一次取出配偶与节点间的边。
- `line=main` 只走 `is_main_line` 的亲子关系（过继子挂在嗣父下）；`line=birth` 优先走亲生关系。
- 布局算法在 `packages/shared/src/tree-layout.ts`（纯函数，输出坐标），Web 端用 AntV G6 渲染；小程序可直接复用坐标用 Canvas 绘制。

## 3. 权限与隔离

- 所有按家族访问的接口统一经过 `AccessService.clanAccess / personAccess`，返回有效角色：`super > admin > member > visitor`。
- 跨实体写操作（建立亲子/婚姻、绑定"我在谱中"）经 `assertPersonsInClan` 校验双方都在本族。
- 停用的家族对除超级管理员外的所有人不可见（404）。
- 隐私：`canSeeSensitive()` 决定是否隐藏在世者出生信息、生平等字段，并在响应中返回 `hiddenFields`。

## 4. 给 M2–M5 的扩展点

| 方向 | 扩展方式 |
|---|---|
| 数据库 | 在 `apps/api/src/database/migrations` **新增**迁移文件并注册到 `data-source.ts`；不要修改已发布的迁移。实体放在 `src/entities`（或模块内）并加入 `ENTITIES` |
| 新模块 | `apps/api/src/modules/<feature>/`，在 `app.module.ts` 注册；权限一律调用 `AccessService`，写操作一律调用 `AuditService.log()` |
| 媒体（M2） | `media` 表已有 `thumbnail_key`、`duration` 字段；`StorageService.driver` 抽象了本地 / S3（COS、OSS、MinIO） |
| 统计看板（M2） | `GET /clans/:id/stats` 已有基础计数，可扩展 |
| Excel 导入 / AI OCR（M2/M5） | `POST /ai/clans/:id/ocr-import` 占位返回 501；届时新增 `import_draft` 表 |
| AI 小传（M5） | `person.biography_ai_draft` 字段与 `POST /ai/persons/:id/biography` 占位已就绪 |
| 微信登录（M4） | `app_user.wechat_openid / wechat_unionid` 已建；在 `AuthService` 增加 `loginWithWechat()` 并签发同样的 JWT（payload `via: 'wechat'`） |
| 小程序（M4） | `apps/miniapp` 用 uni-app 初始化；复用 `@zupu/shared` 的 `createApiClient`（传入 `uni.request` 适配器）、类型、称谓计算与树布局 |
| 跨家族连谱（M5） | 亲属计算基于 `KinshipGraph`，可把两族的图合并后复用 `computeKinship` |
| 共享类型 | 新接口的请求/响应类型加到 `packages/shared/src/types.ts`，客户端方法加到 `api-client.ts` |

## 5. 已知限制

- 农历日期与朝代年号目前作为"原文"字段存储，未做自动换算。
- 五代树在单层后代非常多时（数百人）横向较宽，可用缩放/拖拽查看；按层折叠、懒加载留待后续优化。
- 视频/音频仅做存储与播放，未转码（M2）。
