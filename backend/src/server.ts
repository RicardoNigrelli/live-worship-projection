import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { setupSockets } from './socket';
import { prisma, defaultRoomManager, metrics } from './RoomManager';
import { extractPlaylistId, getPlaylistTracks, fetchLyrics, parseLyricsSections } from './spotify';
import PptxGenJS from 'pptxgenjs';

// ─── Cloudinary Config ─────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req: any, file: Express.Multer.File) => ({
    folder: 'vantage-os',
    resource_type: file.mimetype.startsWith('video') ? 'video' : 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov'],
  }),
});

const upload = multer({ storage: cloudinaryStorage });

// Ensures every song starts with a title slide and ends with an empty slide.
// Idempotent: safe to call on every create/update without stacking duplicates.
function ensureDefaultSlides(title: string, parts: Array<{ type: string; content: string; order?: number }>) {
  const result = [...parts];

  if (result[0]?.type === 'TITULO') {
    result[0] = { ...result[0], content: title };
  } else {
    result.unshift({ type: 'TITULO', content: title });
  }

  if (result[result.length - 1]?.type !== 'FINAL') {
    result.push({ type: 'FINAL', content: '' });
  }

  return result.map((p, idx) => ({ type: p.type, content: p.content, order: idx + 1 }));
}

// Store io reference globally for event emission
let ioInstance: any = null;

const port = process.env.PORT || 3001;

const app = express();
// NOTE (security review): FRONTEND_URL defaults to "*" (wide open CORS) when unset.
// This is left as-is for demo portability, but should be set to the exact deployed
// frontend origin in any environment that isn't purely local/demo. See report.
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// ─── SEC: Basic in-memory rate limiting (no external deps) ────────────────
// Protects against a single client hammering the API and breaking the demo
// for everyone else. Not distributed / not persisted — good enough for a
// single-instance portfolio demo, not a substitute for a real WAF.
type Bucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, Bucket>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({ error: 'Demasiadas solicitudes, intenta más tarde' });
    }
    bucket.count++;
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

// General ceiling for every request (belt-and-suspenders against scripted abuse).
app.use(rateLimit(300, 60_000));
// Tighter ceiling specifically for state-mutating requests.
const writeLimiter = rateLimit(30, 60_000);
// Even tighter for endpoints that call out to external services (Spotify/lyrics) or
// generate files (PPTX export) — these are the most expensive to abuse.
const externalLimiter = rateLimit(10, 60_000);

// ─── SEC: API key auth for write routes ────────────────────────────────────
// Minimal single-shared-secret gate (per project security review) — not a full
// user/role system. Protects create/update/delete of songs, services, decks,
// media uploads, exports, and room rollback. Read-only GETs (and the
// self-service /api/stage/* singer-profile endpoints, which have their own
// per-profile PIN check) are intentionally left open for the demo to be
// browsable without credentials.
const API_KEY = process.env.API_KEY;
function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!API_KEY) {
    // Fail closed: if no key is configured, block writes instead of silently
    // allowing them (avoids "forgot to set the env var in prod" turning into
    // an open write API).
    return res.status(503).json({ error: 'Auth no configurada en el servidor' });
  }
  const provided = req.header('x-api-key');
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'API key inválida o ausente' });
  }
  next();
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ["GET", "POST"]
  }
});

// Basic Health Endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// SONGS CRUD REST API
app.get('/api/songs', async (req, res) => {
  try {
    const songs = await prisma.song.findMany({ include: { parts: { orderBy: { order: 'asc' } } }, orderBy: { title: 'asc' } });
    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

app.get('/api/songs/:id', async (req, res) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params.id },
      include: { parts: { orderBy: { order: 'asc' } } },
    });
    if (!song) return res.status(404).json({ error: 'Cancion no encontrada' });
    res.json(song);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

app.post('/api/songs', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { title, author, category, themeBgType, themeBgValue, themeFontFamily, themeFontColor, themeFontSize, parts } = req.body;
    const finalParts = ensureDefaultSlides(title, parts || []);
    const song = await prisma.song.create({
      data: {
        title, author, category, themeBgType, themeBgValue, themeFontFamily, themeFontColor, themeFontSize,
        parts: { create: finalParts }
      },
      include: { parts: { orderBy: { order: 'asc' } } }
    });
    res.status(201).json(song);
  } catch (err) {
    res.status(400).json({ error: 'Error creando cancion' });
  }
});

app.put('/api/songs/:id', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, author, category, themeBgType, themeBgValue, themeFontFamily, themeFontColor, themeFontSize, parts } = req.body;

    // Simplest way to handle nested parts update is delete and recreate them for the MVP
    if (parts) {
      await prisma.songPart.deleteMany({ where: { songId: id } });
    }

    const finalParts = parts ? ensureDefaultSlides(title, parts) : undefined;
    const song = await prisma.song.update({
      where: { id },
      data: {
        title, author, category, themeBgType, themeBgValue, themeFontFamily, themeFontColor, themeFontSize,
        parts: finalParts ? { create: finalParts } : undefined
      },
      include: { parts: { orderBy: { order: 'asc' } } }
    });

    // Sync live rooms when this song changes.
    if (ioInstance) {
      const activeRooms = await prisma.roomSnapshot.findMany({ where: { songId: id }, select: { id: true } });
      const slideContents = song.parts.map(p => p.content);
      const slideLabels = song.parts.map(p => p.type);
      const newSlides = JSON.stringify(slideContents);
      const newStyle = {
        fontFamily: song.themeFontFamily || null,
        fontColor: song.themeFontColor || null,
        fontSize: song.themeFontSize || null,
        bgType: song.themeBgType || null,
        bgValue: song.themeBgValue || null,
      };

      for (const room of activeRooms) {
        const currentRoom = await defaultRoomManager.getRoomState(room.id);
        const nextSlideIndex = Math.min(currentRoom.slideIndex ?? 0, Math.max(0, slideContents.length - 1));
        const nextPlaylist = (() => {
          try {
            const playlist = JSON.parse((currentRoom as any).playlist || '[]');
            if (!Array.isArray(playlist)) return (currentRoom as any).playlist;
            return JSON.stringify(playlist.map((item: any) => item.id === id
              ? { ...item, title: song.title, slides: slideContents, _slideLabels: slideLabels, _style: newStyle }
              : item
            ));
          } catch {
            return (currentRoom as any).playlist;
          }
        })();

        ioInstance.to(room.id).emit('song_updated', {
          songId: id,
          title: song.title,
          slides: newSlides,
          ...newStyle,
        });

        // Also update room state so changes survive page reload and staging restoration.
        const newState = await defaultRoomManager.updateState(room.id, {
          songId: id,
          title: song.title,
          slides: newSlides,
          slideIndex: nextSlideIndex,
          playlist: nextPlaylist,
          ...newStyle,
        } as any);
        ioInstance.to(room.id).emit('state_updated', {
          partialState: {
            songId: id,
            title: song.title,
            slides: newSlides,
            slideIndex: nextSlideIndex,
            playlist: nextPlaylist,
            ...newStyle,
          },
          version: newState.version,
        });
      }
    }

    res.json(song);
  } catch (err) {
    res.status(400).json({ error: 'Error actualizando cancion' });
  }
});

app.delete('/api/songs/:id', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.song.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: 'Error eliminando cancion' });
  }
});

app.post('/api/songs/import', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) return res.status(400).json({ error: 'No text provided' });

    const lines = rawText.split('\n').map((l: string) => l.trim());
    let title = 'Canción Importada';
    let author = '';
    
    // Parse metadata
    const remainingLines: string[] = [];
    for (const line of lines) {
      if (line.toLowerCase().startsWith('title:')) {
        title = line.substring(6).trim();
      } else if (line.toLowerCase().startsWith('author:')) {
        author = line.substring(7).trim();
      } else {
        remainingLines.push(line);
      }
    }

    const blocks = remainingLines.join('\n').split(/\n\s*\n/).map(b => b.trim()).filter(b => b.length > 0);
    const parts = [];
    let order = 1;

    for (const block of blocks) {
      const blockLines = block.split('\n');
      const firstLine = blockLines[0].trim().toUpperCase();
      let type = 'ESTROFA';
      
      if (firstLine.startsWith('CORO') || firstLine.startsWith('CHORUS')) type = 'CORO';
      else if (firstLine.startsWith('PUENTE') || firstLine.startsWith('BRIDGE')) type = 'PUENTE';
      else if (firstLine.startsWith('ESTROFA') || firstLine.startsWith('VERSE')) type = 'ESTROFA';

      // Si la primera línea es solo la etiqueta (ej. "Coro 1"), la quitamos del contenido
      let content = block;
      if (/^(CORO|CHORUS|PUENTE|BRIDGE|ESTROFA|VERSE)(\s+\d+)?$/i.test(firstLine)) {
        content = blockLines.slice(1).join('\n').trim();
      }

      if (content) {
        parts.push({ type, order: order++, content });
      }
    }

    const song = await prisma.song.create({
      data: {
        title,
        author,
        parts: { create: ensureDefaultSlides(title, parts) }
      },
      include: { parts: { orderBy: { order: 'asc' } } }
    });

    res.status(201).json(song);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Error importando cancion' });
  }
});

// SERVICES (Reuniones) CRUD REST API
app.get('/api/services', async (req, res) => {
  try {
    const services = await prisma.service.findMany({ 
      include: { 
        items: { 
          orderBy: { order: 'asc' }, 
          include: { 
            song: { include: { parts: { orderBy: { order: 'asc' } } } }, 
            deck: { include: { slides: { orderBy: { order: 'asc' } } } },
            mediaAsset: true,
            verse: true 
          } 
        } 
      },
      orderBy: { date: 'desc' }
    });
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

app.post('/api/services', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { name, date, items } = req.body;
    const service = await prisma.service.create({
      data: { 
        name, 
        date: new Date(date),
        items: items ? { create: items } : undefined
      },
      include: { items: true }
    });
    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ error: 'Error creando reunión' });
  }
});

app.delete('/api/services/:id', requireApiKey, writeLimiter, async (req, res) => {
  try {
    await prisma.service.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: 'Error eliminando reunión' });
  }
});

app.get('/api/services/:id', async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            song: { include: { parts: { orderBy: { order: 'asc' } } } },
            deck: { include: { slides: { orderBy: { order: 'asc' } } } },
            mediaAsset: true,
          }
        }
      }
    });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

app.post('/api/services/:id/items', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { type, songId, deckId, mediaAssetId } = req.body;
    const maxOrderAgg = await prisma.serviceItem.aggregate({
      where: { serviceId: req.params.id },
      _max: { order: true }
    });
    const nextOrder = (maxOrderAgg._max.order || 0) + 1;
    
    const item = await prisma.serviceItem.create({
      data: { serviceId: req.params.id, type, songId, deckId, mediaAssetId, order: nextOrder },
      include: { 
        song: { include: { parts: { orderBy: { order: 'asc' } } } }, 
        deck: { include: { slides: { orderBy: { order: 'asc' } } } }, 
        mediaAsset: true 
      }
    });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Error agregando item' });
  }
});

app.post('/api/services/:id/items/batch', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { items } = req.body; // [{ type, songId?, deckId?, mediaAssetId? }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }

    const maxOrderAgg = await prisma.serviceItem.aggregate({
      where: { serviceId: req.params.id },
      _max: { order: true }
    });
    let nextOrder = (maxOrderAgg._max.order || 0) + 1;

    const created = await prisma.$transaction(
      items.map((it: any) =>
        prisma.serviceItem.create({
          data: { serviceId: req.params.id, type: it.type, songId: it.songId, deckId: it.deckId, mediaAssetId: it.mediaAssetId, order: nextOrder++ },
        })
      )
    );

    res.json({ created, createdCount: created.length });
  } catch (err) {
    res.status(400).json({ error: 'Error agregando items' });
  }
});

app.delete('/api/services/items/:itemId', requireApiKey, writeLimiter, async (req, res) => {
  try {
    await prisma.serviceItem.delete({ where: { id: req.params.itemId } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: 'Error eliminando item' });
  }
});

app.put('/api/services/:id/reorder', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { items } = req.body; 
    await prisma.$transaction(
      items.map((item: any) => 
        prisma.serviceItem.update({ where: { id: item.id }, data: { order: item.order } })
      )
    );
    res.status(200).send();
  } catch (err) {
    res.status(400).json({ error: 'Error reordenando items' });
  }
});

app.put('/api/services/:id/style', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { fontFamily, fontColor, fontSize, bgType, bgValue } = req.body;
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: { fontFamily, fontColor, fontSize, bgType, bgValue }
    });
    res.json(service);
  } catch (err) {
    res.status(400).json({ error: 'Error updating service style' });
  }
});

// ─── MEDIA ASSETS API ────────────────────────────────
app.get('/api/media', async (req, res) => {
  try {
    const assets = await prisma.mediaAsset.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

app.post('/api/media/upload', requireApiKey, writeLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const file = req.file as any;
    const asset = await prisma.mediaAsset.create({
      data: {
        title: req.body.title || file.originalname,
        type: file.mimetype.startsWith('video') ? 'VIDEO' : 'IMAGE',
        url: file.path,
        thumbnailUrl: file.mimetype.startsWith('video') ? null : file.path,
        publicId: file.filename,
        fileSize: file.size,
        mimeType: file.mimetype,
      }
    });
    res.status(201).json(asset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload error' });
  }
});

app.delete('/api/media/:id', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) return res.status(404).json({ error: 'Not found' });
    // Eliminar de Cloudinary
    if (asset.publicId) {
      const resourceType = asset.type === 'VIDEO' ? 'video' : 'image';
      await cloudinary.uploader.destroy(asset.publicId, { resource_type: resourceType });
    }
    await prisma.mediaAsset.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: 'Error eliminando asset' });
  }
});

// ─── DECKS (DIAPOSITIVAS PERSONALIZADAS) API ─────────
app.get('/api/decks', async (req, res) => {
  try {
    const decks = await prisma.deck.findMany({
      include: { slides: { orderBy: { order: 'asc' } } },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(decks);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

app.get('/api/decks/:id', async (req, res) => {
  try {
    const deck = await prisma.deck.findUnique({
      where: { id: req.params.id },
      include: { slides: { orderBy: { order: 'asc' } } }
    });
    if (!deck) return res.status(404).json({ error: 'Not found' });
    res.json(deck);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

app.post('/api/decks', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { title, slides } = req.body;
    const deck = await prisma.deck.create({
      data: {
        title,
        slides: slides ? {
          create: slides.map((s: any, idx: number) => ({ ...s, order: idx + 1 }))
        } : undefined
      },
      include: { slides: { orderBy: { order: 'asc' } } }
    });
    res.status(201).json(deck);
  } catch (err) {
    res.status(400).json({ error: 'Error creando deck' });
  }
});

app.put('/api/decks/:id', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { title, slides } = req.body;
    if (slides) {
      await prisma.deckSlide.deleteMany({ where: { deckId: req.params.id } });
    }
    const deck = await prisma.deck.update({
      where: { id: req.params.id },
      data: {
        title,
        slides: slides ? {
          create: slides.map((s: any, idx: number) => ({ ...s, order: idx + 1 }))
        } : undefined
      },
      include: { slides: { orderBy: { order: 'asc' } } }
    });
    res.json(deck);
  } catch (err) {
    res.status(400).json({ error: 'Error actualizando deck' });
  }
});

app.delete('/api/decks/:id', requireApiKey, writeLimiter, async (req, res) => {
  try {
    await prisma.deck.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: 'Error eliminando deck' });
  }
});

app.post('/api/spotify/preview', requireApiKey, externalLimiter, async (req, res) => {
  try {
    const { playlistUrl } = req.body;
    if (!playlistUrl) return res.status(400).json({ error: 'playlistUrl required' });

    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) return res.status(400).json({ error: 'Invalid Spotify playlist URL' });

    const tracks = await getPlaylistTracks(playlistId);

    const existingSongs = await prisma.song.findMany({ select: { id: true, title: true, author: true } });
    const existingByTitle = new Map<string, { id: string; author: string | null }>();
    for (const s of existingSongs) {
      existingByTitle.set(s.title.trim().toLowerCase(), { id: s.id, author: s.author });
    }

    const seenInBatch = new Set<string>();
    const trackList = tracks.map((track: { title: string; artist: string; uri: string }) => {
      const tempId = `${track.artist}-${track.title}`.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 80);
      const normalizedTitle = track.title.trim().toLowerCase();
      const existing = existingByTitle.get(normalizedTitle);
      const isDuplicateInBatch = seenInBatch.has(normalizedTitle);
      seenInBatch.add(normalizedTitle);

      return {
        tempId,
        title: track.title,
        artist: track.artist,
        uri: track.uri,
        lyricsFound: null,
        parts: [],
        isDuplicate: !!existing || isDuplicateInBatch,
        duplicateReason: existing ? 'catalog' : isDuplicateInBatch ? 'batch' : null,
        existingSongId: existing?.id || null,
      };
    });

    res.json({ tracks: trackList, total: trackList.length });
  } catch (err: any) {
    console.error('Spotify preview error:', err);
    res.status(500).json({ error: err.message || 'Error fetching playlist' });
  }
});

app.post('/api/spotify/preview/lyrics', requireApiKey, externalLimiter, async (req, res) => {
  try {
    const { tracks } = req.body;
    if (!tracks || !Array.isArray(tracks)) return res.status(400).json({ error: 'tracks array required' });

    const results = [];
    let foundCount = 0;

    for (const track of tracks) {
      try {
        const lyrics = await fetchLyrics(track.artist, track.title);
        if (!lyrics) {
          results.push({ tempId: track.tempId, lyricsFound: false, parts: [{ type: 'VERSO', content: '' }] });
        } else {
          const parts = parseLyricsSections(lyrics);
          foundCount++;
          results.push({ tempId: track.tempId, lyricsFound: true, parts });
        }
      } catch {
        results.push({ tempId: track.tempId, lyricsFound: false, parts: [{ type: 'VERSO', content: '' }] });
      }
    }

    res.json({ results, foundCount, total: tracks.length });
  } catch (err: any) {
    console.error('Lyrics batch error:', err);
    res.status(500).json({ error: err.message || 'Error searching lyrics' });
  }
});

app.post('/api/songs/batch-import', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { tracks, forceReimport = false } = req.body;
    if (!tracks || !Array.isArray(tracks)) return res.status(400).json({ error: 'tracks array required' });

    const created = [];
    const duplicates = [];
    const failed = [];

    for (const track of tracks) {
      try {
        if (!forceReimport) {
          const existing = await prisma.song.findFirst({
            where: {
              title: { equals: track.title, mode: 'insensitive' },
              author: track.artist || null,
            },
          });

          if (existing) {
            duplicates.push({ id: track.tempId, title: track.title, existingId: existing.id });
            continue;
          }
        }

        const rawParts = (track.parts || []).map((p: any) => ({ type: p.type || 'VERSO', content: p.content || '' }));
        const song = await prisma.song.create({
          data: {
            title: track.title,
            author: track.artist,
            category: 'Imported',
            parts: { create: ensureDefaultSlides(track.title, rawParts) },
          },
          include: { parts: true },
        });
        created.push({ id: song.id, title: song.title });
      } catch (err: any) {
        failed.push({ title: track.title, artist: track.artist, error: err.message });
      }
    }

    res.json({ created, duplicates, failed, createdCount: created.length, duplicatesCount: duplicates.length, failedCount: failed.length });
  } catch (err: any) {
    console.error('Batch import error:', err);
    res.status(500).json({ error: err.message || 'Error importing songs' });
  }
});

// B4a: Export single song as PPTX
app.get('/api/export/pptx/song/:id', requireApiKey, externalLimiter, async (req, res) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params.id },
      include: { parts: { orderBy: { order: 'asc' } } },
    });
    if (!song) return res.status(404).json({ error: 'Canción no encontrada' });

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'Urban Proyecta';

    // Title slide
    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: '1a1a2e' };
    titleSlide.addText(song.title, {
      x: 0.5, y: 2, w: 9, h: 2,
      fontSize: 36,
      color: 'FFFFFF',
      fontFace: song.themeFontFamily || 'Arial',
      align: 'center',
      valign: 'middle',
      bold: true,
    });

    song.parts.forEach(part => {
      const slide = pptx.addSlide();

      if (song.themeBgType === 'COLOR' && song.themeBgValue) {
        slide.background = { color: song.themeBgValue.replace('#', '') };
      } else if (song.themeBgType === 'IMAGE' && song.themeBgValue) {
        slide.background = { path: song.themeBgValue };
      } else {
        slide.background = { color: '1a1a2e' };
      }

      slide.addText(part.content, {
        x: 0.5, y: 0.8, w: 9, h: 4.8,
        fontSize: (song.themeFontSize || 1.0) * 18,
        color: song.themeFontColor || 'FFFFFF',
        fontFace: song.themeFontFamily || 'Arial',
        align: 'center',
        valign: 'middle',
        lineSpacing: 28,
      });
    });

    // Black separator slide
    const sepSlide = pptx.addSlide();
    sepSlide.background = { color: '000000' };

    const buffer = await pptx.stream();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="cancion.pptx"');
    res.send(buffer);
  } catch (err) {
    console.error('PPTX song export error:', err);
    res.status(500).json({ error: 'Error generating PPTX' });
  }
});

// B4b: Export full service as PPTX
app.get('/api/export/pptx/service/:id', requireApiKey, externalLimiter, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            song: { include: { parts: { orderBy: { order: 'asc' } } } },
            deck: { include: { slides: { orderBy: { order: 'asc' } } } },
            mediaAsset: true,
            verse: true,
          },
        },
      },
    });
    if (!service) return res.status(404).json({ error: 'Reunión no encontrada' });

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'Urban Proyecta';

    const df = {
      fontFamily: service.fontFamily || 'Arial',
      fontColor: service.fontColor || 'FFFFFF',
      fontSize: service.fontSize || 1.0,
      bgType: service.bgType,
      bgValue: service.bgValue,
    };

    const setBg = (slide: any, bgType?: string | null, bgValue?: string | null) => {
      if (bgType === 'COLOR' && bgValue) {
        slide.background = { color: bgValue.replace('#', '') };
      } else if (bgType === 'IMAGE' && bgValue) {
        slide.background = { path: bgValue };
      } else {
        slide.background = { color: '1a1a2e' };
      }
    };

    const typeLabels: Record<string, string> = {
      SONG: 'Canción',
      DECK: 'Diapositivas',
      MEDIA: 'Multimedia',
      VERSE: 'Versículo',
      ANNOUNCEMENT: 'Anuncio',
    };

    const getItemName = (item: any): string => {
      if (item.type === 'SONG') return item.song?.title || 'Canción';
      if (item.type === 'DECK') return item.deck?.title || 'Diapositivas';
      if (item.type === 'MEDIA') return item.mediaAsset?.title || item.title || 'Multimedia';
      if (item.type === 'VERSE') return item.verse?.reference || item.title || 'Versículo';
      return item.title || typeLabels[item.type] || item.type;
    };

    let first = true;
    for (const item of service.items) {
      if (!first && item.type !== 'SONG') {
        const sep = pptx.addSlide();
        setBg(sep, df.bgType, df.bgValue);
        sep.addText(typeLabels[item.type] || item.type, {
          x: 0.5, y: 1.5, w: 9, h: 0.5,
          fontSize: 14, color: df.fontColor, fontFace: df.fontFamily,
          align: 'center', bold: true, transparency: 50,
        });
        sep.addText(getItemName(item), {
          x: 0.5, y: 2.2, w: 9, h: 1.5,
          fontSize: df.fontSize * 24, color: df.fontColor, fontFace: df.fontFamily,
          align: 'center', valign: 'middle', bold: true,
        });
      }
      first = false;

      if (item.type === 'SONG' && item.song) {
        const s = item.song;

        // Title slide
        const titleSlide = pptx.addSlide();
        titleSlide.background = { color: '1a1a2e' };
        titleSlide.addText(s.title, {
          x: 0.5, y: 2, w: 9, h: 2,
          fontSize: 36,
          color: 'FFFFFF',
          fontFace: s.themeFontFamily || df.fontFamily,
          align: 'center',
          valign: 'middle',
          bold: true,
        });

        for (const part of s.parts) {
          const slide = pptx.addSlide();
          setBg(slide, s.themeBgType, s.themeBgValue);
          slide.addText(part.content, {
            x: 0.5, y: 0.8, w: 9, h: 4.8,
            fontSize: (s.themeFontSize || df.fontSize) * 18,
            color: s.themeFontColor || df.fontColor,
            fontFace: s.themeFontFamily || df.fontFamily,
            align: 'center', valign: 'middle', lineSpacing: 28,
          });
        }

        // Black separator slide
        const sepSlide = pptx.addSlide();
        sepSlide.background = { color: '000000' };
      } else if (item.type === 'DECK' && item.deck) {
        const d = item.deck;
        for (const ds of d.slides) {
          const slide = pptx.addSlide();

          if (ds.bgColor) {
            slide.background = { color: ds.bgColor.replace('#', '') };
          } else if (ds.bgImageUrl) {
            slide.background = { path: ds.bgImageUrl };
          } else if (ds.bgVideoUrl) {
            slide.background = { color: '1a1a2e' };
          } else {
            setBg(slide, df.bgType, df.bgValue);
          }

          const layout = ds.layout || 'CENTER';
          let textX = 0.5, textW = 9, textAlign: string = 'center';
          if (layout === 'LEFT') { textAlign = 'left'; }
          if (layout === 'SPLIT') { textX = 0.5; textW = 4.5; textAlign = 'left'; }

          if (ds.text) {
            slide.addText(ds.text, {
              x: textX, y: layout === 'SPLIT' ? 0.5 : 1.0, w: textW, h: layout === 'SPLIT' ? 4.5 : 3.5,
              fontSize: ds.fontSize || Math.round(df.fontSize * 18),
              color: ds.fontColor || df.fontColor,
              fontFace: df.fontFamily,
              align: textAlign as any,
              valign: 'middle',
              lineSpacing: 28,
            });
          }

          let layers: any[] = [];
          try { layers = JSON.parse(ds.layers || '[]'); } catch { /* ignore */ }
          for (const layer of layers) {
            if (layer.url) {
              slide.addImage({
                path: layer.url,
                x: layer.x || 0, y: layer.y || 0,
                w: layer.w || 2, h: layer.h || 2,
              });
            }
          }
        }
      } else if (item.type === 'MEDIA') {
        const asset = item.mediaAsset;
        const assetUrl = asset?.url || item.mediaUrl;
        const assetType = asset?.type || item.mediaType;
        const assetTitle = asset?.title || item.title || 'Multimedia';

        const slide = pptx.addSlide();
        setBg(slide, df.bgType, df.bgValue);

        slide.addText(assetTitle, {
          x: 0.5, y: 0.3, w: 9, h: 0.5,
          fontSize: 14, color: df.fontColor, fontFace: df.fontFamily,
          align: 'center', bold: true,
        });

        if (assetType === 'IMAGE' && assetUrl) {
          slide.addImage({
            path: assetUrl,
            x: 1.0, y: 1.2, w: 8, h: 4.0,
            sizing: { type: 'contain', w: 8, h: 4.0 },
          });
        } else if (assetType === 'VIDEO') {
          slide.addText(`Video: ${assetTitle}`, {
            x: 1.0, y: 1.5, w: 8, h: 3.0,
            fontSize: df.fontSize * 18, color: df.fontColor, fontFace: df.fontFamily,
            align: 'center', valign: 'middle',
          });
        } else if (assetUrl) {
          slide.addImage({
            path: assetUrl,
            x: 1.0, y: 1.2, w: 8, h: 4.0,
            sizing: { type: 'contain', w: 8, h: 4.0 },
          });
        }
      } else if (item.type === 'VERSE') {
        const slide = pptx.addSlide();
        setBg(slide, df.bgType, df.bgValue);
        const ref = item.verse?.reference || item.title || 'Versículo';
        const text = item.verse?.text || '';
        slide.addText(ref, {
          x: 0.5, y: 0.3, w: 9, h: 0.5,
          fontSize: 14, color: df.fontColor, fontFace: df.fontFamily,
          align: 'center', bold: true,
        });
        if (text) {
          slide.addText(text, {
            x: 0.5, y: 1.2, w: 9, h: 4.0,
            fontSize: df.fontSize * 18, color: df.fontColor, fontFace: df.fontFamily,
            align: 'center', valign: 'middle', lineSpacing: 32,
          });
        }
      } else {
        const slide = pptx.addSlide();
        setBg(slide, df.bgType, df.bgValue);
        const title = item.title || getItemName(item);
        slide.addText(title, {
          x: 0.5, y: 1.5, w: 9, h: 2.5,
          fontSize: df.fontSize * 24, color: df.fontColor, fontFace: df.fontFamily,
          align: 'center', valign: 'middle', bold: true,
        });
      }
    }

    const buffer = await pptx.stream();
    const safeName = service.name.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ \-_]/g, '').replace(/\s+/g, '_').slice(0, 100) || 'reunion';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pptx"`);
    res.send(buffer);
  } catch (err) {
    console.error('PPTX service export error:', err);
    res.status(500).json({ error: 'Error generating PPTX' });
  }
});

// B4: Export all songs + services as JSON backup
app.get('/api/export', requireApiKey, externalLimiter, async (_req, res) => {
  try {
    const [songs, services] = await Promise.all([
      prisma.song.findMany({ include: { parts: { orderBy: { order: 'asc' } } } }),
      prisma.service.findMany({
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: { song: { include: { parts: true } }, deck: { include: { slides: true } }, mediaAsset: true },
          },
        },
        orderBy: { date: 'desc' },
      }),
    ]);
    res.json({ exportedAt: new Date().toISOString(), version: 1, songs, services });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// B6: Metrics endpoint
app.get('/api/metrics', (_req, res) => {
  const uptime = Math.floor((Date.now() - metrics.serverStartedAt.getTime()) / 1000);
  res.json({
    uptimeSeconds: uptime,
    uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
    displaysConnected: 0, // populated from socket state
    slidesProjected: metrics.slidesProjected,
    styleChanges: metrics.styleChanges,
    displayConnects: metrics.displayConnects,
    displayDisconnects: metrics.displayDisconnects,
  });
});

// B3: Room history and rollback
app.get('/api/rooms/:roomId/history', async (req, res) => {
  try {
    const state = await defaultRoomManager.getRoomState(req.params.roomId);
    const history = (() => { try { return JSON.parse((state as any).history || '[]'); } catch { return []; } })();
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rooms/:roomId/rollback', requireApiKey, writeLimiter, async (req, res) => {
  try {
    const { version } = req.body;
    if (!version) return res.status(400).json({ error: 'version required' });
    const newState = await defaultRoomManager.rollbackToVersion(req.params.roomId, version);
    if (!newState) return res.status(404).json({ error: 'version not found in history' });
    ioInstance?.to(req.params.roomId).emit('room_state', { state: newState });
    res.json({ success: true, version: newState.version });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

setupSockets(io);
ioInstance = io;

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// Stage: optimized endpoint to get all data for a service in one call
app.get('/api/stage/service/:id', async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            song: { include: { parts: { orderBy: { order: 'asc' } } } },
            deck: { include: { slides: { orderBy: { order: 'asc' } } } },
            mediaAsset: true,
          },
        },
      },
    });

    if (!service) return res.status(404).json({ error: 'Reunión no encontrada' });

    // Hash incluye cambios en canciones/decks ademas del servicio
    let latestSongUpdate: number | null = null;
    let latestDeckUpdate: number | null = null;
    for (const item of service.items) {
      if (item.song?.updatedAt) {
        const t = item.song.updatedAt.getTime();
        if (latestSongUpdate === null || t > latestSongUpdate) {
          latestSongUpdate = t;
        }
      }
      if (item.deck?.updatedAt) {
        const t = item.deck.updatedAt.getTime();
        if (latestDeckUpdate === null || t > latestDeckUpdate) {
          latestDeckUpdate = t;
        }
      }
    }
    const hash = Buffer.from(JSON.stringify({
      serviceUpdatedAt: service.updatedAt,
      itemCount: service.items.length,
      latestSongUpdate,
      latestDeckUpdate,
    })).toString('base64').slice(0, 12);

    res.json({ service, items: service.items, _hash: hash });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error cargando reunión' });
  }
});

// ─── Stage: perfiles de músicos y anotaciones personales ───
function safeParseJson(str: string | null | undefined, fallback: any) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// Listar perfiles (sin exponer el PIN, solo si tiene uno)
app.get('/api/stage/profiles', async (req, res) => {
  try {
    const profiles = await prisma.singerProfile.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, pin: true },
    });
    res.json(profiles.map((p) => ({ id: p.id, name: p.name, hasPin: !!p.pin })));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error cargando perfiles' });
  }
});

// Crear perfil
// SEC: /api/stage/* endpoints intentionally stay open without the admin API key —
// they're a self-service feature for singers to create their own profile (gated by
// their own 4-digit PIN, verified below) and jot personal notes. They still get
// rate-limited so a random visitor can't spam-create profiles or annotations.
app.post('/api/stage/profiles', writeLimiter, async (req, res) => {
  try {
    const { name, pin } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nombre requerido' });
    const cleanPin = typeof pin === 'string' && /^\d{4}$/.test(pin) ? pin : null;
    const profile = await prisma.singerProfile.create({
      data: { name: String(name).trim(), pin: cleanPin },
    });
    res.status(201).json({ id: profile.id, name: profile.name, hasPin: !!profile.pin });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error creando perfil' });
  }
});

// Verificar PIN para reclamar un perfil en otro dispositivo
app.post('/api/stage/profiles/:id/verify', rateLimit(20, 60_000), async (req, res) => {
  try {
    const { pin } = req.body;
    const profile = await prisma.singerProfile.findUnique({ where: { id: req.params.id } });
    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });
    if (profile.pin && profile.pin !== pin) return res.status(403).json({ error: 'PIN incorrecto' });
    res.json({ id: profile.id, name: profile.name, hasPin: !!profile.pin });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error verificando perfil' });
  }
});

// Todas las anotaciones de un cantante para una reunión + tonos grupales
app.get('/api/stage/annotations', async (req, res) => {
  try {
    const { profileId, serviceId } = req.query as { profileId?: string; serviceId?: string };
    if (!profileId || !serviceId) return res.status(400).json({ error: 'profileId y serviceId requeridos' });
    const [rows, keys] = await Promise.all([
      prisma.stageAnnotation.findMany({ where: { profileId, serviceId } }),
      prisma.serviceSongMeta.findMany({ where: { serviceId } }),
    ]);
    res.json({
      annotations: rows.map((r) => ({
        songId: r.songId,
        role: r.role,
        note: r.note,
        parts: safeParseJson(r.parts, {}),
        updatedAt: r.updatedAt,
      })),
      songKeys: Object.fromEntries(keys.map((k) => [k.songId, k.keyLabel])),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error cargando anotaciones' });
  }
});

// Guardar (upsert) la anotación de una canción para un cantante
app.put('/api/stage/annotations', writeLimiter, async (req, res) => {
  try {
    const { profileId, serviceId, songId, role, note, parts } = req.body;
    if (!profileId || !serviceId || !songId) {
      return res.status(400).json({ error: 'profileId, serviceId y songId requeridos' });
    }
    const partsJson = typeof parts === 'string' ? parts : JSON.stringify(parts ?? {});
    const row = await prisma.stageAnnotation.upsert({
      where: { profileId_serviceId_songId: { profileId, serviceId, songId } },
      create: { profileId, serviceId, songId, role: role ?? null, note: note ?? null, parts: partsJson },
      update: { role: role ?? null, note: note ?? null, parts: partsJson },
    });
    res.json({
      songId: row.songId,
      role: row.role,
      note: row.note,
      parts: safeParseJson(row.parts, {}),
      updatedAt: row.updatedAt,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error guardando anotación' });
  }
});

// Guardar (upsert) el tono grupal de una canción para la reunión
app.put('/api/stage/song-key', writeLimiter, async (req, res) => {
  try {
    const { serviceId, songId, keyLabel } = req.body;
    if (!serviceId || !songId) return res.status(400).json({ error: 'serviceId y songId requeridos' });
    const clean = typeof keyLabel === 'string' && keyLabel.trim() ? keyLabel.trim().slice(0, 12) : null;
    const row = await prisma.serviceSongMeta.upsert({
      where: { serviceId_songId: { serviceId, songId } },
      create: { serviceId, songId, keyLabel: clean },
      update: { keyLabel: clean },
    });
    res.json({ songId: row.songId, keyLabel: row.keyLabel });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error guardando tono' });
  }
});

httpServer.listen(port, () => {
  console.log(`Urban Proyecta Backend running on port ${port}`);
});
