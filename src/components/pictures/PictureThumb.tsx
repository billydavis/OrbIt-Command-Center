import { useEffect } from "react";
import { usePicturesStore } from "../../stores/picturesStore";

interface PictureThumbProps {
  hash: string;
  className?: string;
}

/**
 * A library picture, round like the orb's screen (the corners of a picture
 * never show there). An animated GIF plays. A picture the library doesn't
 * have (made on another computer, or deleted) shows as a question mark.
 */
export function PictureThumb({ hash, className = "" }: PictureThumbProps) {
  const url = usePicturesStore((s) => s.urls[hash]);
  const known = usePicturesStore((s) => !s.loaded || s.pictures.some((p) => p.hash === hash));
  const loadUrl = usePicturesStore((s) => s.loadUrl);

  useEffect(() => {
    if (!url && known) void loadUrl(hash);
  }, [url, known, hash, loadUrl]);

  if (!known) {
    return (
      <span className={`picture-thumb picture-thumb-unknown ${className}`} aria-hidden="true">
        ?
      </span>
    );
  }
  return url ? (
    <img className={`picture-thumb ${className}`} src={url} alt="" draggable={false} />
  ) : (
    <span className={`picture-thumb ${className}`} aria-hidden="true" />
  );
}
