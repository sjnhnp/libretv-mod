// ================================
// 统一画质和速度系统 - 完全重构版
// 解决画质显示混乱和速度标签问题
// ================================

/**
 * 统一的画质和速度管理器
 */
class UnifiedQualityManager {
    constructor() {
        this.cache = new Map(); // 内存缓存
        this.detectionQueue = new Set(); // 防重复检测
        this.isInitialized = false;
        this.resortTimeout = null; // 排序防抖定时器
    }

    /**
     * 初始化系统
     */
    init() {
        if (this.isInitialized) return;
        
        console.log('🚀 初始化统一画质系统');
        
        // 清理旧的混乱系统
        this.cleanupOldSystems();
        
        this.isInitialized = true;
    }

    /**
     * 清理旧的混乱系统
     */
    cleanupOldSystems() {
        // 禁用旧的检测系统
        if (window.progressiveDetector) {
            window.progressiveDetector = null;
        }
        
        // 清理旧的缓存
        try {
            localStorage.removeItem('qualityCache');
            // sessionStorage.removeItem('videoDataCache'); // 关键修复：注释掉此行，避免删除app.js依赖的核心数据缓存
        } catch (e) {
            console.warn('清理旧缓存失败:', e);
        }
        
        console.log('✅ 已清理旧的混乱系统');
    }

    /**
     * 获取视频的画质和速度信息
     */
    getQualityInfo(qualityId) {
        return this.cache.get(qualityId) || {
            quality: '1080p',
            loadSpeed: null,
            pingTime: 0,
            lastUpdated: 0
        };
    }

    /**
     * 设置视频的画质和速度信息
     */
    setQualityInfo(qualityId, info) {
        const data = {
            quality: info.quality || '1080p',
            loadSpeed: this.cleanSpeedData(info.loadSpeed),
            pingTime: info.pingTime || 0,
            lastUpdated: Date.now()
        };
        
        this.cache.set(qualityId, data);
        
        // 立即更新UI
        this.updateAllUI(qualityId, data);
        
        console.log(`✅ 更新画质信息: ${qualityId} -> ${data.quality}, 速度: ${data.loadSpeed || '无'}`);
    }

    /**
     * 清理速度数据，只保留真实的网络速度
     */
    cleanSpeedData(loadSpeed) {
        if (!loadSpeed) return null;
        
        // 严格匹配速度格式：数字+单位（KB/s或MB/s）
        const speedMatch = loadSpeed.match(/^(\d+(?:\.\d+)?)\s*(KB\/s|MB\/s)$/i);
        if (speedMatch) {
            return loadSpeed;
        }
        
        // 不是真实速度格式，返回null
        return null;
    }

    /**
     * 统一更新所有UI
     */
    updateAllUI(qualityId, data) {
        // 1. 更新结果卡片
        this.updateResultCards(qualityId, data);
        
        // 2. 更新弹窗
        this.updateModal(qualityId, data);
        
        // 3. 同步到全局状态
        this.syncToGlobalState(qualityId, data);
        
        // 4. 🔄 触发重新排序（如果有速度数据）
        if (data.loadSpeed) {
            this.triggerResort();
        }
    }

    /**
     * 触发结果重新排序
     */
    triggerResort() {
        // 防抖处理，避免频繁排序
        if (this.resortTimeout) {
            clearTimeout(this.resortTimeout);
        }
        
        this.resortTimeout = setTimeout(() => {
            this.performResort();
        }, 1000); // 1秒后执行排序
    }

    /**
     * 执行结果重新排序
     */
    performResort() {
        try {
            // 获取当前搜索结果
            const searchResultsContainer = document.getElementById('searchResults');
            if (!searchResultsContainer) return;
            
            const gridContainer = searchResultsContainer.querySelector('.grid');
            if (!gridContainer) return;
            
            const cards = Array.from(gridContainer.children);
            if (cards.length === 0) return;
            
            // 提取卡片数据并排序
            const cardData = cards.map(card => {
                const cardElement = card.querySelector('.card-hover');
                if (!cardElement || !cardElement.videoData) return null;
                
                return {
                    element: card,
                    data: cardElement.videoData
                };
            }).filter(Boolean);
            
            // 按速度排序
            const sortedCardData = this.sortBySpeed(cardData.map(item => item.data));
            
            // 重新排列DOM元素
            const fragment = document.createDocumentFragment();
            sortedCardData.forEach(sortedItem => {
                const cardItem = cardData.find(item => 
                    item.data.source_code === sortedItem.source_code && 
                    item.data.vod_id === sortedItem.vod_id
                );
                if (cardItem) {
                    fragment.appendChild(cardItem.element);
                }
            });
            
            gridContainer.appendChild(fragment);
            console.log('✅ 结果已按速度重新排序');
            
        } catch (error) {
            console.warn('重新排序失败:', error);
        }
    }

    /**
     * 更新结果卡片中的画质标签
     */
    updateResultCards(qualityId, data) {
        const badges = document.querySelectorAll(`[data-quality-id="${qualityId}"]`);
        
        badges.forEach(badge => {
            if (badge.textContent === data.quality) return; // 已经是最新的
            
            // 更新画质文本
            badge.textContent = data.quality;
            
            // 重置样式
            badge.className = 'quality-badge text-xs font-medium py-0.5 px-1.5 rounded';
            
            // 根据画质设置颜色
            this.setQualityColor(badge, data.quality);
            
            console.log(`✅ 更新卡片画质: ${qualityId} -> ${data.quality}`);
        });
    }

    /**
     * 设置画质标签颜色
     */
    setQualityColor(badge, quality) {
        const qualityLower = quality.toLowerCase();
        
        if (qualityLower.includes('4k')) {
            badge.classList.add('bg-amber-500', 'text-white');
        } else if (qualityLower.includes('2k') || qualityLower.includes('1080')) {
            badge.classList.add('bg-purple-600', 'text-purple-100');
        } else if (qualityLower.includes('720')) {
            badge.classList.add('bg-blue-600', 'text-blue-100');
        } else if (qualityLower.includes('480')) {
            badge.classList.add('bg-green-600', 'text-green-100');
        } else if (qualityLower.includes('sd') || qualityLower.includes('标清')) {
            badge.classList.add('bg-gray-500', 'text-gray-100');
        } else {
            badge.classList.add('bg-gray-600', 'text-gray-100');
        }
    }

    /**
     * 更新弹窗中的画质和速度信息
     */
    updateModal(qualityId, data) {
        const modal = document.getElementById('modal');
        if (!modal || modal.classList.contains('hidden')) return;
        
        // 检查是否是当前显示的视频
        const currentVideoId = modal.getAttribute('data-current-video-id');
        if (currentVideoId && currentVideoId !== qualityId) return;
        
        // 更新画质标签
        const qualityTag = modal.querySelector('[data-field="quality-tag"]');
        if (qualityTag) {
            qualityTag.textContent = data.quality;
            this.setModalQualityColor(qualityTag, data.quality);
        }
        
        // 更新速度标签
        const speedTag = modal.querySelector('[data-field="speed-tag"]');
        if (speedTag) {
            if (data.loadSpeed) {
                speedTag.textContent = data.loadSpeed;
                speedTag.classList.remove('hidden');
                speedTag.style.backgroundColor = '#16a34a';
            } else {
                speedTag.classList.add('hidden');
            }
        }
        
        console.log(`✅ 更新弹窗信息: ${qualityId} -> ${data.quality}, 速度: ${data.loadSpeed || '无'}`);
    }

    /**
     * 设置弹窗画质标签颜色
     */
    setModalQualityColor(tag, quality) {
        const qualityLower = quality.toLowerCase();
        
        if (qualityLower.includes('4k')) {
            tag.style.backgroundColor = '#f59e0b';
        } else if (qualityLower.includes('2k') || qualityLower.includes('1080')) {
            tag.style.backgroundColor = '#7c3aed';
        } else if (qualityLower.includes('720')) {
            tag.style.backgroundColor = '#2563eb';
        } else if (qualityLower.includes('480')) {
            tag.style.backgroundColor = '#10b981';
        } else {
            tag.style.backgroundColor = '#6b7280';
        }
    }

    /**
     * 同步到全局状态
     */
    syncToGlobalState(qualityId, data) {
        // 更新AppState中的videoDataMap
        if (window.AppState) {
            const videoDataMap = window.AppState.get('videoDataMap') || new Map();
            const existingData = videoDataMap.get(qualityId);
            
            if (existingData) {
                existingData.quality = data.quality;
                existingData.loadSpeed = data.loadSpeed;
                existingData.pingTime = data.pingTime;
                videoDataMap.set(qualityId, existingData);
                window.AppState.set('videoDataMap', videoDataMap);
            }
        }
    }

    /**
     * 检测视频画质和速度
     */
    async detectQuality(qualityId, m3u8Url) {
        // 防止重复检测
        if (this.detectionQueue.has(qualityId)) {
            console.log(`⚠️ 跳过重复检测: ${qualityId}`);
            return;
        }
        
        this.detectionQueue.add(qualityId);
        
        try {
            console.log(`🔍 开始检测: ${qualityId}`);
            
            const result = await this.performDetection(m3u8Url);
            this.setQualityInfo(qualityId, result);
            
        } catch (error) {
            console.warn(`检测失败: ${qualityId}`, error);
            this.setQualityInfo(qualityId, {
                quality: '检测失败',
                loadSpeed: null,
                pingTime: -1
            });
        } finally {
            this.detectionQueue.delete(qualityId);
        }
    }

    async performDetection(m3u8Url) {
        return await comprehensiveQualityCheck(m3u8Url);
    }
    /**
     * 从URL关键词检测画质
     */
    detectFromKeywords(url) {
        if (!url) return null;
        
        const qualityPatterns = {
            '4K': [/4k/i, /2160p/i, /3840x2160/i],
            '2K': [/2k/i, /1440p/i, /2560x1440/i],
            '1080p': [/1080p/i, /fhd/i, /1920x1080/i],
            '720p': [/720p/i, /hd/i, /1280x720/i],
            '480p': [/480p/i, /854x480/i],
            'SD': [/sd/i, /standard/i]
        };
        
        for (const [quality, patterns] of Object.entries(qualityPatterns)) {
            if (patterns.some(pattern => pattern.test(url))) {
                return quality;
            }
        }
        
        return null;
    }

    /**
     * 解析M3U8内容获取画质和速度
     */
    async parseM3u8Content(m3u8Url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const startTime = performance.now();

        try {
            const response = await fetch(m3u8Url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
                }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const text = await response.text();
            const duration = performance.now() - startTime;
            
            // 计算加载速度
            const kb = text.length / 1024;
            const speedKbps = kb / (duration / 1000);
            const loadSpeed = speedKbps >= 1024 
                ? `${(speedKbps / 1024).toFixed(1)} MB/s`
                : `${Math.round(speedKbps)} KB/s`;

            // 解析画质
            let quality = '1080p';
            
            // 查找分辨率信息
            const resolutionMatch = text.match(/RESOLUTION=(\d+)x(\d+)/);
            if (resolutionMatch) {
                const width = parseInt(resolutionMatch[1]);
                if (width >= 3840) quality = '4K';
                else if (width >= 2560) quality = '2K';
                else if (width >= 1920) quality = '1080p';
                else if (width >= 1280) quality = '720p';
                else if (width >= 854) quality = '480p';
                else quality = 'SD';
            }

            return {
                quality,
                loadSpeed,
                pingTime: Math.round(duration)
            };

        } catch (error) {
            throw new Error(`M3U8解析失败: ${error.message}`);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * 批量检测多个视频
     */
    async batchDetect(items) {
        const promises = items.map(item => {
            const qualityId = `${item.source_code}_${item.vod_id}`;
            return this.detectQuality(qualityId, item.vod_play_url);
        });

        await Promise.allSettled(promises);
    }

    /**
     * 按速度排序结果
     */
    sortBySpeed(results) {
        return results.sort((a, b) => {
            const getSpeedValue = (item) => {
                const qualityId = `${item.source_code}_${item.vod_id}`;
                const info = this.getQualityInfo(qualityId);
                
                if (!info.loadSpeed) return 0;
                
                const match = info.loadSpeed.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/i);
                if (match) {
                    const value = parseFloat(match[1]);
                    const unit = match[2].toUpperCase();
                    return unit === 'MB/S' ? value * 1024 : value;
                }
                return 0;
            };

            return getSpeedValue(b) - getSpeedValue(a);
        });
    }
}

// 创建全局实例
const unifiedQualityManager = new UnifiedQualityManager();

// 导出到全局
if (typeof window !== 'undefined') {
    window.unifiedQualityManager = unifiedQualityManager;
    
    // 替换旧的函数
    window.updateQualityBadgeSeamlessly = (qualityId, result) => {
        unifiedQualityManager.setQualityInfo(qualityId, result);
    };
    
    window.getCachedQualityData = (qualityId) => {
        return unifiedQualityManager.getQualityInfo(qualityId);
    };
    
    console.log('✅ 统一画质系统已加载');
}

// 自动初始化
document.addEventListener('DOMContentLoaded', () => {
    unifiedQualityManager.init();
});

// =================================================
//  综合画质检测模块
// =================================================

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
                    loadSpeed: `${Math.round(bandwidth/1000)}kb/s`,
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