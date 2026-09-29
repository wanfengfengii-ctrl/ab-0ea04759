# syntax=docker/dockerfile:1

# ---- 依赖层 ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 构建层：产出静态站点（含 public/healthz） ----
FROM deps AS build
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

# ---- verify 一次性服务：测试 + 构建 + 归因模块冒烟 ----
FROM node:22-alpine AS verify
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY docker/verify-entrypoint.sh ./verify-entrypoint.sh
RUN chmod +x ./verify-entrypoint.sh
CMD ["sh", "./verify-entrypoint.sh"]

# ---- web 站点：nginx 托管静态文件，监听端口由 WEB_PORT 配置 ----
FROM nginx:alpine AS web
ENV WEB_PORT=8080
COPY docker/nginx-default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 \
  CMD wget -q -O /dev/null "http://localhost:${WEB_PORT}/healthz" || exit 1
