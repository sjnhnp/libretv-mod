// js/main-player.js
// (完整版本，整合 sessionStorage 读取, 用户广告过滤开关, 错误处理)

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

// --- NEW: Ad Filter State and Icons ---
let isAdFilteringCurrentlyEnabled = PLAYER_CONFIG.adFilteringEnabled; // Initialize with default, will be overwritten by localStorage
const ICON_FILTER_ON = `<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>`; // Example: Shield Check
const ICON_FILTER_OFF = `<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`; // Example: Shield Slash/Eye Off


// ============ 广告过滤 (用户可配置) =============

// --- NEW: Load Initial Ad Filter Setting ---
function loadInitialAdFilterSetting() {
    const storageKey = PLAYER_CONFIG.adFilteringStorage || 'userAdFilteringPreference'; // Use key from config or a default
    try {
        const storedValue = localStorage.getItem(storageKey);
        if (storedValue !== null) {
            isAdFilteringCurrentlyEnabled = (storedValue === 'true'); // Convert string to boolean
            console.log(`Loaded ad filter setting from localStorage (${storageKey}): ${isAdFilteringCurrentlyEnabled}`);
        } else {
            // No stored value, use default from config
            isAdFilteringCurrentlyEnabled = PLAYER_CONFIG.adFilteringEnabled;
            console.log(`No ad filter setting in localStorage, using default: ${isAdFilteringCurrentlyEnabled}`);
            // Optionally save the default to localStorage now
            // localStorage.setItem(storageKey, isAdFilteringCurrentlyEnabled.toString());
        }
    } catch (e) {
        console.error("Error reading ad filter setting from localStorage:", e);
        // Fallback to default config value in case of error
        isAdFilteringCurrentlyEnabled = PLAYER_CONFIG.adFilteringEnabled;
    }
    // Update the UI immediately after loading the setting
    updateAdFilterToggleUI();
}

// --- NEW: Update Ad Filter Toggle UI ---
function updateAdFilterToggleUI() {
    const button = document.getElementById('adFilterToggle');
    const iconSpan = document.getElementById('adFilterIcon');
    if (!button || !iconSpan) {
        // console.warn("Ad filter UI elements (#adFilterToggle or #adFilterIcon) not found.");
        return;
    }

    if (isAdFilteringCurrentlyEnabled) {
        iconSpan.innerHTML = ICON_FILTER_ON;
        button.title = "广告过滤已开启 (点击关闭)";
        button.setAttribute('aria-pressed', 'true'); // For accessibility
    } else {
        iconSpan.innerHTML = ICON_FILTER_OFF;
        button.title = "广告过滤已关闭 (点击开启)";
        button.setAttribute('aria-pressed', 'false'); // For accessibility
    }
}

// --- NEW: Toggle Ad Filtering ---
function toggleAdFiltering() {
    isAdFilteringCurrentlyEnabled = !isAdFilteringCurrentlyEnabled; // Flip the state
    const storageKey = PLAYER_CONFIG.adFilteringStorage || 'userAdFilteringPreference';

    try {
        // Save the new state to localStorage as a string
        localStorage.setItem(storageKey, isAdFilteringCurrentlyEnabled.toString());
        console.log(`Saved ad filter setting to localStorage (${storageKey}): ${isAdFilteringCurrentlyEnabled}`);
    } catch (e) {
        console.error("Error saving ad filter setting to localStorage:", e);
    }

    updateAdFilterToggleUI(); // Update button appearance

    // Show a notification (requires dplayer instance)
    dplayer?.notice(`广告过滤已${isAdFilteringCurrentlyEnabled ? '开启' : '关闭'} (下次加载生效)`, 2000);
    console.log(`Ad filtering toggled to: ${isAdFilteringCurrentlyEnabled}. Change applies on next video load.`);
}


// --- MODIFIED: Checks isAdFilteringCurrentlyEnabled ---
async function getFilteredM3u8UrlIfNeeded(url) {
    // 1. Check the *current* runtime setting, not just the config default
    if (!isAdFilteringCurrentlyEnabled) { // <<< MODIFIED HERE
        console.log("Ad filtering currently disabled by user setting.");
        return url;
    }
    // Continue with existing checks
    if (!url || !(url.includes('.m3u8') || url.includes('format=m3u8'))) { // Check for .m3u8 or common query param
        console.log("URL is not M3U8, skipping filtering:", url);
        return url;
    }
     if (!url.startsWith('http')) {
         console.log("URL is not HTTP(S), skipping filtering:", url);
         return url;
     }

    console.log("Attempting to filter ads for (filtering enabled):", url);

    try {
        // 2. Fetch the M3U8 content
        const response = await fetch(url, {
            method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'follow'
        });

        // 3. Check if the fetch was successful
        if (!response.ok) {
            console.warn(`Failed to fetch M3U8 (HTTP ${response.status}), using original URL:`, url);
            return url;
        }

        // 4. Read the M3U8 text content
        const m3u8Text = await response.text();
        if (!m3u8Text || !m3u8Text.trim().startsWith('#EXTM3U')) {
             console.warn("Fetched content doesn't look like a valid M3U8 playlist, using original URL.");
             return url;
        }

        // 5. Filter the M3U8 string
        const filteredM3u8 = filterAdInM3U8String(m3u8Text);

        // 6. Validate the filtered result
        if (!filteredM3u8 || filteredM3u8.length < m3u8Text.length * 0.1 || !filteredM3u8.trim().startsWith('#EXTM3U')) {
            console.warn("Ad filtering resulted in invalid or empty content, using original URL.");
            return url;
        }

        // 7. Create a Blob URL from the filtered content
        const blob = new Blob([filteredM3u8], { type: 'application/vnd.apple.mpegurl' });

        // 8. Clean up the previous Blob URL if it exists
        if (lastBlobUrl) {
            console.log("Revoking previous Blob URL:", lastBlobUrl);
            URL.revokeObjectURL(lastBlobUrl);
            lastBlobUrl = null;
        }

        // 9. Create the new Blob URL
        lastBlobUrl = URL.createObjectURL(blob);
        console.log("Ad filtering successful. Using Blob URL:", lastBlobUrl);
        return lastBlobUrl;

    } catch (error) {
        // 10. Catch ANY error during the process
        console.error("Error during M3U8 ad filtering process, falling back to original URL:", error);
        if (lastBlobUrl && typeof lastBlobUrl === 'string' && lastBlobUrl.startsWith('blob:')) {
           // Clean up potential blob if error occurred after creation but before return
           try { URL.revokeObjectURL(lastBlobUrl); } catch (revokeError) { /* ignore */ }
           lastBlobUrl = null;
        }
        return url; // Fallback to the original URL on any error
    }
}

// Your existing filterAdInM3U8String function (seems reasonable, keep as is)
function filterAdInM3U8String(m3u8Str) {
    const adPatterns = [
        /ad/i, /ads/i, /广告/, /tvc/i, /ssp/i, /\.jpg/, /logo/i, /watermark/i,
        /pause/i, /广编/, /guanggao/i, /tracker/, /promo/, /\bpreroll\b/i,
        /interstitial/i, /sponsor/i
    ];
    const lines = m3u8Str.split('\n');
    const filtered = [];
    let skipNextLine = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim(); // Trim here for checks

        // Preserve essential playlist-wide tags unconditionally
        if (line.startsWith('#EXTM3U') ||
            line.startsWith('#EXT-X-VERSION') ||
            line.startsWith('#EXT-X-TARGETDURATION') ||
            line.startsWith('#EXT-X-MEDIA-SEQUENCE') ||
            line.startsWith('#EXT-X-PLAYLIST-TYPE') ||
            line.startsWith('#EXT-X-KEY') ||
            line.startsWith('#EXT-X-MAP') ||
            line.startsWith('#EXT-X-PROGRAM-DATE-TIME') ||
            line.startsWith('#EXT-X-DISCONTINUITY') ||
            line.startsWith('#EXT-X-ENDLIST')) {
            filtered.push(lines[i]); // Push original line (with potential whitespace)
            skipNextLine = false;
            continue;
        }

        // Handle the previous skip flag first
        if (skipNextLine) {
            skipNextLine = false;
            // Only log if line is not empty (sometimes empty lines follow #EXTINF)
            if (line) console.log("Filtering media segment:", line);
            continue;
        }

        // Check if the current line is an #EXTINF line matching ad patterns
        if (line.startsWith('#EXTINF')) {
            let isAdInf = false;
            for (const pat of adPatterns) {
                if (pat.test(line)) {
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
        filtered.push(lines[i]); // Push original line
    }

    return filtered.join('\n');
}


// ========== 数据加载与参数处理 ==========
function loadPlayerData() {
    const url = new URL(window.location.href);
    const params = Object.fromEntries(url.searchParams.entries());

    currentTitle = decodeURIComponent(params.title || '') || '正在播放';
    episodeIndex = Number(params.index || 0);
    const fallbackUrl = params.url;

    console.log("尝试从 sessionStorage 加载剧集列表...");
    try {
        const episodesJson = sessionStorage.getItem('playerEpisodeList');
        if (episodesJson) {
            episodes = JSON.parse(episodesJson);
            console.log("成功从 sessionStorage 加载了", episodes.length, "集");
        } else {
             console.warn("SessionStorage 中未找到 'playerEpisodeList'。");
             episodes = [];
        }
    } catch (e) {
        console.error("解析 sessionStorage 中的剧集列表失败:", e);
        episodes = [];
    }

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

    if (episodes.length === 0 && fallbackUrl) {
         console.log("无剧集列表，根据 URL 'url' 参数创建单集播放。");
         episodes = [fallbackUrl];
         episodeIndex = 0;
    }

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
        try {
            // Revoke blob URL BEFORE destroying DPlayer which might still use it
            if (lastBlobUrl) {
                console.log("Revoking blob URL before player destroy:", lastBlobUrl);
                URL.revokeObjectURL(lastBlobUrl);
                lastBlobUrl = null;
            }
            dplayer.destroy();
        } catch (e) {
            console.warn("销毁旧播放器实例或撤销 Blob URL 时出错:", e);
        }
        dplayer = null; // Ensure it's nullified
    }

    let url = getCurrentVideoUrl();
    if (!url) {
        showError('无法获取有效的视频地址');
        showLoading(false);
        return;
    }
    console.log(`获取到原始播放 URL: ${url}`);

    // --- MODIFIED: Use the filtered URL, reset lastBlobUrl if filtering is disabled/fails ---
    let finalUrl = url; // Start with original
    try {
        const filteredUrl = await getFilteredM3u8UrlIfNeeded(url); // This now checks isAdFilteringCurrentlyEnabled
        if (filteredUrl !== url && filteredUrl.startsWith('blob:')) {
            finalUrl = filteredUrl; // Use the blob URL
            // lastBlobUrl is already set inside getFilteredM3u8UrlIfNeeded on success
            console.log(`使用过滤后的 Blob URL: ${finalUrl}`);
        } else if (filteredUrl === url) {
            console.log(`未使用过滤 URL (过滤禁用或失败)，使用原始 URL: ${finalUrl}`);
            // Ensure lastBlobUrl is null if we aren't using a blob this time
            if (lastBlobUrl) {
                 console.log("Filtering didn't produce a blob, ensuring old blob URL is revoked:", lastBlobUrl);
                 URL.revokeObjectURL(lastBlobUrl);
                 lastBlobUrl = null;
            }
        }
    } catch (filterError) {
        console.error("广告过滤过程中发生意外错误:", filterError);
        finalUrl = url; // Fallback to original URL
         if (lastBlobUrl) { // Clean up just in case
              try { URL.revokeObjectURL(lastBlobUrl); } catch(e){} lastBlobUrl = null;
         }
    }

    console.log("创建新的 DPlayer 实例，使用 URL:", finalUrl);
    try {
        dplayer = new window.DPlayer({
            container: document.getElementById('player'), // Ensure this ID matches your HTML
            autoplay: true, theme: '#b73a82', loop: false, lang: 'zh-cn',
            screenshot: true, hotkey: true, preload: 'auto', logo: false,
            volume: 0.7, mutex: true,
            video: {
                url: finalUrl, // Use the potentially filtered URL
                // Correct type detection for blob URLs (usually HLS)
                type: finalUrl.includes('.m3u8') || finalUrl.startsWith('blob:') ? 'hls' : 'auto',
            },
            // hlsjsConfig: { /* Consider adding HLS.js config if needed, e.g., for segment loading */ }
        });

        // --- DPlayer Event Listeners ---

        dplayer.on('loadedmetadata', () => {
            console.log("DPlayer 事件: loadedmetadata");
            hideError(); // Hide error if loading succeeds after a failure
            showLoading(false);
            duration = dplayer.video.duration || 0;
            console.log("视频时长:", duration);
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const position = urlParams.get('position');
                if (position && !isNaN(Number(position)) && Number(position) > 0) {
                    const seekTime = Math.min(Number(position), duration > 1 ? duration - 1 : duration); // Avoid seeking past end
                    if (seekTime > 0) {
                        console.log(`尝试跳转到上次播放位置: ${seekTime}s`);
                        dplayer.seek(seekTime);
                    }
                }
            } catch(seekError) { console.error("跳转到上次播放位置时出错:", seekError); }
        });

        dplayer.on('canplay', () => {
            console.log("DPlayer 事件: canplay");
            showLoading(false); // Ensure loading is hidden
        });

        // --- MODIFIED/CONFIRMED: Error handling uses the improved logic ---
        dplayer.on('error', (err) => {
            console.error("DPlayer 事件: error:", err); // Log the raw error object

            let errorMessage = '未知错误'; // Default message
            if (err) {
                errorMessage = err.message || String(err); // Try message or stringify error
                // Check if notice contains text (and isn't the function itself)
                 if (dplayer?.template?.notice?.textContent && typeof dplayer.template.notice.textContent === 'string' && !dplayer.template.notice.textContent.startsWith('function')) {
                     errorMessage += ` (${dplayer.template.notice.textContent})`;
                 }
            } else if (dplayer?.video?.error) {
                // Fallback to HTML video element error
                const videoError = dplayer.video.error;
                errorMessage = `媒体错误代码: ${videoError.code}`;
                switch (videoError.code) {
                    case MediaError.MEDIA_ERR_ABORTED: errorMessage += ' (用户中止)'; break;
                    case MediaError.MEDIA_ERR_NETWORK: errorMessage += ' (网络错误)'; break;
                    case MediaError.MEDIA_ERR_DECODE: errorMessage += ' (解码错误)'; break;
                    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMessage += ' (媒体资源不支持)'; break;
                    default: errorMessage += ' (未知媒体错误)';
                }
                 console.error("HTMLVideoElement Error:", videoError);
            }

            // Consider adding more context if possible
            if (lastBlobUrl === finalUrl) {
                errorMessage += " (可能与广告过滤有关)";
            }

            showError(`播放失败: ${errorMessage}`); // Use the extracted errorMessage
            showLoading(false);
            // Maybe destroy player on fatal error? Or provide a retry button?
            // dplayer.destroy(); dplayer = null;
        });

        dplayer.on('timeupdate', () => {
            lastPosition = dplayer.video.currentTime || 0;
            // Throttle history saving if needed, but saving on pause/end/unload is usually sufficient
        });

        dplayer.on('ended', () => {
            console.log(`DPlayer 事件: ended - Ep ${episodeIndex + 1}`);
            saveViewingHistory(); // Save progress at the very end
            if (autoPlayNext) {
                playNextEpisode();
            } else {
                dplayer?.notice("播放完毕", 2000);
            }
        });

        dplayer.on('pause', () => {
            console.log("DPlayer 事件: pause");
            saveViewingHistory(); // Save progress on pause
        });

        dplayer.on('play', () => {
            console.log("DPlayer 事件: play");
            hideError(); // Hide error message if user manually plays after an error
            showLoading(false); // Ensure loading is hidden
        });

        dplayer.on('destroy', () => {
            console.log("DPlayer 事件: destroy");
            // Ensure blob URL is revoked if not already done
            if (lastBlobUrl) {
                console.log("Revoking blob URL on player destroy:", lastBlobUrl);
                URL.revokeObjectURL(lastBlobUrl);
                lastBlobUrl = null;
            }
        });

        // Trigger custom event for potential external hooks (like preloading)
        triggerDPlayerInitedEvent();

    } catch (initError) {
        console.error("初始化 DPlayer 时发生严重错误:", initError);
        showError(`播放器初始化失败: ${initError.message}`);
        showLoading(false);
        // Clean up blob if init failed after blob creation but before player used it
        if (lastBlobUrl && finalUrl === lastBlobUrl) {
            try { URL.revokeObjectURL(lastBlobUrl); } catch(e){}
            lastBlobUrl = null;
        }
    }
}


// ========== 记录与连播/切集 ==========
function saveViewingHistory() {
    if (!currentTitle || !dplayer || !dplayer.video) {
        // console.warn("无法保存历史记录: 缺少标题或播放器实例。");
        return;
    }
    const currentPos = dplayer.video.currentTime || lastPosition || 0;
    const totalDuration = dplayer.video.duration || duration || 0;

    // Only save if duration is valid and progress is meaningful
    if (totalDuration <= 0 || currentPos <= 0) {
        // console.log("不保存历史记录: 时长或进度无效。");
        return;
    }

    // Avoid saving if video barely started or finished (adjust threshold as needed)
    if (currentPos < 2 || currentPos > totalDuration - 5) {
        // console.log("不保存历史记录: 接近开头或结尾。");
        // If ended, we save in the 'ended' event handler
        if (dplayer.video.ended) return;
    }


    const currentUrl = episodes[episodeIndex]; // Get URL from the original list
    if (!currentUrl) {
        console.warn("无法保存历史记录: 无法获取当前剧集 URL。");
        return;
    }

    const historyItem = {
        title: currentTitle, episodeIndex: episodeIndex, sourceName: '播放页', // Or dynamically determine source?
        playbackPosition: Math.floor(currentPos), duration: Math.floor(totalDuration),
        url: currentUrl, // Store the original URL for identification
        episodes: episodes, // Store the context
        timestamp: Date.now()
    };
    console.log(`准备保存观看历史: Ep=${historyItem.episodeIndex + 1}, Pos=${historyItem.playbackPosition}/${historyItem.duration}`);
    try {
        addViewingHistoryItem(historyItem);
    } catch (e) {
        console.error("保存观看历史时出错:", e);
    }
}

function playEpisodeByIndex(newIndex) {
    if (newIndex >= 0 && newIndex < episodes.length && newIndex !== episodeIndex) {
        console.log(`切换剧集: 从 ${episodeIndex + 1} 到 ${newIndex + 1}`);
        saveViewingHistory(); // Save progress before switching
        episodeIndex = newIndex;
        try {
            // Update URL without reload for better navigation feel
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', episodeIndex.toString());
            newUrl.searchParams.delete('position'); // Remove old position
            history.pushState({ index: episodeIndex }, '', newUrl.toString());
        } catch (e) { console.warn("更新 URL 状态失败:", e); }
        initPlayer(); // Re-initialize the player for the new episode
    } else if (newIndex === episodeIndex) {
         dplayer?.notice("正在播放当前集", 1500);
    } else {
        console.warn(`尝试切换到无效的剧集索引: ${newIndex}`);
        dplayer?.notice("无效的剧集索引", 1500);
    }
}

function playNextEpisode() {
    if (episodeIndex < episodes.length - 1) {
        playEpisodeByIndex(episodeIndex + 1);
    } else {
        console.log("已经是最后一集");
        dplayer?.notice("已经是最后一集", 2000);
        // Optionally: Stop playback, loop, or suggest other content
    }
}

function playPreviousEpisode() {
    if (episodeIndex > 0) {
        playEpisodeByIndex(episodeIndex - 1);
    } else {
        console.log("已经是第一集");
        dplayer?.notice("已经是第一集", 2000);
    }
}

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    console.log(`切换剧集排序为: ${episodesReversed ? '倒序' : '正序'}`);
    renderEpisodesGrid(); // Re-render the list with the new order
    updateOrderBtn();     // Update the button text/icon
}

// ================= 更改设置 ====================
function onAutoplayToggleChange(e) {
    autoPlayNext = e.target.checked;
    console.log(`设置自动连播: ${autoPlayNext}`);
    setSetting('autoplayEnabled', autoPlayNext); // Persist setting using store.js
    dplayer?.notice(`自动连播已${autoPlayNext ? '开启' : '关闭'}`, 1500);
}

// ====== 预加载补丁 (Keep as is, seems okay) ======
const PRELOAD_EPISODE_COUNT = 2;
const SUPPORTS_CACHE_STORAGE = 'caches' in window && window.caches.open;
const PRELOAD_CACHE_NAME = 'libretv-preload1';

function isSlowNetwork() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection || !connection.effectiveType) return false;
    const isSlow = /^(slow-)?2g$/.test(connection.effectiveType);
    return isSlow;
}

async function preloadNextEpisodeParts(preloadCount = PRELOAD_EPISODE_COUNT) {
    if (!PLAYER_CONFIG.enablePreloading || isSlowNetwork() || !episodes || episodes.length === 0 || typeof episodeIndex !== 'number') return;
    const currentIdx = episodeIndex, maxIndex = episodes.length - 1;
    for (let offset = 1; offset <= preloadCount; offset++) {
        const targetEpisodeIdx = currentIdx + offset;
        if (targetEpisodeIdx > maxIndex) break;
        const nextUrl = episodes[targetEpisodeIdx];
        if (!nextUrl || typeof nextUrl !== 'string' || !nextUrl.includes('.m3u8')) continue;
        try {
            const m3u8Resp = await fetch(nextUrl, { method: "GET", credentials: "omit", mode: 'cors' });
            if (!m3u8Resp.ok) continue;
            const m3u8Text = await m3u8Resp.text();
            if (SUPPORTS_CACHE_STORAGE) { /* Cache M3U8 logic */ }
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
                tsUrlsToPreload.forEach(async (tsUrl) => { /* Fetch and cache TS logic */ });
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
            preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT); preloadTriggeredForThisSegment = true;
        } else if (timeRemaining >= 15 && preloadTriggeredForThisSegment) preloadTriggeredForThisSegment = false;
    };
    videoElement.removeEventListener('timeupdate', timeUpdateHandler);
    videoElement.addEventListener('timeupdate', timeUpdateHandler);
    preloadTriggeredForThisSegment = false;
}

// ========== 事件绑定 ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM 已加载，开始初始化播放页面...");

    loadPlayerData();           // Load title, episodes, index from URL/sessionStorage
    loadInitialAdFilterSetting(); // <<<< NEW: Load user's ad filter preference

    setVideoTitleText();
    setEpisodeInfoText();
    renderEpisodesGrid();
    updateAutoplayToggle();
    updateOrderBtn();
    updateLockIcon(isLocked); // Initialize lock icon based on default state

    // --- Bind Buttons ---
    document.getElementById('prevButton')?.addEventListener('click', playPreviousEpisode);
    document.getElementById('nextButton')?.addEventListener('click', playNextEpisode);
    document.getElementById('toggleEpisodeOrderBtn')?.addEventListener('click', toggleEpisodeOrder);
    document.getElementById('autoplayToggle')?.addEventListener('change', onAutoplayToggleChange);
    document.getElementById('lockToggle')?.addEventListener('click', toggleControlsLock);
    document.getElementById('adFilterToggle')?.addEventListener('click', toggleAdFiltering); // <<<< NEW: Bind ad filter toggle

    // --- Bind Episode List Clicks ---
    document.getElementById('episodesList')?.addEventListener('click', e => {
        const btn = e.target.closest('button[id^="episode-"]');
        if (btn && !btn.disabled) {
            const idx = Number(btn.dataset.index);
            if (!isNaN(idx)) {
                playEpisodeByIndex(idx);
            } else {
                console.warn("无法从按钮 data-index 获取有效的剧集索引:", btn.dataset.index);
            }
        }
    });

    // --- Bind Keyboard Shortcuts ---
    document.addEventListener('keydown', handleKeydown);

    // --- Initialize Player ---
    if (episodes.length > 0 || getCurrentVideoUrl()) {
        initPlayer(); // initPlayer now uses the potentially filtered URL
    } else {
        showError("没有找到可播放的视频内容");
        showLoading(false);
    }

    // --- Setup Preloading ---
    setupPreloadEvents();

    console.log("播放页面初始化完成。");
});


// ========== 键盘快捷键处理 (Keep as is, seems okay) ==========
function handleKeydown(e) {
    // Allow input fields, textareas, etc. to capture keys
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    // Ignore keypresses with modifiers (Ctrl, Alt, Meta) to avoid conflicts
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    let preventDefault = true; // Assume we'll handle the key

    // Handle only if player exists for most actions
    if (!dplayer && !['KeyO', 'KeyA'].includes(e.code)) return; // Allow order/autoplay toggle even if player errored

    switch (e.code) {
        case 'Space': case 'KeyK': dplayer?.toggle(); showShortcutHint(dplayer?.video.paused ? 'pause' : 'play', dplayer?.video.paused ? '已暂停' : '播放'); break;
        case 'ArrowLeft': dplayer?.seek(dplayer.video.currentTime - 5); showShortcutHint('rewind', '后退 5 秒'); break;
        case 'ArrowRight': dplayer?.seek(dplayer.video.currentTime + 5); showShortcutHint('forward', '前进 5 秒'); break;
        case 'ArrowUp': if (dplayer) { let vol = Math.min(dplayer.volume() + 0.1, 1); dplayer.volume(vol, true, false); showShortcutHint('volume-up', `音量 ${Math.round(vol * 100)}%`); } break;
        case 'ArrowDown': if (dplayer) { let vol = Math.max(dplayer.volume() - 0.1, 0); dplayer.volume(vol, true, false); showShortcutHint('volume-down', `音量 ${Math.round(vol * 100)}%`); } break;
        case 'KeyM': if (dplayer) { if (dplayer.volume() > 0) { dplayer.volume(0, true, false); showShortcutHint('volume-mute', '静音'); } else { dplayer.volume(0.7, true, false); showShortcutHint('volume-up', '取消静音'); } } break;
        case 'KeyF': dplayer?.fullScreen.toggle(); showShortcutHint('fullscreen', dplayer?.fullScreen.isFullScreen ? '进入全屏' : '退出全屏'); break;
        case 'KeyL': if (episodes.length > 1) { playNextEpisode(); showShortcutHint('next', '下一集'); } else { preventDefault = false; } break;
        case 'KeyJ': if (episodes.length > 1) { playPreviousEpisode(); showShortcutHint('previous', '上一集'); } else { preventDefault = false; } break;
        case 'KeyO': toggleEpisodeOrder(); showShortcutHint('sort', `切换为${episodesReversed ? '正序' : '倒序'}`); break;
        case 'KeyA':
             const toggle = document.getElementById('autoplayToggle');
             if (toggle) {
                 autoPlayNext = !autoPlayNext;
                 toggle.checked = autoPlayNext; // Update checkbox UI
                 onAutoplayToggleChange({ target: { checked: autoPlayNext } }); // Trigger the change handler
                 showShortcutHint('autoplay', `自动连播 ${autoPlayNext ? '开启' : '关闭'}`);
             } else { preventDefault = false; }
             break;
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
        default: preventDefault = false; break; // Don't prevent default for unhandled keys
    }
    if (preventDefault) e.preventDefault();
}

// ----- 快捷键提示 -----
let hintTimer = null;
function showShortcutHint(iconType, text) {
    const hintEl = document.getElementById('shortcutHint');
    const iconEl = document.getElementById('shortcutIcon');
    const textEl = document.getElementById('shortcutText');
    if (!hintEl || !iconEl || !textEl || !text) return;
    const svgContent = getIconSvg(iconType);
    if (!svgContent) return; // Don't show hint if icon is missing

    iconEl.innerHTML = svgContent;
    textEl.textContent = text;
    hintEl.classList.add('show'); // Add class to trigger CSS animation/transition

    clearTimeout(hintTimer); // Clear previous timer if hint shown rapidly
    hintTimer = setTimeout(() => {
        hintEl.classList.remove('show'); // Remove class to hide
    }, 1500); // Hide after 1.5 seconds
}

function getIconSvg(type) {
    // Ensure these match the icons used elsewhere or provide appropriate ones
    switch (type) {
        case 'play': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        case 'pause': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        case 'forward': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>`; // Double arrow right
        case 'rewind': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>`; // Double arrow left
        case 'volume-up': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>`;
        case 'volume-down': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>`; // Volume down (speaker with minus often used)
        case 'volume-mute': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l4-4m0 4l-4-4"></path></svg>`; // Speaker with X
        case 'fullscreen': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m7 0l5-5m0 4v4m0 0h-4m-5 5l5 5m-5-5v-4m0 0h-4"></path></svg>`; // Expand arrows
        case 'next': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>`; // Same as forward for simplicity
        case 'previous': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>`; // Same as rewind for simplicity
        case 'sort': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"></path></svg>`; // Sort icon
        case 'autoplay': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`; // Play inside circle
        case 'seek': return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`; // Map pin often used for location/seek
        default: return ''; // Return empty string for unknown types
    }
}

// ----- 触发 DPlayerInited 事件 -----
function triggerDPlayerInitedEvent() {
    console.log("触发 DPlayerInited 自定义事件");
    try {
        document.dispatchEvent(new CustomEvent('DPlayerInited', { detail: { player: dplayer } }));
    } catch (e) {
        console.error("触发 DPlayerInited 事件时出错:", e);
    }
}

// ========== 播放控制区锁定 (Keep as is, seems okay) ==========
function toggleControlsLock() {
    isLocked = !isLocked;
    console.log(`切换控制区锁定状态: ${isLocked ? '锁定' : '解锁'}`);
    const playerContainer = document.querySelector('.player-container'); // Adjust selector if needed
    if (playerContainer) {
        playerContainer.classList.toggle('controls-locked', isLocked);
    } else {
        console.warn("Player container element not found for locking.");
    }
    updateLockIcon(isLocked);
    dplayer?.notice(`控制区已${isLocked ? '锁定' : '解锁'}`, 1500);
}

function updateLockIcon(locked) {
    const lockIcon = document.getElementById('lockIcon');
    const lockButton = document.getElementById('lockToggle');
    if (!lockIcon || !lockButton) return;
    if (locked) {
        lockIcon.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6.707 5.207l.707-.707a1 1 0 011.414 0l.707.707a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414 0l-1.414-1.414a1 1 0 010-1.414zm7.07-8.485a8 8 0 11-11.314 0 8 8 0 0111.314 0z M12 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`; // Example Locked Icon
        lockButton.setAttribute('aria-label', '解锁控制区');
        lockButton.setAttribute('title', '点击解锁控制区');
    } else {
        lockIcon.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0v4M5 9h14l1 12H4L5 9z"/></svg>`; // Example Unlocked Icon
        lockButton.setAttribute('aria-label', '锁定控制区');
        lockButton.setAttribute('title', '点击锁定控制区');
    }
}

// ========== 关闭/离开时保存进度 ==========
// Use 'visibilitychange' for better reliability on mobile/tabs
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        saveViewingHistory();
    }
});
// Keep beforeunload as a fallback
window.addEventListener('beforeunload', saveViewingHistory);
// 'pagehide' is also good practice
window.addEventListener('pagehide', saveViewingHistory);

// --- 文件结束 ---
