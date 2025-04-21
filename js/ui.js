// /js/ui.js

import { SEARCH_HISTORY_KEY, MAX_HISTORY_ITEMS, API_SITES } from './config.js';
import {
    getState,
    setUIState,
    addSearchHistoryItem,
    clearSearchHistoryStore,
    addViewingHistoryItem,
    clearViewingHistoryStore,
    deleteViewingHistoryItem,
    getSelectedAPIs,
    updateSelectedAPIs,
    setSetting // Make sure setSetting is correctly imported/available
} from './store.js';
import { createHistoryItemElement } from "./components/HistoryItem.js";
//import { showToast as globalShowToast } from './utils.js';

// ----------- Toast/Modal 控件 ------------

let toastQueue = [];
let isShowingToast = false;
export function showToast(message, type = 'error') {
    toastQueue.push({ message, type });
    if (!isShowingToast) showNextToast();
}
window.showToast = showToast; // For compatibility

function showNextToast() {
    if (!toastQueue.length) { isShowingToast = false; return; }
    isShowingToast = true;
    const { message, type } = toastQueue.shift();
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    if (!toast || !toastMsg) {
        // Attempt to recreate toast if missing? Or just exit.
        console.error("Toast element not found!");
        isShowingToast = false; // Prevent queue lock
        setTimeout(showNextToast, 50); // Try next one shortly
        return;
    }
    toastMsg.textContent = message;
    const bgColors = {
        error:   'bg-red-500',
        success: 'bg-green-500',
        info:    'bg-blue-500',
        warning: 'bg-yellow-500'
    };
    // Reset classes before applying new ones
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 text-white z-[100]`; // High z-index
    toast.classList.add(bgColors[type] || bgColors.error);

    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.visibility = 'visible'; // Ensure visibility

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-100%)';
        // Hide completely after transition
        setTimeout(() => {
           toast.style.visibility = 'hidden';
           showNextToast();
        }, 300); // Match transition duration
    }, 3000); // Toast display duration
}


// ----------- Loading 遮罩 -----------
let loadingTimeoutId = null;

export function showLoading(message = '加载中...') {
    if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
    const loading = document.getElementById('loading');
    if (!loading) {
        console.error("Loading element not found!");
        return;
    }
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

// ================== 数据源API复选框 ==================
function _getApiArr() {
    return Object.entries(API_SITES).map(([id, val]) => ({
        id, name: val.name || id, ...val
    }));
}

export function renderAPICheckboxes() {
    const container = document.getElementById('apiCheckboxes');
    if (!container) return;
    container.innerHTML = '';
    const selectedAPIs = getSelectedAPIs();
    const apis = _getApiArr();

    apis.forEach(api => {
        const id = api.id;
        const label = api.name;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `api-checkbox-${id}`;
        checkbox.value = id;
        checkbox.checked = selectedAPIs.includes(id);
        checkbox.className = 'form-checkbox h-4 w-4 text-indigo-600 bg-[#222] border-[#444] mr-2 cursor-pointer'; // Added cursor-pointer

        checkbox.addEventListener('change', function() {
            let currentSelected = getSelectedAPIs().slice();
            if (checkbox.checked) {
                if (!currentSelected.includes(id)) currentSelected.push(id);
            } else {
                // Prevent unchecking the last one
                if (currentSelected.length <= 1 && currentSelected.includes(id)) {
                    checkbox.checked = true; // Revert the change
                    showToast('至少保留一个数据源', 'warning');
                    return;
                }
                currentSelected = currentSelected.filter(x => x !== id);
            }
            updateSelectedAPIs(currentSelected);
            updateSelectedApiCount();
        });

        const labelEl = document.createElement('label');
        labelEl.htmlFor = checkbox.id;
        labelEl.textContent = label;
        labelEl.className = 'text-xs text-gray-300 flex-grow cursor-pointer'; // Added cursor-pointer, flex-grow

        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-center p-1 hover:bg-[#2a2a2a] rounded'; // Added hover effect and padding
        wrapper.appendChild(checkbox);
        wrapper.appendChild(labelEl);

        container.appendChild(wrapper);
    });
    updateSelectedApiCount();
}


function updateSelectedApiCount() {
    const el = document.getElementById('selectedApiCount');
    if (!el) return;
    el.textContent = getSelectedAPIs().length;
}

// =================== 搜索历史相关 ===================
export function renderSearchHistory() {
    const container = document.getElementById('recentSearches');
    if (!container) return;
    const history = getState().searchHistory;

    // Clear previous content except potential header/clear button if managed separately
    // A safer approach is to always clear and rebuild
    container.innerHTML = '';

    if (!history.length) {
        // Optionally display a message or leave it empty
        // container.innerHTML = '<span class="text-xs text-gray-500">无最近搜索</span>';
        return;
    }

    // Add Header and Clear Button
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex justify-between items-center w-full mb-2';
    headerDiv.innerHTML = `
        <div class="text-xs text-gray-500">最近搜索:</div>
        <button id="clearHistoryBtn" class="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-[#333]" aria-label="清除搜索历史">清除</button>
      `;
    container.appendChild(headerDiv);

    // Add History Tags
    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'flex flex-wrap gap-2'; // Ensure tags wrap

    history.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'search-tag bg-[#333] hover:bg-[#444] text-gray-300 text-xs px-3 py-1 rounded-full transition-colors'; // Example styling
        btn.textContent = item.text;
        btn.title = item.timestamp ? `搜索于: ${formatTimestamp(item.timestamp)}` : ''; // Use formatTimestamp
        // Add data attribute for easier retrieval if needed
        btn.dataset.searchText = item.text;
        tagsWrapper.appendChild(btn);
    });
    container.appendChild(tagsWrapper);

    // Add clear button listener dynamically (if not using event delegation below)
    const clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
             if (confirm('确定要清除所有搜索历史吗？')) {
                clearSearchHistoryStore();
                showToast('搜索历史已清除', 'success');
                renderSearchHistory(); // Re-render to show empty state
            }
        });
    }
}


// Event delegation for search history clicks
document.addEventListener('click', function(e) {
    // Handle clicks on search tags
    if (e.target.classList.contains('search-tag')) {
        const input = document.getElementById('searchInput');
        const searchText = e.target.dataset.searchText || e.target.textContent; // Prefer data attribute
        if (input) {
            input.value = searchText;
            input.focus(); // Optional: focus the input
            // Trigger search programmatically if needed (assuming search() is global or accessible)
            if (typeof window.performSearch === 'function') {
                 window.performSearch(searchText);
            } else if (document.getElementById('searchForm')) {
                 // Or submit the form
                 document.getElementById('searchForm').requestSubmit();
            }
        }
    }
     // Note: Clear button listener added directly in renderSearchHistory now
    // else if (e.target && e.target.id === 'clearHistoryBtn') {
    //    // ... handled above ...
    // }
});


// =================== 观看历史相关 ===================
export function loadViewingHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const history = getState().viewingHistory;
    list.innerHTML = ''; // Clear previous items
    if (!history || !history.length) {
        list.innerHTML = '<div class="text-center text-gray-500 py-8">暂无观看记录</div>';
        return;
    }
    const frag = document.createDocumentFragment();
    // Sort history by timestamp descending (most recent first)
    history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    history.forEach(item => {
        const elem = createHistoryItemElement(item, "viewing", playFromHistory, () => { // Pass delete callback directly
            if (confirm(`确定要删除观看记录 "${item.title}" 吗？`)) {
                deleteViewingHistoryItem(item.title); // Pass title for deletion
                loadViewingHistory(); // Refresh the list
                showToast(`已删除 "${item.title}"`, 'success');
            }
        });
        if (elem) { // Ensure element was created
           frag.appendChild(elem);
        }
    });
    list.appendChild(frag);
}

// Clear Viewing History Button Listener (should be attached once)
document.addEventListener('DOMContentLoaded', () => {
    const clearBtn = document.getElementById('clearViewingHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有观看历史记录吗？此操作不可恢复。')) {
                clearViewingHistory(); // Call the function below
            }
        });
    }
});


export function clearViewingHistory() {
    clearViewingHistoryStore();
    showToast('观看历史已清空', 'success');
    loadViewingHistory(); // Refresh the list immediately
}
// No need for window.clearViewingHistory = clearViewingHistory; if called internally


export function playFromHistory(url, title, episodeIndex = 0, playbackPosition = 0, passedEpisodes = null) {
    try {
        let episodesList = [];
        // Prioritize passedEpisodes if available
        if (Array.isArray(passedEpisodes) && passedEpisodes.length > 0) {
            episodesList = passedEpisodes;
        } else {
            // Fallback to fetching from state/history
            const history = getState().viewingHistory;
            const item = history.find(h => h.title === title);
            if (item?.episodes?.length) {
                episodesList = item.episodes;
            }
            // Maybe remove the localStorage fallback unless it's essential
            // else { try { const cand = JSON.parse(localStorage.getItem('currentEpisodes') || '[]'); if (cand.length) episodesList = cand; } catch {} }
        }

        // --- Save episodes to sessionStorage for the player page ---
        try {
            if (episodesList.length > 0) {
                sessionStorage.setItem('playerEpisodeList', JSON.stringify(episodesList));
            } else {
                sessionStorage.removeItem('playerEpisodeList'); // Clear if no episodes
            }
        } catch (e) {
            console.error("Failed to save episodes to sessionStorage:", e);
            showToast('无法暂存剧集列表', 'error'); // Inform user
        }

        const posParam = playbackPosition > 5 ? `&position=${Math.floor(playbackPosition)}` : ''; // Only add if significant position
        const indexParam = episodeIndex >= 0 ? `&index=${episodeIndex}` : ''; // Always add index if >= 0

        // Construct the player URL
        let targetUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}${indexParam}${posParam}`;

        console.log("Opening player:", targetUrl); // Debugging
        window.open(targetUrl, '_blank');

    } catch (e) {
        console.error("Error in playFromHistory:", e);
        showToast(`播放时出错: ${e.message}`, 'error');
        // Fallback to basic URL if construction fails
        window.open(`player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=0`, '_blank');
    }
}
window.playFromHistory = playFromHistory; // Keep global if needed by HTML inline handlers


// ============== 友好格式化 ==============
export function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHour = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHour / 24);

    if (diffSec < 60) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffHour < 24) return `${diffHour}小时前`;
    if (diffDay < 7) return `${diffDay}天前`;
    // Older than a week, show date
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}
window.formatTimestamp = formatTimestamp;


export function formatPlaybackTime(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) return '00:00';
    const totalSeconds = Math.floor(seconds);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');

    return h > 0 ? `${h}:${mStr}:${sStr}` : `${mStr}:${sStr}`;
}
window.formatPlaybackTime = formatPlaybackTime;

// ===================== 面板可见性 =====================

// Toggle Settings Panel
export function toggleSettings(e) {
    e?.stopPropagation(); // Use optional chaining
    const isVisible = getState().uiState.settingsPanelVisible;
    setUIState('settingsPanelVisible', !isVisible);
    if (!isVisible) { // If opening settings
        setUIState('historyPanelVisible', false); // Close history
    }
}
window.toggleSettings = toggleSettings;

// Toggle History Panel
export function toggleHistory(e) {
    e?.stopPropagation();
    const isVisible = getState().uiState.historyPanelVisible;
    setUIState('historyPanelVisible', !isVisible);
    if (!isVisible) { // If opening history
        setUIState('settingsPanelVisible', false); // Close settings
        loadViewingHistory(); // Load history content when opening
    }
}
window.toggleHistory = toggleHistory;


// Panel Visibility State Change Listener
document.addEventListener('stateChange', (e) => {
    if (!e.detail?.changedKeys?.includes('uiState')) return;

    const uiState = getState().uiState;
    const settingsPanel = document.getElementById('settingsPanel');
    const historyPanel = document.getElementById('historyPanel');

    if (settingsPanel) {
        settingsPanel.classList.toggle('show', uiState.settingsPanelVisible);
        settingsPanel.setAttribute('aria-hidden', !uiState.settingsPanelVisible);
    }
    if (historyPanel) {
        historyPanel.classList.toggle('show', uiState.historyPanelVisible);
        historyPanel.setAttribute('aria-hidden', !uiState.historyPanelVisible);
    }
});

// Click Outside Panels to Close Listener
document.addEventListener('click', function(e) {
    const historyPanel = document.getElementById('historyPanel');
    const historyBtn = document.getElementById('historyBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsBtn = document.getElementById('settingsBtn');

    // Close history if click is outside panel and button
    if (historyPanel?.classList.contains('show') &&
        !historyPanel.contains(e.target) &&
        !historyBtn?.contains(e.target)) {
        setUIState('historyPanelVisible', false);
    }

    // Close settings if click is outside panel and button
    if (settingsPanel?.classList.contains('show') &&
        !settingsPanel.contains(e.target) &&
        !settingsBtn?.contains(e.target)) {
        setUIState('settingsPanelVisible', false);
    }
});

// Close buttons inside panels
document.addEventListener('DOMContentLoaded', () => {
    const historyCloseBtn = document.getElementById('historyPanelClose');
    const settingsCloseBtn = document.getElementById('settingsPanelClose');

    historyCloseBtn?.addEventListener('click', () => setUIState('historyPanelVisible', false));
    settingsCloseBtn?.addEventListener('click', () => setUIState('settingsPanelVisible', false));
});


// ===================== ★★★ 过滤/设置开关控制 (新增/修改) ★★★ =====================

/**
 * Updates the visual appearance of a toggle switch.
 * ADAPT THIS FUNCTION based on your specific HTML structure and CSS classes/styles.
 */
function updateToggleVisuals(toggleElement, isChecked) {
    if (!toggleElement) return;
    // Find the related visual elements (assuming structure from index.html)
    const container = toggleElement.parentElement; // The div with relative positioning
    const toggleBg = container?.querySelector('.toggle-bg');
    const toggleDot = container?.querySelector('.toggle-dot');

    if (!toggleBg || !toggleDot) {
        // console.warn("Could not find toggle visual elements for:", toggleElement.id);
        return;
    }

    if (isChecked) {
        // --- Styles for ON state ---
        // Example: Change background color and move the dot
        toggleBg.style.backgroundColor = '#4F46E5'; // Example: Indigo-600
        // Make sure the translate value matches your Tailwind config or CSS (e.g., w-5 dot needs translateX(calc(w-12 - w-5 - 2*left-0.5)) approx)
        // Inspect element in browser to find the right translate value for the 'on' position
        toggleDot.style.transform = 'translateX(1.75rem)'; // Adjust based on your sizes (w-12 bg, w-5 dot, left-0.5 => 3rem - 1.25rem - 0.25rem*2 = 1.25rem? No, seems like 1.75rem works for default TW)
        container.classList.add('toggle-on'); // Optional: Add a class for easier targeting
        container.classList.remove('toggle-off');
    } else {
        // --- Styles for OFF state ---
        toggleBg.style.backgroundColor = '#333'; // Example: Gray background
        toggleDot.style.transform = 'translateX(0)';
        container.classList.remove('toggle-on');
        container.classList.add('toggle-off'); // Optional
    }
}


/**
 * Adds event listener to a toggle switch and ensures visual consistency.
 */
export function addToggleListener(id, settingKey) {
    const el = document.getElementById(id);
    if (el) {
         // Prevent adding multiple listeners if this runs again
         if (el.dataset.listenerAdded === 'true') return;

        el.addEventListener('change', e => {
            const isEnabled = e.target.checked;
            setSetting(settingKey, isEnabled); // Save the setting state
            updateToggleVisuals(el, isEnabled); // ★ Update visuals on change
        });
         el.dataset.listenerAdded = 'true'; // Mark as added
    } else {
        // console.warn(`Toggle element with id "${id}" not found.`);
    }
}


/**
 * ★★★ Initializes the state and visuals of filter toggles on load. ★★★
 */
function initializeFilterToggles() {
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    const adFilterToggle = document.getElementById('adFilterToggle');

    // --- Yellow Filter ---
    if (yellowFilterToggle) {
        const settingKey = 'yellowFilterEnabled'; // CONFIRM this key is correct in your store.js
        // Read from store. Adjust path if necessary (e.g., getState().userSettings)
        const currentStoredValue = getState().settings?.[settingKey];

        // Default to TRUE if not explicitly set to false
        const shouldBeEnabled = currentStoredValue !== false;

        yellowFilterToggle.checked = shouldBeEnabled;
        updateToggleVisuals(yellowFilterToggle, shouldBeEnabled); // ★ Set initial visual state

        // Optional: Save the default 'true' back if it was previously undefined/null
        if (currentStoredValue === undefined || currentStoredValue === null) {
            setSetting(settingKey, true);
        }

        // Add listener for future changes (listener checks if already added)
        addToggleListener('yellowFilterToggle', settingKey);
    }

    // --- Ad Filter ---
    if (adFilterToggle) {
        const settingKey = 'adFilterEnabled'; // CONFIRM this key is correct in your store.js
        const currentStoredValue = getState().settings?.[settingKey];

        // Default to TRUE if not explicitly set to false
        const shouldBeEnabled = currentStoredValue !== false;

        adFilterToggle.checked = shouldBeEnabled;
        updateToggleVisuals(adFilterToggle, shouldBeEnabled); // ★ Set initial visual state

        // Optional: Save the default 'true' back if it was previously undefined/null
        if (currentStoredValue === undefined || currentStoredValue === null) {
            setSetting(settingKey, true);
        }

        // Add listener for future changes
        addToggleListener('adFilterToggle', settingKey);
    }
}

// ===================== Initialization on DOM Ready =====================

document.addEventListener('DOMContentLoaded', function() {
    // Render dynamic elements
    renderAPICheckboxes();
    renderSearchHistory(); // Initial render of search history

    // ★★★ Initialize filter toggles to default state ★★★
    initializeFilterToggles();

    // Load viewing history if panel happens to be open on load (though usually starts closed)
    if (getState().uiState.historyPanelVisible) {
        loadViewingHistory();
    }

    // Attach listeners for panel buttons (if not handled by inline onclick)
    const historyBtn = document.getElementById('historyBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    historyBtn?.addEventListener('click', toggleHistory);
    settingsBtn?.addEventListener('click', toggleSettings);

    // ... other initialization ...
});


// ===================== 兼容旧逻辑 (保留需要的) =====================
// window.showToast = showToast; // Already done
// window.showLoading = showLoading; // Already done
// window.hideLoading = hideLoading; // Already done
window.clearViewingHistory = clearViewingHistory; // Called internally now, maybe remove global
// window.playFromHistory = playFromHistory; // Kept for now
// window.formatTimestamp = formatTimestamp; // Kept
// window.formatPlaybackTime = formatPlaybackTime; // Kept
// window.toggleSettings = toggleSettings; // Already done
// window.toggleHistory = toggleHistory; // Already done

window.loadViewingHistory = loadViewingHistory;
