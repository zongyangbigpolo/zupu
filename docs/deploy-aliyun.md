# 部署到阿里云（小内存服务器）

适用于约 2 GB 内存、已运行其他业务的阿里云 ECS（Alibaba Cloud Linux 3 / x86_64，已安装 Docker + Compose v2）。
**服务器不做构建**（避免 `npm ci` / 编译导致内存不足）：镜像由 GitHub Actions
（`.github/workflows/docker-images.yml`，推送到 main 时触发）构建为 linux/amd64，推送到
`ghcr.io/zongyangbigpolo/zupu-api`、`zupu-web`（tag 为 `latest` 与 7 位 git 短哈希），服务器直接拉取。

## 架构

| 容器 | 端口 | 内存上限 | 说明 |
| --- | --- | --- | --- |
| `zupu-web` | `0.0.0.0:80` | 64 MB | Nginx：Web 静态文件 + 反代 `/api`（上传文件经 `/api/media/...` 访问） |
| `zupu-api` | `127.0.0.1:3100` | 400 MB | NestJS API，启动时自动执行数据库迁移 |
| `zupu-db` | `127.0.0.1:5434` | 256 MB | 独立的 PostgreSQL 16，已按低内存调优 |

- 数据卷：`zupu_db-data`（数据库）、`zupu_uploads`（上传文件与每日备份 `backups/`，保留 7 天）。
- 不启用 MinIO / Redis；地图与微信未配置 Key 时使用离线地图，小程序登录不可用（Web 端不受影响）。
- 服务器目录 `/opt/zupu`：`docker-compose.yml` 与 `.env`（仅 root 可读，`chmod 600`）。
  `.env` 首次部署时在服务器上随机生成 `DB_PASSWORD`、`JWT_SECRET`，**不要提交到仓库**。
- 不修改服务器上已有的 Nginx、数据库或其他容器。端口 80 由 `zupu-web` 容器直接占用；
  阿里云安全组需放行 TCP 80。

## 部署 / 升级

1. 代码推送到 main，等待 Actions「Docker images」构建完成。
2. 本地执行（需能 `ssh` 免密登录服务器、`sudo` 免密）：

```bash
deploy/aliyun/deploy.sh admin@47.103.58.159
```

脚本会：上传 compose 文件 → 首次在服务器生成 `.env` → 写入镜像 tag（默认当前 HEAD 短哈希）→
`docker compose pull` → `docker compose up -d` → 导入示例数据（库中已有数据时自动跳过）。

可选环境变量：`ZUPU_TAG=<tag>` 指定镜像版本（回滚用）；`NO_SEED=1` 不导入示例数据；
`LOCAL_IMAGES=1` 改为本地 `docker buildx` 交叉构建并经 `docker save | ssh docker load` 传输
（仅在本地上行带宽足够时使用）。

> ghcr.io 上的 `zupu-api`、`zupu-web` 包需为 Public，服务器才能匿名拉取。

## 示例数据与账号

示例数据包含「陇西堂李氏·湘潭支」与王氏两个家族。演示账号（手机号 / 密码）：

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 平台超级管理员 | 13800000000 | admin123 |
| 李氏家族管理员 | 13900000001 | admin123 |
| 李氏族人 | 13900000002 | member123 |
| 王氏家族管理员 | 13900000003 | admin123 |

> ⚠️ 演示密码是公开的，服务对公网开放后请尽快登录修改，或正式使用前清空示例数据。

## 常用运维命令（服务器上）

```bash
cd /opt/zupu
sudo docker compose ps
sudo docker compose logs -f api
sudo docker compose restart api
# 清空并重新导入示例数据（会删除全部数据！）
sudo docker compose run --rm api node dist/database/seed.js --reset
# 手动备份数据库
sudo docker compose exec db pg_dump -U zupu -Fc zupu > zupu-$(date +%F).dump
```

## 排查

- 外网打不开但服务器上 `curl http://127.0.0.1/` 正常：检查阿里云安全组是否放行 TCP 80。
- 内存紧张：`free -m`、`sudo docker stats --no-stream`；各容器已设置内存上限，API 堆上限 256 MB。
