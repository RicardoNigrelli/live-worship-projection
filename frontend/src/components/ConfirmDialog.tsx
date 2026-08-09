'use client';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-surface border border-outline-variant/30 shadow-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-1.5">
          <h3 className="font-headline font-black uppercase tracking-widest text-on-surface text-sm">{title}</h3>
          <p className="text-on-surface-variant text-xs font-body leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-surface-container-highest hover:bg-surface-container text-on-surface font-headline font-bold text-xs uppercase tracking-widest py-2.5 transition-colors border border-outline-variant/30">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={`flex-1 font-headline font-bold text-xs uppercase tracking-widest py-2.5 transition-colors ${
            danger ? 'bg-error hover:bg-error/90 text-on-error' : 'bg-primary hover:bg-primary-container text-white'
          }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
