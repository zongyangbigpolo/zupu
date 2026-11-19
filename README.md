# 族谱 · 多家族族谱平台

一个支持多个家族共用的在线族谱系统：网页登录查看（小程序端在后续版本提供）。当前为 **M1 基础版**。

> 设计方案见 [docs/design.md](docs/design.md)；M1 实现说明与后续扩展约定见 [docs/m1-implementation.md](docs/m1-implementation.md)；M2（内容与传承）见 [docs/m2-implementation.md](docs/m2-implementation.md)。
> M4（微信小程序、通讯录、活动通知、生日忌日提醒）及小程序上线指南见 [docs/m4-implementation.md](docs/m4-implementation.md)。

## M1 功能

| 功能 | 说明 |
|---|---|
| 两级管理 | **平台超级管理员**创建/停用家族，按手机号任命、更换、撤销**家族管理员**；家族管理员只能看到并管理自己的家族。所有接口按 `clan_id` 隔离 |
| 成员档案 | 姓名、字、号、昵称、性别、世代、字辈、排行、生卒（日期 + 精度 + 原文，如"康熙三十年"）、祖籍、出生地、葬地、职业、生平（富文本）、事迹、照片/视频/音频 |
| 关系录入 | 父母子女（亲生/收养/过继/兼祧 + 宗法主线标记，生父一支为"出继"）、婚姻（元配/继配/侧室）；女儿后代可入谱 |
| **五代树** | 以任意人物为中心：上 5 代祖先、下 5 代后代、配偶并列；男女配色、在世标识；缩放、拖拽、悬停简介、点击换中心、导出图片；可切换"宗法主线 / 生父线" |
| **亲属关系查询** | 任意两人：双向称谓、辈分差、共同祖先、关系路径（树上高亮 + "人"字形路径图） |
| **我在谱中** | 族人账号绑定谱中人物；首页"以我为中心"；浏览任何人显示"他是我的XX" |
| **字辈推算** | 按字辈诗与父母世代自动推算世代/字辈，并校验世代、字辈、名字是否一致 |
| **重名消歧** | 搜索结果显示"第N世·父XX·行二"，同名标"重名" |
| 隐私 | 在世者出生日期、生平等仅族人可见，访客只看姓名与世系 |
| 操作日志 | 管理员每次修改、超级管理员每次任免都留痕 |
| AI（预留） | 纸质谱拍照识别导入、AI 生成小传：接口与入口已预留，显示"敬请期待" |

## 技术栈

- 后端：NestJS 11 + TypeORM + PostgreSQL 16（`WITH RECURSIVE` 递归查询）
- Web：Vue 3 + Vite + Element Plus + AntV G6 5
- 共享包 `@zupu/shared`：类型、API 客户端、亲属称谓计算（基于 [relationship.js](https://github.com/mumuy/relationship)，MIT）、字辈规则、五代树布局（Web 与小程序共用）
- 部署：Docker Compose（Nginx + API + PostgreSQL），对象存储支持本地磁盘 / 腾讯云 COS / 阿里云 OSS / MinIO

```
apps/api        NestJS 后端
apps/web        Vue 3 网页端
apps/miniapp    微信小程序（M4 预留）
packages/shared 共享代码
docs/           设计文档
```

## 快速开始

### 方式一：Docker（推荐）

```bash
cp .env.example .env              # 按需修改密码、JWT_SECRET
docker compose up -d --build
docker compose exec api node dist/database/seed.js   # 导入示例数据（可选）
```

打开 <http://localhost:8080>。

### 方式二：本地开发

需要 Node.js ≥ 20、PostgreSQL ≥ 14。

```bash
npm install
createdb zupu
npm run build:shared                      # 构建共享包（修改 packages/shared 后需重新构建）
npm run build -w @zupu/api
npm run db:seed                           # 执行迁移 + 导入示例数据；加 -- --reset 可清空重建
npm run dev:api                           # http://localhost:3000/api
npm run dev:web                           # http://localhost:5173 （已代理 /api）
```

数据库连接默认 `postgres://localhost:5432/zupu`，可用环境变量 `DATABASE_URL` 修改。API 启动时会自动执行迁移。

### 演示账号（示例数据）

| 身份 | 手机号 | 密码 |
|---|---|---|
| 平台超级管理员 | 13800000000 | admin123 |
| 李氏家族管理员 | 13900000001 | admin123 |
| 李氏族人（已绑定"我在谱中"） | 13900000002 | member123 |
| 王氏家族管理员 | 13900000003 | admin123 |

示例家族"陇西堂李氏·湘潭支"为虚构数据：13 代、约 270 人，包含继配、过继（出继）、兼祧、女儿外嫁后代入谱、在世成员、重名人物等情形；"太原堂王氏"为私密家族，用于演示多家族隔离。

## 测试

```bash
npm test                     # 共享包单元测试 + API 端到端测试
```

- `packages/shared/test`：亲属称谓、族亲规则、字辈推算、重名消歧单元测试
- `apps/api/test`：基于示例数据的端到端测试（认证、家族隔离、超级管理员任免、五代树、亲属关系、字辈校验、上传等），使用数据库 `zupu_test`（`createdb zupu_test`，或设置 `TEST_DATABASE_URL`）

## 主要接口

| 接口 | 说明 |
|---|---|
| `POST /api/auth/login` · `POST /api/auth/register` | 手机号/邮箱 + 密码登录；注册（若手机号已被预先任命，注册后自动获得权限） |
| `GET /api/clans` · `GET /api/clans/:id` | 我可见的家族 / 家族详情（含我的角色与"我在谱中"） |
| `GET /api/clans/:id/persons?q=&generation=&generationChar=` | 搜索（含重名消歧） |
| `GET /api/persons/:id/tree?up=5&down=5&line=main\|birth` | 五代树 |
| `GET /api/clans/:id/kinship?from=A&to=B` | 两人亲属关系 |
| `POST /api/clans/:id/generation-check` | 字辈推算与校验 |
| `POST /api/clans/:id/persons` · `PATCH/DELETE /api/persons/:id` | 成员增改删（家族管理员） |
| `POST /api/clans/:id/parent-child` · `POST /api/clans/:id/marriages` | 亲子 / 婚姻关系 |
| `POST /api/persons/:id/media` | 上传照片/视频/音频（multipart，字段 `file`） |
| `GET/POST/PATCH /api/admin/clans` · `POST/PUT/DELETE /api/admin/clans/:id/admins` | 超级管理员：家族管理、任命/更换/撤销管理员 |
| `GET /api/admin/audit-logs` · `GET /api/clans/:id/audit-logs` | 操作日志 |

## 部署到国内云

1. 购买云服务器（腾讯云 / 阿里云），安装 Docker；域名完成 ICP 备案并配置 HTTPS（可在服务器上再加一层 Nginx/Caddy 终止 TLS，转发到 `WEB_PORT`）。
2. 生产环境务必修改 `.env` 中的 `DB_PASSWORD`、`JWT_SECRET`。
3. 媒体建议使用对象存储：`.env` 中设 `STORAGE_DRIVER=s3` 并填写 COS/OSS 的 `S3_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、密钥；`S3_PUBLIC_ENDPOINT` 填写 CDN 域名可让浏览器直连签名地址，留空则经 API 代理。
4. 数据库备份：`docker compose exec db pg_dump -U zupu zupu > backup.sql`（建议配置每日定时任务）。
5. 首个超级管理员：示例数据自带；不导入示例数据时，可在数据库中把某个已注册用户的 `app_user.is_super_admin` 置为 `true`。
