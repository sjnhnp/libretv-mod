// ================================
// 简化的画质检测模块 - 专门解决CORS问题
// ================================

/**
 * 简化的画质检测函数 - 主要通过URL分析和简单的网络测试
 * @param {string} m3u8Url - m3u8播放地址
 * @returns {Promise<{quality: string, loadSpeed: string, pingTime: number}>}
 */
async function simplePrecheckSource(m3u8Url) {
    // 第一步：校验 URL
    if (!m3u8Url || !m3u8Url.includes('.m3u8')) {
        return { quality: '检测失败', loadSpeed: 'N/A', pingTime: -1 };
    }

    // 第二步：文件名关键词快速识别
    const qualityKeywords = {
        '4K': [/4k/i, /2160p/i, /3840x2160/i, /超高清/i, /uhd/i],
        '2K': [/2k/i, /1440p/i, /2560x1440/i, /qhd/i],
        '1080p': [/1080p/i, /fhd/i, /1920x1080/i, /全高清/i, /fullhd/i],
        '720p': [/720p/i, /hd/i, /1280x720/i, /高清/i],
        '480p': [/480p/i, /854x480/i, /sd/i],
        'SD': [/240p/i, /360p/i, /标清/i, /low/i]
    };

    for (const [quality, patterns] of Object.entries(qualityKeywords)) {
        if (patterns.some(pattern => pattern.test(m3u8Url))) {
            return { quality, loadSpeed: '快速识别', pingTime: 0 };
        }
    }

    // 第三步：进行实际的网络测速
    const startTime = performance.now();

    try {
        // 尝试实际下载一小部分内容来测速
        const response = await fetch(m3u8Url, {
            method: 'GET',
            mode: 'cors',
            signal: AbortSignal.timeout(5000)
        });

        const firstByteTime = performance.now() - startTime;
        let actualLoadSpeed = '未知';

        if (response.ok) {
            const reader = response.body?.getReader();
            if (reader) {
                const downloadStart = performance.now();
                let totalBytes = 0;
                let chunks = 0;

                // 读取前几个数据块来测速（最多读取3个块或3秒）
                while (chunks < 3) {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 3000)
                    );

                    try {
                        const result = await Promise.race([reader.read(), timeoutPromise]);
                        if (result.done) break;

                        totalBytes += result.value.length;
                        chunks++;

                        // 计算当前速度
                        const elapsed = (performance.now() - downloadStart) / 1000;
                        if (elapsed > 0.5) { // 至少测试0.5秒
                            const speedKBps = (totalBytes / 1024) / elapsed;
                            actualLoadSpeed = speedKBps >= 1024
                                ? `${(speedKBps / 1024).toFixed(1)} MB/s`
                                : `${Math.round(speedKBps)} KB/s`;
                            break;
                        }
                    } catch (timeoutError) {
                        break;
                    }
                }

                reader.cancel();
            }
        }

        const pingTime = Math.round(firstByteTime);

        // 基于URL特征推断画质
        let quality = '高清';

        // 检查URL中的数字特征 - 改进版，更智能地识别分辨率数字
        const numbers = m3u8Url.match(/\d+/g) || [];

        // 寻找真正的分辨率数字，优先查找常见分辨率模式
        const commonResolutions = [3840, 2560, 1920, 1280, 854, 720, 480];
        let foundResolution = null;

        // 方法1：查找确切的分辨率数字
        for (const res of commonResolutions) {
            if (numbers.some(n => parseInt(n) === res)) {
                foundResolution = res;
                break;
            }
        }

        // 方法2：查找接近的分辨率数字（允许小幅偏差）
        if (!foundResolution) {
            for (const res of commonResolutions) {
                const closeNumbers = numbers.filter(n => {
                    const num = parseInt(n);
                    return Math.abs(num - res) <= 50; // 允许50的偏差
                });
                if (closeNumbers.length > 0) {
                    foundResolution = res;
                    break;
                }
            }
        }

        // 方法3：查找路径中的分辨率指示（如 /1080p/, /720p/）
        if (!foundResolution) {
            const pathResolutionMatch = m3u8Url.match(/\/(\d{3,4})p?\//);
            if (pathResolutionMatch) {
                const pathRes = parseInt(pathResolutionMatch[1]);
                if (pathRes >= 480 && pathRes <= 4000) {
                    foundResolution = pathRes;
                }
            }
        }

        // 根据找到的分辨率设置画质
        if (foundResolution) {
            if (foundResolution >= 3840) quality = '4K';
            else if (foundResolution >= 2560) quality = '2K';
            else if (foundResolution >= 1920) quality = '1080p';
            else if (foundResolution >= 1280) quality = '720p';
            else if (foundResolution >= 854) quality = '480p';
            else quality = 'SD';
        } else {
            // 如果没有找到明显的分辨率数字，使用启发式方法
            const filename = m3u8Url.split('/').pop().replace('.m3u8', '');

            // 检查文件名中的码率信息（如3309kb表示高码率）
            const bitrateMatch = m3u8Url.match(/(\d+)kb/i);
            if (bitrateMatch) {
                const bitrate = parseInt(bitrateMatch[1]);
                if (bitrate >= 5000) quality = '4K';
                else if (bitrate >= 3000) quality = '1080p';
                else if (bitrate >= 1500) quality = '720p';
                else if (bitrate >= 800) quality = '480p';
                else quality = 'SD';
            } else if (filename.length > 30) {
                quality = '1080p'; // 复杂文件名通常表示高质量
            } else if (filename.length > 20) {
                quality = '720p';
            }
        }

        // 检查URL中的质量指示词
        if (/high|hq|超清|高清/i.test(m3u8Url)) quality = '1080p';
        if (/medium|mq|中等/i.test(m3u8Url)) quality = '720p';
        if (/low|lq|标清/i.test(m3u8Url)) quality = '480p';

        return {
            quality,
            loadSpeed: actualLoadSpeed,
            pingTime
        };

    } catch (error) {
        // 网络测试失败，尝试简单的ping测试
        try {
            const pingStart = performance.now();
            await fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(2000) });
            const pingTime = Math.round(performance.now() - pingStart);

            return {
                quality: '1080p', // 默认假设为1080p
                loadSpeed: '连接正常',
                pingTime
            };
        } catch (pingError) {
            return {
                quality: '1080p',
                loadSpeed: '连接超时',
                pingTime: Math.round(performance.now() - startTime)
            };
        }
    }
}

/**
 * 尝试通过创建video元素来检测画质（无CORS限制）
 * @param {string} m3u8Url - m3u8播放地址
 * @returns {Promise<{quality: string, loadSpeed: string, pingTime: number}>}
 */
async function videoElementDetection(m3u8Url) {
    return new Promise((resolve) => {
        // 首先尝试直接解析m3u8内容获取RESOLUTION信息
        tryParseM3u8Resolution(m3u8Url).then(m3u8Result => {
            if (m3u8Result.quality !== '未知') {
                resolve(m3u8Result);
                return;
            }

            // 如果m3u8解析失败，回退到video元素检测
            performVideoElementDetection(m3u8Url).then(resolve);
        }).catch(() => {
            // 如果m3u8解析出错，回退到video元素检测
            performVideoElementDetection(m3u8Url).then(resolve);
        });
    });
}

/**
 * 尝试解析m3u8文件中的RESOLUTION信息
 */
async function tryParseM3u8Resolution(m3u8Url) {
    try {
        // 尝试多种方式获取m3u8内容
        let content = null;

        // 方法1：直接请求（可能有CORS限制）
        try {
            const response = await fetch(m3u8Url, {
                method: 'GET',
                mode: 'cors',
                signal: AbortSignal.timeout(3000)
            });

            if (response.ok) {
                content = await response.text();
            }
        } catch (corsError) {
            console.log('直接请求失败，尝试代理:', corsError.message);

            // 方法2：使用代理（如果可用）
            if (typeof PROXY_URL !== 'undefined') {
                try {
                    const proxyUrl = PROXY_URL + encodeURIComponent(m3u8Url);
                    const proxyResponse = await fetch(proxyUrl, {
                        signal: AbortSignal.timeout(3000)
                    });

                    if (proxyResponse.ok) {
                        content = await proxyResponse.text();
                    }
                } catch (proxyError) {
                    console.log('代理请求也失败:', proxyError.message);
                }
            }
        }

        if (content) {
            // 查找RESOLUTION信息
            const resolutionMatch = content.match(/RESOLUTION=(\d+)x(\d+)/);
            if (resolutionMatch) {
                const width = parseInt(resolutionMatch[1]);
                const height = parseInt(resolutionMatch[2]);

                console.log(`找到RESOLUTION: ${width}x${height}`);

                let quality = 'SD';
                if (width >= 3840) quality = '4K';
                else if (width >= 2560) quality = '2K';
                else if (width >= 1920) quality = '1080p';
                else if (width >= 1280) quality = '720p';
                else if (width >= 854) quality = '480p';

                return {
                    quality,
                    loadSpeed: `${width}x${height}`,
                    pingTime: 0
                };
            }

            // 查找BANDWIDTH信息（如果没有RESOLUTION）
            const bandwidthMatch = content.match(/BANDWIDTH=(\d+)/);
            if (bandwidthMatch) {
                const bandwidth = parseInt(bandwidthMatch[1]);
                console.log(`找到BANDWIDTH: ${bandwidth}`);

                let quality = 'SD';
                if (bandwidth >= 15000000) quality = '4K';
                else if (bandwidth >= 8000000) quality = '2K';
                else if (bandwidth >= 3000000) quality = '1080p';
                else if (bandwidth >= 1500000) quality = '720p';
                else if (bandwidth >= 800000) quality = '480p';

                return {
                    quality,
                    loadSpeed: `${Math.round(bandwidth / 1000)}kb/s`,
                    pingTime: 0
                };
            }
        }
    } catch (error) {
        console.warn('M3U8解析错误:', error.message);
    }

    return { quality: '未知', loadSpeed: 'N/A', pingTime: -1 };
}

/**
 * 使用video元素进行检测
 */
// js/simple_quality_detector.js

async function performVideoElementDetection(m3u8Url) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto'; // 改为 auto 以便开始播放
        video.style.display = 'none';
        video.style.position = 'absolute';
        video.style.top = '-9999px';
        video.style.width = '1px';
        video.style.height = '1px';

        const startTime = performance.now();
        let resolved = false;
        let checkTimer = null;

        const cleanup = () => {
            clearTimeout(timeout);
            clearTimeout(checkTimer);
            if (video.parentNode) {
                video.pause();
                video.src = ''; // 释放资源
                video.parentNode.removeChild(video);
            }
        };

        const resolveOnce = (result) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve(result);
            }
        };

        const timeout = setTimeout(() => {
            resolveOnce({
                quality: '检测超时',
                loadSpeed: 'N/A',
                pingTime: Math.round(performance.now() - startTime)
            });
        }, 5000); // 将总超时延长到5秒

        const checkResolution = () => {
            const width = video.videoWidth;
            const height = video.videoHeight;

            // 如果在1.5秒后仍然没有获取到有效分辨率，则认为失败
            if (width === 0 && video.currentTime > 1.5) {
                resolveOnce({
                    quality: '播放失败',
                    loadSpeed: 'N/A',
                    pingTime: -1
                });
                return;
            }

            if (width > 0) {
                const pingTime = Math.round(performance.now() - startTime);
                let quality = '高清';
                if (width >= 3840) quality = '4K';
                else if (width >= 2560) quality = '2K';
                else if (width >= 1920) quality = '1080p';
                else if (width >= 1280) quality = '720p';
                else if (width >= 854) quality = '480p';
                else quality = 'SD';

                resolveOnce({
                    quality,
                    loadSpeed: `${width}x${height}`,
                    pingTime
                });
            }
        };

        video.onloadedmetadata = () => {
            video.play().catch(() => {
                resolveOnce({
                    quality: '播放失败',
                    loadSpeed: 'N/A',
                    pingTime: -1
                });
            });
        };

        // 监听播放时间和分辨率变化
        video.ontimeupdate = checkResolution;
        video.onresize = checkResolution; // 当分辨率变化时也检测

        video.onerror = () => {
            resolveOnce({
                quality: '播放失败',
                loadSpeed: 'N/A',
                pingTime: Math.round(performance.now() - startTime)
            });
        };

        document.body.appendChild(video);
        video.src = m3u8Url;
    });
}

/**
 * 综合画质检测函数 - 重新设计优先级逻辑
 * @param {string} m3u8Url - m3u8播放地址
 * @returns {Promise<{quality: string, loadSpeed: string, pingTime: number}>}
 */
async function comprehensiveQualityCheck(m3u8Url) {
    console.log('开始综合画质检测:', m3u8Url);

    // 并行执行所有检测方法
    const detectionPromises = [];

    // 1. M3U8 RESOLUTION解析（最准确）
    detectionPromises.push(
        tryParseM3u8Resolution(m3u8Url)
            .then(result => ({ ...result, method: 'm3u8_resolution', priority: 1 }))
            .catch(() => ({ quality: '未知', loadSpeed: 'N/A', pingTime: -1, method: 'm3u8_resolution', priority: 1 }))
    );

    // 2. Video元素检测（次准确）
    detectionPromises.push(
        Promise.race([
            performVideoElementDetection(m3u8Url),
            new Promise((resolve) => setTimeout(() => resolve({
                quality: '检测超时',
                loadSpeed: 'N/A',
                pingTime: -1
            }), 3000))
        ]).then(result => ({ ...result, method: 'video_element', priority: 2 }))
            .catch(() => ({ quality: '播放失败', loadSpeed: 'N/A', pingTime: -1, method: 'video_element', priority: 2 }))
    );

    // 3. 关键词识别（较准确）
    const keywordResult = await checkKeywordQuality(m3u8Url);
    if (keywordResult) {
        detectionPromises.push(
            Promise.resolve({
                quality: keywordResult,
                loadSpeed: '极速',
                pingTime: 0,
                method: 'keyword',
                priority: 3
            })
        );
    }

    // 4. 简单检测（备选）
    detectionPromises.push(
        simplePrecheckSource(m3u8Url)
            .then(result => ({ ...result, method: 'simple_analysis', priority: 4 }))
            .catch(() => ({ quality: '检测失败', loadSpeed: 'N/A', pingTime: -1, method: 'simple_analysis', priority: 4 }))
    );

    // 等待所有检测完成
    const results = await Promise.all(detectionPromises);

    console.log('所有检测结果:', results);

    // 按优先级选择最佳结果
    let bestResult = null;

    // 优先级1: M3U8 RESOLUTION解析
    const m3u8Result = results.find(r => r.method === 'm3u8_resolution');
    if (m3u8Result && m3u8Result.quality !== '未知') {
        console.log('采用M3U8 RESOLUTION解析结果:', m3u8Result.quality);
        bestResult = m3u8Result;
    }

    // 优先级2: Video元素检测
    if (!bestResult) {
        const videoResult = results.find(r => r.method === 'video_element');
        if (videoResult &&
            videoResult.quality !== '检测超时' &&
            videoResult.quality !== '播放失败' &&
            videoResult.quality !== '高清' &&
            videoResult.quality !== '未知') {
            console.log('采用Video元素检测结果:', videoResult.quality);
            bestResult = videoResult;
        }
    }

    // 优先级3: 关键词识别
    if (!bestResult) {
        const keywordResult = results.find(r => r.method === 'keyword');
        if (keywordResult) {
            console.log('采用关键词识别结果:', keywordResult.quality);
            bestResult = keywordResult;
        }
    }

    // 优先级4: 简单检测
    if (!bestResult) {
        const simpleResult = results.find(r => r.method === 'simple_analysis');
        if (simpleResult && simpleResult.quality !== '检测失败') {
            console.log('采用简单检测结果:', simpleResult.quality);
            bestResult = simpleResult;

            // 修正一些通用术语
            if (bestResult.quality === '高清') {
                bestResult.quality = '1080p';
            }
        }
    }

    // 如果所有方法都失败，返回默认结果
    if (!bestResult) {
        console.log('所有检测方法都失败，返回默认结果');
        bestResult = {
            quality: '1080p',
            loadSpeed: '未知',
            pingTime: -1,
            method: 'fallback',
            priority: 99
        };
    }

    // 合并加载速度信息（优先使用简单检测的网络测速结果）
    const simpleResult = results.find(r => r.method === 'simple_analysis');
    if (simpleResult && simpleResult.loadSpeed &&
        simpleResult.loadSpeed.match(/\d+(\.\d+)?\s*(KB\/s|MB\/s)$/)) {
        bestResult.loadSpeed = simpleResult.loadSpeed;
        bestResult.pingTime = simpleResult.pingTime;
    }

    console.log('最终选择的结果:', bestResult);

    return {
        quality: bestResult.quality,
        loadSpeed: bestResult.loadSpeed,
        pingTime: bestResult.pingTime,
        detectionMethod: bestResult.method,
        sortPriority: bestResult.priority
    };
}

// 单独的关键词检测函数
async function checkKeywordQuality(m3u8Url) {
    const qualityKeywords = {
        '4K': [/4k/i, /2160p/i, /3840x2160/i, /超高清/i, /uhd/i],
        '2K': [/2k/i, /1440p/i, /2560x1440/i, /qhd/i],
        '1080p': [/1080p/i, /fhd/i, /1920x1080/i, /全高清/i, /fullhd/i],
        '720p': [/720p/i, /hd/i, /1280x720/i, /高清/i],
        '480p': [/480p/i, /854x480/i, /sd/i],
        'SD': [/240p/i, /360p/i, /标清/i, /low/i]
    };

    for (const [quality, patterns] of Object.entries(qualityKeywords)) {
        if (patterns.some(pattern => pattern.test(m3u8Url))) {
            return quality;
        }
    }

    return null;
}

// 导出函数
if (typeof window !== 'undefined') {
    // 替换原有的precheckSource函数
    window.precheckSource = comprehensiveQualityCheck;
    window.simplePrecheckSource = simplePrecheckSource;
    window.videoElementDetection = videoElementDetection;
    window.comprehensiveQualityCheck = comprehensiveQualityCheck;
    window.tryParseM3u8Resolution = tryParseM3u8Resolution;
    window.performVideoElementDetection = performVideoElementDetection;
}

// Node.js环境支持
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        simplePrecheckSource,
        videoElementDetection,
        comprehensiveQualityCheck
    };
}