import type { ReactNode } from "react";
import { useToastStore } from "../../stores/toastStore";
import { Toast } from "./Toast";

interface ToastStackProps {
  /** Toasts the window keeps itself, shown above the ones from the store. */
  children?: ReactNode;
}

// The window's notices about what just happened, floating over its
// top-right corner so one arriving or leaving doesn't move what's beneath.
// Anything in the window can put one here through the toast store.
export function ToastStack({ children }: ToastStackProps) {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="toast-stack">
      {children}
      {toasts.map((t) => (
        <Toast key={t.key} tone={t.tone} title={t.title} onDismiss={() => dismiss(t.key)}>
          {t.detail}
        </Toast>
      ))}
    </div>
  );
}
