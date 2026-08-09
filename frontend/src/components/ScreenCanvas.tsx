'use client';
import React from 'react';

export interface DeckSlideData {
  type?: string;
  text?: string;
  bgColor?: string;
  bgImageUrl?: string;
  bgVideoUrl?: string;
  fontColor?: string;
  fontSize?: number;
  layout?: 'LEFT' | 'CENTER' | 'SPLIT';
  layers?: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    zIndex: number;
    url: string;
  }>;
}

export interface ScreenCanvasState {
  theme?: string | null;
  title?: string | null;
  bgType?: string | null;
  bgValue?: string | null;
  fontFamily?: string | null;
  fontSize?: number | null;
  fontColor?: string | null;
}

interface ScreenCanvasProps {
  state?: ScreenCanvasState;
  deckSlideData?: DeckSlideData | null;
  text?: string;
  placeholderText?: string;
  children?: React.ReactNode;
  className?: string;
  /** Set false for grids that render many instances at once (thumbnails, mini-previews) to avoid
   * decoding/playing the same background video N times simultaneously, which freezes weaker machines. */
  videoAutoplay?: boolean;
}

export default function ScreenCanvas({
  state,
  deckSlideData,
  text,
  placeholderText = 'Urban - Acústico',
  children,
  className = '',
  videoAutoplay = true,
}: ScreenCanvasProps) {
  const theme = state?.theme;
  const hasDeckBg = !!(deckSlideData?.bgVideoUrl || deckSlideData?.bgImageUrl || deckSlideData?.bgColor);

  // Normalize fontSize: deck (pixels) and global (scale) use the same 0.5–2.5 range
  const normalizedFontSize = (() => {
    if (deckSlideData) {
      const raw = deckSlideData.fontSize ?? 48;
      // Old format (pixels > 10) → convert to scale; new format already in scale
      if (raw > 10) return Math.min(2.5, Math.max(0.5, raw / 48));
      return Math.min(2.5, Math.max(0.5, raw));
    }
    return state?.fontSize ?? 1.0;
  })();

  return (
    <div
      className={`aspect-video w-full relative flex flex-col items-center text-center overflow-hidden transition-colors duration-700 ${
        theme === 'light' ? 'bg-surface text-on-surface' : 'bg-black text-white'
      } ${className}`}
      style={{ containerType: 'inline-size', padding: '3%' }}
    >
      {theme === 'motion' && !deckSlideData && (
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary to-secondary-fixed opacity-90" />
      )}

      {deckSlideData?.bgVideoUrl && (
        <video src={deckSlideData.bgVideoUrl} autoPlay={videoAutoplay} loop={videoAutoplay} muted playsInline preload={videoAutoplay ? 'auto' : 'metadata'} className="absolute inset-0 w-full h-full object-cover z-0" />
      )}
      {deckSlideData?.bgImageUrl && !deckSlideData?.bgVideoUrl && (
        <img src={deckSlideData.bgImageUrl} className="absolute inset-0 w-full h-full object-cover z-0" alt="" />
      )}
      {deckSlideData?.bgColor && !deckSlideData?.bgImageUrl && !deckSlideData?.bgVideoUrl && (
        <div className="absolute inset-0 z-0" style={{ backgroundColor: deckSlideData.bgColor }} />
      )}

      {state?.bgType === 'IMAGE' && state?.bgValue && !hasDeckBg && (
        <img src={state.bgValue} className="absolute inset-0 w-full h-full object-cover z-0" alt="" />
      )}
      {state?.bgType === 'VIDEO' && state?.bgValue && !hasDeckBg && (
        <video src={state.bgValue} autoPlay={videoAutoplay} loop={videoAutoplay} muted playsInline preload={videoAutoplay ? 'auto' : 'metadata'} className="absolute inset-0 w-full h-full object-cover z-0" />
      )}
      {state?.bgType === 'COLOR' && state?.bgValue && !hasDeckBg && (
        <div className="absolute inset-0 z-0" style={{ backgroundColor: state.bgValue }} />
      )}
      {!state?.bgType && !theme && !hasDeckBg && (
        <div className="absolute inset-0 z-0 bg-black" />
      )}

      <div style={{ flex: '1 0 0px' }} />

      {children ? (
        children
      ) : text ? (
        <div
          className={`absolute inset-0 flex items-center pointer-events-none ${
            deckSlideData?.layout === 'LEFT' ? 'justify-start text-left' :
            deckSlideData?.layout === 'SPLIT' ? 'items-end justify-center text-center' :
            'justify-center text-center'
          }`}
          style={{ zIndex: 10, paddingLeft: '4cqw', paddingRight: '4cqw' }}
        >
          {deckSlideData?.layers?.map((layer) => (
            <div
              key={layer.id}
              className="absolute select-none"
              style={{
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                width: `${layer.width}%`,
                zIndex: layer.zIndex || 5,
              }}
            >
              <img src={layer.url} alt="" className="w-full h-auto pointer-events-none" draggable={false} />
            </div>
          ))}
          <p
            className="text-center uppercase tracking-tight leading-[1.2] whitespace-pre-wrap drop-shadow-2xl relative z-20"
            style={{
              fontSize: `${normalizedFontSize * 8}cqw`,
              fontFamily: deckSlideData
                ? undefined
                : state?.fontFamily
                  ? `"${state.fontFamily}", sans-serif`
                  : undefined,
              color: deckSlideData?.fontColor || state?.fontColor || '#ffffff',
            }}
          >
            {text}
          </p>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none select-none">
          <span className="text-white/20 font-headline font-black text-[4cqw] uppercase tracking-widest">{placeholderText}</span>
        </div>
      )}

      <div style={{ flex: '1 0 0px' }} />
    </div>
  );
}
