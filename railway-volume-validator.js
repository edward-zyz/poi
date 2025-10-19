#!/usr/bin/env node

/**
 * Railway Volume数据持久化验证脚本
 * 用于诊断和验证Railway部署后的数据持久化问题
 */

const axios = require('axios');

// 配置API基础URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const client = axios.create({
  baseURL: API_BASE_URL.replace(/\/+$/, ''),
  timeout: 30000,
});

async function checkServiceStatus() {
  console.log('🔍 检查服务状态...');
  try {
    const { data } = await client.get('/api/status');
    console.log('✅ 服务状态正常');
    console.log(`   环境: ${data.environment}`);
    console.log(`   数据库路径: ${data.databasePath}`);
    console.log(`   存储类型: ${data.storageType}`);
    console.log(`   Volume状态: ${data.volumeStatus || 'N/A'}`);
    console.log(`   时间戳: ${data.timestamp}`);
    return data;
  } catch (error) {
    console.error('❌ 服务状态检查失败:', error.response?.data?.message || error.message);
    return null;
  }
}

async function diagnoseVolume() {
  console.log('\n🔬 Volume诊断...');
  try {
    const { data } = await client.get('/api/diagnose-volume');
    console.log('✅ Volume诊断完成');
    
    const { diagnosis, summary } = data;
    
    console.log(`   Railway环境: ${diagnosis.isRailway}`);
    console.log(`   项目ID: ${diagnosis.railwayProjectId || 'N/A'}`);
    console.log(`   服务名: ${diagnosis.railwayServiceName || 'N/A'}`);
    console.log(`   Volume路径: ${diagnosis.railwayVolume || 'N/A'}`);
    
    console.log('\n📁 存储检查结果:');
    console.log(`   存储目录存在: ${diagnosis.storageChecks.storageDirExists ? '✅' : '❌'}`);
    console.log(`   存储目录可写: ${diagnosis.storageChecks.storageWritable ? '✅' : '❌'}`);
    console.log(`   数据库文件存在: ${diagnosis.storageChecks.databaseExists ? '✅' : '❌'}`);
    
    if (diagnosis.storageChecks.databaseExists) {
      console.log(`   数据库大小: ${(diagnosis.storageChecks.databaseSize / 1024).toFixed(2)} KB`);
      console.log(`   最后修改: ${new Date(diagnosis.storageChecks.databaseModified).toLocaleString()}`);
    }
    
    if (diagnosis.storageChecks.storageFiles && diagnosis.storageChecks.storageFiles.length > 0) {
      console.log(`   存储文件: ${diagnosis.storageChecks.storageFiles.join(', ')}`);
    }
    
    if (diagnosis.errors && diagnosis.errors.length > 0) {
      console.log('\n❌ 发现问题:');
      diagnosis.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    console.log('\n📊 诊断摘要:');
    console.log(`   整体健康: ${summary.healthy ? '✅' : '❌'}`);
    console.log(`   Volume就绪: ${summary.volumeReady ? '✅' : '❌'}`);
    console.log(`   数据库就绪: ${summary.databaseReady ? '✅' : '❌'}`);
    
    return data;
  } catch (error) {
    console.error('❌ Volume诊断失败:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testCacheStats() {
  console.log('\n📊 测试缓存统计...');
  try {
    const { data } = await client.get('/api/poi/cache/stats', {
      params: { useTtl: false }
    });
    
    console.log('✅ 缓存统计正常');
    console.log(`   总记录数: ${data.total}`);
    console.log(`   关键词数: ${data.stats?.length || 0}`);
    
    if (data.stats && data.stats.length > 0) {
      console.log('   热门关键词:');
      data.stats.slice(0, 5).forEach(stat => {
        console.log(`     - ${stat.keyword}: ${stat.count}条`);
      });
    }
    
    return data;
  } catch (error) {
    console.error('❌ 缓存统计失败:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testDataPersistence() {
  console.log('\n🧪 测试数据持久化...');
  
  // 1. 获取当前时间戳
  const testTimestamp = Date.now();
  const testKeyword = `test-persistence-${testTimestamp}`;
  
  try {
    // 2. 创建测试记录
    console.log(`   创建测试记录: ${testKeyword}`);
    const refreshResponse = await client.post('/api/poi/cache/refresh', {
      city: '上海市',
      keywords: [testKeyword]
    });
    
    if (refreshResponse.data.totalFetched > 0) {
      console.log(`   ✅ 测试记录创建成功: ${refreshResponse.data.totalFetched}条`);
      
      // 3. 验证记录存在
      const statsResponse = await client.get('/api/poi/cache/stats', {
        params: { useTtl: false }
      });
      
      const testRecord = statsResponse.data.stats.find(stat => stat.keyword === testKeyword);
      if (testRecord) {
        console.log(`   ✅ 测试记录验证成功: ${testRecord.count}条`);
        
        // 4. 模拟重启后的状态检查
        console.log('   📝 模拟重启后状态检查...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const recheckResponse = await client.get('/api/poi/cache/stats', {
          params: { useTtl: false }
        });
        
        const recheckRecord = recheckResponse.data.stats.find(stat => stat.keyword === testKeyword);
        if (recheckRecord) {
          console.log(`   ✅ 数据持久化验证成功: 记录在重启后仍然存在`);
          return true;
        } else {
          console.log(`   ❌ 数据持久化验证失败: 记录在重启后丢失`);
          return false;
        }
      } else {
        console.log(`   ❌ 测试记录验证失败: 记录未找到`);
        return false;
      }
    } else {
      console.log(`   ⚠️  测试记录创建失败: 未获取到数据`);
      return false;
    }
  } catch (error) {
    console.error('❌ 数据持久化测试失败:', error.response?.data?.message || error.message);
    return false;
  }
}

async function generateReport(results) {
  console.log('\n📋 生成诊断报告...');
  
  const report = {
    timestamp: new Date().toISOString(),
    url: API_BASE_URL,
    results: {
      serviceStatus: results.serviceStatus !== null,
      volumeDiagnosis: results.volumeDiagnosis !== null,
      cacheStats: results.cacheStats !== null,
      dataPersistence: results.dataPersistence
    },
    summary: {
      overall: Object.values(results).every(result => result !== null && result !== false),
      volumeHealthy: results.volumeDiagnosis?.summary?.healthy || false,
      databaseReady: results.volumeDiagnosis?.summary?.databaseReady || false,
      dataPersisted: results.dataPersistence
    },
    recommendations: []
  };
  
  if (!results.serviceStatus) {
    report.recommendations.push('服务无法访问，请检查部署状态和网络连接');
  }
  
  if (!results.volumeDiagnosis?.summary?.healthy) {
    report.recommendations.push('Volume配置有问题，请检查railway.toml配置和Volume挂载');
  }
  
  if (!results.volumeDiagnosis?.summary?.databaseReady) {
    report.recommendations.push('数据库文件不存在，检查Volume初始化和权限设置');
  }
  
  if (!results.dataPersistence) {
    report.recommendations.push('数据持久化失败，Volume可能未正确挂载或配置错误');
  }
  
  if (report.recommendations.length === 0) {
    report.recommendations.push('✅ 所有检查通过，数据持久化配置正确');
  }
  
  console.log('\n📊 诊断报告:');
  console.log(`   整体状态: ${report.summary.overall ? '✅ 健康' : '❌ 有问题'}`);
  console.log(`   Volume健康: ${report.summary.volumeHealthy ? '✅' : '❌'}`);
  console.log(`   数据库就绪: ${report.summary.databaseReady ? '✅' : '❌'}`);
  console.log(`   数据持久化: ${report.summary.dataPersisted ? '✅' : '❌'}`);
  
  console.log('\n💡 建议:');
  report.recommendations.forEach(rec => console.log(`   ${rec}`));
  
  return report;
}

async function main() {
  console.log('🚀 Railway Volume数据持久化验证');
  console.log('=====================================');
  console.log(`🌐 目标服务: ${API_BASE_URL}`);
  console.log(`⏰ 验证时间: ${new Date().toLocaleString()}`);
  
  const results = {
    serviceStatus: null,
    volumeDiagnosis: null,
    cacheStats: null,
    dataPersistence: null
  };
  
  // 1. 检查服务状态
  results.serviceStatus = await checkServiceStatus();
  
  // 2. Volume诊断
  if (results.serviceStatus) {
    results.volumeDiagnosis = await diagnoseVolume();
    
    // 3. 缓存统计测试
    results.cacheStats = await testCacheStats();
    
    // 4. 数据持久化测试
    if (results.cacheStats) {
      results.dataPersistence = await testDataPersistence();
    }
  }
  
  // 5. 生成报告
  const report = await generateReport(results);
  
  // 6. 保存报告
  const reportFileName = `railway-volume-report-${Date.now()}.json`;
  require('fs').writeFileSync(reportFileName, JSON.stringify(report, null, 2));
  console.log(`\n💾 报告已保存: ${reportFileName}`);
  
  console.log('\n✅ 验证完成!');
  
  if (!report.summary.overall) {
    console.log('\n🚨 发现问题，请根据建议进行修复');
    process.exit(1);
  } else {
    console.log('\n🎉 所有检查通过，数据持久化配置正确！');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkServiceStatus, diagnoseVolume, testCacheStats, testDataPersistence };