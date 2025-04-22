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

 * 检查用户是否已通过密码验证
 * 检查localStorage中的验证状态和时间戳是否有效，并确认密码哈希未更改
 */
function isPasswordVerified() {
    try {
        // 如果没有设置密码保护，则视为已验证
        if (!isPasswordProtected()) {
            return true;
        }

        const verificationData = JSON.parse(localStorage.getItem(PASSWORD_CONFIG.localStorageKey) || '{}');
        const { verified, timestamp, passwordHash } = verificationData;
        
        // 获取当前环境中的密码哈希
        const currentHash = window.__ENV__ && window.__ENV__.PASSWORD;
        
        // 验证是否已验证、未过期，且密码哈希未更改
        if (verified && timestamp && passwordHash === currentHash) {
            const now = Date.now();
            const expiry = timestamp + PASSWORD_CONFIG.verificationTTL;
            return now < expiry;

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

    const correctHash = window.__ENV__ && window.__ENV__.PASSWORD;
    if (!correctHash) return false;
    const inputHash = await sha256(password);
    const isValid = inputHash === correctHash;
    if (isValid) {
        const verificationData = {
            verified: true,
            timestamp: Date.now(),
            passwordHash: correctHash // 保存当前密码的哈希值
        };
        localStorage.setItem(PASSWORD_CONFIG.localStorageKey, JSON.stringify(verificationData));

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
