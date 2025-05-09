const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const { fetchRandomAlbum, fetchCustomAlbum } = require('./discogs.js');

app.use(cors());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' directory

async function getAlbum() {
  console.log("🔄 Fetching album...");

  try {
    const customAlbum = await fetchCustomAlbum();

    let percent = Math.ceil(Math.random() * 100);
    console.log(`🔢 Percent chosen: ${percent}`);

    let album = (percent < 1 && customAlbum) ? customAlbum : await fetchRandomAlbum();

    if (!album || !album.title) {
      console.error("🚨 Error in getAlbum: ❌ No album found in both sources.");
      return null;
    }
    console.log(`🏪 Album selected from store: ${album.store || 'Custom List'}`);
    console.log("✅ Album found:", album);
    return album;
  } catch (error) {
    console.error("❌ 123Error in getAlbum:", error);
    return null;
  }
}

app.get('/album', async (req, res) => {
  try {
    console.log("📡 API Request received at /album");
    const album = await getAlbum();
    if (!album) {
      console.error("❌ No album was returned!");
      return res.status(500).json({ error: 'No album found' });
    }
    console.log("✅ Sending album to frontend:", album);
    res.json(album);
  } catch (error) {
    console.error('🚨 Error fetching album:', error);
    res.status(500).json({ error: 'Failed to fetch album' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html')); // Serve the index.html file for all other routes
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
