// UI相关功能模块

// 显示Toast消息
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;

    const bgColors = {
        'error': 'bg-red-500',
        'success': 'bg-green-500', 
        'info': 'bg-blue-500',
        'warning': 'bg-yellow-500'
    };
    const bgColor = bgColors[type] || bgColors.info;

    toast.className = `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${bgColor} text-white z-[2147483647] pointer-events-none`;
    toastMessage.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// 显示历史记录面板
function showHistoryPanel() {
    showToast('历史记录功能正在开发中', 'info');
    
    // 创建历史记录面板
    const historyPanel = document.createElement('div');
    historyPanel.id = 'historyPanel';
    historyPanel.className = 'panel-overlay';
    
    historyPanel.innerHTML = `
        <div class="panel-container">
            <div class="panel-header">
                <h2 class="panel-title">观看历史</h2>
                <button class="panel-close-btn" id="closeHistoryBtn">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            <div class="panel-content">
                <p class="text-center text-gray-400 py-10">历史记录功能正在开发中...</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(historyPanel);
    
    // 添加关闭按钮事件
    const closeBtn = document.getElementById('closeHistoryBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(historyPanel);
        });
    }
    
    // 点击面板外部关闭
    historyPanel.addEventListener('click', (e) => {
        if (e.target === historyPanel) {
            document.body.removeChild(historyPanel);
        }
    });
}

// 显示设置面板
function showSettingsPanel() {
    showToast('设置面板功能正在开发中', 'info');
    
    // 创建设置面板
    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'settingsPanel';
    settingsPanel.className = 'panel-overlay';
    
    settingsPanel.innerHTML = `
        <div class="panel-container">
            <div class="panel-header">
                <h2 class="panel-title">设置</h2>
                <button class="panel-close-btn" id="closeSettingsBtn">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            <div class="panel-content">
                <div class="settings-group">
                    <h3 class="settings-group-title">播放设置</h3>
                    <div class="settings-item">
                        <label class="settings-label">
                            <span>自动播放下一集</span>
                            <input type="checkbox" id="autoplayToggle" class="toggle-switch" checked>
                        </label>
                    </div>
                    <div class="settings-item">
                        <label class="settings-label">
                            <span>广告过滤</span>
                            <input type="checkbox" id="adFilterToggle" class="toggle-switch">
                        </label>
                    </div>
                </div>
                
                <div class="settings-group">
                    <h3 class="settings-group-title">API源设置</h3>
                    <div id="apiSources" class="settings-api-list">
                        <p class="text-center text-gray-400 py-4">API源设置功能正在开发中...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(settingsPanel);
    
    // 添加关闭按钮事件
    const closeBtn = document.getElementById('closeSettingsBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(settingsPanel);
        });
    }
    
    // 点击面板外部关闭
    settingsPanel.addEventListener('click', (e) => {
        if (e.target === settingsPanel) {
            document.body.removeChild(settingsPanel);
        }
    });
    
    // 初始化开关状态
    const autoplayToggle = document.getElementById('autoplayToggle');
    if (autoplayToggle) {
        autoplayToggle.checked = window.autoplayEnabled !== false;
        autoplayToggle.addEventListener('change', (e) => {
            window.autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', window.autoplayEnabled.toString());
            showToast(`自动播放已${window.autoplayEnabled ? '启用' : '禁用'}`, 'info');
        });
    }
    
    const adFilterToggle = document.getElementById('adFilterToggle');
    if (adFilterToggle) {
        adFilterToggle.checked = window.adFilteringEnabled === true;
        adFilterToggle.addEventListener('change', (e) => {
            window.adFilteringEnabled = e.target.checked;
            localStorage.setItem('adFilteringEnabled', window.adFilteringEnabled.toString());
            showToast(`广告过滤已${window.adFilteringEnabled ? '启用' : '禁用'}`, 'info');
        });
    }
}

// 导出函数
window.showHistoryPanel = showHistoryPanel;
window.showSettingsPanel = showSettingsPanel;