// Runs in the page's MAIN world at document_start. Spotify's player isn't
// reachable from the content script, so this relays its exact position:
//  - Media Session: Spotify calls setPositionState() on play/pause/seek and
//    sets playbackState; we forward both.
//  - The <audio>/<video> it plays through (usually not in the DOM): we hook
//    play() to find it and forward its timeupdate/seeked/pause events.
// Seeking goes through Spotify's own "seekto" Media Session handler, the same
// path as the keyboard media keys, so its player state stays consistent.
(() => {
  if (window.__bfsBridge) return;
  window.__bfsBridge = true;

  const emit = (data) =>
    document.dispatchEvent(new CustomEvent("bfs:clock", { detail: JSON.stringify({ ...data, at: performance.now() }) }));

  // --- Media Session ------------------------------------------------------------------
  const handlers = {};
  const proto = window.MediaSession && MediaSession.prototype;
  if (proto) {
    const setHandler = proto.setActionHandler;
    proto.setActionHandler = function (action, handler) {
      handlers[action] = handler;
      return setHandler.call(this, action, handler);
    };
    const setPosition = proto.setPositionState;
    if (setPosition) {
      proto.setPositionState = function (state) {
        if (state && isFinite(state.position)) {
          emit({ src: "session", t: state.position, dur: state.duration || 0, rate: state.playbackRate || 1 });
        }
        return setPosition.apply(this, arguments);
      };
    }
    const desc = Object.getOwnPropertyDescriptor(proto, "playbackState");
    if (desc?.set) {
      Object.defineProperty(proto, "playbackState", {
        ...desc,
        set(value) {
          desc.set.call(this, value);
          emit({ src: "state", paused: value !== "playing" });
        },
      });
    }
  }

  // --- Media element --------------------------------------------------------------------
  const hooked = new WeakSet();
  const report = (el) => {
    if (!(el.duration > 5)) return; // silence clips / playability probes, not tracks
    emit({ src: "media", t: el.currentTime, dur: el.duration || 0, rate: el.playbackRate, paused: el.paused });
  };
  const onEvent = (e) => report(e.currentTarget);
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!hooked.has(this)) {
      hooked.add(this);
      for (const type of ["playing", "pause", "seeked", "timeupdate", "ratechange"]) this.addEventListener(type, onEvent);
    }
    return play.apply(this, arguments);
  };

  // --- Miniplayer (Document Picture-in-Picture) ---------------------------------------
  // Spotify copies only the page's own style sheets into the PiP window; extension
  // styles aren't among them. Add ours (URLs come from the content script) and
  // mirror <html>'s data-bytm-* attributes and palette so the same rules apply.
  let pipCss = [];
  let pipWin = null;
  let mirrorObserver = null;

  function mirror(doc) {
    const from = document.documentElement;
    const to = doc.documentElement;
    for (const { name } of [...to.attributes]) {
      if (name.startsWith("data-bytm") && !from.hasAttribute(name)) to.removeAttribute(name);
    }
    for (const { name, value } of from.attributes) {
      if (name.startsWith("data-bytm") && to.getAttribute(name) !== value) to.setAttribute(name, value);
    }
    to.setAttribute("data-bytm-pip", "");
    for (const prop of ["--bytm-hue", "--bytm-chroma"]) {
      const value = from.style.getPropertyValue(prop);
      if (value) to.style.setProperty(prop, value);
    }
  }

  function dress(win) {
    const doc = win.document;
    if (!doc.head || !pipCss.length) return;
    const ours = [...doc.head.querySelectorAll("link[data-bytm]")];
    // Keep ours present and last, so they win over the sheets Spotify copies in.
    const inOrder = ours.length === pipCss.length && doc.head.lastElementChild === ours[ours.length - 1];
    if (!inOrder) {
      for (const href of pipCss) {
        let link = ours.find((l) => l.getAttribute("href") === href);
        if (!link) {
          link = doc.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          link.dataset.bytm = "";
        }
        doc.head.append(link);
      }
    }
    mirror(doc);
  }

  function adopt(win) {
    pipWin = win;
    dress(win);
    const headObserver = new MutationObserver(() => dress(win));
    const watchHead = () => win.document.head && headObserver.observe(win.document.head, { childList: true });
    watchHead();
    setTimeout(() => (watchHead(), dress(win)), 0); // after Spotify swaps in its sheets
    mirrorObserver?.disconnect();
    const mirrorThis = new MutationObserver(() => mirror(win.document));
    mirrorThis.observe(document.documentElement, { attributes: true });
    mirrorObserver = mirrorThis;
    // Only tear down this window's observers: a late pagehide from an older
    // window must not disconnect the current one.
    win.addEventListener("pagehide", () => {
      headObserver.disconnect();
      mirrorThis.disconnect();
      if (mirrorObserver === mirrorThis) mirrorObserver = null;
      if (pipWin === win) pipWin = null;
    });
  }

  document.addEventListener("bfs:pip-css", (e) => {
    try {
      pipCss = JSON.parse(e.detail);
    } catch {
      return;
    }
    if (pipWin) dress(pipWin);
  });
  document.dispatchEvent(new CustomEvent("bfs:pip-css-request"));
  window.documentPictureInPicture?.addEventListener("enter", (e) => adopt(e.window));

  document.addEventListener("bfs:seek", (e) => {
    let time;
    try {
      time = JSON.parse(e.detail).time;
    } catch {
      return;
    }
    if (!isFinite(time)) return;
    if (handlers.seekto) handlers.seekto({ action: "seekto", seekTime: Math.max(0, time) });
    if (handlers.play && navigator.mediaSession.playbackState === "paused") handlers.play({ action: "play" });
  });
})();
