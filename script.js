document.addEventListener("DOMContentLoaded", function () {
  console.log("📌 Document is fully loaded");

  // Function to fetch album data from the backend
  async function fetchAlbumData() {
    try {
      const response = await fetch('/api/album'); // Update the path to the correct endpoint
      if (!response.ok) throw new Error('Failed to fetch album data');
      const albumData = await response.json();
      console.log("✅ Received album data:", albumData); // Check the received data
      return albumData;
    } catch (error) {
      console.error('❌ Error fetching album data:', error);
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
    exploreAgainButton.addEventListener('click', () => {
      exploreAgainButton.classList.add("loading");
      if (exploreButton) exploreButton.click();
    });
  }

  // Listener for clicking the "Back" button
  if (backButton) {
    backButton.addEventListener('click', () => {
      document.getElementById('result-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'block';
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
