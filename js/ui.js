// --- File: js/ui.js ---
window.MAX_HISTORY_ITEMS = window.MAX_HISTORY_ITEMS || 30;
window.SEARCH_HISTORY_KEY = window.SEARCH_HISTORY_KEY || 'searchHistory';
const TOAST_BG_COLORS = { 'error': 'bg-red-500', 'success': 'bg-green-500', 'info': 'bg-blue-500', 'warning': 'bg-yellow-500' };
const HISTORY_MAX_ITEMS = 50;
const domCacheUi = new Map(); // Renamed to avoid conflict if app.js also has domCache

function getElementUi(id) { // Renamed
    const cached = domCacheUi.get(id);
    if (cached && cached.isConnected) return cached;
    const fresh = document.getElementById(id);
    if (fresh) domCacheUi.set(id, fresh);
    return fresh;
}

function getUniqueEpisodeId(v) { // From old.txt/ui.js - used by addToViewingHistory
    const getUrlKey = (raw = '') => (raw.split('/').pop().split(/[?#]/)[0] || raw).slice(-80);
    const sc = v.sourceCode || 'unknown_source';
    const vid = v.vod_id || ''; // Use vod_id from videoInfo
    const ep = (typeof v.episodeIndex === 'number') ? `_ep${v.episodeIndex}` : '';
    if (vid) return `${v.title}_${sc}_${vid}${ep}`;
    return `${v.title}_${sc}_${getUrlKey(v.url)}${ep}`;
}


function checkPasswordProtection() {
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof showPasswordModal === 'function') showPasswordModal();
            return false;
        }
    }
    return true;
}

function togglePanel(panelIdToShow, panelIdToHide, onShowCallback) {
    if (!checkPasswordProtection()) return false;

    const panelToShow = getElementUi(panelIdToShow);
    if (!panelToShow) return false;

    const isShowing = panelToShow.classList.toggle('show');
    panelToShow.setAttribute('aria-hidden', !isShowing);

    if (panelIdToHide) {
        const panelToHide = getElementUi(panelIdToHide);
        if (panelToHide && panelToHide.classList.contains('show')) {
            panelToHide.classList.remove('show');
            panelToHide.setAttribute('aria-hidden', 'true');
        }
    }

    if (isShowing && typeof onShowCallback === 'function') {
        onShowCallback();
    }
    return true;
}

function toggleSettings(e) {
    e?.stopPropagation();
    togglePanel('settingsPanel', 'historyPanel');
}

function toggleHistory(e) {
    if (e) e.stopPropagation();
    togglePanel('historyPanel', 'settingsPanel', loadViewingHistory);
}

const toastQueueUi = [];
let isShowingToastUi = false;

function showToast(message, type = 'error') { // This is ui.js's showToast
    toastQueueUi.push({ message, type });
    if (!isShowingToastUi) showNextToastUi();
}

function showNextToastUi() { // Renamed
    if (!toastQueueUi.length) {
        isShowingToastUi = false;
        return;
    }
    isShowingToastUi = true;
    const { message, type } = toastQueueUi.shift();
    const toast = getElementUi('toast');
    const toastMessage = getElementUi('toastMessage');
    if (!toast || !toastMessage) return;

    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${TOAST_BG_COLORS[type] || TOAST_BG_COLORS.error} text-white z-50`;
    toastMessage.textContent = message;

    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-100%)';
        setTimeout(showNextToastUi, 300);
    }, 3000);
}

let loadingTimeoutIdUi = null;

function showLoading(message = '加载中...') {
    if (loadingTimeoutIdUi) { clearTimeout(loadingTimeoutIdUi); loadingTimeoutIdUi = null; }
    const loading = getElementUi('loading');
    if (!loading) return;
    const p = loading.querySelector('p');
    if (p) p.textContent = message;
    loading.style.display = 'flex';
    loadingTimeoutIdUi = setTimeout(() => {
        hideLoading();
        showToast('操作超时，请稍后重试', 'warning');
    }, 30000);
}

function hideLoading() {
    if (loadingTimeoutIdUi) { clearTimeout(loadingTimeoutIdUi); loadingTimeoutIdUi = null; }
    const loading = getElementUi('loading');
    if (loading) loading.style.display = 'none';
}

let lastFocusedElementUi = null;

function showModal(content, title = '') {
    const modal = getElementUi('modal');
    const modalContent = getElementUi('modalContent');
    const modalTitle = getElementUi('modalTitle');

    if (!modal || !modalContent) return;

    lastFocusedElementUi = document.activeElement;
    modalContent.innerHTML = content;
    if (modalTitle && title) modalTitle.textContent = title;

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setupFocusTrap(modal);

    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusableElements.length) {
        focusableElements[0].focus();
    } else {
        modal.focus();
    }
}

function setupFocusTrap(container) {
    container.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        const focusableElements = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusableElements.length) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    });
}

function closeModal() {
    const modal = getElementUi('modal');
    const modalContent = getElementUi('modalContent');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    if (modalContent) modalContent.innerHTML = '';
    if (lastFocusedElementUi && typeof lastFocusedElementUi.focus === 'function') {
        lastFocusedElementUi.focus();
    }
}

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

function saveSearchHistory(query) {
    if (!query || !query.trim()) return;
    query = query.trim().slice(0, 50).replace(/[<>"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '"': '&quot;'
    })[c]);
    let history = getSearchHistory();
    const now = Date.now();
    history = history.filter(item =>
        typeof item === 'object' && item.timestamp && (now - item.timestamp < 5184000000) && // 60 days
        item.text !== query
    );
    history.unshift({ text: query, timestamp: now });
    if (history.length > window.MAX_HISTORY_ITEMS) history = history.slice(0, window.MAX_HISTORY_ITEMS);
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        try {
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 3)));
        } catch (e2) {
            // Give up
        }
    }
    renderSearchHistory();
}

function handleSearchTagClick(e) {
    const delSpan = e.target.closest('span[data-deletequery]');
    if (delSpan) {
        deleteSingleSearchHistory(delSpan.dataset.deletequery);
        e.stopPropagation();
        return;
    }
    const tagBtn = e.target.closest('.search-tag');
    if (tagBtn && !e.target.closest('span[data-deletequery]')) {
        const searchInput = getElementUi('searchInput');
        if (searchInput) {
            searchInput.value = tagBtn.textContent.trim();
            if (typeof search === 'function') search();
        }
        return;
    }
}

function renderSearchHistory() {
    const historyContainer = getElementUi('recentSearches');
    if (!historyContainer) return;
    const history = getSearchHistory();
    if (!history.length) { historyContainer.innerHTML = ''; return; }

    const frag = document.createDocumentFragment();
    const header = document.createElement('div');
    header.className = "flex justify-between items-center w-full mb-2";
    const titleDiv = document.createElement('div');
    titleDiv.className = "text-gray-500";
    titleDiv.textContent = "最近搜索:";
    const clearBtn = document.createElement('button');
    clearBtn.id = "clearHistoryBtn";
    clearBtn.className = "text-gray-500 hover:text-white transition-colors";
    clearBtn.setAttribute('aria-label', "清除搜索历史");
    clearBtn.textContent = "清除搜索历史";
    clearBtn.onclick = clearSearchHistory;
    header.appendChild(titleDiv);
    header.appendChild(clearBtn);
    frag.appendChild(header);

    history.forEach(item => {
        const tagWrap = document.createElement('div');
        tagWrap.className = 'inline-flex items-center mb-2 mr-2';
        const tag = document.createElement('button');
        tag.className = 'search-tag'; // Ensure this class matches your CSS for the tag button itself
        tag.textContent = item.text;
        if (item.timestamp) tag.title = `搜索于: ${new Date(item.timestamp).toLocaleString()}`;
        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'ml-2 text-gray-400 hover:text-red-500 cursor-pointer select-none flex items-center';
        deleteBtn.setAttribute('role', 'button');
        deleteBtn.setAttribute('aria-label', '删除');
        deleteBtn.dataset.deletequery = item.text;
        deleteBtn.style.fontSize = '1.15em';
        deleteBtn.innerHTML =
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="pointer-events:none;">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>' +
            '</svg>';
        tagWrap.appendChild(tag);
        tagWrap.appendChild(deleteBtn);
        frag.appendChild(tagWrap);
    });
    historyContainer.innerHTML = '';
    historyContainer.appendChild(frag);
}

function deleteSingleSearchHistory(query) {
    try {
        let history = getSearchHistory();
        history = history.filter(item => item.text !== query);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
        renderSearchHistory();
    } catch (e) {
        console.error('删除单条搜索历史失败:', e);
        showToast('删除单条搜索历史失败', 'error');
    }
}

function clearSearchHistory() {
    if (!checkPasswordProtection()) return;
    try {
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        renderSearchHistory();
        showToast('搜索历史已清除', 'success');
    } catch (e) {
        console.error('清除搜索历史失败:', e);
        showToast('清除搜索历史失败', 'error');
    }
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date; // Difference in milliseconds

    if (diff < 60000) return '刚刚'; // Less than 1 minute
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`; // Less than 1 hour
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`; // Less than 1 day

    // For dates older than a day, show date and time
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (now.getFullYear() === year && now.getMonth() === date.getMonth() && now.getDate() === date.getDate()) {
        // Same day
        return `今天 ${hours}:${minutes}`;
    } else if (now.getFullYear() === year && now.getMonth() === date.getMonth() && now.getDate() - 1 === date.getDate()) {
        // Yesterday
        return `昨天 ${hours}:${minutes}`;
    } else if (diff < 604800000) { // Less than 7 days
        return `${Math.floor(diff / 86400000)}天前`;
    }
    // Default format for older dates
    return `${year}-${month}-${day} ${hours}:${minutes}`;
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

function handleHistoryListClick(e) {
    const deleteButton = e.target.closest('.history-item-delete-btn');
    if (deleteButton) {
        e.stopPropagation();
        const historyItemEl = deleteButton.closest('.history-item');
        if (historyItemEl && historyItemEl.dataset.internalId) { // Use internalId for deletion
            deleteHistoryItemByInternalId(historyItemEl.dataset.internalId);
        }
        return;
    }
    const historyItemEl = e.target.closest('.history-item');
    if (historyItemEl) {
        const url = historyItemEl.dataset.url;
        const title = historyItemEl.dataset.title;
        const episodeIndex = parseInt(historyItemEl.dataset.episodeIndex, 10);
        const playbackPosition = parseInt(historyItemEl.dataset.playbackPosition, 10);
        const vodId = historyItemEl.dataset.vodId || '';
        const sourceName = historyItemEl.dataset.sourceName || '';
        const sourceCode = historyItemEl.dataset.sourceCode || '';
        let episodes = [];
        try { episodes = JSON.parse(historyItemEl.dataset.episodes || '[]'); } catch(e) {console.warn("Could not parse episodes from history item dataset");}

        if (typeof window.playFromHistory === 'function') {
            window.playFromHistory(url, title, episodeIndex, playbackPosition, vodId, sourceName, sourceCode, episodes);
        } else {
            console.error("playFromHistory function not found on window.");
            showToast("无法播放历史记录", "error");
        }
    }
}

function deleteHistoryItemByInternalId(internalIdToDelete) {
    if (!checkPasswordProtection()) return;
    try {
        let history = getViewingHistory();
        history = history.filter(item => item.internalShowIdentifier !== internalIdToDelete);
        localStorage.setItem('viewingHistory', JSON.stringify(history));
        loadViewingHistory();
        showToast('已删除该条观看历史', 'success');
    } catch (e) {
        console.error('删除观看历史失败:', e);
        showToast('删除观看历史失败', 'error');
    }
}

function formatPlaybackTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function addToViewingHistory(videoInfo) {
    if (!checkPasswordProtection()) return;
    try {
        let history = getViewingHistory();
        const internalId = getUniqueEpisodeId(videoInfo);
        const idx = history.findIndex(item => item.internalShowIdentifier === internalId);

        const newItemData = {
            title: videoInfo.title,
            url: videoInfo.url,
            episodeIndex: videoInfo.episodeIndex,
            sourceName: videoInfo.sourceName,
            sourceCode: videoInfo.sourceCode,
            vod_id: videoInfo.vod_id,
            internalShowIdentifier: internalId,
            playbackPosition: videoInfo.playbackPosition,
            duration: videoInfo.duration,
            timestamp: Date.now(),
            episodes: (videoInfo.episodes && videoInfo.episodes.length > 0) ? [...videoInfo.episodes] : []
        };

        if (idx !== -1) {
            // history[idx] = { ...history[idx], ...newItemData }; // This was causing issues with overwriting potentially different episode lists
            // Instead, specifically update fields that should change, and preserve others like 'episodes' if not provided anew.
            const existingItem = history[idx];
            existingItem.url = newItemData.url;
            existingItem.episodeIndex = newItemData.episodeIndex;
            existingItem.playbackPosition = newItemData.playbackPosition;
            existingItem.duration = newItemData.duration;
            existingItem.timestamp = newItemData.timestamp;
            // Only update episodes if the new videoInfo explicitly provides a different list
            if (newItemData.episodes.length > 0 && JSON.stringify(newItemData.episodes) !== JSON.stringify(existingItem.episodes)) {
                 existingItem.episodes = newItemData.episodes;
            }
            // Ensure other key identifiers are preserved from the original item if not in newItemData (though they should be)
            existingItem.title = newItemData.title || existingItem.title;
            existingItem.sourceName = newItemData.sourceName || existingItem.sourceName;
            existingItem.sourceCode = newItemData.sourceCode || existingItem.sourceCode;
            existingItem.vod_id = newItemData.vod_id || existingItem.vod_id;
            existingItem.internalShowIdentifier = newItemData.internalShowIdentifier || existingItem.internalShowIdentifier;


            history.splice(idx, 1);
            history.unshift(existingItem); // Use the modified existingItem
        } else {
            history.unshift(newItemData);
        }

        if (history.length > HISTORY_MAX_ITEMS) history.splice(HISTORY_MAX_ITEMS);
        localStorage.setItem('viewingHistory', JSON.stringify(history));
    } catch (e) { console.error('保存观看历史失败:', e); }
}

function clearViewingHistory() {
    if (!checkPasswordProtection()) return;
    try {
        localStorage.removeItem('viewingHistory');
        loadViewingHistory();
        showToast('观看历史已清除', 'success');
    } catch (e) {
        console.error('清除观看历史失败:', e);
        showToast('清除观看历史失败', 'error');
    }
}

function loadViewingHistory() {
    const historyList = getElementUi('historyList');
    if (!historyList) return;
    const history = getViewingHistory();
    if (!history.length) {
        historyList.innerHTML = `<div class="text-center text-gray-500 py-8">暂无观看记录</div>`;
        return;
    }
    const frag = document.createDocumentFragment();
    history.forEach(item => {
        const safeTitle = (item.title || '').replace(/[<>"']/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        const safeSource = (item.sourceName || '未知来源').replace(/[<>"']/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        const episodeText = item.episodeIndex !== undefined ? `第${item.episodeIndex + 1}集` : '';

        const historyItem = document.createElement('div');
        historyItem.className = 'history-item cursor-pointer relative group';
        historyItem.dataset.url = item.url;
        historyItem.dataset.title = safeTitle;
        historyItem.dataset.episodeIndex = item.episodeIndex || 0;
        historyItem.dataset.playbackPosition = item.playbackPosition || 0;
        historyItem.dataset.vodId = item.vod_id || '';
        historyItem.dataset.sourceName = item.sourceName || '';
        historyItem.dataset.sourceCode = item.sourceCode || '';
        historyItem.dataset.internalId = item.internalShowIdentifier;
        try { historyItem.dataset.episodes = JSON.stringify(item.episodes || []); } catch(e) { console.warn("Error stringifying episodes for dataset", e); }

        const historyInfo = document.createElement('div');
        historyInfo.className = 'history-info';
        const titleDiv = document.createElement('div');
        titleDiv.className = 'history-title';
        titleDiv.innerHTML = safeTitle;
        const metaDiv = document.createElement('div');
        metaDiv.className = 'history-meta';

        if (episodeText) {
            const episodeSpan = document.createElement('span');
            episodeSpan.className = 'history-episode';
            episodeSpan.innerHTML = episodeText;
            metaDiv.appendChild(episodeSpan);
            const separatorSpan = document.createElement('span');
            separatorSpan.className = 'history-separator mx-1';
            separatorSpan.innerHTML = '·';
            metaDiv.appendChild(separatorSpan);
        }
        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'history-source';
        sourceSpan.innerHTML = safeSource;
        metaDiv.appendChild(sourceSpan);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'history-time';
        timeDiv.textContent = formatTimestamp(item.timestamp);

        historyInfo.appendChild(titleDiv);
        historyInfo.appendChild(metaDiv);

        if (item.playbackPosition && item.duration && item.playbackPosition > 10 && item.playbackPosition < item.duration * 0.95) {
            const progressDiv = document.createElement('div');
            progressDiv.className = 'history-progress';
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            const progressFilled = document.createElement('div');
            progressFilled.className = 'progress-filled';
            progressFilled.style.width = `${Math.round(item.playbackPosition / item.duration * 100)}%`;
            const progressText = document.createElement('div');
            progressText.className = 'progress-text';
            progressText.textContent = `${formatPlaybackTime(item.playbackPosition)} / ${formatPlaybackTime(item.duration)}`;
            progressBar.appendChild(progressFilled);
            progressDiv.appendChild(progressBar);
            progressDiv.appendChild(progressText);
            historyInfo.appendChild(progressDiv);
        }
        historyInfo.appendChild(timeDiv);
        historyItem.appendChild(historyInfo);

        const deleteButton = document.createElement('button');
        deleteButton.className = 'history-item-delete-btn absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-red-400 p-1 rounded-full hover:bg-gray-800 z-10';
        deleteButton.title = '删除记录';
        deleteButton.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>`;
        historyItem.appendChild(deleteButton);
        frag.appendChild(historyItem);
    });
    historyList.innerHTML = '';
    historyList.appendChild(frag);
    if (history.length > 5) historyList.classList.add('pb-4');
}

function attachEventListeners() {
    const settingsButton = getElementUi('settingsButton');
    if (settingsButton) settingsButton.addEventListener('click', toggleSettings);

    const historyButton = getElementUi('historyButton');
    if (historyButton) historyButton.addEventListener('click', toggleHistory);

    const closeSettingsPanelButton = getElementUi('closeSettingsPanelButton');
    if (closeSettingsPanelButton) closeSettingsPanelButton.addEventListener('click', toggleSettings);

    const closeHistoryPanelButton = getElementUi('closeHistoryPanelButton');
    if (closeHistoryPanelButton) closeHistoryPanelButton.addEventListener('click', toggleHistory);

    const clearViewingHistoryButton = getElementUi('clearViewingHistoryButton');
    if (clearViewingHistoryButton) clearViewingHistoryButton.addEventListener('click', clearViewingHistory);

    const closeModalButton = getElementUi('closeModalButton');
    if (closeModalButton) closeModalButton.addEventListener('click', closeModal);

    const recentSearches = getElementUi('recentSearches');
    if (recentSearches) recentSearches.addEventListener('click', handleSearchTagClick);

    const historyList = getElementUi('historyList');
    if (historyList) historyList.addEventListener('click', handleHistoryListClick);

    initializeAdditionalListeners();
}

function initializeAdditionalListeners() {
    const apiSelectButtons = document.querySelectorAll('[data-action="selectAllAPIs"]');
    if (apiSelectButtons.length > 0) {
        const apiSelectHandler = function () {
            const selectAll = this.dataset.value === 'true';
            if (typeof window.selectAllAPIs === 'function') {
                window.selectAllAPIs(selectAll);
            }
        };
        apiSelectButtons.forEach(button => button.addEventListener('click', apiSelectHandler));
    }
    const addCustomApiButton = document.querySelector('[data-action="showAddCustomApiForm"]');
    if (addCustomApiButton && typeof window.showAddCustomApiForm === 'function') {
        addCustomApiButton.addEventListener('click', window.showAddCustomApiForm);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    attachEventListeners();
    if (typeof renderSearchHistory === 'function') renderSearchHistory();
    setupPanelAutoClose();
});

window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.closeModal = closeModal;
window.toggleSettings = toggleSettings;
window.toggleHistory = toggleHistory;
window.addToViewingHistory = addToViewingHistory;
window.clearViewingHistory = clearViewingHistory;
window.saveSearchHistory = saveSearchHistory;
window.clearSearchHistory = clearSearchHistory;
window.renderSearchHistory = renderSearchHistory;
window.deleteSingleSearchHistory = deleteSingleSearchHistory;

function setupPanelAutoClose() {
    document.addEventListener('click', function (event) {
        const settingsButton = getElementUi('settingsButton');
        const historyButton = getElementUi('historyButton');
        const settingsPanel = getElementUi('settingsPanel');
        const historyPanel = getElementUi('historyPanel');

        if (settingsButton && settingsButton.contains(event.target)) return;
        if (settingsPanel && settingsPanel.contains(event.target) && settingsPanel.classList.contains('show')) return;
        if (historyButton && historyButton.contains(event.target)) return;
        if (historyPanel && historyPanel.contains(event.target) && historyPanel.classList.contains('show')) return;

        if (settingsPanel && settingsPanel.classList.contains('show')) {
            settingsPanel.classList.remove('show');
            settingsPanel.setAttribute('aria-hidden', 'true');
        }
        if (historyPanel && historyPanel.classList.contains('show')) {
            historyPanel.classList.remove('show');
            historyPanel.setAttribute('aria-hidden', 'true');
        }
    });
}
