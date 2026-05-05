import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Dimensions,
  PanResponder,
  Animated,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
  Modal,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ROOT_DIRS = [
  { name: '手机存储', path: FileSystem.documentDirectory ? FileSystem.documentDirectory.replace(/Documents\/?$/, '') : null },
  { name: '应用文档', path: FileSystem.documentDirectory },
];

// Android 常见存储路径（通过SAF方式无法直接访问，但可让用户选择）
const ANDROID_SUGGESTED = [
  { name: '📁 DCIM', path: null, type: 'saf-suggest', hint: 'DCIM（相机）' },
  { name: '📁 Pictures', path: null, type: 'saf-suggest', hint: 'Pictures（图片）' },
  { name: '📁 Download', path: null, type: 'saf-suggest', hint: 'Download（下载）' },
  { name: '📁 选择任意文件夹…', path: null, type: 'pick-dir' },
];

// ─── 文件夹浏览器 Modal ─────────────────────────────────────
function FolderBrowser({ visible, onSelectGifs, onClose }) {
  const [currentPath, setCurrentPath] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pathHistory, setPathHistory] = useState([]); // 浏览历史用于返回

  // 初始：显示建议位置
  const showSuggestions = () => {
    setCurrentPath(null);
    setEntries(ANDROID_SUGGESTED);
    setPathHistory([]);
  };

  useEffect(() => {
    if (visible) showSuggestions();
  }, [visible]);

  // 用 SAF 让用户选择目录，然后读取其中GIF
  const pickDirectory = async () => {
    try {
      setLoading(true);
      const result = await DocumentPicker.pickDirectoryAsync();
      if (result && result.uri) {
        await loadSafDirectory(result.uri);
      }
    } catch (e) {
      // 用户取消
    } finally {
      setLoading(false);
    }
  };

  // 读取 SAF 目录内容
  const loadSafDirectory = async (dirUri) => {
    setLoading(true);
    try {
      const result = await FileSystem.readDirectoryAsync(dirUri, { encoding: 'utf8' });
      // result 是文件名数组，需要拼接完整uri
      const items = result.map(name => {
        const uri = dirUri.endsWith('/') ? dirUri + name : dirUri + '/' + name;
        return { name, uri, isDirectory: false }; // SAF 不区分文件/目录，需要stat
      });
      // 分别处理文件夹和GIF文件
      const gifItems = [];
      const dirItems = [];
      for (const item of items) {
        try {
          const info = await FileSystem.getInfoAsync(item.uri);
          if (info.isDirectory) {
            dirItems.push({ ...item, isDirectory: true });
          } else if (item.name.toLowerCase().endsWith('.gif')) {
            gifItems.push({ ...item, isDirectory: false });
          }
        } catch {
          if (item.name.toLowerCase().endsWith('.gif')) {
            gifItems.push({ ...item, isDirectory: false });
          }
        }
      }
      setEntries([
        ...dirItems.map(d => ({ ...d, type: 'dir' })),
        ...gifItems.map(g => ({ ...g, type: 'gif' })),
      ]);
      setCurrentPath(dirUri);
      setPathHistory(prev => [...prev, dirUri]);
    } catch (e) {
      Alert.alert('读取失败', e.message);
    } finally {
      setLoading(false);
    }
  };

  // 点击文件夹进入
  const enterDirectory = (item) => {
    if (item.type === 'pick-dir' || item.type === 'saf-suggest') {
      pickDirectory();
      return;
    }
    if (item.isDirectory || item.type === 'dir') {
      loadSafDirectory(item.uri);
    }
  };

  // 返回上级
  const goUp = () => {
    if (pathHistory.length <= 1) {
      showSuggestions();
    } else {
      const newHistory = [...pathHistory];
      newHistory.pop(); // 移除当前
      const parentUri = newHistory[newHistory.length - 1];
      if (parentUri) {
        setPathHistory(newHistory);
        loadSafDirectory(parentUri);
      } else {
        showSuggestions();
      }
    }
  };

  // 确认选择当前目录中的所有GIF
  const confirmCurrentFolder = async () => {
    setLoading(true);
    try {
      const gifs = [];
      // 扫描当前目录（含子目录）
      const scanDir = async (uri) => {
        const files = await FileSystem.readDirectoryAsync(uri);
        for (const name of files) {
          const childUri = uri.endsWith('/') ? uri + name : uri + '/' + name;
          try {
            const info = await FileSystem.getInfoAsync(childUri);
            if (info.isDirectory) {
              await scanDir(childUri);
            } else if (name.toLowerCase().endsWith('.gif')) {
              gifs.push({
                id: childUri,
                uri: childUri,
                filename: name,
              });
            }
          } catch {
            if (name.toLowerCase().endsWith('.gif')) {
              gifs.push({ id: childUri, uri: childUri, filename: name });
            }
          }
        }
      };
      if (currentPath) {
        await scanDir(currentPath);
      }
      onSelectGifs(gifs);
      onClose();
    } catch (e) {
      Alert.alert('扫描失败', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.browserContainer}>
        {/* 顶部栏 */}
        <View style={styles.browserHeader}>
          <TouchableOpacity
            style={styles.browserBackBtn}
            onPress={pathHistory.length > 0 ? goUp : onClose}
          >
            <Text style={styles.browserBackText}>
              {pathHistory.length > 0 ? '‹ 返回' : '✕ 关闭'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.browserTitle} numberOfLines={1}>
            {currentPath ? '已选择文件夹' : '选择位置'}
          </Text>
          {currentPath && (
            <TouchableOpacity style={styles.browserConfirmBtn} onPress={confirmCurrentFolder}>
              <Text style={styles.browserConfirmText}>确认选择</Text>
            </TouchableOpacity>
          )}
          {!currentPath && <View style={{ width: 64 }} />}
        </View>

        {loading && (
          <View style={styles.browserLoading}>
            <ActivityIndicator color="#e94560" />
            <Text style={styles.browserLoadingText}>读取中...</Text>
          </View>
        )}

        {/* 文件列表 */}
        <FlatList
          data={entries}
          keyExtractor={(item, idx) => item.uri || item.type || idx.toString()}
          contentContainerStyle={styles.browserList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.browserItem}
              onPress={() => enterDirectory(item)}
            >
              <Text style={styles.browserItemIcon}>
                {item.type === 'dir' || item.isDirectory ? '📁' : '🖼️'}
              </Text>
              <Text style={styles.browserItemName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.type === 'gif' && (
                <Image
                  source={{ uri: item.uri }}
                  style={styles.browserItemThumb}
                  resizeMode="cover"
                />
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.browserEmpty}>
                {currentPath ? '该文件夹中没有 GIF 文件' : '请选择一个位置'}
              </Text>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

// ─── 空状态组件 ─────────────────────────────────────────────
function EmptyState({ onPickFolder }) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🎞</Text>
      <Text style={styles.emptyTitle}>GIF 播放器</Text>
      <Text style={styles.emptySubtitle}>
        未找到 GIF 文件{'\n'}请选择包含 GIF 的文件夹
      </Text>
      <TouchableOpacity style={styles.emptyButton} onPress={onPickFolder}>
        <Text style={styles.emptyButtonText}>选择文件夹</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 缩略图列表组件 ───────────────────────────────────────────────
function GifThumbnail({ item, index, onSelect, isActive }) {
  return (
    <TouchableOpacity
      style={[styles.thumbnail, isActive && styles.thumbnailActive]}
      onPress={() => onSelect(index)}
      activeOpacity={0.75}
    >
      <Image
        source={{ uri: item.uri }}
        style={styles.thumbnailImage}
        resizeMode="cover"
      />
      <View style={styles.thumbnailOverlay}>
        <Text style={styles.thumbnailIndex}>{index + 1}</Text>
      </View>
      {isActive && <View style={styles.thumbnailActiveBorder} />}
    </TouchableOpacity>
  );
}

// ─── 主播放器组件 ─────────────────────────────────────────────────
function GifViewer({ gifList, currentIndex, onChangeIndex, autoPlay, onToggleAutoPlay, onClose }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const autoPlayTimer = useRef(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef(null);

  const currentGif = gifList[currentIndex];

  useEffect(() => {
    if (autoPlay) {
      autoPlayTimer.current = setInterval(() => {
        onChangeIndex((prev) => (prev + 1) % gifList.length);
      }, 3000);
    }
    return () => clearInterval(autoPlayTimer.current);
  }, [autoPlay, gifList.length]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => clearTimeout(controlsTimer.current);
  }, [currentIndex]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10,
      onPanResponderMove: (_, gs) => {
        translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -60) {
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            onChangeIndex((prev) => (prev + 1) % gifList.length);
          });
        } else if (gs.dx > 60) {
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            onChangeIndex((prev) => (prev - 1 + gifList.length) % gifList.length);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          resetControlsTimer();
        }
      },
    })
  ).current;

  const goPrev = () => onChangeIndex((prev) => (prev - 1 + gifList.length) % gifList.length);
  const goNext = () => onChangeIndex((prev) => (prev + 1) % gifList.length);

  return (
    <View style={styles.viewerContainer}>
      <StatusBar hidden />

      <Animated.View
        style={[styles.gifWrapper, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Image
          key={currentGif.uri}
          source={{ uri: currentGif.uri }}
          style={styles.gifImage}
          resizeMode="contain"
        />
      </Animated.View>

      {showControls && (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>
            {currentGif.filename}
          </Text>
          <Text style={styles.topCounter}>
            {currentIndex + 1} / {gifList.length}
          </Text>
        </View>
      )}

      {showControls && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
            onPress={goPrev}
          >
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.autoPlayBtn, autoPlay && styles.autoPlayBtnActive]}
            onPress={onToggleAutoPlay}
          >
            <Text style={styles.autoPlayBtnText}>
              {autoPlay ? '⏸ 暂停' : '▶ 自动'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, currentIndex === gifList.length - 1 && styles.navBtnDisabled]}
            onPress={goNext}
          >
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {showControls && gifList.length <= 20 && (
        <View style={styles.dotRow}>
          {gifList.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => onChangeIndex(i)}>
              <View style={[styles.dot, i === currentIndex && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── 主 App ─────────────────────────────────────────────────────
export default function App() {
  const [gifList, setGifList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);

  const openViewer = (index) => {
    setCurrentIndex(index);
    setViewerVisible(true);
  };

  const closeViewer = () => {
    setViewerVisible(false);
    setAutoPlay(false);
  };

  // 从文件夹浏览器接收GIF列表
  const handleSelectGifs = (gifs) => {
    setGifList(gifs);
    if (gifs.length > 0) {
      setCurrentIndex(0);
    }
  };

  // ── 扫描全部 GIF ──
  const scanAllGifs = async () => {
    setLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '请授予相册访问权限');
        setLoading(false);
        return;
      }

      const assets = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 10000,
      });

      const gifs = assets.assets
        .filter(a => a.uri.toLowerCase().endsWith('.gif'))
        .map(a => ({
          id: a.id,
          uri: a.uri,
          filename: a.filename || 'GIF',
        }));

      setGifList(gifs);
      setCurrentIndex(0);
    } catch (e) {
      Alert.alert('扫描失败', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── 刷新当前 GIF 列表 ──
  const refreshCurrent = async () => {
    if (gifList.length > 0) {
      setLoading(true);
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('权限不足', '请授予相册访问权限');
          setLoading(false);
          return;
        }

        const assets = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: 10000,
        });

        const gifs = assets.assets
          .filter(a => a.uri.toLowerCase().endsWith('.gif'))
          .map(a => ({
            id: a.id,
            uri: a.uri,
            filename: a.filename || 'GIF',
          }));

        setGifList(gifs);
        if (currentIndex >= gifs.length) {
          setCurrentIndex(0);
        }
      } catch (e) {
        Alert.alert('刷新失败', e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // ── 加载中 ──
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>正在扫描 GIF 文件...</Text>
      </View>
    );
  }

  // ── 全屏播放器 ──
  if (viewerVisible && gifList.length > 0) {
    return (
      <GifViewer
        gifList={gifList}
        currentIndex={currentIndex}
        onChangeIndex={setCurrentIndex}
        autoPlay={autoPlay}
        onToggleAutoPlay={() => setAutoPlay((v) => !v)}
        onClose={closeViewer}
      />
    );
  }

  // ── 列表页 ──
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      {/* 顶部标题栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎞 GIF 播放器</Text>
        <Text style={styles.headerCount}>{gifList.length} 个文件</Text>
      </View>

      {/* 操作栏 */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, gifList.length > 0 && styles.actionBtnActive]}
          onPress={scanAllGifs}
          disabled={loading}
        >
          <Text style={styles.actionBtnIcon}>🔍</Text>
          <Text style={styles.actionBtnText}>扫描全部</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, gifList.length > 0 && styles.actionBtnActive]}
          onPress={refreshCurrent}
          disabled={loading}
        >
          <Text style={styles.actionBtnIcon}>🔃</Text>
          <Text style={styles.actionBtnText}>刷新</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowBrowser(true)}
        >
          <Text style={styles.actionBtnIcon}>📂</Text>
          <Text style={styles.actionBtnText}>选择文件夹</Text>
        </TouchableOpacity>
      </View>

      {gifList.length === 0 ? (
        <EmptyState onPickFolder={() => setShowBrowser(true)} />
      ) : (
        <>
          <TouchableOpacity
            style={styles.playAllBtn}
            onPress={() => {
              setAutoPlay(true);
              openViewer(0);
            }}
          >
            <Text style={styles.playAllText}>▶  顺序播放全部</Text>
          </TouchableOpacity>

          <FlatList
            data={gifList}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.grid}
            renderItem={({ item, index }) => (
              <GifThumbnail
                item={item}
                index={index}
                onSelect={openViewer}
                isActive={false}
              />
            )}
          />
        </>
      )}

      {/* 文件夹浏览器 */}
      <FolderBrowser
        visible={showBrowser}
        onSelectGifs={handleSelectGifs}
        onClose={() => setShowBrowser(false)}
      />
    </SafeAreaView>
  );
}

// ─── 样式 ────────────────────────────────────────────────────────
const THUMB_SIZE = (SCREEN_WIDTH - 6) / 3;

const styles = StyleSheet.create({
  // 容器
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  loadingContainer: {
    flex: 1, backgroundColor: '#1a1a2e',
    justifyContent: 'center', alignItems: 'center',
  },
  loadingText: { color: '#aaa', marginTop: 12, fontSize: 15 },

  // 顶部栏
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', flex: 1 },
  headerCount: { color: '#aaa', fontSize: 13 },

  // 操作栏
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#1a1a2e',
  },
  actionBtn: {
    flex: 1, alignItems: 'center',
    paddingVertical: 10, marginHorizontal: 4,
    borderRadius: 8, backgroundColor: '#0f3460',
  },
  actionBtnActive: {
    backgroundColor: '#0f3460',
  },
  actionBtnIcon: { fontSize: 20, marginBottom: 2 },
  actionBtnText: { color: '#e94560', fontSize: 12, fontWeight: '600' },

  // 全部播放
  playAllBtn: {
    margin: 12, backgroundColor: '#e94560',
    paddingVertical: 14, borderRadius: 12,
    alignItems: 'center',
  },
  playAllText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },

  // 缩略图网格
  grid: { paddingHorizontal: 1, paddingBottom: 20 },
  thumbnail: {
    width: THUMB_SIZE, height: THUMB_SIZE, margin: 1,
    backgroundColor: '#0f3460', overflow: 'hidden', borderRadius: 4,
  },
  thumbnailActive: { borderWidth: 2, borderColor: '#e94560' },
  thumbnailActiveBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3, borderColor: '#e94560', borderRadius: 4,
  },
  thumbnailImage: { width: '100%', height: '100%' },
  thumbnailOverlay: {
    position: 'absolute', bottom: 4, right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6,
  },
  thumbnailIndex: { color: '#fff', fontSize: 11 },

  // 空状态
  emptyContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 72, marginBottom: 20 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  emptySubtitle: { color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 24 },
  emptyButton: {
    marginTop: 28, backgroundColor: '#e94560',
    paddingHorizontal: 36, paddingVertical: 12, borderRadius: 24,
  },
  emptyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // 播放器
  viewerContainer: { flex: 1, backgroundColor: '#000' },
  gifWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gifImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },

  // 顶部信息栏
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 24,
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  closeBtnText: { color: '#fff', fontSize: 18 },
  topTitle: { flex: 1, color: '#fff', fontSize: 14 },
  topCounter: { color: '#ccc', fontSize: 13, marginLeft: 8 },

  // 底部控制栏
  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  navBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: '#fff', fontSize: 36, lineHeight: 40, marginTop: -4 },
  autoPlayBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24,
  },
  autoPlayBtnActive: { backgroundColor: '#e94560' },
  autoPlayBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // 进度圆点
  dotRow: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 90,
    left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center',
    flexWrap: 'wrap', paddingHorizontal: 20,
  },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)', margin: 4,
  },
  dotActive: { backgroundColor: '#e94560', transform: [{ scale: 1.4 }] },

  // 文件夹浏览器
  browserContainer: { flex: 1, backgroundColor: '#1a1a2e' },
  browserHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  browserBackBtn: { padding: 8 },
  browserBackText: { color: '#e94560', fontSize: 15, fontWeight: '600' },
  browserTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  browserConfirmBtn: {
    backgroundColor: '#e94560', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  browserConfirmText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  browserLoading: {
    padding: 20, alignItems: 'center',
  },
  browserLoadingText: { color: '#aaa', marginTop: 8, fontSize: 14 },
  browserList: { padding: 8 },
  browserItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, backgroundColor: '#16213e',
    borderRadius: 8, marginBottom: 6,
  },
  browserItemIcon: { fontSize: 22, marginRight: 12 },
  browserItemName: { flex: 1, color: '#fff', fontSize: 14 },
  browserItemThumb: { width: 32, height: 32, borderRadius: 4 },
  browserEmpty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 15 },
});
