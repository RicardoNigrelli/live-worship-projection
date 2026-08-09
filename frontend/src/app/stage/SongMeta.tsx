"use client";
import { useState } from 'react';
import { TagKey, ROLE_KEYS, TAG_MAP } from './annotations';

interface Props {
  darkMode: boolean;
  canEdit: boolean;
  keyLabel: string | null | undefined;
  role: TagKey | null | undefined;
  note: string | null | undefined;
  onKey: (v: string) => void;
  onRole: (v: TagKey | null) => void;
  onNote: (v: string) => void;
}

export default function SongMeta({ darkMode, canEdit, keyLabel, role, note, onKey, onRole, onNote }: Props) {
  const [open, setOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  const roleDef = role ? TAG_MAP[role] : null;
  const textMuted = darkMode ? 'text-zinc-500' : 'text-gray-400';
  const inputCls = darkMode
    ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-600'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';

  return (
    <>
      {/* Resumen (siempre visible) */}
      <div className="flex items-center justify-center flex-wrap gap-2 mt-2">
        <span
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-headline font-bold uppercase tracking-wide"
          style={{ border: `1px solid ${keyLabel ? '#22c55e' : darkMode ? '#3f3f46' : '#d1d5db'}`, color: keyLabel ? '#22c55e' : undefined }}
        >
          <span className="material-symbols-outlined text-[14px]">music_note</span>
          {keyLabel ? `Tono ${keyLabel}` : 'Sin tono'}
        </span>

        {roleDef && (
          <span
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-headline font-bold uppercase tracking-wide"
            style={{ border: `1px solid ${roleDef.color}`, color: roleDef.color }}
          >
            <span className="material-symbols-outlined text-[14px]">{roleDef.icon}</span>
            {roleDef.label}
          </span>
        )}

        {note && (
          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] max-w-[14rem] truncate border ${darkMode ? 'text-zinc-300 border-zinc-700' : 'text-gray-600 border-gray-300'}`}>
            <span className="material-symbols-outlined text-[14px]">sticky_note_2</span>
            {note}
          </span>
        )}

        {canEdit && (
          <button
            onClick={() => { setKeyDraft(keyLabel || ''); setOpen(true); }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border transition-colors ${darkMode ? 'border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'border-gray-300 text-gray-500 hover:text-gray-700'}`}
          >
            <span className="material-symbols-outlined text-[14px]">tune</span>
            Mis marcas
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[140] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl border ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'border-zinc-800' : 'border-gray-200'}`}>
              <h3 className={`font-headline font-black text-xs uppercase tracking-widest ${darkMode ? 'text-zinc-100' : 'text-gray-900'}`}>Esta canción</h3>
              <button onClick={() => setOpen(false)} className={textMuted}><span className="material-symbols-outlined">close</span></button>
            </div>

            <div className="p-4 flex flex-col gap-4">
              {/* Tono (compartido) */}
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Tono (lo ven todos)</label>
                <div className="flex gap-2 mt-1">
                  <input
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value.slice(0, 12))}
                    placeholder="Ej: Sol, Am, C#…"
                    className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary ${inputCls}`}
                    onKeyDown={(e) => { if (e.key === 'Enter') onKey(keyDraft); }}
                  />
                  <button onClick={() => onKey(keyDraft)} className="px-4 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider">OK</button>
                </div>
              </div>

              {/* Mi rol */}
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Mi rol ese día</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ROLE_KEYS.map((k) => {
                    const d = TAG_MAP[k];
                    const on = role === k;
                    return (
                      <button
                        key={k}
                        onClick={() => onRole(on ? null : k)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-headline font-bold uppercase tracking-wide"
                        style={{ borderColor: d.color, backgroundColor: on ? d.color : 'transparent', color: on ? '#ffffff' : d.color }}
                      >
                        <span className="material-symbols-outlined text-[16px]">{d.icon}</span>{d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nota general */}
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Nota general</label>
                <textarea
                  value={note || ''}
                  onChange={(e) => onNote(e.target.value)}
                  rows={2}
                  placeholder="Ej: arranco yo en la 2ª estrofa"
                  className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary ${inputCls}`}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
