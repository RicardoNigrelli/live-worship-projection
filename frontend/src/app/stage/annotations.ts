import { API_URL } from '@/lib/api';

// ─── Vocabulario de marcas (color = información, se lee en la oscuridad) ───
export type TagKey = 'VOICE1' | 'VOICE2' | 'LEAD' | 'ALL' | 'UP' | 'DOWN' | 'SILENT';

export interface TagDef {
  key: TagKey;
  label: string;
  color: string; // acento hex, vivo sobre negro
  icon: string;  // material symbol
}

export const TAGS: TagDef[] = [
  { key: 'VOICE1', label: '1ª voz',     color: '#3b82f6', icon: 'looks_one' },
  { key: 'VOICE2', label: '2ª voz',     color: '#f59e0b', icon: 'looks_two' },
  { key: 'LEAD',   label: 'Solo líder', color: '#a855f7', icon: 'mic' },
  { key: 'ALL',    label: 'Todos',      color: '#22c55e', icon: 'groups' },
  { key: 'UP',     label: 'Sube',       color: '#ef4444', icon: 'trending_up' },
  { key: 'DOWN',   label: 'Baja',       color: '#14b8a6', icon: 'trending_down' },
  { key: 'SILENT', label: 'Callo',      color: '#6b7280', icon: 'volume_off' },
];

export const TAG_MAP: Record<TagKey, TagDef> = TAGS.reduce((m, t) => {
  m[t.key] = t;
  return m;
}, {} as Record<TagKey, TagDef>);

// Rol a nivel canción (sin dinámicas de volumen)
export const ROLE_KEYS: TagKey[] = ['VOICE1', 'VOICE2', 'LEAD', 'ALL', 'SILENT'];

// Una marca activa (canto algo) = tiene tag y no es "callo"
export function isActiveTag(tag?: TagKey | null): boolean {
  return !!tag && tag !== 'SILENT';
}

// Color hex → rgba con alpha (para tintar el fondo de la estrofa)
export function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Clave estable de una estrofa (sobrevive re-guardados del admin mejor que el uuid)
export function partKey(p: { order: number; type: string }): string {
  return `${p.order}:${p.type}`;
}

// ─── Vueltas: una misma diapositiva se canta 2, 3 o 4 veces ───
// Cada vuelta lleva su propia dinámica, para poder decir "en la 2ª sube".
export type LapDyn = 'SAME' | 'UP' | 'DOWN';

export const LAP_DEF: Record<LapDyn, { arrow: string; label: string; color: string | null }> = {
  SAME: { arrow: '=', label: 'igual', color: null },
  UP:   { arrow: '↑', label: 'sube',  color: '#ef4444' },
  DOWN: { arrow: '↓', label: 'baja',  color: '#14b8a6' },
};

export const MAX_LAPS = 6;

// Ciclo al tocar el chip: igual → sube → baja → igual
export function nextLap(d: LapDyn): LapDyn {
  return d === 'SAME' ? 'UP' : d === 'UP' ? 'DOWN' : 'SAME';
}

export const LAP_ORDINAL = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª'];

// Sugerencia de cuántas vueltas, leyendo los marcadores de la letra:
// //texto// = 3 veces, /texto/ = 2 veces. Es solo una sugerencia editable.
export function detectLaps(content: string): number {
  if (!content) return 0;
  if (/\/\/[\s\S]+\/\//.test(content)) return 3;
  if (/\/[\s\S]+\//.test(content)) return 2;
  return 0;
}

export interface PartMark { tag?: TagKey; note?: string; laps?: LapDyn[] }

export interface SongAnnotation {
  songId: string;
  role?: TagKey | null;
  note?: string | null;
  parts: Record<string, PartMark>;
  updatedAt?: string;
}

export interface Profile { id: string; name: string; hasPin: boolean }

export interface AnnotationsResponse {
  annotations: SongAnnotation[];
  songKeys: Record<string, string | null>;
}

// ─── API ───
async function errMsg(r: Response, fallback: string): Promise<string> {
  try { return (await r.json()).error || fallback; } catch { return fallback; }
}

export async function fetchProfiles(): Promise<Profile[]> {
  const r = await fetch(`${API_URL}/api/stage/profiles`);
  if (!r.ok) throw new Error(await errMsg(r, 'No se pudieron cargar los perfiles'));
  return r.json();
}

export async function createProfile(name: string, pin?: string): Promise<Profile> {
  const r = await fetch(`${API_URL}/api/stage/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pin: pin || undefined }),
  });
  if (!r.ok) throw new Error(await errMsg(r, 'No se pudo crear el perfil'));
  return r.json();
}

export async function verifyProfile(id: string, pin: string): Promise<Profile> {
  const r = await fetch(`${API_URL}/api/stage/profiles/${id}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!r.ok) throw new Error(await errMsg(r, 'PIN incorrecto'));
  return r.json();
}

export async function fetchAnnotations(profileId: string, serviceId: string): Promise<AnnotationsResponse> {
  const r = await fetch(
    `${API_URL}/api/stage/annotations?profileId=${encodeURIComponent(profileId)}&serviceId=${encodeURIComponent(serviceId)}`,
  );
  if (!r.ok) throw new Error(await errMsg(r, 'No se pudieron cargar las anotaciones'));
  return r.json();
}

export async function putAnnotation(profileId: string, serviceId: string, ann: SongAnnotation): Promise<void> {
  const r = await fetch(`${API_URL}/api/stage/annotations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId,
      serviceId,
      songId: ann.songId,
      role: ann.role ?? null,
      note: ann.note ?? null,
      parts: ann.parts || {},
    }),
  });
  if (!r.ok) throw new Error(await errMsg(r, 'No se pudo guardar la anotación'));
}

export async function putSongKey(serviceId: string, songId: string, keyLabel: string | null): Promise<void> {
  const r = await fetch(`${API_URL}/api/stage/song-key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceId, songId, keyLabel }),
  });
  if (!r.ok) throw new Error(await errMsg(r, 'No se pudo guardar el tono'));
}
