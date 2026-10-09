/* GENERATED from shared/color.js by tools/sync-shared.mjs — edit the original. */
// Dynamic color: sample album art, pick a seed (hue + chroma in OKLCH) and
// hand it to CSS, which derives the whole M3 tonal scheme with oklch().
(() => {
  const SAMPLE = 48; // px, square downsample
  const cache = new Map(); // art URL -> seed | null

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  // sRGB 0-255 -> OKLCH { l, c, h(deg) }
  function toOklch(r, g, b) {
    const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const h = (Math.atan2(B, A) * 180) / Math.PI;
    return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
  }

  // Score hue buckets the way Material's quantizer/scorer does in spirit:
  // favor colors that are both common and chromatic, ignore near-greys.
  function scorePixels(data) {
    const BUCKETS = 36;
    const count = new Float64Array(BUCKETS);
    const chroma = new Float64Array(BUCKETS);
    const sinSum = new Float64Array(BUCKETS);
    const cosSum = new Float64Array(BUCKETS);
    let total = 0, colorful = 0;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      total++;
      const { l, c, h } = toOklch(data[i], data[i + 1], data[i + 2]);
      if (c < 0.035 || l < 0.18 || l > 0.96) continue;
      colorful++;
      const b = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
      const w = Math.min(c, 0.25);
      count[b] += 1;
      chroma[b] += c;
      const rad = (h * Math.PI) / 180;
      sinSum[b] += Math.sin(rad) * w;
      cosSum[b] += Math.cos(rad) * w;
    }
    if (!total || colorful / total < 0.04) return null; // effectively greyscale art

    let best = -1, bestScore = -Infinity;
    for (let b = 0; b < BUCKETS; b++) {
      // Smooth with neighbours so a hue spread over two buckets isn't penalized.
      const n = count[b] + 0.5 * (count[(b + 1) % BUCKETS] + count[(b + BUCKETS - 1) % BUCKETS]);
      if (!count[b]) continue;
      const proportion = n / total;
      const avgChroma = chroma[b] / count[b];
      const score = proportion * 0.7 + avgChroma * 1.6;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (best < 0) return null;
    let h = (Math.atan2(sinSum[best], cosSum[best]) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { h, c: chroma[best] / count[best] };
  }

  function smallArtUrl(url) {
    // googleusercontent: "...=w544-h544-l90-rj" -> tiny square
    if (/googleusercontent\.com/.test(url)) return url.replace(/=[^/=]*$/, "") + `=w${SAMPLE}-h${SAMPLE}`;
    // i.ytimg.com video thumbnails: use the smallest variant
    return url.replace(/\/(maxresdefault|sddefault|hqdefault|mqdefault)\.jpg/, "/default.jpg");
  }

  BYTM.largeArtUrl = function largeArtUrl(url) {
    if (/googleusercontent\.com/.test(url)) return url.replace(/=[^/=]*$/, "") + "=w1200-h1200";
    return url;
  };

  // A tiny, pre-blurred copy of the artwork. Stretched to full screen, bilinear
  // upscaling makes it look heavily blurred for free — no CSS filter, so the
  // compositor never re-runs a huge blur while lyrics scroll on top of it.
  const BACKDROP = 20;
  async function makeBackdrop(bitmap) {
    const canvas = new OffscreenCanvas(BACKDROP, BACKDROP);
    const ctx = canvas.getContext("2d");
    ctx.filter = "blur(1.5px) saturate(1.5)";
    ctx.drawImage(bitmap, -3, -3, BACKDROP + 6, BACKDROP + 6); // overscan hides blurred edges
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  // -> { seed: {h, c} | null, backdrop: dataURL | null }
  BYTM.analyzeArt = async function analyzeArt(url) {
    const key = smallArtUrl(url);
    if (cache.has(key)) return cache.get(key);
    const result = { seed: null, backdrop: null };
    try {
      const res = await fetch(key, { mode: "cors", credentials: "omit" });
      const bitmap = await createImageBitmap(await res.blob(), {
        resizeWidth: SAMPLE, resizeHeight: SAMPLE, resizeQuality: "low",
      });
      const canvas = new OffscreenCanvas(SAMPLE, SAMPLE);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      result.seed = scorePixels(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data);
      result.backdrop = await makeBackdrop(bitmap);
      bitmap.close();
    } catch (err) {
      console.debug("[Better YTM] artwork analysis failed", err);
    }
    if (cache.size > 200) cache.clear();
    cache.set(key, result);
    return result;
  };

  // Keep hue unwrapped so CSS transitions take the short way round the wheel.
  let lastHue = null;
  BYTM.setPalette = function setPalette(hue, chroma) {
    if (lastHue !== null) {
      while (hue - lastHue > 180) hue -= 360;
      while (lastHue - hue > 180) hue += 360;
    }
    lastHue = hue;
    const style = document.documentElement.style;
    style.setProperty("--bytm-hue", hue.toFixed(2));
    style.setProperty("--bytm-chroma", chroma.toFixed(4));
    return { hue: ((hue % 360) + 360) % 360, chroma };
  };

  // seed: { h, c } from extractSeed, or null for greyscale art / no art.
  BYTM.applySeed = function applySeed(seed, fallbackHue, fallbackChroma = 0.06) {
    if (!seed) return BYTM.setPalette(fallbackHue, fallbackChroma);
    // Primary chroma: vivid but never garish.
    return BYTM.setPalette(seed.h, Math.min(Math.max(seed.c * 1.15, 0.085), 0.165));
  };
})();
