# 构建上下文为仓库根目录：docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --registry=$NPM_REGISTRY
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @zupu/shared && npm run build -w @zupu/web

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
