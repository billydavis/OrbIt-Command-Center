import { useMemo } from "react";
import { drawingFor } from "../../lib/clockFaceRenderer";
import { useClockFacesStore } from "../../stores/clockFacesStore";
import { useRailStore } from "../../stores/railStore";
import { RailSection } from "../rail/RailSection";
import { ClockFaceView, thumbnailTime } from "./ClockFaceLayer";

// The rail's Clock faces section: the ones saved in this app, as round
// thumbnails that open the builder, and a button to start a new one.
export function ClockFaceList() {
  const faces = useClockFacesStore((s) => s.faces);
  const editingId = useClockFacesStore((s) => (s.editor ? (s.editor.id ?? "new") : null));
  const openEditor = useClockFacesStore((s) => s.openEditor);
  const expand = useRailStore((s) => s.expand);
  const time = useMemo(thumbnailTime, []);

  return (
    <RailSection
      id="clock-faces"
      title="Clock faces"
      actions={
        <button
          type="button"
          className="icon-button rail-heading-icon"
          aria-label="New clock face"
          title="New clock face"
          onClick={() => {
            expand("clock-faces");
            openEditor(null);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      }
    >
      {faces.length === 0 ? (
        <p className="field-hint">
          None yet. Design a dial and hands here, then pick it for any analog clock screen.
        </p>
      ) : (
        <div className="clock-face-list">
          {faces.map((face) => (
            <button
              key={face.id}
              type="button"
              className="clock-face-list-item"
              aria-pressed={editingId === face.id}
              title={`Edit ${face.name}`}
              onClick={() => openEditor(face.id)}
            >
              <ClockFaceView className="clock-face-thumb" drawing={drawingFor(face.recipe)} now={time} />
              <span>{face.name}</span>
            </button>
          ))}
        </div>
      )}
    </RailSection>
  );
}
