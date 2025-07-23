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
            sessionStorage.removeItem('videoDataCache');
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

    /**
     * 执行实际的画质检测
     */
    async performDetection(m3u8Url) {
        // 1. 先尝试URL关键词识别（最快）
        const keywordResult = this.detectFromKeywords(m3u8Url);
        if (keywordResult) {
            return {
                quality: keywordResult,
                loadSpeed: null,
                pingTime: 0
            };
        }

        // 2. 尝试M3U8内容解析
        try {
            const m3u8Result = await this.parseM3u8Content(m3u8Url);
            if (m3u8Result.quality !== '未知') {
                return m3u8Result;
            }
        } catch (error) {
            console.warn('M3U8解析失败:', error);
        }

        // 3. 默认返回
        return {
            quality: '1080p',
            loadSpeed: null,
            pingTime: 0
        };
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