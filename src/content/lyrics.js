// Time-synced lyrics with a letter-by-letter karaoke fill, inside Spotify's own
// Lyrics view (the page, the Now Playing panel and full-screen "cinema" mode).
// Source: LRCLIB. With synced lyrics from LRCLIB we replace Spotify's lines;
// otherwise Spotify's own lyrics stay (restyled by theme.css). Plain LRCLIB
// lyrics are only used when Spotify has none.
(() => {
  const LEAD = 0.25; // s; highlight a touch early so it feels on-beat
  const DELAY = 0.25; // s; overall shift later (LRCLIB timings ran early)
  const INTERLUDE_MIN = 6; // s of silence before showing breathing dots
  const USER_SCROLL_GRACE = 4000; // ms to leave the user alone after they scroll
  const LOOKUP_TIMEOUT = 4000; // ms before giving up and leaving Spotify's lyrics
  const ROOTS = '[style*="--lyrics-color-active"]';
  const SPOTIFY_LINE = '[data-testid="lyrics-line"]';

  let enabled = false;
  let options = { karaoke: true };
  let track = null;
  let lyrics = null; // { kind: "synced" | "plain", lines, source, href }
  let state = "none"; // "loading" | "synced" | "plain" | "none"
  let token = 0;
  const cache = new Map(); // track key -> lyrics | null

  let view, loader, list, footer;
  let mountedRoot = null;
  let scroller = null;
  let rows = [];
  let activeIndex = -1;
  let raf = 0;
  let userScrollUntil = 0;
  const hookedScrollers = new WeakSet();
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------------------------------------------------------------------------
  // Playback clock, fed by page-bridge.js (MAIN world)
  // ---------------------------------------------------------------------------
  const clock = {
    media: null, // { t, at, rate, paused, dur }
    session: null, // { t, at, rate, dur }
    playing: false,
    mediaTrusted: false, // media timeline matches the track position
  };
  const extrapolate = (s, running) => s.t + (running ? ((performance.now() - s.at) / 1000) * (s.rate || 1) : 0);
  const sessionNow = () => clock.session && extrapolate(clock.session, clock.playing);
  const mediaNow = () => clock.media && extrapolate(clock.media, !clock.media.paused);

  document.addEventListener("bfs:clock", (e) => {
    let d;
    try {
      d = JSON.parse(e.detail);
    } catch {
      return;
    }
    if (d.src === "media") {
      clock.media = d;
      clock.playing = !d.paused;
      // Re-check the media timeline against the session position on every sample.
      const s = sessionNow();
      if (s != null) clock.mediaTrusted = Math.abs(d.t - s) < 1;
    } else if (d.src === "session") {
      // Freeze the current estimate before replacing it.
      clock.session = d;
      const m = mediaNow();
      clock.mediaTrusted = m != null && Math.abs(m - d.t) < 1;
      kick(true);
    } else if (d.src === "state") {
      if (clock.session) clock.session = { ...clock.session, t: sessionNow(), at: d.at };
      clock.playing = !d.paused;
      kick();
    }
    if (!d.paused) kick();
  });

  // Seconds into the track, or null if unknown.
  function now() {
    const media = clock.media;
    if (media && clock.mediaTrusted && performance.now() - media.at < 2000) return mediaNow();
    if (clock.session) return sessionNow();
    // No bridge data: the progress bar (updated ~1/s), interpolated.
    const s = BYTM.playback.sample();
    if (!s.total) return null;
    const ahead = s.playing ? Math.min((performance.now() - s.changedAt) / 1000, 1.2) : 0;
    return s.pct * s.total + ahead;
  }
  const isPlaying = () =>
    clock.media || clock.session ? clock.playing : BYTM.playback.sample().playing;
  const duration = () => clock.session?.dur || clock.media?.dur || BYTM.playback.sample().total || 0;

  // ---------------------------------------------------------------------------
  // Parsing (same LRC handling as Better YT Music)
  // ---------------------------------------------------------------------------
  const toSeconds = (min, sec) => Number(min) * 60 + Number(sec.replace(":", "."));

  function parseLrc(text) {
    let offset = 0;
    const entries = [];
    for (const raw of text.split(/\r?\n/)) {
      const off = raw.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
      if (off) {
        offset = Number(off[1]) / 1000;
        continue;
      }
      const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
      if (!stamps.length) continue;
      const body = raw.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, "");
      const timed = parseWordStamps(body, offset);
      const text = body.replace(/<\d+:\d+(?:[.:]\d+)?>/g, "").replace(/\s+/g, " ").trim();
      for (const m of stamps) {
        const start = toSeconds(m[1], m[2]) - offset;
        entries.push({ start: Math.max(0, start), text, words: stamps.length === 1 ? timed : null });
      }
    }
    entries.sort((a, b) => a.start - b.start);
    const lines = [];
    for (const e of entries) {
      if (!e.text) {
        const prev = lines[lines.length - 1];
        if (prev && prev.end == null) prev.end = e.start;
      } else {
        const end = e.words ? e.words[e.words.length - 1].end : null;
        lines.push({ start: e.start, end, text: e.text, words: e.words });
      }
    }
    return lines;
  }

  function parseWordStamps(body, offset) {
    const parts = body.split(/<(\d+):(\d+(?:[.:]\d+)?)>/);
    if (parts.length < 4) return null;
    const words = [];
    for (let i = 1; i < parts.length; i += 3) {
      const start = toSeconds(parts[i], parts[i + 1]) - offset;
      const text = parts[i + 2];
      if (words.length) words[words.length - 1].end = start;
      if (text.trim()) words.push({ text, start, end: start });
    }
    if (!words.length) return null;
    const last = words[words.length - 1];
    if (last.end <= last.start) last.end = last.start + 0.6;
    return words;
  }

  function estimateWords(line) {
    const tokens = line.text.split(/(\s+)/).filter(Boolean);
    const weight = (t) => (/^\s+$/.test(t) ? 0 : t.length + 1.5);
    const total = tokens.reduce((sum, t) => sum + weight(t), 0) || 1;
    const span = Math.max(line.end - line.start, 0.4);
    const words = [];
    let at = line.start;
    let pendingSpace = "";
    for (const t of tokens) {
      if (!weight(t)) {
        pendingSpace += t;
        continue;
      }
      const dur = (span * weight(t)) / total;
      words.push({ text: pendingSpace + t, start: at, end: at + dur });
      pendingSpace = "";
      at += dur;
    }
    return words;
  }

  function withInterludes(lines) {
    const out = [];
    if (lines.length && lines[0].start >= INTERLUDE_MIN) out.push({ interlude: true, start: 0, end: lines[0].start });
    lines.forEach((line, i) => {
      const next = lines[i + 1];
      const count = line.text.split(/\s+/).length;
      let end = line.end ?? line.start + Math.min(Math.max(2.5, count * 0.45), 7);
      if (next) end = Math.min(end, next.start);
      const entry = { start: line.start, end, text: line.text, words: line.words || null };
      if (!entry.words) entry.words = estimateWords(entry);
      out.push(entry);
      if (next && next.start - end >= INTERLUDE_MIN) out.push({ interlude: true, start: end, end: next.start });
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Lookup
  // ---------------------------------------------------------------------------
  async function findLyrics(t) {
    const res = await chrome.runtime.sendMessage({ type: "lyrics:lookup", track: t }).catch(() => null);
    if (res?.synced) {
      const lines = withInterludes(parseLrc(res.synced));
      if (lines.some((l) => !l.interlude)) return { kind: "synced", lines, source: "LRCLIB", href: "https://lrclib.net/" };
    }
    if (res?.plain) {
      const lines = res.plain.split(/\r?\n/).map((text) => ({ text: text.trim() }));
      return { kind: "plain", lines, source: "LRCLIB", href: "https://lrclib.net/" };
    }
    if (res?.instrumental) {
      return { kind: "plain", lines: [{ text: "♪ Instrumental ♪" }], source: "LRCLIB", href: "https://lrclib.net/" };
    }
    return null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const OUT_MS = 260; // old lyrics slide away before the new ones come in
  const IN_MS = 1400; // long enough for the staggered entrance to finish

  function setPhase(phase) {
    if (!view) return;
    if (phase) view.dataset.phase = phase;
    else delete view.dataset.phase;
  }

  // Song change: old lines drift up and fade, a loader appears only if the
  // lookup is still running, then the new lines rise in, staggered outward
  // from the line being sung.
  async function onTrack(t) {
    track = t;
    const my = ++token;
    const showing = state === "synced" || state === "plain";
    let result = cache.get(t.key);
    const lookup =
      result !== undefined
        ? Promise.resolve(result)
        : findLyrics(t).then((r) => {
            cache.set(t.key, r);
            if (cache.size > 150) cache.delete(cache.keys().next().value);
            return r;
          });
    if (showing) {
      setPhase("out");
      await sleep(OUT_MS);
      if (my !== token) return;
    }
    let settled = false;
    lookup.then(() => (settled = true));
    await null;
    if (!settled) {
      lyrics = null;
      activeIndex = -1;
      render();
      setPhase(null);
      setState("loading");
      result = await Promise.race([lookup, sleep(LOOKUP_TIMEOUT).then(() => null)]);
    } else {
      result = await lookup;
    }
    if (my !== token || !enabled) return;
    lyrics = result;
    activeIndex = -1;
    render();
    setPhase(result ? "in" : null);
    setState(result ? result.kind : "none");
    if (result) {
      view.scrollTop = 0;
      setTimeout(() => my === token && setPhase(null), IN_MS);
    }
  }

  // The current track from the Media Session (set by Spotify for media keys).
  let pendingKey = null;
  let pendingPolls = 0;
  function readTrack() {
    const meta = navigator.mediaSession?.metadata;
    if (!meta?.title || !meta.artist) return;
    if (BYTM.adblock?.isAd()) return;
    const key = `${meta.title}\u0000${meta.artist}`;
    if (track?.key === key) return;
    // Wait briefly for the new duration (LRCLIB matches on it), then go anyway.
    if (pendingKey !== key) {
      pendingKey = key;
      pendingPolls = 0;
    }
    const dur = duration();
    const prevDur = track?.duration;
    if ((!dur || dur === prevDur) && ++pendingPolls < 4) return;
    onTrack({ key, videoId: key, title: meta.title, artist: meta.artist, album: meta.album || "", duration: dur || 0 });
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------
  function cookiePath(lobes = 9, depth = 0.08, radius = 22) {
    const pts = [];
    for (let i = 0; i < 360; i += 3) {
      const a = (i * Math.PI) / 180;
      const r = radius * (1 - depth + depth * Math.cos(lobes * a));
      pts.push(`${(24 + r * Math.cos(a)).toFixed(2)} ${(24 + r * Math.sin(a)).toFixed(2)}`);
    }
    return `M${pts.join("L")}Z`;
  }

  function buildView() {
    view = document.createElement("div");
    view.className = "bytm-lyrics";
    view.toggleAttribute("data-karaoke", options.karaoke);
    loader = document.createElement("div");
    loader.className = "bytm-lyrics-loader";
    loader.setAttribute("role", "progressbar");
    loader.setAttribute("aria-label", "Loading lyrics");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", cookiePath());
    svg.append(path);
    loader.append(svg);
    list = document.createElement("div");
    list.className = "bytm-lyrics-lines";
    footer = document.createElement("p");
    footer.className = "bytm-lyrics-footer";
    view.append(loader, list, footer);
  }

  const seek = (time) =>
    document.dispatchEvent(new CustomEvent("bfs:seek", { detail: JSON.stringify({ time }) }));

  function render() {
    if (!view) buildView();
    list.replaceChildren();
    footer.replaceChildren();
    rows = [];
    if (!lyrics) return;
    view.dataset.kind = lyrics.kind;
    for (const line of lyrics.lines) {
      let el;
      if (line.interlude) {
        el = document.createElement("div");
        el.className = "bytm-line bytm-interlude";
        el.setAttribute("aria-hidden", "true");
        el.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
      } else if (lyrics.kind === "synced") {
        el = document.createElement("button");
        el.type = "button";
        el.className = "bytm-line";
        el.setAttribute("aria-label", line.text);
        for (const word of line.words) {
          const span = document.createElement("span");
          span.className = "bytm-w";
          span.textContent = word.text;
          el.append(span);
        }
        el.addEventListener("click", () => {
          userScrollUntil = 0;
          seek(Math.max(0, line.start - 0.05));
        });
      } else {
        el = document.createElement("p");
        el.className = "bytm-line";
        el.textContent = line.text || " ";
      }
      rows.push(el);
      list.append(el);
    }
    footer.append(lyrics.kind === "synced" ? "Synced lyrics from " : "Lyrics from ");
    const a = document.createElement("a");
    a.href = lyrics.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = lyrics.source;
    footer.append(a);
    kick(true);
  }

  function setState(next) {
    state = next;
    if (view) view.dataset.state = next;
    syncRoot();
    kick(true);
  }

  // ---------------------------------------------------------------------------
  // Mounting into Spotify's Lyrics view
  // ---------------------------------------------------------------------------
  const isShown = (el) => el.getClientRects().length > 0;

  // Spotify can render several (page, Now Playing panel, cinema); use the biggest one shown.
  function pickRoot() {
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll(ROOTS)) {
      if (!isShown(el)) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height + (el.closest("#lyrics-cinema") ? 1e9 : 0);
      if (area > bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  // What we show in a root: our synced lyrics always win; plain ones only fill a gap.
  function modeFor(root) {
    if (!root || !enabled) return "none";
    if (state === "loading") return "loading";
    if (state === "synced") return "synced";
    if (state === "plain" && !root.querySelector(SPOTIFY_LINE)) return "plain";
    return "none";
  }

  function syncRoot() {
    for (const el of document.querySelectorAll("[data-bytm-lyrics-root]")) {
      if (el !== mountedRoot) el.removeAttribute("data-bytm-lyrics-root");
    }
    if (mountedRoot) mountedRoot.dataset.bytmLyricsRoot = modeFor(mountedRoot);
  }

  function hookScroller(el) {
    if (!el || hookedScrollers.has(el)) return;
    hookedScrollers.add(el);
    const pause = () => {
      if (view?.isConnected) userScrollUntil = performance.now() + USER_SCROLL_GRACE;
    };
    el.addEventListener("wheel", pause, { passive: true });
    el.addEventListener("touchmove", pause, { passive: true });
    el.addEventListener("keydown", (e) => {
      if (/^(Arrow|Page|Home|End)/.test(e.key)) pause();
    });
  }

  function mount() {
    const root = pickRoot();
    if (root !== mountedRoot) {
      mountedRoot?.removeAttribute("data-bytm-lyrics-root");
      mountedRoot = root;
      scroller = null;
      if (root) {
        if (!view) buildView();
        view.dataset.state = state;
        root.append(view);
        userScrollUntil = 0;
        kick(true);
      } else {
        view?.remove();
      }
    } else if (root && view && view.parentElement !== root) {
      root.append(view); // React re-rendered the root's children
    }
    syncRoot();
    if (root && view) {
      // Our view scrolls inside Spotify's fixed-height panel, so the album-colored
      // background stays put instead of scrolling away with the text.
      scroller = view;
      hookScroller(view);
    }
  }

  // ---------------------------------------------------------------------------
  // Playback sync
  // ---------------------------------------------------------------------------
  const visible = () => !!view && view.isConnected && isShown(view) && !document.hidden;

  function indexAt(time) {
    const lines = lyrics.lines;
    let lo = 0, hi = lines.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].start <= time + LEAD) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }

  let wordProgress = [];

  function setActive(index, jump) {
    if (view.dataset.phase === "in" && jump) {
      for (let i = 0; i < rows.length; i++) rows[i].style.setProperty("--i", Math.min(Math.abs(i - Math.max(index, 0)), 10));
    }
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("bytm-active", i === index);
      rows[i].classList.toggle("bytm-past", i < index);
    }
    activeIndex = index;
    wordProgress = [];
    scrollToActive(jump);
  }

  function scrollToActive(jump) {
    if (!jump && performance.now() < userScrollUntil) return;
    const row = rows[Math.max(activeIndex, 0)];
    if (!scroller || !row) return;
    const s = scroller.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const top = scroller.scrollTop + (r.top - s.top) - s.height * 0.38;
    scroller.scrollTo({ top: Math.max(0, top), behavior: jump || reduceMotion.matches ? "auto" : "smooth" });
  }

  function paintWords(index, t) {
    const line = lyrics.lines[index];
    const spans = rows[index].children;
    for (let w = 0; w < line.words.length; w++) {
      const word = line.words[w];
      const p = Math.min(Math.max((t - word.start) / Math.max(word.end - word.start, 0.05), 0), 1);
      const rounded = Math.round(p * 200) / 200;
      if (wordProgress[w] !== rounded) {
        wordProgress[w] = rounded;
        spans[w].style.setProperty("--wp", rounded);
      }
    }
  }

  function frame(forceScroll) {
    raf = 0;
    if (!enabled || state !== "synced" || !lyrics || !visible() || view.dataset.phase === "out") return;
    const raw = now();
    if (raw == null) return;
    const time = raw - DELAY;
    const index = indexAt(time);
    if (index !== activeIndex || forceScroll === true) setActive(index, forceScroll === true);
    const t = time + LEAD * 0.4;
    const line = lyrics.lines[index];
    if (line?.interlude) {
      const p = Math.min(Math.max((t - line.start) / (line.end - line.start), 0), 1);
      rows[index].style.setProperty("--p", p.toFixed(3));
    } else if (line && options.karaoke) {
      paintWords(index, t);
    }
    if (isPlaying()) raf = requestAnimationFrame(frame);
  }

  function kick(forceScroll) {
    if (forceScroll === true) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      requestAnimationFrame(() => frame(true));
    } else if (!raf) {
      raf = requestAnimationFrame(frame);
    }
  }

  BYTM.lyrics = {
    debug: () => ({ enabled, state, track, clock, now: now(), root: !!mountedRoot }),
    configure(settings) {
      options = { karaoke: settings.lyricsKaraoke };
      view?.toggleAttribute("data-karaoke", options.karaoke);
      kick(true);
    },
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      if (on) {
        track = null;
        this.poll();
      } else {
        token++;
        view?.remove();
        mountedRoot?.removeAttribute("data-bytm-lyrics-root");
        mountedRoot = null;
      }
    },
    poll() {
      if (!enabled) return;
      readTrack();
      mount();
      kick();
    },
  };
})();
