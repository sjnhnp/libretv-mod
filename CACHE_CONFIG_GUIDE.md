# 缓存配置指南

## 配置文件位置
所有缓存时间配置都统一在 `js/config.js` 文件中管理。

## 缓存配置说明

### 1. 画质缓存时间
```javascript
QUALITY_EXPIRE_TIME: 15 * 24 * 60 * 60 * 1000, // 15天
```
- **推荐范围**: 7-30天
- **说明**: 画质信息相对稳定，可以设置较长时间

### 2. 速度缓存时间
```javascript
SPEED_EXPIRE_TIME: 2 * 60 * 60 * 1000, // 2小时
```
- **推荐范围**: 30分钟-4小时
- **说明**: 网络速度变化较快，需要较短的缓存时间

### 3. 搜索结果缓存时间
```javascript
EXPIRE_TIME: 7 * 24 * 60 * 60 * 1000 // 7天
```
- **推荐范围**: 3-14天
- **说明**: 搜索结果包含基本视频信息，变化不频繁

## 快速修改示例

### 修改为更保守的设置
```javascript
const QUALITY_CACHE_CONFIG = {
    QUALITY_EXPIRE_TIME: 7 * 24 * 60 * 60 * 1000,  // 7天画质缓存
    SPEED_EXPIRE_TIME: 1 * 60 * 60 * 1000,         // 1小时速度缓存
};

const SEARCH_CACHE_CONFIG = {
    EXPIRE_TIME: 3 * 24 * 60 * 60 * 1000 // 3天搜索缓存
};
```

### 修改为更激进的设置
```javascript
const QUALITY_CACHE_CONFIG = {
    QUALITY_EXPIRE_TIME: 30 * 24 * 60 * 60 * 1000, // 30天画质缓存
    SPEED_EXPIRE_TIME: 4 * 60 * 60 * 1000,         // 4小时速度缓存
};

const SEARCH_CACHE_CONFIG = {
    EXPIRE_TIME: 14 * 24 * 60 * 60 * 1000 // 14天搜索缓存
};
```

## 时间单位换算
- 1分钟 = `60 * 1000`
- 1小时 = `60 * 60 * 1000`
- 1天 = `24 * 60 * 60 * 1000`

## 调试工具
在浏览器控制台中使用：
```javascript
// 查看当前缓存配置
window.qualityCacheDebug.getCacheTimeConfig()

// 查看缓存统计
window.qualityCacheDebug.getStats()

// 清空所有缓存
window.qualityCacheDebug.clearAll()
```

## 注意事项
1. 修改配置后需要刷新页面才能生效
2. 缓存时间过短会增加检测频率，影响性能
3. 缓存时间过长可能导致信息不够及时
4. 建议根据实际使用情况调整配置