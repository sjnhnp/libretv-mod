import { PASSWORD_CONFIG } from './config.js';
import { sha256 } from './sha256.js';
import { setPasswordVerified } from './store.js';

export function isPasswordProtected() {
    const hash = window.__ENV__ && window.__ENV__.PASSWORD;
    return typeof hash === 'string' && hash.length === 64 && !/^0+$/.test(hash);
}

export function isPasswordVerified() {
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
        return false;
    }
}

export async function verifyPassword(password) {
    const storedHash = window.__ENV__ && window.__ENV__.PASSWORD;
    if (!storedHash) return false;
    try {
        const inputHash = await sha256(password);
        const match = inputHash === storedHash;
    if (match) {
        const stateToStore = { verified: true, timestamp: Date.now() };
        localStorage.setItem(PASSWORD_CONFIG.localStorageKey, JSON.stringify(stateToStore));
        setPasswordVerified(true);
    }
    return match;
} catch {
        return false;
    }
}

export function showPasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            const inp = document.getElementById('passwordInput');
            inp && inp.focus();
        }, 100);
    }
}

export function hidePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.style.display = 'none';
}

export function showPasswordError() {
    const err = document.getElementById('passwordError');
    if (err) err.classList.remove('hidden');
}

export function hidePasswordError() {
    const err = document.getElementById('passwordError');
    if (err) err.classList.add('hidden');
}

export async function handlePasswordSubmit() {
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

export function initPasswordProtection() {
    if (!isPasswordProtected()) return;
    if (isPasswordVerified()) return;
    showPasswordModal();
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
