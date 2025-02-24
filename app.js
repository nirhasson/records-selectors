const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

const { fetchRandomAlbum, fetchCustomAlbum } = require('./discogs.js');

app.use(cors());

// חלק חדש
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

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

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
