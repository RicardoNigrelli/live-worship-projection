"use client";
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import ScreenCanvas from '@/components/ScreenCanvas';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';
import { useProyectaStore } from '@/store/useProyectaStore';
import { loadFont } from '@/lib/fonts';

type SongPart = { id?: string; type: string; content: string; order?: number };
type Song = { id: string; title: string; author: string | null; parts: SongPart[] };

const avatarColors = [
  'bg-primary text-on-primary',
  'bg-secondary-fixed-dim text-secondary',
  'bg-inverse-surface text-inverse-on-surface',
  'bg-tertiary text-on-tertiary',
];

const PAGE_SIZE_OPTIONS = [5, 10, 15, 25, 50];

export default function SongsPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Edit / Create Modal State
  const [editingSong, setEditingSong] = useState<Song & { themeBgType?: string; themeBgValue?: string; themeFontFamily?: string; themeFontColor?: string; themeFontSize?: number } | 'NEW' | null>(null);
  const [formData, setFormData] = useState({ title: '', author: '' });
  const [parts, setParts] = useState<SongPart[]>([]);
  const [selectedParts, setSelectedParts] = useState<Set<number>>(new Set());
  const [styleData, setStyleData] = useState({ themeBgType: 'COLOR', themeBgValue: '#1a1a2e', themeFontFamily: '', themeFontColor: '#ffffff', themeFontSize: 1.0 });
  const [mediaAssets, setMediaAssets] = useState<any[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showStylePopover, setShowStylePopover] = useState(false);
  const [previewText, setPreviewText] = useState('Ejemplo de texto');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; type: 'success' | 'warn' | 'error' } | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [originalSnapshot, setOriginalSnapshot] = useState<{ formData: { title: string; author: string }; parts: SongPart[]; styleData: typeof styleData } | null>(null);

  // Spotify Import State
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyTracks, setSpotifyTracks] = useState<any[]>([]);
  const [spotifySelected, setSpotifySelected] = useState<Set<string>>(new Set());
  const [spotifyReviewIdx, setSpotifyReviewIdx] = useState<number | null>(null);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyImporting, setSpotifyImporting] = useState(false);
  const [spotifySearchDone, setSpotifySearchDone] = useState(false);
  const [isLoadingSongs, setIsLoadingSongs] = useState(true);
  const [duplicateResults, setDuplicateResults] = useState<any[]>([]);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicatesToReimport, setDuplicatesToReimport] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsLoadingSongs(true);
    fetch(`${API_URL}/api/songs`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setSongs(data); else throw new Error('Invalid response'); })
      .catch(() => toast('Error al cargar canciones', 'error'))
      .finally(() => setIsLoadingSongs(false));
    fetch(`${API_URL}/api/media`)
      .then(r => r.json())
      .then(setMediaAssets)
      .catch(() => toast('Error al cargar biblioteca', 'warn'));
  }, []);

  useEffect(() => {
    setSelectedParts(new Set());
  }, [parts.length]);

  const [lyricsProgress, setLyricsProgress] = useState<{ current: number; total: number; found: number } | null>(null);

  const filteredSongs = songs.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.author || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredSongs.length / pageSize);
  const paginatedSongs = filteredSongs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await fetch(`${API_URL}/api/songs/${deleteConfirmId}`, { method: 'DELETE' });
      setSongs(songs.filter(s => s.id !== deleteConfirmId));
      setDeleteConfirmId(null);
      toast('Canción eliminada', 'success');
    } catch (e) { toast('Error al eliminar canción', 'error'); }
  };

  const handleCreateSong = () => {
    setFormData({ title: '', author: '' });
    setParts([{ id: crypto.randomUUID(), type: 'VERSO', content: '' }]);
    setSelectedParts(new Set());
    setStyleData({ themeBgType: 'COLOR', themeBgValue: '#1a1a2e', themeFontFamily: '', themeFontColor: '#ffffff', themeFontSize: 1.0 });
    setEditingSong('NEW');
    setOriginalSnapshot({
      formData: { title: '', author: '' },
      parts: [{ id: crypto.randomUUID(), type: 'VERSO', content: '' }],
      styleData: { themeBgType: 'COLOR', themeBgValue: '#1a1a2e', themeFontFamily: '', themeFontColor: '#ffffff', themeFontSize: 1.0 },
    });
  };

  const handleEditSong = (song: Song & { themeBgType?: string; themeBgValue?: string; themeFontFamily?: string; themeFontColor?: string; themeFontSize?: number }) => {
    setFormData({ title: song.title, author: song.author || '' });
    setParts(song.parts.map(p => ({ ...p, id: p.id || crypto.randomUUID() })));
    setSelectedParts(new Set());
    setStyleData({
      themeBgType: song.themeBgType || 'COLOR',
      themeBgValue: song.themeBgValue || '#1a1a2e',
      themeFontFamily: song.themeFontFamily || '',
      themeFontColor: song.themeFontColor || '#ffffff',
      themeFontSize: song.themeFontSize || 1.0,
    });
    setEditingSong(song);
    setOriginalSnapshot({
      formData: { title: song.title, author: song.author || '' },
      parts: song.parts.map(p => ({ ...p, id: p.id || crypto.randomUUID() })),
      styleData: {
        themeBgType: song.themeBgType || 'COLOR',
        themeBgValue: song.themeBgValue || '#1a1a2e',
        themeFontFamily: song.themeFontFamily || '',
        themeFontColor: song.themeFontColor || '#ffffff',
        themeFontSize: song.themeFontSize || 1.0,
      },
    });
  };

  const addPart = () => {
    setParts([...parts, { id: crypto.randomUUID(), type: 'VERSO', content: '' }]);
  };

  const removePart = (idx: number) => {
    setParts(parts.filter((_, i) => i !== idx));
  };

  const movePart = (idx: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && idx > 0) {
      const newParts = [...parts];
      [newParts[idx - 1], newParts[idx]] = [newParts[idx], newParts[idx - 1]];
      setParts(newParts);
    } else if (direction === 'DOWN' && idx < parts.length - 1) {
      const newParts = [...parts];
      [newParts[idx + 1], newParts[idx]] = [newParts[idx], newParts[idx + 1]];
      setParts(newParts);
    }
  };

  const duplicatePart = (idx: number) => {
    const newParts = [...parts];
    newParts.splice(idx + 1, 0, { id: crypto.randomUUID(), type: parts[idx].type, content: parts[idx].content });
    setParts(newParts);
  };

  const togglePartSelect = (idx: number) => {
    setSelectedParts(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAllParts = () => {
    setSelectedParts(new Set(parts.map((_, i) => i)));
  };

  const deselectAllParts = () => {
    setSelectedParts(new Set());
  };

  const duplicateSelectedParts = () => {
    if (selectedParts.size === 0) return;
    // Descending order: inserting a duplicate right after each original doesn't
    // shift the indices of originals still pending (all below the current one).
    const indices = Array.from(selectedParts).sort((a, b) => b - a);
    const newParts = [...parts];
    for (const idx of indices) {
      const original = newParts[idx];
      newParts.splice(idx + 1, 0, { id: crypto.randomUUID(), type: original.type, content: original.content });
    }
    setParts(newParts);
    setSelectedParts(new Set());
  };

  const removeSelectedParts = () => {
    if (selectedParts.size === 0) return;
    const newParts = parts.filter((_, i) => !selectedParts.has(i));
    setParts(newParts);
    setSelectedParts(new Set());
  };

  const executeSaveSong = async () => {
    if (!formData.title.trim() || isSaving) return;
    
    const formattedParts = parts.map((p, idx) => ({
      order: idx + 1,
      type: p.type,
      content: p.content
    }));

    setIsSaving(true);
    setSaveMsg(null);

    try {
      let songId = editingSong === 'NEW' ? null : editingSong?.id;

      if (editingSong === 'NEW') {
        const res = await fetch(`${API_URL}/api/songs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            title: formData.title, 
            author: formData.author || 'Anónimo', 
            category: 'Default',
            parts: formattedParts,
            themeBgType: styleData.themeBgType,
            themeBgValue: styleData.themeBgValue,
            themeFontFamily: styleData.themeFontFamily,
            themeFontColor: styleData.themeFontColor,
            themeFontSize: styleData.themeFontSize,
          })
        });
        const newSong = await res.json();
        songId = newSong.id;
        setEditingSong({ ...newSong, themeBgType: styleData.themeBgType, themeBgValue: styleData.themeBgValue, themeFontFamily: styleData.themeFontFamily, themeFontColor: styleData.themeFontColor, themeFontSize: styleData.themeFontSize } as any);
        setOriginalSnapshot({
          formData: { ...formData },
          parts: parts.map(p => ({ ...p })),
          styleData: { ...styleData },
        });
      } else if (editingSong) {
        songId = editingSong.id;
        await fetch(`${API_URL}/api/songs/${editingSong.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            title: formData.title, 
            author: formData.author || 'Anónimo', 
            category: 'Default',
            parts: formattedParts,
            themeBgType: styleData.themeBgType,
            themeBgValue: styleData.themeBgValue,
            themeFontFamily: styleData.themeFontFamily,
            themeFontColor: styleData.themeFontColor,
            themeFontSize: styleData.themeFontSize,
          })
        });
        setEditingSong({
          ...editingSong,
          title: formData.title,
          author: formData.author,
          parts: formattedParts.map(p => ({ ...p, id: p.order ? `temp-${p.order}` : '' })),
          themeBgType: styleData.themeBgType,
          themeBgValue: styleData.themeBgValue,
          themeFontFamily: styleData.themeFontFamily,
          themeFontColor: styleData.themeFontColor,
          themeFontSize: styleData.themeFontSize,
        } as any);
        setOriginalSnapshot({
          formData: { ...formData },
          parts: parts.map(p => ({ ...p })),
          styleData: { ...styleData },
        });
      }
      
      const listRes = await fetch(`${API_URL}/api/songs`);
      const data = await listRes.json();
      if (Array.isArray(data)) setSongs(data);

      // Push to live
      let liveImpact = false;
      if (songId) {
        const store = useProyectaStore.getState();
        const { socket, room, playlist, selectedQueueIndex, isFrozen } = store;
        if (socket && room) {
          socket.emit('song_updated', {
            songId,
            title: formData.title,
            slides: JSON.stringify(formattedParts.map(p => p.content)),
            fontFamily: styleData.themeFontFamily || null,
            fontColor: styleData.themeFontColor || null,
            fontSize: styleData.themeFontSize || null,
            bgType: styleData.themeBgType || null,
            bgValue: styleData.themeBgValue || null,
          });
          const activeItem = playlist[selectedQueueIndex];
          if (!isFrozen && activeItem?.id === songId) {
            store.setStyle({
              bgType: styleData.themeBgType,
              bgValue: styleData.themeBgValue,
              fontFamily: styleData.themeFontFamily,
              fontColor: styleData.themeFontColor,
              fontSize: styleData.themeFontSize,
            });
            liveImpact = true;
          }
        }
      }

      setSaveMsg({ text: liveImpact ? '¡Impactando en vivo!' : 'Guardado correctamente', type: liveImpact ? 'success' : 'warn' });
    } catch (e) {
      toast('Error al guardar la canción', 'error');
      setSaveMsg({ text: 'Error al guardar', type: 'error' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const hasUnsavedChanges = (): boolean => {
    if (!originalSnapshot) return false;
    const fd = originalSnapshot.formData;
    const sd = originalSnapshot.styleData;

    if (formData.title !== fd.title || formData.author !== fd.author) return true;

    if (sd.themeBgType !== styleData.themeBgType || sd.themeBgValue !== styleData.themeBgValue ||
        sd.themeFontFamily !== styleData.themeFontFamily || sd.themeFontColor !== styleData.themeFontColor ||
        sd.themeFontSize !== styleData.themeFontSize) return true;

    const origParts = originalSnapshot.parts;
    if (parts.length !== origParts.length) return true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type !== origParts[i].type || parts[i].content !== origParts[i].content) return true;
    }

    return false;
  };

  const selectMedia = (asset: any) => {
    setStyleData(prev => ({ ...prev, themeBgValue: asset.url }));
    setShowMediaPicker(false);
  };

  // Spotify Import Functions
  const fetchSpotifyPreview = async () => {
    if (!spotifyUrl.trim()) return;
    setSpotifyLoading(true);
    setSpotifySearchDone(false);
    setSpotifyReviewIdx(null);
    try {
      // Phase 1: Get track list from Spotify (fast, ~2s)
      const res = await fetch(`${API_URL}/api/spotify/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistUrl: spotifyUrl }),
      });
      const data = await res.json();
      setSpotifyTracks(data.tracks);
      setSpotifySearchDone(true);
      setSpotifyLoading(false);

      // Phase 2: Search lyrics in batches of 5
      const BATCH_SIZE = 5;
      const allTracks = data.tracks;
      let foundTotal = 0;

      for (let i = 0; i < allTracks.length; i += BATCH_SIZE) {
        const batch = allTracks.slice(i, i + BATCH_SIZE);
        setLyricsProgress({ current: Math.min(i + BATCH_SIZE, allTracks.length), total: allTracks.length, found: foundTotal });

        const lyricsRes = await fetch(`${API_URL}/api/spotify/preview/lyrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: batch.map((t: any) => ({ artist: t.artist, title: t.title, tempId: t.tempId })) }),
        });
        const lyricsData = await lyricsRes.json();
        foundTotal += lyricsData.foundCount || 0;

        setSpotifyTracks((prev: any[]) =>
          prev.map(track => {
            const updated = lyricsData.results.find((r: any) => r.tempId === track.tempId);
            return updated ? { ...track, ...updated } : track;
          })
        );
      }

      setLyricsProgress(null);
      // Auto-select tracks with found lyrics, excluding duplicates (require explicit opt-in to re-import)
      setSpotifyTracks((prev: any[]) => {
        const foundIds = prev.filter(t => t.lyricsFound === true && !t.isDuplicate).map(t => t.tempId);
        setSpotifySelected(new Set(foundIds));
        return prev;
      });
    } catch (e) {
      console.error(e);
      toast('Error al buscar canciones', 'error');
      setSpotifyLoading(false);
    }
  };

  const toggleSpotifySelect = (tempId: string) => {
    setSpotifySelected(prev => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const updateReviewPart = (trackIdx: number, partIdx: number, field: 'content' | 'type', value: string) => {
    setSpotifyTracks(prev => {
      const next = [...prev];
      const track = { ...next[trackIdx] };
      const parts = [...track.parts];
      parts[partIdx] = { ...parts[partIdx], [field]: value };
      track.parts = parts;
      next[trackIdx] = track;
      return next;
    });
  };

  const addReviewPart = (trackIdx: number) => {
    setSpotifyTracks(prev => {
      const next = [...prev];
      const track = { ...next[trackIdx] };
      track.parts = [...track.parts, { type: 'VERSO', content: '' }];
      next[trackIdx] = track;
      return next;
    });
  };

  const removeReviewPart = (trackIdx: number, partIdx: number) => {
    setSpotifyTracks(prev => {
      const next = [...prev];
      const track = { ...next[trackIdx] };
      track.parts = track.parts.filter((_: any, i: number) => i !== partIdx);
      next[trackIdx] = track;
      return next;
    });
  };

  const importSelected = async () => {
    const selectedTracks = spotifyTracks.filter(t => spotifySelected.has(t.tempId));
    if (selectedTracks.length === 0) return;
    setSpotifyImporting(true);
    try {
      const res = await fetch(`${API_URL}/api/songs/batch-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: selectedTracks }),
      });
      const data = await res.json();

      if (data.duplicatesCount > 0) {
        setDuplicateResults(data.duplicates);
        setDuplicatesToReimport(new Set());
        setShowDuplicatesModal(true);
        await fetch(`${API_URL}/api/songs`).then(r => r.json()).then(data => { if (Array.isArray(data)) setSongs(data); });
      } else {
        await fetch(`${API_URL}/api/songs`).then(r => r.json()).then(data => { if (Array.isArray(data)) setSongs(data); });
        setShowSpotifyModal(false);
        if (data.createdCount > 0) {
          if (data.failedCount > 0) {
            toast(`${data.createdCount} importadas, ${data.failedCount} fallaron`, 'warn');
          } else {
            toast(`${data.createdCount} cancion(es) importadas`, 'success');
          }
        }
      }
    } catch (e) {
      toast('Error al importar canciones', 'error');
      console.error(e);
    } finally {
      setSpotifyImporting(false);
    }
  };

  const reimportDuplicates = async () => {
    if (duplicatesToReimport.size === 0) {
      setShowDuplicatesModal(false);
      return;
    }

    const tracksToReimport = spotifyTracks.filter(t => duplicatesToReimport.has(t.tempId));
    setSpotifyImporting(true);
    try {
      const res = await fetch(`${API_URL}/api/songs/batch-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: tracksToReimport, forceReimport: true }),
      });
      const data = await res.json();
      await fetch(`${API_URL}/api/songs`).then(r => r.json()).then(data => { if (Array.isArray(data)) setSongs(data); });
      toast(`${data.createdCount} canciones reimportadas`, 'success');
    } catch (e) {
      toast('Error al reimportar', 'error');
    } finally {
      setShowDuplicatesModal(false);
      setShowSpotifyModal(false);
      setSpotifyImporting(false);
    }
  };

  const toggleDuplicateSelect = (tempId: string) => {
    setDuplicatesToReimport(prev => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const reviewTrack = spotifyReviewIdx !== null ? spotifyTracks[spotifyReviewIdx] : null;

  return (
    <main className="flex-1 p-6 md:p-12 lg:p-20 max-w-7xl mx-auto w-full">
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-12 mb-20 relative">
        <div className="flex flex-col gap-4 max-w-2xl z-10">
          <div className="inline-flex items-center gap-2 bg-secondary-fixed/20 text-secondary font-body font-bold text-xs uppercase tracking-widest px-3 py-1 w-max mb-2">
            <span className="w-1.5 h-1.5 bg-secondary"></span>
            Base de Datos
          </div>
          <h1 className="font-headline text-5xl md:text-7xl font-black uppercase tracking-[-0.02em] leading-[0.9] text-on-surface">
            Gestión de<br/>
            <span className="text-primary">Canciones</span>
          </h1>
          <p className="font-body text-lg text-on-surface-variant leading-relaxed mt-4 max-w-lg">
            Administra el catálogo completo de canciones, autores y metadatos para proyección en vivo.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-4 lg:w-auto w-full shrink-0">
          <div className="relative group flex-1 sm:w-64 flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-on-surface-variant group-focus-within:text-primary transition-colors z-10 pointer-events-none">search</span>
            <input 
              className="w-full bg-surface-container-low border-b-2 border-outline-variant/50 focus:border-primary focus:bg-surface-container transition-all text-on-surface font-body font-bold placeholder-on-surface-variant/50 py-4 pl-12 pr-4 rounded-none outline-none" 
              placeholder="BUSCAR CANCIÓN..." 
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <button onClick={handleCreateSong} className="bg-primary hover:bg-primary-container text-white font-headline font-black uppercase tracking-[0.1em] px-8 py-4 transition-all duration-200 hover:shadow-[2px_2px_0_0_#008C8C] flex items-center justify-center gap-3 shrink-0 rounded-none">
            <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>add</span>
            NUEVA CANCIÓN
          </button>
          <button onClick={() => setShowSpotifyModal(true)} className="bg-secondary hover:bg-secondary-container text-on-secondary font-headline font-bold uppercase tracking-[0.08em] px-6 py-4 transition-all duration-200 flex items-center justify-center gap-2 shrink-0 rounded-none">
            <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>library_music</span>
            IMPORTAR DESDE SPOTIFY
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="hidden md:grid grid-cols-12 gap-6 px-8 py-2 text-xs font-headline font-bold uppercase tracking-widest text-on-surface-variant/60">
          <div className="col-span-5">Título</div>
          <div className="col-span-3">Autor</div>
          <div className="col-span-2">Tonalidad</div>
          <div className="col-span-2 text-right">Acciones</div>
        </div>

        {isLoadingSongs ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-surface-container-low grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-center p-6 md:px-8 animate-pulse">
              <div className="col-span-1 md:col-span-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-surface-container-highest shrink-0" />
                <div className="flex flex-col gap-2 flex-1">
                  <div className="h-5 bg-surface-container-highest w-3/4" />
                  <div className="h-3 bg-surface-container-highest w-1/2 md:hidden" />
                </div>
              </div>
              <div className="hidden md:block col-span-3">
                <div className="h-4 bg-surface-container-highest w-1/2" />
              </div>
              <div className="hidden md:block col-span-2">
                <div className="h-5 bg-surface-container-highest w-16" />
              </div>
              <div className="col-span-2" />
            </div>
          ))
        ) : (
          paginatedSongs.map((song, i) => {
          const colorClass = avatarColors[((currentPage - 1) * pageSize + i) % avatarColors.length];
          
          return (
            <div key={song.id} className="group bg-surface-container-low hover:bg-surface-container transition-colors grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-center p-6 md:px-8 relative">
              <div className="col-span-1 md:col-span-5 flex items-center gap-4">
                <div className={`w-12 h-12 flex items-center justify-center font-headline font-black text-xl shrink-0 ${colorClass}`}>
                  {song.title.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="font-headline font-bold text-xl uppercase tracking-tight text-on-surface">{song.title}</span>
                  <span className="font-body text-sm text-on-surface-variant md:hidden">{song.author || 'Anónimo'}</span>
                </div>
              </div>
              
              <div className="hidden md:flex col-span-3 font-body text-on-surface-variant">
                {song.author || 'Anónimo'}
              </div>
              
              <div className="hidden md:flex col-span-2">
                <span className="bg-primary/10 text-primary font-body font-bold text-xs px-3 py-1 tracking-widest">
                  {song.parts.length} PARTES
                </span>
              </div>
              
              <div className="col-span-1 md:col-span-2 flex items-center justify-end gap-2 absolute top-6 right-6 md:relative md:top-auto md:right-auto">
                <button onClick={() => handleEditSong(song)} className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors rounded-none" title="Editar">
                  <span className="material-symbols-outlined">edit</span>
                </button>
                <a
                  href={`${API_URL}/api/export/pptx/song/${song.id}`}
                  className="p-2 text-on-surface-variant hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors rounded-none"
                  title="Descargar PPTX"
                >
                  <span className="material-symbols-outlined">download</span>
                </a>
                <button 
                  onClick={() => setDeleteConfirmId(song.id)}
                  className="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors rounded-none" 
                  title="Eliminar"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          );
        }))}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-6 border-t border-outline-variant/20 mt-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-headline text-on-surface-variant uppercase tracking-widest">
                {filteredSongs.length} canciones
              </span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-surface-container-low border border-outline-variant/30 text-on-surface font-headline font-bold text-xs py-1 px-2 focus:border-primary outline-none"
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} por página</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent rounded-none"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={`w-8 h-8 font-headline font-bold text-xs transition-colors ${
                    pg === currentPage
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                >
                  {pg}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent rounded-none"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>
        )}

        {filteredSongs.length === 0 && (
          <div className="p-16 text-center text-on-surface-variant font-headline uppercase tracking-widest text-sm">
            {searchQuery ? `Sin resultados para "${searchQuery}"` : 'No hay canciones en el catálogo.'}
          </div>
        )}
      </section>

      {/* Custom Modal for DELETE CONFIRM */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface w-full max-w-md border border-outline-variant/30 shadow-2xl">
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30">
               <h3 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface flex items-center gap-2">
                 <span className="material-symbols-outlined text-error">warning</span>
                 Eliminar Canción
               </h3>
               <button onClick={() => setDeleteConfirmId(null)} className="text-on-surface-variant hover:text-error transition-colors">
                 <span className="material-symbols-outlined">close</span>
               </button>
            </div>
            <div className="p-8 pb-10">
              <p className="font-body text-base text-on-surface-variant leading-relaxed">
                ¿Estás seguro que deseas eliminar esta canción del catálogo? Esta acción no se puede deshacer y podría afectar las listas de proyección que ya la incluyen.
              </p>
            </div>
            <div className="p-4 bg-surface-container flex justify-end gap-3 border-t border-outline-variant/30">
               <button onClick={() => setDeleteConfirmId(null)} className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-colors border border-outline-variant/50">Cancelar</button>
               <button onClick={executeDelete} className="bg-error text-white px-8 py-3 font-headline font-black text-xs uppercase tracking-widest hover:bg-error-container hover:shadow-[0_4px_0_0_theme(colors.error-container)] transition-all">
                 Confirmar
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Modal for "NUEVA/EDITAR CANCIÓN" */}
      {editingSong && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200">
          <div className="bg-surface w-full max-w-4xl max-h-full flex flex-col border border-outline-variant/30 shadow-2xl">
            {/* Header */}
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30 shrink-0">
               <h3 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface">
                  {editingSong === 'NEW' ? 'Agregar Canción' : 'Editar Canción'}
               </h3>
                <button onClick={() => hasUnsavedChanges() ? setShowCloseConfirm(true) : setEditingSong(null)} className="text-on-surface-variant hover:text-error transition-colors">
                 <span className="material-symbols-outlined">close</span>
               </button>
            </div>
            
            {/* Body: Metadata + Toolbar + Parts */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
              
              {/* Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-container p-4 border-l-4 border-primary shrink-0">
                <div>
                  <label className="block text-xs font-bold font-headline uppercase text-on-surface-variant mb-1">TÍTULO *</label>
                  <input 
                     autoFocus
                     value={formData.title}
                     onChange={e => setFormData({ ...formData, title: e.target.value })}
                     className="w-full bg-surface-container-low border-b-2 border-outline-variant focus:border-primary px-3 py-2 outline-none font-body text-lg font-bold text-on-surface transition-colors placeholder:text-outline-variant/50"
                     placeholder="Ej. Hermoso Nombre"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold font-headline uppercase text-on-surface-variant mb-1">AUTOR (Opcional)</label>
                  <input 
                     value={formData.author}
                     onChange={e => setFormData({ ...formData, author: e.target.value })}
                     className="w-full bg-surface-container-low border-b-2 border-outline-variant focus:border-primary px-3 py-2 outline-none font-body text-base text-on-surface transition-colors placeholder:text-outline-variant/50"
                     placeholder="Autor o banda..."
                  />
                </div>
              </div>

              {/* Style Toolbar — compact, always visible */}
              <div className="flex items-center gap-x-3 gap-y-1 flex-wrap bg-surface-container-low border border-outline-variant/20 px-3 py-2 shrink-0">
                <span className="text-[9px] font-headline font-black uppercase tracking-widest text-on-surface-variant">Estilo</span>
                <span className="text-on-surface-variant/30 select-none">│</span>
                
                <div className="flex items-center gap-1">
                  <span className="text-[8px] font-headline font-bold uppercase text-outline tracking-wider">Fuente:</span>
                  <select
                    value={styleData.themeFontFamily}
                    onChange={e => { loadFont(e.target.value); setStyleData(prev => ({ ...prev, themeFontFamily: e.target.value })); }}
                    className="bg-transparent border-b border-outline-variant text-[10px] font-bold uppercase text-on-surface focus:border-primary outline-none py-0.5 px-1 max-w-[100px]"
                  >
                    <option value="">Default</option>
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
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[8px] font-headline font-bold uppercase text-outline tracking-wider">Texto:</span>
                  <input type="color" value={styleData.themeFontColor} onChange={e => setStyleData(prev => ({ ...prev, themeFontColor: e.target.value }))} className="w-5 h-5 cursor-pointer border border-outline-variant/40 rounded" title="Color de texto" />
                </div>

                <div className="flex items-center gap-0.5">
                  <span className="text-[8px] font-headline font-bold uppercase text-outline tracking-wider">Tam:</span>
                  <button onClick={() => setStyleData(prev => ({ ...prev, themeFontSize: Math.max(0.5, +(prev.themeFontSize - 0.1).toFixed(1)) }))} className="p-0.5 text-on-surface-variant hover:text-primary transition-colors" title="Reducir tamaño">
                    <span className="material-symbols-outlined text-[14px]">text_decrease</span>
                  </button>
                  <input 
                    type="number" min="0.5" max="2.5" step="0.1"
                    value={styleData.themeFontSize}
                    onChange={e => setStyleData(prev => ({ ...prev, themeFontSize: Math.min(2.5, Math.max(0.5, parseFloat(e.target.value) || 0.5)) }))}
                    className="w-12 text-center bg-surface-container-low border-b border-outline-variant text-sm font-headline font-black text-on-surface outline-none focus:border-primary px-1 [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button onClick={() => setStyleData(prev => ({ ...prev, themeFontSize: Math.min(2.5, +(prev.themeFontSize + 0.1).toFixed(1)) }))} className="p-0.5 text-on-surface-variant hover:text-primary transition-colors" title="Aumentar tamaño">
                    <span className="material-symbols-outlined text-[14px]">text_increase</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[8px] font-headline font-bold uppercase text-outline tracking-wider">Fondo:</span>
                  <select
                    value={styleData.themeBgType}
                    onChange={e => {
                      const v = e.target.value;
                      setStyleData(prev => ({ ...prev, themeBgType: v, themeBgValue: v === 'COLOR' ? '#1a1a2e' : '' }));
                    }}
                    className="bg-transparent border-b border-outline-variant text-[10px] font-bold uppercase text-on-surface focus:border-primary outline-none py-0.5 px-1"
                  >
                    <option value="COLOR">Color</option>
                    <option value="IMAGE">Imagen</option>
                    <option value="VIDEO">Video</option>
                  </select>
                  {styleData.themeBgType === 'COLOR' && (
                    <input type="color" value={styleData.themeBgValue || '#1a1a2e'} onChange={e => setStyleData(prev => ({ ...prev, themeBgValue: e.target.value }))} className="w-5 h-5 cursor-pointer border border-outline-variant/40 rounded" title="Color de fondo" />
                  )}
                </div>

                <span className="text-on-surface-variant/30 select-none">│</span>

                <button
                  onClick={() => setShowStylePopover(!showStylePopover)}
                  className={`flex items-center gap-1 text-[10px] font-headline font-bold uppercase tracking-widest transition-colors ${showStylePopover ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}`}
                >
                  <span className="material-symbols-outlined text-[16px]">tune</span>
                  Avanzado
                </button>
              </div>

              {/* Parts Builder */}
              <div className="flex flex-col gap-3 min-h-0">
                <div className="sticky top-0 z-10 bg-surface pb-2 flex flex-col gap-2">
                  <div className="flex justify-between items-end shrink-0">
                    <h4 className="font-headline font-black text-lg text-on-surface uppercase tracking-widest">Diapositivas</h4>
                    <button onClick={addPart} className="text-primary hover:text-primary-container font-headline font-bold text-xs uppercase tracking-widest flex items-center gap-1 transition-colors">
                      <span className="material-symbols-outlined text-[16px]">add</span> AÑADIR PARTE
                    </button>
                  </div>
                

                </div>

                <div className="flex flex-col gap-3">
                  {parts.length === 0 && (
                    <div className="p-8 text-center text-outline text-sm font-medium border-2 border-dashed border-outline-variant/30">
                      No hay estrofas. Añade al menos una para que pueda ser proyectada.
                    </div>
                  )}
                  {parts.map((part, idx) => (
                    <div
                      key={part.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).classList.add('border-t-2', 'border-primary');
                      }}
                      onDragLeave={(e) => {
                        (e.currentTarget as HTMLElement).classList.remove('border-t-2', 'border-primary');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).classList.remove('border-t-2', 'border-primary');
                        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                        const toIdx = idx;
                        if (fromIdx === toIdx) return;
                        const newParts = [...parts];
                        const [moved] = newParts.splice(fromIdx, 1);
                        newParts.splice(toIdx, 0, moved);
                        setParts(newParts);
                        setSelectedParts(prev => {
                          const next = new Set<number>();
                          prev.forEach(i => {
                            if (i === fromIdx) next.add(toIdx);
                            else if (fromIdx < toIdx && i > fromIdx && i <= toIdx) next.add(i - 1);
                            else if (fromIdx > toIdx && i >= toIdx && i < fromIdx) next.add(i + 1);
                            else next.add(i);
                          });
                          return next;
                        });
                      }}
                      className="bg-surface-container p-3 border-l-2 border-primary flex flex-col md:flex-row gap-3 relative md:items-start"
                    >
                       
                        <div className="flex items-start gap-2 shrink-0 pt-1">
                          <input
                            type="checkbox"
                            checked={selectedParts.has(idx)}
                            onChange={() => togglePartSelect(idx)}
                            className="w-4 h-4 accent-primary cursor-pointer mt-0.5"
                          />
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', String(idx));
                              (e.currentTarget as HTMLElement).style.opacity = '0.4';
                            }}
                            onDragEnd={(e) => {
                              (e.currentTarget as HTMLElement).style.opacity = '1';
                            }}
                            className="material-symbols-outlined text-on-surface-variant/30 cursor-grab active:cursor-grabbing text-[18px] select-none mt-0.5"
                          >drag_indicator</span>
                        </div>

                        <div className="flex flex-col gap-1.5 shrink-0 md:w-40">
                         <label className="text-[9px] font-bold font-headline uppercase text-on-surface-variant">TIPO DE SECCIÓN</label>
                         <select 
                           value={part.type}
                           onChange={(e) => {
                             const newParts = [...parts];
                             newParts[idx].type = e.target.value;
                             setParts(newParts);
                           }}
                           className="bg-surface-container-low border-b border-outline-variant py-1.5 px-2 text-xs font-bold uppercase text-on-surface focus:border-primary focus:ring-0 outline-none w-full"
                         >
                           <option value="TITULO">Título</option>
                           <option value="VERSO">Verso</option>
                           <option value="ESTRIBILLO">Estribillo</option>
                           <option value="PUENTE">Puente</option>
                           <option value="PRE-CORO">Pre Coro</option>
                           <option value="INTRO">Intro</option>
                           <option value="OUTRO">Outro</option>
                           <option value="INSTRUMENTAL">Instrumental</option>
                           <option value="FINAL">Final</option>
                         </select>
                         <div className="text-[9px] font-bold text-primary">ORDEN: {idx + 1}</div>
                       </div>

                       <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                         <label className="text-[9px] font-bold font-headline uppercase text-on-surface-variant">LETRAS</label>
                         <textarea 
                           value={part.content}
                           onChange={(e) => {
                             const newParts = [...parts];
                             newParts[idx].content = e.target.value;
                             setParts(newParts);
                           }}
                           className="w-full bg-surface border border-outline-variant/30 focus:border-primary px-3 py-2 font-body text-sm text-on-surface transition-colors min-h-[80px] outline-none rounded-none resize-y"
                           placeholder="Escribe la letra aquí..."
                         />
                       </div>

                       {/* Mini preview */}
                       <div className="shrink-0 w-24 sm:w-32 md:w-36 flex flex-col items-center gap-0.5">
                         <span className="text-[7px] font-headline font-bold uppercase text-outline tracking-wider">Preview</span>
                         <div className="w-full border border-outline-variant/20">
                           <ScreenCanvas
                             state={{
                               bgType: styleData.themeBgType,
                               bgValue: styleData.themeBgValue,
                               fontFamily: styleData.themeFontFamily,
                               fontColor: styleData.themeFontColor,
                               fontSize: styleData.themeFontSize,
                             }}
                             text={part.content}
                             videoAutoplay={false}
                           />
                         </div>
                       </div>

                       {/* Controls */}
                       <div className="flex md:flex-col items-center gap-1 shrink-0 ml-auto md:ml-0 self-end md:self-auto border-t border-outline-variant/30 md:border-t-0 pt-2 md:pt-0 w-full md:w-auto justify-end">
                         <button onClick={() => movePart(idx, 'UP')} disabled={idx === 0} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
                           <span className="material-symbols-outlined text-[18px]">keyboard_arrow_up</span>
                         </button>
                          <button onClick={() => movePart(idx, 'DOWN')} disabled={idx === parts.length - 1} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
                            <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
                          </button>

                       </div>
                     </div>
                    ))}
                  {selectedParts.size > 0 && (
                    <div className="sticky bottom-0 z-10 bg-surface-container-high border-t-2 border-primary/40 px-4 py-2 flex items-center justify-between -mx-3 -mb-3">
                      <span className="text-xs font-headline font-bold uppercase text-primary">{selectedParts.size} seleccionadas</span>
                      <div className="flex gap-2">
                        <button onClick={duplicateSelectedParts} className="text-green-600 hover:text-green-400 font-headline font-bold text-xs uppercase tracking-wider flex items-center gap-1 px-3 py-1.5 border border-green-600/30 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                          <span className="material-symbols-outlined text-[14px]">content_copy</span> Duplicar
                        </button>
                        <button onClick={removeSelectedParts} className="text-error hover:text-error-container font-headline font-bold text-xs uppercase tracking-wider flex items-center gap-1 px-3 py-1.5 border border-error/30 hover:bg-error/10 transition-colors">
                          <span className="material-symbols-outlined text-[14px]">delete</span> Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
               </div>
             </div>

             {/* Style Popover */}
            {showStylePopover && (
              <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[15vh]" onClick={() => setShowStylePopover(false)}>
                <div className="bg-surface border border-outline-variant/30 shadow-2xl w-full max-w-sm mx-4 flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="bg-surface-container-highest p-3 flex justify-between items-center border-b border-outline-variant/30">
                    <h4 className="font-headline font-black text-xs uppercase tracking-widest text-on-surface">Estilo Visual</h4>
                    <button onClick={() => setShowStylePopover(false)} className="text-on-surface-variant hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                  <div className="p-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
                    <div className="w-full border border-outline-variant/20">
                      <ScreenCanvas
                        state={{
                          bgType: styleData.themeBgType,
                          bgValue: styleData.themeBgValue,
                          fontFamily: styleData.themeFontFamily,
                          fontColor: styleData.themeFontColor,
                          fontSize: styleData.themeFontSize,
                        }}
                        text={previewText}
                      />
                    </div>
                    <input
                      value={previewText}
                      onChange={e => setPreviewText(e.target.value)}
                      className="w-full border border-outline-variant/30 px-2 py-1.5 text-[10px] font-mono bg-surface-container-low"
                      placeholder="Texto de prueba..."
                    />

                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold font-headline uppercase text-on-surface-variant">Tipografia</label>
                        <select
                          value={styleData.themeFontFamily}
                          onChange={e => { loadFont(e.target.value); setStyleData(prev => ({ ...prev, themeFontFamily: e.target.value })); }}
                          className="bg-surface-container-low border-b border-outline-variant py-1.5 px-2 text-xs font-bold uppercase text-on-surface focus:border-primary outline-none w-full"
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
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold font-headline uppercase text-on-surface-variant">Color de Texto</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={styleData.themeFontColor} onChange={e => setStyleData(prev => ({ ...prev, themeFontColor: e.target.value }))} className="w-7 h-7 cursor-pointer border-0 p-0" />
                          <input value={styleData.themeFontColor} onChange={e => setStyleData(prev => ({ ...prev, themeFontColor: e.target.value }))} className="flex-1 bg-surface-container-low border-b border-outline-variant px-2 py-1 text-[10px] font-mono outline-none" />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold font-headline uppercase text-on-surface-variant">Tamaño de texto</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setStyleData(prev => ({ ...prev, themeFontSize: Math.max(0.5, +(prev.themeFontSize - 0.1).toFixed(1)) }))} className="p-1.5 border border-outline-variant/30 hover:border-primary hover:text-primary text-on-surface-variant transition-colors" title="Reducir">
                            <span className="material-symbols-outlined text-[16px]">text_decrease</span>
                          </button>
                          <input 
                            type="number" min="0.5" max="2.5" step="0.1"
                            value={styleData.themeFontSize}
                            onChange={e => setStyleData(prev => ({ ...prev, themeFontSize: Math.min(2.5, Math.max(0.5, parseFloat(e.target.value) || 0.5)) }))}
                            className="flex-1 text-center bg-surface-container-low border-b-2 border-outline-variant focus:border-primary py-1.5 text-sm font-headline font-black text-on-surface outline-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button onClick={() => setStyleData(prev => ({ ...prev, themeFontSize: Math.min(2.5, +(prev.themeFontSize + 0.1).toFixed(1)) }))} className="p-1.5 border border-outline-variant/30 hover:border-primary hover:text-primary text-on-surface-variant transition-colors" title="Aumentar">
                            <span className="material-symbols-outlined text-[16px]">text_increase</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold font-headline uppercase text-on-surface-variant">Fondo</label>
                        <select
                          value={styleData.themeBgType}
                          onChange={e => {
                            const v = e.target.value;
                            setStyleData(prev => ({ ...prev, themeBgType: v, themeBgValue: v === 'COLOR' ? '#1a1a2e' : '' }));
                          }}
                          className="bg-surface-container-low border-b border-outline-variant py-1.5 px-2 text-xs font-bold uppercase text-on-surface focus:border-primary outline-none w-full"
                        >
                          <option value="COLOR">Color Solido</option>
                          <option value="IMAGE">Imagen</option>
                          <option value="VIDEO">Video Loop</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold font-headline uppercase text-on-surface-variant">Valor de Fondo</label>
                        {styleData.themeBgType === 'COLOR' && (
                          <div className="flex items-center gap-2">
                            <input type="color" value={styleData.themeBgValue || '#1a1a2e'} onChange={e => setStyleData(prev => ({ ...prev, themeBgValue: e.target.value }))} className="w-7 h-7 cursor-pointer border-0 p-0" />
                            <input value={styleData.themeBgValue || '#1a1a2e'} onChange={e => setStyleData(prev => ({ ...prev, themeBgValue: e.target.value }))} className="flex-1 bg-surface-container-low border-b border-outline-variant px-2 py-1 text-[10px] font-mono outline-none" />
                          </div>
                        )}
                        {styleData.themeBgType !== 'COLOR' && (
                          <div className="flex flex-col gap-2">
                            <button type="button" onClick={() => setShowMediaPicker(true)} className="border border-primary text-primary px-3 py-1.5 text-[10px] font-bold uppercase hover:bg-primary hover:text-white transition-colors">
                              Elegir de Biblioteca
                            </button>
                            {styleData.themeBgValue && (
                              <p className="text-[10px] font-mono text-on-surface-variant truncate">{styleData.themeBgValue}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save feedback banner */}
            {saveMsg && (
              <div className={`flex items-center gap-2 px-4 py-2 text-xs font-headline font-bold uppercase tracking-wider shrink-0 ${
                saveMsg.type === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                saveMsg.type === 'warn' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`}>
                <span className="material-symbols-outlined text-[14px]">
                  {saveMsg.type === 'success' ? 'check_circle' : saveMsg.type === 'warn' ? 'info' : 'error'}
                </span>
                {saveMsg.text}
              </div>
            )}
            {/* Footer */}
            <div className="p-4 bg-surface-container flex justify-end gap-3 border-t border-outline-variant/30 shrink-0">
               <button onClick={() => hasUnsavedChanges() ? setShowCloseConfirm(true) : setEditingSong(null)} className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-colors border border-outline-variant/50">Cancelar</button>
               <button onClick={executeSaveSong} disabled={!formData.title.trim() || isSaving} className="bg-primary text-white px-8 py-3 font-headline font-black text-xs uppercase tracking-widest hover:bg-primary-container hover:shadow-[0_4px_0_0_theme(colors.primary-container)] transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2">
                 {isSaving && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                 {editingSong === 'NEW' ? 'Crear Canción' : 'Guardar Cambios'}
               </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showCloseConfirm}
        title="¿Descartar cambios?"
        message="Tienes cambios sin guardar. Si cierras ahora, se perderán."
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        danger
        onConfirm={() => { setShowCloseConfirm(false); setEditingSong(null); setOriginalSnapshot(null); }}
        onCancel={() => setShowCloseConfirm(false)}
      />

      {/* Media Picker Modal */}
      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-surface w-full max-w-2xl max-h-[80vh] flex flex-col border border-outline-variant/30 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30 shrink-0">
              <h3 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface">Biblioteca de Media</h3>
              <button onClick={() => setShowMediaPicker(false)} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3">
              {mediaAssets
                .filter(a => styleData.themeBgType === 'VIDEO' ? a.type === 'VIDEO' : a.type === 'IMAGE')
                .map(asset => (
                  <button key={asset.id} onClick={() => selectMedia(asset)} className="relative group aspect-video bg-surface-container rounded overflow-hidden border-2 border-transparent hover:border-primary transition-colors">
                    {asset.type === 'IMAGE' ? (
                      <img src={asset.url} alt={asset.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface-container-highest">
                        <span className="material-symbols-outlined text-white text-4xl">play_circle</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate">
                      {asset.title}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Spotify Import Modal */}
      {showSpotifyModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200" onClick={() => setShowSpotifyModal(false)}>
          <div className="bg-surface w-full max-w-5xl max-h-[90vh] flex flex-col border border-outline-variant/30 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30 shrink-0">
              <h3 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">library_music</span>
                Importar desde Spotify
              </h3>
              <button onClick={() => setShowSpotifyModal(false)} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* URL Input */}
            <div className="p-6 bg-surface-container-low border-b border-outline-variant/30 shrink-0">
              <label className="text-xs font-bold font-headline uppercase text-on-surface-variant mb-2 block">URL de Playlist de Spotify</label>
              <div className="flex gap-3">
                <input
                  value={spotifyUrl}
                  onChange={e => setSpotifyUrl(e.target.value)}
                  className="flex-1 bg-surface-container border-b-2 border-outline-variant focus:border-primary px-4 py-3 outline-none font-body text-sm text-on-surface transition-colors placeholder:text-outline-variant/50"
                  placeholder="https://open.spotify.com/playlist/..."
                  onKeyDown={e => e.key === 'Enter' && fetchSpotifyPreview()}
                />
                <button
                  onClick={fetchSpotifyPreview}
                  disabled={spotifyLoading || !spotifyUrl.trim()}
                  className="bg-primary hover:bg-primary-container text-white font-headline font-bold text-xs uppercase tracking-widest px-6 py-3 transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
                >
                  {spotifyLoading ? (
                    <><span className="material-symbols-outlined animate-spin">progress_activity</span> Buscando...</>
                  ) : (
                    <><span className="material-symbols-outlined">search</span> Buscar</>
                  )}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex">
              {/* Track List */}
              <div className={`${reviewTrack ? 'w-96 shrink-0 border-r border-outline-variant/30' : 'flex-1'} overflow-y-auto`}>
                {!spotifySearchDone ? (
                  <div className="p-16 text-center text-on-surface-variant font-headline uppercase tracking-widest text-sm">
                    Pegá la URL de una playlist y tocá &quot;Buscar&quot; para encontrar las letras
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-surface-container-highest border-b border-outline-variant/30 flex justify-between items-center shrink-0">
                      <span className="text-xs font-headline font-bold uppercase text-on-surface-variant">
                        {spotifyTracks.length} canciones encontradas
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSpotifySelected(new Set(spotifyTracks.filter(t => t.lyricsFound && !t.isDuplicate).map(t => t.tempId)))}
                          className="text-[10px] font-headline font-bold uppercase text-primary hover:underline"
                        >
                          Seleccionar todas con letra
                        </button>
                        {spotifyTracks.some(t => t.isDuplicate) && (
                          <span className="text-[10px] font-headline font-bold uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">warning</span>
                            {spotifyTracks.filter(t => t.isDuplicate).length} repetidas
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Live progress */}
                    {lyricsProgress && (
                      <div className="px-3 py-2 bg-surface-container border-b border-outline-variant/20">
                        <div className="flex items-center justify-between text-[10px] text-on-surface-variant mb-1">
                          <span className="font-headline font-bold uppercase tracking-wider">
                            Buscando letras: {Math.min(lyricsProgress.current, lyricsProgress.total)} de {lyricsProgress.total}
                          </span>
                          <span>{lyricsProgress.found} encontradas</span>
                        </div>
                        <div className="w-full h-1 bg-surface-container-high overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(lyricsProgress.current / lyricsProgress.total) * 100}%` }} />
                        </div>
                      </div>
                    )}

                    {spotifyTracks.map((track: any, idx: number) => (
                      <div
                        key={track.tempId + idx}
                        className={`flex items-start gap-3 p-3 border-b border-outline-variant/10 hover:bg-surface-container transition-colors ${spotifyReviewIdx === idx ? 'bg-primary/5' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={spotifySelected.has(track.tempId)}
                          onChange={() => toggleSpotifySelect(track.tempId)}
                          className="mt-1 w-4 h-4 accent-primary shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSpotifyReviewIdx(idx)}>
                          <p className="font-headline font-bold text-sm uppercase text-on-surface truncate flex items-center gap-1.5">
                            {track.title}
                            {track.isDuplicate && (
                              <span
                                className="material-symbols-outlined text-[14px] text-amber-500 shrink-0"
                                title={track.duplicateReason === 'catalog' ? 'Ya existe en la biblioteca' : 'Repetida dentro de esta playlist'}
                              >
                                warning
                              </span>
                            )}
                          </p>
                          <p className="font-body text-xs text-on-surface-variant truncate">{track.artist}</p>
                          {track.isDuplicate && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                              {track.duplicateReason === 'catalog' ? 'Ya existe en la biblioteca' : 'Repetida en esta lista'}
                            </p>
                          )}
                          {track.lyricsFound === null ? (
                            <div className="flex items-center gap-2 text-xs text-on-surface-variant/60 mt-1">
                              <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                              <span>Buscando letra...</span>
                            </div>
                          ) : track.lyricsFound ? (
                            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 mt-1">
                              <span className="material-symbols-outlined text-[14px]">check_circle</span>
                              <span>{track.parts?.length || 0} secciones detectadas</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mt-1">
                              <span className="material-symbols-outlined text-[14px]">warning</span>
                              <span>Letra no encontrada — sin contenido</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Review Panel */}
              {reviewTrack && (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 bg-surface-container-highest border-b border-outline-variant/30 flex justify-between items-center shrink-0">
                    <div>
                      <h4 className="font-headline font-bold text-sm uppercase text-on-surface">{reviewTrack.title}</h4>
                      <p className="text-xs text-on-surface-variant">{reviewTrack.artist}</p>
                    </div>
                    <button onClick={() => setSpotifyReviewIdx(null)} className="text-on-surface-variant hover:text-on-surface">
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  <div className="p-4 flex flex-col gap-3">
                    {reviewTrack.parts.map((part: any, partIdx: number) => (
                      <div key={partIdx} className="bg-surface-container p-3 border-l-2 border-primary">
                        <div className="flex items-center justify-between mb-2">
                          <select
                            value={part.type}
                            onChange={e => updateReviewPart(spotifyReviewIdx!, partIdx, 'type', e.target.value)}
                            className="bg-surface-container-low border-b border-outline-variant py-1 px-2 text-xs font-bold uppercase text-on-surface focus:border-primary outline-none"
                          >
                            <option value="TITULO">Título</option>
                            <option value="VERSO">Verso</option>
                            <option value="ESTRIBILLO">Estribillo</option>
                            <option value="PUENTE">Puente</option>
                            <option value="PRE-CORO">Pre Coro</option>
                            <option value="INTRO">Intro</option>
                            <option value="OUTRO">Outro</option>
                            <option value="INSTRUMENTAL">Instrumental</option>
                            <option value="FINAL">Final</option>
                          </select>
                          {reviewTrack.parts.length > 1 && (
                            <button onClick={() => removeReviewPart(spotifyReviewIdx!, partIdx)} className="text-error hover:text-error-container transition-colors">
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          )}
                          <button onClick={() => {
                            const newPart = { type: part.type, content: part.content };
                            const updatedParts = [...reviewTrack.parts];
                            updatedParts.splice(partIdx + 1, 0, newPart);
                            setSpotifyTracks((prev: any[]) => prev.map(t => t.tempId === reviewTrack.tempId ? { ...t, parts: updatedParts } : t));
                          }} className="text-on-surface-variant hover:text-green-600 transition-colors ml-1" title="Duplicar sección">
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                          </button>
                        </div>
                        <textarea
                          value={part.content}
                          onChange={e => updateReviewPart(spotifyReviewIdx!, partIdx, 'content', e.target.value)}
                          rows={Math.max(2, part.content.split('\n').length)}
                          className="w-full bg-surface border border-outline-variant/30 focus:border-primary px-3 py-2 font-body text-sm text-on-surface transition-colors outline-none resize-y min-h-[60px]"
                        />
                      </div>
                    ))}

                    <button
                      onClick={() => addReviewPart(spotifyReviewIdx!)}
                      className="text-primary hover:text-primary-container font-headline font-bold text-xs uppercase tracking-widest flex items-center gap-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span> Agregar sección
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {spotifySearchDone && (
              <div className="p-4 bg-surface-container border-t border-outline-variant/30 flex justify-between items-center shrink-0">
                <span className="text-xs font-headline font-bold uppercase text-on-surface-variant">
                  {spotifySelected.size} seleccionadas
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSpotifyModal(false)}
                    className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-colors border border-outline-variant/50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={importSelected}
                    disabled={spotifyImporting || spotifySelected.size === 0}
                    className="bg-primary text-white px-8 py-3 font-headline font-black text-xs uppercase tracking-widest hover:bg-primary-container transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {spotifyImporting ? (
                      <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span> Importando...</>
                    ) : (
                      <><span className="material-symbols-outlined text-[16px]">download</span> Importar {spotifySelected.size}</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Duplicates Modal */}
      {showDuplicatesModal && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200">
          <div className="bg-surface w-full max-w-lg max-h-[80vh] flex flex-col border border-outline-variant/30 shadow-2xl">
            {/* Header */}
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30 shrink-0">
              <h3 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500">warning</span>
                Canciones Duplicadas
              </h3>
              <button onClick={() => { setShowDuplicatesModal(false); setShowSpotifyModal(false); }} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                Las siguientes canciones ya existen en tu biblioteca. Seleccioná las que querés reimportar (se crearán como nuevas entradas).
              </p>

              {duplicateResults.map((dup: any) => (
                <div key={dup.id} className="flex items-center gap-3 p-3 bg-surface-container-low border border-outline-variant/20 hover:bg-surface-container transition-colors">
                  <input
                    type="checkbox"
                    checked={duplicatesToReimport.has(dup.id)}
                    onChange={() => toggleDuplicateSelect(dup.id)}
                    className="w-4 h-4 accent-primary shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-headline font-bold text-sm uppercase text-on-surface truncate">{dup.title}</p>
                    <p className="font-body text-xs text-on-surface-variant">Ya existe en la biblioteca</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 bg-surface-container border-t border-outline-variant/30 flex justify-between items-center shrink-0">
              <span className="text-xs font-headline font-bold uppercase text-on-surface-variant">
                {duplicatesToReimport.size} seleccionadas para reimportar
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDuplicatesModal(false); setShowSpotifyModal(false); }}
                  className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-colors border border-outline-variant/50"
                >
                  Omitir todas
                </button>
                <button
                  onClick={reimportDuplicates}
                  disabled={duplicatesToReimport.size === 0}
                  className="bg-primary text-white px-8 py-3 font-headline font-black text-xs uppercase tracking-widest hover:bg-primary-container transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Reimportar {duplicatesToReimport.size || ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
