"use client";
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { toast } from '@/components/Toast';

const FONT_OPTIONS = [
  { label: 'Inter', value: 'Inter' },
  { label: 'Epilogue', value: 'Epilogue' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Open Sans', value: 'Open Sans' },
  { label: 'Poppins', value: 'Poppins' },
  { label: 'Lato', value: 'Lato' },
  { label: 'Raleway', value: 'Raleway' },
  { label: 'Oswald', value: 'Oswald' },
  { label: 'Playfair Display', value: 'Playfair Display' },
];

export default function NewSongPage() {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');

  const [themeBgType, setThemeBgType] = useState('COLOR');
  const [themeBgValue, setThemeBgValue] = useState('');
  const [themeFontFamily, setThemeFontFamily] = useState('');
  const [themeFontColor, setThemeFontColor] = useState('#ffffff');
  const [themeFontSize, setThemeFontSize] = useState(1.0);

  const [parts, setParts] = useState([{ type: 'ESTROFA', content: '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<any[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [previewText, setPreviewText] = useState('Ejemplo de texto de la cancion');

  const router = useRouter();

  useEffect(() => {
    fetch(`${API_URL}/api/media`)
      .then(r => r.json())
      .then(setMediaAssets)
      .catch(console.error);
  }, []);

  const previewBgStyle = useCallback(() => {
    if (themeBgType === 'IMAGE' && themeBgValue) return `url(${themeBgValue}) center/cover`;
    if (themeBgType === 'COLOR') return themeBgValue || '#1a1a2e';
    return '#1a1a2e';
  }, [themeBgType, themeBgValue]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        title, author, themeBgType, themeBgValue, themeFontFamily, themeFontColor, themeFontSize,
        parts: parts.map((p, i) => ({ ...p, order: i }))
      };

      await fetch(`${API_URL}/api/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      router.push('/songs');
    } catch (err) {
      toast('Error al guardar la canción', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const addPart = (type: string) => {
    setParts([...parts, { type, content: '' }]);
  };

  const selectMedia = (asset: any) => {
    setThemeBgValue(asset.url);
    setShowMediaPicker(false);
  };

  return (
    <div className="min-h-screen bg-urban-bg flex flex-col md:flex-row p-8 font-body gap-8">

      {/* Editor Modular */}
      <div className="flex-1 bg-urban-surface border border-gray-200 p-8 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h1 className="font-display font-bold text-2xl uppercase tracking-widest text-urban-black-900">Agregar Cancion</h1>
          <Link href="/songs" className="text-sm font-bold text-gray-500 hover:text-urban-black-900 uppercase">Volver</Link>
        </div>

        <form className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-sm mb-1 uppercase tracking-wide">Titulo</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="w-full border-2 border-gray-300 p-3 focus:outline-none focus:border-urban-teal-500" />
            </div>
            <div>
              <label className="block font-bold text-sm mb-1 uppercase tracking-wide">Autor</label>
              <input value={author} onChange={e => setAuthor(e.target.value)} className="w-full border-2 border-gray-300 p-3 focus:outline-none focus:border-urban-teal-500" />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6 mt-2">
            <h2 className="font-bold uppercase tracking-widest mb-4">Estructura Modular (PowerPoint Style)</h2>
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => addPart('ESTROFA')} className="border-2 border-urban-black-900 px-4 py-2 hover:bg-urban-black-900 hover:text-white urban-transition text-sm font-bold">+ ESTROFA</button>
              <button type="button" onClick={() => addPart('CORO')} className="border-2 border-urban-black-900 px-4 py-2 hover:bg-urban-black-900 hover:text-white urban-transition text-sm font-bold">+ CORO</button>
              <button type="button" onClick={() => addPart('PUENTE')} className="border-2 border-urban-black-900 px-4 py-2 hover:bg-urban-black-900 hover:text-white urban-transition text-sm font-bold">+ PUENTE</button>
            </div>

            <div className="flex flex-col gap-4">
              {parts.map((p, idx) => (
                <div key={idx} className="border-l-4 border-urban-teal-500 pl-4 py-2 bg-gray-50 flex flex-col gap-2 relative">
                  <span className="font-bold text-xs uppercase bg-urban-teal-500 text-white self-start px-2 py-1">{p.type} {idx + 1}</span>
                  <textarea
                    rows={4}
                    value={p.content}
                    onChange={e => {
                      const newParts = [...parts];
                      newParts[idx].content = e.target.value;
                      setParts(newParts);
                    }}
                    className="w-full border p-2 font-mono text-sm"
                    placeholder="Escribe la letra aqui..."
                  />
                  <button type="button" onClick={() => setParts(parts.filter((_, i) => i !== idx))} className="absolute top-2 right-2 text-red-500 font-bold hover:text-red-700">X</button>
                </div>
              ))}
            </div>
          </div>
        </form>
      </div>

      {/* Panel de Estilo + Preview */}
      <aside className="w-full md:w-1/3 bg-urban-surface border border-gray-200 flex flex-col shadow-sm">

        {/* Canvas Preview */}
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-display text-sm uppercase font-bold tracking-widest mb-3">Vista Previa</h2>
          <div className="relative overflow-hidden shadow-lg" style={{ aspectRatio: '16/9', background: previewBgStyle() }}>
            {themeBgType === 'VIDEO' && themeBgValue && (
              <video src={themeBgValue} autoPlay loop muted className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <p
                className="text-center uppercase tracking-tight leading-tight whitespace-pre-wrap drop-shadow-lg"
                style={{
                  fontFamily: themeFontFamily ? `"${themeFontFamily}", sans-serif` : undefined,
                  color: themeFontColor,
                  fontSize: `${themeFontSize * 2.5}vw`,
                }}
              >
                {previewText}
              </p>
            </div>
          </div>
          <input
            value={previewText}
            onChange={e => setPreviewText(e.target.value)}
            className="w-full mt-2 border p-1 text-xs font-mono"
            placeholder="Texto de prueba..."
          />
        </div>

        {/* Style Controls */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          <h2 className="font-display text-lg uppercase border-b-2 border-urban-black-900 pb-2">Estilo</h2>

          {/* Typography */}
          <div>
            <label className="block font-bold text-xs uppercase tracking-wide mb-2">Tipografia</label>
            <div className="flex flex-col gap-2">
              <select value={themeFontFamily} onChange={e => setThemeFontFamily(e.target.value)} className="w-full border-2 p-2 text-sm focus:outline-none focus:border-urban-teal-500">
                <option value="">Default (Epilogue)</option>
                {FONT_OPTIONS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase font-bold shrink-0">Color</label>
                <input type="color" value={themeFontColor} onChange={e => setThemeFontColor(e.target.value)} className="w-8 h-8 cursor-pointer border-0 p-0" />
                <input value={themeFontColor} onChange={e => setThemeFontColor(e.target.value)} className="flex-1 border-2 p-1 text-xs font-mono" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase font-bold shrink-0">Tamano</label>
                <input type="range" min="0.5" max="2.0" step="0.1" value={themeFontSize} onChange={e => setThemeFontSize(parseFloat(e.target.value))} className="flex-1" />
                <span className="text-xs font-mono w-10 text-right">{themeFontSize.toFixed(1)}x</span>
              </div>
            </div>
          </div>

          {/* Background */}
          <div>
            <label className="block font-bold text-xs uppercase tracking-wide mb-2">Fondo</label>
            <div className="flex flex-col gap-2">
              <select value={themeBgType} onChange={e => { setThemeBgType(e.target.value); if (e.target.value === 'COLOR') setThemeBgValue('#1a1a2e'); }} className="w-full border-2 p-2 text-sm focus:outline-none focus:border-urban-teal-500">
                <option value="COLOR">Color Solido</option>
                <option value="IMAGE">Imagen</option>
                <option value="VIDEO">Video Loop</option>
              </select>

              {themeBgType === 'COLOR' && (
                <div className="flex items-center gap-2">
                  <input type="color" value={themeBgValue || '#1a1a2e'} onChange={e => setThemeBgValue(e.target.value)} className="w-8 h-8 cursor-pointer border-0 p-0" />
                  <input value={themeBgValue || '#1a1a2e'} onChange={e => setThemeBgValue(e.target.value)} className="flex-1 border-2 p-1 text-xs font-mono" />
                </div>
              )}

              {themeBgType !== 'COLOR' && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowMediaPicker(true)} className="flex-1 border-2 border-urban-teal-500 text-urban-teal-500 px-3 py-2 text-xs font-bold uppercase hover:bg-urban-teal-500 hover:text-white urban-transition">
                    Elegir de Biblioteca
                  </button>
                </div>
              )}

              {themeBgValue && themeBgType !== 'COLOR' && (
                <p className="text-xs font-mono text-gray-500 truncate">{themeBgValue}</p>
              )}
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="p-6 border-t border-gray-200">
          <button type="button" onClick={handleSave} disabled={isSaving || !title.trim()} className={`w-full bg-urban-black-900 text-urban-surface font-bold py-4 uppercase tracking-widest hover:bg-urban-teal-500 urban-transition disabled:opacity-50 disabled:cursor-not-allowed`}>
            {isSaving && <span className="material-symbols-outlined animate-spin text-[16px] mr-1">progress_activity</span>}
            GUARDAR CANCION
          </button>
        </div>

        {/* Media Picker Modal */}
        {showMediaPicker && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8" onClick={() => setShowMediaPicker(false)}>
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b">
                <h3 className="font-display font-bold text-lg uppercase">Biblioteca de Media</h3>
                <button onClick={() => setShowMediaPicker(false)} className="text-gray-500 hover:text-gray-800">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3">
                {mediaAssets
                  .filter(a => themeBgType === 'VIDEO' ? a.type === 'VIDEO' : a.type === 'IMAGE')
                  .map(asset => (
                    <button key={asset.id} onClick={() => selectMedia(asset)} className="relative group aspect-video bg-gray-100 rounded overflow-hidden border-2 border-transparent hover:border-urban-teal-500 transition-colors">
                      {asset.type === 'IMAGE' ? (
                        <img src={asset.url} alt={asset.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
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
      </aside>
    </div>
  );
}
