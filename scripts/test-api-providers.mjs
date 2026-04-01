#!/usr/bin/env node

/**
 * Monkey API 兼容性测试脚本
 * 测试各家 OpenAI 兼容接口是否能正常响应
 *
 * 用法: node scripts/test-api-providers.mjs
 */

// ─── 配置 ──────────────────────────────────────────────────────────────────────

const PROVIDERS = {
  qwen: {
    name: '通义千问 (Qwen)',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKey: 'sk-ae0d0943acc04872848fdce5cfb82948',
    model: 'qwen-plus',
  },
  openrouter: {
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: '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',
    model: 'google/gemini-2.0-flash-001',
  },
  kimi: {
    name: 'KIMI (Moonshot)',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    apiKey: 'sk-KwvZPLSG8o2P0GA4vTDyAe9snoSxxQgWwa87VAJvgQKejKoF',
    model: 'moonshot-v1-8k',
  },
  glm: {
    name: '智谱 GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiKey: '1645e5ea3cdd4bed811cfc60d5ecd071.IgJtKVqHSLSqiOaT',
    model: 'glm-4-flash',
  },
};

// Monkey 实际使用的 system prompt（简化版）
const SYSTEM_PROMPT = `You are a userscript generator. Respond in this exact format:
<DESCRIPTION>描述</DESCRIPTION>
<SCRIPT>代码</SCRIPT>`;

const USER_MSG = '在百度首页搜索框里自动填入"hello world"并点击搜索';

// ─── 测试逻辑 ──────────────────────────────────────────────────────────────────

async function testProvider(key, config) {
  const { name, endpoint, apiKey, model } = config;
  const label = `[${name}]`;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🧪 ${label} 开始测试`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Model:    ${model}`);

  // 测试1: 连通性测试（与 Monkey options 页一致）
  console.log(`\n   [1/2] 连通性测试 (max_tokens: 1)...`);
  try {
    const start = Date.now();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const elapsed = Date.now() - start;

    if (res.ok) {
      console.log(`   ✅ 连通成功 · 延迟 ${elapsed}ms`);
    } else {
      const text = await res.text().catch(() => '');
      console.log(`   ❌ 连通失败 · HTTP ${res.status}`);
      console.log(`   响应: ${text.slice(0, 200)}`);
      return { key, name, status: 'connect_fail', httpStatus: res.status };
    }
  } catch (err) {
    console.log(`   ❌ 网络错误: ${err.message}`);
    return { key, name, status: 'network_error', error: err.message };
  }

  // 测试2: 流式生成测试（模拟 Monkey 实际调用）
  console.log(`\n   [2/2] 流式生成测试 (stream: true)...`);
  try {
    const start = Date.now();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: USER_MSG },
        ],
        stream: true,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.log(`   ❌ 请求失败 · HTTP ${res.status}`);
      console.log(`   响应: ${text.slice(0, 200)}`);
      return { key, name, status: 'stream_fail', httpStatus: res.status };
    }

    // 读取 SSE 流
    let accumulated = '';
    let chunkCount = 0;
    let firstTokenMs = null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta && firstTokenMs === null) firstTokenMs = Date.now() - start;
          accumulated += delta;
          chunkCount++;
        } catch {
          // 忽略格式异常的 SSE 行
        }
      }
    }

    const totalMs = Date.now() - start;

    // 检查 Monkey 要求的格式
    const hasDescription = /<DESCRIPTION>[\s\S]*?<\/DESCRIPTION>/.test(accumulated);
    const hasScript = /<SCRIPT>[\s\S]*?<\/SCRIPT>/.test(accumulated);
    const monkeyCompatible = hasDescription && hasScript;

    console.log(`   ✅ 流式完成 · 耗时 ${totalMs}ms · 首 token ${firstTokenMs}ms · ${chunkCount} chunks`);
    console.log(`   响应长度: ${accumulated.length} 字符`);
    console.log(`   <DESCRIPTION>: ${hasDescription ? '✅' : '❌'}`);
    console.log(`   <SCRIPT>:      ${hasScript ? '✅' : '❌'}`);
    console.log(`   Monkey 兼容:   ${monkeyCompatible ? '✅ 完全兼容' : '⚠️  格式不匹配，Monkey 会报错'}`);

    if (!monkeyCompatible) {
      console.log(`   前200字符预览: ${accumulated.slice(0, 200)}`);
    }

    return {
      key, name, status: monkeyCompatible ? 'pass' : 'format_mismatch',
      totalMs, firstTokenMs, chunkCount, length: accumulated.length,
      hasDescription, hasScript, monkeyCompatible,
    };
  } catch (err) {
    console.log(`   ❌ 流式错误: ${err.message}`);
    return { key, name, status: 'stream_error', error: err.message };
  }
}

// ─── 主函数 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Monkey API 兼容性测试                        ║');
  console.log('║     测试各家 OpenAI 兼容接口 + 流式响应           ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const results = [];

  // 逐个测试（避免并发触发限流）
  for (const [key, config] of Object.entries(PROVIDERS)) {
    const result = await testProvider(key, config);
    results.push(result);
  }

  // 汇总
  console.log(`\n${'═'.repeat(50)}`);
  console.log('📊 测试结果汇总');
  console.log(`${'═'.repeat(50)}`);

  const passed = results.filter(r => r.status === 'pass');
  const failed = results.filter(r => r.status !== 'pass');

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : '❌';
    const detail = r.status === 'pass'
      ? `${r.totalMs}ms · Monkey 兼容`
      : r.status;
    console.log(`  ${icon} ${r.name.padEnd(20)} ${detail}`);
  }

  console.log(`\n通过: ${passed.length}/${results.length}`);

  if (failed.length > 0) {
    console.log('\n⚠️  未通过的服务商:');
    for (const r of failed) {
      console.log(`  - ${r.name}: ${r.error || r.httpStatus || r.status}`);
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main();
