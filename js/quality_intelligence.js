// ================================
// 画质智能化模块 - Phase 3: 智能化
// ================================

/**
 * 用户行为分析器
 */
class UserBehaviorAnalyzer {
    constructor() {
        this.behaviorKey = 'userBehaviorData';
        this.clickHistory = [];
        this.viewHistory = [];
        this.maxHistorySize = 100;
        this.loadBehaviorData();
    }
    
    /**
     * 记录用户点击行为
     */
    recordClick(item) {
        const clickData = {
            timestamp: Date.now(),
            quality: item.quality,
            source: item.source_name,
            type: item.type_name,
            year: item.vod_year,
            title: item.vod_name
        };
        
        this.clickHistory.unshift(clickData);
        if (this.clickHistory.length > this.maxHistorySize) {
            this.clickHistory = this.clickHistory.slice(0, this.maxHistorySize);
        }
        
        this.saveBehaviorData();
        this.updatePreferences();
    }
    
    /**
     * 记录用户浏览行为
     */
    recordView(item, viewTime) {
        const viewData = {
            timestamp: Date.now(),
            quality: item.quality,
            source: item.source_name,
            type: item.type_name,
            viewTime: viewTime
        };
        
        this.viewHistory.unshift(viewData);
        if (this.viewHistory.length > this.maxHistorySize) {
            this.viewHistory = this.viewHistory.slice(0, this.maxHistorySize);
        }
        
        this.saveBehaviorData();
    }
    
    /**
     * 获取用户偏好
     */
    getUserPreferences() {
        return this.preferences || this.calculatePreferences();
    }
    
    /**
     * 计算用户偏好
     */
    calculatePreferences() {
        const preferences = {
            qualityPreference: this.analyzeQualityPreference(),
            sourcePreference: this.analyzeSourcePreference(),
            typePreference: this.analyzeTypePreference(),
            timePreference: this.analyzeTimePreference()
        };
        
        this.preferences = preferences;
        return preferences;
    }
    
    /**
     * 分析画质偏好
     */
    analyzeQualityPreference() {
        const qualityCount = {};
        
        this.clickHistory.forEach(click => {
            if (click.quality) {
                qualityCount[click.quality] = (qualityCount[click.quality] || 0) + 1;
            }
        });
        
        // 按点击次数排序
        const sorted = Object.entries(qualityCount)
            .sort(([,a], [,b]) => b - a)
            .map(([quality]) => quality);
        
        return {
            preferred: sorted[0] || '1080p',
            distribution: qualityCount
        };
    }
    
    /**
     * 分析源偏好
     */
    analyzeSourcePreference() {
        const sourceCount = {};
        
        this.clickHistory.forEach(click => {
            if (click.source) {
                sourceCount[click.source] = (sourceCount[click.source] || 0) + 1;
            }
        });
        
        return Object.entries(sourceCount)
            .sort(([,a], [,b]) => b - a)
            .reduce((acc, [source, count]) => {
                acc[source] = count;
                return acc;
            }, {});
    }
    
    /**
     * 分析类型偏好
     */
    analyzeTypePreference() {
        const typeCount = {};
        
        this.clickHistory.forEach(click => {
            if (click.type) {
                typeCount[click.type] = (typeCount[click.type] || 0) + 1;
            }
        });
        
        return Object.entries(typeCount)
            .sort(([,a], [,b]) => b - a)
            .reduce((acc, [type, count]) => {
                acc[type] = count;
                return acc;
            }, {});
    }
    
    /**
     * 分析时间偏好
     */
    analyzeTimePreference() {
        const now = Date.now();
        const recentClicks = this.clickHistory.filter(click => 
            now - click.timestamp < 7 * 24 * 60 * 60 * 1000 // 最近7天
        );
        
        const hourCount = {};
        recentClicks.forEach(click => {
            const hour = new Date(click.timestamp).getHours();
            hourCount[hour] = (hourCount[hour] || 0) + 1;
        });
        
        return hourCount;
    }
    
    /**
     * 更新偏好设置
     */
    updatePreferences() {
        this.preferences = this.calculatePreferences();
        this.saveBehaviorData();
    }
    
    /**
     * 加载行为数据
     */
    loadBehaviorData() {
        try {
            const data = JSON.parse(localStorage.getItem(this.behaviorKey) || '{}');
            this.clickHistory = data.clickHistory || [];
            this.viewHistory = data.viewHistory || [];
            this.preferences = data.preferences || null;
        } catch (e) {
            console.warn('加载用户行为数据失败:', e);
            this.clickHistory = [];
            this.viewHistory = [];
            this.preferences = null;
        }
    }
    
    /**
     * 保存行为数据
     */
    saveBehaviorData() {
        try {
            const data = {
                clickHistory: this.clickHistory,
                viewHistory: this.viewHistory,
                preferences: this.preferences,
                lastUpdated: Date.now()
            };
            localStorage.setItem(this.behaviorKey, JSON.stringify(data));
        } catch (e) {
            console.warn('保存用户行为数据失败:', e);
        }
    }
}

/**
 * 智能预测器
 */
class IntelligentPredictor {
    constructor(behaviorAnalyzer) {
        this.behaviorAnalyzer = behaviorAnalyzer;
    }
    
    /**
     * 智能预测画质
     */
    predictQuality(item) {
        const preferences = this.behaviorAnalyzer.getUserPreferences();
        
        // 基于用户偏好的权重计算
        let score = 0;
        let predictedQuality = '高清';
        
        // 1. 用户画质偏好权重 (40%)
        const qualityPref = preferences.qualityPreference;
        if (qualityPref.preferred) {
            predictedQuality = qualityPref.preferred;
            score += 0.4;
        }
        
        // 2. 源偏好权重 (20%)
        const sourcePref = preferences.sourcePreference;
        if (sourcePref[item.source_name]) {
            score += 0.2 * (sourcePref[item.source_name] / Math.max(...Object.values(sourcePref)));
        }
        
        // 3. 类型偏好权重 (20%)
        const typePref = preferences.typePreference;
        if (typePref[item.type_name]) {
            score += 0.2 * (typePref[item.type_name] / Math.max(...Object.values(typePref)));
        }
        
        // 4. 时间因素权重 (10%)
        const currentHour = new Date().getHours();
        const timePref = preferences.timePreference;
        if (timePref[currentHour]) {
            score += 0.1 * (timePref[currentHour] / Math.max(...Object.values(timePref)));
        }
        
        // 5. 内容新旧程度权重 (10%)
        const year = parseInt(item.vod_year);
        if (year >= 2020) {
            predictedQuality = this.upgradeQuality(predictedQuality);
            score += 0.1;
        } else if (year < 2010) {
            predictedQuality = this.downgradeQuality(predictedQuality);
        }
        
        return {
            quality: predictedQuality,
            confidence: Math.min(score, 1),
            method: 'intelligent_prediction'
        };
    }
    
    /**
     * 升级画质
     */
    upgradeQuality(quality) {
        const qualityLevels = ['SD', '480p', '720p', '1080p', '2K', '4K'];
        const currentIndex = qualityLevels.indexOf(quality);
        if (currentIndex >= 0 && currentIndex < qualityLevels.length - 1) {
            return qualityLevels[currentIndex + 1];
        }
        return quality;
    }
    
    /**
     * 降级画质
     */
    downgradeQuality(quality) {
        const qualityLevels = ['SD', '480p', '720p', '1080p', '2K', '4K'];
        const currentIndex = qualityLevels.indexOf(quality);
        if (currentIndex > 0) {
            return qualityLevels[currentIndex - 1];
        }
        return quality;
    }
    
    /**
     * 预测用户可能感兴趣的内容
     */
    predictInterest(items) {
        const preferences = this.behaviorAnalyzer.getUserPreferences();
        
        return items.map(item => {
            let interestScore = 0;
            
            // 基于源偏好
            const sourcePref = preferences.sourcePreference;
            if (sourcePref[item.source_name]) {
                interestScore += sourcePref[item.source_name] * 0.3;
            }
            
            // 基于类型偏好
            const typePref = preferences.typePreference;
            if (typePref[item.type_name]) {
                interestScore += typePref[item.type_name] * 0.4;
            }
            
            // 基于年份偏好
            const year = parseInt(item.vod_year);
            const avgYear = this.calculateAverageYear();
            const yearDiff = Math.abs(year - avgYear);
            interestScore += Math.max(0, (10 - yearDiff) / 10) * 0.3;
            
            return {
                ...item,
                interestScore: Math.min(interestScore, 1)
            };
        }).sort((a, b) => b.interestScore - a.interestScore);
    }
    
    /**
     * 计算用户偏好的平均年份
     */
    calculateAverageYear() {
        const years = this.behaviorAnalyzer.clickHistory
            .map(click => parseInt(click.year))
            .filter(year => !isNaN(year));
        
        if (years.length === 0) return new Date().getFullYear();
        
        return Math.round(years.reduce((sum, year) => sum + year, 0) / years.length);
    }
}

// 创建全局实例
const behaviorAnalyzer = new UserBehaviorAnalyzer();
const intelligentPredictor = new IntelligentPredictor(behaviorAnalyzer);

// 导出到全局
if (typeof window !== 'undefined') {
    window.behaviorAnalyzer = behaviorAnalyzer;
    window.intelligentPredictor = intelligentPredictor;
}