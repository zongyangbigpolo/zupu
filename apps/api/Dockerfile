# 构建上下文为仓库根目录：docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm ci --registry=$NPM_REGISTRY
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @zupu/shared && npm run build -w @zupu/api && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Shanghai
# pg_dump 用于每日数据库备份（与 postgres:16 版本一致）
RUN apk add --no-cache postgresql16-client
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
