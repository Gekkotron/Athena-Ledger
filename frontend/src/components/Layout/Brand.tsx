import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../Logo';

// Easter egg: double-click (or double-tap) on the logo icon replays the
// splash and plays a tiny hoopoe-style chirp — a short rising sine sweep
// synthesized via Web Audio API, created lazily inside the gesture so
// autoplay policies accept it. Single click keeps the normal <Link>
// navigation to home. The __replaySplash API is set up by the inline
// lifecycle script in frontend/index.html.
function playHoopoeChirp() {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(1240, now + 0.14);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    // Audio is a nice-to-have; swallow failures silently.
  }
}

function triggerEasterEgg(e: MouseEvent<HTMLImageElement>) {
  const replay = (window as unknown as { __replaySplash?: () => void }).__replaySplash;
  if (!replay) return;
  e.preventDefault();
  e.stopPropagation();
  replay();
  playHoopoeChirp();
}

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5">
      <Logo size={28} className="text-sage-300 shrink-0" onDoubleClick={triggerEasterEgg} />
      <div className="flex flex-col leading-none">
        <span className="display text-[20px] text-ink-50 tracking-tight">Hoopoe</span>
        <span className="display-italic text-[12px] text-ink-500 mt-0.5">Accounting</span>
      </div>
    </Link>
  );
}
