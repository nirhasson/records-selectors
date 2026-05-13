let loadingAnimation;
let currentAlbum = null;

// --- Genre filter ---
let selectedGenres = new Set();

function initGenreFilter() {
  const saved = localStorage.getItem('waxriffle_genres');
  if (saved) {
    try { JSON.parse(saved).forEach(g => selectedGenres.add(g)); } catch (e) {}
  }
  renderGenrePills();

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

function genreQueryParam() {
  return selectedGenres.size > 0 ? `?genres=${[...selectedGenres].join(',')}` : '';
}
// --- end Genre filter ---

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
}

function updateSaveButton(album) {
  const btn = document.getElementById('save-button');
  if (!btn || !album) return;
  const saved = isAlbumSaved(album);
  btn.textContent = saved ? '♥ Saved' : '♡ Save';
  btn.classList.toggle('saved', saved);
}

function updateSavedCounter() {
  const count = getSaved().length;
  const counter = document.getElementById('saved-counter');
  const num = document.getElementById('saved-num');
  const label = document.getElementById('saved-count');
  if (num) num.textContent = count;
  if (label) label.style.display = count > 0 ? 'inline' : 'none';
  if (counter) counter.classList.toggle('has-saves', count > 0);
}

function renderSavedList() {
  const list = document.getElementById('saved-list');
  const empty = document.getElementById('saved-empty');
  const saved = getSaved();
  list.innerHTML = '';
  if (saved.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  saved.forEach(album => {
    const id = getAlbumId(album);
    const card = document.createElement('div');
    card.className = 'saved-card';
    card.innerHTML = `
      <img class="saved-card-img" src="${album.image || ''}" alt="${album.title}" onerror="this.src='https://via.placeholder.com/64'">
      <div class="saved-card-info">
        <div class="saved-card-title">${album.title || 'Unknown'}</div>
        <div class="saved-card-artist">${album.artist || ''}</div>
        <div class="saved-card-meta">${album.year || ''} ${album.genre ? '· ' + album.genre : ''}</div>
      </div>
      <div class="saved-card-actions">
        ${album.spotifyLink ? `<a class="saved-spotify-btn" href="${album.spotifyLink}" target="_blank">▶ Spotify</a>` : ''}
        <button class="saved-remove-btn" data-id="${id}">Remove</button>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('.saved-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let saved = getSaved().filter(a => getAlbumId(a) !== btn.dataset.id);
      localStorage.setItem('waxriffle_saved', JSON.stringify(saved));
      updateSavedCounter();
      renderSavedList();
      if (currentAlbum) updateSaveButton(currentAlbum);
    });
  });
}

let previousScreen = 'main';

function showSavedScreen() {
  if (document.getElementById('main-screen').style.display !== 'none') {
    previousScreen = 'main';
  } else {
    previousScreen = 'result';
  }
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('result-screen').style.display = 'none';
  document.getElementById('saved-screen').style.display = 'block';
  renderSavedList();
}

function hideSavedScreen() {
  document.getElementById('saved-screen').style.display = 'none';
  if (previousScreen === 'result' && currentAlbum) {
    document.getElementById('result-screen').style.display = 'block';
  } else {
    document.getElementById('main-screen').style.display = 'block';
  }
}
// --- end Saved albums ---

document.addEventListener("DOMContentLoaded", function () {
  console.log("📌 Document is fully loaded");

  initGenreFilter();
  updateSavedCounter();

  document.getElementById('saved-counter').addEventListener('click', showSavedScreen);
  document.getElementById('back-from-saved').addEventListener('click', hideSavedScreen);
  document.getElementById('save-button').addEventListener('click', () => {
    if (currentAlbum) toggleSave(currentAlbum);
  });

  loadingAnimation = lottie.loadAnimation({
    container: document.getElementById('loading-animation'),
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: 'animation/loading-animation.json'
  });

  async function fetchAlbumData() {
    try {
      document.getElementById('explore-button').style.display = 'none';
      document.getElementById('loading-animation').style.display = 'block';
      loadingAnimation.play();

      const response = await fetch(`/api/album${genreQueryParam()}`);
      if (!response.ok) throw new Error('Failed to fetch album data');
      const albumData = await response.json();
      console.log("✅ Received album data:", albumData);

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
        alert('⚠️ Failed to load album data. Please try again.');
      }
    });
  }

  if (exploreAgainButton) {
    exploreAgainButton.addEventListener('click', async () => {
      const originalText = exploreAgainButton.textContent;
      exploreAgainButton.textContent = "Loading...";
      exploreAgainButton.classList.add("loading");
      exploreAgainButton.disabled = true;

      try {
        const response = await fetch(`/api/album${genreQueryParam()}`);
        if (!response.ok) throw new Error('Failed to fetch album data');
        const albumData = await response.json();
        console.log("✅ Received new album data:", albumData);
        updateUI(albumData);
      } catch (error) {
        console.error('❌ Error fetching album data:', error);
        alert('⚠️ Failed to load album data. Please try again.');
      } finally {
        exploreAgainButton.textContent = originalText;
        exploreAgainButton.classList.remove("loading");
        exploreAgainButton.disabled = false;
      }
    });
  }

  function updateUI(albumData) {
    currentAlbum = albumData;

    document.getElementById('album-title').textContent = albumData.title || 'N/A';
    document.getElementById('album-artist').textContent = albumData.artist || 'N/A';
    document.getElementById('album-year').textContent = albumData.year || 'N/A';
    document.getElementById('album-genre').textContent = albumData.genre || 'N/A';
    document.getElementById('album-image').src = albumData.image || 'https://via.placeholder.com/300';
    document.getElementById('spotify-link').href = albumData.spotifyLink || '#';

    updateSaveButton(albumData);

    const embedContainer = document.getElementById('spotify-embed-container');
    embedContainer.innerHTML = '';

    if (albumData.spotifyLink) {
      try {
        const spotifyUrl = new URL(albumData.spotifyLink);
        const pathParts = spotifyUrl.pathname.split('/');
        if (pathParts[1] === 'search') {
          embedContainer.innerHTML = '<p style="color: #777;">No preview available. Click "Listen on Spotify" to search.</p>';
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
            embedContainer.appendChild(iframe);
          }
        }
      } catch (error) {
        console.error('Error creating Spotify embed:', error);
        embedContainer.innerHTML = '<p style="color: #777;">Preview not available</p>';
      }
    }

    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('saved-screen').style.display = 'none';
    document.getElementById('result-screen').style.display = 'block';
  }
});
