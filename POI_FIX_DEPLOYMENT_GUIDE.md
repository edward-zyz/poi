# POI可视化问题修复部署指南

## 🎯 问题描述

**症状**：本地开发时POI数据能正确可视化，但部署到Railway后显示POI数量为0，即使缓存统计显示有大量数据。

**根本原因**：前端调用的API接口存在TTL（生存时间）限制，导致部分缓存数据被过滤掉。

## 🔧 修复内容

### 1. 前端API调用修复

**文件**: `frontend/src/services/api.ts`

**修改前**:
```typescript
export async function fetchBrandDensity(payload: DensityPayload): Promise<BrandDensityResponse> {
  const { data } = await client.post<BrandDensityResponse>("/poi/density", payload);
  return data;
}

export async function fetchCacheStats(city?: string): Promise<CacheStatsResponse> {
  const { data } = await client.get<CacheStatsResponse>("/poi/cache/stats", {
    params: city ? { city } : undefined,
  });
  return data;
}
```

**修改后**:
```typescript
export async function fetchBrandDensity(payload: DensityPayload): Promise<BrandDensityResponse> {
  // 使用无TTL限制的API接口，确保显示所有缓存数据
  const { data } = await client.post<BrandDensityResponse>("/poi/density/with-ttl-option", {
    ...payload,
    useTtl: false, // 明确禁用TTL限制
  });
  return data;
}

export async function fetchCacheStats(city?: string): Promise<CacheStatsResponse> {
  const { data } = await client.get<CacheStatsResponse>("/poi/cache/stats", {
    params: { 
      city, 
      useTtl: false // 明确禁用TTL限制，显示所有缓存数据
    },
  });
  return data;
}
```

### 2. 后端支持

后端已经提供了必要的API接口：
- `/api/poi/density/with-ttl-option` - 支持TTL控制的热力图分析
- `/api/poi/cache/stats` - 支持TTL参数的缓存统计

## 📊 验证结果

本地测试确认修复有效：

```
📊 缓存统计测试
   📈 总记录数: 4,691
   🔑 关键词数: 21

📊 热力图测试  
   ✅ POI总数: 4,691
   📊 热力图数据点: 1,959
   🏪 主品牌POI: 116 (塔斯汀)
   🏪 竞品POI: 308 (华莱士)
```

## 🚀 部署步骤

### 1. 前端部署

```bash
# 构建前端
cd frontend
npm run build

# 提交代码
git add .
git commit -m "fix: 修复POI可视化TTL限制问题"
git push origin master
```

### 2. 验证部署

使用提供的验证脚本测试部署效果：

```bash
# 测试本地环境
API_BASE_URL=http://localhost:4000 node test-poi-fix.js

# 测试生产环境 (替换为你的Railway URL)
API_BASE_URL=https://your-project.up.railway.app node test-poi-fix.js
```

### 3. Railway环境检查

确认以下配置正确：

1. **环境变量**：
   - `NODE_ENV=production`
   - `GAODE_API_KEY=你的API密钥`
   - `CACHE_TTL_HOURS=168`

2. **Volume存储**：
   - 挂载路径: `/app/storage`
   - 确保数据库文件持久化

3. **构建配置**：
   - 根目录: `backend`
   - 确保使用最新代码

## 🔍 故障排查

### 部署后仍然显示0 POI

1. **检查API响应**：
   ```bash
   curl -X POST https://your-project.up.railway.app/api/poi/density/with-ttl-option \
     -H "Content-Type: application/json" \
     -d '{"city":"上海市","keywords":["塔斯汀"],"useTtl":false}' | jq '.totalPois'
   ```

2. **检查缓存状态**：
   ```bash
   curl https://your-project.up.railway.app/api/poi/cache/stats?city=上海市&useTtl=false
   ```

3. **查看Railway日志**，确认：
   - 数据库连接正常
   - 没有API错误
   - 缓存数据存在

### 数据不一致问题

如果缓存统计显示有数据但可视化显示0，确认：
- 前端使用的是正确的API端点
- `useTtl: false` 参数正确传递
- 后端服务版本包含最新修复

## ✅ 预期结果

修复后，生产环境应该：
- POI总数与本地环境一致
- 热力图正常显示
- 品牌POI和竞品POI都能正确渲染
- 缓存统计与可视化数据保持一致

## 📞 技术支持

如果问题持续存在：
1. 检查Git提交历史确认修复代码已部署
2. 对比本地和生产的API响应差异
3. 查看Railway部署日志
4. 确认Volume存储配置正确

---

**修复完成时间**: 2025-10-19  
**验证状态**: ✅ 本地测试通过  
**待部署**: 🚀 推送到生产环境