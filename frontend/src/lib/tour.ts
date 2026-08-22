'use client';

import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const SEEN_KEY = 'urban-proyecta:tour-seen';

function buildDriver() {
  return driver({
    showProgress: true,
    nextBtnText: 'Siguiente →',
    prevBtnText: '← Atrás',
    doneBtnText: 'Listo',
    progressText: '{{current}}/{{total}}',
    popoverClass: 'urban-tour',
    steps: [
      {
        element: '#tour-header',
        popover: {
          title: 'Urban Lyrics',
          description:
            'Plataforma de proyección para servicios en vivo. Pieza de portafolio: datos sintéticos, sin información real de ninguna iglesia.',
        },
      },
      {
        element: '#tour-nav',
        popover: {
          title: 'Canciones, reuniones, multimedia y diapositivas',
          description:
            'Acá se arma el catálogo — letras con partes marcadas, el orden de cada reunión, imágenes/videos, y sets de diapositivas reutilizables.',
        },
      },
      {
        element: '#tour-cabina',
        popover: {
          title: 'Entrar a Cabina',
          description:
            'El panel de control en vivo: elegís qué se proyecta, avanzás diapositivas, cambiás el estilo — todo en tiempo real vía WebSocket.',
        },
      },
      {
        element: '#tour-status',
        popover: {
          title: 'Conectado',
          description:
            'Esta luz indica que el panel está sincronizado en vivo con la pantalla de proyección — lo que cambiás acá se ve al instante del otro lado.',
          side: 'bottom',
        },
      },
    ],
  });
}

export function startTour(): void {
  if (typeof window === 'undefined') return;
  buildDriver().drive();
  window.localStorage.setItem(SEEN_KEY, '1');
}

export function startTourIfFirstVisit(): void {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(SEEN_KEY)) return;
  // En mobile el sidebar arranca colapsado y fuera de pantalla (layout.tsx
  // `-translate-x-full` bajo 1024px) — resaltar ahí se vería roto. Auto-
  // arranca solo en desktop; el botón "?" sigue disponible siempre.
  if (window.innerWidth < 1024) return;
  startTour();
}
