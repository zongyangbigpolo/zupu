#!/usr/bin/env bash
# 部署 / 升级到阿里云服务器（见 docs/deploy-aliyun.md）。
# 默认：服务器从 ghcr.io 拉取 GitHub Actions 构建好的 linux/amd64 镜像（tag 为 git 短哈希）。
# 用法：deploy/aliyun/deploy.sh [user@host]      默认 admin@47.103.58.159
# 可选环境变量：
#   ZUPU_TAG=xxxxxxx  指定镜像 tag（默认为最近一次改动镜像内容的提交的 7 位短哈希，需 Actions 已构建完成）
#   LOCAL_IMAGES=1    改为本地 buildx 构建并经 ssh 传输镜像（本地上行带宽充足时使用）
#   NO_SEED=1         不导入示例数据
set -euo pipefail

HOST="${1:-admin@47.103.58.159}"
REMOTE_DIR=/opt/zupu
REGISTRY=ghcr.io/zongyangbigpolo/
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# 镜像 tag：最近一次改动镜像内容的提交（与 Actions 的触发路径一致）
IMAGE_PATHS=(apps/api apps/web packages/shared deploy/nginx.conf package-lock.json .github/workflows/docker-images.yml)
TAG="${ZUPU_TAG:-$(git -C "$ROOT" log -1 --format=%h --abbrev=7 -- "${IMAGE_PATHS[@]}")}"
SSH=(ssh -o BatchMode=yes "$HOST")

cd "$ROOT"

if [[ "${LOCAL_IMAGES:-}" == 1 ]]; then
  echo "==> 本地构建 linux/amd64 镜像 (tag=$TAG)"
  for app in api web; do
    docker buildx build --platform linux/amd64 -f "apps/$app/Dockerfile" -t "${REGISTRY}zupu-$app:$TAG" --load .
  done
  echo "==> 经 ssh 传输镜像"
  docker save "${REGISTRY}zupu-api:$TAG" "${REGISTRY}zupu-web:$TAG" | gzip -1 | "${SSH[@]}" "gunzip | sudo docker load"
fi

echo "==> 上传 compose 文件"
"${SSH[@]}" "sudo mkdir -p $REMOTE_DIR"
"${SSH[@]}" "sudo tee $REMOTE_DIR/docker-compose.yml >/dev/null" < deploy/aliyun/docker-compose.yml

echo "==> 启动服务 (tag=$TAG)"
"${SSH[@]}" "sudo bash -s" <<EOF
set -euo pipefail
cd $REMOTE_DIR
umask 077
if [[ ! -f .env ]]; then
  echo "首次部署：生成 .env（数据库密码、JWT 密钥）"
  cat > .env <<ENV
DB_PASSWORD=\$(openssl rand -hex 24)
JWT_SECRET=\$(openssl rand -hex 48)
ENV
fi
chown root:root .env && chmod 600 .env
sed -i '/^ZUPU_TAG=/d' .env && echo "ZUPU_TAG=$TAG" >> .env
if [[ "${LOCAL_IMAGES:-}" != 1 ]]; then
  docker compose pull api web
fi
# 先单独启动数据库并执行迁移 + 示例数据，避免与 API 启动同时占用内存
docker compose up -d --wait db
if [[ "${NO_SEED:-}" != 1 ]]; then
  # 已有数据时自动跳过
  docker compose run --rm -T --no-deps api node dist/database/seed.js </dev/null
else
  docker compose run --rm -T --no-deps api node dist/database/migrate.js </dev/null
fi
docker compose up -d --remove-orphans
for i in \$(seq 1 60); do
  curl -fsS -o /dev/null http://127.0.0.1:3100/api/maps/config && break
  sleep 2
done
docker compose ps
EOF

echo "==> 完成：http://${HOST#*@}/"
