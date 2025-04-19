// js/ui.js - UI helper functions for toasts, modals, loading indicators, history management.

"use strict";

// --- Toast Notifications ---

const toastQueue = [];
let isShowingToast = false;

/**
 * Adds a toast message to the queue and displays it if possible.
 * @param {string} message - The message to display.
 * @param {'error' | 'success' | 'info' | 'warning'} [type='info'] - Toast type.
 */
function showToast(message, type = 'info') {
    toastQueue.push({ message, type });
    if (!isShowingToast) {
        _displayNextToast();
    }
}

/**
 * Displays the next toast message from the queue. (Internal use)
 */
function _displayNextToast() {
    if (toastQueue.length === 0) {
        isShowingToast = false;
        return;
    }

    isShowingToast = true;
    const { message, type } = toastQueue.shift();

    const toastElement = document.getElementById('toast');
    const toastMessageElement = document.getElementById('toastMessage');

    if (!toastElement || !toastMessageElement) {
        console.error("Toast UI elements not found.");
        isShowingToast = false; // Reset flag if UI missing
        // Attempt to show remaining toasts after a delay, in case UI loads later
        setTimeout(_displayNextToast, 500);
        return;
    }

    // Map type to background color class (Tailwind classes assumed)
    const bgColors = {
        error: 'bg-red-500',
        success: 'bg-green-500',
        info: 'bg-blue-500',
        warning: 'bg-yellow-500'
    };
    const bgColor = bgColors[type] || bgColors.info;

    // Reset classes and apply new ones
    toastElement.className = `fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg text-white z-[100] transform transition-all duration-300 opacity-0 -translate-y-full ${bgColor}`;
    toastMessageElement.textContent = message;

    // Animate in
    requestAnimationFrame(() => {
        toastElement.classList.remove('opacity-0', '-translate-y-full');
        toastElement.classList.add('opacity-100', 'translate-y-0');
    });

    // Set timeout to hide and process next toast
    setTimeout(() => {
        toastElement.classList.remove('opacity-100', 'translate-y-0');
        toastElement.classList.add('opacity-0', '-translate-y-full');
        // Wait for animation to finish before showing the next one
        setTimeout(_displayNextToast, 350); // Slightly longer than transition duration
    }, 3000); // Display duration: 3 seconds
}

// --- Loading Indicator ---

let loadingTimeoutId = null;
const LOADING_TIMEOUT_DURATION = 30000; // 30 seconds

/**
 * Shows the loading overlay with an optional message.
 * @param {string} [message='加载中...'] - Message to display.
 */
function showLoading(message = '加载中...') {
    const loadingElement = document.getElementById('loading');
    if (!loadingElement) {
        console.error("Loading UI element not found.");
        return;
    }

    // Update message (assuming structure with a <p> tag)
    const messageEl = loadingElement.querySelector('p');
    if (messageEl) messageEl.textContent = message;

    loadingElement.style.display = 'flex'; // Show the overlay

    // Clear any previous timeout
    if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
    }

    // Set a timeout to automatically hide loading and show a warning
    loadingTimeoutId = setTimeout(() => {
        hideLoading();
        showToast('操作超时，请稍后重试', 'warning');
    }, LOADING_TIMEOUT_DURATION);
}

/**
 * Hides the loading overlay.
 */
function hideLoading() {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
    // Clear the auto-hide timeout
    if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
    }
}

// --- Modal Dialogs ---

/**
 * Shows the main details modal.
 */
function showModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('hidden', 'hide'); // Ensure hidden class is removed
        modal.classList.add('show'); // Use class for transitions
        modal.setAttribute('aria-hidden', 'false');
        // Optional: Trap focus within the modal for accessibility
    } else {
        console.error("Main modal element (#modal) not found.");
    }
}

/**
 * Hides the main details modal.
 */
function closeModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modalContent');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.add('hide'); // Use class for transitions
        modal.setAttribute('aria-hidden', 'true');
        // Clear content after animation (optional)
         setTimeout(() => {
             if (modalContent) modalContent.innerHTML = ''; // Clear content
             modal.classList.add('hidden'); // Add hidden after transition
             modal.classList.remove('hide');
         }, 300); // Match CSS transition duration
    }
}

// --- Search History ---

/**
 * Gets the search history from localStorage.
 * Handles potential parsing errors and ensures structure consistency.
 * @returns {Array<object>} Array of history items [{ text: string, timestamp: number }].
 */
function getSearchHistory() {
    try {
        const data = localStorage.getItem(SEARCH_HISTORY_KEY); // Use constant key
        if (!data) return [];

        const parsed = JSON.parse(data);

        // Validate and normalize data
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map(item => {
                // Convert old string format to new object format
                if (typeof item === 'string') {
                    return { text: item, timestamp: 0 }; // Assign 0 timestamp for old items
                }
                // Ensure item is an object with text and timestamp
                if (typeof item === 'object' && item !== null && typeof item.text === 'string' && typeof item.timestamp === 'number') {
                    return item;
                }
                return null; // Invalid item format
            })
            .filter(item => item !== null && item.text.trim() !== ''); // Filter out invalid/empty items
    } catch (e) {
        console.error('Error getting search history from localStorage:', e);
        localStorage.removeItem(SEARCH_HISTORY_KEY); // Clear corrupted data
        return [];
    }
}

/**
 * Saves a search query to the history in localStorage.
 * Manages history size and prevents duplicates.
 * @param {string} query - The search query to save.
 */
function saveSearchHistory(query) {
    query = query.trim();
    if (!query) return;

    // Basic sanitization and length limit
    const sanitizedQuery = query.substring(0, 50).replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let history = getSearchHistory();
    const now = Date.now();

    // Remove existing entry for the same query to move it to the top
    history = history.filter(item => item.text !== sanitizedQuery);

    // Add new entry to the beginning
    history.unshift({ text: sanitizedQuery, timestamp: now });

    // Limit history size
    if (history.length > MAX_SEARCH_HISTORY_ITEMS) { // Use constant limit
        history = history.slice(0, MAX_SEARCH_HISTORY_ITEMS);
    }

    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history)); // Use constant key
    } catch (e) {
        console.error('Failed to save search history to localStorage:', e);
        // Attempt recovery: remove oldest item and try again? Or just show error.
        showToast('保存搜索历史失败', 'error');
    }

    // Re-render the history display
    renderSearchHistory();
}

/**
 * Renders the search history tags below the search bar.
 */
function renderSearchHistory() {
    const historyContainer = document.getElementById('recentSearches');
    if (!historyContainer) return;

    const history = getSearchHistory();
    historyContainer.innerHTML = ''; // Clear previous tags

    if (history.length === 0) {
        historyContainer.style.display = 'none'; // Hide container if no history
        return;
    }

     historyContainer.style.display = 'flex'; // Ensure container is visible

    // Add Title and Clear Button Row
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex justify-between items-center w-full mb-2 text-xs'; // Full width, margin bottom
    headerDiv.innerHTML = `
        <span class="text-gray-500">最近搜索:</span>
        <button onclick="clearSearchHistory()" class="text-gray-500 hover:text-white transition-colors p-1" title="清除搜索历史">
             清除
         </button>
    `;
    historyContainer.appendChild(headerDiv);


    // Add history tags
    const fragment = document.createDocumentFragment();
    history.forEach(item => {
        const tag = document.createElement('button');
        tag.className = 'search-tag'; // Use class from styles.css
        tag.textContent = item.text;
        tag.title = `搜索: ${item.text}${item.timestamp ? ` (于 ${formatTimestamp(item.timestamp)})` : ''}`;
        tag.type = 'button'; // Ensure it's treated as a button

        tag.onclick = () => {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = item.text;
                // Trigger search (assuming app.js provides global search function)
                if (typeof search === 'function') {
                    search();
                } else {
                    console.warn("Global search() function not found.");
                }
            }
        };
        fragment.appendChild(tag);
    });
    historyContainer.appendChild(fragment);
}

/**
 * Clears the search history from localStorage and updates the UI.
 */
function clearSearchHistory() {
    // Optional: Add confirmation dialog
    // if (!confirm("确定要清除所有搜索历史吗？")) {
    //     return;
    // }

    try {
        localStorage.removeItem(SEARCH_HISTORY_KEY); // Use constant key
        renderSearchHistory(); // Update UI to show empty history
        showToast('搜索历史已清除', 'success');
    } catch (e) {
        console.error('清除搜索历史失败:', e);
        showToast('清除搜索历史失败', 'error');
    }
}

// --- Viewing History ---

/**
 * Gets viewing history from localStorage.
 * @returns {Array<object>} Array of viewing history items.
 */
function getViewingHistory() {
    try {
        const data = localStorage.getItem(VIEWING_HISTORY_KEY); // Use constant key
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('获取观看历史失败:', e);
        localStorage.removeItem(VIEWING_HISTORY_KEY); // Clear corrupted data
        return [];
    }
}

/**
 * Adds or updates an item in the viewing history.
 * Ensures only one entry per video title, updating existing entry.
 * @param {object} videoInfo - Information about the video being watched.
 *                             Expected: { title, url, episodeIndex, sourceName, timestamp, playbackPosition?, duration?, episodes? }
 */
function addToViewingHistory(videoInfo) {
    // Basic validation of input
    if (!videoInfo || !videoInfo.title) {
        console.warn("Attempted to add invalid video info to history:", videoInfo);
        return;
    }

    try {
        let history = getViewingHistory();
        const now = Date.now();

        // Find existing entry by title (simple approach)
        const existingIndex = history.findIndex(item => item.title === videoInfo.title);

        let newItem;
        if (existingIndex !== -1) {
            // Update existing item
            newItem = { ...history[existingIndex], ...videoInfo, timestamp: now }; // Merge new info, update timestamp
            // Ensure episodes array is updated correctly if provided
            if (videoInfo.episodes && Array.isArray(videoInfo.episodes)) {
                newItem.episodes = [...videoInfo.episodes]; // Use deep copy
            }
            history.splice(existingIndex, 1); // Remove old position
        } else {
            // Create new item
            newItem = { ...videoInfo, timestamp: now };
             // Ensure episodes array exists, use deep copy if provided
             newItem.episodes = (videoInfo.episodes && Array.isArray(videoInfo.episodes)) ? [...videoInfo.episodes] : [];
        }

        // Add updated/new item to the beginning
        history.unshift(newItem);

        // Limit history size
        if (history.length > MAX_VIEWING_HISTORY_ITEMS) { // Use constant limit
            history = history.slice(0, MAX_VIEWING_HISTORY_ITEMS);
        }

        // Save updated history
        localStorage.setItem(VIEWING_HISTORY_KEY, JSON.stringify(history)); // Use constant key

    } catch (e) {
        console.error('保存观看历史失败:', e);
        showToast('保存观看历史失败', 'error');
    }
}


/**
 * Loads and renders the viewing history in the history panel.
 */
function loadViewingHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    const history = getViewingHistory();

    if (history.length === 0) {
        historyList.innerHTML = `<div class="text-center text-gray-500 py-8">暂无观看记录</div>`;
        historyList.classList.remove('pb-4'); // Remove padding if empty
        return;
    }

    // Use DocumentFragment for performance
    const fragment = document.createDocumentFragment();
    history.forEach(item => {
        fragment.appendChild(createHistoryItemElement(item));
    });

    historyList.innerHTML = ''; // Clear existing list
    historyList.appendChild(fragment);

    // Adjust padding based on item count
    historyList.classList.toggle('pb-4', history.length > 5);
}

/**
 * Creates an HTML element for a single viewing history item.
 * @param {object} item - The history item data.
 * @returns {HTMLDivElement} The history item element.
 */
function createHistoryItemElement(item) {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item cursor-pointer relative group'; // Base classes

    // Sanitize data before inserting into HTML
    const safeTitle = sanitizeString(item.title || '未知标题');
    const safeSource = sanitizeString(item.sourceName || '未知来源');
    const episodeText = (typeof item.episodeIndex === 'number' && item.episodeIndex >= 0)
        ? `第 ${item.episodeIndex + 1} 集` : '';
    const safeUrl = encodeURIComponent(item.url || ''); // Encode URL for attribute/JS use
    const playbackPosition = item.playbackPosition || 0;

    // Format progress bar HTML (only if significant progress)
    let progressHtml = '';
    if (playbackPosition > 10 && item.duration && playbackPosition < item.duration * 0.98) { // Show progress unless near end
        const percent = Math.min(100, Math.round((playbackPosition / item.duration) * 100));
        const formattedTime = formatPlaybackTime(playbackPosition);
        const formattedDuration = formatPlaybackTime(item.duration);
        progressHtml = `
            <div class="history-progress" title="观看至 ${formattedTime} / ${formattedDuration}">
                <div class="progress-bar">
                    <div class="progress-filled" style="width:${percent}%"></div>
                </div>
                <div class="progress-text">${formattedTime} / ${formattedDuration} (${percent}%)</div>
            </div>
        `;
    }

    // Construct inner HTML safely
    historyItem.innerHTML = `
        <button onclick="deleteHistoryItem('${safeUrl}', event)"
                class="delete-btn absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-red-400 p-1 rounded-full hover:bg-gray-800 z-10"
                title="删除记录" type="button">
            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>
        <div class="history-info">
            <div class="history-title" title="${safeTitle}">${safeTitle}</div>
            <div class="history-meta">
                ${episodeText ? `<span class="history-episode">${episodeText}</span><span class="history-separator mx-1">·</span>` : ''}
                <span class="history-source" title="来源: ${safeSource}">${safeSource}</span>
            </div>
            ${progressHtml}
            <div class="history-time" title="观看时间: ${new Date(item.timestamp).toLocaleString()}">${formatTimestamp(item.timestamp)}</div>
        </div>
    `;

    // Add click listener to the main item for playback
    historyItem.addEventListener('click', () => {
        // Pass necessary info, including playback position
        playFromHistory(item.url, safeTitle, item.episodeIndex, playbackPosition);
    });

    return historyItem;
}


/**
 * Deletes a specific item from the viewing history.
 * @param {string} encodedUrl - The encoded URL identifying the item to delete.
 * @param {Event} event - The click event object.
 */
function deleteHistoryItem(encodedUrl, event) {
    event.stopPropagation(); // Prevent triggering playback when clicking delete

    try {
        const urlToDelete = decodeURIComponent(encodedUrl);
        let history = getViewingHistory();
        const initialLength = history.length;

        // Filter out the item(s) matching the URL
        // Use URL as primary key, might need refinement if URLs are not unique per video/episode combo
        const newHistory = history.filter(item => item.url !== urlToDelete);

        if (newHistory.length < initialLength) {
            localStorage.setItem(VIEWING_HISTORY_KEY, JSON.stringify(newHistory)); // Use constant key
            loadViewingHistory(); // Refresh the list
            showToast('已删除该记录', 'success');
        } else {
            console.warn("History item not found for deletion:", urlToDelete);
            showToast('未能删除记录', 'warning');
        }
    } catch (e) {
        console.error('删除历史记录项失败:', e);
        showToast('删除记录失败', 'error');
    }
}

/**
 * Opens the player page based on history item data.
 * @param {string} url - The playable URL of the episode.
 * @param {string} title - The video title.
 * @param {number} episodeIndex - The episode index.
 * @param {number} [playbackPosition=0] - The position to resume from.
 */
function playFromHistory(url, title, episodeIndex, playbackPosition = 0) {
    if (!url || !title) {
        showToast("无法播放：历史记录信息不完整", "error");
        return;
    }

    try {
        // Fetch the full history item to get the 'episodes' array
        let episodesList = [];
        const history = getViewingHistory();
        const historyItem = history.find(item => item.title === title && item.url === url); // Find by title AND url

        if (historyItem && Array.isArray(historyItem.episodes)) {
            episodesList = historyItem.episodes;
            console.log(`Restoring episodes (${episodesList.length}) for "${title}" from history.`);
        } else {
            console.warn(`Could not find full episodes list for "${title}" in history. Player navigation might be limited.`);
        }

        // Save context to localStorage (redundant if addToViewingHistory called on play, but safe)
        localStorage.setItem('currentVideoTitle', title);
        localStorage.setItem('currentEpisodeIndex', episodeIndex);
        localStorage.setItem('currentEpisodes', JSON.stringify(episodesList));
        localStorage.setItem(EPISODE_REVERSE_KEY, localStorage.getItem(EPISODE_REVERSE_KEY) || 'false'); // Preserve setting

        // Construct player URL with parameters
        const playerUrl = new URL('player.html', window.location.origin);
        playerUrl.searchParams.set('url', url);
        playerUrl.searchParams.set('title', title);
        playerUrl.searchParams.set('index', episodeIndex);
        // Add source if available in historyItem
         if (historyItem && historyItem.sourceName) {
            playerUrl.searchParams.set('source', historyItem.sourceName);
        }
        if (playbackPosition > 10) { // Only add position if significant
            playerUrl.searchParams.set('position', Math.floor(playbackPosition));
        }
        // No need to pass full episodes list via URL parameter anymore, rely on localStorage

        window.open(playerUrl.toString(), '_blank', 'noopener,noreferrer');

    } catch (e) {
        console.error('从历史记录播放失败:', e);
        showToast('无法打开播放器', 'error');
        // Fallback: Open simple URL if complex construction fails
        const simpleUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=${episodeIndex}`;
        window.open(simpleUrl, '_blank', 'noopener,noreferrer');
    }
}


/**
 * Clears the viewing history from localStorage and updates the UI.
 */
function clearViewingHistory() {
    // Optional: Add confirmation dialog
    if (!confirm("确定要清空所有观看历史吗？")) {
        return;
    }

    try {
        localStorage.removeItem(VIEWING_HISTORY_KEY); // Use constant key
        loadViewingHistory(); // Refresh the list display
        showToast('观看历史已清空', 'success');
    } catch (e) {
        console.error('清除观看历史失败:', e);
        showToast('清除观看历史失败', 'error');
    }
}


// --- Panel Toggles ---

/**
 * Toggles the visibility of the settings panel.
 * Closes the history panel if it's open.
 * @param {Event} [e] - Optional event object (to stop propagation).
 */
function toggleSettings(e) {
    e?.stopPropagation(); // Prevent closing immediately if triggered by button inside panel

    // Password check
    if (typeof window.isPasswordProtected === 'function' && window.isPasswordProtected() &&
        typeof window.isPasswordVerified === 'function' && !window.isPasswordVerified()) {
        if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
        return;
    }

    const settingsPanel = document.getElementById('settingsPanel');
    const historyPanel = document.getElementById('historyPanel');

    settingsPanel?.classList.toggle('show');
    settingsPanel?.setAttribute('aria-hidden', settingsPanel?.classList.contains('show') ? 'false' : 'true');


    // Close history panel if open
    if (historyPanel?.classList.contains('show')) {
        historyPanel.classList.remove('show');
        historyPanel?.setAttribute('aria-hidden', 'true');
    }
}

/**
 * Toggles the visibility of the history panel.
 * Loads history data when opened.
 * Closes the settings panel if it's open.
 * @param {Event} [e] - Optional event object (to stop propagation).
 */
function toggleHistory(e) {
    e?.stopPropagation();

    // Password check
    if (typeof window.isPasswordProtected === 'function' && window.isPasswordProtected() &&
        typeof window.isPasswordVerified === 'function' && !window.isPasswordVerified()) {
        if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
        return;
    }

    const historyPanel = document.getElementById('historyPanel');
    const settingsPanel = document.getElementById('settingsPanel');

    const isOpening = !historyPanel?.classList.contains('show');
    historyPanel?.classList.toggle('show');
    historyPanel?.setAttribute('aria-hidden', historyPanel?.classList.contains('show') ? 'false' : 'true');


    if (isOpening) {
        loadViewingHistory(); // Load data when opening
    }

    // Close settings panel if open
    if (settingsPanel?.classList.contains('show')) {
        settingsPanel.classList.remove('show');
        settingsPanel?.setAttribute('aria-hidden', 'true');

    }
}

// --- Utility Functions ---

/**
 * Formats a timestamp into a user-friendly relative or absolute date/time string.
 * @param {number} timestamp - The Unix timestamp in milliseconds.
 * @returns {string} Formatted date/time string.
 */
function formatTimestamp(timestamp) {
    if (!timestamp || isNaN(timestamp)) return '未知时间';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.round(diffMs / 1000);
    const diffMinutes = Math.round(diffSeconds / 60);
    const diffHours = Math.round(diffMinutes / 60);
    const diffDays = Math.round(diffHours / 24);

    if (diffSeconds < 60) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;

    // Older than a week, show date MM-DD
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    // Optionally add year if not current year
    // if (date.getFullYear() !== now.getFullYear()) {
    //     return `${date.getFullYear()}-${month}-${day}`;
    // }
    return `${month}-${day}`;
}

/**
 * Formats seconds into a mm:ss time string.
 * @param {number} seconds - Total seconds.
 * @returns {string} Formatted time string (e.g., "05:32").
 */
function formatPlaybackTime(seconds) {
    if (seconds == null || isNaN(seconds) || seconds < 0) return '00:00';

    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}


// Basic string sanitization (duplicate from app.js, consider moving to a shared util file if using modules)
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Make functions globally accessible if called directly from HTML (onclick)
// If using event delegation (recommended), this might not be necessary.
window.toggleSettings = toggleSettings;
window.toggleHistory = toggleHistory;
window.closeModal = closeModal;
window.clearSearchHistory = clearSearchHistory;
window.clearViewingHistory = clearViewingHistory;
window.deleteHistoryItem = deleteHistoryItem;
window.playFromHistory = playFromHistory;
// Other functions like showToast, showLoading, hideLoading are likely called from app.js


console.log("UI helpers loaded.");
