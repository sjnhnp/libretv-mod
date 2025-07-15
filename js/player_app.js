// import { PlyrLayout, VidstackPlayer } from 'https://cdn.vidstack.io/player'; //plyr layout
import { VidstackPlayer, VidstackPlayerLayout } from 'https://cdn.vidstack.io/player';

// --- 常量定义 ---
const SKIP_INTRO_KEY = 'skipIntroTime';
const SKIP_OUTRO_KEY = 'skipOutroTime';
const REMEMBER_EPISODE_PROGRESS_ENABLED_KEY = 'playerRememberEpisodeProgressEnabled';
const VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY = 'videoSpecificEpisodeProgresses';

// --- 全局变量 ---
let player = null;
let isNavigatingToEpisode = false;
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let autoplayEnabled = true;
let isUserSeeking = false;
let videoHasEnded = false;
let progressSaveInterval = null;
let isScreenLocked = false;
let nextSeekPosition = 0;
let vodIdForPlayer = '';
let currentVideoYear = '';
let currentVideoTypeName = '';
let lastFailedAction = null;
let availableAlternativeSources = [];
let adFilteringEnabled = false;
let universalId = '';

// 提取核心标题，用于匹配同一作品的不同版本
function getCoreTitle(title, typeName = '') {
    if (typeof title !== 'string') {
        return '';
    }

    let baseName = title;

    // 步骤 1: 使用正则表达式，仅对电影类型移除副标题
    const movieKeywords = [
        '电影', '剧情', '动作', '冒险', '同性', '喜剧', '奇幻',
        '恐怖', '悬疑', '惊悚', '灾难', '爱情', '犯罪', '科幻', '抢先',
        '动画', '歌舞', '战争', '经典', '网络', '其它', '理论', '纪录'
    ];
    const movieRegex = new RegExp(movieKeywords.join('|'));
    if (typeName && movieRegex.test(typeName)) {
        baseName = baseName.replace(/[:：].*/, '').trim();
    }

    // 步骤 2: 提取并统一季数
    const numeralMap = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };
    let normalizedTitle = title.replace(/[一二三四五六七八九十]/g, (match) => numeralMap[match]);

    let seasonNumber = 1;
    const seasonMatch = normalizedTitle.match(/(?:第|Season\s*)(\d+)[季部]/i);
    if (seasonMatch) {
        seasonNumber = parseInt(seasonMatch[1], 10);
    }
    const seasonIdentifier = `_S${String(seasonNumber).padStart(2, '0')}`;

    // 步骤 3: 从基础名称中移除所有版本和季数标签，得到纯净的剧名
    const seasonRegex = new RegExp('[\\s\\(（【\\[]?(?:第[一二三四五六七八九十\\d]+[季部]|Season\\s*\\d+)[\\)）】\\]]?', 'gi');
    baseName = baseName.replace(seasonRegex, '').trim();

    const versionTags = ['国语', '国', '粤语', '粤', '台配', '台', '中字', '普通话', '高清', 'HD', '版', '修复版', 'TC', '蓝光', '4K'];
    const bracketRegex = new RegExp(`[\\s\\(（【\\[](${versionTags.join('|')})(?![0-9])\\s*[\\)）】\\]]?`, 'gi');
    baseName = baseName.replace(bracketRegex, '').trim();
    const suffixRegex = new RegExp(`(${versionTags.join('|')})$`, 'i');
    baseName = baseName.replace(suffixRegex, '').trim();

    baseName = baseName.replace(/\s+/g, '').trim();

    // 步骤 4: 使用正确的变量 `movieRegex` 来进行判断
    if (typeName && movieRegex.test(typeName) && !seasonMatch) {
        return baseName;
    }

    return `${baseName}${seasonIdentifier}`;
}

// 生成视频统一标识符，用于跨线路共享播放进度
function generateUniversalId(title, year, episodeIndex) {
    // 1. 先提取核心标题
    const coreTitle = getCoreTitle(title);
    // 2. 再对核心标题进行归一化
    const normalizedTitle = coreTitle.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
    const normalizedYear = year ? year : 'unknown';
    return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
}

// 实用工具函数
function hidePlayerOverlays() {
    const errorElement = document.getElementById('error');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

function showToast(message, type = 'info', duration = 3000) {

    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;

    const bgColors = {
        'error': 'bg-red-500',
        'success': 'bg-green-500',
        'info': 'bg-blue-500',
        'warning': 'bg-yellow-500'
    };
    const bgColor = bgColors[type] || bgColors.info;

    toast.className = `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${bgColor} text-white z-[2147483647] pointer-events-none`;
    toastMessage.textContent = message;

    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.opacity = '0';
    }, duration);
}

function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) { return; }

    let bgColorClass = ({ error: 'bg-red-500', success: 'bg-green-500', warning: 'bg-yellow-500', info: 'bg-blue-500' })[type] || 'bg-blue-500';

    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm ${bgColorClass} text-white transition-opacity duration-300 opacity-0`;
    messageElement.textContent = text;
    messageElement.classList.remove('hidden');

    void messageElement.offsetWidth;
    messageElement.classList.add('opacity-100');

    if (messageElement._messageTimeout) clearTimeout(messageElement._messageTimeout);

    messageElement._messageTimeout = setTimeout(() => {
        messageElement.classList.remove('opacity-100');
        messageElement.classList.add('opacity-0');
        setTimeout(() => messageElement.classList.add('hidden'), 300);
    }, duration);
}

function showError(message) {
    hidePlayerOverlays();

    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold');
        if (errorTextElement) errorTextElement.textContent = message;
        errorElement.style.display = 'flex';
    }
    showMessage(message, 'error');
}

function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getShowIdentifier(perEpisode = true) {
    const urlParams = new URLSearchParams(window.location.search);
    const sc = urlParams.get('source_code') || 'unknown_source';
    const vid = vodIdForPlayer || urlParams.get('id') || '';
    const ep = perEpisode ? `_ep${currentEpisodeIndex}` : '';

    if (vid) return `${currentVideoTitle}_${sc}_${vid}${ep}`;

    const raw = (currentEpisodes && currentEpisodes.length > 0) ? currentEpisodes[0] : '';
    if (!raw) return `${currentVideoTitle}_${sc}${ep}`;

    const urlKey = raw.split('/').pop().split(/[?#]/)[0] || (raw.length > 32 ? raw.slice(-32) : raw);
    return `${currentVideoTitle}_${sc}_${urlKey}${ep}`;
}

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
            modal.style.display = 'none';
            document.body.style.overflow = "";
            btnCancel.onclick = btnConfirm.onclick = null;
            document.removeEventListener("keydown", handler);
            resolve(result);
        }

        btnCancel.onclick = () => close(false);
        btnConfirm.onclick = () => close(true);

        function handler(e) {
            if (e.key === "Escape") close(false);
            if (e.key === "Enter") close(true);
        }

        modal.style.display = 'flex';
        setTimeout(() => btnConfirm.focus(), 120);
        document.addEventListener("keydown", handler);
        document.body.style.overflow = "hidden";
    });
}

// 根据广告过滤设置，异步处理视频URL。
async function processVideoUrl(url) {
    // 如果未启用广告过滤，直接返回原始 URL
    if (!adFilteringEnabled) {
        return url;
    }

    try {
        // 1. 拉取 m3u8 文本
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) throw new Error(`无法获取 m3u8，状态 ${resp.status}`);
        const m3u8Text = await resp.text();

        // 2. 广告过滤 & URL 补全
        const adPatterns = [
            /#EXT-X-DISCONTINUITY/i,
            /MOMENT-START/i,
            /\/\/.*\.(ts|jpg|png)\?ad=/i
        ];
        const lines = m3u8Text.split('\n');
        const baseUrl = url;
        const cleanLines = [];

        for (let line of lines) {
            if (adPatterns.some(p => p.test(line))) {
                continue;
            }

            if (line.startsWith('#EXT-X-KEY')) {
                const uriMatch = line.match(/URI="([^"]+)"/);
                if (uriMatch && uriMatch[1]) {
                    const relativeUri = uriMatch[1];
                    try {
                        const absoluteUri = new URL(relativeUri, baseUrl).href;
                        line = line.replace(relativeUri, absoluteUri);
                    } catch (e) {
                        console.warn('加密密钥 URL 补全失败，保留原行:', line, e);
                    }
                }
            }

            else if (line && !line.startsWith('#') && /\.(ts|m3u8)(\?|$)/i.test(line.trim())) {
                try {
                    line = new URL(line.trim(), baseUrl).href;
                } catch (e) {
                    console.warn('URL 补全失败，保留原行:', line, e);
                }
            }
            cleanLines.push(line);
        }

        const filteredM3u8 = cleanLines.join('\n');

        const blob = new Blob([filteredM3u8], { type: 'application/vnd.apple.mpegurl' });
        return URL.createObjectURL(blob);

    } catch (err) {
        console.error('广告过滤或 URL 补全失败：', err);
        showToast('广告过滤失败，播放原始地址', 'warning');
        return url;
    }
}

// --- 播放器核心逻辑 ---

async function initPlayer(videoUrl, title) {
    const playerContainer = document.getElementById('player');
    if (!playerContainer) {
        showError("播放器容器 (#player) 未找到");
        return;
    }

    if (player) {
        // 清理旧的Blob URL
        if (player.currentSrc && player.currentSrc.startsWith('blob:')) {
            URL.revokeObjectURL(player.currentSrc);
        }
        player.destroy();
        player = null;
    }

    // 在创建播放器前处理URL
    const processedUrl = await processVideoUrl(videoUrl);

    try {
        player = await VidstackPlayer.create({
            target: playerContainer,
            // 使用处理过的URL
            src: { src: processedUrl, type: 'application/x-mpegurl' },
            title: title,
            autoplay: true,
            preload: 'auto',
            layout: new VidstackPlayerLayout(),
            // layout: new PlyrLayout(),
            // controls: true,
            playsInline: true,
            crossOrigin: true,
            layout: new VidstackPlayerLayout(),
            keyTarget: 'document',
            keyShortcuts: {
                togglePaused: 'k Space',
                toggleMuted: 'm',
                togglePictureInPicture: 'i',
                // toggleFullscreen: 'f',
                seekBackward: ['j', 'J', 'ArrowLeft'],
                seekForward: ['l', 'L', 'ArrowRight'],
                volumeUp: 'ArrowUp',
                volumeDown: 'ArrowDown',
                speedUp: '>',
                slowDown: '<',
            }
        });
        window.player = player;
        addPlayerEventListeners();
        handleSkipIntroOutro(player);
    } catch (error) {
        console.error("Vidstack Player 创建失败:", error);
        showError("播放器初始化失败");
    }
}

function addPlayerEventListeners() {
    if (!player) return;

    // 保持原有的所有事件监听器...
    player.addEventListener('fullscreen-change', (event) => {
        const isFullscreen = event.detail;
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton) {
            fsButton.innerHTML = isFullscreen ?
                `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>` :
                `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
            fsButton.setAttribute('aria-label', isFullscreen ? '退出全屏' : '全屏');
        }
    });

    player.addEventListener('loaded-metadata', () => {
        document.getElementById('loading').style.display = 'none';
        videoHasEnded = false;
        handleSkipIntroOutro(player);
        if (nextSeekPosition > 0 && player.duration > 0 && nextSeekPosition < player.duration) {
            player.currentTime = nextSeekPosition;
            showMessage(`已从 ${formatPlayerTime(nextSeekPosition)} 继续播放`, 'info');
        }
        nextSeekPosition = 0;
        saveToHistory();
        startProgressSaveInterval();
        isNavigatingToEpisode = false;
    });

    player.addEventListener('contextmenu', (event) => {
        if (isScreenLocked) {
            event.preventDefault();
            showMessage('屏幕已锁定，请先解锁', 'info', 2000);
        }
    });

    player.addEventListener('error', (event) => {
        console.error("Vidstack Player Error:", event.detail);
        showError('播放器遇到错误，请检查视频源');
    });

    // 关键：确保自动播放逻辑使用正确的变量
    player.addEventListener('end', () => {
        videoHasEnded = true;
        saveCurrentProgress();
        clearVideoProgressForEpisode(
            universalId || generateUniversalId(currentVideoTitle, currentVideoYear, currentEpisodeIndex)
        );
        
        // 检查自动播放设置（从设置面板中获取）
        const autoplayToggle = document.getElementById('autoplay-next');
        const shouldAutoplay = autoplayToggle ? autoplayToggle.checked : autoplayEnabled;
        
        if (shouldAutoplay && currentEpisodeIndex < currentEpisodes.length - 1) {
            setTimeout(() => {
                if (videoHasEnded && !isUserSeeking) {
                    console.log('自动播放下一集');
                    playNextEpisode();
                }
            }, 1000);
        } else {
            console.log('自动播放已禁用或已是最后一集');
        }
    });

    player.addEventListener('seeking', () => { isUserSeeking = true; });
    player.addEventListener('seeked', () => {
        setTimeout(() => { isUserSeeking = false; }, 200);
        saveVideoSpecificProgress();
    });
    player.addEventListener('pause', saveVideoSpecificProgress);
}

async function playEpisode(index) {
    hidePlayerOverlays();

    if (isNavigatingToEpisode || index < 0 || index >= currentEpisodes.length) {
        return;
    }
    universalId = generateUniversalId(currentVideoTitle, currentVideoYear, index);

    if (player && player.currentTime > 5) {
        saveVideoSpecificProgress();
    }

    isNavigatingToEpisode = true;

    const rememberOn = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY) !== 'false';
    if (rememberOn) {
        const currentUniversalId = generateUniversalId(currentVideoTitle, currentVideoYear, index);
        const allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgress = allProgress[currentUniversalId];
        if (savedProgress && savedProgress > 5) {
            const wantsToResume = await showProgressRestoreModal({
                title: "继续播放？",
                content: `《${currentVideoTitle}》第 ${index + 1} 集，<br> <span style="color:#00ccff">${formatPlayerTime(savedProgress)}</span> `,
                confirmText: "YES",
                cancelText: "NO"
            });

            if (wantsToResume) {
                nextSeekPosition = savedProgress;
            } else {
                clearVideoProgressForEpisode(currentUniversalId);
                nextSeekPosition = 0;
            }
        } else {
            nextSeekPosition = 0;
        }
    } else {
        nextSeekPosition = 0;
    }

    doEpisodeSwitch(index, currentEpisodes[index]);
}

async function doEpisodeSwitch(index, episodeString) {
    let playUrl = episodeString;
    if (episodeString && episodeString.includes('$')) {
        playUrl = episodeString.split('$')[1];
    }

    // 增加一个检查，确保一个有效的URL
    if (!playUrl || !playUrl.startsWith('http')) {
        showError(`无效的播放链接: ${playUrl || '链接为空'}`);
        console.error("解析出的播放链接无效:", playUrl);
        isNavigatingToEpisode = false;
        return;
    }

    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index;

    updateUIForNewEpisode();
    updateBrowserHistory(playUrl);

    if (player) {
        const processedUrl = await processVideoUrl(playUrl);
        player.src = { src: processedUrl, type: 'application/x-mpegurl' };
        player.play().catch(e => console.warn("Autoplay after episode switch was prevented.", e));
    }
}

(async function initializePage() {
    document.addEventListener('DOMContentLoaded', async () => {
        const urlParams = new URLSearchParams(window.location.search);

        adFilteringEnabled = urlParams.get('af') === '1';
        universalId = urlParams.get('universalId') || '';
        let episodeUrlForPlayer = urlParams.get('url');

        function fullyDecode(str) {
            try {
                let prev, cur = str;
                do { prev = cur; cur = decodeURIComponent(cur); } while (cur !== prev);
                return cur;
            } catch { return str; }
        }
        currentVideoTitle = urlParams.get('title') ? fullyDecode(urlParams.get('title')) : '视频播放';
        currentEpisodeIndex = parseInt(urlParams.get('index') || '0', 10);
        vodIdForPlayer = urlParams.get('id') || '';
        currentVideoYear = urlParams.get('year') || '';
        currentVideoTypeName = urlParams.get('typeName') || '';

        const sourceMapJSON = sessionStorage.getItem('videoSourceMap');
        if (sourceMapJSON) {
            try {
                const sourceMap = JSON.parse(sourceMapJSON);

                const coreClickedTitle = getCoreTitle(currentVideoTitle, currentVideoTypeName);

                const relevantSources = [];
                for (const key in sourceMap) {
                    if (sourceMap.hasOwnProperty(key)) {
                        const sourceItem = sourceMap[key][0];
                        if (!sourceItem) continue;

                        const coreKeyTitle = getCoreTitle(sourceItem.vod_name, sourceItem.type_name);

                        const clickedYear = currentVideoYear;
                        const keyYear = sourceItem.vod_year;

                        if (coreKeyTitle === coreClickedTitle && (!clickedYear || !keyYear || keyYear === clickedYear)) {
                            relevantSources.push(...sourceMap[key]);
                        }
                    }
                }
                availableAlternativeSources = relevantSources;
            } catch (e) {
                console.error("从 sessionStorage 构建聚合线路列表失败:", e);
                availableAlternativeSources = [];
            }
        }

        try {
            currentEpisodes = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
            if (!episodeUrlForPlayer && currentEpisodes[currentEpisodeIndex]) {
                episodeUrlForPlayer = currentEpisodes[currentEpisodeIndex];
            }
        } catch {
            currentEpisodes = [];
        }

        window.currentEpisodes = currentEpisodes;
        window.currentEpisodeIndex = currentEpisodeIndex;

        setupAllUI();

        const positionFromUrl = urlParams.get('position');
        if (positionFromUrl) {
            nextSeekPosition = parseInt(positionFromUrl);
        } else {
            const rememberOn = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY) !== 'false';
            if (rememberOn) {
                const allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                const savedProgress = universalId ? allProgress[universalId] : undefined;

                if (savedProgress && savedProgress > 5) {
                    const wantsToResume = await showProgressRestoreModal({
                        title: "继续播放？",
                        content: `《${currentVideoTitle}》第 ${currentEpisodeIndex + 1} 集，<br> <span style="color:#00ccff">${formatPlayerTime(savedProgress)}</span> `,
                        confirmText: "YES",
                        cancelText: "NO"
                    });

                    if (wantsToResume) {
                        nextSeekPosition = savedProgress;
                    } else {
                        clearVideoProgressForEpisode(universalId);
                        nextSeekPosition = 0;
                    }
                }
            }
        }

        if (episodeUrlForPlayer) {
            await initPlayer(episodeUrlForPlayer, currentVideoTitle);
        } else {
            showError('没有可播放的视频链接。');
        }
    });
})();

function updateUIForNewEpisode() {
    updateEpisodeInfo();
    renderEpisodes();
    updateButtonStates();
}

function updateBrowserHistory(newEpisodeUrl) {
    const newUrlForBrowser = new URL(window.location.href);

    newUrlForBrowser.searchParams.set('url', newEpisodeUrl);

    newUrlForBrowser.searchParams.set(
        'universalId',
        generateUniversalId(currentVideoTitle, currentVideoYear, currentEpisodeIndex)
    );
    newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());
    newUrlForBrowser.searchParams.delete('position');

    window.history.pushState({ path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex }, '', newUrlForBrowser.toString());
}

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) backButton.addEventListener('click', () => { window.location.href = 'index.html'; });

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (player) {
                if (player.state.fullscreen) {
                    player.exitFullscreen();
                } else {
                    player.enterFullscreen();
                }
            }
        });
    }

    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', retryLastAction);
    }

    const prevEpisodeBtn = document.getElementById('prev-episode');
    if (prevEpisodeBtn) prevEpisodeBtn.addEventListener('click', playPreviousEpisode);

    const nextEpisodeBtn = document.getElementById('next-episode');
    if (nextEpisodeBtn) nextEpisodeBtn.addEventListener('click', playNextEpisode);

    const orderBtn = document.getElementById('order-button');
    if (orderBtn) orderBtn.addEventListener('click', toggleEpisodeOrder);

    const lockButton = document.getElementById('lock-button');
    if (lockButton) lockButton.addEventListener('click', toggleLockScreen);

    // 为复制按钮绑定事件监听器
    const copyLinkBtn = document.getElementById('copy-link-button');
    if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyLinks);
}

function handleKeyboardShortcuts(e) {
    if (!player || (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName))) return;

    if (isScreenLocked && !['f', 'F', 'Escape'].includes(e.key)) {
        e.preventDefault();
        return;
    }

    let actionText = '';

    switch (e.key) {
        case 'ArrowLeft':
            // e.preventDefault(); // REMOVE THIS LINE
            if (e.altKey) {
                playPreviousEpisode();
                actionText = '上一集';
            }
            //else {
            //   player.currentTime -= 10;
            //  actionText = '后退 10s';
            //  }

            break;

        case 'ArrowRight':
            // e.preventDefault(); // REMOVE THIS LINE

            if (e.altKey) {
                playNextEpisode();
                actionText = '下一集';
            }
            //else {
            //   player.currentTime += 10;
            //   actionText = '前进 10s';
            //}
            break;

        case 'f':
        case 'F':
            // e.preventDefault(); // REMOVE THIS LINE
            if (player) {
                if (player.state.fullscreen) {
                    player.exitFullscreen();
                } else {
                    player.enterFullscreen();
                }
                actionText = '切换全屏';
            }
            break;
    }

    if (actionText) {
        showToast(actionText, 'info', 1500);
    }
}

function saveToHistory() {
    if (!player || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            vod_id: vodIdForPlayer || '',
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            episodes: window.currentEpisodes,
            playbackPosition: Math.floor(player.currentTime),
            duration: Math.floor(player.duration) || 0,
            timestamp: Date.now(),
            year: currentVideoYear
        };
        window.addToViewingHistory(videoInfo);
    } catch (e) {
        console.error('保存到历史记录失败:', e);
    }
}

function saveCurrentProgress() {
    if (!player || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = player.currentTime;
    const duration = player.duration;
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) {
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex],
                episodeIndex: window.currentEpisodeIndex,
                vod_id: vodIdForPlayer || '',
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
                sourceName: new URLSearchParams(window.location.search).get('source') || '',
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                year: currentVideoYear,
                episodes: window.currentEpisodes
            };
            window.addToViewingHistory(videoInfo);
        } catch (e) {
            console.error('保存播放进度失败:', e);
        }
    }
}

function saveVideoSpecificProgress() {
    if (isNavigatingToEpisode) return;
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle || !toggle.checked || !player) return;

    const currentUniversalId = generateUniversalId(currentVideoTitle, currentVideoYear, currentEpisodeIndex);

    const currentTime = Math.floor(player.currentTime);
    const duration = Math.floor(player.duration);

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.95) {
        try {
            let allProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            allProgresses[currentUniversalId] = currentTime;
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgresses));
        } catch (e) {
            console.error('保存特定视频集数进度失败:', e);
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

function clearVideoProgressForEpisode(universalId) {
    try {
        let allProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        if (allProgresses[universalId]) {
            delete allProgresses[universalId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgresses));
        }
    } catch (e) {
        console.error(`清除进度失败:`, e);
    }
}

function clearCurrentVideoAllEpisodeProgresses() {
    try {
        const showId = getShowIdentifier(false);
        let allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        if (allProgress[showId]) {
            delete allProgress[showId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgress));
        }
    } catch (e) {
        console.error('清除当前视频所有集数进度失败:', e);
    }
}

function renderEpisodes() {
    const grid = document.getElementById('episode-grid');
    if (!grid) { setTimeout(renderEpisodes, 100); return; }

    const container = document.getElementById('episodes-container');
    if (container) { container.classList.toggle('hidden', currentEpisodes.length <= 1); }

    const countSpan = document.getElementById('episodes-count');
    if (countSpan) { countSpan.textContent = `共 ${currentEpisodes.length} 集`; }

    // 定义综艺类型关键词
    const varietyShowTypes = ['综艺', '脱口秀', '真人秀'];
    const isVarietyShow = varietyShowTypes.some(type => currentVideoTypeName && currentVideoTypeName.includes(type));

    // 根据类型切换容器的CSS类
    if (isVarietyShow) {
        // 综艺
        grid.className = 'episode-grid-container variety-grid-layout';
    } else {
        // 非综艺
        grid.className = 'episode-grid grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2';
    }

    grid.innerHTML = '';
    if (!currentEpisodes.length) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }

    const orderedEpisodes = episodesReversed ? [...currentEpisodes].reverse() : [...currentEpisodes];
    orderedEpisodes.forEach((episodeData, index) => {
        const originalIndex = episodesReversed ? (currentEpisodes.length - 1 - index) : index;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.index = originalIndex;

        const parts = (episodeData || '').split('$');
        const episodeName = parts.length > 1 ? parts[0].trim() : '';

        // 根据是否为综艺决定按钮文本和标题
        if (isVarietyShow && episodeName) {
            btn.textContent = episodeName;
            btn.title = episodeName;
        } else {
            btn.textContent = originalIndex + 1;
            btn.title = `第 ${originalIndex + 1} 集`;
        }

        // 高亮当前播放的集数
        if (originalIndex === currentEpisodeIndex) {
            btn.classList.add('episode-active');
        }

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
    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    const totalEpisodes = window.currentEpisodes ? window.currentEpisodes.length : 0;
    if (currentVideoTitle && totalEpisodes > 1) {
        document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    } else if (currentVideoTitle) {
        document.title = `${currentVideoTitle} - ${siteName}`;
    } else {
        document.title = siteName;
    }
    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        const currentDisplayNumber = window.currentEpisodeIndex + 1;
        episodeInfoSpan.textContent = `第 ${currentDisplayNumber} / ${totalEpisodes} 集`;
        const episodesCountEl = document.getElementById('episodes-count');
        if (episodesCountEl) episodesCountEl.textContent = `共 ${totalEpisodes} 集`;
    } else {
        episodeInfoSpan.textContent = '';
    }
}

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

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    updateOrderButton();
    renderEpisodes();
}

function updateOrderButton() {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    icon.innerHTML = episodesReversed ?
        '<polyline points="18 15 12 9 6 15"></polyline>' :
        '<polyline points="6 9 12 15 18 9"></polyline>';
}

function copyLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || (player ? player.src : '');
    if (!linkUrl) {
        if (typeof showToast === 'function') showToast('没有可复制的视频链接', 'warning');
        return;
    }
    navigator.clipboard.writeText(linkUrl).then(() => {
        if (typeof showToast === 'function') showToast('当前视频链接已复制', 'success');
    }).catch(err => {
        console.error('复制链接失败:', err);
        if (typeof showToast === 'function') showToast('复制失败，请检查浏览器权限', 'error');
    });
}

function toggleLockScreen() {
    if (!player) {
        console.warn("播放器未初始化，无法锁定屏幕。");
        return;
    }
    isScreenLocked = !isScreenLocked;
    player.keyDisabled = isScreenLocked;
    const playerContainer = document.querySelector('.player-container');
    const lockIcon = document.getElementById('lock-icon');
    const elementsToToggle = document.querySelectorAll('.plyr, .plyr__controls, .vds-controls, .vds-gestures, #episodes-container, #prev-episode, #next-episode, .player-control-bar > *:not(#lock-button)');

    if (playerContainer) {
        playerContainer.classList.toggle('player-locked', isScreenLocked);
    }
    elementsToToggle.forEach(el => {
        if (el) {
            el.inert = isScreenLocked;
        }
    });

    if (lockIcon) {
        if (isScreenLocked) {
            lockIcon.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>`;
            showMessage('屏幕已锁定', 'info', 2500);
        } else {
            lockIcon.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>`;
            showMessage('屏幕已解锁', 'info', 1500);
        }
    }

    const mediaElement = player.querySelector('video');
    if (mediaElement) {
        mediaElement.removeEventListener('click', handleMediaClick);
        if (isScreenLocked) {
            mediaElement.addEventListener('click', handleMediaClick);
        }
    }
}

function handleMediaClick(e) {
    e.stopPropagation();
    if (!player) return;
    if (player.paused) {
        player.play();
    } else {
        player.pause();
    }
    showToast(player.paused ? '播放' : '暂停', 'info', 1000);
}

function handleSkipIntroOutro(playerInstance) {
    if (!playerInstance) return;
    const skipIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    if (skipIntroTime > 0) {
        playerInstance.addEventListener('loaded-metadata', () => {
            if (playerInstance.duration > skipIntroTime && playerInstance.currentTime < skipIntroTime) {
                playerInstance.currentTime = skipIntroTime;
                if (typeof showToast === 'function') showToast(`已跳过${skipIntroTime}秒片头`, 'info');
            }
        }, { once: true });
    }
    const skipOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
    if (skipOutroTime > 0) {
        playerInstance.addEventListener('time-update', () => {
            if (!playerInstance || playerInstance.paused) return;
            const remain = playerInstance.duration - playerInstance.currentTime;
            if (remain <= skipOutroTime) {
                if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
                    playNextEpisode();
                } else {
                    playerInstance.pause();
                    if (typeof showToast === 'function') showToast(`已跳过${skipOutroTime}秒片尾`, 'info');
                }
            }
        });
    }
}

function setupSkipControls() {
    const skipButton = document.getElementById('skip-control-button');
    const dropdown = document.getElementById('skip-control-dropdown');
    const skipIntroInput = document.getElementById('skip-intro-input');
    const skipOutroInput = document.getElementById('skip-outro-input');
    const applyBtn = document.getElementById('apply-skip-settings');
    const resetBtn = document.getElementById('reset-skip-settings');
    if (!skipButton || !dropdown || !skipIntroInput || !skipOutroInput || !applyBtn || !resetBtn) return;
    skipButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const lineDropdown = document.getElementById('line-switch-dropdown');
        if (lineDropdown) lineDropdown.classList.add('hidden');
        dropdown.classList.toggle('hidden');
    });
    applyBtn.addEventListener('click', () => {
        const introTime = parseInt(skipIntroInput.value) || 0;
        const outroTime = parseInt(skipOutroInput.value) || 0;
        localStorage.setItem(SKIP_INTRO_KEY, introTime);
        localStorage.setItem(SKIP_OUTRO_KEY, outroTime);
        if (typeof showToast === 'function') showToast('跳过时间设置已保存', 'success');
        dropdown.classList.add('hidden');
    });
    resetBtn.addEventListener('click', () => {
        localStorage.removeItem(SKIP_INTRO_KEY);
        localStorage.removeItem(SKIP_OUTRO_KEY);
        skipIntroInput.value = '';
        skipOutroInput.value = '';
        if (typeof showToast === 'function') showToast('跳过时间设置已重置', 'success');
    });
    const savedIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    const savedOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
    skipIntroInput.value = savedIntroTime > 0 ? savedIntroTime : '';
    skipOutroInput.value = savedOutroTime > 0 ? savedOutroTime : '';
}

function setupSkipDropdownEvents() {
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('skip-control-dropdown');
        const skipButton = document.getElementById('skip-control-button');
        if (dropdown && !dropdown.classList.contains('hidden') && !skipButton.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

function setupLineSwitching() {
    const button = document.getElementById('line-switch-button');
    const dropdown = document.getElementById('line-switch-dropdown');
    if (!button || !dropdown) return;

    const showLinesFromCache = (event) => {
        event.stopPropagation();
        const skipDropdown = document.getElementById('skip-control-dropdown');
        if (skipDropdown) skipDropdown.classList.add('hidden');
        dropdown.innerHTML = '';

        const currentId = vodIdForPlayer;

        if (availableAlternativeSources.length > 1) {
            availableAlternativeSources.forEach(source => {
                const item = document.createElement('button');

                const vodName = source.vod_name || '';
                const remarks = source.vod_remarks || '';

                const allVersionTags = ['国语', '国', '粤语', '粤', '台配', '台', '中字', '普通话', '高清', 'HD', '修复版', 'TC', '蓝光', '4K'];
                const seasonRegex = /(第[一二三四五六七八九十\d]+[季部]|Season\s*\d+)/i;

                const foundTags = [];
                allVersionTags.forEach(tag => {
                    if (vodName.includes(tag)) {
                        foundTags.push(tag);
                    }
                });

                // 简单的去重：为了避免 "国语" 和 "国" 同时被匹配
                if (foundTags.includes('国语') && foundTags.includes('国')) {
                    foundTags.splice(foundTags.indexOf('国'), 1);
                }
                if (foundTags.includes('粤语') && foundTags.includes('粤')) {
                    foundTags.splice(foundTags.indexOf('粤'), 1);
                }
                if (foundTags.includes('台配') && foundTags.includes('台')) {
                    foundTags.splice(foundTags.indexOf('台'), 1);
                }

                const seasonMatch = vodName.match(seasonRegex);
                if (seasonMatch) {
                    foundTags.push(seasonMatch[0]);
                }
                if (remarks) {
                    foundTags.push(remarks);
                }

                let tagsDisplay = '';
                if (foundTags.length > 0) {
                    tagsDisplay = `(${foundTags.join(', ')})`;
                }
                item.textContent = `${source.source_name} ${tagsDisplay}`.trim();

                item.dataset.sourceCode = source.source_code;
                item.dataset.vodId = source.vod_id;
                item.className = 'w-full text-left px-3 py-2 rounded text-sm transition-colors hover:bg-gray-700';

                if (String(source.vod_id) === currentId) {
                    item.classList.add('line-active', 'bg-blue-600', 'text-white');
                    item.disabled = true;
                } else {
                    item.classList.add('text-gray-300');
                }
                dropdown.appendChild(item);
            });
        } else {
            dropdown.innerHTML = `<div class="text-center text-sm text-gray-500 py-2">无其他可用线路</div>`;
        }
        dropdown.classList.toggle('hidden');
    };

    if (!button._lineSwitchListenerAttached) {
        button.addEventListener('click', showLinesFromCache);
        button._lineSwitchListenerAttached = true;
    }
    if (!dropdown._actionListener) {
        dropdown.addEventListener('click', (e) => {
            const target = e.target.closest('button[data-source-code]');
            if (target && !target.disabled) {
                dropdown.classList.add('hidden');
                switchLine(target.dataset.sourceCode, target.dataset.vodId);
            }
        });
        dropdown._actionListener = true;
    }
    if (!document._docClickListenerForLineSwitch) {
        document.addEventListener('click', (e) => {
            if (!dropdown.classList.contains('hidden') && !button.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
        document._docClickListenerForLineSwitch = true;
    }
}

async function switchLine(newSourceCode, newVodId) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
        const targetSourceItem = availableAlternativeSources.find(
            item => String(item.vod_id) === newVodId
        );
        if (!targetSourceItem) {
            throw new Error(`未能在可用线路中找到ID为“${newVodId}”的线路信息。`);
        }

        const detailRes = await fetch(`/api/detail?id=${newVodId}&source=${newSourceCode}`);
        const detailData = await detailRes.json();
        if (detailData.code !== 200 || !detailData.episodes || !detailData.episodes.length === 0) {
            throw new Error(`在线路“${targetSourceItem.source_name}”上获取剧集列表失败`);
        }

        const newEps = detailData.episodes;
        const timeToSeek = player.currentTime;

        vodIdForPlayer = newVodId;
        currentEpisodes = newEps;
        window.currentEpisodes = newEps;
        localStorage.setItem('currentEpisodes', JSON.stringify(newEps));

        currentVideoTitle = targetSourceItem.vod_name;
        currentVideoYear = targetSourceItem.vod_year;
        currentVideoTypeName = targetSourceItem.type_name;

        let targetEpisodeIndex = currentEpisodeIndex;
        if (targetEpisodeIndex >= newEps.length) {
            targetEpisodeIndex = newEps.length > 0 ? newEps.length - 1 : 0;
        }
        const newEpisodeUrl = newEps[targetEpisodeIndex];
        const newUrlForBrowser = new URL(window.location.href);

        newUrlForBrowser.searchParams.set('url', newEpisodeUrl);
        newUrlForBrowser.searchParams.set('title', currentVideoTitle);
        newUrlForBrowser.searchParams.set('index', String(targetEpisodeIndex));
        newUrlForBrowser.searchParams.set('id', newVodId);
        newUrlForBrowser.searchParams.set('source', targetSourceItem.source_name);
        newUrlForBrowser.searchParams.set('source_code', newSourceCode);
        if (currentVideoYear) newUrlForBrowser.searchParams.set('year', currentVideoYear);
        if (currentVideoTypeName) newUrlForBrowser.searchParams.set('typeName', currentVideoTypeName);

        const newVideoKey = `${currentVideoTitle}|${currentVideoYear || ''}`;
        newUrlForBrowser.searchParams.set('videoKey', newVideoKey);

        universalId = generateUniversalId(currentVideoTitle, currentVideoYear, targetEpisodeIndex);
        newUrlForBrowser.searchParams.set('universalId', universalId);

        window.history.replaceState({}, '', newUrlForBrowser.toString());

        nextSeekPosition = timeToSeek;
        const processedUrl = await processVideoUrl(newEpisodeUrl);

        player.src = { src: processedUrl, type: 'application/x-mpegurl' };
        player.title = currentVideoTitle;

        player.play();

        renderEpisodes();
        updateEpisodeInfo();

        const dropdown = document.getElementById('line-switch-dropdown');
        if (dropdown) dropdown.innerHTML = '';

        if (loadingEl) loadingEl.style.display = 'none';
        showMessage(`已切换到线路: ${targetSourceItem.source_name}`, 'success');

    } catch (err) {
        console.error("切换线路失败:", err);
        showError(`切换失败: ${err.message}`);
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
    }
}

function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
    }
}

function setupRememberEpisodeProgressToggle() {
    // 这个函数现在为空，因为功能已经移到setupPlayerSettings中
    // 保留函数定义以防止调用时出错
    console.log('记住进度功能已移到播放设置面板中');
}

function retryLastAction() {
    hidePlayerOverlays();

    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'none';

    if (!lastFailedAction) {
        if (player && player.currentSrc) {
            console.log("重试：重新加载当前视频源。");
            player.src = player.currentSrc; // 重新设置源
            player.play().catch(e => console.error("重试播放失败", e));
        }
        return;
    }
    if (lastFailedAction.type === 'switchLine') {
        const { sourceCode, vodId } = lastFailedAction.payload;
        console.log(`重试：切换到线路 ${sourceCode} (ID: ${vodId})`);
        lastFailedAction = null;
        switchLine(sourceCode, vodId);
    } else {
        console.log("重试：未知操作类型，执行默认重载。");
        lastFailedAction = null;
        if (player && player.currentSrc) {
            player.src = player.currentSrc;
            player.play().catch(e => console.error("重试播放失败", e));
        }
    }
}

window.playNextEpisode = playNextEpisode;
window.playPreviousEpisode = playPreviousEpisode;
window.copyLinks = copyLinks;
window.toggleEpisodeOrder = toggleEpisodeOrder;
window.toggleLockScreen = toggleLockScreen;


// ==================== 播放设置面板功能 ====================

function setupPlayerSettings() {
    console.log('开始初始化播放设置面板');
    
    const settingsButton = document.getElementById('player-settings-button');
    const settingsDropdown = document.getElementById('player-settings-dropdown');
    const playbackSpeedSelect = document.getElementById('playback-speed');
    const autoplayToggle = document.getElementById('autoplay-next');
    const rememberProgressToggle = document.getElementById('remember-episode-progress-toggle');
    
    console.log('设置元素查找结果:', {
        settingsButton: !!settingsButton,
        settingsDropdown: !!settingsDropdown,
        playbackSpeedSelect: !!playbackSpeedSelect,
        autoplayToggle: !!autoplayToggle,
        rememberProgressToggle: !!rememberProgressToggle
    });
    
    if (!settingsButton || !settingsDropdown) {
        console.error('设置按钮或下拉菜单未找到，等待重试...');
        // 延迟重试
        setTimeout(setupPlayerSettings, 500);
        return;
    }
    
    // 防止重复绑定事件
    if (settingsButton._playerSettingsInitialized) {
        console.log('播放设置已经初始化过了');
        return;
    }
    
    // 设置按钮点击事件
    settingsButton.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        console.log('设置按钮被点击');
        
        // 隐藏其他下拉菜单
        const otherDropdowns = document.querySelectorAll('#line-switch-dropdown, #skip-control-dropdown');
        otherDropdowns.forEach(dropdown => {
            dropdown.classList.add('hidden');
        });
        
        // 切换设置面板显示
        const isHidden = settingsDropdown.classList.contains('hidden');
        settingsDropdown.classList.toggle('hidden');
        
        console.log('设置面板状态:', isHidden ? '显示' : '隐藏');
    });
    
    // 播放速度选择事件
    if (playbackSpeedSelect) {
        playbackSpeedSelect.addEventListener('change', (e) => {
            const speed = parseFloat(e.target.value);
            console.log('播放速度设置为:', speed);
            
            if (player && player.playbackRate !== undefined) {
                player.playbackRate = speed;
                showToast(`播放速度已设置为 ${speed}x`, 'success');
            }
            // 保存设置
            localStorage.setItem('playbackSpeed', speed.toString());
        });
        
        // 从存储中恢复播放速度设置
        const savedSpeed = localStorage.getItem('playbackSpeed');
        if (savedSpeed) {
            playbackSpeedSelect.value = savedSpeed;
        }
    }
    
    // 自动播放下一集开关事件
    if (autoplayToggle) {
        autoplayToggle.addEventListener('change', (e) => {
            autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled.toString());
            showToast(autoplayEnabled ? '已启用自动播放' : '已禁用自动播放', 'info');
            console.log('自动播放设置:', autoplayEnabled);
        });
        
        // 从存储中恢复自动播放设置
        const savedAutoplay = localStorage.getItem('autoplayEnabled');
        if (savedAutoplay !== null) {
            autoplayEnabled = savedAutoplay === 'true';
            autoplayToggle.checked = autoplayEnabled;
        } else {
            // 默认启用自动播放
            autoplayEnabled = true;
            autoplayToggle.checked = true;
        }
    }
    
    // 记住播放进度开关事件
    if (rememberProgressToggle) {
        rememberProgressToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, isChecked.toString());
            const messageText = isChecked ? '将记住本视频的各集播放进度' : '将不再记住本视频的各集播放进度';
            showToast(messageText, 'info');
            console.log('记住进度设置:', isChecked);
            
            if (!isChecked) {
                // 如果关闭了进度记忆，清除当前视频的所有进度
                if (typeof clearCurrentVideoAllEpisodeProgresses === 'function') {
                    clearCurrentVideoAllEpisodeProgresses();
                }
            }
        });
        
        // 从存储中恢复记住进度设置
        const savedRememberProgress = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY);
        if (savedRememberProgress !== null) {
            rememberProgressToggle.checked = savedRememberProgress === 'true';
        } else {
            // 默认启用记住进度
            rememberProgressToggle.checked = true;
        }
    }
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
        if (!settingsDropdown.classList.contains('hidden') && 
            !settingsButton.contains(e.target) && 
            !settingsDropdown.contains(e.target)) {
            settingsDropdown.classList.add('hidden');
            console.log('点击外部，关闭设置面板');
        }
    });
    
    // 标记已初始化
    settingsButton._playerSettingsInitialized = true;
    console.log('✅ 播放设置面板初始化完成');
}

// ==================== 增强：下拉菜单管理 ====================

function enhanceDropdownManagement() {
    console.log('开始增强下拉菜单管理');
    
    // 获取所有下拉菜单相关的按钮和菜单
    const dropdownPairs = [
        {
            button: document.getElementById('line-switch-button'),
            dropdown: document.getElementById('line-switch-dropdown')
        },
        {
            button: document.getElementById('skip-control-button'),
            dropdown: document.getElementById('skip-control-dropdown')
        },
        {
            button: document.getElementById('player-settings-button'),
            dropdown: document.getElementById('player-settings-dropdown')
        }
    ];
    
    // 为每个下拉菜单添加统一的管理
    dropdownPairs.forEach((pair, index) => {
        if (pair.button && pair.dropdown) {
            console.log(`初始化下拉菜单 ${index + 1}:`, pair.button.id);
            
            // 添加增强样式类
            pair.dropdown.classList.add('elegant-dropdown', 'elegant-solid-dropdown');
            
            // 确保点击按钮时关闭其他菜单（只对线路切换和跳过设置有效）
            if (pair.button.id !== 'player-settings-button') {
                pair.button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    
                    // 关闭其他下拉菜单
                    dropdownPairs.forEach(otherPair => {
                        if (otherPair !== pair && otherPair.dropdown) {
                            otherPair.dropdown.classList.add('hidden');
                        }
                    });
                });
            }
        }
    });
    
    console.log('✅ 下拉菜单管理增强完成');
}


const originalSetupAllUI = window.setupAllUI;

// 创建增强版的 setupAllUI 函数
function setupAllUI() {
    console.log('🎬 开始初始化播放器UI');
    
    updateEpisodeInfo();
    renderEpisodes();
    setupPlayerControls();
    updateButtonStates();
    updateOrderButton();
    setupLineSwitching();
    setupSkipControls();
    setupSkipDropdownEvents();
    // 注意：不再调用setupRememberEpisodeProgressToggle，因为功能已移到设置面板
    
    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', () => {
        saveCurrentProgress();
        saveVideoSpecificProgress();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
            saveVideoSpecificProgress();
        }
    });
    
    // 延迟初始化增强功能
    setTimeout(() => {
        initializeElegantEnhancements();
    }, 200);
    
    console.log('✅ 播放器UI初始化完成');
}


// 替换全局的 setupAllUI 函数
window.setupAllUI = setupAllUI;

// ==================== 增强：锁屏功能 ====================
// 注意：这部分代码增强了原有的锁屏功能，但保持原有逻辑

function enhanceLockScreen() {
    const lockButton = document.getElementById('lock-button');
    if (!lockButton) return;

    // 获取原有的点击事件监听器（如果存在）
    const originalToggleLockScreen = window.toggleLockScreen;

    // 增强锁屏按钮的视觉反馈
    lockButton.addEventListener('click', () => {
        // 延迟一点更新样式，让原有逻辑先执行
        setTimeout(() => {
            if (isScreenLocked) {
                lockButton.classList.add('locked');
                lockButton.classList.add('elegant-function-button');
            } else {
                lockButton.classList.remove('locked');
            }
        }, 100);
    });
}

// ==================== 增强：剧集网格 ====================
// 注意：这部分代码增强了原有的剧集网格，但保持原有逻辑

function enhanceEpisodeGrid() {
    const episodeGrid = document.getElementById('episode-grid');
    if (!episodeGrid) return;

    // 使用 MutationObserver 来监听网格内容变化
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                // 为新添加的按钮添加增强样式
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BUTTON') {
                        // 不移除原有类，只添加增强类
                        node.classList.add('elegant-episode-button');
                    }
                });
            }
        });
    });

    observer.observe(episodeGrid, { childList: true });
}

// ==================== 增强：Toast 消息 ====================
// 注意：这部分代码增强了原有的 Toast 功能，但保持原有逻辑

function enhanceToast() {
    const toast = document.getElementById('toast');
    if (!toast) return;

    // 为 toast 添加增强样式类
    toast.classList.add('elegant-toast');

    // 保持原有的 showToast 函数逻辑，只添加样式增强
    const originalShowToast = window.showToast;
    if (originalShowToast) {
        window.showToast = function (message, type = 'info', duration = 3000) {
            // 调用原有的 showToast 逻辑
            originalShowToast(message, type, duration);

            // 添加增强的样式类
            const bgColors = {
                'error': 'bg-red-500',
                'success': 'bg-green-500',
                'info': 'bg-blue-500',
                'warning': 'bg-yellow-500'
            };

            const bgColor = bgColors[type] || bgColors.info;
            toast.className = `elegant-toast ${bgColor} text-white`;
        };
    }
}

// ==================== 增强：消息提示 ====================
// 注意：这部分代码增强了原有的消息提示功能，但保持原有逻辑

function enhanceMessage() {
    const message = document.getElementById('message');
    if (!message) return;

    // 为消息提示添加增强样式类
    message.classList.add('elegant-message');

    // 保持原有的 showMessage 函数逻辑，只添加样式增强
    const originalShowMessage = window.showMessage;
    if (originalShowMessage) {
        window.showMessage = function (text, type = 'info', duration = 3000) {
            // 调用原有的 showMessage 逻辑
            originalShowMessage(text, type, duration);

            // 添加增强的样式类
            const bgColors = {
                'error': 'bg-red-500',
                'success': 'bg-green-500',
                'info': 'bg-blue-500',
                'warning': 'bg-yellow-500'
            };

            const bgColor = bgColors[type] || bgColors.info;
            message.className = `elegant-message ${bgColor} text-white opacity-0`;

            // 确保消息显示后添加增强样式
            setTimeout(() => {
                message.classList.add('opacity-100');
            }, 10);
        };
    }
}

// ==================== 增强：进度恢复弹窗 ====================
// 注意：这部分代码增强了原有的进度恢复弹窗，但保持原有逻辑

function enhanceProgressModal() {
    const progressModal = document.getElementById('progress-restore-modal');
    if (!progressModal) return;

    // 为进度恢复弹窗添加增强样式类
    progressModal.classList.add('elegant-progress-modal');

    const progressCard = progressModal.querySelector('.progress-restore-card');
    if (progressCard) {
        progressCard.classList.add('elegant-progress-card');
    }

    const progressTitle = progressModal.querySelector('.progress-modal-title');
    if (progressTitle) {
        progressTitle.classList.add('elegant-progress-title');
    }

    const progressContent = progressModal.querySelector('.progress-modal-content');
    if (progressContent) {
        progressContent.classList.add('elegant-progress-content');
    }

    const progressActions = progressModal.querySelector('.progress-modal-actions');
    if (progressActions) {
        progressActions.classList.add('elegant-progress-actions');
    }

    const progressButtons = progressModal.querySelectorAll('.progress-modal-btn');
    progressButtons.forEach(button => {
        button.classList.add('elegant-progress-button');
    });
}

// ==================== 增强：快捷键提示 ====================
// 注意：这部分代码增强了原有的快捷键提示，但保持原有逻辑

function enhanceShortcutHint() {
    const shortcutHint = document.getElementById('shortcut-hint');
    if (!shortcutHint) return;

    // 为快捷键提示添加增强样式类
    shortcutHint.classList.add('elegant-shortcut-hint');
}

// ==================== 增强：播放器区域 ====================
// 注意：这部分代码增强了播放器区域的视觉效果

function enhancePlayerRegion() {
    const playerRegion = document.getElementById('player-region');
    if (!playerRegion) return;

    // 为播放器区域添加增强样式类
    playerRegion.classList.add('elegant-player-region');

    const playerWrapper = document.getElementById('player');
    if (playerWrapper) {
        playerWrapper.classList.add('elegant-player-wrapper');
    }

    const loadingOverlay = document.getElementById('loading');
    if (loadingOverlay) {
        loadingOverlay.classList.add('elegant-loading');

        const loadingSpinner = loadingOverlay.querySelector('.loading-spinner');
        if (loadingSpinner) {
            loadingSpinner.classList.add('elegant-spinner');
        }

        const loadingText = loadingOverlay.querySelector('.mt-4');
        if (loadingText) {
            loadingText.classList.add('elegant-loading-text');
        }
    }

    const errorOverlay = document.getElementById('error');
    if (errorOverlay) {
        errorOverlay.classList.add('elegant-error');

        const errorIcon = errorOverlay.querySelector('.error-icon');
        if (errorIcon) {
            errorIcon.classList.add('elegant-error-icon');
        }

        const errorTitle = errorOverlay.querySelector('.text-xl.font-bold');
        if (errorTitle) {
            errorTitle.classList.add('elegant-error-title');
        }

        const errorMessage = errorOverlay.querySelector('.mt-2');
        if (errorMessage) {
            errorMessage.classList.add('elegant-error-message');
        }

        const retryButton = document.getElementById('retry-button');
        if (retryButton) {
            retryButton.classList.add('elegant-retry-button');
        }
    }
}

// ==================== 增强：顶部导航栏 ====================
// 注意：这部分代码增强了顶部导航栏的视觉效果

function enhanceHeader() {
    const header = document.querySelector('header');
    if (!header) return;

    // 为顶部导航栏添加增强样式类
    header.classList.add('elegant-header');

    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.classList.add('elegant-back-button');
    }

    const headerActions = header.querySelector('.flex.items-center.ml-auto');
    if (headerActions) {
        headerActions.classList.add('elegant-header-actions');
    }

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.classList.add('elegant-fullscreen-button');
    }
}

function enhancePlaybackControls() {
    const playbackControls = document.querySelector('.flex.items-center.justify-between.p-4');
    if (!playbackControls) return;

    // 为播放控制区域添加增强样式类
    playbackControls.classList.add('elegant-playback-controls');

    const prevButton = document.getElementById('prev-episode');
    if (prevButton) {
        prevButton.classList.add('elegant-nav-button');
    }

    const nextButton = document.getElementById('next-episode');
    if (nextButton) {
        nextButton.classList.add('elegant-nav-button');
    }

    const episodeInfo = document.getElementById('episode-info-span');
    if (episodeInfo) {
        episodeInfo.classList.add('elegant-episode-info');
    }
}

function enhanceFunctionBar() {
    const functionBar = document.querySelector('.p-4.bg-gray-900.rounded-lg.mx-4.mb-4');
    if (!functionBar) return;

    // 为功能控制条添加增强样式类
    functionBar.classList.add('elegant-function-bar');

    const controlBar = functionBar.querySelector('.player-control-bar');
    if (controlBar) {
        controlBar.classList.add('elegant-controls');
    }

    // 增强所有控制项
    const controlItems = functionBar.querySelectorAll('.flex.items-center.gap-2');
    controlItems.forEach(item => {
        item.classList.add('elegant-control-item');
    });

    // 增强所有标签
    const labels = functionBar.querySelectorAll('.control-label');
    labels.forEach(label => {
        label.classList.add('elegant-label');
    });

    // 增强所有开关
    const switches = functionBar.querySelectorAll('.switch');
    switches.forEach(switchElement => {
        switchElement.classList.add('elegant-switch');

        const slider = switchElement.querySelector('.slider');
        if (slider) {
            slider.classList.add('elegant-slider');
        }
    });

    // 增强所有功能按钮
    const functionButtons = functionBar.querySelectorAll('.icon-btn');
    functionButtons.forEach(button => {
        button.classList.add('elegant-function-button');
    });

    // 增强所有功能组
    const functionGroups = functionBar.querySelectorAll('.relative');
    functionGroups.forEach(group => {
        group.classList.add('elegant-function-group');
    });
}

function enhanceEpisodesContainer() {
    const episodesContainer = document.getElementById('episodes-container');
    if (!episodesContainer) return;

    // 为剧集容器添加增强样式类
    episodesContainer.classList.add('elegant-episodes-container');

    const episodesHeader = episodesContainer.querySelector('.flex.justify-between.items-center.mb-2');
    if (episodesHeader) {
        episodesHeader.classList.add('elegant-episodes-header');
    }

    const episodesTitle = episodesContainer.querySelector('h2');
    if (episodesTitle) {
        episodesTitle.classList.add('elegant-episodes-title');
    }

    const episodesCount = document.getElementById('episodes-count');
    if (episodesCount) {
        episodesCount.classList.add('elegant-episodes-count');
    }

    const episodeGrid = document.getElementById('episode-grid');
    if (episodeGrid) {
        episodeGrid.classList.add('elegant-episodes-grid');
    }
}

function enhanceContainer() {
    const body = document.body;
    if (body) {
        body.classList.add('elegant-body');
    }

    const container = document.querySelector('.player-container');
    if (container) {
        container.classList.add('elegant-container');
    }
}

function ensureCompatibility() {
    // 确保原有的 toggleEpisodeOrder 函数的图标更新逻辑
    const orderButton = document.getElementById('order-button');
    if (orderButton && typeof window.toggleEpisodeOrder === 'function') {
        orderButton.addEventListener('click', () => {
            setTimeout(() => {
                const orderIcon = document.getElementById('order-icon');
                if (orderIcon) {
                    
                     const isReversed = orderIcon.style.transform === 'rotate(180deg)';
                    orderButton.classList.toggle('active', isReversed);
                }
            }, 100);
        });
    }

    // 增强跳过设置下拉菜单的样式
    const skipDropdown = document.getElementById('skip-control-dropdown');
    if (skipDropdown) {
        skipDropdown.classList.add('elegant-dropdown');
        const skipContent = skipDropdown.querySelector('div');
        if (skipContent) {
            skipContent.classList.add('elegant-dropdown-content');
        }
        const skipInputGroups = skipDropdown.querySelectorAll('.flex.items-center');
        skipInputGroups.forEach(group => {
            group.classList.add('elegant-input-group');
        });
        const skipInputs = skipDropdown.querySelectorAll('input');
        skipInputs.forEach(input => {
            input.classList.add('elegant-input');
        });
        const skipLabels = skipDropdown.querySelectorAll('label');
        skipLabels.forEach(label => {
            label.classList.add('elegant-label');
        });
        const skipButtons = skipDropdown.querySelectorAll('button');
        skipButtons.forEach((button, index) => {
            if (index === 0) {
                button.classList.add('elegant-primary-button');
            } else {
                button.classList.add('elegant-secondary-button');
            }
        });
    }

    // 增强线路切换下拉菜单的样式
    const lineDropdown = document.getElementById('line-switch-dropdown');
    if (lineDropdown) {
        lineDropdown.classList.add('elegant-dropdown');
    }
}

function initializeElegantEnhancements() {
    console.log('🚀 开始初始化典雅增强功能');
    
    // 等待 DOM 完全加载
    if (document.readyState === 'loading') {
        console.log('DOM 还在加载中，等待加载完成...');
        document.addEventListener('DOMContentLoaded', initializeElegantEnhancements);
        return;
    }
    
    // 初始化所有增强功能
    try {
        enhanceContainer();
        enhanceHeader();
        enhancePlayerRegion();
        enhancePlaybackControls();
        enhanceFunctionBar();
        enhanceEpisodesContainer();
        enhanceDropdownManagement();
        enhanceLockScreen();
        enhanceEpisodeGrid();
        enhanceToast();
        enhanceMessage();
        enhanceProgressModal();
        enhanceShortcutHint();
        setupCopyLinkButton(); // 新增：修复复制按钮
        ensureCompatibility();
        
        // 延迟初始化设置面板，确保所有元素都准备好了
        setTimeout(() => {
            setupPlayerSettings();
        }, 100);
        
        console.log('✨ 典雅样式增强已加载');
    } catch (error) {
        console.error('增强功能初始化失败:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // 延迟一点时间，确保原有的初始化逻辑先执行
        setTimeout(() => {
            initializeElegantEnhancements();
            setupPlayerSettings();
            enhanceDropdownManagement();
        }, 300);
    });
} else {
    // 页面已经加载完成，延迟初始化
    setTimeout(() => {
        initializeElegantEnhancements();
        setupPlayerSettings();
        enhanceDropdownManagement();
    }, 300);
}

window.playNextEpisode = playNextEpisode;
window.playPreviousEpisode = playPreviousEpisode;
window.copyLinks = copyLinks;
window.toggleEpisodeOrder = toggleEpisodeOrder;
window.toggleLockScreen = toggleLockScreen;