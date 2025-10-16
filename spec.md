# 餐饮门店选址辅助工具 (Location Scout MVP) 规格说明

> 版本：2025-10-16  
> 维护人：项目组全体成员  
> 目标读者：新加入的产品 / 设计 / 前后端工程师

---

## 1. 项目概览

| 维度 | 说明 |
| :--- | :--- |
| 项目定位 | 面向餐饮行业的 SaaS 级选址辅助工具，通过地图可视化 + 数据分析，帮助拓展团队快速判断候选商圈的竞争态势。 |
| 主要用户 | 连锁餐饮品牌拓展部门、独立餐饮创业者、区域代理团队。 |
| 现有阶段 | MVP：聚焦 POI 数据驱动的竞争对比，验证流程体验与关键指标。 |
| 成功指标 | ① 新用户完成一次完整分析流程 ≤ 5 分钟；② 核心交互错误率 ≤ 2%；③ 热力/分析接口成功率 ≥ 98%；④ 试点用户易用性评分 ≥ 4/5。 |
| 近期发布 | 前端部署 Vercel，后端部署 Railway，使用高德地图 API（企业账号）。 |

### 1.1 核心痛点与价值

| 痛点 | 解决方案 |
| :--- | :--- |
| 选址决策依赖经验，缺乏可视化数据 | 通过热力图 & 竞争面板展示主/竞品密度、示例门店。 |
| 多候选点对比困难，信息分散 | 引入“选址规划圈”，统一管理候选点并绑定分析结果。 |
| 数据采集成本高、接口限制多 | BFF 统一代理高德 POI 请求，缓存热力和门店数据。 |

---

## 2. 功能快照

| 功能模块 | 当前状态 | 说明 |
| :--- | :--- | :--- |
| 城市选择 & 地图视图 | ✅ | 支持 6 个主要城市，可扩展；切换城市重置状态。 |
| 品牌热力图 | ✅ | 根据主品牌 + 竞品关键词绘制全市网格热力，颜色由蓝 → 红。 |
| 主/竞品门店分布 | ✅ | 地图上以圆标/半径圈展示门店分布，可配置显示模式。 |
| 选址规划圈 | ✅ | 支持关键词或地图点选新增候选点，列表管理 + 状态标记 + 备注。 |
| 目标点位分析 | ✅ | 与规划圈绑定，默认 3km 范围分析；展示竞争指标、密度等级、示例门店。 |
| 数据刷新与缓存 | ✅ | 后端持久化 POI Cache 与规划点，提供刷新接口。 |
| 导出 / 高级报表 | ⏳ | 暂不支持，后续迭代规划。 |

---

## 3. 用户旅程与关键交互

1. **输入品牌关键词**  
   - 用户在顶部栏填写主品牌与竞品关键词，点击“生成分析”。  
   - 后端触发 `POST /api/poi/density`，前端显示热力图。  

2. **管理候选点**  
   - 通过右侧“候选点规划与分析”模块新增点位（关键词搜索或地图点选）。  
   - 每个点位可编辑名称、半径（100~2000m）、状态（待考察/重点跟进/淘汰）、备注。  
   - 自动保存并持久化到 SQLite（表：`planning_points`）。  

3. **查看竞争分析**  
   - 选择候选点后触发 `POST /api/poi/analysis`（默认 3km 半径）。  
   - 页面展示竞争指标：主品牌 500m / 1000m、竞品 100m / 300m / 1000m 数量，密度等级、示例门店。  
   - 分析结果与候选点 ID 缓存，若 `updated_at` 更新则重新计算。  

4. **图层与信息提示**  
   - 左侧保留“大盘热力图”“主品牌圈”“竞品圈”等图层开关和样式设置。  
   - 底部状态栏实时提示当前加载/错误信息。  

---

## 4. 技术与架构概述

### 4.1 总体架构

```
前端 (React + Vite)  ──API──► 后端 (Express + Node)
          │                        │
          │                        ├─ SQLite (POI 缓存 / 规划点)
          │                        └─ 高德地图 API (Place Search)
          │
          └─ Vercel 部署 | 静态资源 + Vite 构建

后端部署：Railway (Node 服务) – 暴露 `/api/*`
```

### 4.2 技术栈

- **前端**：React 18、TypeScript、Vite、Zustand 状态管理、@tanstack/react-query、Axios。  
- **后端**：Express、TypeScript（ts-node）、better-sqlite3、zod 校验。  
- **数据库**：SQLite（在 Railway 持久卷中存储）。  
- **第三方服务**：高德地图 JS SDK + Web 服务 API（Place Search）。  

### 4.3 环境变量（关键）

| 变量 | 归属 | 说明 |
| :--- | :--- | :--- |
| `GAODE_WEB_KEY` | 后端 | 高德 Web 服务密钥，供 POI 搜索使用。 |
| `GAODE_JS_KEY` | 前端 | 高德 JS SDK 密钥，加载地图。 |
| `GAODE_SECRET` | 后端（可选） | 高德安全签名使用。 |
| `VITE_API_BASE_URL` | 前端 | 默认 `/api`；生产设置为 `https://poi-production.up.railway.app/api`。 |
| `PORT` | 后端 | Railway 默认注入。 |

### 4.4 代码结构

```
frontend/
  src/
    components/   // MapView, LeftPanel, RightPanel, PlanningManager 等
    services/     // axios API 封装
    store/        // Zustand 状态
    data/         // 预置选项（状态、颜色等）

backend/
  src/
    routes/       // poiRoutes, planningRoutes, gaodeProxy
    services/     // 业务逻辑 (planningService, poiService)
    storage/      // SQLite 访问层、migrations
    settings/     // 配置加载、日志
    providers/    // 高德 API 调用
```

---

## 5. 部署方案

### 5.1 前端（Vercel）

1. 设置环境变量：
   - `VITE_API_BASE_URL=https://poi-production.up.railway.app/api`
   - `VITE_GAODE_JS_KEY=<高德JS密钥>`
2. 绑定 GitHub 仓库，启用 `npm install && npm run build`。  
3. 部署完成后，访问 Vercel 域名即可访问前端。

### 5.2 后端（Railway）

1. 在 Railway 新建 Node 服务，指向 `backend` 目录。  
2. 设置环境变量：
   - `GAODE_WEB_KEY`（必填）
   - `GAODE_SECRET`（若启用签名）
   - `NODE_ENV=production`
3. Railway 默认端口为 `PORT`，无需手动指定。  
4. Railway 提供的公共 URL 用于前端 `VITE_API_BASE_URL`。  

### 5.3 本地开发

```bash
# 启动后端
cd backend
cp .env.example .env      # 如果存在
npm install
npm run dev               # http://localhost:4000 默认提供 /api/**

# 启动前端
cd ../frontend
cp .env.local.example .env.local  # 若存在，自行新增 VITE_GAODE_JS_KEY
npm install
npm run dev               # http://localhost:5173，Vite proxy 将 /api 转发到 4000
```

---

## 6. 数据模型与接口

### 6.1 SQLite 表设计

| 表 | 关键字段 | 说明 |
| :--- | :--- | :--- |
| `planning_points` | `id` (UUID), `city`, `name`, `longitude`, `latitude`, `radius_meters`, `status`, `color_token`, `priority_rank`, `notes`, `source_type`, `source_poi_id`, `created_at`, `updated_at` | 候选点主数据。 |
| `poi_cache` | `keyword`, `city`, `poi_id`, `name`, `longitude`, `latitude`, `raw_json`, `fetched_at` | POI 结果缓存，避免重复调用高德。 |
| `poi_aggregate` / `poi_analysis_cache` | `city`, `keyword_set_hash`, `grid_id`, `poi_count`, `computed_at` | 热力网格与分析结果缓存。 |

### 6.2 主要 API

| 方法 | 路径 | 描述 |
| :--- | :--- | :--- |
| `POST /api/poi/density` | 生成品牌热力图数据（带缓存）。 |
| `POST /api/poi/analysis` | 生成指定点位 3km 范围的竞争分析。 |
| `GET /api/poi/cache/stats` | 查询缓存关键词统计。 |
| `POST /api/poi/cache/refresh` | 手动刷新缓存（耗时较长，前端已将超时提升至 15 分钟）。 |
| `GET /api/planning/points` | 查询规划点列表（按城市）。 |
| `POST /api/planning/points` | 新增规划点。 |
| `PUT /api/planning/points/:id` | 更新规划点。 |
| `DELETE /api/planning/points/:id` | 删除规划点。 |
| `POST /api/planning/search` | 规划点新增时的高德 POI 搜索。 |

---

## 7. 设计要点与交互细节

1. **右侧面板整合**  
   - 上半部分：候选点列表 + 表单（`PlanningManager`）。  
   - 下半部分：分析结果卡片。  
   - 列表选中即触发分析；分析状态通过 loading / error 提示反馈。  

2. **地图行为**  
   - 仅在规划点需要地图选点时（等待状态）捕获点击，普通点击不再触发分析。  
   - 规划圈 hover / click 显示名称与半径，颜色与状态绑定。  
   - 主/竞品 POI 使用小圆点表示，不再覆盖 “M/C” 标记。  

3. **热力图颜色说明**  
   - 颜色梯度从蓝 → 绿 → 黄 → 红；缩放导致聚合密度变化时，颜色会根据归一化值重新映射。  

4. **表单自动保存**  
   - 编辑候选点字段时 1 秒 debounced 自动保存（PATCH），失败给出重试提示。  
   - 修改经纬度或半径后自动刷新绑定分析。  

5. **异常处理**  
   - 高德 API 限额：继续展示缓存数据并提示稍后重试。  
   - 分析接口失败：保留旧数据，右侧面板显示错误信息。  
   - 前端 axios 超时设置为 15 分钟，保证批量刷新任务可完成。  

---

## 8. 运维与监控建议

- **日志**：后端使用 pino，Railway 控制台可查看 HTTP 访问记录与应用日志。  
- **监控**：建议在后续引入 Sentry / Datadog 监控应用错误与性能。  
- **缓存策略**：密集调用高德时需要关注配额，可在 `poi_service` 中实现节流或失败降级。  
- **备份**：定期导出 SQLite（Railway Volume）以防数据丢失。  

---

## 9. 待办事项与风险

| 类型 | 描述 | 状态 |
| :--- | :--- | :--- |
| 功能迭代 | 支持自定义分析半径、多点对比报表、导出 PDF | 规划中 |
| 数据风险 | 高德 API 限额/价格波动 | 持续关注，必要时缓存 + 限流 |
| 法规风险 | 数据隐私与地图使用协议 | 遵守地图服务 TOS，避免抓取未授权数据 |
| 性能风险 | 热力图在大城市缩放精度变蓝 | 需优化聚合策略或调整梯度 |

---

## 10. 快速使用指南（对新成员）

1. **克隆仓库，安装依赖**  
   ```bash
   git clone https://github.com/<org>/poi.git
   cd poi
   npm install --workspaces
   ```
2. **准备高德密钥**  
   - 后端 `.env` 中配置 `GAODE_WEB_KEY`。  
   - 前端 `.env.local` 中配置 `VITE_GAODE_JS_KEY`。  

3. **本地启动**  
   - `npm run dev --workspace @poi/backend`  
   - `npm run dev --workspace @poi/frontend`  
   - 确保前端 Vite 代理指向后端（默认 4000）。  

4. **验证流程**  
   - 打开 `http://localhost:5173`，输入主品牌/竞品，生成热力图。  
   - 新增候选点，确认分析显示。  

5. **部署检查**  
   - Railway 日志确认 `/api/poi/density` 成功返回。  
   - Vercel 环境变量指向 `https://poi-production.up.railway.app/api`。  

---

## 11. 参考资料

- 高德地图开放平台：https://lbs.amap.com/  
- Railway 文档：https://docs.railway.app/  
- Vercel 文档：https://vercel.com/docs  
- React Query 文档：https://tanstack.com/query/latest/docs/react/

---

> 如需补充或修订，请同步更新本文件并在 PR 中进行说明。欢迎在 issue 中记录新增需求与技术债，以保持文档与实现一致。
