importScripts("shared/settings.js", "shared/lyrics-lookup.js");

const RULESET = "telemetry";

async function syncTelemetryRuleset() {
  const { blockTelemetry } = await BYTM.loadSettings();
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    blockTelemetry ? { enableRulesetIds: [RULESET] } : { disableRulesetIds: [RULESET] }
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(null);
  const missing = {};
  for (const [key, value] of Object.entries(BYTM.DEFAULTS)) {
    if (!(key in stored)) missing[key] = value;
  }
  if (Object.keys(missing).length) await chrome.storage.sync.set(missing);
  await syncTelemetryRuleset();
});

chrome.runtime.onStartup.addListener(syncTelemetryRuleset);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if ("blockTelemetry" in changes) syncTelemetryRuleset();
  if ("adFiller" in changes && changes.adFiller.newValue === false) stopFiller();
});

// --- Ad muting (see content/adblock.js) ---------------------------------------------
// Tabs we muted live in session storage so a restarted service worker still
// knows which ones to unmute, and a tab the user muted themselves is never
// unmuted by us.
async function mutedByUs() {
  const { adMutedTabs = [] } = await chrome.storage.session.get("adMutedTabs");
  return new Set(adMutedTabs);
}
async function saveMuted(set) {
  await chrome.storage.session.set({ adMutedTabs: [...set] });
}

async function onAd(tabId, ad) {
  const muted = await mutedByUs();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  if (ad) {
    if (!tab.mutedInfo?.muted) {
      await chrome.tabs.update(tabId, { muted: true });
      muted.add(tabId);
      await saveMuted(muted);
    }
    if (muted.has(tabId) && (await BYTM.loadSettings()).adFiller) startFiller();
  } else if (muted.has(tabId)) {
    muted.delete(tabId);
    await saveMuted(muted);
    if (!muted.size) await stopFiller();
    // Spotify fades the next track in; a short pause avoids the ad's last syllable.
    setTimeout(() => chrome.tabs.update(tabId, { muted: false }).catch(() => {}), 600);
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "bfs-ad" && sender.tab?.id != null) onAd(sender.tab.id, !!message.ad);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const muted = await mutedByUs();
  if (!muted.delete(tabId)) return;
  await saveMuted(muted);
  if (!muted.size) await stopFiller();
});

// --- Filler music -------------------------------------------------------------------
// A soft synthesized pad in an offscreen document (the Spotify tab is muted, so
// it can't play there). Generated, not bundled: no extra files or licenses.
let creating = null;
async function startFiller() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (!existing.length) {
    creating ||= chrome.offscreen
      .createDocument({
        url: "src/offscreen/filler.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Soft filler music while a muted Spotify ad plays",
      })
      .finally(() => (creating = null));
    await creating;
  }
}

async function stopFiller() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) await chrome.offscreen.closeDocument().catch(() => {});
}

// --- Lyrics lookup (LRCLIB) for content/lyrics.js, with a small in-memory cache ------
const LRCLIB_CLIENT = `Better for Spotify v${chrome.runtime.getManifest().version}`;
const lyricsCache = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "lyrics:lookup") return false;
  const key = msg.track.key;
  if (!lyricsCache.has(key)) {
    const pending = BYTM_LYRICS.lookupLyrics(msg.track, { fetch, client: LRCLIB_CLIENT }).catch((err) => {
      lyricsCache.delete(key); // allow a retry after network errors
      console.warn("[Better for Spotify] lyrics lookup failed", err);
      return null;
    });
    lyricsCache.set(key, pending);
    if (lyricsCache.size > 300) lyricsCache.delete(lyricsCache.keys().next().value);
  }
  lyricsCache.get(key).then(sendResponse);
  return true; // async response
});
