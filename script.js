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

    // Show the result screen
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('result-screen').style.display = 'block';
  }
});
