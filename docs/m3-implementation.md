# M3 可视化实现说明

总体设计见 [design.md](design.md) 第 9.3 节；M1 扩展约定见 [m1-implementation.md](m1-implementation.md)。

## 1. 结构

| 位置 | 内容 |
|---|---|
| `apps/api/src/modules/visual/` | `VisualModule`：迁徙、地点、时间轴/大事记、吊线谱与 PDF、地图配置 |
| `apps/api/src/entities/visual.ts` · `migrations/1732620000000-Visualization.ts` | 表 `migration_record`、`site`、`site_person`、`site_photo`、`clan_chronicle` |
| `apps/api/src/database/seed-visual.ts` | 示例迁徙、祠堂/祖坟/祖屋、大事记 |
| `packages/shared/src/visual.ts` | 类型与 `createVisualApi()`（Web/小程序共用） |
| `packages/shared/src/history-data.ts` | 内置朝代、明清年号、历史大事；`reignOf / ganzhiOf / eraLabel` |
| `packages/shared/src/gazetteer.ts` | 内置常用地名坐标（离线兜底） |
| `packages/shared/src/pedigree-layout.ts` | 吊线谱布局纯函数（Web SVG 与 PDF 共用坐标） |
| `apps/web/src/visual/` | 迁徙地图、地点、时间轴、吊线谱页面与 `MapCanvas` 地图组件 |
| `apps/web/public/geo/china.json` | 离线中国省级地图（DataV.GeoAtlas，含南海诸岛与九段线） |

## 2. 接口

| 接口 | 权限 |
|---|---|
| `GET /api/maps/config` | 公开；返回 `amap / tencent / offline` 及 key |
| `GET /api/clans/:id/migrations?branchRootId=&personId=` | 可看该族即可 |
| `POST /api/clans/:id/migrations` · `PATCH/DELETE /api/migrations/:id` | 家族管理员 |
| `GET /api/clans/:id/sites?type=` · `GET /api/sites/:id` | 可看该族即可 |
| `POST /api/clans/:id/sites` · `PATCH/DELETE /api/sites/:id` · `POST /api/sites/:id/photos` · `DELETE /api/site-photos/:id` | 家族管理员 |
| `GET /api/site-photos/:id/file?exp&sig` | 签名地址（与人物媒体同一签名算法） |
| `GET /api/clans/:id/timeline?branchRootId=&personId=&lifeSpans=` | 可看该族即可 |
| `GET /api/clans/:id/chronicles` · `POST` · `PATCH/DELETE /api/chronicles/:id` | 读：可看该族；写：家族管理员 |
| `GET /api/clans/:id/pedigree?rootId&generations&daughters` | 可看该族即可 |
| `GET /api/clans/:id/pedigree.pdf?...&style=ou\|su&paper=A4\|A3&cover=` | 可看该族即可 |

隔离与权限：全部经 `AccessService.clanAccess`；关联人物（迁徙人、地点关联人物、大事记人物、筛选用的 `branchRootId/personId`、吊线谱 `rootId`）均经 `assertPersonsInClan` 校验属于本族；写操作写 `AuditService`。
隐私：与在世/非公开人物相关的迁徙、事迹、生卒按 `canSeeSensitive` 过滤；吊线谱对访客隐藏在世者出生信息。

## 3. 地图

- 坐标统一 **GCJ-02**（高德、腾讯同一坐标系）。
- `MAP_PROVIDER` + `AMAP_KEY`/`AMAP_SECURITY_CODE`（高德 JS API 2.0）或 `TMAP_KEY`（腾讯地图 GL）。未配置或脚本加载失败时，`MapCanvas` 自动退回 ECharts 离线中国地图，开发与测试无需 key。
- 一键导航：`navigationLinks()` 生成 `uri.amap.com/navigation` 与 `apis.map.qq.com/uri/v1/routeplan` 链接，手机端可唤起 App。
- 录入坐标：内置常用地名填充、或在地图上点选；配置地图 key 后可再接入地理编码（未实现）。

## 4. 时间轴

后端合并家族大事记、人物事迹（`life_event`，M2 提供 CRUD）、迁徙记录；按人物/支系筛选时另加生卒。前端叠加内置朝代色带与历史大事（只取家族年代前后），列表按朝代分组，显示年号与干支。

## 5. 吊线谱与 PDF

- 数据：从 `rootId` 沿宗法主线（`is_main_line`）向下取 N 世，每人只出现一次（兼祧子挂第一房），可选不收女儿。
- 布局（`layoutPedigree`）：每人一组竖排文字列（名字 + 小注），子女在父母下方由吊线相连；同辈长者居右、整体自右向左。
  - **欧式**：世代分栏，五世一表，上一表末世为下一表首世（标"下接"），名旁小注排行、字号、生卒、葬地、配偶。
  - **苏式**：不分栏，吊线垂珠，名旁仅注排行与配偶；PDF 中若一图过高会自动按纸张高度分表。
- PDF（pdfkit）：A4/A3 横向，红色双线版框 + 版心书名/篇名、页码；封面题签；卷首依次为谱序、凡例、家训、族规（读取 M2 的 `clan_document` 表，按 `kind` 排序）与字辈；世系图按页宽自右向左分页，尽量不切断人物。
- 中文字体：`PDF_FONT_PATH`（TTC 另设 `PDF_FONT_FAMILY`）优先，否则自动在系统字体目录查找思源/Noto CJK、宋体等。API Docker 镜像安装 `font-noto-cjk`。找不到字体时接口返回 503。

## 6. 已知限制

- 离线地图只有省级边界，无街道底图；精确定位与导航需配置高德/腾讯 key。
- 年号换算只覆盖明清与民国；更早朝代显示朝代与干支。
- 吊线谱非常宽时（单代数百人）PDF 页数较多；可缩小世代范围或从支祖起分卷导出。
