// API源管理模块

// 常量定义
const API_SOURCES_STORAGE_KEY = 'selectedAPIs';
const CUSTOM_API_STORAGE_KEY = 'customAPIs';

/**
 * API源管理器
 */
const APISourceManager = {
    // 内置API源列表
    builtinSources: window.API_SITES || {},
    
    // 已选择的API源
    selectedSources: [],
    
    // 自定义API源
    customSources: [],
    
    /**
     * 初始化API源管理器
     */
    init() {
        this.loadSelectedSources();
        this.loadCustomSources();
        console.log('API源管理器初始化完成');
    },
    
    /**
     * 从本地存储加载已选择的API源
     */
    loadSelectedSources() {
        try {
            const savedSources = localStorage.getItem(API_SOURCES_STORAGE_KEY);
            if (savedSources) {
                this.selectedSources = JSON.parse(savedSources);
            } else {
                // 默认选择的API源
                this.selectedSources = ['heimuer', 'bfzy', 'dyttzy', 'maotai', 'tyyszy'];
                this.saveSelectedSources();
            }
        } catch (error) {
            console.error('加载已选择API源失败:', error);
            this.selectedSources = ['heimuer', 'bfzy', 'dyttzy', 'maotai', 'tyyszy'];
        }
    },
    
    /**
     * 从本地存储加载自定义API源
     */
    loadCustomSources() {
        try {
            const savedSources = localStorage.getItem(CUSTOM_API_STORAGE_KEY);
            if (savedSources) {
                this.customSources = JSON.parse(savedSources);
            }
        } catch (error) {
            console.error('加载自定义API源失败:', error);
            this.customSources = [];
        }
    },
    
    /**
     * 保存已选择的API源到本地存储
     */
    saveSelectedSources() {
        try {
            localStorage.setItem(API_SOURCES_STORAGE_KEY, JSON.stringify(this.selectedSources));
        } catch (error) {
            console.error('保存已选择API源失败:', error);
        }
    },
    
    /**
     * 保存自定义API源到本地存储
     */
    saveCustomSources() {
        try {
            localStorage.setItem(CUSTOM_API_STORAGE_KEY, JSON.stringify(this.customSources));
        } catch (error) {
            console.error('保存自定义API源失败:', error);
        }
    },
    
    /**
     * 获取所有可用的API源
     * @returns {Object} 所有API源对象
     */
    getAllSources() {
        const sources = { ...this.builtinSources };
        
        // 添加自定义API源
        this.customSources.forEach((source, index) => {
            sources[`custom_${index}`] = {
                api: source.url,
                name: source.name,
                isCustom: true
            };
        });
        
        return sources;
    },
    
    /**
     * 获取所有已选择的API源
     * @returns {Array} 已选择的API源ID数组
     */
    getSelectedSources() {
        return this.selectedSources;
    },
    
    /**
     * 选择API源
     * @param {string} sourceId - API源ID
     */
    selectSource(sourceId) {
        if (!this.selectedSources.includes(sourceId)) {
            this.selectedSources.push(sourceId);
            this.saveSelectedSources();
        }
    },
    
    /**
     * 取消选择API源
     * @param {string} sourceId - API源ID
     */
    unselectSource(sourceId) {
        const index = this.selectedSources.indexOf(sourceId);
        if (index !== -1) {
            this.selectedSources.splice(index, 1);
            this.saveSelectedSources();
        }
    },
    
    /**
     * 切换API源选择状态
     * @param {string} sourceId - API源ID
     * @returns {boolean} 切换后的状态
     */
    toggleSource(sourceId) {
        const index = this.selectedSources.indexOf(sourceId);
        if (index === -1) {
            this.selectedSources.push(sourceId);
            this.saveSelectedSources();
            return true;
        } else {
            this.selectedSources.splice(index, 1);
            this.saveSelectedSources();
            return false;
        }
    },
    
    /**
     * 添加自定义API源
     * @param {Object} source - 自定义API源对象
     * @returns {number} 添加后的自定义API源索引
     */
    addCustomSource(source) {
        if (!source.name || !source.url) {
            throw new Error('自定义API源必须包含名称和URL');
        }
        
        // 确保URL格式正确
        if (!source.url.startsWith('http://') && !source.url.startsWith('https://')) {
            throw new Error('API URL必须以http://或https://开头');
        }
        
        // 添加到自定义源列表
        this.customSources.push({
            name: source.name,
            url: source.url,
            isAdult: !!source.isAdult
        });
        
        // 保存到本地存储
        this.saveCustomSources();
        
        // 自动选择新添加的源
        const sourceId = `custom_${this.customSources.length - 1}`;
        this.selectSource(sourceId);
        
        return this.customSources.length - 1;
    },
    
    /**
     * 编辑自定义API源
     * @param {number} index - 自定义API源索引
     * @param {Object} source - 更新的自定义API源对象
     */
    editCustomSource(index, source) {
        if (index < 0 || index >= this.customSources.length) {
            throw new Error('无效的自定义API源索引');
        }
        
        if (!source.name || !source.url) {
            throw new Error('自定义API源必须包含名称和URL');
        }
        
        // 确保URL格式正确
        if (!source.url.startsWith('http://') && !source.url.startsWith('https://')) {
            throw new Error('API URL必须以http://或https://开头');
        }
        
        // 更新自定义源
        this.customSources[index] = {
            name: source.name,
            url: source.url,
            isAdult: !!source.isAdult
        };
        
        // 保存到本地存储
        this.saveCustomSources();
    },
    
    /**
     * 删除自定义API源
     * @param {number} index - 自定义API源索引
     */
    deleteCustomSource(index) {
        if (index < 0 || index >= this.customSources.length) {
            throw new Error('无效的自定义API源索引');
        }
        
        // 从已选择列表中移除
        const sourceId = `custom_${index}`;
        this.unselectSource(sourceId);
        
        // 删除自定义源
        this.customSources.splice(index, 1);
        
        // 保存到本地存储
        this.saveCustomSources();
        
        // 更新其他自定义源的选择状态
        for (let i = index; i < this.customSources.length; i++) {
            const oldId = `custom_${i + 1}`;
            const newId = `custom_${i}`;
            
            const isSelected = this.selectedSources.includes(oldId);
            if (isSelected) {
                this.unselectSource(oldId);
                this.selectSource(newId);
            }
        }
    },
    
    /**
     * 获取自定义API源信息
     * @param {number} index - 自定义API源索引
     * @returns {Object|null} 自定义API源对象
     */
    getCustomApiInfo(index) {
        if (index < 0 || index >= this.customSources.length) {
            return null;
        }
        return this.customSources[index];
    },
    
    /**
     * 获取API源信息
     * @param {string} sourceId - API源ID
     * @returns {Object|null} API源对象
     */
    getSelectedApi(sourceId) {
        if (sourceId.startsWith('custom_')) {
            const index = parseInt(sourceId.replace('custom_', ''), 10);
            const customSource = this.getCustomApiInfo(index);
            if (customSource) {
                return {
                    name: customSource.name,
                    api: customSource.url,
                    isCustom: true
                };
            }
        } else {
            return this.builtinSources[sourceId];
        }
        return null;
    },
    
    /**
     * 测试API源是否可用
     * @param {string} apiUrl - API URL
     * @returns {Promise<boolean>} 是否可用
     */
    async testApiSource(apiUrl) {
        try {
            const proxyUrl = `/proxy/${encodeURIComponent(apiUrl + '?ac=videolist&wd=test')}`;
            const response = await fetch(proxyUrl, {
                signal: AbortSignal.timeout(5000)
            });
            
            if (!response.ok) return false;
            
            const data = await response.json();
            return data && data.code !== 400 && Array.isArray(data.list);
        } catch (error) {
            console.error('API源测试失败:', error);
            return false;
        }
    }
};

// 导出到全局
window.APISourceManager = APISourceManager;