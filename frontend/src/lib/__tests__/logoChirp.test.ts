import type { MouseEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { triggerLogoChirp } from '../logoChirp';

// Minimal Web Audio stand-in: records every oscillator so the tests can
// assert on the three-note call without a real audio backend (jsdom has
// none).
class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeNode {
  connect = vi.fn((next: unknown) => next);
}

class FakeOscillator extends FakeNode {
  type = '';
  frequency = new FakeParam();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 1;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  close = vi.fn(() => Promise.resolve());

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: '', frequency: new FakeParam(), Q: new FakeParam() });
  }

  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }

  createOscillator() {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
}

function fakeEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent<HTMLImageElement> & {
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

type TestWindow = Window & {
  __replaySplash?: () => void;
  webkitAudioContext?: unknown;
};
const w = window as unknown as TestWindow;

describe('triggerLogoChirp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete w.__replaySplash;
    delete w.webkitAudioContext;
  });

  it('does nothing when the splash replay API is absent', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const e = fakeEvent();

    triggerLogoChirp(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('replays the splash and plays three notes, then closes the context', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const replay = vi.fn();
    w.__replaySplash = replay;
    const e = fakeEvent();

    triggerLogoChirp(e);

    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(e.stopPropagation).toHaveBeenCalledOnce();
    expect(replay).toHaveBeenCalledOnce();

    const [ctx] = FakeAudioContext.instances;
    // Each note is a fundamental plus its 2nd harmonic.
    expect(ctx.oscillators).toHaveLength(6);
    const fundamentals = ctx.oscillators.filter((_, i) => i % 2 === 0);
    expect(fundamentals.map((o) => o.frequency.value)).toEqual([560, 560, 545]);
    const starts = fundamentals.map((o) => o.start.mock.calls[0][0] as number);
    expect(starts[1] - starts[0]).toBeCloseTo(0.33);
    expect(starts[2] - starts[1]).toBeCloseTo(0.33);

    expect(ctx.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1100);
    expect(ctx.close).toHaveBeenCalledOnce();
  });

  it('falls back to webkitAudioContext', () => {
    vi.stubGlobal('AudioContext', undefined);
    w.webkitAudioContext = FakeAudioContext;
    w.__replaySplash = vi.fn();

    triggerLogoChirp(fakeEvent());

    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('still replays the splash when Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    const replay = vi.fn();
    w.__replaySplash = replay;

    expect(() => triggerLogoChirp(fakeEvent())).not.toThrow();
    expect(replay).toHaveBeenCalledOnce();
  });

  it('swallows audio errors', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('blocked');
        }
      },
    );
    const replay = vi.fn();
    w.__replaySplash = replay;

    expect(() => triggerLogoChirp(fakeEvent())).not.toThrow();
    expect(replay).toHaveBeenCalledOnce();
  });
});
