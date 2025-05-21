// File: js/player_app.js

// 从Vidstack官方CDN导入必要的模块
import { VidstackPlayer, VidstackPlayerLayout } from 'https://cdn.vidstack.io/player';

// 在模块最顶部，立刻监听键盘
document.addEventListener('keydown', handleKeyboardShortcuts, true);

/* ------------------------------------------------------------------
   代理辅助：把真实地址包进 /proxy/ 并附带广告过滤开关 (?af=0/1)
   ------------------------------------------------------------------ */
function proxifyUrl(rawUrl, adOn = true) {
    if (!rawUrl || rawUrl.startsWith('/proxy/')) return rawUrl;
    /* PROXY_URL 在 config.js 中用 const 定义，这里兜底防止加载顺序异常 */
    const proxyBase =
        typeof PROXY_URL !== 'undefined'
            ? PROXY_URL
            : (typeof window !== 'undefined' && window.PROXY_URL) || '/proxy/';
    return `${proxyBase}${encodeURIComponent(rawUrl)}${adOn ? '' : '?af=0'}`;
}
/* 若别的模块也需要，可挂到 window ——不影响本文件作为 module 运行 */
if (typeof window !== 'undefined') window.proxifyUrl = proxifyUrl;

// Add this helper function at the top of js/player_app.js
if (typeof showToast !== 'function' || typeof showMessage !== 'function') {
    if (typeof showToast !== 'function') {
        console.warn("UI notification function showToast is not available. Toast notifications might not work.");
    }
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
function disableContextMenuDeep(playerElement) { // playerElement is the Vidstack player's root DOM element
    console.warn('[Vidstack Migration] disableContextMenuDeep with Vidstack needs to target the internal video element correctly, or use Vidstack API if available.');
    if (!playerElement) return;

    // Try to find the video element within the player component. This is speculative.
    // Vidstack might provide a direct way: player.mediaElement or player.videoElement
    const videoElement = playerElement.querySelector('video') || (playerElement.shadowRoot ? playerElement.shadowRoot.querySelector('video') : null);

    if (videoElement) {
        videoElement.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, { passive: false });
        // playsinline should be set on player creation options or on the <media-player> tag if used declaratively
        // videoElement.setAttribute('playsinline', 'true'); 
        videoElement.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback'); // Review necessity, Vidstack might control this
        console.log('[Vidstack Migration] Applied contextmenu and controlsList to internal video element.');
    } else {
        console.warn('[Vidstack Migration] Internal video element not found for disableContextMenuDeep. Applying to player root as fallback for contextmenu.');
        playerElement.addEventListener('contextmenu', e => {
            // Only prevent if target is the player root itself or if we knew the video element
            if (e.target === playerElement) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, { passive: false });
    }
}

/**
 * 展示自定义的“记住进度恢复”弹窗，并Promise化回调
 * @param {Object} opts 配置对象：title,content,confirmText,cancelText
 * @returns {Promise<boolean>} 用户点击确定:true / 取消:false
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
        setTimeout(() => btnConfirm.focus(), 120);
        document.addEventListener("keydown", handler);

        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    });
}

// --- 模块内变量 ---
let isNavigatingToEpisode = false;
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = localStorage.getItem('episodesReversed') === 'true';
let vsPlayer = null; // Vidstack Player instance (from VidstackPlayer.create())
let autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';

let isUserSeeking = false;
let videoHasEnded = false;
// let userClickedPosition = null; // Not used after removing custom progress bar clicks
let shortcutHintTimeout = null;
let progressSaveInterval = null;
let isScreenLocked = false;
let nextSeekPosition = 0;
let lastTapTimeForDoubleTap = 0;

const DOUBLE_TAP_INTERVAL = 300;
const REMEMBER_EPISODE_PROGRESS_ENABLED_KEY = 'playerRememberEpisodeProgressEnabled';
const VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY = 'videoSpecificEpisodeProgresses';

const AD_START_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="ad"/i,
    /#EXT-X-SCTE35-OUT/i,
    /#EXTINF:[\d.]+,\s*ad/i,
];
const AD_END_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="content"/i,
    /#EXT-X-SCTE35-IN/i,
    /#EXT-X-DISCONTINUITY/i,
];

let adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled !== false;

function isMobile() {
    return /Mobile|Tablet|iPod|iPhone|iPad|Android|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}

function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

window.currentEpisodes = [];
window.currentEpisodeIndex = 0;

function clearCurrentVideoAllEpisodeProgresses() {
    try {
        const all = JSON.parse(
            localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || "{}"
        );
        const sourceCode = new URLSearchParams(window.location.search)
            .get("source_code") || "unknown_source";
        const videoId = `${currentVideoTitle}_${sourceCode}`;

        if (all[videoId]) {
            delete all[videoId];
            localStorage.setItem(
                VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY,
                JSON.stringify(all)
            );
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

    const savedSetting = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY);
    if (savedSetting !== null) {
        toggle.checked = savedSetting === 'true';
    } else {
        toggle.checked = true;
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, 'true');
    }

    toggle.addEventListener('change', function (event) {
        const isChecked = event.target.checked;
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, isChecked.toString());
        if (typeof showMessage === 'function') {
            const messageText = isChecked ? '将记住本视频的各集播放进度' : '将不再记住本视频的各集播放进度';
            showMessage(messageText, 'info');
        } else if (typeof showToast === 'function') {
            const messageText = isChecked ? '将记住本视频的各集播放进度' : '将不再记住本视频的各集播放进度';
            showToast(messageText, 'info');
        }
        if (!isChecked) {
            clearCurrentVideoAllEpisodeProgresses();
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
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

document.addEventListener('passwordVerified', () => {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = 'flex';
        document.documentElement.classList.add('show-loading');
    }
    initializePageContent();
});

// --- Ad Filtering Loader (Using Legacy Logic) ---
class EnhancedAdFilterLoader extends Hls.DefaultConfig.loader {
    static cueStart = AD_START_PATTERNS;
    static cueEnd = AD_END_PATTERNS;
    static strip(content) {
        const lines = content.split('\n');
        let inAd = false, out = [];

        for (const l of lines) {
            if (!inAd && this.cueStart.some(re => re.test(l))) { inAd = true; continue; }
            if (inAd && this.cueEnd.some(re => re.test(l))) { inAd = false; continue; }
            if (!inAd && !/^#EXT-X-DISCONTINUITY/.test(l)) out.push(l);
        }
        return out.join('\n');
    }

    load(ctx, cfg, cbs) {
        // Check adFilteringEnabled from global scope or PLAYER_CONFIG
        const currentAdFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled !== false;
        if ((ctx.type === 'manifest' || ctx.type === 'level') && currentAdFilteringEnabled) {
            const orig = cbs.onSuccess;
            cbs.onSuccess = (r, s, ctx2) => { r.data = EnhancedAdFilterLoader.strip(r.data); orig(r, s, ctx2); };
        }
        super.load(ctx, cfg, cbs);
    }
}


async function createAndSetupPlayer(initialSrc, initialTitle, initialAutoplaySetting, sourceCode) {
    if (vsPlayer && typeof vsPlayer.destroy === 'function') {
        vsPlayer.destroy(); // Destroy previous instance if exists
        vsPlayer = null;
    }
    if (progressSaveInterval) clearInterval(progressSaveInterval);

    const playerTargetElement = document.getElementById('player');
    if (!playerTargetElement) {
        showError("播放器目标DIV元素 ('player') 未找到!");
        return;
    }
    // Clear the target div of any previous player elements or messages (except loading/error)
    // Ensure loading/error divs are direct children of player-container or handled by CSS correctly
    // For simplicity, if playerTargetElement is meant to ONLY contain the player, then:
    playerTargetElement.innerHTML = ''; // Or selectively remove previous player

    // Show loading indicator before player creation
    const loadingElGlobal = document.getElementById('loading');
    if (loadingElGlobal) loadingElGlobal.style.display = 'flex';
    const errorElGlobal = document.getElementById('error');
    if (errorElGlobal) errorElGlobal.style.display = 'none';


    if (!initialSrc) {
        showError("视频链接无效");
        if (loadingElGlobal) loadingElGlobal.style.display = 'none';
        return;
    }

    /* ---------- ② 更稳的 .m3u8 判定 ---------- */
    const decodedSrc = (() => {
        try { return decodeURIComponent(initialSrc); } catch { return initialSrc; }
    })();
    const isHlsSource = initialSrc.includes('.m3u8') || decodedSrc.includes('.m3u8');

    // Ensure Hls is available if needed for the loader
    if (isHlsSource && typeof Hls === 'undefined') {
        console.warn("HLS.js library not found. HLS playback might not work as expected or ad filtering might fail.");
    }

    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
        // 从URL参数恢复广告过滤开关，而不是只用PLAYER_CONFIG
        const afParam = new URLSearchParams(window.location.search).get('af');
        if (afParam === '0') {
            adFilteringEnabled = false;
        } else if (afParam === '1') {
            adFilteringEnabled = true;
        } else {
            adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled !== false;
        }

    // HLS configuration to be applied via provider-change
    const hlsConfigForProvider = {
        debug: debugMode,
        // Ensure Hls and Hls.DefaultConfig are available before trying to use EnhancedAdFilterLoader
        loader: (adFilteringEnabled && typeof Hls !== 'undefined' && Hls.DefaultConfig) ? EnhancedAdFilterLoader : (typeof Hls !== 'undefined' && Hls.DefaultConfig ? Hls.DefaultConfig.loader : undefined),
        skipDateRanges: adFilteringEnabled, // Vidstack might have its own way or this might be for HLS.js
        enableWorker: true, lowLatencyMode: false, backBufferLength: 90, maxBufferLength: 30,
        maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000, maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6, fragLoadingMaxRetryTimeout: 64000, fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3, manifestLoadingRetryDelay: 1000, levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7, abrMaxWithRealBitrate: true,
        stretchShortVideoTrack: true, appendErrorMaxRetry: 5, liveSyncDurationCount: 3,
        liveDurationInfinity: false
    };

    try {
        const playerOptions = {
            target: playerTargetElement, // Target the div
            title: initialTitle,
            src: initialSrc,
            autoplay: initialAutoplaySetting,
            playsinline: true, // Important for mobile
            // poster: 'YOUR_POSTER_URL_IF_AVAILABLE', // Example
            layout: new VidstackPlayerLayout({
                // thumbnails: 'YOUR_THUMBNAILS_VTT_IF_AVAILABLE', // Example
                // You can customize controls further here if needed
            }),
            // Vidstack has its own HLS/Dash provider configurations.
            // Check Vidstack docs for direct HLS config if provider-change is problematic.
        };

        vsPlayer = await VidstackPlayer.create(playerOptions);
        window.vsPlayer = vsPlayer; // Expose globally if other scripts need it

        // Configure HLS provider after player is created
        if (isHlsSource && vsPlayer.provider) {
            if (vsPlayer.provider.type === 'hls') {
                if (typeof vsPlayer.provider.configure === 'function') {
                    vsPlayer.provider.configure(hlsConfigForProvider);
                    console.log("[Vidstack] Applied custom HLS config via provider.configure() on initial provider.");
                }
            }
        } else if (isHlsSource) {
            vsPlayer.addEventListener('provider-change', (event) => {
                const provider = event.detail;
                if (provider && provider.type === 'hls') {
                    if (typeof provider.configure === 'function') {
                        provider.configure(hlsConfigForProvider);
                        console.log("[Vidstack] Applied custom HLS config via provider.configure() on provider-change.");
                    } else if (provider.instance && typeof provider.instance.config !== 'undefined') {
                        Object.assign(provider.instance.config, hlsConfigForProvider);
                        console.log("[Vidstack] Applied custom HLS config via provider.instance.config on provider-change.");
                    } else {
                        console.warn("[Vidstack] Could not directly configure HLS provider. EnhancedAdFilterLoader may not work as expected.");
                    }
                }
            }, { once: true });
        }


        const savedVolume = parseFloat(localStorage.getItem('playerVolume'));
        const savedMuted = localStorage.getItem('playerMuted') === 'true';
        if (!isNaN(savedVolume) && vsPlayer) vsPlayer.volume = savedVolume;
        if (vsPlayer) vsPlayer.muted = savedMuted;

        if (debugMode) console.log("[PlayerApp] Vidstack Player instance created.");

        addVidstackEventListeners(); // Attaches event listeners like 'can-play', 'error', etc.

        if (isMobile()) {
            // vsPlayer.el should be the root DOM element of the player instance
            if (vsPlayer && vsPlayer.el) {
                disableContextMenuDeep(vsPlayer.el);
            } else if (playerTargetElement.firstChild) { // Fallback if .el is not available
                disableContextMenuDeep(playerTargetElement.firstChild);
            }
        }

    } catch (playerError) {
        console.error("Vidstack 播放器创建时发生错误:", playerError);
        showError("Vidstack 播放器创建失败 (请检查控制台)"); // More specific message
        vsPlayer = null; // Ensure vsPlayer is null on error
        if (loadingElGlobal) loadingElGlobal.style.display = 'none';
    }
}


function initializePageContent() {
    if (!testLocalStorageAvailable()) {
        showMessage('当前浏览器本地存储不可用，播放进度记忆将失效', 'warning');
    }
    const urlParams = new URLSearchParams(window.location.search);
    let episodeUrlForPlayer = urlParams.get('url');
    let title = urlParams.get('title');
    function fullyDecode(str) {
        try {
            let prev, cur = str;
            do { prev = cur; cur = decodeURIComponent(cur); } while (cur !== prev);
            return cur;
        } catch { return str; }
    }
    title = title ? fullyDecode(title) : '';
    const sourceCodeFromUrl = urlParams.get('source_code');

    let index = parseInt(urlParams.get('index') || urlParams.get('ep') || '0', 10);
    let indexForPlayer = index;

    const episodesListParam = urlParams.get('episodes');
    const reversedFromUrl = urlParams.get('reversed');

    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    window.currentVideoTitle = currentVideoTitle;

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
        window.currentEpisodes = currentEpisodes;

        if (currentEpisodes.length > 0 && (index < 0 || index >= currentEpisodes.length)) {
            console.warn(`[PlayerApp] Invalid episode index ${index} for ${currentEpisodes.length} episodes. Resetting to 0.`);
            index = 0;
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index.toString());
            window.history.replaceState({}, '', newUrl.toString());
        }
        indexForPlayer = index;
        // currentEpisodeIndex will be set after progress restore logic

        if (reversedFromUrl !== null) {
            episodesReversed = reversedFromUrl === 'true';
            localStorage.setItem('episodesReversed', episodesReversed.toString());
        } else {
            episodesReversed = localStorage.getItem('episodesReversed') === 'true';
        }
    } catch (e) {
        console.error('[PlayerApp] Error initializing episode data:', e);
        currentEpisodes = []; window.currentEpisodes = [];
        indexForPlayer = 0;
        episodesReversed = false;
    }

    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';

    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';
    const autoplayToggle = document.getElementById('autoplay-next') || document.getElementById('autoplayToggle');
    if (autoplayToggle) {
        autoplayToggle.checked = autoplayEnabled;
        autoplayToggle.addEventListener('change', function (e) {
            autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled.toString());
            if (vsPlayer) vsPlayer.autoplay = autoplayEnabled; // Update player instance if exists
        });
    }

    setupRememberEpisodeProgressToggle();

    const positionFromUrl = urlParams.get('position');
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;

    if (positionFromUrl) {
        episodeUrlForPlayer = urlParams.get('url'); // Already decoded if from URL
        indexForPlayer = parseInt(urlParams.get('index') || '0', 10);
        // nextSeekPosition will be set later before player creation.
    } else if (shouldRestoreSpecificProgress && currentEpisodes.length > 0) {
        const videoSpecificIdForRestore = `${currentVideoTitle}_${sourceCodeFromUrl || 'unknown_source'}`;
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressData = allSpecificProgresses[videoSpecificIdForRestore];

        if (savedProgressData) {
            const resumeIndex = indexForPlayer;
            const positionToResume = savedProgressData[resumeIndex.toString()] ? parseInt(savedProgressData[resumeIndex.toString()]) : 0;

            if ((!urlParams.has('index') || urlParams.get('index') === null)
                && typeof savedProgressData.lastPlayedEpisodeIndex === 'number'
                && savedProgressData.lastPlayedEpisodeIndex >= 0
                && savedProgressData.lastPlayedEpisodeIndex < currentEpisodes.length) {
                indexForPlayer = savedProgressData.lastPlayedEpisodeIndex;
            }

            // Use the potentially updated indexForPlayer for positionToResume check
            const actualPositionToResume = savedProgressData[indexForPlayer.toString()] ? parseInt(savedProgressData[indexForPlayer.toString()]) : 0;


            if (actualPositionToResume > 5 && currentEpisodes[indexForPlayer]) {
                showProgressRestoreModal({
                    title: "继续播放？",
                    content: `发现《${currentVideoTitle}》第 ${indexForPlayer + 1} 集的播放记录，<br>是否从 <span style="color:#00ccff">${formatPlayerTime(actualPositionToResume)}</span> 继续播放？`,
                    confirmText: "继续播放",
                    cancelText: "从头播放"
                }).then(wantsToResume => {
                    if (wantsToResume) {
                        episodeUrlForPlayer = currentEpisodes[indexForPlayer]; // URL for the episode to resume
                        // indexForPlayer is already set
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('url', episodeUrlForPlayer);
                        newUrl.searchParams.set('index', indexForPlayer.toString());
                        newUrl.searchParams.set('position', actualPositionToResume.toString());
                        window.history.replaceState({}, '', newUrl.toString());
                    } else {
                        try {
                            const all = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                            const vid = `${currentVideoTitle}_${sourceCodeFromUrl || 'unknown_source'}`;
                            if (all[vid] && all[vid][indexForPlayer.toString()]) {
                                delete all[vid][indexForPlayer.toString()];
                                localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(all));
                            }
                        } catch (e) {
                            console.warn('清除本集进度失败：', e);
                        }
                        // 【关键插入 END】
                        episodeUrlForPlayer = currentEpisodes[indexForPlayer];
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('url', episodeUrlForPlayer);
                        newUrl.searchParams.set('index', indexForPlayer.toString());
                        newUrl.searchParams.delete('position');
                        window.history.replaceState({}, '', newUrl.toString());
                        if (typeof showMessage === 'function') showMessage('已从头开始播放', 'info');
                        else if (typeof showToast === 'function') showToast('已从头开始播放', 'info');
                    }

                    initializePageContent();
                });
                return; // IMPORTANT: Stop further execution to wait for modal response
            } else {
                episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
            }
        } else {
            episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
        }
    } else {
        episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
    }

    /* 统一经过代理，带去广告参数 */
    episodeUrlForPlayer = proxifyUrl(episodeUrlForPlayer, adFilteringEnabled);

    currentEpisodeIndex = indexForPlayer;
    window.currentEpisodeIndex = currentEpisodeIndex;
    if (currentEpisodes.length > 0 && (!episodeUrlForPlayer || !currentEpisodes.includes(episodeUrlForPlayer))) {
        episodeUrlForPlayer = currentEpisodes[currentEpisodeIndex];
        if (episodeUrlForPlayer) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('url', episodeUrlForPlayer);
            // title and index should already be in URL or will be set by playEpisode
            window.history.replaceState({}, '', newUrl.toString());
        }
    }

    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;

    if (episodeUrlForPlayer) {
        // Call the new player creation function
        // Pass autoplayEnabled (global variable) instead of urlParams.get('autoplay')
        createAndSetupPlayer(episodeUrlForPlayer, currentVideoTitle, autoplayEnabled, sourceCodeFromUrl);

        const finalUrlParams = new URLSearchParams(window.location.search);
        const positionToSeekFromUrl = finalUrlParams.get('position');
        if (positionToSeekFromUrl) {
            nextSeekPosition = parseInt(positionToSeekFromUrl, 10);
        } else {
            nextSeekPosition = 0; // Ensure it's reset if no position in URL
        }
    } else {
        showError('无效的视频链接');
    }

    updateEpisodeInfo();
    requestAnimationFrame(() => {
        renderEpisodes();
    });
    updateButtonStates();
    updateOrderButton();
    // Custom progress bar click setup is removed. Vidstack handles its own.

    document.addEventListener('keydown', handleKeyboardShortcuts, true); // 捕获阶段更保险
    window.addEventListener('beforeunload', function () {
        saveCurrentProgress();
        saveVideoSpecificProgress();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
            saveVideoSpecificProgress();
        }
    });

    let checkUICounter = 0;
    const checkUIInterval = setInterval(() => {
        if (typeof window.addToViewingHistory === 'function' || checkUICounter > 20) {
            clearInterval(checkUIInterval);
            if (typeof window.addToViewingHistory !== 'function') {
                console.error("UI functions like addToViewingHistory did not become available.");
            }
        }
        checkUICounter++;
    }, 100);

    setTimeout(setupPlayerControls, 100); // Ensure DOM for controls is ready
}


function addVidstackEventListeners() {
    if (!vsPlayer || vsPlayer._eventListenersAttached) return;

    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    vsPlayer.addEventListener('fullscreen-change', (event) => {
        const isFullscreen = event.detail; // boolean
        if (debugMode) console.log(`[Vidstack Event] fullscreen-change: ${isFullscreen}`);

        if (window.screen.orientation && window.screen.orientation.lock) {
            if (isFullscreen) {
                window.screen.orientation.lock('landscape').catch(err => console.warn('屏幕方向锁定失败:', err));
            } else {
                if (window.screen.orientation.unlock) window.screen.orientation.unlock();
            }
        }
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton && fsButton.querySelector('svg')) {
            if (isFullscreen) {
                fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
                fsButton.setAttribute('aria-label', '退出全屏');
            } else {
                fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
                fsButton.setAttribute('aria-label', '全屏');
            }
        }
    });

    vsPlayer.addEventListener('can-play', function (event) {
        // Vidstack 'can-play' event.detail might include { duration, seekable, buffered, qualités, etc. }
        // For this example, we primarily use it to know media is ready.
        const duration = vsPlayer.duration; // Access properties directly from vsPlayer instance
        if (debugMode) console.log(`[Vidstack Event] can-play. Duration: ${duration}`);

        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
            document.documentElement.classList.remove('show-loading');
        }
        videoHasEnded = false;

        if (nextSeekPosition > 0 && duration > 0) {
            if (nextSeekPosition < duration) {
                console.log(`[Vidstack] Attempting to seek to nextSeekPosition: ${nextSeekPosition}`);
                vsPlayer.currentTime = nextSeekPosition;
                if (typeof showMessage === 'function') showMessage(`已从 ${formatPlayerTime(nextSeekPosition)} 继续播放`, 'info');
                else if (typeof showToast === 'function') showToast(`已从 ${formatPlayerTime(nextSeekPosition)} 继续播放`, 'info');

            } else {
                console.warn(`[Vidstack] nextSeekPosition (${nextSeekPosition}) is out of bounds for duration (${duration}). Not seeking.`);
            }
        }
        nextSeekPosition = 0; // Reset after use

        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof startProgressSaveInterval === 'function') startProgressSaveInterval();

        isNavigatingToEpisode = false;
        if (debugMode) console.log("[PlayerApp][can-play] isNavigatingToEpisode reset to false.");

        // Autoplay logic after 'can-play' if player is paused and autoplay is enabled
        // The `autoplay` option in `VidstackPlayer.create` should handle initial autoplay.
        // This might be for subsequent plays or if initial autoplay failed.
        if (vsPlayer.paused && autoplayEnabled) {
            console.log(`[Vidstack Event] can-play: Video is paused. Attempting to play due to autoplayEnabled.`);
            vsPlayer.play().catch(e => {
                console.warn("[Vidstack] Autoplay after can-play was prevented or failed:", e);
            });
        }
    });

    vsPlayer.addEventListener('error', function (event) {
        // Vidstack error event.detail often contains { message, code, fatal, MEDIA_ERROR, ... }
        const errorDetail = event.detail;
        console.error("[Vidstack Event] error:", errorDetail);
        if (vsPlayer.currentTime > 1 && errorDetail && !errorDetail.fatal) {
            if (debugMode) console.log('[Vidstack] Non-fatal error ignored as video was playing.', errorDetail.message);
            return;
        }
        showError(`播放器错误: ${errorDetail.message || '请检查视频源或网络'}`);
    });

    vsPlayer.addEventListener('seeking', function () {
        if (debugMode) console.log("[Vidstack Event] seeking");
        isUserSeeking = true;
        videoHasEnded = false;
        saveVideoSpecificProgress();
    });

    vsPlayer.addEventListener('seeked', function () {
        if (debugMode) console.log("[Vidstack Event] seeked");
        saveVideoSpecificProgress();
        if (vsPlayer.duration > 0) {
            const timeFromEnd = vsPlayer.duration - vsPlayer.currentTime;
            if (timeFromEnd < 0.3 && isUserSeeking) {
                vsPlayer.currentTime = Math.max(0, vsPlayer.currentTime - 1);
            }
        }
        setTimeout(() => { isUserSeeking = false; }, 200);
    });

    vsPlayer.addEventListener('pause', function () {
        if (debugMode) console.log("[Vidstack Event] pause");
        saveVideoSpecificProgress();
        // saveCurrentProgress(); // Consider if needed here, already in interval and visibility change
    });

    vsPlayer.addEventListener('ended', function () {
        if (debugMode) console.log("[Vidstack Event] ended");
        videoHasEnded = true;
        saveCurrentProgress();
        clearVideoProgress(); // Clears localStorage progress for this specific video (old logic)

        if (!autoplayEnabled) return;
        const nextIdx = currentEpisodeIndex + 1;
        if (nextIdx < currentEpisodes.length) {
            setTimeout(() => {
                if (videoHasEnded && !isUserSeeking && vsPlayer && vsPlayer.ended) { // Check player actual 'ended' state
                    playEpisode(nextIdx);
                }
            }, 1000);
        } else {
            if (debugMode) console.log('[PlayerApp] 已到最后一集，自动连播停止');
        }
    });

    vsPlayer.addEventListener('volume-change', function () {
        if (!vsPlayer) return;
        localStorage.setItem('playerVolume', vsPlayer.volume.toString());
        localStorage.setItem('playerMuted', vsPlayer.muted.toString());
    });


    vsPlayer.addEventListener('time-update', function (event) {
        // Vidstack time-update event.detail: { currentTime, duration, ... }
        if (!vsPlayer) return;
        const currentTime = vsPlayer.currentTime; // event.detail.currentTime;
        const duration = vsPlayer.duration; // event.detail.duration;
        if (duration > 0) {
            if (isUserSeeking && currentTime > duration * 0.95) {
                videoHasEnded = false;
            }
        }
    });

    setTimeout(function () {
        // readyState: 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
        if (vsPlayer && vsPlayer.readyState < 3 && !videoHasEnded && vsPlayer.paused) { // Check if paused instead of playing
            const loadingEl = document.getElementById('loading');
            if (loadingEl && loadingEl.style.display !== 'none') {
                // Ensure the spinner and initial text are present
                const spinner = loadingEl.querySelector('.loading-spinner');
                if (!spinner) { // If spinner was removed, re-add
                    const newSpinner = document.createElement('div');
                    newSpinner.className = 'loading-spinner';
                    newSpinner.setAttribute('aria-hidden', 'true');
                    loadingEl.prepend(newSpinner); // Add spinner at the beginning
                }

                // Find or create the text div
                let textDiv = loadingEl.querySelector('div:not(.loading-spinner)');
                if (!textDiv) {
                    textDiv = document.createElement('div');
                    textDiv.className = 'mt-4'; // Assuming Tailwind for margin
                    loadingEl.appendChild(textDiv);
                }
                // Update text content
                textDiv.innerHTML = `视频加载时间较长...<div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源或刷新</div>`;
                if (debugMode) console.warn("[PlayerApp] Loading timeout reached.");
            }
        }
    }, 15000);
    vsPlayer._eventListenersAttached = true;
}

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', () => { window.location.href = 'index.html'; });
    }

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (vsPlayer) {
                if (vsPlayer.fullscreen.active) { // Vidstack uses player.fullscreen.active
                    vsPlayer.exitFullscreen().catch(err => console.error("Vidstack exit fullscreen error:", err));
                } else {
                    vsPlayer.enterFullscreen().catch(err => console.error("Vidstack enter fullscreen error:", err));
                }
            }
        });
    }

    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            const urlParamsRetry = new URLSearchParams(window.location.search);
            const videoUrlRetry = urlParamsRetry.get('url');
            const sourceCodeRetry = urlParamsRetry.get('source_code');
            const titleRetry = fullyDecode(urlParamsRetry.get('title') || currentVideoTitle); // Get title from URL or fallback

            if (videoUrlRetry) {
                const errorEl = document.getElementById('error'); if (errorEl) errorEl.style.display = 'none';
                const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'flex';

                // Re-create and setup player with new (or same) source
                createAndSetupPlayer(videoUrlRetry, titleRetry, autoplayEnabled, sourceCodeRetry);

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
    if (orderBtn) orderBtn.addEventListener('click', toggleEpisodeOrder);

    const lockButton = document.getElementById('lock-button');
    if (lockButton) lockButton.addEventListener('click', toggleLockScreen);

    // Setup double click and long press after vsPlayer is initialized
    // This needs vsPlayer to be ready. Delay slightly or ensure it's called after createAndSetupPlayer.
    // Since setupPlayerControls is called after createAndSetupPlayer via setTimeout, vsPlayer should exist.
    if (vsPlayer && vsPlayer.el) { // vsPlayer.el is the root DOM element of the player
        setupDoubleClickToPlayPause(vsPlayer, vsPlayer.el);
        setupLongPressSpeedControl(vsPlayer.el); // Pass the DOM element
    } else if (vsPlayer) { // If .el is not the way, try passing the container where player was rendered
        const playerTargetElement = document.getElementById('player');
        if (playerTargetElement && playerTargetElement.firstChild) {
            setupDoubleClickToPlayPause(vsPlayer, playerTargetElement.firstChild);
            setupLongPressSpeedControl(playerTargetElement.firstChild);
        } else {
            console.warn("Vidstack player element not found for gesture setup.");
        }
    }
}

function saveVideoSpecificProgress() {
    if (isNavigatingToEpisode) return;
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle || !toggle.checked) return;

    if (!vsPlayer || typeof vsPlayer.currentTime !== 'number' || typeof currentVideoTitle === 'undefined' || typeof currentEpisodeIndex !== 'number' || !currentEpisodes || currentEpisodes.length === 0) {
        return;
    }

    const currentTime = Math.floor(vsPlayer.currentTime);
    const duration = Math.floor(vsPlayer.duration);
    const sourceCodeFromUrl = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';
    const videoSpecificId = `${currentVideoTitle}_${sourceCodeFromUrl}`;

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.95) {
        try {
            let allVideosProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            if (!allVideosProgresses[videoSpecificId]) {
                allVideosProgresses[videoSpecificId] = {};
            }
            allVideosProgresses[videoSpecificId][currentEpisodeIndex.toString()] = currentTime;
            allVideosProgresses[videoSpecificId].lastPlayedEpisodeIndex = currentEpisodeIndex;
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allVideosProgresses));
        } catch (e) {
            console.error('保存特定视频集数进度失败:', e);
        }
    }
}

function clearCurrentVideoSpecificEpisodeProgresses() { // This function seems unused, keeping it for now.
    if (typeof currentVideoTitle === 'undefined' || !currentEpisodes || currentEpisodes.length === 0) {
        return;
    }
    const sourceCodeFromUrl = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';
    const videoId = `${currentVideoTitle}_${sourceCodeFromUrl}`;
    try {
        let allVideoProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        if (allVideoProgresses[videoId]) {
            delete allVideoProgresses[videoId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allVideoProgresses));
            if (typeof showMessage === 'function') showMessage(`已清除《${currentVideoTitle}》的各集播放进度`, 'info');
            else if (typeof showToast === 'function') showToast(`已清除《${currentVideoTitle}》的各集播放进度`, 'info');
        }
    } catch (e) {
        console.error('清除特定视频集数进度失败:', e);
    }
}

function showError(message) {
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    // vsPlayer might be null if creation failed
    if (vsPlayer && typeof vsPlayer.currentTime === 'number' && vsPlayer.currentTime > 1 && !debugMode) {
        console.warn('Ignoring error as video is playing (Vidstack):', message);
        return;
    }
    const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold');
        if (errorTextElement) errorTextElement.textContent = message;
        else if (errorElement.children[1]) errorElement.children[1].textContent = message;
        errorElement.style.display = 'flex';
    }
    // Use local showMessage first, then global if available from ui.js
    if (typeof showMessage === 'function' && showMessage.name === 'showMessage') { // check if it's the local one
        showMessage(message, 'error');
    } else if (typeof window.showMessage === 'function') { // from ui.js
        window.showMessage(message, 'error');
    } else {
        console.error("showMessage function not found. Error:", message);
    }
}

// setupProgressBarPreciseClicks, handleProgressBarClick, handleProgressBarTouch are removed.

function handleKeyboardShortcuts(e) {
      // 输入框/文本域中不要拦截
  const active = document.activeElement?.tagName;
  if (active === 'INPUT' || active === 'TEXTAREA') return;
        if (!vsPlayer) return;
    if (isScreenLocked) return;
    let actionText = '', direction = '';
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    switch (e.key.toLowerCase()) {
        case 'arrowleft':
            if (e.altKey) { if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { vsPlayer.currentTime = Math.max(0, vsPlayer.currentTime - 5); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'arrowright':
            if (e.altKey) { if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { vsPlayer.currentTime = Math.min(vsPlayer.duration, vsPlayer.currentTime + 5); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'pageup': if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'pagedown': if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case ' ': // Spacebar for play/pause
            if (vsPlayer.paused) vsPlayer.play(); else vsPlayer.pause();
            actionText = vsPlayer.paused ? '播放' : '暂停';
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'arrowup':
            vsPlayer.volume = Math.min(1, vsPlayer.volume + 0.1);
            actionText = `音量 ${Math.round(vsPlayer.volume * 100)}%`;
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'arrowdown':
            vsPlayer.volume = Math.max(0, vsPlayer.volume - 0.1);
            actionText = `音量 ${Math.round(vsPlayer.volume * 100)}%`;
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'f':
            if (vsPlayer.fullscreen.active) vsPlayer.exitFullscreen(); else vsPlayer.enterFullscreen();
            actionText = '切换全屏';
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
    }
    if (actionText && typeof showShortcutHint === 'function') showShortcutHint(actionText, direction);
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
        else keyElement.innerHTML = '';
        actionElement.textContent = text;
    }
    hintElement.classList.add('show');
    shortcutHintTimeout = setTimeout(() => hintElement.classList.remove('show'), 1500);
}


/**
 * 设置双击播放/暂停功能
 * @param {object} playerInstance Vidstack Player 实例
 * @param {HTMLElement} targetElement 监听双击的HTML元素 (通常是 playerInstance.el)
 */
function setupDoubleClickToPlayPause(playerInstance, targetElement) {
    if (!playerInstance || !targetElement) {
        console.warn('[DoubleClick] Vidstack player instance or target element not provided for double tap.');
        return;
    }

    if (targetElement._doubleTapListenerAttached) return;

    targetElement.addEventListener('touchend', function (e) {
        if (isScreenLocked) return;

        // Vidstack layouts often have specific class names for controls.
        // This checks if the tap was on something that looks like a control.
        let tappedOnControl = false;
        if (e.target.closest('media-controls') ||
            e.target.closest('media-button') ||
            e.target.closest('media-slider') ||
            e.target.closest('[role="toolbar"]') ||
            e.target.closest('#episode-grid button')) {
            tappedOnControl = true;
        }


        if (tappedOnControl) {
            lastTapTimeForDoubleTap = 0;
            return;
        }

        const currentTime = new Date().getTime();
        if ((currentTime - lastTapTimeForDoubleTap) < DOUBLE_TAP_INTERVAL) {
            if (playerInstance.paused) playerInstance.play(); else playerInstance.pause();
            lastTapTimeForDoubleTap = 0;
        } else {
            lastTapTimeForDoubleTap = currentTime;
        }
        // Vidstack's default layout handles showing/hiding controls on tap.
        // Avoid e.preventDefault() unless specifically needed.
    }, { passive: true });

    targetElement._doubleTapListenerAttached = true;
}

/**
 * 设置长按右半边屏幕快进功能
 * @param {HTMLElement} targetElement 监听长按的HTML元素 (playerInstance.el)
 */
function setupLongPressSpeedControl(targetElement) {
    if (!targetElement) {
        console.warn('Vidstack player element for long press not found.');
        return;
    }

    let longPressTimer = null;
    let originalPlaybackRate = 1.0;
    let speedChangedByLongPress = false;

    targetElement.addEventListener('touchstart', function (e) {
        if (isScreenLocked || !vsPlayer) return; // Check global vsPlayer

        const touchX = e.touches[0].clientX;
        // Ensure targetElement is valid for getBoundingClientRect
        if (!targetElement.getBoundingClientRect) return;
        const rect = targetElement.getBoundingClientRect();

        if (touchX > rect.left + rect.width / 2) { // Right half
            originalPlaybackRate = vsPlayer.playbackRate;
            if (longPressTimer) clearTimeout(longPressTimer);
            speedChangedByLongPress = false;

            longPressTimer = setTimeout(() => {
                if (isScreenLocked || !vsPlayer || vsPlayer.paused) {
                    speedChangedByLongPress = false;
                    return;
                }
                vsPlayer.playbackRate = 2.0;
                speedChangedByLongPress = true;
                if (typeof showMessage === 'function') showMessage('播放速度: 2.0x', 'info', 1000);
                else if (typeof showToast === 'function') showToast('播放速度: 2.0x', 'info', 1000);

            }, 300); // 300ms for long press
        } else { // Left half
            if (longPressTimer) clearTimeout(longPressTimer);
            speedChangedByLongPress = false;
        }
    }, { passive: true });

    const endLongPress = function () {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;

        if (speedChangedByLongPress && vsPlayer) {
            vsPlayer.playbackRate = originalPlaybackRate;
            if (typeof showMessage === 'function') showMessage(`播放速度: ${originalPlaybackRate.toFixed(1)}x`, 'info', 1000);
            else if (typeof showToast === 'function') showToast(`播放速度: ${originalPlaybackRate.toFixed(1)}x`, 'info', 1000);
        }
        speedChangedByLongPress = false;
    };

    targetElement.addEventListener('touchend', endLongPress);
    targetElement.addEventListener('touchcancel', endLongPress);

    // Context menu prevention (already in disableContextMenuDeep, but this one is simpler for right half only)
    if (!targetElement._customContextMenuListenerAttached) {
        targetElement.addEventListener('contextmenu', function (e) {
            if (!isMobile() || !vsPlayer) return;
            if (!targetElement.getBoundingClientRect) return;
            const rect = targetElement.getBoundingClientRect();
            if (e.clientX > rect.left + rect.width / 2) { // Right half on mobile
                e.preventDefault();
            }
        });
        targetElement._customContextMenuListenerAttached = true;
    }
}


// Local showMessage definition. If ui.js also has one, ensure no conflict or decide which to use.
// This one is specific to player_app.js notifications if needed.
function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message'); // Assuming 'message' is the ID of your notification element
    if (!messageElement) {
        // Fallback to alert if custom message element isn't found
        console.warn("Message element with ID 'message' not found. Using alert(). Text:", text);
        alert(`[${type.toUpperCase()}] ${text}`);
        return;
    }

    let bgColorClass = 'bg-blue-500'; // Default for info
    if (type === 'error') bgColorClass = 'bg-red-500';
    else if (type === 'success') bgColorClass = 'bg-green-500';
    else if (type === 'warning') bgColorClass = 'bg-yellow-500';

    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg text-white transition-opacity duration-300 opacity-0 ${bgColorClass} z-[10001] text-sm`;
    messageElement.textContent = text;
    messageElement.classList.remove('hidden'); // Ensure it's not display:none

    // Force reflow to apply initial opacity-0 before transitioning
    void messageElement.offsetWidth;

    messageElement.classList.remove('opacity-0');
    messageElement.classList.add('opacity-100');

    if (messageElement._messageTimeout) {
        clearTimeout(messageElement._messageTimeout);
    }

    messageElement._messageTimeout = setTimeout(() => {
        messageElement.classList.remove('opacity-100');
        messageElement.classList.add('opacity-0');
        // Optionally hide it completely after transition
        // setTimeout(() => messageElement.classList.add('hidden'), 300); 
        messageElement._messageTimeout = null;
    }, duration);
}


function toggleLockScreen() {
    isScreenLocked = !isScreenLocked;
    const playerContainer = document.querySelector('.player-container');
    const lockButton = document.getElementById('lock-button');

    /* ---------- ① 透明遮罩 ---------- */
    let overlay = document.getElementById('lock-overlay');
    if (isScreenLocked && !overlay) {
        overlay = document.createElement('div');
        overlay.id = 'lock-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '2147483646',         // 略低于锁屏按钮 (3647)
            background: 'transparent',   // 不挡住画面
            pointerEvents: 'auto'        // 拦截点击/滑动
        });
        /* 避免长按呼出系统菜单 */
        overlay.addEventListener('contextmenu', e => e.preventDefault());
        playerContainer?.appendChild(overlay);
    } else if (!isScreenLocked && overlay) {
        overlay.remove();
    }

    if (playerContainer) {
        playerContainer.classList.toggle('player-locked', isScreenLocked);
    }

    if (lockButton) {
        if (isScreenLocked) {
            lockButton.innerHTML = `<svg id="lock-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
            lockButton.setAttribute('aria-label', '解锁屏幕');
            (window.showMessage ?? window.showToast)('屏幕已锁定', 'info');
        } else {
            lockButton.innerHTML = `<svg id="lock-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
            lockButton.setAttribute('aria-label', '锁定屏幕');
            (window.showMessage ?? window.showToast)('屏幕已解锁', 'info');
        }
    }
}

function renderEpisodes() {
    const grid = document.getElementById('episode-grid');
    if (!grid) { setTimeout(renderEpisodes, 100); return; }
    const container = document.getElementById('episodes-container');
    if (container) {
        if (currentEpisodes.length > 1) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    }

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
        btn.className = idx === currentEpisodeIndex
            ? 'p-2 rounded episode-active'
            : 'p-2 rounded bg-[#222] hover:bg-[#333] text-gray-300';
        btn.textContent = idx + 1;
        btn.dataset.index = idx;
        grid.appendChild(btn);
    });

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

    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        const totalEpisodes = window.currentEpisodes.length;
        const currentDisplayNumber = window.currentEpisodeIndex + 1;
        episodeInfoSpan.textContent = `第 ${currentDisplayNumber} / ${totalEpisodes} 集`;
        const episodesCountEl = document.getElementById('episodes-count');
        if (episodesCountEl) {
            episodesCountEl.textContent = `共 ${totalEpisodes} 集`;
        }
    } else {
        episodeInfoSpan.textContent = '';
    }
}

function copyLinks() {
    const currentUrlFromParams = new URLSearchParams(window.location.search).get('url');
    // vsPlayer.source for current src object, vsPlayer.source.src for URL string
    const playerSrcUrl = vsPlayer?.src || vsPlayer?.currentSrc || '';
    const linkUrl = currentUrlFromParams || playerSrcUrl || '';

    if (!linkUrl) {
        if (typeof showMessage === 'function') showMessage('没有可复制的视频链接', 'warning');
        else if (typeof showToast === 'function') showToast('没有可复制的视频链接', 'warning');
        else alert('没有可复制的视频链接');
        return;
    }

    navigator.clipboard.writeText(linkUrl).then(() => {
        if (typeof showMessage === 'function') showMessage('当前视频链接已复制', 'success');
        else if (typeof showToast === 'function') showToast('当前视频链接已复制', 'success');
        else alert('当前视频链接已复制');
    }).catch(err => {
        console.error('复制链接失败:', err);
        if (typeof showMessage === 'function') showMessage('复制失败，请检查浏览器权限', 'error');
        else if (typeof showToast === 'function') showToast('复制失败，请检查浏览器权限', 'error');
        else alert('复制失败');
    });
}
window.copyLinks = copyLinks;

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    updateOrderButton();
    renderEpisodes();
}

function updateOrderButton() {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    icon.innerHTML = episodesReversed
        ? '<polyline points="18 15 12 9 6 15"></polyline>'
        : '<polyline points="6 9 12 15 18 9"></polyline>';
}

function playPreviousEpisode() {
    if (!currentEpisodes.length) return;
    const prevIdx = currentEpisodeIndex - 1;
    if (prevIdx >= 0) {
        playEpisode(prevIdx);
    } else {
        if (typeof showMessage === 'function') showMessage('已经是第一集了', 'info');
        else if (typeof showToast === 'function') showToast('已经是第一集了', 'info');
    }
}
window.playPreviousEpisode = playPreviousEpisode;

function playNextEpisode() {
    if (!currentEpisodes.length) return;
    const nextIdx = currentEpisodeIndex + 1;
    if (nextIdx < currentEpisodes.length) {
        playEpisode(nextIdx);
    } else {
        if (typeof showMessage === 'function') showMessage('已经是最后一集了', 'info');
        else if (typeof showToast === 'function') showToast('已经是最后一集了', 'info');
    }
}
window.playNextEpisode = playNextEpisode;

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

function saveCurrentProgress() {
    if (!vsPlayer || typeof vsPlayer.currentTime !== 'number' || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = vsPlayer.currentTime;
    const duration = vsPlayer.duration;

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) {
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: currentEpisodes[currentEpisodeIndex],
                episodeIndex: window.currentEpisodeIndex,
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                sourceName: new URLSearchParams(window.location.search).get('source') || '',
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || '',
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
        saveCurrentProgress();
        saveVideoSpecificProgress();
    }, 8000);
}

function saveToHistory() {
    if (!vsPlayer || typeof vsPlayer.currentTime !== 'number' || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: currentEpisodes[currentEpisodeIndex],
            episodeIndex: currentEpisodeIndex,
            episodes: currentEpisodes,
            playbackPosition: Math.floor(vsPlayer.currentTime),
            duration: Math.floor(vsPlayer.duration) || 0,
            timestamp: Date.now(),
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || ''
        };
        window.addToViewingHistory(videoInfo);
    } catch (e) {
        console.error('保存到历史记录失败:', e);
    }
}

function clearVideoProgress() {
    const progressKey = `videoProgress_${getVideoId()}`; // getVideoId needs to be defined or logic inlined
    try {
        localStorage.removeItem(progressKey);
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('已清除 localStorage 播放进度记录 for ' + progressKey);
    } catch (e) { console.error('清除 localStorage 播放进度记录失败', e); }
}

function getVideoId() { // Ensure this is used consistently if clearVideoProgress is important
    const sourceCode = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source_code'; // Ensure a fallback
    return `${encodeURIComponent(currentVideoTitle)}_${sourceCode}_ep${window.currentEpisodeIndex}`;
}

function playEpisode(index) {
    if (!vsPlayer) {
        if (typeof showError === 'function') showError("播放器遇到问题，无法切换。");
        return;
    }
    if (!currentEpisodes || index < 0 || index >= currentEpisodes.length) {
        if (typeof showError === 'function') showError("无效的剧集选择。");
        return;
    }
    // Removed: if (isNavigatingToEpisode && currentEpisodeIndex === index) return;
    // Allow re-clicking current episode if needed, e.g., to restart with/without progress prompt.

    if (vsPlayer && typeof vsPlayer.currentTime === 'number' && vsPlayer.currentTime > 5 && currentEpisodes[currentEpisodeIndex]) {
        saveVideoSpecificProgress(); // Save progress of the outgoing episode
    }

    isNavigatingToEpisode = true; // Set before async operations

    const oldEpisodeIndexForRevertOnError = currentEpisodeIndex;
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;
    const newEpisodeUrl = proxifyUrl(currentEpisodes[index], adFilteringEnabled);

    if (!newEpisodeUrl || typeof newEpisodeUrl !== 'string' || !newEpisodeUrl.trim()) {
        currentEpisodeIndex = oldEpisodeIndexForRevertOnError; // Revert
        window.currentEpisodeIndex = oldEpisodeIndexForRevertOnError;
        isNavigatingToEpisode = false;
        if (typeof showError === 'function') showError("此剧集链接无效，无法播放。");
        return;
    }

    nextSeekPosition = 0; // Reset for the new episode by default
    if (shouldRestoreSpecificProgress) {
        const sourceCodeFromUrl = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';
        const videoSpecificIdForRestore = `${currentVideoTitle}_${sourceCodeFromUrl}`;
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressDataForVideo = allSpecificProgresses[videoSpecificIdForRestore];

        if (savedProgressDataForVideo) {
            const positionToResume = savedProgressDataForVideo[index.toString()] ? parseInt(savedProgressDataForVideo[index.toString()]) : 0;
            if (positionToResume > 5) { // Only prompt if significant progress exists
                showProgressRestoreModal({
                    title: "继续播放？",
                    content: `《${currentVideoTitle}》第 ${index + 1} 集有播放记录，<br>是否从 <span style="color:#00ccff">${formatPlayerTime(positionToResume)}</span> 继续播放？`,
                    confirmText: "继续播放",
                    cancelText: "从头播放"
                }).then(wantsToResume => {
                    if (wantsToResume) {
                        nextSeekPosition = positionToResume;
                    } else {
                        nextSeekPosition = 0; // User chose to play from start
                    }
                    // Proceed to switch after modal closes
                    doEpisodeSwitch(index, newEpisodeUrl, nextSeekPosition);
                });
                return; // Wait for modal
            }
        }
    }
    // No progress to restore or user didn't want to, switch directly
    doEpisodeSwitch(index, newEpisodeUrl, 0); // nextSeekPosition is 0
}

// Actual episode switching logic
function doEpisodeSwitch(index, url, seekToPosition) {
    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index;

    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;
    if (typeof updateEpisodeInfo === 'function') updateEpisodeInfo();
    if (typeof renderEpisodes === 'function') renderEpisodes(); // Re-render to highlight active episode
    if (typeof updateButtonStates === 'function') updateButtonStates();

    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        const loadingTextEl = loadingEl.querySelector('div:not(.loading-spinner)');
        if (loadingTextEl) loadingTextEl.textContent = '正在加载剧集...';
        loadingEl.style.display = 'flex';
        document.documentElement.classList.add('show-loading');
    }
    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'none';

    if (vsPlayer) {
        vsPlayer.pause(); // Pause before changing source
        vsPlayer.src = url;
        nextSeekPosition = seekToPosition; // Store for 'can-play' event
        videoHasEnded = false; // Reset for the new episode

        // Update browser URL
        const newUrlForBrowser = new URL(window.location.href);
        newUrlForBrowser.searchParams.set('url', encodeURIComponent(url));
        newUrlForBrowser.searchParams.set('title', currentVideoTitle); // Ensure title is in URL
        newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());
        const currentSourceCode = new URLSearchParams(window.location.search).get('source_code');
        if (currentSourceCode) newUrlForBrowser.searchParams.set('source_code', currentSourceCode);

        // adFilteringEnabled is global, should reflect current state
        newUrlForBrowser.searchParams.set('af', adFilteringEnabled ? '1' : '0');

        if (seekToPosition > 0) {
            newUrlForBrowser.searchParams.set('position', seekToPosition.toString());
        } else {
            newUrlForBrowser.searchParams.delete('position');
        }

        window.history.pushState(
            { path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex },
            '',
            newUrlForBrowser.toString()
        );
        // isNavigatingToEpisode will be reset to false in 'can-play'
    } else {
        isNavigatingToEpisode = false; // Reset if no player
    }
}
window.playEpisode = playEpisode; // Expose globally