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
        return { quality: '无效链接', loadSpeed: 'N/A', pingTime: -1 };
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
        const response = await fetch(m3u8Url, {
            method: 'GET',
            mode: 'cors',
            signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
            const content = await response.text();
            
            // 查找RESOLUTION信息
            const resolutionMatch = content.match(/RESOLUTION=(\d+)x(\d+)/);
            if (resolutionMatch) {
                const width = parseInt(resolutionMatch[1]);
                const height = parseInt(resolutionMatch[2]);
                
                let quality = 'SD';
                if (width >= 3840) quality = '4K';
                else if (width >= 2560) quality = '2K';
                else if (width >= 1920) quality = '1080p';
                else if (width >= 1280) quality = '720p';
                else if (width >= 854) quality = '480p';
                
                return {
                    quality,
                    loadSpeed: `${width}x${height}`,
                    pingTime: Math.round(performance.now() - Date.now())
                };
            }
        }
    } catch (error) {
        // 忽略错误，回退到video元素检测
    }
    
    return { quality: '未知', loadSpeed: 'N/A', pingTime: -1 };
}

/**
 * 使用video元素进行检测
 */
async function performVideoElementDetection(m3u8Url) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';
        video.style.display = 'none';
        video.style.position = 'absolute';
        video.style.top = '-9999px';
        video.style.width = '1px';
        video.style.height = '1px';
        
        const startTime = performance.now();
        let resolved = false;
        
        const cleanup = () => {
            if (video.parentNode) {
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
        
        // 设置超时
        const timeout = setTimeout(() => {
            resolveOnce({ 
                quality: '检测超时', 
                loadSpeed: 'N/A', 
                pingTime: Math.round(performance.now() - startTime) 
            });
        }, 3000); // 缩短超时时间
        
        video.onloadedmetadata = () => {
            clearTimeout(timeout);
            const width = video.videoWidth;
            const height = video.videoHeight;
            const pingTime = Math.round(performance.now() - startTime);
            
            let quality = '高清';
            if (width && width > 0) {
                if (width >= 3840) quality = '4K';
                else if (width >= 2560) quality = '2K';
                else if (width >= 1920) quality = '1080p';
                else if (width >= 1280) quality = '720p';
                else if (width >= 854) quality = '480p';
                else quality = 'SD';
            }
            
            resolveOnce({
                quality,
                loadSpeed: `${width}x${height}`,
                pingTime
            });
        };
        
        video.onerror = () => {
            clearTimeout(timeout);
            resolveOnce({ 
                quality: '播放失败', 
                loadSpeed: 'N/A', 
                pingTime: Math.round(performance.now() - startTime) 
            });
        };
        
        // 添加到DOM并设置源
        document.body.appendChild(video);
        video.src = m3u8Url;
    });
}

/**
 * 综合画质检测函数
 * @param {string} m3u8Url - m3u8播放地址
 * @returns {Promise<{quality: string, loadSpeed: string, pingTime: number}>}
 */
async function comprehensiveQualityCheck(m3u8Url) {
    // 先尝试简单检测
    const simpleResult = await simplePrecheckSource(m3u8Url);
    
    // 为不同检测方法分配可靠性权重和排序优先级
    let finalResult = { ...simpleResult };
    let detectionMethod = 'unknown';
    let sortPriority = 50; // 默认优先级（数字越小优先级越高）
    
    // 如果是关键词识别，优先级最高，速度设为最快
    if (simpleResult.loadSpeed === '快速识别') {
        detectionMethod = 'keyword';
        sortPriority = 10; // 最高优先级
        finalResult.loadSpeed = '极速'; // 用户友好的显示
        return { ...finalResult, sortPriority, detectionMethod };
    }
    
    // 如果有实际测速结果，保持原有速度信息
    if (simpleResult.loadSpeed && 
        simpleResult.loadSpeed !== 'N/A' && 
        simpleResult.loadSpeed !== '连接超时' &&
        simpleResult.loadSpeed !== '连接正常') {
        detectionMethod = 'speed_test';
        sortPriority = 20; // 高优先级
        return { ...finalResult, sortPriority, detectionMethod };
    }
    
    // 尝试video元素检测获取更准确的画质
    try {
        const videoResult = await Promise.race([
            videoElementDetection(m3u8Url),
            new Promise((resolve) => setTimeout(() => resolve({
                quality: '检测超时',
                loadSpeed: 'N/A',
                pingTime: -1
            }), 2000))
        ]);
        
        if (videoResult.quality !== '检测超时' && 
            videoResult.quality !== '播放失败' &&
            videoResult.quality !== '高清') {
            
            // 如果video检测成功，结合简单检测的速度信息
            detectionMethod = 'video_analysis';
            sortPriority = 30;
            
            return {
                quality: videoResult.quality,
                loadSpeed: simpleResult.loadSpeed || '连接正常',
                pingTime: Math.min(simpleResult.pingTime, videoResult.pingTime),
                sortPriority,
                detectionMethod
            };
        }
    } catch (error) {
        // Video检测失败，继续使用简单检测结果
    }
    
    // 最后的处理：确保返回有意义的结果
    if (finalResult.quality === '高清') {
        finalResult.quality = '1080p';
    }
    
    if (finalResult.loadSpeed === '连接正常') {
        detectionMethod = 'connection_test';
        sortPriority = 40;
    } else if (finalResult.loadSpeed === '连接超时') {
        detectionMethod = 'timeout';
        sortPriority = 90; // 最低优先级
    } else {
        detectionMethod = 'analysis';
        sortPriority = 60;
    }
    
    return { ...finalResult, sortPriority, detectionMethod };
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