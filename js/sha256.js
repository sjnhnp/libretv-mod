// js/sha256.js
window.sha256 = async function(message) {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('当前环境不支持SHA-256加密');
};
