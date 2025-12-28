# Railway 部署指南

> 更新时间：2025-10-18  
> 版本：v2.0 数据持久化升级

---

## 概述

本文档说明如何在 Railway 平台上部署 POI Location Scout 后端服务，重点说明数据持久化配置。

## 部署架构

### 存储方案
- **本地开发**：使用 `./storage/poi-cache.sqlite`
- **Railway生产**：使用持久化 Volume `/app/storage/poi-cache.sqlite`
- **数据保护**：POI缓存数据在重新部署后保持

### 环境检测
系统自动检测 Railway 环境：
- `RAILWAY_ENVIRONMENT` 或 `RAILWAY_VOLUME_MOUNT_PATH` 环境变量
- 自动切换到持久化存储路径

---

## 部署步骤

### 1. 准备 Railway 项目

```bash
# 1. 在 Railway 创建新项目
# 2. 连接 GitHub 仓库
# 3. 选择后端目录 (backend)
```

### 2. 配置环境变量

在 Railway 项目设置中添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|----|----- |
| `NODE_ENV` | `production` | 生产环境 |
| `GAODE_API_KEY` | `你的高德API密钥` | 高德地图API密钥 |
| `CACHE_TTL_HOURS` | `168` | 缓存TTL（小时，建议7天） |
| `GAODE_TIMEOUT_MS` | `600000` | API超时时间（毫秒） |

### 3. Volume 配置

项目已包含 `railway.toml` 配置文件：

```toml
[build]
builder = "NIXPACKS"

[deploy]
healthcheckPath = "/api/status"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

# 持久化存储SQLite数据库
[[deploy.volumes]]
name = "poi-storage"
mountTo = "/app/storage"
```

### 4. 验证部署

#### 检查服务状态
```bash
curl https://your-project.up.railway.app/api/status
```

预期响应：
```json
{
  "service": "poi-location-scout-backend",
  "status": "ok",
  "version": "0.1.0",
  "provider": "gaode",
  "cacheTtlHours": 168,
  "databasePath": "/app/storage/poi-cache.sqlite",
  "storageType": "persistent-volume",
  "environment": "railway",
  "railwayEnv": "true",
  "railwayVolume": "/app/storage"
}
```

#### 测试POI缓存功能
```bash
curl -X POST https://your-project.up.railway.app/api/poi/cache/stats \
  -H "Content-Type: application/json" \
  -d '{"city": "上海市"}'
```

---

## 数据持久化验证

### 1. 首次部署后数据填充
```bash
# 刷新POI缓存
curl -X POST https://your-project.up.railway.app/api/poi/cache/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "city": "上海市",
    "keywords": ["肯德基", "麦当劳", "星巴克"]
  }'
```

### 2. 验证热力图功能
```bash
curl -X POST https://your-project.up.railway.app/api/poi/density \
  -H "Content-Type: application/json" \
  -d '{
    "city": "上海市",
    "keywords": ["肯德基", "麦当劳"],
    "mainBrand": "肯德基"
  }'
```

### 3. 重新部署验证
1. 触发重新部署
2. 检查数据是否保持：
```bash
curl https://your-project.up.railway.app/api/poi/cache/stats
```

---

## 故障排查

### 问题1：数据丢失
**症状**：重新部署后POI缓存数据消失  
**原因**：Volume配置问题  
**解决**：
1. 检查 `railway.toml` 配置
2. 验证Volume是否正确挂载
3. 查看 Railway 项目设置中的 Storage 选项

### 问题2：存储健康检查失败
**症状**：日志中出现 `Storage health check failed`  
**原因**：Volume权限或路径问题  
**解决**：
1. 检查 `/app/storage` 目录权限
2. 验证 Volume 挂载路径
3. 查看 Railway 控制台错误信息

### 问题3：API连接问题
**症状**：高德API调用失败  
**原因**：API密钥或网络问题  
**解决**：
1. 验证 `GAODE_API_KEY` 环境变量
2. 检查API配额和限制
3. 查看应用日志

---

## 监控和维护

### 日志监控
在 Railway 控制台查看实时日志，关注：
- `Storage health check failed` 错误
- `Railway storage directory created` 成功信息
- `SQLite migrations applied` 数据库状态

### 性能优化
1. **TTL设置**：根据业务需求调整 `CACHE_TTL_HOURS`
2. **API限制**：监控高德API调用频率
3. **数据清理**：定期清理过期POI数据

### 备份策略
虽然Railway Volume提供持久化，建议：
1. 定期导出重要POI数据
2. 监控Volume使用量
3. 设置数据库备份计划

---

## 升级说明

### v2.0 升级内容
- ✅ 添加Railway Volume持久化支持
- ✅ 自动环境检测和路径切换
- ✅ 存储健康检查功能
- ✅ 增强的状态监控API
- ✅ 热力图TTL问题修复

### 兼容性说明
- 本地开发环境无需修改
- 现有数据库结构保持不变
- API接口完全向后兼容

---

## 联系支持

如遇到部署问题，请：
1. 查看 Railway 控制台日志
2. 检查本文档故障排查部分
3. 提交 Issue 并包含详细错误信息

---

**部署成功后，您的POI缓存数据将在重新部署后完整保留，确保用户体验的连续性。**