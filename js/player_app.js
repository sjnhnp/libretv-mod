// File: js/player_app.js

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

    console.warn('[Vidstack Migration] patchAndroidVideoHack needs review. Vidstack handles many aspects differently.');
    if (!element || !element.el) return; // Check for Vidstack player element
    const videoElement = element.el.querySelector('video');
    if (videoElement) {
        videoElement.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, { passive: false });
        // Vidstack player element handles playsinline. controlsList might be set via attributes or HLS.js/Dash.js config.
        videoElement.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback'); // Example, review necessity
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
            // 解绑事件, 避免内存泄漏
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
        setTimeout(() => btnConfirm.focus(), 120); // 自动聚焦确定
        document.addEventListener("keydown", handler);

        modal.classList.add("active");
        document.body.style.overflow = "hidden"; // 防止弹窗时页面滚动
    });
}

// --- 模块内变量 ---
let isNavigatingToEpisode = false;   // 正在换集时置 true，避免误保存
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = localStorage.getItem('episodesReversed') === 'true'; // Initialize from localStorage
let vsPlayer = null; // Vidstack Player instance (the <media-player> HTML element)
// let currentHls = null; // HLS.js instance will be managed by Vidstack's HLS provider or configured within it.
let autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false'; // Initialize from localStorage

let isUserSeeking = false;
let videoHasEnded = false;
let userClickedPosition = null;
let shortcutHintTimeout = null;
let progressSaveInterval = null;
let isScreenLocked = false;
let nextSeekPosition = 0; // Stores the position to seek to for the next episode
// let _tempUrlForCustomHls = ''; // Temporary holder for the URL if DPlayer options are stale in customType
let lastTapTimeForDoubleTap = 0;

const DOUBLE_TAP_INTERVAL = 300; // 双击的最大时间间隔 (毫秒)

const REMEMBER_EPISODE_PROGRESS_ENABLED_KEY = 'playerRememberEpisodeProgressEnabled'; // 开关状态的键名
const VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY = 'videoSpecificEpisodeProgresses'; // 各视频各集进度的键名

// ==== 广告分片起止标记 ====
const AD_START_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="ad"/i,
    /#EXT-X-SCTE35-OUT/i,
    /#EXTINF:[\d.]+,\s*ad/i,
];
const AD_END_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="content"/i,
    /#EXT-X-SCTE35-IN/i,
    /#EXT-X-DISCONTINUITY/i,   // 保险：有些源用 DISCONTINUITY 结束广告
];

// ==== 全局开关：是否去广告（缺省 true，可被 config.js 覆盖） ====
let adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled !== false; // Default to true if not specified

function isMobile() {
    return /Mobile|Tablet|iPod|iPhone|iPad|Android|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}

// 辅助函数：格式化时间)
function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 将需要在 player_preload.js 中访问的变量挂载到 window
window.currentEpisodes = [];
window.currentEpisodeIndex = 0;
// window.PLAYER_CONFIG is set by config.js
// window.dp will be set after DPlayer initialization
// window.playEpisode will be set later

/**
 * 关闭“记住进度”时，清除当前视频在 localStorage 中保存的所有集数进度
 */
function clearCurrentVideoAllEpisodeProgresses() {
    try {
        // 取出本地所有已保存的视频进度数据
        const all = JSON.parse(
            localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || "{}"
        );

        const sourceCode = new URLSearchParams(window.location.search)
            .get("source_code") || "unknown_source";
        const videoId = `${currentVideoTitle}_${sourceCode}`;

        // 如果存在该视频的进度记录，则删除
        if (all[videoId]) {
            delete all[videoId];
            localStorage.setItem(
                VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY,
                JSON.stringify(all)
            );

            // 给用户一个清除成功的提示
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

    // 1. 从 localStorage 初始化开关状态
    const savedSetting = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY);
    if (savedSetting !== null) {
        toggle.checked = savedSetting === 'true';
    } else {
        toggle.checked = true; // 默认开启
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, 'true');
    }

    // 2. 监听开关变化，并保存到 localStorage
    toggle.addEventListener('change', function (event) {
        const isChecked = event.target.checked;
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, isChecked.toString());
        if (typeof showToast === 'function') { // 确保 showToast 可用
            const messageText = isChecked ? '将记住本视频的各集播放进度' : '将不再记住本视频的各集播放进度';
            if (typeof window.showMessage === 'function') { // 优先用 player_app.js 内的
                window.showMessage(messageText, 'info');
            } else if (typeof window.showToast === 'function') { // 备用 ui.js 的
                window.showToast(messageText, 'info');
            }
        }
        // (可选逻辑) 如果用户关闭功能，是否清除当前视频已保存的特定进度？
        if (!isChecked) {
            clearCurrentVideoAllEpisodeProgresses(); // 需要实现此函数
        }
    });
}

// In js/player_app.js
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
        loadingEl.style.display = 'flex';              // 原来的
        document.documentElement.classList.add('show-loading'); // ← 新增
    }
    initializePageContent();
});

function initializePageContent() {
    if (!testLocalStorageAvailable()) {
        showMessage('当前浏览器本地存储不可用，播放进度记忆将失效', 'warning');
    }
    //  console.log('[PlayerApp Debug] initializePageContent starting...');
    const urlParams = new URLSearchParams(window.location.search);
    let episodeUrlForPlayer = urlParams.get('url'); // 先用 let，后续可能修改
    let title = urlParams.get('title');
    // 把可能的多层编码全部拆掉
    function fullyDecode(str) {
        try {
            let prev, cur = str;
            do { prev = cur; cur = decodeURIComponent(cur); } while (cur !== prev);
            return cur;
        } catch { return str; }   // 遇到非法编码就放弃
    }
    title = title ? fullyDecode(title) : '';
    const sourceCodeFromUrl = urlParams.get('source_code'); // 重命名以区分

    // 兼容旧链接里的 ep=
    let index = parseInt(
        urlParams.get('index') || urlParams.get('ep') || '0',
        10
    );
    let indexForPlayer = index; // 先用 let，后续可能修改

    // 先用 URL⟨episodes=⟩ → 再退回 localStorage（双保险）
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
                //  console.log("[PlayerApp] Episodes loaded from URL parameter.");
            } catch (e) {
                console.warn("[PlayerApp] Failed to parse episodes from URL, falling back to localStorage.", e);
                currentEpisodes = episodesSource ? JSON.parse(episodesSource) : [];
            }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
            //  console.log("[PlayerApp] Episodes loaded from localStorage.");
        } else {
            currentEpisodes = [];
            //  console.log("[PlayerApp] No episode data found in URL or localStorage.");
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
        // currentEpisodeIndex 的最终值将在进度恢复逻辑后确定
        indexForPlayer = index; // indexForPlayer 将持有用户最初意图的集数
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
        indexForPlayer = 0; // 如果出错，默认第一集
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

    // --- 新增：记住进度开关初始化及进度恢复逻辑 ---
    setupRememberEpisodeProgressToggle(); // 初始化开关状态和事件监听

    // 新进度分支代码，直接替换你 initializePageContent 里判断播放进度和episodeUrlForPlayer、indexForPlayer的那大段 if/else！

    const positionFromUrl = urlParams.get('position');
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;

    if (positionFromUrl) {
        // ★1. 只要有position参数（即从历史进度跳转），强制用url和index
        episodeUrlForPlayer = urlParams.get('url');
        indexForPlayer = parseInt(urlParams.get('index') || '0', 10);
        // ---------- 下面是弹窗断点逻辑（你的原有弹窗代码完整贴入这里，结构无须再裁剪/再分支）----------
    } else if (shouldRestoreSpecificProgress && currentEpisodes.length > 0) {
        const sourceCodeFromUrl = urlParams.get('source_code');
        const videoSpecificIdForRestore = `${currentVideoTitle}_${sourceCodeFromUrl}`;
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressData = allSpecificProgresses[videoSpecificIdForRestore];

        if (savedProgressData) {
            // ① 决定“要不要提示进度”
            const resumeIndex = indexForPlayer; // ← 统一使用这个
            const positionToResume =
                savedProgressData[resumeIndex.toString()]
                    ? parseInt(savedProgressData[resumeIndex.toString()])
                    : 0;

            // ② 如果 URL *没* 带 index（多半是直接点“继续播放”进入播放器），
            if ((!urlParams.has('index') || urlParams.get('index') === null)
                && typeof savedProgressData.lastPlayedEpisodeIndex === 'number'
                && savedProgressData.lastPlayedEpisodeIndex >= 0
                && savedProgressData.lastPlayedEpisodeIndex < currentEpisodes.length) {
                indexForPlayer = savedProgressData.lastPlayedEpisodeIndex;
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
                        window.history.replaceState({}, '', newUrl.toString());

                        if (typeof window.showMessage === 'function') {
                            window.showMessage(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                        } else if (typeof window.showToast === 'function') {
                            window.showToast(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                        }
                    } else {
                        episodeUrlForPlayer = currentEpisodes[indexForPlayer];
                        // indexForPlayer 保持不变

                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('url', episodeUrlForPlayer);
                        newUrl.searchParams.set('index', indexForPlayer.toString());
                        newUrl.searchParams.delete('position');
                        window.history.replaceState({}, '', newUrl.toString());

                        if (typeof window.showMessage === 'function') {
                            window.showMessage('已从头开始播放', 'info');
                        } else if (typeof window.showToast === 'function') {
                            window.showToast('已从头开始播放', 'info');
                        }
                    }
                    // ★ 弹窗回调里，直接重新初始化（再次走此流程就不会再弹窗）
                    initializePageContent();
                });
                return; // 不再往下执行
            } else {
                // 没有有效进度，或进度太短，播放用户从首页选择的
                episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
            }
        } else {
            // 该视频没有任何保存的集数进度
            episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
        }
        // ---------- 弹窗断点逻辑结束 ----------

    } else {
        episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
    }

    // --- 最终确定要播放的集数和URL ---
    currentEpisodeIndex = indexForPlayer; // 最终确定全局的当前集数索引
    window.currentEpisodeIndex = currentEpisodeIndex;
    if (currentEpisodes.length > 0 && (!episodeUrlForPlayer || !currentEpisodes.includes(episodeUrlForPlayer))) {
        episodeUrlForPlayer = currentEpisodes[currentEpisodeIndex]; // 再次确保播放的URL是正确的
        if (episodeUrlForPlayer) { // 如果从 currentEpisodes 成功获取，更新URL参数
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('url', episodeUrlForPlayer);
            window.history.replaceState({}, '', newUrl.toString());
        }
    }

    // --- 更新页面标题和视频标题元素 ---
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;

    if (episodeUrlForPlayer) {
        initPlayer(episodeUrlForPlayer, sourceCodeFromUrl); // 使用 sourceCodeFromUrl
        const finalUrlParams = new URLSearchParams(window.location.search); // 获取可能已更新的URL参数
        const positionToSeekFromUrl = finalUrlParams.get('position'); // Renamed for clarity

        if (positionToSeekFromUrl) {
            nextSeekPosition = parseInt(positionToSeekFromUrl, 10);
        }
    } else { // 这个 else 与 if (episodeUrlForPlayer) 配对
        showError('无效的视频链接');
    } // 这个 '}' 是 if (episodeUrlForPlayer) {...} else {...} 语句块的结束


    updateEpisodeInfo();
    // Use requestAnimationFrame for initial render to ensure DOM is ready
    requestAnimationFrame(() => {
        renderEpisodes();
    });
    updateButtonStates();
    updateOrderButton();
    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000); // Delay progress bar setup slightly

    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', function () {
        saveCurrentProgress();
        saveVideoSpecificProgress();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
            saveVideoSpecificProgress(); // 补充：隐藏时也保存特定进度

        }
    });

    // Ensure critical functions from ui.js are globally available
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

    // Bind custom control buttons after a slight delay
    setTimeout(setupPlayerControls, 100);
}

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
        if ((ctx.type === 'manifest' || ctx.type === 'level') && window.PLAYER_CONFIG?.adFilteringEnabled !== false) {
            const orig = cbs.onSuccess;
            cbs.onSuccess = (r, s, ctx2) => { r.data = EnhancedAdFilterLoader.strip(r.data); orig(r, s, ctx2); };
        }
        super.load(ctx, cfg, cbs);
    }
}

// --- Player Initialization ---
function initPlayer(videoUrl, sourceCode) {
    if (progressSaveInterval) clearInterval(progressSaveInterval); // 保持

    vsPlayer = document.getElementById('my-vidstack-player'); // 获取播放器元素
    if (!vsPlayer) {
        showError("播放器元素 (media-player) 未找到!");
        return;
    }
    if (!videoUrl) {
        showError("视频链接无效");
        return;
    }
    if (!Hls && videoUrl.includes('.m3u8')) {
        console.warn("HLS.js library not found. HLS playback might not work as expected if Vidstack relies on it globally.");
    }


    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;


    const hlsConfig = {
        debug: debugMode,
        // EnhancedAdFilterLoader 需要 Hls.DefaultConfig.loader，确保 Hls 对象有效
        loader: (adFilteringEnabled && Hls) ? EnhancedAdFilterLoader : (Hls ? Hls.DefaultConfig.loader : undefined),
        skipDateRanges: adFilteringEnabled,
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
        vsPlayer.src = videoUrl;
        vsPlayer.autoplay = autoplayEnabled; // 使用全局的 autoplayEnabled

        if (videoUrl.includes('.m3u8')) {
            // 推荐的 Vidstack HLS 配置方式是监听事件
            vsPlayer.addEventListener('provider-change', (event) => {
                const provider = event.detail;
                if (provider && provider.type === 'hls') {
                    // @ts-ignore - Vidstack HLS provider type might not be fully known here
                    if (typeof provider.configure === 'function') {
                        // @ts-ignore
                        provider.configure(hlsConfig);
                        console.log("[Vidstack Migration] Applied custom HLS config via provider.configure().");
                        // @ts-ignore
                    } else if (provider.instance && typeof provider.instance.config !== 'undefined') { // For direct HLS.js instance access
                        // @ts-ignore
                        Object.assign(provider.instance.config, hlsConfig); // Merge new config into existing
                        console.log("[Vidstack Migration] Applied custom HLS config via provider.instance.config.");
                    } else {
                        console.warn("[Vidstack Migration] Could not directly configure HLS provider. EnhancedAdFilterLoader may not work as expected unless HLS.js is globally pre-configured.");
                    }
                }
            }, { once: true });
        }

        const savedVolume = parseFloat(localStorage.getItem('playerVolume'));
        const savedMuted = localStorage.getItem('playerMuted') === 'true';
        if (!isNaN(savedVolume)) vsPlayer.volume = savedVolume;
        vsPlayer.muted = savedMuted;

        window.vsPlayer = vsPlayer;

        if (debugMode) console.log("[PlayerApp] Vidstack Player instance configured.");

        addVidstackEventListeners();

        if (isMobile()) {
            disableContextMenuDeep(vsPlayer);
        }

    } catch (playerError) {
        console.error("Vidstack 播放器初始化时发生错误:", playerError); // 更新错误消息
        showError("Vidstack 播放器初始化失败");
    }
}

function addVidstackEventListeners() {
    if (!vsPlayer || vsPlayer._eventListenersAttached) return; // Prevent multiple attachments

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
                fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
                fsButton.setAttribute('aria-label', '退出全屏');
            } else {
                fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
                fsButton.setAttribute('aria-label', '全屏');
            }
        }
    });

    // 'can-play' is a good event to use after media is ready for playback (metadata loaded, enough data buffered)
    vsPlayer.addEventListener('can-play', function (event) {
        const { duration, seekable, buffered } = event.detail; // Vidstack event.detail structure
        if (debugMode) console.log(`[Vidstack Event] can-play. Duration: ${duration}`);

        // 隐藏加载提示
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
            document.documentElement.classList.remove('show-loading');
        }
        videoHasEnded = false; // 为新加载的视频重置结束标记

        // 如果有精确点击进度条的功能，重新设置
        // setupProgressBarPreciseClicks(); // This needs to target Vidstack's progress bar.
        // Vidstack's <media-time-slider> handles this, or you'd re-implement for a custom bar.

        // 安全地尝试跳转（seek）到之前记住的播放位置 (nextSeekPosition)
        if (nextSeekPosition > 0 && duration > 0) {
            if (nextSeekPosition < duration) { // 确保跳转位置在视频有效时长内
                console.log(`[Vidstack] Attempting to seek to nextSeekPosition: ${nextSeekPosition}`);
                vsPlayer.currentTime = nextSeekPosition; // Seek in Vidstack
                // vsPlayer.play(); // Often desirable to play after seek if it was paused.
                if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(nextSeekPosition);
            } else {
                console.warn(`[Vidstack] nextSeekPosition (${nextSeekPosition}) is out of bounds for duration (${duration}). Not seeking.`);
            }
        } else if (nextSeekPosition > 0) {
            console.warn(`[Vidstack] nextSeekPosition (${nextSeekPosition}) present, but duration is ${duration}. Cannot seek.`);

        }
        nextSeekPosition = 0; // 无论成功与否，用后重置

        // 为新加载的剧集（在其初始状态或跳转后的状态）保存到观看历史
        if (typeof saveToHistory === 'function') {
            // console.log("[PlayerApp][loadedmetadata] 为新剧集调用 saveToHistory。");
            saveToHistory(); // 此函数应能获取到跳转（如果发生）后的当前时间
        }
        // 启动或重置周期性保存播放进度的计时器
        if (typeof startProgressSaveInterval === 'function') {
            // console.log("[PlayerApp][loadedmetadata] 调用 startProgressSaveInterval。");
            startProgressSaveInterval();
        }

        isNavigatingToEpisode = false; // 重置“正在切换剧集”的标记
        if (debugMode) console.log("[PlayerApp][loadedmetadata] isNavigatingToEpisode 已重置为 false。");

        if (vsPlayer.paused && autoplayEnabled) { // Check your custom `autoplayEnabled`
            console.log(`[Vidstack Event] can-play: Video is paused. Attempting to play due to autoplayEnabled.`);
            vsPlayer.play().catch(e => {
                console.warn("[Vidstack] Autoplay after can-play was prevented or failed:", e);
                // You might want to show a UI hint for the user to click to play
            });
        }
    });

    vsPlayer.addEventListener('error', function (event) {
        const errorDetail = event.detail; // Vidstack error event structure
        console.error("[Vidstack Event] error:", errorDetail);
        // DPlayer error check: if (dp.video && dp.video.currentTime > 1)
        if (vsPlayer.currentTime > 1 && !errorDetail.fatal) { // Allow non-fatal errors if playing for >1s
            if (debugMode) console.log('[Vidstack] Non-fatal error ignored as video was playing.', errorDetail.message);
            return;
        }
        showError(`播放器错误: ${errorDetail.message || '请检查视频源'}`);
    });


    vsPlayer.addEventListener('seeking', function () {
        if (debugMode) console.log("[Vidstack Event] seeking");
        isUserSeeking = true;
        videoHasEnded = false; // Reset ended flag when seeking
        saveVideoSpecificProgress(); // Save progress when seeking starts (iOS compatibility)
    });

    vsPlayer.addEventListener('seeked', function () {
        if (debugMode) console.log("[Vidstack Event] seeked");
        saveVideoSpecificProgress(); // Save progress when seeking ends

        if (vsPlayer.duration > 0) {
            const timeFromEnd = vsPlayer.duration - vsPlayer.currentTime;
            if (timeFromEnd < 0.3 && isUserSeeking) {
                vsPlayer.currentTime = Math.max(0, vsPlayer.currentTime - 1); // Seek back slightly
            }
        }
        setTimeout(() => { isUserSeeking = false; }, 200); // Reset seeking flag after a short delay
    });

    vsPlayer.addEventListener('pause', function () {
        if (debugMode) console.log("[Vidstack Event] pause");
        saveVideoSpecificProgress();
        // saveCurrentProgress(); 
    });

    vsPlayer.addEventListener('ended', function () {
        if (debugMode) console.log("[Vidstack Event] ended");
        videoHasEnded = true;
        saveCurrentProgress(); // Ensure final progress is saved
        clearVideoProgress(); // Clear progress for *this specific video*
        if (!autoplayEnabled) return;       // 用户关掉了自动连播
        const nextIdx = currentEpisodeIndex + 1;   // 始终 +1（上一条回复已统一）
        if (nextIdx < currentEpisodes.length) {
            setTimeout(() => {
                // 再确认一下确实播完 & 没有人在拖动
                if (videoHasEnded && !isUserSeeking && vsPlayer && vsPlayer.ended) playEpisode(nextIdx); // Ensure player state reflects ended
            }, 1000);                       // 1 s 延迟，防误触
        } else {
            if (debugMode) console.log('[PlayerApp] 已到最后一集，自动连播停止');
        }
    });

    vsPlayer.addEventListener('time-update', function (event) {
        const currentTime = event.detail.currentTime;
        const duration = event.detail.duration;
        if (duration > 0) {
            if (isUserSeeking && currentTime > duration * 0.95) {
                videoHasEnded = false;
            }
        }
    });

    // Loading timeout message
    setTimeout(function () {
        if (vsPlayer && vsPlayer.readyState < 3 && !videoHasEnded && !vsPlayer.playing) {
            const loadingEl = document.getElementById('loading');
            if (loadingEl && loadingEl.style.display !== 'none') {
                loadingEl.innerHTML = `<div class="loading-spinner"></div><div>视频加载时间较长...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源或刷新</div>`;
                if (debugMode) console.warn("[PlayerApp] Loading timeout reached.");
            }
        }
    }, 15000); // Increased timeout to 15s
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
                if (vsPlayer.fullscreen.active) {
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
            if (videoUrlRetry) {
                const errorEl = document.getElementById('error'); if (errorEl) errorEl.style.display = 'none';
                const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'flex';
                if (vsPlayer) {
                    console.log("[Vidstack] Retrying: Setting new src.");
                    vsPlayer.src = videoUrlRetry; // Vidstack handles source changes by setting src
                    vsPlayer.play().catch(e => console.warn("Play on retry failed:", e));
                } else {
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
    if (isNavigatingToEpisode) return;   // ← 跳过 beforeunload 那次调用
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle || !toggle.checked) { // 如果开关未勾选，则不保存
        return;
    }

    if (!vsPlayer || typeof vsPlayer.currentTime !== 'number' || typeof currentVideoTitle === 'undefined' || typeof currentEpisodeIndex !== 'number' || !currentEpisodes || currentEpisodes.length === 0) {
        return;
    }

    const currentTime = Math.floor(vsPlayer.currentTime);
    const duration = Math.floor(vsPlayer.duration);
    const sourceCodeFromUrl = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';

    const videoSpecificId = `${currentVideoTitle}_${sourceCodeFromUrl}`;

    // 仅当播放进度有意义时才保存 (例如，播放超过5秒，且未播放到接近末尾)
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.95) {
        try {
            let allVideosProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');

            if (!allVideosProgresses[videoSpecificId]) {
                allVideosProgresses[videoSpecificId] = {};
            }
            // 保存当前集数的进度
            allVideosProgresses[videoSpecificId][currentEpisodeIndex.toString()] = currentTime;
            // 记录这个视频最后播放到哪一集
            allVideosProgresses[videoSpecificId].lastPlayedEpisodeIndex = currentEpisodeIndex;
            // (可选) 记录总集数，方便后续判断
            // allVideosProgresses[videoSpecificId].totalEpisodes = currentEpisodes.length; 

            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allVideosProgresses));

        } catch (e) {
            console.error('保存特定视频集数进度失败:', e);
        }
    }
}

// （可选）用于在关闭“记住进度”时清除当前视频的集数进度
function clearCurrentVideoSpecificEpisodeProgresses() {
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
    if (vsPlayer && typeof vsPlayer.currentTime === 'number' && vsPlayer.currentTime > 1 && !debugMode) {
        console.warn('Ignoring error as video is playing (Vidstack):', message);
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
    if (typeof window.showMessage === 'function') window.showMessage(message, 'error'); // Use global showMessage from ui.js
    else console.error("showMessage function not found. Error:", message);
}

function setupProgressBarPreciseClicks() {
    if (!vsPlayer) return;
    console.warn("[Vidstack Migration] setupProgressBarPreciseClicks needs to be adapted for Vidstack's progress bar element or custom bar.");
}

function handleProgressBarClick(e) {
    if (!vsPlayer || vsPlayer.duration <= 0 || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const clickTime = percentage * vsPlayer.duration;
    userClickedPosition = clickTime;
    vsPlayer.currentTime = clickTime;
}

function handleProgressBarTouch(e) {
    if (!vsPlayer || vsPlayer.duration <= 0 || !e.changedTouches || !e.changedTouches[0] || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const offsetX = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const touchTime = percentage * vsPlayer.duration;
    userClickedPosition = touchTime;
    vsPlayer.currentTime = touchTime;
}

function handleKeyboardShortcuts(e) {
    if (!vsPlayer || (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))) return;
    if (isScreenLocked) return; // Ignore shortcuts if screen is locked
    let actionText = '', direction = '';
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    switch (e.key) {
        case 'ArrowLeft':
            if (e.altKey) { if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { vsPlayer.currentTime = Math.max(0, vsPlayer.currentTime - 5); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowRight':
            if (e.altKey) { if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { vsPlayer.currentTime = Math.min(vsPlayer.duration, vsPlayer.currentTime + 5); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageUp': if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageDown': if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case ' ': // Spacebar for play/pause
            if (vsPlayer.paused) vsPlayer.play(); else vsPlayer.pause();
            actionText = vsPlayer.paused ? '播放' : '暂停'; // Note: state after action
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowUp':
            vsPlayer.volume = Math.min(1, vsPlayer.volume + 0.1);
            actionText = `音量 ${Math.round(vsPlayer.volume * 100)}%`;
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowDown':
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
        else keyElement.innerHTML = ''; // Clear for actions like play/pause/volume
        actionElement.textContent = text;
    }
    hintElement.classList.add('show');
    shortcutHintTimeout = setTimeout(() => hintElement.classList.remove('show'), 1500);
}

// 在 js/player_app.js 文件中，可以放在 setupLongPressSpeedControl 函数的上方或下方

/**
 * 设置双击播放/暂停功能
 * @param {object} dpInstance DPlayer 实例
 * @param {HTMLElement} videoWrapElement 视频的包装元素 (通常是 .dplayer-video-wrap)
 */
function setupDoubleClickToPlayPause(dpInstance, videoWrapElement) {
    const targetElement = vsPlayer;
    if (!targetElement) {
        console.warn('[DoubleClick] Vidstack player element not provided for double tap.');

        return;
    }

    if (targetElement._doubleTapListenerAttached) {
        return; // 防止重复绑定监听器
    }

    targetElement.addEventListener('touchend', function (e) {
        if (isScreenLocked) { // isScreenLocked 是您代码中已有的全局变量
            return; // 屏幕锁定时，不响应双击
        }

        // 选择器数组，用于判断触摸是否发生在DPlayer的控件上
        const controlSelectors = [
            '[role="toolbar"]', // Common role for control bars
            '[role="menu"]',    // For menus
            'media-slider',     // Example Vidstack component
            '#episode-grid button', // Your custom episode buttons
        ];

        let tappedOnControl = false;
        for (const selector of controlSelectors) {
            if (e.target.closest(selector)) {
                tappedOnControl = true;
                break;
            }
        }

        if (tappedOnControl) {
            // 如果点击发生在控件上，则重置lastTapTimeForDoubleTap，避免影响下一次真正的视频区域点击
            lastTapTimeForDoubleTap = 0;
            return; // 不执行双击播放/暂停逻辑
        }

        const currentTime = new Date().getTime();
        if ((currentTime - lastTapTimeForDoubleTap) < DOUBLE_TAP_INTERVAL) {
            // 检测到双击
            if (vsPlayer && typeof vsPlayer.togglePaused === 'function') { // Vidstack might use togglePaused or play/pause
                if (vsPlayer.paused) vsPlayer.play(); else vsPlayer.pause();

            }
            lastTapTimeForDoubleTap = 0; // 重置时间戳，防止连续三次点击被误判
        } else {
            // 单击 (或者是双击的第一次点击)
            lastTapTimeForDoubleTap = currentTime;
        }
        // DPlayer 自己的单击事件会处理UI显隐，我们这里不需要额外操作
        // Vidstack gestures are often handled internally or via specific gesture components.
        // Avoid e.preventDefault() unless necessary, as it might interfere with Vidstack's built-in gestures.

    }, { passive: true }); // 使用 passive: true 明确表示我们不阻止默认的单击行为

    targetElement._doubleTapListenerAttached = true; // 添加标记，表示已绑定
}

function setupLongPressSpeedControl() {
    const targetElement = vsPlayer; // Assuming vsPlayer is the <media-player> element
    if (!targetElement) {
        console.warn('Vidstack player element for long press not found.');
        return;
    }

    let longPressTimer = null;
    let originalPlaybackRate = 1.0;
    let speedChangedByLongPress = false; // Flag to track if speed was changed by our long press

    // TOUCHSTART: Handles setting up the long press for speed change
    targetElement.addEventListener('touchstart', function (e) {
        if (isScreenLocked) return;

        const touchX = e.touches[0].clientX;
        const rect = targetElement.getBoundingClientRect();

        if (touchX > rect.left + rect.width / 2) {
            originalPlaybackRate = vsPlayer.playbackRate;
            if (longPressTimer) clearTimeout(longPressTimer);

            speedChangedByLongPress = false; // Reset before setting timer

            longPressTimer = setTimeout(() => {
                if (isScreenLocked || !vsPlayer || vsPlayer.paused) { // Check Vidstack state   
                    speedChangedByLongPress = false; // Ensure flag is false if bailing
                    return;
                }
                vsPlayer.playbackRate = 2.0;
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
            if (vsPlayer) {
                vsPlayer.playbackRate = originalPlaybackRate;
            }
            if (typeof showMessage === 'function') showMessage(`播放速度: ${originalPlaybackRate.toFixed(1)}x`, 'info', 1000);
        }
        speedChangedByLongPress = false; // Reset flag on touch end/cancel
    };

    targetElement.addEventListener('touchend', endLongPress);
    targetElement.addEventListener('touchcancel', endLongPress);

    if (!targetElement._contextMenuListenerAttached) {
        targetElement.addEventListener('contextmenu', function (e) {
            if (!isMobile()) return; // Only act on mobile

            const rect = targetElement.getBoundingClientRect();
            if (e.clientX > rect.left + rect.width / 2) {
                e.preventDefault(); // Prevent context menu if on the right half on mobile
            }
        });
        targetElement._contextMenuListenerAttached = true;
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
    const lockIcon = document.getElementById('lock-icon'); // 确保SVG元素有此ID

    if (playerContainer) {
        playerContainer.classList.toggle('player-locked', isScreenLocked);
    }

    if (lockButton && lockIcon) {
        if (isScreenLocked) {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-unlock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
            lockButton.setAttribute('aria-label', '解锁屏幕');
            if (typeof showMessage === 'function') showMessage('屏幕已锁定', 'info'); // 或者 showToast
        } else {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-lock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
            lockButton.setAttribute('aria-label', '锁定屏幕');
            if (typeof showMessage === 'function') showMessage('屏幕已解锁', 'info'); // 或者 showToast
        }
    }
}

function renderEpisodes() {
    const grid = document.getElementById('episode-grid');
    if (!grid) { setTimeout(renderEpisodes, 100); return; }
    // ★ 让选集区域可见 / 隐藏
    const container = document.getElementById('episodes-container');
    if (container) {
        if (currentEpisodes.length > 1) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    }

    // ★ 更新“共 x 集”文字
    const countSpan = document.getElementById('episodes-count');
    if (countSpan) countSpan.textContent = `共 ${currentEpisodes.length} 集`;

    grid.innerHTML = '';

    if (!currentEpisodes.length) {
        grid.innerHTML =
            '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }

    const order = [...Array(currentEpisodes.length).keys()];
    if (episodesReversed) order.reverse();          // 倒序显示

    order.forEach(idx => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = idx === currentEpisodeIndex
            ? 'p-2 rounded episode-active'
            : 'p-2 rounded bg-[#222] hover:bg-[#333] text-gray-300';
        btn.textContent = idx + 1;
        btn.dataset.index = idx;                  // 关键：把真实下标写到 data 上
        grid.appendChild(btn);
    });

    /* 只在父层做一次事件代理，彻底避免闭包 */
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

    // 只有在剧集总数 > 1 时才显示题注
    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        const totalEpisodes = window.currentEpisodes.length;
        const currentDisplayNumber = window.currentEpisodeIndex + 1; // 1-based

        // 题注样式：第 x / y 集
        episodeInfoSpan.textContent = `第 ${currentDisplayNumber} / ${totalEpisodes} 集`;

        // 同步顶部 “共 n 集” 小字
        const episodesCountEl = document.getElementById('episodes-count');
        if (episodesCountEl) {
            episodesCountEl.textContent = `共 ${totalEpisodes} 集`;
        }
    } else {
        // 如果只有单集或数据缺失，就清空题注
        episodeInfoSpan.textContent = '';
    }
}

// 复制播放链接
function copyLinks() {
    const currentUrlFromParams = new URLSearchParams(window.location.search).get('url');
    const playerSrc = vsPlayer ? vsPlayer.currentSrc || vsPlayer.src : '';
    const linkUrl = currentUrlFromParams || playerSrc || '';


    if (!linkUrl) {
        if (typeof showToast === 'function') {
            showToast('没有可复制的视频链接', 'warning');
        } else {
            alert('没有可复制的视频链接');
        }
        return;
    }

    navigator.clipboard.writeText(linkUrl).then(() => {
        if (typeof showToast === 'function') { // 检查 showToast 是否可用
            showToast('当前视频链接已复制', 'success');
        } else {
            console.error("showToast function is not available in player_app.js");
            alert('当前视频链接已复制 (showToast unavailable)'); // 降级提示
        }
    }).catch(err => {
        console.error('复制链接失败:', err);
        if (typeof showToast === 'function') {
            showToast('复制失败，请检查浏览器权限', 'error');
        } else {
            console.error("showToast function is not available in player_app.js");
            alert('复制失败 (showToast unavailable)'); // 降级提示
        }
    });
}

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    updateOrderButton(); // 更新排序按钮的视觉状态
    renderEpisodes();    // 重新渲染集数列表以反映新的排序
}

function updateOrderButton() {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    // 清空原 path 后填充新图标
    icon.innerHTML = episodesReversed
        ? '<polyline points="18 15 12 9 6 15"></polyline>'  // ⬆️  倒序
        : '<polyline points="6 9 12 15 18 9"></polyline>';  // ⬇️  正序
}

function playPreviousEpisode() {
    if (!currentEpisodes.length) return;
    const prevIdx = currentEpisodeIndex - 1;          // 无论正序 / 倒序都减 1
    if (prevIdx >= 0) {
        playEpisode(prevIdx);
    } else showMessage('已经是第一集了', 'info');
}
window.playPreviousEpisode = playPreviousEpisode;

function playNextEpisode() {
    if (!currentEpisodes.length) return;
    const nextIdx = currentEpisodeIndex + 1;          // 始终加 1
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
    if (!vsPlayer || typeof vsPlayer.currentTime !== 'number' || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = vsPlayer.currentTime;
    const duration = vsPlayer.duration;

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) {
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: currentEpisodes[currentEpisodeIndex], // url of the current episode
                episodeIndex: window.currentEpisodeIndex,
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                sourceName: new URLSearchParams(window.location.search).get('source') || '', // If you have source name
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || '',
                episodes: window.currentEpisodes // Save the full list for context
            };
            window.addToViewingHistory(videoInfo); // Call global function from ui.js
        } catch (e) {
            console.error('保存播放进度失败:', e);
        }
    }
}

function startProgressSaveInterval() {
    if (progressSaveInterval) clearInterval(progressSaveInterval);
    progressSaveInterval = setInterval(() => {
        saveCurrentProgress(); // 这个是保存到“观看历史列表”的
        saveVideoSpecificProgress(); // 新增调用，保存特定视频的集数进度
    }, 8000); // Save every 8 seconds，iOS 建议
}

function saveToHistory() {
    if (!vsPlayer || typeof vsPlayer.currentTime !== 'number' || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: currentEpisodes[currentEpisodeIndex],
            episodeIndex: currentEpisodeIndex,
            episodes: currentEpisodes, // Full list for context
            playbackPosition: Math.floor(vsPlayer.currentTime), // Current time, even if 0 for new episode
            duration: Math.floor(vsPlayer.duration) || 0, // Duration, or 0 if not loaded yet
            timestamp: Date.now(),
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || ''
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
 * 跳播到指定集数；已就绪时仅切流，不再整页刷新
 * @param {number} index 目标集数索引（0-based）
 */

function playEpisode(index) {
    if (!vsPlayer) {
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

    if (vsPlayer && typeof vsPlayer.currentTime === 'number' && vsPlayer.currentTime > 5 && currentEpisodes[currentEpisodeIndex]) {
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

    // 进度恢复弹窗逻辑整合
    nextSeekPosition = 0;
    if (shouldRestoreSpecificProgress) {
        const sourceCodeFromUrl = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';
        const videoSpecificIdForRestore = `${currentVideoTitle}_${sourceCodeFromUrl}`;
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressDataForVideo = allSpecificProgresses[videoSpecificIdForRestore];

        if (savedProgressDataForVideo) {
            const positionToResume = savedProgressDataForVideo[index.toString()]
                ? parseInt(savedProgressDataForVideo[index.toString()])
                : 0;
            // 判断是否弹窗
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

    // 没有弹窗场景直接切换
    doEpisodeSwitch(index, newEpisodeUrl);
}

// 提取实际切集逻辑为独立函数
function doEpisodeSwitch(index, url) {
    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index;
    const newEpisodeUrl = url;

    // 更新UI
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

    // 切视频

    if (vsPlayer) {
        vsPlayer.pause(); // Pause before changing source
        vsPlayer.src = newEpisodeUrl; // Change source
        videoHasEnded = false; // Reset for the new episode

        // 更新url
        const newUrlForBrowser = new URL(window.location.href);
        newUrlForBrowser.searchParams.set('url', newEpisodeUrl);
        newUrlForBrowser.searchParams.set('title', currentVideoTitle);
        newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());

        const currentSourceCode = new URLSearchParams(window.location.search).get('source_code');
        if (currentSourceCode) newUrlForBrowser.searchParams.set('source_code', currentSourceCode);

        const adFilteringStorageKey = (PLAYER_CONFIG && PLAYER_CONFIG.adFilteringStorage) ? PLAYER_CONFIG.adFilteringStorage : 'adFilteringEnabled';
        const adFilteringActive = (typeof getBoolConfig === 'function') ? getBoolConfig(adFilteringStorageKey, true) : true;
        newUrlForBrowser.searchParams.set('af', adFilteringActive ? '1' : '0');
        newUrlForBrowser.searchParams.delete('position');
        window.history.pushState(
            { path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex },
            '',
            newUrlForBrowser.toString()
        );
    }
}
window.playEpisode = playEpisode;
