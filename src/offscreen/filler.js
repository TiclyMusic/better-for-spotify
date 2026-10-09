// Soft generative pad played while an ad is muted: a slow I–vi–IV–V loop of
// detuned triangle voices through a low-pass filter, fading in and changing
// chord every 4 s. The document is closed when the ad ends, which stops it.
(() => {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.5);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.4;
  filter.connect(master).connect(ctx.destination);

  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  // C major, A minor, F major, G major (voiced around middle C).
  const CHORDS = [
    [48, 60, 64, 67],
    [45, 57, 60, 64],
    [41, 57, 60, 65],
    [43, 55, 59, 62],
  ];
  const STEP = 4;

  function playChord(notes, at) {
    for (const n of notes) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = midi(n);
        osc.detune.value = detune;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(0.07, at + 1.2);
        env.gain.linearRampToValueAtTime(0.05, at + STEP - 0.4);
        env.gain.linearRampToValueAtTime(0, at + STEP + 0.8);
        osc.connect(env).connect(filter);
        osc.start(at);
        osc.stop(at + STEP + 1);
      }
    }
  }

  let next = ctx.currentTime + 0.05;
  let i = 0;
  function schedule() {
    while (next < ctx.currentTime + STEP * 2) {
      playChord(CHORDS[i++ % CHORDS.length], next);
      next += STEP;
    }
  }
  schedule();
  setInterval(schedule, 1000);
})();
