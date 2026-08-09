"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Profile,
  SongAnnotation,
  PartMark,
  TagKey,
  fetchAnnotations,
  putAnnotation,
  putSongKey,
} from './annotations';

const PROFILE_ID_KEY = 'stage_singerId';
const PROFILE_NAME_KEY = 'stage_singerName';
const PROFILE_PIN_KEY = 'stage_singerHasPin';

const cacheKey = (profileId: string, serviceId: string) => `stage_ann_${profileId}_${serviceId}`;
const queueKey = (profileId: string, serviceId: string) => `stage_annq_${profileId}_${serviceId}`;

type AnnMap = Record<string, SongAnnotation>;
type KeyMap = Record<string, string | null>;
interface Queue { songs: string[]; keys: string[] }

/**
 * Maneja el perfil del cantante y sus anotaciones para una reunión.
 * Local-first: cachea en localStorage, encola escrituras y sincroniza al
 * reconectar, de modo que en el evento (sin luces / sin wifi) siempre se ven
 * las notas ya preparadas.
 */
export function useStageAnnotations(serviceId: string | null | undefined) {
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [ann, setAnn] = useState<AnnMap>({});
  const [songKeys, setSongKeys] = useState<KeyMap>({});
  const [ready, setReady] = useState(false);

  const annRef = useRef<AnnMap>({});
  const keysRef = useRef<KeyMap>({});
  const dirtySongs = useRef<Set<string>>(new Set());
  const dirtyKeys = useRef<Set<string>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const serviceRef = useRef<string | null>(null);

  // Espejos siempre-frescos para timers / flush
  annRef.current = ann;
  keysRef.current = songKeys;
  profileRef.current = profile;
  serviceRef.current = serviceId ?? null;

  // ── Cargar perfil recordado ──
  useEffect(() => {
    try {
      const id = localStorage.getItem(PROFILE_ID_KEY);
      const name = localStorage.getItem(PROFILE_NAME_KEY);
      if (id && name) {
        setProfileState({ id, name, hasPin: localStorage.getItem(PROFILE_PIN_KEY) === '1' });
      }
    } catch { /* ignore */ }
  }, []);

  const setProfile = useCallback((p: Profile | null) => {
    setProfileState(p);
    try {
      if (p) {
        localStorage.setItem(PROFILE_ID_KEY, p.id);
        localStorage.setItem(PROFILE_NAME_KEY, p.name);
        localStorage.setItem(PROFILE_PIN_KEY, p.hasPin ? '1' : '0');
      } else {
        localStorage.removeItem(PROFILE_ID_KEY);
        localStorage.removeItem(PROFILE_NAME_KEY);
        localStorage.removeItem(PROFILE_PIN_KEY);
      }
    } catch { /* ignore */ }
    dirtySongs.current = new Set();
    dirtyKeys.current = new Set();
    annRef.current = {};
    keysRef.current = {};
    setAnn({});
    setSongKeys({});
    setReady(false);
  }, []);

  const persistCache = useCallback(() => {
    const p = profileRef.current, sid = serviceRef.current;
    if (!p || !sid) return;
    try {
      localStorage.setItem(cacheKey(p.id, sid), JSON.stringify({ ann: annRef.current, keys: keysRef.current }));
    } catch { /* ignore */ }
  }, []);

  const persistQueue = useCallback(() => {
    const p = profileRef.current, sid = serviceRef.current;
    if (!p || !sid) return;
    try {
      const q: Queue = { songs: Array.from(dirtySongs.current), keys: Array.from(dirtyKeys.current) };
      if (!q.songs.length && !q.keys.length) localStorage.removeItem(queueKey(p.id, sid));
      else localStorage.setItem(queueKey(p.id, sid), JSON.stringify(q));
    } catch { /* ignore */ }
  }, []);

  const flush = useCallback(async () => {
    const p = profileRef.current, sid = serviceRef.current;
    if (!p || !sid) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    for (const songId of Array.from(dirtySongs.current)) {
      const a = annRef.current[songId] || { songId, parts: {} };
      try {
        await putAnnotation(p.id, sid, a);
        dirtySongs.current.delete(songId);
      } catch { break; } // seguimos sin red: dejamos el resto en cola
    }
    for (const songId of Array.from(dirtyKeys.current)) {
      try {
        await putSongKey(sid, songId, keysRef.current[songId] ?? null);
        dirtyKeys.current.delete(songId);
      } catch { break; }
    }
    persistQueue();
  }, [persistQueue]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => { flush(); }, 800);
  }, [flush]);

  // ── Cargar cache + servidor cuando hay perfil y reunión ──
  useEffect(() => {
    if (!profile || !serviceId) { setReady(false); return; }
    const p = profile, sid = serviceId;
    let cancelled = false;

    // arrancamos limpio para esta (persona, reunión)
    dirtySongs.current = new Set();
    dirtyKeys.current = new Set();

    // 1. cache instantáneo
    try {
      const raw = localStorage.getItem(cacheKey(p.id, sid));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ann) { annRef.current = parsed.ann; setAnn(parsed.ann); }
        if (parsed?.keys) { keysRef.current = parsed.keys; setSongKeys(parsed.keys); }
      }
    } catch { /* ignore */ }

    // cola pendiente de una sesión previa (offline)
    try {
      const rawq = localStorage.getItem(queueKey(p.id, sid));
      if (rawq) {
        const q: Queue = JSON.parse(rawq);
        (q.songs || []).forEach((s) => dirtySongs.current.add(s));
        (q.keys || []).forEach((s) => dirtyKeys.current.add(s));
      }
    } catch { /* ignore */ }

    // 2. servidor (si hay red); conserva ediciones locales sin sincronizar
    (async () => {
      try {
        const data = await fetchAnnotations(p.id, sid);
        if (cancelled) return;
        const serverMap: AnnMap = {};
        for (const a of data.annotations) serverMap[a.songId] = { ...a, parts: a.parts || {} };
        setAnn((prev) => {
          const merged: AnnMap = { ...serverMap };
          dirtySongs.current.forEach((songId) => { if (prev[songId]) merged[songId] = prev[songId]; });
          annRef.current = merged;
          return merged;
        });
        setSongKeys((prev) => {
          const merged: KeyMap = { ...(data.songKeys || {}) };
          dirtyKeys.current.forEach((songId) => { if (songId in prev) merged[songId] = prev[songId]; });
          keysRef.current = merged;
          return merged;
        });
        persistCache();
        flush();
      } catch {
        /* offline: nos quedamos con el cache */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [profile, serviceId, persistCache, flush]);

  // ── Flush al reconectar / periódico si quedó algo pendiente ──
  useEffect(() => {
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    const iv = setInterval(() => {
      if (dirtySongs.current.size || dirtyKeys.current.size) flush();
    }, 15000);
    return () => { window.removeEventListener('online', onOnline); clearInterval(iv); };
  }, [flush]);

  // ── Mutaciones (sincronizan el espejo antes de persistir) ──
  const mutateSong = useCallback((songId: string, fn: (a: SongAnnotation) => SongAnnotation) => {
    const prev = annRef.current;
    const current = prev[songId] || { songId, parts: {} };
    const next = fn({ ...current, parts: { ...current.parts } });
    const merged = { ...prev, [songId]: next };
    annRef.current = merged;
    setAnn(merged);
    dirtySongs.current.add(songId);
    persistCache();
    persistQueue();
    scheduleFlush();
  }, [persistCache, persistQueue, scheduleFlush]);

  const setRole = useCallback((songId: string, role: TagKey | null) => {
    mutateSong(songId, (a) => ({ ...a, role }));
  }, [mutateSong]);

  const setSongNote = useCallback((songId: string, note: string) => {
    mutateSong(songId, (a) => ({ ...a, note: note.trim() ? note : null }));
  }, [mutateSong]);

  const setPartMark = useCallback((songId: string, partId: string, mark: PartMark) => {
    mutateSong(songId, (a) => {
      const parts = { ...a.parts };
      const clean: PartMark = {};
      if (mark.tag) clean.tag = mark.tag;
      if (mark.note && mark.note.trim()) clean.note = mark.note.trim();
      if (mark.laps && mark.laps.length) clean.laps = mark.laps;
      if (!clean.tag && !clean.note && !clean.laps) delete parts[partId];
      else parts[partId] = clean;
      return { ...a, parts };
    });
  }, [mutateSong]);

  const setSongKey = useCallback((songId: string, keyLabel: string) => {
    const val = keyLabel.trim() ? keyLabel.trim() : null;
    const merged = { ...keysRef.current, [songId]: val };
    keysRef.current = merged;
    setSongKeys(merged);
    dirtyKeys.current.add(songId);
    persistCache();
    persistQueue();
    scheduleFlush();
  }, [persistCache, persistQueue, scheduleFlush]);

  const annForSong = useCallback(
    (songId?: string): SongAnnotation | undefined => (songId ? ann[songId] : undefined),
    [ann],
  );
  const songKey = useCallback(
    (songId?: string): string | null | undefined => (songId ? songKeys[songId] : undefined),
    [songKeys],
  );

  return { profile, setProfile, ready, annForSong, songKey, setRole, setSongNote, setPartMark, setSongKey };
}
