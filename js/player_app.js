import { VidstackPlayer, VidstackPlayerLayout } from 'https://cdn.vidstack.io/player';

// Add this helper function at the top of js/player_app.js
if (typeof showToast !== 'function' || typeof showMessage !== 'function') {
    console.warn("UI notification functions (showToast/showMessage) are not available. Notifications might not work.");
}

function SQuery(selector, callback, timeout = 5000, interval = 100) {
    let elapsedTime = 0;
    const check = () => {
        const element = document.querySelector(selector); // Using querySelector
        if (element) {
            callback(element);
        } else {
            elapsedTime += interval;
            if (elapsedTime < timeout) {
                setTimeout(check, interval);
            } else {
                console.error(`[SQuery] Element '${selector}' NOT FOUND by SQuery after ${timeout}ms.`);
            }
        }
    };
    check();
}

// 检查 localStorage 可用性，iOS/私密模式等特殊环境下友好提示
function testLocalStorageAvailable() {
    try {
        localStorage.setItem('__ls_test__', '1');
        localStorage.removeItem('__ls_test__');
        return true;
    } catch (e) {
        return false;
    }
}

// 递归禁止contextmenu，防止安卓右半边长按出现系统菜单
function disableContextMenuDeep(element) {
    if (!element) return;
    element.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false });
    for (const child of element.children || []) {
        disableContextMenuDeep(child);
    }
}

// 自动加属性防止安卓video系统菜单
function patchAndroidVideoHack() {
    if (!/Android/i.test(navigator.userAgent)) return;
    setTimeout(function () {
        // Target Vidstack's media outlet, which contains the actual video tag
        const videoElementContainer = document.querySelector('#dp-player media-outlet');
        if (!videoElementContainer) {
            console.warn('[patchAndroidVideoHack] Vidstack media-outlet not found.');
            return;
        }

        const nativeVideoElement = videoElementContainer.querySelector('video');
        if (!nativeVideoElement) {
            console.warn('[patchAndroidVideoHack] Native video element not found inside media-outlet.');
            return;
        }

        // Apply contextmenu prevention to the native video element and its container
        disableContextMenuDeep(nativeVideoElement);
        disableContextMenuDeep(videoElementContainer);

        // These attributes can reduce system menu on Android
        nativeVideoElement.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
        nativeVideoElement.setAttribute('webkit-playsinline', 'true');
        nativeVideoElement.setAttribute('playsinline', 'true');
    }, 800); // Ensure Vidstack structure is rendered
}

const SKIP_INTRO_KEY = 'skipIntroTime';
const SKIP_OUTRO_KEY = 'skipOutroTime';

function setupSkipControls() {
    // Initialize UI elements
    const skipButton = document.getElementById('skip-control-button');
    const dropdown = document.getElementById('skip-control-dropdown');
    const skipIntroInput = document.getElementById('skip-intro-input');
    const skipOutroInput = document.getElementById('skip-outro-input');
    const applyBtn = document.getElementById('apply-skip-settings');
    const resetBtn = document.getElementById('reset-skip-settings');

    if (!skipButton || !dropdown || !skipIntroInput || !skipOutroInput || !applyBtn || !resetBtn) {
        console.error("跳过片头片尾功能的 HTML 元素未正确加载！");
        return;
    }

    // Show / Hide menu
    skipButton.addEventListener('click', () => {
        if (dropdown.classList.contains('hidden')) {
            dropdown.classList.remove('hidden');
            dropdown.classList.add('block');
        } else {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('block');
        }
    });


    // Apply settings button
    applyBtn.addEventListener('click', () => {
        const introTime = parseInt(skipIntroInput.value) || 0;
        const outroTime = parseInt(skipOutroInput.value) || 0;

        localStorage.setItem(SKIP_INTRO_KEY, introTime);
        localStorage.setItem(SKIP_OUTRO_KEY, outroTime);

        if (typeof showToast === 'function') {
            showToast('跳过时间设置已保存', 'success');
        }
        dropdown.classList.remove('active'); // Collapse settings box
    });

    // Reset time
    resetBtn.addEventListener('click', () => {
        localStorage.removeItem(SKIP_INTRO_KEY);
        localStorage.removeItem(SKIP_OUTRO_KEY);
        skipIntroInput.value = '';
        skipOutroInput.value = '';

        if (typeof showToast === 'function') {
            showToast('跳过时间设置已重置', 'success');
        }
    });

    // Load initial values from localStorage
    const savedIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    const savedOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;

    skipIntroInput.value = savedIntroTime;
    skipOutroInput.value = savedOutroTime;
}

function setupSkipDropdownEvents() {
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('skip-control-dropdown');
        const skipButton = document.getElementById('skip-control-button');
        if (!skipButton || !dropdown) return;

        if (skipButton.contains(event.target)) {
            // Already handled by setupSkipControls separately
        } else if (!dropdown.contains(event.target)) {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('block');
        }
    });

}

// Auto skip intro and outro
function handleSkipIntroOutro(playerInstance) {
    if (!playerInstance || !playerInstance.media || !playerInstance.media.activeElement) return;
    const video = playerInstance.media.activeElement;

    // Skip intro
    const skipIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    // Unbind old listener
    if (video._skipIntroHandler) {
        video.removeEventListener('loadedmetadata', video._skipIntroHandler);
    }
    if (skipIntroTime > 0) {
        video._skipIntroHandler = function () {
            if (video.duration > skipIntroTime && video.currentTime < skipIntroTime) {
                video.currentTime = skipIntroTime;
                if (typeof showToast === 'function') showToast(`已跳过${skipIntroTime}秒片头`, 'info');
            }
        };
        video.addEventListener('loadedmetadata', video._skipIntroHandler);
    } else {
        video._skipIntroHandler = null;
    }

    // Skip outro
    const skipOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
    if (video._skipOutroHandler) {
        video.removeEventListener('timeupdate', video._skipOutroHandler);
    }
    if (skipOutroTime > 0) {
        video._skipOutroHandler = function () {
            if (!video) return;
            const remain = video.duration - video.currentTime;
            if (remain <= skipOutroTime && !video.paused) {
                if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
                    playNextEpisode();
                } else {
                    video.pause();
                    if (typeof showToast === 'function') showToast(`已跳过${skipOutroTime}秒片尾`, 'info');
                }
            }
        };
        video.addEventListener('timeupdate', video._skipOutroHandler);
    } else {
        video._skipOutroHandler = null;
    }
}


// Initialize skip function
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI controls
    setupSkipControls();

    // New Dropdown menu show/hide event handling
    setupSkipDropdownEvents();

    // Initialize other page functions
    initializePageContent();
});


/**
 * Display custom "Remember Progress Restore" popup, and Promise-ify callbacks
 * @param {Object} opts Configuration object: title, content, confirmText, cancelText
 * @returns {Promise<boolean>} User clicked confirm: true / cancel: false
 */
function showProgressRestoreModal(opts) {
    return new Promise(resolve => {
        const modal = document.getElementById("progress-restore-modal");
        const contentDiv = modal?.querySelector('.progress-modal-content');
        const titleDiv = modal?.querySelector('.progress-modal-title');
        const btnCancel = modal?.querySelector('#progress-restore-cancel');
        const btnConfirm = modal?.querySelector('#progress-restore-confirm');
        if (!modal || !contentDiv || !titleDiv || !btnCancel || !btnConfirm) return resolve(false);

        titleDiv.textContent = opts.title || "继续播放？";
        contentDiv.innerHTML = opts.content || "";
        btnCancel.textContent = opts.cancelText || "取消";
        btnConfirm.textContent = opts.confirmText || "确定";

        function close(result) {
            modal.classList.remove("active");
            document.body.style.overflow = "";
            // Unbind events to prevent memory leaks
            btnCancel.onclick = btnConfirm.onclick = null;
            document.removeEventListener("keydown", handler);
            setTimeout(() => resolve(result), 180);
        }

        btnCancel.onclick = () => close(false);
        btnConfirm.onclick = () => close(true);

        function handler(e) {
            if (e.key === "Escape") close(false);
            if (e.key === "Enter") close(true);
        }
        setTimeout(() => btnConfirm.focus(), 120); // Auto focus confirm
        document.addEventListener("keydown", handler);

        modal.classList.add("active");
        document.body.style.overflow = "hidden"; // Prevent page scrolling when popup is open
    });
}

// --- Module-level variables ---
let isNavigatingToEpisode = false; // Set to true when switching episodes to prevent accidental saving
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let dp = null; // Vidstack Player instance (kept `dp` name for compatibility)
let autoplayEnabled = true;
let isUserSeeking = false;
let videoHasEnded = false;
let userClickedPosition = null;
let shortcutHintTimeout = null;
let progressSaveInterval = null;
let isScreenLocked = false;
let nextSeekPosition = 0; // Stores the position to seek to for the next episode
let vodIdForPlayer = ''; // Global variable to store VOD ID from URL

// ✨ New implementation: Uniformly generate 'episode-level' or 'full-show-level' identifiers
function getShowIdentifier(perEpisode = true) {
    const sc = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';
    const vid = vodIdForPlayer || ''; // VOD ID passed from external
    const ep = perEpisode ? `_ep${currentEpisodeIndex}` : '';

    // 1) If VOD ID exists, use it
    if (vid) return `${currentVideoTitle}_${sc}_${vid}${ep}`;

    // 2) No VOD ID? Fingerprint the link
    const raw = currentEpisodes[currentEpisodeIndex] || '';
    const urlKey = raw.split('/').pop().split(/[?#]/)[0] // Get filename
        || (raw.length > 32 ? raw.slice(-32) : raw); // Fallback for strange links
    return `${currentVideoTitle}_${sc}_${urlKey}${ep}`;
}

const DOUBLE_TAP_INTERVAL = 300; // Max time interval for double tap (ms)

const REMEMBER_EPISODE_PROGRESS_ENABLED_KEY = 'playerRememberEpisodeProgressEnabled'; // Key for toggle state
const VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY = 'videoSpecificEpisodeProgresses'; // Key for progress of each video and episode

// ==== Ad Segment Markers ====
const AD_START_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="ad"/i,
    /#EXT-X-SCTE35-OUT/i,
    /#EXTINF:[\d.]+,\s*ad/i,
];
const AD_END_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="content"/i,
    /#EXT-X-SCTE35-IN/i,
    /#EXT-X-DISCONTINUITY/i, // Fallback: some sources use DISCONTINUITY to end ads
];

// Ad filtering enabled flag (default true, can be overridden by config.js)
let adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true;

function isMobile() {
    return /Mobile|Tablet|iPod|iPhone|iPad|Android|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}

// Helper function: format time
function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Expose variables to `window` for `player_preload.js`
window.currentEpisodes = [];
window.currentEpisodeIndex = 0;
// window.PLAYER_CONFIG is set by config.js
// window.dp will be set after Vidstack initialization
// window.playEpisode will be set later

/**
 * When "remember progress" is off, clear all episode progress for the current video from localStorage
 */
function clearCurrentVideoAllEpisodeProgresses() {
    try {
        const all = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || "{}");
        const showId = getShowIdentifier(false);

        // If progress record for this video exists, delete it
        if (all[showId]) {
            delete all[showId];
            localStorage.setItem(
                VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY,
                JSON.stringify(all)
            );

            // Give user a success message
            const msg = `已清除《${currentVideoTitle}》的所有集数播放进度`;
            if (typeof showMessage === "function") showMessage(msg, "success");
            else if (typeof showToast === "function") showToast(msg, "success");
        }
    } catch (e) {
        console.error("清除特定视频集数进度失败:", e);
    }
}

function setupRememberEpisodeProgressToggle() {
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle) return;

    // 1. Initialize toggle state from localStorage
    const savedSetting = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY);
    if (savedSetting !== null) {
        toggle.checked = savedSetting === 'true';
    } else {
        toggle.checked = true; // Default to enabled
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, 'true');
    }

    // 2. Listen for toggle changes and save to localStorage
    toggle.addEventListener('change', function (event) {
        const isChecked = event.target.checked;
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, isChecked.toString());
        if (typeof showToast === 'function') { // Ensure showToast is available
            const messageText = isChecked ? '将记住本视频的各集播放进度' : '将不再记住本视频的各集播放进度';
            if (typeof window.showMessage === 'function') { // Prefer `showMessage` from `player_app.js`
                window.showMessage(messageText, 'info');
            } else if (typeof window.showToast === 'function') { // Fallback to `showToast` from `ui.js`
                window.showToast(messageText, 'info');
            }
        }
        // (Optional logic) If user disables the feature, clear current video's saved progress?
        if (!isChecked) {
            clearCurrentVideoAllEpisodeProgresses(); // This function needs to be implemented
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    // Existing password check and initializePageContent call
    if (typeof window.isPasswordVerified === 'function' && typeof window.isPasswordProtected === 'function') {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
            const loadingEl = document.getElementById('loading');
            if (loadingEl) loadingEl.style.display = 'none';
            return;
        }
    } else {
        console.warn("Password functions (isPasswordProtected/isPasswordVerified) not found. Assuming no password protection.");
    }
    initializePageContent();
});

// Listen for password verification success event
document.addEventListener('passwordVerified', () => {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = 'flex';
        document.documentElement.classList.add('show-loading');
    }
    initializePageContent();
});

function initializePageContent() {
    if (!testLocalStorageAvailable()) {
        showMessage('当前浏览器本地存储不可用，播放进度记忆将失效', 'warning');
    }
    const urlParams = new URLSearchParams(window.location.search);
    let episodeUrlForPlayer = urlParams.get('url'); // Use `let` as it might be modified later
    let title = urlParams.get('title');
    vodIdForPlayer = urlParams.get('id') || '';
    // Fully decode any multi-encoded parts
    function fullyDecode(str) {
        try {
            let prev, cur = str;
            do { prev = cur; cur = decodeURIComponent(cur); } while (cur !== prev);
            return cur;
        } catch { return str; } // Give up on invalid encoding
    }
    title = title ? fullyDecode(title) : '';
    const sourceCodeFromUrl = urlParams.get('source_code'); // Renamed for clarity

    // Compatible with old links using `ep=`
    let index = parseInt(
        urlParams.get('index') || urlParams.get('ep') || '0',
        10
    );
    let indexForPlayer = index; // `indexForPlayer` will hold the user's initial intended episode

    // Prioritize URL parameter `episodes=` then fallback to localStorage (double check)
    const episodesListParam = urlParams.get('episodes');

    const reversedFromUrl = urlParams.get('reversed');

    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    window.currentVideoTitle = currentVideoTitle;

    // Initialize episodes from localStorage or URL parameter
    try {
        let episodesSource = localStorage.getItem('currentEpisodes');
        if (episodesListParam) {
            try {
                currentEpisodes = JSON.parse(decodeURIComponent(episodesListParam));
            } catch (e) {
                console.warn("[PlayerApp] Failed to parse episodes from URL, falling back to localStorage.", e);
                currentEpisodes = episodesSource ? JSON.parse(episodesSource) : [];
            }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
        } else {
            currentEpisodes = [];
        }
        window.currentEpisodes = currentEpisodes; // Expose globally

        // Validate index
        if (currentEpisodes.length > 0 && (index < 0 || index >= currentEpisodes.length)) {
            console.warn(`[PlayerApp] Invalid episode index ${index} for ${currentEpisodes.length} episodes. Resetting to 0.`);
            index = 0;
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index.toString());
            window.history.replaceState({}, '', newUrl.toString());
        }
        // `currentEpisodeIndex`'s final value will be determined after progress restore logic
        indexForPlayer = index; // `indexForPlayer` will hold the user's initially intended episode
        window.currentEpisodeIndex = currentEpisodeIndex; // Expose globally

        if (reversedFromUrl !== null) {
            episodesReversed = reversedFromUrl === 'true';
            localStorage.setItem('episodesReversed', episodesReversed.toString());
        } else {
            episodesReversed = localStorage.getItem('episodesReversed') === 'true';
        }
    } catch (e) {
        console.error('[PlayerApp] Error initializing episode data:', e);
        currentEpisodes = []; window.currentEpisodes = [];
        indexForPlayer = 0; // If error, default to first episode
        episodesReversed = false;
    }

    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';

    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';
    const autoplayToggle =
        document.getElementById('autoplay-next') ||
        document.getElementById('autoplayToggle');
    if (autoplayToggle) {
        autoplayToggle.checked = autoplayEnabled;
        autoplayToggle.addEventListener('change', function (e) {
            autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled.toString());
        });
    }

    // --- New: Remember progress toggle initialization and progress restore logic ---
    setupRememberEpisodeProgressToggle(); // Initialize toggle state and event listener

    const positionFromUrl = urlParams.get('position');
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;

    if (positionFromUrl) {
        // ★1. If `position` parameter exists (i.e., jumped from history), force use URL and index
        episodeUrlForPlayer = urlParams.get('url');
        indexForPlayer = parseInt(urlParams.get('index') || '0', 10);
        // ---------- Popup breakpoint logic (your original popup code inserted here, no need to re-cut/branch) ----------
    } else if (shouldRestoreSpecificProgress && currentEpisodes.length > 0) {
        const showId = getShowIdentifier(false); // <--- Use new function to get show ID
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressDataForShow = allSpecificProgresses[showId]; // <--- Get progress object for this show

        if (savedProgressDataForShow) {
            const resumeIndex = indexForPlayer;
            const positionToResume =
                savedProgressDataForShow[resumeIndex.toString()] // <--- Get progress for specific episode from show object
                    ? parseInt(savedProgressDataForShow[resumeIndex.toString()])
                    : 0;

            if ((!urlParams.has('index') || urlParams.get('index') === null) &&
                typeof savedProgressDataForShow.lastPlayedEpisodeIndex === 'number' && // <--- Get from show object
                savedProgressDataForShow.lastPlayedEpisodeIndex >= 0 &&
                savedProgressDataForShow.lastPlayedEpisodeIndex < currentEpisodes.length) {
                indexForPlayer = savedProgressDataForShow.lastPlayedEpisodeIndex; // <--- Get from show object
            }

            if (positionToResume > 5 && currentEpisodes[resumeIndex]) {
                showProgressRestoreModal({
                    title: "继续播放？",
                    content: `发现《${currentVideoTitle}》第 ${resumeIndex + 1} 集的播放记录，<br>是否从 <span style="color:#00ccff">${formatPlayerTime(positionToResume)}</span> 继续播放？`,
                    confirmText: "继续播放",
                    cancelText: "从头播放"
                }).then(wantsToResume => {
                    if (wantsToResume) {
                        episodeUrlForPlayer = currentEpisodes[resumeIndex];
                        indexForPlayer = resumeIndex;

                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('url', episodeUrlForPlayer);
                        newUrl.searchParams.set('index', indexForPlayer.toString());
                        newUrl.searchParams.set('position', positionToResume.toString());
                        newUrl.searchParams.set('id', vodIdForPlayer); // <--- Ensure ID is also present

                        window.history.replaceState({}, '', newUrl.toString());

                        if (typeof window.showMessage === 'function') {
                            window.showMessage(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                        } else if (typeof window.showToast === 'function') {
                            window.showToast(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                        }
                    } else {
                        // User chose to play from start, clear specific progress for this episode
                        try {
                            const show_Id_for_clear = getShowIdentifier(false); // Get current show ID
                            const all_prog = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                            if (all_prog[show_Id_for_clear] && all_prog[show_Id_for_clear][indexForPlayer.toString()]) {
                                delete all_prog[show_Id_for_clear][indexForPlayer.toString()];
                                // (Optional) Check if all episode progresses are cleared, if so, also delete lastPlayedEpisodeIndex
                                localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(all_prog));
                            }
                        } catch (e) { console.warn('清除本集特定进度失败：', e); }
                        episodeUrlForPlayer = currentEpisodes[indexForPlayer];
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('url', episodeUrlForPlayer);
                        newUrl.searchParams.set('index', indexForPlayer.toString());
                        newUrl.searchParams.delete('position');
                        newUrl.searchParams.set('id', vodIdForPlayer);
                        window.history.replaceState({}, '', newUrl.toString());
                        if (typeof showMessage === 'function') showMessage('已从头开始播放', 'info');
                        else if (typeof showToast === 'function') showToast('已从头开始播放', 'info');
                    }
                    initializePageContent(); // Re-initialize to apply selection
                });
                return;
            } else {
                episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
            }
        } else {
            episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
        }
    } else {
        episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
    }

    // --- Final determination of episode and URL to play ---
    currentEpisodeIndex = indexForPlayer; // Finalize global current episode index
    window.currentEpisodeIndex = currentEpisodeIndex;
    if (currentEpisodes.length > 0 && (!episodeUrlForPlayer || !currentEpisodes.includes(episodeUrlForPlayer))) {
        episodeUrlForPlayer = currentEpisodes[currentEpisodeIndex]; // Ensure the playing URL is correct
        if (episodeUrlForPlayer) { // If successfully obtained from currentEpisodes, update URL parameters
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('url', episodeUrlForPlayer);
            window.history.replaceState({}, '', newUrl.toString());
        }
    }

    // --- Update page title and video title element ---
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;

    if (episodeUrlForPlayer) {
        initPlayer(episodeUrlForPlayer, sourceCodeFromUrl); // Use `sourceCodeFromUrl`
        const finalUrlParams = new URLSearchParams(window.location.search); // Get potentially updated URL parameters
        const finalPositionToSeek = finalUrlParams.get('position');

        // ★ Seek optimization: If `positionFromUrl` exists, bind `can-play` to seek, compatible with Android
        if (positionFromUrl) {
            let seeked = false;
            const positionNum = parseInt(positionFromUrl, 10);
            // Listen for Vidstack's 'can-play' event
            if (dp) {
                dp.on('can-play', () => {
                    if (seeked) return;
                    if (dp && dp.media && dp.media.activeElement && dp.duration > 0 && !isNaN(positionNum) && positionNum > 0 && positionNum < dp.duration - 1) {
                        try {
                            dp.currentTime = positionNum; // Use Vidstack's currentTime
                        } catch (e) {
                            console.error("[PlayerApp][can-play] Error setting currentTime on can-play:", e);
                        }
                        if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(positionNum);
                    }
                    seeked = true;
                });
            } else {
                console.warn("[PlayerApp] DPlayer (Vidstack) instance not available to set 'can-play' listener for seek.");
            }
        }
    } else {
        showError('无效的视频链接');
    }

    updateEpisodeInfo();
    // Use requestAnimationFrame for initial render to ensure DOM is ready
    requestAnimationFrame(() => {
        renderEpisodes();
    });
    updateButtonStates();
    updateOrderButton();

    setTimeout(() => {
        // setupProgressBarPreciseClicks is now effectively disabled due to Vidstack's native behavior
        // If you need custom precise clicks, this needs to be re-evaluated for Vidstack's DOM structure.
    }, 1000); // Delay progress bar setup slightly

    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', function () {
        saveCurrentProgress();
        saveVideoSpecificProgress();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
            saveVideoSpecificProgress(); // Added: also save specific progress when hidden
        }
    });

    // Ensure critical functions from ui.js are globally available
    let checkUICounter = 0; // Declared with let
    const checkUIInterval = setInterval(() => {
        if (typeof window.addToViewingHistory === 'function' || checkUICounter > 20) { // Check for 2s
            clearInterval(checkUIInterval);
            if (typeof window.addToViewingHistory !== 'function') {
                console.error("UI functions like addToViewingHistory did not become available.");
            }
        }
        checkUICounter++; // Increment counter
    }, 100);

    // Bind custom control buttons after a slight delay
    setTimeout(setupPlayerControls, 100);
}

// --- Ad Filtering Loader (Using Legacy Logic) ---
// Simplified ad stripping function for Vidstack.
// This function will be called on the manifest text before Vidstack's HLSProvider receives it.
function stripAdsFromM3U8(content) {
    const lines = content.split('\n');
    let inAd = false;
    const out = [];

    for (const l of lines) {
        if (!inAd && AD_START_PATTERNS.some(re => re.test(l))) { inAd = true; continue; }
        if (inAd && AD_END_PATTERNS.some(re => re.test(l))) { inAd = false; continue; }
        if (!inAd && !/^#EXT-X-DISCONTINUITY/.test(l)) out.push(l); // Keep DISCONTINUITY lines if not in ad segment
    }
    return out.join('\n');
}

// --- Player Initialization ---
async function initPlayer(videoUrl, sourceCode) {
    const playerTargetElement = document.getElementById('player');

    if (!videoUrl) {
        showError("视频链接无效");
        return;
    }
    // Ensure VidstackPlayer is loaded
    if (typeof VidstackPlayer === 'undefined') {
        showError("播放器组件加载失败，请刷新");
        return;
    }

    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true;

    try {
        // Check if the target element for the player exists.
        if (!playerTargetElement) {
            console.error('Player container element #player not found.');
            showError('播放器容器元素未找到');
            return;
        }

        // Ensure the container is empty before creating a new player.
        playerTargetElement.innerHTML = '';

        dp = await VidstackPlayer.create({
            target: playerTargetElement,
            title: currentVideoTitle,
            src: videoUrl,
            autoplay: true,
            preload: 'auto',
            muted: false,
            volume: 0.7,
            keyShortcuts: false,
            layout: new VidstackPlayerLayout({
                gestures: { dblClick: false }
            })
        });

        // Listen for provider changes to hook into the HLS.js instance for ad stripping
        dp.addEventListener('provider-change', (event) => {
            const provider = event.detail; // This is the new provider instance
            if (provider && provider.type === 'hls' && typeof provider.onInstance === 'function') {
                provider.onInstance((hlsInstance) => {
                    if (hlsInstance) {
                        console.log("[Vidstack/HLS] HLS.js instance obtained via provider.onInstance. Applying ad filtering patch.");
                        // Override the fragment loader directly on the HLS.js instance.
                        hlsInstance.config.loader = class CustomLoader extends hlsInstance.constructor.DefaultConfig.loader {
                            load(ctx, cfg, cbs) {
                                if ((ctx.type === 'manifest' || ctx.type === 'level') && adFilteringEnabled) {
                                    const origOnSuccess = cbs.onSuccess;
                                    cbs.onSuccess = (response, stats, ctx2) => {
                                        // Strip ads *before* passing to original success callback
                                        if (typeof response.data === 'string') { // Ensure data is string
                                            response.data = stripAdsFromM3U8(response.data);
                                        }
                                        origOnSuccess(response, stats, ctx2);
                                    };
                                }
                                super.load(ctx, cfg, cbs);
                            }
                        };
                    }
                });
            }
        });

        // Set dp to global scope
        window.dp = dp;
        if (debugMode) console.log("[PlayerApp] Vidstack Player instance created.");

        // Add Vidstack event listeners
        addVidstackEventListeners();

        // Android specific hack
        patchAndroidVideoHack();

        // Add skip function
        handleSkipIntroOutro(dp);

        // Override mobile play button behavior to prevent auto-fullscreen
        overrideMobilePlayButtonBehavior();

    } catch (playerError) {
        console.error("Failed to initialize Vidstack Player:", playerError);
        showError("播放器初始化失败");
    }
}

function addVidstackEventListeners() {
    if (!dp) return;
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    const playerVideoWrap = document.querySelector('#dp-player media-outlet'); // Targeting Vidstack's media outlet

    dp.addEventListener('fullscreen-change', (event) => { // The detail object has an 'active' property
        const isFullscreen = event.detail.active;
        if (debugMode) console.log(`[PlayerApp] Vidstack event: fullscreen-change, isFullscreen: ${isFullscreen}`);
        if (isFullscreen) {
            if (window.screen.orientation && window.screen.orientation.lock) {
                window.screen.orientation.lock('landscape').catch(err => console.warn('屏幕方向锁定失败:', err));
            }
            const fsButton = document.getElementById('fullscreen-button');
            if (fsButton) {
                fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
                fsButton.setAttribute('aria-label', '退出全屏');
            }
        } else {
            if (window.screen.orientation && window.screen.orientation.unlock) {
                window.screen.orientation.unlock();
            }
            const fsButton = document.getElementById('fullscreen-button');
            if (fsButton) {
                fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
                fsButton.setAttribute('aria-label', '全屏');
            }
        }
    });

    dp.addEventListener('can-play', function () {
        const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
        if (debugMode) console.log(`[PlayerApp][can-play] Event triggered. dp.media.activeElement.duration: ${dp.media.activeElement.duration}`);

        // Hide loading indicator
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
            document.documentElement.classList.remove('show-loading');
        }
        videoHasEnded = false; // Reset ended flag for new video

        if (nextSeekPosition > 0 && dp && dp.media && dp.media.activeElement && dp.duration > 0) { // Use dp.duration
            if (nextSeekPosition < dp.duration - 1) { // Ensure seek position is within video duration, leaving 1s buffer
                try {
                    dp.currentTime = nextSeekPosition; // Use Vidstack's currentTime
                    if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(nextSeekPosition);
                } catch (e) {
                    console.error("[PlayerApp][can-play] Error setting currentTime:", e);
                }
            } else {
                console.warn(`[PlayerApp][can-play] nextSeekPosition (${nextSeekPosition}) is out of bounds or equal to video duration (${dp.duration}). Not seeking.`);
            }
        }
        nextSeekPosition = 0; // Reset after use

        // Save to viewing history for the newly loaded episode
        if (typeof saveToHistory === 'function') {
            saveToHistory();
        }
        // Start or reset periodic save progress timer
        if (typeof startProgressSaveInterval === 'function') {
            startProgressSaveInterval();
        }

        isNavigatingToEpisode = false; // Reset "is switching episode" flag
        if (debugMode) console.log("[PlayerApp][can-play] isNavigatingToEpisode reset to false.");

        // Attempt to play if paused
        setTimeout(() => {
            if (!dp || !dp.media || !dp.media.activeElement) {
                console.warn("[PlayerApp][can-play][timeout] dp or dp.media.activeElement is no longer valid. Cannot attempt to play.");
                return;
            }

            if (dp.paused) {
                const VidstackAutoplayOption = dp.autoplay; // Vidstack has its own autoplay prop
                const customAutoplayEnabled = typeof autoplayEnabled !== 'undefined' ? autoplayEnabled : true;

                if (VidstackAutoplayOption || customAutoplayEnabled) {
                    console.log(`[PlayerApp][can-play][timeout] Video is paused. Attempting to play(). Vidstack autoplay: ${VidstackAutoplayOption}, custom autoplayEnabled: ${customAutoplayEnabled}`);
                    try {
                        const playPromise = dp.play(); // Use Vidstack's play() method
                        if (playPromise && typeof playPromise.catch === 'function') {
                            playPromise.catch(e => {
                                console.warn("[PlayerApp][can-play][timeout] dp.play() Promise was blocked by browser or an error occurred. User might need to manually click play button.", e);
                            });
                        } else if (playPromise === undefined) {
                            console.log("[PlayerApp][can-play][timeout] dp.play() returned undefined. Play might have been attempted or prevented without a promise.");
                        }
                    } catch (syncError) {
                        console.warn("[PlayerApp][can-play][timeout] Synchronous error calling dp.play().", syncError);
                    }
                } else {
                    // console.log("[PlayerApp][can-play][timeout] Video is paused, but all autoplay options are disabled.");
                }
            } else {
                // console.log("[PlayerApp][can-play][timeout] Video is already playing or not in a checkable paused state. (Vidstack)");
            }
        }, 100);
    });

    dp.addEventListener('error', function (event) {
        console.error("Vidstack Player error event:", e);
        if (dp.media && dp.media.activeElement && dp.currentTime > 1) { // Use dp.currentTime
            if (debugMode) console.log('Vidstack error ignored as video was playing.');
            return;
        }
        showError('播放器遇到错误，请检查视频源');
    });

    setupLongPressSpeedControl();
    // New: Call double-tap handling function
    if (playerVideoWrap) {
        setupDoubleClickToPlayPause(dp, playerVideoWrap);
    }

    dp.addEventListener('seeking', function () {
        if (debugMode) console.log("[PlayerApp] Vidstack event: seeking");
        isUserSeeking = true;
        videoHasEnded = false;
    });
    dp.addEventListener('seeked', function () {
        if (debugMode) console.log("[PlayerApp] Vidstack event: seeked");
        // Adjust if seeked very close to the end
        if (dp.media && dp.media.activeElement && dp.duration > 0) { // Use dp.duration
            const timeFromEnd = dp.duration - dp.currentTime; // Use dp.currentTime
            if (timeFromEnd < 0.3 && isUserSeeking) {
                dp.currentTime = Math.max(0, dp.currentTime - 1); // Use dp.currentTime
            }
        }
        setTimeout(() => { isUserSeeking = false; }, 200); // Reset seeking flag after a short delay
    });

    dp.addEventListener('pause', function () {
        if (debugMode) console.log("[PlayerApp] Vidstack event: pause");
        saveVideoSpecificProgress();
        // saveCurrentProgress(); // Optional: also update viewing history list on pause
    });
    dp.addEventListener('seeking', saveVideoSpecificProgress); // Compatible with iOS
    dp.addEventListener('seeked', saveVideoSpecificProgress); // Compatible with iOS

    // Vidstack uses 'ended' for video completion (note: DPlayer uses 'ended', Vidstack uses 'end')
    dp.addEventListener('end', function () {
        videoHasEnded = true;
        saveCurrentProgress(); // Ensure final progress is saved
        clearVideoProgress(); // Clear progress for *this specific video*
        if (!autoplayEnabled) return; // User has turned off autoplay
        const nextIdx = currentEpisodeIndex + 1; // Always +1 (consistent now)
        if (nextIdx < currentEpisodes.length) {
            setTimeout(() => {
                // Re-confirm playback ended & not seeking
                if (videoHasEnded && !isUserSeeking) playEpisode(nextIdx);
            }, 1000); // 1-second delay to prevent false triggers
        } else {
            if (debugMode) console.log('[PlayerApp] Reached last episode, autoplay stopped');
        }
    });

    dp.addEventListener('time-update', function (event) {
        // Reset ended flag if user seeks back after video ended
        if (dp.media && dp.media.activeElement && dp.duration > 0) { // Use dp.duration
            if (isUserSeeking && dp.currentTime > dp.duration * 0.95) { // Use dp.currentTime
                videoHasEnded = false;
            }
        }
    });

    // Add a timeout to show a message if loading takes too long
    setTimeout(function () {
        // Check if player exists, media element exists, AND readyState suggests still loading/not enough data
        if (dp && dp.media && dp.media.activeElement && dp.media.activeElement.readyState < 3 && !videoHasEnded) {
            const loadingEl = document.getElementById('loading');
            if (loadingEl && loadingEl.style.display !== 'none') {
                loadingEl.innerHTML = `<div class="loading-spinner"></div><div>视频加载时间较长...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源或刷新</div>`;
                if (debugMode) console.warn("[PlayerApp] Loading timeout reached.");
            }
        }
    }, 15000); // Increased timeout to 15s
}

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', () => { window.location.href = 'index.html'; });
    }

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', handleFullscreen);
    }


    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            const urlParamsRetry = new URLSearchParams(window.location.search);
            const videoUrlRetry = urlParamsRetry.get('url');
            const sourceCodeRetry = urlParamsRetry.get('source_code');
            if (videoUrlRetry) {
                const errorEl = document.getElementById('error'); if (errorEl) errorEl.style.display = 'none';
                const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'flex';
                if (dp) { // For Vidstack, just set src
                    console.log("[PlayerApp] Retrying: Setting new src.");
                    dp.src = videoUrlRetry; // Set Vidstack's src
                    dp.play();
                } else {
                    console.log("[PlayerApp] Retrying: Re-initializing player.");
                    initPlayer(videoUrlRetry, sourceCodeRetry);
                }
            } else {
                showError('无法重试，视频链接无效');
            }
        });
    }

    const prevEpisodeBtn = document.getElementById('prev-episode');
    if (prevEpisodeBtn) prevEpisodeBtn.addEventListener('click', window.playPreviousEpisode); // Use global

    const nextEpisodeBtn = document.getElementById('next-episode');
    if (nextEpisodeBtn) nextEpisodeBtn.addEventListener('click', window.playNextEpisode); // Use global

    const orderBtn = document.getElementById('order-button');
    if (orderBtn) orderBtn.addEventListener('click', toggleEpisodeOrder); // toggleEpisodeOrder is local

    // Add lock button event listener
    const lockButton = document.getElementById('lock-button');
    if (lockButton) lockButton.addEventListener('click', toggleLockScreen);
}

function saveVideoSpecificProgress() {
    if (isNavigatingToEpisode || !dp) return; // Added check for dp existence
    const rememberProgressToggle = document.getElementById('remember-episode-progress-toggle');
    if (!rememberProgressToggle || !rememberProgressToggle.checked) { return; }

    if (!dp.media || !dp.media.activeElement || typeof currentVideoTitle === 'undefined' || typeof currentEpisodeIndex !== 'number' || !currentEpisodes || currentEpisodes.length === 0) {
        return;
    }

    const currentTime = Math.floor(dp.currentTime); // Use Vidstack's currentTime
    const duration = Math.floor(dp.duration); // Use Vidstack's duration

    const showId = getShowIdentifier(false); // <--- Use new function to get show ID

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.95) {
        try {
            let allShowsProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            if (!allShowsProgresses[showId]) { // <--- If this show has no progress object yet, create one
                allShowsProgresses[showId] = {};
            }
            // Save current episode's progress
            allShowsProgresses[showId][currentEpisodeIndex.toString()] = currentTime; // <--- Save specific episode's progress under show object
            // Record the last played episode for this video
            allShowsProgresses[showId].lastPlayedEpisodeIndex = currentEpisodeIndex; // <--- Record under show object
            allShowsProgresses[showId].totalEpisodes = currentEpisodes.length; // (Optional)

            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allShowsProgresses));
        } catch (e) {
            console.error('保存特定视频集数进度失败:', e);
        }
    }
}

// (Optional) Used to clear episode progress for the current video when "remember progress" is turned off
function clearCurrentVideoSpecificEpisodeProgresses() {
    const showId = getShowIdentifier(false);

    try {
        const allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        if (allProgress[showId]) {
            delete allProgress[showId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgress));

            if (typeof showToast === 'function') {
                showToast(`已清除《${currentVideoTitle}》的各集播放进度`, 'info');
            }
        }
    } catch (e) {
        console.error('清除特定视频集数进度失败:', e);
    }
}

function showError(message) {
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    if (dp && dp.media && dp.media.activeElement && dp.currentTime > 1 && !debugMode) { // Show error even if playing if debug mode is on
        console.warn('Ignoring error as video is playing (debug mode off):', message);
        return;
    }
    const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold'); // More specific
        if (errorTextElement) errorTextElement.textContent = message;
        else errorElement.children[1].textContent = message; // Fallback
        errorElement.style.display = 'flex';
    }
    showMessage(message, 'error');
}

// setupProgressBarPreciseClicks and related handlers (handleProgressBarClick, handleProgressBarTouch)
// are now effectively disabled as Vidstack's progress bar handles clicks natively.
// If custom precise clicks are needed, this section would require re-evaluation and targeting of Vidstack's
// specific DOM elements (e.g., `<media-progress-bar>`) and potentially overriding its default behavior.

function handleKeyboardShortcuts(e) {
    // Only proceed if player exists and active element is not an input/textarea
    if (!dp || (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))) return;
    // If screen is locked, only allow fullscreen toggle (F key) and Escape.
    if (isScreenLocked && (e.key.toLowerCase() !== 'f' && e.key !== "Escape")) return;

    let actionText = '', direction = '';
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    switch (e.key) {
        case 'ArrowLeft':
            if (e.altKey) { if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { dp.currentTime = Math.max(0, dp.currentTime - 5); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowRight':
            if (e.altKey) { if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { dp.currentTime = Math.min(dp.duration, dp.currentTime + 5); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageUp': if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageDown': if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case ' ': // Spacebar for play/pause
            if (dp.state.paused) {
                dp.play();
                actionText = '播放';
            } else {
                dp.pause();
                actionText = '暂停';
            }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowUp': dp.volume = Math.min(1, dp.volume + 0.1); actionText = `音量 ${Math.round(dp.volume * 100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowDown': dp.volume = Math.max(0, dp.volume - 0.1); actionText = `音量 ${Math.round(dp.volume * 100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'f':
            handleFullscreen();
            actionText = '切换全屏';
            e.preventDefault();
            if (debugMode) console.log(`Keyboard: ${actionText}`);
            break;
    }
    if (actionText && typeof showShortcutHint === 'function') showShortcutHint(actionText, direction); // Assuming showShortcutHint is defined
}

function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcut-hint');
    if (!hintElement) return;
    if (shortcutHintTimeout) clearTimeout(shortcutHintTimeout);
    const keyElement = document.getElementById('shortcut-key');
    const actionElement = document.getElementById('shortcut-action');
    if (keyElement && actionElement) {
        if (direction === 'left') keyElement.innerHTML = '◀';
        else if (direction === 'right') keyElement.innerHTML = '▶';
        else keyElement.innerHTML = ''; // Clear for actions like play/pause/volume
        actionElement.textContent = text;
    }
    hintElement.classList.add('show');
    shortcutHintTimeout = setTimeout(() => hintElement.classList.remove('show'), 1500);
}

function setupDoubleClickToPlayPause(dpInstance, videoWrapElement) {
    if (!dpInstance || !videoWrapElement) {
        console.warn('[DoubleClick] Vidstack Player instance or video wrap element not provided.');
        return;
    }

    if (videoWrapElement._doubleTapListenerAttached) {
        return; // Prevent duplicate listener binding
    }

    videoWrapElement.addEventListener('touchend', function (e) {
        if (isScreenLocked) { // `isScreenLocked` is your existing global variable
            return; // Do not respond to double tap when screen is locked
        }

        // Selector array to check if touch occurred on Vidstack controls
        const controlSelectors = [
            'media-controls', // Vidstack main control bar
            'media-settings', // Vidstack settings menu
            '.dplayer-comment', // Danmaku related (if enabled and interactive) - DPlayer legacy
            'dplayer-notice', // Player notifications - DPlayer legacy
            '#episode-grid button',// External episode selection buttons
            // Add other custom interactive control selectors within `videoWrapElement` as needed
        ];

        let tappedOnControl = false;
        for (const selector of controlSelectors) {
            if (e.target.closest(selector)) {
                tappedOnControl = true;
                break;
            }
        }

        if (tappedOnControl) {
            // If clicked on a control, reset `lastTapTimeForDoubleTap` to avoid affecting next actual video area click
            lastTapTimeForDoubleTap = 0;
            return; // Do not execute double-tap play/pause logic
        }

        const currentTime = new Date().getTime();
        if ((currentTime - lastTapTimeForDoubleTap) < DOUBLE_TAP_INTERVAL) {
            // Double tap detected
            if (dpInstance && typeof dpInstance.togglePaused === 'function') { // Use Vidstack's `togglePaused`
                dpInstance.togglePaused(); // Toggle play/pause state
            }
            lastTapTimeForDoubleTap = 0; // Reset timestamp to prevent continuous triple clicks from being misjudged
        } else {
            // Single tap (or first click of a double tap)
            lastTapTimeForDoubleTap = currentTime;
        }
        // Vidstack's own click event handles UI visibility, no need for additional operations here.
        // Do not call `e.preventDefault()` or `e.stopPropagation()` unless there's a very clear reason.
    }, { passive: true }); // Use `passive: true` to explicitly indicate we don't prevent default click behavior

    videoWrapElement._doubleTapListenerAttached = true; // Mark as attached
}

function setupLongPressSpeedControl() {
    if (!dp) return; // Ensure dp is initialized
    const playerVideoWrap = document.querySelector('#dp-player media-outlet'); // Targeting Vidstack's media outlet
    if (!playerVideoWrap) {
        console.warn('Vidstack media-outlet for long press not found.');
        return;
    }

    let longPressTimer = null;
    let originalSpeed = 1.0;
    let speedChangedByLongPress = false; // Flag to track if speed was changed by our long press

    // TOUCHSTART: Handles setting up the long press for speed change
    playerVideoWrap.addEventListener('touchstart', function (e) {
        if (isScreenLocked) return;

        const touchX = e.touches[0].clientX;
        const rect = playerVideoWrap.getBoundingClientRect();

        // Only set up long press if touch starts on the right half
        if (touchX > rect.left + rect.width / 2) {
            // DO NOT call e.preventDefault() here.
            // This allows Vidstack to handle short taps normally for UI toggle.
            // Context menu will be handled by the 'contextmenu' event listener.

            originalSpeed = dp.playbackRate; // Use Vidstack's `playbackRate`
            if (longPressTimer) clearTimeout(longPressTimer);

            speedChangedByLongPress = false; // Reset before setting timer

            longPressTimer = setTimeout(() => {
                if (isScreenLocked || !dp || dp.paused) { // Use dp.paused
                    speedChangedByLongPress = false; // Ensure flag is false if bailing
                    return;
                }
                dp.playbackRate = 2.0; // Use Vidstack's `playbackRate`
                speedChangedByLongPress = true; // Set flag only if speed actually changes
                if (typeof showMessage === 'function') showMessage('播放速度: 2.0x', 'info', 1000);
            }, 300);
        } else {
            // Touch started on the left half, clear any pending long press timer from a previous touch
            if (longPressTimer) clearTimeout(longPressTimer);
            speedChangedByLongPress = false;
        }
    }, { passive: true }); // IMPORTANT: Use passive: true if not calling preventDefault

    // TOUCHEND / TOUCHCANCEL: Handles reverting speed if long press occurred
    const endLongPress = function () {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;

        if (speedChangedByLongPress) {
            if (dp) {
                dp.playbackRate = originalSpeed; // Use Vidstack's `playbackRate`
            }
            if (typeof showMessage === 'function') showMessage(`播放速度: ${originalSpeed.toFixed(1)}x`, 'info', 1000);
        }
        speedChangedByLongPress = false; // Reset flag on touch end/cancel
    };

    playerVideoWrap.addEventListener('touchend', endLongPress);
    playerVideoWrap.addEventListener('touchcancel', endLongPress);

    // CONTEXTMENU: Handles preventing the context menu on mobile for the right half
    // Add this listener only once
    if (!playerVideoWrap._contextMenuListenerAttached) {
        playerVideoWrap.addEventListener('contextmenu', function (e) {
            if (!isMobile()) return; // Only act on mobile

            const rect = playerVideoWrap.getBoundingClientRect();
            // Use event's clientX for coordinate. For contextmenu from touch, this is usually the touch point.
            if (e.clientX > rect.left + rect.width / 2) {
                e.preventDefault(); // Prevent context menu if on the right half on mobile
            }
        });
        playerVideoWrap._contextMenuListenerAttached = true;
    }
}

function showPositionRestoreHint(position) {
    if (typeof showMessage !== 'function' || !position || position < 10) return;
    const minutes = Math.floor(position / 60);
    const seconds = Math.floor(position % 60);
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    showMessage(`已从 ${formattedTime} 继续播放`, 'info');
}

function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) { console.warn("Message element not found"); return; }

    let bgColorClass = ({ error: 'bg-red-500', success: 'bg-green-500', warning: 'bg-yellow-500', info: 'bg-blue-500' })[type] || 'bg-blue-500';

    // Reset classes and apply new ones
    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm ${bgColorClass} text-white transition-opacity duration-300 opacity-0`;
    messageElement.textContent = text;

    // Force reflow to apply initial opacity-0 before transitioning
    void messageElement.offsetWidth;

    messageElement.classList.remove('opacity-0');
    messageElement.classList.add('opacity-100');

    // Clear previous timeout if exists
    if (messageElement._messageTimeout) {
        clearTimeout(messageElement._messageTimeout);
    }

    messageElement._messageTimeout = setTimeout(() => {
        messageElement.classList.remove('opacity-100');
        messageElement.classList.add('opacity-0');
        messageElement._messageTimeout = null;
    }, duration);
}

function toggleLockScreen() {
    isScreenLocked = !isScreenLocked;
    const playerContainer = document.querySelector('.player-container');
    const lockButton = document.getElementById('lock-button');
    const lockIcon = document.getElementById('lock-icon'); // Ensure SVG element has this ID

    if (playerContainer) {
        playerContainer.classList.toggle('player-locked', isScreenLocked);
    }

    if (lockButton && lockIcon) {
        if (isScreenLocked) {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-unlock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
            lockButton.setAttribute('aria-label', '解锁屏幕');
            if (typeof showMessage === 'function') showMessage('屏幕已锁定', 'info'); // Or showToast
        } else {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-lock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
            lockButton.setAttribute('aria-label', '锁定屏幕');
            if (typeof showMessage === 'function') showMessage('屏幕已解锁', 'info'); // Or showToast
        }
    }
}

function renderEpisodes() {
    const grid = document.getElementById('episode-grid');
    if (!grid) { setTimeout(renderEpisodes, 100); return; }
    // ★ Make episode selection area visible / hidden
    const container = document.getElementById('episodes-container');
    if (container) {
        if (currentEpisodes.length > 1) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    }

    // ★ Update "Total x episodes" text
    const countSpan = document.getElementById('episodes-count');
    if (countSpan) countSpan.textContent = `共 ${currentEpisodes.length} 集`;

    grid.innerHTML = '';

    if (!currentEpisodes.length) {
        grid.innerHTML =
            '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }

    const order = [...Array(currentEpisodes.length).keys()];
    if (episodesReversed) order.reverse(); // Display in reverse order

    order.forEach(idx => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = idx === currentEpisodeIndex
            ? 'p-2 rounded episode-active'
            : 'p-2 rounded bg-[#222] hover:bg-[#333] text-gray-300';
        btn.textContent = idx + 1;
        btn.dataset.index = idx; // Key: write real index to data attribute
        grid.appendChild(btn);
    });

    /* Use event delegation once on the parent, completely avoiding closures */
    if (!grid._sListenerBound) {
        grid.addEventListener('click', evt => {
            const target = evt.target.closest('button[data-index]');
            if (target) playEpisode(+target.dataset.index);
        });
        grid._sListenerBound = true;
    }

    updateEpisodeInfo();
    updateButtonStates();
}


function updateEpisodeInfo() {
    const episodeInfoSpan = document.getElementById('episode-info-span');
    if (!episodeInfoSpan) return;

    // Only show caption if total episodes > 1
    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        const totalEpisodes = window.currentEpisodes.length;
        const currentDisplayNumber = window.currentEpisodeIndex + 1; // 1-based

        // Caption style: Episode x / y
        episodeInfoSpan.textContent = `第 ${currentDisplayNumber} / ${totalEpisodes} 集`;

        // Synchronize "Total n episodes" text at the top
        const episodesCountEl = document.getElementById('episodes-count');
        if (episodesCountEl) {
            episodesCountEl.textContent = `共 ${totalEpisodes} 集`;
        }
    } else {
        // If single episode or missing data, clear caption
        episodeInfoSpan.textContent = '';
    }
}

// Copy playback link
function copyLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || (dp && dp.currentSrc) || ''; // Use Vidstack's `currentSrc`

    if (!linkUrl) {
        if (typeof showToast === 'function') {
            showToast('没有可复制的视频链接', 'warning');
        } else {
            alert('没有可复制的视频链接');
        }
        return;
    }

    navigator.clipboard.writeText(linkUrl).then(() => {
        if (typeof showToast === 'function') { // Check if showToast is available
            showToast('当前视频链接已复制', 'success');
        } else {
            console.error("showToast function is not available in player_app.js");
            alert('当前视频链接已复制 (showToast unavailable)'); // Fallback alert
        }
    }).catch(err => {
        console.error('复制链接失败:', err);
        if (typeof showToast === 'function') {
            showToast('复制失败，请检查浏览器权限', 'error');
        } else {
            console.error("showToast function is not available in player_app.js");
            alert('复制失败 (showToast unavailable)'); // Fallback alert
        }
    });
}

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    updateOrderButton(); // Update visual state of order button
    renderEpisodes(); // Re-render episode list to reflect new order
}

function updateOrderButton() {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    // Clear existing path and fill with new icon
    icon.innerHTML = episodesReversed
        ? '<polyline points="18 15 12 9 6 15"></polyline>' // ⬆️ Reverse order
        : '<polyline points="6 9 12 15 18 9"></polyline>'; // ⬇️ Normal order
}

function playPreviousEpisode() {
    if (!currentEpisodes.length) return;
    const prevIdx = currentEpisodeIndex - 1; // Always subtract 1 regardless of forward/reverse order
    if (prevIdx >= 0) {
        playEpisode(prevIdx);
    } else showMessage('已经是第一集了', 'info');
}
window.playPreviousEpisode = playPreviousEpisode;

function playNextEpisode() {
    if (!currentEpisodes.length) return;
    const nextIdx = currentEpisodeIndex + 1; // Always add 1
    if (nextIdx < currentEpisodes.length) {
        playEpisode(nextIdx);
    } else showMessage('已经是最后一集了', 'info');
}
window.playNextEpisode = playNextEpisode;

function updateButtonStates() {
    const prevButton = document.getElementById('prev-episode');
    const nextButton = document.getElementById('next-episode');
    const totalEpisodes = window.currentEpisodes ? window.currentEpisodes.length : 0;

    if (prevButton) {
        // "Previous" button is disabled if currentEpisodeIndex is 0 (first actual episode)
        prevButton.disabled = window.currentEpisodeIndex <= 0;
        prevButton.classList.toggle('opacity-50', prevButton.disabled);
        prevButton.classList.toggle('cursor-not-allowed', prevButton.disabled);
    }
    if (nextButton) {
        // "Next" button is disabled if currentEpisodeIndex is the last actual episode
        nextButton.disabled = window.currentEpisodeIndex >= totalEpisodes - 1;
        nextButton.classList.toggle('opacity-50', nextButton.disabled);
        nextButton.classList.toggle('cursor-not-allowed', nextButton.disabled);
    }
}

function saveCurrentProgress() {
    if (!dp || !dp.media || !dp.media.activeElement || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = dp.currentTime; // Use Vidstack's currentTime
    const duration = dp.duration;     // Use Vidstack's duration

    // Only save if meaningful progress has been made and video hasn't practically ended
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) { // Check against 98% to avoid saving if "ended" event was missed
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex],
                episodeIndex: window.currentEpisodeIndex,
                vod_id: vodIdForPlayer || '', // <--- Use global `vodIdForPlayer`
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
                sourceName: new URLSearchParams(window.location.search).get('source') || '',
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                episodes: window.currentEpisodes
            };
            window.addToViewingHistory(videoInfo);
        } catch (e) {
            console.error('保存播放进度失败:', e);
        }
    }
}

function startProgressSaveInterval() {
    if (progressSaveInterval) clearInterval(progressSaveInterval);
    progressSaveInterval = setInterval(() => {
        saveCurrentProgress(); // This saves to "viewing history list"
        saveVideoSpecificProgress(); // New call: saves specific video's episode progress
    }, 8000); // Save every 8 seconds (iOS recommendation)
}

function saveToHistory() { // This is more like an "initial save" or "episode change save"
    if (!dp || !dp.media || !dp.media.activeElement || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            vod_id: vodIdForPlayer || '', // <--- Use global `vodIdForPlayer`
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            episodes: window.currentEpisodes,
            playbackPosition: Math.floor(dp.currentTime), // Use Vidstack's currentTime
            duration: Math.floor(dp.duration) || 0, // Use Vidstack's duration
            timestamp: Date.now()
        };
        window.addToViewingHistory(videoInfo);
    } catch (e) {
        console.error('保存到历史记录失败:', e);
    }
}

function clearVideoProgress() { // This seems to clear localStorage progress, not related to viewing history
    const progressKey = `videoProgress_${getVideoId()}`;
    try {
        localStorage.removeItem(progressKey);
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('已清除 localStorage 播放进度记录 for ' + progressKey);
    } catch (e) { console.error('清除 localStorage 播放进度记录失败', e); }
}

function getVideoId() {
    const sourceCode = new URLSearchParams(window.location.search).get('source_code') || 'unknown';
    return `${encodeURIComponent(currentVideoTitle)}_${sourceCode}_ep${window.currentEpisodeIndex}`;
}

/**
 * Jump to a specific episode; if ready, just switch stream, no full page refresh
 * @param {number} index Target episode index (0-based)
 */

function playEpisode(index) {
    if (!dp) {
        if (typeof showError === 'function') showError("播放器遇到问题，无法切换。");
        return;
    }
    if (!currentEpisodes || index < 0 || index >= currentEpisodes.length) {
        if (typeof showError === 'function') showError("无效的剧集选择。");
        return;
    }
    if (isNavigatingToEpisode && currentEpisodeIndex === index) {
        return;
    }

    if (dp.media && dp.media.activeElement && typeof currentEpisodeIndex === 'number' && currentEpisodes[currentEpisodeIndex] && dp.currentTime > 5) {
        saveVideoSpecificProgress();
    }

    isNavigatingToEpisode = true;

    const oldEpisodeIndexForRevertOnError = currentEpisodeIndex;
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;

    const newEpisodeUrl = currentEpisodes[index];
    if (!newEpisodeUrl || typeof newEpisodeUrl !== 'string' || !newEpisodeUrl.trim()) {
        currentEpisodeIndex = oldEpisodeIndexForRevertOnError;
        window.currentEpisodeIndex = oldEpisodeIndexForRevertOnError;
        isNavigatingToEpisode = false;
        if (typeof showError === 'function') showError("此剧集链接无效，无法播放。");
        return;
    }

    // Progress restore popup logic integration
    nextSeekPosition = 0;
    if (shouldRestoreSpecificProgress) {
        const showId = getShowIdentifier(false); // Consistent with saveVideoSpecificProgress
        const allSpecificProgresses = JSON.parse(
            localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}'
        );
        const savedProgressDataForVideo = allSpecificProgresses[showId];

        if (savedProgressDataForVideo) {
            const positionToResume = savedProgressDataForVideo[index.toString()]
                ? parseInt(savedProgressDataForVideo[index.toString()])
                : 0;
            // Determine whether to show popup
            if (positionToResume > 5 && currentEpisodes[index]) {
                showProgressRestoreModal({
                    title: "继续播放？",
                    content: `《${currentVideoTitle}》第 ${index + 1} 集有播放记录，<br>是否从 <span style="color:#00ccff">${formatPlayerTime(positionToResume)}</span> 继续播放？`,
                    confirmText: "继续播放",
                    cancelText: "从头播放"
                }).then(wantsToResume => {
                    if (wantsToResume) {
                        nextSeekPosition = positionToResume;
                    } else {
                        nextSeekPosition = 0;
                    }
                    doEpisodeSwitch(index, newEpisodeUrl);
                });
                return;
            }
        }
    }

    // No popup scenario, switch directly
    doEpisodeSwitch(index, newEpisodeUrl);
}

// Extract actual episode switching logic into a separate function
function doEpisodeSwitch(index, url) {
    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index;
    const newEpisodeUrl = url;

    // Update UI
    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;
    if (typeof updateEpisodeInfo === 'function') updateEpisodeInfo();
    if (typeof renderEpisodes === 'function') renderEpisodes();
    if (typeof updateButtonStates === 'function') updateButtonStates();

    // Loading
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        const loadingTextEl = loadingEl.querySelector('div:last-child');
        if (loadingTextEl) loadingTextEl.textContent = '正在加载剧集...';
        loadingEl.style.display = 'flex';
        document.documentElement.classList.add('show-loading');
    }
    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'none';

    // Switch video
    dp.pause(); // Pause before changing source
    dp.src = newEpisodeUrl; // Vidstack will handle HLS if provider is attached
    patchAndroidVideoHack();
    if (typeof handleSkipIntroOutro === 'function' && dp) handleSkipIntroOutro(dp);
    videoHasEnded = false;

    // Update URL
    const newUrlForBrowser = new URL(window.location.href);
    newUrlForBrowser.searchParams.set('url', newEpisodeUrl);
    newUrlForBrowser.searchParams.set('title', currentVideoTitle);
    newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());

    const currentSourceCode = new URLSearchParams(window.location.search).get('source_code');
    if (currentSourceCode) newUrlForBrowser.searchParams.set('source_code', currentSourceCode);

    const adFilteringStorageKey = (PLAYER_CONFIG && PLAYER_CONFIG.adFilteringStorage) ? PLAYER_CONFIG.adFilteringStorage : 'adFilteringEnabled';
    const adFilteringActive = (typeof getBoolConfig === 'function') ? getBoolConfig(adFilteringStorageKey, false) : false;
    newUrlForBrowser.searchParams.set('af', adFilteringActive ? '1' : '0');
    newUrlForBrowser.searchParams.delete('position');
    window.history.pushState(
        { path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex },
        '',
        newUrlForBrowser.toString()
    );
}

function handleFullscreen() {
    if (!dp) {
        console.error("Fullscreen action failed: Player not initialized.");
        return;
    }
    const isCurrentlyFullscreen = dp.state.fullscreen;

    if (isCurrentlyFullscreen) {
        // Use the instance method to exit fullscreen.
        dp.exitFullscreen().catch(err => {
            console.warn("Could not exit fullscreen:", err);
        });
    } else {
        // Use the instance method to enter fullscreen.
        dp.enterFullscreen().catch(err => {
            console.warn("Could not enter fullscreen:", err);
        });
    }
}

function overrideMobilePlayButtonBehavior() {
    if (!isMobile() || !dp) {
        return; // Only apply this override on mobile devices when the player exists
    }

    // Use SQuery to safely find the play button, as it's rendered by the layout
    SQuery('media-play-button', (playButton) => {
        playButton.addEventListener('click', (event) => {
            // Prevent the default action (which includes entering fullscreen on mobile)
            event.preventDefault();
            event.stopPropagation();

            // Manually trigger the play action
            if (dp.state.paused) {
                dp.play();
            }
        }, { capture: true }); // Use capture to ensure our listener runs first
    });
}

window.playEpisode = playEpisode;
window.copyLinks = copyLinks;