// Ad muting for Better for Spotify, after the idea in Blockify by Claire Froelich
// (https://github.com/clairefro/blockify): while an audio ad plays, the Web
// Player titles the tab "Spotify – …" instead of "Song • Artist". We report
// that to the service worker, which mutes this tab (and can play soft filler)
// and unmutes it as soon as the music is back. Ads still play through, so
// Spotify's ad cycle is untouched; you just don't hear them.
(() => {
  // En dash, as Spotify writes it; a plain hyphen too, in case that changes.
  const AD_TITLE = /^Spotify\s[–-]\s/;
  // The idle/home title also starts with "Spotify – ", but nothing plays then.
  const IDLE_TITLE = /^Spotify\s[–-]\s(Web Player|Webplayer)\b/i;

  let enabled = false;
  let reported = false;
  let chip = null;

  function isAd() {
    const title = document.title || "";
    if (!AD_TITLE.test(title) || IDLE_TITLE.test(title)) return false;
    // Only while something is actually loaded in the player.
    return !!document.querySelector('[data-testid="now-playing-bar"] [data-testid="playback-progressbar"]');
  }

  function showChip(on) {
    if (on && !chip) {
      chip = document.createElement("div");
      chip.className = "bytm-ad-chip";
      chip.setAttribute("role", "status");
      chip.textContent = "Ad muted · music is back in a moment";
      document.body.append(chip);
      requestAnimationFrame(() => chip && chip.classList.add("bytm-visible"));
    } else if (!on && chip) {
      const el = chip;
      chip = null;
      el.classList.remove("bytm-visible");
      setTimeout(() => el.remove(), 400);
    }
  }

  function report(ad) {
    if (ad === reported) return;
    reported = ad;
    showChip(ad);
    chrome.runtime.sendMessage({ type: "bfs-ad", ad }).catch(() => {});
  }

  function check() {
    if (!BYTM.alive()) return titleObserver?.disconnect();
    report(enabled && isAd());
  }

  // The title changes the instant the ad starts; observe it instead of waiting for the poll.
  let titleObserver = null;
  function watchTitle() {
    const title = document.querySelector("head > title");
    if (!title || titleObserver?.target === title) return;
    titleObserver?.disconnect();
    titleObserver = new MutationObserver(check);
    titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
    titleObserver.target = title;
  }

  BYTM.adblock = {
    isAd,
    setEnabled(on) {
      enabled = !!on;
      check();
    },
    poll() {
      watchTitle();
      check();
    },
  };

  // Leaving or reloading the page mid-ad must not leave the tab muted.
  window.addEventListener("pagehide", () => {
    if (reported) chrome.runtime.sendMessage({ type: "bfs-ad", ad: false }).catch(() => {});
  });
})();
