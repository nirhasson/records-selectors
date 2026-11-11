let loadingAnimation;
let currentAlbum = null;

// Self-contained fallback cover art (no network dependency) for albums with a missing/broken image.
const NO_COVER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23444'/%3E%3Ccircle cx='50' cy='50' r='30' fill='none' stroke='%23666' stroke-width='2'/%3E%3Ccircle cx='50' cy='50' r='5' fill='%23666'/%3E%3C/svg%3E";

// --- Motion helpers ---
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Restart a CSS animation class (works when the same class is added twice in a row)
function replayClass(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// Resolve once the cover has downloaded, so it arrives with its animation instead of popping in late
function preloadImage(src, timeoutMs = 2500) {
  return new Promise(resolve => {
    if (!src) return resolve();
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = src;
    setTimeout(done, timeoutMs);
  });
}
// --- end Motion helpers ---

// --- Genre filter ---
let selectedGenres = new Set();

function initGenreFilter() {
  const saved = localStorage.getItem('waxriffle_genres');
  if (saved) {
    try { JSON.parse(saved).forEach(g => selectedGenres.add(g)); } catch (e) {}
  }
  renderGenrePills();
  // Pop animation only for pills the visitor taps, not on page load
  requestAnimationFrame(() => document.getElementById('genre-pills').classList.add('ready'));

  document.querySelectorAll('.genre-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const genre = pill.dataset.genre;
      if (genre === 'all') {
        selectedGenres.clear();
      } else {
        selectedGenres.has(genre) ? selectedGenres.delete(genre) : selectedGenres.add(genre);
      }
      renderGenrePills();
      localStorage.setItem('waxriffle_genres', JSON.stringify([...selectedGenres]));
    });
  });
}

function renderGenrePills() {
  document.querySelectorAll('.genre-pill').forEach(pill => {
    const genre = pill.dataset.genre;
    pill.classList.toggle('active', genre === 'all' ? selectedGenres.size === 0 : selectedGenres.has(genre));
  });
}

// Albums already shown in this tab, so the server doesn't send them again
const SEEN_KEY = 'waxriffle_seen';
const MAX_SEEN = 150;

function getSeenIds() {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; }
}

function markSeen(album) {
  if (!album || !album.discogsId) return;
  const seen = getSeenIds().filter(id => id !== String(album.discogsId));
  seen.push(String(album.discogsId));
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-MAX_SEEN))); } catch (e) {}
}

function albumQueryParams() {
  const params = new URLSearchParams();
  if (selectedGenres.size > 0) params.set('genres', [...selectedGenres].join(','));
  const seen = getSeenIds();
  if (seen.length > 0) params.set('exclude', seen.join(','));
  const query = params.toString();
  return query ? `?${query}` : '';
}
// --- end Genre filter ---

// Direct Apple Music link when the pool found one, otherwise an Apple Music search
function appleMusicLink(album) {
  if (album.links && album.links.appleMusic) return album.links.appleMusic;
  return `https://music.apple.com/us/search?term=${encodeURIComponent(`${album.artist || ''} ${album.title || ''}`.trim())}`;
}

// --- Share ---
// The album's own page when it has one (cover preview in WhatsApp etc.), otherwise its Spotify link
function shareUrl(album) {
  if (album.pageUrl) return new URL(album.pageUrl, location.origin).href;
  return album.spotifyLink || location.origin;
}

// Phones open the system share sheet; computers copy the link.
// Returns 'shared', 'copied' or 'failed'.
async function shareAlbum(album) {
  const url = shareUrl(album);
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (navigator.share && isTouch) {
    try {
      await navigator.share({ title: `${album.title} by ${album.artist}`, text: `${album.title} by ${album.artist}, found on WaxRiffle`, url });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'shared'; // closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (e) {
    window.prompt('Copy this link:', url);
    return 'failed';
  }
}

// Briefly shows "Link copied" on the button that was pressed
function flashCopied(button, labelEl, original) {
  replayClass(button, 'pop');
  button.classList.add('copied');
  labelEl.textContent = 'Link copied';
  clearTimeout(button._copiedTimer);
  button._copiedTimer = setTimeout(() => {
    button.classList.remove('copied');
    labelEl.textContent = original;
  }, 2000);
}
// --- end Share ---

// --- Add to home screen ---
// Phones only: after the visitor's third album, a sheet offers to put WaxRiffle on the home screen.
// Android/Chrome gets the browser's own install dialog; iPhone gets the two Safari steps.
const INSTALL_AFTER_FINDS = 3;
const INSTALL_SNOOZE_DAYS = 14;
let deferredInstallPrompt = null;
let installShownThisVisit = false;

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) {} },
};

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // we show our own sheet at the right moment instead of the browser's banner
  deferredInstallPrompt = event;
});
window.addEventListener('appinstalled', () => {
  storage.set('waxriffle_installed', '1');
  hideInstallSheet();
});

function installPlatform() {
  const ua = navigator.userAgent;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|WhatsApp|TikTok|Snapchat|Twitter/i.test(ua);
  const isPhone = window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  if (isStandalone || isInAppBrowser || !isPhone) return null;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
}

// Called each time a new album is shown
function noteAlbumFound() {
  const finds = Number(storage.get('waxriffle_finds') || 0) + 1;
  storage.set('waxriffle_finds', String(finds));
  if (finds < INSTALL_AFTER_FINDS || installShownThisVisit || storage.get('waxriffle_installed')) return;
  const snoozedAt = Number(storage.get('waxriffle_install_snoozed') || 0);
  if (Date.now() - snoozedAt < INSTALL_SNOOZE_DAYS * 86400000) return;
  const platform = installPlatform();
  if (!platform) return;
  installShownThisVisit = true;
  setTimeout(() => showInstallSheet(platform), 1400); // after the album has settled in
}

function showInstallSheet(platform) {
  const sheet = document.getElementById('install-sheet');
  if (!sheet) return;
  const nativePrompt = platform === 'android' && deferredInstallPrompt;
  document.getElementById('install-steps-ios').hidden = platform !== 'ios';
  document.getElementById('install-steps-android').hidden = !(platform === 'android' && !nativePrompt);
  document.getElementById('install-accept').textContent = nativePrompt ? 'Add to Home Screen' : 'Got it';
  sheet.dataset.mode = nativePrompt ? 'prompt' : 'steps';
  sheet.classList.remove('is-closing', 'is-open');
  sheet.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
}

function hideInstallSheet() {
  const sheet = document.getElementById('install-sheet');
  if (!sheet || sheet.hidden) return;
  sheet.classList.add('is-closing');
  sheet.classList.remove('is-open');
  setTimeout(() => { sheet.hidden = true; sheet.classList.remove('is-closing'); }, 260);
}

function initInstallSheet() {
  document.getElementById('install-dismiss').addEventListener('click', () => {
    storage.set('waxriffle_install_snoozed', String(Date.now()));
    hideInstallSheet();
  });
  document.getElementById('install-accept').addEventListener('click', async () => {
    const sheet = document.getElementById('install-sheet');
    if (sheet.dataset.mode === 'prompt' && deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      hideInstallSheet();
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      storage.set(choice.outcome === 'accepted' ? 'waxriffle_installed' : 'waxriffle_install_snoozed',
        choice.outcome === 'accepted' ? '1' : String(Date.now()));
    } else {
      // They have the steps; don't ask again for a while
      storage.set('waxriffle_install_snoozed', String(Date.now()));
      hideInstallSheet();
    }
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
// --- end Add to home screen ---

// --- Saved albums ---
function getAlbumId(album) {
  return album.discogsId ? String(album.discogsId) : `${album.artist}|${album.title}`;
}

function getSaved() {
  try { return JSON.parse(localStorage.getItem('waxriffle_saved') || '[]'); } catch (e) { return []; }
}

function isAlbumSaved(album) {
  const id = getAlbumId(album);
  return getSaved().some(a => getAlbumId(a) === id);
}

function toggleSave(album) {
  const id = getAlbumId(album);
  let saved = getSaved();
  if (saved.some(a => getAlbumId(a) === id)) {
    saved = saved.filter(a => getAlbumId(a) !== id);
  } else {
    saved.unshift({ ...album, savedAt: Date.now() });
  }
  localStorage.setItem('waxriffle_saved', JSON.stringify(saved));
  updateSaveButton(album);
  updateSavedCounter();
  if (isAlbumSaved(album)) replayClass(document.getElementById('save-button'), 'pop');
}

function updateSaveButton(album) {
  const btn = document.getElementById('save-button');
  if (!btn || !album) return;
  const saved = isAlbumSaved(album);
  btn.textContent = saved ? '♥ Saved' : '♡ Save';
  btn.classList.toggle('saved', saved);
}

let lastSavedCount = null;
function updateSavedCounter() {
  const count = getSaved().length;
  if (lastSavedCount !== null && count > lastSavedCount) replayClass(document.getElementById('saved-counter'), 'bump');
  lastSavedCount = count;
  const counter = document.getElementById('saved-counter');
  const num = document.getElementById('saved-num');
  const label = document.getElementById('saved-count');
  if (num) num.textContent = count;
  if (label) label.style.display = count > 0 ? 'inline' : 'none';
  if (counter) counter.classList.toggle('has-saves', count > 0);
}

function renderSavedList(animate = false) {
  const list = document.getElementById('saved-list');
  const empty = document.getElementById('saved-empty');
  const saved = getSaved();
  list.innerHTML = '';
  if (saved.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  saved.forEach((album, i) => {
    const id = getAlbumId(album);
    const card = document.createElement('div');
    card.className = animate ? 'saved-card stagger-in' : 'saved-card';
    card.style.setProperty('--i', Math.min(i, 8));
    card.innerHTML = `
      <img class="saved-card-img" src="${album.image || NO_COVER_IMAGE}" alt="${album.title}" onerror="this.onerror=null;this.src='${NO_COVER_IMAGE}'">
      <div class="saved-card-info">
        <div class="saved-card-title">${album.title || 'Unknown'}</div>
        <div class="saved-card-artist">${album.artist || ''}</div>
        <div class="saved-card-meta">${album.year || ''} ${album.genre ? '· ' + album.genre : ''}</div>
      </div>
      <div class="saved-card-actions">
        ${album.spotifyLink ? `<a class="saved-spotify-btn" href="${album.spotifyLink}" target="_blank" rel="noopener">▶ Spotify</a>` : ''}
        <a class="saved-apple-btn" href="${appleMusicLink(album)}" target="_blank" rel="noopener">▶ Apple Music</a>
        <button class="saved-share-btn" data-id="${id}">Share</button>
        <button class="saved-remove-btn" data-id="${id}">Remove</button>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('.saved-share-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const album = saved.find(a => getAlbumId(a) === btn.dataset.id);
      if (album && (await shareAlbum(album)) === 'copied') flashCopied(btn, btn, 'Share');
    });
  });

  list.querySelectorAll('.saved-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      // Slide the card out and close the gap before the list redraws
      const card = btn.closest('.saved-card');
      if (card && !reducedMotion()) {
        await card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(16px)' }],
          { duration: 160, easing: 'ease-in', fill: 'forwards' }).finished;
        await card.animate([{ height: `${card.offsetHeight}px`, marginBottom: '0px', paddingTop: getComputedStyle(card).paddingTop, paddingBottom: getComputedStyle(card).paddingBottom },
          { height: '0px', marginBottom: '-14px', paddingTop: '0px', paddingBottom: '0px' }],
          { duration: 200, easing: EASE_OUT, fill: 'forwards' }).finished;
      }
      let saved = getSaved().filter(a => getAlbumId(a) !== btn.dataset.id);
      localStorage.setItem('waxriffle_saved', JSON.stringify(saved));
      updateSavedCounter();
      renderSavedList();
      if (currentAlbum) updateSaveButton(currentAlbum);
    });
  });
}

// Each screen change is a browser history entry, so the Back button moves between
// albums and screens instead of leaving the site.
// Shows one screen and fades it in
function showScreen(id) {
  ['main-screen', 'result-screen', 'saved-screen'].forEach(screenId => {
    const el = document.getElementById(screenId);
    const isTarget = screenId === id;
    const wasHidden = el.style.display === 'none' || getComputedStyle(el).display === 'none';
    el.style.display = isTarget ? 'block' : 'none';
    if (isTarget && wasHidden) replayClass(el, 'screen-enter');
  });
}

function showSavedScreen(fromHistory = false) {
  if (!fromHistory) history.pushState({ screen: 'saved' }, '');
  showScreen('saved-screen');
  renderSavedList(true);
}

function showHomeScreen() {
  showScreen('main-screen');
  document.getElementById('loading-animation').style.display = 'none';
  document.getElementById('explore-button').style.display = 'flex';
}
// --- end Saved albums ---

document.addEventListener("DOMContentLoaded", function () {
  console.log("📌 Document is fully loaded");

  initGenreFilter();
  updateSavedCounter();
  initInstallSheet();

  document.getElementById('saved-counter').addEventListener('click', () => {
    if (document.getElementById('saved-screen').style.display !== 'block') showSavedScreen();
  });
  document.getElementById('back-from-saved').addEventListener('click', () => history.back());

  // Browser Back/Forward: show whatever screen that history entry holds
  history.replaceState({ screen: 'home' }, '');
  window.addEventListener('popstate', (event) => {
    const state = event.state || { screen: 'home' };
    if (state.screen === 'album' && state.album) updateUI(state.album, true);
    else if (state.screen === 'saved') showSavedScreen(true);
    else showHomeScreen();
  });
  document.getElementById('save-button').addEventListener('click', () => {
    if (currentAlbum) toggleSave(currentAlbum);
  });
  document.getElementById('share-button').addEventListener('click', async () => {
    if (!currentAlbum) return;
    const result = await shareAlbum(currentAlbum);
    if (result === 'copied') flashCopied(document.getElementById('share-button'), document.getElementById('share-label'), 'Share');
  });

  loadingAnimation = lottie.loadAnimation({
    container: document.getElementById('loading-animation'),
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: 'animation/loading-animation.json'
  });

  function showExploreError(message) {
    const el = document.getElementById('explore-error');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }

  async function fetchAlbumData() {
    try {
      showExploreError('');
      const button = document.getElementById('explore-button');
      const loader = document.getElementById('loading-animation');
      const request = fetch(`/api/album${albumQueryParams()}`);

      // The button shrinks away and the record animation fades in where it was
      if (!reducedMotion()) {
        await button.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.85)' }],
          { duration: 160, easing: 'ease-in' }).finished;
      }
      button.style.display = 'none';
      loader.style.display = 'block';
      loader.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT, fill: 'backwards' });
      loadingAnimation.play();

      const response = await request;
      if (!response.ok) throw new Error('Failed to fetch album data');
      const albumData = await response.json();
      console.log("✅ Received album data:", albumData);
      await preloadImage(albumData.image);

      document.getElementById('loading-animation').style.display = 'none';
      loadingAnimation.stop();

      return albumData;
    } catch (error) {
      console.error('❌ Error fetching album data:', error);
      document.getElementById('loading-animation').style.display = 'none';
      document.getElementById('explore-button').style.display = 'flex';
      loadingAnimation.stop();
      return null;
    }
  }

  function getElement(id) {
    const element = document.getElementById(id);
    if (!element) console.error(`❌ Error: Element with ID '${id}' not found.`);
    return element;
  }

  const exploreButton = getElement('explore-button');
  const exploreAgainButton = getElement('explore-again-button');

  if (exploreButton) {
    exploreButton.addEventListener('click', async function () {
      console.log("🔎 Exploring albums...");
      const albumData = await fetchAlbumData();
      if (albumData) {
        updateUI(albumData);
        exploreAgainButton.classList.remove("loading");
      } else {
        showExploreError('Could not load an album right now. Please try again.');
      }
    });
  }

  function showResultError(message) {
    const el = document.getElementById('result-error');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }

  if (exploreAgainButton) {
    exploreAgainButton.addEventListener('click', async () => {
      const originalText = exploreAgainButton.textContent;
      const resultScreen = document.getElementById('result-screen');
      showResultError('');
      exploreAgainButton.textContent = "Loading...";
      exploreAgainButton.classList.add("loading");
      exploreAgainButton.disabled = true;

      // The current record lifts and riffles while the next one is found
      resultScreen.classList.remove('card-enter');
      resultScreen.classList.add('card-leaving');
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      const minimumLift = wait(reducedMotion() ? 0 : 260);

      try {
        const response = await fetch(`/api/album${albumQueryParams()}`);
        if (!response.ok) throw new Error('Failed to fetch album data');
        const albumData = await response.json();
        console.log("✅ Received new album data:", albumData);
        await Promise.all([preloadImage(albumData.image), minimumLift]);
        updateUI(albumData);
      } catch (error) {
        console.error('❌ Error fetching album data:', error);
        resultScreen.classList.remove('card-leaving');
        showResultError('Could not load another album right now. Please try again.');
      } finally {
        exploreAgainButton.textContent = originalText;
        exploreAgainButton.classList.remove("loading");
        exploreAgainButton.disabled = false;
      }
    });
  }

  function formatStoreName(store) {
    return store ? store.replace(/_/g, ' ') : '';
  }

  function updateUI(albumData, fromHistory = false) {
    if (!fromHistory) {
      history.pushState({ screen: 'album', album: albumData }, '');
      noteAlbumFound();
    }
    currentAlbum = albumData;
    markSeen(albumData);

    document.getElementById('album-title').textContent = albumData.title || 'N/A';
    document.getElementById('album-artist').textContent = albumData.artist || 'N/A';
    document.getElementById('result-meta').textContent =
      [albumData.year, albumData.genre].filter(Boolean).join(' · ') || 'N/A';
    const sourceEl = document.getElementById('album-source');
    sourceEl.textContent = '';
    if (albumData.editorsPick && !albumData.show) {
      sourceEl.textContent = "Editor's Pick";
    } else if (albumData.show) {
      const hostIsInShowName = albumData.host && albumData.show.toLowerCase().includes(albumData.host.toLowerCase());
      sourceEl.textContent = albumData.host && !hostIsInShowName
        ? `Heard on ${albumData.show} with ${albumData.host}`
        : `Heard on the ${albumData.show}`;
    } else {
      const store = formatStoreName(albumData.store);
      sourceEl.textContent = store ? `Found at ${store}` : '';
    }
    const albumImage = document.getElementById('album-image');
    albumImage.onerror = () => { albumImage.onerror = null; albumImage.src = NO_COVER_IMAGE; };
    albumImage.src = albumData.image || NO_COVER_IMAGE;
    document.getElementById('spotify-link').href = albumData.spotifyLink || '#';
    document.getElementById('apple-music-link').href = appleMusicLink(albumData);

    updateSaveButton(albumData);

    const embedContainer = document.getElementById('spotify-embed-container');
    embedContainer.innerHTML = '';

    if (albumData.spotifyLink) {
      try {
        const spotifyUrl = new URL(albumData.spotifyLink);
        const pathParts = spotifyUrl.pathname.split('/');
        if (pathParts[1] === 'search') {
          embedContainer.innerHTML = '<p style="color: #777;">No preview available. Tap Spotify below to search for it.</p>';
        } else {
          const contentType = pathParts[1];
          const contentId = pathParts[pathParts.length - 1];
          if (contentId) {
            const iframe = document.createElement('iframe');
            iframe.style.borderRadius = '12px';
            iframe.src = `https://open.spotify.com/embed/${contentType}/${contentId}?utm_source=generator&theme=0&compact=1&tracks=3`;
            iframe.width = '100%';
            iframe.height = '152';
            iframe.frameBorder = '0';
            iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
            iframe.loading = 'lazy';
            // Fade the player in when it loads; show it anyway if Spotify is slow to report that
            const reveal = () => iframe.classList.add('is-loaded');
            iframe.addEventListener('load', reveal);
            setTimeout(reveal, 3000);
            embedContainer.appendChild(iframe);
          }
        }
      } catch (error) {
        console.error('Error creating Spotify embed:', error);
        embedContainer.innerHTML = '<p style="color: #777;">Preview not available</p>';
      }
    }

    const resultScreen = document.getElementById('result-screen');
    const comingFromAnotherScreen = resultScreen.style.display === 'none';
    showScreen('result-screen');
    if (comingFromAnotherScreen) window.scrollTo(0, 0);
    // The new record is pulled up out of the crate
    resultScreen.classList.remove('card-leaving');
    replayClass(resultScreen, 'card-enter');
  }
});
