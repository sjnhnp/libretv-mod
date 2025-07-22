// ================================
// 改进的画质检测模块
// 参考watchtv的实现，提供更准确的画质检测
// ================================

/**
 * 简化但更有效的画质检测函数
 * @param {string} m3u8Url - m3u8播放地址
 * @returns {Promise<{quality: string, loadSpeed: string, pingTime: number}>}
 */
async function getVideoResolutionFromM3u8(m3u8Url) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';
        video.style.display = 'none';
        video.style.position = 'absolute';
        video.style.top = '-9999px';
        
        // 测量网络延迟
        const pingStart = performance.now();
        let pingTime = 0;

        // 设置超时处理
        const timeout = setTimeout(() => {
            cleanup();
            resolve({ quality: '检测超时', loadSpeed: 'N/A', pingTime: -1 });
        }, 6000);

        let actualLoadSpeed = '未知';
        let hasSpeedCalculated = false;
        let hasMetadataLoaded = false;
        let fragmentStartTime = 0;

        const cleanup = () => {
            clearTimeout(timeout);
            if (video.hls) {
                video.hls.destroy();
            }
            if (video.parentNode) {
                video.parentNode.removeChild(video);
            }
        };

        // 检查是否可以返回结果
        const checkAndResolve = () => {
            if (hasMetadataLoaded) {
                const width = video.videoWidth;
                let quality = '高清';
                
                if (width && width > 0) {
                    // 根据视频宽度判断画质
                    if (width >= 3840) quality = '4K';
                    else if (width >= 2560) quality = '2K';
                    else if (width >= 1920) quality = '1080p';
                    else if (width >= 1280) quality = '720p';
                    else if (width >= 854) quality = '480p';
                    else quality = 'SD';
                }

                cleanup();
                resolve({
                    quality,
                    loadSpeed: actualLoadSpeed,
                    pingTime: Math.round(pingTime),
                });
            }
        };

        video.onerror = () => {
            cleanup();
            resolve({ quality: '播放失败', loadSpeed: 'N/A', pingTime: Math.round(performance.now() - pingStart) });
        };

        // 尝试使用HLS.js（如果可用）
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            try {
                const hls = new Hls({
                    debug: false,
                    enableWorker: true,
                    lowLatencyMode: true,
                    maxBufferLength: 5,
                    backBufferLength: 5,
                    maxBufferSize: 5 * 1000 * 1000,
                });

                // 测量ping时间
                fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors' })
                    .then(() => {
                        pingTime = performance.now() - pingStart;
                    })
                    .catch(() => {
                        pingTime = performance.now() - pingStart;
                    });

                // 监听片段加载开始
                hls.on(Hls.Events.FRAG_LOADING, () => {
                    fragmentStartTime = performance.now();
                });

                // 监听片段加载完成
                hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
                    if (fragmentStartTime > 0 && data && data.payload && !hasSpeedCalculated) {
                        const loadTime = performance.now() - fragmentStartTime;
                        const size = data.payload.byteLength || 0;
                        if (loadTime > 0 && size > 0) {
                            const speedKBps = size / 1024 / (loadTime / 1000);
                            if (speedKBps >= 1024) {
                                actualLoadSpeed = `${(speedKBps / 1024).toFixed(1)} MB/s`;
                            } else {
                                actualLoadSpeed = `${speedKBps.toFixed(1)} KB/s`;
                            }
                            hasSpeedCalculated = true;
                        }
                    }
                });

                hls.loadSource(m3u8Url);
                hls.attachMedia(video);
                video.hls = hls;

                // 监听HLS错误
                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.warn('HLS错误:', data);
                    if (data.fatal) {
                        cleanup();
                        resolve({ quality: '播放失败', loadSpeed: 'N/A', pingTime: Math.round(pingTime) });
                    }
                });

                // 监听视频元数据加载完成
                video.onloadedmetadata = () => {
                    hasMetadataLoaded = true;
                    checkAndResolve();
                };

                document.body.appendChild(video);
            } catch (hlsError) {
                console.warn('HLS.js初始化失败，回退到原生video:', hlsError);
                // 回退到原生video
                fallbackToNativeVideo();
            }
        } else {
            // 回退到原生video元素
            fallbackToNativeVideo();
        }

        function fallbackToNativeVideo() {
            video.onloadedmetadata = () => {
                const width = video.videoWidth;
                let quality = '高清';
                
                if (width && width > 0) {
                    if (width >= 3840) quality = '4K';
                    else if (width >= 2560) quality = '2K';
                    else if (width >= 1920) quality = '1080p';
                    else if (width >= 1280) quality = '720p';
                    else if (width >= 854) quality = '480p';
                    else quality = 'SD';
                }

                cleanup();
                resolve({
                    quality,
                    loadSpeed: '原生检测',
                    pingTime: Math.round(performance.now() - pingStart),
                });
            };

            document.body.appendChild(video);
            video.src = m3u8Url;
        }
    });
}

/**
 * 改进的预检测函数，结合多种检测方法
 * @param {string} m3u8Url - m3u8播放地址
 * @returns {Promise<{quality: string, loadSpeed: string, pingTime: number}>}
 */
async function improvedPrecheckSource(m3u8Url) {
    // —— 第一步：校验 URL —— 
    if (!m3u8Url || !m3u8Url.includes('.m3u8')) {
        return { quality: '无效链接', loadSpeed: 'N/A', pingTime: -1 };
    }

    // —— 第二步：文件名关键词快速识别 —— 
    const qualityKeywords = {
        '4K': [/4k/i, /2160p/i, /3840x2160/i, /超高清/i],
        '2K': [/2k/i, /1440p/i, /2560x1440/i],
        '1080p': [/1080p/i, /fhd/i, /1920x1080/i, /全高清/i],
        '720p': [/720p/i, /hd/i, /1280x720/i],
        '480p': [/480p/i, /854x480/i],
        'SD': [/sd/i, /standard/i, /标清/i]
    };
    
    for (const q of Object.keys(qualityKeywords)) {
        if (qualityKeywords[q].some(rx => rx.test(m3u8Url))) {
            return { quality: q, loadSpeed: '快速识别', pingTime: 0 };
        }
    }

    // —— 第三步：先尝试M3U8内容解析（更快） —— 
    try {
        const m3u8Result = await parseM3u8Content(m3u8Url);
        if (m3u8Result.quality !== '未知' && m3u8Result.quality !== '高清') {
            return m3u8Result;
        }
    } catch (error) {
        console.warn('M3U8解析失败:', error.message);
    }

    // —— 第四步：使用video元素检测（更准确但较慢） —— 
    try {
        const videoResult = await getVideoResolutionFromM3u8(m3u8Url);
        if (videoResult.quality !== '检测超时' && videoResult.quality !== '播放失败') {
            return videoResult;
        }
    } catch (error) {
        console.warn('Video元素检测失败:', error.message);
    }

    // 最后的回退
    return { quality: '高清', loadSpeed: 'N/A', pingTime: -1 };
}

/**
 * 解析M3U8内容获取画质信息
 * @param {string} m3u8Url - m3u8播放地址
 * @returns {Promise<{quality: string, loadSpeed: string, pingTime: number}>}
 */
async function parseM3u8Content(m3u8Url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const startTime = performance.now();

    try {
        let resp, text;
        let loadSpeed = '未知';
        
        // 尝试多种请求方式
        const requestMethods = [
            // 方法1：直接请求
            () => fetch(m3u8Url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
                },
                mode: 'cors'
            }),
            // 方法2：no-cors模式
            () => fetch(m3u8Url, {
                signal: controller.signal,
                mode: 'no-cors'
            }),
            // 方法3：使用代理（如果可用）
            () => {
                if (typeof PROXY_URL !== 'undefined') {
                    return fetch(PROXY_URL + encodeURIComponent(m3u8Url), {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
                        }
                    });
                }
                throw new Error('No proxy available');
            }
        ];

        let lastError;
        for (const method of requestMethods) {
            try {
                resp = await method();
                if (resp.ok) {
                    text = await resp.text();
                    break;
                }
            } catch (error) {
                lastError = error;
                continue;
            }
        }

        if (!text) {
            throw lastError || new Error('All request methods failed');
        }

        const duration = performance.now() - startTime;
        const kb = text.length / 1024;
        const speedKbps = kb / (duration / 1000);
        loadSpeed = speedKbps > 1024
            ? `${(speedKbps / 1024).toFixed(1)} MB/s`
            : `${Math.round(speedKbps)} KB/s`;

        const lines = text.split(/\r?\n/).map(l => l.trim());
        const pingTime = Math.round(duration);

        // 解析变体流
        const variants = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const uri = lines[i + 1] || '';
                variants.push({ info: lines[i], uri });
            }
        }

        if (variants.length > 0) {
            let maxWidth = 0, maxBandwidth = 0;
            for (const { info } of variants) {
                const bwMatch = info.match(/BANDWIDTH=(\d+)/);
                if (bwMatch) maxBandwidth = Math.max(maxBandwidth, +bwMatch[1]);
                const resMatch = info.match(/RESOLUTION=(\d+)x(\d+)/);
                if (resMatch) maxWidth = Math.max(maxWidth, +resMatch[1]);
            }
            
            if (maxWidth > 0 || maxBandwidth > 0) {
                let quality = '高清';
                if (maxWidth >= 3840 || maxBandwidth > 15000000) quality = '4K';
                else if (maxWidth >= 2560 || maxBandwidth > 8000000) quality = '2K';
                else if (maxWidth >= 1920 || maxBandwidth > 5000000) quality = '1080p';
                else if (maxWidth >= 1280 || maxBandwidth > 2000000) quality = '720p';
                else if (maxWidth >= 854 || maxBandwidth > 1000000) quality = '480p';
                else if (maxWidth > 0 || maxBandwidth > 0) quality = 'SD';
                
                return { quality, loadSpeed, pingTime };
            }
        }

        // 检查内容中的分辨率提示
        const resolutionHints = text.match(/(\d{3,4})x(\d{3,4})/g);
        if (resolutionHints && resolutionHints.length > 0) {
            const maxRes = resolutionHints.reduce((max, current) => {
                const [width] = current.split('x').map(Number);
                const [maxWidth] = max.split('x').map(Number);
                return width > maxWidth ? current : max;
            });
            const [width] = maxRes.split('x').map(Number);
            
            let quality = '高清';
            if (width >= 3840) quality = '4K';
            else if (width >= 2560) quality = '2K';
            else if (width >= 1920) quality = '1080p';
            else if (width >= 1280) quality = '720p';
            else if (width >= 854) quality = '480p';
            else quality = 'SD';
            
            return { quality, loadSpeed, pingTime };
        }

        // 检查码率信息
        const bandwidthMatch = text.match(/BANDWIDTH=(\d+)/g);
        if (bandwidthMatch && bandwidthMatch.length > 0) {
            const maxBandwidth = Math.max(...bandwidthMatch.map(b => parseInt(b.split('=')[1])));
            let quality = '高清';
            if (maxBandwidth > 15000000) quality = '4K';
            else if (maxBandwidth > 8000000) quality = '2K';
            else if (maxBandwidth > 5000000) quality = '1080p';
            else if (maxBandwidth > 2000000) quality = '720p';
            else if (maxBandwidth > 1000000) quality = '480p';
            else quality = 'SD';
            
            return { quality, loadSpeed, pingTime };
        }

        return { quality: '高清', loadSpeed, pingTime };

    } catch (error) {
        throw new Error(`M3U8解析失败: ${error.message}`);
    } finally {
        clearTimeout(timeoutId);
    }
}

// 替换原有的precheckSource函数
if (typeof window !== 'undefined') {
    window.precheckSource = improvedPrecheckSource;
    window.getVideoResolutionFromM3u8 = getVideoResolutionFromM3u8;
    window.parseM3u8Content = parseM3u8Content;
}

// 如果是Node.js环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        improvedPrecheckSource,
        getVideoResolutionFromM3u8,
        parseM3u8Content
    };
}