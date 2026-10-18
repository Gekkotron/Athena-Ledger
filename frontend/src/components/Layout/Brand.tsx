import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../Logo';

// Easter egg: clicking the icon itself (not the wordmark) replays the
// splash. The replay API is set up by the inline lifecycle script in
// frontend/index.html; stopPropagation + preventDefault keep the <Link>
// from navigating home on the same click.
function replaySplashOnClick(e: MouseEvent<HTMLImageElement>) {
  const replay = (window as unknown as { __replaySplash?: () => void }).__replaySplash;
  if (!replay) return;
  e.preventDefault();
  e.stopPropagation();
  replay();
}

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5">
      <Logo size={28} className="text-sage-300 shrink-0" onClick={replaySplashOnClick} />
      <div className="flex flex-col leading-none">
        <span className="display text-[20px] text-ink-50 tracking-tight">Hoopoe</span>
        <span className="display-italic text-[12px] text-ink-500 mt-0.5">Accounting</span>
      </div>
    </Link>
  );
}
