// functions/collab.js - 阿里云 ESA 协作后端
// 需要配合 KV 存储使用

const rooms = new Map(); // 临时存储房间数据

export default {
  async fetch(request, env, ctx) {
    // 设置 CORS 头
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || (await request.json())?.action;

    try {
      switch (action) {
        case 'create_room':
          return await handleCreateRoom(request, env);
        case 'join_room':
          return await handleJoinRoom(request, env);
        case 'leave_room':
          return await handleLeaveRoom(request, env);
        case 'send_operation':
          return await handleSendOperation(request, env);
        case 'get_updates':
          return await handleGetUpdates(request, env);
        default:
          return new Response(JSON.stringify({ error: '未知操作' }), {
            status: 400,
            headers
          });
      }
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

// 创建房间
async function handleCreateRoom(request, env) {
  const { roomId, roomData, snapshot, userId, userName } = await request.json();
  
  // 存储房间数据
  const roomKey = `room:${roomId}`;
  const room = {
    ...roomData,
    snapshot,
    operations: [],
    lastUpdated: Date.now()
  };
  
  // 使用环境变量中的 KV 存储（如果可用）
  if (env.ROOMS_KV) {
    await env.ROOMS_KV.put(roomKey, JSON.stringify(room));
  } else {
    // 临时内存存储
    rooms.set(roomId, room);
  }
  
  return new Response(JSON.stringify({
    success: true,
    roomId,
    message: '房间创建成功'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// 加入房间
async function handleJoinRoom(request, env) {
  const { roomId, userId, userName, userData } = await request.json();
  
  let room;
  const roomKey = `room:${roomId}`;
  
  if (env.ROOMS_KV) {
    const roomData = await env.ROOMS_KV.get(roomKey);
    if (!roomData) {
      return new Response(JSON.stringify({ error: '房间不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    room = JSON.parse(roomData);
  } else {
    room = rooms.get(roomId);
    if (!room) {
      return new Response(JSON.stringify({ error: '房间不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // 添加用户到房间
  const existingUserIndex = room.activeUsers.findIndex(u => u.id === userId);
  if (existingUserIndex === -1) {
    room.activeUsers.push(userData);
  }
  
  room.lastUpdated = Date.now();
  
  // 更新存储
  if (env.ROOMS_KV) {
    await env.ROOMS_KV.put(roomKey, JSON.stringify(room));
  } else {
    rooms.set(roomId, room);
  }
  
  return new Response(JSON.stringify({
    success: true,
    room: {
      id: room.id,
      name: room.name,
      method: room.method,
      createdBy: room.createdBy,
      createdByName: room.createdByName,
      activeUsers: room.activeUsers
    },
    snapshot: room.snapshot,
    message: '加入房间成功'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 离开房间
async function handleLeaveRoom(request, env) {
  const { roomId, userId } = await request.json();
  
  let room;
  const roomKey = `room:${roomId}`;
  
  if (env.ROOMS_KV) {
    const roomData = await env.ROOMS_KV.get(roomKey);
    if (!roomData) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    room = JSON.parse(roomData);
  } else {
    room = rooms.get(roomId);
    if (!room) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // 移除用户
  room.activeUsers = room.activeUsers.filter(u => u.id !== userId);
  room.lastUpdated = Date.now();
  
  // 如果房间为空，清理房间
  if (room.activeUsers.length === 0) {
    if (env.ROOMS_KV) {
      await env.ROOMS_KV.delete(roomKey);
    } else {
      rooms.delete(roomId);
    }
  } else {
    // 更新存储
    if (env.ROOMS_KV) {
      await env.ROOMS_KV.put(roomKey, JSON.stringify(room));
    } else {
      rooms.set(roomId, room);
    }
  }
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 发送操作
async function handleSendOperation(request, env) {
  const { roomId, userId, operation } = await request.json();
  
  let room;
  const roomKey = `room:${roomId}`;
  
  if (env.ROOMS_KV) {
    const roomData = await env.ROOMS_KV.get(roomKey);
    if (!roomData) {
      return new Response(JSON.stringify({ error: '房间不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    room = JSON.parse(roomData);
  } else {
    room = rooms.get(roomId);
    if (!room) {
      return new Response(JSON.stringify({ error: '房间不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // 添加操作到历史
  if (!room.operations) {
    room.operations = [];
  }
  
  room.operations.push({
    ...operation,
    timestamp: Date.now(),
    userId,
    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  });
  
  // 限制操作历史大小
  if (room.operations.length > 100) {
    room.operations = room.operations.slice(-50);
  }
  
  room.lastUpdated = Date.now();
  
  // 更新存储
  if (env.ROOMS_KV) {
    await env.ROOMS_KV.put(roomKey, JSON.stringify(room));
  } else {
    rooms.set(roomId, room);
  }
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 获取更新
async function handleGetUpdates(request, env) {
  const roomId = request.url.searchParams.get('roomId');
  const userId = request.url.searchParams.get('userId');
  const lastSync = parseInt(request.url.searchParams.get('lastSync') || '0');
  
  let room;
  const roomKey = `room:${roomId}`;
  
  if (env.ROOMS_KV) {
    const roomData = await env.ROOMS_KV.get(roomKey);
    if (!roomData) {
      return new Response(JSON.stringify({ error: '房间不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    room = JSON.parse(roomData);
  } else {
    room = rooms.get(roomId);
    if (!room) {
      return new Response(JSON.stringify({ error: '房间不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // 获取上次同步后的新操作
  const updates = (room.operations || []).filter(op => 
    op.timestamp > lastSync && op.userId !== userId
  );
  
  return new Response(JSON.stringify({
    success: true,
    updates,
    users: room.activeUsers || [],
    lastSync: Date.now()
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
