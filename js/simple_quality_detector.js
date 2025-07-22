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

    // 第三步：尝试网络测试
    const startTime = performance.now();
    
    try {
        // 尝试HEAD请求测试连通性
        const response = await fetch(m3u8Url, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: AbortSignal.timeout(3000)
        });
        
        const pingTime = Math.round(performance.now() - startTime);
        
        // 基于URL特征推断画质
        let quality = '高清';
        
        // 检查URL中的数字特征
        const numbers = m3u8Url.match(/\d+/g) || [];
        const largeNumbers = numbers.filter(n => parseInt(n) > 500);
        
        if (largeNumbers.length > 0) {
            const maxNumber = Math.max(...largeNumbers.map(n => parseInt(n)));
            
            if (maxNumber >= 3840 || maxNumber >= 2160) quality = '4K';
            else if (maxNumber >= 2560 || maxNumber >= 1440) quality = '2K';
            else if (maxNumber >= 1920 || maxNumber >= 1080) quality = '1080p';
            else if (maxNumber >= 1280 || maxNumber >= 720) quality = '720p';
            else if (maxNumber >= 854 || maxNumber >= 480) quality = '480p';
        }
        
        // 检查URL中的质量指示词
        if (/high|hq|超清|高清/i.test(m3u8Url)) quality = '1080p';
        if (/medium|mq|中等/i.test(m3u8Url)) quality = '720p';
        if (/low|lq|标清/i.test(m3u8Url)) quality = '480p';
        
        return {
            quality,
            loadSpeed: '网络测试',
            pingTime
        };
        
    } catch (error) {
        // 网络测试失败，返回默认值
        return {
            quality: '高清',
            loadSpeed: 'N/A',
            pingTime: Math.round(performance.now() - startTime)
        };
    }
}

/**
 * 尝试通过创建video元素来检测画质（无CORS限制）
 * @param {string} m3u8Url - m3u8播放地址
 * @returns {Promise<{quality: string, loadSpeed: string, pingTime: number}>}
 */
async function videoElementDetection(m3u8Url) {
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
        }, 5000);
        
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
    
    // 如果简单检测得到了明确结果，直接返回
    if (simpleResult.quality !== '高清' && simpleResult.quality !== '检测失败') {
        return simpleResult;
    }
    
    // 否则尝试video元素检测
    try {
        const videoResult = await videoElementDetection(m3u8Url);
        if (videoResult.quality !== '检测超时' && videoResult.quality !== '播放失败') {
            return videoResult;
        }
    } catch (error) {
        console.warn('Video元素检测失败:', error);
    }
    
    // 返回简单检测的结果
    return simpleResult;
}

// 导出函数
if (typeof window !== 'undefined') {
    // 替换原有的precheckSource函数
    window.precheckSource = comprehensiveQualityCheck;
    window.simplePrecheckSource = simplePrecheckSource;
    window.videoElementDetection = videoElementDetection;
    window.comprehensiveQualityCheck = comprehensiveQualityCheck;
}

// Node.js环境支持
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        simplePrecheckSource,
        videoElementDetection,
        comprehensiveQualityCheck
    };
}