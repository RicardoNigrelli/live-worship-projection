import { Server, Socket } from 'socket.io';
import z from 'zod';
import { defaultRoomManager, prisma, metrics } from './RoomManager';

const SetSongSchema = z.object({
  room: z.string(),
  songId: z.string(),
  title: z.string(),
  slides: z.array(z.string().transform(s => sanitizeSlide(s))),
  slideIndex: z.number().int().nonnegative().optional(),
  playlist: z.array(z.any()).optional(),
  fontFamily: z.string().optional().nullable(),
  fontColor: z.string().optional().nullable(),
  fontSize: z.number().optional().nullable(),
  bgType: z.string().optional().nullable(),
  bgValue: z.string().optional().nullable(),
});

const SetStyleSchema = z.object({
  room: z.string(),
  fontFamily: z.string().optional().nullable(),
  fontColor: z.string().optional().nullable(),
  fontSize: z.number().optional().nullable(),
  bgType: z.string().optional().nullable(),
  bgValue: z.string().optional().nullable(),
});

const VideoControlSchema = z.object({
  room: z.string(),
  playing: z.boolean(),
  currentTime: z.number().optional(),
  volume: z.number().optional(),
});

function decodeSlideEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseStructuredSlide(str: string): any | null {
  try {
    return JSON.parse(str);
  } catch {
    try {
      return JSON.parse(decodeSlideEntities(str));
    } catch {
      return null;
    }
  }
}

// B5: Basic XSS prevention - escape HTML entities in lyric content.
// Structured media/deck slides must stay valid JSON so the display can render them.
function sanitizeSlide(str: string): string {
  const parsed = parseStructuredSlide(str);
  if (parsed?.type === 'MEDIA_SLIDE' || parsed?.type === 'DECK_SLIDE') {
    return JSON.stringify(parsed);
  }

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// B2: Rate limit debounce map for set_style per room
const styleDebounceMap = new Map<string, NodeJS.Timeout>();

// SEC: Operator control (set_song, set_style, slide navigation, blackout, video controls, etc.)
// requires the client to have joined with role "operator" AND the correct OPERATOR_PIN.
// "display" clients (the projector view) are read-only and never need the pin.
const OPERATOR_PIN = process.env.OPERATOR_PIN;

function isAuthedOperator(socket: Socket): boolean {
  return (socket as any)._isOperator === true;
}

function requireOperator(socket: Socket): boolean {
  if (isAuthedOperator(socket)) return true;
  socket.emit('error', { message: 'No autorizado: se requiere rol de operador con PIN válido', code: 'UNAUTHORIZED' });
  return false;
}

// SEC: Very small per-socket rate limiter for mutating events, so a single client
// can't flood a room with writes (e.g. set_song / set_style spam).
const socketEventBuckets = new WeakMap<Socket, Map<string, { count: number; resetAt: number }>>();
function socketRateLimited(socket: Socket, event: string, maxPerWindow = 20, windowMs = 10_000): boolean {
  let buckets = socketEventBuckets.get(socket);
  if (!buckets) {
    buckets = new Map();
    socketEventBuckets.set(socket, buckets);
  }
  const now = Date.now();
  const bucket = buckets.get(event);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(event, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (bucket.count >= maxPerWindow) return true;
  bucket.count++;
  return false;
}

export function setupSockets(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join_room', async (data: { role: string; room: string; pin?: string }) => {
      const { role, room, pin } = data;

      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room} as ${role}`);

      // B6: Track display connections
      if (role === 'display') {
        metrics.displayConnects++;
        (socket as any)._displayRole = true;
      }

      // SEC: Only grant operator (write) privileges if the pin matches OPERATOR_PIN.
      // If OPERATOR_PIN isn't configured server-side, nobody gets operator privileges
      // (fail closed) rather than silently trusting the client-supplied role.
      if (role === 'operator') {
        if (OPERATOR_PIN && pin === OPERATOR_PIN) {
          (socket as any)._isOperator = true;
        } else {
          socket.emit('error', { message: 'PIN de operador inválido', code: 'INVALID_PIN' });
        }
      }

      const state = await defaultRoomManager.getRoomState(room);
      socket.emit('room_state', { state });

      const roomClients = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('display_count_updated', { count: roomClients });
    });

    socket.on('request_state', async (data: { room: string }) => {
      const state = await defaultRoomManager.getRoomState(data.room);
      socket.emit('room_state', { state });
    });

    socket.on('set_song', async (data: unknown) => {
      if (!requireOperator(socket)) return;
      if (socketRateLimited(socket, 'set_song')) {
        socket.emit('error', { message: 'Demasiadas solicitudes, esperá unos segundos', code: 'RATE_LIMITED' });
        return;
      }
      try {
        const payload = SetSongSchema.parse(data);

        // Fetch song style from DB
        let songStyle: any = null;
        try {
          songStyle = await prisma.song.findUnique({
            where: { id: payload.songId },
            select: { themeFontFamily: true, themeFontColor: true, themeFontSize: true, themeBgType: true, themeBgValue: true }
          });
        } catch {}

        // Get current state to find active service
        const currentState = await defaultRoomManager.getRoomState(payload.room);
        let serviceStyle: any = null;
        if (currentState.activeServiceId) {
          try {
            serviceStyle = await prisma.service.findUnique({
              where: { id: currentState.activeServiceId },
              select: { fontFamily: true, fontColor: true, fontSize: true, bgType: true, bgValue: true }
            });
          } catch {}
        }

        // Merge: service defaults → song overrides → explicit payload overrides
        const mergedFontFamily = payload.fontFamily !== undefined ? payload.fontFamily : (songStyle?.themeFontFamily || serviceStyle?.fontFamily || null);
        const mergedFontColor = payload.fontColor !== undefined ? payload.fontColor : (songStyle?.themeFontColor || serviceStyle?.fontColor || null);
        const mergedFontSize = payload.fontSize !== undefined ? payload.fontSize : (songStyle?.themeFontSize || serviceStyle?.fontSize || null);
        const mergedBgType = payload.bgType !== undefined ? payload.bgType : (songStyle?.themeBgType || serviceStyle?.bgType || null);
        const mergedBgValue = payload.bgValue !== undefined ? payload.bgValue : (songStyle?.themeBgValue || serviceStyle?.bgValue || null);

        const partial: Record<string, any> = {
          songId: payload.songId,
          title: payload.title,
          slides: JSON.stringify(payload.slides),
          slideIndex: Math.min(payload.slideIndex ?? 0, Math.max(0, payload.slides.length - 1)),
          fontFamily: mergedFontFamily,
          fontColor: mergedFontColor,
          fontSize: mergedFontSize,
          bgType: mergedBgType,
          bgValue: mergedBgValue,
        };
        // B1: Persist playlist for restoration on reconnect
        if (payload.playlist) {
          partial.playlist = JSON.stringify(payload.playlist);
        }
        const newState = await defaultRoomManager.updateState(payload.room, partial);
        io.to(payload.room).emit('state_updated', { partialState: newState, version: newState.version });
      } catch (err) {
        socket.emit('error', { message: 'Payload inválido', code: 'BAD_REQUEST' });
      }
    });

    socket.on('set_style', async (data: unknown) => {
      if (!requireOperator(socket)) return;
      try {
        const payload = SetStyleSchema.parse(data);
        // B2: Debounce — accumulate changes per room, apply after 300ms
        if (styleDebounceMap.has(payload.room)) {
          clearTimeout(styleDebounceMap.get(payload.room)!);
        }
        styleDebounceMap.set(payload.room, setTimeout(async () => {
          styleDebounceMap.delete(payload.room);
          metrics.styleChanges++;
          const partial: Record<string, any> = {};
          if (payload.fontFamily !== undefined) partial.fontFamily = payload.fontFamily;
          if (payload.fontColor !== undefined) partial.fontColor = payload.fontColor;
          if (payload.fontSize !== undefined) partial.fontSize = payload.fontSize;
          if (payload.bgType !== undefined) partial.bgType = payload.bgType;
          if (payload.bgValue !== undefined) partial.bgValue = payload.bgValue;
          const newState = await defaultRoomManager.updateState(payload.room, partial);
          io.to(payload.room).emit('state_updated', { partialState: newState, version: newState.version });
        }, 300));
      } catch (err) {
        socket.emit('error', { message: 'Payload inválido', code: 'BAD_REQUEST' });
      }
    });

    socket.on('reset_style', async (data: { room: string }) => {
      if (!requireOperator(socket)) return;
      const newState = await defaultRoomManager.updateState(data.room, {
        fontFamily: null,
        fontColor: null,
        fontSize: null,
        bgType: null,
        bgValue: null,
      });
      io.to(data.room).emit('state_updated', { partialState: newState, version: newState.version });
    });

    socket.on('set_service_id', async (data: { room: string; serviceId: string | null }) => {
      if (!requireOperator(socket)) return;
      try {
        await defaultRoomManager.updateState(data.room, { activeServiceId: data.serviceId } as any);
      } catch (err) {
        console.error('set_service_id error', err);
      }
    });

    socket.on('next_slide', async (data: { room: string }) => {
      if (!requireOperator(socket)) return;
      const state = await defaultRoomManager.getRoomState(data.room);
      const slides = JSON.parse(state.slides);
      if (state.slideIndex < slides.length - 1) {
        const newState = await defaultRoomManager.updateState(data.room, { slideIndex: state.slideIndex + 1 });
        io.to(data.room).emit('state_updated', { partialState: { slideIndex: newState.slideIndex }, version: newState.version });
      }
    });

    socket.on('prev_slide', async (data: { room: string }) => {
      if (!requireOperator(socket)) return;
      const state = await defaultRoomManager.getRoomState(data.room);
      if (state.slideIndex > 0) {
        const newState = await defaultRoomManager.updateState(data.room, { slideIndex: state.slideIndex - 1 });
        io.to(data.room).emit('state_updated', { partialState: { slideIndex: newState.slideIndex }, version: newState.version });
      }
    });

    socket.on('go_to_slide', async (data: { room: string; index: number }) => {
      if (!requireOperator(socket)) return;
      const state = await defaultRoomManager.getRoomState(data.room);
      const slides = JSON.parse(state.slides);
      if (data.index >= 0 && data.index < slides.length) {
        const newState = await defaultRoomManager.updateState(data.room, { slideIndex: data.index });
        io.to(data.room).emit('state_updated', { partialState: { slideIndex: newState.slideIndex }, version: newState.version });
      }
    });

    // Video sync controls
    socket.on('video_play', async (data: { room: string }) => {
      if (!requireOperator(socket)) return;
      io.to(data.room).emit('video_play', { room: data.room });
    });

    socket.on('video_pause', async (data: { room: string }) => {
      if (!requireOperator(socket)) return;
      io.to(data.room).emit('video_pause', { room: data.room });
    });

    socket.on('video_seek', async (data: { room: string; currentTime: number }) => {
      if (!requireOperator(socket)) return;
      io.to(data.room).emit('video_seek', { room: data.room, currentTime: data.currentTime });
    });

    socket.on('video_volume', async (data: { room: string; volume: number }) => {
      if (!requireOperator(socket)) return;
      io.to(data.room).emit('video_volume', { room: data.room, volume: data.volume });
    });

    socket.on('video_stop', async (data: { room: string }) => {
      if (!requireOperator(socket)) return;
      io.to(data.room).emit('video_stop', { room: data.room });
    });

    socket.on('display_heartbeat', async (data: { room: string; playing: boolean; currentTime: number; error?: string }) => {
      // Forward heartbeat to operator (not back to all displays)
      socket.to(data.room).emit('display_heartbeat', {
        playing: data.playing,
        currentTime: data.currentTime,
        error: data.error || null,
      });
    });

    socket.on('toggle_blackout', async (data: { room: string; blackout: boolean }) => {
      if (!requireOperator(socket)) return;
      const newState = await defaultRoomManager.updateState(data.room, { blackout: data.blackout });
      io.to(data.room).emit('state_updated', { partialState: { blackout: newState.blackout }, version: newState.version });
    });

    socket.on('discount_display', (room: string) => {
      socket.leave(room);
      const roomClients = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('display_count_updated', { count: roomClients });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      if ((socket as any)._displayRole) metrics.displayDisconnects++;
    });
  });
}
