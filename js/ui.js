// /js/ui.js

import { SEARCH_HISTORY_KEY, MAX_HISTORY_ITEMS } from './config.js';
import { getState, setUIState, addSearchHistoryItem, clearSearchHistoryStore, addViewingHistoryItem, clearViewingHistoryStore, deleteViewingHistoryItem } from './store.js';
import { createHistoryItemElement } from "./components/HistoryItem.js";
import { showToast as globalShowToast } from './utils.js';


// ----------- Toast/Modal 控件 ------------

let toastQueue = [];
let isShowingToast = false;
export function showToast(message, type = 'error') {
    toastQueue.push({ message, type });
    if (!isShowingToast) showNextToast();
}
window.showToast = showToast; // For compatibility with old code

function showNextToast() {
    if (!toastQueue.length) { isShowingToast = false; return; }
    isShowingToast = true;
    const { message, type } = toastQueue.shift();
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    const bgColors = {
        error:   'bg-red-500',
        success: 'bg-green-500',
        info:    'bg-blue-500',
        warning: 'bg-yellow-500'
    };
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${bgColors[type] || bgColors.error} text-white`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-100%)';
        setTimeout(showNextToast, 300);
    }, 3000);
}

// ----------- Loading 遮罩 -----------
let loadingTimeoutId = null;

export function showLoading(message = '加载中...') {
    if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
    const loading = document.getElementById('loading');
    if (!loading) return;
    const msgEl = loading.querySelector('p');
    if (msgEl) msgEl.textContent = message;
    loading.style.display = 'flex';
    loadingTimeoutId = setTimeout(() => {
        hideLoading();
        showToast('操作超时，请稍后重试', 'warning');
    }, 30000);
}
window.showLoading = showLoading;

export function hideLoading() {
    if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
    }
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
}
window.hideLoading = hideLoading;

// ----------- Modal -----------
export function closeModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modalContent');
    modal && modal.classList.add('hidden');
    if (modalContent) modalContent.innerHTML = '';
}
window.closeModal = closeModal;

// ----------- 站点可用性标记 -----------
export function updateSiteStatus(isAvailable) {
    const statusEl = document.getElementById('siteStatus');
    if (!statusEl) return;
    statusEl.innerHTML = isAvailable
        ? '<span class="text-green-500">●</span> 可用'
        : '<span class="text-red-500">●</span> 不可用';
}
window.updateSiteStatus = updateSiteStatus;

// =================== 搜索历史相关 ===================
export function renderSearchHistory() {
    const container = document.getElementById('recentSearches');
    if (!container) return;
    const history = getState().searchHistory;
    if (!history.length) {
        container.innerHTML = '';
        return;
    }
    // 头部
    container.innerHTML = `
      <div class="flex justify-between items-center w-full mb-2">
        <div class="text-gray-500">最近搜索:</div>
        <button id="clearHistoryBtn" class="text-gray-500 hover:text-white transition-colors" aria-label="清除搜索历史">清除搜索历史</button>
      </div>`;
    // 历史标签
    const frag = document.createDocumentFragment();
    history.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'search-tag';
        btn.textContent = item.text;
        btn.title = item.timestamp ? `搜索于: ${new Date(item.timestamp).toLocaleString()}` : '';
        frag.appendChild(btn);
    });
    container.appendChild(frag);
}

// 搜索标签点击、清除事件（事件委托注册）
document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('recentSearches');
    if (container) {
        container.addEventListener('click', function(e){
            if (e.target.classList.contains('search-tag')) {
                const input = document.getElementById('searchInput');
                if (input) input.value = e.target.textContent;
                if (typeof window.search === 'function') window.search();
            } else if (e.target && e.target.id === 'clearHistoryBtn') {
                clearSearchHistoryStore();
                showToast('搜索历史已清除', 'success');
            }
        });
    }
});

// =================== 观看历史相关 ===================
export function loadViewingHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const history = getState().viewingHistory;
    list.innerHTML = '';
    if (!history.length) {
        list.innerHTML = '<div class="text-center text-gray-500 py-8">暂无观看记录</div>';
        return;
    }
    const frag = document.createDocumentFragment();
    history.forEach(item => {
        const elem = createHistoryItemElement(item, "viewing", playFromHistory, item => {
            deleteViewingHistoryItem(item.title); // 仅传title
            loadViewingHistory();
            showToast('已删除该记录', 'success');
        });
        frag.appendChild(elem);
    });
    list.appendChild(frag);
}
// 历史面板 click 事件已在组件/委托实现

export function clearViewingHistory() {
    clearViewingHistoryStore();
    showToast('观看历史已清空', 'success');
    loadViewingHistory();
}
window.clearViewingHistory = clearViewingHistory;

// ============== 搜索/播放历史 通用 组件式 Play ==============
export function playFromHistory(url, title, episodeIndex, playbackPosition = 0) {
    try {
        let episodesList = [];
        const history = getState().viewingHistory;
        const item = history.find(h => h.title === title);
        if (item?.episodes?.length) episodesList = item.episodes;
        else {
            try {
                const cand = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
                if (cand.length) episodesList = cand;
            } catch {}
        }
        const posParam = playbackPosition > 10 ? `&position=${Math.floor(playbackPosition)}` : '';
        const epParam = episodesList.length ? `&episodes=${encodeURIComponent(JSON.stringify(episodesList))}` : '';
        let targetUrl;
        if (url.includes('?')) {
            targetUrl = url;
            if (!url.includes('index=') && episodeIndex > 0) targetUrl += `&index=${episodeIndex}`;
            if (posParam) targetUrl += posParam;
            if (epParam && !url.includes('episodes=')) targetUrl += epParam;
            window.open(targetUrl, '_blank');
        } else {
            targetUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=${episodeIndex}${posParam}${epParam}`;
            window.open(targetUrl, '_blank');
        }
    } catch {
        window.open(`player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=${episodeIndex}`, '_blank');
    }
}
window.playFromHistory = playFromHistory;

// ============== 友好格式化 ==============
export function formatTimestamp(timestamp) {
    const date = new Date(timestamp), now = Date.now();
    const diff = now - date;
    if (diff < 3.6e6) {
        const m = Math.floor(diff / 6e4);
        return m <= 0 ? '刚刚' : `${m}分钟前`;
    }
    if (diff < 8.64e7) return `${Math.floor(diff / 3.6e6)}小时前`;
    if (diff < 6.048e8) return `${Math.floor(diff / 8.64e7)}天前`;
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
}
window.formatTimestamp = formatTimestamp;

export function formatPlaybackTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
window.formatPlaybackTime = formatPlaybackTime;

// ===================== 面板可见性与事件注册 =====================



// 设置面板
export function toggleSettings(e) {
    e && e.stopPropagation();
    const currState = getState().uiState.settingsPanelVisible;
    setUIState('settingsPanelVisible', !currState);
    if (!currState) setUIState('historyPanelVisible', false); // 关闭历史面板
}
window.toggleSettings = toggleSettings;

// 历史面板
export function toggleHistory(e) {
    e && e.stopPropagation();
    const currState = getState().uiState.historyPanelVisible;
    setUIState('historyPanelVisible', !currState);
    if (!currState) setUIState('settingsPanelVisible', false); // 关闭设置面板
    if (!currState) loadViewingHistory();
}
window.toggleHistory = toggleHistory;

// 监听 UI/面板变化以显示/隐藏 DOM
document.addEventListener('stateChange', (e) => {
    const keys = e.detail.changedKeys || [];
    const uiState = getState().uiState;
    if (keys.includes('uiState')) {
        // 设置面板
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            if (uiState.settingsPanelVisible) settingsPanel.classList.add('show');
            else settingsPanel.classList.remove('show');
        }
        // 历史面板
        const historyPanel = document.getElementById('historyPanel');
        if (historyPanel) {
            if (uiState.historyPanelVisible) historyPanel.classList.add('show');
            else historyPanel.classList.remove('show');
        }
    }
});

// 面板外点击自动关闭
document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('click', function(e) {
        const historyPanel = document.getElementById('historyPanel');
        const historyBtn = document.getElementById('historyBtn');
        if (historyPanel && historyBtn && !historyPanel.contains(e.target) && !historyBtn.contains(e.target)
            && historyPanel.classList.contains('show')) {
            setUIState('historyPanelVisible', false);
        }
        const settingsPanel = document.getElementById('settingsPanel');
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsPanel && settingsBtn && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)
            && settingsPanel.classList.contains('show')) {
            setUIState('settingsPanelVisible', false);
        }
    });
});

// ===================== 过滤/设置开关控制 =====================

export function addToggleListener(id, settingKey) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => {
        setSetting(settingKey, e.target.checked);
    });
}


// ===================== 站点状态标记、状态提示 ====================

export function updateSiteStatus(isAvailable) {
    const statusEl = document.getElementById('siteStatus');
    if (!statusEl) return;
    statusEl.innerHTML = isAvailable
        ? '<span class="text-green-500">●</span> 可用'
        : '<span class="text-red-500">●</span> 不可用';
}
window.updateSiteStatus = updateSiteStatus;

// ===================== 兼容旧逻辑 =====================

window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.clearViewingHistory = clearViewingHistory; // 用于按钮事件委托


