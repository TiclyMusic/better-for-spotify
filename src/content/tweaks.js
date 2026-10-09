// Quality-of-life features for Better for Spotify.
(() => {
  let options = {};

  // ---------------------------------------------------------------------------
  // Scroll over the player bar to change volume (5% steps), with an M3 indicator.
  // Spotify's volume slider is a React-controlled <input type=range> (0..1, step
  // 0.1). Setting it through the native value setter and dispatching "input"
  // makes React treat it as a real user change, so Spotify's state follows.
  const STEP = 0.05;
  let toast, toastLevel, toastLabel, toastTimer;

  function showVolumeToast(percent) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "bytm-volume-toast";
      toast.setAttribute("role", "status");
      const track = document.createElement("div");
      track.className = "bytm-volume-track";
      toastLevel = document.createElement("div");
      toastLevel.className = "bytm-volume-level";
      track.append(toastLevel);
      toastLabel = document.createElement("span");
      toastLabel.className = "bytm-volume-label";
      toast.append(track, toastLabel);
      document.body.append(toast);
    }
    toastLevel.style.width = `${percent}%`;
    toastLabel.textContent = percent === 0 ? "Muted" : `${Math.round(percent)}%`;
    toast.classList.add("bytm-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("bytm-visible"), 1100);
  }

  function nudgeVolume(direction) {
    const input = document.querySelector('[data-testid="volume-bar"] input[type="range"]');
    if (!input) return;
    const max = parseFloat(input.max) || 1;
    const current = parseFloat(input.value) || 0;
    const next = Math.round(Math.min(max, Math.max(0, current + direction * STEP * max)) * 1000) / 1000;
    input.step = "any"; // allow 5% steps; React restores its own step on the next render
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    showVolumeToast((next / max) * 100);
  }

  window.addEventListener(
    "wheel",
    (e) => {
      if (!options.wheelVolume || e.ctrlKey) return;
      if (!e.target.closest?.('[data-testid="now-playing-bar"]')) return;
      if (e.target.closest('[role="menu"], [role="dialog"]')) return;
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!dy) return;
      e.preventDefault();
      nudgeVolume(dy < 0 ? 1 : -1);
    },
    { passive: false, capture: true }
  );

  // ---------------------------------------------------------------------------
  // Upsell buttons in the top bar have no stable hooks, only text — but
  // "Premium" is a brand name and isn't translated, so it works in any locale.
  function tagUpsells() {
    for (const el of document.querySelectorAll("#global-nav-bar button, #global-nav-bar a")) {
      const text = `${el.textContent} ${el.getAttribute("aria-label") || ""}`;
      if (/premium/i.test(text)) el.dataset.bytmUpsell = "";
    }
  }

  BYTM.tweaks = {
    configure(settings) {
      options = settings;
    },
    poll() {
      if (options.hideUpsells) tagUpsells();
    },
  };
})();
