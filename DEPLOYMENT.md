# X 项目部署指南

## 阶段一：左右两栏布局框架

这是项目重构的第一阶段，实现了左右两栏布局，同时保持所有原有功能特性不变。

### 当前功能状态

#### ✅ 已实现功能
- **左右两栏布局** - 桌面端左栏35%，右栏65%
- **夜晚/白天模式切换** - 完整的主题系统
- **响应式设计** - 移动端自动切换垂直布局
- **播放器基础功能** - Vidstack Player集成
- **主题切换动画** - 流畅的主题切换效果
- **基础搜索界面** - 搜索框和结果展示区域

#### 🔄 开发中功能
- 完整搜索功能集成
- API源管理
- 豆瓣推荐
- 历史记录
- 设置面板

### 部署到 Cloudflare Pages

1. **GitHub 仓库设置**
   ```bash
   git init
   git add .
   git commit -m "Stage 1: Left-right layout framework"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Cloudflare Pages 配置**
   - Build command: 留空
   - Build output directory: `/`
   - Root directory: `/`

3. **环境变量（可选）**
   - `PASSWORD`: 网站访问密码
   - `SETTINGS_PASSWORD`: 设置面板密码

### 测试功能

部署后可以测试：
- 访问根域名自动跳转到 `/main.html`
- 点击右上角月亮/太阳图标切换主题
- 点击右下角"测试播放"按钮测试播放器
- 调整浏览器窗口测试响应式布局
- 在左侧搜索框输入内容（显示开发中提示）

### 文件结构

```
├── main.html              # 新的主页面（左右两栏布局）
├── css/
│   ├── main_layout.css    # 新的布局样式
│   ├── styles.css         # 原有样式（保持不变）
│   └── player_styles.css  # 播放器样式（保持不变）
├── js/
│   ├── main_app.js        # 新的主应用逻辑
│   ├── config.js          # 配置文件（保持不变）
│   └── ...               # 其他原有JS文件
├── _headers               # Cloudflare Pages 头部配置
├── _redirects             # 重定向配置
└── ...                   # 其他原有文件
```

### 唯一原则确认

✅ **所有原有功能特性完全保留**
✅ **只改变用户交互界面，内核逻辑不变**
✅ **所有DOM ID和函数名保持一致**
✅ **完全向后兼容**