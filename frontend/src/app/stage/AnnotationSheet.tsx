"use client";
import { PartMark, TagKey, TAGS, LapDyn, LAP_DEF, LAP_ORDINAL, MAX_LAPS, nextLap, detectLaps } from './annotations';

interface Props {
  darkMode: boolean;
  partLabel: string;
  partText: string;
  mark: PartMark;
  onChange: (m: PartMark) => void;
  onClose: () => void;
}

export default function AnnotationSheet({ darkMode, partLabel, partText, mark, onChange, onClose }: Props) {
  const panel = darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-zinc-100' : 'text-gray-900';
  const textMuted = darkMode ? 'text-zinc-500' : 'text-gray-400';

  const toggleTag = (tag: TagKey) => onChange({ ...mark, tag: mark.tag === tag ? undefined : tag });

  const laps = mark.laps || [];
  const suggested = detectLaps(partText);
  const setLaps = (next: LapDyn[]) => onChange({ ...mark, laps: next.length ? next : undefined });
  const cycleLap = (i: number) => setLaps(laps.map((l, idx) => (idx === i ? nextLap(l) : l)));
  const addLap = () => { if (laps.length < MAX_LAPS) setLaps([...laps, 'SAME']); };
  const removeLap = () => setLaps(laps.slice(0, -1));

  return (
    <div className="fixed inset-0 z-[140] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className={`w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl border ${panel}`} onClick={(e) => e.stopPropagation()}>
        <div className={`p-4 border-b flex justify-between items-center shrink-0 ${darkMode ? 'border-zinc-800' : 'border-gray-200'}`}>
          <div className="min-w-0">
            <h3 className={`font-headline font-black text-xs uppercase tracking-widest ${textPrimary}`}>Marca de sección</h3>
            <p className={`text-[10px] uppercase tracking-wider truncate ${textMuted}`}>{partLabel}</p>
          </div>
          <button onClick={onClose} className={textMuted}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="overflow-y-auto p-4 flex flex-col gap-4">
          <p className={`text-xs whitespace-pre-wrap ${textMuted}`} style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {partText}
          </p>

          {/* Tags de voz / dinámica */}
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => {
              const on = mark.tag === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => toggleTag(t.key)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-headline font-bold uppercase tracking-wide transition-all"
                  style={{ borderColor: t.color, backgroundColor: on ? t.color : 'transparent', color: on ? '#ffffff' : t.color }}
                >
                  <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Vueltas — una misma diapo se canta varias veces */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Vueltas</label>
              {laps.length > 0 && (
                <span className={`text-[10px] ${textMuted}`}>Tocá cada una para cambiarla</span>
              )}
            </div>

            {laps.length === 0 && suggested > 0 && (
              <button
                onClick={() => setLaps(Array.from({ length: suggested }, () => 'SAME' as LapDyn))}
                className={`mb-2 w-full text-left px-3 py-2 rounded-lg border border-dashed text-xs transition-colors ${darkMode ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-900' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
              >
                <span className="material-symbols-outlined text-[14px] align-middle mr-1">auto_awesome</span>
                La letra marca {suggested} vueltas — crearlas
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {laps.map((l, i) => {
                const d = LAP_DEF[l];
                return (
                  <button
                    key={i}
                    onClick={() => cycleLap(i)}
                    className="px-3 py-2 rounded-full text-xs font-headline font-bold uppercase tracking-wide border transition-all min-w-[58px]"
                    style={{
                      borderColor: d.color || (darkMode ? '#3f3f46' : '#d1d5db'),
                      backgroundColor: d.color || 'transparent',
                      color: d.color ? '#ffffff' : (darkMode ? '#a1a1aa' : '#6b7280'),
                    }}
                  >
                    {LAP_ORDINAL[i]} {d.arrow}
                  </button>
                );
              })}

              {laps.length < MAX_LAPS && (
                <button
                  onClick={addLap}
                  aria-label="Agregar vuelta"
                  className={`px-3 py-2 rounded-full text-xs font-bold border border-dashed transition-colors ${darkMode ? 'border-zinc-600 text-zinc-500 hover:text-zinc-300' : 'border-gray-300 text-gray-400 hover:text-gray-600'}`}
                >
                  +
                </button>
              )}
              {laps.length > 0 && (
                <button
                  onClick={removeLap}
                  aria-label="Quitar última vuelta"
                  className={`px-3 py-2 rounded-full text-xs font-bold border border-dashed transition-colors ${darkMode ? 'border-zinc-600 text-zinc-500 hover:text-zinc-300' : 'border-gray-300 text-gray-400 hover:text-gray-600'}`}
                >
                  −
                </button>
              )}
            </div>
          </div>

          {/* Nota de sección */}
          <div>
            <label className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Nota de esta sección</label>
            <textarea
              value={mark.note || ''}
              onChange={(e) => onChange({ ...mark, note: e.target.value })}
              rows={2}
              placeholder="Ej: entro yo, respiro antes del coro…"
              className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary ${darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
            />
          </div>

          {(mark.tag || mark.note || laps.length > 0) && (
            <button onClick={() => onChange({})} className={`self-start text-[11px] font-bold uppercase tracking-wider ${textMuted} hover:text-red-400 transition-colors`}>
              Quitar marca
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
