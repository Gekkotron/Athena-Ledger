import type { MouseEvent } from 'react';

interface Props {
  size?: number;
  className?: string;
  onClick?: (e: MouseEvent<HTMLImageElement>) => void;
  onDoubleClick?: (e: MouseEvent<HTMLImageElement>) => void;
}

// Brand mark for Hoopoe — a stylised hoopoe (crest + downcurved beak)
// stored at /hoopoe-logo.png with the dark rounded-square plaque baked
// in, so it slots into both light-on-dark (sidebar, login) and standalone
// contexts without restyling.
//
// Prefixing with import.meta.env.BASE_URL keeps the src correct in both
// the root-deployed builds (Docker/Tauri, BASE_URL='/') and the demo
// build served under a sub-path. BASE_URL always ends with a slash, so
// string concatenation gives one clean slash.
export function Logo({ size = 28, className = '', onClick, onDoubleClick }: Props) {
  const interactive = onClick || onDoubleClick;
  return (
    <img
      src={`${import.meta.env.BASE_URL}hoopoe-logo.png`}
      alt="Hoopoe"
      width={size}
      height={size}
      className={className}
      draggable={false}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={interactive ? { cursor: 'pointer' } : undefined}
    />
  );
}
