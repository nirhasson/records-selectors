// Use CommonJS imports
const { fetchRandomAlbum, fetchCustomAlbum } = require("../discog.js")

// Export as a serverless function
module.exports = async (req, res) => {
  console.log("📡 Request to /api/album received")

  // Set CORS headers to prevent caching
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
  res.setHeader("Surrogate-Control", "no-store")

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "GET") {
    try {
      console.log("🔄 Fetching album...")

      // קבל את הז'אנרים שנבחרו מהפרמטרים של ה-URL
      const selectedGenres = req.query.genres ?
        Array.isArray(req.query.genres) ? req.query.genres : [req.query.genres] :
        [];

      if (selectedGenres.length > 0) {
        console.log(`🎵 Filtering by genres: ${selectedGenres.join(', ')}`)
      }

      // Try to get a custom album
      const customAlbum = await fetchCustomAlbum()

      // Generate random number between 1-100
      const percent = Math.ceil(Math.random() * 100)
      console.log(`🔢 Percent chosen: ${percent}`)

      // Determine which album to send
      const album = percent < 1 && customAlbum ?
        customAlbum :
        await fetchRandomAlbum({ selectedGenres })

      // Check if valid album exists
      if (!album || !album.title) {
        console.error("🚨 Error in getAlbum: ❌ No album found in both sources.")
        return res.status(500).json({ error: "No album found" })
      }

      // וודא שיש תמיד קישור לספוטיפיי, אפילו אם זה רק קישור לחיפוש
      if (!album.spotifyLink) {
        const searchQuery = encodeURIComponent(`${album.artist} ${album.title}`)
        album.spotifyLink = `https://open.spotify.com/search/${searchQuery}`
        console.log(`🔍 Added fallback search link: ${album.spotifyLink}`)
      }

      // Add timestamp to prevent client-side caching
      album.timestamp = Date.now()

      console.log(`🏪 Album selected from store: ${album.store || "Custom List"}`)
      console.log("✅ Sending album to frontend:", album)
      return res.status(200).json(album)
    } catch (error) {
      console.error("❌ Error in getAlbum:", error)
      return res.status(500).json({ error: "Failed to fetch album" })
    }
  } else {
    res.setHeader("Allow", ["GET"])
    res.status(405).end(`Method ${req.method} is not supported`)
  }
}
