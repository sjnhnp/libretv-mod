// ================================
// 无感画质检测系统初始化
// ================================

/**
 * 初始化无感画质检测系统
 */
function initQualitySystem() {
    console.log('🚀 初始化无感画质检测系统...');
    
    // Phase 1: 确保预测器可用
    if (typeof window.predictQualityInstantly === 'function') {
        console.log('✅ Phase 1: 快速预测系统已就绪');
    } else {
        console.warn('⚠️ Phase 1: 快速预测系统未加载');
    }
    
    // Phase 2: 确保缓存和渐进式检测可用
    if (typeof window.qualityCache !== 'undefined' && typeof window.progressiveDetector !== 'undefined') {
        console.log('✅ Phase 2: 缓存和渐进式检测系统已就绪');
        
        // 清理过期缓存
        window.qualityCache.cleanup();
    } else {
        console.warn('⚠️ Phase 2: 缓存和渐进式检测系统未加载');
    }
    
    // Phase 3: 确保智能分析可用
    if (typeof window.behaviorAnalyzer !== 'undefined' && typeof window.intelligentPredictor !== 'undefined') {
        console.log('✅ Phase 3: 智能分析系统已就绪');
    } else {
        console.warn('⚠️ Phase 3: 智能分析系统未加载');
    }
    
    // 设置定期清理任务
    setupMaintenanceTasks();
    
    console.log('🎉 无感画质检测系统初始化完成');
}

/**
 * 设置维护任务
 */
function setupMaintenanceTasks() {
    // 每小时清理一次过期缓存
    setInterval(() => {
        if (window.qualityCache) {
            window.qualityCache.cleanup();
        }
    }, 60 * 60 * 1000);
    
    // 每天保存一次用户行为数据
    setInterval(() => {
        if (window.behaviorAnalyzer) {
            window.behaviorAnalyzer.saveBehaviorData();
        }
    }, 24 * 60 * 60 * 1000);
}

/**
 * 获取系统状态
 */
function getQualitySystemStatus() {
    return {
        phase1: typeof window.predictQualityInstantly === 'function',
        phase2: typeof window.qualityCache !== 'undefined' && typeof window.progressiveDetector !== 'undefined',
        phase3: typeof window.behaviorAnalyzer !== 'undefined' && typeof window.intelligentPredictor !== 'undefined',
        cacheSize: window.qualityCache ? Object.keys(JSON.parse(localStorage.getItem('qualityCache') || '{}')).length : 0,
        behaviorHistory: window.behaviorAnalyzer ? window.behaviorAnalyzer.clickHistory.length : 0
    };
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化，确保所有脚本都已加载
    setTimeout(initQualitySystem, 100);
});

// 导出函数
if (typeof window !== 'undefined') {
    window.initQualitySystem = initQualitySystem;
    window.getQualitySystemStatus = getQualitySystemStatus;
}