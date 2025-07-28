(function () {
    // --- 模块级变量 ---
    let isPreloadingActive = false; // 预加载功能的总开关状态
    let timeUpdateListener = null;  // 用于存储 time-update 事件监听器，方便移除
    let nextButtonHoverListener = null; // 用于存储按钮悬停事件监听器
    let nextButtonTouchListener = null; // 用于存储按钮触摸事件监听器
    let episodeGridClickListener = null; // 用于存储剧集列表点击事件监听器

    // --- 辅助函数 ---

    // 从 PLAYER_CONFIG 获取预加载数量，带默认值
    function getPreloadCount() {
        const count = localStorage.getItem('preloadCount');
        return count ? parseInt(count, 10) : 2;
    }

    // 检查浏览器是否支持 CacheStorage API
    function supportsCacheStorage() {
        return 'caches' in window && typeof window.caches.open === 'function';
    }

    // 简单地检测慢速网络
    function isSlowNetwork() {
        try {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            return connection && connection.effectiveType && /2g|slow-2g/i.test(connection.effectiveType);
        } catch (e) {
            return false;
        }
    }

    // --- 核心预加载逻辑 ---

    /**
     * 预加载后续 N 集的 m3u8 和前几个 TS 分片
     */
    async function preloadNextEpisodeParts() {
        // 仅在总开关激活时执行
        if (!isPreloadingActive) {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading is globally disabled.');
            return;
        }

        if (isSlowNetwork()) {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Skipping preloading due to slow network.');
            return;
        }

        if (!window.currentEpisodes || !Array.isArray(window.currentEpisodes) || typeof window.currentEpisodeIndex !== 'number') {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Skipping, episode data or current index is missing.');
            return;
        }

        const preloadCount = getPreloadCount();
        const currentIndex = window.currentEpisodeIndex;
        const totalEpisodes = window.currentEpisodes.length;

        if (PLAYER_CONFIG.debugMode) {
            console.log(`[Preload] Starting preload. Current index: ${currentIndex}, Total: ${totalEpisodes}, Count: ${preloadCount}`);
        }

        for (let offset = 1; offset <= preloadCount; offset++) {
            const episodeIdxToPreload = currentIndex + offset;
            if (episodeIdxToPreload >= totalEpisodes) {
                if (PLAYER_CONFIG.debugMode) console.log(`[Preload] Reached end of playlist.`);
                break;
            }

            const episodeString = window.currentEpisodes[episodeIdxToPreload];
            const nextEpisodeUrl = episodeString ? episodeString.split('$').pop() : null;

            if (!nextEpisodeUrl || !nextEpisodeUrl.startsWith('http')) {
                if (PLAYER_CONFIG.debugMode) console.log(`[Preload] Skipped invalid URL at index ${episodeIdxToPreload}.`);
                continue;
            }

            if (PLAYER_CONFIG.debugMode) {
                console.log(`[Preload] Attempting to preload episode ${episodeIdxToPreload + 1}: ${nextEpisodeUrl}`);
            }

            try {
                // 预取 M3U8 文件
                const m3u8Response = await fetch(nextEpisodeUrl, { method: "GET" });
                if (!m3u8Response.ok) {
                    if (PLAYER_CONFIG.debugMode) console.log(`[Preload] Failed to fetch M3U8 for ${nextEpisodeUrl}. Status: ${m3u8Response.status}`);
                    continue;
                }
                const m3u8Text = await m3u8Response.text();
                const tsUrls = [];
                const baseUrlForSegments = nextEpisodeUrl.substring(0, nextEpisodeUrl.lastIndexOf('/') + 1);

                // 解析前3个TS分片
                m3u8Text.split('\n').forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine && !trimmedLine.startsWith("#") && (trimmedLine.endsWith(".ts") || trimmedLine.includes(".ts?")) && tsUrls.length < 3) {
                        tsUrls.push(trimmedLine.startsWith("http") ? trimmedLine : new URL(trimmedLine, baseUrlForSegments).href);
                    }
                });

                if (PLAYER_CONFIG.debugMode) {
                    console.log(`[Preload] M3U8 for episode ${episodeIdxToPreload + 1} parsed. Found ${tsUrls.length} TS segments.`);
                }

                // 预取TS分片
                for (const tsUrl of tsUrls) {
                    if (supportsCacheStorage()) {
                        const cache = await caches.open('video-preload-cache');
                        const cachedResponse = await cache.match(tsUrl);
                        if (!cachedResponse) {
                            const segmentResponse = await fetch(tsUrl, { method: "GET" });
                            if (segmentResponse.ok) {
                                await cache.put(tsUrl, segmentResponse.clone());
                                if (PLAYER_CONFIG.debugMode) console.log(`[Preload] TS segment cached: ${tsUrl}`);
                            }
                        }
                    } else {
                        await fetch(tsUrl, { method: "GET" }); // 不支持缓存则只请求
                    }
                }
            } catch (e) {
                if (PLAYER_CONFIG.debugMode) console.log(`[Preload] Error preloading for ${nextEpisodeUrl}: ${e}`);
            }
        }
    }

    /**
     * 注册所有预加载相关的事件监听器
     */
    function registerPreloadEvents() {
        if (!window.player) {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Player not ready, deferring event registration.');
            setTimeout(registerPreloadEvents, 200);
            return;
        }

        // 1. 播放进度接近结尾时触发
        timeUpdateListener = () => {
            if (window.player.duration && window.player.currentTime > window.player.duration - 15) { // 提前15秒
                preloadNextEpisodeParts();
            }
        };
        window.player.addEventListener('time-update', timeUpdateListener);

        // 2. 鼠标悬停或触摸“下一集”按钮时触发
        const nextBtn = document.getElementById('next-episode');
        if (nextBtn) {
            nextButtonHoverListener = () => preloadNextEpisodeParts();
            nextButtonTouchListener = () => preloadNextEpisodeParts();
            nextBtn.addEventListener('mouseenter', nextButtonHoverListener, { passive: true });
            nextBtn.addEventListener('touchstart', nextButtonTouchListener, { passive: true });
        }

        // 3. 点击剧集列表时触发（为即将播放的下一集做准备）
        const episodesListContainer = document.getElementById('episode-grid');
        if (episodesListContainer) {
            episodeGridClickListener = (e) => {
                if (e.target.closest('button[data-index]')) {
                    setTimeout(() => preloadNextEpisodeParts(), 200);
                }
            };
            episodesListContainer.addEventListener('click', episodeGridClickListener);
        }

        if (PLAYER_CONFIG.debugMode) console.log('[Preload] All event listeners registered.');
    }

    /**
     * 移除所有预加载相关的事件监听器
     */
    function unregisterPreloadEvents() {
        if (window.player && timeUpdateListener) {
            window.player.removeEventListener('time-update', timeUpdateListener);
            timeUpdateListener = null;
        }
        const nextBtn = document.getElementById('next-episode');
        if (nextBtn) {
            if (nextButtonHoverListener) nextBtn.removeEventListener('mouseenter', nextButtonHoverListener);
            if (nextButtonTouchListener) nextBtn.removeEventListener('touchstart', nextButtonTouchListener);
            nextButtonHoverListener = null;
            nextButtonTouchListener = null;
        }
        const episodesListContainer = document.getElementById('episode-grid');
        if (episodesListContainer && episodeGridClickListener) {
            episodesListContainer.removeEventListener('click', episodeGridClickListener);
            episodeGridClickListener = null;
        }
        if (PLAYER_CONFIG.debugMode) console.log('[Preload] All event listeners unregistered.');
    }

    /**
     * 启动预加载功能
     */
    function startPreloading() {
        if (isPreloadingActive) return; // 防止重复启动
        isPreloadingActive = true;

        // 确保播放器和其他数据已准备好
        let tries = 0;
        const initialCheck = setInterval(() => {
            if (window.player && window.currentEpisodes && typeof window.currentEpisodeIndex === 'number') {
                clearInterval(initialCheck);
                if (PLAYER_CONFIG.debugMode) console.log('[Preload] System ready, starting preloading features.');
                registerPreloadEvents();
                preloadNextEpisodeParts(); // 立即执行一次初始预加载
            } else if (++tries > 50) { // 等待最多10秒
                clearInterval(initialCheck);
                if (PLAYER_CONFIG.debugMode) console.warn('[Preload] Failed to start: player or episode data not available.');
            }
        }, 200);
    }

    /**
     * 停止预加载功能
     */
    function stopPreloading() {
        if (!isPreloadingActive) return;
        isPreloadingActive = false;
        unregisterPreloadEvents();
        if (PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading stopped.');
    }

    /**
     * 增强全局的 playEpisode 函数，使其在切换剧集后能自动触发预加载
     */
    function enhancePlayEpisodeForPreloading() {
        const originalPlayEpisode = window.playEpisode;
        if (originalPlayEpisode && !originalPlayEpisode._preloadEnhanced) {
            window.playEpisode = function (...args) {
                originalPlayEpisode.apply(this, args);
                // 切换剧集后，延迟一小段时间再触发预加载
                setTimeout(() => preloadNextEpisodeParts(), 250);
            };
            window.playEpisode._preloadEnhanced = true;
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] playEpisode function enhanced.');
        }
    }

    // --- 初始化入口 ---
    document.addEventListener('DOMContentLoaded', function () {
        // 延迟执行，确保 player_app.js 中的设置和变量已初始化
        setTimeout(() => {
            // 从 localStorage 读取用户设置，决定是否在页面加载时就启动预加载
            const isEnabled = localStorage.getItem('preloadingEnabled') !== 'false';

            if (isEnabled) {
                startPreloading();
            } else {
                if (PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading is disabled by user setting on page load.');
            }

            // 增强 playEpisode 函数，无论预加载是否默认开启
            enhancePlayEpisodeForPreloading();

        }, 500);
    });

    // --- 暴露控制函数给全局 ---
    window.startPreloading = startPreloading;
    window.stopPreloading = stopPreloading;
    window.preloadNextEpisodeParts = preloadNextEpisodeParts; // 也可用于手动触发

})();