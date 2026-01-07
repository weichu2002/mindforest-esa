// functions/ai.js - 阿里云 ESA 标准格式
export default {
  async fetch(request, env, ctx) {
    // 设置 CORS 头
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers
      });
    }

    try {
      // 从环境变量获取 API Key
      const apiKey = env.API_KEY || "sk-26d09fa903034902928ae380a56ecfd3";
      const requestBody = await request.json();

      // 调用 DeepSeek API
      const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      
      return new Response(JSON.stringify(data), {
        status: 200,
        headers
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: error.message,
        code: "INTERNAL_ERROR"
      }), {
        status: 500,
        headers
      });
    }
  }
};
