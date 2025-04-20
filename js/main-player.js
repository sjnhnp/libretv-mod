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

// ----------- 新增：广告分片过滤工具 -----------

/**
 * 过滤m3u8内容中常见广告片段（ts/url/注释中带广告特征关键字的行及其片段）
 * @param {string} m3u8Str
 * @returns {string}
 */
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
        // ts/url行一般在非#EXT头后一行，广告片段会成对出现
        if (!skip && i && lines[i-1].startsWith('#EXTINF')) {
            for (const pat of adPatterns) {
                if (pat.test(lines[i])) { skip = true; break; }
            }
        }
        if (!skip) filtered.push(lines[i]);
    }
    return filtered.join('\n');
}

/**
 * 若ad过滤开关打开且为m3u8流，则拉取m3u8文本、分片过滤后创建本地blob，返回blob URL
 * @param {string} url
 * @returns {Promise<string>} 可播URL
 */
async function getFilteredM3u8UrlIfNeeded(url) {
    const adFiltering = getState().settings.adFilteringEnabled;
    if (!adFiltering) return url;
    if (!/\.m3u8($|\?)/i.test(url)) return url;
    try {
        const res = await fetch(url, { credentials: 'omit', mode: 'cors' });
        if (!res.ok) throw new Error('m3u8请求失败');
        let text = await res.text();
        text = filterAdInM3U8String(text);
        const blob = new Blob([text], { type: 'application/vnd.apple.mpegurl' });
        const m3u8BlobUrl = URL.createObjectURL(blob);
        return m3u8BlobUrl;
    } catch (e) {
        console.warn('m3u8广告过滤失败，尝试原流', e);
        return url;
    }
}

// ----------- 参数与UI渲染 -----------

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

    // ---------- 广告过滤关键处理 ----------
    url = await getFilteredM3u8UrlIfNeeded(url);
    if (url.startsWith('blob:')) lastBlobUrl = url;
    // -------------------------------------

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
        // 恢复记录点（如有）
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

// ================= 记录与连播/切集 ====================

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


// ========== 事件绑定 ==========
document.addEventListener('DOMContentLoaded', () => {
    parseUrlParams();
    setVideoTitleText();
    setEpisodeInfoText();
    renderEpisodesGrid();
    updateAutoplayToggle();
    updateOrderBtn();

    // Button events
    document.getElementById('prevButton')?.addEventListener('click', playPreviousEpisode);
    document.getElementById('nextButton')?.addEventListener('click', playNextEpisode);
    document.getElementById('toggleEpisodeOrderBtn')?.addEventListener('click', toggleEpisodeOrder);

    const autoplayToggle = document.getElementById('autoplayToggle');
    if (autoplayToggle) {
        autoplayToggle.checked = autoPlayNext;
        autoplayToggle.addEventListener('change', onAutoplayToggleChange);
    }

    document.getElementById('lockToggle')?.addEventListener('click', toggleControlsLock);

    // 剧集按钮事件委托
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

    // 快捷键：J(上一集) K(暂停/播放) L(下一集) O(正倒序) A(自动连播开关)
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

    // 首次初始化
    initPlayer();
});

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

