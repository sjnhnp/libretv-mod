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
    // 创建历史记录面板
    const historyPanel = document.createElement('div');
    historyPanel.id = 'historyPanel';
    historyPanel.className = 'panel-overlay';
    
    historyPanel.innerHTML = `
        <div class="panel-container">
            <div class="panel-header">
                <h2 class="panel-title">观看历史</h2>
                <div class="panel-header-actions">
                    <button class="panel-action-btn" id="clearHistoryBtn" title="清空历史">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                    <button class="panel-close-btn" id="closeHistoryBtn">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="panel-content" id="historyContent">
                <div class="loading-spinner mx-auto my-10"></div>
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
    
    // 添加清空历史按钮事件
    const clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有观看历史吗？')) {
                window.clearViewingHistory();
                renderHistoryContent();
                showToast('观看历史已清空', 'info');
            }
        });
    }
    
    // 点击面板外部关闭
    historyPanel.addEventListener('click', (e) => {
        if (e.target === historyPanel) {
            document.body.removeChild(historyPanel);
        }
    });
    
    // 渲染历史内容
    renderHistoryContent();
}

// 渲染历史记录内容
function renderHistoryContent() {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    // 获取历史记录
    const history = window.getViewingHistory ? window.getViewingHistory() : [];
    
    if (history.length === 0) {
        historyContent.innerHTML = `
            <div class="empty-history">
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-center text-gray-400">暂无观看历史</p>
            </div>
        `;
        return;
    }
    
    // 创建历史记录列表
    let historyHTML = '<div class="history-list">';
    
    history.forEach(item => {
        const formattedTime = window.formatTimestamp ? window.formatTimestamp(item.timestamp) : '未知时间';
        const playbackTime = window.formatPlaybackTime ? window.formatPlaybackTime(item.playbackPosition) : '00:00';
        
        historyHTML += `
            <div class="history-item" data-title="${item.title}" data-source="${item.sourceCode}">
                <div class="history-item-cover">
                    <img src="${item.cover || ''}" alt="${item.title}" onerror="this.src='images/tv1.png'">
                    ${item.playbackPosition > 0 ? `<div class="playback-badge">${playbackTime}</div>` : ''}
                </div>
                <div class="history-item-info">
                    <h3 class="history-item-title">${item.title}</h3>
                    <div class="history-item-meta">
                        <span class="history-item-source">${item.sourceName || '未知来源'}</span>
                        <span class="history-item-time">${formattedTime}</span>
                    </div>
                    <div class="history-item-episode">
                        ${item.episodeIndex > 0 ? `第 ${item.episodeIndex + 1} 集` : ''}
                    </div>
                </div>
                <div class="history-item-actions">
                    <button class="history-play-btn" onclick="playFromHistory('${item.title}', '${item.sourceCode}', ${item.episodeIndex}, ${item.playbackPosition})">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </button>
                    <button class="history-delete-btn" onclick="removeHistoryItemAndUpdate('${item.title}', '${item.sourceCode}')">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    });
    
    historyHTML += '</div>';
    historyContent.innerHTML = historyHTML;
}

// 从历史记录播放视频
function playFromHistory(title, sourceCode, episodeIndex, position) {
    // 关闭历史面板
    const historyPanel = document.getElementById('historyPanel');
    if (historyPanel) {
        document.body.removeChild(historyPanel);
    }
    
    // 获取历史记录
    const history = window.getViewingHistory ? window.getViewingHistory() : [];
    const historyItem = history.find(item => 
        item.title === title && item.sourceCode === sourceCode
    );
    
    if (!historyItem) {
        showToast('找不到历史记录', 'error');
        return;
    }
    
    // 如果有episodes，设置到全局变量
    if (historyItem.episodes && historyItem.episodes.length > 0) {
        window.currentEpisodes = historyItem.episodes;
    }
    
    // 播放视频
    if (historyItem.url) {
        window.playVideo(
            historyItem.url,
            historyItem.title,
            episodeIndex || 0,
            historyItem.sourceName,
            historyItem.sourceCode,
            historyItem.id,
            historyItem.year,
            historyItem.type
        );
        
        showToast(`正在播放: ${historyItem.title}`, 'info');
    } else {
        showToast('无法播放，视频链接无效', 'error');
    }
}

// 删除历史记录项并更新UI
function removeHistoryItemAndUpdate(title, sourceCode) {
    if (window.removeHistoryItem) {
        window.removeHistoryItem(title, sourceCode);
        renderHistoryContent();
        showToast('已从历史记录中删除', 'info');
    }
}

// 显示设置面板
function showSettingsPanel() {
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
                    <div class="settings-api-header">
                        <span id="selectedApiCount" class="selected-api-count">已选择 0 个API源</span>
                        <button id="addCustomApiBtn" class="settings-action-btn">
                            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                            </svg>
                            添加自定义源
                        </button>
                    </div>
                    <div id="apiSources" class="settings-api-list">
                        <div class="loading-spinner mx-auto my-4"></div>
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
    
    // 添加自定义API源按钮事件
    const addCustomApiBtn = document.getElementById('addCustomApiBtn');
    if (addCustomApiBtn) {
        addCustomApiBtn.addEventListener('click', showAddCustomApiForm);
    }
    
    // 渲染API源列表
    renderApiSourcesList();
}

// 渲染API源列表
function renderApiSourcesList() {
    const apiSourcesContainer = document.getElementById('apiSources');
    const selectedApiCountElement = document.getElementById('selectedApiCount');
    
    if (!apiSourcesContainer || !window.APISourceManager) return;
    
    // 获取所有API源和已选择的API源
    const allSources = window.APISourceManager.getAllSources();
    const selectedSources = window.APISourceManager.getSelectedSources();
    
    // 更新已选择的API源数量
    if (selectedApiCountElement) {
        selectedApiCountElement.textContent = `已选择 ${selectedSources.length} 个API源`;
    }
    
    // 创建API源列表
    let apiSourcesHTML = '<div class="api-sources-list">';
    
    // 内置API源
    apiSourcesHTML += '<div class="api-sources-section"><h4 class="api-section-title">内置API源</h4>';
    
    Object.keys(allSources).forEach(sourceId => {
        const source = allSources[sourceId];
        if (source.isCustom) return; // 跳过自定义源
        
        const isSelected = selectedSources.includes(sourceId);
        
        apiSourcesHTML += `
            <div class="api-source-item">
                <label class="api-source-label">
                    <input type="checkbox" class="api-source-checkbox" 
                           data-source-id="${sourceId}" 
                           ${isSelected ? 'checked' : ''}>
                    <span class="api-source-name">${source.name}</span>
                </label>
            </div>
        `;
    });
    
    apiSourcesHTML += '</div>';
    
    // 自定义API源
    const customSources = window.APISourceManager.customSources || [];
    if (customSources.length > 0) {
        apiSourcesHTML += '<div class="api-sources-section"><h4 class="api-section-title">自定义API源</h4>';
        
        customSources.forEach((source, index) => {
            const sourceId = `custom_${index}`;
            const isSelected = selectedSources.includes(sourceId);
            
            apiSourcesHTML += `
                <div class="api-source-item">
                    <label class="api-source-label">
                        <input type="checkbox" class="api-source-checkbox" 
                               data-source-id="${sourceId}" 
                               ${isSelected ? 'checked' : ''}>
                        <span class="api-source-name">${source.name}</span>
                    </label>
                    <div class="api-source-actions">
                        <button class="api-source-edit-btn" data-index="${index}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                            </svg>
                        </button>
                        <button class="api-source-delete-btn" data-index="${index}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        });
        
        apiSourcesHTML += '</div>';
    }
    
    apiSourcesHTML += '</div>';
    apiSourcesContainer.innerHTML = apiSourcesHTML;
    
    // 添加API源复选框事件
    const apiSourceCheckboxes = document.querySelectorAll('.api-source-checkbox');
    apiSourceCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const sourceId = e.target.dataset.sourceId;
            if (sourceId) {
                window.APISourceManager.toggleSource(sourceId);
                
                // 更新已选择的API源数量
                const selectedSources = window.APISourceManager.getSelectedSources();
                if (selectedApiCountElement) {
                    selectedApiCountElement.textContent = `已选择 ${selectedSources.length} 个API源`;
                }
                
                showToast(`${e.target.checked ? '已添加' : '已移除'} API源: ${allSources[sourceId]?.name || sourceId}`, 'info');
            }
        });
    });
    
    // 添加编辑按钮事件
    const editButtons = document.querySelectorAll('.api-source-edit-btn');
    editButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('.api-source-edit-btn').dataset.index, 10);
            showEditCustomApiForm(index);
        });
    });
    
    // 添加删除按钮事件
    const deleteButtons = document.querySelectorAll('.api-source-delete-btn');
    deleteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('.api-source-delete-btn').dataset.index, 10);
            if (confirm('确定要删除此API源吗？')) {
                window.APISourceManager.deleteCustomSource(index);
                renderApiSourcesList();
                showToast('已删除自定义API源', 'info');
            }
        });
    });
}

// 显示添加自定义API源表单
function showAddCustomApiForm() {
    // 创建表单面板
    const formPanel = document.createElement('div');
    formPanel.id = 'customApiFormPanel';
    formPanel.className = 'panel-overlay';
    
    formPanel.innerHTML = `
        <div class="panel-container" style="max-width: 400px;">
            <div class="panel-header">
                <h2 class="panel-title">添加自定义API源</h2>
                <button class="panel-close-btn" id="closeFormBtn">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            <div class="panel-content">
                <form id="addCustomApiForm" class="custom-api-form">
                    <div class="form-group">
                        <label for="customApiName" class="form-label">API名称</label>
                        <input type="text" id="customApiName" class="form-input" placeholder="例如: 我的API源" required>
                    </div>
                    <div class="form-group">
                        <label for="customApiUrl" class="form-label">API地址</label>
                        <input type="url" id="customApiUrl" class="form-input" placeholder="例如: https://example.com/api.php/provide/vod" required>
                    </div>
                    <div class="form-group">
                        <label class="form-checkbox-label">
                            <input type="checkbox" id="customApiIsAdult" class="form-checkbox">
                            <span>成人内容 (18+)</span>
                        </label>
                    </div>
                    <div class="form-actions">
                        <button type="button" id="testApiBtn" class="form-button secondary">测试API</button>
                        <button type="submit" class="form-button primary">添加</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(formPanel);
    
    // 添加关闭按钮事件
    const closeBtn = document.getElementById('closeFormBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(formPanel);
        });
    }
    
    // 点击面板外部关闭
    formPanel.addEventListener('click', (e) => {
        if (e.target === formPanel) {
            document.body.removeChild(formPanel);
        }
    });
    
    // 添加表单提交事件
    const form = document.getElementById('addCustomApiForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const nameInput = document.getElementById('customApiName');
            const urlInput = document.getElementById('customApiUrl');
            const isAdultInput = document.getElementById('customApiIsAdult');
            
            if (!nameInput || !urlInput) return;
            
            const name = nameInput.value.trim();
            const url = urlInput.value.trim();
            const isAdult = isAdultInput ? isAdultInput.checked : false;
            
            if (!name || !url) {
                showToast('请填写完整的API信息', 'warning');
                return;
            }
            
            try {
                window.APISourceManager.addCustomSource({
                    name,
                    url,
                    isAdult
                });
                
                document.body.removeChild(formPanel);
                renderApiSourcesList();
                showToast(`已添加自定义API源: ${name}`, 'success');
            } catch (error) {
                showToast(`添加失败: ${error.message}`, 'error');
            }
        });
    }
    
    // 添加测试按钮事件
    const testBtn = document.getElementById('testApiBtn');
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            const urlInput = document.getElementById('customApiUrl');
            if (!urlInput) return;
            
            const url = urlInput.value.trim();
            if (!url) {
                showToast('请输入API地址', 'warning');
                return;
            }
            
            testBtn.disabled = true;
            testBtn.textContent = '测试中...';
            
            try {
                const isValid = await window.APISourceManager.testApiSource(url);
                showToast(isValid ? 'API测试成功' : 'API测试失败，请检查地址', isValid ? 'success' : 'error');
            } catch (error) {
                showToast(`测试失败: ${error.message}`, 'error');
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = '测试API';
            }
        });
    }
}

// 显示编辑自定义API源表单
function showEditCustomApiForm(index) {
    if (!window.APISourceManager) return;
    
    const customSource = window.APISourceManager.getCustomApiInfo(index);
    if (!customSource) {
        showToast('找不到自定义API源', 'error');
        return;
    }
    
    // 创建表单面板
    const formPanel = document.createElement('div');
    formPanel.id = 'editCustomApiFormPanel';
    formPanel.className = 'panel-overlay';
    
    formPanel.innerHTML = `
        <div class="panel-container" style="max-width: 400px;">
            <div class="panel-header">
                <h2 class="panel-title">编辑自定义API源</h2>
                <button class="panel-close-btn" id="closeEditFormBtn">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            <div class="panel-content">
                <form id="editCustomApiForm" class="custom-api-form">
                    <div class="form-group">
                        <label for="editCustomApiName" class="form-label">API名称</label>
                        <input type="text" id="editCustomApiName" class="form-input" value="${customSource.name}" required>
                    </div>
                    <div class="form-group">
                        <label for="editCustomApiUrl" class="form-label">API地址</label>
                        <input type="url" id="editCustomApiUrl" class="form-input" value="${customSource.url}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-checkbox-label">
                            <input type="checkbox" id="editCustomApiIsAdult" class="form-checkbox" ${customSource.isAdult ? 'checked' : ''}>
                            <span>成人内容 (18+)</span>
                        </label>
                    </div>
                    <div class="form-actions">
                        <button type="button" id="editTestApiBtn" class="form-button secondary">测试API</button>
                        <button type="submit" class="form-button primary">保存</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(formPanel);
    
    // 添加关闭按钮事件
    const closeBtn = document.getElementById('closeEditFormBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(formPanel);
        });
    }
    
    // 点击面板外部关闭
    formPanel.addEventListener('click', (e) => {
        if (e.target === formPanel) {
            document.body.removeChild(formPanel);
        }
    });
    
    // 添加表单提交事件
    const form = document.getElementById('editCustomApiForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const nameInput = document.getElementById('editCustomApiName');
            const urlInput = document.getElementById('editCustomApiUrl');
            const isAdultInput = document.getElementById('editCustomApiIsAdult');
            
            if (!nameInput || !urlInput) return;
            
            const name = nameInput.value.trim();
            const url = urlInput.value.trim();
            const isAdult = isAdultInput ? isAdultInput.checked : false;
            
            if (!name || !url) {
                showToast('请填写完整的API信息', 'warning');
                return;
            }
            
            try {
                window.APISourceManager.editCustomSource(index, {
                    name,
                    url,
                    isAdult
                });
                
                document.body.removeChild(formPanel);
                renderApiSourcesList();
                showToast(`已更新自定义API源: ${name}`, 'success');
            } catch (error) {
                showToast(`更新失败: ${error.message}`, 'error');
            }
        });
    }
    
    // 添加测试按钮事件
    const testBtn = document.getElementById('editTestApiBtn');
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            const urlInput = document.getElementById('editCustomApiUrl');
            if (!urlInput) return;
            
            const url = urlInput.value.trim();
            if (!url) {
                showToast('请输入API地址', 'warning');
                return;
            }
            
            testBtn.disabled = true;
            testBtn.textContent = '测试中...';
            
            try {
                const isValid = await window.APISourceManager.testApiSource(url);
                showToast(isValid ? 'API测试成功' : 'API测试失败，请检查地址', isValid ? 'success' : 'error');
            } catch (error) {
                showToast(`测试失败: ${error.message}`, 'error');
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = '测试API';
            }
        });
    }
}

// 导出函数
window.showHistoryPanel = showHistoryPanel;
window.showSettingsPanel = showSettingsPanel;
window.renderApiSourcesList = renderApiSourcesList;
window.showAddCustomApiForm = showAddCustomApiForm;
window.showEditCustomApiForm = showEditCustomApiForm;
window.removeHistoryItemAndUpdate = removeHistoryItemAndUpdate;
window.playFromHistory = playFromHistory;