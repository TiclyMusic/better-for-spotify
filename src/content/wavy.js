// Playback tracker + M3 Expressive wavy progress bar for the Spotify web player.
// Spotify exposes no media element we can follow, so position comes from the
// progress bar's --progress-bar-transform (updated ~1/s) and is interpolated
// between updates; "playing" = the bar is advancing (or the Media Session says
// so), which works in any language. Spotify's own slider stays on top,
// transparent, so seeking and keyboard control are unchanged.
(() => {
  // --- Playback tracker ------------------------------------------------------------
  const tracker = { pct: 0, changedAt: 0, total: 0 };

  const parseTime = (text) => {
    if (!text) return 0;
    const neg = text.trim().startsWith("-");
    const parts = text.replace(/[^\d:]/g, "").split(":").map(Number);
    const secs = parts.reduce((acc, n) => acc * 60 + (n || 0), 0);
    return neg ? -secs : secs;
  };

  BYTM.playback = {
    bar: () => document.querySelector('[data-testid="now-playing-bar"] [data-testid="playback-progressbar"]'),
    // Reads the DOM (cheap) and returns { pct 0..1, playing, total seconds }.
    sample() {
      const wrap = this.bar();
      const fill = wrap?.querySelector('[data-testid="progress-bar"]');
      const raw = fill ? parseFloat(fill.style.getPropertyValue("--progress-bar-transform")) : NaN;
      const now = performance.now();
      if (!isNaN(raw) && Math.abs(raw - tracker.pct) > 0.001) {
        tracker.pct = raw;
        tracker.changedAt = now;
      }
      const pos = parseTime(document.querySelector('[data-testid="playback-position"]')?.textContent);
      const dur = parseTime(document.querySelector('[data-testid="playback-duration"]')?.textContent);
      tracker.total = dur < 0 ? pos - dur : dur; // "-1:23" = time remaining
      const session = navigator.mediaSession?.playbackState;
      const playing = session === "playing" || (session !== "paused" && now - tracker.changedAt < 1600);
      return { pct: tracker.pct / 100, playing, total: tracker.total, changedAt: tracker.changedAt };
    },
  };

  // --- Wavy bar ----------------------------------------------------------------------
  const AMPLITUDE = 3;
  const WAVELENGTH = 36;
  const WAVE_SPEED = 0.85;
  const STROKE = 4;
  const GAP = 5;
  const THUMB_W = 4;

  let enabled = false;
  let state = null;
  let raf = 0;
  let lastFrame = 0;
  let amp = 0;
  let phase = 0;
  let colors = null;
  let colorsStale = true;
  let probe = null;

  function readColors() {
    if (!probe) {
      probe = document.createElement("span");
      probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
      document.documentElement.append(probe);
    }
    const read = (v) => {
      probe.style.color = `var(${v})`;
      return getComputedStyle(probe).color;
    };
    colors = { active: read("--md-primary"), track: read("--md-secondary-container") };
    colorsStale = false;
  }

  function attach(wrap) {
    detach();
    const canvas = document.createElement("canvas");
    canvas.className = "bytm-wave";
    canvas.setAttribute("aria-hidden", "true");
    wrap.prepend(canvas);
    const s = { wrap, canvas, ctx: canvas.getContext("2d"), dragging: false, hover: 0, hovering: false, w: 0, h: 0, dpr: 0 };
    const onDown = () => { s.dragging = true; kick(); };
    const onUp = () => { if (s.dragging) { s.dragging = false; kick(); } };
    const onEnter = () => { s.hovering = true; kick(); };
    const onLeave = () => { s.hovering = false; kick(); };
    wrap.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointerenter", onEnter);
    wrap.addEventListener("pointerleave", onLeave);
    s.detach = () => {
      wrap.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointerenter", onEnter);
      wrap.removeEventListener("pointerleave", onLeave);
      canvas.remove();
    };
    state = s;
  }

  function detach() {
    state?.detach();
    state = null;
  }

  function draw(s, pct) {
    const { canvas, ctx } = s;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (w !== s.w || h !== s.h || dpr !== s.dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      s.w = w; s.h = h; s.dpr = dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!colors || colorsStale) readColors();

    const mid = h / 2;
    const x = pct * w;
    const start = STROKE / 2;
    const end = w - STROKE / 2;
    const k = (2 * Math.PI) / WAVELENGTH;
    ctx.lineCap = "round";
    ctx.lineWidth = STROKE;

    const playedEnd = x - GAP - THUMB_W / 2;
    if (playedEnd > start) {
      ctx.strokeStyle = colors.active;
      ctx.beginPath();
      for (let px = start; px <= playedEnd; px += 1.5) {
        const ramp = Math.max(0, Math.min(1, (px - start) / WAVELENGTH, (playedEnd - px) / (WAVELENGTH / 2)));
        const y = mid + amp * ramp * Math.sin(px * k - phase);
        px === start ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.lineTo(playedEnd, mid);
      ctx.stroke();
    }
    const trackStart = x + GAP + THUMB_W / 2;
    if (trackStart < end) {
      ctx.strokeStyle = colors.track;
      ctx.beginPath();
      ctx.moveTo(trackStart, mid);
      ctx.lineTo(end, mid);
      ctx.stroke();
      if (end - trackStart > 10) {
        ctx.fillStyle = colors.active;
        ctx.beginPath();
        ctx.arc(end, mid, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const thumbH = 14 + s.hover * 6;
    ctx.fillStyle = colors.active;
    ctx.beginPath();
    ctx.roundRect(x - THUMB_W / 2, mid - thumbH / 2, THUMB_W, thumbH, THUMB_W / 2);
    ctx.fill();
  }

  function frame(now) {
    raf = 0;
    if (!enabled || !state) return;
    if (lastFrame && now - lastFrame < 30) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    lastFrame = now;
    const s = state;
    if (!s.wrap.isConnected) {
      detach();
      return;
    }

    const pb = BYTM.playback.sample();
    // Interpolate between Spotify's once-a-second updates (never more than ~1.2 s ahead).
    let pct = pb.pct;
    if (pb.playing && !s.dragging && pb.total > 0) {
      const ahead = Math.min((now - pb.changedAt) / 1000, 1.2);
      pct = Math.min(1, pct + ahead / pb.total);
    }
    const targetAmp = pb.playing ? AMPLITUDE : 0;
    amp += (targetAmp - amp) * Math.min(1, dt * 7);
    if (Math.abs(targetAmp - amp) < 0.02) amp = targetAmp;
    phase = (phase + dt * WAVE_SPEED * 2 * Math.PI * (amp / AMPLITUDE)) % (Math.PI * 2);
    const targetHover = s.hovering || s.dragging ? 1 : 0;
    s.hover += (targetHover - s.hover) * Math.min(1, dt * 14);
    if (Math.abs(targetHover - s.hover) < 0.01) s.hover = targetHover;

    draw(s, pct);

    if (pb.playing || amp !== targetAmp || s.hover !== targetHover || s.dragging) raf = requestAnimationFrame(frame);
    else lastFrame = 0;
  }

  function kick() {
    if (!raf && enabled && state) raf = requestAnimationFrame(frame);
  }

  BYTM.wavy = {
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      if (on) this.scan();
      else {
        detach();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    // Called from the housekeeping poll: (re)attach and wake the loop.
    scan() {
      if (!enabled) return;
      const wrap = BYTM.playback.bar();
      if (wrap && (!state || state.wrap !== wrap || !state.canvas.isConnected)) attach(wrap);
      kick();
    },
    paletteChanged() {
      colorsStale = true;
      kick();
    },
  };
})();
