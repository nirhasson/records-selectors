// Use CommonJS imports
const { fetchRandomAlbum, fetchCustomAlbum } = require("../discogs.js")

// Export as a serverless function
module.exports = async (req, res) => {
  console.log("📡 Request to /api/album received")

  if (req.method === "GET") {
    try {
      console.log("🔄 Fetching album...")

      // Parse optional genre filter: ?genres=jazz,funk,soul
      const genresParam = req.query.genres
      const selectedGenres = genresParam
        ? genresParam.split(",").map((g) => g.trim().toLowerCase()).filter(Boolean)
        : []
      console.log(`🎵 Genre filter: [${selectedGenres.join(", ") || "all"}]`)

      // Try to get a custom album
      const customAlbum = await fetchCustomAlbum()

      // Roll a 0-100 float; CUSTOM_ALBUM_CHANCE_PERCENT is the real odds of picking a custom album
      const CUSTOM_ALBUM_CHANCE_PERCENT = 5
      const roll = Math.random() * 100
      console.log(`🔢 Roll: ${roll.toFixed(2)} (custom album chance: ${CUSTOM_ALBUM_CHANCE_PERCENT}%)`)

      // Determine which album to send
      const album = roll < CUSTOM_ALBUM_CHANCE_PERCENT && customAlbum ? customAlbum : await fetchRandomAlbum(selectedGenres)

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
