// רשימת ז'אנרים פופולריים
const GENRES = [
  "Rock",
  "Jazz",
  "Electronic",
  "Hip Hop",
  "Classical",
  "Blues",
  "Funk / Soul",
  "Reggae",
  "Latin",
  "Folk, World, & Country",
  "Pop",
  "Soundtrack",
  "Metal"
];

// מערך לשמירת הז'אנרים שנבחרו
let selectedGenres = [];

// יצירת משתנה גלובלי לאנימציה
let loadingAnimation;

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

  // אתחול בורר הז'אנרים
  initGenreSelector();

  // Function to fetch album data from the backend
  async function fetchAlbumData() {
    try {
      // הצג את האנימציה והסתר את הכפתור
      document.getElementById('explore-button').style.display = 'none';
      document.getElementById('loading-animation').style.display = 'block';
      loadingAnimation.play(); // הפעל את האנימציה

      // בניית URL עם פרמטרים של ז'אנרים שנבחרו
      let url = '/api/album';
      if (selectedGenres.length > 0) {
        const genreParams = selectedGenres.map(g => `genres=${encodeURIComponent(g)}`).join('&');
        url = `${url}?${genreParams}`;
      }

      const response = await fetch(url); // Update the path to the correct endpoint
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

  // פונקציה לאתחול בורר הז'אנרים
  function initGenreSelector() {
    // בדוק אם האלמנטים הנדרשים קיימים
    const mainScreen = getElement('main-screen');
    if (!mainScreen) return;

    // יצירת מיכל לבחירת ז'אנרים
    const genreSelectionContainer = document.createElement('div');
    genreSelectionContainer.id = 'genre-selection';
    genreSelectionContainer.className = 'genre-selection';

    // הוספת כפתור להצגת/הסתרת רשימת הז'אנרים
    const toggleButton = document.createElement('button');
    toggleButton.id = 'toggle-genres-button';
    toggleButton.className = 'toggle-button';
    toggleButton.textContent = 'Choose Genres';
    genreSelectionContainer.appendChild(toggleButton);

    // יצירת מיכל לז'אנרים שנבחרו
    const selectedGenresContainer = document.createElement('div');
    selectedGenresContainer.id = 'selected-genres-container';
    selectedGenresContainer.className = 'selected-genres';
    selectedGenresContainer.style.display = 'none';

    const selectedGenresTitle = document.createElement('p');
    selectedGenresTitle.textContent = 'Selected Genres:';
    selectedGenresContainer.appendChild(selectedGenresTitle);

    const selectedGenresTags = document.createElement('div');
    selectedGenresTags.id = 'selected-genres-tags';
    selectedGenresTags.className = 'genre-tags';
    selectedGenresContainer.appendChild(selectedGenresTags);

    const clearButton = document.createElement('button');
    clearButton.id = 'clear-genres-button';
    clearButton.className = 'clear-button';
    clearButton.textContent = 'Clear All';
    selectedGenresContainer.appendChild(clearButton);

    genreSelectionContainer.appendChild(selectedGenresContainer);

    // יצירת רשימת הז'אנרים
    const genreList = document.createElement('div');
    genreList.id = 'genre-list';
    genreList.className = 'genre-list';
    genreList.style.display = 'none';

    // יצירת תיבות סימון לכל ז'אנר
    GENRES.forEach(genre => {
      const label = document.createElement('label');
      label.className = 'genre-checkbox';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = genre;
      checkbox.addEventListener('change', function() {
        if (this.checked) {
          addGenre(genre);
        } else {
          removeGenre(genre);
        }
      });

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(genre));
      genreList.appendChild(label);
    });

    genreSelectionContainer.appendChild(genreList);

    // הוספת מיכל בחירת הז'אנרים לפני כפתור החיפוש
    const exploreButton = getElement('explore-button');
    mainScreen.insertBefore(genreSelectionContainer, exploreButton);

    // הוספת סגנונות CSS
    addGenreStyles();

    // הוספת מאזיני אירועים
    toggleButton.addEventListener('click', function() {
      if (genreList.style.display === 'none' || !genreList.style.display) {
        genreList.style.display = 'grid';
        toggleButton.textContent = 'Hide Genres';
      } else {
        genreList.style.display = 'none';
        toggleButton.textContent = 'Choose Genres';
      }
    });

    clearButton.addEventListener('click', function() {
      clearGenres();
    });
  }

  // פונקציה להוספת סגנונות CSS
  function addGenreStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .genre-selection {
        margin: 20px auto;
        max-width: 500px;
        text-align: center;
      }

      .toggle-button {
        padding: 10px 20px;
        background-color: #8281FE;
        color: white;
        border: none;
        border-radius: 30px;
        cursor: pointer;
        font-weight: bold;
        margin-bottom: 10px;
        min-width: 200px;
      }

      .genre-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 10px;
        margin: 15px auto;
        padding: 15px;
        border: 1px solid #ddd;
        border-radius: 8px;
        background-color: rgba(255, 255, 255, 0.9);
        max-width: 500px;
        text-align: left;
      }

      .genre-checkbox {
        display: flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        margin: 5px;
        color: #333;
      }

      .genre-checkbox input {
        margin-right: 5px;
      }

      .selected-genres {
        margin: 15px auto;
        max-width: 500px;
      }

      .genre-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 5px;
        justify-content: center;
      }

      .genre-tag {
        display: inline-flex;
        align-items: center;
        background-color: #8281FE;
        color: white;
        padding: 5px 10px;
        border-radius: 20px;
        font-size: 14px;
      }

      .remove-genre {
        background: none;
        border: none;
        color: white;
        margin-left: 5px;
        cursor: pointer;
        font-size: 16px;
        padding: 0 5px;
      }

      .clear-button {
        background: none;
        border: 1px solid #8281FE;
        color: #8281FE;
        padding: 5px 10px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        margin-top: 10px;
      }
    `;
    document.head.appendChild(styleElement);
  }

  // פונקציה להוספת ז'אנר לרשימת הנבחרים
  function addGenre(genre) {
    if (!selectedGenres.includes(genre)) {
      selectedGenres.push(genre);
      updateSelectedGenresTags();
    }
  }

  // פונקציה להסרת ז'אנר מרשימת הנבחרים
  function removeGenre(genre) {
    selectedGenres = selectedGenres.filter(g => g !== genre);
    updateSelectedGenresTags();

    // עדכון מצב תיבת הסימון
    const checkbox = document.querySelector(`input[value="${genre}"]`);
    if (checkbox) checkbox.checked = false;
  }

  // פונקציה לניקוי כל הז'אנרים שנבחרו
  function clearGenres() {
    selectedGenres = [];
    updateSelectedGenresTags();

    // איפוס כל תיבות הסימון
    document.querySelectorAll('.genre-checkbox input').forEach(checkbox => {
      checkbox.checked = false;
    });
  }

  // פונקציה לעדכון תצוגת התגיות של הז'אנרים שנבחרו
  function updateSelectedGenresTags() {
    const tagsContainer = document.getElementById('selected-genres-tags');
    const selectedGenresContainer = document.getElementById('selected-genres-container');

    if (!tagsContainer || !selectedGenresContainer) return;

    // ניקוי התגיות הקיימות
    tagsContainer.innerHTML = '';

    // הוספת תגיות חדשות
    selectedGenres.forEach(genre => {
      const tag = document.createElement('span');
      tag.className = 'genre-tag';
      tag.textContent = genre;

      const removeButton = document.createElement('button');
      removeButton.className = 'remove-genre';
      removeButton.textContent = '×';
      removeButton.addEventListener('click', function() {
        removeGenre(genre);
      });

      tag.appendChild(removeButton);
      tagsContainer.appendChild(tag);
    });

    // הצגה או הסתרה של מיכל התגיות בהתאם למספר הז'אנרים שנבחרו
    if (selectedGenres.length > 0) {
      selectedGenresContainer.style.display = 'block';
    } else {
      selectedGenresContainer.style.display = 'none';
    }
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
      // שמור את הטקסט המקורי של הכפתור
      const originalText = exploreAgainButton.textContent;

      // שנה את הטקסט ל"טוען..." והוסף קלאס טעינה
      exploreAgainButton.textContent = "Loading...";
      exploreAgainButton.classList.add("loading");
      exploreAgainButton.disabled = true; // מנע לחיצות נוספות בזמן הטעינה

      try {
        // בניית URL עם פרמטרים של ז'אנרים שנבחרו
        let url = '/api/album';
        if (selectedGenres.length > 0) {
          const genreParams = selectedGenres.map(g => `genres=${encodeURIComponent(g)}`).join('&');
          url = `${url}?${genreParams}`;
        }

        // קריאה ישירה ל-API
        const response = await fetch(url);
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
      document.getElementById('result-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'block';
      // וודא שהכפתור מוצג ולא האנימציה
      document.getElementById('loading-animation').style.display = 'none';
      document.getElementById('explore-button').style.display = 'flex';
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
