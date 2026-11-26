import { Component, type ReactNode } from "react";

/**
 * The last stop for an error while drawing. Without it, React takes the
 * whole window down to nothing; with it, the window says what went wrong
 * and offers a reload (the stores, and so any unapplied edits, start over).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Command Center hit an error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="app-crash" role="alert">
        <h2>Something went wrong</h2>
        <p>Command Center hit an error and stopped drawing this window.</p>
        <pre>{String(error.stack ?? error)}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
