let loadingAnimation;

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

document.addEventListener("DOMContentLoaded", function () {
  console.log("📌 Document is fully loaded");

  initGenreFilter();

  loadingAnimation = lottie.loadAnimation({
    container: document.getElementById('loading-animation'),
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: 'animation/loading-animation.json' // עדכן את הנתיב לפי המיקום האמיתי של הקובץ
  });

  // Function to fetch album data from the backend
  async function fetchAlbumData() {
    try {
      // הצג את האנימציה והסתר את הכפתור
      document.getElementById('explore-button').style.display = 'none';
      document.getElementById('loading-animation').style.display = 'block';
      loadingAnimation.play(); // הפעל את האנימציה

      const response = await fetch(`/api/album${genreQueryParam()}`);
      if (!response.ok) throw new Error('Failed to fetch album data');
      const albumData = await response.json();
      console.log("✅ Received album data:", albumData); // Check the received data

      // הסתר את האנימציה כשהנתונים מגיעים
      document.getElementById('loading-animation').style.display = 'none';
      loadingAnimation.stop(); // עצור את האנימציה

      return albumData;
    } catch (error) {
      console.error('❌ Error fetching album data:', error);

      // במקרה של שגיאה, הסתר את האנימציה והחזר את הכפתור
      document.getElementById('loading-animation').style.display = 'none';
      document.getElementById('explore-button').style.display = 'flex';
      loadingAnimation.stop(); // עצור את האנימציה

      return null;
    }
  }

  // Function to get an element with a check that it exists
  function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
      console.error(`❌ Error: Element with ID '${id}' not found.`);
    }
    return element;
  }

  // Retrieve buttons
  const exploreButton = getElement('explore-button');
  const exploreAgainButton = getElement('explore-again-button');

  // Listener for clicking the "Explore Albums" button
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

  // Listener for clicking the "Explore Again" button
  if (exploreAgainButton) {
    exploreAgainButton.addEventListener('click', async () => {
      // שמור את הטקסט המקורי של הכפתור
      const originalText = exploreAgainButton.textContent;

      // שנה את הטקסט ל"טוען..." והוסף קלאס טעינה
      exploreAgainButton.textContent = "Loading...";
      exploreAgainButton.classList.add("loading");
      exploreAgainButton.disabled = true; // מנע לחיצות נוספות בזמן הטעינה

      try {
        const response = await fetch(`/api/album${genreQueryParam()}`);
        if (!response.ok) throw new Error('Failed to fetch album data');
        const albumData = await response.json();
        console.log("✅ Received new album data:", albumData);

        // עדכון ממשק המשתמש עם הנתונים החדשים
        updateUI(albumData);
      } catch (error) {
        console.error('❌ Error fetching album data:', error);
        alert('⚠️ Failed to load album data. Please try again.');
      } finally {
        // החזר את הכפתור למצב הרגיל
        exploreAgainButton.textContent = originalText;
        exploreAgainButton.classList.remove("loading");
        exploreAgainButton.disabled = false;
      }
    });
  }

  // Function to update the UI with album data
  function updateUI(albumData) {
    document.getElementById('album-title').textContent = albumData.title || 'N/A';
    document.getElementById('album-artist').textContent = albumData.artist || 'N/A';
    document.getElementById('album-year').textContent = albumData.year || 'N/A';
    document.getElementById('album-genre').textContent = albumData.genre || 'N/A';
    document.getElementById('album-image').src = albumData.image || 'https://via.placeholder.com/300';
    document.getElementById('spotify-link').href = albumData.spotifyLink || '#';

    // יצירת הנגן המוטמע של ספוטיפיי
    const embedContainer = document.getElementById('spotify-embed-container');

    // ניקוי המיכל מתוכן קודם
    embedContainer.innerHTML = '';

    if (albumData.spotifyLink) {
      try {
        // הפקת סוג התוכן ומזהה מהקישור
        const spotifyUrl = new URL(albumData.spotifyLink);
        const pathParts = spotifyUrl.pathname.split('/');

        // בדיקה אם זה קישור חיפוש
        if (pathParts[1] === 'search') {
          embedContainer.innerHTML = '<p style="color: #777;">No preview available. Click "Listen on Spotify" to search.</p>';
        } else {
          let contentType = pathParts[1]; // 'album', 'track', או 'artist'
          const contentId = pathParts[pathParts.length - 1];

          if (contentId) {
            // יצירת iframe עם הנגן המוטמע - עם פרמטרים לתצוגה מצומצמת
            const iframe = document.createElement('iframe');
            iframe.style.borderRadius = '12px';

            // פרמטרים לתצוגה מצומצמת:
            // theme=0 - תצוגה בהירה
            // compact=1 - תצוגה מצומצמת
            // tracks=3 - הצג רק 3 שירים ראשונים
            iframe.src = `https://open.spotify.com/embed/${contentType}/${contentId}?utm_source=generator&theme=0&compact=1&tracks=3`;

            iframe.width = '100%';
            iframe.height = '152'; // גובה מותאם לתצוגה מצומצמת
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

    // Show the result screen
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('result-screen').style.display = 'block';
  }
});
