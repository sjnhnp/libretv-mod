预加载，点击下一集就可以出发
```
<script>
// ======== 预加载下集(m3u8和前3个ts分片)极致快切方案 ========
(function () {
    // 检查浏览器是否支持 Cache Storage
    const supportsCacheStorage = 'caches' in window && window.caches.open;

    // 简单判断移动网络，2G等弱网不预加载
    function isSlowNetwork() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!connection || !connection.effectiveType) return false;
        return /2g|slow-2g/.test(connection.effectiveType);
    }

    // 主预加载函数
    async function preloadNextEpisodeParts() {
        // 1. 网络与环境判断
        if (isSlowNetwork()) return;
        if (!window.currentEpisodes || typeof window.currentEpisodeIndex !== 'number') return;
        // 2. 检查下集
        const idx = window.currentEpisodeIndex;
        if (idx >= window.currentEpisodes.length - 1) return;
        const nextUrl = window.currentEpisodes[idx + 1];
        if (!nextUrl || typeof nextUrl !== 'string') return;

        try {
            // 3. 预取m3u8
            const m3u8Resp = await fetch(nextUrl, { method: "GET", credentials: "same-origin" });
            if (!m3u8Resp.ok) return;
            const m3u8Text = await m3u8Resp.text();

            // 4. 解析前3个ts分片url
            const tsUrls = [];
            let base = nextUrl.substring(0, nextUrl.lastIndexOf('/') + 1);
            m3u8Text.split('\n').forEach(line => {
                const t = line.trim();
                if (t && !t.startsWith("#") && /\.ts(\?|$)/i.test(t) && tsUrls.length < 3) {
                    tsUrls.push(/^https?:\/\//i.test(t) ? t : base + t);
                }
            });
            if (tsUrls.length === 0) return;

            // 5. fetch ts分片，存入cache
            tsUrls.forEach(tsUrl => {
                if (supportsCacheStorage) {
                    caches.open('libretv-preload1').then(cache => {
                        cache.match(tsUrl).then(cachedResp => {
                            if (!cachedResp) {
                                fetch(tsUrl, { method: "GET", credentials: "same-origin" }).then(resp => {
                                    if (resp.ok) cache.put(tsUrl, resp.clone());
                                }).catch(()=>{});
                            }
                        });
                    });
                } else {
                    fetch(tsUrl, { method: "GET", credentials: "same-origin" }).catch(()=>{});
                }
            });
        } catch (e) {
            // 静默错误
        }
    }

    // export to window 便于外部调用
    window.preloadNextEpisodeParts = preloadNextEpisodeParts;

    document.addEventListener('DOMContentLoaded', function () {
        // 1. 鼠标悬停/触摸“下一集”按钮预加载
        var nextBtn = document.getElementById('nextButton');
        if (nextBtn) {
            nextBtn.addEventListener('mouseenter', preloadNextEpisodeParts, { passive: true });
            nextBtn.addEventListener('touchstart', preloadNextEpisodeParts, { passive: true });
        }

        // 2. 当前视频播到结尾前预加载下集
        function setupTimeupdatePreload() {
            if (window.dp && window.dp.video && typeof window.dp.video.addEventListener === 'function') {
                window.dp.video.addEventListener('timeupdate', () => {
                    if (
                        window.dp.video.duration &&
                        window.dp.video.currentTime > window.dp.video.duration - 12
                    ) {
                        preloadNextEpisodeParts();
                    }
                });
            }
        }
        if (window.dp && window.dp.video) {
            setupTimeupdatePreload();
        } else {
            // DPlayer 异步init兼容
            var tries = 0;
            var timer = setInterval(() => {
                if (window.dp && window.dp.video) {
                    setupTimeupdatePreload();
                    clearInterval(timer);
                }
                if (++tries > 50) clearInterval(timer);
            }, 200);
        }

        // 3. 点击任何集数按钮均预加载下集
        var episodesList = document.getElementById('episodesList');
        if (episodesList) {
            episodesList.addEventListener('click', function (e) {
                var btn = e.target.closest('button[id^="episode-"]');
                if (btn) {
                    setTimeout(function () {
                        if (typeof window.preloadNextEpisodeParts === 'function') {
                            window.preloadNextEpisodeParts();
                        }
                    }, 200);
                }
            });
        }
    });
})();
</script>
```





    默认预加载“3”集（5~8集推荐最大值为3，太多会浪费流量）。
    所有事件都已写成() => preloadNextEpisodeParts(3)。
    支持随时只需将数字 3 改为其它值即可实现更多/更少的连续预加载。
用法说明

    将上面整段覆盖你页面的原有极速切集预加载 <script>...</script> 即可。
    只改一处常量 PRELOAD_EPISODE_COUNT，全场景生效！后期维护十分友好。
    支持多实例、不会污染全局环境、与主播放器兼容好。

```
<script>
// ======== 预加载多集（m3u8和前3个ts分片）极致快切方案 ========
(function () {
    // 支持随时调整连续预读集数；如想拉5集，把这里的3改5即可
    const PRELOAD_EPISODE_COUNT = 3;

    // 检查浏览器是否支持 Cache Storage
    const supportsCacheStorage = 'caches' in window && window.caches.open;

    // 简单判断移动网络，2G等弱网不预加载
    function isSlowNetwork() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!connection || !connection.effectiveType) return false;
        return /2g|slow-2g/.test(connection.effectiveType);
    }

    // 连续多集预加载核心函数
    async function preloadNextEpisodeParts(preloadCount = PRELOAD_EPISODE_COUNT) {
        if (isSlowNetwork()) return;
        if (!window.currentEpisodes || typeof window.currentEpisodeIndex !== 'number') return;
        const idx = window.currentEpisodeIndex;
        const maxIndex = window.currentEpisodes.length - 1;

        for (let offset = 1; offset <= preloadCount; offset++) {
            const episodeIdx = idx + offset;
            if (episodeIdx > maxIndex) break;
            const nextUrl = window.currentEpisodes[episodeIdx];
            if (!nextUrl || typeof nextUrl !== 'string') continue;

            try {
                const m3u8Resp = await fetch(nextUrl, { method: "GET", credentials: "same-origin" });
                if (!m3u8Resp.ok) continue;
                const m3u8Text = await m3u8Resp.text();
                const tsUrls = [];
                let base = nextUrl.substring(0, nextUrl.lastIndexOf('/') + 1);
                m3u8Text.split('\n').forEach(line => {
                    const t = line.trim();
                    if (t && !t.startsWith("#") && /\.ts(\?|$)/i.test(t) && tsUrls.length < 3) {
                        tsUrls.push(/^https?:\/\//i.test(t) ? t : base + t);
                    }
                });
                if (tsUrls.length === 0) continue;
                tsUrls.forEach(tsUrl => {
                    if (supportsCacheStorage) {
                        caches.open('libretv-preload1').then(cache => {
                            cache.match(tsUrl).then(cachedResp => {
                                if (!cachedResp) {
                                    fetch(tsUrl, { method: "GET", credentials: "same-origin" }).then(resp => {
                                        if (resp.ok) cache.put(tsUrl, resp.clone());
                                    }).catch(()=>{});
                                }
                            });
                        });
                    } else {
                        fetch(tsUrl, { method: "GET", credentials: "same-origin" }).catch(()=>{});
                    }
                });
            } catch (e) {
                // 静默错误，循环拉下一个
            }
        }
    }
    window.preloadNextEpisodeParts = preloadNextEpisodeParts;

    document.addEventListener('DOMContentLoaded', function () {
        // 1. 鼠标悬停/触摸“下一集”按钮预加载（预拉3集）
        var nextBtn = document.getElementById('nextButton');
        if (nextBtn) {
            nextBtn.addEventListener('mouseenter', () => preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT), { passive: true });
            nextBtn.addEventListener('touchstart', () => preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT), { passive: true });
        }

        // 2. 当前视频播到结尾前，预拉后3集
        function setupTimeupdatePreload() {
            if (window.dp && window.dp.video && typeof window.dp.video.addEventListener === 'function') {
                window.dp.video.addEventListener('timeupdate', () => {
                    if (
                        window.dp.video.duration &&
                        window.dp.video.currentTime > window.dp.video.duration - 12
                    ) {
                        preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT);
                    }
                });
            }
        }
        if (window.dp && window.dp.video) {
            setupTimeupdatePreload();
        } else {
            // DPlayer 异步init兼容
            var tries = 0;
            var timer = setInterval(() => {
                if (window.dp && window.dp.video) {
                    setupTimeupdatePreload();
                    clearInterval(timer);
                }
                if (++tries > 50) clearInterval(timer);
            }, 200);
        }

        // 3. 点击任何集数按钮均预拉后3集
        var episodesList = document.getElementById('episodesList');
        if (episodesList) {
            episodesList.addEventListener('click', function (e) {
                var btn = e.target.closest('button[id^="episode-"]');
                if (btn) {
                    setTimeout(function () {
                        if (typeof window.preloadNextEpisodeParts === 'function') {
                            window.preloadNextEpisodeParts(PRELOAD_EPISODE_COUNT);
                        }
                    }, 200);
                }
            });
        }
    });
})();
</script>

```
