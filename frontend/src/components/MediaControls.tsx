'use client';

interface MediaControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MediaControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  onPlayPause,
  onStop,
  onSeek,
  onVolumeChange,
}: MediaControlsProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeekBackward = () => {
    onSeek(Math.max(0, currentTime - 10));
  };

  const handleSeekForward = () => {
    onSeek(Math.min(duration, currentTime + 10));
  };

  return (
    <div className="w-full bg-surface-container-low border border-outline-variant/20 p-4 flex flex-col gap-3">
      {/* Progress Bar */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-headline font-bold text-on-surface-variant w-12 text-right">
          {formatTime(currentTime)}
        </span>
        <div
          className="flex-1 h-2 bg-surface-container-highest cursor-pointer relative group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            onSeek(pct * duration);
          }}
        >
          <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 8px)` }}
          />
        </div>
        <span className="text-[10px] font-headline font-bold text-on-surface-variant w-12">
          {formatTime(duration)}
        </span>
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* -10s */}
          <button
            onClick={handleSeekBackward}
            className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">replay_10</span>
          </button>

          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            className="w-10 h-10 bg-primary hover:bg-primary-container text-on-primary flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>

          {/* +10s */}
          <button
            onClick={handleSeekForward}
            className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">forward_10</span>
          </button>

          {/* Stop */}
          <button
            onClick={onStop}
            className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">stop_circle</span>
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
            className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
            </span>
          </button>
          <div
            className="w-20 h-2 bg-surface-container-highest cursor-pointer relative group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onVolumeChange(pct);
            }}
          >
            <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${volume * 100}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${volume * 100}% - 6px)` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
