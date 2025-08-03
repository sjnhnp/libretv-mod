# 播放页搜索弹窗改进设计文档

## 概述

本设计文档详细说明了播放页搜索弹窗的样式精致化、画质标签功能实现、弹窗关闭逻辑统一以及返回按钮逻辑修复的技术实现方案。

## 架构

### 组件结构
- **搜索弹窗组件**: 负责搜索界面的显示和交互
- **搜索结果卡片组件**: 负责搜索结果的展示和画质标签功能
- **画质检测模块**: 负责视频画质的检测和重测
- **状态管理模块**: 负责搜索状态和返回逻辑的管理

### 数据流
1. 用户输入搜索关键词 → 执行搜索 → 渲染搜索结果
2. 搜索结果渲染 → 触发画质检测 → 更新画质标签
3. 用户交互 → 状态更新 → 界面响应

## 组件和接口

### 1. 搜索弹窗样式改进

#### CSS样式调整
```css
/* 搜索弹窗标题样式精致化 */
#searchPanelTitle {
    font-size: 1.5rem; /* 从3xl(1.875rem)减小到1.5rem */
    font-weight: 600;
    margin-bottom: 1.5rem; /* 减小底部间距 */
}

/* 搜索历史标签容器样式优化 */
#recentSearches {
    margin-top: 1rem; /* 从1.5rem减小到1rem */
    gap: 0.5rem; /* 减小标签间距 */
}

/* 搜索历史标签样式精致化 */
.search-tag {
    padding: 0.375rem 0.75rem; /* 减小内边距 */
    font-size: 0.875rem; /* 减小字体大小 */
    border-radius: 0.5rem; /* 调整圆角 */
}
```

### 2. 画质标签功能实现

#### 模板修改
将播放页搜索结果模板中的详情按钮替换为画质标签：

```html
<!-- 原有详情按钮 -->
<button class="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
        data-action="show-detail">
    详情
</button>

<!-- 替换为画质标签 -->
<span class="quality-tag text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-gray-500 text-gray-300 cursor-pointer transition-colors hover:bg-opacity-30"
      data-field="quality-tag"
      data-action="retest-quality"
      title="点击重新检测画质">
    检测中...
</span>
```

#### JavaScript功能实现
```javascript
// 画质标签点击处理
function handleQualityTagClick(element, item) {
    const currentQuality = element.textContent;
    
    // 如果是未知或检测失败，允许重测
    if (currentQuality === '未知' || currentQuality === '检测失败' || currentQuality === '检测中...') {
        element.textContent = '检测中...';
        element.className = 'quality-tag text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-yellow-500 text-yellow-300 cursor-pointer';
        
        // 执行画质重测
        retestVideoQuality(item).then(quality => {
            updateQualityTag(element, quality);
        });
    }
}

// 更新画质标签显示
function updateQualityTag(element, quality) {
    element.textContent = quality;
    
    // 根据画质设置不同颜色
    const qualityColors = {
        '超清': 'bg-green-500 text-green-300',
        '高清': 'bg-blue-500 text-blue-300',
        '标清': 'bg-yellow-500 text-yellow-300',
        '未知': 'bg-gray-500 text-gray-300',
        '检测失败': 'bg-red-500 text-red-300'
    };
    
    const colorClass = qualityColors[quality] || qualityColors['未知'];
    element.className = `quality-tag text-xs py-0.5 px-1.5 rounded bg-opacity-20 ${colorClass} cursor-pointer transition-colors hover:bg-opacity-30`;
}
```

### 3. 弹窗关闭逻辑统一

#### 状态管理
```javascript
// 添加搜索状态跟踪
const PlayerSearchState = {
    isFromSearch: false,
    searchQuery: '',
    searchResults: []
};

// 统一的弹窗关闭处理
function closePlayerModal() {
    if (typeof closeModal === 'function') {
        closeModal();
    }
    
    // 如果是从搜索结果打开的，返回搜索结果
    if (PlayerSearchState.isFromSearch) {
        openPlayerSearch();
    }
}

// 修改搜索结果点击处理
function handlePlayerSearchResultClick(item) {
    PlayerSearchState.isFromSearch = true;
    showPlayerVideoDetail(item);
}
```

### 4. 返回按钮逻辑修复

#### 搜索状态保存
```javascript
// 在播放页搜索时保存状态到sessionStorage
function performPlayerSearch(query) {
    // 保存播放页搜索状态
    sessionStorage.setItem('playerSearchPerformed', 'true');
    sessionStorage.setItem('playerSearchQuery', query);
    
    // 执行搜索逻辑...
}

// 修改返回按钮处理逻辑
function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', () => {
            const playerSearchPerformed = sessionStorage.getItem('playerSearchPerformed');
            
            if (playerSearchPerformed === 'true') {
                // 清除播放页搜索状态
                sessionStorage.removeItem('playerSearchPerformed');
                sessionStorage.removeItem('playerSearchQuery');
                
                // 保持首页搜索结果状态
                const homeSearchQuery = sessionStorage.getItem('searchQuery');
                const homeSearchResults = sessionStorage.getItem('searchResults');
                
                if (homeSearchQuery && homeSearchResults) {
                    // 回到首页并恢复搜索状态
                    window.location.href = `index.html?restore_search=true`;
                } else {
                    window.location.href = 'index.html';
                }
            } else {
                window.location.href = 'index.html';
            }
        });
    }
}
```

## 数据模型

### 搜索状态模型
```javascript
const SearchState = {
    // 播放页搜索状态
    playerSearch: {
        isActive: false,
        query: '',
        results: []
    },
    
    // 首页搜索状态
    homeSearch: {
        query: '',
        results: [],
        selectedAPIs: []
    },
    
    // 弹窗状态
    modal: {
        isFromSearch: false,
        currentItem: null
    }
};
```

### 画质检测模型
```javascript
const QualityInfo = {
    quality: 'string', // '超清', '高清', '标清', '未知', '检测中...', '检测失败'
    detectionMethod: 'string', // 'auto', 'manual', 'failed'
    lastUpdated: 'timestamp'
};
```

## 错误处理

### 画质检测错误处理
- 网络错误：显示"检测失败"，允许重试
- 超时错误：显示"检测超时"，允许重试
- 解析错误：显示"未知"，允许重试

### 状态恢复错误处理
- sessionStorage不可用：降级到普通返回逻辑
- 数据损坏：清除错误数据，使用默认行为

## 测试策略

### 单元测试
- 画质标签点击处理函数
- 搜索状态管理函数
- 返回逻辑处理函数

### 集成测试
- 搜索 → 查看详情 → 关闭弹窗流程
- 播放页搜索 → 返回首页流程
- 画质检测 → 重测流程

### 用户体验测试
- 搜索弹窗样式美观度测试
- 交互流程顺畅度测试
- 响应式布局适配测试