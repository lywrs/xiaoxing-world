// Vercel Edge Runtime: 大模型状态探测
// 前端 GET /api/status -> {llm: bool}，据此显示在线徽标

export const config = {
  runtime: 'edge',
};

export default function handler() {
  return new Response(JSON.stringify({ llm: !!process.env.LLM_API_KEY }), {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
