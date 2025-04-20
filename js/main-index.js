import { initPasswordProtection } from './password.js';
import './ui.js'; // 向全局注册UI、部分helpers
import './app.js'; // 主应用业务逻辑与监听

document.addEventListener('DOMContentLoaded', () => {
    initPasswordProtection();
    // 其它初始化均在ui.js/app.js注册
});
