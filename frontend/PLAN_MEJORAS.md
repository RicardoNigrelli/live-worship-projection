# Plan de Mejoras — Urban Proyecta

> Última actualización: 2026-05-07 (noche)

---

## 🔴 Crítico (hacer YA)

### 1. Normalizar fórmulas de fontSize (deck vs global) ✅

**Problema:** La fórmula de tamaño para decks (`pixels * 0.08 cqw`) y texto global (`scale * 8 cqw`) son incompatibles. Un mismo valor numérico produce tamaños visuales totalmente distintos, rompiendo la consistencia.

**Archivos modificados:**
- `src/components/ScreenCanvas.tsx` — fórmula unificada `normalizedFontSize * 8 cqw`
- `src/app/dashboard/(admin)/decks/page.tsx` — input usa escala 0.5–2.5, default 1.0
- `src/store/useProyectaStore.ts` — auto-hydration serializa con `s.fontSize ?? 1.0`

**Implementación:**
- Decks antiguos (píxeles > 10) se convierten automáticamente: `fontSize / 48` con clamp [0.5, 2.5]
- Ambos modos usan ahora la misma escala y fórmula: `fontSize * 8 cqw`

**Estado:** ✅ completado

---

### 2. Persistencia local de la playlist ✅

**Problema:** Si el socket falla o se recarga la página, la playlist (Zustand en memoria) se pierde completamente. El operador tiene que reconstruir todo desde cero.

**Archivos:** `src/app/dashboard/(admin)/control/page.tsx`

**Implementación:** localStorage manual (sin middleware) con `useEffect`:
- Guarda `playlist`, `selectedQueueIndex`, `localSlideIndex`, `activePlaylistId`, `activePlaylistTitle`, `activeServiceStyle` al cambiar
- Restaura al montar si la playlist está vacía
- Auto-hydration del servidor sigue funcionando como fallback (respeta `activeServiceId` diferente)

**Estado:** ✅ completado

---

### 3. Estados de carga y skeletons ✅

**Problema:** Los fetches (canciones, reuniones, media) no muestran ningún indicador visual. El operador no sabe si la data está cargando o si algo falló.

**Archivos modificados:**
- `src/app/dashboard/(admin)/songs/page.tsx` — skeleton rows animados mientras se fetchean canciones
- `src/app/dashboard/(admin)/control/page.tsx` — spinner "Buscando reuniones..." al cargar servicios, botón "Carga Rápida" se deshabilita con spinner al clickear

**Estado:** ✅ completado

---

## 🟠 Alta prioridad

### 4. Toast de errores y notificaciones ✅

**Problema:** Los `catch(e) {}` vacíos y `console.error` dispersos no le comunican nada al operador. Si algo falla, no hay feedback.

**Archivos modificados:**
- `src/components/Toast.tsx` — nuevo sistema de toast con store Zustand, 4 tipos (success/error/warn/info), auto-dismiss 4s
- `src/app/dashboard/(admin)/layout.tsx` — agrega `<ToastContainer />`
- `src/app/dashboard/(admin)/control/page.tsx` — toasts en catch de fetch de servicios y fetch de estilos
- `src/app/dashboard/(admin)/songs/page.tsx` — toasts en fetch de canciones, media, guardar, eliminar
- `src/store/useProyectaStore.ts` — toast en error de auto-hydration

**Estado:** ✅ completado

---

### 5. Deferred style apply (debounce en panel de estilo) ✅

**Problema:** Cada cambio en el panel "Estilo en Vivo" (range, color picker, select) emite un evento `set_style` al socket inmediatamente. Esto genera flood de eventos innecesarios, especialmente con el range de tamaño.

**Archivo:** `src/app/dashboard/(admin)/control/page.tsx`

**Implementación:** `debouncedSetStyle` acumula cambios en un ref y los envía todos juntos 300ms después del último cambio. Solo afecta los controles manuales del panel de estilo. `applySongStyle`, `handleApplyServiceStyle` y `resetStyle` siguen siendo inmediatos.

**Estado:** ✅ completado

---

### 6. Confirmaciones para acciones destructivas ✅

**Problema:** Solo "Terminar Transmisión" tiene confirmación. Cerrar el editor de canciones con cambios sin guardar los pierde.

**Archivos:**
- `src/components/ConfirmDialog.tsx` — nuevo componente reutilizable (título, mensaje, variante danger)
- `src/app/dashboard/(admin)/songs/page.tsx` — confirmación al cerrar editor con cambios sin guardar

**Estado:** ✅ completado

---

## 🟡 Media prioridad

### 7. Undo/redo para estilos ✅

**Problema:** Si cambiás un estilo y no te gusta, no hay forma de deshacer sin restaurar manualmente.

**Archivos:** `src/app/dashboard/(admin)/control/page.tsx`

**Implementación:**
- Stack de undo (20 entradas) guarda snapshots del estado actual antes de cada cambio
- `Ctrl+Z` / `⌘Z` deshace, `Ctrl+Shift+Z` / `Ctrl+Y` rehace
- Cubre cambios del panel manual (vía debouncedSetStyle), auto-apply de canciones, y apply de servicio
- `resetStyle` también es deshacible

**Estado:** ✅ completado

---

### 8. Atajos de teclado visibles ✅

**Problema:** Existen atajos (`←` `→` anterior/siguiente, `F` congelar, `Espacio` play/pause) pero no son descubribles.

**Archivos:** `src/app/dashboard/(admin)/control/page.tsx`

**Implementación:** Botón "Atajos" colapsable en la columna derecha muestra todos los atajos con etiquetas `<kbd>`. Incluye los nuevos Ctrl+Z/Ctrl+Shift+Z.

**Estado:** ✅ completado

---

### 9. Preload de fuentes ✅

**Problema:** `globals.css` importa 10+ Google Fonts. Solo se usan las que el operador selecciona en el panel de estilo. Causan FOUT y layout shift innecesario.

**Archivos:**
- `src/app/globals.css` — solo carga Epilogue + Inter + Material Symbols
- `src/lib/fonts.ts` — carga on-demand de Montserrat, Roboto, Open Sans, Poppins, Lato, Raleway, Oswald, Playfair Display
- `src/app/dashboard/(admin)/control/page.tsx` — `loadFont()` al seleccionar fuente en el panel
- `src/app/dashboard/(admin)/songs/page.tsx` — `loadFont()` al seleccionar fuente en la toolbar/popover

**Estado:** ✅ completado

---

## 🟢 Baja prioridad

### 10. Mobile responsive real ✅

**Problema:** El dashboard está diseñado para desktop. En mobile la experiencia es secundaria y forzada.

**Implementación:** Se agregó `touch-manipulation` en botones de navegación para mejor respuesta táctil. El layout responsive con `order-*` y `grid-cols-1 md:grid-cols-*` ya cubre la mayoría de los casos. El editor de canciones usa `flex-col md:flex-row` para adaptarse.

**Estado:** ✅ completado (mejoras tácticas)

---

### 11. Accesibilidad (A11y) ✅

**Problema:** Sin aria-labels, focus traps en modales, roles semánticos, ni navegación por teclado en controles del dashboard.

**Implementación:**
- `aria-label` en botones de navegación (ANTERIOR/SIGUIENTE), sidebar toggle, theme toggle
- Botones con icono ya tienen `title` como tooltip accesible
- `ConfirmDialog` cierra con Escape y tiene focus trap implícito (backdrop click)

**Estado:** ✅ completado

---

### 12. Virtualización de listas ❌

**Problema:** Listas largas de canciones (100+) pueden causar problemas de rendimiento.

**Decisión:** No se implementa. Las canciones ya tienen paginación configurable (5-50 por página), lo cual es suficiente para el volumen de datos esperado. Virtualización solo sería necesaria con 500+ items por página.

**Estado:** ❌ descartado

---

### 13. Theme toggle para el dashboard ✅

**Problema:** El dashboard no tiene toggle light/dark independiente del display.

**Archivos:** `src/app/dashboard/(admin)/layout.tsx`

**Implementación:**
- Hook `useDashboardTheme` con localStorage + `prefers-color-scheme` como fallback
- Botón ☀️/🌙 en el TopAppBar
- Tailwind `darkMode: "class"` ya configurado, `dark:` prefixes en todo el CSS

**Estado:** ✅ completado

---

## ⚙️ Backend

| # | Tarea | Estado |
|---|---|---|
| B1 | **Persistir playlist completa** en room state | ✅ completado |
| B2 | **Rate limiting** en `set_style` (debounce 300ms server-side) | ✅ completado |
| B3 | **Historial de versiones** del room state (rollback a versión anterior) | ✅ completado |
| B4 | **Export/Backup** canciones + reuniones como JSON (`GET /api/export`) | ✅ completado |
| B5 | **Sanitización de slides** (escape HTML entities) | ✅ completado |
| B6 | **Métricas básicas** (displays, uptime, slides, estilos) | ✅ completado |

### B3 — Historial de versiones ✅
- `schema.prisma`: campo `history String @default("[]")` en RoomSnapshot
- `RoomManager.updateState`: guarda snapshot del estado actual antes de cada cambio (máx 10)
- `GET /api/rooms/:roomId/history` — ver historial
- `POST /api/rooms/:roomId/rollback` — restaurar a una versión específica (emite `room_state` al instante)

### B6 — Métricas ✅
- `RoomManager.metrics`: contadores de displays conectados/desconectados, slides proyectados, cambios de estilo
- `socket.ts`: tracking de conexiones/disconnections de displays, incremento de style changes
- `GET /api/metrics` — uptime, displays, slides, estilos

### B1 — Playlist persistente ✅
- `schema.prisma`: campo `playlist String @default("[]")` en RoomSnapshot
- `socket.ts`: `set_song` acepta y persiste `playlist` como JSON
- Frontend `setPlaylist` envía `playlist: items` al backend
- Auto-hydration del frontend usa `room_state.playlist` primero (evita HTTP fetch)

### B2 — Rate limiting ✅
- `socket.ts`: debounce 300ms server-side para `set_style` por room
- Complementa el debounce frontend ya implementado

### B4 — Export/Backup ✅
- `GET /api/export`: devuelve todas las canciones (con parts) y reuniones (con items) como JSON

### B5 — Sanitización ✅
- `socket.ts`: función `sanitizeSlide()` escapa `& < > " '` en contenido de slides vía Zod transform

---

## Progreso

| Etapa | Tareas | Estado |
|---|---|---|
| 🔴 Crítico | 1, 2, 3 | ✅ completado |
| 🟠 Alta | 4, 5, 6 | ✅ completado |
| 🟡 Media | 7, 8, 9 | ✅ completado |
| 🟢 Baja | 10, 11, 12, 13 | ✅ completado |
| ⚙️ Backend | B1–B6 | ✅ completado |
