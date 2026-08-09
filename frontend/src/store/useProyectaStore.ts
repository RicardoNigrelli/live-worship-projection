import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/lib/api';
import { toast } from '@/components/Toast';

export interface RoomSnapshot {
  id: string;
  songId: string | null;
  title: string | null;
  slideIndex: number;
  slides: string;
  fontScale: number;
  theme: string;
  version: number;
  bgType?: string | null;
  bgValue?: string | null;
  fontFamily?: string | null;
  fontColor?: string | null;
  fontSize?: number | null;
  activeServiceId?: string | null;
  playlist?: string | null;
}

export interface PlaylistItem {
  id: string;
  title: string;
  slides: string[];
}

type SongStylePayload = {
  fontFamily?: string;
  fontColor?: string;
  fontSize?: number;
  bgType?: string;
  bgValue?: string;
};

const STYLE_KEYS = ['fontFamily', 'fontColor', 'fontSize', 'bgType', 'bgValue'] as const;

function isStyleValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function firstStyleValue<T>(...values: Array<T | null | undefined | ''>): T | null {
  for (const value of values) {
    if (isStyleValue(value)) return value as T;
  }
  return null;
}

function getSongStylePayload(item?: PlaylistItem | null): SongStylePayload {
  const style = (item as any)?._style || {};
  return STYLE_KEYS.reduce((payload, key) => {
    const value = style[key];
    if (isStyleValue(value)) {
      (payload as any)[key] = value;
    }
    return payload;
  }, {} as SongStylePayload);
}

function getPreviewStyle(item?: PlaylistItem | null, fallback?: SongStylePayload | null) {
  const style = (item as any)?._style || {};
  return {
    fontFamily: firstStyleValue<string>(style.fontFamily, fallback?.fontFamily),
    fontColor: firstStyleValue<string>(style.fontColor, fallback?.fontColor),
    fontSize: firstStyleValue<number>(style.fontSize, fallback?.fontSize),
    bgType: firstStyleValue<string>(style.bgType, fallback?.bgType),
    bgValue: firstStyleValue<string>(style.bgValue, fallback?.bgValue),
  };
}

interface ProyectaStore {
  socket: Socket | null;
  room: string | null;
  role: 'operator' | 'display' | null;
  isConnected: boolean;
  state: RoomSnapshot | null;
  displayCount: number;

  // Local UX State for Operator
  activePlaylistId: string | null;
  activePlaylistTitle: string | null;
  playlist: PlaylistItem[];
  selectedQueueIndex: number;
  localSlideIndex: number;
  isFrozen: boolean;
  activeServiceStyle: { bgType?: string; bgValue?: string; fontFamily?: string; fontColor?: string; fontSize?: number; name?: string } | null;
  
  connect: (room: string, role: 'operator' | 'display', pin?: string) => void;
  disconnect: () => void;
  
  // Playlist Actions
  addToPlaylist: (item: PlaylistItem) => void;
  removeFromPlaylist: (index: number) => void;
  selectQueueItem: (index: number) => void;
  setPlaylist: (id: string, title: string, items: PlaylistItem[]) => void;
  syncPlaylist: (items: PlaylistItem[]) => void;

  // Operator Actions
  toggleFreeze: () => void;
  activarLive: () => void;
  clearLive: () => void;
  nextSlide: () => void;
  prevSlide: () => void;
  goToSlide: (index: number) => void;
  toggleTheme: (theme: string) => void;
  setStyle: (overrides: { fontFamily?: string | null; fontColor?: string | null; fontSize?: number | null; bgType?: string | null; bgValue?: string | null }) => void;
  resetStyle: () => void;
  storeServiceStyle: (style: { bgType?: string; bgValue?: string; fontFamily?: string; fontColor?: string; fontSize?: number; name?: string } | null) => void;

  // Video state (shared between operator and display)
  isVideoPlaying: boolean;
  videoSeekTime: number | null;
  remoteVolume: number | null;
  
  // Display heartbeat status (for operator view)
  displayPlaying: boolean | null;
  displayCurrentTime: number | null;
  displayError: string | null;
  displayLastSeen: number | null;
  lastActivity: number;
  pingHealth: () => void;
}

export const useProyectaStore = create<ProyectaStore>((set, get) => ({
  socket: null,
  room: null,
  role: null,
  isConnected: false,
  state: null,
  displayCount: 0,

  activePlaylistId: null,
  activePlaylistTitle: null,
  playlist: [],
  selectedQueueIndex: 0,
  localSlideIndex: 0,
  isFrozen: false,
  activeServiceStyle: null as { bgType?: string; bgValue?: string; fontFamily?: string; fontColor?: string; fontSize?: number; name?: string } | null,

  isVideoPlaying: false,
  videoSeekTime: null,
  remoteVolume: null,
  
  displayPlaying: null,
  displayCurrentTime: null,
  displayError: null,
  displayLastSeen: null,
  lastActivity: Date.now(),

  connect: (room, role, pin) => {
    const existingSocket = get().socket;
    if (existingSocket) existingSocket.disconnect();

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || API_URL;
    const newSocket = io(socketUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    set({ socket: newSocket, room, role, isConnected: false });

    const handleJoin = () => {
      set({ isConnected: true });
      newSocket.emit('join_room', { room, role, pin });
    };

    if (newSocket.connected) {
      handleJoin();
    }

    newSocket.on('connect', handleJoin);

    newSocket.on('disconnect', () => set({ isConnected: false }));

    // SEC: surface server-side auth/validation rejections (invalid operator PIN,
    // unauthorized write attempts, rate limiting) instead of failing silently.
    newSocket.on('error', (payload: { message?: string; code?: string }) => {
      if (payload?.code === 'INVALID_PIN' || payload?.code === 'UNAUTHORIZED') {
        toast(payload.message || 'No autorizado para controlar esta sala', 'error');
      } else if (payload?.code === 'RATE_LIMITED') {
        toast(payload.message || 'Demasiadas solicitudes', 'warn');
      }
    });

    newSocket.on('room_state', (payload: { state: RoomSnapshot & { activeServiceId?: string } }) => {
      set((prev) => {
        const nextState = { state: payload.state } as any;
        
         // Auto-Hydration
        const hasServerData = payload.state && payload.state.slides && payload.state.slides !== '["\"\""]' && payload.state.slides !== '[""]';
        const needsHydration = prev.playlist.length === 0 || (payload.state.activeServiceId && prev.activePlaylistId !== payload.state.activeServiceId);
        if (hasServerData && needsHydration) {
          try {
            // B1: Use persisted playlist from server if available (avoids HTTP fetch)
            if (payload.state.playlist) {
              try {
                const persistedPlaylist = JSON.parse(payload.state.playlist);
                if (Array.isArray(persistedPlaylist) && persistedPlaylist.length > 0) {
                  const activeIdx = persistedPlaylist.findIndex((i: any) => i.id === payload.state.songId);
                  nextState.playlist = persistedPlaylist;
                  nextState.selectedQueueIndex = activeIdx >= 0 ? activeIdx : 0;
                  nextState.activePlaylistId = payload.state.activeServiceId || null;
                  nextState.activePlaylistTitle = payload.state.title || 'SESIÓN RESTAURADA';
                  nextState.isFrozen = false;
                }
              } catch {}
            }

            // Fallback: fetch from service API if playlist wasn't restored
            if (!nextState.playlist || nextState.playlist.length === 0) {
              const parsedSlides = JSON.parse(payload.state.slides);
              if (Array.isArray(parsedSlides) && parsedSlides.length > 0) {
                if (payload.state.activeServiceId) {
                  const serviceId = payload.state.activeServiceId;
                  const activeSongId = payload.state.songId;
                  fetch(`${API_URL}/api/services/${serviceId}`)
                    .then(r => r.json())
                    .then(service => {
                      if (!service || !service.items) return;
                      const playlistItems = service.items.map((item: any) => {
                        if (item.type === 'SONG' && item.song) {
                          const hasStyle = !!(item.song.themeBgType || item.song.themeFontFamily || item.song.themeFontSize || item.song.themeFontColor || item.song.themeBgValue);
                          const songStyle = hasStyle ? {
                            bgType: item.song.themeBgType,
                            bgValue: item.song.themeBgValue,
                            fontFamily: item.song.themeFontFamily,
                            fontColor: item.song.themeFontColor,
                            fontSize: item.song.themeFontSize,
                          } : undefined;
                          return {
                            id: item.song.id,
                            title: item.song.title,
                            slides: item.song.parts.map((p: any) => p.content),
                            _type: 'song',
                            _slideLabels: item.song.parts.map((p: any) => p.type),
                            _style: songStyle,
                            _serviceItemId: item.id,
                          };
                        }
                        if (item.type === 'DECK' && item.deck) {
                          return {
                            id: item.deck.id,
                            title: item.deck.title,
                            slides: item.deck.slides?.length ? item.deck.slides.map((s: any) => {
                              const parsedLayers = typeof s.layers === 'string' ? (() => { try { return JSON.parse(s.layers); } catch { return []; } })() : (s.layers || []);
                              return JSON.stringify({
                                type: 'DECK_SLIDE',
                                text: s.text || '',
                                layout: s.layout || 'CENTER',
                                bgColor: s.bgColor || '#1a1a2e',
                                bgImageUrl: s.bgImageUrl || '',
                                bgVideoUrl: s.bgVideoUrl || '',
                                fontColor: s.fontColor || '#ffffff',
                                fontSize: s.fontSize ?? 1.0,
                                layers: parsedLayers,
                              });
                            }) : [" "],
                            _type: 'deck',
                            _slideLabels: item.deck.slides?.length ? item.deck.slides.map(() => 'Diapositiva') : undefined,
                            _serviceItemId: item.id,
                          };
                        }
                        if (item.type === 'MEDIA' && item.mediaAsset) {
                          return {
                            id: item.mediaAsset.id,
                            title: item.mediaAsset.title,
                            slides: [JSON.stringify({
                              type: 'MEDIA_SLIDE',
                              url: item.mediaAsset.url,
                              mediaType: item.mediaAsset.type
                            })],
                            _type: item.mediaAsset.type === 'VIDEO' ? 'media-video' : 'media-image',
                            _slideLabels: [item.mediaAsset.type === 'VIDEO' ? 'Video' : 'Imagen'],
                            _serviceItemId: item.id,
                          };
                        }
                        return {
                          id: item.id || item.song?.id || item.deck?.id || item.mediaAsset?.id || 'unknown',
                          title: item.song?.title || item.deck?.title || item.mediaAsset?.title || 'Elemento',
                          slides: item.song?.parts?.map((p: any) => p.content) || item.deck?.slides?.map((s: any) => s.text || ' ') || [''],
                          _type: item.type?.toLowerCase() || 'unknown',
                          _slideLabels: item.type ? [item.type] : undefined,
                          _serviceItemId: item.id,
                        };
                      }).filter(Boolean);

                      if (playlistItems.length === 0) return;
                      
                      const activeIdx = playlistItems.findIndex((i: any) => i.id === payload.state.songId);
                      const selectedIdx = activeIdx >= 0 ? activeIdx : 0;
                      set({
                        playlist: playlistItems,
                        selectedQueueIndex: selectedIdx,
                        localSlideIndex: payload.state.slideIndex,
                        activePlaylistId: serviceId,
                        activePlaylistTitle: service.name || 'SESIÓN RESTAURADA',
                        isFrozen: false,
                        activeServiceStyle: (service.bgType || service.fontFamily) ? {
                          bgType: service.bgType,
                          bgValue: service.bgValue,
                          fontFamily: service.fontFamily,
                          fontColor: service.fontColor,
                          fontSize: service.fontSize,
                          name: service.name,
                        } : null,
                      });
                    })
                    .catch(() => toast('Error al restaurar sesión', 'warn'));

                  nextState.playlist = [{
                    id: payload.state.songId || 'cargando',
                    title: payload.state.title || 'Cargando...',
                    slides: parsedSlides
                  }];
                  nextState.activePlaylistTitle = 'RESTAURANDO...';
                } else {
                  nextState.playlist = [{
                    id: payload.state.songId || 'recuperado',
                    title: payload.state.title || 'Contenido Proyectado',
                    slides: parsedSlides
                  }];
                  nextState.activePlaylistTitle = 'SESIÓN RESTAURADA';
                }
                nextState.isFrozen = false;
              }
            } // end fallback

          } catch(e) {}
        }
        
        const nextPlaylist = nextState.playlist || prev.playlist;
        const nextSelectedIndex = nextState.selectedQueueIndex ?? prev.selectedQueueIndex;
        const selectedItem = nextPlaylist[nextSelectedIndex];
        const shouldSyncLocalSlide = !selectedItem || selectedItem.id === payload.state.songId;
        nextState.localSlideIndex = !prev.isFrozen && shouldSyncLocalSlide
          ? payload.state.slideIndex
          : prev.localSlideIndex;
        return nextState;
      });
    });

    newSocket.on('state_updated', (payload: { partialState: Partial<RoomSnapshot>, version: number }) => {
      set((prev) => {
        const base = { ...(prev.state || {} as RoomSnapshot), ...payload.partialState, version: payload.version } as RoomSnapshot;
        if (!prev.isFrozen && payload.partialState.slideIndex !== undefined) {
          return { state: base, localSlideIndex: payload.partialState.slideIndex, lastActivity: Date.now() };
        }
        return { state: base, lastActivity: Date.now() };
      });
    });

    newSocket.on('display_count_updated', (payload: { count: number }) => {
      set({ displayCount: payload.count });
    });

    // Video sync events
    newSocket.on('video_play', () => set({ isVideoPlaying: true }));
    newSocket.on('video_pause', () => set({ isVideoPlaying: false }));
    newSocket.on('video_seek', (payload: { currentTime: number }) => set({ videoSeekTime: payload.currentTime }));
    newSocket.on('video_volume', (payload: { volume: number }) => set({ remoteVolume: payload.volume }));
    newSocket.on('video_stop', () => set({ isVideoPlaying: false, videoSeekTime: 0 }));

    // Display heartbeat — only meaningful for operator
    newSocket.on('display_heartbeat', (payload: { playing: boolean; currentTime: number; error: string | null }) => {
      set({
        displayPlaying: payload.playing,
        displayCurrentTime: payload.currentTime,
        displayError: payload.error,
        displayLastSeen: Date.now(),
      });
    });

    // Sync en vivo cuando se edita una canción desde el dashboard
    newSocket.on('song_updated', (payload: { songId: string; title: string; slides: string; fontFamily?: string | null; fontColor?: string | null; fontSize?: number | null; bgType?: string | null; bgValue?: string | null }) => {
      const { playlist, selectedQueueIndex, localSlideIndex, isFrozen, socket: s, room: r, state } = get();
      const parsedSlides: string[] = typeof payload.slides === 'string' ? JSON.parse(payload.slides) : payload.slides;

      const newStyle = {
        fontFamily: payload.fontFamily ?? null,
        fontColor: payload.fontColor ?? null,
        fontSize: payload.fontSize ?? null,
        bgType: payload.bgType ?? null,
        bgValue: payload.bgValue ?? null,
      };

      const newPlaylist = playlist.map(item =>
        item.id === payload.songId
          ? { ...item, title: payload.title, slides: parsedSlides, _style: newStyle }
          : item
      );

      const activeItem = newPlaylist[selectedQueueIndex];
      const isSelectedUpdatedSong = activeItem?.id === payload.songId;
      const maxSlideIndex = Math.max(0, parsedSlides.length - 1);
      const nextLocalSlideIndex = isSelectedUpdatedSong
        ? Math.min(Math.max(localSlideIndex, 0), maxSlideIndex)
        : localSlideIndex;

      set((prev) => ({
        playlist: newPlaylist,
        localSlideIndex: nextLocalSlideIndex,
        state: isSelectedUpdatedSong && !isFrozen
          ? {
              ...(prev.state || state || {} as any),
              songId: payload.songId,
              title: payload.title,
              slides: JSON.stringify(parsedSlides),
              slideIndex: nextLocalSlideIndex,
              ...newStyle,
            } as any
          : prev.state,
      }));

      if (!isFrozen && isSelectedUpdatedSong && s && r) {
        s.emit('set_song', {
          room: r,
          songId: payload.songId,
          title: payload.title,
          slides: parsedSlides,
          slideIndex: nextLocalSlideIndex,
          playlist: newPlaylist,
          ...getSongStylePayload(activeItem),
        });
      }
    });
  },

  disconnect: () => {
    const { socket, room } = get();
    if (socket) {
      if (room) socket.emit('leave_room', { room });
      socket.disconnect();
      set({ socket: null, isConnected: false, room: null, role: null, state: null });
    }
  },

  addToPlaylist: (item) => {
    const p = get().playlist;
    const newPlaylist = [...p, item];
    set({ playlist: newPlaylist });
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('set_song', { 
        room, 
        songId: get().playlist[get().selectedQueueIndex]?.id || '', 
        title: get().playlist[get().selectedQueueIndex]?.title || '', 
        slides: get().playlist[get().selectedQueueIndex]?.slides || [], 
        playlist: newPlaylist 
      });
    }
  },

  removeFromPlaylist: (index) => {
    const p = [...get().playlist];
    p.splice(index, 1);
    const newSelected = Math.min(get().selectedQueueIndex, Math.max(0, p.length - 1));
    set({ playlist: p, selectedQueueIndex: newSelected, localSlideIndex: 0 });
    const { socket, room } = get();
    if (socket && room && p.length > 0) {
      const active = p[newSelected];
      socket.emit('set_song', { room, songId: active.id, title: active.title, slides: active.slides, playlist: p });
    }
  },

  selectQueueItem: (index) => {
    const { playlist, activeServiceStyle, state } = get();
    const item = playlist[index];
    const previewStyle = getPreviewStyle(item, activeServiceStyle);
    const selectedSlideIndex = item?.id === state?.songId ? state.slideIndex : -1;
    set((prev) => ({
      selectedQueueIndex: index,
      localSlideIndex: selectedSlideIndex,
      // Apply the selected item's own style locally for staging without touching live output.
      state: { ...(prev.state || {} as any), ...previewStyle } as any,
    }));
  },

  setPlaylist: (id, title, items) => {
    const { socket, room } = get();
    set({
      activePlaylistId: id,
      activePlaylistTitle: title,
      playlist: items,
      selectedQueueIndex: 0,
      localSlideIndex: 0,
      isFrozen: false,
    });
    if (socket && room) {
      socket.emit('set_service_id', { room, serviceId: id });
    }
    if (socket && room && items.length > 0) {
      const first = items[0];
      socket.emit('set_song', { room, songId: first.id, title: first.title, slides: first.slides, slideIndex: 0, playlist: items,
        ...getSongStylePayload(first),
      });
    }
  },

  syncPlaylist: (items) => {
    set((state) => {
      const currentItemId = state.playlist[state.selectedQueueIndex]?.id;
      let newIndex = items.findIndex(i => i.id === currentItemId);
      if (newIndex === -1) newIndex = state.selectedQueueIndex;
      newIndex = Math.min(newIndex, Math.max(0, items.length - 1));
      
      return { playlist: items, selectedQueueIndex: newIndex };
    });
  },

  toggleFreeze: () => {
    set((s) => ({ isFrozen: !s.isFrozen }));
  },

  activarLive: () => {
    const { socket, room, playlist, selectedQueueIndex, localSlideIndex } = get();
    const active = playlist[selectedQueueIndex];
    const slideIdx = Math.max(0, localSlideIndex);
    if (socket && room && active) {
      socket.emit('set_song', { room, songId: active.id, title: active.title, slides: active.slides, slideIndex: slideIdx, playlist,
        ...getSongStylePayload(active),
      });
      set({ isFrozen: false, localSlideIndex: slideIdx });
    }
  },

  clearLive: () => {
    localStorage.removeItem('proyecta_session');
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('set_song', { room, songId: '', title: '', slides: [''] });
    }
    set({
      isFrozen: true,
      playlist: [],
      activePlaylistId: null,
      activePlaylistTitle: null,
      selectedQueueIndex: 0,
      localSlideIndex: 0,
    });
  },

  nextSlide: () => {
    const { socket, room, isFrozen, localSlideIndex, playlist, selectedQueueIndex, state } = get();
    const currentItem = playlist[selectedQueueIndex];
    if (!currentItem) return;
    
    if (localSlideIndex < currentItem.slides.length - 1) {
      const idx = localSlideIndex + 1;
      set({ localSlideIndex: idx });
      if (!isFrozen && socket && room) {
        if (state?.songId !== currentItem.id) {
          socket.emit('set_song', { room, songId: currentItem.id, title: currentItem.title, slides: currentItem.slides, slideIndex: idx, playlist,
            ...getSongStylePayload(currentItem),
          });
        } else {
          socket.emit('go_to_slide', { room, index: idx });
        }
      }
    } else if (selectedQueueIndex < playlist.length - 1) {
      const nextSongIndex = selectedQueueIndex + 1;
      const nextSong = playlist[nextSongIndex];
      set({ selectedQueueIndex: nextSongIndex, localSlideIndex: 0 });
      if (!isFrozen && socket && room) {
        socket.emit('set_song', { room, songId: nextSong.id, title: nextSong.title, slides: nextSong.slides, slideIndex: 0,
          ...getSongStylePayload(nextSong),
        });
      }
    }
  },

  prevSlide: () => {
    const { socket, room, isFrozen, localSlideIndex, playlist, selectedQueueIndex, state } = get();
    const currentItem = playlist[selectedQueueIndex];
    if (localSlideIndex > 0) {
      const idx = localSlideIndex - 1;
      set({ localSlideIndex: idx });
      if (!isFrozen && socket && room && currentItem) {
        if (state?.songId !== currentItem.id) {
          socket.emit('set_song', { room, songId: currentItem.id, title: currentItem.title, slides: currentItem.slides, slideIndex: idx, playlist,
            ...getSongStylePayload(currentItem),
          });
        } else {
          socket.emit('go_to_slide', { room, index: idx });
        }
      }
    } else if (selectedQueueIndex > 0) {
      const prevSongIndex = selectedQueueIndex - 1;
      const prevSong = playlist[prevSongIndex];
      const lastSlideOfPrev = Math.max(0, prevSong.slides.length - 1);
      
      set({ selectedQueueIndex: prevSongIndex, localSlideIndex: lastSlideOfPrev });
      if (!isFrozen && socket && room) {
        socket.emit('set_song', { room, songId: prevSong.id, title: prevSong.title, slides: prevSong.slides, slideIndex: lastSlideOfPrev,
          ...getSongStylePayload(prevSong),
        });
      }
    }
  },

   goToSlide: (index) => {
    const { socket, room, isFrozen, playlist, selectedQueueIndex, state } = get();
    const active = playlist[selectedQueueIndex];
    set({ localSlideIndex: index });
    if (!isFrozen && socket && room && active) {
      if (state?.songId !== active.id) {
        socket.emit('set_song', { room, songId: active.id, title: active.title, slides: active.slides, slideIndex: index, playlist,
          ...getSongStylePayload(active),
        });
      } else {
        socket.emit('go_to_slide', { room, index });
      }
    }
  },

  toggleTheme: (theme) => {
    const { socket, room } = get();
    if (socket && room) socket.emit('set_theme', { room, theme });
  },

  setStyle: (overrides) => {
    const { socket, room } = get();
    // Filter out undefined values — backend ignores them, causing desync
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) clean[k] = v;
    }
    // Update local state immediately so preview reflects changes instantly
    set((prev) => ({
      state: { ...(prev.state || {} as any), ...clean } as any,
    }));
    if (socket && room) socket.emit('set_style', { room, ...clean });
  },

  resetStyle: () => {
    const { socket, room } = get();
    if (socket && room) socket.emit('reset_style', { room });
  },

  storeServiceStyle: (style) => {
    set({ activeServiceStyle: style });
  },

  pingHealth: () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    fetch(`${apiUrl}/api/health`)
      .then(() => set({ lastActivity: Date.now() }))
      .catch(() => {});
  }
}));
