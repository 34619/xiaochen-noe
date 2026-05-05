/**
 * Cloudflare Worker - Firebase 头像上传示例
 * 功能：接收前端上传的图片，转发到 GitHub 并返回 URL
 * 
 * 使用说明：
 * 1. 创建 GitHub Personal Access Token (classic)
 * 2. 在 Wrangler 中设置环境变量：
 *    wrangler secret put GITHUB_TOKEN
 *    wrangler secret put GITHUB_REPO (格式: username/repo)
 * 3. 部署此 Worker
 */

export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 只处理 POST 请求
    if (request.method !== 'POST') {
      return jsonResponse(
        { error: '仅支持 POST 请求' },
        400
      );
    }

    const url = new URL(request.url);

    // 头像上传端点
    if (url.pathname === '/upload-github') {
      return handleUploadGithub(request, env);
    }

    return jsonResponse(
      { error: '未找到该端点' },
      404
    );
  },
};

/**
 * 处理头像上传到 GitHub
 */
async function handleUploadGithub(request, env) {
  try {
    // 验证环境变量
    if (!env.GITHUB_TOKEN) {
      console.error('缺少 GITHUB_TOKEN 环境变量');
      return jsonResponse(
        { error: '服务器配置错误：缺少 GITHUB_TOKEN' },
        500
      );
    }

    if (!env.GITHUB_REPO) {
      console.error('缺少 GITHUB_REPO 环境变量');
      return jsonResponse(
        { error: '服务器配置错误：缺少 GITHUB_REPO' },
        500
      );
    }

    // 解析表单数据
    const formData = await request.formData();
    const file = formData.get('file');
    const uid = formData.get('uid');

    // 验证必要参数
    if (!file) {
      return jsonResponse(
        { error: '缺少文件' },
        400
      );
    }

    if (!uid) {
      return jsonResponse(
        { error: '缺少用户 ID (uid)' },
        400
      );
    }

    // 验证文件类型
    const mimeType = file.type;
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
      return jsonResponse(
        { error: '仅支持图片格式：JPEG, PNG, GIF, WebP' },
        400
      );
    }

    // 验证文件大小（最大 5MB）
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return jsonResponse(
        { error: '文件过大，最大支持 5MB' },
        400
      );
    }

    // 读取文件数据
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // 生成文件名
    const timestamp = Date.now();
    const ext = getFileExtension(mimeType);
    const filename = `avatar_${uid}_${timestamp}.${ext}`;
    const filepath = `avatars/${filename}`;

    // 上传到 GitHub
    const uploadResult = await uploadToGithub(
      env.GITHUB_TOKEN,
      env.GITHUB_REPO,
      filepath,
      base64Data,
      `上传头像 - ${uid}`
    );

    if (!uploadResult.success) {
      console.error('GitHub 上传失败:', uploadResult.error);
      return jsonResponse(
        { error: '上传到 GitHub 失败：' + uploadResult.error },
        500
      );
    }

    // 返回成功响应
    return jsonResponse(
      {
        success: true,
        url: uploadResult.url,
        filename: filename,
        message: '头像上传成功',
      },
      200
    );

  } catch (error) {
    console.error('上传处理错误:', error);
    return jsonResponse(
      { error: '服务器错误：' + error.message },
      500
    );
  }
}

/**
 * 上传文件到 GitHub
 */
async function uploadToGithub(token, repo, filepath, base64Data, message) {
  try {
    const url = `https://api.github.com/repos/${repo}/contents/${filepath}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Cloudflare-Worker',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: message,
        content: base64Data,
        branch: 'main',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || `HTTP ${response.status}`,
      };
    }

    // 返回原始文件 URL（GitHub 的 raw content URL）
    const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${filepath}`;

    return {
      success: true,
      url: rawUrl,
      commit: data.commit?.sha || 'unknown',
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 根据 MIME 类型获取文件扩展名
 */
function getFileExtension(mimeType) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return mimeMap[mimeType] || 'jpg';
}

/**
 * 返回 JSON 响应
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}