"use client";
import { useEffect, useState, useCallback, useRef } from 'react';
import { API_URL } from '@/lib/api';
import { useStageAnnotations } from './useStageAnnotations';
import ProfileGate from './ProfileGate';
import SongMeta from './SongMeta';
import AnnotationSheet from './AnnotationSheet';
import { TAG_MAP, withAlpha, partKey, LAP_DEF, LAP_ORDINAL } from './annotations';

const STORAGE_KEY = 'stage_data';
const POLL_INTERVAL = 30000;

type SongPart = { order: number; type: string; content: string };
type StageSong = { id: string; title: string; author: string | null; parts: SongPart[] };
type StageItem = { id: string; order: number; type: string; song?: StageSong; deck?: any; mediaAsset?: any };
type StageService = { id: string; name: string; date: string; fontFamily?: string; fontColor?: string; fontSize?: number; bgType?: string; bgValue?: string; updatedAt?: string };

interface StageData {
  service: StageService;
  items: StageItem[];
  _hash: string;
  loadedAt: number;
}

type ViewMode = 'list' | 'slide';

export default function StagePage() {
  const [services, setServices] = useState<any[]>([]);
  const [stageData, setStageData] = useState<StageData | null>(null);
  const [initialData, setInitialData] = useState<StageData | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [darkMode, setDarkMode] = useState(true);
  const [fontScale, setFontScale] = useState(1.2);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [slideIdx, setSlideIdx] = useState(0);
  const [showSongList, setShowSongList] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  // Anotaciones de músicos
  const [nightMode, setNightMode] = useState(false);
  const [dimLevel, setDimLevel] = useState(0); // 0 = 100%, 1 = 70%, 2 = 45%
  const [focusMine, setFocusMine] = useState(false);
  const [annPart, setAnnPart] = useState<{ key: string; label: string; text: string } | null>(null);
  const touchStartX = useRef(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const lastServiceIdRef = useRef<string | null>(null);

  const saveToLocalStorage = useCallback((data: StageData, idx: number) => {
    try {
      const payload = {
        serviceId: data.service.id,
        currentIdx: idx,
        data,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem('stage_lastServiceId', data.service.id);
    } catch { /* ignore */ }
  }, []);

  // Inject fade animation keyframe for slide transitions
  useEffect(() => {
    if (document.getElementById('stage-fade-style')) return;
    const style = document.createElement('style');
    style.id = 'stage-fade-style';
    style.textContent = `
      @keyframes fadeSlideIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  const loadFromLocalStorage = useCallback((): { data: StageData; idx: number } | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.data?.loadedAt) return null;
      const age = Date.now() - parsed.data.loadedAt;
      if (age > 3600000) return null;
      return { data: parsed.data as StageData, idx: parsed.currentIdx ?? 0 };
    } catch {
      return null;
    }
  }, []);

  const navigateTo = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentIdx > 0) {
      const newIdx = currentIdx - 1;
      setCurrentIdx(newIdx);
      setSlideIdx(0);
      saveToLocalStorage(displayData!, newIdx);
    } else if (direction === 'next' && currentIdx < (displayData?.items.length ?? 0) - 1) {
      const newIdx = currentIdx + 1;
      setCurrentIdx(newIdx);
      setSlideIdx(0);
      saveToLocalStorage(displayData!, newIdx);
    }
  };

  const fetchStageData = useCallback(async (serviceId: string, silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/stage/service/${serviceId}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const data: StageData = {
        service: json.service,
        items: json.items,
        _hash: json._hash,
        loadedAt: Date.now(),
      };
      setStageData(data);
      setIsOffline(false);

      const cached = loadFromLocalStorage();
      let idx = 0;
      if (cached && cached.data.service.id === serviceId && cached.idx < data.items.length) {
        idx = cached.idx;
      }
      setCurrentIdx(idx);
      setSlideIdx(0);
      saveToLocalStorage(data, idx);
    } catch {
      setIsOffline(true);
      if (!stageData) {
        const cached = loadFromLocalStorage();
        if (cached) {
          setStageData(cached.data);
          setCurrentIdx(cached.idx);
          setSlideIdx(0);
        }
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [stageData, loadFromLocalStorage, saveToLocalStorage]);

  const handleSelectService = useCallback((serviceId: string) => {
    setShowServicePicker(false);
    lastServiceIdRef.current = serviceId;
    fetchStageData(serviceId);
  }, [fetchStageData]);

  // Initialization
  useEffect(() => {
    const savedDark = localStorage.getItem('stage_darkMode');
    if (savedDark === 'false') setDarkMode(false);

    const savedScale = localStorage.getItem('stage_fontScale');
    if (savedScale) {
      const n = parseFloat(savedScale);
      if (!isNaN(n) && n >= 0.8 && n <= 2.2) setFontScale(n);
    } else {
      setFontScale(window.innerWidth < 768 ? 1.0 : 1.2);
    }

    const savedViewMode = localStorage.getItem('stage_viewMode');
    if (savedViewMode === 'slide' || savedViewMode === 'list') {
      setViewMode(savedViewMode as ViewMode);
    }

    if (localStorage.getItem('stage_nightMode') === 'true') setNightMode(true);
    const savedDim = localStorage.getItem('stage_dim');
    if (savedDim) {
      const n = parseInt(savedDim, 10);
      if (n >= 0 && n <= 2) setDimLevel(n);
    }

    // Instant load from localStorage
    const cached = loadFromLocalStorage();
    if (cached) {
      setInitialData(cached.data);
      setCurrentIdx(cached.idx);
    }

    fetch(`${API_URL}/api/services`)
      .then((r) => r.json())
      .then((list) => {
        const arr = Array.isArray(list) ? list : list.services ?? [];
        setServices(arr);
        const lastId = localStorage.getItem('stage_lastServiceId');
        if (!lastId && arr.length > 0) {
          const latestId = arr[0].id;
          localStorage.setItem('stage_lastServiceId', latestId);
          lastServiceIdRef.current = latestId;
          fetchStageData(latestId, !!cached);
        } else {
          const targetId = lastId && arr.some((s: any) => s.id === lastId) ? lastId : arr[0]?.id;
          if (targetId) {
            lastServiceIdRef.current = targetId;
            fetchStageData(targetId, !!cached);
          } else {
            setIsLoading(false);
          }
        }
      })
      .catch(() => {
        setIsLoading(false);
        if (cached) {
          setIsOffline(true);
        }
      });
  }, []);

  // Polling
  useEffect(() => {
    if (!stageData) return;

    pollRef.current = setInterval(async () => {
      const sid = lastServiceIdRef.current;
      if (!sid) return;
      try {
        const res = await fetch(`${API_URL}/api/stage/service/${sid}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json._hash !== stageData._hash) {
          const data: StageData = {
            service: json.service,
            items: json.items,
            _hash: json._hash,
            loadedAt: Date.now(),
          };
          setStageData(data);
          setIsOffline(false);

          let idx = currentIdx;
          if (idx >= data.items.length) {
            idx = data.items.length - 1;
          }
          if (idx < 0) idx = 0;
          setCurrentIdx(idx);
          saveToLocalStorage(data, idx);
        }
      } catch { /* silent poll failure */ }
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [stageData?.service?.id, stageData?._hash]);

  const displayData = stageData || initialData;
  const currentItem = displayData?.items[currentIdx];
  const isSong = currentItem?.type === 'SONG';
  const song = currentItem?.song;
  const prevItem = displayData && currentIdx > 0 ? displayData.items[currentIdx - 1] : null;
  const nextItem = displayData && currentIdx < displayData.items.length - 1 ? displayData.items[currentIdx + 1] : null;

  // ── Anotaciones personales del cantante ──
  const notes = useStageAnnotations(displayData?.service?.id ?? null);
  const songAnn = notes.annForSong(song?.id);
  const hasActiveMarks = !!song?.parts?.some((p) => {
    const m = songAnn?.parts[partKey(p)];
    return m?.tag && m.tag !== 'SILENT';
  });

  // Paleta del área de contenido (modo noche = ámbar sobre negro cálido)
  const contentBg = nightMode ? '#0a0503' : darkMode ? '#0a0a0a' : '#ffffff';
  const contentColor = nightMode ? '#ffb37a' : darkMode ? '#e5e5e5' : '#1a1a1a';
  const isDark = darkMode || nightMode;
  // Barras de herramientas: fondo OPACO (evita el gris de translúcido-sobre-blanco) con leve elevación
  const chromeBg = nightMode ? '#1c0f07' : darkMode ? '#18181b' : '#f4f4f5';
  const chromeBorder = nightMode ? '#3a2010' : darkMode ? '#27272a' : '#e5e7eb';
  const cycleDim = () => {
    const v = (dimLevel + 1) % 3;
    setDimLevel(v);
    localStorage.setItem('stage_dim', String(v));
  };

  const headerBg = darkMode ? 'bg-black/90' : 'bg-white/90';
  const headerBorder = darkMode ? 'border-gray-800' : 'border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-500' : 'text-gray-400';

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
    setSwipeOffset(0);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const diff = touchStartX.current - e.touches[0].clientX;
    setSwipeOffset(diff);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    setIsSwiping(false);
    setSwipeOffset(0);
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && slideIdx < (song?.parts?.length || 1) - 1) setSlideIdx(slideIdx + 1);
      else if (diff < 0 && slideIdx > 0) setSlideIdx(slideIdx - 1);
    }
  };

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'dark' : ''}`} style={{ backgroundColor: contentBg }}>
      {isOffline && (
        <div className="bg-amber-500 text-black text-center text-xs font-bold py-1 px-4">
          Sin conexion — usando datos en cache
        </div>
      )}

      {isLoading && !displayData ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 font-headline uppercase tracking-widest text-sm animate-pulse">Cargando...</p>
        </div>
      ) : displayData ? (
        <>
          {/* Header */}
          <div className={`sticky top-0 z-10 flex items-center gap-1 px-2 sm:px-4 py-1.5 ${headerBg} backdrop-blur border-b ${headerBorder} transition-transform duration-300 ${headerVisible ? 'translate-y-0' : '-translate-y-full'}`}>
            {/* LEFT COLUMN: prev + font size — balancea con la derecha */}
            <div className="flex items-center shrink-0 gap-0.5 w-12 sm:w-auto justify-start">
              <button onClick={() => navigateTo('prev')} disabled={currentIdx === 0}
                title={prevItem?.song?.title || ''}
                className={`p-1 min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors ${
                  currentIdx === 0
                    ? (darkMode ? 'text-gray-800 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
                    : (darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')
                }`}>
                <span className="material-symbols-outlined text-[22px] sm:text-[26px]">chevron_left</span>
              </button>
              <div className="hidden sm:flex items-center gap-0.5 ml-1">
                <button onClick={() => { const v = Math.max(0.8, fontScale - 0.1); setFontScale(v); localStorage.setItem('stage_fontScale', String(v)); }}
                  className="p-1 min-w-[28px] min-h-[28px] text-gray-500 hover:text-gray-300 text-[9px] font-black">A-</button>
                <button onClick={() => { const v = Math.min(2.2, fontScale + 0.1); setFontScale(v); localStorage.setItem('stage_fontScale', String(v)); }}
                  className="p-1 min-w-[28px] min-h-[28px] text-gray-500 hover:text-gray-300 text-[9px] font-black">A+</button>
                <button onClick={() => setHeaderVisible(false)}
                  className="hidden sm:flex p-1 min-w-[28px] min-h-[28px] text-gray-500 hover:text-gray-300 items-center justify-center" title="Ocultar barra">
                  <span className="material-symbols-outlined text-[16px]">expand_less</span>
                </button>
              </div>
            </div>

            {/* CENTER: titulo — flex-1 para ocupar el espacio y centrar */}
            <div className="flex-1 text-center min-w-0">
              <p className={`font-headline font-bold text-xs sm:text-base uppercase tracking-tight truncate ${textPrimary}`}>
                {isSong ? song?.title : currentItem?.deck?.title || currentItem?.mediaAsset?.title || 'Sin titulo'}
              </p>
              {isSong && song?.author && (
                <p className={`text-[9px] sm:text-[10px] truncate ${textSecondary}`}>{song.author}</p>
              )}
              <p className={`text-[9px] sm:text-[10px] font-mono tracking-wider ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                {currentIdx + 1} / {displayData.items.length}
              </p>
            </div>

            {/* RIGHT COLUMN: tools + dropdown + next */}
            <div className="flex items-center shrink-0 gap-0.5 w-12 sm:w-auto justify-end">
              {/* DESKTOP TOOLS (sin A- A+) */}
              <div className="hidden sm:flex items-center gap-0.5">
                <button onClick={() => { const v = !darkMode; setDarkMode(v); localStorage.setItem('stage_darkMode', String(v)); }}
                  className="p-1.5 min-w-[32px] min-h-[32px] text-gray-500 hover:text-gray-300">
                  <span className="material-symbols-outlined text-[18px]">{darkMode ? 'light_mode' : 'dark_mode'}</span>
                </button>
                <button onClick={() => { const next = viewMode === 'list' ? 'slide' : 'list'; setViewMode(next); localStorage.setItem('stage_viewMode', next); setSlideIdx(0); }}
                  className="p-1.5 min-w-[32px] min-h-[32px] text-gray-500 hover:text-gray-300" title={viewMode === 'list' ? 'Modo diapositiva' : 'Modo lista'}>
                  <span className="material-symbols-outlined text-[18px]">{viewMode === 'list' ? 'view_carousel' : 'view_list'}</span>
                </button>
              </div>

              {/* DROPDOWN TRIGGER — visible SIEMPRE (mobile + tablet + desktop para opciones extra) */}
              <button onClick={() => setShowMobileMenu(true)}
                className="p-1.5 min-w-[36px] min-h-[36px] text-gray-500 hover:text-gray-300">
                <span className="material-symbols-outlined text-[20px] sm:text-[22px]">more_vert</span>
              </button>

              {/* NEXT button */}
              <button onClick={() => navigateTo('next')} disabled={currentIdx >= (displayData?.items.length ?? 0) - 1}
                title={nextItem?.song?.title || ''}
                className={`p-1 min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors ${
                  currentIdx >= (displayData?.items.length ?? 0) - 1
                    ? (darkMode ? 'text-gray-800 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
                    : (darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')
                }`}>
                <span className="material-symbols-outlined text-[22px] sm:text-[26px]">chevron_right</span>
              </button>
            </div>
          </div>

          {/* "Mostrar header" pill cuando esta oculto */}
          {!headerVisible && (
            <button
              onClick={() => setHeaderVisible(true)}
              className="fixed top-0 left-1/2 -translate-x-1/2 z-20 bg-gray-900/90 text-gray-300 hover:text-white px-4 py-1.5 rounded-b-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg">
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">expand_more</span>
              Mostrar barra
            </button>
          )}

          {/* Barra de músico: perfil + foco */}
          {headerVisible && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b" style={{ backgroundColor: chromeBg, borderColor: chromeBorder }}>
              <ProfileGate darkMode={isDark} profile={notes.profile} onChange={notes.setProfile} />
              {notes.profile && isSong && (
                <button
                  onClick={() => setFocusMine((v) => !v)}
                  className={`flex items-center gap-1 px-2 h-8 rounded-full text-[11px] font-bold uppercase tracking-wide border transition-colors shrink-0 ${
                    focusMine
                      ? 'border-primary text-primary bg-primary/10'
                      : isDark ? 'border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'border-gray-300 text-gray-500 hover:text-gray-700'
                  }`}
                  title="Atenúa las estrofas donde no cantás"
                >
                  <span className="material-symbols-outlined text-[15px]">{focusMine ? 'visibility' : 'visibility_off'}</span>
                  Solo lo mío
                </button>
              )}
            </div>
          )}

          {/* Meta de la canción: tono / mi rol / nota */}
          {headerVisible && isSong && song && (
            <div className="px-3 pt-1 pb-1.5 border-b" style={{ backgroundColor: chromeBg, borderColor: chromeBorder }}>
              <SongMeta
                darkMode={isDark}
                canEdit={!!notes.profile}
                keyLabel={notes.songKey(song.id)}
                role={songAnn?.role ?? null}
                note={songAnn?.note ?? null}
                onKey={(v) => notes.setSongKey(song.id, v)}
                onRole={(v) => notes.setRole(song.id, v)}
                onNote={(v) => notes.setSongNote(song.id, v)}
              />
            </div>
          )}

          {/* Content */}
          {/* Slide Mode */}
          {viewMode === 'slide' && song && (
            <div className="flex-1 flex flex-col relative overflow-hidden min-h-[60vh]"
              style={{ touchAction: 'none', overscrollBehavior: 'none', backgroundColor: contentBg, color: contentColor }}
              onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

              <div className="flex-1 flex items-center justify-center w-full px-4 sm:px-8 pb-24">
                {(() => {
                  const cp = song.parts[slideIdx];
                  const cpKey = cp ? partKey(cp) : '';
                  const cm = cp ? songAnn?.parts[cpKey] : undefined;
                  const cd = cm?.tag ? TAG_MAP[cm.tag] : null;
                  return (
                    <div key={slideIdx} className="w-full flex flex-col items-center justify-center gap-3"
                      style={{ animation: 'fadeSlideIn 250ms ease-out' }}>
                      {(cd || notes.profile) && (
                        <div className="flex items-center gap-2">
                          {cd && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase" style={{ backgroundColor: cd.color, color: '#ffffff' }}>
                              <span className="material-symbols-outlined text-[14px]">{cd.icon}</span>{cd.label}
                            </span>
                          )}
                          {notes.profile && cp && (
                            <button
                              onClick={() => setAnnPart({ key: cpKey, label: `${cp.type} ${cp.order}`, text: cp.content })}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold uppercase border border-current opacity-50 hover:opacity-100 transition-opacity"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit_note</span>Marcar
                            </button>
                          )}
                        </div>
                      )}
                      {!!cm?.laps?.length && (
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                          {cm.laps.map((l, li) => {
                            const ld = LAP_DEF[l];
                            return (
                              <span key={li} className="text-sm font-bold tracking-wide"
                                style={{ color: ld.color || undefined, opacity: ld.color ? 1 : 0.5 }}>
                                {LAP_ORDINAL[li]} {ld.arrow}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed font-bold text-center max-w-2xl mx-auto rounded-2xl"
                        style={{
                          fontSize: `${fontScale * 1.3}rem`,
                          opacity: isSwiping ? 0.7 : 1,
                          transition: 'opacity 150ms',
                          backgroundColor: cd ? withAlpha(cd.color, 0.12) : 'transparent',
                          padding: cd ? '1rem 1.25rem' : undefined,
                        }}>
                        {cp?.content || ''}
                      </p>
                      {cm?.note && (
                        <p className="text-sm italic text-center max-w-xl" style={{ color: cd?.color || contentColor, opacity: 0.85 }}>“{cm.note}”</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-2 pt-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
                <div className="pointer-events-auto flex items-center justify-center mb-2">
                  <span className="text-4xl font-mono font-black text-gray-300 tracking-wider">
                    {slideIdx + 1}
                  </span>
                  <span className="text-lg font-mono text-gray-500 mx-2">/</span>
                  <span className="text-lg font-mono text-gray-500">{song.parts.length}</span>
                </div>
                <div className="pointer-events-auto flex items-center justify-between w-full px-6 sm:px-12">
                  <button onClick={() => setSlideIdx(Math.max(0, slideIdx - 1))}
                    disabled={slideIdx === 0}
                    className="p-3 min-w-[48px] min-h-[48px] flex items-center justify-center text-gray-300 hover:text-white disabled:text-gray-700 disabled:hover:text-gray-700 transition-colors">
                    <span className="material-symbols-outlined text-[28px] sm:text-[32px]">chevron_left</span>
                  </button>
                  <button onClick={() => setSlideIdx(Math.min(song.parts.length - 1, slideIdx + 1))}
                    disabled={slideIdx >= song.parts.length - 1}
                    className="p-3 min-w-[48px] min-h-[48px] flex items-center justify-center text-gray-300 hover:text-white disabled:text-gray-700 disabled:hover:text-gray-700 transition-colors">
                    <span className="material-symbols-outlined text-[28px] sm:text-[32px]">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* List Mode */}
          {viewMode === 'list' && (
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 py-6" style={{
              backgroundColor: contentBg,
              color: contentColor,
            }}>
              <div className="mb-6 text-center">

                {song?.parts?.map((part, i) => {
                  const k = partKey(part);
                  const m = songAnn?.parts[k];
                  const d = m?.tag ? TAG_MAP[m.tag] : null;
                  const active = !!d && m?.tag !== 'SILENT';
                  const dim = focusMine && hasActiveMarks && !active;
                  return (
                    <div key={i} className="mb-5 transition-opacity" style={{ opacity: dim ? 0.3 : 1 }}>
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{part.type}</p>
                        {d && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ backgroundColor: d.color, color: '#ffffff' }}>
                            <span className="material-symbols-outlined text-[12px]">{d.icon}</span>{d.label}
                          </span>
                        )}
                        {notes.profile && (
                          <button
                            onClick={() => setAnnPart({ key: k, label: `${part.type} ${part.order}`, text: part.content })}
                            className="opacity-30 hover:opacity-100 transition-opacity"
                            title="Marcar sección"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit_note</span>
                          </button>
                        )}
                      </div>
                      {!!m?.laps?.length && (
                        <div className="flex items-center justify-center gap-2.5 mb-1.5 flex-wrap">
                          {m.laps.map((l, li) => {
                            const ld = LAP_DEF[l];
                            return (
                              <span key={li} className="text-[11px] font-bold tracking-wide"
                                style={{ color: ld.color || undefined, opacity: ld.color ? 1 : 0.45 }}>
                                {LAP_ORDINAL[li]} {ld.arrow}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed font-bold text-center max-w-2xl mx-auto rounded-2xl"
                        style={{
                          fontSize: `${fontScale * 1.1}rem`,
                          backgroundColor: d ? withAlpha(d.color, 0.1) : 'transparent',
                          padding: d ? '0.6rem 1rem' : undefined,
                        }}>
                        {part.content}
                      </p>
                      {m?.note && (
                        <p className="text-xs italic mt-1 text-center" style={{ color: d?.color || undefined, opacity: 0.8 }}>“{m.note}”</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Navigation overlays when header is hidden */}
          {!headerVisible && (
            <>
              {currentIdx > 0 && (
                <button
                  onClick={() => { const newIdx = currentIdx - 1; setCurrentIdx(newIdx); setSlideIdx(0); saveToLocalStorage(displayData!, newIdx); }}
                  className="fixed left-0 top-1/2 -translate-y-1/2 z-30 bg-black/40 hover:bg-black/60 text-white/60 hover:text-white/90 px-1.5 py-8 rounded-r-lg transition-all group"
                  title={displayData?.items[currentIdx - 1]?.song?.title || ''}
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                  <span className="hidden group-hover:block absolute left-full ml-2 bg-black/80 text-white text-[10px] font-headline font-bold uppercase px-2 py-1 rounded whitespace-nowrap">
                    {displayData?.items[currentIdx - 1]?.song?.title?.slice(0, 15) || ''}
                  </span>
                </button>
              )}
              {currentIdx < (displayData?.items.length ?? 0) - 1 && (
                <button
                  onClick={() => { const newIdx = currentIdx + 1; setCurrentIdx(newIdx); setSlideIdx(0); saveToLocalStorage(displayData!, newIdx); }}
                  className="fixed right-0 top-1/2 -translate-y-1/2 z-30 bg-black/40 hover:bg-black/60 text-white/60 hover:text-white/90 px-1.5 py-8 rounded-l-lg transition-all group"
                  title={displayData?.items[currentIdx + 1]?.song?.title || ''}
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                  <span className="hidden group-hover:block absolute right-full mr-2 bg-black/80 text-white text-[10px] font-headline font-bold uppercase px-2 py-1 rounded whitespace-nowrap">
                    {displayData?.items[currentIdx + 1]?.song?.title?.slice(0, 15) || ''}
                  </span>
                </button>
              )}
            </>
          )}

        </>
      ) : (
        /* Default state: no stage data, show service picker prompt */
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className={`font-headline font-bold text-lg uppercase tracking-wider mb-2 ${textPrimary}`}>
              Selecciona una reunion
            </p>
            <p className={`text-sm mb-6 ${textSecondary}`}>
              Escoge la reunion para mostrar las canciones
            </p>
            <button
              onClick={() => setShowServicePicker(true)}
              className="inline-flex items-center gap-2 bg-black dark:bg-white text-white dark:text-black px-6 py-3 font-headline font-bold text-sm uppercase tracking-wider hover:opacity-80 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              Abrir lista
            </button>
          </div>
        </div>
      )}

      {/* Service Picker Modal */}
      {showServicePicker && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setShowServicePicker(false)}>
          <div
            className={darkMode
              ? 'bg-gray-900 w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-none flex flex-col shadow-2xl p-6'
              : 'bg-white w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-none flex flex-col shadow-2xl p-6'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-headline font-bold text-sm uppercase tracking-wider ${textPrimary}`}>
                Reuniones
              </h3>
              <button
                onClick={() => setShowServicePicker(false)}
                className={darkMode
                  ? 'p-1 text-gray-500 hover:text-gray-300'
                  : 'p-1 text-gray-400 hover:text-gray-600'}
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            {services.length === 0 ? (
              <p className={`text-sm text-center py-8 ${textSecondary}`}>No hay reuniones disponibles</p>
            ) : (
              <div className="overflow-y-auto -mx-2">
                {services.map((svc) => {
                  const isActive = svc.id === displayData?.service?.id;
                  return (
                    <button
                      key={svc.id}
                      onClick={() => handleSelectService(svc.id)}
                      className={darkMode
                        ? `w-full text-left px-4 py-3 transition-colors ${
                          isActive
                            ? 'bg-gray-800 text-white font-bold'
                            : 'text-gray-300 hover:bg-gray-800/50'
                        }`
                        : `w-full text-left px-4 py-3 transition-colors ${
                          isActive
                            ? 'bg-gray-100 text-black font-bold'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      <span className="text-sm font-headline uppercase tracking-wider block truncate">
                        {svc.name}
                      </span>
                      {svc.date && (
                        <span className="text-xs opacity-50">{svc.date}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Song List Modal */}
      {showSongList && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setShowSongList(false)}>
          <div className={darkMode
            ? 'bg-gray-900 w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-none flex flex-col shadow-2xl'
            : 'bg-white w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-none flex flex-col shadow-2xl'}
            onClick={e => e.stopPropagation()}>
            <div className={darkMode
              ? 'p-4 border-b border-gray-700 flex justify-between items-center shrink-0'
              : 'p-4 border-b border-gray-200 flex justify-between items-center shrink-0'}>
              <h3 className={`font-headline font-black text-sm uppercase tracking-widest ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {displayData?.service?.name || 'Reunión'}
              </h3>
              <button onClick={() => setShowSongList(false)}
                className={darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {displayData?.items?.map((item: any, idx: number) => {
                const isActive = idx === currentIdx;
                const title = item.type === 'SONG' ? item.song?.title : item.type === 'DECK' ? item.deck?.title : item.mediaAsset?.title || 'Sin título';
                const subtitle = item.type === 'SONG' ? item.song?.author : item.type === 'DECK' ? `${item.deck?.slides?.length || 0} diapositivas` : item.mediaAsset?.type || '';
                const icon = item.type === 'SONG' ? 'music_note' : item.type === 'DECK' ? 'auto_awesome_mosaic' : item.mediaAsset?.type === 'VIDEO' ? 'movie' : 'image';
                
                return (
                  <button
                    key={item.id || idx}
                    onClick={() => {
                      setCurrentIdx(idx);
                      setSlideIdx(0);
                      saveToLocalStorage(displayData!, idx);
                      setShowSongList(false);
                    }}
                    className={darkMode
                      ? `w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-800 transition-colors ${
                        isActive ? 'bg-primary/10' : 'hover:bg-gray-800'
                      }`
                      : `w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 transition-colors ${
                        isActive ? 'bg-primary/10' : 'hover:bg-gray-50'
                      }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] shrink-0 ${isActive ? 'text-primary' : 'text-gray-400'}`}>
                      {icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-headline font-bold text-sm uppercase truncate ${isActive ? 'text-primary' : darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {title}
                      </p>
                      {subtitle && (
                        <p className={darkMode ? 'text-xs text-gray-500 truncate' : 'text-xs text-gray-400 truncate'}>{subtitle}</p>
                      )}
                    </div>
                    <span className={`text-xs font-mono font-bold ${isActive ? 'text-primary' : 'text-gray-400'}`}>
                      {idx + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Dropdown Menu */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setShowMobileMenu(false)}>
          <div className={`w-full sm:max-w-xs max-h-[75vh] rounded-t-2xl sm:rounded-none flex flex-col shadow-2xl overflow-hidden border sm:border ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-surface border-outline-variant/30'}`} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className={`p-4 border-b flex justify-between items-center shrink-0 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-surface-container-highest border-outline-variant/30'}`}>
              <h3 className={`font-headline font-black text-xs uppercase tracking-widest ${darkMode ? 'text-zinc-200' : 'text-on-surface'}`}>Opciones</h3>
              <button onClick={() => setShowMobileMenu(false)} className={`${darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-on-surface-variant hover:text-error'} transition-colors`}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Font size row — solo mobile (en desktop está en el header) */}
            <div className={`sm:hidden px-4 pt-3 pb-1 text-[9px] font-headline font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-600' : 'text-on-surface-variant/60'}`}>Tamaño de letra</div>
            <div className="sm:hidden flex items-center gap-2 px-4 py-2">
              <button onClick={() => { const v = Math.max(0.8, fontScale - 0.1); setFontScale(v); localStorage.setItem('stage_fontScale', String(v)); }}
                className={`flex-1 py-2 text-sm font-headline font-black uppercase tracking-wider border transition-colors ${darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200' : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}>A-</button>
              <span className={`text-xs font-mono font-bold ${darkMode ? 'text-zinc-500' : 'text-on-surface-variant'}`}>{fontScale.toFixed(1)}x</span>
              <button onClick={() => { const v = Math.min(2.2, fontScale + 0.1); setFontScale(v); localStorage.setItem('stage_fontScale', String(v)); }}
                className={`flex-1 py-2 text-sm font-headline font-black uppercase tracking-wider border transition-colors ${darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200' : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}>A+</button>
            </div>

            {/* Divider — solo mobile */}
            <div className={`sm:hidden mx-4 my-1 border-t ${darkMode ? 'border-zinc-800' : 'border-outline-variant/20'}`}></div>

            {/* Menu items — estilo lista */}
            <div className="overflow-y-auto py-1">
              {[
                { icon: darkMode ? 'light_mode' : 'dark_mode', label: darkMode ? 'Modo claro' : 'Modo oscuro', action: () => { const v = !darkMode; setDarkMode(v); localStorage.setItem('stage_darkMode', String(v)); }, mobileOnly: true },
                { icon: viewMode === 'list' ? 'view_carousel' : 'view_list', label: viewMode === 'list' ? 'Modo diapositiva' : 'Modo lista', action: () => { const next = viewMode === 'list' ? 'slide' : 'list'; setViewMode(next); localStorage.setItem('stage_viewMode', next); setSlideIdx(0); }, mobileOnly: true },
                { icon: nightMode ? 'clear_night' : 'bedtime', label: nightMode ? 'Modo noche: ON' : 'Modo noche (rojo)', action: () => { const v = !nightMode; setNightMode(v); localStorage.setItem('stage_nightMode', String(v)); } },
                { icon: 'brightness_medium', label: `Brillo: ${['100%', '70%', '45%'][dimLevel]}`, action: cycleDim },
                { icon: 'playlist_play', label: 'Lista de canciones', action: () => { setShowMobileMenu(false); setShowSongList(true); } },
                { icon: 'event', label: 'Cambiar reunión', action: () => { setShowMobileMenu(false); setShowServicePicker(true); } },
                { icon: 'fullscreen', label: 'Pantalla completa', action: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } },
                { icon: 'expand_less', label: 'Ocultar barra superior', action: () => { setHeaderVisible(false); setShowMobileMenu(false); }, mobileOnly: true },
                { icon: 'refresh', label: 'Forzar actualización', action: () => { localStorage.removeItem('stage_data'); localStorage.removeItem('stage_lastServiceId'); window.location.reload(); } },
              ].map((item, i) => (
                <button key={i}
                  onClick={item.action}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors font-headline font-bold text-xs uppercase tracking-wider ${darkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}${item.mobileOnly ? ' sm:hidden' : ''}`}>
                  <span className={`material-symbols-outlined text-[20px] shrink-0 ${darkMode ? 'text-zinc-500' : 'text-on-surface-variant'}`}>{item.icon}</span>
                  {item.label}
                </button>
              ))}

              {stageData?.loadedAt && (
                <div className={`px-4 py-2 text-[9px] font-mono text-right ${darkMode ? 'text-zinc-600' : 'text-gray-400'}`}>
                  Actualizado {
                    (() => {
                      const diff = Math.floor((Date.now() - stageData.loadedAt) / 1000);
                      if (diff < 60) return 'ahora';
                      if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
                      return `hace ${Math.floor(diff / 3600)} h`;
                    })()
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Atenuador de brillo — para no encandilar en la oscuridad */}
      {dimLevel > 0 && (
        <div className="fixed inset-0 z-[90] pointer-events-none" style={{ backgroundColor: `rgba(0,0,0,${dimLevel === 1 ? 0.3 : 0.55})` }} />
      )}

      {/* Hoja para marcar una sección */}
      {annPart && song && (
        <AnnotationSheet
          darkMode={isDark}
          partLabel={annPart.label}
          partText={annPart.text}
          mark={songAnn?.parts[annPart.key] || {}}
          onChange={(m) => notes.setPartMark(song.id, annPart.key, m)}
          onClose={() => setAnnPart(null)}
        />
      )}
    </div>
  );
}
