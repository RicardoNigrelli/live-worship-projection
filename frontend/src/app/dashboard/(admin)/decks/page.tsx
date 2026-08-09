"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';

type Layer = {
  id: string;
  type: 'IMAGE';
  url: string;
  x: number;
  y: number;
  width: number;
  zIndex: number;
};

type DeckSlide = {
  id?: string;
  order: number;
  text: string;
  layout: string;
  bgColor: string;
  bgImageUrl: string;
  bgVideoUrl: string;
  fontColor: string;
  fontSize: number;
  layers: Layer[];
};

type Deck = {
  id: string;
  title: string;
  slides: DeckSlide[];
  updatedAt: string;
};

type MediaAsset = { id: string; title: string; type: string; url: string };
type Toast = { message: string; type: 'success' | 'error' };

const DEFAULT_SLIDE = (): DeckSlide => ({
  order: 1, text: '', layout: 'CENTER',
  bgColor: '#1a1a2e', bgImageUrl: '', bgVideoUrl: '',
  fontColor: '#ffffff', fontSize: 1.0, layers: []
});

// Parsea un deck crudo de la API al tipo interno
const parseDeck = (d: any): Deck => ({
  ...d,
  slides: (d.slides || []).map((s: any) => ({
    ...s,
    layers: typeof s.layers === 'string' ? (() => { try { return JSON.parse(s.layers); } catch { return []; } })() : (s.layers || [])
  }))
});

// Convierte el deck interno al payload de la API (limpio, sin campos extra)
const toSlidePayload = (s: DeckSlide) => ({
  ...(s.id ? { id: s.id } : {}),   // solo incluir id si existe (para updates)
  order: s.order,
  text: s.text,
  layout: s.layout,
  bgColor: s.bgColor,
  bgImageUrl: s.bgImageUrl,
  bgVideoUrl: s.bgVideoUrl,
  fontColor: s.fontColor,
  fontSize: s.fontSize,
  layers: JSON.stringify(s.layers),
});

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [selectedSlideIdx, setSelectedSlideIdx] = useState(0);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState<false | 'bg' | 'layer'>(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ layerId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizing = useRef<{ layerId: string; startX: number; startY: number; origW: number } | null>(null);

  const showToast = (message: string, type: Toast['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadDecks = async () => {
    try {
      const data = await fetch(`${API_URL}/api/decks`).then(r => r.json());
      setDecks(Array.isArray(data) ? data.map(parseDeck) : []);
    } catch (e) { console.error(e); } finally {
      setIsLoadingDecks(false);
    }
  };

  useEffect(() => {
    loadDecks();
    fetch(`${API_URL}/api/media`).then(r => r.json()).then(setMediaAssets).catch(console.error);
  }, []);

  const currentSlide: DeckSlide | undefined = editingDeck?.slides[selectedSlideIdx];

  const updateSlide = (patch: Partial<DeckSlide>) => {
    if (!editingDeck) return;
    const slides = [...editingDeck.slides];
    slides[selectedSlideIdx] = { ...slides[selectedSlideIdx], ...patch };
    setEditingDeck({ ...editingDeck, slides });
    setIsDirty(true);
  };

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    setEditingDeck(prev => {
      if (!prev) return prev;
      const slides = [...prev.slides];
      const idx = slides.findIndex((_, i) => i === selectedSlideIdx);
      if (idx === -1) return prev;
      const layers = slides[idx].layers.map(l => l.id === id ? { ...l, ...patch } : l);
      slides[idx] = { ...slides[idx], layers };
      return { ...prev, slides };
    });
  }, [selectedSlideIdx]);

  const addSlide = () => {
    if (!editingDeck) return;
    const newSlide = { ...DEFAULT_SLIDE(), order: editingDeck.slides.length + 1 };
    const slides = [...editingDeck.slides, newSlide];
    setEditingDeck({ ...editingDeck, slides });
    setSelectedSlideIdx(slides.length - 1);
    setIsDirty(true);
  };

  const removeSlide = (idx: number) => {
    if (!editingDeck || editingDeck.slides.length <= 1) return;
    const slides = editingDeck.slides.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }));
    setEditingDeck({ ...editingDeck, slides });
    setSelectedSlideIdx(Math.min(idx, slides.length - 1));
    setIsDirty(true);
  };

  const addLayer = (asset: MediaAsset) => {
    if (!currentSlide) return;
    const layer: Layer = {
      id: crypto.randomUUID(), type: 'IMAGE', url: asset.url,
      x: 10, y: 10, width: 30, zIndex: currentSlide.layers.length + 2
    };
    updateSlide({ layers: [...currentSlide.layers, layer] });
    setShowMediaPicker(false);
  };

  const removeLayer = (id: string) => {
    if (!currentSlide) return;
    updateSlide({ layers: currentSlide.layers.filter(l => l.id !== id) });
  };

  const onLayerMouseDown = (e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    const layer = currentSlide?.layers.find(l => l.id === layerId);
    if (!layer || !canvasRef.current) return;
    dragging.current = { layerId, startX: e.clientX, startY: e.clientY, origX: layer.x, origY: layer.y };
  };

  const onResizeMouseDown = (e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    const layer = currentSlide?.layers.find(l => l.id === layerId);
    if (!layer || !canvasRef.current) return;
    resizing.current = { layerId, startX: e.clientX, startY: e.clientY, origW: layer.width };
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (dragging.current) {
      const dx = ((e.clientX - dragging.current.startX) / rect.width) * 100;
      const dy = ((e.clientY - dragging.current.startY) / rect.height) * 100;
      updateLayer(dragging.current.layerId, {
        x: Math.max(0, Math.min(90, dragging.current.origX + dx)),
        y: Math.max(0, Math.min(90, dragging.current.origY + dy)),
      });
    }
    if (resizing.current) {
      const dx = ((e.clientX - resizing.current.startX) / rect.width) * 100;
      updateLayer(resizing.current.layerId, { width: Math.max(5, Math.min(90, resizing.current.origW + dx)) });
    }
  }, [updateLayer]);

  const onMouseUp = useCallback(() => { dragging.current = null; resizing.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [onMouseMove, onMouseUp]);

  const handleCreateNew = () => {
    setEditingDeck({ id: '', title: 'Nueva Presentación', slides: [DEFAULT_SLIDE()], updatedAt: '' });
    setSelectedSlideIdx(0);
    setIsDirty(false);
  };

  const handleSave = async () => {
    if (!editingDeck) return;
    setSaving(true);
    try {
      const isNew = !editingDeck.id;
      const url = isNew ? `${API_URL}/api/decks` : `${API_URL}/api/decks/${editingDeck.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const payload = {
        title: editingDeck.title,
        slides: editingDeck.slides.map(toSlidePayload),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const saved = await res.json();
      const parsedSaved = parseDeck(saved);
      setEditingDeck(parsedSaved);
      setIsDirty(false);
      await loadDecks();
      showToast(`"${parsedSaved.title}" guardada con ${parsedSaved.slides.length} diapositiva(s)`, 'success');
    } catch (e: any) {
      console.error(e);
      showToast('Error al guardar. Revisá la consola.', 'error');
    }
    setSaving(false);
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    await fetch(`${API_URL}/api/decks/${deleteId}`, { method: 'DELETE' });
    setDecks(decks.filter(d => d.id !== deleteId));
    setDeleteId(null);
    showToast('Presentación eliminada', 'success');
  };

  if (editingDeck) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background font-body relative">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-[200] px-6 py-3 font-headline font-bold text-xs uppercase tracking-widest shadow-xl transition-all flex items-center gap-2 ${toast.type === 'success' ? 'bg-primary text-on-primary' : 'bg-error text-on-error'}`}>
            <span className="material-symbols-outlined text-[16px]">{toast.type === 'success' ? 'check_circle' : 'error'}</span>
            {toast.message}
          </div>
        )}

        {/* Editor Top Bar */}
        <div className="bg-surface-container-highest border-b border-outline-variant/30 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (isDirty && !confirm('Hay cambios sin guardar. ¿Salir igual?')) return;
                setEditingDeck(null);
              }}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <input
              value={editingDeck.title}
              onChange={e => { setEditingDeck({ ...editingDeck, title: e.target.value }); setIsDirty(true); }}
              className="bg-transparent font-headline font-black text-lg uppercase tracking-widest text-on-surface outline-none border-b-2 border-transparent focus:border-primary transition-colors px-1 min-w-[200px]"
            />
            {isDirty && (
              <span className="text-[10px] font-headline text-warning bg-warning/10 px-2 py-0.5 uppercase tracking-widest border border-warning/30">
                Sin guardar
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-headline text-on-surface-variant uppercase tracking-widest">
              {editingDeck.slides.length} diapositiva(s)
            </span>
            <button onClick={addSlide} className="flex items-center gap-1 text-primary font-headline font-bold text-xs uppercase tracking-widest hover:underline">
              <span className="material-symbols-outlined text-[16px]">add</span> Agregar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`font-headline font-bold text-xs uppercase tracking-widest px-6 py-2 transition-colors flex items-center gap-2 ${isDirty ? 'bg-primary text-on-primary hover:bg-primary-container' : 'bg-surface-container text-on-surface-variant'} disabled:opacity-50`}
            >
              <span className="material-symbols-outlined text-[16px]">save</span>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Slide Thumbnails Panel */}
          <div className="w-48 bg-surface-container-low border-r border-outline-variant/20 flex flex-col overflow-y-auto shrink-0 p-2 gap-2">
            {editingDeck.slides.map((slide, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedSlideIdx(idx)}
                className={`relative group cursor-pointer overflow-hidden border-2 transition-all ${idx === selectedSlideIdx ? 'border-primary' : 'border-transparent hover:border-outline-variant'}`}
              >
                <div
                  className="aspect-video w-full flex items-center justify-center text-center overflow-hidden"
                  style={{ background: slide.bgImageUrl ? `url(${slide.bgImageUrl}) center/cover` : slide.bgColor || '#1a1a2e' }}
                >
                  {slide.text && (
                    <p className="font-bold px-1 leading-tight" style={{ fontSize: '7px', color: slide.fontColor || '#fff' }}>
                      {slide.text.slice(0, 60)}
                    </p>
                  )}
                  {!slide.text && (
                    <p className="font-body italic" style={{ fontSize: '6px', color: 'rgba(255,255,255,0.3)' }}>vacía</p>
                  )}
                </div>
                <span className="absolute top-1 left-1 bg-black/60 text-white font-headline text-[8px] px-1">{idx + 1}</span>
                {editingDeck.slides.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); removeSlide(idx); }}
                    className="absolute top-1 right-1 bg-error/80 text-white opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[10px]">close</span>
                  </button>
                )}
              </div>
            ))}
            <button onClick={addSlide} className="aspect-video w-full border-2 border-dashed border-outline-variant/40 flex items-center justify-center text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-xl">add</span>
            </button>
          </div>

          {/* Canvas Editor */}
          <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950 p-6 gap-4">
            {currentSlide ? (
              <>
                <div className="flex-1 flex items-center justify-center overflow-hidden">
                  <div
                    ref={canvasRef}
                    className="relative overflow-hidden shadow-2xl"
                    style={{
                      aspectRatio: '16/9',
                      height: 'min(calc(100vh - 300px), 60vh)',
                      background: currentSlide.bgImageUrl
                        ? `url(${currentSlide.bgImageUrl}) center/cover`
                        : (currentSlide.bgColor || '#1a1a2e')
                    }}
                  >
                    {currentSlide.bgVideoUrl && (
                      <video src={currentSlide.bgVideoUrl} autoPlay loop muted className="absolute inset-0 w-full h-full object-cover" />
                    )}

                    {currentSlide.layers.map(layer => (
                      <div
                        key={layer.id}
                        onMouseDown={e => onLayerMouseDown(e, layer.id)}
                        className="absolute group cursor-move select-none"
                        style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, zIndex: layer.zIndex }}
                      >
                        <img src={layer.url} alt="" className="w-full h-auto pointer-events-none select-none shadow-lg" draggable={false} />
                        <div
                          onMouseDown={e => onResizeMouseDown(e, layer.id)}
                          className="absolute bottom-0 right-0 w-5 h-5 bg-primary cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-white text-[10px]">open_in_full</span>
                        </div>
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={() => removeLayer(layer.id)}
                          className="absolute -top-3 -right-3 w-5 h-5 bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </div>
                    ))}

                    <div
                      className={`absolute inset-0 flex items-center p-8 pointer-events-none ${
                        currentSlide.layout === 'LEFT' ? 'justify-start text-left' :
                        currentSlide.layout === 'SPLIT' ? 'items-end justify-center text-center' :
                        'justify-center text-center'
                      }`}
                      style={{ zIndex: 10 }}
                    >
                      <p
                        className="font-bold leading-tight whitespace-pre-wrap drop-shadow-lg"
                        style={{
                          color: currentSlide.fontColor || '#ffffff',
                          fontSize: currentSlide.fontSize
                            // Old pixel format (> 10) → convert; new scale format → direct
                            ? (currentSlide.fontSize > 10
                                ? `${Math.min(2.5, Math.max(0.5, currentSlide.fontSize / 48)) * 8}cqw`
                                : `${currentSlide.fontSize * 8}cqw`)
                            : '5cqw'
                        }}
                      >
                      {currentSlide.text
                        ? currentSlide.text
                        : currentSlide.layers.length === 0
                          ? <span style={{ opacity: 0.25, fontStyle: 'italic' }}>Escribe el texto en el panel derecho...</span>
                          : null
                      }
                      </p>
                    </div>
                  </div>
                </div>

                {/* Controls Row */}
                <div className="shrink-0 bg-surface-container border border-outline-variant/20 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">Fondo</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={currentSlide.bgColor || '#1a1a2e'}
                        onChange={e => updateSlide({ bgColor: e.target.value, bgImageUrl: '', bgVideoUrl: '' })}
                        className="w-9 h-9 cursor-pointer border border-outline-variant/30 p-0.5 bg-surface-container-low"
                      />
                      <button
                        onClick={() => setShowMediaPicker('bg')}
                        className={`flex-1 text-[10px] font-headline uppercase tracking-widest border px-2 py-2 truncate text-left transition-colors ${currentSlide.bgImageUrl || currentSlide.bgVideoUrl ? 'border-primary text-primary bg-primary/5' : 'border-outline-variant/30 text-on-surface-variant hover:text-primary'}`}
                      >
                        {currentSlide.bgImageUrl ? '✓ Imagen' : currentSlide.bgVideoUrl ? '✓ Video' : '+ Imagen/Video'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">Texto (color / tamaño)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={currentSlide.fontColor || '#ffffff'}
                        onChange={e => updateSlide({ fontColor: e.target.value })}
                        className="w-9 h-9 cursor-pointer border border-outline-variant/30 p-0.5 bg-surface-container-low"
                      />
                      <input
                        type="number"
                        value={currentSlide.fontSize && currentSlide.fontSize > 10 ? +(currentSlide.fontSize / 48).toFixed(1) : (currentSlide.fontSize || 1.0)}
                        min={0.5} max={2.5} step={0.1}
                        onChange={e => updateSlide({ fontSize: Number(e.target.value) })}
                        className="flex-1 bg-surface-container-low border border-outline-variant/30 px-2 py-2 text-xs font-headline text-on-surface focus:border-primary outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">Layout</label>
                    <select
                      value={currentSlide.layout}
                      onChange={e => updateSlide({ layout: e.target.value })}
                      className="bg-surface-container-low border border-outline-variant/30 px-2 py-2 text-xs font-headline uppercase text-on-surface focus:border-primary outline-none"
                    >
                      <option value="CENTER">Centrado</option>
                      <option value="LEFT">Izquierda</option>
                      <option value="SPLIT">Inferior</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">Imagen flotante</label>
                    <button
                      onClick={() => setShowMediaPicker('layer')}
                      className="bg-surface-container-highest hover:bg-surface-container text-on-surface font-headline font-bold text-[10px] uppercase tracking-widest py-2 flex items-center justify-center gap-1 transition-colors border border-outline-variant/30"
                    >
                      <span className="material-symbols-outlined text-[14px]">add_photo_alternate</span>
                      + Agregar Imagen
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Text Side Panel */}
          <div className="w-64 bg-surface border-l border-outline-variant/20 flex flex-col p-4 gap-4 shrink-0">
            <h3 className="font-headline font-black text-xs uppercase tracking-widest text-on-surface-variant">Texto</h3>
            <textarea
              value={currentSlide?.text || ''}
              onChange={e => updateSlide({ text: e.target.value })}
              className="flex-1 bg-surface-container-low border border-outline-variant/30 focus:border-primary px-3 py-3 font-body text-sm text-on-surface transition-colors outline-none rounded-none resize-none min-h-[200px]"
              placeholder="Escribe el texto aquí..."
            />
            {currentSlide && currentSlide.layers.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="font-headline font-black text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Capas ({currentSlide.layers.length})
                </h3>
                {[...currentSlide.layers].sort((a, b) => b.zIndex - a.zIndex).map(layer => (
                  <div key={layer.id} className="flex items-center gap-2 bg-surface-container-low p-2 group">
                    <img src={layer.url} className="w-8 h-8 object-cover shrink-0" alt="" />
                    <span className="text-[10px] font-headline text-on-surface-variant flex-1 truncate">z:{layer.zIndex}</span>
                    <button onClick={() => removeLayer(layer.id)} className="text-error hover:opacity-70 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Media Picker Modal */}
        {showMediaPicker && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowMediaPicker(false)}>
            <div className="bg-surface w-full max-w-2xl border border-outline-variant/30 shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-outline-variant/30 flex justify-between items-center">
                <h3 className="font-headline font-black uppercase tracking-widest text-on-surface">
                  {showMediaPicker === 'bg' ? 'Fondo — Imagen o Video' : 'Imagen Flotante'}
                </h3>
                <button onClick={() => setShowMediaPicker(false)} className="text-on-surface-variant hover:text-error">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {mediaAssets.length === 0 ? (
                  <p className="text-center text-on-surface-variant text-sm py-12">
                    No hay archivos. Subí imágenes/videos en la sección <strong>Multimedia</strong>.
                  </p>
                ) : (
                  <>
                    <p className="text-[10px] font-headline uppercase tracking-widest text-on-surface-variant mb-3">Imágenes</p>
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {mediaAssets.filter(a => a.type === 'IMAGE').map(asset => (
                        <button
                          key={asset.id}
                          onClick={() => showMediaPicker === 'bg'
                            ? (updateSlide({ bgImageUrl: asset.url, bgVideoUrl: '', bgColor: '#000' }), setShowMediaPicker(false))
                            : addLayer(asset)
                          }
                          className="aspect-square overflow-hidden border-2 border-transparent hover:border-primary transition-all group"
                        >
                          <img src={asset.url} alt={asset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        </button>
                      ))}
                    </div>
                    {showMediaPicker === 'bg' && mediaAssets.filter(a => a.type === 'VIDEO').length > 0 && (
                      <>
                        <p className="text-[10px] font-headline uppercase tracking-widest text-on-surface-variant mb-3">Videos de fondo</p>
                        <div className="grid grid-cols-4 gap-2">
                          {mediaAssets.filter(a => a.type === 'VIDEO').map(asset => (
                            <button
                              key={asset.id}
                              onClick={() => { updateSlide({ bgVideoUrl: asset.url, bgImageUrl: '' }); setShowMediaPicker(false); }}
                              className="aspect-square bg-surface-container-low border-2 border-transparent hover:border-primary flex flex-col items-center justify-center gap-1 transition-all"
                            >
                              <span className="material-symbols-outlined text-on-surface-variant">movie</span>
                              <span className="text-[9px] font-headline text-on-surface-variant text-center px-1 truncate w-full">{asset.title}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Deck List View ───────────────────────────────────────────
  return (
    <main className="flex-1 p-6 md:p-12 lg:p-20 max-w-7xl mx-auto w-full">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[200] px-6 py-3 font-headline font-bold text-xs uppercase tracking-widest shadow-xl flex items-center gap-2 ${toast.type === 'success' ? 'bg-primary text-on-primary' : 'bg-error text-on-error'}`}>
          <span className="material-symbols-outlined text-[16px]">{toast.type === 'success' ? 'check_circle' : 'error'}</span>
          {toast.message}
        </div>
      )}

      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-12 mb-16">
        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-secondary-fixed/20 text-secondary font-body font-bold text-xs uppercase tracking-widest px-3 py-1 w-max mb-2">
            <span className="w-1.5 h-1.5 bg-secondary"></span>
            Presentaciones
          </div>
          <h1 className="font-headline text-5xl md:text-7xl font-black uppercase tracking-[-0.02em] leading-[0.9] text-on-surface">
            Diapositivas<br/>
            <span className="text-secondary">Personalizadas</span>
          </h1>
          <p className="font-body text-lg text-on-surface-variant leading-relaxed mt-4 max-w-lg">
            Creá presentaciones con texto, imágenes y video. Importalas en cualquier reunión.
          </p>
        </div>
        <button onClick={handleCreateNew} className="bg-primary hover:bg-primary-container text-white font-headline font-black uppercase tracking-[0.1em] px-8 py-4 transition-all duration-200 flex items-center justify-center gap-3 shrink-0">
          <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>add</span>
          NUEVA PRESENTACIÓN
        </button>
      </section>

      {isLoadingDecks ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="bg-surface-container-low border border-outline-variant/20 p-6 animate-pulse">
              <div className="aspect-video w-full bg-surface-container/50 mb-4" />
              <div className="h-5 bg-surface-container rounded w-3/4 mb-3" />
              <div className="h-3 bg-surface-container rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : decks.length === 0 ? (
        <div className="p-20 text-center text-on-surface-variant font-headline uppercase tracking-widest text-sm border-2 border-dashed border-outline-variant/30">
          No hay presentaciones todavía. ¡Creá la primera!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {decks.map(deck => (
            <div key={deck.id} className="group bg-surface-container-low hover:bg-surface-container transition-colors border border-outline-variant/20 flex flex-col">
              <div
                className="aspect-video w-full flex items-center justify-center relative overflow-hidden"
                style={{
                  background: deck.slides[0]?.bgImageUrl
                    ? `url(${deck.slides[0].bgImageUrl}) center/cover`
                    : (deck.slides[0]?.bgColor || '#1a1a2e')
                }}
              >
                {deck.slides[0]?.bgVideoUrl && (
                  <video src={deck.slides[0].bgVideoUrl} autoPlay loop muted className="absolute inset-0 w-full h-full object-cover" />
                )}
                <p className="relative z-10 font-bold text-center px-4 leading-tight text-sm drop-shadow" style={{ color: deck.slides[0]?.fontColor || '#fff' }}>
                  {deck.slides[0]?.text?.slice(0, 60) || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>Sin texto</span>}
                </p>
                <span className="absolute bottom-2 right-2 bg-black/60 text-white font-headline text-[9px] px-2 py-0.5 z-10">
                  {deck.slides?.length ?? 0} DIAP.
                </span>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-headline font-black text-base uppercase tracking-tight text-on-surface">{deck.title}</h3>
                  <p className="text-on-surface-variant text-xs font-body">{deck.slides?.length ?? 0} diapositivas</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setEditingDeck(deck); setSelectedSlideIdx(0); setIsDirty(false); }}
                    className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Editar"
                  >
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button
                    onClick={() => setDeleteId(deck.id)}
                    className="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                    title="Eliminar"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md border border-outline-variant/30 shadow-2xl">
            <div className="p-6 flex flex-col gap-4">
              <h3 className="font-headline font-black text-lg uppercase text-on-surface">Eliminar Presentación</h3>
              <p className="text-on-surface-variant text-sm">Esta acción eliminará todas las diapositivas permanentemente.</p>
            </div>
            <div className="p-4 bg-surface-container flex justify-end gap-3 border-t border-outline-variant/30">
              <button onClick={() => setDeleteId(null)} className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase border border-outline-variant/50 hover:bg-surface-container-highest transition-colors">Cancelar</button>
              <button onClick={executeDelete} className="bg-error text-white px-8 py-3 font-headline font-black text-xs uppercase hover:bg-error/90 transition-all">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
