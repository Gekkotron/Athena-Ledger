import type { MouseEvent } from 'react';

// Shared double-click handler for the hoopoe logo. Double-click (or
// double-tap) on a <Logo> replays the splash and plays the hoopoe's
// characteristic three-note call — "hoop-hoop-hoop", three soft hollow
// notes around 560 Hz spaced ~330 ms apart, synthesized via Web Audio
// API and created lazily inside the gesture so autoplay policies accept
// it. Used from both the sidebar brand (Layout/Brand.tsx) and the login
// screen (pages/Login.tsx). The __replaySplash API is set up by the
// inline lifecycle script in frontend/index.html.
function playHoopoeCall() {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    // Lowpass gives the call its muffled, flute-like character — the real
    // bird's hoot has almost no high-frequency content.
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1400;
    lpf.Q.value = 0.9;
    lpf.connect(ctx.destination);

    const hoot = (startAt: number, pitch: number) => {
      const fundamental = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const harmonicGain = ctx.createGain();
      const env = ctx.createGain();
      fundamental.type = 'sine';
      harmonic.type = 'sine';
      fundamental.frequency.value = pitch;
      harmonic.frequency.value = pitch * 2;
      harmonicGain.gain.value = 0.14; // whisper of 2nd harmonic for warmth
      fundamental.connect(env);
      harmonic.connect(harmonicGain).connect(env);
      env.connect(lpf);
      // Soft "hoo" envelope: gentle attack (~40 ms), brief hold, slow tail.
      env.gain.setValueAtTime(0.0001, startAt);
      env.gain.exponentialRampToValueAtTime(0.11, startAt + 0.04);
      env.gain.setValueAtTime(0.11, startAt + 0.09);
      env.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);
      fundamental.start(startAt);
      harmonic.start(startAt);
      fundamental.stop(startAt + 0.24);
      harmonic.stop(startAt + 0.24);
    };

    const t0 = ctx.currentTime + 0.02;
    hoot(t0, 560);
    hoot(t0 + 0.33, 560);
    hoot(t0 + 0.66, 545); // tiny downward inflection on the last note
    window.setTimeout(() => void ctx.close(), 1100);
  } catch {
    // Audio is a nice-to-have; swallow failures silently.
  }
}

export function triggerLogoChirp(e: MouseEvent<HTMLImageElement>) {
  const replay = (window as unknown as { __replaySplash?: () => void }).__replaySplash;
  if (!replay) return;
  e.preventDefault();
  e.stopPropagation();
  replay();
  playHoopoeCall();
}
