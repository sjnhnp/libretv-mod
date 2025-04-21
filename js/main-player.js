import { PLAYER_CONFIG } from './config.js';
import { getState, setSetting, addViewingHistoryItem } from './store.js';

let currentTitle = '';
let episodes = [];
let episodeIndex = 0;
let autoPlayNext = getState().settings.autoplayEnabled;
let episodesReversed = false;
let lastPosition = 0;
let duration = 0;
let dplayer = null;
let lastBlobUrl = null;

// ============ 广告过滤 =============

function filterAdInM3U8String(m3u8Str) {
    const adPatterns = [
        /ad/i, /ads/i, /广告/, /tvc/i, /ssp/i, /\.jpg/, /logo/i, /watermark/i, /pause/i, /广编/, /guanggao/i,
        /tracker/, /promo/, /\bpreroll\b/i, /interstitial/i, /sponsor/i
    ];
    const lines = m3u8Str.split('\n');
    const filtered = [];
    for (let i = 0; i < lines.length; i++) {
        let skip = false;
        for (const pat of adPatterns) {
            if (pat.test(lines[i])) { skip = true; break; }
        }
        if (!skip && i && lines[i-1].startsWith('#EXTINF')) {
            for (const pat of adPatterns) {
                if (pat.test(lines[i])) { skip = true; break; }
            }
        }
        if (!skip) filtered.push(lines[i]);
    }
    return filtered.join('\n');
}

async function getFilteredM3u8UrlIfNeeded(url) {
    console.log("临时测试：跳过广告过滤，直接使用原始 URL:", url); // 添加日志方便确认
    return url; // 直接返回原始 URL
}


// ========== 集数和参数渲染 ==========

function parseUrlParams() {
    const url = new URL(window.location.href);
    const params = Object.fromEntries(url.searchParams.entries());
    params.index = Number(params.index || 0);
    try {
        if (params.episodes) episodes = JSON.parse(params.episodes);
        else episodes = [];
    } catch { episodes = []; }
    if (params.url) {
        if (!episodes.length) episodes = [params.url];
    }
    currentTitle = decodeURIComponent(params.title || '') || '正在播放';
    episodeIndex = Number(params.index || 0);
    if (episodeIndex < 0) episodeIndex = 0;
    if (episodeIndex >= episodes.length) episodeIndex = episodes.length - 1;
    return params;
}
function setEpisodeInfoText() {
    const infoEl = document.getElementById('episodeInfo');
    if (infoEl)
        infoEl.textContent = episodes.length > 0 ? `第 ${episodeIndex + 1} 集 / 共 ${episodes.length} 集` : '';
}
function setVideoTitleText() {
    const el = document.getElementById('videoTitle');
    if (el) el.textContent = currentTitle || '播放';
}
function getCurrentVideoUrl() {
    return episodes[episodeIndex] || '';
}
function renderEpisodesGrid() {
    const list = episodesReversed ? episodes.slice().reverse() : episodes;
    const grid = document.getElementById('episodesList');
    if (!grid) return;
    grid.innerHTML = '';
    if (!list.length) {
        grid.innerHTML = `<div class="col-span-full text-center text-gray-400 py-8">暂无可选集数</div>`;
        return;
    }
    list.forEach((ep, idx) => {
        const realIdx = episodesReversed ? episodes.length - 1 - idx : idx;
        const btn = document.createElement('button');
        btn.id = `episode-${realIdx}`;
        btn.className = 'bg-[#222] hover:bg-[#444] text-white text-xs px-3 py-2 rounded shadow mr-1 mb-2 transition duration-200' + (realIdx === episodeIndex ? ' bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white' : '');
        btn.textContent = `第${realIdx + 1}集`;
        if (realIdx === episodeIndex) btn.disabled = true;
        grid.appendChild(btn);
    });
}
function updateAutoplayToggle() {
    const el = document.getElementById('autoplayToggle');
    if (el) el.checked = autoPlayNext;
}
function updateOrderBtn() {
    const text = document.getElementById('orderText');
    if (text) text.textContent = episodesReversed ? '正序排列' : '倒序排列';
}
function showError(msg) {
    document.getElementById('loading')?.classList.remove('hidden');
    const errBox = document.getElementById('error');
    if (!errBox) return;
    errBox.classList.remove('hidden');
    document.getElementById('error-message').textContent = msg || '视频加载失败';
}
function hideError() {
    document.getElementById('error')?.classList.add('hidden');
    document.getElementById('loading')?.classList.add('hidden');
}
function showLoading(show = true) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}


// ================= 播放核心 ====================

async function initPlayer() {
    hideError();
    showLoading();
    setVideoTitleText();
    setEpisodeInfoText();
    renderEpisodesGrid();

    if (dplayer) {
        dplayer.destroy();
        dplayer = null;
        if (lastBlobUrl) {
            URL.revokeObjectURL(lastBlobUrl);
            lastBlobUrl = null;
        }
    }
    let url = getCurrentVideoUrl();
    if (!url || !/^https?:/.test(url)) {
        showError('视频地址无效');
        return;
    }

    url = await getFilteredM3u8UrlIfNeeded(url);
    if (url.startsWith('blob:')) lastBlobUrl = url;

    dplayer = new window.DPlayer({
        container: document.getElementById('player'),
        autoplay: true,
        hotkey: true,
        screenshot: false,
        logo: false,
        video: {
            url,
            type: url.endsWith('.m3u8') ? 'hls' : 'auto'
        }
    });

    dplayer.on('loadedmetadata', () => {
        hideError();
        showLoading(false);
        duration = dplayer.video.duration || 0;
        try {
            const params = parseUrlParams();
            if (params.position && !isNaN(Number(params.position))) {
                dplayer.seek(Number(params.position));
            }
        } catch {}
    });

    dplayer.on('error', () => {
        showError('播放器解析失败或无权限播放');
    });

    dplayer.on('timeupdate', () => {
        lastPosition = dplayer.video.currentTime || 0;
        duration = dplayer.video.duration || 0;
    });

    dplayer.on('ended', () => {
        saveViewingHistory();
        if (autoPlayNext) playNextEpisode();
    });

    dplayer.on('pause', saveViewingHistory);
    dplayer.on('destroy', () => {
        saveViewingHistory();
        if (lastBlobUrl) {
            URL.revokeObjectURL(lastBlobUrl);
            lastBlobUrl = null;
        }
    });
}

// ========== 记录与连播/切集 ==========
function saveViewingHistory() {
    try {
        if (!currentTitle) return;
        addViewingHistoryItem({
            title: currentTitle,
            episodeIndex,
            sourceName: '播放页',
            playbackPosition: lastPosition || 0,
            duration: duration || 0,
            url: getCurrentVideoUrl(),
            episodes,
            timestamp: Date.now()
        });
    } catch {}
}

function playNextEpisode() {
    if (episodeIndex < episodes.length - 1) {
        episodeIndex++;
        setEpisodeInfoText();
        renderEpisodesGrid();
        initPlayer();
    }
}
function playPreviousEpisode() {
    if (episodeIndex > 0) {
        episodeIndex--;
        setEpisodeInfoText();
        renderEpisodesGrid();
        initPlayer();
    }
}
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    renderEpisodesGrid();
    updateOrderBtn();
}

// ================= 更改设置 ====================
function onAutoplayToggleChange(e) {
    autoPlayNext = e.target.checked;
    setSetting('autoplayEnabled', autoPlayNext);
}


// ====== 预加载补丁 - 新架构集成 ======

// 配置：预加载几集（如2或3）
const PRELOAD_EPISODE_COUNT = 2;  // 可根据需要在 config.js 配成变量
const supportsCacheStorage = 'caches' in window && window.caches.open;

function isSlowNetwork() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection || !connection.effectiveType) return false;
    return /2g|slow-2g/.test(connection.effectiveType);
}

// 主预加载函数
async function preloadNextEpisodeParts(preloadCount = PRELOAD_EPISODE_COUNT) {
    // 控制开关，低速网/配置/无集时跳过
    if (!PLAYER_CONFIG.enablePreloading) return;
    if (isSlowNetwork()) return;
    if (!episodes || typeof episodeIndex !== 'number') return;
    const idx = episodeIndex, maxIndex = episodes.length - 1;
    for (let offset = 1; offset <= preloadCount; offset++) {
        const episodeIdx = idx + offset;
        if (episodeIdx > maxIndex) break;
        const nextUrl = episodes[episodeIdx];
        if (!nextUrl || typeof nextUrl !== 'string') continue;
        try {
            const m3u8Resp = await fetch(nextUrl, { method: "GET", credentials: "same-origin" });
            if (!m3u8Resp.ok) continue;
            const m3u8Text = await m3u8Resp.text();
            const tsUrls = [];
            // 取前3个 ts 分片
            let base = nextUrl.substring(0, nextUrl.lastIndexOf('/') + 1);
            m3u8Text.split('\n').forEach(line => {
                const t = line.trim();
                if (t && !t.startsWith("#") && /\.ts(\?|$)/i.test(t) && tsUrls.length < 3) {
                    tsUrls.push(/^https?:\/\//i.test(t) ? t : base + t);
                }
            });
            for (const tsUrl of tsUrls) {
                // 先查缓存，并拉取分片
                if (supportsCacheStorage) {
                    const cache = await caches.open('libretv-preload1');
                    const cachedResp = await cache.match(tsUrl);
                    if (!cachedResp) {
                        fetch(tsUrl, { method: "GET", credentials: "same-origin" }).then(resp => {
                            if (resp.ok) cache.put(tsUrl, resp.clone());
                        });
                    }
                } else {
                    fetch(tsUrl, { method: "GET", credentials: "same-origin" });
                }
            }
        } catch (e) {
            // 静默
        }
    }
}

// ====== 预加载相关事件注册 ======

function setupPreloadEvents() {
    if (!PLAYER_CONFIG.enablePreloading) return;
    // 鼠标悬停/触摸“下一集”按钮
    const nextBtn = document.getElementById('nextButton');
    if (nextBtn) {
        nextBtn.addEventListener('mouseenter', () => preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT), { passive: true });
        nextBtn.addEventListener('touchstart', () => preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT), { passive: true });
    }
    // 切集按钮点击
    const episodesList = document.getElementById('episodesList');
    if (episodesList) {
        episodesList.addEventListener('click', function (e) {
            const btn = e.target.closest('button[id^="episode-"]');
            if (btn) setTimeout(() => preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT), 200);
        });
    }
    // 当前视频接近结尾，预拉后几集
    function setupDPlayerTimeupdatePreload() {
        if (dplayer && dplayer.video && typeof dplayer.video.addEventListener === 'function') {
            dplayer.video.addEventListener('timeupdate', () => {
                if (
                    dplayer.video.duration &&
                    dplayer.video.currentTime > dplayer.video.duration - 12
                ) {
                    preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT);
                }
            });
        }
    }
    // 在播放器每次 init 后，都做一次绑定
    document.addEventListener('DPlayerInited', setupDPlayerTimeupdatePreload);
    // 首次页面 ready 时延迟装载
    setTimeout(setupDPlayerTimeupdatePreload, 500);
}

// ========== 事件绑定 ==========
document.addEventListener('DOMContentLoaded', () => {
    parseUrlParams();
    setVideoTitleText();
    setEpisodeInfoText();
    renderEpisodesGrid();
    updateAutoplayToggle();
    updateOrderBtn();

    document.getElementById('prevButton')?.addEventListener('click', playPreviousEpisode);
    document.getElementById('nextButton')?.addEventListener('click', playNextEpisode);
    document.getElementById('toggleEpisodeOrderBtn')?.addEventListener('click', toggleEpisodeOrder);

    const autoplayToggle = document.getElementById('autoplayToggle');
    if (autoplayToggle) {
        autoplayToggle.checked = autoPlayNext;
        autoplayToggle.addEventListener('change', onAutoplayToggleChange);
    }

    document.getElementById('lockToggle')?.addEventListener('click', toggleControlsLock);

    document.getElementById('episodesList')?.addEventListener('click', e => {
        const btn = e.target.closest('button[id^="episode-"]');
        if (btn) {
            const idx = Number(btn.id.replace('episode-', ''));
            if (!isNaN(idx) && idx !== episodeIndex) {
                episodeIndex = idx;
                setEpisodeInfoText();
                renderEpisodesGrid();
                initPlayer();
            }
        }
    });

    document.addEventListener('keydown', e => {
        if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        if (e.code === 'KeyJ') playPreviousEpisode();
        else if (e.code === 'KeyL') playNextEpisode();
        else if (e.code === 'KeyO') toggleEpisodeOrder();
        else if (e.code === 'KeyA') {
            autoPlayNext = !autoPlayNext;
            setSetting('autoplayEnabled', autoPlayNext);
            updateAutoplayToggle();
        }
        else if (e.code === 'KeyK' && dplayer) {
            if (dplayer.video.paused) dplayer.play();
            else dplayer.pause();
        }
    });

    // 首次初始化主播放器
    initPlayer();

    // 注：在主逻辑渲染后启动预加载相关事件注册
    setupPreloadEvents();
});

// ----- dplayer 完成每次 init 后发事件, 用于外部补钩子 -----
function triggerDPlayerInitedEvent() {
    document.dispatchEvent(new Event('DPlayerInited'));
}
const oldInitPlayer = initPlayer;
initPlayer = async function() {
    await oldInitPlayer.apply(this, arguments);
    triggerDPlayerInitedEvent();
};


// ========== 播放控制区锁定 ==========
let isLocked = false;
function toggleControlsLock() {
    isLocked = !isLocked;
    const container = document.querySelector('.player-container');
    if (container) {
        if (isLocked) container.classList.add('locked');
        else container.classList.remove('locked');
    }
    const lockIcon = document.getElementById('lockIcon');
    if (lockIcon) {
        lockIcon.innerHTML = isLocked
            ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 15v2m0-6v2m-6.793 5.207a1 1 0 001.414 0l.793-.793V12a8 8 0 1116 0v3l.793.793a1 1 0 001.414 0z" />`
            : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 17a2 2 0 002-2v-4a2 2 0 10-4 0v4a2 2 0 002 2z" />`;
    }
}
window.toggleControlsLock = toggleControlsLock;

// ========== 关闭/离开时保存进度 ==========
window.addEventListener('beforeunload', saveViewingHistory);
window.addEventListener('pagehide', saveViewingHistory);
