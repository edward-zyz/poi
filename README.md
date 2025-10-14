# 餐饮门店选址辅助工具 (Location Scout MVP)

本仓库实现了餐饮门店选址辅助工具的最小可行产品，包括：

- **后端服务**：基于 Express + better-sqlite3，封装高德地图 API 调用，并对 POI 结果进行本地缓存与分析。
- **前端应用**：基于 React + Vite，实现全屏地图交互、图层控制、目标点位分析面板等核心 UX。
- **配置与数据**：提供高德地图配置模板、基础品牌关键词清单、POI 缓存策略等。

> ⚠️ 默认未携带高德 API Key，运行前请按照下文说明完成配置。

## 目录结构

```
├── backend              # Node.js (TypeScript) 后端服务
│   ├── src
│   │   ├── index.ts     # 应用入口
│   │   ├── providers    # 高德 API provider 封装
│   │   ├── routes       # REST API 路由
│   │   ├── services     # 核心业务逻辑（热力图、目标点位分析）
│   │   └── storage      # SQLite 缓存与迁移
│   └── test             # Node test 测试用例
├── frontend             # React 前端 (Vite)
│   ├── src
│   │   ├── components   # TopBar / MapView / Panel 等组件
│   │   ├── hooks        # 高德地图脚本加载钩子
│   │   ├── services     # 与后端通信的 API 封装
│   │   └── store        # Zustand 状态管理
├── config
│   └── gaode.config.json # 高德地图配置模板
├── design               # HTML 版 UX 设计稿
└── storage              # 默认 SQLite 数据库存储目录
```

## 环境准备

1. **安装依赖**

   ```bash
   npm install
   ```

2. **配置高德地图 API Key**

   - 编辑 `config/gaode.config.json`，将 `apiKey` 替换为 REST API 密钥，并填写 `securityJsCode`（JS 安全密钥）。
   - 或在运行时设置环境变量 `GAODE_API_KEY` / `GAODE_SECURITY_JS_CODE`，并可通过 `GAODE_CONFIG_PATH` 指定配置文件路径。

3. **（可选）创建 `.env` 文件** 用于前端注入高德地图浏览器端密钥：

   ```bash
   cd frontend
   cat <<'EOF' > .env.local
   VITE_GAODE_KEY=前端可用的高德JS API Key
   # 可选：覆盖默认代理地址（默认指向 http://localhost:4000/_AMapService）
   # VITE_AMAP_SERVICE_HOST=https://your-domain/_AMapService
   # 可选：仅调试时使用，生产建议通过代理追加 securityJsCode
   # VITE_GAODE_SECURITY_JS_CODE=你的安全密钥
   EOF
   ```

   > 注意：前端使用的 Key 只能用于浏览器 JS SDK，建议开启安全域名白名单。

## 启动方式

### 后端服务

```bash
# 开发模式（支持热重载）
npm run dev:backend
```

启动后端默认监听 `http://localhost:4000`，暴露以下接口：

- `GET /api/status`
- `POST /api/poi/density`
- `POST /api/poi/analysis`

### 前端应用

```bash
# 启动 Vite 开发服务 (默认 http://localhost:5173)
npm run dev:frontend
```

前端已配置：
- `/api` → `http://localhost:4000`
- `window._AMapSecurityConfig.serviceHost` → `http://localhost:4000/_AMapService`

确保后端已启动，且 `_AMapService` 代理可访问。

### 生产构建

```bash
npm run build
```

构建后的前端文件位于 `frontend/dist`，后端编译产物位于 `backend/dist`。

## 测试与质量保障

- 后端：`npm run test:backend`
  - 覆盖地理计算与核心服务逻辑（使用 mock provider + 临时 SQLite 数据库）。
- 前端：当前 `npm run test:frontend` 仅包含关键词解析单元测试；若在 CI/本地运行失败，可暂时跳过（Vitest 运行环境受限）。
- Lint：`npm run lint`
- Format：`npm run format`
- 调用示例脚本：`npm --workspace backend run gaode:test -- --keyword=喜茶 --city=上海市`

## 运行时行为说明

- **POI 缓存**：所有高德 API 结果写入 `storage/poi-cache.sqlite`。默认缓存 24 小时，可通过环境变量 `CACHE_TTL_HOURS` 调整。
- **JS API 安全密钥**：后端提供 `/_AMapService` 代理，自动在请求中追加 `securityJsCode`，避免密钥暴露。若生产环境有自建网关，可将 `VITE_AMAP_SERVICE_HOST` 指向对应域名。
- **API 超时**：为确保刷新缓存时拉取所有分页，`timeoutMs` 默认设为 600000（10 分钟）。如需更短超时可在 `config/gaode.config.json` 或 `GAODE_TIMEOUT_MS` 中调整。
- **分析流程**：
  1. 在 TopBar 输入主品牌/竞品关键词并生成热力图。
  2. 在地图上点击候选点，触发半径 1000m 的目标点位分析。
  3. 左侧浮层管理图层开关与半径提示，右侧展示门店数量、密度等级与示例门店。
- **日志**：开发/测试环境采用 `pino-pretty`，生产环境输出 JSON 格式。

## 已知限制

- 高德接口调用仍需真实网络环境与配额支持，测试环境默认使用本地缓存。
- 前端目前未实现多候选点管理、热力图实时渐变等高级特性，可在迭代中扩展。
- 部分测试依赖 Node 20 `--experimental-loader`，若未来版本调整需同步脚本。

## 参考资料

- [产品需求文档](spec.md)
- [HTML UX 设计稿](design/location-scout-ux.html)
- [基础品牌关键词清单](basebrand.md)

如需进一步扩展（如评分模型、人群数据等），可基于 `spec.md` 内的 roadmap 逐步实现。
