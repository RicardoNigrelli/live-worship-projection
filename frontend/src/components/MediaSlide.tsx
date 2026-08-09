'use client';

import { useRef, useEffect } from 'react';

interface MediaSlideProps {
  url: string;
  mediaType: 'IMAGE' | 'VIDEO';
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onVideoReady?: (duration: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export default function MediaSlide({ url, mediaType, videoRef, onVideoReady, onTimeUpdate }: MediaSlideProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const resolvedRef = videoRef || internalRef;

  useEffect(() => {
    const video = resolvedRef.current;
    if (!video || mediaType !== 'VIDEO') return;

    const handleLoadedMetadata = () => {
      onVideoReady?.(video.duration);
    };

    const handleTimeUpdate = () => {
      onTimeUpdate?.(video.currentTime, video.duration);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [url, mediaType, onVideoReady, onTimeUpdate]);

  if (mediaType === 'VIDEO') {
    return (
      <video
        ref={resolvedRef as React.RefObject<HTMLVideoElement>}
        src={url}
        autoPlay
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-10"
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      className="absolute inset-0 w-full h-full object-cover z-10"
    />
  );
}
