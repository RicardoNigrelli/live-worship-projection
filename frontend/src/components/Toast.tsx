'use client';
import { create } from 'zustand';
import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warn' | 'info';

export interface Toast {
  id: string;
  text: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  add: (text: string, type?: ToastType) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (text, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, text, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(text: string, type?: ToastType) {
  useToastStore.getState().add(text, type);
}

const typeStyles: Record<ToastType, string> = {
  success: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700',
  error: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700',
  warn: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700',
  info: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700',
};

const typeIcons: Record<ToastType, string> = {
  success: 'check_circle',
  error: 'error',
  warn: 'warning',
  info: 'info',
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-3 border rounded-none shadow-lg animate-in slide-in-from-right-full transition-all ${typeStyles[t.type]}`}
        >
          <span className="material-symbols-outlined text-[18px] shrink-0">{typeIcons[t.type]}</span>
          <span className="text-xs font-headline font-bold flex-1">{t.text}</span>
          <button onClick={() => remove(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}
