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
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── 欢迎/空状态组件 ──────────────────────────────────────────────
function EmptyState({ onPickFolder }) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🎞</Text>
      <Text style={styles.emptyTitle}>GIF 播放器</Text>
      <Text style={styles.emptySubtitle}>
        未找到 GIF 文件{'\n'}请确认已授予相册访问权限
      </Text>
      <TouchableOpacity style={styles.emptyButton} onPress={onPickFolder}>
        <Text style={styles.emptyButtonText}>重新扫描</Text>
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

  // 自动播放逻辑
  useEffect(() => {
    if (autoPlay) {
      autoPlayTimer.current = setInterval(() => {
        onChangeIndex((prev) => (prev + 1) % gifList.length);
      }, 3000);
    }
    return () => clearInterval(autoPlayTimer.current);
  }, [autoPlay, gifList.length]);

  // 自动隐藏控制栏
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => clearTimeout(controlsTimer.current);
  }, [currentIndex]);

  // 滑动手势
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10,
      onPanResponderMove: (_, gs) => {
        translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -60) {
          // 向左滑 → 下一张
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            onChangeIndex((prev) => (prev + 1) % gifList.length);
          });
        } else if (gs.dx > 60) {
          // 向右滑 → 上一张
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            onChangeIndex((prev) => (prev - 1 + gifList.length) % gifList.length);
          });
        } else {
          // 回弹
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

      {/* GIF 展示区 */}
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

      {/* 顶部信息栏 */}
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

      {/* 底部控制栏 */}
      {showControls && (
        <View style={styles.bottomBar}>
          {/* 左右切换 */}
          <TouchableOpacity
            style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
            onPress={goPrev}
          >
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>

          {/* 自动播放按钮 */}
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

      {/* 进度圆点指示器（最多显示 10 个） */}
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

// ─── 主 App ──────────────────────────────────────────────────────
export default function App() {
  const [gifList, setGifList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [permission, setPermission] = useState(null);

  // 请求权限并扫描 GIF
  const scanGifs = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setPermission(status);
      if (status !== 'granted') {
        Alert.alert('权限被拒绝', '需要相册访问权限才能读取 GIF 文件');
        setLoading(false);
        return;
      }

      let allAssets = [];
      let hasNextPage = true;
      let endCursor = undefined;

      while (hasNextPage) {
        const { assets, endCursor: cursor, hasNextPage: hasNext } =
          await MediaLibrary.getAssetsAsync({
            mediaType: 'photo',
            first: 200,
            after: endCursor,
          });

        const gifs = assets.filter(
          (a) =>
            a.filename?.toLowerCase().endsWith('.gif') ||
            a.uri?.toLowerCase().includes('.gif')
        );
        allAssets = [...allAssets, ...gifs];
        endCursor = cursor;
        hasNextPage = hasNext;
      }

      setGifList(allAssets);
    } catch (err) {
      Alert.alert('错误', '扫描文件时出错：' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scanGifs();
  }, []);

  const openViewer = (index) => {
    setCurrentIndex(index);
    setViewerVisible(true);
  };

  const closeViewer = () => {
    setViewerVisible(false);
    setAutoPlay(false);
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
        <TouchableOpacity onPress={scanGifs} style={styles.scanBtn}>
          <Text style={styles.scanBtnText}>刷新</Text>
        </TouchableOpacity>
      </View>

      {gifList.length === 0 ? (
        <EmptyState onPickFolder={scanGifs} />
      ) : (
        <>
          {/* 全部播放按钮 */}
          <TouchableOpacity
            style={styles.playAllBtn}
            onPress={() => {
              setAutoPlay(true);
              openViewer(0);
            }}
          >
            <Text style={styles.playAllText}>▶  顺序播放全部</Text>
          </TouchableOpacity>

          {/* GIF 缩略图网格 */}
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
    </SafeAreaView>
  );
}

// ─── 样式 ─────────────────────────────────────────────────────────
const THUMB_SIZE = (SCREEN_WIDTH - 6) / 3;

const styles = StyleSheet.create({
  // 容器
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#aaa', marginTop: 12, fontSize: 15 },

  // 顶部栏
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', flex: 1 },
  headerCount: { color: '#aaa', fontSize: 13, marginRight: 12 },
  scanBtn: {
    backgroundColor: '#0f3460',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scanBtnText: { color: '#e94560', fontSize: 13, fontWeight: '600' },

  // 全部播放
  playAllBtn: {
    margin: 12,
    backgroundColor: '#e94560',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  playAllText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },

  // 缩略图网格
  grid: { paddingHorizontal: 1, paddingBottom: 20 },
  thumbnail: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    margin: 1,
    backgroundColor: '#0f3460',
    overflow: 'hidden',
    borderRadius: 4,
  },
  thumbnailActive: { borderWidth: 2, borderColor: '#e94560' },
  thumbnailActiveBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: '#e94560',
    borderRadius: 4,
  },
  thumbnailImage: { width: '100%', height: '100%' },
  thumbnailOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  thumbnailIndex: { color: '#fff', fontSize: 11 },

  // 空状态
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 72, marginBottom: 20 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  emptySubtitle: { color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 24 },
  emptyButton: {
    marginTop: 28,
    backgroundColor: '#e94560',
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // 播放器
  viewerContainer: { flex: 1, backgroundColor: '#000' },
  gifWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gifImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },

  // 顶部信息栏
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 24,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  closeBtnText: { color: '#fff', fontSize: 18 },
  topTitle: { flex: 1, color: '#fff', fontSize: 14 },
  topCounter: { color: '#ccc', fontSize: 13, marginLeft: 8 },

  // 底部控制栏
  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  navBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: '#fff', fontSize: 36, lineHeight: 40, marginTop: -4 },
  autoPlayBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  autoPlayBtnActive: { backgroundColor: '#e94560' },
  autoPlayBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // 进度圆点
  dotRow: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 90,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
    margin: 4,
  },
  dotActive: { backgroundColor: '#e94560', transform: [{ scale: 1.4 }] },
});
