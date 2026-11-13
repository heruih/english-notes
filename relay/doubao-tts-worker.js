const UPSTREAM = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';

function cors(origin, allowed) {
  const value = origin && origin === allowed ? origin : allowed;
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || 'https://heruih.github.io';
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, allowed);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers });
    if (origin && origin !== allowed) return new Response('Origin Not Allowed', { status: 403, headers });
    if (!env.DOUBAO_API_KEY) return new Response(JSON.stringify({ code: 500, message: 'DOUBAO_API_KEY 未配置' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });

    let input;
    try { input = await request.json(); } catch (_) {
      return new Response(JSON.stringify({ code: 400, message: '请求 JSON 无效' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const params = input && input.req_params;
    if (!params || !String(params.text || '').trim() || !String(params.speaker || '').trim()) {
      return new Response(JSON.stringify({ code: 400, message: '缺少 req_params.text 或 req_params.speaker' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': env.DOUBAO_API_KEY,
        'X-Api-Resource-Id': String(env.DOUBAO_RESOURCE_ID || 'seed-tts-2.0')
      },
      body: JSON.stringify({ req_params: params })
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...headers, 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' }
    });
  }
};
