// =================== 全局常量、工具 =====================

// 搜索与历史相关常量
window.MAX_HISTORY_ITEMS = window.MAX_HISTORY_ITEMS || 30;
window.SEARCH_HISTORY_KEY = window.SEARCH_HISTORY_KEY || 'searchHistory';

// UI样式类型
const TOAST_BG_COLORS = {
    'error': 'bg-red-500',
    'success': 'bg-green-500',
    'info': 'bg-blue-500',
    'warning': 'bg-yellow-500'
};
const HISTORY_MAX_ITEMS = 50;           // 观看历史最大数量

// =============== UI相关函数 =============================

// 设置面板开关
function toggleSettings(e) {
    // 密码校验（仅当接口提供时才检查）
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof showPasswordModal === 'function') showPasswordModal();
            return;
        }
    }
    e?.stopPropagation();
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.toggle('show');
}

// ------------- Toast功能（支持队列） -------------
const toastQueue = [];
let isShowingToast = false;

/** 显示消息Toast（支持消息队列，背景色可变更） */
function showToast(message, type = 'error') {
    toastQueue.push({ message, type });
    if (!isShowingToast) showNextToast();
}
function showNextToast() {
    if (!toastQueue.length) return isShowingToast = false;
    isShowingToast = true;
    const { message, type } = toastQueue.shift();
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;

    // 设置样式
    const bg = TOAST_BG_COLORS[type] || TOAST_BG_COLORS.error;
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${bg} text-white`;
    toastMessage.textContent = message;

    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-100%)';
        setTimeout(showNextToast, 300);
    }, 3000);
}

// ----------- Loading区域 --------------
let loadingTimeoutId = null;
/** 显示Loading */
function showLoading(message = '加载中...') {
    if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
    const loading = document.getElementById('loading');
    if (!loading) return;
    const p = loading.querySelector('p');
    if (p) p.textContent = message;
    loading.style.display = 'flex';
    loadingTimeoutId = setTimeout(() => {
        hideLoading();
        showToast('操作超时，请稍后重试', 'warning');
    }, 30000);
}
/** 隐藏Loading */
function hideLoading() {
    if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
}

/** 关闭详情弹窗 */
function closeModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modalContent');
    if (modal) modal.classList.add('hidden');
    if (modalContent) modalContent.innerHTML = '';
}

// ========== 搜索历史相关 ================

/** 获取历史（兼容老新格式） */
function getSearchHistory() {
    try {
        const data = localStorage.getItem(SEARCH_HISTORY_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(item => typeof item === 'string' ? { text: item, timestamp: 0 } : item)
            .filter(item => item && item.text);
    } catch (e) {
        console.error('获取搜索历史出错:', e);
        return [];
    }
}

/** 保存搜索历史，记录时间戳，去重，控量，防止XSS */
function saveSearchHistory(query) {
    if (!query || !query.trim()) return;
    query = query.trim().slice(0, 50).replace(/[<>"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '"': '&quot;'
    })[c]);
    let history = getSearchHistory();
    const now = Date.now();
    // 2个月有效、去重
    history = history.filter(item =>
        typeof item === 'object' && item.timestamp && (now - item.timestamp < 5184000000) &&
        item.text !== query
    );
    // 新项在最前
    history.unshift({ text: query, timestamp: now });
    if (history.length > MAX_HISTORY_ITEMS) history = history.slice(0, MAX_HISTORY_ITEMS);
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        // 空间不足时清理
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        try {
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 3)));
        } catch (e2) {
            // 两次都失败则放弃
        }
    }
    renderSearchHistory();
}

function renderSearchHistory() {
    const historyContainer = document.getElementById('recentSearches');
    if (!historyContainer) return;
    const history = getSearchHistory();
    if (!history.length) { historyContainer.innerHTML = ''; return; }

    const frag = document.createDocumentFragment();

    // 标题与清空按钮
    const header = document.createElement('div');
    header.className = "flex justify-between items-center w-full mb-2";
    header.innerHTML = `<div class="text-gray-500">最近搜索:</div>
        <button id="clearHistoryBtn" class="text-gray-500 hover:text-white transition-colors"
            onclick="clearSearchHistory()" aria-label="清除搜索历史">清除搜索历史</button>`;
    frag.appendChild(header);

    // 添加标签
    history.forEach(item => {
        const tag = document.createElement('button');
        tag.className = 'search-tag';
        tag.textContent = item.text;
        if (item.timestamp) tag.title = `搜索于: ${new Date(item.timestamp).toLocaleString()}`;
        tag.onclick = function() {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = item.text;
                search();
            }
        };
        frag.appendChild(tag);
    });
    historyContainer.innerHTML = '';
    historyContainer.appendChild(frag);
}
function clearSearchHistory() {
    // 校验密码
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof showPasswordModal === 'function') showPasswordModal();
            return;
        }
    }
    try {
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        renderSearchHistory();
        showToast('搜索历史已清除', 'success');
    } catch (e) {
        console.error('清除搜索历史失败:', e);
        showToast('清除搜索历史失败', 'error');
    }
}

// ========== 观看历史相关 ================

// 历史面板相关函数
function toggleHistory(e) {
    // 密码保护校验
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal && showPasswordModal();
            return;
        }
    }
    if (e) e.stopPropagation();
    
    const panel = document.getElementById('historyPanel');
    if (panel) {
        panel.classList.toggle('show');
        
        // 如果打开了历史记录面板，则加载历史数据
        if (panel.classList.contains('show')) {
            loadViewingHistory();
        }
        
        // 如果设置面板是打开的，则关闭它
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel && settingsPanel.classList.contains('show')) {
            settingsPanel.classList.remove('show');
        }
    }
}

/** 时间戳人性化显示 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp), now = new Date();
    const diff = now - date;
    if (diff < 3600000) return `${Math.max(0, Math.floor(diff / 60000)) || '刚刚'}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}
        ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}
function getViewingHistory() {
    try {
        const data = localStorage.getItem('viewingHistory');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('获取观看历史失败:', e);
        return [];
    }
}

/** 渲染历史面板 */
function loadViewingHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    const history = getViewingHistory();
    if (!history.length) {
        historyList.innerHTML = `<div class="text-center text-gray-500 py-8">暂无观看记录</div>`;
        return;
    }
    const frag = document.createDocumentFragment();
    history.forEach(item => {
        // 防XSS
        const safeTitle = (item.title||'').replace(/[<>"']/g, c=>({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
        const safeSource = (item.sourceName || '未知来源').replace(/[<>"']/g, c=>({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
        const episodeText = item.episodeIndex!==undefined ? `第${item.episodeIndex+1}集` : '';
        let progressHtml = '';
        // 进度条
        if (item.playbackPosition && item.duration && item.playbackPosition>10 && item.playbackPosition<item.duration*0.95) {
            const percent = Math.round(item.playbackPosition/item.duration*100);
            const formattedTime = formatPlaybackTime(item.playbackPosition);
            const formattedDuration = formatPlaybackTime(item.duration);
            progressHtml = `<div class="history-progress"><div class="progress-bar">
                <div class="progress-filled" style="width:${percent}%"></div></div>
                <div class="progress-text">${formattedTime} / ${formattedDuration}</div></div>`;
        }
        const safeURL = encodeURIComponent(item.url);
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item cursor-pointer relative group';
        
        //观看历史正常播放
        historyItem.setAttribute('onclick', `playFromHistory('${item.url}', '${safeTitle}', ${item.episodeIndex||0}, ${item.playbackPosition||0})`);        
        
        historyItem.innerHTML = `
            <div class="history-info">
                <div class="history-title">${safeTitle}</div>
                <div class="history-meta">
                    <span class="history-episode">${episodeText}</span>
                    ${episodeText ? '<span class="history-separator mx-1">·</span>' : ''}
                    <span class="history-source">${safeSource}</span>
                </div>
                ${progressHtml}
                <div class="history-time">${formatTimestamp(item.timestamp)}</div>
            </div>
            <button onclick="event.stopPropagation(); deleteHistoryItem('${safeURL}')" 
                class="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-red-400 p-1 rounded-full hover:bg-gray-800 z-10"
                title="删除记录">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>`;
        frag.appendChild(historyItem);
    });
    historyList.innerHTML = '';
    historyList.appendChild(frag);
    if (history.length > 5) historyList.classList.add('pb-4');
}

/** mm:ss时间格式 */
function formatPlaybackTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds/60), s = Math.floor(seconds%60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
// 删除历史
function deleteHistoryItem(encodedUrl) {
    try {
        const url = decodeURIComponent(encodedUrl), history = getViewingHistory();
        const newHistory = history.filter(item => item.url !== url);
        localStorage.setItem('viewingHistory', JSON.stringify(newHistory));
        loadViewingHistory();
        showToast('已删除该记录', 'success');
    } catch (e) {
        console.error('删除历史记录项失败:', e);
        showToast('删除记录失败', 'error');
    }
}

// 从观看历史记录打开播放页面（在当前标签页）- 基于原始逻辑修改

function playFromHistory(url, title, episodeIndex, playbackPosition = 0) {
    try {
        let episodesList = [];
        const historyRaw = localStorage.getItem('viewingHistory');
        if (historyRaw) {
            try { 
                const history = JSON.parse(historyRaw);
                const historyItem = history.find(item => item.title === title);
                if (historyItem && Array.isArray(historyItem.episodes)) {
                    episodesList = historyItem.episodes;
                }
            } catch (parseError) {
                console.error("解析 viewingHistory 出错:", parseError);
            }
        }
        if (!episodesList.length) {
            try {
                const stored = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
                if (Array.isArray(stored) && stored.length) { 
                    episodesList = stored;
                }
            } catch (e) {
                 console.error("解析 currentEpisodes 失败:", e);
            }
        }
        if (episodesList.length) { 
            localStorage.setItem('currentEpisodes', JSON.stringify(episodesList));
        }
        const positionParam = playbackPosition > 10 ? `&position=${Math.floor(playbackPosition)}` : '';

        if (url.includes('?')) {
            const playUrl = new URL(url);
            if (!playUrl.searchParams.has('index') && episodeIndex > 0) {
                playUrl.searchParams.set('index', episodeIndex);
            }
            if (playbackPosition > 10 && !playUrl.searchParams.has('position')) { 
                 playUrl.searchParams.set('position', Math.floor(playbackPosition));
            }
            window.location.href = playUrl.toString();
        } else {
            const playerUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=${episodeIndex}${positionParam}`;
            window.location.href = playerUrl;
        }

    } catch (e) {
        console.error('从历史记录播放失败:', e);
        const fallbackUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=${episodeIndex}`;
        window.location.href = fallbackUrl;
    }
}

/** 增加/更新历史（同标题合并，每标题仅一条记录） */
function addToViewingHistory(videoInfo) {
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof showPasswordModal === 'function') showPasswordModal();
            return;
        }
    }
    try {
        const history = getViewingHistory();
        const idx = history.findIndex(item => item.title === videoInfo.title);
        if (idx !== -1) {
            const item = history[idx];
            item.episodeIndex = videoInfo.episodeIndex;
            item.timestamp = Date.now();
            if (videoInfo.sourceName && !item.sourceName) item.sourceName = videoInfo.sourceName;
            if (videoInfo.playbackPosition && videoInfo.playbackPosition>10) {
                item.playbackPosition = videoInfo.playbackPosition;
                item.duration = videoInfo.duration || item.duration;
            }
            item.url = videoInfo.url;
            if (videoInfo.episodes && Array.isArray(videoInfo.episodes) && videoInfo.episodes.length) {
                if (!item.episodes || item.episodes.length !== videoInfo.episodes.length) {
                    item.episodes = [...videoInfo.episodes];
                }
            }
            // 放到最前
            history.splice(idx, 1);
            history.unshift(item);
        } else {
            const newItem = { ...videoInfo, timestamp: Date.now(), episodes: Array.isArray(videoInfo.episodes)?[...videoInfo.episodes]:[] };
            history.unshift(newItem);
        }
        if (history.length > HISTORY_MAX_ITEMS) history.splice(HISTORY_MAX_ITEMS);
        localStorage.setItem('viewingHistory', JSON.stringify(history));
    } catch (e) { console.error('保存观看历史失败:', e); }
}
function clearViewingHistory() {
    try {
        localStorage.removeItem('viewingHistory');
        loadViewingHistory();
        showToast('观看历史已清空', 'success');
    } catch (e) {
        console.error('清除观看历史失败:', e);
        showToast('清除观看历史失败', 'error');
    }
}

// ============= 面板相关互斥行为增强 =================

// 覆写 toggleSettings，自动关闭历史面板
const originalToggleSettings = toggleSettings;
toggleSettings = function(e) {
    e?.stopPropagation();
    originalToggleSettings(e);
    // 自动关闭历史
    const historyPanel = document.getElementById('historyPanel');
    if (historyPanel && historyPanel.classList.contains('show')) {
        historyPanel.classList.remove('show');
    }
};

// 点击页面空白时自动关闭历史侧边栏
document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('click', function(e) {
        const historyPanel = document.getElementById('historyPanel');
        const historyButton = document.querySelector('button[onclick="toggleHistory(event)"]');
        if (historyPanel && historyButton &&
            !historyPanel.contains(e.target) && !historyButton.contains(e.target) &&
            historyPanel.classList.contains('show')) {
            historyPanel.classList.remove('show');
        }
    });
});
window.renderSearchHistory = renderSearchHistory;
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.toggleSettings = toggleSettings;
window.toggleHistory = toggleHistory;


// ============= END UI 相关优化 ================
