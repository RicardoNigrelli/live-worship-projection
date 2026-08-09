"use client";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Profile, fetchProfiles, createProfile, verifyProfile } from './annotations';

interface Props {
  darkMode: boolean;
  profile: Profile | null;
  onChange: (p: Profile | null) => void;
}

type Mode = 'list' | 'create' | 'pin';

export default function ProfileGate({ darkMode, profile, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('list');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinFor, setPinFor] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    setMode('list');
    setError('');
    setName('');
    setPin('');
    setLoading(true);
    fetchProfiles()
      .then(setProfiles)
      .catch(() => setError('No se pudieron cargar los perfiles (¿sin conexión?)'))
      .finally(() => setLoading(false));
  }, [open]);

  const choose = (p: Profile) => {
    if (p.hasPin) {
      setPinFor(p);
      setPin('');
      setError('');
      setMode('pin');
    } else {
      onChange(p);
      setOpen(false);
    }
  };

  const submitPin = async () => {
    if (!pinFor) return;
    setBusy(true);
    setError('');
    try {
      const ok = await verifyProfile(pinFor.id, pin);
      onChange(ok);
      setOpen(false);
    } catch (e: any) {
      setError(e.message || 'PIN incorrecto');
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    if (!name.trim()) { setError('Escribí tu nombre'); return; }
    if (pin && !/^\d{4}$/.test(pin)) { setError('El PIN debe ser de 4 dígitos'); return; }
    setBusy(true);
    setError('');
    try {
      const p = await createProfile(name.trim(), pin || undefined);
      onChange(p);
      setOpen(false);
    } catch (e: any) {
      setError(e.message || 'No se pudo crear el perfil');
    } finally {
      setBusy(false);
    }
  };

  const panel = darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-zinc-100' : 'text-gray-900';
  const textMuted = darkMode ? 'text-zinc-500' : 'text-gray-400';
  const inputCls = darkMode
    ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-600'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';

  return (
    <>
      {/* Chip en el header */}
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1 px-2 h-8 rounded-full border text-[11px] font-headline font-bold uppercase tracking-wide transition-colors max-w-[7.5rem] ${
          profile
            ? (darkMode ? 'border-primary/40 text-primary' : 'border-primary/50 text-primary')
            : (darkMode ? 'border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'border-gray-300 text-gray-500 hover:text-gray-700')
        }`}
        title={profile ? `Cantás como ${profile.name}` : 'Elegí tu perfil'}
      >
        <span className="material-symbols-outlined text-[16px] shrink-0">
          {profile ? 'account_circle' : 'person_add'}
        </span>
        <span className="truncate">{profile ? profile.name : '¿Quién sos?'}</span>
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[130] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className={`w-full sm:max-w-sm max-h-[85vh] rounded-t-2xl sm:rounded-none flex flex-col shadow-2xl border ${panel}`} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className={`p-4 border-b flex justify-between items-center shrink-0 ${darkMode ? 'border-zinc-800' : 'border-gray-200'}`}>
              <h3 className={`font-headline font-black text-sm uppercase tracking-widest ${textPrimary}`}>
                {mode === 'create' ? 'Nuevo cantante' : mode === 'pin' ? 'Ingresá tu PIN' : '¿Quién sos?'}
              </h3>
              <button onClick={() => setOpen(false)} className={textMuted}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="overflow-y-auto p-4 flex flex-col gap-3">
              {error && <p className="text-red-400 text-xs font-bold">{error}</p>}

              {/* Lista de perfiles */}
              {mode === 'list' && (
                <>
                  {loading ? (
                    <p className={`text-sm text-center py-6 ${textMuted}`}>Cargando…</p>
                  ) : profiles.length === 0 ? (
                    <p className={`text-sm text-center py-4 ${textMuted}`}>Todavía no hay cantantes. Creá el tuyo.</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {profiles.map((p) => {
                        const active = p.id === profile?.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => choose(p)}
                            className={`w-full flex items-center gap-3 px-3 py-3 text-left rounded-lg border transition-colors ${
                              active
                                ? 'border-primary/50 bg-primary/10'
                                : (darkMode ? 'border-zinc-800 hover:bg-zinc-900' : 'border-gray-200 hover:bg-gray-50')
                            }`}
                          >
                            <span className={`material-symbols-outlined text-[22px] ${active ? 'text-primary' : textMuted}`}>account_circle</span>
                            <span className={`flex-1 font-headline font-bold text-sm uppercase truncate ${active ? 'text-primary' : textPrimary}`}>{p.name}</span>
                            {p.hasPin && <span className={`material-symbols-outlined text-[16px] ${textMuted}`}>lock</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button
                    onClick={() => { setMode('create'); setError(''); }}
                    className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-primary text-white font-headline font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                    Soy nuevo
                  </button>
                  {profile && (
                    <button
                      onClick={() => { onChange(null); setOpen(false); }}
                      className={`w-full text-center py-2 text-[11px] font-bold uppercase tracking-wider ${textMuted} hover:text-red-400 transition-colors`}
                    >
                      Salir de {profile.name}
                    </button>
                  )}
                </>
              )}

              {/* Crear perfil */}
              {mode === 'create' && (
                <>
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Tu nombre</label>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Sofi"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary ${inputCls}`}
                  />
                  <label className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${textMuted}`}>PIN de 4 dígitos (opcional)</label>
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    placeholder="Para reclamar tu perfil en otro celular"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm tracking-[0.4em] focus:outline-none focus:border-primary ${inputCls}`}
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => { setMode('list'); setError(''); }} className={`flex-1 py-2.5 rounded-lg border font-headline font-bold text-xs uppercase tracking-wider ${darkMode ? 'border-zinc-700 text-zinc-400' : 'border-gray-300 text-gray-500'}`}>Volver</button>
                    <button onClick={submitCreate} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-primary text-white font-headline font-bold text-xs uppercase tracking-wider disabled:opacity-50">
                      {busy ? 'Creando…' : 'Empezar'}
                    </button>
                  </div>
                </>
              )}

              {/* Ingresar PIN */}
              {mode === 'pin' && pinFor && (
                <>
                  <p className={`text-sm ${textPrimary}`}>Perfil de <b>{pinFor.name}</b></p>
                  <input
                    autoFocus
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    placeholder="• • • •"
                    className={`w-full border rounded-lg px-3 py-3 text-center text-lg tracking-[0.5em] focus:outline-none focus:border-primary ${inputCls}`}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitPin(); }}
                  />
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => { setMode('list'); setError(''); }} className={`flex-1 py-2.5 rounded-lg border font-headline font-bold text-xs uppercase tracking-wider ${darkMode ? 'border-zinc-700 text-zinc-400' : 'border-gray-300 text-gray-500'}`}>Volver</button>
                    <button onClick={submitPin} disabled={busy || pin.length < 4} className="flex-1 py-2.5 rounded-lg bg-primary text-white font-headline font-bold text-xs uppercase tracking-wider disabled:opacity-50">
                      {busy ? 'Verificando…' : 'Entrar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
