// ================================
// 画质和速度显示系统修复
// 解决画质显示混乱和速度标签问题
// ================================

/**
 * 修复后的弹窗画质和速度更新函数
 */
function updateModalQualityInfoFixed(qualityId, result) {
    const modal = document.getElementById('modal');
    if (modal && !modal.classList.contains('hidden')) {
        // 检查是否是当前显示的视频
        const currentVideoId = modal.getAttribute('data-current-video-id');
        if (currentVideoId && currentVideoId !== qualityId) {
            console.log(`⚠️ 弹窗显示的不是当前视频: ${currentVideoId} ≠ ${qualityId}`);
            return; // 不更新不相关的弹窗
        }

        const modalQualityTag = modal.querySelector('[data-field="quality-tag"]');
        const modalSpeedTag = modal.querySelector('[data-field="speed-tag"]');
        const newQuality = result.quality;

        if (modalQualityTag) {
            // 更新画质
            modalQualityTag.textContent = newQuality;

            // 更新画质颜色
            const qualityLower = newQuality.toLowerCase();
            if (qualityLower.includes('4k')) {
                modalQualityTag.style.backgroundColor = '#4f46e5';
            } else if (qualityLower.includes('1080')) {
                modalQualityTag.style.backgroundColor = '#7c3aed';
            } else if (qualityLower.includes('720')) {
                modalQualityTag.style.backgroundColor = '#2563eb';
            } else if (newQuality === '高清') {
                modalQualityTag.style.backgroundColor = '#10b981';
            } else {
                modalQualityTag.style.backgroundColor = '#6b7280';
            }

            // 【修复】只显示真实的速度数据，格式如 128KB/s
            if (modalSpeedTag) {
                const loadSpeed = result.loadSpeed;
                // 严格匹配速度格式：数字+单位（KB/s或MB/s）
                const isRealSpeed = loadSpeed && loadSpeed.match(/^\d+(\.\d+)?\s*(KB\/s|MB\/s)$/i);

                if (isRealSpeed) {
                    modalSpeedTag.textContent = loadSpeed;
                    modalSpeedTag.classList.remove('hidden');
                    modalSpeedTag.style.backgroundColor = '#16a34a';
                    console.log('✅ 显示速度标签:', loadSpeed);
                } else {
                    // 隐藏速度标签，不显示任何非速度信息
                    modalSpeedTag.classList.add('hidden');
                    console.log('⚠️ 隐藏非速度信息:', loadSpeed);
                }
            }
            console.log('✅ 已同步更新弹窗画质及速度信息:', qualityId, newQuality, result.loadSpeed);
        }
    }
}

/**
 * 修复后的画质检测结果处理函数
 * 清理所有非速度的杂七杂八信息
 */
function cleanQualityResult(result) {
    const cleanedResult = { ...result };
    
    // 清理loadSpeed字段，只保留真实的速度数据
    if (cleanedResult.loadSpeed) {
        const speedMatch = cleanedResult.loadSpeed.match(/^\d+(\.\d+)?\s*(KB\/s|MB\/s)$/i);
        if (!speedMatch) {
            // 如果不是真实速度格式，清空该字段
            cleanedResult.loadSpeed = null;
            console.log('🧹 清理非速度信息:', result.loadSpeed);
        }
    }
    
    return cleanedResult;
}

/**
 * 修复后的统一画质更新函数
 */
function updateQualityBadgeSeamlesslyFixed(qualityId, result) {
    // 清理结果中的非速度信息
    const cleanedResult = cleanQualityResult(result);
    
    console.log('🔄 开始更新画质标签:', qualityId, cleanedResult);
    
    const newQuality = cleanedResult.quality;
    const newSpeed = cleanedResult.loadSpeed;
    const newPingTime = cleanedResult.pingTime;

    // 1. 更新结果卡片中的画质标签
    updateResultCardBadges(qualityId, newQuality);

    // 2. 更新弹窗中的画质和速度信息（使用修复后的函数）
    updateModalQualityInfoFixed(qualityId, cleanedResult);

    // 3. 同步更新所有缓存系统
    updateAllCacheSystemsFixed(qualityId, cleanedResult);

    console.log('✅ 画质标签更新完成:', qualityId, newQuality);
}

/**
 * 修复后的缓存系统更新函数
 */
function updateAllCacheSystemsFixed(qualityId, result) {
    // 更新qualityCache
    if (typeof window.qualityCache !== 'undefined') {
        window.qualityCache.set(qualityId, result);
    }

    // 更新videoDataMap
    const videoDataMap = window.AppState?.get('videoDataMap') || new Map();
    const existingData = videoDataMap.get(qualityId);
    if (existingData) {
        existingData.quality = result.quality;
        existingData.loadSpeed = result.loadSpeed;
        existingData.pingTime = result.pingTime;
        videoDataMap.set(qualityId, existingData);
        
        if (window.AppState) {
            window.AppState.set('videoDataMap', videoDataMap);
        }
        
        // 同步到sessionStorage
        try {
            sessionStorage.setItem('videoDataCache', JSON.stringify(Array.from(videoDataMap.entries())));
        } catch (e) {
            console.warn('更新sessionStorage失败:', e);
        }
    }

    console.log(`✅ 已同步更新所有缓存系统: ${qualityId}`);
}

/**
 * 修复后的搜索结果排序函数
 * 只按加载速度排序，移除权重等复杂逻辑
 */
function sortResultsBySpeedOnly(results) {
    return results.sort((a, b) => {
        const getSpeedValue = (loadSpeed) => {
            if (!loadSpeed) return 0;
            const match = loadSpeed.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/i);
            if (match) {
                const value = parseFloat(match[1]);
                const unit = match[2].toUpperCase();
                return unit === 'MB/S' ? value * 1024 : value;
            }
            return 0;
        };

        return getSpeedValue(b.loadSpeed) - getSpeedValue(a.loadSpeed);
    });
}

// 替换原有函数
if (typeof window !== 'undefined') {
    // 备份原函数
    window._originalUpdateModalQualityInfo = window.updateModalQualityInfo;
    window._originalUpdateQualityBadgeSeamlessly = window.updateQualityBadgeSeamlessly;
    
    // 使用修复后的函数
    window.updateModalQualityInfo = updateModalQualityInfoFixed;
    window.updateQualityBadgeSeamlessly = updateQualityBadgeSeamlesslyFixed;
    window.sortResultsBySpeedOnly = sortResultsBySpeedOnly;
    window.cleanQualityResult = cleanQualityResult;
    
    console.log('✅ 画质和速度显示系统修复已加载');
}