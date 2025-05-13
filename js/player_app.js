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
            // console.log(`[SQuery] Element '${selector}' found by SQuery.`);
            callback(element);
        } else {
            elapsedTime += interval;
            if (elapsedTime < timeout) {
                setTimeout(check, interval);
            } else {
                console.error(`[SQuery] Element '${selector}' NOT FOUND by SQuery after ${timeout}ms.`);
                // You could call your global showError or showToast here
                // Example: if (typeof showError === 'function') showError(`关键UI元素 '${selector}' 未找到`);
            }
        }
    };
    check();
}
// --- 模块内变量 ---
let isNavigatingToEpisode = false;   // 正在换集时置 true，避免误保存
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let dp = null; // DPlayer instance
let currentHls = null;
let autoplayEnabled = true;
let isUserSeeking = false;
let videoHasEnded = false;
let seekStallChecker = null;     // ★ 新增：seek 卡顿检测计时器
let needSwapCodecNext = false;        // ★ 轮流 swapAudioCodec() 的标志
let userClickedPosition = null;
let shortcutHintTimeout = null;
let progressSaveInterval = null;
let isScreenLocked = false;

const REMEMBER_EPISODE_PROGRESS_ENABLED_KEY = 'playerRememberEpisodeProgressEnabled'; // 开关状态的键名
const VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY = 'videoSpecificEpisodeProgresses'; // 各视频各集进度的键名

// ==== 广告分片起止标记 ====
const AD_START_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="(ad|promo|preroll)"/i,
    /#EXT-X-SCTE35-OUT/i,
    /#EXT-X-PLACEMENT-OPPORTUNITY\b/i,
    /#EXTINF:[\d.]+,\s*(ad|promo|preroll)/i,
];
const AD_END_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="content"/i,
    /#EXT-X-SCTE35-IN/i,
    /^#EXT-X-PLACEMENT-OPPORTUNITY-END\b/i,
    /#EXT-X-DISCONTINUITY/i,   // 保险：有些源用 DISCONTINUITY 结束广告
];

// ==== 全局开关：是否去广告（缺省 true，可被 config.js 覆盖） ====
let adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true;

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
    //  console.log('[PlayerApp Debug] DOMContentLoaded event fired.');
    const testGridElement = document.getElementById('episode-grid');
    if (testGridElement) {
        //   console.log('[PlayerApp Debug] SUCCESS: episode-grid was FOUND immediately on DOMContentLoaded.');
    } else {
        console.error('[PlayerApp Debug] FAILURE: episode-grid was NOT FOUND immediately on DOMContentLoaded.');
    }

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
        loadingEl.style.display = 'flex';              // 原来的
        document.documentElement.classList.add('show-loading'); // ← 新增
    }
    initializePageContent();
});

function initializePageContent() {
    //  console.log('[PlayerApp Debug] initializePageContent starting...');
    const urlParams = new URLSearchParams(window.location.search);
    let episodeUrlForPlayer = urlParams.get('url'); // 先用 let，后续可能修改
    let title = urlParams.get('title');
    // 把可能的多层编码全部拆掉
    function fullyDecode(str) {
        try {
            let prev, cur = str;
            do { prev = cur; cur = decodeURIComponent(cur); } while (cur !== prev);
            return cur;
        } catch { return str; }   // 遇到非法编码就放弃
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
                //  console.log("[PlayerApp] Episodes loaded from URL parameter.");
            } catch (e) {
                console.warn("[PlayerApp] Failed to parse episodes from URL, falling back to localStorage.", e);
                currentEpisodes = episodesSource ? JSON.parse(episodesSource) : [];
            }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
            //  console.log("[PlayerApp] Episodes loaded from localStorage.");
        } else {
            currentEpisodes = [];
            //  console.log("[PlayerApp] No episode data found in URL or localStorage.");
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

    const positionFromUrl = urlParams.get('position'); // 从观看历史列表会带这个参数
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true; // 如果开关元素不存在，则默认行为是记住

    if (shouldRestoreSpecificProgress && !positionFromUrl && currentEpisodes.length > 0) {
        const videoSpecificIdForRestore = `${currentVideoTitle}_${sourceCodeFromUrl}`;
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressData = allSpecificProgresses[videoSpecificIdForRestore];

        if (savedProgressData) {
            // ① 决定“要不要提示进度”
            const resumeIndex = indexForPlayer;   // ← 统一使用这个
            const positionToResume =
                savedProgressData[resumeIndex.toString()]
                    ? parseInt(savedProgressData[resumeIndex.toString()])
                    : 0;

            // ② 如果 URL *没* 带 index（多半是直接点“继续播放”进入播放器），
            //    并且有 lastPlayedEpisodeIndex，可把页面跳到那一集。
            //    ——这一步只做“跳页”，不影响弹窗逻辑
            if ((!urlParams.has('index') || urlParams.get('index') === null)
                && typeof savedProgressData.lastPlayedEpisodeIndex === 'number'
                && savedProgressData.lastPlayedEpisodeIndex >= 0
                && savedProgressData.lastPlayedEpisodeIndex < currentEpisodes.length) {
                indexForPlayer = savedProgressData.lastPlayedEpisodeIndex;
            }

            if (positionToResume > 5 && currentEpisodes[resumeIndex]) {
                const wantsToResume = confirm(
                    `发现《${currentVideoTitle}》第 ${resumeIndex + 1} 集的播放记录，是否从 ${formatPlayerTime(positionToResume)} 继续播放？`
                );

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
                    // 用户选择从头播放 (播放用户从首页点击的那一集，即原始的 indexForPlayer)
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
            } else { // 没有有效进度，或进度太短，播放用户从首页选择的
                episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
            }
        } else { // 该视频没有任何保存的集数进度
            episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
        }
    } else if (positionFromUrl) { // 从观看历史带 position 参数进来
        episodeUrlForPlayer = urlParams.get('url');
        indexForPlayer = parseInt(urlParams.get('index') || '0');
        // (可选) 如果想在这里提示“从xx:xx继续播放”，可以调用 showPositionRestoreHint
    } else { // 开关关闭，或从历史但无有效 position
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
        const finalPositionToSeek = finalUrlParams.get('position');
        if (finalPositionToSeek) { // 不论是来自观看历史还是恢复的进度
            setTimeout(() => {
                if (dp && dp.video) {
                    const positionNum = parseInt(finalPositionToSeek, 10);
                    if (!isNaN(positionNum) && positionNum > 0) {
                        let hasSeekedOnLoad = false; // 标志位，确保 seek 只执行一次
                        dp.on('loadedmetadata', () => {
                            if (!hasSeekedOnLoad && dp && dp.video && dp.video.duration > 0) {
                                dp.seek(positionNum);
                                if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(positionNum);
                                hasSeekedOnLoad = true; // 标记已执行
                            }
                        });
                    }
                }
            }, 1500); // Delay seeking slightly
        }
    } else {
        showError('无效的视频链接');
    }

    updateEpisodeInfo();
    // Use requestAnimationFrame for initial render to ensure DOM is ready
    requestAnimationFrame(() => {
        renderEpisodes();
        //   console.log('[PlayerApp] renderEpisodes called via requestAnimationFrame in initializePageContent');
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
class EnhancedAdFilterLoader extends Hls.DefaultConfig.loader {
    static cueStart = AD_START_PATTERNS;
    static cueEnd = AD_END_PATTERNS;
    static strip(content) {
        const lines = content.split('\n');
        let inAd = false, out = [];

        for (const l of lines) {
            if (!inAd && this.cueStart.some(re => re.test(l))) { inAd = true; continue; }
            if (inAd && this.cueEnd.some(re => re.test(l))) {
                inAd = false;
                out.push('#EXT-X-DISCONTINUITY');   // **只在这里补一条**
                continue;
            }

            // 跳过原始 DISCONTINUITY，避免重复
            if (!inAd && !/^#EXT-X-DISCONTINUITY/i.test(l)) out.push(l);
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
    if (!videoUrl) {
        showError("视频链接无效");
        return;
    }
    if (!Hls || !DPlayer) {
        showError("播放器组件加载失败，请刷新");
        return;
    }

    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true;

    const hlsConfig = {
        debug: debugMode || false,
        loader: adFilteringEnabled ? EnhancedAdFilterLoader : Hls.DefaultConfig.loader,
        skipDateRanges: adFilteringEnabled,
        enableWorker: true, lowLatencyMode: false, backBufferLength: 90, maxBufferLength: 30,
        maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000, maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6, fragLoadingMaxRetryTimeout: 64000, fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3, manifestLoadingRetryDelay: 1000, levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000, startLevel: -1, abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7, abrMaxWithRealBitrate: true,
        stretchShortVideoTrack: true, appendErrorMaxRetry: 5, liveSyncDurationCount: 3,
        liveDurationInfinity: false
    };

    try {
        dp = new DPlayer({
            container: document.getElementById('dplayer'),
            autoplay: true, theme: '#00ccff', preload: 'auto', loop: false, lang: 'zh-cn',
            hotkey: true, mutex: true, volume: 0.7, screenshot: true, preventClickToggle: false,
            airplay: true, chromecast: true,
            video: {
                url: videoUrl, type: 'hls',
                // pic: (window.SITE_CONFIG && window.SITE_CONFIG.logo) || 'https://img.picgo.net/2025/04/12/image362e7d38b4af4a74.png',
                customType: {
                    hls: function (video, player) {
                        if (currentHls && currentHls.destroy) {
                            try { currentHls.destroy(); } catch (e) { console.warn('销毁旧HLS实例时出错:', e); }
                        }
                        const hls = new Hls(hlsConfig);
                        currentHls = hls; window.currentHls = currentHls; // Expose if needed

                        let errorDisplayed = false, errorCount = 0, playbackStarted = false, bufferAppendErrorCount = 0;

                        video.addEventListener('playing', function onPlaying() {
                            playbackStarted = true;
                            const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
                            const errorEl = document.getElementById('error'); if (errorEl) errorEl.style.display = 'none';
                            // video.removeEventListener('playing', onPlaying); // Maybe keep listening?
                        });

                        video.disableRemotePlayback = false;
                        // ★ 先拿到“正确的新地址”
                        const src = player.options && player.options.video
                            ? player.options.video.url
                            : '';           // 理论上一定有

                        // ★ 然后再去清理旧 DOM，避免把新地址弄丢
                        const existingSource = video.querySelector('source');
                        if (existingSource) existingSource.remove();
                        if (video.hasAttribute('src')) video.removeAttribute('src');
                        hls.loadSource(src);
                        hls.attachMedia(video);

                        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
                            if (debugMode) console.log("[PlayerApp] HLS Media Attached");
                            // DPlayer usually handles play(), but ensure it happens
                            // setTimeout(() => { player.play().catch(e => console.warn("Autoplay prevented:", e)); }, 100);
                        });

                        hls.on(Hls.Events.MANIFEST_PARSED, function () {
                            if (debugMode) console.log("[PlayerApp] HLS Manifest Parsed");
                            // Don't call video.play() here, let DPlayer handle it after MEDIA_ATTACHED/MANIFEST_PARSED
                        });

                        hls.on(Hls.Events.ERROR, function (event, data) {
                            if (debugMode) console.log('[HLS Event] Error:', event, data);
                            errorCount++;
                            if (data.details === 'bufferAppendError') {
                                bufferAppendErrorCount++;
                                if (debugMode) console.warn(`bufferAppendError occurred ${bufferAppendErrorCount} times`);
                                if (playbackStarted) return;
                                if (bufferAppendErrorCount >= 3) hls.recoverMediaError();
                            }
                            if (data.fatal && !playbackStarted) {
                                console.error('Fatal HLS Error:', data);
                                switch (data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                                    case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                                    default:
                                        if (errorCount > 3 && !errorDisplayed) { errorDisplayed = true; showError('视频加载失败 (HLS)'); }
                                        break;
                                }
                            }
                        });
                        const loadingElement = document.getElementById('loading');
                        hls.on(Hls.Events.FRAG_LOADED, () => { if (loadingElement) loadingElement.style.display = 'none'; });
                        hls.on(Hls.Events.LEVEL_LOADED, () => { if (loadingElement) loadingElement.style.display = 'none'; });
                    }
                }
            }
        });
        window.dp = dp; // Expose DPlayer instance globally
        if (debugMode) console.log("[PlayerApp] DPlayer instance created.");

        // Add DPlayer event listeners
        addDPlayerEventListeners();
        initializePlayerCustomControls();

    } catch (playerError) {
        console.error("Failed to initialize DPlayer:", playerError);
        showError("播放器初始化失败");
    }
}

function addDPlayerEventListeners() {
    if (!dp) return;
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    dp.on('fullscreen', () => {
        if (debugMode) console.log("[PlayerApp] DPlayer event: fullscreen");
        if (window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('landscape').catch(err => console.warn('屏幕方向锁定失败:', err));
        }
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton && fsButton.querySelector('svg')) {
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
        if (fsButton && fsButton.querySelector('svg')) {
            fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
            fsButton.setAttribute('aria-label', '全屏');
        }
    });

    dp.on('loadedmetadata', function () {
        if (debugMode) console.log("[PlayerApp] DPlayer event: loadedmetadata");
        const el = document.getElementById('loading');
        if (el) {
            el.style.display = 'none';                     // 原来的
            document.documentElement.classList.remove('show-loading'); // ← 新增
        }
        videoHasEnded = false;
        setupProgressBarPreciseClicks();
        setTimeout(saveToHistory, 3000); // Save initial state to history
        startProgressSaveInterval(); // Start periodic saving
    });

    dp.on('error', function (e) {
        console.error("DPlayer error event:", e);
        if (dp.video && dp.video.currentTime > 1) { // Allow errors if playing for >1s
            if (debugMode) console.log('DPlayer error ignored as video was playing.');
            return;
        }
        showError('播放器遇到错误，请检查视频源');
    });

    dp.on('seeking', function () { if (debugMode) console.log("[PlayerApp] DPlayer event: seeking"); isUserSeeking = true; videoHasEnded = false; });
    dp.on('seeked', function () {
        if (debugMode) console.log("[PlayerApp] DPlayer event: seeked");
        // Adjust if seeked very close to the end
        if (dp.video && dp.video.duration > 0) {
            const timeFromEnd = dp.video.duration - dp.video.currentTime;
            if (timeFromEnd < 0.3 && isUserSeeking) {
                dp.video.currentTime = Math.max(0, dp.video.currentTime - 1);
            }
        }
        setTimeout(() => { isUserSeeking = false; }, 200); // Reset seeking flag after a short delay

        /* －－－－－－－【去广告断点退播防卡】－－－－－－－
           1. seeked 后给 0.8s 观察窗口；
           2. 若跨越 <0.1s 仍没动 → 认定卡住，立即重启
           3. 自动调用 hls.recoverMediaError() 并微调时间戳，强制唤醒。 */
        if (seekStallChecker) clearTimeout(seekStallChecker);
        const startPos = dp.video.currentTime;
        seekStallChecker = setTimeout(() => {
            if (!dp || !dp.video) return;
            const advanced = dp.video.currentTime - startPos;
            // 若 <0.05 秒，则认为几乎没动，处于卡顿
            if (advanced < 0.05) {
                if (debugMode) console.warn(`[PlayerApp] Seek-stall detected at ${startPos}. Advanced: ${advanced}s. Attempting recovery.`);

                if (currentHls) {
                    if (debugMode) console.log("[PlayerApp] Attempting HLS.js built-in media error recovery first.");
                    try {
                        currentHls.recoverMediaError();
                    } catch (e) {
                        if (debugMode) console.error("[PlayerApp] currentHls.recoverMediaError() failed:", e);
                    }
                }

                // 给 HLS.js 一点时间尝试恢复
                setTimeout(() => {
                    if (!dp || !dp.video) return; // 播放器可能已销毁
                    const stillAdvanced = dp.video.currentTime - startPos;
                    // 如果 currentTime 仍然几乎没有变化，或者视频暂停了但我们期望它播放
                    if (stillAdvanced < 0.1 && (dp.video.paused && !isUserSeeking)) { // 阈值放宽到0.1s
                        if (debugMode) console.warn(`[PlayerApp] recoverMediaError didn't resolve stall (advanced: ${stillAdvanced}s). Trying more aggressive recovery.`);
                        try {
                            if (debugMode) console.log("[PlayerApp] Stopping HLS load.");
                            currentHls.stopLoad();

                            // 轮流尝试 swapAudioCodec，某些编码切换问题可能导致卡顿
                            if (needSwapCodecNext && typeof currentHls.swapAudioCodec === 'function') {
                                if (debugMode) console.log("[PlayerApp] Attempting to swap audio codec.");
                                currentHls.swapAudioCodec();
                            }
                            needSwapCodecNext = !needSwapCodecNext; // 下次尝试时切换

                            // 尝试从卡顿点稍早一点的位置重新加载和seek
                            const restartPosition = Math.max(0, startPos - 0.2); // 回退0.2秒
                            if (debugMode) console.log(`[PlayerApp] Restarting HLS load from position: ${restartPosition}`);
                            currentHls.startLoad(restartPosition);

                            // 显式设置 video 元素的 currentTime 并尝试播放
                            // HLS.js 加载需要时间，这里可以稍作延迟再seek和play
                            setTimeout(() => {
                                if (dp && dp.video) {
                                    if (debugMode) console.log(`[PlayerApp] Setting video currentTime to ${restartPosition} and attempting play.`);
                                    dp.seek(restartPosition); // 使用DPlayer的seek
                                    dp.play().catch(playError => {
                                        if (debugMode) console.warn("[PlayerApp] dp.play() after aggressive recovery failed:", playError);
                                    });
                                }
                            }, 300); // 给startLoad一些时间

                        } catch (aggressiveRecoveryError) {
                            if (debugMode) console.error("[PlayerApp] Aggressive stall recovery measures failed:", aggressiveRecoveryError);
                        }
                    } else {
                        if (debugMode) console.log(`[PlayerApp] Stall seems resolved or video progressed sufficiently (advanced: ${stillAdvanced}s).`);
                    }
                }, 700); // 增加等待 `recoverMediaError` 生效的时间
            }
        }
            , 1500);
    });

    dp.on('pause', function () {
        if (debugMode) console.log("[PlayerApp] DPlayer event: pause");
        saveVideoSpecificProgress();
        // saveCurrentProgress(); // 可选：如果也想在暂停时更新观看历史列表
    });

    dp.on('ended', function () {
        videoHasEnded = true;
        saveCurrentProgress(); // Ensure final progress is saved
        clearVideoProgress(); // Clear progress for *this specific video*
        if (!autoplayEnabled) return;       // 用户关掉了自动连播
        const nextIdx = currentEpisodeIndex + 1;   // 始终 +1（上一条回复已统一）
        if (nextIdx < currentEpisodes.length) {
            setTimeout(() => {
                // 再确认一下确实播完 & 没有人在拖动
                if (videoHasEnded && !isUserSeeking) playEpisode(nextIdx);
            }, 1000);                       // 1 s 延迟，防误触
        } else {
            if (debugMode) console.log('[PlayerApp] 已到最后一集，自动连播停止');
        }
    });

    dp.on('timeupdate', function () {
        // Reset ended flag if user seeks back after video ended
        if (dp.video && dp.video.duration > 0) {
            if (isUserSeeking && dp.video.currentTime > dp.video.duration * 0.95) {
                videoHasEnded = false;
            }
        }
        // Throttled progress save is handled by initializePageContent interval now
    });

    // Add a timeout to show a message if loading takes too long
    setTimeout(function () {
        // Check if player exists, video exists, AND readyState suggests still loading/not enough data
        if (dp && dp.video && dp.video.readyState < 3 && !videoHasEnded) {
            const loadingEl = document.getElementById('loading');
            if (loadingEl && loadingEl.style.display !== 'none') {
                loadingEl.innerHTML = `<div class="loading-spinner"></div><div>视频加载时间较长...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源或刷新</div>`;
                if (debugMode) console.warn("[PlayerApp] Loading timeout reached.");
            }
        }
    }, 15000); // Increased timeout to 15s

    // Native fullscreen integration for DPlayer's *internal* button actions
    (function () {
        const dplayerElement = document.getElementById('dplayer');
        if (dplayerElement) {
            dp.on('fullscreen', () => { // DPlayer *enters* its fullscreen mode
                if (document.fullscreenElement || document.webkitFullscreenElement) return; // Already native FS
                if (dplayerElement.requestFullscreen) dplayerElement.requestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed:', err));
                else if (dplayerElement.webkitRequestFullscreen) dplayerElement.webkitRequestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed (webkit):', err));
            });
            dp.on('fullscreen_cancel', () => { // DPlayer *exits* its fullscreen mode
                if (!document.fullscreenElement && !document.webkitFullscreenElement) return; // Not in native FS
                if (document.exitFullscreen) document.exitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed:', err));
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed (webkit):', err));
            });
        }
    })();
}

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', () => { window.location.href = 'index.html'; });
    }

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (dp && dp.fullScreen && typeof dp.fullScreen.toggle === 'function') {
                dp.fullScreen.toggle();
            } else {
                const playerContainer = document.getElementById('dplayer');
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
            const sourceCodeRetry = urlParamsRetry.get('source_code');
            if (videoUrlRetry) {
                const errorEl = document.getElementById('error'); if (errorEl) errorEl.style.display = 'none';
                const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'flex';
                if (dp && dp.video) {
                    //  console.log("[PlayerApp] Retrying: Switching video.");
                    dp.switchVideo({ url: videoUrlRetry, type: 'hls' });
                    dp.play();
                } else {
                    //    console.log("[PlayerApp] Retrying: Re-initializing player.");
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
    if (isNavigatingToEpisode) return;   // ← 跳过 beforeunload 那次调用
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle || !toggle.checked) { // 如果开关未勾选，则不保存
        return;
    }

    if (!dp || !dp.video || typeof currentVideoTitle === 'undefined' || typeof currentEpisodeIndex !== 'number' || !currentEpisodes || currentEpisodes.length === 0) {
        return;
    }

    const currentTime = Math.floor(dp.video.currentTime);
    const duration = Math.floor(dp.video.duration);
    const sourceCodeFromUrl = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';
    // 构建一个基于标题和数据源的唯一视频ID
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

            // (可选) 调试日志
            // if (window.PLAYER_CONFIG && PLAYER_CONFIG.debugMode) {
            //     console.log(`Saved specific progress for '${videoSpecificId}', Episode ${currentEpisodeIndex + 1}: ${currentTime}s`);
            // }
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
    if (dp && dp.video && dp.video.currentTime > 1 && !debugMode) { // Show error even if playing if debug mode is on
        console.warn('Ignoring error as video is playing:', message);
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
    if (!dp) return;
    // Need to wait slightly for DPlayer to render its progress bar
    setTimeout(() => {
        const progressBar = document.querySelector('#dplayer .dplayer-bar-wrap');
        if (!progressBar) { console.warn('DPlayer进度条元素未找到 (.dplayer-bar-wrap)'); return; }
        progressBar.removeEventListener('click', handleProgressBarClick);
        progressBar.removeEventListener('touchend', handleProgressBarTouch);
        progressBar.addEventListener('click', handleProgressBarClick);
        progressBar.addEventListener('touchend', handleProgressBarTouch);
    }, 500); // Delay setup
}

function handleProgressBarClick(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const clickTime = percentage * dp.video.duration;
    userClickedPosition = clickTime;
    dp.seek(clickTime);
}

function handleProgressBarTouch(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.changedTouches || !e.changedTouches[0] || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const offsetX = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const touchTime = percentage * dp.video.duration;
    userClickedPosition = touchTime;
    dp.seek(touchTime);
}

function handleKeyboardShortcuts(e) {
    if (!dp || (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))) return;
    if (isScreenLocked) return; // Ignore shortcuts if screen is locked
    let actionText = '', direction = '';
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    switch (e.key) {
        case 'ArrowLeft':
            if (e.altKey) { if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { dp.seek(Math.max(0, dp.video.currentTime - 5)); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowRight':
            if (e.altKey) { if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { dp.seek(Math.min(dp.video.duration, dp.video.currentTime + 5)); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageUp': if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageDown': if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case ' ': // Spacebar for play/pause
            dp.toggle(); actionText = dp.video.paused ? '暂停' : '播放'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowUp': dp.volume(Math.min(1, dp.video.volume + 0.1)); actionText = `音量 ${Math.round(dp.video.volume * 100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowDown': dp.volume(Math.max(0, dp.video.volume - 0.1)); actionText = `音量 ${Math.round(dp.video.volume * 100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'f': dp.fullScreen.toggle(); actionText = '切换全屏'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break; // 'f' for fullscreen toggle
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
    if (episodesReversed) order.reverse();          // 倒序显示

    order.forEach(idx => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = idx === currentEpisodeIndex
            ? 'p-2 rounded episode-active'
            : 'p-2 rounded bg-[#222] hover:bg-[#333] text-gray-300';
        btn.textContent = idx + 1;
        btn.dataset.index = idx;                  // 关键：把真实下标写到 data 上
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
    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || (dp && dp.video && dp.video.src) || ''; // 尝试从播放器获取当前链接作为备选

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
    renderEpisodes();    // 重新渲染集数列表以反映新的排序
}

function updateOrderButton() {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    // 清空原 path 后填充新图标
    icon.innerHTML = episodesReversed
        ? '<polyline points="18 15 12 9 6 15"></polyline>'  // ⬆️  倒序
        : '<polyline points="6 9 12 15 18 9"></polyline>';  // ⬇️  正序
}

function playPreviousEpisode() {
    if (!currentEpisodes.length) return;
    const prevIdx = currentEpisodeIndex - 1;          // 无论正序 / 倒序都减 1
    if (prevIdx >= 0) {
        playEpisode(prevIdx);
    } else showMessage('已经是第一集了', 'info');
}
window.playPreviousEpisode = playPreviousEpisode;

function playNextEpisode() {
    if (!currentEpisodes.length) return;
    const nextIdx = currentEpisodeIndex + 1;          // 始终加 1
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
    if (!dp || !dp.video || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = dp.video.currentTime;
    const duration = dp.video.duration;

    // Only save if meaningful progress has been made and video hasn't practically ended
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) { // Check against 98% to avoid saving if "ended" event was missed
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex], // url of the current episode
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
    }, 30000); // Save every 30 seconds
}

function saveToHistory() { // This is more like an "initial save" or "episode change save"
    if (!dp || !dp.video || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            episodes: window.currentEpisodes, // Full list for context
            playbackPosition: Math.floor(dp.video.currentTime), // Current time, even if 0 for new episode
            duration: Math.floor(dp.video.duration) || 0, // Duration, or 0 if not loaded yet
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

function playEpisode(index) { // index 是目标新集数的索引
    if (index < 0 || index >= currentEpisodes.length) {
        console.warn(`[PlayerApp] Invalid episode index: ${index}`);
        return;
    }

    // 关键：在更新 currentEpisodeIndex 和跳转之前，为【当前正在结束的这一集】保存一次进度
    // 使用当前的、模块级的 currentEpisodeIndex (这是旧的集数) 和 dp.video.currentTime
    if (dp && dp.video && typeof currentEpisodeIndex === 'number' && currentEpisodes[currentEpisodeIndex]) {
        // 只有当 dp 存在，并且 currentEpisodeIndex 是一个有效的、已加载的集数时才保存
        console.log(`[PlayerApp Debug] Saving progress for OLD episode ${currentEpisodeIndex + 1} before switching to ${index + 1}`);
        saveVideoSpecificProgress(); // 这个函数内部会使用当前的 currentVideoTitle, currentEpisodeIndex, dp.video.currentTime
    }

    // ② 标记“正在跳转”，让 after-save 的 beforeunload 不再写库
    isNavigatingToEpisode = true;

    // 更新 currentEpisodeIndex，再构造最简 URL 跳转
    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index;

    const episodeUrl = currentEpisodes[index];
    if (!episodeUrl) {
        console.warn(`[PlayerApp] No URL for episode ${index}`);
        return;
    }

    // 只传最少必要的参数：url, title, index, source_code, af
    const playerUrl = new URL(window.location.origin + window.location.pathname);
    playerUrl.searchParams.set('url', episodeUrl);
    playerUrl.searchParams.set('title', currentVideoTitle);
    playerUrl.searchParams.set('index', index.toString());

    // 来源标记
    const sourceCode = new URLSearchParams(window.location.search).get('source_code');
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);

    // 带上广告过滤开关
    const adOn = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, true);
    playerUrl.searchParams.set('af', adOn ? '1' : '0');

    window.location.href = playerUrl.toString();
    // ③ 再更新索引等-old
    /*    currentEpisodeIndex = index;
       window.currentEpisodeIndex = index; // 也更新 window 上的
   
       const episodeUrl = currentEpisodes[index];
       if (!episodeUrl) {
           console.warn(`[PlayerApp] No URL found for episode index: ${index}`);
           return;
       }
   
       // ... (后续构建 playerUrl 和跳转的逻辑不变) ...
       const playerUrl = new URL(window.location.origin + window.location.pathname);
       playerUrl.searchParams.set('url', episodeUrl);
       playerUrl.searchParams.set('title', currentVideoTitle);
       playerUrl.searchParams.set('index', index.toString());
       // adFilteringEnabled 是前面已经算好的全局变量
       playerUrl.searchParams.set('af', adFilteringEnabled ? '1' : '0');
   
       if (Array.isArray(currentEpisodes) && currentEpisodes.length) {
           playerUrl.searchParams.set('episodes', encodeURIComponent(JSON.stringify(currentEpisodes)));
       }
       const sourceCode = new URLSearchParams(window.location.search).get('source_code');
       if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);
   
       const currentReversedForPlayer = localStorage.getItem('episodesReversed') === 'true';
       playerUrl.searchParams.set('reversed', currentReversedForPlayer.toString());
       playerUrl.searchParams.delete('position');
   
       try {
           localStorage.setItem('currentEpisodes', JSON.stringify(currentEpisodes));
           localStorage.setItem('currentVideoTitle', currentVideoTitle);
           // 当跳转到新页面后，新页面的 initializePageContent 会从 URL 读取 index，
           // 所以这里保存 currentEpisodeIndex (新的index) 到 localStorage 主要是为了
           // 在某些极端情况下（如URL参数丢失）提供一个回退，但不是主要的恢复机制。
           localStorage.setItem('currentEpisodeIndex', index.toString());
       } catch (_) { }
   
       window.location.href = playerUrl.toString(); */
}

// ===== 新增：用于整合移动端长按菜单阻止 和 长按倍速播放功能 =====

/**
 * 初始化播放器相关的自定义事件和控制
 */
function initializePlayerCustomControls() {
    if (!dp) {
        console.warn("DPlayer 实例尚未初始化，无法设置自定义控件。");
        return;
    }

    // 优先使用 DPlayer 内部的 videoWrap 元素作为交互目标，如果不存在，则使用播放器的根容器
    // dp.template.videoWrap 是 DPlayer 一个常见的内部结构，代表视频的直接包装层
    // 如果您的 DPlayer 版本或结构不同，可能需要调整选择器，例如 dp.container.querySelector('.dplayer-video-wrap')
    const playerInteractionElement = dp.template.videoWrap || dp.container;

    // 1. 始终阻止移动端的原生上下文菜单 (长按菜单)
    if (dp.container) {
        dp.container.addEventListener('contextmenu', function (event) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (isMobile) { // 严格按用户需求：移动端不跳出
                event.preventDefault();
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                    console.log('[PlayerApp] 原生上下文菜单已在移动端被阻止。');
                }
            }
            // 对于桌面端，如果不调用 event.preventDefault()，则会显示DPlayer自己的或原生的右键菜单
            // 如果桌面端也不希望显示任何右键菜单，可以去掉 isMobile 的判断，直接 event.preventDefault();
        });
    }

    // 2. 设置移动端长按倍速播放功能
    if (playerInteractionElement) { // 确保交互元素存在
        setupMobileLongPressSpeedControl(playerInteractionElement);
    } else {
        console.warn("未能找到播放器交互元素 (videoWrap 或 container)，无法设置长按倍速功能。");
    }
}

/**
 * 设置移动端长按倍速播放功能 (整合了您提供的逻辑)
 * @param {HTMLElement} targetElement - 监听触摸事件的元素
 */
function setupMobileLongPressSpeedControl(targetElement) {
    if (!dp || !dp.video || !targetElement) {
        console.warn("setupMobileLongPressSpeedControl：DPlayer、视频元素或目标元素未准备好。");
        return;
    }

    let longPressTimer = null;
    let originalPlaybackRate = 1.0;
    let isLongPressActive = false;

    function showSpeedHint(speed) {
        if (typeof showShortcutHint === 'function') {
            // 确保 speed 是数字并格式化
            const numericSpeed = parseFloat(speed);
            if (!isNaN(numericSpeed)) {
                showShortcutHint(`${numericSpeed.toFixed(1)}倍速`, ''); // 提示中不显示方向箭头
            }
        }
    }

    targetElement.addEventListener('touchstart', function (e) {
        // isScreenLocked 是您player_app.js中已有的全局变量 
        if (dp.video.paused || isScreenLocked) {
            return;
        }

        // 只在触摸点在视频播放区域的右半部分时触发倍速播放
        const touchX = e.touches[0].clientX;
        const rect = targetElement.getBoundingClientRect();
        if (touchX <= rect.left + rect.width / 2) {
            return; // 在左半部分触摸，不触发倍速
        }

        originalPlaybackRate = dp.video.playbackRate;
        isLongPressActive = false;

        longPressTimer = setTimeout(() => {
            if (dp.video.paused || isScreenLocked) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                return;
            }

            dp.video.playbackRate = 2.0; // 您可以按需调整倍速，例如 2.0 或您之前写的 3.0
            isLongPressActive = true;
            showSpeedHint(dp.video.playbackRate);
            // 在长按确认后阻止默认事件，对某些设备可能有用
            // e.preventDefault(); // 如果发现长按时仍有其他行为（如文字选中），可以取消这行注释
        }, 300); // 长按触发延时，例如 300ms 或 500ms
    }, { passive: false }); // 设置为 false 允许在回调中调用 e.preventDefault()

    const clearLongPress = (event) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (isLongPressActive) {
            dp.video.playbackRate = originalPlaybackRate;
            showSpeedHint(originalPlaybackRate);
            isLongPressActive = false;
            if (event) { // touchend 会传入 event 对象
                event.preventDefault(); // 阻止长按后的单击事件（如播放/暂停）
            }
        }
    };

    targetElement.addEventListener('touchend', clearLongPress);
    targetElement.addEventListener('touchcancel', clearLongPress);

    targetElement.addEventListener('touchmove', function (e) {
        if (isLongPressActive) {
            // 如果长按倍速已激活，阻止页面滚动
            e.preventDefault();
        } else {
            // 如果用户在等待长按计时器期间显著移动了手指，可以取消长按（可选，取决于您希望的灵敏度）
            if (longPressTimer) {
                //  简单的位移判断示例，您可以根据需要调整或移除
                //  const initialTouch = e.target.startTouch || e.touches[0]; // 需要在 touchstart 保存初始触摸点
                //  const dx = Math.abs(e.touches[0].clientX - initialTouch.clientX);
                //  const dy = Math.abs(e.touches[0].clientY - initialTouch.clientY);
                //  if (dx > 10 || dy > 10) { // 移动超过10像素则取消
                clearTimeout(longPressTimer);
                longPressTimer = null;
                //  }
            }
        }
    }, { passive: false }); // 设置为 false 允许 e.preventDefault()

    dp.video.addEventListener('pause', function () {
        if (isLongPressActive) {
            dp.video.playbackRate = originalPlaybackRate;
            isLongPressActive = false;
            // 暂停时通常不需要提示恢复速度，但可以根据需求添加
        }
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    });
}

// =================== 函数定义结束 ===================

window.playEpisode = playEpisode; // Expose globally