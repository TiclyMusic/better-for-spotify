# Better for Spotify

The Spotify Web Player (open.spotify.com) in Material 3 Expressive, with letter-by-letter synced lyrics, ad muting and a lighter app. Same design system as Better for YouTube Music and Better for YouTube.

## Features

**Look**
- **M3 Expressive theme.** Spotify's Encore tokens are mapped to M3 roles: tonal surfaces, rounded panels, pill search, M3 buttons, menus and dialogs. Artist pictures stay circular.
- **Dynamic color** from the album art of what's playing.
- **Wavy progress bar** under Spotify's own slider (seeking and keyboard unchanged). It waves while playing and rests flat when paused.
- **Floating player card** with a play button that's a circle when paused and a squircle when playing.
- **Expressive type.** Google Sans Flex everywhere, lyrics included (it also overrides the fonts Spotify forces for some languages, Italian included).
- **Miniplayer.** Spotify's picture-in-picture window gets the same theme: the styles are injected into it and the theme and palette are mirrored from the main page.
- **Minimal interface.** No install prompt, sidebar footer or page footer.

**Lyrics**
- **Synced lyrics from [LRCLIB](https://lrclib.net)** inside Spotify's Lyrics view, the Now Playing panel and full-screen mode, with a **karaoke fill** letter by letter. Tap a line to jump there (through Spotify's own Media Session seek).
- When LRCLIB has nothing, Spotify's own lyrics stay, restyled.
- Smooth song changes: the old lines slide away, the new ones rise in from the line being sung. The lyrics scroll inside Spotify's panel, so its album-colored background stays still.
- Precise timing from the Media Session position and the player's media element (`src/content/page-bridge.js`, MAIN world).

**Ads**
- **Mute ads** (after [Blockify](https://github.com/clairefro/blockify) by Claire Froelich, reimplemented): when Spotify's tab title says an ad is playing, the tab is muted and unmuted as soon as the music is back. Tabs you muted yourself stay muted. Ads still play; nothing is blocked.
- **Filler music** (off by default): soft chords generated in an offscreen document while the ad is muted.

**Speed**
- **Block trackers:** Sentry crash reporting and third-party analytics. Spotify's play counts are never blocked.
- **Lightweight effects:** no noise texture, no live blurs. **Lazy rendering** of off-screen shelves.

**Quality of life**
- **Scroll for volume** over the player bar, with an M3 indicator.
- **Hide Premium upsells.**

Every feature is a switch in the popup and applies instantly.

## Install

`chrome://extensions` → Developer mode → **Load unpacked** → select this `better-for-spotify/` folder.

## Files

```
manifest.json, rules/, icons/   the extension
src/background.js               service worker: defaults, tracker ruleset, ad muting, filler music, LRCLIB lookups
src/offscreen/                  generated filler music (offscreen document)
src/content/                    theme.css, pip.css, wavy, tweaks, adblock, lyrics, main, page-bridge (MAIN world)
src/popup/                      settings popup
store/                          Chrome Web Store kit (see store/README.md)
```

`src/shared/m3-tokens.css`, `src/shared/color.js`, `src/shared/lyrics-lookup.js` and `src/popup/popup.{js,css}` are generated copies of `../shared/`. Edit the originals there, then run `node tools/sync-shared.mjs` from the `Extensions/` folder.

## Download

Get the latest build from the [Releases page](https://github.com/TiclyMusic/better-for-spotify/releases/latest). Unzip it, open `chrome://extensions`, enable Developer mode and use **Load unpacked**.

## Other extensions

- [Better for YouTube Music](https://github.com/TiclyMusic/better-for-yt-music)
- [Better for YouTube](https://github.com/TiclyMusic/better-for-youtube)
