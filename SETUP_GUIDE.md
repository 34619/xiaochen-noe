# Firebase + Cloudflare Worker 完整部署指南

## 📋 目录
1. [前置准备](#前置准备)
2. [Firebase 配置](#firebase-配置)
3. [Cloudflare Worker 部署](#cloudflare-worker-部署)
4. [本地测试](#本地测试)
5. [故障排查](#故障排查)
6. [安全建议](#安全建议)

---

## 前置准备

### 需要的账户和工具
- ✅ Firebase 项目（已有：`zhuce-31afe`）
- ✅ GitHub 账户和仓库
- ✅ Cloudflare 账户
- ✅ Wrangler CLI（Cloudflare 工具）
- ✅ Node.js 16+ 和 npm

### 安装 Wrangler

```bash
npm install -g wrangler
# 或
npm install wrangler
```

验证安装：
```bash
wrangler --version
```

---

## Firebase 配置

### 1. 登录 Firebase 控制台

访问：https://console.firebase.google.com

选择项目：`zhuce-31afe`

### 2. 添加授权域名

**步骤：**
1. 左侧菜单 → **Authentication** → **Settings**
2. 下滑找到 **Authorized domains**
3. 点击 **Add domain**
4. 输入你的 Cloudflare Worker 域名

**示例域名：**
```
xiaochen-noe.xiaochenai3028.workers.dev
```

### 3. 验证 Firebase 配置

你的 Firebase 配置应该如下所示（在 `index.html` 中）：

```javascript
const CONFIG = {
    firebase: {
        apiKey: "AIzaSyDyhvsQG_UbAcrvFrZKY2iDjI1xs49pw4c",
        authDomain: "zhuce-31afe.firebaseapp.com",  // ← 使用标准 Firebase 域名
        projectId: "zhuce-31afe",
        storageBucket: "zhuce-31afe.firebasestorage.app",
        messagingSenderId: "712987001352",
        appId: "1:712987001352:web:19ac82dcb317dc6daf87bd",
        measurementId: "G-S95ZVB7YFV"
    }
};
```

---

## Cloudflare Worker 部署

### 1. 创建 GitHub Personal Access Token

用于上传头像到 GitHub

**步骤：**
1. 访问：https://github.com/settings/tokens
2. 点击 **Generate new token (classic)**
3. 设置 Token 名称：`Firebase-Avatar-Upload`
4. 选择权限范围：
   - ✅ `repo` (完整仓库访问)
   - ❌ 其他可不选
5. 点击 **Generate token**
6. **立即复制**（刷新后就看不到了！）

**保存你的 Token**（待会儿要用）

### 2. 初始化 Wrangler 项目

```bash
# 进入你的项目目录
cd xiaochen-noe

# 登录 Cloudflare
wrangler login

# 会自动打开浏览器进行授权
```

### 3. 配置 wrangler.jsonc

查看并确保配置正确：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "xiaochen-noe",
  "compatibility_date": "2026-05-04",
  "observability": {
    "enabled": true
  },
  "assets": {
    "directory": "."
  },
  "compatibility_flags": [
    "nodejs_compat"
  ]
}
```

### 4. 创建 Worker 代码文件

**选项 A：使用示例代码（推荐）**

我们已经提供了 `worker-example.js`，复制内容到 `src/index.js`：

```bash
mkdir -p src
cp worker-example.js src/index.js
```

**选项 B：手动创建**

创建 `src/index.js` 文件，使用本指南末尾的完整 Worker 代码。

### 5. 设置环境变量（Secrets）

```bash
# 设置 GitHub Token
wrangler secret put GITHUB_TOKEN
# 粘贴你的 GitHub Personal Access Token，按 Enter

# 设置 GitHub 仓库
wrangler secret put GITHUB_REPO
# 输入：你的用户名/仓库名
# 例如：34619/xiaochen-noe
```

**验证设置：**
```bash
wrangler secret list
```

应该显示：
```
🔐 Secrets:
- GITHUB_TOKEN
- GITHUB_REPO
```

### 6. 部署 Worker

```bash
wrangler deploy
```

**成功输出示例：**
```
✅ Uploaded src/index.js
✅ Published xiaochen-noe to xiaochen-noe.xiaochenai3028.workers.dev
```

记下你的 **Worker URL**：
```
https://xiaochen-noe.xiaochenai3028.workers.dev
```

### 7. 更新 index.html 配置

打开 `index.html`，找到配置部分（第 350 行左右），更新：

```javascript
const CONFIG = {
    // 改成你的实际 Worker 域名
    workerBase: 'https://xiaochen-noe.xiaochenai3028.workers.dev',
    // ...
};
```

---

## 本地测试

### 1. 启动本地开发服务器

```bash
wrangler dev
```

输出示例：
```
✨ Using wrangler 3.x.x
⛅ wrangler dev now listening on http://localhost:8787
```

### 2. 测试 CORS 预检

在另一个终端中：

```bash
curl -i -X OPTIONS https://localhost:8787/upload-github \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
```

应该看到 CORS 响应头。

### 3. 测试文件上传

```bash
# 创建一个测试图片
echo "test" > test.txt

# 上传测试
curl -X POST http://localhost:8787/upload-github \
  -F "file=@test.txt" \
  -F "uid=test-user-123"
```

期望响应：
```json
{
  "success": true,
  "url": "https://raw.githubusercontent.com/...",
  "filename": "avatar_test-user-123_1234567890.txt",
  "message": "头像上传成功"
}
```

### 4. 在浏览器中测试

1. 打开 `index.html`（本地或部署后的地址）
2. 点击 **登录 / 注册**
3. 注册新账户
4. 进入 **个人资料** → **编辑资料**
5. 上传头像
6. 检查浏览器控制台（F12）是否有错误

---

## 故障排查

### 问题 1："无法连接到 Worker"

**症状：** 上传头像时显示错误

**排查步骤：**

1. 验证 Worker 部署
   ```bash
   wrangler deploy --dry-run
   ```

2. 检查 Worker 地址
   - 访问：`https://你的Worker地址/upload-github`
   - 应该看到 HTTP 404 或 405 错误（这是正常的，说明 Worker 在运行）

3. 检查 `index.html` 中的 `workerBase` 配置
   ```javascript
   console.log(CONFIG.workerBase);  // 应该输出正确的 URL
   ```

### 问题 2："上传超时"

**症状：** 上传 15 秒后失败

**原因和解决：**

- **网络太慢**：检查网络连接，或增加超时时间
- **GitHub API 响应慢**：GitHub 偶尔会很慢，稍后重试
- **文件过大**：确保图片 < 5MB

**修改超时时间：**

编辑 `index.html`，找到 `uploadAvatarToWorker` 函数：

```javascript
const timeoutId = setTimeout(() => controller.abort(), 30000); // 改成 30 秒
```

### 问题 3："CORS 错误"

**症状：** 浏览器报错 "Access to XMLHttpRequest at '...' has been blocked by CORS policy"

**排查步骤：**

1. 检查 Worker 代码中的 CORS 头
   ```javascript
   'Access-Control-Allow-Origin': '*',  // 应该有这一行
   ```

2. 重新部署 Worker
   ```bash
   wrangler deploy
   ```

3. 清除浏览器缓存并刷新页面
   - Windows/Linux: `Ctrl + Shift + Delete`
   - Mac: `Cmd + Shift + Delete`

### 问题 4："GitHub 上传失败"

**症状：** 浏览器显示 "上传到 GitHub 失败"

**排查步骤：**

1. 检查 GitHub Token
   ```bash
   wrangler secret list
   ```

2. 验证 Token 权限
   - 访问：https://github.com/settings/tokens
   - 检查 token 是否包含 `repo` 权限

3. 检查仓库权限
   ```bash
   # 使用 curl 测试
   curl -H "Authorization: token YOUR_TOKEN" \
     https://api.github.com/user/repos
   ```

4. 检查仓库名称
   - 应该格式：`username/repo`
   - 例如：`34619/xiaochen-noe`

5. 查看 Worker 日志
   ```bash
   wrangler tail
   ```

### 问题 5：Firebase 认证失败

**症状：** 登录/注册时显示错误

**排查步骤：**

1. 检查 Firebase authDomain
   ```javascript
   console.log(firebase.auth().currentUser?.displayName);
   ```

2. 验证授权域名
   - Firebase 控制台 → Authentication → Settings
   - 确保你的 Worker 域名在列表中

3. 清除本地存储
   ```javascript
   localStorage.clear();
   location.reload();
   ```

### 问题 6：查看详细日志

**使用 Wrangler Tail：**

```bash
# 实时查看 Worker 日志
wrangler tail

# 指定日志级别
wrangler tail --status ok,error
```

**浏览器控制台：**

按 `F12` 打开开发者工具，查看 Console 和 Network 标签

---

## 安全建议

### 1. 保护 GitHub Token

✅ **已完成**：使用 Wrangler Secrets 存储

- Token 从不在代码中存储
- 不要在 GitHub 中提交包含 Token 的文件

### 2. 限制文件大小

在 `worker-example.js` 中已实现：
```javascript
const maxSize = 5 * 1024 * 1024;  // 5MB
```

### 3. 验证文件类型

已实现：
```javascript
if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
    return error('仅支持图片格式');
}
```

### 4. Rate Limiting（可选）

在 Worker 中添加：
```javascript
// 使用 Cloudflare KV 存储请求计数
const requests = await env.RATE_LIMIT.get(uid) || '0';
if (parseInt(requests) > 10) {  // 每小时最多 10 个请求
    return jsonResponse({ error: '请求过于频繁' }, 429);
}
```

### 5. 验证用户身份

**推荐**：添加 Firebase ID Token 验证

```javascript
// 在 Worker 中验证 Firebase Token
async function verifyFirebaseToken(token, projectId) {
    const response = await fetch(
        `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyIdToken?key=YOUR_API_KEY`,
        {
            method: 'POST',
            body: JSON.stringify({ idToken: token })
        }
    );
    return response.json();
}
```

---

## 常用命令

```bash
# 部署
wrangler deploy

# 本地开发
wrangler dev

# 查看日志
wrangler tail

# 设置/更新 Secret
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO

# 列出所有 Secret
wrangler secret list

# 删除 Secret
wrangler secret delete GITHUB_TOKEN

# 查看配置
wrangler info

# 删除 Worker
wrangler delete
```

---

## 完整 Worker 代码

完整的 Worker 代码已保存在 `worker-example.js` 中。

关键点：
- ✅ CORS 处理
- ✅ 文件验证（类型、大小）
- ✅ GitHub API 集成
- ✅ 详细的错误处理
- ✅ 支持多种图片格式

---

## 后续改进

1. **数据库存储**：使用 Cloudflare KV 或 D1 存储头像 URL 映射
2. **图片优化**：使用 Cloudflare Image Resizing 优化图片
3. **缓存**：配置 Cache-Control 头加快访问
4. **监控**：设置 Cloudflare Analytics 监控性能
5. **备份**：定期备份 GitHub 中的头像

---

## 常见问题 (FAQ)

**Q: Worker 域名会变吗？**
A: 不会。Cloudflare 为每个 Worker 分配一个永久的 `*.workers.dev` 域名。

**Q: 如何修改 Worker 域名？**
A: 可以绑定自定义域名，但需要 Cloudflare 付费计划。

**Q: GitHub 仓库满了怎么办？**
A: 可以定期清理旧的头像文件，或使用多个仓库。

**Q: 如何备份头像？**
A: GitHub 会自动保留版本历史，可以随时恢复。

**Q: 如何限制上传权限？**
A: 可以验证 Firebase ID Token（见安全建议部分）。

---

## 获取帮助

如果遇到问题：

1. 📖 查看本指南的**故障排查**部分
2. 🔍 检查浏览器控制台和 Worker 日志
3. 🌐 Cloudflare 文档：https://developers.cloudflare.com
4. 🔥 Firebase 文档：https://firebase.google.com/docs

---

**最后更新：** 2026-05-05
