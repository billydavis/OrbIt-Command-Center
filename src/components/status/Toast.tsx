import type { ReactNode } from "react";

interface ToastProps {
  /** "alert" for something that went wrong, "ok" for something that didn't. */
  tone: "alert" | "ok";
  title: string;
  /** The detail under the title: an error's own wording, say. */
  children?: ReactNode;
  /** Something to do about it, offered under the detail. */
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
}

// One notice in the stack that floats over the window's top-right corner
// (see .toast-stack): what happened, in the tone's color, then the detail in
// plain text so a long error stays readable. Floating, so one arriving or
// leaving never moves the layout under it.
export function Toast({ tone, title, children, action, onDismiss }: ToastProps) {
  return (
    <div className={`toast toast-${tone}`} role={tone === "alert" ? "alert" : "status"}>
      <svg className="toast-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        {tone === "alert" ? <path d="M12 7.5v5.5M12 16.5v.01" /> : <path d="M8 12.5l2.8 2.8L16 9.5" />}
      </svg>
      <div className="toast-content">
        <p className="toast-title">{title}</p>
        {children && <p className="toast-detail">{children}</p>}
        {action && (
          <button type="button" className="toast-action" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
      <button type="button" className="icon-button toast-dismiss" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
