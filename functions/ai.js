// functions/ai.js - 阿里云 ESA 标准格式
export default {
  async fetch(request, env, ctx) {
    // 设置 CORS 头
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      // 从环境变量获取 API Key - 阿里云 DashScope API Key
      const apiKey = env.API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ 
          error: 'API Key not configured' 
        }), {
          status: 500,
          headers
        });
      }

      const requestBody = await request.json();
      
      console.log('AI Request:', JSON.stringify(requestBody));

      // 阿里云 DashScope API 端点
      const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...requestBody,
          model: requestBody.model || "deepseek-v3", // 默认使用 deepseek-v3
          stream: requestBody.stream !== undefined ? requestBody.stream : true // 默认使用流式
        })
      });

      // 处理流式和非流式响应
      if (requestBody.stream) {
        // 流式响应
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        
        // 转发流
        response.body.pipeTo(new WritableStream({
          write(chunk) {
            writer.write(chunk);
          },
          close() {
            writer.close();
          },
          abort(err) {
            writer.abort(err);
          }
        })).catch(console.error);
        
        return new Response(readable, {
          status: 200,
          headers: {
            ...headers,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        });
      } else {
        // 非流式响应
        const data = await response.json();
        
        return new Response(JSON.stringify(data), {
          status: response.status,
          headers
        });
      }

    } catch (error) {
      console.error('AI Function Error:', error);
      return new Response(JSON.stringify({
        error: error.message,
        code: "INTERNAL_ERROR",
        details: "AI服务暂时不可用，请检查API配置"
      }), {
        status: 500,
        headers
      });
    }
  }
};
