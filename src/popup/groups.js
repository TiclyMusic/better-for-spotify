// Popup content for Better for Spotify (popup.js itself is shared, see tools/sync-shared.mjs).
var BYTM_POPUP = (() => {
  const ICONS = {
    palette:
      "M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z",
    bolt: "M7 2v11h3v9l7-12h-4l4-8z",
    lyrics:
      "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z",
    sparkle: "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z",
  };

  const GROUPS = [
    {
      title: "Look",
      icon: "palette",
      rows: [
        { key: "theme", title: "Material 3 Expressive", sub: "Tonal surfaces, bold shapes and springy motion" },
        { key: "dynamicColor", title: "Dynamic color", sub: "Build the palette from the album art of what's playing", needsTheme: true },
        { key: "wavyProgress", title: "Wavy progress bar", sub: "Animated M3 wave that rests flat when paused", needsTheme: true },
        { key: "expressiveType", title: "Expressive type", sub: "Google Sans Flex with rounded display styles", needsTheme: true },
        { key: "minimalUI", title: "Minimal interface", sub: "No install prompt, sidebar footer or page footer" },
      ],
      accent: true,
    },
    {
      title: "Speed",
      icon: "bolt",
      rows: [
        { key: "blockTelemetry", title: "Block trackers", sub: "Crash reporting and third-party analytics; play counts still reach artists" },
        { key: "lightEffects", title: "Lightweight effects", sub: "No noise texture or live background blurs" },
        { key: "lazyRender", title: "Lazy rendering", sub: "Skip layout and paint for off-screen shelves" },
      ],
    },
    {
      title: "Lyrics",
      icon: "lyrics",
      rows: [
        { key: "syncedLyrics", title: "Synced lyrics", sub: "Time-synced lyrics from LRCLIB in Spotify's Lyrics view; tap a line to jump there" },
        { key: "lyricsKaraoke", title: "Karaoke fill", sub: "Fill the line letter by letter as it's sung", needs: "syncedLyrics" },
      ],
    },
    {
      title: "Quality of life",
      icon: "sparkle",
      rows: [
        { key: "blockAds", title: "Mute ads", sub: "Silence audio ads and unmute when the music is back (after Blockify)" },
        { key: "adFiller", title: "Filler music during ads", sub: "Soft generated chords instead of silence", needs: "blockAds" },
        { key: "wheelVolume", title: "Scroll for volume", sub: "Scroll over the player bar to adjust volume" },
        { key: "hideUpsells", title: "Hide Premium upsells", sub: "Remove upgrade buttons and promos" },
      ],
    },
  ];

  return {
    hero: { sides: 5, radius: 48, round: 14.4, color: "rgb(58 210 86)" },
    icons: ICONS,
    groups: GROUPS,
    appUrl: "https://open.spotify.com/",
    openLabel: "Open Spotify",
    paletteFromLast: "Palette from the last track you played",
    paletteWaiting: "Play something to pick up its colors",
  };
})();
