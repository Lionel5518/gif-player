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
  ScrollView,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ANDROID_SUGGESTED = [
  { name: 'DCIM', path: null, type: 'saf-suggest', hint: 'DCIM' },
  { name: 'Pictures', path: null, type: 'saf-suggest', hint: 'Pictures' },
  { name: 'Download', path: null, type: 'saf-suggest', hint: 'Download' },
  { name: 'Choose any folder...', path: null, type: 'pick-dir' },
];

// Folder browser Modal
function FolderBrowser({ visible, onSelectGifs, onClose }) {
  const [mode, setMode] = useState('albums'); // 'albums' or 'saf'
  const [albums, setAlbums] = useState([]);
  const [currentAlbum, setCurrentAlbum] = useState(null);
  const [albumGifs, setAlbumGifs] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pathHistory, setPathHistory] = useState([]);

  useEffect(() => {
    if (visible) {
      setMode('albums');
      setCurrentAlbum(null);
      setCurrentPath(null);
      setPathHistory([]);
      loadAlbums();
    }
  }, [visible]);

  // Load photo albums
  const loadAlbums = async () => {
    setLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant photo library access');
        setLoading(false);
        return;
      }

      const allAlbums = await MediaLibrary.getAlbumsAsync();
      const albumsWithCount = await Promise.all(
        allAlbums
          .filter(a => a.assetCount > 0)
          .map(async (a) => {
            try {
              const assets = await MediaLibrary.getAssetsAsync({
                album: a,
                mediaType: 'photo',
                first: 1,
              });
              return {
                ...a,
                thumbnail: assets.assets[0]?.uri || null,
              };
            } catch {
              return { ...a, thumbnail: null };
            }
          })
      );
      setAlbums(albumsWithCount);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Load GIFs from an album
  const loadAlbumGifs = async (album) => {
    setLoading(true);
    try {
      const assets = await MediaLibrary.getAssetsAsync({
        album,
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
      setAlbumGifs(gifs);
      setCurrentAlbum(album);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Show SAF suggestions
  const showSuggestions = () => {
    setCurrentPath(null);
    setEntries(ANDROID_SUGGESTED);
    setPathHistory([]);
  };

  // Use SAF to pick directory
  const pickDirectory = async () => {
    try {
      setLoading(true);
      const result = await DocumentPicker.pickDirectoryAsync();
      if (result && result.uri) {
        await loadSafDirectory(result.uri);
      }
    } catch (e) {
      // User cancelled
    } finally {
      setLoading(false);
    }
  };

  // Read SAF directory
  const loadSafDirectory = async (dirUri) => {
    setLoading(true);
    try {
      const result = await FileSystem.readDirectoryAsync(dirUri, { encoding: 'utf8' });
      const items = result.map(name => {
        const uri = dirUri.endsWith('/') ? dirUri + name : dirUri + '/' + name;
        return { name, uri, isDirectory: false };
      });
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
      Alert.alert('Read failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const enterDirectory = (item) => {
    if (item.type === 'pick-dir' || item.type === 'saf-suggest') {
      pickDirectory();
      return;
    }
    if (item.isDirectory || item.type === 'dir') {
      loadSafDirectory(item.uri);
    }
  };

  const goUp = () => {
    if (pathHistory.length <= 1) {
      showSuggestions();
    } else {
      const newHistory = [...pathHistory];
      newHistory.pop();
      const parentUri = newHistory[newHistory.length - 1];
      if (parentUri) {
        setPathHistory(newHistory);
        loadSafDirectory(parentUri);
      } else {
        showSuggestions();
      }
    }
  };

  const confirmCurrentFolder = async () => {
    setLoading(true);
    try {
      const gifs = [];
      const scanDir = async (uri) => {
        const files = await FileSystem.readDirectoryAsync(uri);
        for (const name of files) {
          const childUri = uri.endsWith('/') ? uri + name : uri + '/' + name;
          try {
            const info = await FileSystem.getInfoAsync(childUri);
            if (info.isDirectory) {
              await scanDir(childUri);
            } else if (name.toLowerCase().endsWith('.gif')) {
              gifs.push({ id: childUri, uri: childUri, filename: name });
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
      Alert.alert('Scan failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAlbum = async (album) => {
    await loadAlbumGifs(album);
  };

  const confirmAlbum = () => {
    if (albumGifs.length > 0) {
      onSelectGifs(albumGifs);
      onClose();
    } else {
      Alert.alert('No GIFs', 'This album has no GIF files');
    }
  };

  const goBackFromAlbum = () => {
    setCurrentAlbum(null);
    setAlbumGifs([]);
  };

  // Render: Mode tabs
  const renderModeSelector = () => (
    <View style={styles.modeTabs}>
      <TouchableOpacity
        style={[styles.modeTab, mode === 'albums' && styles.modeTabActive]}
        onPress={() => { setMode('albums'); setCurrentPath(null); }}
      >
        <Text style={[styles.modeTabText, mode === 'albums' && styles.modeTabTextActive]}>
          Albums
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.modeTab, mode === 'saf' && styles.modeTabActive]}
        onPress={() => { setMode('saf'); setCurrentAlbum(null); setAlbumGifs([]); showSuggestions(); }}
      >
        <Text style={[styles.modeTabText, mode === 'saf' && styles.modeTabTextActive]}>
          Folder
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Render: Album list
  const renderAlbumList = () => (
    <FlatList
      data={albums}
      keyExtractor={(item) => item.id}
      numColumns={2}
      contentContainerStyle={styles.albumGrid}
      refreshing={loading}
      onRefresh={loadAlbums}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.albumItem}
          onPress={() => handleSelectAlbum(item)}
        >
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={styles.albumThumb} />
          ) : (
            <View style={[styles.albumThumb, styles.albumThumbPlaceholder]}>
              <Text style={styles.albumThumbEmoji}>📁</Text>
            </View>
          )}
          <Text style={styles.albumName} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.albumCount}>{item.assetCount} files</Text>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        !loading ? (
          <Text style={styles.browserEmpty}>No albums found</Text>
        ) : null
      }
    />
  );

  // Render: Album GIF list
  const renderAlbumGifs = () => (
    <View style={styles.albumGifContainer}>
      <View style={styles.albumGifHeader}>
        <TouchableOpacity onPress={goBackFromAlbum}>
          <Text style={styles.browserBackTextAlt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.browserTitle}>{currentAlbum?.title || 'Album'}</Text>
        <TouchableOpacity
          style={styles.browserConfirmBtn}
          onPress={confirmAlbum}
          disabled={albumGifs.length === 0}
        >
          <Text style={styles.browserConfirmText}>
            Confirm ({albumGifs.length})
          </Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.browserLoading}>
          <ActivityIndicator color="#e94560" />
          <Text style={styles.browserLoadingText}>Loading...</Text>
        </View>
      ) : albumGifs.length === 0 ? (
        <View style={styles.browserLoading}>
          <Text style={styles.browserEmpty}>No GIF files in this album</Text>
        </View>
      ) : (
        <FlatList
          data={albumGifs}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.albumGifGrid}
          renderItem={({ item, index }) => (
            <View style={styles.albumGifItem}>
              <Image source={{ uri: item.uri }} style={styles.albumGifThumb} />
              <Text style={styles.albumGifIndex}>{index + 1}</Text>
            </View>
          )}
        />
      )}
    </View>
  );

  // Render: SAF file browser
  const renderSafBrowser = () => (
    <>
      <View style={styles.browserHeader}>
        <TouchableOpacity
          style={styles.browserBackBtn}
          onPress={pathHistory.length > 0 ? goUp : onClose}
        >
          <Text style={styles.browserBackText}>
            {pathHistory.length > 0 ? '← Back' : '✕ Close'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.browserTitle}>
          {currentPath ? 'Folder selected' : 'Choose location'}
        </Text>
        {currentPath ? (
          <TouchableOpacity style={styles.browserConfirmBtn} onPress={confirmCurrentFolder}>
            <Text style={styles.browserConfirmText}>Confirm</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      {loading && (
        <View style={styles.browserLoading}>
          <ActivityIndicator color="#e94560" />
          <Text style={styles.browserLoadingText}>Reading...</Text>
        </View>
      )}

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
              {currentPath ? 'No GIF files in this folder' : 'Choose a location'}
            </Text>
          ) : null
        }
      />
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.browserContainer}>
        {renderModeSelector()}

        {mode === 'albums' && !currentAlbum && renderAlbumList()}
        {mode === 'albums' && currentAlbum && renderAlbumGifs()}
        {mode === 'saf' && renderSafBrowser()}
      </SafeAreaView>
    </Modal>
  );
}

// Empty state component
function EmptyState({ onPickFolder }) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🎞</Text>
      <Text style={styles.emptyTitle}>GIF Player</Text>
      <Text style={styles.emptySubtitle}>
        No GIF files found{'\n'}Please select a folder with GIFs
      </Text>
      <TouchableOpacity style={styles.emptyButton} onPress={onPickFolder}>
        <Text style={styles.emptyButtonText}>Choose folder</Text>
      </TouchableOpacity>
    </View>
  );
}

// Thumbnail component
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

// GIF viewer component
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
              {autoPlay ? '⏸ Pause' : '▶ Auto'}
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

// Main App
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

  const handleSelectGifs = (gifs) => {
    setGifList(gifs);
    if (gifs.length > 0) {
      setCurrentIndex(0);
    }
  };

  // Scan all GIFs
  const scanAllGifs = async () => {
    setLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant photo library access');
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
      Alert.alert('Scan failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Refresh current GIF list
  const refreshCurrent = async () => {
    if (gifList.length > 0) {
      setLoading(true);
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission required', 'Please grant photo library access');
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
        Alert.alert('Refresh failed', e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Loading
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Scanning GIF files...</Text>
      </View>
    );
  }

  // Full screen viewer
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

  // Main list page
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎞 GIF Player</Text>
        <Text style={styles.headerCount}>{gifList.length} files</Text>
      </View>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, gifList.length > 0 && styles.actionBtnActive]}
          onPress={scanAllGifs}
          disabled={loading}
        >
          <Text style={styles.actionBtnIcon}>🔍</Text>
          <Text style={styles.actionBtnText}>Scan all</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, gifList.length > 0 && styles.actionBtnActive]}
          onPress={refreshCurrent}
          disabled={loading}
        >
          <Text style={styles.actionBtnIcon}>🔃</Text>
          <Text style={styles.actionBtnText}>Refresh</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowBrowser(true)}
        >
          <Text style={styles.actionBtnIcon}>📂</Text>
          <Text style={styles.actionBtnText}>Folder</Text>
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
            <Text style={styles.playAllText}>▶  Play all in order</Text>
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

      {/* Folder browser */}
      <FolderBrowser
        visible={showBrowser}
        onSelectGifs={handleSelectGifs}
        onClose={() => setShowBrowser(false)}
      />
    </SafeAreaView>
  );
}

// Styles
const THUMB_SIZE = (SCREEN_WIDTH - 6) / 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  loadingContainer: {
    flex: 1, backgroundColor: '#1a1a2e',
    justifyContent: 'center', alignItems: 'center',
  },
  loadingText: { color: '#aaa', marginTop: 12, fontSize: 15 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', flex: 1 },
  headerCount: { color: '#aaa', fontSize: 13 },

  // Action bar
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

  // Play all
  playAllBtn: {
    margin: 12, backgroundColor: '#e94560',
    paddingVertical: 14, borderRadius: 12,
    alignItems: 'center',
  },
  playAllText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },

  // Grid
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

  // Empty state
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

  // Viewer
  viewerContainer: { flex: 1, backgroundColor: '#000' },
  gifWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gifImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },

  // Top bar
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

  // Bottom bar
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

  // Dots
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

  // Folder browser
  browserContainer: { flex: 1, backgroundColor: '#1a1a2e' },

  // Mode tabs
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  modeTab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  modeTabActive: {
    borderBottomColor: '#e94560',
  },
  modeTabText: { color: '#888', fontSize: 15, fontWeight: '600' },
  modeTabTextActive: { color: '#e94560' },

  // Album grid
  albumGrid: { padding: 6 },
  albumItem: {
    flex: 1, margin: 4, backgroundColor: '#16213e',
    borderRadius: 10, overflow: 'hidden',
    maxWidth: '48%',
  },
  albumThumb: { width: '100%', height: 120 },
  albumThumbPlaceholder: {
    backgroundColor: '#0f3460',
    justifyContent: 'center', alignItems: 'center',
  },
  albumThumbEmoji: { fontSize: 36 },
  albumName: { color: '#fff', fontSize: 13, fontWeight: '600', padding: 8, paddingBottom: 2 },
  albumCount: { color: '#888', fontSize: 11, paddingHorizontal: 8, paddingBottom: 8 },

  // Album GIF list
  albumGifContainer: { flex: 1 },
  albumGifHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  browserBackTextAlt: { color: '#e94560', fontSize: 15, fontWeight: '600', paddingRight: 12 },
  browserTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600' },
  browserConfirmBtn: {
    backgroundColor: '#e94560', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  browserConfirmText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  albumGifGrid: { paddingHorizontal: 1, paddingTop: 6 },
  albumGifItem: {
    width: THUMB_SIZE, height: THUMB_SIZE, margin: 1,
    backgroundColor: '#0f3460', overflow: 'hidden', borderRadius: 4,
  },
  albumGifThumb: { width: '100%', height: '100%' },
  albumGifIndex: {
    position: 'absolute', bottom: 4, right: 6,
    color: '#fff', fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6,
    overflow: 'hidden',
  },

  // SAF browser
  browserHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  browserBackBtn: { padding: 8 },
  browserBackText: { color: '#e94560', fontSize: 15, fontWeight: '600' },
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
