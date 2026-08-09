"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import ToastContainer from '@/components/Toast';
import { API_URL } from '@/lib/api';

// SEC: The admin dashboard's backend write routes (songs/services/decks/media/export)
// require an `x-api-key` header. Rather than editing every one of the ~50 fetch()
// call sites in the dashboard, patch window.fetch once (scoped to this admin-only
// layout) to attach it automatically for any request going to the backend API_URL.
// CAVEAT: NEXT_PUBLIC_API_KEY ships in the client bundle, so this is a deterrent
// against casual/scripted abuse of the backend, not a strong secret — see the
// security report for the residual risk and the recommended real fix
// (server-side proxy routes that never expose the key to the browser).
function useApiKeyFetchPatch() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_API_KEY;
    if (!apiKey) return;
    const w = window as any;
    if (w.__urbanApiKeyPatched) return;
    w.__urbanApiKeyPatched = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

      if (url.startsWith(API_URL)) {
        const headers = new Headers(init.headers || (typeof input !== 'string' && !(input instanceof URL) ? (input as Request).headers : undefined));
        headers.set('x-api-key', apiKey);
        return originalFetch(input, { ...init, headers });
      }
      return originalFetch(input, init);
    };
  }, []);
}

function useDashboardTheme() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('dashboard-theme');
    const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(isDark);
  }, []);

  useEffect(() => {
    if (dark === null) return;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('dashboard-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { dark, toggle: toggleTheme } = useDashboardTheme();
  useApiKeyFetchPatch();

  // En mobile arranca colapsado
  useEffect(() => {
    if (window.innerWidth < 1024) setIsCollapsed(true);
  }, []);

  const navLinks = [
    { href: '/dashboard/songs', label: 'CANCIONES', icon: 'music_note' },
    { href: '/dashboard/services', label: 'REUNIONES', icon: 'calendar_today' },
    { href: '/dashboard/media', label: 'MULTIMEDIA', icon: 'image' },
    { href: '/dashboard/decks', label: 'DIAPOSITIVAS', icon: 'auto_awesome_mosaic' },
  ];

  return (
    <div className="bg-surface text-on-surface antialiased h-screen w-full flex overflow-hidden selection:bg-primary selection:text-on-primary relative">
      
      {/* Mobile Backdrop Overlay */}
      {!isCollapsed && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-[35]" onClick={() => setIsCollapsed(true)} />
      )}

      {/* SideNavBar */}
      <nav className={`absolute lg:relative z-40 bg-zinc-950 dark:bg-black flex flex-col py-8 transition-all duration-300 ease-in-out shrink-0 h-full overflow-hidden whitespace-nowrap border-none ${isCollapsed ? '-translate-x-full lg:translate-x-0 w-0 lg:w-20 px-0 lg:px-4' : 'translate-x-0 w-72 px-6 shadow-2xl lg:shadow-none'}`}>
        <div className={`mb-12 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
          <h1 className={`font-black tracking-tighter text-white uppercase font-headline italic transition-all ${isCollapsed ? 'text-[10px] -rotate-90 mt-12 w-4' : 'text-2xl'}`}>
            {isCollapsed ? 'URBAN' : 'URBAN LYRICS'}
          </h1>
        </div>
        
        <Link href="/dashboard/control" className={`w-full bg-primary hover:bg-primary-container text-white py-3 rounded-none font-headline font-bold text-sm tracking-widest uppercase transition-colors duration-200 mb-8 flex items-center gap-2 hover:shadow-[0_4px_0_0_theme(colors.primary-container)] ${isCollapsed ? 'justify-center px-0' : 'justify-center px-4'}`} title="Entrar a Cabina">
          <span className="material-symbols-outlined text-[18px]">sensors</span>
          {!isCollapsed && <span>CABINA</span>}
        </Link>
        
        <div className="flex-1 flex flex-col gap-2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/') && link.href !== '/dashboard';
            return (
              <Link key={link.href} href={link.href} title={link.label} className={`flex items-center gap-4 p-4 font-headline tracking-[-0.02em] uppercase font-bold text-xs rounded-none transition-all duration-200 ${isActive ? 'bg-zinc-900 text-teal-400 border-r-4 border-teal-500' : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800'} ${isCollapsed ? 'justify-center px-0' : ''}`}>
                <span className={`material-symbols-outlined ${isActive ? 'text-teal-400' : ''}`}>{link.icon}</span>
                {!isCollapsed && link.label}
              </Link>
            )
          })}
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-zinc-900 pt-6">
          <button onClick={async () => { await fetch('/api/auth', { method: 'DELETE' }); window.location.href = '/dashboard/login'; }} title="Cerrar Sesión" className={`flex items-center gap-4 text-zinc-500 p-4 hover:text-zinc-100 transition-colors font-headline tracking-[-0.02em] uppercase font-bold text-xs hover:bg-zinc-800 rounded-none duration-200 ${isCollapsed ? 'justify-center px-0' : ''}`}>
            <span className="material-symbols-outlined">logout</span>
            {!isCollapsed && 'CERRAR SESIÓN'}
          </button>
        </div>
      </nav>

      {/* Main Content Wrappers */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface h-full overflow-hidden">
        {/* TopAppBar */}
        <header className="shrink-0 w-full z-30 bg-stone-50/90 dark:bg-zinc-950/90 backdrop-blur-md flex justify-between items-center h-20 px-4 lg:px-12 border-b border-outline-variant/30 text-primary transition-all duration-300">
          <div className="flex items-center gap-4 lg:gap-8">
             <button onClick={() => setIsCollapsed(!isCollapsed)} aria-label={isCollapsed ? 'Abrir menú' : 'Cerrar menú'} className="text-zinc-950 dark:text-white p-2 hover:bg-surface-container rounded-full transition-colors flex items-center justify-center">
              <span className="material-symbols-outlined">{isCollapsed ? 'menu' : 'menu_open'}</span>
            </button>
            <div className="text-lg lg:text-xl font-black text-zinc-950 dark:text-white font-headline uppercase tracking-[-0.05em] italic truncate hidden sm:block">
              PANEL ADMIN
            </div>
          </div>
          <div className="flex items-center gap-4 lg:gap-6">
            <button
              onClick={toggleTheme}
              aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="text-zinc-950 dark:text-white p-2 hover:bg-surface-container rounded-full transition-colors"
              title={dark ? 'Modo claro' : 'Modo oscuro'}
            >
              <span className="material-symbols-outlined text-[20px]">
                {dark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <div className="hidden md:flex flex-col items-end">
              <span className="font-headline font-black tracking-tighter text-sm flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                CONECTADO
              </span>
              <span className="font-headline font-bold text-black dark:text-white opacity-60 text-xs truncate">SALA PRINCIPAL</span>
            </div>
            <div className="w-8 h-8 shrink-0 rounded-none overflow-hidden border border-outline-variant/40 bg-primary flex items-center justify-center text-white font-headline font-bold text-xs">
              AD
            </div>
          </div>
        </header>

        {/* Dynamic Children Yield */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}
