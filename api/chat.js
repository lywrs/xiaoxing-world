// Vercel Edge Runtime: 大模型对话流式代理
// 把前端 POST /api/chat 透传到 GLM / DeepSeek 等 OpenAI 兼容接口
// 密钥从环境变量读取，前端不接触密钥

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    return jsonResponse(503, {
      error: 'no_key',
      message: '未配置 API Key（请在 Vercel 环境变量 LLM_API_KEY 中填入）',
    });
  }

  const baseUrl = (process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'glm-4-flash';

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return jsonResponse(400, { error: 'bad_request', message: 'invalid JSON: ' + String(e) });
  }

  const messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse(400, { error: 'bad_request', message: 'messages 为空' });
  }

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.8,
        max_tokens: 800,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return jsonResponse(upstream.status, {
        error: 'upstream_error',
        message: text.slice(0, 500),
      });
    }

    // 流式透传 SSE：把上游的 ReadableStream 直接作为响应体
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'close',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return jsonResponse(502, {
      error: 'upstream_unreachable',
      message: String(e),
    });
  }
}

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
