document.addEventListener("DOMContentLoaded", function () {
  console.log("📌 Document is fully loaded");

  // פונקציה למשיכת נתוני אלבום מה-Backend
  async function fetchAlbumData() {
    try {
      const response = await fetch('https://wax-riffle.vercel.app/'); // עדכון הנתיב
      if (!response.ok) throw new Error('Failed to fetch album data');
      const albumData = await response.json();
      console.log("✅ Received album data:", albumData); // בדיקת הנתונים שמתקבלים
      return albumData;
    } catch (error) {
      console.error('❌ Error fetching album data:', error);
      return null;
    }
  }

  // פונקציה לקבלת אלמנט עם בדיקה שהוא קיים
  function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
      console.error(`❌ Error: Element with ID '${id}' not found.`);
    }
    return element;
  }

  // אחזור הכפתורים
  const exploreButton = getElement('explore-button');
  const exploreAgainButton = getElement('explore-again-button');
  const backButton = getElement('back-button');

  // מאזין ללחיצה על כפתור "Explore Albums"
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

  // מאזין ללחיצה על כפתור "Explore Again"
  if (exploreAgainButton) {
    exploreAgainButton.addEventListener('click', () => {
      exploreAgainButton.classList.add("loading");
      if (exploreButton) exploreButton.click();
    });
  }

  // מאזין ללחיצה על כפתור "Back"
  if (backButton) {
    backButton.addEventListener('click', () => {
      document.getElementById('result-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'block';
    });
  }

  // פונקציה לעדכון ממשק המשתמש עם נתוני האלבום
  function updateUI(albumData) {
    document.getElementById('album-title').textContent = albumData.title || 'N/A';
    document.getElementById('album-artist').textContent = albumData.artist || 'N/A';
    document.getElementById('album-year').textContent = albumData.year || 'N/A';
    document.getElementById('album-genre').textContent = albumData.genre || 'N/A';
    document.getElementById('album-image').src = albumData.image || 'https://via.placeholder.com/300';
    document.getElementById('spotify-link').href = albumData.spotifyLink || '#';

    // הצגת מסך התוצאה
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('result-screen').style.display = 'block';
  }
});
