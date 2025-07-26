# X - 现代化在线视频播放器

<div align="center">

![Logo](https://images.icon-icons.com/38/PNG/512/retrotv_5520.png)

一个基于 Vidstack Player 构建的现代化在线视频播放器，支持多数据源聚合、智能播放控制和跨平台兼容。

[![Version](https://img.shields.io/badge/version-1.0.3-blue.svg)](https://github.com/sjnhnp/movie)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Deploy](https://img.shields.io/badge/deploy-Cloudflare%20Pages-orange.svg)](https://pages.cloudflare.com/)

</div>

## ✨ 核心特性

### 🎬 播放体验
- **现代播放器**: 基于 [Vidstack Player](https://github.com/vidstack/player) 构建，支持多种视频格式
- **无缝切换**: 跨线路共享播放进度，智能聚合相同剧集
- **智能预加载**: 可自定义预加载集数，提升观看体验
- **进度记忆**: 独立保存每集播放进度，支持断点续播
- **全平台兼容**: 支持 macOS、Windows、iOS、Android 及主流浏览器

### 🎯 用户界面
- **响应式设计**: 适配各种屏幕尺寸，移动端友好
- **智能历史**: 分离观看历史和搜索历史，精准记录
- **豆瓣集成**: 热门推荐功能，发现优质内容
- **锁屏模式**: 防误触设计，专注观看体验

### 🔧 高级功能
- **广告过滤**: 智能分片广告过滤，纯净播放环境
- **快捷键支持**: 全局键盘快捷键，高效操控
- **投屏支持**: 支持 Chromecast 和画中画模式
- **密码保护**: 双重密码保护机制，保障隐私安全

## 🚀 快速开始

### 在线部署

#### Cloudflare Pages
1. Fork 本仓库
2. 在 Cloudflare Pages 中连接你的 GitHub 仓库
3. 设置构建命令：无需构建，直接部署静态文件
4. 配置环境变量（可选）

#### Vercel
1. 点击 [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sjnhnp/movie)
2. 配置环境变量（可选）
3. 部署完成

### 本地开发
```bash
# 克隆仓库
git clone https://github.com/sjnhnp/movie.git
cd movie

# 启动本地服务器
python -m http.server 8080
# 或使用 Node.js
npx serve .

# 访问 http://localhost:8080
```

### Docker 部署

#### 使用 Docker
```bash
docker run -d \
  -p 8080:8080 \
  -e PASSWORD="your-secret-password" \
  -e SETTINGS_PASSWORD="your-settings-password" \
  --restart unless-stopped \
  --name movie-player \
  ghcr.io/sjnhnp/movie:latest
```

#### 使用 Docker Compose
```yaml
# docker-compose.yml
services:
  movie:
    image: ghcr.io/sjnhnp/movie:latest
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - PASSWORD=your-secret-password
      - SETTINGS_PASSWORD=your-settings-password
    restart: unless-stopped
```

## ⚙️ 配置说明

### 环境变量
| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `PASSWORD` | 网站全局访问密码 | 无 |
| `SETTINGS_PASSWORD` | 设置面板访问密码 | 无 |
| `LIBRETV_PROXY_KV` | Cloudflare KV 命名空间绑定 | 无 |

### 自定义配置

#### 修改默认设置 (`js/config.js`)
```javascript
// 播放器默认配置
const DEFAULTS = {
    enablePreloading: true,    // 启用预加载
    preloadCount: 2,          // 预加载集数
};

// 默认选中的数据源
const DEFAULT_SELECTED_APIS = ['heimuer', 'bfzy'];

// 广告过滤默认状态
const PLAYER_CONFIG = {
    adFilteringEnabled: true
};
```

#### 豆瓣功能配置 (`js/douban.js`)
```javascript
// 启用豆瓣热门推荐
const isEnabled = utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, true) === true;
```

## 📁 项目结构

```
movie/
├── index.html              # 主页面
├── player.html            # 播放器页面
├── css/                   # 样式文件
│   ├── styles.css         # 主样式
│   └── player_styles.css  # 播放器样式
├── js/                    # JavaScript 模块
│   ├── app.js            # 主应用逻辑
│   ├── player_app.js     # 播放器逻辑
│   ├── api.js            # API 接口
│   ├── config.js         # 配置文件
│   └── ...
├── functions/             # Cloudflare Functions
│   ├── _middleware.js    # 中间件
│   └── proxy/           # 代理功能
└── libs/                 # 第三方库
    ├── sha256.min.js
    └── tailwindcss.min.js
```

## 🎮 功能详解

### 首页功能
- **综艺节目**: 选集按钮显示数据源原始标题，如 `20250707(第1期)`
- **观看历史**: 独立保存每一集的观看记录
- **搜索历史**: 豆瓣热门搜索不计入个人搜索历史
- **智能排序**: 画质速度检测排序，优质资源优先显示
- **设置面板**: 
  - 分片广告过滤开关
  - 播放预加载自定义配置
  - 画质速度检测开关
  - 黄色内容过滤
- **视频简介**: 从数据源准确获取详细信息

### 播放器功能
- **跨平台兼容**: 支持 macOS、Windows、iOS、Android、Safari、Chrome、Firefox
- **无缝线路切换**: 跨线路共享播放进度，智能聚合相同剧集
- **进度记忆**: 独立于观看历史的播放进度保存
- **播放预加载**: 可配置的自动预加载功能
- **跳过片头/片尾**: 精确到秒的跳过控制
- **锁屏功能**: 锁定后仅保留核心播放控制
- **单集隐藏**: 灵活的内容管理
- **投屏支持**: Chromecast 和画中画模式
- **网页全屏**: 独立的网页全屏模式，不依赖浏览器全屏
- **全局快捷键**: 页面任意位置的键盘控制

### 智能检测功能
- **画质检测**: 自动检测视频画质（1080P、720P、480P等）
- **速度测试**: 实时检测播放源加载速度
- **智能排序**: 根据画质和速度自动排序，优质资源优先
- **缓存机制**: 搜索结果缓存7天，画质检测缓存10分钟
- **后台更新**: 搜索结果显示后继续后台检测更新

## ⌨️ 快捷键说明

### 播放器快捷键
| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `空格` | 播放/暂停 | 切换播放状态 |
| `W` | 网页全屏 | 进入/退出网页全屏模式 |
| `ESC` | 退出全屏 | 退出网页全屏或浏览器全屏 |
| `F` | 浏览器全屏 | 进入/退出浏览器全屏 |
| `M` | 静音 | 切换静音状态 |
| `↑/↓` | 音量调节 | 上下箭头调节音量 |
| `←/→` | 快进/快退 | 左右箭头快进/快退10秒 |
| `0-9` | 跳转进度 | 数字键跳转到对应百分比位置 |

### 全局快捷键
| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Enter` | 搜索 | 在搜索框中按回车执行搜索 |
| `ESC` | 关闭弹窗 | 关闭当前打开的模态框 |

## 📱 移动端手势操作

### 播放器手势
| 手势 | 功能 | 说明 |
|------|------|------|
| **单击** | 显示/隐藏控制条 | 点击播放区域切换控制条显示 |
| **双击** | 播放/暂停 | 双击播放区域切换播放状态 |
| **长按** | 快进播放 | 长按播放区域进入2倍速播放 |
| **左右滑动** | 快进/快退 | 水平滑动调节播放进度 |
| **上下滑动** | 音量/亮度调节 | 左侧上下滑动调节亮度，右侧调节音量 |
| **双指缩放** | 画面缩放 | 双指手势缩放视频画面 |

### 界面手势
| 手势 | 功能 | 说明 |
|------|------|------|
| **下拉刷新** | 刷新页面 | 在页面顶部下拉刷新内容 |
| **左右滑动** | 切换剧集 | 在剧集列表中左右滑动切换 |
| **长按** | 显示菜单 | 长按剧集项显示更多选项 |

## 🔍 画质速度检测

### 检测机制
- **并发检测**: 最多同时检测3个源，避免过载
- **多重验证**: 结合ping测试和实际下载测试
- **智能缓存**: 画质检测结果缓存10分钟，搜索结果缓存7天
- **后台更新**: 搜索结果先显示，后台继续检测更新

### 画质识别
- **自动识别**: 从视频流中自动识别分辨率
- **标准分类**: 支持4K、1080P、720P、480P等标准分辨率
- **画质标签**: 搜索结果中显示画质标签
- **优先排序**: 高画质资源自动排在前面

### 速度测试
- **实时测试**: 测试实际下载速度
- **单位显示**: 显示KB/s或MB/s速度单位
- **连接状态**: 显示连接正常、超时等状态
- **速度排序**: 根据实际速度智能排序

### 排序算法
1. **优先级排序**: 检测方法可靠性排序
2. **速度排序**: 相同优先级按速度排序
3. **画质权重**: 高画质资源获得额外权重
4. **综合评分**: 多维度综合评分排序

## 🔧 开发指南

### 添加新的数据源
在 `js/config.js` 中的 `API_SITES` 对象添加新的数据源：

```javascript
const API_SITES = {
    // 现有数据源...
    newSource: {
        api: 'https://api.example.com/api.php/provide/vod',
        name: '新数据源',
        detail: 'https://example.com'
    }
};
```

### 自定义播放器主题
修改 `css/player_styles.css` 文件来自定义播放器外观：

```css
/* 自定义播放器主题色 */
:root {
    --primary-color: #your-color;
    --secondary-color: #your-secondary-color;
}
```

### 自动同步上游更新
Fork 后需要手动启用 GitHub Actions，系统将在每天凌晨 4 点自动同步上游更新。

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [Vidstack Player](https://github.com/vidstack/player) - 现代化的视频播放器
- [LibreTV](https://github.com/LibreSpark/LibreTV) - 项目灵感来源
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架

## 📞 支持

如果你觉得这个项目有用，请给它一个 ⭐️！

有问题或建议？欢迎提交 [Issue](https://github.com/sjnhnp/movie/issues)。

---

<div align="center">
Made with ❤️ by the community
</div>