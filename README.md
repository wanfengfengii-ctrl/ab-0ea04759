# 海底长期观测阵列 · 采集通道翻转联合归因

回收阵列后，维护工程师根据多轮奇偶校验的**预期二值**与**实测二值**，定位发生翻转的采集通道。
本工具在**本机浏览器**内对全部校验记录做**联合求解**，输出唯一的维修名单，
避免逐条校验各自独立归因而产生彼此冲突的结论。

## 问题模型

设通道 `i` 是否发生翻转为二元变量 `x_i`（GF(2)）。一条校验记录给出通道集合 `S`、
预期奇偶 `e`、实测奇偶 `o`，则所有记录必须被**同一个**故障集合同时满足：

```
XOR_{i ∈ S} x_i = e XOR o
```

- 存在解时，依次按以下准则选择方案：
  1. **故障通道数最少**（GF(2) 仿射陪集最小重量）；
  2. 故障数相同时，取通道编号**升序序列字典序最小**者；
  3. 若该最小方案不唯一，另给出**第二份同重量见证**及两份方案的**首个分歧通道**。
- 方程组矛盾（不存在任何能同时解释全部记录的故障集合）时，明确报告
  **无联合归因结论**，且页面不保留任何旧名单。
- **修改任意草稿（通道数、集合、二值、增删记录）会立即撤销上一次诊断结果。**

算法：GF(2) 高斯-约当消元 → 特解 + 零空间基底 → 自由变量空间上的分支定界最小重量搜索
（坐标定型剪枝 + 贪心种子上界 + 序列字典序 tiebreak）；第二见证以"排除最优解 + 同等重量上界"
再搜一次得到。通道数 ≤ 30，增广矩阵每行可放入一个 31 位整数。

## 输入约束

- 通道总数：**8–30** 个，按编号 `1..N` 排列；
- 校验记录：**6–24** 条，每条包含
  - **非空**通道集合（逗号/空格/顿号等分隔，集合内不可重复、不可越界）；
  - 预期二值、实测二值（0/1）。

## 本地开发

```bash
npm install
npm run dev       # 开发服务器（Vite）
npm test          # 单元与交互测试（Vitest）
npm run build     # 类型检查 + 生产构建到 dist/
npm run smoke     # 归因模块冒烟（退出码报告）
npm run preview   # 本地预览生产构建
```

## Docker / Compose

构建并发布站点（宿主机端口由 `WEB_PORT` 决定，默认 `8080`）：

```bash
cp .env.example .env   # 可按需修改 WEB_PORT
docker compose up -d --build web
# 浏览器访问 http://localhost:${WEB_PORT:-8080}
curl -i http://localhost:8080/healthz   # 健康检查端点
```

- `web`：多阶段构建，nginx 托管静态产物，含 `/healthz` 端点与容器 `HEALTHCHECK`；
  发布端口可通过环境变量 `WEB_PORT` 配置（如 `WEB_PORT=9090 docker compose up -d`）。
- `verify`：**一次性**服务，`depends_on: web: condition: service_healthy`，
  即在站点报告健康后才运行，依次执行

  ```bash
  npm test && npm run build && npm run smoke
  ```

  全部通过则退出码为 `0`，否则非零；服务不常驻。

  ```bash
  docker compose up --build verify
  docker compose ps            # verify 显示 Exited(0)
  docker compose logs verify   # 查看测试/构建/冒烟输出
  ```

## 目录结构

```
src/
  lib/diagnosis.ts      GF(2) 联合归因核心算法（无 DOM 依赖，可独立复用）
  lib/diagnosis.test.ts 核心算法测试（含与 2^n 暴力枚举的随机对照）
  lib/parse.ts          通道集合文本解析
  components/           BitSelect、ChannelChips
  App.tsx               录入、提交、撤销、结论与逐记录推导表
scripts/smoke.ts        归因模块冒烟脚本
nginx/default.conf      站点配置与 /healthz
Dockerfile              deps / build / verify / web 多阶段
docker-compose.yml      web（健康检查、可配置端口）+ verify（一次性）
```

## 隐私

所有计算仅在本机浏览器内完成，通道与校验数据不会被发送到任何服务器。
