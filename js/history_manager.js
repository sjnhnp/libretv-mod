// 历史记录管理模块

// 常量定义
const HISTORY_STORAGE_KEY = 'viewingHistory';
const MAX_WATCH_HISTORY_ITEMS = 50; // 最多保存50条历史记录

/**
 * 添加观看历史
 * @param {Object} videoInfo - 视频信息对象
 */
function addToViewingHistory(videoInfo) {
    if (!videoInfo || !videoInfo.title) return;
    
    try {
        // 读取现有历史记录
        let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
        
        // 创建新的历史记录项
        const historyItem = {
            id: videoInfo.vod_id || '',
            title: videoInfo.title,
            cover: videoInfo.vod_pic || '',
            url: videoInfo.url || '',
            episodeIndex: videoInfo.episodeIndex || 0,
            sourceName: videoInfo.sourceName || '',
            sourceCode: videoInfo.sourceCode || '',
            year: videoInfo.year || '',
            type: videoInfo.type_name || '',
            timestamp: Date.now(),
            playbackPosition: 0, // 播放位置，秒
            episodes: videoInfo.episodes || []
        };
        
        // 移除相同视频的旧记录
        history = history.filter(item => 
            !(item.title === historyItem.title && 
              item.sourceCode === historyItem.sourceCode)
        );
        
        // 添加新记录到开头
        history.unshift(historyItem);
        
        // 限制历史记录数量
        if (history.length > MAX_WATCH_HISTORY_ITEMS) {
            history = history.slice(0, MAX_WATCH_HISTORY_ITEMS);
        }
        
        // 保存回本地存储
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
        
        console.log('已添加到观看历史:', historyItem.title);
    } catch (error) {
        console.error('保存观看历史失败:', error);
    }
}

/**
 * 更新视频播放位置
 * @param {string} title - 视频标题
 * @param {string} sourceCode - 视频源代码
 * @param {number} position - 播放位置（秒）
 */
function updatePlaybackPosition(title, sourceCode, position) {
    if (!title || position < 0) return;
    
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
        
        // 查找匹配的历史记录
        const index = history.findIndex(item => 
            item.title === title && 
            item.sourceCode === sourceCode
        );
        
        if (index !== -1) {
            // 更新播放位置
            history[index].playbackPosition = position;
            history[index].timestamp = Date.now(); // 更新时间戳
            
            // 保存回本地存储
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
        }
    } catch (error) {
        console.error('更新播放位置失败:', error);
    }
}

/**
 * 获取所有观看历史
 * @returns {Array} 历史记录数组
 */
function getViewingHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    } catch (error) {
        console.error('读取观看历史失败:', error);
        return [];
    }
}

/**
 * 清除所有观看历史
 */
function clearViewingHistory() {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
}

/**
 * 删除单条观看历史
 * @param {string} title - 视频标题
 * @param {string} sourceCode - 视频源代码
 */
function removeHistoryItem(title, sourceCode) {
    try {
        let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
        
        // 过滤掉要删除的项
        history = history.filter(item => 
            !(item.title === title && item.sourceCode === sourceCode)
        );
        
        // 保存回本地存储
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.error('删除历史记录失败:', error);
    }
}

/**
 * 格式化时间戳为友好显示
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的时间字符串
 */
function formatTimestamp(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    // 小于1分钟
    if (diff < 60000) {
        return '刚刚';
    }
    
    // 小于1小时
    if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}分钟前`;
    }
    
    // 小于1天
    if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}小时前`;
    }
    
    // 小于30天
    if (diff < 2592000000) {
        return `${Math.floor(diff / 86400000)}天前`;
    }
    
    // 大于30天，显示具体日期
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 格式化播放时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的时间字符串 (HH:MM:SS)
 */
function formatPlaybackTime(seconds) {
    if (!seconds || seconds <= 0) return '00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
}

// 导出函数到全局
window.addToViewingHistory = addToViewingHistory;
window.updatePlaybackPosition = updatePlaybackPosition;
window.getViewingHistory = getViewingHistory;
window.clearViewingHistory = clearViewingHistory;
window.removeHistoryItem = removeHistoryItem;
window.formatTimestamp = formatTimestamp;
window.formatPlaybackTime = formatPlaybackTime;