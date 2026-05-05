# 构建 GIF 播放器 APK — 完整指南

## 方式一：EAS 云端构建（⭐ 推荐，最简单）

### 第一步：注册 Expo 账号
1. 打开 https://expo.dev/signup
2. 用邮箱注册（免费），或直接用 Google/GitHub 登录

### 第二步：在手机上操作（安装 Expo Go 测试，可选）
- 在安卓手机上安装 `Expo Go`（Google Play 搜索）
- 电脑运行 `npx expo start`，手机扫码即可预览，无需构建

### 第三步：云端构建 APK
在 `h:\workbuddy\apk\gif-player` 目录下打开终端，依次运行：

```bash
# 1. 登录（会弹出浏览器，用刚才注册的账号登录）
npx eas login

# 2. 初始化 EAS 项目（首次运行会问几个问题，全部回车用默认值）
npx eas build:configure

# 3. 开始构建 APK（选择 Android → APK）
npx eas build -p android --profile preview
```

构建完成后会生成一个下载链接，直接下载 APK 文件，传到手机安装即可。

> ⏱ 构建时间约 5-10 分钟，免费账号每月有 15 次构建额度，足够使用。

---

## 方式二：本地构建（需要安装 Android Studio）

### 安装环境
1. 安装 **Android Studio**（https://developer.android.com/studio）
   - 安装时勾选 `Android SDK`、`Android SDK Platform`、`Android Virtual Device`
2. 安装 **Java JDK 17**（https://adoptium.net → Temurin 17 LTS）

### 构建步骤
```bash
cd h:\workbuddy\apk\gif-player

# 1. 生成本地 Android 项目（已完成，跳过）
npx expo prebuild --platform android

# 2. 进入 android 目录，运行 Gradle 构建
cd android
.\gradlew.bat assembleRelease
```

构建完成后，APK 文件位于：
```
h:\workbuddy\apk\gif-player\android\app\build\outputs\apk\release\app-release.apk
```

> ⚠️ 首次构建会下载约 1GB 的 Gradle 依赖，耗时较长。

---

## 方式三：GitHub Actions 自动构建（无需本地环境）

### 操作步骤
1. 在 GitHub 上新建一个仓库（https://github.com/new）
2. 将 `h:\workbuddy\apk\gif-player` 目录下的所有文件上传到该仓库
   - `.github/workflows/build-apk.yml` 文件已包含，会自动触发构建
3. 进入仓库 → **Actions** 标签页 → 选择 `Build Android APK` → **Run workflow**
4. 等待约 5 分钟，构建完成后在 **Artifacts** 处下载 APK

---

## 安装到手机

1. 将 APK 文件传到安卓手机
2. 在手机上找到该文件，点击安装
3. 如提示「未知来源」，在设置中允许本次安装即可
4. 打开 **GIF 播放器**，授权相册权限，即可浏览手机里的 GIF 文件

---

## 常见问题

| 问题 | 解决方法 |
|------|---------|
| EAS 构建失败 | 检查 `eas.json` 配置，确认 expo 账号正常 |
| 安装 APK 提示解析错误 | 重新构建，确保构建的是 APK 而非 AAB |
| 打开 App 后无 GIF 显示 | 确认已授予「相册/存储」权限 |
| Gif 动画不播放 | React Native Image 组件默认支持 GIF，如不行需检查 expo-image 版本 |
