// --- File: js/player_app.js ---

// Helper for UI notifications (showToast/showMessage might be from ui.js, ensure it's loaded)
if (typeof showToast !== 'function' || typeof showMessage !== 'function') {
    // console.warn("UI notification functions (showToast/showMessage) are not available. Notifications might not work in player_app.js.");
}

// SQuery (from new.txt)
function SQuery(selector, callback, timeout = 5000, interval = 100) {
    let elapsedTime = 0;
    const check = () => {
        const element = document.querySelector(selector);
        if (element) {
            callback(element);
        } else {
            elapsedTime += interval;
            if (elapsedTime < timeout) {
                setTimeout(check, interval);
            } else {
                // console.error(`[SQuery] Element '${selector}' NOT FOUND by SQuery after ${timeout}ms.`);
            }
        }
    };
    check();
}

// localStorage availability test (from new.txt)
function testLocalStorageAvailable() {
    try {
        localStorage.setItem('__ls_test__', '1');
        localStorage.removeItem('__ls_test__');
        return true;
    } catch (e) {
        return false;
    }
}

// Disable context menu deep (from new.txt)
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

// Android video hack (from new.txt)
function patchAndroidVideoHack() {
    if (!/Android/i.test(navigator.userAgent)) return;
    setTimeout(function () {
        const wrap = document.querySelector('#dplayer .dplayer-video-wrap');
        const dplayerMain = document.getElementById('dplayer');
        if (wrap) disableContextMenuDeep(wrap);
        if (dplayerMain) disableContextMenuDeep(dplayerMain);
        const dpvideo = wrap ? wrap.querySelector('video') : null;
        if (dpvideo) {
            disableContextMenuDeep(dpvideo);
            dpvideo.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
            dpvideo.setAttribute('webkit-playsinline', 'true');
            dpvideo.setAttribute('playsinline', 'true');
        }
    }, 800);
}

// Skip intro/outro keys (from new.txt)
const SKIP_INTRO_KEY = 'skipIntroTime';
const SKIP_OUTRO_KEY = 'skipOutroTime';

// Setup skip controls UI (from new.txt)
function setupSkipControls() {
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

    skipButton.addEventListener('click', () => {
        dropdown.classList.toggle('hidden');
        dropdown.classList.toggle('block', !dropdown.classList.contains('hidden'));
    });

    applyBtn.addEventListener('click', () => {
        const introTime = parseInt(skipIntroInput.value) || 0;
        const outroTime = parseInt(skipOutroInput.value) || 0;
        localStorage.setItem(SKIP_INTRO_KEY, introTime);
        localStorage.setItem(SKIP_OUTRO_KEY, outroTime);
        if (typeof showToastPlayer === 'function') showToastPlayer('跳过时间设置已保存', 'success');
        else if (typeof showToast === 'function') showToast('跳过时间设置已保存', 'success');
        dropdown.classList.add('hidden');
        dropdown.classList.remove('block');
    });

    resetBtn.addEventListener('click', () => {
        localStorage.removeItem(SKIP_INTRO_KEY);
        localStorage.removeItem(SKIP_OUTRO_KEY);
        skipIntroInput.value = '';
        skipOutroInput.value = '';
        if (typeof showToastPlayer === 'function') showToastPlayer('跳过时间设置已重置', 'success');
        else if (typeof showToast === 'function') showToast('跳过时间设置已重置', 'success');
    });

    skipIntroInput.value = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    skipOutroInput.value = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
}

// Setup skip dropdown events (from new.txt)
function setupSkipDropdownEvents() {
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('skip-control-dropdown');
        const skipButton = document.getElementById('skip-control-button');
        if (!skipButton || !dropdown) return;
        if (!skipButton.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('block');
        }
    });
}

// Handle skip intro/outro logic (from new.txt, uses global playNextEpisode)
function handleSkipIntroOutro(dpInstance) {
    if (!dpInstance || !dpInstance.video) return;
    const video = dpInstance.video;

    const skipIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    if (video._skipIntroHandler) video.removeEventListener('loadedmetadata', video._skipIntroHandler);
    if (skipIntroTime > 0) {
        video._skipIntroHandler = function () {
            if (video.duration > skipIntroTime && video.currentTime < skipIntroTime) {
                video.currentTime = skipIntroTime;
                if (typeof showToastPlayer === 'function') showToastPlayer(`已跳过${skipIntroTime}秒片头`, 'info');
                else if (typeof showToast === 'function') showToast(`已跳过${skipIntroTime}秒片头`, 'info');
            }
        };
        video.addEventListener('loadedmetadata', video._skipIntroHandler);
    } else {
        video._skipIntroHandler = null;
    }

    const skipOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
    if (video._skipOutroHandler) video.removeEventListener('timeupdate', video._skipOutroHandler);
    if (skipOutroTime > 0) {
        video._skipOutroHandler = function () {
            if (!video) return;
            const remain = video.duration - video.currentTime;
            if (remain <= skipOutroTime && !video.paused && video.duration > 0) { // Added video.duration > 0 check
                if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
                    // playNextEpisode is now defined in app.js and exposed globally
                    if (typeof window.playNextEpisode === 'function') {
                        window.playNextEpisode();
                    } else {
                        console.warn("window.playNextEpisode is not defined");
                    }
                } else {
                    video.pause();
                    if (typeof showToastPlayer === 'function') showToastPlayer(`已跳过${skipOutroTime}秒片尾`, 'info');
                    else if (typeof showToast === 'function') showToast(`已跳过${skipOutroTime}秒片尾`, 'info');
                }
                // To prevent multiple triggers if timeupdate fires rapidly at the very end
                video.removeEventListener('timeupdate', video._skipOutroHandler);
            }
        };
        video.addEventListener('timeupdate', video._skipOutroHandler);
    } else {
        video._skipOutroHandler = null;
    }
}

// Progress restore modal (from old.txt)
function showProgressRestoreModal(opts) {
    return new Promise(resolve => {
        const modal = document.getElementById("progress-restore-modal");
        const contentDiv = modal?.querySelector('.progress-modal-content');
        const titleDiv = modal?.querySelector('.progress-modal-title');
        const btnCancel = modal?.querySelector('#progress-restore-cancel');
        const btnConfirm = modal?.querySelector('#progress-restore-confirm');
        
        if (!modal || !contentDiv || !titleDiv || !btnCancel || !btnConfirm) {
            console.error("Progress restore modal elements not found.");
            return resolve(false); // Cannot show modal
        }

        titleDiv.textContent = opts.title || "继续播放？";
        contentDiv.innerHTML = opts.content || ""; // Ensure content is HTML-safe if dynamic
        btnCancel.textContent = opts.cancelText || "取消";
        btnConfirm.textContent = opts.confirmText || "确定";

        const close = (result) => {
            modal.classList.remove("active");
            document.body.style.overflow = "";
            btnCancel.onclick = null; // Clean up listeners
            btnConfirm.onclick = null;
            document.removeEventListener("keydown", keyHandler);
            setTimeout(() => resolve(result), 180); // Slight delay for transition
        };

        btnCancel.onclick = () => close(false);
        btnConfirm.onclick = () => close(true);

        const keyHandler = (e) => {
            if (e.key === "Escape") close(false);
            if (e.key === "Enter") close(true);
        };
        setTimeout(() => btnConfirm.focus(), 120); // Auto-focus confirm button
        document.addEventListener("keydown", keyHandler);

        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    });
}

// --- Module-level variables ---
let isNavigatingToEpisode = false;
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = []; // Will be populated from URL params or localStorage
let episodesReversed = false;
let dp = null; 
let currentHls = null;
let autoplayEnabled = true;
let isUserSeeking = false;
let videoHasEnded = false;
// let userClickedPosition = null; // from new.txt, seems related to progress bar click, can be kept
let shortcutHintTimeout = null;
let progressSaveInterval = null;
let isScreenLocked = false;
let nextSeekPosition = 0; 
let _tempUrlForCustomHls = ''; 
let lastTapTimeForDoubleTap = 0;
let vodIdForPlayer = ''; // VOD ID for the current show/movie (from URL param 'id')

const DOUBLE_TAP_INTERVAL = 300; 
const REMEMBER_EPISODE_PROGRESS_ENABLED_KEY = 'playerRememberEpisodeProgressEnabled'; 
const VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY = 'videoSpecificEpisodeProgresses'; 

const AD_START_PATTERNS = [/#EXT-X-DATERANGE:.*CLASS="ad"/i, /#EXT-X-SCTE35-OUT/i, /#EXTINF:[\d.]+,\s*ad/i];
const AD_END_PATTERNS = [/#EXT-X-DATERANGE:.*CLASS="content"/i, /#EXT-X-SCTE35-IN/i, /#EXT-X-DISCONTINUITY/i];
let adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true;

function isMobile() {
    return /Mobile|Tablet|iPod|iPhone|iPad|Android|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}

function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Expose some variables to window for player_preload.js or debugging (from new.txt)
// window.currentEpisodes = currentEpisodes; // Already done in initializePageContent
// window.currentEpisodeIndex = currentEpisodeIndex; // Already done in initializePageContent

// getShowIdentifier (from old.txt, adapted)
function getShowIdentifier(perEpisode = true) {
    const params = new URLSearchParams(window.location.search);
    const sourceCode = params.get('source_code') || 'unknown_source';
    // vodIdForPlayer is now a global variable, initialized from URL 'id' param
    const ep = perEpisode ? `_ep${currentEpisodeIndex}` : '';

    if (vodIdForPlayer) return `${currentVideoTitle}_${sourceCode}_${vodIdForPlayer}${ep}`;
    
    // Fallback if vodIdForPlayer is not available (e.g., old links)
    const currentEpisodeUrl = currentEpisodes[currentEpisodeIndex] || params.get('url') || '';
    const urlKey = currentEpisodeUrl.split('/').pop().split(/[?#]/)[0] || 
                   (currentEpisodeUrl.length > 32 ? currentEpisodeUrl.slice(-32) : currentEpisodeUrl) ||
                   'unknown_url_id';
    return `${currentVideoTitle}_${sourceCode}_${urlKey}${ep}`;
}

// clearCurrentVideoAllEpisodeProgresses (from old.txt, adapted)
function clearCurrentVideoAllEpisodeProgresses() {
    try {
        const allProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || "{}");
        const showId = getShowIdentifier(false); 
        if (allProgresses[showId]) {
            delete allProgresses[showId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgresses));
            const msg = `已清除《${currentVideoTitle}》的所有集数播放进度`;
            if (typeof showMessagePlayer === "function") showMessagePlayer(msg, "success");
            else if (typeof showToast === "function") showToast(msg, "success");
        }
    } catch (e) {
        console.error("清除特定视频集数进度失败:", e);
    }
}

// setupRememberEpisodeProgressToggle (from old.txt, adapted)
function setupRememberEpisodeProgressToggle() {
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle) return;
    const savedSetting = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY);
    toggle.checked = savedSetting !== null ? savedSetting === 'true' : true; // Default true
    if (savedSetting === null) localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, 'true');

    toggle.addEventListener('change', function (event) {
        const isChecked = event.target.checked;
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, isChecked.toString());
        const messageText = isChecked ? '将记住本视频的各集播放进度' : '将不再记住本视频的各集播放进度';
        if (typeof showMessagePlayer === 'function') showMessagePlayer(messageText, 'info');
        else if (typeof showToast === 'function') showToast(messageText, 'info');
        
        if (!isChecked) {
            clearCurrentVideoAllEpisodeProgresses(); 
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.isPasswordVerified === 'function' && typeof window.isPasswordProtected === 'function') {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
            const loadingEl = document.getElementById('loading');
            if (loadingEl) loadingEl.style.display = 'none';
            return;
        }
    }
    initializePageContent();
    setupSkipControls(); // From new.txt
    setupSkipDropdownEvents(); // From new.txt
});

document.addEventListener('passwordVerified', () => {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = 'flex';
        document.documentElement.classList.add('show-loading'); // From new.txt
    }
    initializePageContent();
});

function initializePageContent() {
    if (!testLocalStorageAvailable()) {
        if (typeof showMessagePlayer === 'function') showMessagePlayer('当前浏览器本地存储不可用，播放进度记忆将失效', 'warning');
        else if (typeof showToast === 'function') showToast('当前浏览器本地存储不可用，播放进度记忆将失效', 'warning');
    }

    const urlParams = new URLSearchParams(window.location.search);
    let episodeUrlFromParam = urlParams.get('url');
    let titleFromParam = urlParams.get('title');
    vodIdForPlayer = urlParams.get('id') || ''; // Initialize global VOD ID

    const fullyDecode = (str) => { try { let p, c = str; do { p = c; c = decodeURIComponent(c); } while (c !== p); return c; } catch { return str; } };
    currentVideoTitle = titleFromParam ? fullyDecode(titleFromParam) : (localStorage.getItem('currentVideoTitle') || '未知视频');
    window.currentVideoTitle = currentVideoTitle; // Expose globally
    
    let indexFromParam = parseInt(urlParams.get('index') || urlParams.get('ep') || '0', 10);
    
    const episodesListParam = urlParams.get('episodes'); // Episodes list from URL
    try {
        let episodesSource = localStorage.getItem('currentEpisodes'); // Fallback to localStorage
        if (episodesListParam) {
            try { currentEpisodes = JSON.parse(decodeURIComponent(episodesListParam)); }
            catch (e) { currentEpisodes = episodesSource ? JSON.parse(episodesSource) : []; }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
        } else {
            currentEpisodes = [];
        }
        window.currentEpisodes = currentEpisodes; // Expose globally

        if (currentEpisodes.length > 0 && (indexFromParam < 0 || indexFromParam >= currentEpisodes.length)) {
            console.warn(`[PlayerApp] Invalid episode index ${indexFromParam} from URL. Resetting to 0.`);
            indexFromParam = 0;
        }
    } catch (e) {
        console.error('[PlayerApp] Error initializing episode data:', e);
        currentEpisodes = []; window.currentEpisodes = [];
        indexFromParam = 0; 
    }
    
    currentEpisodeIndex = indexFromParam; // Set global currentEpisodeIndex initially
    window.currentEpisodeIndex = currentEpisodeIndex;

    const reversedFromUrl = urlParams.get('reversed');
    episodesReversed = reversedFromUrl !== null ? reversedFromUrl === 'true' : (localStorage.getItem('episodesReversed') === 'true');
    if (reversedFromUrl !== null) localStorage.setItem('episodesReversed', episodesReversed.toString());
    
    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false'; // Default true
    const autoplayToggle = document.getElementById('autoplay-next') || document.getElementById('autoplayToggle');
    if (autoplayToggle) {
        autoplayToggle.checked = autoplayEnabled;
        autoplayToggle.addEventListener('change', (e) => {
            autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled.toString());
        });
    }

    setupRememberEpisodeProgressToggle(); // Initialize the "remember progress" toggle

    // --- Progress Restoration Logic (adapted from old.txt) ---
    const positionFromUrl = urlParams.get('position'); // Check if URL already specifies a position
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;
    let finalEpisodeUrlToPlay = episodeUrlFromParam || (currentEpisodes[currentEpisodeIndex] || '');
    let finalIndexToPlay = currentEpisodeIndex;

    if (positionFromUrl) {
        // If URL has 'position', honor it. Player will seek to this on 'loadedmetadata'.
        finalEpisodeUrlToPlay = episodeUrlFromParam; // URL should already be set for this
        finalIndexToPlay = indexFromParam;
        nextSeekPosition = parseInt(positionFromUrl, 10); // Store for loadedmetadata
         console.log(`[PlayerApp] Will attempt to seek to ${nextSeekPosition} from URL position.`);
    } else if (shouldRestoreSpecificProgress && currentEpisodes.length > 0) {
        const showId = getShowIdentifier(false); // ID for the entire show/movie
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressDataForShow = allSpecificProgresses[showId];

        let indexToAttemptRestore = currentEpisodeIndex; // Start with the index from URL or default 0

        if (savedProgressDataForShow) {
            // If no specific index in URL, try to use the last played for this show
            if ((!urlParams.has('index') || urlParams.get('index') === null) && // i.e., user clicked "Continue Watching" or similar
                typeof savedProgressDataForShow.lastPlayedEpisodeIndex === 'number' &&
                savedProgressDataForShow.lastPlayedEpisodeIndex >= 0 &&
                savedProgressDataForShow.lastPlayedEpisodeIndex < currentEpisodes.length) {
                indexToAttemptRestore = savedProgressDataForShow.lastPlayedEpisodeIndex;
            }
            
            const positionToResume = savedProgressDataForShow[indexToAttemptRestore.toString()] ?
                                     parseInt(savedProgressDataForShow[indexToAttemptRestore.toString()]) : 0;

            if (positionToResume > 5 && currentEpisodes[indexToAttemptRestore]) { // Only prompt if significant progress
                showProgressRestoreModal({
                    title: "继续播放？",
                    content: `发现《${currentVideoTitle}》第 ${indexToAttemptRestore + 1} 集的播放记录，<br>是否从 <span style="color:#00ccff">${formatPlayerTime(positionToResume)}</span> 继续播放？`,
                    confirmText: "继续播放",
                    cancelText: "从头播放"
                }).then(wantsToResume => {
                    const newUrl = new URL(window.location.href); // Get current URL to modify
                    newUrl.searchParams.set('index', indexToAttemptRestore.toString()); // Ensure index is correct
                    if (vodIdForPlayer) newUrl.searchParams.set('id', vodIdForPlayer);
                    newUrl.searchParams.set('url', currentEpisodes[indexToAttemptRestore]); // Set URL for this episode

                    if (wantsToResume) {
                        newUrl.searchParams.set('position', positionToResume.toString());
                         if (typeof showMessagePlayer === 'function') showMessagePlayer(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                         else if (typeof showToast === 'function') showToast(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                    } else {
                        newUrl.searchParams.delete('position'); // Remove position if starting from scratch
                        try { // Clear specific episode progress if "From Start"
                            const show_Id_for_clear = getShowIdentifier(false);
                            const all_prog = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                            if (all_prog[show_Id_for_clear] && all_prog[show_Id_for_clear][indexToAttemptRestore.toString()]) {
                                delete all_prog[show_Id_for_clear][indexToAttemptRestore.toString()];
                                localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(all_prog));
                            }
                        } catch (e) { console.warn('清除本集特定进度失败：', e); }
                        if (typeof showMessagePlayer === 'function') showMessagePlayer('已从头开始播放', 'info');
                        else if (typeof showToast === 'function') showToast('已从头开始播放', 'info');
                    }
                    // IMPORTANT: Replace state and then re-initialize to apply the new URL parameters correctly
                    window.history.replaceState({}, '', newUrl.toString());
                    initializePageContent(); // This will re-read the updated URL
                });
                return; // Exit to wait for modal response
            }
        }
        // If no modal was shown, or no progress for this specific episode, proceed with current index
        finalIndexToPlay = indexToAttemptRestore;
        finalEpisodeUrlToPlay = currentEpisodes[finalIndexToPlay] || episodeUrlFromParam || '';
    }
    // --- End of Progress Restoration Logic ---

    currentEpisodeIndex = finalIndexToPlay; // Final decision on index
    window.currentEpisodeIndex = currentEpisodeIndex;

    // Ensure episodeUrlForPlayer is consistent with currentEpisodeIndex if it was changed by progress logic
    if (currentEpisodes.length > 0 && currentEpisodes[currentEpisodeIndex]) {
        finalEpisodeUrlToPlay = currentEpisodes[currentEpisodeIndex];
    } else if (!finalEpisodeUrlToPlay && episodeUrlFromParam) {
        finalEpisodeUrlToPlay = episodeUrlFromParam; // Fallback to original URL param if currentEpisodes is empty
    }
    
    // Update page title and video title element
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;

    if (finalEpisodeUrlToPlay) {
        initPlayer(finalEpisodeUrlToPlay, urlParams.get('source_code')); 
        // Seek logic is now primarily in dp.on('loadedmetadata') using `nextSeekPosition` or `positionFromUrl`
    } else {
        showError('无效的视频链接或剧集信息');
    }

    updateEpisodeInfo();
    requestAnimationFrame(() => { renderEpisodes(); });
    updateButtonStates();
    updateOrderButton();
    setTimeout(setupProgressBarPreciseClicks, 1000); // From new.txt
    document.addEventListener('keydown', handleKeyboardShortcuts); // From new.txt
    window.addEventListener('beforeunload', () => { saveCurrentProgress(); saveVideoSpecificProgress(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { saveCurrentProgress(); saveVideoSpecificProgress(); }});
    setTimeout(setupPlayerControls, 100); // From new.txt
}


// Ad Filtering Loader (from new.txt, but using global AD_ patterns)
class EnhancedAdFilterLoader extends Hls.DefaultConfig.loader {
    static cueStart = AD_START_PATTERNS; // Use global const
    static cueEnd = AD_END_PATTERNS;   // Use global const
    static strip(content) {
        const lines = content.split('\n');
        let inAd = false, out = [];
        for (const l of lines) {
            if (!inAd && this.cueStart.some(re => re.test(l))) { inAd = true; continue; }
            if (inAd && this.cueEnd.some(re => re.test(l))) { inAd = false; continue; }
            if (!inAd && !/^#EXT-X-DISCONTINUITY/.test(l)) out.push(l); // Keep discontinuities if not in ad segment
        }
        return out.join('\n');
    }
    load(ctx, cfg, cbs) {
        // Use global adFilteringEnabled
        if ((ctx.type === 'manifest' || ctx.type === 'level') && adFilteringEnabled) {
            const origOnSuccess = cbs.onSuccess;
            cbs.onSuccess = (response, stats, context) => { 
                response.data = EnhancedAdFilterLoader.strip(response.data); 
                origOnSuccess(response, stats, context); 
            };
        }
        super.load(ctx, cfg, cbs);
    }
}

// Player Initialization (merged, primarily from new.txt for DPlayer features, HLS config from old.txt)
function initPlayer(videoUrl, sourceCode) { // sourceCode is not directly used here but good for context
    if (!videoUrl) { showError("视频链接无效"); return; }
    if (typeof Hls === 'undefined' || typeof DPlayer === 'undefined') { 
        showError("播放器组件(Hls/DPlayer)加载失败，请刷新"); return; 
    }

    const debugMode = window.PLAYER_CONFIG?.debugMode;
    // adFilteringEnabled is already a global let, set in initializePageContent or by default
    
    const hlsConfig = { // From old.txt HLS config
        debug: debugMode || false,
        loader: adFilteringEnabled ? EnhancedAdFilterLoader : Hls.DefaultConfig.loader,
        skipDateRanges: adFilteringEnabled, 
        enableWorker: true, lowLatencyMode: false, backBufferLength: 90, 
        maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000, maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6, fragLoadingMaxRetryTimeout: 64000, fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3, manifestLoadingRetryDelay: 1000, levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000, startLevel: -1, abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7, abrMaxWithRealBitrate: true,
        stretchShortVideoTrack: true, appendErrorMaxRetry: 5, liveSyncDurationCount: 3,
        liveDurationInfinity: false
    };

    try {
        if (dp) { // If DPlayer instance exists, destroy it before creating a new one
            console.log("[PlayerApp] Destroying existing DPlayer instance before reinitialization.");
            dp.destroy();
            dp = null;
        }
        if(window.currentHls) { // Also destroy any lingering HLS instance
             console.log("[PlayerApp] Destroying existing HLS instance before DPlayer reinitialization.");
            window.currentHls.destroy();
            window.currentHls = null;
        }


        dp = new DPlayer({
            container: document.getElementById('dplayer'),
            autoplay: true, // DPlayer's autoplay, actual play might be browser restricted
            theme: '#00ccff', preload: 'auto', loop: false, lang: 'zh-cn',
            hotkey: true, mutex: true, volume: 0.7, screenshot: true, preventClickToggle: false,
            airplay: true, chromecast: true, 
            video: {
                url: videoUrl, type: 'hls', // Initial URL
                customType: { // DPlayer custom HLS handling
                    hls: function (videoElement, playerInstance) {
                        const urlToLoad = _tempUrlForCustomHls || playerInstance.options.video.url;
                        _tempUrlForCustomHls = ''; // Reset temp URL holder

                        if (!urlToLoad) {
                            console.error("[CustomHLS] No valid source URL provided.");
                            if (typeof showError === 'function') showError("视频链接无效，无法加载。");
                            if (playerInstance && typeof playerInstance.error === 'function') playerInstance.error('No valid source URL for HLS.');
                            return;
                        }
                        if (window.currentHls) { window.currentHls.destroy(); window.currentHls = null; }
                        
                        videoElement.pause();
                        videoElement.removeAttribute('src');
                        while (videoElement.firstChild) videoElement.removeChild(videoElement.firstChild);
                        videoElement.src = ""; // Attempt to clear buffer
                        videoElement.load(); // Reset media element state

                        const hls = new Hls(hlsConfig); 
                        window.currentHls = hls; 

                        hls.on(Hls.Events.ERROR, (event, data) => { 
                            console.error(`[CustomHLS] HLS.js Error. Fatal: ${data.fatal}. Type: ${data.type}. Details: ${data.details}. URL: ${data.url || urlToLoad}`, data);
                            if (data.fatal && playerInstance && typeof playerInstance.error === 'function') {
                                playerInstance.error(`HLS.js fatal error: ${data.type} - ${data.details}`);
                            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && typeof hls.recoverMediaError === 'function') {
                                try { hls.recoverMediaError(); } catch (e) { console.error("Error on hls.recoverMediaError()", e); }
                            }
                        });
                        hls.on(Hls.Events.MANIFEST_LOADED, (event, data) => { /* console.log(`[CustomHLS] Manifest loaded: ${data.url}`); */ });
                        hls.on(Hls.Events.FRAG_BUFFERED, () => { // More reliable than FRAG_LOADED for hiding loading
                            const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
                        });
                        hls.on(Hls.Events.LEVEL_LOADED, () => { 
                            const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
                        });
                        
                        hls.attachMedia(videoElement);
                        hls.on(Hls.Events.MEDIA_ATTACHED, () => { 
                            hls.loadSource(urlToLoad); 
                        });
                    }
                }
            }
        });
        window.dp = dp; // Expose DPlayer instance globally
        if (debugMode) console.log("[PlayerApp] DPlayer instance created/recreated.");

        addDPlayerEventListeners(); // Attach DPlayer event listeners
        patchAndroidVideoHack(); // Apply Android specific hacks
        if (typeof handleSkipIntroOutro === 'function') handleSkipIntroOutro(dp); // Setup skip functionality

    } catch (playerError) {
        console.error("Failed to initialize DPlayer:", playerError);
        showError("播放器初始化失败，请重试");
    }
}

// Add DPlayer event listeners (merged, with focus on new.txt features and old.txt progress logic)
function addDPlayerEventListeners() {
    if (!dp) return;
    const debugMode = window.PLAYER_CONFIG?.debugMode;
    const playerVideoWrap = document.querySelector('#dplayer .dplayer-video-wrap');

    dp.on('fullscreen', () => { 
        if (debugMode) console.log("[PlayerApp] DPlayer event: fullscreen");
        if (window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('landscape').catch(err => console.warn('屏幕方向锁定失败:', err));
        }
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton && fsButton.querySelector('svg')) { // Update custom fullscreen button icon
            fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
            fsButton.setAttribute('aria-label', '退出全屏');
        }
    });

    dp.on('fullscreen_cancel', () => { 
        if (debugMode) console.log("[PlayerApp] DPlayer event: fullscreen_cancel");
        if (window.screen.orientation && window.screen.orientation.unlock) {
            window.screen.orientation.unlock();
        }
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton && fsButton.querySelector('svg')) { // Update custom fullscreen button icon
            fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
            fsButton.setAttribute('aria-label', '全屏');
        }
    });

    dp.on('loadedmetadata', function () {
        if (debugMode) console.log(`[PlayerApp][loadedmetadata] Triggered. Duration: ${dp?.video?.duration}`);
        const loadingEl = document.getElementById('loading');
        if (loadingEl) { loadingEl.style.display = 'none'; document.documentElement.classList.remove('show-loading'); }
        videoHasEnded = false; 
        if (typeof setupProgressBarPreciseClicks === 'function') setupProgressBarPreciseClicks();

        // Prioritize seeking to `nextSeekPosition` (set by modal or episode switch)
        // Then fallback to `position` from URL (e.g., from history click)
        let seekTarget = -1;
        if (nextSeekPosition > 0) {
            seekTarget = nextSeekPosition;
            console.log(`[PlayerApp][loadedmetadata] Prioritizing nextSeekPosition: ${seekTarget}`);
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            const positionFromUrl = urlParams.get('position');
            if (positionFromUrl) {
                seekTarget = parseInt(positionFromUrl, 10);
                 console.log(`[PlayerApp][loadedmetadata] Using position from URL: ${seekTarget}`);
            }
        }
        
        if (seekTarget > 0 && dp && dp.video && dp.video.duration > 0) {
            if (seekTarget < dp.video.duration - 1) { // Ensure seek is valid
                if (typeof dp.seek === 'function') dp.seek(seekTarget); 
                else dp.video.currentTime = seekTarget;
                if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(seekTarget);
            } else {
                 console.warn(`[PlayerApp][loadedmetadata] Seek target ${seekTarget} is too close to duration ${dp.video.duration}. Not seeking.`);
            }
        }
        nextSeekPosition = 0; // Reset after use

        if (typeof saveToHistory === 'function') saveToHistory(); // Initial save for the episode
        if (typeof startProgressSaveInterval === 'function') startProgressSaveInterval();
        isNavigatingToEpisode = false;

        setTimeout(() => { 
            if (!dp || !dp.video || dp.video.destroyed) return; // Check if player/video is still valid
            if (dp.video.paused) {
                const playFn = dp.play;
                if (typeof playFn === 'function') {
                    const dplayerAutoplay = dp.options?.autoplay; // DPlayer's own autoplay option
                    const customAutoplay = autoplayEnabled; // Global autoplay toggle
                    if (dplayerAutoplay || customAutoplay) {
                        const promise = playFn.call(dp);
                        if (promise && typeof promise.catch === 'function') {
                            promise.catch(e => console.warn("[PlayerApp] dp.play() Promise rejected (likely browser autoplay policy):", e));
                        }
                    }
                } else { console.error("[PlayerApp] dp.play is not a function after loadedmetadata timeout."); }
            }
        }, 150); // Slightly increased delay
    });

    dp.on('error', (e) => { 
        console.error("DPlayer error event:", e);
        // Allow errors if video was playing for a bit, unless in debug mode
        if (dp && dp.video && dp.video.currentTime > 1 && !debugMode) { 
            console.warn('DPlayer error ignored as video was playing.');
            return;
        }
        showError('播放器遇到错误，请检查视频源或网络');
    });
    
    // Double-tap and long-press features from new.txt
    if (playerVideoWrap) {
        if (typeof setupDoubleClickToPlayPause === 'function') setupDoubleClickToPlayPause(dp, playerVideoWrap);
        if (typeof setupLongPressSpeedControl === 'function') setupLongPressSpeedControl();
    }

    dp.on('seeking', () => { if (debugMode) console.log("[PlayerApp] DPlayer event: seeking"); isUserSeeking = true; videoHasEnded = false; });
    dp.on('seeked', () => { 
        if (debugMode) console.log("[PlayerApp] DPlayer event: seeked");
        if (dp.video && dp.video.duration > 0) {
            const timeFromEnd = dp.video.duration - dp.video.currentTime;
            if (timeFromEnd < 0.3 && isUserSeeking) dp.video.currentTime = Math.max(0, dp.video.currentTime - 1); // Adjust if too close to end
        }
        setTimeout(() => { isUserSeeking = false; }, 200); 
        saveVideoSpecificProgress(); // Save specific episode progress on seeked
    });
    dp.on('pause', () => { 
        if (debugMode) console.log("[PlayerApp] DPlayer event: pause");
        saveVideoSpecificProgress(); // Save specific episode progress on pause
        // saveCurrentProgress(); // Optionally save to general history list on pause
    });
    
    dp.on('ended', () => {
        if (debugMode) console.log("[PlayerApp] DPlayer event: ended");
        videoHasEnded = true;
        saveCurrentProgress(); // Save final progress to general history
        // clearVideoProgress(); // This clears an old localStorage key, might be redundant with new system.
                               // The new system saves per-episode progress, so "ended" means this episode is done.
                               // We might want to mark this specific episode as "watched" or clear its progress if that's the desired UX.
                               // For now, let's ensure its final state (near end) is saved by saveVideoSpecificProgress if not already.
        saveVideoSpecificProgress(); // Ensure final position is captured for this episode.

        if (!autoplayEnabled) return;
        const nextIdx = currentEpisodeIndex + 1;
        if (nextIdx < currentEpisodes.length) {
            setTimeout(() => { 
                if (videoHasEnded && !isUserSeeking) { // Double check state
                    // playEpisode is now global from this file
                    if (typeof window.playEpisode === 'function') window.playEpisode(nextIdx);
                    else console.warn("window.playEpisode is not defined for autoplay.");
                }
            }, 1000);
        } else {
            if (debugMode) console.log('[PlayerApp] 已到最后一集，自动连播停止');
            if(typeof showMessagePlayer === 'function') showMessagePlayer('已播放完毕', 'info');
            else if(typeof showToast === 'function') showToast('已播放完毕', 'info');
        }
    });
    dp.on('timeupdate', () => { 
        if (isUserSeeking && dp.video && dp.video.duration > 0 && dp.video.currentTime < dp.video.duration * 0.95) {
            videoHasEnded = false; // Reset ended flag if user seeks back
        }
    });

    setTimeout(() => { 
        if (dp && dp.video && dp.video.readyState < 3 && !videoHasEnded) { // readyState < 3 means not enough data
            const loadingEl = document.getElementById('loading');
            if (loadingEl && loadingEl.style.display !== 'none') { // If loading is still visible
                loadingEl.innerHTML = `<div class="loading-spinner"></div><div>视频加载时间较长...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源或刷新</div>`;
                if (debugMode) console.warn("[PlayerApp] Loading timeout reached, player might be stalled.");
            }
        }
    }, PLAYER_CONFIG.timeout || 15000); // Use timeout from PLAYER_CONFIG

    // Native fullscreen integration (from new.txt)
    (function () {
        const dplayerElement = document.getElementById('dplayer');
        if (dplayerElement) {
            dp.on('fullscreen', () => { 
                if (document.fullscreenElement || document.webkitFullscreenElement) return; 
                if (dplayerElement.requestFullscreen) dplayerElement.requestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed:', err));
                else if (dplayerElement.webkitRequestFullscreen) dplayerElement.webkitRequestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed (webkit):', err));
            });
            dp.on('fullscreen_cancel', () => { 
                if (!document.fullscreenElement && !document.webkitFullscreenElement) return; 
                if (document.exitFullscreen) document.exitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed:', err));
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed (webkit):', err));
            });
        }
    })();
}

// Setup player controls (from new.txt, uses global playPrevious/NextEpisode)
function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) backButton.addEventListener('click', () => { window.location.href = 'index.html'; });

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (dp && dp.fullScreen && typeof dp.fullScreen.toggle === 'function') {
                dp.fullScreen.toggle();
            } else { // Fallback for custom button if DPlayer's internal isn't used/available
                const playerContainer = document.getElementById('dplayer'); // Or your main player container
                if (playerContainer) {
                    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                        if (playerContainer.requestFullscreen) playerContainer.requestFullscreen().catch(err => console.error("Fallback FS error:", err));
                        else if (playerContainer.webkitRequestFullscreen) playerContainer.webkitRequestFullscreen().catch(err => console.error("Fallback FS error (webkit):", err));
                    } else {
                        if (document.exitFullscreen) document.exitFullscreen().catch(err => console.error("Fallback exit FS error:", err));
                        else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.error("Fallback exit FS error (webkit):", err));
                    }
                }
            }
        });
    }
    
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            const urlParamsRetry = new URLSearchParams(window.location.search);
            const videoUrlRetry = urlParamsRetry.get('url');
            const sourceCodeRetry = urlParamsRetry.get('source_code'); // Get source_code for initPlayer
            if (videoUrlRetry) {
                const errorEl = document.getElementById('error'); if (errorEl) errorEl.style.display = 'none';
                const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'flex';
                _tempUrlForCustomHls = videoUrlRetry; // For DPlayer's customType hls
                if (dp && dp.video) { 
                    console.log("[PlayerApp] Retrying: Switching video.");
                    dp.switchVideo({ url: videoUrlRetry, type: 'hls' }); // DPlayer handles HLS re-init via customType
                    if(dp.video.paused) dp.play(); // Attempt to play if paused
                } else {
                    console.log("[PlayerApp] Retrying: Re-initializing player.");
                    initPlayer(videoUrlRetry, sourceCodeRetry); // Full re-init if dp doesn't exist
                }
            } else {
                showError('无法重试，视频链接无效');
            }
        });
    }

    const prevEpisodeBtn = document.getElementById('prev-episode');
    if (prevEpisodeBtn) prevEpisodeBtn.addEventListener('click', window.playPreviousEpisode); 

    const nextEpisodeBtn = document.getElementById('next-episode');
    if (nextEpisodeBtn) nextEpisodeBtn.addEventListener('click', window.playNextEpisode); 

    const orderBtn = document.getElementById('order-button');
    if (orderBtn) orderBtn.addEventListener('click', toggleEpisodeOrder); // Local function

    const lockButton = document.getElementById('lock-button');
    if (lockButton) lockButton.addEventListener('click', toggleLockScreen); // Local function
}

// Save specific episode progress (from old.txt, adapted)
function saveVideoSpecificProgress() {
    if (isNavigatingToEpisode) return; // Don't save if in the middle of switching episodes
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle || !toggle.checked) return; // Only save if toggle is checked
    if (!dp || !dp.video || typeof currentVideoTitle === 'undefined' || typeof currentEpisodeIndex !== 'number' || !currentEpisodes || currentEpisodes.length === 0) {
        return;
    }

    const currentTime = Math.floor(dp.video.currentTime);
    const duration = Math.floor(dp.video.duration);
    const showId = getShowIdentifier(false); // Get ID for the whole show/movie

    // Only save if meaningful progress and not practically at the end
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) { 
        try {
            let allShowsProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            if (!allShowsProgresses[showId]) allShowsProgresses[showId] = {}; // Create entry for the show if not exists
            
            allShowsProgresses[showId][currentEpisodeIndex.toString()] = currentTime; // Save current episode's progress
            allShowsProgresses[showId].lastPlayedEpisodeIndex = currentEpisodeIndex; // Update last played episode for this show
            allShowsProgresses[showId].totalEpisodes = currentEpisodes.length; // Optionally store total episodes

            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allShowsProgresses));
        } catch (e) { console.error('保存特定视频集数进度失败:', e); }
    } else if (currentTime >= duration * 0.98 && duration > 0) { // If episode is considered finished
        try {
            let allShowsProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            if (allShowsProgresses[showId] && allShowsProgresses[showId][currentEpisodeIndex.toString()]) {
                // Option 1: Remove progress for this specific episode as it's "watched"
                // delete allShowsProgresses[showId][currentEpisodeIndex.toString()];
                // Option 2: Or set its progress to duration to mark as fully watched
                allShowsProgresses[showId][currentEpisodeIndex.toString()] = duration;
                localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allShowsProgresses));
            }
        } catch (e) { console.error('标记剧集完成进度失败:', e); }
    }
}

// Show error message (local to player_app.js)
function showError(message) { 
    const debugMode = window.PLAYER_CONFIG?.debugMode;
    if (dp && dp.video && dp.video.currentTime > 1 && !debugMode) { 
        console.warn('Ignoring error as video is playing:', message);
        return; 
    }
    const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold') || errorElement.children[1];
        if (errorTextElement) errorTextElement.textContent = message;
        errorElement.style.display = 'flex';
    }
    // Use local showMessagePlayer for player-specific notifications
    if (typeof showMessagePlayer === 'function') showMessagePlayer(message, 'error');
    else console.error("showMessagePlayer function not found. Error:", message);
}

// Progress bar precise clicks (from new.txt)
function setupProgressBarPreciseClicks() {
    if (!dp) return;
    setTimeout(() => { // Wait for DPlayer to render
        const progressBar = document.querySelector('#dplayer .dplayer-bar-wrap');
        if (!progressBar) { console.warn('DPlayer进度条元素未找到 (.dplayer-bar-wrap)'); return; }
        // Remove previous listeners to avoid duplicates if called multiple times
        progressBar.removeEventListener('click', handleProgressBarClick);
        progressBar.removeEventListener('touchend', handleProgressBarTouch);
        // Add new listeners
        progressBar.addEventListener('click', handleProgressBarClick);
        progressBar.addEventListener('touchend', handleProgressBarTouch);
    }, 500); 
}
function handleProgressBarClick(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const clickTime = percentage * dp.video.duration;
    // userClickedPosition = clickTime; // This global var might not be needed if seek is direct
    dp.seek(clickTime);
}
function handleProgressBarTouch(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.changedTouches || !e.changedTouches[0] || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const offsetX = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const touchTime = percentage * dp.video.duration;
    // userClickedPosition = touchTime;
    dp.seek(touchTime);
}

// Keyboard shortcuts (from new.txt, uses global playPrevious/NextEpisode)
function handleKeyboardShortcuts(e) {
    if (!dp || (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))) return;
    if (isScreenLocked && (e.key !== 'f' && e.key !== 'F' && e.key !== "Escape")) return; // Allow fullscreen toggle and Esc when locked
    
    let actionText = '', direction = '';
    const debugMode = window.PLAYER_CONFIG?.debugMode;

    switch (e.key) {
        case 'ArrowLeft':
            if (e.altKey) { if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { dp.seek(Math.max(0, dp.video.currentTime - 5)); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); break;
        case 'ArrowRight':
            if (e.altKey) { if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { dp.seek(Math.min(dp.video.duration, dp.video.currentTime + 5)); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); break;
        case 'PageUp': if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); break;
        case 'PageDown': if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); break;
        case ' ': dp.toggle(); actionText = dp.video.paused ? '暂停' : '播放'; e.preventDefault(); break;
        case 'ArrowUp': dp.volume(Math.min(1, dp.video.volume + 0.1)); actionText = `音量 ${Math.round(dp.video.volume * 100)}%`; e.preventDefault(); break;
        case 'ArrowDown': dp.volume(Math.max(0, dp.video.volume - 0.1)); actionText = `音量 ${Math.round(dp.video.volume * 100)}%`; e.preventDefault(); break;
        case 'f': case 'F': dp.fullScreen.toggle(); actionText = '切换全屏'; e.preventDefault(); break;
        case 'Escape': if (dp.fullScreen.isFullScreen()) { dp.fullScreen.cancel(); actionText = '退出全屏'; e.preventDefault(); } break;
    }
    if (actionText && typeof showShortcutHint === 'function') showShortcutHint(actionText, direction);
    if (debugMode && actionText) console.log(`Keyboard: ${actionText}`);
}

// Show shortcut hint UI (from new.txt)
function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcut-hint');
    if (!hintElement) return;
    if (shortcutHintTimeout) clearTimeout(shortcutHintTimeout);
    const keyElement = document.getElementById('shortcut-key');
    const actionElement = document.getElementById('shortcut-action');
    if (keyElement && actionElement) {
        if (direction === 'left') keyElement.innerHTML = '◀';
        else if (direction === 'right') keyElement.innerHTML = '▶';
        else keyElement.innerHTML = ''; 
        actionElement.textContent = text;
    }
    hintElement.classList.add('show');
    shortcutHintTimeout = setTimeout(() => hintElement.classList.remove('show'), 1500);
}

// Double-tap to play/pause (from new.txt)
function setupDoubleClickToPlayPause(dpInstance, videoWrapElement) {
    if (!dpInstance || !videoWrapElement) { console.warn('[DoubleClick] DPlayer instance or video wrap element not provided.'); return; }
    if (videoWrapElement._doubleTapListenerAttached) return; 

    videoWrapElement.addEventListener('touchend', function (e) {
        if (isScreenLocked) return; 
        const controlSelectors = ['.dplayer-controller', '.dplayer-setting', '#episode-grid button'];
        let tappedOnControl = false;
        for (const selector of controlSelectors) { if (e.target.closest(selector)) { tappedOnControl = true; break; } }
        if (tappedOnControl) { lastTapTimeForDoubleTap = 0; return; }

        const currentTime = new Date().getTime();
        if ((currentTime - lastTapTimeForDoubleTap) < DOUBLE_TAP_INTERVAL) {
            if (dpInstance && typeof dpInstance.toggle === 'function') dpInstance.toggle(); 
            lastTapTimeForDoubleTap = 0; 
        } else {
            lastTapTimeForDoubleTap = currentTime;
        }
    }, { passive: true }); 
    videoWrapElement._doubleTapListenerAttached = true;
}

// Long-press speed control (from new.txt)
function setupLongPressSpeedControl() {
    if (!dp) return;
    const playerVideoWrap = document.querySelector('#dplayer .dplayer-video-wrap');
    if (!playerVideoWrap) { console.warn('DPlayer video wrap for long press not found.'); return; }

    let longPressTimer = null; let originalSpeed = 1.0; let speedChangedByLongPress = false;

    playerVideoWrap.addEventListener('touchstart', function (e) {
        if (isScreenLocked) return;
        const touchX = e.touches[0].clientX; const rect = playerVideoWrap.getBoundingClientRect();
        if (touchX > rect.left + rect.width / 2) { // Only on right half
            originalSpeed = dp.video.playbackRate;
            if (longPressTimer) clearTimeout(longPressTimer);
            speedChangedByLongPress = false;
            longPressTimer = setTimeout(() => {
                if (isScreenLocked || !dp || !dp.video || dp.video.paused) { speedChangedByLongPress = false; return; }
                dp.speed(2.0); speedChangedByLongPress = true;
                if (typeof showMessagePlayer === 'function') showMessagePlayer('播放速度: 2.0x', 'info', 1000);
                else if (typeof showToast === 'function') showToast('播放速度: 2.0x', 'info', 1000);
            }, 300);
        } else {
            if (longPressTimer) clearTimeout(longPressTimer); speedChangedByLongPress = false;
        }
    }, { passive: true });

    const endLongPress = function () {
        if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null;
        if (speedChangedByLongPress) {
            if (dp && dp.video) dp.speed(originalSpeed);
            if (typeof showMessagePlayer === 'function') showMessagePlayer(`播放速度: ${originalSpeed.toFixed(1)}x`, 'info', 1000);
            else if (typeof showToast === 'function') showToast(`播放速度: ${originalSpeed.toFixed(1)}x`, 'info', 1000);
        }
        speedChangedByLongPress = false; 
    };
    playerVideoWrap.addEventListener('touchend', endLongPress);
    playerVideoWrap.addEventListener('touchcancel', endLongPress);

    if (!playerVideoWrap._contextMenuListenerAttached) { // Prevent context menu on right half (mobile)
        playerVideoWrap.addEventListener('contextmenu', function (e) {
            if (!isMobile()) return; 
            const rect = playerVideoWrap.getBoundingClientRect();
            if (e.clientX > rect.left + rect.width / 2) e.preventDefault();
        });
        playerVideoWrap._contextMenuListenerAttached = true;
    }
}

// Show position restore hint (from new.txt, uses local showMessagePlayer)
function showPositionRestoreHint(position) {
    if (typeof showMessagePlayer !== 'function' || !position || position < 10) return;
    if (typeof showMessagePlayer === 'function') showMessagePlayer(`已从 ${formatPlayerTime(position)} 继续播放`, 'info');
    else if (typeof showToast === 'function') showToast(`已从 ${formatPlayerTime(position)} 继续播放`, 'info');
}

// Local message display for player (from new.txt) - Renamed to avoid conflict with ui.js
function showMessagePlayer(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message'); // Assumes #message element exists in player.html
    if (!messageElement) { console.warn("Player message element #message not found"); return; }
    let bgColorClass = ({ error: 'bg-red-500', success: 'bg-green-500', warning: 'bg-yellow-500', info: 'bg-blue-500' })[type] || 'bg-blue-500';
    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm ${bgColorClass} text-white transition-opacity duration-300 opacity-0`;
    messageElement.textContent = text;
    void messageElement.offsetWidth; // Force reflow
    messageElement.classList.remove('opacity-0'); messageElement.classList.add('opacity-100');
    if (messageElement._messageTimeout) clearTimeout(messageElement._messageTimeout);
    messageElement._messageTimeout = setTimeout(() => {
        messageElement.classList.remove('opacity-100'); messageElement.classList.add('opacity-0');
        messageElement._messageTimeout = null;
    }, duration);
}

// Toggle lock screen (from new.txt, uses local showMessagePlayer)
function toggleLockScreen() {
    isScreenLocked = !isScreenLocked;
    const playerContainer = document.querySelector('.player-container'); // Or specific DPlayer container
    const lockButton = document.getElementById('lock-button');
    const lockIcon = document.getElementById('lock-icon'); 

    if (playerContainer) playerContainer.classList.toggle('player-locked', isScreenLocked);
    if (lockButton && lockIcon) {
        if (isScreenLocked) {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-unlock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
            lockButton.setAttribute('aria-label', '解锁屏幕');
            if (typeof showMessagePlayer === 'function') showMessagePlayer('屏幕已锁定', 'info');
        } else {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-lock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
            lockButton.setAttribute('aria-label', '锁定屏幕');
            if (typeof showMessagePlayer === 'function') showMessagePlayer('屏幕已解锁', 'info');
        }
    }
}

// Render episode list (from old.txt, adapted)
function renderEpisodes() {
    const grid = document.getElementById('episode-grid');
    if (!grid) { /* setTimeout(renderEpisodes, 100); */ console.warn("Episode grid not found."); return; }
    const container = document.getElementById('episodes-container');
    if (container) container.classList.toggle('hidden', currentEpisodes.length <= 1);
    const countSpan = document.getElementById('episodes-count');
    if (countSpan) countSpan.textContent = `共 ${currentEpisodes.length} 集`;

    grid.innerHTML = '';
    if (!currentEpisodes.length) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }
    const order = [...Array(currentEpisodes.length).keys()];
    if (episodesReversed) order.reverse();
    order.forEach(idx => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = idx === currentEpisodeIndex ? 'p-2 rounded episode-active' : 'p-2 rounded bg-[#222] hover:bg-[#333] text-gray-300';
        btn.textContent = idx + 1;
        btn.dataset.index = idx; 
        grid.appendChild(btn);
    });
    if (!grid._sListenerBound) { // Event delegation for episode clicks
        grid.addEventListener('click', evt => {
            const target = evt.target.closest('button[data-index]');
            if (target && typeof window.playEpisode === 'function') window.playEpisode(+target.dataset.index);
        });
        grid._sListenerBound = true;
    }
    updateEpisodeInfo();
    updateButtonStates();
}

// Update episode info display (from old.txt)
function updateEpisodeInfo() {
    const episodeInfoSpan = document.getElementById('episode-info-span');
    if (!episodeInfoSpan) return;
    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        episodeInfoSpan.textContent = `第 ${window.currentEpisodeIndex + 1} / ${window.currentEpisodes.length} 集`;
        const episodesCountEl = document.getElementById('episodes-count');
        if (episodesCountEl) episodesCountEl.textContent = `共 ${window.currentEpisodes.length} 集`;
    } else {
        episodeInfoSpan.textContent = '';
    }
}

// Copy current video link (from new.txt, adapted for player_app context)
function copyLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || (dp && dp.video && dp.video.src) || ''; 
    if (!linkUrl) {
        if (typeof showToastPlayer === 'function') showToastPlayer('没有可复制的视频链接', 'warning');
        return;
    }
    navigator.clipboard.writeText(linkUrl).then(() => {
        if (typeof showToastPlayer === 'function') showToastPlayer('当前视频链接已复制', 'success');
    }).catch(err => {
        console.error('复制链接失败:', err);
        if (typeof showToastPlayer === 'function') showToastPlayer('复制失败，请检查浏览器权限', 'error');
    });
}
window.copyLinks = copyLinks; // Expose if called from HTML

// Toggle episode order (from old.txt)
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    updateOrderButton(); 
    renderEpisodes();    
}

// Update order button icon (from old.txt)
function updateOrderButton() {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    icon.innerHTML = episodesReversed ? '<polyline points="18 15 12 9 6 15"></polyline>' : '<polyline points="6 9 12 15 18 9"></polyline>';
}

// Update prev/next button states (from old.txt)
function updateButtonStates() {
    const prevButton = document.getElementById('prev-episode');
    const nextButton = document.getElementById('next-episode');
    const totalEpisodes = window.currentEpisodes ? window.currentEpisodes.length : 0;
    if (prevButton) {
        prevButton.disabled = window.currentEpisodeIndex <= 0;
        prevButton.classList.toggle('opacity-50', prevButton.disabled);
        prevButton.classList.toggle('cursor-not-allowed', prevButton.disabled);
    }
    if (nextButton) {
        nextButton.disabled = window.currentEpisodeIndex >= totalEpisodes - 1;
        nextButton.classList.toggle('opacity-50', nextButton.disabled);
        nextButton.classList.toggle('cursor-not-allowed', nextButton.disabled);
    }
}

// Save current progress to general viewing history (ui.js) (from old.txt, adapted)
function saveCurrentProgress() { 
    if (!dp || !dp.video || isUserSeeking || videoHasEnded || typeof window.addToViewingHistory !== 'function') return;
    const currentTime = dp.video.currentTime;
    const duration = dp.video.duration;
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) {
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex], // Current episode's URL
                episodeIndex: window.currentEpisodeIndex,
                vod_id: vodIdForPlayer || '', // VOD ID of the show
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
                sourceName: new URLSearchParams(window.location.search).get('source') || '', // Display name of source
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                episodes: window.currentEpisodes // Full list of episodes for this show
            };
            window.addToViewingHistory(videoInfo); // Call global function from ui.js
        } catch (e) { console.error('保存播放进度到观看历史列表失败:', e); }
    }
}

// Start interval for saving progress (from old.txt)
function startProgressSaveInterval() {
    if (progressSaveInterval) clearInterval(progressSaveInterval);
    progressSaveInterval = setInterval(() => {
        saveCurrentProgress(); 
        saveVideoSpecificProgress(); 
    }, 8000); // e.g., every 8 seconds
}

// Save to history on initial load/episode change (from old.txt, adapted)
function saveToHistory() { 
    if (!dp || !dp.video || !currentVideoTitle || typeof window.addToViewingHistory !== 'function' || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            vod_id: vodIdForPlayer || '',
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            episodes: window.currentEpisodes, 
            playbackPosition: Math.floor(dp.video.currentTime), 
            duration: Math.floor(dp.video.duration) || 0, 
            timestamp: Date.now()
        };
        window.addToViewingHistory(videoInfo);
    } catch (e) { console.error('保存到历史记录失败 (saveToHistory):', e); }
}

// Clear old video progress key (from old.txt, less relevant with new system but kept for cleanup)
function clearVideoProgress() { 
    const oldProgressKey = `videoProgress_${getShowIdentifier(true)}`; // Use new ID format for consistency
    try { 
        localStorage.removeItem(oldProgressKey);
        // if (window.PLAYER_CONFIG?.debugMode) console.log('已清除旧式 localStorage 播放进度记录 for ' + oldProgressKey);
    } catch (e) { console.error('清除旧式 localStorage 播放进度记录失败', e); }
}

// Play specific episode (from old.txt, adapted)
function playEpisode(index) {
    if (!dp) { if (typeof showError === 'function') showError("播放器遇到问题，无法切换。"); return; }
    if (!currentEpisodes || index < 0 || index >= currentEpisodes.length) { if (typeof showError === 'function') showError("无效的剧集选择。"); return; }
    if (isNavigatingToEpisode && currentEpisodeIndex === index) return; // Avoid re-triggering during switch

    if (dp.video && dp.video.src && typeof currentEpisodeIndex === 'number' && currentEpisodes[currentEpisodeIndex] && dp.video.currentTime > 5) {
        saveVideoSpecificProgress(); // Save progress of the current episode before switching
    }
    isNavigatingToEpisode = true;
    const oldEpisodeIndexForRevertOnError = currentEpisodeIndex;
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;
    const newEpisodeUrl = currentEpisodes[index];

    if (!newEpisodeUrl || typeof newEpisodeUrl !== 'string' || !newEpisodeUrl.trim()) {
        currentEpisodeIndex = oldEpisodeIndexForRevertOnError; window.currentEpisodeIndex = oldEpisodeIndexForRevertOnError;
        isNavigatingToEpisode = false; if (typeof showError === 'function') showError("此剧集链接无效，无法播放。"); return;
    }

    nextSeekPosition = 0; // Reset before checking for new position
    if (shouldRestoreSpecificProgress) {
        const showId = getShowIdentifier(false); 
        const allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressDataForShow = allSpecificProgresses[showId];
        if (savedProgressDataForShow) {
            const positionToResume = savedProgressDataForShow[index.toString()] ? parseInt(savedProgressDataForShow[index.toString()]) : 0;
            if (positionToResume > 5 && currentEpisodes[index]) {
                showProgressRestoreModal({
                    title: "继续播放？",
                    content: `《${currentVideoTitle}》第 ${index + 1} 集有播放记录，<br>是否从 <span style="color:#00ccff">${formatPlayerTime(positionToResume)}</span> 继续播放？`,
                    confirmText: "继续播放", cancelText: "从头播放"
                }).then(wantsToResume => {
                    nextSeekPosition = wantsToResume ? positionToResume : 0;
                    if (!wantsToResume) { 
                         try { // Clear specific progress if "From Start"
                            const show_Id_for_clear = getShowIdentifier(false);
                            const all_prog = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                            if (all_prog[show_Id_for_clear] && all_prog[show_Id_for_clear][index.toString()]) {
                                delete all_prog[show_Id_for_clear][index.toString()];
                                localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(all_prog));
                            }
                        } catch (e) { console.warn('清除本集特定进度失败：', e); }
                    }
                    doEpisodeSwitch(index, newEpisodeUrl); // Proceed with switch after modal
                });
                return; // Exit to wait for modal response
            }
        }
    }
    doEpisodeSwitch(index, newEpisodeUrl); // No modal, or no progress to restore for this episode
}
window.playEpisode = playEpisode; // Make global for episode grid and prev/next buttons

// Actual episode switching logic (from old.txt, adapted)
function doEpisodeSwitch(index, url) {
    currentEpisodeIndex = index; window.currentEpisodeIndex = index; // Update global state
    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;
    
    if (typeof updateEpisodeInfo === 'function') updateEpisodeInfo();
    if (typeof renderEpisodes === 'function') renderEpisodes();
    if (typeof updateButtonStates === 'function') updateButtonStates();

    const loadingEl = document.getElementById('loading');
    if (loadingEl) { 
        const loadingTextEl = loadingEl.querySelector('div:last-child'); // Assuming text is in second div
        if (loadingTextEl) loadingTextEl.textContent = '正在加载剧集...';
        loadingEl.style.display = 'flex'; 
        document.documentElement.classList.add('show-loading');
    }
    const errorEl = document.getElementById('error'); 
    if (errorEl) errorEl.style.display = 'none';

    _tempUrlForCustomHls = url; // Set for DPlayer's customType hls
    if (dp && dp.video) { 
        dp.video.pause(); // Pause current video before switching
        dp.switchVideo({ url: url, type: 'hls' }); // DPlayer handles HLS re-init via customType
        patchAndroidVideoHack(); // Re-apply Android hacks
        if (typeof handleSkipIntroOutro === 'function') handleSkipIntroOutro(dp); // Re-apply skip logic
    } else {
        console.warn("[PlayerApp] DPlayer instance or video not ready for switchVideo. Attempting full re-init.");
        initPlayer(url, new URLSearchParams(window.location.search).get('source_code'));
    }
    videoHasEnded = false; // Reset ended flag for new episode

    // Update URL in browser bar
    const newUrlForBrowser = new URL(window.location.href);
    newUrlForBrowser.searchParams.set('url', url);
    newUrlForBrowser.searchParams.set('title', currentVideoTitle);
    newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());
    if (vodIdForPlayer) newUrlForBrowser.searchParams.set('id', vodIdForPlayer); 
    
    const currentSourceCode = new URLSearchParams(window.location.search).get('source_code');
    if (currentSourceCode) newUrlForBrowser.searchParams.set('source_code', currentSourceCode);
    
    const adFilteringStorageKey = PLAYER_CONFIG?.adFilteringStorage || 'adFilteringEnabled';
    const adFilteringActive = (typeof getBoolConfig === 'function') ? getBoolConfig(adFilteringStorageKey, false) : false;
    newUrlForBrowser.searchParams.set('af', adFilteringActive ? '1' : '0');
    newUrlForBrowser.searchParams.delete('position'); // Clear old position as we are starting a new episode (or seeking via nextSeekPosition)
    
    window.history.pushState(
        { path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex }, 
        '', 
        newUrlForBrowser.toString()
    );
    // Note: `nextSeekPosition` will be used by `loadedmetadata` handler to seek if needed.
}
