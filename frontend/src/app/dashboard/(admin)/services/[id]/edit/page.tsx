"use client";
import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import Link from 'next/link';
import { API_URL } from '@/lib/api';

type ServiceItem = {
  id: string;
  order: number;
  type: string;
  song?: { id: string; title: string; author: string | null; parts: any[] };
  deck?: { id: string; title: string; slides: any[] };
  mediaAsset?: { id: string; title: string; type: string; url: string };
};

type ModalTab = 'SONGS' | 'DECKS' | 'MEDIA';

type PendingItem = {
  type: 'SONG' | 'DECK' | 'MEDIA';
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  thumbnail?: string;
};

export default function ServiceEditPage({ params }: { params: { id: string } }) {
  const [service, setService] = useState<any>(null);
  const [songs, setSongs] = useState<any[]>([]);
  const [decks, setDecks] = useState<any[]>([]);
  const [mediaAssets, setMediaAssets] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab>('SONGS');
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  const [removeId, setRemoveId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // Style state
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [serviceStyle, setServiceStyle] = useState({
    fontFamily: service?.fontFamily || '',
    fontColor: service?.fontColor || '#ffffff',
    fontSize: service?.fontSize || 1.0,
    bgType: service?.bgType || 'COLOR',
    bgValue: service?.bgValue || '#1a1a2e',
  });
  const [savingStyle, setSavingStyle] = useState(false);
  const [previewText, setPreviewText] = useState('Ejemplo de texto del culto');

  const saveServiceStyle = async () => {
    setSavingStyle(true);
    try {
      await fetch(`${API_URL}/api/services/${params.id}/style`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceStyle),
      });
       setService((prev: any) => ({ ...prev, ...serviceStyle }));
      setShowStylePanel(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingStyle(false);
    }
  };

  // Confirmation state
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [selectedInModal, setSelectedInModal] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const fetchService = () =>
    fetch(`${API_URL}/api/services/${params.id}`)
      .then(r => r.json()).then(setService).catch(console.error);

  useEffect(() => {
    fetchService();
    fetch(`${API_URL}/api/songs`).then(r => r.json()).then(setSongs);
    fetch(`${API_URL}/api/decks`).then(r => r.json()).then(setDecks);
    fetch(`${API_URL}/api/media`).then(r => r.json()).then(setMediaAssets);
  }, [params.id]);

  const openModal = (tab: ModalTab) => {
    setModalTab(tab);
    setSearchQuery('');
    setSelectedInModal(new Set());
    setShowModal(true);
  };

  const togglePendingItem = (type: 'SONG' | 'DECK' | 'MEDIA', id: string, data: any) => {
    setPendingItems(prev => {
      const exists = prev.find(p => p.id === id && p.type === type);
      if (exists) {
        return prev.filter(p => !(p.id === id && p.type === type));
      }
      return [...prev, {
        type,
        id,
        title: data.title,
        subtitle: data.subtitle,
        icon: data.icon,
        thumbnail: data.thumbnail,
      }];
    });
    setSelectedInModal(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmAddAll = async () => {
    if (pendingItems.length === 0) return;
    setConfirming(true);
    const added: string[] = [];

    for (const item of pendingItems) {
      try {
        const body: any = { type: item.type };
        if (item.type === 'SONG') body.songId = item.id;
        if (item.type === 'DECK') body.deckId = item.id;
        if (item.type === 'MEDIA') body.mediaAssetId = item.id;

        await fetch(`${API_URL}/api/services/${params.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        added.push(item.title);
      } catch (e) {
        console.error('Error adding item:', item.title, e);
      }
    }

    await fetchService();
    setConfirming(false);
    setPendingItems([]);
    setSelectedInModal(new Set());
  };

  const cancelAddAll = () => {
    setPendingItems([]);
    setSelectedInModal(new Set());
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !service) return;
    const items: ServiceItem[] = Array.from(service.items);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    const reordered = items.map((item, idx) => ({ ...item, order: idx + 1 }));
    setService({ ...service, items: reordered });
    setReordering(true);
    try {
      await fetch(`${API_URL}/api/services/${params.id}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: reordered.map(i => ({ id: i.id, order: i.order })) })
      });
    } catch { fetchService(); }
    setReordering(false);
  };

  const handleRemove = async () => {
    if (!removeId) return;
    await fetch(`${API_URL}/api/services/items/${removeId}`, { method: 'DELETE' });
    setService({ ...service, items: service.items.filter((i: any) => i.id !== removeId) });
    setRemoveId(null);
  };

  const getItemIcon = (item: ServiceItem) => {
    if (item.type === 'SONG') return 'music_note';
    if (item.type === 'DECK') return 'auto_awesome_mosaic';
    if (item.type === 'MEDIA') return item.mediaAsset?.type === 'VIDEO' ? 'movie' : 'image';
    return 'article';
  };

  const getItemLabel = (item: ServiceItem) => {
    if (item.type === 'SONG') return item.song?.title || 'Canción';
    if (item.type === 'DECK') return item.deck?.title || 'Presentación';
    if (item.type === 'MEDIA') return item.mediaAsset?.title || 'Media';
    return 'Elemento';
  };

  const getItemSub = (item: ServiceItem) => {
    if (item.type === 'SONG') return `${item.song?.author || 'Anónimo'} · ${item.song?.parts?.length || 0} diap.`;
    if (item.type === 'DECK') return `${item.deck?.slides?.length || 0} diapositivas`;
    if (item.type === 'MEDIA') return item.mediaAsset?.type || '';
    return '';
  };

  const getTypeBadgeClass = (type: string) => {
    if (type === 'SONG') return 'bg-primary/10 text-primary';
    if (type === 'DECK') return 'bg-secondary/10 text-secondary';
    return 'bg-tertiary/10 text-tertiary';
  };

  const getTypeLabel = (type: string) => {
    if (type === 'SONG') return 'CANCIÓN';
    if (type === 'DECK') return 'DIAPOSITIVA';
    return 'MEDIA';
  };

  // Filtered lists for modal
  const q = searchQuery.toLowerCase();
  const filteredSongs = songs.filter(s =>
    s.title.toLowerCase().includes(q) || (s.author || '').toLowerCase().includes(q)
  );
  const filteredDecks = decks.filter(d => d.title.toLowerCase().includes(q));
  const filteredMedia = mediaAssets.filter(a => a.title.toLowerCase().includes(q));

  // IDs already in the service
  const existingSongIds = new Set(service?.items?.filter((i: any) => i.type === 'SONG').map((i: any) => i.songId));
  const existingDeckIds = new Set(service?.items?.filter((i: any) => i.type === 'DECK').map((i: any) => i.deckId));
  const existingMediaIds = new Set(service?.items?.filter((i: any) => i.type === 'MEDIA').map((i: any) => i.mediaAssetId));

  if (!service) return (
    <div className="flex-1 flex items-center justify-center text-on-surface-variant font-headline uppercase tracking-widest animate-pulse">
      Cargando reunión...
    </div>
  );

  return (
    <main className="flex-1 flex flex-col overflow-hidden h-full font-body">
      {/* Top Bar */}
      <div className="bg-surface-container-highest border-b border-outline-variant/30 px-8 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/services" className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <div>
            <h1 className="font-headline font-black text-xl uppercase tracking-widest text-on-surface">{service.name}</h1>
            <p className="text-on-surface-variant text-xs font-body">
              {new Date(service.date).toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {' · '}
              <span className="text-primary font-bold">{service.items?.length || 0} elementos</span>
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => openModal('SONGS')}
            className="flex items-center gap-2 bg-primary hover:bg-primary-container text-white font-headline font-bold text-xs uppercase tracking-widest px-5 py-3 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">music_note</span>
            + Canción
          </button>
          <button
            onClick={() => openModal('DECKS')}
            className="flex items-center gap-2 bg-primary hover:bg-primary-container text-white font-headline font-bold text-xs uppercase tracking-widest px-5 py-3 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">auto_awesome_mosaic</span>
            + Diapositiva
          </button>
          <button
            onClick={() => openModal('MEDIA')}
            className="flex items-center gap-2 bg-primary hover:bg-primary-container text-white font-headline font-bold text-xs uppercase tracking-widest px-5 py-3 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">image</span>
            + Multimedia
          </button>
          <span className="w-px h-6 bg-outline-variant/30"></span>
          <a
            href={`${API_URL}/api/export/pptx/service/${params.id}`}
            className="flex items-center gap-2 bg-secondary hover:bg-secondary-container text-on-secondary font-headline font-bold text-xs uppercase tracking-widest px-5 py-3 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Exportar PPTX
          </a>
        </div>
      </div>

      {/* Main Content: DnD List + Style Panel */}
      <div className="flex-1 overflow-hidden flex">
        {/* DnD List */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="service-items">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-2 max-w-4xl mx-auto">
                {service.items?.length === 0 ? (
                  <div className="p-20 text-center border-2 border-dashed border-outline-variant/30 text-on-surface-variant font-headline uppercase tracking-widest text-sm">
                    Usá los botones de arriba para agregar elementos a esta reunión
                  </div>
                ) : (
                  service.items.map((item: ServiceItem, idx: number) => (
                    <Draggable key={item.id} draggableId={item.id} index={idx}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`border flex items-center gap-4 p-4 transition-all ${
                            snapshot.isDragging
                              ? 'bg-surface-container shadow-2xl border-primary'
                              : 'bg-surface-container-low border-outline-variant/20 hover:bg-surface-container'
                          }`}
                        >
                          <div {...provided.dragHandleProps} className="text-outline hover:text-on-surface cursor-grab shrink-0">
                            <span className="material-symbols-outlined">drag_indicator</span>
                          </div>
                          <div className="w-8 h-8 bg-primary/10 text-primary font-headline font-black text-sm flex items-center justify-center shrink-0">
                            {idx + 1}
                          </div>
                          <div className="w-10 h-10 bg-surface-container-highest flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">{getItemIcon(item)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-headline font-bold text-base uppercase tracking-tight text-on-surface truncate">{getItemLabel(item)}</p>
                            <p className="font-body text-xs text-on-surface-variant">{getItemSub(item)}</p>
                          </div>
                          <span className={`text-[9px] font-headline font-black uppercase tracking-widest px-2 py-1 shrink-0 ${getTypeBadgeClass(item.type)}`}>
                            {getTypeLabel(item.type)}
                          </span>
                          <button
                            onClick={() => setRemoveId(item.id)}
                            className="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
          {reordering && (
            <div className="absolute inset-0 z-10 bg-black/20 flex items-center justify-center pointer-events-none">
              <div className="bg-surface-container-high border border-outline-variant/30 shadow-lg px-6 py-3 flex items-center gap-3">
                <span className="material-symbols-outlined animate-spin text-primary text-[20px]">progress_activity</span>
                <span className="font-headline font-bold text-xs uppercase tracking-widest text-on-surface">Reordenando...</span>
              </div>
            </div>
          )}
        </div>

        {/* Style Panel Toggle Button */}
        <button
          onClick={() => setShowStylePanel(!showStylePanel)}
          className="shrink-0 bg-surface-container-highest border-l border-outline-variant/30 px-3 flex items-center justify-center hover:bg-surface-container transition-colors"
          title="Estilo del Culto"
        >
          <span className="material-symbols-outlined text-on-surface-variant">{showStylePanel ? 'chevron_right' : 'chevron_left'}</span>
        </button>

        {/* Style Panel Sidebar */}
        {showStylePanel && (
          <div className="w-80 shrink-0 bg-surface border-l border-outline-variant/30 flex flex-col overflow-y-auto">
            <div className="p-4 border-b border-outline-variant/30">
              <h3 className="font-headline font-black text-sm uppercase tracking-widest text-on-surface">Estilo del Culto</h3>
              <p className="text-[10px] text-on-surface-variant mt-1">Estilos por defecto para toda la reunion</p>
            </div>

            {/* Canvas Preview */}
            <div className="p-4 border-b border-outline-variant/30">
              <div className="relative overflow-hidden shadow-lg" style={{ aspectRatio: '16/9', background: serviceStyle.bgType === 'IMAGE' && serviceStyle.bgValue ? `url(${serviceStyle.bgValue}) center/cover` : serviceStyle.bgValue || '#1a1a2e' }}>
                {serviceStyle.bgType === 'VIDEO' && serviceStyle.bgValue && (
                  <video src={serviceStyle.bgValue} autoPlay loop muted className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 flex items-center justify-center p-2">
                  <p
                    className="text-center uppercase tracking-tight leading-tight whitespace-pre-wrap drop-shadow-lg"
                    style={{
                      fontFamily: serviceStyle.fontFamily ? `"${serviceStyle.fontFamily}", sans-serif` : undefined,
                      color: serviceStyle.fontColor,
                      fontSize: `${serviceStyle.fontSize * 2}vw`,
                    }}
                  >
                    {previewText}
                  </p>
                </div>
              </div>
              <input
                value={previewText}
                onChange={e => setPreviewText(e.target.value)}
                className="w-full mt-2 border border-outline-variant/30 px-2 py-1 text-[10px] font-mono bg-surface-container-low"
                placeholder="Texto de prueba..."
              />
            </div>

            {/* Controls */}
            <div className="p-4 flex flex-col gap-4">
              {/* Typography */}
              <div>
                <label className="text-[10px] font-bold font-headline uppercase text-on-surface-variant block mb-2">Tipografia</label>
                <select
                  value={serviceStyle.fontFamily}
                  onChange={e => setServiceStyle(prev => ({ ...prev, fontFamily: e.target.value }))}
                  className="w-full bg-surface-container-low border-b border-outline-variant py-2 px-2 text-xs font-bold uppercase text-on-surface focus:border-primary outline-none"
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

              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold font-headline uppercase text-on-surface-variant shrink-0">Color</label>
                <input type="color" value={serviceStyle.fontColor} onChange={e => setServiceStyle(prev => ({ ...prev, fontColor: e.target.value }))} className="w-7 h-7 cursor-pointer border-0 p-0" />
                <input value={serviceStyle.fontColor} onChange={e => setServiceStyle(prev => ({ ...prev, fontColor: e.target.value }))} className="flex-1 bg-surface-container-low border-b border-outline-variant px-2 py-1 text-[10px] font-mono outline-none" />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold font-headline uppercase text-on-surface-variant shrink-0">Tamano</label>
                <input type="range" min="0.5" max="2.0" step="0.1" value={serviceStyle.fontSize} onChange={e => setServiceStyle(prev => ({ ...prev, fontSize: parseFloat(e.target.value) }))} className="flex-1" />
                <span className="text-[10px] font-mono w-8 text-right">{serviceStyle.fontSize.toFixed(1)}x</span>
              </div>

              {/* Background */}
              <div className="border-t border-outline-variant/30 pt-4">
                <label className="text-[10px] font-bold font-headline uppercase text-on-surface-variant block mb-2">Fondo</label>
                <select
                  value={serviceStyle.bgType}
                  onChange={e => {
                    const v = e.target.value;
                    setServiceStyle(prev => ({ ...prev, bgType: v, bgValue: v === 'COLOR' ? '#1a1a2e' : '' }));
                  }}
                  className="w-full bg-surface-container-low border-b border-outline-variant py-2 px-2 text-xs font-bold uppercase text-on-surface focus:border-primary outline-none"
                >
                  <option value="COLOR">Color Solido</option>
                  <option value="IMAGE">Imagen</option>
                  <option value="VIDEO">Video Loop</option>
                </select>
              </div>

              {serviceStyle.bgType === 'COLOR' && (
                <div className="flex items-center gap-2">
                  <input type="color" value={serviceStyle.bgValue || '#1a1a2e'} onChange={e => setServiceStyle(prev => ({ ...prev, bgValue: e.target.value }))} className="w-7 h-7 cursor-pointer border-0 p-0" />
                  <input value={serviceStyle.bgValue || '#1a1a2e'} onChange={e => setServiceStyle(prev => ({ ...prev, bgValue: e.target.value }))} className="flex-1 bg-surface-container-low border-b border-outline-variant px-2 py-1 text-[10px] font-mono outline-none" />
                </div>
              )}

              {serviceStyle.bgType !== 'COLOR' && (
                <div>
                  <input
                    value={serviceStyle.bgValue || ''}
                    onChange={e => setServiceStyle(prev => ({ ...prev, bgValue: e.target.value }))}
                    className="w-full bg-surface-container-low border-b border-outline-variant px-2 py-1 text-[10px] font-mono outline-none"
                    placeholder="URL de imagen o video..."
                  />
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="p-4 mt-auto border-t border-outline-variant/30">
              <button
                onClick={saveServiceStyle}
                disabled={savingStyle}
                className="w-full bg-primary hover:bg-primary-container text-white font-headline font-bold text-xs uppercase tracking-widest px-4 py-3 transition-colors disabled:opacity-50"
              >
                {savingStyle ? 'Guardando...' : 'Guardar Estilo'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── ADD CONTENT MODAL ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-surface w-full max-w-2xl border border-outline-variant/20 shadow-2xl flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-surface-container-highest border-b border-outline-variant/30 p-5 flex items-center justify-between shrink-0">
              <h2 className="font-headline font-black text-base uppercase tracking-widest text-on-surface">
                Agregar a la Reunión
              </h2>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-error transition-colors p-1">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-outline-variant/20 shrink-0">
              {([
                { key: 'SONGS', icon: 'music_note', label: 'Canciones', count: songs.length },
                { key: 'DECKS', icon: 'auto_awesome_mosaic', label: 'Diapositivas', count: decks.length },
                { key: 'MEDIA', icon: 'image', label: 'Multimedia', count: mediaAssets.length },
              ] as { key: ModalTab; icon: string; label: string; count: number }[]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setModalTab(tab.key); setSearchQuery(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 font-headline font-bold text-xs uppercase tracking-widest transition-colors border-b-2 ${
                    modalTab === tab.key
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                  {tab.label}
                  <span className={`text-[10px] px-1.5 py-0.5 font-black ${modalTab === tab.key ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="p-4 border-b border-outline-variant/20 shrink-0">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px]">search</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={`Buscar ${modalTab === 'SONGS' ? 'canciones' : modalTab === 'DECKS' ? 'presentaciones' : 'archivos'}...`}
                  autoFocus
                  className="w-full bg-surface-container-low border border-outline-variant/30 focus:border-primary py-2.5 pl-10 pr-4 font-body text-sm text-on-surface outline-none transition-colors"
                />
              </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto">
              {/* SONGS TAB */}
              {modalTab === 'SONGS' && (
                <div className="flex flex-col divide-y divide-outline-variant/10">
                  {filteredSongs.length === 0 ? (
                    <div className="p-10 text-center text-on-surface-variant text-sm font-headline uppercase tracking-widest">
                      {searchQuery ? `Sin resultados para "${searchQuery}"` : 'No hay canciones en el catálogo'}
                    </div>
                  ) : filteredSongs.map(song => {
                    const alreadyAdded = existingSongIds.has(song.id);
                    const isPending = pendingItems.some(p => p.id === song.id && p.type === 'SONG');
                    return (
                      <div key={song.id} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-surface-container-low transition-colors ${alreadyAdded ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isPending}
                          onChange={() => togglePendingItem('SONG', song.id, { title: song.title, subtitle: `${song.author || 'Anónimo'} · ${song.parts?.length || 0} diap.`, icon: 'music_note' })}
                          disabled={alreadyAdded}
                          className="w-4 h-4 accent-primary shrink-0 cursor-pointer disabled:opacity-30"
                        />
                        <div className="w-9 h-9 bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-primary text-[18px]">music_note</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-headline font-bold text-sm uppercase tracking-tight text-on-surface truncate">{song.title}</p>
                          <p className="text-on-surface-variant text-xs font-body">{song.author || 'Anónimo'} · {song.parts?.length || 0} diap.</p>
                        </div>
                        {alreadyAdded ? (
                          <span className="text-[10px] font-headline text-on-surface-variant uppercase tracking-widest px-3 py-1.5 border border-outline-variant/30">Agregada</span>
                        ) : (
                          <span className={`text-[10px] font-headline font-bold uppercase tracking-widest px-3 py-1.5 border transition-colors ${isPending ? 'bg-primary/10 text-primary border-primary/30' : 'text-on-surface-variant border-outline-variant/30'}`}>
                            {isPending ? 'Seleccionada' : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* DECKS TAB */}
              {modalTab === 'DECKS' && (
                <div className="flex flex-col divide-y divide-outline-variant/10">
                  {filteredDecks.length === 0 ? (
                    <div className="p-10 text-center text-on-surface-variant text-sm font-headline uppercase tracking-widest">
                      {searchQuery ? `Sin resultados para "${searchQuery}"` : (
                        <span>No hay diapositivas. <Link href="/dashboard/decks" className="text-primary underline">Crear una</Link></span>
                      )}
                    </div>
                  ) : filteredDecks.map(deck => {
                    const alreadyAdded = existingDeckIds.has(deck.id);
                    const isPending = pendingItems.some(p => p.id === deck.id && p.type === 'DECK');
                    return (
                      <div key={deck.id} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-surface-container-low transition-colors ${alreadyAdded ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isPending}
                          onChange={() => togglePendingItem('DECK', deck.id, { title: deck.title, subtitle: `${deck.slides?.length || 0} diapositivas`, icon: 'auto_awesome_mosaic' })}
                          disabled={alreadyAdded}
                          className="w-4 h-4 accent-primary shrink-0 cursor-pointer disabled:opacity-30"
                        />
                        <div
                          className="w-16 h-10 shrink-0 overflow-hidden flex items-center justify-center"
                          style={{ background: deck.slides?.[0]?.bgColor || '#1a1a2e' }}
                        >
                          {deck.slides?.[0]?.text && (
                            <p className="text-white font-bold px-1" style={{ fontSize: '6px' }}>{deck.slides[0].text.slice(0, 30)}</p>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-headline font-bold text-sm uppercase tracking-tight text-on-surface truncate">{deck.title}</p>
                          <p className="text-on-surface-variant text-xs font-body">{deck.slides?.length || 0} diapositivas</p>
                        </div>
                        {alreadyAdded ? (
                          <span className="text-[10px] font-headline text-on-surface-variant uppercase tracking-widest px-3 py-1.5 border border-outline-variant/30">Agregada</span>
                        ) : (
                          <span className={`text-[10px] font-headline font-bold uppercase tracking-widest px-3 py-1.5 border transition-colors ${isPending ? 'bg-primary/10 text-primary border-primary/30' : 'text-on-surface-variant border-outline-variant/30'}`}>
                            {isPending ? 'Seleccionada' : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* MEDIA TAB */}
              {modalTab === 'MEDIA' && (
                <>
                  {filteredMedia.length === 0 ? (
                    <div className="p-10 text-center text-on-surface-variant text-sm font-headline uppercase tracking-widest">
                      {searchQuery ? `Sin resultados para "${searchQuery}"` : (
                        <span>No hay archivos. <Link href="/dashboard/media" className="text-primary underline">Subir multimedia</Link></span>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3 p-4">
                      {filteredMedia.map(asset => {
                        const alreadyAdded = existingMediaIds.has(asset.id);
                        const isPending = pendingItems.some(p => p.id === asset.id && p.type === 'MEDIA');
                        return (
                          <div key={asset.id} className={`group relative overflow-hidden border-2 aspect-video bg-surface-container-low ${alreadyAdded ? 'opacity-50 border-transparent' : isPending ? 'border-primary' : 'border-transparent hover:border-primary cursor-pointer transition-all'}`}
                            onClick={() => !alreadyAdded && togglePendingItem('MEDIA', asset.id, { title: asset.title, subtitle: asset.type, icon: asset.type === 'VIDEO' ? 'movie' : 'image', thumbnail: asset.type === 'IMAGE' ? asset.url : undefined })}
                          >
                            <input
                              type="checkbox"
                              checked={isPending}
                              onChange={() => togglePendingItem('MEDIA', asset.id, { title: asset.title, subtitle: asset.type, icon: asset.type === 'VIDEO' ? 'movie' : 'image', thumbnail: asset.type === 'IMAGE' ? asset.url : undefined })}
                              disabled={alreadyAdded}
                              className="absolute top-2 left-2 z-10 w-4 h-4 accent-primary cursor-pointer disabled:opacity-30"
                              onClick={e => e.stopPropagation()}
                            />
                            {asset.type === 'IMAGE' ? (
                              <img src={asset.url} alt={asset.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-3xl text-on-surface-variant">movie</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                              {alreadyAdded ? (
                                <span className="text-[10px] font-headline text-white uppercase px-2 py-1 border border-white/40">Agregado</span>
                              ) : isPending ? (
                                <span className="text-[10px] font-headline text-white uppercase font-bold px-2 py-1 border border-primary/40 bg-primary/20">Seleccionado</span>
                              ) : (
                                <>
                                  <span className="material-symbols-outlined text-white text-2xl">add_circle</span>
                                  <p className="text-white font-headline font-bold text-[10px] uppercase tracking-widest text-center px-2 truncate w-full text-center">{asset.title}</p>
                                </>
                              )}
                            </div>
                            <span className={`absolute top-1.5 left-1.5 text-[9px] font-headline font-black uppercase px-1.5 py-0.5 ${isPending ? 'left-8' : ''} ${asset.type === 'VIDEO' ? 'bg-tertiary text-on-tertiary' : 'bg-black/60 text-white'}`}>
                              {asset.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-outline-variant/20 p-4 shrink-0 flex justify-between items-center">
              <span className="text-xs font-headline font-bold uppercase text-on-surface-variant">
                {pendingItems.length} pendientes
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowModal(false); }}
                  className="px-6 py-2.5 font-headline font-bold text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface border border-outline-variant/30 hover:bg-surface-container-highest transition-colors"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  disabled={pendingItems.length === 0}
                  className="px-6 py-2.5 bg-primary text-white font-headline font-black text-xs uppercase tracking-widest hover:bg-primary-container transition-all disabled:opacity-50"
                >
                  Revisar {pendingItems.length > 0 ? `(${pendingItems.length})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── CONFIRM ADD MODAL ─── */}
      {pendingItems.length > 0 && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={cancelAddAll}>
          <div className="bg-surface border border-outline-variant/30 shadow-2xl max-w-lg w-full flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-surface-container-highest p-5 flex justify-between items-center border-b border-outline-variant/30 shrink-0">
              <h3 className="font-headline font-black text-base uppercase tracking-widest text-on-surface">
                Revisar selección ({pendingItems.length})
              </h3>
              <button onClick={cancelAddAll} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              <p className="text-xs text-on-surface-variant mb-2">Se agregarán en este orden al final de la reunión:</p>
              {pendingItems.map((item, idx) => (
                <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 p-3 bg-surface-container-low border border-outline-variant/20">
                  <div className="w-7 h-7 bg-primary/10 text-primary font-headline font-black text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div className="w-8 h-8 bg-surface-container-highest flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">{item.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-headline font-bold text-sm uppercase text-on-surface truncate">{item.title}</p>
                    <p className="text-xs text-on-surface-variant">{item.subtitle}</p>
                  </div>
                  <button
                    onClick={() => togglePendingItem(item.type, item.id, { title: item.title, subtitle: item.subtitle, icon: item.icon, thumbnail: item.thumbnail })}
                    className="p-1.5 text-on-surface-variant hover:text-error transition-colors shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 bg-surface-container border-t border-outline-variant/30 flex justify-end gap-3 shrink-0">
              <button onClick={cancelAddAll} className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-colors border border-outline-variant/50">
                Cancelar
              </button>
              <button
                onClick={confirmAddAll}
                disabled={confirming}
                className="bg-primary text-white px-8 py-3 font-headline font-black text-xs uppercase tracking-widest hover:bg-primary-container transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {confirming ? (
                  <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span> Agregando...</>
                ) : (
                  <><span className="material-symbols-outlined text-[16px]">playlist_add</span> Agregar {pendingItems.length}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirm modal */}
      {removeId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-outline-variant/30 shadow-2xl p-8 max-w-sm w-full flex flex-col gap-6">
            <div>
              <h2 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface">Quitar Elemento</h2>
              <p className="text-on-surface-variant text-sm mt-2">¿Quitar este elemento de la reunión?</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRemoveId(null)} className="flex-1 bg-surface-container-highest text-on-surface font-headline font-bold text-xs uppercase py-3 hover:bg-surface-container transition-colors">
                Cancelar
              </button>
              <button onClick={handleRemove} className="flex-1 bg-error text-on-error font-headline font-bold text-xs uppercase py-3 hover:bg-error/90 transition-colors">
                Quitar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
