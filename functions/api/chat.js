// Cloudflare Pages Functions: 大模型对话流式代理
// 路由: POST /api/chat -> 转发到 GLM / DeepSeek 等 OpenAI 兼容接口
// 密钥从 Cloudflare Pages 环境变量读取（env.LLM_API_KEY），前端不接触密钥

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS 预检（POST 路径不会触发 OPTIONS，但保险起见）
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const apiKey = env && env.LLM_API_KEY;
  if (!apiKey) {
    return jsonResponse(503, {
      error: 'no_key',
      message: '未配置 API Key（请在 Cloudflare Pages 环境变量 LLM_API_KEY 中填入）',
    }, cors);
  }

  const baseUrl = (env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
  const model = env.LLM_MODEL || 'glm-4-flash';

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(400, { error: 'bad_request', message: 'invalid JSON: ' + String(e) }, cors);
  }

  const messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse(400, { error: 'bad_request', message: 'messages 为空' }, cors);
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
      }, cors);
    }

    // 流式透传 SSE：直接把上游的 ReadableStream 作为响应体
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...cors,
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
    }, cors);
  }
}

// OPTIONS 预检（CORS）
export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function jsonResponse(status, obj, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
