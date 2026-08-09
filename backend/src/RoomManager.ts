import { PrismaClient, RoomSnapshot } from '@prisma/client';

export const prisma = new PrismaClient();

// B6: Métricas
export const metrics = {
  serverStartedAt: new Date(),
  slidesProjected: 0,
  styleChanges: 0,
  displayConnects: 0,
  displayDisconnects: 0,
};

export class RoomManager {
  private rooms: Map<string, RoomSnapshot> = new Map();

  async getRoomState(roomId: string): Promise<RoomSnapshot> {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }
    
    let state: RoomSnapshot | null = null;
    
    try {
      let retries = 3;
      while (retries > 0) {
        try {
          state = await prisma.roomSnapshot.findUnique({ where: { id: roomId } });
          break;
        } catch (e) {
          retries--;
          if (retries === 0) throw e;
          await new Promise(res => setTimeout(res, 1500));
        }
      }

      if (!state) {
        state = await prisma.roomSnapshot.create({
          data: {
            id: roomId,
            slides: "[]",
            playlist: "[]",
            history: "[]",
          } as any
        });
      }
    } catch (err) {
      console.error(`Error conectando a BD para sala ${roomId}:`, err);
      state = {
        id: roomId, songId: null, title: null, slideIndex: 0,
        slides: "[]", fontScale: 1.0, theme: "dark",
        bgType: null, bgValue: null, fontFamily: null,
        fontColor: null, fontSize: null, blackout: false, version: 1,
        activeServiceId: null, playlist: "[]", history: "[]", updatedAt: new Date()
      } as any;
    }
    
    this.rooms.set(roomId, state!);
    return state!;
  }

  async updateState(roomId: string, partial: Partial<RoomSnapshot>): Promise<RoomSnapshot> {
    const currentState = await this.getRoomState(roomId);
    
    // B3: Push current state snapshot to history before updating
    const history: any[] = (() => { try { return JSON.parse((currentState as any).history || '[]'); } catch { return []; } })();
    history.unshift({
      version: currentState.version,
      timestamp: new Date().toISOString(),
      songId: currentState.songId,
      title: currentState.title,
      slideIndex: currentState.slideIndex,
      slides: currentState.slides,
      fontFamily: currentState.fontFamily,
      fontColor: currentState.fontColor,
      fontSize: currentState.fontSize,
      bgType: currentState.bgType,
      bgValue: currentState.bgValue,
      theme: currentState.theme,
    });
    // Keep last 10 entries
    const trimmedHistory = history.slice(0, 10);
    
    // B6: Track slides projected
    if (partial.slides !== undefined) metrics.slidesProjected++;

    const newState = {
      ...currentState,
      ...partial,
      history: JSON.stringify(trimmedHistory),
      version: currentState.version + 1,
      updatedAt: new Date()
    };
    
    this.rooms.set(roomId, newState);

    prisma.roomSnapshot.update({
      where: { id: roomId },
      data: newState as any
    }).catch(err => console.error("Prisma update error:", err));

    return newState;
  }

  // B3: Rollback to a specific history version
  async rollbackToVersion(roomId: string, targetVersion: number): Promise<RoomSnapshot | null> {
    const state = await this.getRoomState(roomId);
    const history: any[] = (() => { try { return JSON.parse((state as any).history || '[]'); } catch { return []; } })();
    const entry = history.find((h: any) => h.version === targetVersion);
    if (!entry) return null;

    return this.updateState(roomId, {
      songId: entry.songId,
      title: entry.title,
      slideIndex: entry.slideIndex,
      slides: entry.slides,
      fontFamily: entry.fontFamily,
      fontColor: entry.fontColor,
      fontSize: entry.fontSize,
      bgType: entry.bgType,
      bgValue: entry.bgValue,
    } as any);
  }
}

export const defaultRoomManager = new RoomManager();
