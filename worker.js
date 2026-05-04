/**
 * Cloudflare Worker - 头像上传到 GitHub
 * 功能：接收前端上传的图片，转发到 GitHub 仓库，返回图片 URL
 */

// ========== 配置部分 ==========
const CONFIG = {
  // GitHub 配置
  GITHUB_TOKEN: 'your_github_token_here',  // ← 替换为你的 GitHub Personal Access Token
  GITHUB_OWNER: '34619',                   // ← GitHub 用户名
  GITHUB_REPO: 'xiaochen-noe',             // ← 仓库名
  GITHUB_BRANCH: 'main',                   // ← 分支名
  UPLOAD_DIR: 'avatars',                   // ← 上传目录
  
  // 允许的来源（CORS）
  ALLOWED_ORIGINS: ['https://34619.github.io', 'http://localhost:3000'],
  
  // 文件限制
  MAX_FILE_SIZE: 5 * 1024 * 1024,          // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
};

// ========== 主处理函数 ==========
export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // 路由处理
    if (url.pathname === '/upload-github' && request.method === 'POST') {
      return handleAvatarUpload(request);
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: '404 Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// ========== CORS 处理 ==========
function handleCORS(request) {
  const origin = request.headers.get('origin');
  const isAllowed = CONFIG.ALLOWED_ORIGINS.includes(origin);

  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': isAllowed ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  });
}

// ========== 头像上传处理 ==========
async function handleAvatarUpload(request) {
  try {
    // 1. 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file');
    const uid = formData.get('uid');

    // 2. 验证输入
    if (!file || !uid) {
      return createErrorResponse('缺少必要参数：file 和 uid', 400);
    }

    if (file.size > CONFIG.MAX_FILE_SIZE) {
      return createErrorResponse(`文件过大，最大 ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`, 400);
    }

    if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
      return createErrorResponse(`不支持的文件类型：${file.type}`, 400);
    }

    // 3. 生成文件名
    const timestamp = Date.now();
    const ext = getFileExtension(file.type);
    const filename = `${uid}_${timestamp}.${ext}`;
    const filepath = `${CONFIG.UPLOAD_DIR}/${filename}`;

    // 4. 读取文件内容
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    // 5. 上传到 GitHub
    const githubUrl = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${filepath}`;
    
    const uploadResponse = await fetch(githubUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${CONFIG.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: `Upload avatar for user ${uid}`,
        content: base64,
        branch: CONFIG.GITHUB_BRANCH,
      })
    });

    // 6. 处理 GitHub 响应
    if (!uploadResponse.ok) {
      const error = await uploadResponse.json();
      console.error('GitHub API Error:', error);
      return createErrorResponse(
        `GitHub API 错误: ${error.message || '上传失败'}`,
        uploadResponse.status
      );
    }

    const result = await uploadResponse.json();
    
    // 7. 构建 CDN URL（使用 jsdelivr 加速）
    const imageUrl = `https://cdn.jsdelivr.net/gh/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}@${CONFIG.GITHUB_BRANCH}/${filepath}`;

    // 8. 返回成功响应
    return createSuccessResponse({
      success: true,
      url: imageUrl,
      filename: filename,
      size: file.size,
      message: '头像上传成功'
    });

  } catch (error) {
    console.error('Upload Error:', error);
    return createErrorResponse(
      `服务器错误: ${error.message}`,
      500
    );
  }
}

// ========== 工具函数 ==========

/**
 * 获取文件扩展名
 */
function getFileExtension(mimeType) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return mimeMap[mimeType] || 'jpg';
}

/**
 * ArrayBuffer 转 Base64
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 创建成功响应
 */
function createSuccessResponse(data) {
  const origin = new URL(arguments.callee.caller.toString()).origin || '*';
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
  });
}

/**
 * 创建错误响应
 */
function createErrorResponse(message, status = 400) {
  return new Response(JSON.stringify({
    success: false,
    error: message
  }), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
  });
}
