const { fetchRandomAlbum, fetchCustomAlbum, albumMatchesGenres } = require("../discogs.js")

// Pre-collected albums (built nightly by scripts/collect-pool.js). Loaded once per server instance.
let pool = []
try {
  pool = require("../data/pool.json")
} catch {
  console.warn("⚠️ data/pool.json not found — falling back to live Discogs requests")
}

// Roll a 0-100 float; CUSTOM_ALBUM_CHANCE_PERCENT is the real odds of picking a custom album
const CUSTOM_ALBUM_CHANCE_PERCENT = 5

// excludeIds: albums this visitor already saw in this session (sent by the browser)
function pickFromPool(selectedGenres, excludeIds) {
  const candidates = pool.filter(
    (a) => !excludeIds.has(String(a.discogsId)) && (!selectedGenres.length || albumMatchesGenres(a, selectedGenres)),
  )
  if (candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    return res.status(405).end(`Method ${req.method} is not supported`)
  }

  try {
    // Parse optional genre filter: ?genres=jazz,funk-soul
    const genresParam = req.query.genres
    const selectedGenres = genresParam
      ? genresParam.split(",").map((g) => g.trim().toLowerCase()).filter(Boolean)
      : []

    const excludeIds = new Set(String(req.query.exclude || "").split(",").filter(Boolean))

    let album = null
    if (Math.random() * 100 < CUSTOM_ALBUM_CHANCE_PERCENT) album = await fetchCustomAlbum()
    if (!album) album = pickFromPool(selectedGenres, excludeIds)
    // Slow path: the pool is missing, or has nothing new for this genre — search the stores live
    if (!album) album = await fetchRandomAlbum(selectedGenres)

    if (!album || !album.title) {
      console.error("🚨 No album found in any source")
      return res.status(500).json({ error: "No album found" })
    }

    // Always provide a Spotify link, even if it's only a search
    if (!album.spotifyLink) {
      const searchQuery = encodeURIComponent(`${album.artist} ${album.title}`)
      album = { ...album, spotifyLink: `https://open.spotify.com/search/${searchQuery}` }
    }

    return res.status(200).json(album)
  } catch (error) {
    console.error("❌ Error in getAlbum:", error)
    return res.status(500).json({ error: "Failed to fetch album" })
  }
}
