# M2 内容与传承：实现说明

总体设计以 [design.md](design.md) 为准，扩展约定见 [m1-implementation.md](m1-implementation.md)。M2 全部后端代码在 `apps/api/src/modules/heritage/`（一个 `HeritageModule`），前端在 `apps/web/src/heritage/`，共享类型与客户端在 `packages/shared/src/heritage.ts`（`createHeritageApi`）。

## 1. 数据库（迁移 `1732610000000-M2Heritage`，排在 M5 迁移之后）

| 表 | 说明 |
|---|---|
| `media`（新增列） | `width/height`、`category`（`gallery` 相册 / `oral_history` 口述历史录音）、`taken_text`、`description`、`sort_order`、`transcode_status` |
| `oral_history` | 口述历史：标题、讲述人、录制时间、文字整理稿，可关联一条音频/视频 `media` |
| `memorial_message` | 纪念馆留言 |
| `memorial_tribute` | 献花 / 点烛；`UNIQUE(person, user, kind, tribute_day)` → 每人每天各一次 |
| `clan_document` | 家训、家规、谱序、凡例（富文本 + `vertical` 竖排） |
| `import_batch` | Excel 导入批次（预览行 + 校验结果，提交后标记 `committed`）。AI OCR 草稿用 M5 的 `import_draft` 表 |
| `backup_job` | 备份记录 |

M1 的 `MediaEntity` 未改动；新增列由 gallery 模块用原生 SQL 读写。

## 2. 接口

| 功能 | 接口 | 权限 |
|---|---|---|
| 相册 | `POST /persons/:id/gallery`（multipart，自动缩略图/尺寸）、`GET /persons/:id/gallery`、`GET /clans/:id/gallery`、`PATCH/DELETE /gallery/:id`、`GET /gallery/:id/thumb`（签名） | 写：家族管理员；读：可见敏感信息者（与 M1 档案一致） |
| 口述历史 | `POST /persons/:id/oral-histories`（音频可选，可仅文字稿）、`GET /persons/:id/oral-histories`、`GET /clans/:id/oral-histories?q=`、`PATCH/DELETE /oral-histories/:id` | 同上 |
| 纪念馆 | `GET /persons/:id/memorial`；`GET/POST /persons/:id/memorial/messages`；`DELETE /memorial-messages/:id`；`POST /persons/:id/memorial/tributes` | 访客可看纪念馆（不含留言）；留言/献花/点烛需本族族人；删除：作者本人或管理员（管理员删除写审计） |
| 家族文献 | `GET/POST /clans/:id/documents`、`GET/PATCH/DELETE /documents/:id` | 读：可访问该族谱者；写：家族管理员 |
| 统计看板 | `GET /clans/:id/dashboard` | 可访问该族谱者 |
| 高级搜索 | `GET /clans/:id/advanced-search?q&generationChar&generationFrom&generationTo&gender&living&region&birthYearFrom/To&deathYearFrom/To&includeExternal&sort` | 同上；出生地、出生年仅在当前角色可见时参与匹配，防止借搜索推断在世者隐私 |
| Excel 导入 | `GET /clans/:id/import/template`、`POST /clans/:id/import/preview`、`GET/DELETE /import-batches/:id`、`POST /import-batches/:id/commit` | 家族管理员 |
| 导出 | `GET /clans/:id/export?format=xlsx\|json` | 家族管理员（写审计） |
| 备份 | `GET/POST /admin/backups`、`GET /admin/backups/:id/download` | 超级管理员 |

所有接口经 `AccessService` 按 `clan_id` 隔离；跨族访问返回 403/404。

## 3. 关键实现

- **缩略图**：`sharp` 读取 EXIF 方向与尺寸，生成 400px JPEG 缩略图（`THUMB_SIZE`）；未安装 sharp 时降级为无缩略图。缩略图签名复用 `StorageService` 的 HMAC（作用域 `thumb:<id>`）；S3/COS 配置公网地址时直接返回预签名链接。
- **音视频**：时长、画面尺寸由浏览器读取元数据后随上传提交；转码为预留能力（`transcode_status = skipped`）。配置 `FFMPEG_PATH` 后为视频截取封面。
- **录音**：网页端用 `MediaRecorder`（需 HTTPS 与麦克风权限）录制，支持暂停/继续、试听、重录；服务端接受 `audio/webm;codecs=opus` 等带参数的 MIME。
- **Excel 导入**：模板列见 `IMPORT_COLUMNS`。父亲/母亲/配偶可引用本表编号、谱中人物 ID 或谱中唯一姓名（挂接现有世系）。校验：必填、重复编号、性别/日期/布尔格式、引用不存在、同名歧义、父子循环、配偶性别；按父系递推世代，按字辈诗推算/校验字辈（复用 M1 `checkGeneration`）。有错误行不可提交；提醒不阻止。提交在单事务中完成，结束后失效亲属关系缓存。导出的 Excel"成员"表与模板同格式，可回导（已存在的 ID 自动跳过）。
- **备份**：进程内定时器每天 `BACKUP_DAILY_AT` 执行，`pg_try_advisory_lock` 防多实例重复；`pg_dump --format=custom` 优先，不可用时导出 gzip JSON 快照；文件存对象存储 `backups/`，超过 `BACKUP_KEEP_DAYS` 自动清理。Docker 镜像已安装 `postgresql16-client`。媒体文件本身请依赖 COS/OSS 的版本控制/跨区域复制。
- **竖排**：CSS `writing-mode: vertical-rl`，从右至左阅读，带朱丝栏背景。

## 4. AI 预留（未实现）

口述历史"AI 转写"、导入页"拍照识别导入（AI）"按钮均为"敬请期待"占位，归 M5。

## 5. 测试

`apps/api/test/heritage.spec.ts`（18 个 e2e 用例）覆盖上述接口的权限、隔离与核心逻辑。为避免与其他会话共用测试库，可用 `TEST_DATABASE_URL` 指定独立数据库。
