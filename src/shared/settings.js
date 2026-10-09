// Settings schema for Better for Spotify. Loaded by the content script, popup
// and service worker, so it must stay plain global JS.
var BYTM = globalThis.BYTM || (globalThis.BYTM = {});

BYTM.DEFAULTS = Object.freeze({
  // Look
  theme: true, // Material 3 Expressive restyle
  dynamicColor: true, // palette from the album art of what's playing
  wavyProgress: true, // M3 Expressive wavy progress bar
  expressiveType: true, // Google Sans Flex instead of Spotify Mix
  minimalUI: true, // hide install/upgrade prompts, sidebar footer, page footer
  accentHue: 185, // fallback hue (OKLCH degrees) before the first track / when dynamic color is off

  // Speed
  blockTelemetry: true, // crash reporting & third-party analytics (never play-count events)
  lightEffects: true, // no SVG noise texture, no live blurs
  lazyRender: true, // content-visibility on off-screen shelves

  // Lyrics
  syncedLyrics: true, // LRCLIB synced lyrics inside Spotify's Lyrics view
  lyricsKaraoke: true, // letter-by-letter fill of the line being sung

  // Quality of life
  blockAds: true, // mute the tab while an audio ad plays (after Blockify)
  adFiller: false, // soft generated filler music during muted ads
  wheelVolume: true, // scroll over the player bar to change volume
  hideUpsells: true, // Premium promos
});

BYTM.ACCENTS = Object.freeze([
  { name: "Teal", hue: 185 },
  { name: "Blue", hue: 250 },
  { name: "Violet", hue: 285 },
  { name: "Rose", hue: 0 },
  { name: "Coral", hue: 35 },
  { name: "Amber", hue: 75 },
  { name: "Green", hue: 145 },
]);

// After the extension is reloaded or updated, the old content script keeps
// running in tabs that were already open, but every chrome.* call then throws
// "Extension context invalidated". Polls check this and stop quietly.
BYTM.alive = function alive() {
  if (globalThis.bytmHost) return true; // desktop app: no extension context
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
};

BYTM.ext = function ext() {
  return (globalThis.bytmHost && globalThis.bytmHost.chrome) || chrome;
};

BYTM.loadSettings = async function loadSettings() {
  const stored = await BYTM.ext().storage.sync.get(null);
  return { ...BYTM.DEFAULTS, ...stored };
};
