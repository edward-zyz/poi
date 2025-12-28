# 餐饮门店选址辅助工具 Location Scout v2.0 规格说明

> 版本：2025-10-18  
> 维护人：项目组全体成员  
> 目标读者：新加入的产品 / 设计 / 前后端工程师 / 全栈开发者

---

## 1. 项目概览 v2.0

| 维度 | 说明 |
| :--- | :--- |
| 项目定位 | 面向餐饮行业的 SaaS 级选址辅助工具，支持账户体系、多租户订阅模式，提供 Web 端和微信小程序双平台访问。 |
| 主要用户 | 连锁餐饮品牌拓展部门、独立餐饮创业者、区域代理团队、企业级客户。 |
| 升级重点 | **账户体系**、**多租户管理**、**订阅计费**、**微信小程序**、**权限管理**、**支付系统**。 |
| 商业模式 | 免费试用 + 付费订阅（Freemium），支持月付/年付，企业定制化服务。 |
| 成功指标 | ① 注册用户转化率 ≥ 15%；② 付费用户留存率 ≥ 80%；③ 小程序日活占比 ≥ 60%；④ 月收入增长率 ≥ 20%；⑤ 租户活跃率 ≥ 70%。 |

### 1.1 v2.0 核心升级点

| 功能 | v1.0 | v2.0 |
| :--- | :--- | :--- |
| **用户体系** | 无需登录 | 手机/微信登录，用户画像 |
| **访问方式** | 仅Web端 | Web端 + 微信小程序 |
| **使用限制** | 无限制 | 按租户订阅计划功能限制 |
| **数据存储** | 本地缓存 | 云端同步，跨设备同步 |
| **支付方式** | 无 | 微信支付、支付宝、对公转账 |
| **协作功能** | 单人使用 | 多租户团队协作（企业版） |
| **数据隔离** | 无 | 租户级隔离与共享 POI 底库 |

---

## 2. 账户体系设计

### 2.1 用户类型与权限矩阵

| 用户类型 | 注册方式 | 租户形态 | 功能权限 | 数据限制 | 价格 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **免费用户** | 手机验证码/微信 | 个人租户（1人） | 基础选址分析 | 10次/月，1个品牌，3个城市 | 免费 |
| **专业用户** | 付费订阅 | 个人租户，可扩展协作 | 全功能选址 | 100次/月，5个品牌，10个城市 | ¥99/月 |
| **企业用户** | 付费订阅 | 企业租户（5人起） | 团队协作+API | 无限，团队管理，数据导出 | ¥499/月 |

### 2.2 账户功能架构

```
用户认证层
├── 手机号登录（短信验证）
├── 微信授权登录
├── 密码登录（可选）
└── JWT Token管理

用户管理层  
├── 个人资料管理
├── 头像上传
├── 企业信息认证
└── 团队成员管理（企业版）

权限控制层
├── 订阅状态验证
├── API调用频率限制
├── 功能模块权限控制
└── 数据访问权限控制
```

### 2.3 用户数据模型

```sql
-- 用户主表
CREATE TABLE users (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255),
  wechat_openid VARCHAR(100) UNIQUE,
  nickname VARCHAR(100),
  avatar_url TEXT,
  password_hash VARCHAR(255),
  status ENUM('active', 'suspended', 'deleted'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- 用户扩展信息
CREATE TABLE user_profiles (
  user_id UUID REFERENCES users(id),
  company_name VARCHAR(255),
  company_type ENUM('chain', 'independent', 'agency'),
  industry_years INT,
  preferred_cities JSON,
  notification_settings JSON
);

-- 租户表
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  code VARCHAR(64) UNIQUE, -- 用于子域/路径
  name VARCHAR(255),
  type ENUM('personal', 'business', 'enterprise'),
  status ENUM('active', 'suspended'),
  contact_user_id UUID REFERENCES users(id),
  region VARCHAR(64),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- 租户成员关系
CREATE TABLE tenant_members (
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),
  role ENUM('owner', 'admin', 'member', 'viewer'),
  invitation_status ENUM('pending', 'accepted', 'rejected'),
  joined_at TIMESTAMP,
  UNIQUE (tenant_id, user_id)
);

-- 租户设置（配额、功能开关）
CREATE TABLE tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
  plan_id UUID,
  quota JSONB,
  feature_flags JSONB,
  expires_at TIMESTAMP,
  trial_until TIMESTAMP
);

-- 定位相关数据表
-- 用户定位历史
CREATE TABLE user_locations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  tenant_id UUID REFERENCES tenants(id),
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(8, 2),  -- 定位精度（米）
  altitude DECIMAL(8, 2),   -- 海拔高度（米）
  speed DECIMAL(6, 2),      -- 移动速度（米/秒）
  heading DECIMAL(5, 2),     -- 方向角度（度）
  location_source VARCHAR(20) NOT NULL, -- GPS, Network, IP, Manual
  address TEXT,             -- 解析后的地址
  created_at TIMESTAMP NOT NULL,
  session_id VARCHAR(64),    -- 会话ID，用于关联一次定位活动
  INDEX idx_user_locations_user_tenant (user_id, tenant_id),
  INDEX idx_user_locations_created (created_at),
  INDEX idx_user_locations_geo (latitude, longitude)
);

-- 位置分析结果缓存
CREATE TABLE location_analysis_cache (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  analysis_radius INTEGER NOT NULL, -- 分析半径（米）
  brand_keywords JSONB,              -- 品牌关键词列表
  result_json JSONB NOT NULL,       -- 分析结果
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,              -- 缓存过期时间
  access_count INTEGER DEFAULT 1,    -- 访问次数
  UNIQUE(tenant_id, latitude, longitude, analysis_radius),
  INDEX idx_location_cache_tenant (tenant_id),
  INDEX idx_location_cache_expires (expires_at)
);

-- 现场考察点
CREATE TABLE field_survey_points (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  created_by UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address TEXT,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  priority INTEGER DEFAULT 5,        -- 优先级 1-10
  photos JSONB,                        -- 照片列表
  notes JSONB,                         -- 笔记列表
  voice_notes JSONB,                   -- 语音备注列表
  analysis_result JSONB,              -- 关联的分析结果
  location_score INTEGER,             -- 位置评分 0-100
  investment_level VARCHAR(20),        -- 投资等级
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  INDEX idx_field_survey_tenant (tenant_id),
  INDEX idx_field_survey_status (status),
  INDEX idx_field_survey_geo (latitude, longitude)
);

-- 位置收藏夹
CREATE TABLE user_favorite_locations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address TEXT,
  description TEXT,
  location_type VARCHAR(50),          -- location_type: potential, competitor, reference
  tags JSONB,                          -- 标签数组
  analysis_result JSONB,              -- 关联的分析结果
  is_shared BOOLEAN DEFAULT FALSE,     -- 是否分享给团队成员
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  INDEX idx_favorite_locations_user (user_id),
  INDEX idx_favorite_locations_tenant (tenant_id),
  INDEX idx_favorite_locations_shared (is_shared)
);

-- 定位轨迹
CREATE TABLE location_trajectories (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  created_by UUID REFERENCES users(id),
  session_id VARCHAR(64) NOT NULL,
  name VARCHAR(255),
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  total_distance INTEGER,              -- 总距离（米）
  duration INTEGER,                     -- 持续时间（秒）
  average_speed DECIMAL(6, 2),        -- 平均速度（米/秒）
  point_count INTEGER DEFAULT 0,       -- 轨迹点数量
  file_url TEXT,                        -- GPX文件存储URL
  created_at TIMESTAMP NOT NULL,
  INDEX idx_trajectories_tenant (tenant_id),
  INDEX idx_trajectories_session (session_id)
);

-- 轨迹点详情
CREATE TABLE trajectory_points (
  id UUID PRIMARY KEY,
  trajectory_id UUID REFERENCES location_trajectories(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  altitude DECIMAL(8, 2),
  accuracy DECIMAL(8, 2),
  speed DECIMAL(6, 2),
  heading DECIMAL(5, 2),
  location_source VARCHAR(20),
  recorded_at TIMESTAMP NOT NULL,
  sequence_number INTEGER NOT NULL,
  INDEX idx_trajectory_points_trajectory (trajectory_id, sequence_number),
  INDEX idx_trajectory_points_recorded (recorded_at)
);
```

### 2.4 定位数据管理策略

#### 数据隐私保护
```sql
-- 定位数据自动清理策略
-- 1. user_locations: 保留3个月，自动清理过期数据
-- 2. location_analysis_cache: 保留7天，按过期时间清理
-- 3. trajectory_points: 保留1个月，按会话清理
-- 4. 用户删除账户时：彻底清理所有定位相关数据
```

#### 数据访问控制
```sql
-- 行级安全策略示例
CREATE POLICY location_policy ON user_locations
FOR ALL TO authenticated_users
USING (
  tenant_id = current_setting('app.current_tenant_id')::UUID
  AND (
    user_id = current_user_id()
    OR current_user_role() IN ('admin', 'owner')
  )
);
```

#### 数据同步策略
- **实时同步：** 收藏位置点实时同步到云端
- **批量同步：** 轨迹数据按会话批量同步
- **智能同步：** 根据网络状况和用户行为选择同步策略
- **冲突处理：** 采用"最后写入优先"的冲突解决策略

### 2.5 租户模型与数据隔离

| 维度 | 设计说明 |
| :--- | :--- |
| 租户定义 | 租户可对应个人用户、企业团队或渠道代理，所有业务数据均挂载在租户之下。 |
| 数据隔离 | 采用「共享数据库 + 租户字段」方案：核心业务表新增 `tenant_id` 字段并建立联合索引；敏感操作通过租户中间件校验。 |
| 公共数据 | 高德 POI 底库作为公共数据域，通过只读服务提供给所有租户；缓存层按热门城市共享。 |
| 自定义字段 | 企业租户可配置自定义标签、候选点分类；通过 `tenant_settings.feature_flags` 控制。 |
| 访问控制 | 业务接口先解析用户主身份 → 关联租户 → 校验成员角色与订阅状态，再执行具体操作。 |

```
请求流程
用户登录 → 获取用户身份 → 选择/切换租户 → 附带 tenant_id 和 role → 
  权限网关校验 → 读取订阅配额 → 执行业务逻辑
```

### 2.5 租户角色与权限边界

| 角色 | 适用场景 | 主要权限 | 典型限制 |
| :--- | :--- | :--- | :--- |
| **Owner** | 租户创建者、企业负责人 | 订阅管理、支付、成员管理、删除租户 | 至多 2 人，必须绑定支付方式 |
| **Admin** | 企业运营主管 | 成员管理、配额分配、数据导出、工单查看 | 不可解散租户 |
| **Member** | 常规分析师 | 候选点管理、热力分析、上传资料 | 无法修改订阅或成员角色 |
| **Viewer** | 外部顾问、审计 | 只读查看、导出 PDF 报告 | 无法创建/编辑数据 |

---

## 3. 订阅体系设计

### 3.1 订阅计划详情

#### 免费版（Starter）
- **查询限制：** 10次/月
- **品牌分析：** 1个主品牌 + 2个竞品
- **城市覆盖：** 3个指定城市
- **候选点管理：** 最多5个候选点
- **数据导出：** 不支持
- **技术支持：** 社区支持

#### 专业版（Professional）- ¥99/月
- **查询限制：** 100次/月
- **品牌分析：** 5个品牌组合
- **城市覆盖：** 全国主要城市
- **候选点管理：** 100个候选点
- **数据导出：** PDF报告
- **高级功能：** 历史对比、趋势分析
- **技术支持：** 邮件支持

#### 企业版（Enterprise）- ¥499/月
- **查询限制：** 无限制
- **品牌分析：** 无限制
- **城市覆盖：** 全国 + 海外城市
- **候选点管理：** 无限制
- **数据导出：** Excel/PDF/CSV + API导出
- **团队协作：** 5个团队成员
- **高级功能：** API接入、定制报表、专属客服
- **SLA保证：** 99.9%可用性

### 3.2 功能权限控制矩阵

| 功能模块 | 免费版 | 专业版 | 企业版 |
| :--- | :--- | :--- | :--- |
| 热力图生成 | ✅ | ✅ | ✅ |
| 品牌对比分析 | ❌ | ✅ | ✅ |
| 3km半径分析 | ✅ | ✅ | ✅ |
| 历史数据对比 | ❌ | ✅ | ✅ |
| 数据导出 | ❌ | PDF | Excel/PDF/CSV |
| 团队协作 | ❌ | ❌ | ✅ |
| API接入 | ❌ | ❌ | ✅ |
| 高级报表 | ❌ | ✅ | ✅ |

### 3.3 计费与续费逻辑

```javascript
// 订阅状态管理
const subscriptionModel = {
  // 试用逻辑：新用户7天专业版试用
  trialPeriod: 7 * 24 * 60 * 60 * 1000, // 7天
  
  // 付费周期
  billingCycles: {
    monthly: 30 * 24 * 60 * 60 * 1000,
    yearly: 365 * 24 * 60 * 60 * 1000
  },
  
  // 到期处理
  onExpiration: {
    // 到期前3天提醒
    reminder: 3 * 24 * 60 * 60 * 1000,
    // 到期后7天宽限期
    gracePeriod: 7 * 24 * 60 * 60 * 1000,
    // 宽限期后降级为免费版
    downgrade: 'starter'
  }
};
```

### 3.4 租户订阅关系模型

```sql
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY,
  code VARCHAR(64) UNIQUE,
  name VARCHAR(64),
  tier ENUM('starter', 'professional', 'enterprise'),
  price_cents INT,
  billing_cycle ENUM('monthly', 'yearly'),
  quota JSONB,
  features JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE tenant_subscriptions (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  plan_id UUID REFERENCES subscription_plans(id),
  status ENUM('trial', 'active', 'grace', 'expired', 'canceled'),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  next_billing_date TIMESTAMP,
  cancel_at_period_end BOOLEAN,
  payment_channel ENUM('wechat', 'alipay', 'bank_transfer', 'manual'),
  metadata JSONB
);
```

- **订阅关联方式：** 用户可隶属于多个租户，但订阅绑定在租户维度，支付凭证、发票抬头随租户变更。
- **额度消耗策略：** API 请求、热点图生成等额度以租户为单位累计，通过 Redis 记录每日/每月桶计数。
- **降级规则：** 当租户订阅进入 `grace` 或 `expired` 状态后，保留核心数据，但限制高级功能调用，3 个月后可归档到冷存储。

---

## 4. 支付系统设计

### 4.1 支付方式集成

| 支付渠道 | Web端 | 小程序 | 企业版 | 手续费 |
| :--- | :--- | :--- | :--- | :--- |
| 微信支付 | ✅ | ✅ | ✅ | 0.6% |
| 支付宝 | ✅ | ❌ | ❌ | 0.55% |
| 对公转账 | ❌ | ❌ | ✅ | 0% |
| 银行卡 | ✅ | ❌ | ❌ | 0.65% |

### 4.2 订单管理流程

```
用户选择订阅计划 → 创建订单 → 调用支付接口 → 支付成功回调 → 
更新订阅状态 → 发送确认通知 → 开通相应权限
```

### 4.3 发票与财务管理

- **电子发票：** 支持增值税普通发票、专用发票
- **发票抬头：** 个人/企业发票抬头管理
- **费用管理：** 月度账单、费用统计、税务报表
- **退款政策：** 7天无理由退款，企业版定制退款条款

---

## 5. 微信小程序设计

### 5.1 小程序功能架构

```
微信小程序
├── 首页（快速分析入口）
├── 品牌分析（热力图查看）
├── 候选点管理（现场考察）
├── 个人中心（订阅管理）
├── 团队协作（仅企业版）
└── 设置页面
```

### 5.2 小程序特色功能

#### 实时定位与现场分析

**功能概述**
为用户提供实时的GPS定位服务，支持现场踩点时的即时环境分析，帮助用户快速了解当前位置的商业环境。

**核心功能**

##### 1. 实时定位
- **高精度定位：** 支持GPS+基站+WiFi混合定位，精度5-50米
- **位置验证：** 自动检测定位精度，低精度时提示用户移动到开阔区域
- **位置缓存：** 缓存历史定位点，支持轨迹记录
- **离线定位：** 支持无网络环境下的基础定位功能

##### 2. 现场环境分析
- **周边品牌分析：** 自动分析周边500米、1公里范围内的竞品分布
- **商圈密度评估：** 实时计算当前位置的商业密度评分
- **交通便捷性：** 分析周边地铁站、公交站、停车场分布
- **人流热力图：** 基于POI数据生成周边人流密度分析

##### 3. 一键报告生成
- **选址评分卡：** 综合位置、竞品、交通等因素生成评分
- **照片记录：** 支持现场拍照，自动附加位置信息
- **语音备注：** 支持语音记录考察要点，自动转文字
- **数据导出：** 支持PDF/Excel格式的选址报告导出

**技术实现**

##### 前端定位逻辑
```typescript
// 定位权限和精度管理
interface LocationService {
  // 获取当前位置
  getCurrentPosition(options?: PositionOptions): Promise<LocationInfo>
  
  // 定位精度验证
  validateLocationAccuracy(position: LocationInfo): LocationQuality
  
  // 轨迹记录
  recordLocationTrajectory(points: LocationPoint[]): void
}

interface LocationInfo {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
  source: 'gps' | 'network' | 'passive'
  address?: string
}

interface LocationQuality {
  level: 'high' | 'medium' | 'low'
  accuracy: number
  recommendation: string
}
```

##### 后端分析API
```typescript
// 现场分析接口
POST /api/location/analyze-current
{
  "location": {
    "lat": 31.2304,
    "lng": 121.4737
  },
  "analysisRadius": 1000,  // 分析半径（米）
  "brandFocus": ["星巴克", "瑞幸咖啡"],  // 关注品牌
  "includeTraffic": true,  // 包含交通分析
  "includeDemographics": true  // 包含人口分析
}

// 响应数据结构
interface LocationAnalysisResult {
  location: {
    lat: number
    lng: number
    address: string
    accuracy: number
  }
  
  // 周边竞品分析
  competitorAnalysis: {
    within500m: {
      total: number
      byBrand: Record<string, number>
      density: 'high' | 'medium' | 'low'
    }
    within1000m: {
      total: number
      byBrand: Record<string, number>
      marketShare: Record<string, number>
    }
  }
  
  // 商业环境评分
  environmentScore: {
    overall: number  // 0-100
    factors: {
      competitorDensity: number
      trafficAccessibility: number
      commercialActivity: number
      parkingAvailability: number
    }
    recommendations: string[]
  }
  
  // 交通便捷性
  transportAnalysis: {
    subway: Array<{
      name: string
      distance: number
      lines: string[]
    }>
    bus: Array<{
      name: string
      distance: number
      routes: string[]
    }>
    parking: Array<{
      name: string
      distance: number
      capacity: number
    }>
  }
  
  // 周边POI分类统计
  poiDistribution: {
    food: number
    shopping: number
    entertainment: number
    services: number
    residence: number
  }
  
  // 生成时间
  generatedAt: number
}
```

**用户体验设计**

##### 定位界面
- **地图居中：** 自动将地图中心定位到用户位置
- **精度圆圈：** 显示定位精度范围（蓝圈）
- **刷新按钮：** 支持手动刷新位置
- **定位状态：** 实时显示定位状态（定位中/成功/失败）

##### 分析结果展示
- **分层信息：** 关键数据卡片式展示，详细信息可展开查看
- **对比分析：** 支持多个位置的对比分析
- **历史记录：** 查看历史定位点的分析结果
- **分享功能：** 一键分享分析结果给团队成员

**数据隐私与安全**
- **位置授权：** 明确的定位权限请求和说明
- **数据加密：** 位置数据传输全程加密
- **本地存储：** 定位数据优先本地存储，可选云同步
- **数据删除：** 支持用户主动删除历史定位数据

**性能优化**
- **定位缓存：** 缓存定位结果，减少重复请求
- **预加载分析：** 根据用户行为预加载周边POI数据
- **智能降级：** 定位失败时提供手动输入坐标选项
- **离线支持：** 关键分析功能支持离线使用

#### 现场考察工具集

**功能扩展**
- **AR实景分析：** 通过手机摄像头叠加显示周边商业信息
- **测量工具：** 支持距离、面积测量
- **团队协作：** 支持多人同时考察同一区域
- **AI建议：** 基于位置数据提供智能选址建议

**使用场景**
1. **新店选址：** 实地考察潜在店址
2. **竞品调研：** 分析竞品店铺周边环境
3. **商圈分析：** 深入了解目标商圈特征
4. **投资评估：** 为投资决策提供数据支撑

#### 现场考察模式
- **GPS定位：** 当前位置快速添加候选点
- **拍照记录：** 现场环境照片上传
- **语音备注：** 语音记录考察要点
- **一键分享：** 分享候选点给团队成员

#### 消息推送
- **分析完成通知：** 热力图生成完成提醒
- **订阅到期提醒：** 续费提醒推送
- **团队协作通知：** 团队成员操作通知

### 5.3 小程序技术栈

| 技术 | 说明 |
| :--- | :--- |
| 开发框架 | uni-app（Vue3）或原生小程序 |
| 地图组件 | 高德地图小程序SDK |
| 状态管理 | Pinia |
| UI组件 | uni-ui |
| 数据请求 | wx.request / uni.request |

### 5.4 Web端实时定位功能

#### 浏览器定位能力

**技术支持**
- **HTML5 Geolocation API：** 浏览器原生定位支持
- **IP地址定位：** 备用定位方案，精度城市级别
- **第三方地图SDK：** 高德地图Web版SDK定位服务
- **WiFi定位：** 基于WiFi热点的辅助定位

**定位精度对比**
| 定位方式 | 精度范围 | 适用场景 | 响应时间 |
|---------|---------|---------|---------|
| GPS定位 | 5-20米 | 移动设备户外 | 3-10秒 |
| WiFi定位 | 20-100米 | 室内WiFi环境 | 1-3秒 |
| 基站定位 | 100-1000米 | 移动网络覆盖区 | 1-2秒 |
| IP定位 | 1-50公里 | 桌面浏览器 | <1秒 |

#### Web端定位界面设计

**定位入口**
- **快速定位按钮：** 页面右上角定位图标
- **地图定位控件：** 地图组件内置定位控件
- **键盘快捷键：** Ctrl+L 快速定位
- **右键菜单：** 地图右键选择"定位到此处"

**定位状态展示**
```typescript
// 定位状态管理
interface LocationState {
  status: 'idle' | 'locating' | 'success' | 'error' | 'denied'
  currentPosition?: LocationInfo
  accuracy?: number
  lastUpdate?: number
  error?: LocationError
}

interface LocationError {
  code: number
  message: string
  suggestion: string
}
```

**精度可视化**
- **高精度（<20米）：** 绿色小圆圈
- **中等精度（20-100米）：** 黄色中圆圈  
- **低精度（>100米）：** 橙色大圆圈
- **定位失败：** 红色感叹号图标

#### Web端现场分析功能

**快速分析模式**
- **一键分析：** 定位成功后自动触发周边分析
- **预设品牌：** 支持设置默认关注品牌列表
- **分析半径：** 500米/1公里/3公里快速切换
- **实时更新：** 移动位置时自动更新分析结果

**对比分析功能**
- **多位置对比：** 支持保存3个位置进行对比
- **历史定位：** 查看本次会话中的定位历史
- **收藏位置：** 收藏有潜力的位置点
- **分享链接：** 生成包含位置和分析结果的分享链接

**移动端适配**
- **响应式设计：** 移动设备上自动优化界面布局
- **触摸友好：** 大按钮设计，便于手指操作
- **横屏支持：** 横屏模式下地图自动全屏
- **离线缓存：** 缓存关键分析结果供离线查看

#### Web端定位权限处理

**权限请求流程**
```typescript
// 优雅的权限请求处理
class LocationPermissionManager {
  async requestPermission(): Promise<PermissionState> {
    // 1. 检查浏览器支持
    if (!this.isGeolocationSupported()) {
      return 'unsupported'
    }
    
    // 2. 检查已有权限状态
    const currentState = await this.checkPermissionState()
    
    // 3. 根据状态决定后续处理
    switch (currentState) {
      case 'granted':
        return 'granted'
      case 'prompt':
        return this.showPermissionDialog()
      case 'denied':
        return this.showPermissionDeniedDialog()
      default:
        return 'unknown'
    }
  }
  
  private showPermissionDialog(): Promise<PermissionState> {
    // 显示友好的权限请求说明
    return new Promise((resolve) => {
      // UI对话框逻辑
    })
  }
}
```

**权限降级策略**
1. **首选方案：** 浏览器GPS定位
2. **降级方案：** 高德地图IP定位
3. **备用方案：** 手动输入坐标
4. **最后手段：** 选择城市中心作为默认位置

#### 数据同步与存储

**本地存储策略**
```typescript
// 定位数据缓存管理
interface LocationCache {
  // 当前位置缓存（5分钟有效）
  currentPosition: {
    location: LocationInfo
    timestamp: number
    accuracy: number
  }
  
  // 历史定位记录（保留100条）
  locationHistory: Array<{
    location: LocationInfo
    timestamp: number
    source: string
  }>
  
  // 收藏位置点
  favoriteLocations: Array<{
    id: string
    name: string
    location: LocationInfo
    analysis?: LocationAnalysisResult
    createdAt: number
  }>
  
  // 分析结果缓存（按位置缓存）
  analysisCache: Map<string, {
    result: LocationAnalysisResult
    timestamp: number
    radius: number
  }>
}
```

**云端同步**
- **用户登录后：** 自动同步收藏位置到云端
- **跨设备同步：** Web端和移动端位置数据共享
- **团队共享：** 企业版支持团队位置库共享
- **版本控制：** 支持位置数据的版本管理和冲突解决

#### 性能优化

**定位优化**
- **智能缓存：** 10分钟内的位置请求使用缓存结果
- **后台定位：** 支持页面隐藏时持续定位（需用户授权）
- **定位预热：** 页面加载时预先请求定位权限
- **并发控制：** 避免同时发起多个定位请求

**分析优化**
- **增量更新：** 位置变化超过50米时才重新分析
- **数据预取：** 根据定位轨迹预取周边POI数据
- **分析缓存：** 相同位置+半径的分析结果缓存30分钟
- **懒加载：** 详细分析结果按需加载

#### 安全与隐私

**数据保护**
- **HTTPS传输：** 所有定位数据使用HTTPS加密传输
- **本地加密：** 本地存储的定位数据使用AES加密
- **数据最小化：** 只收集必要的定位数据
- **定期清理：** 自动清理超过30天的历史定位数据

**用户控制**
- **授权管理：** 用户可随时撤销定位授权
- **数据导出：** 支持导出所有定位相关数据
- **账户删除：** 删除账户时彻底清理所有定位数据
- **透明度报告：** 提供详细的数据使用说明

### 5.5 小程序与Web端数据同步

```javascript
// 数据同步策略
const syncStrategy = {
  // 实时同步数据
  realtimeSync: [
    'user_profile',      // 用户信息
    'subscription_status', // 订阅状态
    'planning_points'    // 候选点数据
  ],
  
  // 延迟同步数据（缓存机制）
  delayedSync: [
    'poi_cache',         // POI缓存
    'heatmap_data',      // 热力图数据
    'analysis_results'   // 分析结果
  ],
  
  // 冲突解决策略
  conflictResolution: 'last_write_wins'
};
```

---

## 6. 技术架构升级

### 6.1 整体架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web前端       │    │   微信小程序     │    │   移动端H5      │
│   (React+TS)    │    │   (uni-app)     │    │   (Vue3)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   API Gateway   │
                    │   (权限认证)     │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   后端服务      │
                    │   (Express+TS)  │
                    └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis       │    │   高德地图API   │
│   (主数据库)    │    │   (缓存/会话)   │    │   (POI数据)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 6.2 数据库架构升级

#### 主数据库：PostgreSQL
- **用户数据：** users, user_profiles, subscriptions
- **业务数据：** planning_points, analysis_results, orders
- **定位数据：** user_locations, field_survey_points, location_analysis
- **日志数据：** usage_logs, operation_logs

#### 缓存层：Redis
- **会话管理：** JWT Token黑名单
- **使用量统计：** API调用频率限制
- **热点数据：** 热门城市POI缓存

#### 文件存储：阿里云OSS
- **用户头像：** 头像图片存储
- **报告文件：** PDF/Excel报告存储
- **现场照片：** 候选点现场照片
- **考察录音：** 现场语音备注文件
- **定位轨迹：** GPX轨迹文件存储

### 6.3 API架构升级

```javascript
// API路由结构
const apiRoutes = {
  // 用户认证模块
  '/api/auth': {
    'POST /register': '用户注册',
    'POST /login': '用户登录', 
    'POST /logout': '用户登出',
    'POST /wechat-login': '微信登录',
    'POST /refresh-token': 'Token刷新'
  },
  
  // 订阅管理模块
  '/api/subscription': {
    'GET /plans': '获取订阅计划',
    'POST /subscribe': '创建订阅',
    'GET /status': '查询订阅状态',
    'POST /cancel': '取消订阅',
    'GET /usage': '使用量统计'
  },
  
  // 支付模块
  '/api/payment': {
    'POST /create-order': '创建订单',
    'POST /wechat-pay': '微信支付',
    'POST /alipay': '支付宝支付',
    'POST /callback': '支付回调',
    'GET /invoice': '发票申请'
  },
  
  // 业务模块（继承v1.0 + 定位功能）
  '/api/poi': {
    'POST /density': '热力图分析',
    'POST /analysis': '候选点分析',
    'GET /cache/stats': '缓存统计'
  },
  
  // 定位分析模块
  '/api/location': {
    'POST /analyze-current': '当前位置分析',
    'POST /reverse-geocode': '地址解析',
    'GET /nearby-pois': '周边POI查询',
    'POST /save-location': '保存位置点',
    'GET /saved-locations': '已保存位置列表',
    'DELETE /saved-locations/:id': '删除位置点',
    'POST /traffic-analysis': '交通分析',
    'GET /location-history': '定位历史记录'
  },
  
  // 现场考察模块
  '/api/field-survey': {
    'POST /create-point': '创建考察点',
    'GET /points': '获取考察点列表',
    'POST /points/:id/photos': '上传现场照片',
    'POST /points/:id/notes': '添加考察笔记',
    'POST /points/:id/voice-notes': '添加语音笔记',
    'GET /points/:id/report': '生成考察报告'
  }
};
```

---

## 7. 前端界面设计

### 7.1 登录注册流程

```
首次访问 → 选择登录方式 → 
  ├─ 手机号登录 → 输入手机号 → 短信验证 → 登录成功
  ├─ 微信登录 → 授权获取信息 → 登录成功
  └─ 邮箱登录 → 输入邮箱密码 → 验证通过 → 登录成功
```

### 7.2 用户中心界面

| 模块 | 功能说明 |
| :--- | :--- |
| **个人资料** | 头像、昵称、企业信息、联系方式 |
| **订阅管理** | 当前套餐、使用量统计、升级/续费 |
| **账单管理** | 历史订单、发票申请、费用统计 |
| **团队管理** | 成员邀请、权限分配（企业版） |
| **设置中心** | 通知设置、隐私设置、账号安全 |

### 7.3 订阅升级界面

- **套餐对比页：** 清晰的功能对比表格
- **支付选择页：** 支付方式选择、优惠信息
- **订单确认页：** 订单详情、支付确认
- **支付成功页：** 支付凭证、功能引导

---

## 8. 部署与运维

### 8.1 部署架构

| 服务 | 部署平台 | 配置 | 备注 |
| :--- | :--- | :--- | :--- |
| **Web前端** | Vercel | 自动构建/部署 | CDN加速 |
| **小程序** | 微信公众平台 | 提交审核 | 版本管理 |
| **后端API** | Railway/阿里云 | 2核4G | 负载均衡 |
| **PostgreSQL** | Railway/阿里云RDS | 2核4G | 自动备份 |
| **Redis** | 阿里云Redis | 1G | 高可用 |
| **文件存储** | 阿里云OSS | 标准存储 | CDN分发 |

### 8.2 监控体系

- **应用监控：** Sentry错误追踪
- **性能监控：** 阿里云ARMS
- **业务监控：** 用户行为分析、转化率统计
- **日志管理：** ELK Stack日志分析

### 8.3 安全策略

- **数据安全：** HTTPS全站加密、敏感数据加密存储
- **支付安全：** 支付密码验证、交易风控
- **账户安全：** 手机验证、异地登录提醒
- **API安全：** 请求签名、频率限制、IP白名单

---

## 9. 数据迁移方案

### 9.1 v1.0 → v2.0 迁移策略

```sql
-- 1. 新增用户表
-- 2. 迁移现有planning_points，关联到默认用户
UPDATE planning_points 
SET user_id = 'system_user_id' 
WHERE user_id IS NULL;

-- 3. 创建系统默认用户
INSERT INTO users (id, nickname, status, created_at) 
VALUES ('system_user_id', '系统用户', 'active', NOW());

-- 4. 数据验证脚本
-- 验证数据完整性、一致性
```

### 9.2 上线计划

**Phase 1（2周）：** 账户体系开发
- 后端用户API
- 前端登录界面
- 基础权限控制

**Phase 2（2周）：** 订阅系统开发  
- 订阅API
- 支付集成
- 权限限制功能

**Phase 3（3周）：** 小程序开发
- 小程序界面
- 微信登录集成
- 数据同步功能

**Phase 4（1周）：** 测试上线
- 数据迁移
- 生产环境部署
- 小程序审核发布

---

## 10. 商业运营策略

### 10.1 用户增长策略

- **免费试用：** 新用户7天专业版试用
- **推荐奖励：** 推荐好友获得延长试用期
- **内容营销：** 选址知识分享、案例分析
- **渠道合作：** 餐饮培训机构、设备供应商

### 10.2 收入预测模型

```javascript
// 收入预测（12个月）
const revenueForecast = {
  month1: { users: 100, conversion: 0.1, revenue: 990 },
  month3: { users: 500, conversion: 0.15, revenue: 7425 },
  month6: { users: 2000, conversion: 0.2, revenue: 39800 },
  month12: { users: 10000, conversion: 0.25, revenue: 247500 }
};
```

### 10.3 客户成功体系

- **新手引导：** 产品使用教程、视频指导
- **客户支持：** 在线客服、工单系统、电话支持
- **成功案例：** 优秀选址案例分享、客户访谈
- **用户反馈：** 定期问卷调查、产品改进建议收集

---

## 11. 风险评估与应对

### 11.1 技术风险

| 风险 | 影响 | 概率 | 应对策略 |
| :--- | :--- | :--- | :--- |
| 高德API限制 | 高 | 中 | 多数据源备份、缓存优化 |
| 支付系统故障 | 高 | 低 | 多支付渠道、手动处理流程 |
| 数据泄露 | 高 | 低 | 数据加密、访问控制、审计日志 |
| 小程序审核失败 | 中 | 中 | 预审核、合规性检查 |

### 11.2 商业风险

| 风险 | 影响 | 概率 | 应对策略 |
| :--- | :--- | :--- | :--- |
| 用户转化率低 | 高 | 中 | 优化免费版功能、加强价值引导 |
| 竞品模仿 | 中 | 高 | 快速迭代、建立技术壁垒 |
| 政策变化 | 中 | 低 | 关注政策动向、业务模式调整 |

---

## 12. 项目里程碑

| 里程碑 | 时间节点 | 交付物 | 成功标准 |
| :--- | :--- | :--- | :--- |
| **MVP开发完成** | 2025-11-30 | 账户+订阅系统 | 用户可注册付费 |
| **小程序上线** | 2025-12-31 | 微信小程序 | 小程序审核通过 |
| **企业版发布** | 2026-01-31 | 团队协作功能 | 首个企业客户 |
| **用户增长目标** | 2026-03-31 | 10000注册用户 | 月收入10万+ |

---

## 13. 团队配置建议

| 角色 | 人数 | 主要职责 |
| :--- | :--- | :--- |
| **项目经理** | 1 | 项目规划、进度管理、跨部门协调 |
| **全栈开发** | 2 | 后端API、前端界面、数据库设计 |
| **小程序开发** | 1 | 微信小程序开发、微信生态集成 |
| **UI/UX设计** | 1 | 界面设计、用户体验优化 |
| **测试工程师** | 1 | 功能测试、性能测试、兼容性测试 |
| **运营专员** | 1 | 用户增长、内容运营、客户支持 |

---

## 14. 参考资源

- **微信小程序开发文档：** https://developers.weixin.qq.com/miniprogram/
- **高德地图开放平台：** https://lbs.amap.com/
- **微信支付接入文档：** https://pay.weixin.qq.com/wiki/doc/
- **uni-app开发框架：** https://uniapp.dcloud.io/
- **PostgreSQL文档：** https://www.postgresql.org/docs/

---

> 本文档将随着项目进展持续更新，所有团队成员应仔细阅读并理解其中的技术架构和业务逻辑。如有疑问或建议，请在项目会议上提出讨论。

---

*最后更新：2025-10-18*  
*文档版本：v2.0*
