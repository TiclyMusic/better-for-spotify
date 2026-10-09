// Better for Spotify content-script entry point: settings -> <html data-bytm-*>
// attributes (the stylesheet keys off them), dynamic color from the album art
// of what's playing, and the play-state attribute for the morphing button.
(() => {
  const root = document.documentElement;
  const FONT_HREF =
    "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wdth,wght,ROND@6..144,25..151,1..1000,0..100&display=swap";

  const ATTRS = {
    theme: "data-bytm-theme",
    wavyProgress: "data-bytm-wavy",
    expressiveType: "data-bytm-type",
    minimalUI: "data-bytm-minimal",
    lightEffects: "data-bytm-light",
    lazyRender: "data-bytm-lazy",
    hideUpsells: "data-bytm-hide-upsells",
  };
  const THEME_ONLY = new Set(["expressiveType", "wavyProgress"]);

  let settings = { ...BYTM.DEFAULTS };
  let lastArt = null;
  let token = 0;
  let restored = false;

  function applyAttributes() {
    for (const [key, attr] of Object.entries(ATTRS)) {
      root.toggleAttribute(attr, !!settings[key] && (!THEME_ONLY.has(key) || settings.theme));
    }
  }

  let fontLink = null;
  function ensureFont() {
    const want = settings.theme && settings.expressiveType;
    if (want && !fontLink) {
      fontLink = document.createElement("link");
      fontLink.rel = "stylesheet";
      fontLink.href = FONT_HREF;
      (document.head || root).append(fontLink);
    } else if (!want && fontLink) {
      fontLink.remove();
      fontLink = null;
    }
  }

  // --- Dynamic color ------------------------------------------------------------------
  function currentArt() {
    const img = document.querySelector(
      '[data-testid="now-playing-bar"] [data-testid="cover-art-image"], [data-testid="now-playing-widget"] img'
    );
    const src = img?.getAttribute("src") && img.src;
    if (src && /^https:\/\/[^/]*scdn\.co\//.test(src)) return src;
    const art = navigator.mediaSession?.metadata?.artwork;
    const fromSession = art && art.length ? art[0].src : null;
    return fromSession && /^https:\/\//.test(fromSession) ? fromSession : null;
  }

  async function refreshPalette(force = false) {
    if (!settings.dynamicColor) return;
    const art = currentArt();
    if (!art || (art === lastArt && !force)) return;
    lastArt = art;
    const my = ++token;
    const { seed } = await BYTM.analyzeArt(art);
    if (my !== token) return;
    const palette = BYTM.applySeed(seed, settings.accentHue);
    BYTM.wavy.paletteChanged();
    chrome.storage.local.set({ lastPalette: palette }).catch(() => {});
  }

  function applyAccent() {
    const palette = BYTM.setPalette(settings.accentHue, 0.13);
    BYTM.wavy.paletteChanged();
    if (!settings.dynamicColor) chrome.storage.local.set({ lastPalette: palette }).catch(() => {});
  }

  // --- Settings -------------------------------------------------------------------------
  function applySettings(prev = {}) {
    applyAttributes();
    ensureFont();
    BYTM.wavy.setEnabled(settings.theme && settings.wavyProgress);
    BYTM.tweaks.configure(settings);
    BYTM.adblock.setEnabled(settings.blockAds);
    BYTM.lyrics.configure(settings);
    BYTM.lyrics.setEnabled(settings.syncedLyrics);
    if (prev.dynamicColor !== settings.dynamicColor || prev.accentHue !== settings.accentHue) {
      if (settings.dynamicColor && currentArt()) refreshPalette(true);
      else if (!settings.dynamicColor || !restored) applyAccent();
    }
  }

  applyAttributes(); // defaults first: no flash of the stock look

  Promise.all([BYTM.loadSettings(), chrome.storage.local.get("lastPalette")]).then(([loaded, { lastPalette }]) => {
    const prev = settings;
    settings = loaded;
    if (settings.dynamicColor && lastPalette) {
      BYTM.setPalette(lastPalette.hue, lastPalette.chroma);
      restored = true;
    }
    applySettings({ ...prev, dynamicColor: undefined });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const prev = { ...settings };
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue === undefined ? BYTM.DEFAULTS[key] : newValue;
    }
    applySettings(prev);
  });

  // --- Miniplayer ------------------------------------------------------------------------
  // page-bridge.js (MAIN world) puts these into the Picture-in-Picture window.
  const PIP_CSS = ["src/shared/m3-tokens.css", "src/content/theme.css", "src/content/pip.css"].map((f) =>
    chrome.runtime.getURL(f)
  );
  const sendPipCss = () => document.dispatchEvent(new CustomEvent("bfs:pip-css", { detail: JSON.stringify(PIP_CSS) }));
  document.addEventListener("bfs:pip-css-request", sendPipCss);
  sendPipCss();

  // --- Housekeeping poll ------------------------------------------------------------------
  function poll() {
    if (!BYTM.alive()) return clearInterval(BYTM.pollTimer);
    const { playing } = BYTM.playback.sample();
    root.toggleAttribute("data-bytm-playing", playing);
    BYTM.wavy.scan();
    BYTM.tweaks.poll();
    BYTM.adblock.poll();
    BYTM.lyrics.poll();
    refreshPalette().catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", poll, { once: true });
  else poll();
  BYTM.pollTimer = setInterval(poll, 500);
})();
