"use client";
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';
import { toast } from '@/components/Toast';

type MediaAsset = {
  id: string;
  title: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
  fileSize: number | null;
  mimeType: string | null;
};

export default function MediaPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = async () => {
    try {
      const res = await fetch(`${API_URL}/api/media`);
      const data = await res.json();
      setAssets(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAssets(); }, []);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      setUploadProgress(`Subiendo ${file.name}...`);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
      try {
        const res = await fetch(`${API_URL}/api/media/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          // Pieza de portafolio pública: sin credenciales reales de
          // Cloudinary configuradas, la subida siempre va a fallar acá —
          // sin este chequeo, el spinner terminaba y no pasaba nada, sin
          // ningún indicio de por qué.
          toast('Subida de archivos no disponible en esta demo pública (sin credenciales reales configuradas)', 'error');
        }
      } catch (e) {
        console.error(e);
        toast('Error al subir el archivo', 'error');
      }
    }
    setUploading(false);
    setUploadProgress('');
    fetchAssets();
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    await fetch(`${API_URL}/api/media/${deleteId}`, { method: 'DELETE' });
    setAssets(assets.filter(a => a.id !== deleteId));
    setDeleteId(null);
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <main className="flex-1 p-6 md:p-12 lg:p-20 max-w-7xl mx-auto w-full">
      {/* Header */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-12 mb-16 relative">
        <div className="flex flex-col gap-4 max-w-2xl z-10">
          <div className="inline-flex items-center gap-2 bg-tertiary/10 text-tertiary font-body font-bold text-xs uppercase tracking-widest px-3 py-1 w-max mb-2">
            <span className="w-1.5 h-1.5 bg-tertiary"></span>
            Recursos Visuales
          </div>
          <h1 className="font-headline text-5xl md:text-7xl font-black uppercase tracking-[-0.02em] leading-[0.9] text-on-surface">
            Gestión de<br/>
            <span className="text-tertiary">Multimedia</span>
          </h1>
          <p className="font-body text-lg text-on-surface-variant leading-relaxed mt-4 max-w-lg">
            Imágenes y videos subidos a Cloudinary, disponibles para fondos y diapositivas de proyección.
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-primary hover:bg-primary-container text-white font-headline font-black uppercase tracking-[0.1em] px-8 py-4 transition-all duration-200 flex items-center justify-center gap-3 shrink-0 disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>upload</span>
          {uploading ? uploadProgress : 'SUBIR ARCHIVOS'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={e => handleUpload(e.target.files)}
        />
      </section>

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
        className={`border-2 border-dashed mb-10 p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer text-center ${
          dragOver
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-outline-variant/40 text-on-surface-variant hover:border-primary/50'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <span className="material-symbols-outlined text-4xl">cloud_upload</span>
        <p className="font-headline font-bold text-sm uppercase tracking-widest">
          Arrastrá archivos aquí o hacé clic para seleccionar
        </p>
        <p className="font-body text-xs text-outline">
          JPG, PNG, WEBP, GIF · MP4, WEBM, MOV
        </p>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="p-20 text-center text-on-surface-variant font-headline uppercase tracking-widest text-sm animate-pulse">
          Cargando biblioteca...
        </div>
      ) : assets.length === 0 ? (
        <div className="p-20 text-center text-on-surface-variant font-headline uppercase tracking-widest text-sm">
          No hay archivos. Subí tu primera imagen o video.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {assets.map(asset => (
            <div key={asset.id} className="group relative aspect-square bg-surface-container-low overflow-hidden">
              {asset.type === 'IMAGE' ? (
                <img
                  src={asset.url}
                  alt={asset.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container gap-2">
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant">movie</span>
                  <span className="text-xs font-headline text-on-surface-variant text-center px-2 truncate w-full text-center">
                    {asset.title}
                  </span>
                </div>
              )}

              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 p-2">
                <p className="text-white font-headline font-bold text-xs text-center truncate w-full">{asset.title}</p>
                {asset.fileSize && (
                  <p className="text-white/60 font-body text-[10px]">{formatSize(asset.fileSize)}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreview(asset)}
                    className="p-2 bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Vista previa"
                  >
                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                  </button>
                  <button
                    onClick={() => setDeleteId(asset.id)}
                    className="p-2 bg-error/20 hover:bg-error/40 text-white transition-colors"
                    title="Eliminar"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>

              {/* Type badge */}
              <div className="absolute top-2 left-2">
                <span className={`text-[9px] font-headline font-black uppercase px-1.5 py-0.5 ${
                  asset.type === 'VIDEO' ? 'bg-tertiary text-on-tertiary' : 'bg-secondary-fixed-dim text-secondary'
                }`}>
                  {asset.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreview(null)}
              className="absolute -top-10 right-0 text-white/60 hover:text-white font-headline font-bold text-xs uppercase tracking-widest flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">close</span> Cerrar
            </button>
            {preview.type === 'IMAGE' ? (
              <img src={preview.url} alt={preview.title} className="w-full max-h-[80vh] object-contain" />
            ) : (
              <video src={preview.url} controls autoPlay className="w-full max-h-[80vh]" />
            )}
            <p className="text-white/60 font-headline text-xs uppercase tracking-widest mt-4 text-center">{preview.title}</p>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-surface w-full max-w-md border border-outline-variant/30 shadow-2xl">
            <div className="bg-surface-container-highest p-4 flex justify-between items-center border-b border-outline-variant/30">
              <h3 className="font-headline font-black text-lg uppercase tracking-widest text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-error">warning</span>
                Eliminar Archivo
              </h3>
              <button onClick={() => setDeleteId(null)} className="text-on-surface-variant hover:text-error">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-8">
              <p className="font-body text-on-surface-variant">
                El archivo se eliminará de Cloudinary permanentemente. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="p-4 bg-surface-container flex justify-end gap-3 border-t border-outline-variant/30">
              <button onClick={() => setDeleteId(null)} className="px-6 py-3 text-on-surface font-headline font-bold text-xs uppercase tracking-widest border border-outline-variant/50 hover:bg-surface-container-highest transition-colors">
                Cancelar
              </button>
              <button onClick={executeDelete} className="bg-error text-white px-8 py-3 font-headline font-black text-xs uppercase tracking-widest hover:bg-error-container transition-all">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
