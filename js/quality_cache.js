// ================================
// 画质缓存模块 - Phase 2: 体验优化
// ================================

/**
 * 画质缓存管理器
 */
class QualityCache {
    constructor() {
        this.cacheKey = 'qualityCache';
        this.maxCacheSize = 1000;
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24小时
    }

    /**
     * 获取缓存的画质信息
     */
    get(url) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
            const item = cache[url];

            if (!item) return null;

            // 检查是否过期
            if (Date.now() - item.timestamp > this.cacheExpiry) {
                this.remove(url);
                return null;
            }

            return item.data;
        } catch (e) {
            console.warn('读取画质缓存失败:', e);
            return null;
        }
    }

    /**
     * 设置缓存
     */
    set(url, qualityData) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');

            // 清理过期缓存
            this.cleanup(cache);

            // 如果缓存太大，删除最旧的项
            const keys = Object.keys(cache);
            if (keys.length >= this.maxCacheSize) {
                const oldestKey = keys.reduce((oldest, key) =>
                    cache[key].timestamp < cache[oldest].timestamp ? key : oldest
                );
                delete cache[oldestKey];
            }

            cache[url] = {
                data: qualityData,
                timestamp: Date.now()
            };

            localStorage.setItem(this.cacheKey, JSON.stringify(cache));
        } catch (e) {
            console.warn('设置画质缓存失败:', e);
        }
    }

    /**
     * 删除缓存项
     */
    remove(url) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
            delete cache[url];
            localStorage.setItem(this.cacheKey, JSON.stringify(cache));
        } catch (e) {
            console.warn('删除画质缓存失败:', e);
        }
    }

    /**
     * 清理过期缓存
     */
    cleanup(cache = null) {
        try {
            if (!cache) {
                cache = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
            }

            const now = Date.now();
            let hasChanges = false;

            for (const [url, item] of Object.entries(cache)) {
                if (now - item.timestamp > this.cacheExpiry) {
                    delete cache[url];
                    hasChanges = true;
                }
            }

            if (hasChanges) {
                localStorage.setItem(this.cacheKey, JSON.stringify(cache));
            }
        } catch (e) {
            console.warn('清理画质缓存失败:', e);
        }
    }

    /**
     * 清空所有缓存
     */
    clear() {
        try {
            localStorage.removeItem(this.cacheKey);
        } catch (e) {
            console.warn('清空画质缓存失败:', e);
        }
    }
}

/**
 * 渐进式检测管理器
 */
class ProgressiveDetector {
    constructor() {
        this.detectionQueue = [];
        this.isProcessing = false;
        this.maxConcurrent = 3;
        this.currentDetections = 0;
        this.observer = null;
        this.setupIntersectionObserver();
    }

    /**
     * 添加检测任务到队列
     */
    addToQueue(item, priority = 'normal') {
        const task = {
            id: `${item.source_code}_${item.vod_id}`,
            item,
            priority,
            timestamp: Date.now()
        };

        // 避免重复添加
        if (this.detectionQueue.find(t => t.id === task.id)) {
            return;
        }

        if (priority === 'high') {
            this.detectionQueue.unshift(task);
        } else {
            this.detectionQueue.push(task);
        }

        this.processQueue();
    }

    /**
     * 处理检测队列
     */
    async processQueue() {
        if (this.isProcessing || this.currentDetections >= this.maxConcurrent) {
            return;
        }

        this.isProcessing = true;

        while (this.detectionQueue.length > 0 && this.currentDetections < this.maxConcurrent) {
            const task = this.detectionQueue.shift();
            this.processTask(task);
        }

        this.isProcessing = false;
    }

    /**
     * 处理单个检测任务
     */
    async processTask(task) {
        this.currentDetections++;

        try {
            // 检查是否已有缓存
            const cached = qualityCache.get(task.item.vod_play_url);
            if (cached) {
                this.updateUI(task.id, cached);
                return;
            }

            // 执行实际检测
            const result = await window.comprehensiveQualityCheck(task.item.vod_play_url);

            // 缓存结果
            qualityCache.set(task.item.vod_play_url, result);

            // 学习源模式
            if (typeof window.learnSourcePattern === 'function') {
                window.learnSourcePattern(task.item.source_name, result.quality);
            }

            // 更新UI
            this.updateUI(task.id, result);

        } catch (error) {
            console.warn('画质检测失败:', error);
            this.updateUI(task.id, { quality: '检测失败', loadSpeed: '检测失败' });
        } finally {
            this.currentDetections--;
            // 继续处理队列
            setTimeout(() => this.processQueue(), 100);
        }
    }

    /**
     * 更新UI显示
     */
    updateUI(qualityId, result) {
        // 【修复】直接调用全局UI更新函数，并传递完整的 result 对象，而不仅仅是 quality 字符串。
        if (typeof window.updateQualityBadgeSeamlessly === 'function') {
            window.updateQualityBadgeSeamlessly(qualityId, result);
        } else {
            console.warn('⚠️ window.updateQualityBadgeSeamlessly function not found. UI will not be updated live.');
        }

        // 同步更新videoDataMap，确保弹窗显示最新数据
        if (typeof window.AppState !== 'undefined') {
            const videoDataMap = window.AppState.get('videoDataMap');
            if (videoDataMap) {
                const videoData = videoDataMap.get(qualityId);
                if (videoData) {
                    // 更新缓存中的画质信息
                    videoData.quality = result.quality;
                    videoData.loadSpeed = result.loadSpeed;
                    videoData.pingTime = result.pingTime;

                    // 保存更新后的数据
                    videoDataMap.set(qualityId, videoData);
                    window.AppState.set('videoDataMap', videoDataMap);

                    // 同步到sessionStorage
                    try {
                        sessionStorage.setItem('videoDataCache', JSON.stringify(Array.from(videoDataMap.entries())));
                    } catch (e) {
                        console.warn('更新videoDataCache失败:', e);
                    }

                    // 同时调用统一的缓存保存函数
                    if (typeof window.saveQualityCache === 'function') {
                        window.saveQualityCache(qualityId, result.quality, result.loadSpeed, result.pingTime);
                    }

                    console.log('✅ 已同步更新所有缓存系统:', qualityId, result.quality);
                }
            }
        }
    }

    /**
     * 设置交叉观察器（视口检测）
     */
    setupIntersectionObserver() {
        if (!window.IntersectionObserver) return;

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const cardElement = entry.target;
                    const qualityId = cardElement.querySelector('.quality-badge')?.dataset.qualityId;

                    if (qualityId && cardElement.videoData) {
                        // 高优先级检测进入视口的项目
                        this.addToQueue(cardElement.videoData, 'high');

                        // 停止观察已处理的元素
                        this.observer.unobserve(entry.target);
                    }
                }
            });
        }, {
            rootMargin: '100px' // 提前100px开始检测
        });
    }

    /**
     * 观察卡片元素
     */
    observe(cardElement) {
        if (this.observer && cardElement) {
            this.observer.observe(cardElement);
        }
    }
}

// 创建全局实例
const qualityCache = new QualityCache();
const progressiveDetector = new ProgressiveDetector();

// 导出到全局
if (typeof window !== 'undefined') {
    window.qualityCache = qualityCache;
    window.progressiveDetector = progressiveDetector;
}