# M4 小程序与互动：实现说明与上线指南

总体设计以 [design.md](design.md) 为准；本文记录 M4 的实现、接口与**小程序上线需要您完成的事项**。

## 1. 功能概览

| 功能 | Web | 小程序 | 说明 |
|---|---|---|---|
| 微信登录 | — | ✅ | `wx.login` → 后端 code2session；未绑定时用「微信手机号快捷绑定」或「手机号 + 密码 / 激活码」绑定已有账号（按手机号合并）；原手机号+密码登录、激活码激活均保留 |
| 族谱浏览 | ✅ | ✅ | 家族列表、家族首页（堂号、字辈诗、简介）、族人搜索（重名消歧）、人物档案 |
| 五代树 | ✅ | ✅ | 小程序用 Canvas 2D 绘制（复用 `layoutFamilyTree`），单指拖动、双指缩放、点击人物换中心、后退、主线/生父线切换 |
| 亲属关系查询 | ✅ | ✅ | 选两人 → 双向称谓、辈分、共同祖先、关系链与路径 |
| 我在谱中 | ✅ | ✅ | 首页"以我为中心看五代树"，人物页"他是我的谁" |
| 族人通讯录 | ✅ | ✅ | 仅本族已登录族人可见；每人自行设置每个字段的可见范围（族人可见 / 仅管理员 / 仅自己） |
| 活动与公告 | ✅ 发布、管理 | ✅ 查看、报名、签到 | 清明祭祖 / 修谱 / 宗亲会 / 其他；报名（含同行人数、名额上限、截止时间）、签到码自助签到、管理员代签到、取消活动 |
| 生日 / 忌日提醒 | ✅ | ✅ | 支持农历（含闰月、小月三十）；站内通知 + 微信订阅消息；每日定时任务 |
| 纪念馆 / 地图 / 统计 | M2/M3 | 入口占位 | 小程序首页显示入口，点击提示"敬请期待" |

## 2. 后端模块与接口

均在 `apps/api/src/modules/` 下新建；表结构见迁移 `1732630000000-Interaction.ts`，实体在 `src/entities/interaction.ts`。所有按家族访问的接口都经过 `AccessService`，写操作写审计日志。

| 模块 | 接口 | 权限 |
|---|---|---|
| `wechat` | `POST /auth/wechat/login` `{code}` → `{status:'ok', token, user}` 或 `{status:'need_bind', bindToken}` | 公开 |
| | `POST /auth/wechat/bind` `{bindToken, phoneCode}` 或 `{bindToken, phone, password[, activationCode]}` | 绑定令牌（独立密钥签发，15 分钟，不能当登录令牌用） |
| | `POST /auth/wechat/bind-current` `{code}`、`DELETE /auth/wechat` | 登录 |
| | `GET /wechat/config`（订阅消息模板 ID）、`POST /wechat/subscriptions` `{templateIds}` | 公开 / 登录 |
| `contacts` | `GET /clans/:id/contacts`、`GET/PUT /clans/:id/contacts/me` | 本族成员（含管理员）；非本族的超级管理员也不可见 |
| `activities` | `GET/POST /clans/:id/activities`、`GET/PATCH/DELETE /activities/:id` | 查看：族人；发布/修改/删除：家族管理员 |
| | `POST/DELETE /activities/:id/signup`、`POST /activities/:id/checkin` `{code}` | 本族成员 |
| | `POST /activities/:id/signups/:userId/checkin` | 家族管理员 |
| `reminders` | `GET /clans/:id/reminders/upcoming?days=30` | 族人（隐私级别"仅管理员"的人物只对管理员显示） |
| | `GET /persons/:id/reminder-dates`、`PUT/DELETE /persons/:id/reminder-dates/:kind` | 查看：族人；设置：管理员 |
| | `GET/PUT /clans/:id/reminder-pref` | 本族成员 |
| | `POST /admin/reminders/run` `{date?}` | 超级管理员（手动触发，测试/补发用） |
| `notifications` | `GET /notifications`、`GET /notifications/unread-count`、`POST /notifications/:id/read`、`POST /notifications/read-all` | 仅本人 |

### 提醒规则

- **纪念日来源**：管理员设定的日期（公历/农历、闰月、年份）优先；否则取人物档案中精确到"日"的公历生日/卒日。
- **生日只提醒在世者，忌日只提醒已故者**。农历闰月出生：当年有该闰月则过闰月，否则过正常月份；小月没有三十按廿九。
- **何时提醒**：每位族人可设"提前 N 天"（0–7），在提前 N 天与当天各提醒一次；已报名活动在开始前一天提醒。
- **定时任务**：API 进程内每 10 分钟检查一次，北京时间 `REMINDER_HOUR`（默认 8 点）后当天执行一次；通知按去重键写入，重复执行/多实例部署都不会重复提醒。`REMINDER_SCHEDULER=off` 可关闭。
- **微信订阅消息**：小程序是"一次性订阅"——用户每点一次同意，后端可发一条。小程序在"报名活动"、"订阅提醒"时请求授权，后端记录额度（`wechat_subscription`），发送时扣减，失败退还。

### 模拟模式（开发 / 测试）

未配置 `WECHAT_APPID` 且 `NODE_ENV≠production` 时自动启用（也可 `WECHAT_MOCK=true`）：

- `code2session`：openid = `mock-<code>`；
- 手机号授权：`phoneCode` 形如 `mock-phone-13900000002`；
- 订阅消息只写日志，不访问微信服务器。

**生产环境不会自动进入模拟模式**；未配置 AppID 时微信登录接口返回 503。

## 3. 小程序工程（apps/miniapp）

- uni-app 3（Vue 3 + TypeScript），独立 `package.json` / `package-lock.json`（不在根 workspaces 中，避免与 Web 端 Vite 版本冲突），通过 `file:../../packages/shared` 复用 `@zupu/shared` 的类型、API 客户端、字辈与树布局。
- 构建：

  ```bash
  npm run build:shared                 # 先构建共享包
  cd apps/miniapp && npm install
  VITE_API_BASE=https://你的域名/api npm run build:mp-weixin   # 产物 dist/build/mp-weixin
  npm run build:h5                     # H5 产物 dist/build/h5（可选）
  npm run dev:h5                       # 本地预览（代理 /api 到 API_URL，默认 http://localhost:3000）
  ```

- 用微信开发者工具「导入项目」选择 `apps/miniapp/dist/build/mp-weixin`，AppID 填您的小程序 AppID（或修改 `src/manifest.json` 中 `mp-weixin.appid`）。

## 4. 发布小程序：需要您完成的事项

1. **注册小程序**（<https://mp.weixin.qq.com>）：建议以**企业或个体工商户**主体注册（个人主体无法使用"手机号快速验证"、部分类目受限）。完成微信认证（年审费 300 元/年）后才能使用手机号快速验证组件。
2. **获取 AppID / AppSecret**：「开发管理 → 开发设置」。在服务器环境变量中配置 `WECHAT_APPID`、`WECHAT_SECRET`；把 AppID 填入 `apps/miniapp/src/manifest.json` 的 `mp-weixin.appid`（替换 `touristappid`）。
3. **域名与备案**：后端域名必须已完成 **ICP 备案**、启用 **HTTPS**（TLS 1.2+）。在「开发管理 → 开发设置 → 服务器域名」中把 `https://你的域名` 加入 **request 合法域名**，若照片走 COS/OSS/CDN，还需加入 **downloadFile 合法域名**。构建时设置 `VITE_API_BASE=https://你的域名/api`。
4. **小程序备案**：2023 年 9 月起新上架小程序需在公众平台完成「小程序备案」（主体信息 + 负责人人脸核验），通常 1–20 个工作日。
5. **服务类目**：建议选择「工具 → 信息查询」或「社交 → 社区/论坛」类；如审核要求，可补充说明"家族内部族谱查询工具，用户为本族成员，内容由家族管理员录入"。涉及用户发布内容的类目需要更多资质，本小程序族人只读，避免选择需 UGC 资质的类目。
6. **订阅消息模板**：「功能 → 订阅消息」中选用两个模板，并把模板 ID 配置到环境变量：
   - `WECHAT_TPL_REMINDER`（生日/忌日提醒），字段：`thing1` 人物/事项、`date2` 日期、`thing3` 备注（如"农历八月十五"）；
   - `WECHAT_TPL_ACTIVITY`（活动通知），字段：`thing1` 活动名称、`time2` 活动时间、`thing3` 地点。
   若所选模板字段编号不同，请相应修改 `apps/api/src/modules/reminders/reminders.ts` 与 `activities/activities.ts` 中的 `data` 字段名。
7. **用户隐私保护指引**：「设置 → 服务内容声明 → 用户隐私保护指引」中声明收集**手机号**（用于登录与绑定族谱账号）与**通讯录信息（用户自行填写）**；`manifest.json` 已开启 `__usePrivacyCheck__`。
8. **上传与提审**：微信开发者工具中上传代码 → 公众平台「版本管理」提交审核 → 审核通过后发布。审核时请提供演示账号（可用示例数据中的族人账号）。
9. **服务器其他配置**：生产环境设置 `NODE_ENV=production`、`WECHAT_MP_STATE=formal`（体验版为 `trial`）、按需设置 `REMINDER_HOUR`。

## 5. 测试

`apps/api/test/interaction.spec.ts`：农历/公历换算（闰月、腊月跨年、2 月 29 日、小月三十）、微信登录与绑定（含绑定令牌不可当登录令牌、一个账号只能绑一个微信、激活码账号用手机号快捷绑定）、通讯录字段可见性与家族隔离、活动发布权限/通知/订阅消息额度、报名名额、签到码、提醒任务的提前与当天提醒、幂等、偏好开关、通知只能本人读写。
