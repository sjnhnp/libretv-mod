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
    setSetting // <-- Make sure setSetting is correctly imported and working
} from './store.js';
import { createHistoryItemElement } from "./components/HistoryItem.js";

// ----------- Toast/Modal 控件 ------------

let toastQueue = [];
let isShowingToast = false;
export function showToast(message, type = 'error') {
    toastQueue.push({ message, type });
    if (!isShowingToast) showNextToast();
}
window.showToast = showToast;

function showNextToast() {
    if (!toastQueue.length) { isShowingToast = false; return; }
    isShowingToast = true;
    const { message, type } = toastQueue.shift();
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    if (!toast || !toastMsg) {
        isShowingToast = false; // Reset if elements aren't found
        return;
    }
    toastMsg.textContent = message;
    const bgColors = {
        error:   'bg-red-500',
        success: 'bg-green-500',
        info:    'bg-blue-500',
        warning: 'bg-yellow-500'
    };
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${bgColors[type] || bgColors.error} text-white z-[9999]`; // Added high z-index
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-100%)';
        // Wait for fade out animation before processing next toast
        setTimeout(() => {
            // Check if toast element still exists before proceeding
             if (document.getElementById('toast')) {
               showNextToast();
            } else {
               isShowingToast = false; // Reset if element gone
            }
        }, 300); // Match CSS transition duration
    }, 3000); // Toast visible duration
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

// ================== 数据源API复选框渲染和勾选 ==================

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
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-center';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `api-checkbox-${id}`;
        checkbox.value = id;
        checkbox.checked = selectedAPIs.includes(id);
        checkbox.className = 'form-checkbox h-4 w-4 text-indigo-600 bg-[#222] border-[#444] rounded focus:ring-indigo-500 cursor-pointer'; // Added rounded, focus, cursor

        checkbox.addEventListener('change', function() {
            let currentSelected = getSelectedAPIs().slice();
            if (checkbox.checked) {
                if (!currentSelected.includes(id)) currentSelected.push(id);
            } else {
                // Prevent unchecking the last one
                if (currentSelected.length <= 1 && currentSelected.includes(id)) {
                    checkbox.checked = true; // Revert the check
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
        labelEl.className = 'ml-2 text-xs text-gray-300 cursor-pointer'; // Use ml-2 for spacing

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
    const history = getState().searchHistory || []; // Ensure history is an array

    // Clear previous content except potentially the header/clear button if managed differently
    container.innerHTML = ''; // Simple clear for now

    if (!history.length) {
        // Optional: display a message or leave empty
        // container.innerHTML = '<div class="text-gray-500 text-sm">无搜索记录</div>';
        return;
    }

    // Add Header and Clear Button
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex justify-between items-center w-full mb-2';
    headerDiv.innerHTML = `
        <div class="text-xs text-gray-500">最近搜索:</div>
        <button id="clearHistoryBtn" class="text-xs text-gray-500 hover:text-white transition-colors" aria-label="清除搜索历史">清除</button>
    `;
    container.appendChild(headerDiv);

    // Add History Tags
    const tagsWrapper = document.createElement('div'); // Wrap tags for better layout control if needed
    tagsWrapper.className = 'flex flex-wrap gap-2'; // Use flex-wrap and gap
    history.forEach(item => {
        const btn = document.createElement('button');
        // Use classes consistent with index.html search tags if any, or define new ones
        btn.className = 'search-tag px-2 py-1 bg-[#333] hover:bg-[#444] text-gray-300 text-xs rounded transition-colors';
        btn.textContent = item.text;
        btn.title = item.timestamp ? `搜索于: ${formatTimestamp(item.timestamp)}` : ''; // Use formatTimestamp
        btn.type = 'button'; // Prevent form submission if inside a form implicitly
        tagsWrapper.appendChild(btn);
    });
    container.appendChild(tagsWrapper);
}


// =================== 观看历史相关 ===================
export function loadViewingHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const history = getState().viewingHistory || []; // Ensure history is an array
    list.innerHTML = ''; // Clear previous items

    if (!history.length) {
        list.innerHTML = '<div class="text-center text-gray-500 py-8">暂无观看记录</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    // Sort history by timestamp descending (most recent first)
    history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    history.forEach(item => {
        const elem = createHistoryItemElement(item, "viewing", playFromHistory, () => { // Simplified delete callback
            deleteViewingHistoryItem(item.id || item.title); // Use item.id if available, fallback to title
            loadViewingHistory(); // Reload list after deletion
            showToast('已删除该记录', 'success');
        });
        if (elem) frag.appendChild(elem); // Ensure elem was created
    });
    list.appendChild(frag);
}


export function clearViewingHistory() {
    clearViewingHistoryStore();
    showToast('观看历史已清空', 'success');
    loadViewingHistory(); // Reload to show empty state
}
// No need to attach clearViewingHistory to window if button calls it via module import/event listener

// Modified playFromHistory (assuming structure from previous interactions)
export function playFromHistory(url, title, episodeIndex, playbackPosition = 0, passedEpisodes = null) {
    try {
        let episodesList = [];
        if (Array.isArray(passedEpisodes) && passedEpisodes.length > 0) {
            episodesList = passedEpisodes;
        } else {
            const history = getState().viewingHistory;
            // Prefer finding by ID if available, fallback to title
            const historyItem = history.find(h => (h.id && h.id === (passedEpisodes?.id || title)) || h.title === title);
            if (historyItem?.episodes?.length) {
                episodesList = historyItem.episodes;
            }
             // Optional: Fallback to localStorage if needed, but history should be primary
             /* else {
                try {
                    const cand = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
                    if (cand.length) episodesList = cand;
                } catch (error) { console.warn("Error parsing currentEpisodes from localStorage", error); }
            } */
        }

        // Store episodes for the player page
        try {
            if (episodesList.length > 0) {
                // Use a more specific key including the title/id to avoid conflicts
                const storageKey = `playerEpisodes_${title}`; // Or use a unique ID if available
                sessionStorage.setItem(storageKey, JSON.stringify(episodesList));
            } else {
                 // Consider if removing is necessary or if player should handle empty list
                // sessionStorage.removeItem(`playerEpisodes_${title}`);
            }
        } catch (e) {
            console.error("Failed to save episodes to sessionStorage:", e);
        }

        // Construct player URL
        const playerUrl = new URL('player.html', window.location.origin); // Base URL
        playerUrl.searchParams.set('url', url); // Original video source URL
        playerUrl.searchParams.set('title', title);
        if (episodeIndex !== undefined && episodeIndex !== null && episodeIndex >= 0) {
            playerUrl.searchParams.set('index', episodeIndex);
        }
        if (playbackPosition > 5) { // Set position only if significant
            playerUrl.searchParams.set('position', Math.floor(playbackPosition));
        }
        // Pass the sessionStorage key for episodes
        if (episodesList.length > 0) {
           playerUrl.searchParams.set('episodesKey', `playerEpisodes_${title}`);
        }


        window.open(playerUrl.toString(), '_blank');

    } catch (e) {
        console.error("Error in playFromHistory:", e);
        showToast('无法打开播放器', 'error');
        // Fallback to simpler URL if construction fails
        window.open(`player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=${episodeIndex}`, '_blank');
    }
}
// Keep window attachment if legacy code might rely on it
window.playFromHistory = playFromHistory;


// ============== 友好格式化 ==============
export function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.round((now - date) / 1000);
    const diffMinutes = Math.round(diffSeconds / 60);
    const diffHours = Math.round(diffMinutes / 60);
    const diffDays = Math.round(diffHours / 24);

    if (diffSeconds < 60) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    // Optional: More detailed date for older entries
    // return date.toLocaleDateString('zh-CN');
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
}
window.formatTimestamp = formatTimestamp;

export function formatPlaybackTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h.toString()}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
window.formatPlaybackTime = formatPlaybackTime;

// ===================== 面板可见性控制 =====================

function setPanelVisibility(panelId, isVisible) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const currentlyVisible = panel.classList.contains('show'); // Or check transform/opacity

    if (isVisible && !currentlyVisible) {
        panel.classList.remove('hidden'); // Ensure not hidden if using display:none
        // Force reflow before adding transition class if needed
        // void panel.offsetWidth;
        panel.classList.add('show'); // Add class that triggers transition (e.g., transform, opacity)
        panel.setAttribute('aria-hidden', 'false');
        // Focus management: maybe focus the first focusable element inside
        // const firstFocusable = panel.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        // if (firstFocusable) firstFocusable.focus();
    } else if (!isVisible && currentlyVisible) {
        panel.classList.remove('show');
        panel.setAttribute('aria-hidden', 'true');
         // Optional: Add hidden class after transition ends if using display: none/flex
        /* panel.addEventListener('transitionend', () => {
            if (!panel.classList.contains('show')) { // Check again in case it was reopened quickly
               panel.classList.add('hidden');
            }
        }, { once: true }); */
    }
}


// 监听全局状态变化来更新面板显隐
document.addEventListener('stateChange', (e) => {
    const keys = e.detail.changedKeys || [];
    if (keys.includes('uiState')) {
        const uiState = getState().uiState;
        setPanelVisibility('settingsPanel', uiState.settingsPanelVisible);
        setPanelVisibility('historyPanel', uiState.historyPanelVisible);
    }
    // Reload viewing history if history panel becomes visible
    if (keys.includes('uiState') && getState().uiState.historyPanelVisible) {
       // Maybe debounce this if state changes rapidly
       loadViewingHistory();
    }
});


// 按钮点击事件 (Setup in DOMContentLoaded)
function setupPanelToggleButtons() {
    const settingsBtn = document.getElementById('settingsBtn');
    const historyBtn = document.getElementById('historyBtn');
    const settingsPanelClose = document.getElementById('settingsPanelClose');
    const historyPanelClose = document.getElementById('historyPanelClose');
    const clearViewingHistoryBtn = document.getElementById('clearViewingHistoryBtn'); // Clear viewing history button

    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = getState().uiState.settingsPanelVisible;
            setUIState('settingsPanelVisible', !isVisible);
            if (!isVisible) setUIState('historyPanelVisible', false); // Close other panel
        });
    }

    if (historyBtn) {
        historyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = getState().uiState.historyPanelVisible;
            setUIState('historyPanelVisible', !isVisible);
            if (!isVisible) {
                setUIState('settingsPanelVisible', false); // Close other panel
                // loadViewingHistory(); // Load history when opening (also handled by stateChange listener)
            }
        });
    }

    if (settingsPanelClose) {
        settingsPanelClose.addEventListener('click', () => setUIState('settingsPanelVisible', false));
    }

    if (historyPanelClose) {
        historyPanelClose.addEventListener('click', () => setUIState('historyPanelVisible', false));
    }

    // Clear viewing history button listener
     if (clearViewingHistoryBtn) {
        clearViewingHistoryBtn.addEventListener('click', clearViewingHistory);
    }


    // Panel外点击自动关闭
    document.addEventListener('click', function(e) {
        const historyPanel = document.getElementById('historyPanel');
        const settingsPanel = document.getElementById('settingsPanel');

        // Close history panel if click is outside history panel and its toggle button
        if (historyPanel?.classList.contains('show') && historyBtn && !historyPanel.contains(e.target) && !historyBtn.contains(e.target)) {
            setUIState('historyPanelVisible', false);
        }
        // Close settings panel if click is outside settings panel and its toggle button
        if (settingsPanel?.classList.contains('show') && settingsBtn && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            setUIState('settingsPanelVisible', false);
        }
    });
}


// ===================== 过滤/设置开关控制 (新逻辑) =====================

/**
 * Attaches a change listener to a toggle switch to save its state.
 * Also triggers a visual update if necessary.
 * @param {string} id - The ID of the input checkbox element.
 * @param {string} settingKey - The key to use for saving the setting in the store.
 */
function addToggleListener(id, settingKey) {
    const el = document.getElementById(id);
    if (el && !el.dataset.listenerAttached) { // Prevent adding multiple listeners
        el.addEventListener('change', e => {
            const isEnabled = e.target.checked;
            setSetting(settingKey, isEnabled);
            // updateToggleVisuals(el, isEnabled); // <-- UNCOMMENT if visual update function is needed
        });
        el.dataset.listenerAttached = 'true'; // Mark listener as attached
    }
}

/**
 * Initializes the state of filter toggles based on stored settings,
 * defaulting to ON if no setting is found.
 */
function initializeFilterToggles() {
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    const adFilterToggle = document.getElementById('adFilterToggle');

    // --- Yellow Filter ---
    if (yellowFilterToggle) {
        const yellowSettingKey = 'yellowFilterEnabled'; // ADJUST KEY IF NEEDED
        // Safely access settings, assuming it might be undefined initially
        const currentYellowValue = getState().settings?.[yellowSettingKey];

        // Default to true (ON) unless explicitly set to false
        const shouldBeEnabled = currentYellowValue !== false;

        yellowFilterToggle.checked = shouldBeEnabled;

        // Optional: Save the default 'true' back if it was initially undefined/null
        if (currentYellowValue === undefined || currentYellowValue === null) {
            setSetting(yellowSettingKey, true);
        }

        // Add listener for future changes
        addToggleListener('yellowFilterToggle', yellowSettingKey);

        // Trigger initial visual state update
        // updateToggleVisuals(yellowFilterToggle, shouldBeEnabled); // <-- UNCOMMENT if needed
    }

    // --- Ad Filter ---
    if (adFilterToggle) {
        const adSettingKey = 'adFilterEnabled'; // ADJUST KEY IF NEEDED
        const currentAdValue = getState().settings?.[adSettingKey];

        // Default to true (ON) unless explicitly set to false
        const shouldBeEnabled = currentAdValue !== false;

        adFilterToggle.checked = shouldBeEnabled;

        // Optional: Save the default 'true' back if it was initially undefined/null
        if (currentAdValue === undefined || currentAdValue === null) {
            setSetting(adSettingKey, true);
        }

        // Add listener for future changes
        addToggleListener('adFilterToggle', adSettingKey);

        // Trigger initial visual state update
        // updateToggleVisuals(adFilterToggle, shouldBeEnabled); // <-- UNCOMMENT if needed
    }
}


/* --- Visual Update Function Example --- */
/*
   Uncomment and implement this function IF your toggle switch's appearance
   (background color, dot position) is controlled by CSS classes or inline styles
   that need to be updated by JavaScript, IN ADDITION TO the input's :checked state.
   If your CSS relies *only* on selectors like:
   input:checked + .toggle-bg { ... }
   input:checked + .toggle-bg + .toggle-dot { ... }
   then you likely DON'T need this function. Inspect your styles.css.
*/
/*
function updateToggleVisuals(toggleElement, isChecked) {
    const parent = toggleElement.closest('.relative'); // Find the container holding visual parts
    if (!parent) return;

    const toggleBg = parent.querySelector('.toggle-bg');
    const toggleDot = parent.querySelector('.toggle-dot');

    if (!toggleBg || !toggleDot) return; // Ensure visual elements exist

    if (isChecked) {
        // Example: Apply 'ON' styles
        toggleBg.classList.remove('bg-[#333]'); // Remove OFF background
        toggleBg.classList.add('bg-indigo-600');   // Add ON background (Tailwind example)
        toggleDot.style.transform = 'translateX(1.25rem)'; // Move dot (Adjust value based on your CSS)
        // Or add an active class: parent.classList.add('toggle-active');
    } else {
        // Example: Apply 'OFF' styles
        toggleBg.classList.remove('bg-indigo-600'); // Remove ON background
        toggleBg.classList.add('bg-[#333]');   // Add OFF background
        toggleDot.style.transform = 'translateX(0)';      // Reset dot position
        // Or remove active class: parent.classList.remove('toggle-active');
    }
}
*/
/* --- End Visual Update Function Example --- */


// ===================== Initialization on DOM Ready =====================

document.addEventListener('DOMContentLoaded', function() {
    // Render dynamic content
    renderAPICheckboxes();
    renderSearchHistory(); // Render initial search history if needed on load
    // loadViewingHistory(); // Load initial view history (now handled by stateChange or panel open)

    // Initialize filter toggle states (NEW)
    initializeFilterToggles();

    // Setup button listeners
    setupPanelToggleButtons();

    // Search History interaction logic (using event delegation on the container)
    const searchHistoryContainer = document.getElementById('recentSearches');
    if (searchHistoryContainer) {
        searchHistoryContainer.addEventListener('click', function(e){
            if (e.target.classList.contains('search-tag')) {
                const input = document.getElementById('searchInput');
                if (input) {
                    input.value = e.target.textContent;
                    // Optionally trigger search immediately
                    const searchForm = document.getElementById('searchForm');
                    if (searchForm) searchForm.requestSubmit(); // Modern way to submit form
                    // Or call a global search function if you have one: window.search();
                }
            } else if (e.target && e.target.id === 'clearHistoryBtn') {
                clearSearchHistoryStore();
                // renderSearchHistory(); // Re-render to show empty state
                showToast('搜索历史已清除', 'success');
            }
        });
    }

    // Add listener for clearing viewing history (moved to setupPanelToggleButtons)
    // const clearViewingHistoryBtn = document.getElementById('clearViewingHistoryBtn');
    // if (clearViewingHistoryBtn) {
    //    clearViewingHistoryBtn.addEventListener('click', clearViewingHistory);
    // }

});


// ===================== Ensure essential functions are globally accessible if needed =====================
// Already done via `window.someFunction = someFunction` or `export` for modules.
// Keep `window.` attachments if non-module scripts might need them.
// Remove `window.` if everything is module-based and you import where needed.

// /js/ui.js
// (Previous code from the last response goes here...)
// ... imports, toast, loading, modal, site status, api checkboxes, search history, viewing history, playFromHistory, formatters, panel visibility, filter toggles, initializeFilterToggles, addToggleListener, updateToggleVisuals (commented) ...

// ===================== Initialization on DOM Ready =====================

document.addEventListener('DOMContentLoaded', function() {
    // Render dynamic content
    renderAPICheckboxes(); // Render API source selection checkboxes
    renderSearchHistory(); // Render initial search history tags (if any)
    // loadViewingHistory(); // Load initial view history (now handled by stateChange or panel open for better performance)

    // Initialize filter toggle states (Default ON logic)
    initializeFilterToggles();

    // Setup button listeners for panels and other actions
    setupPanelToggleButtons(); // Sets up settings/history toggles, close buttons, etc.

    // Search History interaction logic (using event delegation on the container)
    const searchHistoryContainer = document.getElementById('recentSearches');
    if (searchHistoryContainer) {
        searchHistoryContainer.addEventListener('click', function(e){
            const target = e.target;
            // Handle click on a search tag
            if (target.classList.contains('search-tag')) {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.value = target.textContent; // Fill input with tag text
                    // Optionally trigger search immediately after clicking a tag
                    const searchForm = document.getElementById('searchForm'); // Assuming your form has this ID
                    if (searchForm && typeof searchForm.requestSubmit === 'function') {
                        searchForm.requestSubmit(); // Modern way to submit programmatically
                    } else if (typeof window.search === 'function') {
                        // Fallback if you have a global search function
                        window.search();
                    }
                     // Maybe close settings/history panels after clicking a tag
                     // setUIState('settingsPanelVisible', false);
                     // setUIState('historyPanelVisible', false);
                }
            }
            // Handle click on the "Clear" history button
            else if (target.id === 'clearHistoryBtn') {
                clearSearchHistoryStore(); // Clear the history in the store
                renderSearchHistory(); // Re-render the section (will show empty state)
                showToast('搜索历史已清除', 'success');
            }
        });
    }

    // Viewing History List interaction (using event delegation on the list)
    const historyList = document.getElementById('historyList');
    if (historyList) {
        historyList.addEventListener('click', (e) => {
            const itemElement = e.target.closest('.history-item'); // Find the parent history item element
            if (!itemElement) return; // Click wasn't inside a history item

            // Handle clicks on the play button within a history item
            if (e.target.closest('.play-history-button')) { // Use a specific class for the play button
                const { url, title, index, position, episodes } = itemElement.dataset; // Get data from data-* attributes
                 if (url && title) {
                    playFromHistory(
                        url,
                        title,
                        index ? parseInt(index, 10) : 0, // Ensure index is a number
                        position ? parseFloat(position) : 0, // Ensure position is a number
                        episodes ? JSON.parse(episodes) : null // Parse episodes if stored as JSON string
                    );
                 } else {
                     console.warn("Missing data attributes on history item for playback", itemElement.dataset);
                     showToast("无法播放，数据不完整", "error");
                 }
            }

            // Handle clicks on the delete button within a history item
            else if (e.target.closest('.delete-history-button')) { // Use a specific class for the delete button
                const { id, title } = itemElement.dataset; // Get id or title for deletion
                if (id || title) {
                    deleteViewingHistoryItem(id || title); // Use ID if available, otherwise title
                    loadViewingHistory(); // Reload list to reflect deletion
                    showToast('已删除该记录', 'success');
                } else {
                     console.warn("Missing id/title data attribute on history item for deletion", itemElement.dataset);
                     showToast("无法删除，数据不完整", "error");
                }
            }
        });
    }

    // --- Add any other specific UI element initializations or event listeners needed ---
    // Example: If you have a theme toggle
    // const themeToggle = document.getElementById('themeToggle');
    // if (themeToggle) {
    //     themeToggle.addEventListener('change', handleThemeChange);
    //     initializeTheme(); // Function to load and apply saved theme
    // }

});

// ===================== Global Exports / Window Attachments =====================
// Ensure functions needed by inline event handlers (onclick="") or other scripts are accessible.
// Using `export` is preferred for module-based projects.
// Using `window.` provides global access but pollutes the global scope.

// Functions already exported: showToast, showLoading, hideLoading, updateSiteStatus, renderAPICheckboxes, renderSearchHistory, loadViewingHistory, playFromHistory, formatTimestamp, formatPlaybackTime
// Functions potentially needed globally (or ensure they are called via module imports/event listeners):
window.closeModal = closeModal; // If called by inline onclick="closeModal()"
window.toggleSettings = toggleSettings; // If settings button uses onclick
window.toggleHistory = toggleHistory; // If history button uses onclick
window.clearViewingHistory = clearViewingHistory; // If clear button uses onclick

// Functions likely internal to ui.js and don't need global exposure if setup correctly:
// _getApiArr, updateSelectedApiCount, addToggleListener, initializeFilterToggles, setupPanelToggleButtons, setPanelVisibility, updateToggleVisuals

// Final check: Review your HTML (index.html, player.html) for any `onclick="..."` attributes.
// If they call functions defined here (like toggleSettings, toggleHistory, clearViewingHistory),
// they MUST be attached to the `window` object as shown above, OR you should refactor
// the HTML to remove the inline handlers and add listeners purely via JavaScript
// within the `DOMContentLoaded` or `setupPanelToggleButtons` functions. The latter (pure JS listeners) is generally preferred.


// End of /js/ui.js

