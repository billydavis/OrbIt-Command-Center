import type { ReactNode } from "react";
import { useRailStore } from "../../stores/railStore";

interface RailSectionProps {
  /** Names the section in the saved open/folded state. */
  id: string;
  title: string;
  /** Sits at the heading's right edge, and stays there while folded. */
  actions?: ReactNode;
  children: ReactNode;
}

// One section of the workbench rail. Its heading is a button that folds the
// section away, with a chevron ahead of the title that points down while
// it's open; which sections are folded is remembered across restarts. The
// contents stay mounted while folded, so they keep their own state.
export function RailSection({ id, title, actions, children }: RailSectionProps) {
  const collapsed = useRailStore((s) => s.collapsed[id] ?? false);
  const toggle = useRailStore((s) => s.toggle);
  const bodyId = `rail-section-${id}`;

  return (
    <section className="rail-section">
      <div className="rail-heading-row">
        <h2 className="rail-heading">
          <button
            type="button"
            className="rail-heading-toggle"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => toggle(id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
            {title}
          </button>
        </h2>
        {actions}
      </div>
      <div id={bodyId} className="rail-section-body" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
