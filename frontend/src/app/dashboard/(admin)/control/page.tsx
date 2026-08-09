"use client";
import { useEffect, useState, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useProyectaStore } from '../../../../store/useProyectaStore';
import type { RoomSnapshot } from '../../../../store/useProyectaStore';
import { API_URL } from '@/lib/api';
import MediaControls from '@/components/MediaControls';
import MediaSlide from '@/components/MediaSlide';
import ScreenCanvas from '@/components/ScreenCanvas';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';
import { loadFont } from '@/lib/fonts';
function decodeSlideEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseStructuredSlide(value: string) {
  if (!value?.startsWith('{')) return null;
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(decodeSlideEntities(value));
    } catch {
      return null;
    }
  }
}

interface ServiceItem {
  id: string;
  name: string;
  date: string;
  bgType?: string;
  bgValue?: string;
  fontFamily?: string;
  fontColor?: string;
  fontSize?: number;
  items: Array<{
    id: string;
    type: string;
    song?: {
      id: string;
      title: string;
      parts?: Array<{ type: string; content: string }>;
      themeBgType?: string;
      themeBgValue?: string;
      themeFontFamily?: string;
      themeFontColor?: string;
      themeFontSize?: number;
    };
    deck?: { id: string; title: string; slides?: Array<{ text: string }> };
    mediaAsset?: { id: string; title: string; type: string; url: string };
  }>;
}

function HealthDot() {
  const lastActivity = useProyectaStore((s) => s.lastActivity);
  const pingHealth = useProyectaStore((s) => s.pingHealth);
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick(t => t + 1), 5000);
    return () => clearInterval(i);
  }, []);
  const elapsed = Math.floor((Date.now() - lastActivity) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const isRed = elapsed > 600;
  const isYellow = elapsed > 300;
  return (
    <div className="flex items-center gap-1.5">
      <div className={`rounded-full ${isRed ? 'bg-red-500 animate-pulse' : isYellow ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: 8, height: 8 }} />
      <span className={`font-headline font-bold text-[10px] uppercase ${isRed ? 'text-red-400' : isYellow ? 'text-yellow-400' : 'text-green-400'}`}>
        {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
      </span>
      {isRed && (
        <button onClick={pingHealth} className="text-[9px] bg-surface-container px-1.5 py-0.5 rounded hover:bg-primary hover:text-white transition-colors font-headline font-bold uppercase">
          Ping
        </button>
      )}
    </div>
  );
}

const COLUMN_WIDTHS_KEY = 'proyecta_column_widths';
const DEFAULT_COLUMN_WIDTHS: [number, number, number] = [25, 45, 30];
const MIN_COLUMN_PCT = 15;
const MAX_COLUMN_PCT = 55;

function useResizableColumns() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<[number, number, number]>(DEFAULT_COLUMN_WIDTHS);
  const [isDesktop, setIsDesktop] = useState(false);
  const draggingRef = useRef<{ handle: 0 | 1; startX: number; startWidths: [number, number, number] } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_WIDTHS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) setWidths(parsed as [number, number, number]);
      }
    } catch {}

    const mql = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const startDrag = useCallback((handle: 0 | 1) => (e: ReactMouseEvent) => {
    e.preventDefault();
    draggingRef.current = { handle, startX: e.clientX, startWidths: widths };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const drag = draggingRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;
      const containerWidth = container.getBoundingClientRect().width;
      const deltaPct = ((moveEvent.clientX - drag.startX) / containerWidth) * 100;
      const next: [number, number, number] = [...drag.startWidths];

      const left = drag.handle;
      const right = drag.handle + 1;
      let newLeft = drag.startWidths[left] + deltaPct;
      let newRight = drag.startWidths[right] - deltaPct;
      newLeft = Math.max(MIN_COLUMN_PCT, Math.min(MAX_COLUMN_PCT, newLeft));
      newRight = Math.max(MIN_COLUMN_PCT, Math.min(MAX_COLUMN_PCT, newRight));
      // Keep the pair's total constant so the third column is unaffected.
      const pairTotal = drag.startWidths[left] + drag.startWidths[right];
      newRight = pairTotal - newLeft;
      next[left] = newLeft;
      next[right] = newRight;
      setWidths(next);
    };

    const onMouseUp = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setWidths(current => {
        try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(current)); } catch {}
        return current;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [widths]);

  const resetWidths = useCallback(() => {
    setWidths(DEFAULT_COLUMN_WIDTHS);
    try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(DEFAULT_COLUMN_WIDTHS)); } catch {}
  }, []);

  return { containerRef, widths, isDesktop, startDrag, resetWidths };
}

function ColumnResizeHandle({ onMouseDown, onDoubleClick, orderClass }: { onMouseDown: (e: ReactMouseEvent) => void; onDoubleClick: () => void; orderClass: string }) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={`hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center group/handle ${orderClass}`}
      title="Arrastrar para redimensionar (doble clic para restablecer)"
    >
      <div className="w-0.5 h-full bg-outline-variant/20 group-hover/handle:bg-primary transition-colors" />
    </div>
  );
}

export default function ControlPage() {
  const [room] = useState('default');
  const { containerRef, widths: colWidths, isDesktop, startDrag, resetWidths } = useResizableColumns();
  
  const connect = useProyectaStore((s) => s.connect);
  const isConnected = useProyectaStore((s) => s.isConnected);
  const state = useProyectaStore((s) => s.state);
  const socket = useProyectaStore((s) => s.socket);
  const isVideoPlaying = useProyectaStore((s) => s.isVideoPlaying);
  const displayPlaying = useProyectaStore((s) => s.displayPlaying);
  const displayLastSeen = useProyectaStore((s) => s.displayLastSeen);
  
  const playlist = useProyectaStore((s) => s.playlist);
  const selectedQueueIndex = useProyectaStore((s) => s.selectedQueueIndex);
  const localSlideIndex = useProyectaStore((s) => s.localSlideIndex);
  const isFrozen = useProyectaStore((s) => s.isFrozen);
  
  const selectQueueItem = useProyectaStore((s) => s.selectQueueItem);
  const toggleFreeze = useProyectaStore((s) => s.toggleFreeze);
  const activarLive = useProyectaStore((s) => s.activarLive);
  const nextSlide = useProyectaStore((s) => s.nextSlide);
  const prevSlide = useProyectaStore((s) => s.prevSlide);
  const goToSlide = useProyectaStore((s) => s.goToSlide);
  const activePlaylistTitle = useProyectaStore((s) => s.activePlaylistTitle);
  const setPlaylist = useProyectaStore((s) => s.setPlaylist);
  const setStyle = useProyectaStore((s) => s.setStyle);
  const resetStyle = useProyectaStore((s) => s.resetStyle);
  const clearLive = useProyectaStore((s) => s.clearLive);

  // Debounced style apply — accumulates changes and sends after 300ms of inactivity
  const styleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stylePendingRef = useRef<Record<string, unknown>>({});
  const debouncedSetStyle = useCallback((overrides: Record<string, unknown>) => {
    Object.assign(stylePendingRef.current, overrides);
    if (styleTimeoutRef.current) clearTimeout(styleTimeoutRef.current);
    styleTimeoutRef.current = setTimeout(() => {
      const merged = { ...stylePendingRef.current };
      stylePendingRef.current = {};
      pushUndo();
      setStyle(merged as any);
    }, 300);
  }, [setStyle]);

  // Undo/redo stack for style changes
  const undoStackRef = useRef<Partial<RoomSnapshot>[]>([]);
  const redoStackRef = useRef<Partial<RoomSnapshot>[]>([]);

  const getStyleSnapshot = useCallback((): Partial<RoomSnapshot> => {
    const s = useProyectaStore.getState().state;
    return {
      bgType: s?.bgType, bgValue: s?.bgValue,
      fontFamily: s?.fontFamily, fontColor: s?.fontColor, fontSize: s?.fontSize,
    };
  }, []);

  const pushUndo = useCallback(() => {
    const snap = getStyleSnapshot();
    if (undoStackRef.current.length >= 20) undoStackRef.current.shift();
    undoStackRef.current.push(snap);
    redoStackRef.current = [];
  }, [getStyleSnapshot]);

  const handleUndo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    const current = getStyleSnapshot();
    if (redoStackRef.current.length >= 20) redoStackRef.current.shift();
    redoStackRef.current.push(current);
    setStyle({
      bgType: prev.bgType ?? null,
      bgValue: prev.bgValue ?? null,
      fontFamily: prev.fontFamily ?? null,
      fontColor: prev.fontColor ?? null,
      fontSize: prev.fontSize ?? null,
    });
  }, [getStyleSnapshot, setStyle]);

  const handleRedo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    const current = getStyleSnapshot();
    if (undoStackRef.current.length >= 20) undoStackRef.current.shift();
    undoStackRef.current.push(current);
    setStyle({
      bgType: next.bgType ?? null,
      bgValue: next.bgValue ?? null,
      fontFamily: next.fontFamily ?? null,
      fontColor: next.fontColor ?? null,
      fontSize: next.fontSize ?? null,
    });
  }, [getStyleSnapshot, setStyle]);
  const storeServiceStyle = useProyectaStore((s) => s.storeServiceStyle);
  const activeServiceStyle = useProyectaStore((s) => s.activeServiceStyle);

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState<{ index: number; title: string; serviceItemId?: string } | null>(null);
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [liveFontFamily, setLiveFontFamily] = useState('');
  const [liveFontColor, setLiveFontColor] = useState('');
  const [liveFontSize, setLiveFontSize] = useState(1.0);
  const [liveBgType, setLiveBgType] = useState('');
  const [liveBgValue, setLiveBgValue] = useState('');
  const [styleLocked, setStyleLocked] = useState(false);
  const [styleSource, setStyleSource] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAddSongModal, setShowAddSongModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [addSongSearch, setAddSongSearch] = useState('');
  const [availableSongs, setAvailableSongs] = useState<any[]>([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState(false);

  // Timer-based video sync
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(0.8);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string>('');
  const videoStartTimeRef = useRef<number>(0);
  const videoOffsetRef = useRef<number>(0);
  const [videoTime, setVideoTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const songStyleCacheRef = useRef<Record<string, { bgType?: string; bgValue?: string; fontFamily?: string; fontColor?: string; fontSize?: number } | null>>({});

  const isTransmissionActive = playlist.length > 0;

  // Parse live slide for video
  let liveMediaData: { url: string; mediaType: string } | null = null;
  if (state?.slides && typeof state.slides === 'string') {
    try {
      const serverSlides = JSON.parse(state.slides);
      const rawSlide = serverSlides[state?.slideIndex ?? 0] || '';
      const parsed = parseStructuredSlide(rawSlide);
      if (parsed?.type === 'MEDIA_SLIDE' && parsed.mediaType === 'VIDEO') {
        liveMediaData = parsed;
      }
    } catch {}
  }

  const isVideoLive = !!liveMediaData;
  const activeItem = playlist[selectedQueueIndex];
  const previewText = activeItem?.slides[localSlideIndex] || "SIN CONTENIDO";

  // Parse preview content (aligned with display logic)
  let previewMediaData: { url: string; mediaType: string } | null = null;
  let previewDeckSlide: any = null;
  let previewSlideText = "";
  
  const activeText = isFrozen ? (() => {
    let liveText = "";
    if (state?.slides && typeof state.slides === 'string') {
      try {
        const serverSlides = JSON.parse(state.slides);
        liveText = serverSlides[state.slideIndex] || "";
        if (liveText === "") liveText = "SIN CONTENIDO";
      } catch {}
    }
    return liveText;
  })() : previewText;

  const parsedActiveSlide = parseStructuredSlide(activeText);
  if (parsedActiveSlide?.type === 'MEDIA_SLIDE') {
    previewMediaData = parsedActiveSlide;
    previewSlideText = '';
  } else if (parsedActiveSlide?.type === 'DECK_SLIDE') {
    previewDeckSlide = parsedActiveSlide;
    previewSlideText = parsedActiveSlide.text || '';
  } else {
    previewSlideText = activeText;
  }

  // Display status
  const isDisplayOnline = displayLastSeen ? (Date.now() - displayLastSeen < 10000) : false;
  const displayStatusText = !isVideoLive ? '' : !isDisplayOnline ? 'DISPLAY OFFLINE' : displayPlaying === true ? 'EN REPRODUCCIÓN' : displayPlaying === false ? 'EN PAUSA' : 'EN ESPERA';
  const displayStatusColor = !isVideoLive ? 'transparent' : !isDisplayOnline ? 'bg-gray-500' : displayPlaying === true ? 'bg-green-500' : 'bg-yellow-500';
  const displayStatusAnimate = displayPlaying === true;

  // Update source when live video changes
  useEffect(() => {
    if (liveMediaData?.url) {
      setCurrentPreviewUrl(liveMediaData.url);
      setVideoTime(0);
      setVideoDuration(0);
      videoOffsetRef.current = 0;
      videoStartTimeRef.current = 0;
      if (timerRef.current) clearInterval(timerRef.current);
      useProyectaStore.setState({ isVideoPlaying: false });
    }
  }, [liveMediaData?.url]);

  // Timer-based time sync for UI
  useEffect(() => {
    if (isVideoPlaying && currentPreviewUrl) {
      videoStartTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - videoStartTimeRef.current) / 1000 + videoOffsetRef.current;
        setVideoTime(Math.min(elapsed, videoDuration || elapsed));
      }, 250);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isVideoPlaying, currentPreviewUrl, videoDuration]);

  // Preview video plays muted for operator reference
  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || !currentPreviewUrl) return;
    if (isVideoPlaying) {
      video.currentTime = videoTime;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isVideoPlaying, currentPreviewUrl, videoTime]);

  // Keep video synced with timer
  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || !isVideoPlaying) return;
    video.currentTime = videoTime;
  }, [videoTime, isVideoPlaying]);

  const handleVideoPlayPause = useCallback(() => {
    if (!socket || !room || !currentPreviewUrl) return;
    if (isVideoPlaying) {
      videoOffsetRef.current = videoTime;
      socket.emit('video_pause', { room });
    } else {
      videoStartTimeRef.current = Date.now();
      videoOffsetRef.current = videoOffsetRef.current || 0;
      socket.emit('video_play', { room });
    }
  }, [socket, room, isVideoPlaying, videoTime, currentPreviewUrl]);

  const handleVideoStop = useCallback(() => {
    if (!socket || !room || !currentPreviewUrl) return;
    videoStartTimeRef.current = 0;
    videoOffsetRef.current = 0;
    setVideoTime(0);
    socket.emit('video_stop', { room });
  }, [socket, room, currentPreviewUrl]);

  const handleVideoSeek = useCallback((time: number) => {
    if (!socket || !room || !currentPreviewUrl) return;
    videoOffsetRef.current = 0;
    videoStartTimeRef.current = Date.now() - time * 1000;
    setVideoTime(time);
    if (previewVideoRef.current) previewVideoRef.current.currentTime = time;
    socket.emit('video_seek', { room, currentTime: time });
  }, [socket, room, currentPreviewUrl]);

  const handleVideoVolume = useCallback((vol: number) => {
    if (!socket || !room) return;
    setVideoVolume(vol);
    socket.emit('video_volume', { room, volume: vol });
  }, [socket, room]);

  const confirmRemovePlaylistItem = useCallback(async () => {
    if (!pendingRemoveItem) return;
    const itemToRemove = pendingRemoveItem;
    setPendingRemoveItem(null);

    const store = useProyectaStore.getState();
    if (store.activePlaylistId && itemToRemove.serviceItemId) {
      try {
        await fetch(`${API_URL}/api/services/items/${itemToRemove.serviceItemId}`, { method: 'DELETE' });
      } catch {
        toast('No se pudo actualizar la reunión, pero se quitará de la lista local', 'warn');
      }
    }
    store.removeFromPlaylist(itemToRemove.index);
  }, [pendingRemoveItem]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    // Undo / Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo(); return; }
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
    if (e.key === 'f' || e.key === 'F') toggleFreeze();
    if (e.key === ' ' && isVideoLive) { e.preventDefault(); handleVideoPlayPause(); }
  }, [nextSlide, prevSlide, toggleFreeze, isVideoLive, handleVideoPlayPause, handleUndo, handleRedo]);

  useEffect(() => {
    if (socket) return;
    // SEC: The operator PIN is a server secret (OPERATOR_PIN), never bundled into
    // client JS. This route only returns it if the request carries a valid
    // admin_token cookie (i.e. this page is being viewed by someone who already
    // passed the dashboard login), then we hand it to the backend Socket.IO server
    // so join_room can grant write privileges for this room.
    (async () => {
      try {
        const res = await fetch('/api/operator-pin');
        if (!res.ok) {
          toast('No se pudo verificar la sesión de operador', 'error');
          return;
        }
        const { pin } = await res.json();
        connect('default', 'operator', pin);
      } catch {
        toast('No se pudo conectar como operador', 'error');
      }
    })();
  }, [socket, connect]);

  // Infer style source after page reload
  useEffect(() => {
    if (!isConnected || !state) return;
    if (activeServiceStyle?.name && (state.bgType || state.fontFamily)) {
      setStyleSource(`Reunión: ${activeServiceStyle.name}`);
    } else if (state.bgType || state.fontFamily) {
      setStyleSource('Sesión restaurada');
    }
  }, [isConnected, activeServiceStyle, state?.bgType, state?.fontFamily]);
  // Sync local style controls from global state
  useEffect(() => {
    if (state) {
      setLiveFontFamily(state.fontFamily || '');
      setLiveFontColor(state.fontColor || '');
      setLiveFontSize(state.fontSize || state.fontScale || 1.0);
      setLiveBgType(state.bgType || '');
      setLiveBgValue(state.bgValue || '');
    }
  }, [state]);

  // Persistencia local de la playlist
  useEffect(() => {
    if (playlist.length > 0) {
      try {
        const store = useProyectaStore.getState();
        localStorage.setItem('proyecta_session', JSON.stringify({
          playlist: store.playlist,
          selectedQueueIndex: store.selectedQueueIndex,
          localSlideIndex: store.localSlideIndex,
          activePlaylistId: store.activePlaylistId,
          activePlaylistTitle: store.activePlaylistTitle,
          activeServiceStyle: store.activeServiceStyle,
        }));
      } catch {}
    } else {
      localStorage.removeItem('proyecta_session');
    }
  }, [playlist, selectedQueueIndex, localSlideIndex, activePlaylistTitle, activeServiceStyle]);

  // Restaurar sesión desde localStorage al montar (antes de que llegue room_state)
  useEffect(() => {
    const store = useProyectaStore.getState();
    if (store.playlist.length > 0) return; // ya tiene datos (auto-hydration o carga rápida)
    try {
      const saved = localStorage.getItem('proyecta_session');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.playlist && Array.isArray(data.playlist) && data.playlist.length > 0) {
          useProyectaStore.setState({
            playlist: data.playlist,
            selectedQueueIndex: data.selectedQueueIndex ?? 0,
            localSlideIndex: data.localSlideIndex ?? 0,
            activePlaylistId: data.activePlaylistId || null,
            activePlaylistTitle: data.activePlaylistTitle || null,
            activeServiceStyle: data.activeServiceStyle || null,
          });
        }
      }
    } catch {}
  }, []); // solo al montar

  const applySongStyle = useCallback((style: { bgType?: string; bgValue?: string; fontFamily?: string; fontColor?: string; fontSize?: number }) => {
    pushUndo();
    setStyle({
      bgType: style.bgType,
      bgValue: style.bgValue,
      fontFamily: style.fontFamily,
      fontColor: style.fontColor,
      fontSize: style.fontSize,
    });
  }, [setStyle, pushUndo]);

  const fetchSongStyle = useCallback((songId: string): Promise<{ bgType?: string; bgValue?: string; fontFamily?: string; fontColor?: string; fontSize?: number } | null> => {
    if (songStyleCacheRef.current[songId] !== undefined) {
      return Promise.resolve(songStyleCacheRef.current[songId]);
    }
    return fetch(`${API_URL}/api/songs/${songId}`)
      .then(r => {
        if (!r.ok) throw new Error('Song not found');
        return r.json();
      })
      .then(song => {
        const style = {
          bgType: song.themeBgType,
          bgValue: song.themeBgValue,
          fontFamily: song.themeFontFamily,
          fontColor: song.themeFontColor,
          fontSize: song.themeFontSize,
        };
        songStyleCacheRef.current[songId] = style;
        return style;
      })
      .catch(() => {
        songStyleCacheRef.current[songId] = null;
        toast('No se pudo cargar el estilo de la canción', 'warn');
        return null;
      });
  }, []);

  // Keep selected song style in the staging preview only; live output changes when projecting.
  useEffect(() => {
    if (styleLocked || !isConnected || playlist.length === 0) return;
    const activeItem = playlist[selectedQueueIndex];
    if (!activeItem) return;

    const styleValue = (value: any, fallback: any) =>
      value !== undefined && value !== null && value !== '' ? value : (fallback ?? null);

    const applyPreviewStyle = (style: { bgType?: string; bgValue?: string; fontFamily?: string; fontColor?: string; fontSize?: number } | null | undefined) => {
      const nextStyle = {
        bgType: styleValue(style?.bgType, activeServiceStyle?.bgType),
        bgValue: styleValue(style?.bgValue, activeServiceStyle?.bgValue),
        fontFamily: styleValue(style?.fontFamily, activeServiceStyle?.fontFamily),
        fontColor: styleValue(style?.fontColor, activeServiceStyle?.fontColor),
        fontSize: styleValue(style?.fontSize, activeServiceStyle?.fontSize),
      };
      useProyectaStore.setState((prev) => ({
        state: { ...(prev.state || {} as any), ...nextStyle } as any,
      }));
      setStyleSource(`Canción: ${activeItem.title}`);
    };

    const existingStyle = (activeItem as any)._style as { bgType?: string; bgValue?: string; fontFamily?: string; fontColor?: string; fontSize?: number } | undefined;
    const hasValues = existingStyle && (existingStyle.bgType || existingStyle.bgValue || existingStyle.fontFamily || existingStyle.fontColor || existingStyle.fontSize);
    const itemType = (activeItem as any)._type;
    const firstSlide = activeItem.slides?.[0] || '';
    const shouldFetchSongStyle = itemType === 'song' || (!itemType && Boolean(activeItem.id) && !parseStructuredSlide(firstSlide));
    if (hasValues) {
      applyPreviewStyle(existingStyle);
    } else if (shouldFetchSongStyle) {
      fetchSongStyle(activeItem.id).then(style => {
        (activeItem as any)._style = style || undefined;
        applyPreviewStyle(style);
      });
    } else {
      applyPreviewStyle(null);
    }
  }, [selectedQueueIndex, playlist, styleLocked, isConnected, fetchSongStyle, activeServiceStyle]);

  const handleApplySongStyle = useCallback(() => {
    const activeItem = playlist[selectedQueueIndex];
    if (!activeItem) return;
    const existingStyle = (activeItem as any)._style as { bgType?: string; bgValue?: string; fontFamily?: string; fontColor?: string; fontSize?: number } | undefined;
    const hasValues = existingStyle && (existingStyle.bgType || existingStyle.bgValue || existingStyle.fontFamily || existingStyle.fontColor || existingStyle.fontSize);
    if (hasValues) {
      applySongStyle(existingStyle);
      setStyleSource(`Canción: ${activeItem.title}`);
    } else if ((activeItem as any)._type === 'song') {
      fetchSongStyle(activeItem.id).then(style => {
        if (style) {
          applySongStyle(style);
          (activeItem as any)._style = style;
          setStyleSource(`Canción: ${activeItem.title}`);
        }
      });
    }
  }, [playlist, selectedQueueIndex, applySongStyle, fetchSongStyle]);

  const handleApplyServiceStyle = useCallback(() => {
    const style = useProyectaStore.getState().activeServiceStyle;
    if (style && (style.bgType || style.fontFamily || style.fontSize || style.fontColor)) {
      pushUndo();
      setStyle({
        bgType: style.bgType,
        bgValue: style.bgValue,
        fontFamily: style.fontFamily,
        fontColor: style.fontColor,
        fontSize: style.fontSize,
      });
      setStyleSource(`Reunión: ${style.name || 'Cargada'}`);
    }
  }, [setStyle]);

  useEffect(() => {
    if (isConnected) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isConnected, handleKeyDown]);

  useEffect(() => {
    if (playlist.length === 0) {
      setIsLoadingServices(true);
      fetch(`${API_URL}/api/services`)
        .then(res => res.json())
        .then(data => setServices(data))
        .catch(() => toast('Error al cargar reuniones', 'error'))
        .finally(() => setIsLoadingServices(false));
    }
  }, [playlist.length]);

  if (!isConnected) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background h-full font-headline font-black uppercase tracking-[0.2em] text-outline text-xl animate-pulse">
        Iniciando Módulo de Transmisión...
      </div>
    );
  }

  return (
    <main ref={containerRef} className="flex-1 p-4 lg:p-8 flex flex-col lg:flex-row gap-4 lg:gap-0 overflow-y-auto lg:overflow-hidden bg-background h-full font-body">
      {/* Column 1: Song List (Left) */}
      <div
        style={isDesktop ? { flexBasis: `${colWidths[0]}%`, width: `${colWidths[0]}%` } : undefined}
        className="lg:flex-none flex flex-col gap-4 min-h-[300px] lg:min-h-0 lg:overflow-hidden border border-outline-variant/20 order-2 lg:order-1"
      >
        {activePlaylistTitle && (
          <div className="bg-primary text-on-primary px-4 py-2 text-xs font-headline font-bold uppercase tracking-widest truncate shrink-0 items-center flex gap-2">
            <span className="material-symbols-outlined text-[14px]">sensors</span> {activePlaylistTitle}
          </div>
        )}
        <div className="bg-surface-container-highest p-4 flex items-center justify-between text-on-surface-variant flex-shrink-0">
          <div className="flex items-center gap-2 w-full">
            <span className="material-symbols-outlined text-[18px]">search</span>
            <input className="bg-transparent border-none focus:ring-0 w-full font-body font-medium text-sm placeholder:text-outline outline-none" placeholder="Buscar en cola..." type="text"/>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setShowAddSongModal(true); if (availableSongs.length === 0) { setIsLoadingSongs(true); fetch(`${API_URL}/api/songs`).then(r => r.json()).then(setAvailableSongs).finally(() => setIsLoadingSongs(false)); } }}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-on-primary font-headline font-bold text-[10px] uppercase tracking-widest hover:bg-primary-container transition-colors"
              title="Agregar canción"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              <span>Agregar</span>
            </button>
            <span className="bg-surface-container-low px-2 py-1 text-xs font-headline font-black rounded-sm">{playlist.length}</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto bg-surface-container-low flex flex-col p-2 gap-1">
          {playlist.length === 0 ? (
            <div className="p-8 text-center flex flex-col gap-4">
              {state?.slides && state?.slides !== '[""]' && (
                <div className="bg-surface-variant/30 text-on-surface-variant p-4 font-headline text-xs rounded text-center border border-outline-variant/50">
                   {state.title ? `Restaurando sesión de: ${state.title}...` : 'Esperando asignación de reunión...'}
                </div>
              )}
              <span className="text-outline text-sm font-medium block mb-2">No hay una reunión cargada.</span>
              {isLoadingServices && (
                <div className="flex items-center gap-2 text-outline text-xs font-headline uppercase tracking-widest py-4">
                  <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                  Buscando reuniones...
                </div>
              )}
              {!isLoadingServices && services.length > 0 && (
                <div className="flex flex-col gap-2 text-left">
                  <h4 className="font-headline font-bold text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Carga Rápida de Reuniones:</h4>
                  {services.map(srv => (
                     <button 
                       key={srv.id} 
                        onClick={() => {
                           setIsLoadingPlaylist(true);
                           const playlistQueue = srv.items.map((item) => {
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
                                  slides: item.song.parts?.length ? item.song.parts.map((p) => p.content) : ["Sin estrofas"],
                                  _type: 'song',
                                  _slideLabels: item.song.parts?.length ? item.song.parts.map((p) => p.type) : undefined,
                                  _style: songStyle,
                                  _serviceItemId: item.id,
                                };
                              }
                              if (item.type === 'DECK' && item.deck) {
                                return {
                                  id: item.deck.id,
                                  title: item.deck.title,
                                  slides: item.deck.slides?.length ? item.deck.slides.map((s) => s.text || " ") : [" "],
                                  _type: 'deck',
                                  _slideLabels: item.deck.slides?.length ? item.deck.slides.map(() => 'Diapositiva') : undefined,
                                  _serviceItemId: item.id,
                                };
                              }
                              if (item.type === 'MEDIA' && item.mediaAsset) {
                                return {
                                  id: item.mediaAsset.id,
                                  title: item.mediaAsset.title,
                                  slides: [JSON.stringify({ type: 'MEDIA_SLIDE', url: item.mediaAsset.url, mediaType: item.mediaAsset.type })],
                                  _type: item.mediaAsset.type === 'VIDEO' ? 'media-video' : 'media-image',
                                  _slideLabels: [item.mediaAsset.type === 'VIDEO' ? 'Video' : 'Imagen'],
                                  _serviceItemId: item.id,
                                };
                              }
                               return { id: item.id, title: "Multimedia", slides: ["\n[ CONTENIDO MULTIMEDIA ]\n\n(Pendiente integración externa)\n"], _type: 'media', _slideLabels: ["Media"], _serviceItemId: item.id };
                           });
                           storeServiceStyle({
                             bgType: srv.bgType,
                             bgValue: srv.bgValue,
                             fontFamily: srv.fontFamily,
                             fontColor: srv.fontColor,
                             fontSize: srv.fontSize,
                             name: srv.name,
                            });
                           setPlaylist(srv.id, srv.name, playlistQueue.length ? playlistQueue : [{ id: 'empty', title: 'Reunión Vacía', slides: ["Sin elementos"] }]);
                           setStyleSource(srv.bgType || srv.fontFamily ? `Reunión: ${srv.name}` : '');
                            setIsLoadingPlaylist(false);
                         }}
                       className="bg-surface-container hover:bg-primary/20 text-on-surface hover:text-primary transition-colors p-3 font-headline font-bold text-xs uppercase text-left border-l-2 border-transparent hover:border-primary truncate flex items-center gap-2 disabled:opacity-50"
                      disabled={isLoadingPlaylist}
                     >
                        {srv.name}
                        {isLoadingPlaylist && <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>}
                      </button>
              ))}
                </div>
              )}
            </div>
          ) : (
            playlist.map((item, idx) => {
              const isActive = idx === selectedQueueIndex;
              return (
                <div key={idx} onClick={() => selectQueueItem(idx)}
                  className={`p-4 text-sm cursor-pointer transition-colors flex items-center group ${isActive ? 'bg-surface-container text-on-surface font-bold border-l-4 border-primary' : 'hover:bg-surface-container-highest text-on-surface-variant'}`}
                >
                  <div className="flex-1 flex items-center min-w-0">
                    <span className="material-symbols-outlined text-[14px] opacity-70 mr-2 shrink-0">
                      {(item as any)._type === 'song' ? 'music_note' :
                       (item as any)._type === 'deck' ? 'auto_awesome_mosaic' :
                       (item as any)._type === 'media-video' ? 'smart_display' :
                       (item as any)._type === 'media-image' || (item as any)._type === 'media' ? 'image' :
                       'music_note'}
                    </span>
                    <span className="truncate">{idx + 1}. {item.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingRemoveItem({
                        index: idx,
                        title: item.title,
                        serviceItemId: (item as any)._serviceItemId,
                      });
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:bg-error/10 rounded p-1 transition-all ml-2 shrink-0"
                    title="Quitar de la lista"
                  >
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-error">close</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ColumnResizeHandle onMouseDown={startDrag(0)} onDoubleClick={resetWidths} orderClass="lg:order-2" />

      <ConfirmDialog
        open={!!pendingRemoveItem}
        title="Quitar de la lista"
        message={`¿Seguro que querés quitar "${pendingRemoveItem?.title || 'este elemento'}" de la lista de reproducción? No se eliminará del catálogo.`}
        confirmLabel="Quitar"
        cancelLabel="Cancelar"
        danger
        onConfirm={confirmRemovePlaylistItem}
        onCancel={() => setPendingRemoveItem(null)}
      />

      {/* Add Song Modal */}
      {showAddSongModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowAddSongModal(false)}>
          <div className="bg-surface w-full max-w-md border border-outline-variant/30 shadow-2xl flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30 shrink-0">
              <h3 className="font-headline font-black text-sm uppercase tracking-widest text-on-surface">Agregar Canción</h3>
              <button onClick={() => setShowAddSongModal(false)} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-3 border-b border-outline-variant/20 shrink-0">
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[16px]">search</span>
                <input
                  className="w-full bg-surface-container-low border-b-2 border-outline-variant/30 focus:border-primary outline-none transition-colors py-2.5 pl-10 pr-3 font-mono text-[11px] text-on-surface placeholder-on-surface-variant/50 tracking-wider uppercase"
                  placeholder="BUSCAR CANCIÓN..."
                  value={addSongSearch}
                  onChange={e => setAddSongSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoadingSongs ? (
                <div className="p-6 text-center">
                  <span className="material-symbols-outlined animate-spin text-2xl text-on-surface-variant/40">progress_activity</span>
                </div>
              ) : (
                availableSongs
                  .filter((s: any) => 
                    s.title.toLowerCase().includes(addSongSearch.toLowerCase()) ||
                    (s.author || '').toLowerCase().includes(addSongSearch.toLowerCase())
                  )
                  .slice(0, 30)
                  .map((song: any) => (
                    <button
                      key={song.id}
                      onClick={async () => {
                        const parts = song.parts || [];
                        const newItem = {
                          id: song.id,
                          title: song.title,
                          slides: parts.map((p: any) => p.content),
                          _type: 'song',
                          _slideLabels: parts.map((p: any) => p.type),
                          _style: song.themeBgType ? {
                            bgType: song.themeBgType,
                            bgValue: song.themeBgValue,
                            fontFamily: song.themeFontFamily,
                            fontColor: song.themeFontColor,
                            fontSize: song.themeFontSize,
                          } : undefined,
                        } as any;
                        
                        const store = useProyectaStore.getState();
                        if (store.activePlaylistId) {
                          try {
                            const res = await fetch(`${API_URL}/api/services/${store.activePlaylistId}/items`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ type: 'SONG', songId: song.id }),
                            });
                            const data = await res.json();
                            newItem._serviceItemId = data.id;
                          } catch {}
                        }
                        
                        store.addToPlaylist(newItem);
                        setShowAddSongModal(false);
                        setAddSongSearch('');
                      }}
                      className="w-full text-left p-4 hover:bg-surface-container transition-colors flex items-center gap-3 border-b border-outline-variant/10"
                    >
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">music_note</span>
                      <div className="min-w-0">
                        <p className="text-on-surface text-sm font-headline font-bold truncate">{song.title}</p>
                        {song.author && <p className="text-on-surface-variant text-[11px] truncate">{song.author}</p>}
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Terminar Transmisión */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEndModal(false)}>
          <div className="bg-surface border border-outline-variant/30 shadow-2xl p-8 max-w-sm w-full mx-4 flex flex-col gap-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-2">
              <h2 className="font-headline font-black uppercase tracking-widest text-on-surface text-lg">Terminar Transmisión</h2>
              <p className="text-on-surface-variant text-sm font-body leading-relaxed">
                La pantalla se apagará y la lista de reproducción se limpiará. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowEndModal(false)} className="flex-1 bg-surface-container-highest hover:bg-surface-container text-on-surface font-headline font-bold text-xs uppercase tracking-widest py-3 transition-colors">
                Cancelar
              </button>
              <button onClick={() => { clearLive(); setShowEndModal(false); }} className="flex-1 bg-error hover:bg-error/90 text-on-error font-headline font-bold text-xs uppercase tracking-widest py-3 transition-colors shadow-[0_4px_0_0_theme(colors.error-container)] active:translate-y-1 active:shadow-none">
                Sí, terminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column 2: Slides/Stanzas (Center) */}
      <div
        style={isDesktop ? { flexBasis: `${colWidths[1]}%`, width: `${colWidths[1]}%` } : undefined}
        className="lg:flex-none flex flex-col min-h-[400px] lg:min-h-0 lg:overflow-hidden bg-surface-container-low border border-outline-variant/20 order-3 lg:order-3"
      >
        <div className="p-4 bg-surface-container-highest flex justify-between items-center h-16 shrink-0 border-b border-outline-variant/20">
          <h3 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface truncate pr-4">
            {activeItem?.title || "NO SELECCIONADO"}
          </h3>
          <span className="text-[10px] font-bold text-secondary bg-secondary/10 px-2 py-1 truncate shrink-0 hidden md:block">
            STAGING PREVIEW {isFrozen && '(FROZEN)'}
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-max content-start">
          {!activeItem ? (
            <div className="col-span-full h-full flex items-center justify-center text-outline">Nada que previsualizar.</div>
          ) : (
            activeItem.slides.map((slideContent, idx) => {
              const isActive = idx === localSlideIndex;
              let mediaData: { url: string; mediaType: string } | null = null;
              let deckSlide: any = null;
              let slideText = slideContent;
              const parsedSlide = parseStructuredSlide(slideContent);
              if (parsedSlide?.type === 'MEDIA_SLIDE') {
                mediaData = parsedSlide;
                slideText = '';
              } else if (parsedSlide?.type === 'DECK_SLIDE') {
                deckSlide = parsedSlide;
                slideText = parsedSlide.text || '';
              }
              return (
                <div key={idx} onClick={() => goToSlide(idx)}
                  className={`cursor-pointer transition-transform overflow-hidden border-2 ${
                    isActive 
                      ? 'border-primary shadow-[0_10px_20px_rgba(0,103,103,0.2)] scale-[1.02] z-10' 
                      : 'border-outline-variant/20 hover:border-outline'
                  }`}
                >
                  <div className={`flex items-center justify-between px-2 py-1.5 ${
                    isActive ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface-variant'
                  }`}>
                    <span className="font-headline font-black text-xs tracking-wider">{idx + 1}</span>
                    <span className="font-headline font-bold text-[9px] uppercase tracking-widest opacity-80 truncate ml-2 text-right">
                      {(activeItem as any)?._slideLabels?.[idx] || (mediaData ? (mediaData.mediaType === 'VIDEO' ? 'Video' : 'Imagen') : deckSlide ? 'Deck' : (slideText ? slideText.split('\n')[0].trim().slice(0, 25) : ''))}
                    </span>
                  </div>
                  <ScreenCanvas
                    state={state ?? undefined}
                    deckSlideData={deckSlide}
                    text={slideText}
                    videoAutoplay={false}
                  >
                    {mediaData ? (
                      <div className="absolute inset-0 z-10">
                        {mediaData.mediaType === 'VIDEO' ? (
                          <video src={mediaData.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                        ) : (
                          <img src={mediaData.url} alt="" className="w-full h-full object-cover" />
                      )}
                      </div>
                    ) : null}
                  </ScreenCanvas>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ColumnResizeHandle onMouseDown={startDrag(1)} onDoubleClick={resetWidths} orderClass="lg:order-4" />

      {/* Column 3: Preview & Controls (Right) */}
      <div
        style={isDesktop ? { flexBasis: `${colWidths[2]}%`, width: `${colWidths[2]}%` } : undefined}
        className="lg:flex-none flex flex-col gap-4 order-1 lg:order-5"
      >
        {/* Status indicators bar */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 font-headline font-black uppercase tracking-widest text-[10px]">
            <div
              className={`rounded-full ${isFrozen ? 'bg-blue-500' : (state?.slides === '[""]' || !state?.slides) ? 'bg-white/60' : 'bg-red-500 animate-pulse'}`}
              style={{ width: 8, height: 8 }}
            />
            <span className={isFrozen ? 'text-blue-400' : (state?.slides === '[""]' || !state?.slides) ? 'text-on-surface-variant' : 'text-red-400'}>
              {isFrozen ? 'CONGELADO' : (state?.slides === '[""]' || !state?.slides) ? 'EN ESPERA' : 'PROYECTANDO VIVO'}
            </span>
          </div>
          {isVideoLive && displayStatusText && (
            <div className="flex items-center gap-1 font-headline font-bold text-[10px] uppercase">
              <div
                className={`rounded-full ${displayStatusColor} ${displayStatusAnimate ? 'animate-pulse' : ''}`}
                style={{ width: 8, height: 8 }}
              />
              <span className="text-on-surface-variant">{displayStatusText}</span>
            </div>
          )}
          {/* Health indicator */}
          <HealthDot />
        </div>

        {/* Live Preview — identical to display */}
        <ScreenCanvas
          state={state ?? undefined}
          deckSlideData={previewDeckSlide}
          text={previewSlideText && previewSlideText !== "SIN CONTENIDO" ? previewSlideText : ''}
          placeholderText="Urban Proyecta"
          className="shrink-0 shadow-inner"
        >
          {isVideoLive && currentPreviewUrl ? (
            <video
              ref={previewVideoRef}
              key={currentPreviewUrl}
              src={currentPreviewUrl}
              className="absolute inset-0 w-full h-full object-cover z-10"
              loop
              playsInline
              muted
              preload="auto"
              onLoadedMetadata={(e) => {
                setVideoDuration(e.currentTarget.duration);
              }}
            />
          ) : previewMediaData ? (
            <div className="absolute inset-0 z-10">
              {previewMediaData.mediaType === 'VIDEO' ? (
                <video src={previewMediaData.url} className="w-full h-full object-cover" loop muted playsInline />
              ) : (
                <MediaSlide url={previewMediaData.url} mediaType="IMAGE" />
              )}
            </div>
          ) : null}
        </ScreenCanvas>

        {/* Media Controls */}
        {isVideoLive && currentPreviewUrl && (
          <MediaControls
            isPlaying={isVideoPlaying}
            currentTime={videoTime}
            duration={videoDuration}
            volume={videoVolume}
            onPlayPause={handleVideoPlayPause}
            onStop={handleVideoStop}
            onSeek={handleVideoSeek}
            onVolumeChange={handleVideoVolume}
          />
        )}

        {/* Slide Navigation */}
        <div className="grid grid-cols-2 gap-4">
          <button onClick={prevSlide} aria-label="Diapositiva anterior" className="bg-surface-container-low hover:bg-surface-container-highest text-on-surface h-24 flex flex-col items-center justify-center gap-2 transition-colors border border-outline-variant/20 active:scale-95 touch-manipulation">
            <span className="material-symbols-outlined text-3xl">arrow_upward</span>
            <span className="font-headline font-black uppercase text-xs tracking-widest">ANTERIOR</span>
          </button>
          <button onClick={nextSlide} aria-label="Diapositiva siguiente" className="bg-primary hover:bg-primary-container text-white h-24 flex flex-col items-center justify-center gap-2 transition-colors shadow-[0_10px_20px_rgba(0,103,103,0.2)] active:scale-95 touch-manipulation">
            <span className="material-symbols-outlined text-3xl">arrow_downward</span>
            <span className="font-headline font-black uppercase text-xs tracking-widest">SIGUIENTE</span>
          </button>
        </div>

        {/* Freeze / Unfreeze */}
        {isTransmissionActive && (
          <div className="flex w-full">
            {isFrozen ? (
              <button onClick={() => {
                if (localSlideIndex < 0) {
                  toast('Selecciona una diapositiva primero', 'warn');
                  return;
                }
                activarLive();
              }}
                className="w-full bg-error hover:bg-error-container hover:text-error text-on-error h-16 font-headline font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors shadow-[0_4px_0_0_theme(colors.error-container)] active:translate-y-1 active:shadow-none"
              >
                <span className="material-symbols-outlined font-black">bolt</span>
                PROYECTAR A PANTALLA
              </button>
            ) : (
              <button onClick={toggleFreeze}
                className="w-full bg-surface-container-low hover:bg-surface-container-highest border-2 border-outline-variant/50 text-on-surface hover:border-primary hover:text-primary h-16 font-headline font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors active:scale-95"
              >
                <span className="material-symbols-outlined font-black">pause_circle</span>
                PAUSAR PROYECCIÓN
              </button>
            )}
          </div>
        )}

        {/* Terminar Transmisión */}
        {isTransmissionActive && (
          <button
            onClick={() => setShowEndModal(true)}
            className="flex items-center justify-center gap-2 font-headline font-bold text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-error transition-colors h-10 bg-surface-container-low hover:bg-surface-container border border-outline-variant/20"
          >
            <span className="material-symbols-outlined text-[16px]">power_settings_new</span>
            Terminar Transmisión
          </button>
        )}

        {/* Style Panel Toggle */}
        <button
          onClick={() => setShowStylePanel(!showStylePanel)}
          className="bg-surface-container-low hover:bg-surface-container text-on-surface h-10 flex items-center justify-center gap-2 transition-colors border border-outline-variant/20 font-headline font-bold text-[10px] uppercase tracking-widest"
        >
          <span className="material-symbols-outlined text-[16px]">{showStylePanel ? 'expand_less' : 'palette'}</span>
          Estilo en Vivo
        </button>

        {/* Style Panel */}
        {showStylePanel && (
          <div className="bg-surface-container p-4 flex flex-col gap-3 border border-outline-variant/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStyleLocked(!styleLocked)}
                  className={`${styleLocked ? 'text-error' : 'text-outline'} hover:text-primary transition-colors`}
                  title={styleLocked ? 'Estilo bloqueado — no se auto-aplica' : 'Auto-aplicar estilos de canción/reunión'}
                >
                  <span className="material-symbols-outlined text-[16px]">{styleLocked ? 'lock' : 'lock_open'}</span>
                </button>
                {styleSource ? (
                  <span className="text-[9px] font-headline font-bold uppercase text-secondary truncate max-w-[120px]">{styleSource}</span>
                ) : (
                  <span className="text-[9px] font-headline font-bold uppercase text-outline truncate">Estilo manual</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleApplyServiceStyle}
                  disabled={!activeServiceStyle}
                  className="text-[9px] font-headline font-bold uppercase text-outline hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Aplicar estilo de la reunión"
                >
                  Reunión
                </button>
                <button
                  onClick={handleApplySongStyle}
                  disabled={!playlist[selectedQueueIndex] || !(playlist[selectedQueueIndex] as any)?._style}
                  className="text-[9px] font-headline font-bold uppercase text-outline hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Aplicar estilo de la canción activa"
                >
                  Canción
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-headline font-bold text-[10px] uppercase tracking-widest text-on-surface-variant">Tipografia</span>
              <button onClick={() => { pushUndo(); resetStyle(); }} className="text-[10px] font-headline font-bold uppercase text-error hover:text-error-container transition-colors">
                Restaurar
              </button>
            </div>

            <select
              value={liveFontFamily}
              onChange={e => { setLiveFontFamily(e.target.value); loadFont(e.target.value); debouncedSetStyle({ fontFamily: e.target.value }); }}
              className="bg-surface-container-low border-b border-outline-variant py-2 px-2 text-xs font-bold uppercase text-on-surface focus:border-primary outline-none"
            >
              <option value="">Default (Epilogue)</option>
              <option value="Inter">Inter</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Roboto">Roboto</option>
              <option value="Open Sans">Open Sans</option>
              <option value="Poppins">Poppins</option>
              <option value="Lato">Lato</option>
              <option value="Raleway">Raleway</option>
              <option value="Oswald">Oswald</option>
              <option value="Playfair Display">Playfair Display</option>
            </select>

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-headline font-bold uppercase text-on-surface-variant shrink-0">Color</label>
              <input type="color" value={liveFontColor || '#ffffff'} onChange={e => { setLiveFontColor(e.target.value); debouncedSetStyle({ fontColor: e.target.value }); }} className="w-7 h-7 cursor-pointer border-0 p-0" />

(Showing lines 808-813 of 909. Use offset=790 to continue.)

            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-headline font-bold uppercase text-on-surface-variant shrink-0">Tamano</label>
              <input type="range" min="0.5" max="2.5" step="0.1" value={liveFontSize} onChange={e => { const v = parseFloat(e.target.value); setLiveFontSize(v); debouncedSetStyle({ fontSize: v }); }} className="flex-1" />
              <span className="text-[10px] font-mono w-8 text-right">{liveFontSize.toFixed(1)}x</span>
            </div>

            <div className="border-t border-outline-variant/30 pt-3 mt-1">
              <span className="font-headline font-bold text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">Fondo</span>
              <select
                value={liveBgType || 'COLOR'}
                onChange={e => { const v = e.target.value; setLiveBgType(v); setLiveBgValue(v === 'COLOR' ? '#1a1a2e' : ''); debouncedSetStyle({ bgType: v, bgValue: v === 'COLOR' ? '#1a1a2e' : '' }); }}
                className="w-full bg-surface-container-low border-b border-outline-variant py-2 px-2 text-xs font-bold uppercase text-on-surface focus:border-primary outline-none"
              >
                <option value="COLOR">Color Solido</option>
                <option value="IMAGE">Imagen</option>
                <option value="VIDEO">Video Loop</option>
              </select>
            </div>

            {liveBgType === 'COLOR' && (
              <div className="flex items-center gap-2">
                <input type="color" value={liveBgValue || '#1a1a2e'} onChange={e => { setLiveBgValue(e.target.value); debouncedSetStyle({ bgValue: e.target.value }); }} className="w-7 h-7 cursor-pointer border-0 p-0" />
                <input value={liveBgValue || '#1a1a2e'} onChange={e => { setLiveBgValue(e.target.value); debouncedSetStyle({ bgValue: e.target.value }); }} className="flex-1 bg-surface-container-low border-b border-outline-variant px-2 py-1 text-[10px] font-mono outline-none" />
              </div>
            )}

            {liveBgType !== 'COLOR' && (
              <input
                value={liveBgValue || ''}
                onChange={e => { setLiveBgValue(e.target.value); debouncedSetStyle({ bgValue: e.target.value }); }}
                className="w-full bg-surface-container-low border-b border-outline-variant px-2 py-1 text-[10px] font-mono outline-none"
                placeholder="URL de imagen o video..."
              />
            )}
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <button
          onClick={() => setShowShortcuts(!showShortcuts)}
          className="text-[10px] font-headline font-bold uppercase tracking-widest text-outline hover:text-on-surface-variant transition-colors flex items-center gap-1 self-start"
        >
          <span className="material-symbols-outlined text-[14px]">keyboard</span>
          Atajos {showShortcuts ? '▲' : '▼'}
        </button>
        {showShortcuts && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-mono text-outline bg-surface-container-low border border-outline-variant/20 p-2">
            <span><kbd className="px-1 bg-surface-container-highest border border-outline-variant/40 text-[10px]">← →</kbd> Navegar</span>
            <span><kbd className="px-1 bg-surface-container-highest border border-outline-variant/40 text-[10px]">F</kbd> Congelar</span>
            <span><kbd className="px-1 bg-surface-container-highest border border-outline-variant/40 text-[10px]">Espacio</kbd> Video</span>
            <span><kbd className="px-1 bg-surface-container-highest border border-outline-variant/40 text-[10px]">Ctrl+Z</kbd> Deshacer estilo</span>
            <span><kbd className="px-1 bg-surface-container-highest border border-outline-variant/40 text-[10px]">Ctrl+Shift+Z</kbd> Rehacer</span>
          </div>
        )}
      </div>

    </main>
  );
}
