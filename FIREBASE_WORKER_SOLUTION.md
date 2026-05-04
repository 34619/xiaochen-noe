# Firebase Worker 集成完整解决方案

## 🔴 当前问题分析

### 1. **登录错误**
```
FirebaseError: Firebase: Error (auth/invalid-login-credentials)
```
**原因**:
- Firebase authDomain 配置错误（设为 `api.xiaochen.com` 而非实际 Firebase 域名）
- CORS 阻止跨域请求

### 2. **资料更新失败**
```
FirebaseError: Firebase: Photo URL too long. (auth/invalid-profile-attribute)
```
**原因**:
- Worker 返回的 URL 过长
- Firebase 头像 URL 限制约 2000 字符

### 3. **存储访问被阻止**
```
Tracking Prevention blocked access to storage
```
**原因**:
- localStorage/sessionStorage 访问被浏览器隐私保护阻止
- 需要使用 IndexedDB 或 cookie

---

## ✅ 完整解决方案

### 第一步：修正 Firebase 配置

```javascript
const CONFIG = {
    // Worker 域名
    workerBase: 'https://your-worker.com',  // 改成你的实际 Worker 域名
    
    // Firebase 配置 - 从 Firebase Console 复制正确的配置
    firebase: {
        apiKey: "AIzaSyDyhvsQG_UbAcrvFrZKY2iDjI1xs49pw4c",
        authDomain: "zhuce-31afe.firebaseapp.com",  // ⭐️ 改为正确的 Firebase 域名
        projectId: "zhuce-31afe",
        storageBucket: "zhuce-31afe.firebasestorage.app",
        messagingSenderId: "712987001352",
        appId: "1:712987001352:web:19ac82dcb317dc6daf87bd",
        measurementId: "G-S95ZVB7YFV"
    }
};
```

### 第二步：改进头像上传逻辑

在 `uploadAvatarToWorker` 函数中：

```javascript
async function uploadAvatarToWorker(file, uid) {
    // ✅ 验证文件大小
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
        return { 
            success: false, 
            error: '文件过大（最大 5MB）'
        };
    }

    // ✅ 验证文件类型
    if (!file.type.startsWith('image/')) {
        return { 
            success: false, 
            error: '只支持图片格式'
        };
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('uid', uid);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

        const response = await fetch(`${CONFIG.workerBase}/upload-github`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
            mode: 'cors',
            credentials: 'include'  // ⭐️ 包含跨域凭证
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.success && result.url) {
            // ✅ 检查 URL 长度
            if (result.url.length > 2000) {
                return { 
                    success: false, 
                    error: '返回的 URL 过长，无法保存到 Firebase'
                };
            }
            return { success: true, url: result.url };
        } else {
            return { 
                success: false, 
                error: result.error || '服务器返回错误'
            };
        }
    } catch (error) {
        console.error('头像上传错误:', error);
        
        if (error.name === 'AbortError') {
            return { 
                success: false, 
                error: '上传超时，请检查网络和 Worker 地址' 
            };
        }
        
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            return { 
                success: false, 
                error: `无法连接到 Worker: ${CONFIG.workerBase}<br/>请检查:<br/>1. Worker 域名是否正确<br/>2. Worker 是否已部署<br/>3. 跨域配置是否正确` 
            };
        }

        return { 
            success: false, 
            error: error.message || '上传过程出错'
        };
    }
}
```

### 第三步：修复存储访问问题

```javascript
// 使用 IndexedDB 代替 localStorage
class SecureStorage {
    constructor() {
        this.dbName = 'xiaochen-noe-db';
        this.storeName = 'profiles';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async set(key, value) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(value, key);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async get(key) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }
}

const storage = new SecureStorage();

// 使用示例
async function saveExtraProfile(uid, data) {
    try {
        await storage.set(`profile_${uid}`, JSON.stringify(data));
    } catch (error) {
        console.warn('存储保存失败，使用内存存储', error);
        // 回退到内存存储
    }
}

async function loadExtraProfile(uid) {
    const defaultProfile = { age: '', gender: '', bio: '', interests: '' };
    try {
        const stored = await storage.get(`profile_${uid}`);
        return stored ? JSON.parse(stored) : defaultProfile;
    } catch (error) {
        console.warn('存储读取失败', error);
        return defaultProfile;
    }
}
```

### 第四步：改进 Firebase 错误处理

```javascript
authActionBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    errorMsg.textContent = '';
    successMsg.textContent = '';

    if (!email || !password) {
        errorMsg.textContent = '请填写邮箱和密码';
        return;
    }

    // ✅ 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        errorMsg.textContent = '邮箱格式不正确';
        return;
    }

    try {
        authActionBtn.disabled = true;
        authActionBtn.textContent = currentMode === 'login' ? '登录中...' : '注册中...';

        if (currentMode === 'login') {
            await auth.signInWithEmailAndPassword(email, password);
            successMsg.textContent = '登录成功！';
        } else if (currentMode === 'register') {
            if (password.length < 6) {
                throw new Error('密码应至少 6 位');
            }
            await auth.createUserWithEmailAndPassword(email, password);
            successMsg.textContent = '注册成功！';
        }
        
        setTimeout(hideAuthModal, 1000);
    } catch (error) {
        console.error('认证错误:', error);
        
        const errorMap = {
            'auth/email-already-in-use': '该邮箱已被注册',
            'auth/user-not-found': '账户不存在',
            'auth/wrong-password': '密码错误',
            'auth/invalid-email': '邮箱格式不正确',
            'auth/weak-password': '密码应至少 6 位',
            'auth/invalid-login-credentials': '邮箱或密码错误',
            'auth/network-request-failed': '网络错误，请检查连接',
            'auth/too-many-requests': '尝试次数过多，请稍后再试'
        };
        
        errorMsg.textContent = errorMap[error.code] || error.message;
    } finally {
        authActionBtn.disabled = false;
        authActionBtn.textContent = currentMode === 'login' ? '登录' : '注册';
    }
});
```

### 第五步：Worker 端 CORS 配置

如果使用 Cloudflare Worker，在 `wrangler.toml` 中配置：

```toml
[env.production]
routes = [
  { pattern = "api.xiaochen.com/*", zone_name = "xiaochen.com" }
]

# 在 Worker 脚本中处理 CORS
export default {
  async fetch(request) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // 处理实际请求
    let response;
    try {
      response = await handleUpload(request);
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), { status: 400 });
    }

    // 添加 CORS 响应头
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return response;
  }
}
```

---

## 🧪 测试清单

- [ ] Firebase 配置中的 `authDomain` 已改为正确的 Firebase 域名
- [ ] 测试登录功能
- [ ] 测试注册功能
- [ ] 测试找回密码功能
- [ ] 测试头像上传（检查 URL 长度）
- [ ] 测试资料保存
- [ ] 测试浏览器隐私模式下的存储
- [ ] Worker 返回的 URL 不超过 2000 字符
- [ ] Worker 正确配置了 CORS 响应头

---

## 🔧 调试步骤

1. **打开浏览器开发者工具** (F12)
2. **查看 Network 标签**：检查所有请求的状态
3. **查看 Console 标签**：查看完整错误信息
4. **检查 Storage 标签**：
   - IndexedDB 中是否有数据
   - Cookies 是否被正确设置
5. **测试 Worker 连接**：
   ```javascript
   fetch('https://your-worker.com/test')
     .then(r => r.json())
     .then(console.log)
     .catch(console.error);
   ```

---

## 📋 常见错误及解决方案

| 错误代码 | 原因 | 解决方案 |
|---------|------|--------|
| `auth/invalid-login-credentials` | 邮箱或密码错误 | 检查输入，确认账户存在 |
| `auth/email-already-in-use` | 邮箱已注册 | 使用其他邮箱或登录 |
| `auth/invalid-profile-attribute` | URL 过长 | 缩短 URL 或使用短链服务 |
| `auth/network-request-failed` | 网络错误 | 检查网络连接和 CORS 配置 |
| `Tracking Prevention blocked` | 隐私模式阻止存储 | 使用 IndexedDB 代替 localStorage |

