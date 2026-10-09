/* GENERATED from shared/lyrics-lookup.js by tools/sync-shared.mjs — edit the original. */
// LRCLIB (https://lrclib.net) lookup, shared by the extension's service worker
// (importScripts) and the desktop app's main process (require).
(function (root) {
  const LRCLIB = "https://lrclib.net/api";
  const MAX_DURATION_DIFF = 3; // seconds

  // "Song (Official Video) [Remastered] feat. X" -> "Song"
  function cleanTitle(title) {
    return title
      .replace(/\s*[([][^)\]]*\b(official|video|audio|lyrics?|visuali[sz]er|mv|remaster(ed)?|live|version|explicit|clean|hd|4k)\b[^)\]]*[)\]]/gi, "")
      .replace(/\s*[([]?\s*\b(feat|ft)\.?\s[^)\]]*[)\]]?/gi, "")
      .replace(/\s+-\s+topic$/i, "")
      .trim();
  }

  // Split only on unambiguous separators ("and"/"x" appear inside real names).
  function primaryArtist(artist) {
    return artist.split(/\s*(?:,|&|\bfeat\.?\s|\bft\.?\s)\s*/i)[0].trim();
  }

  function pickBest(results, duration) {
    const fits = (r) => !duration || Math.abs((r.duration || 0) - duration) <= MAX_DURATION_DIFF;
    const byCloseness = (a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration);
    const candidates = results.filter(fits).sort(byCloseness);
    return candidates.find((r) => r.syncedLyrics) || candidates.find((r) => r.plainLyrics) || null;
  }

  // track: { title, artist, album, duration }; opts: { fetch, client }
  async function lookupLyrics(track, opts) {
    const doFetch = opts.fetch;
    const headers = { "Lrclib-Client": opts.client };
    const get = async (path, params) => {
      const res = await doFetch(`${LRCLIB}/${path}?${new URLSearchParams(params)}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
      return res.json();
    };
    const shaped = (r) =>
      r && {
        id: r.id,
        synced: r.syncedLyrics || null,
        plain: r.plainLyrics || null,
        instrumental: !!r.instrumental,
      };

    const { title, artist, album, duration } = track;
    const name = cleanTitle(title) || title;

    // 1. Exact signature match (fast, cached server-side).
    if (duration) {
      const exact = await get("get", {
        track_name: name,
        artist_name: artist,
        album_name: album || "",
        duration: Math.round(duration),
      }).catch(() => null);
      if (exact && (exact.syncedLyrics || exact.instrumental)) return shaped(exact);
    }

    // 2. Fuzzy search, filtered by duration so we never show another version's timing.
    for (const params of [
      { track_name: name, artist_name: primaryArtist(artist) },
      { q: `${name} ${primaryArtist(artist)}` },
    ]) {
      const results = await get("search", params).catch(() => null);
      const best = Array.isArray(results) && pickBest(results, duration);
      if (best) return shaped(best);
    }
    return null;
  }

  const api = { lookupLyrics, cleanTitle, primaryArtist };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BYTM_LYRICS = api;
})(globalThis);
