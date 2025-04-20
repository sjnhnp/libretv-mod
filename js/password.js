// 密码保护功能逻辑，结构化、健壮且注释完整

// ========= 配置及工具 =========

/**
 * 检查是否启用了密码保护。
 * 条件：window.__ENV__.PASSWORD 存在且为64位SHA-256十六进制hash且不全为0
 */
function isPasswordProtected() {
    const hash = window.__ENV__ && window.__ENV__.PASSWORD;
    return typeof hash === 'string' && hash.length === 64 && !/^0+$/.test(hash);
}

/**
 * 检查当前用户密码验证是否仍然有效
 * - 如果未开密码保护，则恒true
 * - 否则检查localStorage的标志和TTL是否在有效期
 */
function isPasswordVerified() {
    try {
        if (!isPasswordProtected()) return true;
        const raw = localStorage.getItem(PASSWORD_CONFIG.localStorageKey);
        if (!raw) return false;
        const { verified, timestamp } = JSON.parse(raw);
        if (verified && typeof timestamp === 'number') {
            return Date.now() < timestamp + PASSWORD_CONFIG.verificationTTL;
        }
        return false;
    } catch (e) {
        // localStorage损坏或解析异常时，视为未验证
        return false;
    }
}

// 挂载到window供全局使用
window.isPasswordProtected = isPasswordProtected;
window.isPasswordVerified = isPasswordVerified;

/**
 * 异步校验输入的密码：
 * - 1. 使用sha256比较hash（不泄露明文或hash）
 * - 2. 若一致，把验证标志和时间记录到localStorage
 * @param {string} password 输入明文
 * @returns {Promise<boolean>} 是否验证成功
 */
async function verifyPassword(password) {
    const storedHash = window.__ENV__ && window.__ENV__.PASSWORD;
    if (!storedHash) return false;
    try {
        const inputHash = await sha256(password);
        const match = inputHash === storedHash;
        if (match) {
            const checkObj = { verified: true, timestamp: Date.now() };
            localStorage.setItem(PASSWORD_CONFIG.localStorageKey, JSON.stringify(checkObj));
        }
        return match;
    } catch {
        // 不应将异常信息显示或回流给用户
        return false;
    }
}

/**
 * 通用SHA-256算法，优先Web Crypto, 回退_jsSha256
 * @param {string} message
 * @returns {Promise<string>}
 */
async function sha256(message) {
    if (window.crypto && crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    if (typeof window._jsSha256 === 'function') {
        return window._jsSha256(message);
    }
    throw new Error('No SHA-256 implementation available.');
}

// ========= UI交互部分 =========

/**
 * 显示密码输入弹窗，并focus输入框
 */
function showPasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            const inp = document.getElementById('passwordInput');
            inp && inp.focus();
        }, 100);
    }
}

/** 隐藏密码输入弹窗 */
function hidePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.style.display = 'none';
}

/** 显示密码错误提示 */
function showPasswordError() {
    const err = document.getElementById('passwordError');
    if (err) err.classList.remove('hidden');
}

/** 隐藏密码错误提示 */
function hidePasswordError() {
    const err = document.getElementById('passwordError');
    if (err) err.classList.add('hidden');
}

/**
 * 处理密码弹窗提交事件
 * - 正确则隐藏弹窗，错误则清空并focus输入框
 */
async function handlePasswordSubmit() {
    const inputEl = document.getElementById('passwordInput');
    const password = inputEl ? inputEl.value.trim() : '';
    if (await verifyPassword(password)) {
        hidePasswordError();
        hidePasswordModal();
    } else {
        showPasswordError();
        if (inputEl) {
            inputEl.value = '';
            inputEl.focus();
        }
    }
}

/**
 * 初始化密码保护交互与事件
 * - 若启用保护且未通过验证，则显示弹窗并绑定事件
 */
function initPasswordProtection() {
    if (!isPasswordProtected()) return;
    if (isPasswordVerified()) return;

    showPasswordModal();

    // 防止重复绑定
    const submitBtn = document.getElementById('passwordSubmitBtn');
    if (submitBtn && !submitBtn._inited) {
        submitBtn._inited = true;
        submitBtn.addEventListener('click', handlePasswordSubmit);
    }

    const inputEl = document.getElementById('passwordInput');
    if (inputEl && !inputEl._inited) {
        inputEl._inited = true;
        inputEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handlePasswordSubmit();
        });
    }
}

// 页面初始化时自动运行
document.addEventListener('DOMContentLoaded', initPasswordProtection);
