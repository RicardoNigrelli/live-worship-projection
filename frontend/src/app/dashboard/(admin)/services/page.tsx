"use client";
import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useRouter } from 'next/navigation';
import { useProyectaStore } from '../../../../store/useProyectaStore';
import { API_URL } from '@/lib/api';

type PendingItem = {
  type: 'SONG' | 'DECK' | 'MEDIA';
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  thumbnail?: string;
};

export default function ServicesPage() {
  const setPlaylist = useProyectaStore(s => s.setPlaylist);
  const router = useRouter();
  
  const [services, setServices] = useState<any[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [songs, setSongs] = useState<any[]>([]);
  const [decks, setDecks] = useState<any[]>([]);
  const [mediaAssets, setMediaAssets] = useState<any[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  type ModalTab = 'SONGS' | 'DECKS' | 'MEDIA';
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalTab, setAddModalTab] = useState<ModalTab>('SONGS');
  const [addSearch, setAddSearch] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');

  // Confirmation state for adding items
  const [pendingItem, setPendingItem] = useState<PendingItem | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Remove confirm state
  const [removeItemId, setRemoveItemId] = useState<string | null>(null);
  // Bulk-select state (Songs tab supports adding several at once)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [addingBulk, setAddingBulk] = useState(false);
  // Delete service state
  const [deleteServiceId, setDeleteServiceId] = useState<string | null>(null);
  const [deletingService, setDeletingService] = useState(false);

  const activeService = services.find(s => s.id === selectedServiceId) || null;

  const fetchServices = () => {
    setIsLoadingServices(true);
    fetch(`${API_URL}/api/services`)
      .then(res => res.json())
      .then(data => {
        setServices(data);
        const { activePlaylistId, syncPlaylist } = useProyectaStore.getState();
        if (activePlaylistId) {
          const activeSrv = data.find((s: any) => s.id === activePlaylistId);
          if (activeSrv) {
            const playlistQueue = activeSrv.items.map((item: any) => {
              if (item.type === 'SONG' && item.song) {
                return {
                  id: item.song.id,
                  title: item.song.title,
                  slides: item.song.parts?.length ? item.song.parts.map((p: any) => p.content) : ["Sin estrofas"]
                };
              }
              if (item.type === 'DECK' && item.deck) {
                return {
                  id: item.deck.id,
                  title: item.deck.title,
                  slides: item.deck.slides?.length ? item.deck.slides.map((s: any) => s.text || " ") : [" "]
                };
              }
              if (item.type === 'MEDIA' && item.mediaAsset) {
                return {
                  id: item.mediaAsset.id,
                  title: item.mediaAsset.title,
                  slides: [JSON.stringify({ type: 'MEDIA_SLIDE', url: item.mediaAsset.url, mediaType: item.mediaAsset.type })]
                };
              }
              return { id: item.id, title: "Multimedia", slides: ["\n[ CONTENIDO MULTIMEDIA ]\n\n(Pendiente integración externa)\n"] };
            });
            syncPlaylist(playlistQueue.length ? playlistQueue : [{ id: 'empty', title: 'Reunión Vacía', slides: ["Sin elementos"] }]);
          }
        }
      })
      .catch(console.error)
      .finally(() => setIsLoadingServices(false));
  };

  useEffect(() => {
    fetchServices();
    fetch(`${API_URL}/api/songs`).then(r => r.json()).then(setSongs);
    fetch(`${API_URL}/api/decks`).then(r => r.json()).then(setDecks);
    fetch(`${API_URL}/api/media`).then(r => r.json()).then(setMediaAssets);
  }, []);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !activeService) return;
    const newServices = [...services];
    const srvIndex = newServices.findIndex(s => s.id === activeService.id);
    const items = Array.from(newServices[srvIndex].items);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    const optimizedItems = items.map((item: any, index) => ({ ...item, order: index + 1 }));
    newServices[srvIndex].items = optimizedItems;
    setServices(newServices);
    const payload = optimizedItems.map((i: any) => ({ id: i.id, order: i.order }));
    try {
      await fetch(`${API_URL}/api/services/${activeService.id}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload })
      });
      fetchServices();
    } catch (e) { console.error(e); }
  };

  // Step 1: request add → show confirm modal
  const requestAdd = (type: 'SONG' | 'DECK' | 'MEDIA', id: string, data: any) => {
    setPendingItem({ type, id, title: data.title, subtitle: data.subtitle, icon: data.icon, thumbnail: data.thumbnail });
    setShowAddModal(false);
  };

  // Step 2: confirm → actually add to service
  const confirmAdd = async () => {
    if (!pendingItem || !activeService) return;
    setConfirming(true);
    const body: any = { type: pendingItem.type };
    if (pendingItem.type === 'SONG') body.songId = pendingItem.id;
    if (pendingItem.type === 'DECK') body.deckId = pendingItem.id;
    if (pendingItem.type === 'MEDIA') body.mediaAssetId = pendingItem.id;
    try {
      await fetch(`${API_URL}/api/services/${activeService.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      fetchServices();
    } catch (e) { console.error(e); }
    setConfirming(false);
    setPendingItem(null);
  };

  const cancelAdd = () => {
    setPendingItem(null);
  };

  const openAddModal = (tab: 'SONGS' | 'DECKS' | 'MEDIA') => {
    setAddModalTab(tab);
    setAddSearch('');
    setSelectedSongIds(new Set());
    setShowAddModal(true);
  };

  const toggleSongSelect = (songId: string) => {
    setSelectedSongIds(prev => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const confirmBulkAddSongs = async () => {
    if (!activeService || selectedSongIds.size === 0) return;
    setAddingBulk(true);
    try {
      await fetch(`${API_URL}/api/services/${activeService.id}/items/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: Array.from(selectedSongIds).map(songId => ({ type: 'SONG', songId })) })
      });
      fetchServices();
      setShowAddModal(false);
      setSelectedSongIds(new Set());
    } catch (e) { console.error(e); }
    setAddingBulk(false);
  };

  const executeDeleteService = async () => {
    if (!deleteServiceId) return;
    setDeletingService(true);
    try {
      await fetch(`${API_URL}/api/services/${deleteServiceId}`, { method: 'DELETE' });
      if (selectedServiceId === deleteServiceId) setSelectedServiceId(null);
      setDeleteServiceId(null);
      fetchServices();
    } catch (e) { console.error(e); }
    setDeletingService(false);
  };

  const handleRemoveItem = async () => {
    if (!removeItemId) return;
    try {
      await fetch(`${API_URL}/api/services/items/${removeItemId}`, { method: 'DELETE' });
      fetchServices();
    } catch (e) {
      console.error(e);
    }
    setRemoveItemId(null);
  };

  const handleCreateService = () => {
    setNewServiceName('');
    setIsCreateModalOpen(true);
  };

  const executeCreateService = async () => {
    if (!newServiceName.trim()) return;
    try {
      await fetch(`${API_URL}/api/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newServiceName, date: new Date().toISOString() })
      });
      fetchServices();
      setIsCreateModalOpen(false);
    } catch (e) { console.error(e); }
  };

  return (
    <main className="flex-1 overflow-y-auto p-8 md:p-12 flex gap-8 bg-surface">
      {/* Left Column: Meeting List */}
      <div className="w-1/3 flex flex-col gap-6">
        <div className="flex justify-between items-end mb-4">
          <h2 className="font-headline font-extrabold text-3xl tracking-tight text-on-surface uppercase">REUNIONES</h2>
          <button onClick={handleCreateService} className="text-primary hover:text-primary-container font-headline font-bold text-sm tracking-widest uppercase flex items-center gap-1 transition-colors">
            <span className="material-symbols-outlined text-[16px]">add</span> NUEVA
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {isLoadingServices ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="bg-surface-container-low border border-outline-variant/20 p-6 animate-pulse">
                  <div className="flex justify-between items-start mb-2">
                    <div className="h-4 bg-surface-container rounded w-32" />
                    <div className="h-3 bg-surface-container rounded w-12" />
                  </div>
                  <div className="h-5 bg-surface-container rounded w-2/3 mb-2" />
                  <div className="h-3 bg-surface-container rounded w-1/3 mb-4" />
                  <div className="flex items-center gap-3">
                    <div className="h-3 bg-surface-container rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          services.map(service => {
            const isActive = selectedServiceId === service.id;
            return (
              <div key={service.id} onClick={() => setSelectedServiceId(service.id)}
                className={`border-none rounded-none p-6 cursor-pointer relative overflow-hidden group transition-colors ${isActive ? 'bg-surface-container' : 'bg-surface-container-low hover:bg-surface-container-high'}`}
              >
                {isActive && <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>}

                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteServiceId(service.id); }}
                  className="absolute top-3 right-3 p-1.5 text-on-surface-variant/50 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all"
                  title="Eliminar reunión"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>

                <div className="flex justify-between items-start mb-2 pr-8">
                  <span className={`${isActive ? 'bg-secondary/20 text-secondary' : 'bg-tertiary/10 text-tertiary'} px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-none font-label`}>
                    REUNIÓN DEL DÍA
                  </span>
                  <span className="text-on-surface-variant text-sm font-medium">10:00 AM</span>
                </div>
                
                <h3 className="font-headline font-bold text-xl mb-1 truncate">{service.name}</h3>
                <p className="text-on-surface-variant text-sm mb-4">{new Date(service.date).toLocaleDateString()}</p>
                
                <div className="flex items-center justify-between text-xs font-medium text-outline">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">music_note</span> {service.items?.length || 0} RECURSOS</span>
                  </div>
                  {isActive && (
                    <button onClick={(e) => {
                        e.stopPropagation();
                        const playlistQueue = service.items.map((item: any) => {
                          if (item.type === 'SONG' && item.song) {
                            return { id: item.song.id, title: item.song.title, slides: item.song.parts?.length ? item.song.parts.map((p: any) => p.content) : ["Sin estrofas"] };
                          }
                          if (item.type === 'DECK' && item.deck) {
                            return { id: item.deck.id, title: item.deck.title, slides: item.deck.slides?.length ? item.deck.slides.map((s: any) => s.text || " ") : [" "] };
                          }
                          if (item.type === 'MEDIA' && item.mediaAsset) {
                            return { id: item.mediaAsset.id, title: item.mediaAsset.title, slides: [JSON.stringify({ type: 'MEDIA_SLIDE', url: item.mediaAsset.url, mediaType: item.mediaAsset.type })] };
                          }
                          return null;
                        }).filter(Boolean);
                        setPlaylist(service.id, service.name, playlistQueue.length ? playlistQueue : [{ id: 'empty', title: 'Reunión Vacía', slides: ["Sin elementos"] }]);
                        router.push('/dashboard/control');
                      }}
                      className="bg-primary hover:bg-primary-container text-white px-3 py-1 font-headline font-bold"
                    >
                      INICIAR PROYECCIÓN
                    </button>
                  )}
                </div>
              </div>
            );
          }))}
        </div>
      </div>

      {/* Right Column: Detail View */}
      <div className="w-2/3 bg-surface-container-lowest flex flex-col h-full absolute md:relative inset-y-0 right-0 transform transition-transform border-l border-outline-variant/30">
        {!activeService ? (
           <div className="flex items-center justify-center h-full text-outline font-headline font-bold uppercase tracking-widest text-sm">
             Selecciona una reunión para organizar su contenido
           </div>
        ) : (
          <>
            <div className="bg-surface-container p-8 relative overflow-hidden flex-shrink-0">
              <div className="absolute inset-0 opacity-20 mix-blend-multiply bg-[url('https://images.unsplash.com/photo-1518002171953-a080ee817e1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80')] bg-cover bg-center grayscale pointer-events-none"></div>
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-primary text-on-primary px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-none font-label">PLANIFICADOR</span>
                    <span className="text-on-surface font-medium text-sm">{new Date(activeService.date).toLocaleDateString()}</span>
                  </div>
                  <h2 className="font-headline font-black text-4xl tracking-tight text-on-surface uppercase mb-2">
                    {activeService.name}
                  </h2>
                  <p className="text-on-surface-variant font-medium flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">location_on</span> Auditorio Principal
                  </p>
                </div>
              </div>
            </div>

            <div className="p-8 flex-1 overflow-y-auto">
              <div className="flex flex-wrap justify-between items-center gap-3 mb-8">
                <h3 className="font-headline font-bold text-2xl tracking-tight text-on-surface uppercase">CONECTAR CONTENIDO</h3>
                <div className="flex gap-2">
                  <button onClick={() => openAddModal('SONGS')} className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white font-headline font-bold text-xs uppercase tracking-widest px-4 py-2.5 transition-colors">
                    <span className="material-symbols-outlined text-[15px]">music_note</span> + Canción
                  </button>
                  <button onClick={() => openAddModal('DECKS')} className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white font-headline font-bold text-xs uppercase tracking-widest px-4 py-2.5 transition-colors">
                    <span className="material-symbols-outlined text-[15px]">auto_awesome_mosaic</span> + Diapositiva
                  </button>
                  <button onClick={() => openAddModal('MEDIA')} className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white font-headline font-bold text-xs uppercase tracking-widest px-4 py-2.5 transition-colors">
                    <span className="material-symbols-outlined text-[15px]">image</span> + Multimedia
                  </button>
                  <a
                    href={`${API_URL}/api/export/pptx/service/${activeService.id}`}
                    className="flex items-center gap-1.5 bg-secondary hover:bg-secondary-container text-on-secondary font-headline font-bold text-xs uppercase tracking-widest px-4 py-2.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px]">download</span>
                    PPTX
                  </a>
                </div>
              </div>

              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="service-items">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-1 relative min-h-[50px]">
                      <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-outline-variant/30 hidden lg:block"></div>
                      
                      {(!activeService.items || activeService.items.length === 0) && (
                        <p className="text-outline text-sm italic ml-14">La agenda está vacía.</p>
                      )}

                      {activeService.items?.map((item: any, index: number) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-stretch group">
                              <div {...provided.dragHandleProps} className="w-12 flex flex-col items-center justify-center relative z-10 py-4 cursor-grab">
                                <div className="w-3 h-3 bg-primary rounded-none outline outline-4 outline-surface"></div>
                              </div>
                              <div className="flex-1 bg-surface-container-low p-4 rounded-none group-hover:bg-surface-container transition-colors ml-2 flex items-center justify-between border-l-4 border-primary shadow-sm hover:shadow-md">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-primary/10 flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined">
                                      {item.type === 'SONG' ? 'music_note' : item.type === 'DECK' ? 'auto_awesome_mosaic' : item.mediaAsset?.type === 'VIDEO' ? 'movie' : 'image'}
                                    </span>
                                  </div>
                                  <div>
                                    <h4 className="font-headline font-bold text-sm uppercase">
                                      {item.type === 'SONG' ? item.song?.title : item.type === 'DECK' ? item.deck?.title : item.mediaAsset?.title || 'Multimedia'}
                                    </h4>
                                    <p className="text-xs text-on-surface-variant mt-1">
                                      {item.type === 'SONG' ? item.song?.author : item.type === 'DECK' ? `${item.deck?.slides?.length || 0} diapositivas` : item.mediaAsset?.type || 'Media'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="bg-surface-container-highest px-2 py-1 text-[10px] font-bold uppercase text-on-surface-variant">Estándar</span>
                                  <button onClick={() => setRemoveItemId(item.id)} className="text-outline hover:text-error opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="material-symbols-outlined">delete</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          </>
        )}
      </div>

      {/* ─── ADD CONTENT MODAL ─── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-surface w-full max-w-2xl border border-outline-variant/20 shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-surface-container-highest border-b border-outline-variant/30 p-5 flex items-center justify-between shrink-0">
              <h2 className="font-headline font-black text-base uppercase tracking-widest text-on-surface">Agregar a la Reunión</h2>
              <button onClick={() => setShowAddModal(false)} className="text-on-surface-variant hover:text-error transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-outline-variant/20 shrink-0">
              {([{key:'SONGS',icon:'music_note',label:'Canciones',count:songs.length},{key:'DECKS',icon:'auto_awesome_mosaic',label:'Diapositivas',count:decks.length},{key:'MEDIA',icon:'image',label:'Multimedia',count:mediaAssets.length}] as any[]).map(tab => (
                <button key={tab.key} onClick={() => { setAddModalTab(tab.key); setAddSearch(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 font-headline font-bold text-xs uppercase tracking-widest transition-colors border-b-2 ${
                    addModalTab === tab.key ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                  }`}>
                  <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>{tab.label}
                  <span className={`text-[10px] px-1.5 py-0.5 font-black ${addModalTab === tab.key ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>{tab.count}</span>
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="p-4 border-b border-outline-variant/20 shrink-0">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px]">search</span>
                <input type="text" value={addSearch} onChange={e => setAddSearch(e.target.value)} autoFocus
                  placeholder={`Buscar ${addModalTab === 'SONGS' ? 'canciones' : addModalTab === 'DECKS' ? 'presentaciones' : 'archivos'}...`}
                  className="w-full bg-surface-container-low border border-outline-variant/30 focus:border-primary py-2.5 pl-10 pr-4 font-body text-sm text-on-surface outline-none transition-colors" />
              </div>
            </div>
            {/* Lists */}
            <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/10">
              {addModalTab === 'SONGS' && songs.filter(s => s.title.toLowerCase().includes(addSearch.toLowerCase()) || (s.author||'').toLowerCase().includes(addSearch.toLowerCase())).map(song => {
                const added = activeService?.items?.some((i: any) => i.type === 'SONG' && i.songId === song.id);
                const checked = selectedSongIds.has(song.id);
                return (
                  <div key={song.id} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-surface-container-low transition-colors ${added ? 'opacity-50' : ''}`}>
                    {!added && (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSongSelect(song.id)}
                        className="w-4 h-4 accent-primary cursor-pointer shrink-0"
                      />
                    )}
                    <div className="w-9 h-9 bg-primary/10 flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-primary text-[18px]">music_note</span></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-headline font-bold text-sm uppercase truncate text-on-surface">{song.title}</p>
                      <p className="text-on-surface-variant text-xs">{song.author || 'Anónimo'} · {song.parts?.length || 0} diap.</p>
                    </div>
                    {added ? <span className="text-[10px] font-headline text-on-surface-variant uppercase px-3 py-1.5 border border-outline-variant/30">Agregada</span>
                      : <button onClick={() => requestAdd('SONG', song.id, { title: song.title, subtitle: `${song.author || 'Anónimo'} · ${song.parts?.length || 0} diap.`, icon: 'music_note' })}
                          className="flex items-center gap-1 bg-primary hover:bg-primary-container text-on-primary font-headline font-bold text-xs uppercase px-4 py-2 transition-colors shrink-0">
                          <span className="material-symbols-outlined text-[14px]">add</span> Agregar
                        </button>}
                  </div>
                );
              })}
              {addModalTab === 'DECKS' && decks.filter(d => d.title.toLowerCase().includes(addSearch.toLowerCase())).map(deck => {
                const added = activeService?.items?.some((i: any) => i.type === 'DECK' && i.deckId === deck.id);
                return (
                  <div key={deck.id} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-surface-container-low transition-colors ${added ? 'opacity-50' : ''}`}>
                    <div className="w-16 h-10 shrink-0 overflow-hidden flex items-center justify-center" style={{ background: deck.slides?.[0]?.bgColor || '#1a1a2e' }}>
                      {deck.slides?.[0]?.text && <p className="text-white font-bold px-1" style={{ fontSize: '6px' }}>{deck.slides[0].text.slice(0,30)}</p>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-headline font-bold text-sm uppercase truncate text-on-surface">{deck.title}</p>
                      <p className="text-on-surface-variant text-xs">{deck.slides?.length || 0} diapositivas</p>
                    </div>
                    {added ? <span className="text-[10px] font-headline text-on-surface-variant uppercase px-3 py-1.5 border border-outline-variant/30">Agregada</span>
                      : <button onClick={() => requestAdd('DECK', deck.id, { title: deck.title, subtitle: `${deck.slides?.length || 0} diapositivas`, icon: 'auto_awesome_mosaic' })}
                          className="flex items-center gap-1 bg-primary hover:bg-primary-container text-on-primary font-headline font-bold text-xs uppercase px-4 py-2 transition-colors shrink-0">
                          <span className="material-symbols-outlined text-[14px]">add</span> Agregar
                        </button>}
                  </div>
                );
              })}
              {addModalTab === 'MEDIA' && (
                mediaAssets.filter(a => a.title.toLowerCase().includes(addSearch.toLowerCase())).length === 0
                  ? <p className="p-10 text-center text-on-surface-variant text-sm font-headline uppercase tracking-widest">Sin archivos multimedia</p>
                  : <div className="grid grid-cols-3 gap-3 p-4">
                      {mediaAssets.filter(a => a.title.toLowerCase().includes(addSearch.toLowerCase())).map(asset => {
                        const added = activeService?.items?.some((i: any) => i.type === 'MEDIA' && i.mediaAssetId === asset.id);
                        return (
                          <div key={asset.id} onClick={() => !added && requestAdd('MEDIA', asset.id, { title: asset.title, subtitle: asset.type, icon: asset.type === 'VIDEO' ? 'movie' : 'image', thumbnail: asset.type === 'IMAGE' ? asset.url : undefined })}
                            className={`group relative overflow-hidden border-2 aspect-video bg-surface-container-low transition-all ${added ? 'border-transparent opacity-50' : 'border-transparent hover:border-primary cursor-pointer'}`}>
                            {asset.type === 'IMAGE' ? <img src={asset.url} alt={asset.title} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-3xl text-on-surface-variant">movie</span></div>}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              {added ? <span className="text-[10px] font-headline text-white uppercase px-2 py-1 border border-white/40">Agregado</span>
                                : <span className="material-symbols-outlined text-white text-2xl">add_circle</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
              )}
            </div>
            <div className="border-t border-outline-variant/20 p-4 shrink-0 flex justify-between items-center">
              {addModalTab === 'SONGS' && selectedSongIds.size > 0 ? (
                <span className="text-xs font-headline font-bold uppercase text-primary">{selectedSongIds.size} canción(es) seleccionadas</span>
              ) : <span />}
              <div className="flex gap-3">
                <button onClick={() => setShowAddModal(false)} className="px-6 py-2.5 font-headline font-bold text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface border border-outline-variant/30 hover:bg-surface-container-highest transition-colors">Cerrar</button>
                {addModalTab === 'SONGS' && selectedSongIds.size > 0 && (
                  <button
                    onClick={confirmBulkAddSongs}
                    disabled={addingBulk}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-container text-on-primary font-headline font-black text-xs uppercase tracking-widest px-6 py-2.5 transition-colors disabled:opacity-50"
                  >
                    {addingBulk ? (
                      <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">playlist_add</span>
                    )}
                    Agregar {selectedSongIds.size} seleccionadas
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── CONFIRM ADD MODAL ─── */}
      {pendingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface border border-outline-variant/30 shadow-2xl p-8 max-w-sm w-full flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[28px]">{pendingItem.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-headline font-bold text-base uppercase tracking-tight text-on-surface truncate">{pendingItem.title}</p>
                <p className="text-on-surface-variant text-sm mt-1">{pendingItem.subtitle}</p>
                {pendingItem.thumbnail && (
                  <img src={pendingItem.thumbnail} alt="" className="mt-3 w-full aspect-video object-cover rounded" />
                )}
              </div>
            </div>
            <div>
              <p className="text-on-surface-variant text-sm">
                ¿Agregar <strong className="text-on-surface">{pendingItem.title}</strong> a esta reunión?
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={cancelAdd} disabled={confirming}
                className="flex-1 bg-surface-container-highest text-on-surface font-headline font-bold text-xs uppercase py-3 hover:bg-surface-container transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={confirmAdd} disabled={confirming}
                className="flex-1 bg-primary text-on-primary font-headline font-bold text-xs uppercase py-3 hover:bg-primary-container transition-colors disabled:opacity-50">
                {confirming ? (
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                ) : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirm modal */}
      {removeItemId && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface w-full max-w-lg border border-outline-variant/30 shadow-2xl">
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30">
               <h3 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface">Quitar Elemento</h3>
               <button onClick={() => setRemoveItemId(null)} className="text-on-surface-variant hover:text-error transition-colors">
                 <span className="material-symbols-outlined">close</span>
               </button>
            </div>
            <div className="p-8">
              <p className="text-on-surface-variant text-sm">¿Quitar este elemento de la reunión?</p>
            </div>
            <div className="p-4 bg-surface-container flex justify-end gap-3 border-t border-outline-variant/30">
               <button onClick={() => setRemoveItemId(null)} className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-colors border border-outline-variant/50">Cancelar</button>
               <button onClick={handleRemoveItem} className="bg-error text-on-error px-8 py-3 font-headline font-black text-xs uppercase tracking-widest hover:bg-error/90 hover:shadow-[0_4px_0_0_theme(colors.error-container)] transition-all">
                 Quitar
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete service confirm modal */}
      {deleteServiceId && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface w-full max-w-lg border border-outline-variant/30 shadow-2xl">
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30">
               <h3 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface flex items-center gap-2">
                 <span className="material-symbols-outlined text-error">warning</span>
                 Eliminar Reunión
               </h3>
               <button onClick={() => setDeleteServiceId(null)} className="text-on-surface-variant hover:text-error transition-colors">
                 <span className="material-symbols-outlined">close</span>
               </button>
            </div>
            <div className="p-8">
              <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                ¿Estás seguro que deseas eliminar esta reunión? Se quitará junto con todo su contenido asociado (canciones, diapositivas y multimedia agregados a ella no se eliminan del catálogo). Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="p-4 bg-surface-container flex justify-end gap-3 border-t border-outline-variant/30">
               <button onClick={() => setDeleteServiceId(null)} className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-colors border border-outline-variant/50">Cancelar</button>
               <button onClick={executeDeleteService} disabled={deletingService} className="bg-error text-on-error px-8 py-3 font-headline font-black text-xs uppercase tracking-widest hover:bg-error/90 transition-all disabled:opacity-50 flex items-center gap-2">
                 {deletingService && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                 Eliminar
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Modal for "NUEVA REUNIÓN" */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface w-full max-w-lg border border-outline-variant/30 shadow-2xl">
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30">
               <h3 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface">Nueva Reunión</h3>
               <button onClick={() => setIsCreateModalOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                 <span className="material-symbols-outlined">close</span>
               </button>
            </div>
            <div className="p-8">
              <label className="block text-xs font-bold font-headline uppercase text-on-surface-variant mb-2">NOMBRE DEL CULTO</label>
              <input 
                 autoFocus
                 value={newServiceName}
                 onChange={e => setNewServiceName(e.target.value)}
                 onKeyDown={e => {
                   if(e.key === 'Enter' && newServiceName.trim()) {
                     e.preventDefault();
                     executeCreateService();
                   }
                 }}
                 className="w-full bg-surface-container-low border-b-2 border-outline-variant focus:border-primary px-4 py-4 outline-none font-body text-lg font-bold text-on-surface transition-colors placeholder:text-outline-variant/50"
                 placeholder="ej. Reunión de Jóvenes"
              />
            </div>
            <div className="p-4 bg-surface-container flex justify-end gap-3 border-t border-outline-variant/30">
               <button onClick={() => setIsCreateModalOpen(false)} className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-colors border border-outline-variant/50">Cancelar</button>
               <button onClick={executeCreateService} className="bg-primary text-white px-8 py-3 font-headline font-black text-xs uppercase tracking-widest hover:bg-primary-container hover:shadow-[0_4px_0_0_theme(colors.primary-container)] transition-all disabled:opacity-50 disabled:shadow-none" disabled={!newServiceName.trim()}>
                 Crear Reunión
               </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
