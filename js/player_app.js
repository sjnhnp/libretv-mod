// File: js/player_app.js

// Per user instructions, using CDN links for Vidstack:
import { VidstackPlayer, VidstackPlayerLayout } from 'https://cdn.vidstack.io/player';

// Add this helper function at the top of js/player_app.js
let isPageInitialized = false; // Flag to prevent multiple initializations

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

// 自动加属性防止安卓video系统菜单
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
            // 这些属性可减少系统菜单
            dpvideo.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
            dpvideo.setAttribute('webkit-playsinline', 'true');
            dpvideo.setAttribute('playsinline', 'true');
        }
    }, 800); // 确保DPlayer结构已渲染
}

const SKIP_INTRO_KEY = 'skipIntroTime';
const SKIP_OUTRO_KEY = 'skipOutroTime';

function setupSkipControls() {
    // 初始化 UI 元素
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

    // 显示 / 隐藏菜单
    skipButton.addEventListener('click', () => {
        if (dropdown.classList.contains('hidden')) {
            dropdown.classList.remove('hidden');
            dropdown.classList.add('block');
        } else {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('block');
        }
    });


    // 应用设置按钮
    applyBtn.addEventListener('click', () => {
        const introTime = parseInt(skipIntroInput.value) || 0;
        const outroTime = parseInt(skipOutroInput.value) || 0;

        localStorage.setItem(SKIP_INTRO_KEY, introTime);
        localStorage.setItem(SKIP_OUTRO_KEY, outroTime);

        if (typeof showToast === 'function') {
            showToast('跳过时间设置已保存', 'success');
        }
        dropdown.classList.remove('active'); // 收起设置框
    });

    // 重置时间
    resetBtn.addEventListener('click', () => {
        localStorage.removeItem(SKIP_INTRO_KEY);
        localStorage.removeItem(SKIP_OUTRO_KEY);
        skipIntroInput.value = '';
        skipOutroInput.value = '';

        if (typeof showToast === 'function') {
            showToast('跳过时间设置已重置', 'success');
        }
    });

    // 从 localStorage 中加载初始值
    const savedIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    const savedOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;

    skipIntroInput.value = savedIntroTime;
    skipOutroInput.value = savedOutroTime;
}

function setupSkipDropdownEvents() {
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('skip-control-dropdown');
        const skipButton = document.getElementById('skip-control-button');
        if (!skipButton || !dropdown) return;

        if (skipButton.contains(event.target)) {
            // 已由 setupSkipControls 单独处理
        } else if (!dropdown.contains(event.target)) {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('block');
        }
    });

}

// 自动跳过片头和片尾
function handleSkipIntroOutro() { // No longer takes dpInstance, uses window.vsPlayer
    if (!window.vsPlayer) return;

    const player = window.vsPlayer;

    // --- Skip Intro ---
    const skipIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;

    // Remove previous listener if it exists
    if (player._skipIntroLoadedMetadataHandler) { // Name changed in previous subtask, ensure consistency
        player.removeEventListener('loadedmetadata', player._skipIntroLoadedMetadataHandler);
        player._skipIntroLoadedMetadataHandler = null;
    }
    if (player._skipIntroTimeUpdateHandler) {
        player.removeEventListener('timeupdate', player._skipIntroTimeUpdateHandler);
        player._skipIntroTimeUpdateHandler = null;
    }

    if (skipIntroTime > 0) {
        // Renaming _skipIntroHandler to _skipIntroLoadedMetadataHandler for clarity
        player._skipIntroLoadedMetadataHandler = function () {
            if (player.duration > skipIntroTime && player.currentTime < skipIntroTime) {
                player.currentTime = skipIntroTime;
                if (typeof showToast === 'function') showToast(`已跳过${skipIntroTime}秒片头`, 'info');
            }
        };
        player._skipIntroTimeUpdateHandler = function() {
            if (player.duration > skipIntroTime && player.currentTime < skipIntroTime && player.currentTime > 0 && !player.seeking) {
                if (Math.abs(player.currentTime - skipIntroTime) > 0.5) {
                    player.currentTime = skipIntroTime;
                     if (typeof showToast === 'function') showToast(`已跳过${skipIntroTime}秒片头`, 'info');
                }
            }
        };

        player.addEventListener('loadedmetadata', player._skipIntroLoadedMetadataHandler);
        player.addEventListener('timeupdate', player._skipIntroTimeUpdateHandler);

        // Immediate check in case the video is already playing and past metadata load
        if (player.currentTime > 0 && player.duration > skipIntroTime && player.currentTime < skipIntroTime) {
             player.currentTime = skipIntroTime;
             if (typeof showToast === 'function') showToast(`已跳过${skipIntroTime}秒片头`, 'info');
        }

    }

    // --- Skip Outro ---
    const skipOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
    if (player._skipOutroTimeUpdateHandler) { // Name changed to avoid conflict if logic was similar
        player.removeEventListener('timeupdate', player._skipOutroTimeUpdateHandler);
        player._skipOutroTimeUpdateHandler = null;
    }

    if (skipOutroTime > 0) {
        player._skipOutroTimeUpdateHandler = function () {
            if (!player || player.seeking) return;
            const remain = player.duration - player.currentTime;
            if (player.duration > 0 && remain <= skipOutroTime && !player.paused) {
                if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
                    if (typeof playNextEpisode === 'function') playNextEpisode();
                } else {
                    player.pause();
                    if (typeof showToast === 'function') showToast(`已跳过${skipOutroTime}秒片尾`, 'info');
                }
                if (player._skipOutroTimeUpdateHandler) {
                    player.removeEventListener('timeupdate', player._skipOutroTimeUpdateHandler); // Use removeEventListener
                    player._skipOutroTimeUpdateHandler = null;
                }
            }
        };
        player.addEventListener('timeupdate', player._skipOutroTimeUpdateHandler); // Use addEventListener
    }
}


// 初始化跳过功能
document.addEventListener('DOMContentLoaded', () => {
    // 初始化 UI 控件
    setupSkipControls();

    // 新增 Dropdown 菜单显示/隐藏的事件处理
    setupSkipDropdownEvents();

    // 初始化其他页面功能
    // Conditional initialization
    if (!isPageInitialized) {
        console.log('[PlayerApp] Initializing page content via DOMContentLoaded.');
        // Existing password check logic from the old DOMContentLoaded listener
        if (typeof window.isPasswordVerified === 'function' && typeof window.isPasswordProtected === 'function') {
            if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
                const loadingEl = document.getElementById('loading');
                if (loadingEl) loadingEl.style.display = 'none';
                // Do not set isPageInitialized = true here, as password might still be required.
                // Let the passwordVerified event handle the final initialization if needed.
                console.log('[PlayerApp] DOMContentLoaded: Password protected and not verified, delaying full init.');
                return;
            }
        } else {
             console.warn("[PlayerApp] DOMContentLoaded: Password functions (isPasswordProtected/isPasswordVerified) not found. Assuming no password protection.");
        }
        initializePageContent();
        isPageInitialized = true;
    } else {
        console.log('[PlayerApp] Page already initialized, skipping initializePageContent via DOMContentLoaded.');
    }
});


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
let episodesReversed = false;
let dp = null; // DPlayer instance - This should be fully phased out. window.vsPlayer is the new reference.
// let currentHls = null; // No longer used with Vidstack
let autoplayEnabled = true;
let isUserSeeking = false;
let videoHasEnded = false;
let userClickedPosition = null;
let shortcutHintTimeout = null;
let progressSaveInterval = null;
let isScreenLocked = false;
let nextSeekPosition = 0; // Stores the position to seek to for the next episode
let _tempUrlForCustomHls = ''; // Temporary holder for the URL if DPlayer options are stale in customType
let lastTapTimeForDoubleTap = 0;
let vodIdForPlayer = ''; // 新增全局变量存储从URL获取的 VOD ID

// ✨ 新实现：统一在这里生成『剧集级』或『全集级』标识
function getShowIdentifier(perEpisode = true) {
    const sc = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';
    const vid = vodIdForPlayer || '';          // 外部传过来的 vod_id
    const ep = perEpisode ? `_ep${currentEpisodeIndex}` : '';

    // 1) 只要有 vod_id，就用它
    if (vid) return `${currentVideoTitle}_${sc}_${vid}${ep}`;

    // 2) vod_id 没有？对链接取指纹
    const raw = currentEpisodes[currentEpisodeIndex] || '';
    const urlKey = raw.split('/').pop().split(/[?#]/)[0]     // 取文件名
        || (raw.length > 32 ? raw.slice(-32) : raw); // 链接太怪时兜底
    return `${currentVideoTitle}_${sc}_${urlKey}${ep}`;
}

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
let adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true;

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
        const all = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || "{}");
        const showId = getShowIdentifier(false);

        // 如果存在该视频的进度记录，则删除
        if (all[showId]) {
            delete all[showId];
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
    // This part of the original DOMContentLoaded listener is now integrated above.
    // if (typeof window.isPasswordVerified === 'function' && typeof window.isPasswordProtected === 'function') {
    //     if (window.isPasswordProtected() && !window.isPasswordVerified()) {
    //         if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
    //         const loadingEl = document.getElementById('loading');
    //         if (loadingEl) loadingEl.style.display = 'none';
    //         return;
    //     }
    // } else {
    //     console.warn("Password functions (isPasswordProtected/isPasswordVerified) not found. Assuming no password protection.");
    // }
    // initializePageContent(); // This call is now conditional within the DOMContentLoaded above
});

// Listen for password verification success event
document.addEventListener('passwordVerified', () => {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = 'flex'; 
        document.documentElement.classList.add('show-loading');
    }
    // Conditional initialization
    if (!isPageInitialized) {
        console.log('[PlayerApp] Initializing page content via passwordVerified event.');
        initializePageContent();
        isPageInitialized = true;
    } else {
        console.log('[PlayerApp] Page already initialized, skipping initializePageContent via passwordVerified event.');
    }
});

function initializePageContent() {
    if (!testLocalStorageAvailable()) {
        showMessage('当前浏览器本地存储不可用，播放进度记忆将失效', 'warning');
    }
    //  console.log('[PlayerApp Debug] initializePageContent starting...');
    const urlParams = new URLSearchParams(window.location.search);
    let episodeUrlForPlayer = urlParams.get('url'); // 先用 let，后续可能修改
    let title = urlParams.get('title');
    vodIdForPlayer = urlParams.get('id') || '';
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
        const showId = getShowIdentifier(false); // <--- 使用新的函数获取剧集ID
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressDataForShow = allSpecificProgresses[showId]; // <--- 用 showId 获取该剧的进度对象

        if (savedProgressDataForShow) {
            const resumeIndex = indexForPlayer;
            const positionToResume =
                savedProgressDataForShow[resumeIndex.toString()] // <--- 从剧集对象中获取特定集的进度
                    ? parseInt(savedProgressDataForShow[resumeIndex.toString()])
                    : 0;

            if ((!urlParams.has('index') || urlParams.get('index') === null) &&
                typeof savedProgressDataForShow.lastPlayedEpisodeIndex === 'number' && // <--- 从剧集对象中获取
                savedProgressDataForShow.lastPlayedEpisodeIndex >= 0 &&
                savedProgressDataForShow.lastPlayedEpisodeIndex < currentEpisodes.length) {
                indexForPlayer = savedProgressDataForShow.lastPlayedEpisodeIndex; // <--- 从剧集对象中获取
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
                        newUrl.searchParams.set('id', vodIdForPlayer); // <--- 确保 id 也存在

                        window.history.replaceState({}, '', newUrl.toString());

                        if (typeof window.showMessage === 'function') {
                            window.showMessage(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                        } else if (typeof window.showToast === 'function') {
                            window.showToast(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                        }
                    } else {
                        // 用户选择从头播放，清除该集的特定进度
                        try {
                            const show_Id_for_clear = getShowIdentifier(false); // 获取当前节目的ID
                            const all_prog = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                            if (all_prog[show_Id_for_clear] && all_prog[show_Id_for_clear][indexForPlayer.toString()]) {
                                delete all_prog[show_Id_for_clear][indexForPlayer.toString()];
                                // (可选) 检查是否清空了所有集数的进度，如果是，也可以删除 lastPlayedEpisodeIndex
                                localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(all_prog));
                            }
                        } catch (e) { console.warn('清除本集特定进度失败：', e); }
                        episodeUrlForPlayer = currentEpisodes[indexForPlayer];
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('url', episodeUrlForPlayer);
                        newUrl.searchParams.set('index', indexForPlayer.toString());
                        newUrl.searchParams.delete('position');
                        newUrl.searchParams.set('id', vodIdForPlayer);
                        window.history.replaceState({}, '', newUrl.toString());
                        if (typeof showMessage === 'function') showMessage('已从头开始播放', 'info');
                        else if (typeof showToast === 'function') showToast('已从头开始播放', 'info');
                    }
                    initializePageContent(); // 重新初始化以应用选择
                });
                return;
            } else {
                episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
            }
        } else {
            episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
        }
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
        const finalPositionToSeek = finalUrlParams.get('position');

        // ★ seek 优化：The seeking logic based on 'positionFromUrl' is now handled
        // within the Vidstack player's 'loaded-metadata' event handler.
        // if (positionFromUrl) {
        //     let seeked = false;
        //     const positionNum = parseInt(positionFromUrl, 10);
        //     // dp.on('loadedmetadata', () => { // This was DPlayer specific
        //     //     if (seeked) return;
        //     //     if (dp && dp.video && dp.video.duration > 0 && !isNaN(positionNum) && positionNum > 0 && positionNum < dp.video.duration - 1) {
        //     //         try {
        //     //             if (typeof dp.seek === 'function') dp.seek(positionNum);
        //     //             else dp.video.currentTime = positionNum;
        //     //         } catch (e) {
        //     //             dp.video.currentTime = positionNum;
        //     //         }
        //     //         if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(positionNum);
        //     //     }
        //     //     seeked = true;
        //     // });
        // }
    } else {
        showError('无效的视频链接');
    }

    updateEpisodeInfo();
    // Use requestAnimationFrame for initial render to ensure DOM is ready
    requestAnimationFrame(() => {
        renderEpisodes();
        //   console.log('[PlayerApp] renderEpisodes called via requestAnimationFrame in initializePageContent');
    });
    updateButtonStates();
    updateOrderButton();

    // setTimeout(() => {
    //     setupProgressBarPreciseClicks(); // Commented out for Vidstack - relies on DPlayer DOM
    // }, 1000); // Delay progress bar setup slightly

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
// Commenting out DPlayer/HLS.js specific ad filtering. Vidstack would need a different approach.
// class EnhancedAdFilterLoader extends Hls.DefaultConfig.loader {
//     static cueStart = AD_START_PATTERNS;
//     static cueEnd = AD_END_PATTERNS;
//     static strip(content) {
//         const lines = content.split('\n');
//         let inAd = false, out = [];
//
//         for (const l of lines) {
//             if (!inAd && this.cueStart.some(re => re.test(l))) { inAd = true; continue; }
//             if (inAd && this.cueEnd.some(re => re.test(l))) { inAd = false; continue; }
//             if (!inAd && !/^#EXT-X-DISCONTINUITY/.test(l)) out.push(l);
//
//         }
//         return out.join('\n');
//     }
//
//     load(ctx, cfg, cbs) {
//         if ((ctx.type === 'manifest' || ctx.type === 'level') && window.PLAYER_CONFIG?.adFilteringEnabled !== false) {
//             const orig = cbs.onSuccess;
//             cbs.onSuccess = (r, s, ctx2) => { r.data = EnhancedAdFilterLoader.strip(r.data); orig(r, s, ctx2); };
//         }
//         super.load(ctx, cfg, cbs);
//     }
// }

// --- Player Initialization ---
function initPlayer(videoUrl, sourceCode) {
    if (!videoUrl) {
        showError("视频链接无效");
        return;
    }
    // DPlayer is no longer used. Vidstack handles its own HLS.
    // The Hls object check might also be irrelevant if not used elsewhere.
    if (!Hls /* || !DPlayer */) {
        // showError("播放器组件加载失败，请刷新"); // This message might be misleading now
        // return;
        console.warn("Hls.js not found, but Vidstack should handle HLS playback internally.");
    }

    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true; // This might be used by Vidstack if it has a similar config

    // const hlsConfig = { // This was for DPlayer's HLS.js instance
    //     debug: debugMode || false,
    //     loader: adFilteringEnabled ? EnhancedAdFilterLoader : Hls.DefaultConfig.loader,
    //     skipDateRanges: adFilteringEnabled,
    //     enableWorker: true, lowLatencyMode: false, backBufferLength: 90, maxBufferLength: 30,
    //     maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000, maxBufferHole: 0.5,
    //     fragLoadingMaxRetry: 6, fragLoadingMaxRetryTimeout: 64000, fragLoadingRetryDelay: 1000,
    //     manifestLoadingMaxRetry: 3, manifestLoadingRetryDelay: 1000, levelLoadingMaxRetry: 4,
    //     levelLoadingRetryDelay: 1000, startLevel: -1, abrEwmaDefaultEstimate: 500000,
    //     abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7, abrMaxWithRealBitrate: true,
    //     stretchShortVideoTrack: true, appendErrorMaxRetry: 5, liveSyncDurationCount: 3,
    //     liveDurationInfinity: false
    // };

    try {
        const playerTarget = document.getElementById('vidstack-player-target');
        if (!playerTarget) {
            console.error('Vidstack player target element not found!');
            showError('Player target not found.'); // Assuming showError is still available
            return;
        }

        // Ensure previous Vidstack player instance is disposed if any
        if (window.vsPlayer && typeof window.vsPlayer.destroy === 'function') {
            window.vsPlayer.destroy();
        }

        console.log('[PlayerApp] Attempting VidstackPlayer.create() with video URL:', videoUrl); // Enhanced log
        VidstackPlayer.create({
            target: playerTarget, // Use the actual DOM element
            src: videoUrl,
            title: window.currentVideoTitle || document.title, // Use existing title logic
            poster: '', // Placeholder for poster
            layout: new VidstackPlayerLayout({
                thumbnails: '', // Placeholder for thumbnails
            }),
            autoplay: autoplayEnabled, // Use existing autoplayEnabled variable
            volume: parseFloat(localStorage.getItem('vs-player-volume')) || 0.7,
            muted: localStorage.getItem('vs-player-muted') === 'true',
        }).then(player => {
            window.vsPlayer = player; // Store instance globally
            console.log('[PlayerApp] VidstackPlayer.create() promise resolved. Player instance:', player); // Enhanced log

            player.addEventListener('loadedmetadata', () => {
                console.log('[PlayerApp][Vidstack] loadedmetadata event fired. Player duration:', player.duration); // Enhanced log
                const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

                const loadingEl = document.getElementById('loading');
                if (loadingEl) {
                    loadingEl.style.display = 'none';
                    document.documentElement.classList.remove('show-loading');
                }
                videoHasEnded = false;

                // if (typeof setupProgressBarPreciseClicks === 'function') setupProgressBarPreciseClicks(); // TODO: Adapt or remove

                const urlParams = new URLSearchParams(window.location.search);
                const positionFromUrl = urlParams.get('position');

                if (positionFromUrl) {
                    const positionNum = parseInt(positionFromUrl, 10);
                    if (player && player.duration > 0 && !isNaN(positionNum) && positionNum > 0 && positionNum < player.duration -1) {
                        player.currentTime = positionNum;
                        if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(positionNum);
                    }
                } else if (nextSeekPosition > 0 && player && player.duration > 0) {
                    if (nextSeekPosition < player.duration) {
                        console.log(`[Vidstack][loaded-metadata] Seeking to nextSeekPosition: ${nextSeekPosition}`);
                        player.currentTime = nextSeekPosition;
                        if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(nextSeekPosition);
                    } else {
                        console.warn(`[Vidstack][loaded-metadata] nextSeekPosition (${nextSeekPosition}) is out of bounds for duration (${player.duration}). Not seeking.`);
                    }
                }
                nextSeekPosition = 0;

                if (typeof saveToHistory === 'function') {
                    saveToHistory();
                }
                if (typeof startProgressSaveInterval === 'function') {
                    startProgressSaveInterval();
                }
                isNavigatingToEpisode = false;
                if (debugMode) console.log("[Vidstack][loaded-metadata] isNavigatingToEpisode reset to false.");

                setTimeout(() => {
                    if (!player) {
                        console.warn("[Vidstack][loaded-metadata][timeout] Player not valid in timeout.");
                        return;
                    }
                    if (player.paused) {
                        const customAutoplayEnabled = typeof autoplayEnabled !== 'undefined' ? autoplayEnabled : true;
                        if (player.autoplay || customAutoplayEnabled) {
                             if (debugMode) console.log(`[Vidstack][loaded-metadata][timeout] Video paused. Attempting play. Autoplay: ${player.autoplay}, customAutoplay: ${customAutoplayEnabled}`);
                            player.play().catch(e => {
                                console.warn("[Vidstack][loaded-metadata][timeout] player.play() promise rejected. User interaction likely required.", e);
                            });
                        }
                    }
                }, 100);
            });

            player.addEventListener('error', (event) => {
                const errorDetail = event.detail;
                console.error('[PlayerApp][Vidstack] Player error event:', errorDetail); // Enhanced log
                const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
                const errorMessage = errorDetail?.message || (errorDetail?.data?.message || 'Unknown error');

                if (player && player.currentTime > 1 && !debugMode) {
                     console.warn('[PlayerApp][Vidstack] Error ignored as video was playing for >1s:', errorMessage); // Enhanced log
                     return;
                }
                showError('Vidstack Player error: ' + errorMessage);
            });

            player.addEventListener('ended', (event) => {
                const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
                if (debugMode) console.log('[PlayerApp][Vidstack] ended event fired.'); // Enhanced log
                videoHasEnded = true;
                if(typeof saveCurrentProgress === 'function') saveCurrentProgress();
                if(typeof clearVideoProgress === 'function') clearVideoProgress();

                if (!autoplayEnabled) return;
                const nextIdx = currentEpisodeIndex + 1;
                if (nextIdx < currentEpisodes.length) {
                    setTimeout(() => {
                        if (videoHasEnded && !isUserSeeking) { // isUserSeeking needs to be updated by timeupdate
                           if(typeof playEpisode === 'function') playEpisode(nextIdx);
                        }
                    }, 1000);
                } else {
                    if (debugMode) console.log('[Vidstack] All episodes finished, autoplay stopped.');
                }
            });

            player.addEventListener('timeupdate', (event) => { // Changed to addEventListener
                // event.detail contains {currentTime, duration, …} for Vidstack
                // Using player.currentTime directly as planned for consistency.
                if (player && player.duration > 0) {
                    if (isUserSeeking && player.currentTime > player.duration * 0.95) {
                        videoHasEnded = false;
                    }
                }
            });

            player.addEventListener('volumechange', (event) => { // Changed to addEventListener
                // event.detail contains {volume, muted} for Vidstack
                if (player) { // player from .then() is in scope
                    localStorage.setItem('vs-player-volume', event.detail.volume.toString());
                    localStorage.setItem('vs-player-muted', event.detail.muted.toString());
                }
            });

            // Fullscreen change handling
            player.addEventListener('fullscreenchange', (event) => { // Changed to addEventListener, event name is standard
                // event.detail is true (fullscreen active) or false for Vidstack
                const isFullscreen = event.detail;
                const fsButton = document.getElementById('fullscreen-button');
                if (fsButton && fsButton.querySelector('svg')) {
                    if (isFullscreen) {
                        fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
                        fsButton.setAttribute('aria-label', '退出全屏');
                        if (window.screen.orientation && window.screen.orientation.lock) {
                            window.screen.orientation.lock('landscape').catch(err => console.warn('Screen orientation lock failed:', err));
                        }
                    } else {
                        fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
                        fsButton.setAttribute('aria-label', '全屏');
                        if (window.screen.orientation && window.screen.orientation.unlock) {
                            window.screen.orientation.unlock();
                        }
                    }
                }
            });

            // Seeking/Seeked events for isUserSeeking flag
            player.addEventListener('seeking', (event) => { // Changed to addEventListener
                isUserSeeking = true;
                videoHasEnded = false;
                if(typeof saveVideoSpecificProgress === 'function') saveVideoSpecificProgress();
            });
            player.addEventListener('seeked', (event) => { // Changed to addEventListener
                 // event.detail is current time after seek for Vidstack.
                 if (player && player.duration > 0) {
                    const timeFromEnd = player.duration - player.currentTime; // Use direct player properties
                    if (timeFromEnd < 0.3 && isUserSeeking) {
                        player.currentTime = Math.max(0, player.currentTime - 1);
                    }
                }
                setTimeout(() => { isUserSeeking = false; }, 200);
                if(typeof saveVideoSpecificProgress === 'function') saveVideoSpecificProgress();
            });

            player.addEventListener('pause', (event) => { // Changed to addEventListener
                if(typeof saveVideoSpecificProgress === 'function') saveVideoSpecificProgress();
            });

            player.addEventListener('play', (event) => {
                console.log('[PlayerApp][Vidstack] play event fired.'); // Enhanced log
                videoHasEnded = false;
            });

            player.addEventListener('canplay', () => {
                console.log('[PlayerApp][Vidstack] canplay event fired. Player readyState:', player.readyState); // Enhanced log
                // Potentially hide loading here as well, as a fallback or primary trigger
                const loadingEl = document.getElementById('loading');
                if (loadingEl && loadingEl.style.display !== 'none') { // Check if still visible
                    console.log('[PlayerApp][Vidstack] Hiding loading on canplay.');
                    loadingEl.style.display = 'none';
                    document.documentElement.classList.remove('show-loading');
                }
            });

            // After player is created and events are set up
            if (typeof handleSkipIntroOutro === 'function') {
                handleSkipIntroOutro(); // It will use window.vsPlayer internally
            }

        }).catch(error => {
            console.error('Error creating VidstackPlayer:', error);
            showError('Failed to create Vidstack Player.');
        });
        // dp = new DPlayer({
        //     container: document.getElementById('dplayer'),
        //     autoplay: true, theme: '#00ccff', preload: 'auto', loop: false, lang: 'zh-cn',
        //     hotkey: true, mutex: true, volume: 0.7, screenshot: true, preventClickToggle: false,
        //     airplay: true, chromecast: true,
        //     // Inside initPlayer function:
        //     // ...
        //     video: {
        //         url: videoUrl, type: 'hls',
        //         // In js/player_app.js -> initPlayer -> video.customType.hls
        //         customType: {
        //             hls: function (video, player) { // `video` is DPlayer's video element, `player` is the DPlayer instance
        //                 // Use the URL passed directly to switchVideo (via _tempUrlForCustomHls) or from player options.
        //                 const newSourceUrlToLoad = _tempUrlForCustomHls || (player.options.video && player.options.video.url);
        //                 _tempUrlForCustomHls = ''; // Clear after use, ensuring it's only used once per switchVideo call
        //
        //                 console.log(`[CustomHLS] Initializing. Target URL: "${newSourceUrlToLoad}". DPlayer options URL: "${player.options.video ? player.options.video.url : 'N/A'}"`);
        //
        //                 if (!newSourceUrlToLoad) {
        //                     console.error("[CustomHLS] CRITICAL: No valid source URL provided to load.");
        //                     if (typeof showError === 'function') showError("视频链接无效，无法加载。"); // Show error in UI
        //                     // Trigger DPlayer's error event manually if HLS setup can't proceed
        //                     if (player && typeof player.error === 'function') {
        //                         player.error('No valid source URL for HLS customType.');
        //                     }
        //                     return; // Stop further execution if no URL
        //                 }
        //
        //                 // 1. Destroy any existing HLS instance
        //                 if (window.currentHls) {
        //                     console.log("[CustomHLS] Previous HLS instance (window.currentHls) detected. Destroying it.");
        //                     window.currentHls.destroy(); // This should also detach media if attached
        //                     window.currentHls = null; // Clear the reference
        //                 } else {
        //                     console.log("[CustomHLS] No previous HLS instance (window.currentHls) found to destroy.");
        //                 }
        //
        //                 // 2. Aggressively reset the HTML video element state
        //                 console.log("[CustomHLS] Resetting video element: pause, remove src/source attributes, call load().");
        //                 video.pause();
        //                 video.removeAttribute('src'); // Remove direct src attribute
        //                 // Remove any child <source> elements
        //                 while (video.firstChild) {
        //                     video.removeChild(video.firstChild);
        //                 }
        //                 // Setting src to empty or calling load() can help reset the media element's internal state.
        //                 _tempUrlForCustomHls         // This is important to prevent the browser from holding onto the previous stream.
        //                 video.src = ""; // Setting to empty can sometimes help clear buffers
        //                 video.load();   // This tells the browser to discard the current media resource state.
        //
        //                 // 3. Create and configure the new HLS instance
        //                 console.log("[CustomHLS] Creating new HLS.js instance.");
        //                 const hls = new Hls(hlsConfig); // hlsConfig should be defined with ad filtering etc.
        //                 window.currentHls = hls; // Store the new instance
        //
        //                 // 4. Setup HLS event listeners for the new instance
        //                 hls.on(Hls.Events.ERROR, function (event, data) {
        //                     console.error(`[CustomHLS] HLS.js Error. Fatal: ${data.fatal}. Type: ${data.type}. Details: ${data.details}. URL: ${data.url || newSourceUrlToLoad}`, data);
        //                     if (data.fatal) {
        //                         if (player && typeof player.error === 'function') { // Use DPlayer's error mechanism
        //                             player.error(`HLS.js fatal error: ${data.type} - ${data.details}`);
        //                         }
        //                     } else if (data.details === 'bufferSeekOverHole' || data.details === 'bufferAppendError' || data.details === 'bufferNudgeOnStall') {
        //                         console.warn(`[CustomHLS] HLS.js non-fatal media warning: ${data.details}. Attempting recovery if possible.`);
        //                         // HLS.js often tries to recover from these. If seeking, it might indicate a bad spot in the stream.
        //                         if (data.type === Hls.ErrorTypes.MEDIA_ERROR && typeof hls.recoverMediaError === 'function') {
        //                             try { hls.recoverMediaError(); } catch (e) { console.error("Error on hls.recoverMediaError()", e); }
        //                         }
        //                     }
        //                 });
        //                 hls.on(Hls.Events.MANIFEST_LOADED, function (event, data) {
        //                     console.log(`[CustomHLS] HLS.js Manifest loaded successfully for: ${data.url}`);
        //                     // DPlayer usually handles play if autoplay is on.
        //                 });
        //                 // Add other essential HLS event logging (FRAG_LOADED, LEVEL_LOADED for loading UI)
        //                 hls.on(Hls.Events.FRAG_LOADED, () => {
        //                     const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
        //                     // console.log("[CustomHLS] Fragment loaded.");
        //                 });
        //                 hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
        //                     const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
        //                     // console.log(`[CustomHLS] Level loaded. Bitrate: ${data.bitrate}`);
        //                 });
        //
        //
        //                 // 5. Attach HLS to the media element and load the source
        //                 console.log(`[CustomHLS] Attaching media element to new HLS instance.`);
        //                 hls.attachMedia(video);
        //
        //                 hls.on(Hls.Events.MEDIA_ATTACHED, function () {
        //                     console.log(`[CustomHLS] Media element attached. Loading source via hls.loadSource(): ${newSourceUrlToLoad}`);
        //                     hls.loadSource(newSourceUrlToLoad);
        //                 });
        //             }
        //         }
        //     }
        // });
        // window.dp = dp; // Expose DPlayer instance globally
        // if (debugMode) console.log("[PlayerApp] DPlayer instance created.");

        // Add DPlayer event listeners
        // addDPlayerEventListeners();

        // 安卓特殊hack，防止右半屏菜单
        // patchAndroidVideoHack();
        // 添加跳过功能
        // handleSkipIntroOutro(dp);

    } catch (playerError) {
        console.error("Failed to initialize DPlayer:", playerError);
        showError("播放器初始化失败");
    }
}

// function addDPlayerEventListeners() {
//     if (!dp) return;
//     const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
//     const playerVideoWrap = document.querySelector('#dplayer .dplayer-video-wrap'); // 获取 videoWrap
//
//     dp.on('fullscreen', () => {
//         if (debugMode) console.log("[PlayerApp] DPlayer event: fullscreen");
//         if (window.screen.orientation && window.screen.orientation.lock) {
//             window.screen.orientation.lock('landscape').catch(err => console.warn('屏幕方向锁定失败:', err));
//         }
//         const fsButton = document.getElementById('fullscreen-button');
//         if (fsButton && fsButton.querySelector('svg')) {
//             fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
//             fsButton.setAttribute('aria-label', '退出全屏');
//         }
//     });
//
//     dp.on('fullscreen_cancel', () => {
//         if (debugMode) console.log("[PlayerApp] DPlayer event: fullscreen_cancel");
//         if (window.screen.orientation && window.screen.orientation.unlock) {
//             window.screen.orientation.unlock();
//         }
//         const fsButton = document.getElementById('fullscreen-button');
//         if (fsButton && fsButton.querySelector('svg')) {
//             fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
//             fsButton.setAttribute('aria-label', '全屏');
//         }
//     });
//
//
//     dp.on('loadedmetadata', function () {
//         const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
//         if (debugMode) console.log(`[PlayerApp][loadedmetadata] 事件已触发。dp 是否有效: ${!!(dp && dp.video)}, 视频时长: ${dp && dp.video ? dp.video.duration : 'N/A'}`);
//
//         // 隐藏加载提示
//         const loadingEl = document.getElementById('loading');
//         if (loadingEl) {
//             loadingEl.style.display = 'none';
//             document.documentElement.classList.remove('show-loading');
//         }
//         videoHasEnded = false; // 为新加载的视频重置结束标记
//
//         // 如果有精确点击进度条的功能，重新设置
//         if (typeof setupProgressBarPreciseClicks === 'function') setupProgressBarPreciseClicks();
//
//         // 安全地尝试跳转（seek）到之前记住的播放位置 (nextSeekPosition)
//         if (nextSeekPosition > 0 && dp && dp.video && dp.video.duration > 0) {
//             if (nextSeekPosition < dp.video.duration) { // 确保跳转位置在视频有效时长内
//                 if (typeof dp.seek === 'function') { // 再次检查 seek 方法是否存在
//                     console.log(`[PlayerApp][loadedmetadata] 尝试跳转到 nextSeekPosition: ${nextSeekPosition}`);
//                     dp.seek(nextSeekPosition); // 执行跳转
//                     if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(nextSeekPosition);
//                 } else {
//                     console.error("[PlayerApp][loadedmetadata] dp.seek 不是一个函数！无法恢复播放位置。");
//                 }
//             } else {
//                 console.warn(`[PlayerApp][loadedmetadata] nextSeekPosition (${nextSeekPosition}) 超出或等于视频时长 (${dp.video.duration})。不进行跳转。`);
//             }
//         }
//         nextSeekPosition = 0; // 无论成功与否，用后重置
//
//         // 为新加载的剧集（在其初始状态或跳转后的状态）保存到观看历史
//         if (typeof saveToHistory === 'function') {
//             // console.log("[PlayerApp][loadedmetadata] 为新剧集调用 saveToHistory。");
//             saveToHistory(); // 此函数应能获取到跳转（如果发生）后的当前时间
//         }
//         // 启动或重置周期性保存播放进度的计时器
//         if (typeof startProgressSaveInterval === 'function') {
//             // console.log("[PlayerApp][loadedmetadata] 调用 startProgressSaveInterval。");
//             startProgressSaveInterval();
//         }
//
//         isNavigatingToEpisode = false; // 重置“正在切换剧集”的标记
//         if (debugMode) console.log("[PlayerApp][loadedmetadata] isNavigatingToEpisode 已重置为 false。");
//
//         // ---- 修改核心：延迟并更安全地调用 dp.play() ----
//         setTimeout(() => {
//             if (!dp || !dp.video) {
//                 console.warn("[PlayerApp][loadedmetadata][timeout] dp 或 dp.video 在 setTimeout 回调执行时已不再有效。无法尝试播放。");
//                 return;
//             }
//
//             if (dp.video.paused) {
//                 const playFunction = dp.play;
//
//                 if (typeof playFunction === 'function') {
//                     const dplayerAutoplayOption = dp.options && dp.options.autoplay;
//                     const customAutoplayEnabled = typeof autoplayEnabled !== 'undefined' ? autoplayEnabled : true;
//
//                     if (dplayerAutoplayOption || customAutoplayEnabled) {
//                         console.log(`[PlayerApp][loadedmetadata][timeout] 视频已暂停。尝试调用 dp.play()。DPlayer 内置 autoplay: ${dplayerAutoplayOption}, 自定义 autoplayEnabled: ${customAutoplayEnabled}`);
//                         try {
//                             const playPromise = playFunction.call(dp);
//                             if (playPromise && typeof playPromise.catch === 'function') {
//                                 playPromise.catch(e => {
//                                     console.warn("[PlayerApp][loadedmetadata][timeout] dp.play() Promise 被浏览器阻止或发生错误。用户可能需要手动点击播放按钮。", e);
//                                 });
//                             } else if (playPromise === undefined) {
//                                 console.log("[PlayerApp][loadedmetadata][timeout] dp.play() returned undefined. Play might have been attempted or prevented without a promise.");
//                                 // Autoplay might be blocked by the browser, and DPlayer's play() might return undefined in such cases
//                                 // without throwing a catchable promise error. User might need to interact.
//                             }
//                         } catch (syncError) {
//                             console.warn("[PlayerApp][loadedmetadata][timeout]调用 dp.play() 时发生同步错误。", syncError);
//                         }
//                     } else {
//                         // console.log("[PlayerApp][loadedmetadata][timeout] 视频已暂停，但所有自动播放选项均已禁用。");
//                     }
//                 } else {
//                     console.error("[PlayerApp][loadedmetadata][timeout] 严重错误：dp.play (在延迟后检查) 仍然不是一个函数！DPlayer 实例状态:", dp);
//                 }
//             } else {
//                 // console.log("[PlayerApp][loadedmetadata][timeout] 视频已在播放中或不处于可检查暂停的状态。");
//             }
//         }, 100);
//         // ---- 修改核心结束 ----
//     });
//
//     dp.on('error', function (e) {
//         console.error("DPlayer error event:", e);
//         if (dp.video && dp.video.currentTime > 1) { // Allow errors if playing for >1s
//             if (debugMode) console.log('DPlayer error ignored as video was playing.');
//             return;
//         }
//         showError('播放器遇到错误，请检查视频源');
//     });
//
//     setupLongPressSpeedControl();
//     // 新增：调用双击处理函数
//     if (playerVideoWrap) {
//         setupDoubleClickToPlayPause(dp, playerVideoWrap);
//     }
//
//     dp.on('seeking', function () { if (debugMode) console.log("[PlayerApp] DPlayer event: seeking"); isUserSeeking = true; videoHasEnded = false; });
//     dp.on('seeked', function () {
//         if (debugMode) console.log("[PlayerApp] DPlayer event: seeked");
//         // Adjust if seeked very close to the end
//         if (dp.video && dp.video.duration > 0) {
//             const timeFromEnd = dp.video.duration - dp.video.currentTime;
//             if (timeFromEnd < 0.3 && isUserSeeking) {
//                 dp.video.currentTime = Math.max(0, dp.video.currentTime - 1);
//             }
//         }
//         setTimeout(() => { isUserSeeking = false; }, 200); // Reset seeking flag after a short delay
//     });
//
//     dp.on('pause', function () {
//         if (debugMode) console.log("[PlayerApp] DPlayer event: pause");
//         saveVideoSpecificProgress();
//         // saveCurrentProgress(); // 可选：如果也想在暂停时更新观看历史列表
//     });
//     dp.on('seeking', saveVideoSpecificProgress); // 兼容iOS
//     dp.on('seeked', saveVideoSpecificProgress); // 兼容iOS
//
//     dp.on('ended', function () {
//         videoHasEnded = true;
//         saveCurrentProgress(); // Ensure final progress is saved
//         clearVideoProgress(); // Clear progress for *this specific video*
//         if (!autoplayEnabled) return;       // 用户关掉了自动连播
//         const nextIdx = currentEpisodeIndex + 1;   // 始终 +1（上一条回复已统一）
//         if (nextIdx < currentEpisodes.length) {
//             setTimeout(() => {
//                 // 再确认一下确实播完 & 没有人在拖动
//                 if (videoHasEnded && !isUserSeeking) playEpisode(nextIdx);
//             }, 1000);                       // 1 s 延迟，防误触
//         } else {
//             if (debugMode) console.log('[PlayerApp] 已到最后一集，自动连播停止');
//         }
//     });
//
//     dp.on('timeupdate', function () {
//         // Reset ended flag if user seeks back after video ended
//         if (dp.video && dp.video.duration > 0) {
//             if (isUserSeeking && dp.video.currentTime > dp.video.duration * 0.95) {
//                 videoHasEnded = false;
//             }
//         }
//     });
//
//     // Add a timeout to show a message if loading takes too long
//     setTimeout(function () {
//         // Check if player exists, video exists, AND readyState suggests still loading/not enough data
//         if (dp && dp.video && dp.video.readyState < 3 && !videoHasEnded) {
//             const loadingEl = document.getElementById('loading');
//             if (loadingEl && loadingEl.style.display !== 'none') {
//                 loadingEl.innerHTML = `<div class="loading-spinner"></div><div>视频加载时间较长...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源或刷新</div>`;
//                 if (debugMode) console.warn("[PlayerApp] Loading timeout reached.");
//             }
//         }
//     }, 15000); // Increased timeout to 15s
//
//     // Native fullscreen integration for DPlayer's *internal* button actions
//     (function () {
//         const dplayerElement = document.getElementById('dplayer');
//         if (dplayerElement) {
//             dp.on('fullscreen', () => { // DPlayer *enters* its fullscreen mode
//                 if (document.fullscreenElement || document.webkitFullscreenElement) return; // Already native FS
//                 if (dplayerElement.requestFullscreen) dplayerElement.requestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed:', err));
//                 else if (dplayerElement.webkitRequestFullscreen) dplayerElement.webkitRequestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed (webkit):', err));
//             });
//             dp.on('fullscreen_cancel', () => { // DPlayer *exits* its fullscreen mode
//                 if (!document.fullscreenElement && !document.webkitFullscreenElement) return; // Not in native FS
//                 if (document.exitFullscreen) document.exitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed:', err));
//                 else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed (webkit):', err));
//             });
//         }
//     })();
// }

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', () => { window.location.href = 'index.html'; });
    }

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (window.vsPlayer) {
                if (window.vsPlayer.fullscreen.active) {
                    window.vsPlayer.exitFullscreen().catch(err => console.error("Vidstack exit FS error:", err));
                } else {
                    window.vsPlayer.enterFullscreen().catch(err => console.error("Vidstack enter FS error:", err));
                }
            } else {
                // Fallback for when vsPlayer might not be initialized, though less likely now
                console.warn("Vidstack player not ready for fullscreen toggle.");
                // const playerContainer = document.getElementById('vidstack-player-target'); // Corrected target
                // if (playerContainer) {
                //     if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                //         if (playerContainer.requestFullscreen) playerContainer.requestFullscreen().catch(err => console.error("Fallback FS error:", err));
                //         else if (playerContainer.webkitRequestFullscreen) playerContainer.webkitRequestFullscreen().catch(err => console.error("Fallback FS error (webkit):", err));
                //     } else {
                //         if (document.exitFullscreen) document.exitFullscreen().catch(err => console.error("Fallback exit FS error:", err));
                //         else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.error("Fallback exit FS error (webkit):", err));
                //     }
                // }
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
                // _tempUrlForCustomHls = videoUrlRetry; // No longer needed
                if (window.vsPlayer) {
                    console.log("[PlayerApp] Retrying: Setting new src and playing.");
                    window.vsPlayer.src = videoUrlRetry;
                    window.vsPlayer.play().catch(e => console.warn("Retry play failed:", e));
                } else {
                    console.log("[PlayerApp] Retrying: Re-initializing player.");
                    initPlayer(videoUrlRetry, sourceCodeRetry); // This will create a new Vidstack player
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
    if (isNavigatingToEpisode) return;
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle || !toggle.checked) { return; }

    if (!window.vsPlayer || typeof window.vsPlayer.currentTime === 'undefined' || typeof window.vsPlayer.duration === 'undefined' || typeof currentVideoTitle === 'undefined' || typeof currentEpisodeIndex !== 'number' || !currentEpisodes || currentEpisodes.length === 0) {
        // console.warn("[PlayerApp] saveVideoSpecificProgress: Player not ready or data missing.", window.vsPlayer);
        return;
    }

    const currentTime = Math.floor(window.vsPlayer.currentTime);
    const duration = Math.floor(window.vsPlayer.duration);

    const showId = getShowIdentifier(false); // <--- 使用新的函数获取剧集ID

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.95) {
        try {
            let allShowsProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            if (!allShowsProgresses[showId]) { // <--- 如果该剧还没有进度对象，则创建
                allShowsProgresses[showId] = {};
            }
            // 保存当前集数的进度
            allShowsProgresses[showId][currentEpisodeIndex.toString()] = currentTime; // <--- 在剧集对象下保存特定集的进度
            // 记录这个视频最后播放到哪一集
            allShowsProgresses[showId].lastPlayedEpisodeIndex = currentEpisodeIndex; // <--- 在剧集对象下记录
            allShowsProgresses[showId].totalEpisodes = currentEpisodes.length; // (可选)

            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allShowsProgresses));
        } catch (e) {
            console.error('保存特定视频集数进度失败:', e);
        }
    }
}

// （可选）用于在关闭“记住进度”时清除当前视频的集数进度
function clearCurrentVideoSpecificEpisodeProgresses() {
    const showId = getShowIdentifier(false);

    try {
        const allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        if (allProgress[showId]) {
            delete allProgress[showId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgress));

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
    // Check if vsPlayer exists and has currentTime, otherwise, always show error.
    if (window.vsPlayer && typeof window.vsPlayer.currentTime !== 'undefined' && window.vsPlayer.currentTime > 1 && !debugMode) {
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

// function setupProgressBarPreciseClicks() {
//     // Commented out for Vidstack - relies on DPlayer DOM and dp instance
//     // if (!window.vsPlayer) return;
//     // setTimeout(() => {
//     //     const progressBar = document.querySelector('media-player .vds-time-slider'); // Example selector, needs verification
//     //     if (!progressBar) { console.warn('Vidstack progress bar element not found'); return; }
//     //     progressBar.removeEventListener('click', handleProgressBarClick);
//     //     progressBar.removeEventListener('touchend', handleProgressBarTouch);
//     //     progressBar.addEventListener('click', handleProgressBarClick);
//     //     progressBar.addEventListener('touchend', handleProgressBarTouch);
//     // }, 500);
// }

// function handleProgressBarClick(e) {
//     // Commented out for Vidstack
//     // if (!window.vsPlayer || typeof window.vsPlayer.duration === 'undefined' || window.vsPlayer.duration <= 0 || !e.currentTarget) return;
//     // const rect = e.currentTarget.getBoundingClientRect();
//     // const offsetX = e.clientX - rect.left;
//     // const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
//     // const clickTime = percentage * window.vsPlayer.duration;
//     // userClickedPosition = clickTime; // May not be needed if Vidstack handles preview thumbnails
//     // window.vsPlayer.currentTime = clickTime;
// }

// function handleProgressBarTouch(e) {
//     // Commented out for Vidstack
//     // if (!window.vsPlayer || typeof window.vsPlayer.duration === 'undefined' || window.vsPlayer.duration <= 0 || !e.changedTouches || !e.changedTouches[0] || !e.currentTarget) return;
//     // const rect = e.currentTarget.getBoundingClientRect();
//     // const touch = e.changedTouches[0];
//     // const offsetX = touch.clientX - rect.left;
//     // const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
//     // const touchTime = percentage * window.vsPlayer.duration;
//     // userClickedPosition = touchTime; // May not be needed
//     // window.vsPlayer.currentTime = touchTime;
// }

function handleKeyboardShortcuts(e) {
    if (!window.vsPlayer || (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))) return;
    if (isScreenLocked && (e.key !== 'f' && e.key !== 'F' && e.key !== "Escape")) return; // Assuming isScreenLocked is still relevant
    let actionText = '', direction = '';
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    switch (e.key) {
        case 'ArrowLeft':
            if (e.altKey) { if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { window.vsPlayer.currentTime = Math.max(0, window.vsPlayer.currentTime - 5); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowRight':
            if (e.altKey) { if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { window.vsPlayer.currentTime = Math.min(window.vsPlayer.duration, window.vsPlayer.currentTime + 5); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageUp': if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageDown': if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case ' ': // Spacebar for play/pause
            if (window.vsPlayer.paused) { window.vsPlayer.play(); actionText = '播放'; }
            else { window.vsPlayer.pause(); actionText = '暂停'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowUp':
            window.vsPlayer.volume = Math.min(1, window.vsPlayer.volume + 0.1);
            actionText = `音量 ${Math.round(window.vsPlayer.volume * 100)}%`;
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowDown':
            window.vsPlayer.volume = Math.max(0, window.vsPlayer.volume - 0.1);
            actionText = `音量 ${Math.round(window.vsPlayer.volume * 100)}%`;
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'f':
        case 'F': // Also allow capital F
            if (window.vsPlayer.fullscreen.active) { window.vsPlayer.exitFullscreen(); }
            else { window.vsPlayer.enterFullscreen(); }
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
 * @param {HTMLElement} targetElement The element to attach the listener to (e.g., Vidstack's root or media area)
 */
function setupDoubleClickToPlayPause(targetElement) {
    if (!window.vsPlayer || !targetElement) {
        console.warn('[DoubleClick] Vidstack player or target element not provided.');
        return;
    }

    if (targetElement._doubleTapListenerAttached) {
        return; // Prevent duplicate listeners
    }

    targetElement.addEventListener('touchend', function (e) {
        if (isScreenLocked) {
            return;
        }

        // Vidstack controls are often within a 'media-controls' element or have specific 'vds-' classes.
        const controlSelectors = [
            '.vds-controls',       // General Vidstack controls container
            '.vds-button',         // Generic Vidstack button
            '.vds-slider',         // Sliders (volume, time)
            '#episode-grid button', // External episode buttons
            // Add other selectors for custom UI elements that should not trigger play/pause
        ];

        let tappedOnControl = false;
        for (const selector of controlSelectors) {
            if (e.target.closest(selector)) {
                tappedOnControl = true;
                break;
            }
        }

        // Also check if the tap was on an interactive element like a button or input within the player
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button, input[type="range"]')) {
             if (!e.target.closest('.vds-gestures')) { // Allow gestures overlay
                tappedOnControl = true;
             }
        }


        if (tappedOnControl) {
            lastTapTimeForDoubleTap = 0;
            return;
        }

        const currentTime = new Date().getTime();
        if ((currentTime - lastTapTimeForDoubleTap) < DOUBLE_TAP_INTERVAL) {
            if (window.vsPlayer) {
                if (window.vsPlayer.paused) {
                    window.vsPlayer.play().catch(err => console.warn("Play error on double tap:", err));
                } else {
                    window.vsPlayer.pause().catch(err => console.warn("Pause error on double tap:", err));
                }
            }
            lastTapTimeForDoubleTap = 0;
        } else {
            lastTapTimeForDoubleTap = currentTime;
        }
        // Vidstack player might handle its own UI toggle on single click on gestures pane.
    }, { passive: true });

    targetElement._doubleTapListenerAttached = true;
}

function setupLongPressSpeedControl() {
    if (!window.vsPlayer) return;
    const targetElement = window.vsPlayer.el;
    if (!targetElement) {
        console.warn('Vidstack target element for long press not found.');
        return;
    }

    if (targetElement._longPressListenerAttached) { // Prevent duplicate listeners
        return;
    }

    let longPressTimer = null;
    let originalSpeed = 1.0;
    let speedChangedByLongPress = false;

    targetElement.addEventListener('touchstart', function (e) {
        if (isScreenLocked) return;

        // Filter out touches on control elements
        const controlSelectors = ['.vds-controls', '.vds-button', '.vds-slider', '#episode-grid button'];
        let tappedOnControl = false;
        for (const selector of controlSelectors) {
            if (e.target.closest(selector)) {
                tappedOnControl = true;
                break;
            }
        }
        if (tappedOnControl) return;


        const touchX = e.touches[0].clientX;
        const rect = targetElement.getBoundingClientRect();

        if (touchX > rect.left + rect.width / 2) {
            originalSpeed = window.vsPlayer.playbackRate;
            if (longPressTimer) clearTimeout(longPressTimer);
            speedChangedByLongPress = false;

            longPressTimer = setTimeout(() => {
                if (isScreenLocked || !window.vsPlayer || window.vsPlayer.paused) {
                    speedChangedByLongPress = false;
                    return;
                }
                window.vsPlayer.playbackRate = 2.0;
                speedChangedByLongPress = true;
                if (typeof showMessage === 'function') showMessage('播放速度: 2.0x', 'info', 1000);
            }, 300);
        } else {
            if (longPressTimer) clearTimeout(longPressTimer);
            speedChangedByLongPress = false;
        }
    }, { passive: true });

    const endLongPress = function () {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;

        if (speedChangedByLongPress && window.vsPlayer) {
            window.vsPlayer.playbackRate = originalSpeed;
            if (typeof showMessage === 'function') showMessage(`播放速度: ${originalSpeed.toFixed(1)}x`, 'info', 1000);
        }
        speedChangedByLongPress = false;
    };

    targetElement.addEventListener('touchend', endLongPress);
    targetElement.addEventListener('touchcancel', endLongPress);

    if (!targetElement._contextMenuListenerAttachedForLP) { // Use a unique name for this flag
        targetElement.addEventListener('contextmenu', function (e) {
            if (!isMobile()) return;
             // Filter out context menu on control elements
            const controlSelectors = ['.vds-controls', '.vds-button', '.vds-slider', '#episode-grid button'];
            for (const selector of controlSelectors) {
                if (e.target.closest(selector)) {
                    return; // Do not prevent default for controls
                }
            }

            const rect = targetElement.getBoundingClientRect();
            if (e.clientX > rect.left + rect.width / 2) {
                e.preventDefault();
            }
        });
        targetElement._contextMenuListenerAttachedForLP = true;
    }
    targetElement._longPressListenerAttached = true; // Mark that listeners are attached
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
    const urlParams = new URLSearchParams(window.location.search);
    let linkUrl = urlParams.get('url');
    if (!linkUrl && window.vsPlayer && typeof window.vsPlayer.source === 'string') { // Vidstack player.source is an object or array, src is the string
        linkUrl = window.vsPlayer.src;
    } else if (!linkUrl && window.vsPlayer && Array.isArray(window.vsPlayer.source) && window.vsPlayer.source.length > 0 && typeof window.vsPlayer.source[0].src === 'string') {
        linkUrl = window.vsPlayer.source[0].src;
    } else if (!linkUrl && window.vsPlayer && typeof window.vsPlayer.source?.src === 'string') { // if source is an object
        linkUrl = window.vsPlayer.source.src;
    }


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
    if (!window.vsPlayer || typeof window.vsPlayer.currentTime === 'undefined' || typeof window.vsPlayer.duration === 'undefined' || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = window.vsPlayer.currentTime;
    const duration = window.vsPlayer.duration;

    // Only save if meaningful progress has been made and video hasn't practically ended
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) { // Check against 98% to avoid saving if "ended" event was missed
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex],
                episodeIndex: window.currentEpisodeIndex,
                vod_id: vodIdForPlayer || '', // <--- 使用全局的 vodIdForPlayer
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
                sourceName: new URLSearchParams(window.location.search).get('source') || '',
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
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
        saveCurrentProgress(); // 这个是保存到“观看历史列表”的
        saveVideoSpecificProgress(); // 新增调用，保存特定视频的集数进度
    }, 8000); // Save every 8 seconds，iOS 建议
}

function saveToHistory() { // This is more like an "initial save" or "episode change save"
    if (!window.vsPlayer || typeof window.vsPlayer.currentTime === 'undefined' || typeof window.vsPlayer.duration === 'undefined' || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            vod_id: vodIdForPlayer || '', // <--- 使用全局的 vodIdForPlayer
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            episodes: window.currentEpisodes,
            playbackPosition: Math.floor(window.vsPlayer.currentTime),
            duration: Math.floor(window.vsPlayer.duration) || 0,
            timestamp: Date.now()
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
    if (!window.vsPlayer) {
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

    // Save progress for the current episode before switching
    if (window.vsPlayer && typeof window.vsPlayer.currentTime !== 'undefined' && window.vsPlayer.currentTime > 5 && currentEpisodes[currentEpisodeIndex]) {
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
        const showId = getShowIdentifier(false);   // 与 saveVideoSpecificProgress 保持一致
        const allSpecificProgresses = JSON.parse(
            localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}'
        );
        const savedProgressDataForVideo = allSpecificProgresses[showId];

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
    // _tempUrlForCustomHls = newEpisodeUrl; // No longer needed for Vidstack
    if (window.vsPlayer) {
        window.vsPlayer.pause(); // Good practice to pause before changing source
        window.vsPlayer.src = newEpisodeUrl;
        // patchAndroidVideoHack(); // DPlayer specific, ensure it's not called
        if (typeof handleSkipIntroOutro === 'function') {
             // Assuming handleSkipIntroOutro is refactored to use window.vsPlayer
             handleSkipIntroOutro();
        }
        // Vidstack will autoplay if its autoplay prop is true.
        // If explicit play is needed after src change and metadata loaded:
        // window.vsPlayer.one('loaded-metadata', () => window.vsPlayer.play());
    }
    videoHasEnded = false;

    // 更新url
    const newUrlForBrowser = new URL(window.location.href);
    newUrlForBrowser.searchParams.set('url', newEpisodeUrl);
    newUrlForBrowser.searchParams.set('title', currentVideoTitle);
    newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());

    const currentSourceCode = new URLSearchParams(window.location.search).get('source_code');
    if (currentSourceCode) newUrlForBrowser.searchParams.set('source_code', currentSourceCode);

    const adFilteringStorageKey = (PLAYER_CONFIG && PLAYER_CONFIG.adFilteringStorage) ? PLAYER_CONFIG.adFilteringStorage : 'adFilteringEnabled';
    const adFilteringActive = (typeof getBoolConfig === 'function') ? getBoolConfig(adFilteringStorageKey, false) : false;
    newUrlForBrowser.searchParams.set('af', adFilteringActive ? '1' : '0');
    newUrlForBrowser.searchParams.delete('position');
    window.history.pushState(
        { path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex },
        '',
        newUrlForBrowser.toString()
    );
}

window.playEpisode = playEpisode;
