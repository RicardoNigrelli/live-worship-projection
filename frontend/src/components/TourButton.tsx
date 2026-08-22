'use client';

import { useEffect } from 'react';
import { startTour, startTourIfFirstVisit } from '@/lib/tour';

export function TourButton() {
  useEffect(() => {
    const id = setTimeout(startTourIfFirstVisit, 500);
    return () => clearTimeout(id);
  }, []);

  return (
    <button
      type="button"
      onClick={startTour}
      aria-label="Ver el recorrido guiado"
      title="Ver el recorrido guiado"
      className="text-zinc-950 dark:text-white p-2 hover:bg-surface-container rounded-full transition-colors font-headline font-black text-sm"
    >
      ?
    </button>
  );
}
