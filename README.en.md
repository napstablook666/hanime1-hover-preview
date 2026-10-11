<!-- Project image placeholder; add an asset later. -->

<h1 align="center">Hanime1 Hover Preview</h1>

<p align="center">A Tampermonkey userscript for muted hover previews on Hanime1 video cards, with evenly sampled clips and an approximately 10-second playback budget per cycle.</p>

<p align="center">
  <a href="./README.en.md">English</a> | <a href="./README.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/napstablook666/hanime1-hover-preview/blob/main/hanime1-hover-preview.user.js"><img src="https://img.shields.io/badge/JavaScript-userscript-3776AB?style=flat-square" alt="JavaScript userscript"></a>
  <a href="https://github.com/napstablook666/hanime1-hover-preview"><img src="https://img.shields.io/github/stars/napstablook666/hanime1-hover-preview?style=flat-square" alt="GitHub stars"></a>
</p>

## Highlights

| Capability | Description |
|---|---|
| Muted hover preview | Plays short clips while hovering a video thumbnail and stops when the pointer leaves |
| Timeline sampling | Spreads sample points evenly across the video timeline |
| Preview time budget | Limits sampled clip playback to about 10 seconds per cycle |
| Adjustable settings | Configure clip length, hover delay, sampling interval, and quality |

## Quick Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [raw userscript](https://raw.githubusercontent.com/napstablook666/hanime1-hover-preview/main/hanime1-hover-preview.user.js) and confirm installation in Tampermonkey. See [Tampermonkey's script installation guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q102).

## Quick Start

1. Open a page with video cards on `hanime1.me` or `www.hanime1.me`.
2. Hover over a video thumbnail to start the preview. Move the pointer away to stop it.
3. Click the `Preview` button in the bottom-right corner to open the settings.

## Settings

| Setting | Default | Range or options |
|---|---:|---|
| Clip length | 1 second | 0.1–10 seconds |
| Hover delay | 50 ms | 0–2000 ms |
| Sampling interval | 8% | 1–100% |
| Quality | 360p | 360p, 480p, 720p, 1080p |

Settings are stored in the current site's `localStorage`.

## Releases

Push a version tag matching the script's `@version` (for example, `v1.0.0`) to GitHub. The workflow checks the script syntax and attaches the `.user.js` file to the GitHub Release.
