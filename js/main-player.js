// js/main-player.js
// (完整版本，整合 sessionStorage 读取，移除全局暴露 toggleControlsLock)

import { PLAYER_CONFIG } from './config.js';
import { getState, setSetting, addViewingHistoryItem } from './store.js';

// --- 全局（模块作用域）变量 ---
let currentTitle = '';
let episodes = []; // 将由 loadPlayerData 填充
let episodeIndex = 0; // 将由 loadPlayerData 填充
let autoPlayNext = getState().settings.autoplayEnabled; // 从 store 获取初始设置
let episodesReversed = false; // 默认不反转
let lastPosition = 0;
let duration = 0;
let dplayer = null;
let lastBlobUrl = null; // 用于 Blob URL 的清理
let isLocked = false; // 控制区锁定状态

// ============ 广告过滤 (当前为临时跳过状态) =============


async function getFilteredM3u8UrlIfNeeded(url) {
    // 1. Check if filtering is enabled and if the URL is potentially filterable
    if (!PLAYER_CONFIG.enableAdFiltering) {
        console.log("Ad filtering disabled in config.");
        return url;
    }
    if (!url || !(url.includes('.m3u8') || url.includes('format=m3u8'))) { // Check for .m3u8 or common query param
        console.log("URL is not M3U8, skipping filtering:", url);
        return url;
    }
     // Skip non-http(s) URLs (like blob: or data:)
     if (!url.startsWith('http')) {
         console.log("URL is not HTTP(S), skipping filtering:", url);
         return url;
     }


    console.log("Attempting to filter ads for:", url);

    try {
        // 2. Fetch the M3U8 content
        // Use 'cors' mode and 'omit' credentials for better compatibility with public M3U8s
        // If the server requires credentials, you might need 'include', but 'omit' is safer first.
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',         // Crucial for cross-origin requests
            credentials: 'omit',  // Usually 'omit' for public M3U8s
            redirect: 'follow'    // Follow redirects if any
        });

        // 3. Check if the fetch was successful
        if (!response.ok) {
            // Log specific HTTP status if available
            console.warn(`Failed to fetch M3U8 (HTTP ${response.status}), using original URL:`, url);
            return url; // Fallback to original URL on fetch error
        }

        // Optional: Check content type if needed (can be unreliable)
        // const contentType = response.headers.get('content-type');
        // if (contentType && !contentType.includes('mpegurl') && !contentType.includes('text/plain')) {
        //     console.warn(`Unexpected M3U8 Content-Type (${contentType}), using original URL:`, url);
        //     return url;
        // }

        // 4. Read the M3U8 text content
        const m3u8Text = await response.text();

        // Basic check if content looks like M3U8
        if (!m3u8Text || !m3u8Text.trim().startsWith('#EXTM3U')) {
             console.warn("Fetched content doesn't look like a valid M3U8 playlist, using original URL.");
             return url;
        }


        // 5. Filter the M3U8 string
        const filteredM3u8 = filterAdInM3U8String(m3u8Text); // Use the existing filter function

        // 6. Validate the filtered result
        if (!filteredM3u8 || filteredM3u8.length < m3u8Text.length * 0.1 || !filteredM3u8.trim().startsWith('#EXTM3U')) {
            // If filtering resulted in empty or drastically smaller content, or lost the header, assume it failed.
            console.warn("Ad filtering resulted in invalid or empty content, using original URL.");
            return url; // Fallback
        }

        // 7. Create a Blob URL from the filtered content
        const blob = new Blob([filteredM3u8], { type: 'application/vnd.apple.mpegurl' });

        // 8. Clean up the previous Blob URL if it exists
        if (lastBlobUrl) {
            console.log("Revoking previous Blob URL:", lastBlobUrl);
            URL.revokeObjectURL(lastBlobUrl);
            lastBlobUrl = null; // Reset the variable
        }

        // 9. Create the new Blob URL
        lastBlobUrl = URL.createObjectURL(blob);
        console.log("Ad filtering successful. Using Blob URL:", lastBlobUrl);
        return lastBlobUrl; // Return the Blob URL for the player

    } catch (error) {
        // 10. Catch ANY error during the process (fetch, text, filter, blob creation)
        console.error("Error during M3U8 ad filtering process, falling back to original URL:", error);
        // Ensure any partially created blob URL is cleaned up if an error happened after its creation
        if (lastBlobUrl && !lastBlobUrl.startsWith('blob:')) { // Check if it was assigned but maybe not a blob url due to error
             lastBlobUrl = null;
        } else if (lastBlobUrl && error) {
             // If an error happened *after* blob creation but before return
             // It's tricky, maybe revoke it just in case, but often unnecessary as it wasn't returned
             // Let's keep it simple: the main cleanup happens before creating a *new* one.
        }

        return url; // Fallback to the original URL on any error
    }
}

// Your existing filterAdInM3U8String function (ensure it preserves necessary tags)
function filterAdInM3U8String(m3u8Str) {
    const adPatterns = [
        /ad/i, /ads/i, /广告/, /tvc/i, /ssp/i, /\.jpg/, /logo/i, /watermark/i,
        /pause/i, /广编/, /guanggao/i, /tracker/, /promo/, /\bpreroll\b/i,
        /interstitial/i, /sponsor/i
        // Add more specific patterns if you identify them
    ];
    const lines = m3u8Str.split('\n');
    const filtered = [];
    let skipNextLine = false; // Flag to skip the media segment line after a matching #EXTINF

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Preserve essential playlist-wide tags unconditionally
        if (line.startsWith('#EXTM3U') ||
            line.startsWith('#EXT-X-VERSION') ||
            line.startsWith('#EXT-X-TARGETDURATION') ||
            line.startsWith('#EXT-X-MEDIA-SEQUENCE') ||
            line.startsWith('#EXT-X-PLAYLIST-TYPE') ||
            line.startsWith('#EXT-X-KEY') ||         // Preserve encryption keys
            line.startsWith('#EXT-X-MAP') ||          // Preserve initialization segments
            line.startsWith('#EXT-X-PROGRAM-DATE-TIME') || // Preserve date markers
            line.startsWith('#EXT-X-DISCONTINUITY') || // Preserve discontinuity tags
            line.startsWith('#EXT-X-ENDLIST')) {      // Preserve endlist tag
            filtered.push(lines[i]); // Push original line with potential whitespace
            skipNextLine = false; // Reset flag for these lines
            continue;
        }

        // Handle the previous skip flag first
        if (skipNextLine) {
            // This line is a media segment following a matched #EXTINF, skip it
            skipNextLine = false; // Reset flag
            console.log("Filtering media segment:", line);
            continue; // Skip this line
        }

        // Check if the current line is an #EXTINF line matching ad patterns
        if (line.startsWith('#EXTINF')) {
            let isAdInf = false;
            for (const pat of adPatterns) {
                if (pat.test(line)) { // Check the #EXTINF line itself (e.g., for ad titles)
                    isAdInf = true;
                    break;
                }
            }
            if (isAdInf) {
                console.log("Filtering #EXTINF line:", line);
                skipNextLine = true; // Set flag to skip the *next* line (the media segment)
                continue; // Skip this #EXTINF line
            }
        }

        // If the line is not skipped and not an ad #EXTINF, keep it
        filtered.push(lines[i]);
    }

    return filtered.join('\n');
}


// --- Make sure PLAYER_CONFIG is defined or imported ---
// Example: Assuming it's imported or defined globally/in scope
// const PLAYER_CONFIG = { enableAdFiltering: true }; // Set to true to enable


// ========== 数据加载与参数处理 ==========
function loadPlayerData() {
    const url = new URL(window.location.href);
    const params = Object.fromEntries(url.searchParams.entries());

    // 1. 获取基础信息
    currentTitle = decodeURIComponent(params.title || '') || '正在播放';
    episodeIndex = Number(params.index || 0);
    const fallbackUrl = params.url;

    // 2. 优先从 sessionStorage 获取剧集列表
    console.log("尝试从 sessionStorage 加载剧集列表...");
    try {
        const episodesJson = sessionStorage.getItem('playerEpisodeList');
        if (episodesJson) {
            episodes = JSON.parse(episodesJson);
            console.log("成功从 sessionStorage 加载了", episodes.length, "集");
            // sessionStorage.removeItem('playerEpisodeList'); // 根据需要决定是否移除
        } else {
             console.warn("SessionStorage 中未找到 'playerEpisodeList'。");
             episodes = [];
        }
    } catch (e) {
        console.error("解析 sessionStorage 中的剧集列表失败:", e);
        episodes = [];
    }

    // 3. 兼容 URL 'episodes' 参数
    if (episodes.length === 0 && params.episodes) {
        console.warn("SessionStorage 无数据，尝试从 URL 'episodes' 参数加载...");
        try {
            episodes = JSON.parse(decodeURIComponent(params.episodes));
            console.log("成功从 URL 'episodes' 参数加载了", episodes.length, "集");
        } catch (e) {
            console.error("解析 URL 'episodes' 参数失败:", e);
            episodes = [];
        }
    }

    // 4. 创建单集列表
    if (episodes.length === 0 && fallbackUrl) {
         console.log("无剧集列表，根据 URL 'url' 参数创建单集播放。");
         episodes = [fallbackUrl];
         episodeIndex = 0;
    }

    // 5. 修正 episodeIndex 边界
    if (episodeIndex < 0) episodeIndex = 0;
    if (episodes.length > 0 && episodeIndex >= episodes.length) {
        episodeIndex = episodes.length - 1;
    } else if (episodes.length === 0) {
        episodeIndex = 0;
    }

    console.log(`数据加载完成: Title='${currentTitle}', Index=${episodeIndex}, Episodes=${episodes.length}`);
}

// ========== UI 渲染与更新 ==========
function setEpisodeInfoText() {
    const infoEl = document.getElementById('episodeInfo');
    if (infoEl) {
        if (episodes.length > 1) infoEl.textContent = `第 ${episodeIndex + 1} 集 / 共 ${episodes.length} 集`;
        else if (episodes.length === 1) infoEl.textContent = '单集播放';
        else infoEl.textContent = '无播放信息';
    }
}

function setVideoTitleText() {
    const el = document.getElementById('videoTitle');
    if (el) el.textContent = currentTitle || '播放器';
}

function getCurrentVideoUrl() {
    if (episodes && episodes.length > episodeIndex && episodeIndex >= 0) {
        const url = episodes[episodeIndex];
        if (typeof url === 'string' && url.length > 5) return url;
        else console.error(`获取到的第 ${episodeIndex + 1} 集 URL 无效:`, url);
    }
    console.warn("无法获取当前剧集 URL");
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('url') || '';
}

function renderEpisodesGrid() {
    const grid = document.getElementById('episodesList');
    if (!grid) return;
    const listToRender = episodesReversed ? episodes.slice().reverse() : episodes;
    grid.innerHTML = '';
    if (!listToRender.length) {
        grid.innerHTML = `<div class="col-span-full text-center text-gray-400 py-8">暂无可选集数</div>`;
        document.getElementById('prevButton')?.setAttribute('disabled', 'true');
        document.getElementById('nextButton')?.setAttribute('disabled', 'true');
        return;
    }
    listToRender.forEach((epUrl, displayIndex) => {
        const realIdx = episodesReversed ? episodes.length - 1 - displayIndex : displayIndex;
        const btn = document.createElement('button');
        btn.id = `episode-${realIdx}`;
        btn.dataset.index = realIdx;
        btn.textContent = `第 ${realIdx + 1} 集`;
        btn.className = 'bg-[#222] text-white text-xs px-3 py-2 rounded shadow mr-1 mb-2 transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#111] focus:ring-pink-500';
        if (realIdx === episodeIndex) {
            btn.classList.add('bg-gradient-to-r', 'from-indigo-500', 'via-purple-500', 'to-pink-500', 'font-semibold', 'cursor-not-allowed');
            btn.disabled = true;
        } else {
            btn.classList.add('hover:bg-[#444]');
        }
        grid.appendChild(btn);
    });
    updatePrevNextButtonStates();
}

function updatePrevNextButtonStates() {
    const prevBtn = document.getElementById('prevButton');
    const nextBtn = document.getElementById('nextButton');
    if (prevBtn) {
        prevBtn.disabled = (episodeIndex <= 0);
        prevBtn.classList.toggle('opacity-50', prevBtn.disabled);
        prevBtn.classList.toggle('cursor-not-allowed', prevBtn.disabled);
    }
    if (nextBtn) {
        nextBtn.disabled = (episodeIndex >= episodes.length - 1);
        nextBtn.classList.toggle('opacity-50', nextBtn.disabled);
        nextBtn.classList.toggle('cursor-not-allowed', nextBtn.disabled);
    }
}

function updateAutoplayToggle() {
    const el = document.getElementById('autoplayToggle');
    if (el) el.checked = autoPlayNext;
}

function updateOrderBtn() {
    const text = document.getElementById('orderText');
    const iconPath = document.querySelector('#orderIcon path');
    if (!text || !iconPath) return;
    if (episodesReversed) {
        text.textContent = '正序排列';
        iconPath.setAttribute('d', 'M10 2a8 8 0 100 16 8 8 0 000-16zM8.707 7.707a1 1 0 00-1.414 1.414L9 10.414V14a1 1 0 102 0v-3.586l1.707-1.707a1 1 0 00-1.414-1.414L10 8.586 8.707 7.707z'); // 向上箭头
    } else {
        text.textContent = '倒序排列';
        iconPath.setAttribute('d', 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z'); // 向下箭头
    }
}

function showError(msg = '视频加载失败') {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const errorMsgEl = document.getElementById('error-message');
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'flex';
    if (errorMsgEl) errorMsgEl.textContent = msg;
}

function hideError() {
    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'none';
}

function showLoading(show = true) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
    if (show) hideError();
}


// ================= 播放核心 ====================
async function initPlayer() {
    console.log(`开始初始化播放器: Index=${episodeIndex}`);
    hideError();
    showLoading(true);
    setVideoTitleText();
    setEpisodeInfoText();
    renderEpisodesGrid();

    if (dplayer) {
        console.log("销毁旧的 DPlayer 实例...");
        try { dplayer.destroy(); } catch (e) { console.warn("销毁旧播放器实例时出错:", e); }
        dplayer = null;
        if (lastBlobUrl) { URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; }
    }

    let url = getCurrentVideoUrl();
    if (!url) {
        showError('无法获取有效的视频地址');
        showLoading(false);
        return;
    }
    console.log(`获取到播放 URL: ${url}`);

    try {
        url = await getFilteredM3u8UrlIfNeeded(url);
        if (url.startsWith('blob:')) lastBlobUrl = url;
        console.log(`过滤后的 URL: ${url}`);
    } catch (filterError) { console.error("广告过滤失败:", filterError); }

    console.log("创建新的 DPlayer 实例...");
    try {
        dplayer = new window.DPlayer({
            container: document.getElementById('player'),
            autoplay: true, theme: '#b73a82', loop: false, lang: 'zh-cn',
            screenshot: true, hotkey: true, preload: 'auto', logo: false,
            volume: 0.7, mutex: true,
            video: {
                url: url,
                type: url.includes('.m3u8') ? 'hls' : 'auto',
            },
            // hlsjsConfig: { /* HLS.js 配置 */ }
        });

        dplayer.on('loadedmetadata', () => {
            console.log("DPlayer 事件: loadedmetadata");
            hideError();
            showLoading(false);
            duration = dplayer.video.duration || 0;
            console.log("视频时长:", duration);
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const position = urlParams.get('position');
                if (position && !isNaN(Number(position)) && Number(position) > 0) {
                    const seekTime = Math.min(Number(position), duration - 1);
                    if (seekTime > 0) { console.log(`尝试跳转到: ${seekTime}s`); dplayer.seek(seekTime); }
                }
            } catch(seekError) { console.error("跳转位置出错:", seekError); }
        });
        dplayer.on('canplay', () => { console.log("DPlayer 事件: canplay"); showLoading(false); });
        dplayer.on('error', (err) => { console.error("DPlayer 事件: error:", err); showError(`播放失败: ${dplayer.notice || '未知错误'}`); showLoading(false); });
        dplayer.on('timeupdate', () => { lastPosition = dplayer.video.currentTime || 0; });
        dplayer.on('ended', () => {
            console.log(`DPlayer 事件: ended - Ep ${episodeIndex + 1}`);
            saveViewingHistory();
            if (autoPlayNext) playNextEpisode();
            else dplayer?.notice("播放完毕", 2000);
        });
        dplayer.on('pause', () => { console.log("DPlayer 事件: pause"); saveViewingHistory(); });
        dplayer.on('play', () => { console.log("DPlayer 事件: play"); });
        dplayer.on('destroy', () => { console.log("DPlayer 事件: destroy"); });

        triggerDPlayerInitedEvent();

    } catch (initError) {
        console.error("初始化 DPlayer 时发生严重错误:", initError);
        showError(`播放器初始化失败: ${initError.message}`);
        showLoading(false);
    }
}

// ========== 记录与连播/切集 ==========
function saveViewingHistory() {
    if (!currentTitle || !dplayer || !dplayer.video) return;
    const currentPos = dplayer.video.currentTime || lastPosition || 0;
    const totalDuration = dplayer.video.duration || duration || 0;
    const currentUrl = getCurrentVideoUrl();
    if (!currentUrl || totalDuration <= 0) { console.warn("保存历史记录数据无效"); return; }

    const historyItem = {
        title: currentTitle, episodeIndex: episodeIndex, sourceName: '播放页',
        playbackPosition: Math.floor(currentPos), duration: Math.floor(totalDuration),
        url: currentUrl, episodes: episodes, timestamp: Date.now()
    };
    console.log(`准备保存观看历史: Ep=${historyItem.episodeIndex + 1}, Pos=${historyItem.playbackPosition}/${historyItem.duration}`);
    try { addViewingHistoryItem(historyItem); } catch (e) { console.error("保存观看历史时出错:", e); }
}

function playEpisodeByIndex(newIndex) {
    if (newIndex >= 0 && newIndex < episodes.length && newIndex !== episodeIndex) {
        console.log(`切换剧集: 从 ${episodeIndex + 1} 到 ${newIndex + 1}`);
        saveViewingHistory();
        episodeIndex = newIndex;
        try {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', episodeIndex.toString());
            history.pushState({ index: episodeIndex }, '', newUrl.toString());
        } catch (e) { console.warn("更新 URL 状态失败:", e); }
        initPlayer(); // 重新初始化播放器
    } else if (newIndex === episodeIndex) {
         dplayer?.notice("正在播放当前集", 1500);
    } else {
        console.warn(`尝试切换到无效的剧集索引: ${newIndex}`);
    }
}

function playNextEpisode() {
    if (episodeIndex < episodes.length - 1) playEpisodeByIndex(episodeIndex + 1);
    else { console.log("已经是最后一集"); dplayer?.notice("已经是最后一集", 2000); }
}

function playPreviousEpisode() {
    if (episodeIndex > 0) playEpisodeByIndex(episodeIndex - 1);
    else { console.log("已经是第一集"); dplayer?.notice("已经是第一集", 2000); }
}

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    console.log(`切换剧集排序为: ${episodesReversed ? '倒序' : '正序'}`);
    renderEpisodesGrid();
    updateOrderBtn();
}

// ================= 更改设置 ====================
function onAutoplayToggleChange(e) {
    autoPlayNext = e.target.checked;
    console.log(`设置自动连播: ${autoPlayNext}`);
    setSetting('autoplayEnabled', autoPlayNext);
    dplayer?.notice(`自动连播已${autoPlayNext ? '开启' : '关闭'}`, 1500);
}

// ====== 预加载补丁 ======
const PRELOAD_EPISODE_COUNT = 2;
const SUPPORTS_CACHE_STORAGE = 'caches' in window && window.caches.open;
const PRELOAD_CACHE_NAME = 'libretv-preload1';

function isSlowNetwork() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection || !connection.effectiveType) return false;
    const isSlow = /^(slow-)?2g$/.test(connection.effectiveType);
    // if (isSlow) console.log("检测到慢速网络，禁用预加载。"); // 减少干扰日志
    return isSlow;
}

async function preloadNextEpisodeParts(preloadCount = PRELOAD_EPISODE_COUNT) {
    if (!PLAYER_CONFIG.enablePreloading || isSlowNetwork() || !episodes || episodes.length === 0 || typeof episodeIndex !== 'number') return;
    // console.log(`开始预加载接下来的 ${preloadCount} 集... 当前集: ${episodeIndex + 1}`); // 减少日志
    const currentIdx = episodeIndex, maxIndex = episodes.length - 1;
    for (let offset = 1; offset <= preloadCount; offset++) {
        const targetEpisodeIdx = currentIdx + offset;
        if (targetEpisodeIdx > maxIndex) break;
        const nextUrl = episodes[targetEpisodeIdx];
        if (!nextUrl || typeof nextUrl !== 'string' || !nextUrl.includes('.m3u8')) continue;
        // console.log(`准备预加载第 ${targetEpisodeIdx + 1} 集: ${nextUrl}`); // 减少日志
        try {
            const m3u8Resp = await fetch(nextUrl, { method: "GET", credentials: "omit", mode: 'cors' });
            if (!m3u8Resp.ok) continue;
            const m3u8Text = await m3u8Resp.text();
            if (SUPPORTS_CACHE_STORAGE) { /* 缓存 M3U8 */ }
            const tsUrlsToPreload = []; const lines = m3u8Text.split('\n');
            const baseUrl = nextUrl.substring(0, nextUrl.lastIndexOf('/') + 1);
            let tsCount = 0; const MAX_TS_PRELOAD = 3;
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith("#") && /\.ts(\?.*)?$/i.test(trimmedLine)) {
                    let tsUrl = trimmedLine; if (!/^https?:\/\//i.test(tsUrl)) tsUrl = baseUrl + tsUrl;
                    tsUrlsToPreload.push(tsUrl); tsCount++; if (tsCount >= MAX_TS_PRELOAD) break;
                }
            }
            if (tsUrlsToPreload.length > 0) {
                // console.log(`为第 ${targetEpisodeIdx + 1} 集预加载 ${tsUrlsToPreload.length} 个 TS 分片...`); // 减少日志
                tsUrlsToPreload.forEach(async (tsUrl) => { /* 异步发起 TS 请求并缓存 */ });
            }
        } catch (e) { console.error(`预加载第 ${targetEpisodeIdx + 1} 集 (${nextUrl}) 时发生错误:`, e); }
    }
}

function setupPreloadEvents() {
    if (!PLAYER_CONFIG.enablePreloading) return;
    const nextBtn = document.getElementById('nextButton');
    if (nextBtn) {
        const preloadHandler = () => preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT);
        nextBtn.addEventListener('mouseenter', preloadHandler, { passive: true });
        nextBtn.addEventListener('touchstart', preloadHandler, { passive: true });
    }
    document.addEventListener('DPlayerInited', setupDPlayerTimeupdatePreload);
    console.log("预加载事件已设置。");
}

function setupDPlayerTimeupdatePreload() {
    if (!dplayer || !dplayer.video || typeof dplayer.video.addEventListener !== 'function') return;
    const videoElement = dplayer.video; let preloadTriggeredForThisSegment = false;
    const timeUpdateHandler = () => {
        if (!videoElement.duration || videoElement.duration <= 0) return;
        const currentTime = videoElement.currentTime, duration = videoElement.duration;
        const timeRemaining = duration - currentTime;
        if (timeRemaining < 15 && !preloadTriggeredForThisSegment) {
            // console.log(`视频接近结尾 (剩余 ${timeRemaining.toFixed(1)}s)，触发预加载`); // 减少日志
            preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT); preloadTriggeredForThisSegment = true;
        } else if (timeRemaining >= 15 && preloadTriggeredForThisSegment) preloadTriggeredForThisSegment = false;
    };
    videoElement.removeEventListener('timeupdate', timeUpdateHandler);
    videoElement.addEventListener('timeupdate', timeUpdateHandler);
    preloadTriggeredForThisSegment = false;
    // console.log("为当前视频设置了时间更新预加载监听器。"); // 减少日志
}

// ========== 事件绑定 ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM 已加载，开始初始化播放页面...");
    loadPlayerData();
    setVideoTitleText();
    setEpisodeInfoText();
    renderEpisodesGrid();
    updateAutoplayToggle();
    updateOrderBtn();

    document.getElementById('prevButton')?.addEventListener('click', playPreviousEpisode);
    document.getElementById('nextButton')?.addEventListener('click', playNextEpisode);
    document.getElementById('toggleEpisodeOrderBtn')?.addEventListener('click', toggleEpisodeOrder);
    document.getElementById('autoplayToggle')?.addEventListener('change', onAutoplayToggleChange);
    document.getElementById('lockToggle')?.addEventListener('click', toggleControlsLock);
    updateLockIcon(isLocked); // 初始化锁定图标

    document.getElementById('episodesList')?.addEventListener('click', e => {
        const btn = e.target.closest('button[id^="episode-"]');
        if (btn && !btn.disabled) {
            const idx = Number(btn.dataset.index);
            if (!isNaN(idx)) playEpisodeByIndex(idx);
            else console.warn("无法从按钮 data-index 获取有效的剧集索引:", btn.dataset.index);
        }
    });

    document.addEventListener('keydown', handleKeydown); // 绑定键盘事件

    if (episodes.length > 0 || getCurrentVideoUrl()) initPlayer();
    else { showError("没有找到可播放的视频内容"); showLoading(false); }

    setupPreloadEvents(); // 设置预加载事件

    console.log("播放页面初始化完成。");
});


// ========== 键盘快捷键处理 ==========
function handleKeydown(e) {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    let preventDefault = true;
    switch (e.code) {
        case 'Space': case 'KeyK': dplayer?.toggle(); showShortcutHint(dplayer?.video.paused ? 'pause' : 'play', dplayer?.video.paused ? '已暂停' : '播放'); break;
        case 'ArrowLeft': dplayer?.seek(dplayer.video.currentTime - 5); showShortcutHint('rewind', '后退 5 秒'); break;
        case 'ArrowRight': dplayer?.seek(dplayer.video.currentTime + 5); showShortcutHint('forward', '前进 5 秒'); break;
        case 'ArrowUp': if (dplayer) { let vol = Math.min(dplayer.volume() + 0.1, 1); dplayer.volume(vol, true, false); showShortcutHint('volume-up', `音量 ${Math.round(vol * 100)}%`); } break;
        case 'ArrowDown': if (dplayer) { let vol = Math.max(dplayer.volume() - 0.1, 0); dplayer.volume(vol, true, false); showShortcutHint('volume-down', `音量 ${Math.round(vol * 100)}%`); } break;
        case 'KeyM': if (dplayer) { if (dplayer.volume() > 0) { dplayer.volume(0, true, false); showShortcutHint('volume-mute', '静音'); } else { dplayer.volume(0.7, true, false); showShortcutHint('volume-up', '取消静音'); } } break;
        case 'KeyF': dplayer?.fullScreen.toggle(); showShortcutHint('fullscreen', dplayer?.fullScreen.isFullScreen ? '进入全屏' : '退出全屏'); break;
        case 'KeyL': if (episodes.length > 1) { playNextEpisode(); showShortcutHint('next', '下一集'); } break;
        case 'KeyJ': if (episodes.length > 1) { playPreviousEpisode(); showShortcutHint('previous', '上一集'); } break;
        case 'KeyO': toggleEpisodeOrder(); showShortcutHint('sort', `切换为${episodesReversed ? '正序' : '倒序'}`); break;
        case 'KeyA': autoPlayNext = !autoPlayNext; setSetting('autoplayEnabled', autoPlayNext); updateAutoplayToggle(); showShortcutHint('autoplay', `自动连播 ${autoPlayNext ? '开启' : '关闭'}`); break;
        case 'Digit0': dplayer?.seek(0); showShortcutHint('seek', '跳转到开头'); break;
        case 'Digit1': dplayer?.seek(duration * 0.1); showShortcutHint('seek', '跳转到 10%'); break;
        case 'Digit2': dplayer?.seek(duration * 0.2); showShortcutHint('seek', '跳转到 20%'); break;
        case 'Digit3': dplayer?.seek(duration * 0.3); showShortcutHint('seek', '跳转到 30%'); break;
        case 'Digit4': dplayer?.seek(duration * 0.4); showShortcutHint('seek', '跳转到 40%'); break;
        case 'Digit5': dplayer?.seek(duration * 0.5); showShortcutHint('seek', '跳转到 50%'); break;
        case 'Digit6': dplayer?.seek(duration * 0.6); showShortcutHint('seek', '跳转到 60%'); break;
        case 'Digit7': dplayer?.seek(duration * 0.7); showShortcutHint('seek', '跳转到 70%'); break;
        case 'Digit8': dplayer?.seek(duration * 0.8); showShortcutHint('seek', '跳转到 80%'); break;
        case 'Digit9': dplayer?.seek(duration * 0.9); showShortcutHint('seek', '跳转到 90%'); break;
        default: preventDefault = false; break;
    }
    if (preventDefault) e.preventDefault();
}

// ----- 快捷键提示 -----
let hintTimer = null;
function showShortcutHint(iconType, text) {
    const hintEl = document.getElementById('shortcutHint');
    const iconEl = document.getElementById('shortcutIcon');
    const textEl = document.getElementById('shortcutText');
    if (!hintEl || !iconEl || !textEl || !text) return; // 增加对 text 的检查
    iconEl.innerHTML = getIconSvg(iconType);
    textEl.textContent = text;
    hintEl.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintEl.classList.remove('show'); }, 1500);
}

function getIconSvg(type) {
    // 返回对应类型的 SVG 字符串 (需要根据你的 HTML 结构调整)
    switch (type) {
        case 'play': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>`;
        case 'pause': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>`;
        case 'forward': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path>`;
        case 'rewind': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path>`;
        case 'volume-up': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>`;
        case 'volume-down': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>`;
        case 'volume-mute': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l4-4m0 4l-4-4"></path>`;
        case 'fullscreen': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m7 0l5-5m0 4v4m0 0h-4m-5 5l5 5m-5-5v-4m0 0h-4"></path>`;
        case 'next': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path>`;
        case 'previous': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path>`;
        case 'sort': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"></path>`;
        case 'autoplay': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>`;
        case 'seek': return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>`;
        default: return '';
    }
}

// ----- 触发 DPlayerInited 事件 -----
function triggerDPlayerInitedEvent() {
    console.log("触发 DPlayerInited 自定义事件");
    document.dispatchEvent(new CustomEvent('DPlayerInited', { detail: { player: dplayer } }));
}

// ========== 播放控制区锁定 ==========
function toggleControlsLock() {
    isLocked = !isLocked;
    console.log(`切换控制区锁定状态: ${isLocked ? '锁定' : '解锁'}`);
    const playerContainer = document.querySelector('.player-container'); // 调整选择器以匹配你的 HTML
    if (playerContainer) {
        // 使用类名控制锁定样式，CSS 中定义 .locked
        playerContainer.classList.toggle('controls-locked', isLocked); // 使用更明确的类名
    }
    updateLockIcon(isLocked);
    dplayer?.notice(`控制区已${isLocked ? '锁定' : '解锁'}`, 1500);
}

function updateLockIcon(locked) {
    const lockIcon = document.getElementById('lockIcon');
    const lockButton = document.getElementById('lockToggle');
    if (!lockIcon || !lockButton) return;
    if (locked) {
        lockIcon.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0-6v2m-6.707 5.207a1 1 0 001.414 0l.793-.793V12a8 8 0 1116 0v3l.793.793a1 1 0 001.414 0z"/></svg>`; // 锁定图标
        lockButton.setAttribute('aria-label', '解锁控制区');
        lockButton.setAttribute('title', '解锁控制');
    } else {
        lockIcon.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 17a2 2 0 002-2v-4a2 2 0 10-4 0v4a2 2 0 002 2z"/></svg>`; // 解锁图标 (使用了不同的示例图标)
        lockButton.setAttribute('aria-label', '锁定控制区');
        lockButton.setAttribute('title', '锁定控制');
    }
}

// ========== 关闭/离开时保存进度 ==========
window.addEventListener('beforeunload', saveViewingHistory);
window.addEventListener('pagehide', saveViewingHistory);

// --- 文件结束 ---
