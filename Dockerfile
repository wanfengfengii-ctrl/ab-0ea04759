# syntax=docker/dockerfile:1

# ---- 依赖与构建阶段 -------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

# ---- 一次性校验阶段（compose 的 verify 服务使用） --------------------------
# 站点健康后执行：单元测试 -> 生产构建 -> 归因模块冒烟，以退出码报告结果。
FROM deps AS verify
COPY . .
CMD ["sh", "-c", "npm test && npm run build && npm run smoke"]

# ---- 站点阶段：nginx 托管静态产物 ------------------------------------------
FROM nginx:1.27-alpine AS web
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
