// יצירת משתנה גלובלי לאנימציה
let loadingAnimation;
// משתנה גלובלי לנגן האודיו
let audioPlayer = null;
// מזהה השיר שמתנגן כרגע
let currentlyPlayingTrackId = null;

document.addEventListener("DOMContentLoaded", function () {
  console.log("📌 Document is fully loaded");

  // אתחול אנימציית הטעינה
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

      const response = await fetch('/api/album'); // Update the path to the correct endpoint
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
  const backButton = getElement('back-button');

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
      // עצירת כל אודיו שמתנגן
      stopAudio();

      // שמור את הטקסט המקורי של הכפתור
      const originalText = exploreAgainButton.textContent;

      // שנה את הטקסט ל"טוען..." והוסף קלאס טעינה
      exploreAgainButton.textContent = "Loading...";
      exploreAgainButton.classList.add("loading");
      exploreAgainButton.disabled = true; // מנע לחיצות נוספות בזמן הטעינה

      try {
        // קריאה ישירה ל-API
        const response = await fetch('/api/album');
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

  // Listener for clicking the "Back" button
  if (backButton) {
    backButton.addEventListener('click', () => {
      // עצירת כל אודיו שמתנגן
      stopAudio();

      document.getElementById('result-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'block';
      // וודא שהכפתור מוצג ולא האנימציה
      document.getElementById('loading-animation').style.display = 'none';
      document.getElementById('explore-button').style.display = 'flex';
    });
  }

  // פונקציה לעצירת האודיו
  function stopAudio() {
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
      audioPlayer = null;
      currentlyPlayingTrackId = null;

      // איפוס כל כפתורי הנגינה
      const playButtons = document.querySelectorAll('.track-preview button');
      playButtons.forEach(button => {
        button.innerHTML = '<div class="play-icon"></div>';
        button.setAttribute('data-playing', 'false');
      });
    }
  }

  // פונקציה לנגינת דגימת שיר
  function playTrackPreview(trackId, previewUrl, button) {
    // אם יש שיר שכבר מתנגן, עצור אותו
    if (audioPlayer) {
      stopAudio();
    }

    // אם לחצנו על אותו שיר שכבר מתנגן, פשוט נעצור אותו
    if (currentlyPlayingTrackId === trackId) {
      currentlyPlayingTrackId = null;
      return;
    }

    // יצירת נגן אודיו חדש
    audioPlayer = new Audio(previewUrl);
    currentlyPlayingTrackId = trackId;

    // שינוי האייקון לאייקון עצירה
    button.innerHTML = '<div class="pause-icon"><span></span><span></span></div>';
    button.setAttribute('data-playing', 'true');

    // הגדרת אירוע לסיום הנגינה
    audioPlayer.addEventListener('ended', function() {
      button.innerHTML = '<div class="play-icon"></div>';
      button.setAttribute('data-playing', 'false');
      currentlyPlayingTrackId = null;
      audioPlayer = null;
    });

    // התחלת הנגינה
    audioPlayer.play();
  }

  // פונקציה לפירוק מזהה אלבום מקישור ספוטיפיי
  function extractSpotifyId(spotifyLink) {
    try {
      const url = new URL(spotifyLink);
      const pathParts = url.pathname.split('/');

      // בדיקה אם זה קישור חיפוש
      if (pathParts[1] === 'search') {
        return { type: 'search', id: null };
      }

      return {
        type: pathParts[1], // 'album', 'track', או 'artist'
        id: pathParts[pathParts.length - 1]
      };
    } catch (error) {
      console.error('Error extracting Spotify ID:', error);
      return { type: null, id: null };
    }
  }

  // פונקציה לפורמט משך זמן השיר
  function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // פונקציה ליצירת רשימת השירים
  function createTracksList(tracks, maxTracks = 3) {
    const tracksListElement = document.getElementById('tracks-list');
    tracksListElement.innerHTML = '';

    // הצג רק את מספר השירים המבוקש
    const tracksToShow = tracks.slice(0, maxTracks);

    tracksToShow.forEach((track, index) => {
      const trackItem = document.createElement('div');
      trackItem.className = 'track-item';

      const hasPreview = track.preview_url !== null;

      trackItem.innerHTML = `
        <div class="track-number">${index + 1}</div>
        <div class="track-info">
          <div class="track-name">${track.name}</div>
          <div class="track-duration">${formatDuration(track.duration_ms)}</div>
        </div>
        <div class="track-preview">
          <button data-track-id="${track.id}" data-preview-url="${track.preview_url}" data-playing="false" ${!hasPreview ? 'disabled' : ''}>
            <div class="play-icon"></div>
          </button>
        </div>
      `;

      tracksListElement.appendChild(trackItem);

      // הוספת אירוע לחיצה לכפתור הנגינה
      if (hasPreview) {
        const playButton = trackItem.querySelector('.track-preview button');
        playButton.addEventListener('click', function() {
          const trackId = this.getAttribute('data-track-id');
          const previewUrl = this.getAttribute('data-preview-url');
          const isPlaying = this.getAttribute('data-playing') === 'true';

          if (isPlaying) {
            stopAudio();
          } else {
            playTrackPreview(trackId, previewUrl, this);
          }
        });
      }
    });

    return tracksToShow.length > 0;
  }

  // פונקציה לקבלת פרטי אלבום מספוטיפיי
  async function fetchAlbumTracks(albumId) {
    try {
      // בפרויקט אמיתי, כאן היית צריך לקרוא ל-API שלך שיבצע את הבקשה לספוטיפיי
      // כיוון שזה דורש אימות, נניח שיש לך נקודת קצה ב-API שלך שמטפלת בזה

      // לדוגמה:
      // const response = await fetch(`/api/spotify/album-tracks/${albumId}`);

      // במקום זה, נשתמש בדוגמה סטטית לצורך ההדגמה
      // בפרויקט אמיתי, תצטרך ליצור נקודת קצה ב-API שלך שתחזיר את השירים מספוטיפיי

      // דוגמה לתשובה מספוטיפיי
      const mockTracks = [
        {
          id: 'track1',
          name: 'Track 1',
          duration_ms: 180000,
          preview_url: 'https://p.scdn.co/mp3-preview/sample1.mp3'
        },
        {
          id: 'track2',
          name: 'Track 2',
          duration_ms: 210000,
          preview_url: 'https://p.scdn.co/mp3-preview/sample2.mp3'
        },
        {
          id: 'track3',
          name: 'Track 3',
          duration_ms: 195000,
          preview_url: 'https://p.scdn.co/mp3-preview/sample3.mp3'
        },
        {
          id: 'track4',
          name: 'Track 4',
          duration_ms: 220000,
          preview_url: null
        },
        {
          id: 'track5',
          name: 'Track 5',
          duration_ms: 240000,
          preview_url: 'https://p.scdn.co/mp3-preview/sample5.mp3'
        }
      ];

      return mockTracks;

      // בפרויקט אמיתי, היית מחזיר את התשובה מה-API:
      // if (!response.ok) throw new Error('Failed to fetch album tracks');
      // return await response.json();
    } catch (error) {
      console.error('Error fetching album tracks:', error);
      return [];
    }
  }

  // Function to update the UI with album data
  async function updateUI(albumData) {
    document.getElementById('album-title').textContent = albumData.title || 'N/A';
    document.getElementById('album-artist').textContent = albumData.artist || 'N/A';
    document.getElementById('album-year').textContent = albumData.year || 'N/A';
    document.getElementById('album-genre').textContent = albumData.genre || 'N/A';
    document.getElementById('album-image').src = albumData.image || 'https://via.placeholder.com/300';
    document.getElementById('spotify-link').href = albumData.spotifyLink || '#';

    // עצירת כל אודיו שמתנגן
    stopAudio();

    // ניקוי רשימת השירים
    document.getElementById('tracks-list').innerHTML = '';

    // בדיקה אם יש קישור לספוטיפיי
    if (albumData.spotifyLink) {
      const { type, id } = extractSpotifyId(albumData.spotifyLink);

      if (type === 'album' && id) {
        // קבלת רשימת השירים באלבום
        const tracks = await fetchAlbumTracks(id);

        // יצירת רשימת השירים בממשק
        const hasTracksToShow = createTracksList(tracks, 3); // הצג 3 שירים ראשונים

        // הצג או הסתר את מיכל השירים בהתאם
        document.getElementById('album-tracks-container').style.display = hasTracksToShow ? 'block' : 'none';
      } else {
        // אם זה לא אלבום, הסתר את מיכל השירים
        document.getElementById('album-tracks-container').style.display = 'none';
      }
    } else {
      // אם אין קישור לספוטיפיי, הסתר את מיכל השירים
      document.getElementById('album-tracks-container').style.display = 'none';
    }

    // Show the result screen
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('result-screen').style.display = 'block';
  }
});
