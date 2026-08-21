'use client';
import { useEffect, useState, Suspense, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProyectaStore } from '../store/useProyectaStore';
import MediaSlide from '../components/MediaSlide';
import ScreenCanvas from '../components/ScreenCanvas';
function decodeSlideEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseStructuredSlide(value: string) {
  if (!value?.startsWith('{')) return null;
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(decodeSlideEntities(value));
    } catch {
      return null;
    }
  }
}

function DisplayContent() {
  const searchParams = useSearchParams();
  const room = searchParams.get('room') || 'default';

  const connect = useProyectaStore((s) => s.connect);
  const state = useProyectaStore((s) => s.state);
  const isConnected = useProyectaStore((s) => s.isConnected);
  const socket = useProyectaStore((s) => s.socket);
  const isVideoPlaying = useProyectaStore((s) => s.isVideoPlaying);
  const videoSeekTime = useProyectaStore((s) => s.videoSeekTime);
  const remoteVolume = useProyectaStore((s) => s.remoteVolume);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);

  // Parse current slide for media or deck data
  const slides = state?.slides ? JSON.parse(state.slides) : [];
  const rawSlide = slides[state?.slideIndex ?? 0] || '';
  let mediaData: any = null;
  let deckSlideData: any = null;
  let currentSlideText = rawSlide;
  const parsedSlide = parseStructuredSlide(rawSlide);
  if (parsedSlide?.type === 'MEDIA_SLIDE') {
    mediaData = parsedSlide;
    currentSlideText = '';
  } else if (parsedSlide?.type === 'DECK_SLIDE') {
    deckSlideData = parsedSlide;
    currentSlideText = parsedSlide.text || '';
  }

  const isVideoSlide = !!(mediaData && mediaData.mediaType === 'VIDEO');
  const videoUrl = mediaData?.url || '';

  useEffect(() => {
    setHasVideo(!!isVideoSlide);
    setAutoplayFailed(false);
  }, [isVideoSlide]);

  // Send heartbeat every 3 seconds
  useEffect(() => {
    if (!socket || !room || !isVideoSlide) return;
    
    const sendHeartbeat = () => {
      const video = videoRef.current;
      if (!video) return;
      socket.emit('display_heartbeat', {
        room,
        playing: !video.paused,
        currentTime: video.currentTime,
        error: autoplayFailed ? 'Autoplay blocked — click to enable' : undefined,
      });
    };

    // Send immediately, then every 3s
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 3000);
    return () => clearInterval(interval);
  }, [socket, room, isVideoSlide, autoplayFailed]);

  const playWithSound = useCallback(async (video: HTMLVideoElement) => {
    try {
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 150));
      video.muted = false;
      if (remoteVolume !== null) {
        video.volume = remoteVolume;
      }
      setAutoplayFailed(false);
    } catch (err) {
      console.warn('Display autoplay failed:', err);
      setAutoplayFailed(true);
    }
  }, [remoteVolume]);

  // Direct socket listeners for video control
  useEffect(() => {
    if (!socket) return;

    const video = videoRef.current;
    if (!video || !isVideoSlide) return;

    const handlePlay = () => {
      playWithSound(video);
    };

    const handlePause = () => {
      video.pause();
    };

    const handleSeek = (payload: { currentTime: number }) => {
      video.currentTime = payload.currentTime;
    };

    const handleVolume = (payload: { volume: number }) => {
      video.volume = payload.volume;
    };

    const handleStop = () => {
      video.pause();
      video.currentTime = 0;
    };

    socket.on('video_play', handlePlay);
    socket.on('video_pause', handlePause);
    socket.on('video_seek', handleSeek);
    socket.on('video_volume', handleVolume);
    socket.on('video_stop', handleStop);

    return () => {
      socket.off('video_play', handlePlay);
      socket.off('video_pause', handlePause);
      socket.off('video_seek', handleSeek);
      socket.off('video_volume', handleVolume);
      socket.off('video_stop', handleStop);
    };
  }, [socket, isVideoSlide, videoUrl, playWithSound]);

  // Auto-play when video source changes and audio is already enabled
  useEffect(() => {
    if (!audioEnabled || !isVideoSlide) return;
    const video = videoRef.current;
    if (!video) return;
    // Short delay to let the new source load
    const timer = setTimeout(() => {
      if (isVideoPlaying) {
        playWithSound(video);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [videoUrl, audioEnabled, isVideoSlide, isVideoPlaying]);

  useEffect(() => {
    setMounted(true);
    if (!socket) {
      connect(room, 'display');
    }
  }, [room, socket, connect]);

  const handleEnableAudio = () => {
    setAudioEnabled(true);
    setAutoplayFailed(false);
    const video = videoRef.current;
    if (video && isVideoSlide) {
      // Try to play immediately on user gesture (always works)
      video.volume = remoteVolume !== null ? remoteVolume : 1;
      video.play().catch(() => {});
    }
  };

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <div className="bg-black min-h-screen w-full transition-colors duration-700 flex flex-col justify-center items-center p-4 gap-6">
        <span className="text-white/15 font-headline font-black text-[6vw] uppercase tracking-widest select-none">Urban</span>
        <div className="text-white/40 text-xs font-headline font-bold uppercase tracking-widest animate-pulse">Esperando señal de conexión...</div>
        <div className="text-white/25 text-[10px] uppercase tracking-widest mt-4">
          Esta es la pantalla de proyección en vivo — para ver el panel de administración:{' '}
          <Link href="/dashboard/login" className="text-white/60 underline hover:text-white/90">
            entrar al dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-full flex items-center justify-center overflow-hidden relative
      ${state?.theme === 'light' ? 'bg-surface' : 'bg-black'}
    `}>
      {/* Click overlay to enable audio — shown when autoplay is blocked */}
      {!audioEnabled && hasVideo && (
        <div
          className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center cursor-pointer"
          onClick={handleEnableAudio}
        >
          <span className="material-symbols-outlined text-white text-6xl mb-4">volume_up</span>
          <p className="text-white font-headline font-bold text-lg uppercase tracking-widest">Click para habilitar audio</p>
          <p className="text-white/60 text-sm mt-2 font-body">Se requiere interacción para reproducir con sonido</p>
        </div>
      )}

      <ScreenCanvas
        state={state ?? undefined}
        deckSlideData={deckSlideData}
        text={currentSlideText}
        className="max-h-full"
      >
        {isVideoSlide ? (
          <div className="absolute inset-0 z-10">
            <video
              ref={videoRef}
              key={videoUrl}
              src={videoUrl}
              loop
              playsInline
              preload="auto"
              className="w-full h-full object-cover"
            />
          </div>
        ) : mediaData && mediaData.mediaType === 'IMAGE' ? (
          <div className="absolute inset-0 z-10">
            <MediaSlide url={mediaData.url} mediaType="IMAGE" />
          </div>
        ) : null}
      </ScreenCanvas>
    </div>
  );
}

export default function DisplayPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <DisplayContent />
    </Suspense>
  );
}
