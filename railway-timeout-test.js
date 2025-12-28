#!/usr/bin/env node

/**
 * Railway超时修复验证脚本
 * 测试长时间运行请求是否能正常处理
 */

const axios = require('axios');

const API_BASE_URL = 'https://poi-production.up.railway.app';

async function testCacheStats() {
  console.log('🔍 测试缓存统计接口...');
  try {
    const startTime = Date.now();
    const response = await axios.get(`${API_BASE_URL}/api/poi/cache/stats`, {
      timeout: 30000, // 30秒超时
    });
    const duration = Date.now() - startTime;
    
    console.log(`✅ 缓存统计正常 (${duration}ms)`);
    console.log(`   总记录数: ${response.data.total}`);
    console.log(`   关键词数: ${response.data.stats?.length || 0}`);
    return true;
  } catch (error) {
    console.error(`❌ 缓存统计失败:`, error.response?.status, error.message);
    return false;
  }
}

async function testStreamingRefresh() {
  console.log('\n🚀 测试流式缓存刷新...');
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // 设置流式请求
    const config = {
      method: 'post',
      url: `${API_BASE_URL}/api/poi/cache/refresh`,
      data: {
        city: '上海市',
        keywords: ['星巴克']
      },
      responseType: 'stream',
      timeout: 180000, // 3分钟超时
      headers: {
        'Accept': 'application/json',
        'Connection': 'keep-alive'
      }
    };
    
    const req = axios.request(config);
    let progressUpdates = 0;
    let finalResult = null;
    let hasError = false;
    
    req.then(response => {
      console.log('✅ 流式响应连接建立');
      
      response.data.on('data', (chunk) => {
        try {
          const lines = chunk.toString().split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            const data = JSON.parse(line);
            
            if (data.status === 'started') {
              console.log(`   📝 ${data.message}`);
            } else if (data.status === 'progress') {
              progressUpdates++;
              console.log(`   ⏳ ${data.progress}% - ${data.message}`);
              if (data.currentKeyword) {
                console.log(`      当前关键词: ${data.currentKeyword}`);
              }
            } else if (data.status === 'completed') {
              finalResult = data;
              const duration = Date.now() - startTime;
              console.log(`✅ 刷新完成 (${duration}ms)`);
              console.log(`   总获取: ${finalResult.totalFetched}条`);
              console.log(`   关键词: ${finalResult.keywords.join(', ')}`);
              console.log(`   进度更新: ${progressUpdates}次`);
            } else if (data.status === 'error') {
              hasError = true;
              console.error(`❌ 刷新错误: ${data.message}`);
            }
          }
        } catch (parseError) {
          console.warn(`   ⚠️  无法解析响应: ${chunk.toString().substring(0, 100)}...`);
        }
      });
      
      response.data.on('end', () => {
        const duration = Date.now() - startTime;
        console.log(`📊 流式请求完成 (${duration}ms)`);
        
        if (!hasError && finalResult) {
          console.log('✅ 流式缓存刷新测试成功');
          resolve(true);
        } else {
          console.log('❌ 流式缓存刷新测试失败');
          resolve(false);
        }
      });
      
      response.data.on('error', (error) => {
        console.error('❌ 流式响应错误:', error.message);
        resolve(false);
      });
      
    }).catch(error => {
      const duration = Date.now() - startTime;
      console.error(`❌ 流式请求失败 (${duration}ms):`, error.code, error.message);
      resolve(false);
    });
    
    // 设置超时
    setTimeout(() => {
      console.log('⏰ 流式请求超时 (3分钟)');
      resolve(false);
    }, 180000);
  });
}

async function testConcurrentRequests() {
  console.log('\n🔄 测试并发请求...');
  
  const requests = [];
  const startTime = Date.now();
  
  // 并发发送5个请求
  for (let i = 0; i < 5; i++) {
    requests.push(
      axios.get(`${API_BASE_URL}/api/poi/cache/stats`, {
        timeout: 15000,
        headers: {
          'X-Request-ID': `test-${i}-${Date.now()}`
        }
      }).catch(error => ({ error: error.message, status: error.response?.status }))
    );
  }
  
  try {
    const results = await Promise.all(requests);
    const successCount = results.filter(r => !r.error).length;
    const duration = Date.now() - startTime;
    
    console.log(`✅ 并发测试完成 (${duration}ms)`);
    console.log(`   成功请求: ${successCount}/5`);
    
    if (successCount === 5) {
      console.log('✅ 所有并发请求成功');
      return true;
    } else {
      console.log('⚠️  部分请求失败');
      results.forEach((result, i) => {
        if (result.error) {
          console.log(`   请求${i}: ${result.status} - ${result.error}`);
        }
      });
      return false;
    }
  } catch (error) {
    console.error('❌ 并发测试失败:', error.message);
    return false;
  }
}

async function main() {
  console.log('🧪 Railway超时修复验证');
  console.log('==========================');
  console.log(`🌐 测试目标: ${API_BASE_URL}`);
  console.log(`⏰ 开始时间: ${new Date().toLocaleString()}`);
  
  const results = {
    cacheStats: false,
    streamingRefresh: false,
    concurrent: false
  };
  
  // 1. 测试基础接口
  results.cacheStats = await testCacheStats();
  
  // 2. 测试流式刷新
  if (results.cacheStats) {
    results.streamingRefresh = await testStreamingRefresh();
  }
  
  // 3. 测试并发请求
  results.concurrent = await testConcurrentRequests();
  
  // 4. 生成报告
  console.log('\n📋 测试结果报告');
  console.log('==================');
  console.log(`缓存统计: ${results.cacheStats ? '✅ 通过' : '❌ 失败'}`);
  console.log(`流式刷新: ${results.streamingRefresh ? '✅ 通过' : '❌ 失败'}`);
  console.log(`并发请求: ${results.concurrent ? '✅ 通过' : '❌ 失败'}`);
  
  const allPassed = Object.values(results).every(result => result);
  console.log(`\n🎯 总体结果: ${allPassed ? '✅ 所有测试通过' : '❌ 存在失败项目'}`);
  
  if (allPassed) {
    console.log('\n🎉 Railway超时问题已修复！');
  } else {
    console.log('\n⚠️  仍需进一步调试');
  }
  
  return allPassed;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testCacheStats, testStreamingRefresh, testConcurrentRequests };