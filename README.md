# 🎞 GIF 播放器

一款基于 React Native (Expo) 开发的 GIF 文件播放器手机应用。

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📂 自动扫描 | 启动后自动扫描手机相册中的所有 GIF 文件 |
| 🖼 缩略图网格 | 3列网格展示所有 GIF，点击进入全屏播放 |
| ◀ ▶ 手势切换 | 左右滑动切换上一个 / 下一个 GIF |
| ← → 按钮切换 | 底部左右箭头按钮快速切换 |
| ▶ 顺序自动播放 | 每 3 秒自动切换到下一个 GIF，循环播放 |
| ⏸ 暂停自动播放 | 点击"暂停"按钮停止自动轮播 |
| 🔴 进度圆点 | 底部显示进度指示圆点（≤20个时显示，可点击跳转） |
| 🔢 计数器 | 顶部显示当前第几个/共几个 |
| 🌙 深色主题 | 专为浏览 GIF 设计的深色界面 |

## 🚀 运行方式

### 开发调试（手机扫码）

```bash
cd gif-player
npm start
# 手机安装 Expo Go App，扫码即可运行
```

### 构建 Android APK

```bash
# 1. 安装 EAS CLI
npm install -g eas-cli

# 2. 登录 Expo 账号
eas login

# 3. 配置构建
eas build:configure

# 4. 构建 APK（本地预览版）
eas build -p android --profile preview

# 或使用本地构建（需要 Android Studio）
eas build -p android --local
```

### eas.json 配置参考

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```

## 📁 项目结构

```
gif-player/
├── App.js          # 主应用（全部核心逻辑）
├── app.json        # Expo 配置（权限、包名等）
├── assets/         # 图标资源
└── package.json
```

## 🔒 所需权限

- **Android**: `READ_EXTERNAL_STORAGE` / `READ_MEDIA_IMAGES`
- **iOS**: `NSPhotoLibraryUsageDescription`

## 🛠 技术栈

- React Native + Expo SDK 53
- expo-media-library（相册访问）
- PanResponder（手势滑动）
- Animated API（切换动画）
