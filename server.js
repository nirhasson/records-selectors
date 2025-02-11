const express = require('express');
const cors = require('cors');
const axios = require('axios');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const PORT = 3000;

// Enable CORS for frontend-backend communication
app.use(cors());

// Spotify and Discogs settings
const TOKEN = 'vXJXtxmtPTPMbptayjsnIaNWIsnaaBcqsbJdZext';
const spotifyApi = new SpotifyWebApi({
  clientId: 'aed4b36b93454410ab42ba33c4f3ae6c',
  clientSecret: '5ffaf812e47e4498a06888f67c46197b',
});

// Discogs store inventories
const storeInventories = {
  'RookRecords': 'https://api.discogs.com/users/RookRecords/inventory',
  'CrocoDiscos': 'https://api.discogs.com/users/CrocoDiscos/inventory',
  'Peekaboo_records': 'https://api.discogs.com/users/Peekaboo_records/inventory',
  'superflyrecordsparis': 'https://api.discogs.com/users/superflyrecordsparis/inventory',
};

// Function to fetch a random album
async function fetchRandomAlbum() {
  const storeNames = Object.keys(storeInventories);
  const randomStoreName = storeNames[Math.floor(Math.random() * storeNames.length)];
  const inventoryURL = storeInventories[randomStoreName] + `?token=${TOKEN}&per_page=50`;

  try {
    const response = await axios.get(inventoryURL);
    const items = response.data.listings;

    if (items.length > 0) {
      const randomIndex = Math.floor(Math.random() * items.length);
      const item = items[randomIndex].release;

      // Fetch Spotify details
      const spotifyAuth = await spotifyApi.clientCredentialsGrant();
      spotifyApi.setAccessToken(spotifyAuth.body['access_token']);
      const searchResult = await spotifyApi.searchAlbums(item.title);
      const spotifyAlbum = searchResult.body.albums.items[0];

      return {
        title: item.title,
        artist: item.artists_sort || 'Unknown Artist',
        year: item.year || 'Unknown Year',
        genre: item.genres ? item.genres.join(', ') : 'Unknown Genre',
        image: item.thumb || 'No image available',
        spotifyLink: spotifyAlbum ? spotifyAlbum.external_urls.spotify : null,
      };
    }
  } catch (error) {
    console.error('Error fetching album:', error.message);
  }

  return null;
}

// API route to fetch album
app.get('/api/album', async (req, res) => {
  const album = await fetchRandomAlbum();
  if (album) {
    res.json(album);
  } else {
    res.status(500).json({ error: 'No album found' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
