// --- File: js/player_app.js ---
// Add this helper function at the top of js/player_app.js
if (typeof showToast !== 'function' || typeof showMessage !== 'function') {
    // console.warn("UI notification functions (showToast/showMessage) are not available. Notifications might not work.");
}

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

function testLocalStorageAvailable() {
    try {
        localStorage.setItem('__ls_test__', '1');
        localStorage.removeItem('__ls_test__');
        return true;
    } catch (e) {
        return false;
    }
}

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

const SKIP_INTRO_KEY = 'skipIntroTime';
const SKIP_OUTRO_KEY = 'skipOutroTime';

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
        if (typeof showToast === 'function') showToast('跳过时间设置已保存', 'success');
        dropdown.classList.add('hidden');
        dropdown.classList.remove('block');
    });

    resetBtn.addEventListener('click', () => {
        localStorage.removeItem(SKIP_INTRO_KEY);
        localStorage.removeItem(SKIP_OUTRO_KEY);
        skipIntroInput.value = '';
        skipOutroInput.value = '';
        if (typeof showToast === 'function') showToast('跳过时间设置已重置', 'success');
    });

    skipIntroInput.value = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    skipOutroInput.value = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
}

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

function handleSkipIntroOutro(dpInstance) {
    if (!dpInstance || !dpInstance.video) return;
    const video = dpInstance.video;

    const skipIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    if (video._skipIntroHandler) video.removeEventListener('loadedmetadata', video._skipIntroHandler);
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

    const skipOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
    if (video._skipOutroHandler) video.removeEventListener('timeupdate', video._skipOutroHandler);
    if (skipOutroTime > 0) {
        video._skipOutroHandler = function () {
            if (!video) return;
            const remain = video.duration - video.currentTime;
            if (remain <= skipOutroTime && !video.paused) {
                if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
                    playNextEpisode(); // Global function
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

document.addEventListener('DOMContentLoaded', () => {
    setupSkipControls();
    setupSkipDropdownEvents();
    // initializePageContent is called after password check or directly
});

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

        const close = (result) => {
            modal.classList.remove("active");
            document.body.style.overflow = "";
            btnCancel.onclick = btnConfirm.onclick = null;
            document.removeEventListener("keydown", keyHandler);
            setTimeout(() => resolve(result), 180);
        };

        btnCancel.onclick = () => close(false);
        btnConfirm.onclick = () => close(true);

        const keyHandler = (e) => {
            if (e.key === "Escape") close(false);
            if (e.key === "Enter") close(true);
        };
        setTimeout(() => btnConfirm.focus(), 120);
        document.addEventListener("keydown", keyHandler);

        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    });
}

let isNavigatingToEpisode = false;
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let dp = null;
let currentHls = null;
let autoplayEnabled = true;
let isUserSeeking = false;
let videoHasEnded = false;
let shortcutHintTimeout = null;
let progressSaveInterval = null;
let isScreenLocked = false;
let nextSeekPosition = 0;
let _tempUrlForCustomHls = '';
let lastTapTimeForDoubleTap = 0;
let vodIdForPlayer = ''; // VOD ID for the current show/movie

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

window.currentEpisodes = [];
window.currentEpisodeIndex = 0;

function getShowIdentifier(perEpisode = true) {
    const sc = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';
    const vid = vodIdForPlayer || ''; // Use the global vodIdForPlayer
    const ep = perEpisode ? `_ep${currentEpisodeIndex}` : '';

    if (vid) return `${currentVideoTitle}_${sc}_${vid}${ep}`;
    
    const rawUrl = currentEpisodes[currentEpisodeIndex] || '';
    const urlKey = rawUrl.split('/').pop().split(/[?#]/)[0] || (rawUrl.length > 32 ? rawUrl.slice(-32) : rawUrl);
    return `${currentVideoTitle}_${sc}_${urlKey}${ep}`;
}

function clearCurrentVideoAllEpisodeProgresses() {
    try {
        const all = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || "{}");
        const showId = getShowIdentifier(false); 
        if (all[showId]) {
            delete all[showId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(all));
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
    toggle.checked = savedSetting !== null ? savedSetting === 'true' : true;
    if (savedSetting === null) localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, 'true');

    toggle.addEventListener('change', function (event) {
        const isChecked = event.target.checked;
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, isChecked.toString());
        const messageText = isChecked ? '将记住本视频的各集播放进度' : '将不再记住本视频的各集播放进度';
        if (typeof window.showMessage === 'function') window.showMessage(messageText, 'info');
        else if (typeof window.showToast === 'function') window.showToast(messageText, 'info');
        if (!isChecked) clearCurrentVideoAllEpisodeProgresses();
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

function initializePageContent() {
    if (!testLocalStorageAvailable()) {
        if (typeof showMessage === 'function') showMessage('当前浏览器本地存储不可用，播放进度记忆将失效', 'warning');
    }

    const urlParams = new URLSearchParams(window.location.search);
    let episodeUrlForPlayer = urlParams.get('url');
    let title = urlParams.get('title');
    vodIdForPlayer = urlParams.get('id') || ''; // Initialize global vodIdForPlayer

    const fullyDecode = (str) => { try { let p, c = str; do { p = c; c = decodeURIComponent(c); } while (c !== p); return c; } catch { return str; } };
    title = title ? fullyDecode(title) : '';
    
    let indexFromUrl = parseInt(urlParams.get('index') || urlParams.get('ep') || '0', 10);
    let indexForPlayer = indexFromUrl;

    const episodesListParam = urlParams.get('episodes');
    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    window.currentVideoTitle = currentVideoTitle;

    try {
        let episodesSource = localStorage.getItem('currentEpisodes');
        if (episodesListParam) {
            try { currentEpisodes = JSON.parse(decodeURIComponent(episodesListParam)); }
            catch (e) { currentEpisodes = episodesSource ? JSON.parse(episodesSource) : []; }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
        } else {
            currentEpisodes = [];
        }
        window.currentEpisodes = currentEpisodes;

        if (currentEpisodes.length > 0 && (indexFromUrl < 0 || indexFromUrl >= currentEpisodes.length)) {
            indexFromUrl = 0;
            indexForPlayer = 0;
            // No need to update URL here, will be handled by playEpisode or final URL construction
        }
        window.currentEpisodeIndex = indexFromUrl; // Set initial currentEpisodeIndex

        const reversedFromUrl = urlParams.get('reversed');
        episodesReversed = reversedFromUrl !== null ? reversedFromUrl === 'true' : localStorage.getItem('episodesReversed') === 'true';
        if (reversedFromUrl !== null) localStorage.setItem('episodesReversed', episodesReversed.toString());

    } catch (e) {
        console.error('[PlayerApp] Error initializing episode data:', e);
        currentEpisodes = []; window.currentEpisodes = [];
        indexForPlayer = 0; episodesReversed = false;
    }
    
    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';
    const autoplayToggle = document.getElementById('autoplay-next') || document.getElementById('autoplayToggle');
    if (autoplayToggle) {
        autoplayToggle.checked = autoplayEnabled;
        autoplayToggle.addEventListener('change', (e) => {
            autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled.toString());
        });
    }

    setupRememberEpisodeProgressToggle();

    const positionFromUrl = urlParams.get('position');
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;

    if (positionFromUrl) {
        episodeUrlForPlayer = urlParams.get('url'); // Use URL from params if position is set
        indexForPlayer = parseInt(urlParams.get('index') || '0', 10);
        // The seek logic will be handled by dp.on('loadedmetadata') using this positionFromUrl
    } else if (shouldRestoreSpecificProgress && currentEpisodes.length > 0) {
        const showId = getShowIdentifier(false); // Get ID for the whole show
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressDataForShow = allSpecificProgresses[showId];

        if (savedProgressDataForShow) {
            // If URL doesn't specify an index, try to use the last played index for this show
            if ((!urlParams.has('index') || urlParams.get('index') === null) &&
                typeof savedProgressDataForShow.lastPlayedEpisodeIndex === 'number' &&
                savedProgressDataForShow.lastPlayedEpisodeIndex >= 0 &&
                savedProgressDataForShow.lastPlayedEpisodeIndex < currentEpisodes.length) {
                indexForPlayer = savedProgressDataForShow.lastPlayedEpisodeIndex;
            }
            // Now check progress for the determined indexForPlayer
            const positionToResume = savedProgressDataForShow[indexForPlayer.toString()] ?
                                     parseInt(savedProgressDataForShow[indexForPlayer.toString()]) : 0;

            if (positionToResume > 5 && currentEpisodes[indexForPlayer]) {
                showProgressRestoreModal({
                    title: "继续播放？",
                    content: `发现《${currentVideoTitle}》第 ${indexForPlayer + 1} 集的播放记录，<br>是否从 <span style="color:#00ccff">${formatPlayerTime(positionToResume)}</span> 继续播放？`,
                    confirmText: "继续播放",
                    cancelText: "从头播放"
                }).then(wantsToResume => {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set('url', currentEpisodes[indexForPlayer]);
                    newUrl.searchParams.set('index', indexForPlayer.toString());
                    if (vodIdForPlayer) newUrl.searchParams.set('id', vodIdForPlayer);

                    if (wantsToResume) {
                        newUrl.searchParams.set('position', positionToResume.toString());
                        if (typeof window.showMessage === 'function') window.showMessage(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                    } else {
                        newUrl.searchParams.delete('position');
                        try { // Clear specific episode progress if "From Start"
                            const show_Id_for_clear = getShowIdentifier(false);
                            const all_prog = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                            if (all_prog[show_Id_for_clear] && all_prog[show_Id_for_clear][indexForPlayer.toString()]) {
                                delete all_prog[show_Id_for_clear][indexForPlayer.toString()];
                                localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(all_prog));
                            }
                        } catch (e) { console.warn('清除本集特定进度失败：', e); }
                        if (typeof showMessage === 'function') showMessage('已从头开始播放', 'info');
                    }
                    window.history.replaceState({}, '', newUrl.toString());
                    initializePageContent(); // Re-initialize with updated URL
                });
                return; // Stop further execution until modal resolves
            }
        }
    }
    // If no modal, or modal resolved, or no specific progress to restore, proceed with current indexForPlayer
    currentEpisodeIndex = indexForPlayer;
    window.currentEpisodeIndex = currentEpisodeIndex;
    if (currentEpisodes.length > 0 && (!episodeUrlForPlayer || !currentEpisodes.includes(episodeUrlForPlayer))) {
        episodeUrlForPlayer = currentEpisodes[currentEpisodeIndex];
        if (episodeUrlForPlayer) {
            const tempUrl = new URL(window.location.href);
            tempUrl.searchParams.set('url', episodeUrlForPlayer);
            window.history.replaceState({}, '', tempUrl.toString()); // Silently update URL if needed
        }
    }
    
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;

    if (episodeUrlForPlayer) {
        initPlayer(episodeUrlForPlayer, urlParams.get('source_code'));
        // Seek logic is now primarily in dp.on('loadedmetadata') using finalPositionToSeek from URL
    } else {
        showError('无效的视频链接');
    }

    updateEpisodeInfo();
    requestAnimationFrame(() => { renderEpisodes(); });
    updateButtonStates();
    updateOrderButton();
    setTimeout(setupProgressBarPreciseClicks, 1000);
    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', () => { saveCurrentProgress(); saveVideoSpecificProgress(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { saveCurrentProgress(); saveVideoSpecificProgress(); }});
    setTimeout(setupPlayerControls, 100);
}


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

function initPlayer(videoUrl, sourceCode) {
    if (!videoUrl) { showError("视频链接无效"); return; }
    if (!Hls || !DPlayer) { showError("播放器组件加载失败，请刷新"); return; }

    const debugMode = window.PLAYER_CONFIG?.debugMode;
    adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true;

    const hlsConfig = {
        debug: debugMode || false,
        loader: adFilteringEnabled ? EnhancedAdFilterLoader : Hls.DefaultConfig.loader,
        // ... other HLS config from old.txt/new.txt (ensure they are consistent or merged as desired)
        skipDateRanges: adFilteringEnabled, enableWorker: true, lowLatencyMode: false, backBufferLength: 90, 
        maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000, maxBufferHole: 0.5,
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
                customType: {
                    hls: function (video, player) {
                        const newSourceUrlToLoad = _tempUrlForCustomHls || (player.options.video && player.options.video.url);
                        _tempUrlForCustomHls = '';
                        if (!newSourceUrlToLoad) {
                            if (typeof showError === 'function') showError("视频链接无效，无法加载。");
                            if (player && typeof player.error === 'function') player.error('No valid source URL for HLS customType.');
                            return;
                        }
                        if (window.currentHls) { window.currentHls.destroy(); window.currentHls = null; }
                        video.pause(); video.removeAttribute('src');
                        while (video.firstChild) video.removeChild(video.firstChild);
                        video.src = ""; video.load();
                        const hls = new Hls(hlsConfig); window.currentHls = hls;
                        hls.on(Hls.Events.ERROR, (event, data) => { /* ... error handling ... */ 
                            console.error(`[CustomHLS] HLS.js Error. Fatal: ${data.fatal}. Type: ${data.type}. Details: ${data.details}. URL: ${data.url || newSourceUrlToLoad}`, data);
                            if (data.fatal && player && typeof player.error === 'function') {
                                player.error(`HLS.js fatal error: ${data.type} - ${data.details}`);
                            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && typeof hls.recoverMediaError === 'function') {
                                try { hls.recoverMediaError(); } catch (e) { console.error("Error on hls.recoverMediaError()", e); }
                            }
                        });
                        hls.on(Hls.Events.MANIFEST_LOADED, (event, data) => { /* ... */ });
                        hls.on(Hls.Events.FRAG_LOADED, () => { const el = document.getElementById('loading'); if (el) el.style.display = 'none'; });
                        hls.on(Hls.Events.LEVEL_LOADED, () => { const el = document.getElementById('loading'); if (el) el.style.display = 'none'; });
                        hls.attachMedia(video);
                        hls.on(Hls.Events.MEDIA_ATTACHED, () => { hls.loadSource(newSourceUrlToLoad); });
                    }
                }
            }
        });
        window.dp = dp;
        addDPlayerEventListeners();
        patchAndroidVideoHack();
        handleSkipIntroOutro(dp);
    } catch (playerError) {
        console.error("Failed to initialize DPlayer:", playerError);
        showError("播放器初始化失败");
    }
}

function addDPlayerEventListeners() {
    if (!dp) return;
    const debugMode = window.PLAYER_CONFIG?.debugMode;
    const playerVideoWrap = document.querySelector('#dplayer .dplayer-video-wrap');

    dp.on('fullscreen', () => { /* ... fullscreen logic ... */ 
        if (window.screen.orientation && window.screen.orientation.lock) window.screen.orientation.lock('landscape').catch(console.warn);
        const fsBtn = document.getElementById('fullscreen-button'); if(fsBtn) { /* update icon */ }
    });
    dp.on('fullscreen_cancel', () => { /* ... fullscreen_cancel logic ... */ 
        if (window.screen.orientation && window.screen.orientation.unlock) window.screen.orientation.unlock();
        const fsBtn = document.getElementById('fullscreen-button'); if(fsBtn) { /* update icon */ }
    });

    dp.on('loadedmetadata', function () {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) { loadingEl.style.display = 'none'; document.documentElement.classList.remove('show-loading'); }
        videoHasEnded = false;
        if (typeof setupProgressBarPreciseClicks === 'function') setupProgressBarPreciseClicks();

        // Use position from URL if available (this is the merged logic)
        const urlParams = new URLSearchParams(window.location.search);
        const positionToSeekFromUrl = urlParams.get('position');
        
        if (positionToSeekFromUrl && dp && dp.video && dp.video.duration > 0) {
            const seekPos = parseInt(positionToSeekFromUrl, 10);
            if (!isNaN(seekPos) && seekPos > 0 && seekPos < dp.video.duration -1) {
                if (typeof dp.seek === 'function') dp.seek(seekPos); else dp.video.currentTime = seekPos;
                if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(seekPos);
            }
        } else if (nextSeekPosition > 0 && dp && dp.video && dp.video.duration > 0) { // Fallback to nextSeekPosition if no URL position
            if (nextSeekPosition < dp.video.duration) {
                if (typeof dp.seek === 'function') dp.seek(nextSeekPosition); else dp.video.currentTime = nextSeekPosition;
                if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(nextSeekPosition);
            }
        }
        nextSeekPosition = 0; // Reset after use

        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof startProgressSaveInterval === 'function') startProgressSaveInterval();
        isNavigatingToEpisode = false;

        setTimeout(() => { // Autoplay logic
            if (!dp || !dp.video) return;
            if (dp.video.paused) {
                const playFn = dp.play;
                if (typeof playFn === 'function') {
                    const dplayerAutoplay = dp.options?.autoplay;
                    const customAutoplay = autoplayEnabled; // global var
                    if (dplayerAutoplay || customAutoplay) {
                        const promise = playFn.call(dp);
                        if (promise && typeof promise.catch === 'function') promise.catch(console.warn);
                    }
                }
            }
        }, 100);
    });

    dp.on('error', (e) => { /* ... error handling ... */ 
        console.error("DPlayer error event:", e);
        if (dp.video && dp.video.currentTime > 1 && !debugMode) return;
        showError('播放器遇到错误，请检查视频源');
    });
    
    if (playerVideoWrap) {
        setupDoubleClickToPlayPause(dp, playerVideoWrap); // From new.txt
        setupLongPressSpeedControl(); // From new.txt
    }

    dp.on('seeking', () => { isUserSeeking = true; videoHasEnded = false; });
    dp.on('seeked', () => { 
        if (dp.video && dp.video.duration > 0) {
            const timeFromEnd = dp.video.duration - dp.video.currentTime;
            if (timeFromEnd < 0.3 && isUserSeeking) dp.video.currentTime = Math.max(0, dp.video.currentTime - 1);
        }
        setTimeout(() => { isUserSeeking = false; }, 200); 
        saveVideoSpecificProgress(); // Save on seeked
    });
    dp.on('pause', () => { saveVideoSpecificProgress(); /* saveCurrentProgress(); */ });
    
    dp.on('ended', () => {
        videoHasEnded = true;
        saveCurrentProgress();
        clearVideoProgress(); // Clears old style videoProgress_VID_epX, might be redundant with new system
        if (!autoplayEnabled) return;
        const nextIdx = currentEpisodeIndex + 1;
        if (nextIdx < currentEpisodes.length) {
            setTimeout(() => { if (videoHasEnded && !isUserSeeking) playEpisode(nextIdx); }, 1000);
        }
    });
    dp.on('timeupdate', () => { if (isUserSeeking && dp.video && dp.video.currentTime > dp.video.duration * 0.95) videoHasEnded = false; });

    setTimeout(() => { // Loading timeout message
        if (dp && dp.video && dp.video.readyState < 3 && !videoHasEnded) {
            const loadingEl = document.getElementById('loading');
            if (loadingEl && loadingEl.style.display !== 'none') {
                loadingEl.innerHTML = `<div class="loading-spinner"></div><div>视频加载时间较长...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源或刷新</div>`;
            }
        }
    }, 15000);

    // Native fullscreen integration
    (function () { /* ... DPlayer internal fullscreen to native ... */ })();
}

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) backButton.addEventListener('click', () => { window.location.href = 'index.html'; });

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) fullscreenButton.addEventListener('click', () => { if (dp && dp.fullScreen?.toggle) dp.fullScreen.toggle(); /* else fallback */ });
    
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            const urlParamsRetry = new URLSearchParams(window.location.search);
            const videoUrlRetry = urlParamsRetry.get('url');
            if (videoUrlRetry) {
                document.getElementById('error')?.style.setProperty('display', 'none');
                document.getElementById('loading')?.style.setProperty('display', 'flex');
                _tempUrlForCustomHls = videoUrlRetry;
                if (dp && dp.video) { dp.switchVideo({ url: videoUrlRetry, type: 'hls' }); dp.play(); }
                else { initPlayer(videoUrlRetry, urlParamsRetry.get('source_code')); }
            } else { showError('无法重试，视频链接无效'); }
        });
    }

    const prevEpisodeBtn = document.getElementById('prev-episode');
    if (prevEpisodeBtn) prevEpisodeBtn.addEventListener('click', playPreviousEpisode); // Global

    const nextEpisodeBtn = document.getElementById('next-episode');
    if (nextEpisodeBtn) nextEpisodeBtn.addEventListener('click', playNextEpisode); // Global

    const orderBtn = document.getElementById('order-button');
    if (orderBtn) orderBtn.addEventListener('click', toggleEpisodeOrder);

    const lockButton = document.getElementById('lock-button');
    if (lockButton) lockButton.addEventListener('click', toggleLockScreen);
}

function saveVideoSpecificProgress() {
    if (isNavigatingToEpisode) return;
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle || !toggle.checked) return;
    if (!dp || !dp.video || typeof currentVideoTitle === 'undefined' || typeof currentEpisodeIndex !== 'number' || !currentEpisodes || currentEpisodes.length === 0) return;

    const currentTime = Math.floor(dp.video.currentTime);
    const duration = Math.floor(dp.video.duration);
    const showId = getShowIdentifier(false); // Get ID for the whole show

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.95) {
        try {
            let allShowsProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            if (!allShowsProgresses[showId]) allShowsProgresses[showId] = {};
            allShowsProgresses[showId][currentEpisodeIndex.toString()] = currentTime;
            allShowsProgresses[showId].lastPlayedEpisodeIndex = currentEpisodeIndex;
            allShowsProgresses[showId].totalEpisodes = currentEpisodes.length;
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allShowsProgresses));
        } catch (e) { console.error('保存特定视频集数进度失败:', e); }
    }
}

function showError(message) { /* ... same as old ... */ 
    const debugMode = window.PLAYER_CONFIG?.debugMode;
    if (dp && dp.video && dp.video.currentTime > 1 && !debugMode) { return; }
    document.getElementById('loading')?.style.setProperty('display', 'none');
    const errorEl = document.getElementById('error');
    if (errorEl) {
        (errorEl.querySelector('.text-xl.font-bold') || errorEl.children[1]).textContent = message;
        errorEl.style.display = 'flex';
    }
    if (typeof window.showMessage === 'function') window.showMessage(message, 'error');
}

function setupProgressBarPreciseClicks() { /* ... same as old ... */ }
function handleProgressBarClick(e) { /* ... same as old ... */ }
function handleProgressBarTouch(e) { /* ... same as old ... */ }
function handleKeyboardShortcuts(e) { /* ... same as old, ensure playPreviousEpisode/playNextEpisode are global ... */ }
function showShortcutHint(text, direction) { /* ... same as old ... */ }
function setupDoubleClickToPlayPause(dpInstance, videoWrapElement) { /* ... from new.txt ... */ }
function setupLongPressSpeedControl() { /* ... from new.txt ... */ }

function showPositionRestoreHint(position) {
    if (typeof showMessage !== 'function' || !position || position < 10) return;
    showMessage(`已从 ${formatPlayerTime(position)} 继续播放`, 'info');
}

function showMessage(text, type = 'info', duration = 3000) { // Local showMessage for player
    const messageElement = document.getElementById('message');
    if (!messageElement) return;
    const colors = { error: 'bg-red-500', success: 'bg-green-500', warning: 'bg-yellow-500', info: 'bg-blue-500' };
    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm ${colors[type] || colors.info} text-white transition-opacity duration-300 opacity-0`;
    messageElement.textContent = text;
    void messageElement.offsetWidth; // Reflow
    messageElement.classList.remove('opacity-0'); messageElement.classList.add('opacity-100');
    if (messageElement._messageTimeout) clearTimeout(messageElement._messageTimeout);
    messageElement._messageTimeout = setTimeout(() => {
        messageElement.classList.remove('opacity-100'); messageElement.classList.add('opacity-0');
        messageElement._messageTimeout = null;
    }, duration);
}

function toggleLockScreen() { /* ... from new.txt ... */ }
function renderEpisodes() { /* ... same as old, ensure playEpisode is global or correctly scoped ... */ }
function updateEpisodeInfo() { /* ... same as old ... */ }
function copyLinks() { /* ... same as old, ensure showToast is available ... */ }
function toggleEpisodeOrder() { /* ... same as old ... */ }
function updateOrderButton() { /* ... same as old ... */ }

// Ensure these are global or correctly scoped if called from HTML strings or other modules
window.playPreviousEpisode = function() {
    if (!currentEpisodes.length) return;
    const prevIdx = currentEpisodeIndex - 1;
    if (prevIdx >= 0) playEpisode(prevIdx);
    else if (typeof showMessage === 'function') showMessage('已经是第一集了', 'info');
};
window.playNextEpisode = function() {
    if (!currentEpisodes.length) return;
    const nextIdx = currentEpisodeIndex + 1;
    if (nextIdx < currentEpisodes.length) playEpisode(nextIdx);
    else if (typeof showMessage === 'function') showMessage('已经是最后一集了', 'info');
};

function updateButtonStates() { /* ... same as old ... */ }

function saveCurrentProgress() { // Saves to the main viewing history list (ui.js)
    if (!dp || !dp.video || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = dp.video.currentTime;
    const duration = dp.video.duration;
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) {
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex],
                episodeIndex: window.currentEpisodeIndex,
                vod_id: vodIdForPlayer || '', // Pass VOD ID
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
                sourceName: new URLSearchParams(window.location.search).get('source') || '',
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                episodes: window.currentEpisodes
            };
            window.addToViewingHistory(videoInfo); // Call global function from ui.js
        } catch (e) { console.error('保存播放进度失败:', e); }
    }
}

function startProgressSaveInterval() {
    if (progressSaveInterval) clearInterval(progressSaveInterval);
    progressSaveInterval = setInterval(() => {
        saveCurrentProgress(); 
        saveVideoSpecificProgress(); 
    }, 8000);
}

function saveToHistory() { // Initial save or episode change save
    if (!dp || !dp.video || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            vod_id: vodIdForPlayer || '', // Pass VOD ID
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            episodes: window.currentEpisodes,
            playbackPosition: Math.floor(dp.video.currentTime),
            duration: Math.floor(dp.video.duration) || 0,
            timestamp: Date.now()
        };
        window.addToViewingHistory(videoInfo);
    } catch (e) { console.error('保存到历史记录失败:', e); }
}

function clearVideoProgress() { // Clears old style localStorage key, might be less relevant now
    const progressKey = `videoProgress_${currentVideoTitle}_${new URLSearchParams(window.location.search).get('source_code') || 'unknown'}_ep${window.currentEpisodeIndex}`;
    try { localStorage.removeItem(progressKey); } catch (e) { console.error('清除旧播放进度记录失败', e); }
}


function playEpisode(index) {
    if (!dp) { if (typeof showError === 'function') showError("播放器遇到问题，无法切换。"); return; }
    if (!currentEpisodes || index < 0 || index >= currentEpisodes.length) { if (typeof showError === 'function') showError("无效的剧集选择。"); return; }
    if (isNavigatingToEpisode && currentEpisodeIndex === index) return;

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
        const showId = getShowIdentifier(false); // Get ID for the whole show
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
                    if (!wantsToResume) { // Clear specific progress if "From Start"
                         try {
                            const show_Id_for_clear = getShowIdentifier(false);
                            const all_prog = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                            if (all_prog[show_Id_for_clear] && all_prog[show_Id_for_clear][index.toString()]) {
                                delete all_prog[show_Id_for_clear][index.toString()];
                                localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(all_prog));
                            }
                        } catch (e) { console.warn('清除本集特定进度失败：', e); }
                    }
                    doEpisodeSwitch(index, newEpisodeUrl);
                });
                return; // Wait for modal
            }
        }
    }
    doEpisodeSwitch(index, newEpisodeUrl); // No modal, or no progress to restore for this episode
}
window.playEpisode = playEpisode; // Make it global

function doEpisodeSwitch(index, url) {
    currentEpisodeIndex = index; window.currentEpisodeIndex = index;
    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;
    if (typeof updateEpisodeInfo === 'function') updateEpisodeInfo();
    if (typeof renderEpisodes === 'function') renderEpisodes();
    if (typeof updateButtonStates === 'function') updateButtonStates();

    const loadingEl = document.getElementById('loading');
    if (loadingEl) { /* ... show loading ... */ }
    document.getElementById('error')?.style.setProperty('display', 'none');

    _tempUrlForCustomHls = url;
    if (dp && dp.video) { // Ensure dp and dp.video exist
        dp.video.pause();
        dp.switchVideo({ url: url, type: 'hls' });
        patchAndroidVideoHack();
        if (typeof handleSkipIntroOutro === 'function') handleSkipIntroOutro(dp);
    } else {
        // If dp is not initialized, re-initialize (should ideally not happen if player is already on page)
        initPlayer(url, new URLSearchParams(window.location.search).get('source_code'));
    }
    videoHasEnded = false;

    const newUrlForBrowser = new URL(window.location.href);
    newUrlForBrowser.searchParams.set('url', url);
    newUrlForBrowser.searchParams.set('title', currentVideoTitle);
    newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());
    if (vodIdForPlayer) newUrlForBrowser.searchParams.set('id', vodIdForPlayer); // Persist VOD ID
    // ... (rest of URL param updates)
    const currentSourceCode = new URLSearchParams(window.location.search).get('source_code');
    if (currentSourceCode) newUrlForBrowser.searchParams.set('source_code', currentSourceCode);
    const adFilteringStorageKey = PLAYER_CONFIG?.adFilteringStorage || 'adFilteringEnabled';
    const adFilteringActive = getBoolConfig(adFilteringStorageKey, false);
    newUrlForBrowser.searchParams.set('af', adFilteringActive ? '1' : '0');
    newUrlForBrowser.searchParams.delete('position'); // Clear old position
    
    window.history.pushState({ path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex }, '', newUrlForBrowser.toString());
}
