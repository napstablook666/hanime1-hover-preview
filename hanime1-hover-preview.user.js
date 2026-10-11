// ==UserScript==
// @name         Hanime1 Hover Preview
// @namespace    local.hanime1.hover-preview
// @version      1.0.0
// @description  Preview short video segments by hovering Hanime1 cards.
// @match        https://hanime1.me/*
// @match        https://www.hanime1.me/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const SETTINGS_KEY = 'hanime1-hover-preview-settings-v3';
  const LEGACY_SETTINGS_KEY = 'hanime1-hover-preview-settings-v2';
  const OLDER_SETTINGS_KEY = 'hanime1-hover-preview-settings-v1';
  const DEFAULTS = {
    clipSeconds: 1,
    hoverDelay: 50,
    quality: 360,
    samplePercent: 8,
  };
  const QUALITIES = [360, 480, 720, 1080];
  const MAX_PREVIEW_SECONDS = 10;
  const pending = new Map();
  const active = new Map();
  const suppressedTitles = new Map();
  const sourceCache = new Map();
  let settings = loadSettings();

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function normalizeSettings(value) {
    const quality = Number(value.quality);
    return {
      clipSeconds: clamp(value.clipSeconds, 0.1, MAX_PREVIEW_SECONDS, DEFAULTS.clipSeconds),
      hoverDelay: clamp(value.hoverDelay, 0, 2000, DEFAULTS.hoverDelay),
      quality: QUALITIES.includes(quality) ? quality : DEFAULTS.quality,
      samplePercent: clamp(value.samplePercent, 1, 100, DEFAULTS.samplePercent),
    };
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
      const older = localStorage.getItem(OLDER_SETTINGS_KEY);
      const values = saved
        ? JSON.parse(saved)
        : {
            ...JSON.parse(legacy || older || '{}'),
            quality: DEFAULTS.quality,
            samplePercent: DEFAULTS.samplePercent,
            ...(legacy ? {} : {
              clipSeconds: DEFAULTS.clipSeconds,
              hoverDelay: DEFAULTS.hoverDelay,
            }),
          };
      return normalizeSettings({ ...DEFAULTS, ...values });
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function chooseSource(sources) {
    return [...sources].sort((left, right) => {
      const leftDistance = left.size ? Math.abs(left.size - settings.quality) : Number.MAX_SAFE_INTEGER;
      const rightDistance = right.size ? Math.abs(right.size - settings.quality) : Number.MAX_SAFE_INTEGER;
      return leftDistance - rightDistance;
    })[0];
  }

  async function getSources(pageUrl, signal) {
    if (sourceCache.has(pageUrl)) {
      return sourceCache.get(pageUrl);
    }

    const response = await fetch(pageUrl, {
      credentials: 'include',
      signal,
      headers: { Accept: 'text/html' },
    });
    if (!response.ok) {
      throw new Error(`watch page request failed: ${response.status}`);
    }

    const html = await response.text();
    const page = new DOMParser().parseFromString(html, 'text/html');
    const sources = [...page.querySelectorAll('video source[src]')]
      .map((element) => ({
        src: new URL(element.getAttribute('src'), pageUrl).href,
        size: Number(element.getAttribute('size')) || 0,
      }));

    if (!sources.length) {
      const preload = page.querySelector('link[rel="preload"][as="video"][href]');
      if (preload) {
        sources.push({ src: new URL(preload.href, pageUrl).href, size: 0 });
      }
    }
    if (!sources.length) {
      throw new Error('no video source found');
    }

    sourceCache.set(pageUrl, sources);
    return sources;
  }

  function waitForMetadata(video, signal) {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
      };
      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        handler(value);
      };
      const onMetadata = () => finish(resolve);
      const onError = () => finish(reject, new Error('video source failed'));
      const onAbort = () => finish(reject, new DOMException('preview aborted', 'AbortError'));

      video.addEventListener('loadedmetadata', onMetadata);
      video.addEventListener('error', onError);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function getSegmentCount(duration) {
    if (!(duration > 0)) return 0;

    const requestedCount = Math.ceil(100 / settings.samplePercent);
    const budgetCount = Math.max(1, Math.floor(MAX_PREVIEW_SECONDS / settings.clipSeconds));
    const durationCount = Math.max(1, Math.ceil(duration / settings.clipSeconds));
    return Math.min(requestedCount, budgetCount, durationCount);
  }

  function getStepSeconds(duration) {
    const segmentCount = getSegmentCount(duration);
    return segmentCount > 0 ? duration / segmentCount : 0;
  }

  function getSegmentClipSeconds(duration, segmentCount) {
    if (!segmentCount) return 0;
    return Math.min(
      settings.clipSeconds,
      MAX_PREVIEW_SECONDS / segmentCount,
      duration / segmentCount,
    );
  }

  function updatePreviewProgress(state) {
    if (!state.progressBar || !state.segmentCount || !state.clipSeconds) return;

    const currentTime = Number.isFinite(state.video.currentTime) ? state.video.currentTime : state.position;
    const elapsed = Math.min(
      state.clipSeconds,
      Math.max(0, currentTime - state.position),
    );
    const total = state.segmentCount * state.clipSeconds;
    const current = state.segmentIndex * state.clipSeconds + elapsed;
    state.progressBar.style.width = `${Math.min(100, current / total * 100)}%`;
  }

  function advanceSegment(state) {
    if (!state.active) return;

    const duration = Number.isFinite(state.video.duration) ? state.video.duration : 0;
    const stepSeconds = getStepSeconds(duration);
    const next = duration > 0 && state.position + stepSeconds < duration
      ? state.position + stepSeconds
      : 0;
    state.segmentIndex = next === 0 ? 0 : state.segmentIndex + 1;
    playSegment(state, next);
  }

  function playSegment(state, start) {
    if (!state.active) return;

    const duration = Number.isFinite(state.video.duration) ? state.video.duration : 0;
    state.position = duration > 0 && start < duration ? start : 0;
    state.video.currentTime = state.position;
    updatePreviewProgress(state);
    state.video.play().catch(() => stopPreview(state.thumb));
  }

  async function loadPreview(state, pageUrl) {
    try {
      const sources = await getSources(pageUrl, state.abortController.signal);
      if (!state.active) return;

      state.video.src = chooseSource(sources).src;
      state.video.load();
      await waitForMetadata(state.video, state.abortController.signal);
      if (!state.active) return;

      state.segmentCount = getSegmentCount(state.video.duration);
      state.clipSeconds = getSegmentClipSeconds(state.video.duration, state.segmentCount);
      state.onTimeUpdate = () => {
        updatePreviewProgress(state);
        if (state.video.currentTime - state.position >= state.clipSeconds) {
          advanceSegment(state);
        }
      };
      state.video.addEventListener('timeupdate', state.onTimeUpdate);
      state.video.addEventListener('ended', () => advanceSegment(state));
      playSegment(state, 0);
      state.thumb.classList.remove('hhp-thumb--loading');
      state.thumb.classList.add('hhp-thumb--active');
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.debug('[Hanime1 Hover Preview]', error.message);
      }
      stopPreview(state.thumb);
    }
  }

  function stopPreview(thumb) {
    const state = active.get(thumb);
    if (!state) return;

    state.active = false;
    state.abortController.abort();
    if (state.onTimeUpdate) {
      state.video.removeEventListener('timeupdate', state.onTimeUpdate);
    }
    state.video.pause();
    state.video.removeAttribute('src');
    state.video.load();
    state.video.remove();
    state.progress.remove();
    thumb.classList.remove('hhp-thumb--loading', 'hhp-thumb--active');
    active.delete(thumb);
  }

  function suppressCardTitles(thumb) {
    if (suppressedTitles.has(thumb)) return;

    const card = thumb.closest('.video-item-container');
    if (!card) return;

    const elements = [
      ...(card.matches('[title]') ? [card] : []),
      ...card.querySelectorAll('[title]'),
    ];
    const titles = elements.map((element) => ({
      element,
      value: element.getAttribute('title'),
    }));
    titles.forEach(({ element }) => element.removeAttribute('title'));
    suppressedTitles.set(thumb, titles);
  }

  function restoreCardTitles(thumb) {
    const titles = suppressedTitles.get(thumb);
    if (!titles) return;

    titles.forEach(({ element, value }) => {
      if (element.isConnected) element.setAttribute('title', value);
    });
    suppressedTitles.delete(thumb);
  }

  function startPreview(thumb) {
    if (!thumb.isConnected || !thumb.matches(':hover') || active.has(thumb)) return;

    const link = thumb.closest('.video-item-container')?.querySelector('a.video-link[href]');
    if (!link) return;

    const state = {
      thumb,
      video: document.createElement('video'),
      progress: document.createElement('div'),
      progressBar: document.createElement('div'),
      segmentIndex: 0,
      segmentCount: 0,
      clipSeconds: 0,
      onTimeUpdate: null,
      active: true,
      position: 0,
      abortController: new AbortController(),
    };
    state.progress.className = 'hhp-progress';
    state.progressBar.className = 'hhp-progress-bar';
    state.progress.appendChild(state.progressBar);
    state.video.className = 'hhp-video';
    state.video.muted = true;
    state.video.defaultMuted = true;
    state.video.playsInline = true;
    state.video.preload = 'auto';
    state.video.tabIndex = -1;
    state.video.setAttribute('aria-hidden', 'true');
    state.video.setAttribute('playsinline', '');
    state.video.setAttribute('muted', '');

    active.set(thumb, state);
    thumb.classList.add('hhp-thumb--loading');
    thumb.appendChild(state.video);
    thumb.appendChild(state.progress);
    void loadPreview(state, new URL(link.href, location.href).href);
  }

  function onEnter(event) {
    if (event.pointerType === 'touch') return;
    const thumb = event.currentTarget;
    suppressCardTitles(thumb);
    clearTimeout(pending.get(thumb));
    pending.set(thumb, setTimeout(() => {
      pending.delete(thumb);
      startPreview(thumb);
    }, settings.hoverDelay));
  }

  function onLeave(event) {
    const thumb = event.currentTarget;
    clearTimeout(pending.get(thumb));
    pending.delete(thumb);
    stopPreview(thumb);
    restoreCardTitles(thumb);
  }

  function wireThumb(thumb) {
    if (!(thumb instanceof HTMLElement) || thumb.dataset.hhpWired) return;
    thumb.dataset.hhpWired = '1';
    thumb.classList.add('hhp-thumb');
    thumb.addEventListener('pointerenter', onEnter);
    thumb.addEventListener('pointerleave', onLeave);
  }

  function wireCards(root = document) {
    if (root.matches?.('.thumb-container')) wireThumb(root);
    root.querySelectorAll?.('.video-item-container .thumb-container').forEach(wireThumb);

    for (const [thumb] of active) {
      if (!thumb.isConnected) stopPreview(thumb);
    }
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .hhp-thumb { position: relative; }
      .hhp-video {
        position: absolute;
        inset: 0;
        z-index: 1;
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #000;
        opacity: 0;
        pointer-events: none;
      }
      .hhp-thumb--active .hhp-video { opacity: 1; }
      .hhp-thumb--active .main-thumb { opacity: 0; }
      .hhp-progress {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 3;
        height: 3px;
        background: #ffffff66;
        pointer-events: none;
        opacity: 0;
      }
      .hhp-progress-bar {
        width: 0;
        height: 100%;
        background: #fff;
        transition: width .12s linear;
      }
      .hhp-thumb--active .hhp-progress { opacity: 1; }
      .hhp-thumb .duration,
      .hhp-thumb .stats-container { position: relative; z-index: 2; }
      #hhp-settings-button {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 2147483646;
        border: 1px solid #777;
        border-radius: 4px;
        padding: 7px 10px;
        color: #fff;
        background: #202020;
        font: 12px/1.2 sans-serif;
        cursor: pointer;
      }
      #hhp-settings-panel {
        position: fixed;
        right: 14px;
        bottom: 52px;
        z-index: 2147483647;
        width: 230px;
        padding: 12px;
        border: 1px solid #555;
        border-radius: 5px;
        color: #eee;
        background: #171717;
        box-shadow: 0 4px 18px #0008;
        font: 13px/1.4 sans-serif;
      }
      #hhp-settings-panel[hidden] { display: none; }
      #hhp-settings-panel h2 { margin: 0 0 10px; font-size: 14px; }
      #hhp-settings-panel label { display: block; margin: 8px 0; }
      #hhp-settings-panel input,
      #hhp-settings-panel select {
        box-sizing: border-box;
        width: 100%;
        margin-top: 3px;
        padding: 4px;
        color: #eee;
        border: 1px solid #666;
        border-radius: 3px;
        background: #282828;
      }
      #hhp-settings-panel button {
        margin-top: 5px;
        padding: 5px 9px;
        border: 1px solid #777;
        border-radius: 3px;
        color: #fff;
        background: #303030;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function createSettingsPanel() {
    const button = document.createElement('button');
    button.id = 'hhp-settings-button';
    button.type = 'button';
    button.textContent = 'Preview';
    button.title = 'Preview settings';

    const panel = document.createElement('form');
    panel.id = 'hhp-settings-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <h2>Preview settings</h2>
      <label>Clip length (seconds)<input name="clipSeconds" type="number" min="0.1" max="10" step="0.1"></label>
      <label>Hover delay (ms)<input name="hoverDelay" type="number" min="0" max="2000" step="50"></label>
      <label>Sampling interval (%)<input name="samplePercent" type="number" min="1" max="100" step="1"></label>
      <label>Quality<select name="quality"><option value="360">360p</option><option value="480">480p</option><option value="720">720p</option><option value="1080">1080p</option></select></label>
      <button type="submit">Save</button>
      <button type="button" data-action="close">Close</button>
    `;

    const fill = () => {
      for (const name of ['clipSeconds', 'hoverDelay', 'samplePercent', 'quality']) {
        panel.elements[name].value = settings[name];
      }
    };
    const close = () => { panel.hidden = true; };

    button.addEventListener('click', () => {
      fill();
      panel.hidden = !panel.hidden;
    });
    panel.addEventListener('click', (event) => {
      if (event.target.matches('[data-action="close"]')) close();
    });
    panel.addEventListener('submit', (event) => {
      event.preventDefault();
      settings = normalizeSettings(Object.fromEntries(new FormData(panel)));
      saveSettings();
      for (const [thumb] of active) stopPreview(thumb);
      close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    document.body.append(button, panel);
  }

  function init() {
    addStyles();
    createSettingsPanel();
    wireCards();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) wireCards(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
