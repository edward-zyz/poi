#!/usr/bin/env node

/**
 * 验证POI数据可视化修复的脚本
 * 解决本地能正常显示POI但部署后显示POI数量为0的问题
 */

const axios = require('axios');

// 配置API基础URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const client = axios.create({
  baseURL: API_BASE_URL.replace(/\/+$/, ''),
  timeout: 30000,
});

// 测试数据
const TEST_CITY = '上海市';
const TEST_KEYWORDS = ['塔斯汀', '华莱士'];

async function testApiEndpoint(endpoint, payload, description) {
  console.log(`\n🧪 测试: ${description}`);
  console.log(`   接口: ${endpoint}`);
  try {
    const { data } = await client.post(`/api${endpoint}`, payload);
    console.log(`   ✅ 成功 - POI总数: ${data.totalPois || 0}`);
    console.log(`   📊 热力图数据点: ${data.heatmap?.length || 0}`);
    console.log(`   🏪 主品牌POI: ${data.mainBrandPois?.length || 0}`);
    console.log(`   🏪 竞品POI: ${data.competitorPois?.length || 0}`);
    return data;
  } catch (error) {
    console.error(`   ❌ 失败: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function testCacheStats(useTtl = false) {
  console.log(`\n🧪 测试: POI缓存统计 (useTtl: ${useTtl})`);
  try {
    const { data } = await client.get('/api/poi/cache/stats', {
      params: { 
        city: TEST_CITY, 
        useTtl 
      },
    });
    console.log(`   ✅ 成功 - 缓存统计:`);
    console.log(`   📈 总记录数: ${data.total}`);
    console.log(`   🔑 关键词数: ${data.stats?.length || 0}`);
    
    if (data.stats && data.stats.length > 0) {
      console.log(`   📋 详细统计:`);
      data.stats.slice(0, 5).forEach(stat => {
        console.log(`      - ${stat.keyword}: ${stat.count}条 (最后更新: ${new Date(stat.lastFetchedAt * 1000).toLocaleString()})`);
      });
      if (data.stats.length > 5) {
        console.log(`      ... 还有 ${data.stats.length - 5} 个关键词`);
      }
    }
    
    return data;
  } catch (error) {
    console.error(`   ❌ 失败: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 POI数据可视化修复验证');
  console.log('============================');
  console.log(`🌐 API服务器: ${API_BASE_URL}`);
  console.log(`🏙️ 测试城市: ${TEST_CITY}`);
  console.log(`🔑 测试关键词: ${TEST_KEYWORDS.join(', ')}`);

  const payload = {
    city: TEST_CITY,
    keywords: TEST_KEYWORDS,
    mainBrand: '塔斯汀'
  };

  // 1. 测试缓存统计
  console.log('\n📊 === 缓存统计测试 ===');
  await testCacheStats(false); // 无TTL限制
  await testCacheStats(true);  // 有TTL限制

  // 2. 测试原有接口
  console.log('\n📊 === 原有接口测试 ===');
  await testApiEndpoint('/poi/density', payload, '原有热力图接口 (可能有TTL限制)');

  // 3. 测试新的无TTL限制接口
  console.log('\n📊 === 修复后接口测试 ===');
  await testApiEndpoint('/poi/density/with-ttl-option', { ...payload, useTtl: false }, '修复后的热力图接口 (无TTL限制)');

  // 4. 测试目标点位分析
  console.log('\n📊 === 目标点位分析测试 ===');
  const analysisPayload = {
    city: TEST_CITY,
    mainBrand: '塔斯汀',
    competitorKeywords: ['华莱士'],
    radiusMeters: 3000,
    target: { lng: 121.4737, lat: 31.2304 } // 上海市中心
  };
  
  try {
    const { data } = await client.post('/api/poi/analysis', analysisPayload);
    console.log(`   ✅ 成功 - 分析结果:`);
    console.log(`   🏪 主品牌500m内: ${data.counts?.mainBrand500m || 0}家`);
    console.log(`   🏪 主品牌1000m内: ${data.counts?.mainBrand1000m || 0}家`);
    console.log(`   🏪 竞品100m内: ${data.counts?.competitor100m || 0}家`);
    console.log(`   🏪 竞品1000m内: ${data.counts?.competitor1000m || 0}家`);
    console.log(`   📊 密度等级: ${data.densityLevel || 'unknown'}`);
  } catch (error) {
    console.error(`   ❌ 失败: ${error.response?.data?.message || error.message}`);
  }

  console.log('\n✅ 验证完成!');
  console.log('\n💡 修复说明:');
  console.log('1. 前端现在调用 /poi/density/with-ttl-option 接口');
  console.log('2. 明确设置 useTtl: false 禁用TTL限制');
  console.log('3. 缓存统计接口也设置 useTtl: false');
  console.log('4. 这样确保显示所有缓存数据，与POI管理界面保持一致');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testApiEndpoint, testCacheStats };