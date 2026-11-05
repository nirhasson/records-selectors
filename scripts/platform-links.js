// Finds the same album on other streaming platforms.
// - With ODESLI_API_KEY set: Odesli (song.link) turns the Spotify link into links for every platform.
//   Keys are free on request from developers@song.link (keyless access was shut down in 2026).
// - Otherwise, or when Odesli has no result: iTunes Search API for Apple Music (free, no key).

const axios = require("axios")
const { similarityScore } = require("../discogs.js")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Simple per-service throttle
function throttle(minGapMs) {
  let last = 0
  return async () => {
    const wait = last + minGapMs - Date.now()
    if (wait > 0) await sleep(wait)
    last = Date.now()
  }
}

const waitItunes = throttle(3200) // Apple allows roughly 20 requests/minute
const waitOdesli = throttle(1000)

// Odesli platform name → our field name
const ODESLI_PLATFORMS = {
  appleMusic: "appleMusic",
  youtubeMusic: "youtubeMusic",
  youtube: "youtube",
  tidal: "tidal",
  deezer: "deezer",
  amazonMusic: "amazonMusic",
  bandcamp: "bandcamp",
  soundcloud: "soundcloud",
}

async function getWithRetry(url, params, waitTurn) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await waitTurn()
    try {
      return (await axios.get(url, { params, timeout: 15000 })).data
    } catch (err) {
      const status = err.response?.status
      if (status === 429 || status === 403) {
        console.log(`  ${new URL(url).hostname} rate limit hit, waiting 60s...`)
        await sleep(60000)
        continue
      }
      if (status === 401 || status === 400 || status === 404 || attempt === 4) return null
      await sleep(3000 * attempt)
    }
  }
  return null
}

async function fromOdesli(spotifyLink) {
  const key = process.env.ODESLI_API_KEY
  if (!key || !spotifyLink || spotifyLink.includes("/search/")) return null
  const data = await getWithRetry(
    "https://api.song.link/v1-alpha.1/links",
    { url: spotifyLink, userCountry: "US", key },
    waitOdesli,
  )
  if (!data?.linksByPlatform) return null
  const links = {}
  for (const [platform, field] of Object.entries(ODESLI_PLATFORMS)) {
    if (data.linksByPlatform[platform]?.url) links[field] = data.linksByPlatform[platform].url
  }
  return links
}

async function appleMusicFromItunes(album) {
  const data = await getWithRetry(
    "https://itunes.apple.com/search",
    { term: `${album.artist} ${album.title}`, entity: "album", limit: 10, country: "US" },
    waitItunes,
  )
  const results = data?.results || []
  const isCompilation = /^various/i.test(album.artist)

  // A different edition of the album (e.g. "(Instrumentals)") is not the same record
  const editionWords = /instrumental|karaoke|tribute|remix|acapella|a cappella|cover/i
  const wantsEdition = editionWords.test(album.title)

  let best = null
  for (const r of results) {
    if (!wantsEdition && editionWords.test(r.collectionName)) continue
    const titleScore = similarityScore(album.title, r.collectionName)
    const artistScore = isCompilation ? 100 : similarityScore(album.artist, r.artistName)
    // Same bar as a person would use: the artist must match, and the title must clearly match
    if (artistScore < 80 || titleScore < (isCompilation ? 80 : 60)) continue
    const year = String(r.releaseDate || "").slice(0, 4)
    const score = titleScore + artistScore + (year && String(album.year) === year ? 10 : 0)
    if (!best || score > best.score) best = { score, url: r.collectionViewUrl }
  }
  return best ? best.url.replace(/\?uo=\d+$/, "") : null
}

// Returns { links, source }. links is {} when nothing was found (so we don't ask again every night).
async function findPlatformLinks(album) {
  const links = (await fromOdesli(album.spotifyLink)) || {}
  const source = Object.keys(links).length ? "odesli" : "itunes"
  if (!links.appleMusic) {
    const apple = await appleMusicFromItunes(album)
    if (apple) links.appleMusic = apple
  }
  return { links, source }
}

module.exports = { findPlatformLinks }
