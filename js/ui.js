// ===================== UI HELPERS: /js/ui.js =======================

// --------- 1. Settings 面板展示与隐藏 ---------

/**
 * 设置面板开关，带密码保护检查
 * @param {Event} e
 */
function toggleSettings(e) {
    // 密码保护
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            typeof showPasswordModal === 'function' && showPasswordModal();
            return;
        }
    }
    e && e.stopPropagation();

    // 切换设置面板
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.toggle('show');

    // 如历史面板已显示，则关闭
    const historyPanel = document.getElementById('historyPanel');
    if (historyPanel && historyPanel.classList.contains('show')) {
        historyPanel.classList.remove('show');
    }
}
window.toggleSettings = toggleSettings;

// ----------- 2. Toast 队列系统 ------------

const toastQueue = [];
let isShowingToast = false;

/**
 * 显示toast，支持排队
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 */
function showToast(message, type = 'error') {
    toastQueue.push({ message, type });
    if (!isShowingToast) showNextToast();
}
window.showToast = showToast;

function showNextToast() {
    if (!toastQueue.length) {
        isShowingToast = false;
        return;
    }
    isShowingToast = true;

    const { message, type } = toastQueue.shift();
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    if (!toast || !toastMsg) return; // 安全防错

    // 不允许HTML注入
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

// ----------- 3. Loading 遮罩 ------------

let loadingTimeoutId = null;

function showLoading(message = '加载中...') {
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

function hideLoading() {
    if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
    }
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
}
window.hideLoading = hideLoading;

// ----------- 4. 站点可用性标记 ------------

function updateSiteStatus(isAvailable) {
    const statusEl = document.getElementById('siteStatus');
    if (!statusEl) return;
    statusEl.innerHTML = isAvailable
        ? '<span class="text-green-500">●</span> 可用'
        : '<span class="text-red-500">●</span> 不可用';
}
window.updateSiteStatus = updateSiteStatus;

// ----------- 5. 弹窗关闭 ------------

function closeModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modalContent');
    modal && modal.classList.add('hidden');
    if (modalContent) modalContent.innerHTML = '';
}
window.closeModal = closeModal;

// ========== 搜索历史相关（安全防XSS） ==============

/** 获取搜索历史，兼容新旧格式，输出对象数组 */
function getSearchHistory() {
    try {
        const data = localStorage.getItem(SEARCH_HISTORY_KEY);
        if (!data) return [];
        const arr = JSON.parse(data);
        if (!Array.isArray(arr)) return [];
        // 支持 ["keyword", ...] or [{text,timestamp}]
        return arr.map(item => typeof item === 'string'
            ? { text: item, timestamp: 0 }
            : item).filter(item => item && typeof item.text === 'string');
    } catch (e) {
        console.error('获取搜索历史出错:', e);
        return [];
    }
}
window.getSearchHistory = getSearchHistory;

function saveSearchHistory(query) {
    if (!query || !query.trim()) return;
    // 截断&转义
    query = query.trim().substring(0, 50).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let history = getSearchHistory();
    const now = Date.now();

    // 仅保留2个月内的记录
    history = history.filter(item => now - (item.timestamp || 0) < 5184000000);

    // 去重
    history = history.filter(item => item.text !== query);

    history.unshift({ text: query, timestamp: now });
    if (history.length > MAX_HISTORY_ITEMS) history = history.slice(0, MAX_HISTORY_ITEMS);

    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        // 清理后只存前3项
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 3)));
    }
    renderSearchHistory();
}
window.saveSearchHistory = saveSearchHistory;

/** 利用DocumentFragment批量渲染，强制防止XSS */
function renderSearchHistory() {
    const container = document.getElementById('recentSearches');
    if (!container) return;
    const history = getSearchHistory();
    if (!history.length) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
      <div class="flex justify-between items-center w-full mb-2">
        <div class="text-gray-500">最近搜索:</div>
        <button id="clearHistoryBtn" class="text-gray-500 hover:text-white transition-colors" 
           onclick="clearSearchHistory()" aria-label="清除搜索历史">清除搜索历史</button>
      </div>`;

    const frag = document.createDocumentFragment();
    for (const item of history) {
        const btn = document.createElement('button');
        btn.className = 'search-tag';
        btn.textContent = item.text;
        btn.title = item.timestamp ? `搜索于: ${new Date(item.timestamp).toLocaleString()}` : '';
        btn.onclick = () => {
            const input = document.getElementById('searchInput');
            if (input) input.value = item.text;
            if (typeof search === 'function') search();
        };
        frag.appendChild(btn);
    }
    container.appendChild(frag);
}
window.renderSearchHistory = renderSearchHistory;

function clearSearchHistory() {
    // 密码保护
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            typeof showPasswordModal === 'function' && showPasswordModal();
            return;
        }
    }
    try {
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        renderSearchHistory();
        showToast('搜索历史已清除', 'success');
    } catch (e) {
        showToast('清除搜索历史失败', 'error');
    }
}
window.clearSearchHistory = clearSearchHistory;

// ----------- 6. 历史面板相关 ------------

/**
 * 历史面板开关，密码保护
 * @param {Event} e
 */
function toggleHistory(e) {
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            typeof showPasswordModal === 'function' && showPasswordModal();
            return;
        }
    }
    e && e.stopPropagation();
    const panel = document.getElementById('historyPanel');
    if (!panel) return;
    panel.classList.toggle('show');
    if (panel.classList.contains('show')) loadViewingHistory();

    // 防止与设置面板共存
    const settingsPanel = document.getElementById('settingsPanel');
    if (settingsPanel && settingsPanel.classList.contains('show')) {
        settingsPanel.classList.remove('show');
    }
}
window.toggleHistory = toggleHistory;

// ============== 友好格式化辅助 ===============

function formatTimestamp(timestamp) {
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

function formatPlaybackTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
window.formatPlaybackTime = formatPlaybackTime;

// ============== 观看历史相关 ===============

function getViewingHistory() {
    try {
        const data = localStorage.getItem('viewingHistory');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}
window.getViewingHistory = getViewingHistory;

/** 用DocumentFragment加速渲染，内容强制textContent插入，防止XSS */
function loadViewingHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const history = getViewingHistory();
    if (!history.length) {
        list.innerHTML = '<div class="text-center text-gray-500 py-8">暂无观看记录</div>';
        return;
    }
    list.innerHTML = '';
    const frag = document.createDocumentFragment();

    history.forEach(item => {
        // dom结构安全生成
        const wrapper = document.createElement('div');
        wrapper.className = 'history-item cursor-pointer relative group';

        // 删除按钮
        const btn = document.createElement('button');
        btn.className = 'absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-red-400 p-1 rounded-full hover:bg-gray-800 z-10';
        btn.title = '删除记录';
        btn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>`;
        btn.onclick = ev => {
            ev.stopPropagation();
            deleteHistoryItem(encodeURIComponent(item.url));
        };
        wrapper.appendChild(btn);

        // 信息主体
        const info = document.createElement('div');
        info.className = 'history-info';
        // 标题
        const t = document.createElement('div');
        t.className = 'history-title';
        t.textContent = item.title;
        info.appendChild(t);

        // 元信息
        const meta = document.createElement('div');
        meta.className = 'history-meta';

        if (item.episodeIndex !== undefined) {
            const ep = document.createElement('span');
            ep.className = 'history-episode';
            ep.textContent = `第${item.episodeIndex + 1}集`;
            meta.appendChild(ep);
            const sep = document.createElement('span');
            sep.className = 'history-separator mx-1';
            sep.textContent = '·';
            meta.appendChild(sep);
        }
        const source = document.createElement('span');
        source.className = 'history-source';
        source.textContent = item.sourceName || '未知来源';
        meta.appendChild(source);
        info.appendChild(meta);

        // 播放进度及进度条
        if (item.playbackPosition && item.duration && item.playbackPosition > 10 && item.playbackPosition < item.duration*0.95) {
            const percent = Math.round((item.playbackPosition / item.duration) * 100);
            const prog = document.createElement('div');
            prog.className = 'history-progress';
            prog.innerHTML = `<div class="progress-bar"><div class="progress-filled" style="width:${percent}%"></div></div>
                <div class="progress-text">${formatPlaybackTime(item.playbackPosition)} / ${formatPlaybackTime(item.duration)}</div>`;
            info.appendChild(prog);
        }

        // 时间戳
        const tt = document.createElement('div');
        tt.className = 'history-time';
        tt.textContent = formatTimestamp(item.timestamp);
        info.appendChild(tt);

        wrapper.appendChild(info);

        // 点击可播放
        wrapper.onclick = () => {
            playFromHistory(item.url, item.title, item.episodeIndex || 0, item.playbackPosition || 0);
        };
        frag.appendChild(wrapper);
    });
    list.appendChild(frag);
    if (history.length > 5) list.classList.add('pb-4');
    else list.classList.remove('pb-4');
}
window.loadViewingHistory = loadViewingHistory;

function deleteHistoryItem(encodedUrl) {
    try {
        const url = decodeURIComponent(encodedUrl);
        const history = getViewingHistory();
        const newHistory = history.filter(item => item.url !== url);
        localStorage.setItem('viewingHistory', JSON.stringify(newHistory));
        loadViewingHistory();
        showToast('已删除该记录', 'success');
    } catch (e) {
        showToast('删除记录失败', 'error');
    }
}
window.deleteHistoryItem = deleteHistoryItem;

function playFromHistory(url, title, episodeIndex, playbackPosition = 0) {
    try {
        // 找到剧集/进度信息
        let episodesList = [];
        const history = getViewingHistory();
        const item = history.find(h => h.title === title);
        if (item?.episodes?.length) episodesList = item.episodes;
        else {
            try {
                const cand = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
                if (cand.length) episodesList = cand;
            } catch {}
        }
        // 参数组装
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
        // 兜底纯跳转
        window.open(`player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=${episodeIndex}`, '_blank');
    }
}
window.playFromHistory = playFromHistory;

function addToViewingHistory(videoInfo) {
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            typeof showPasswordModal === 'function' && showPasswordModal();
            return;
        }
    }
    try {
        const history = getViewingHistory();
        const idx = history.findIndex(item => item.title === videoInfo.title);
        if (idx !== -1) {
            // 更新老的
            const old = history[idx];
            old.episodeIndex = videoInfo.episodeIndex;
            old.timestamp = Date.now();
            if (videoInfo.sourceName && !old.sourceName) old.sourceName = videoInfo.sourceName;
            if (videoInfo.playbackPosition && videoInfo.playbackPosition > 10)
                old.playbackPosition = videoInfo.playbackPosition, old.duration = videoInfo.duration || old.duration;
            old.url = videoInfo.url;
            if (videoInfo.episodes?.length) old.episodes = [...videoInfo.episodes];
            history.splice(idx, 1); // 移除旧项
            history.unshift(old);   // 插到前面
        } else {
            // 新加
            const newItem = {
                ...videoInfo,
                timestamp: Date.now(),
                episodes: Array.isArray(videoInfo.episodes) ? [...videoInfo.episodes] : []
            };
            history.unshift(newItem);
        }
        const maxItems = 50;
        if (history.length > maxItems) history.splice(maxItems);
        localStorage.setItem('viewingHistory', JSON.stringify(history));
    } catch (e) {
        // 容忍localStorage塞满出错
    }
}
window.addToViewingHistory = addToViewingHistory;

function clearViewingHistory() {
    try {
        localStorage.removeItem('viewingHistory');
        loadViewingHistory();
        showToast('观看历史已清空', 'success');
    } catch {
        showToast('清除观看历史失败', 'error');
    }
}
window.clearViewingHistory = clearViewingHistory;


// --- 自动关闭历史面板，防止点击外部未生效 ---
document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('click', function(e) {
        const historyPanel = document.getElementById('historyPanel');
        const historyBtn = document.querySelector('button[onclick="toggleHistory(event)"]');
        if (historyPanel && historyBtn && !historyPanel.contains(e.target) && !historyBtn.contains(e.target)
            && historyPanel.classList.contains('show')) {
            historyPanel.classList.remove('show');
        }
    });
});
