// ================================
// 画质预测模块 - Phase 1: 立即反馈
// ================================

/**
 * 快速预测画质 - 基于URL和源信息的即时分析
 * @param {string} url - 视频URL
 * @param {string} source - 数据源名称
 * @param {Object} item - 完整的视频项信息
 * @returns {Object} 预测结果
 */
function predictQualityInstantly(url, source, item = {}) {
    // 1. URL关键词快速识别
    const urlQuality = analyzeUrlKeywords(url);
    if (urlQuality) {
        return {
            quality: urlQuality,
            confidence: 'high',
            method: 'url_keyword',
            status: 'predicted'
        };
    }
    
    // 2. 基于源的历史模式预测
    const sourcePattern = getSourceQualityPattern(source);
    if (sourcePattern) {
        return {
            quality: sourcePattern.mostCommon,
            confidence: 'medium',
            method: 'source_pattern',
            status: 'predicted'
        };
    }
    
    // 3. 基于视频信息的智能推断
    const infoQuality = analyzeVideoInfo(item);
    if (infoQuality) {
        return {
            quality: infoQuality,
            confidence: 'medium',
            method: 'info_analysis',
            status: 'predicted'
        };
    }
    
    // 4. 默认预测（现代视频流通常是高清）
    return {
        quality: '高清',
        confidence: 'low',
        method: 'default',
        status: 'predicted'
    };
}

/**
 * URL关键词分析
 */
function analyzeUrlKeywords(url) {
    if (!url) return null;
    
    const qualityPatterns = {
        '4K': [/4k/i, /2160p/i, /3840x2160/i, /uhd/i],
        '2K': [/2k/i, /1440p/i, /2560x1440/i, /qhd/i],
        '1080p': [/1080p/i, /fhd/i, /fullhd/i, /1920x1080/i, /full.*hd/i],
        '720p': [/720p/i, /hd/i, /1280x720/i],
        '480p': [/480p/i, /854x480/i, /sd/i],
    };
    
    for (const [quality, patterns] of Object.entries(qualityPatterns)) {
        if (patterns.some(pattern => pattern.test(url))) {
            return quality;
        }
    }
    
    return null;
}

/**
 * 获取源的画质模式
 */
function getSourceQualityPattern(source) {
    const patterns = getStoredSourcePatterns();
    return patterns[source] || null;
}

/**
 * 基于视频信息分析
 */
function analyzeVideoInfo(item) {
    // 基于年份推断（新片通常画质更好）
    const year = parseInt(item.vod_year);
    if (year >= 2020) return '1080p';
    if (year >= 2015) return '720p';
    if (year >= 2010) return '480p';
    
    // 基于类型推断
    const type = item.type_name || '';
    if (/电影|剧集|综艺/.test(type)) return '1080p';
    if (/动漫|纪录片/.test(type)) return '720p';
    
    return null;
}

/**
 * 获取存储的源模式数据
 */
function getStoredSourcePatterns() {
    try {
        return JSON.parse(localStorage.getItem('sourceQualityPatterns') || '{}');
    } catch (e) {
        return {};
    }
}

/**
 * 学习并存储源的画质模式
 */
function learnSourcePattern(source, quality) {
    try {
        const patterns = getStoredSourcePatterns();
        if (!patterns[source]) {
            patterns[source] = { qualities: {}, total: 0, mostCommon: null };
        }
        
        const sourcePattern = patterns[source];
        sourcePattern.qualities[quality] = (sourcePattern.qualities[quality] || 0) + 1;
        sourcePattern.total += 1;
        
        // 更新最常见的画质
        let maxCount = 0;
        let mostCommon = null;
        for (const [q, count] of Object.entries(sourcePattern.qualities)) {
            if (count > maxCount) {
                maxCount = count;
                mostCommon = q;
            }
        }
        sourcePattern.mostCommon = mostCommon;
        
        localStorage.setItem('sourceQualityPatterns', JSON.stringify(patterns));
    } catch (e) {
        console.warn('学习源模式失败:', e);
    }
}

// 导出函数
if (typeof window !== 'undefined') {
    window.predictQualityInstantly = predictQualityInstantly;
    window.learnSourcePattern = learnSourcePattern;
}