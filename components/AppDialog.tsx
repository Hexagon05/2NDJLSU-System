"use client";

type DialogTone = "default" | "success" | "danger";

interface AppDialogProps {
  open: boolean;
  title: string;
  message: string;
  tone?: DialogTone;
  confirmText?: string;
  cancelText?: string;
  hideCancel?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

const toneStyles: Record<DialogTone, { badge: string; button: string; icon: string }> = {
  default: {
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    button: "bg-blue-600 hover:bg-blue-700",
    icon: "info",
  },
  success: {
    badge: "bg-green-100 text-green-700 border-green-200",
    button: "bg-green-600 hover:bg-green-700",
    icon: "check_circle",
  },
  danger: {
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    button: "bg-rose-600 hover:bg-rose-700",
    icon: "warning",
  },
};

export default function AppDialog({
  open,
  title,
  message,
  tone = "default",
  confirmText = "OK",
  cancelText = "Cancel",
  hideCancel = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: AppDialogProps) {
  if (!open) return null;

  const styles = toneStyles[tone];

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${styles.badge}`}>
              <span className="material-symbols-outlined">{styles.icon}</span>
            </span>
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{message}</p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel || onConfirm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
