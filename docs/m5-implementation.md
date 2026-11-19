# M5 实现说明：跨家族连谱、GEDCOM、AI 预留位

总体设计见 [design.md](design.md) 第 9.5、9.6、10 节；扩展约定见 [m1-implementation.md](m1-implementation.md)。

## 1. 跨家族连谱

- 表 `clan_link`（迁移 `1732600000000-M5ClanLinkImportDraft`）：`proposer_clan_id / proposer_person_id` 与 `target_clan_id / target_person_id` 表示"两族谱中的同一人"（如共同始祖、分支祖）。状态 `pending → approved / rejected`，生效后可 `revoked`。两族之间同时只能有一条待处理或已生效的连谱（部分唯一索引）。
- 流程：本族管理员选本族人物、按名称/堂号/郡望查找对方家族（只返回家族公开信息）发起 → 对方家族管理员（或超级管理员，`/super/links`）在**本族**中选定同一人物后同意。双方家族都写操作日志。
- 访问控制（`modules/clan-links`）：
  - 只有连谱双方任一族的族人/管理员或超级管理员能查看已生效连谱；访客、无关家族不能。
  - 对方家族只暴露"连谱支系"：对应人物的祖先、后代及其配偶，排除隐私为"仅管理员"的在世者；在世者出生信息按访客规则隐藏。本族族人在本族一侧不受限。
  - 原有接口的 `clan_id` 隔离不变：不能通过 `/persons/:id`、`/clans/:id/kinship` 访问对方家族数据。
- 共同世系 `GET /clan-links/:id/lineage`：双方对应人物、向上的宗法主线祖先、子女与后代人数，以及两族世代编号差。
- 跨族亲属关系 `GET /clan-links/:id/kinship?from&to`：`CrossClanKinshipAdapter` 读取两族关系图，把对方的对应人物并入本方，对方世代号按对应人物平移后，复用 `@zupu/shared/kinship` 的 `computeKinship`；返回时恢复各族自己的世代号并标注每人所属家族（`personClan`）。单族 `KinshipService` 未改动。

## 2. GEDCOM 5.5.1

- 编解码为纯函数 `modules/gedcom/gedcom.codec.ts`，UTF-8，行长 ≤ 255（CONC/CONT 续行），`@` 转义为 `@@`。
- 自定义标签：`_ZI` 字、`_HAO` 号、`_ZIBEI` 字辈、`_SHIDAI` 世代、`_RANK` 排行、`_ZUJI` 祖籍、`_EXTERNAL` 外姓、`_LIVING` 在世、`_PRIVACY` 隐私；`FAMC` 下 `PEDI` + `_ZPREL heir/jiantiao/adopted`（过继/兼祧/收养）+ `_MAIN N`（出继，非宗法主线）；`FAM` 下 `_MARR_TYPE`（元配/继配/侧室）、`_ORDER`、`_END`。
- 日期：精确日期用标准格式；有原文（如"康熙二十九年"）用 `INT 1690 (康熙二十九年)`；仅原文用 `(原文)`；约数用 `ABT`。
- 接口（仅家族管理员）：`GET /clans/:id/gedcom?rootId=` 导出全族或某人支系；`POST .../gedcom/preview` 上传预览校验（不写库，提示重名同世代的疑似重复、缺失引用、截断、循环关系等）；`POST .../gedcom/import` 上传同一文件确认导入（单事务，写操作日志，刷新亲属关系缓存）。
- 兼容其他软件导出的标准 GEDCOM：`NAME Given /Surname/`、`NOTE @N1@` 引用、`PEDI adopted`、`ABT/BEF/AFT` 等。暂不支持 ANSEL / UTF-16 编码。

## 3. AI 预留位（未实现）

- 表 `import_draft`（来源 ocr/excel/gedcom、状态、文件、识别结果 payload）；`GET /clans/:id/import-drafts` 目前恒为空列表。
- `POST /ai/clans/:id/ocr-import`、`POST /ai/persons/:id/biography` 仍返回 501"敬请期待"；`person.biography_ai_draft` 字段 M1 已就绪。
- Web：家族"导入导出"页的"AI 智能整理"卡片、人物档案页"AI 生成小传（敬请期待）"按钮。

## 4. Web 入口

- 家族首页：`跨族连谱`（族人及以上）、`导入导出`（管理员）。
- 路由：`/clans/:clanId/links`、`/clans/:clanId/gedcom`、`/super/links`（超级管理员"连谱审批"）。
- 前端接口在 `@zupu/shared` 的 `createM5Api`（`packages/shared/src/m5.ts`），Web 端实例为 `apps/web/src/m5-api.ts`。

## 5. 演示数据

基础种子数据之后可运行 `node apps/api/dist/database/seed-m5.js`：新增"衡阳支"（已与湘潭支连谱）与"醴陵支"（待湘潭支审批），管理员账号 `13900000011`、`13900000012`，密码 `admin123`。
