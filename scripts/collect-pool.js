// Builds data/pool.json: a pre-collected pool of random albums from the Discogs store inventories,
// each already matched to Spotify. The site picks from this pool instead of calling Discogs per click.
//
// Usage:
//   node scripts/collect-pool.js              # add 300 new albums, then find links for up to 400 (defaults)
//   node scripts/collect-pool.js --add 2000   # add 2000 new albums
//   node scripts/collect-pool.js --add 0 --links 3000   # only fill in missing Apple Music / platform links
//
// Runs slowly on purpose (about 40 Discogs requests per minute) to stay under the 60/minute limit.

const fs = require("fs")
const path = require("path")
const axios = require("axios")

try {
  process.loadEnvFile(path.join(__dirname, "..", ".env"))
} catch {
  // No .env file: rely on real environment variables (GitHub Actions secrets)
}

const {
  storeInventories,
  processReleaseData,
  processSpotifyMatch,
  albumMatchesGenres,
  spotifyApi,
} = require("../discogs.js")
const { findPlatformLinks } = require("./platform-links.js")

const POOL_PATH = path.join(__dirname, "..", "data", "pool.json")
const TOKEN = process.env.DISCOGS_TOKEN

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback
}
const ADD_COUNT = argValue("--add", 300)
const LINKS_COUNT = argValue("--links", 400) // albums per run to look up on Apple Music etc.
const MAX_POOL_SIZE = argValue("--max", 10000) // oldest albums drop out past this size
const MAX_AGE_DAYS = argValue("--max-age", 30) // albums older than this drop out, so the pool keeps rotating
// ~40 requests/minute: leaves headroom under Discogs' 60/minute for the live site's fallback requests
const DISCOGS_DELAY_MS = 1500

const GENRES = ["hip-hop", "funk-soul", "jazz", "electronic", "rock", "blues", "reggae-dub", "world", "folk", "latin", "classical"]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// discogs.js logs every matching step; keep the collector's output readable
const log = console.log
function quietly(fn) {
  console.log = () => {}
  return fn().finally(() => {
    console.log = log
  })
}

// --- Discogs (rate-limited) ---
let lastDiscogsCall = 0
async function discogsGet(url, params = {}) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const wait = lastDiscogsCall + DISCOGS_DELAY_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastDiscogsCall = Date.now()
    try {
      const res = await axios.get(url, {
        params: { ...params, token: TOKEN },
        headers: { "User-Agent": "WaxRiffle/1.0 +https://waxriffle.com" },
        timeout: 20000,
      })
      return res.data
    } catch (err) {
      const status = err.response?.status
      if (status === 429) {
        log("  Discogs rate limit hit, waiting 60s...")
        await sleep(60000)
        continue
      }
      if (status === 404) return null
      if (attempt === 5) throw err
      await sleep(3000 * attempt)
    }
  }
  return null
}

// --- Spotify (token refresh + retry on rate limit) ---
let spotifyTokenExpiresAt = 0
async function ensureSpotifyToken() {
  if (Date.now() < spotifyTokenExpiresAt) return
  const data = await spotifyApi.clientCredentialsGrant()
  spotifyApi.setAccessToken(data.body.access_token)
  spotifyTokenExpiresAt = Date.now() + (data.body.expires_in - 300) * 1000
}

async function matchOnSpotify(album) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await ensureSpotifyToken()
    try {
      return await quietly(() => processSpotifyMatch(album))
    } catch (err) {
      if (err.statusCode === 429) {
        const retryAfter = Number(err.headers?.["retry-after"]) || 30
        log(`  Spotify rate limit hit, waiting ${retryAfter}s...`)
        await sleep(retryAfter * 1000)
        continue
      }
      if (err.statusCode === 401) {
        spotifyTokenExpiresAt = 0
        continue
      }
      if (attempt === 4) return null
      await sleep(2000 * attempt)
    }
  }
  return null
}

// --- Pool file ---
function loadPool() {
  try {
    return JSON.parse(fs.readFileSync(POOL_PATH, "utf-8"))
  } catch {
    return []
  }
}

function savePool(pool) {
  fs.mkdirSync(path.dirname(POOL_PATH), { recursive: true })
  // One album per line: small diffs in git and still valid JSON
  fs.writeFileSync(POOL_PATH, "[\n" + pool.map((a) => JSON.stringify(a)).join(",\n") + "\n]\n")
}

// Same album in different pressings/reissues has different Discogs IDs, so also compare artist + title
function albumKey(a) {
  const norm = (str) =>
    String(str || "")
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, "") // drop "(Remastered)", "[Deluxe]" etc.
      .replace(/[^\p{L}\p{N}]+/gu, "")
  return `${norm(a.artist)}|${norm(a.title)}`
}

function dedupe(pool) {
  const seen = new Set()
  return pool.filter((a) => {
    const key = albumKey(a)
    if (seen.has(a.discogsId) || seen.has(key)) return false
    seen.add(a.discogsId)
    seen.add(key)
    return true
  })
}

function prunePool(pool) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  const fresh = pool.filter((a) => new Date(a.addedAt).getTime() >= cutoff)
  fresh.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
  return fresh.slice(0, MAX_POOL_SIZE)
}

function genreCounts(pool) {
  const counts = {}
  for (const g of GENRES) counts[g] = pool.filter((a) => albumMatchesGenres(a, [g])).length
  return counts
}

// --- Collection ---
async function getStorePageCounts() {
  const pages = {}
  for (const store of Object.keys(storeInventories)) {
    const data = await discogsGet(storeInventories[store], { per_page: 100, page: 1 })
    const total = data?.pagination?.pages || 0
    if (total > 0) pages[store] = total
    log(`  ${store}: ${data?.pagination?.items ?? 0} items, ${total} pages`)
  }
  return pages
}

// Albums that still need platform links: never checked, or checked before an Odesli key existed
function needsLinks(album) {
  if (!album.links) return true
  return Boolean(process.env.ODESLI_API_KEY) && album.linksSource !== "odesli" && album.spotifyType === "album"
}

async function addPlatformLinks(pool) {
  const todo = pool.filter(needsLinks).slice(0, LINKS_COUNT)
  if (todo.length === 0) return
  log(`\nLooking up platform links for ${todo.length} albums${process.env.ODESLI_API_KEY ? " (Odesli + iTunes)" : " (iTunes)"}...`)
  let found = 0
  for (let i = 0; i < todo.length; i++) {
    const album = todo[i]
    const { links, source } = await findPlatformLinks(album)
    album.links = links
    album.linksSource = source
    if (links.appleMusic) found++
    log(`[links ${i + 1}/${todo.length}] ${album.artist} — ${album.title} · Apple Music: ${links.appleMusic ? "yes" : "no"}`)
    if ((i + 1) % 25 === 0) savePool(pool)
  }
  savePool(pool)
  log(`Apple Music found for ${found}/${todo.length}.`)
}

async function main() {
  if (!TOKEN || !process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.error("Missing DISCOGS_TOKEN / SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET (set them in .env)")
    process.exit(1)
  }

  const startedAt = Date.now()
  let pool = prunePool(dedupe(loadPool()))
  // Every album already in the pool (or added in this run) is skipped, by Discogs ID and by artist + title
  const known = new Set(pool.flatMap((a) => [a.discogsId, albumKey(a)]))
  log(`Pool has ${pool.length} albums. Adding ${ADD_COUNT} new ones.\n`)

  const storePages = ADD_COUNT > 0 ? (log("Reading store sizes..."), await getStorePageCounts()) : {}
  const stores = Object.keys(storePages)
  if (ADD_COUNT > 0 && stores.length === 0) throw new Error("No store inventories could be read")

  let added = 0
  let misses = 0
  while (added < ADD_COUNT && misses < ADD_COUNT * 3) {
    // Equal chance per store, then a random page, then random items from that page
    const store = stores[Math.floor(Math.random() * stores.length)]
    const page = Math.floor(Math.random() * storePages[store]) + 1
    const data = await discogsGet(storeInventories[store], { per_page: 100, page })
    const listings = (data?.listings || []).filter((l) => l.release && !known.has(l.release.id))
    if (listings.length === 0) {
      misses++
      continue
    }

    // Take a few albums per page so page requests don't dominate the request budget
    const picks = listings.sort(() => Math.random() - 0.5).slice(0, 5)
    for (const listing of picks) {
      if (added >= ADD_COUNT) break
      const release = await discogsGet(`https://api.discogs.com/releases/${listing.release.id}`)
      if (!release || !release.title) {
        misses++
        continue
      }

      const album = processReleaseData(release, store)
      if (known.has(albumKey(album))) {
        known.add(album.discogsId)
        continue // another pressing of an album we already have
      }
      const matched = await matchOnSpotify({ ...album })

      pool.unshift({
        discogsId: album.discogsId,
        title: album.title,
        artist: album.artist,
        year: album.year,
        genre: album.genre,
        genresRaw: album.genresRaw,
        stylesRaw: album.stylesRaw,
        labels: album.labels,
        image: album.image,
        store,
        discogsUrl: album.discogsUrl,
        listingUrl: listing.uri, // the actual record for sale in that store
        price: listing.price ? `${listing.price.value} ${listing.price.currency}` : undefined,
        spotifyLink: matched?.spotifyLink,
        spotifyType: matched?.spotifyType,
        addedAt: new Date().toISOString(),
      })
      known.add(album.discogsId)
      known.add(albumKey(album))
      added++

      log(`[${added}/${ADD_COUNT}] ${album.artist} — ${album.title} (${store}) · Spotify: ${matched?.spotifyType || "none"}`)
      if (added % 25 === 0) savePool(pool) // save progress in case the run is interrupted
    }
  }

  pool = prunePool(dedupe(pool))
  savePool(pool)
  await addPlatformLinks(pool)

  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1)
  const playable = pool.filter((a) => a.spotifyType === "album" || a.spotifyType === "track").length
  const onApple = pool.filter((a) => a.links?.appleMusic).length
  log(`\nDone in ${minutes} min. Added ${added}. Pool size: ${pool.length} (${playable} with a direct Spotify match, ${onApple} on Apple Music).`)
  log("Albums per genre filter:", genreCounts(pool))
}

main().catch((err) => {
  console.error("Collector failed:", err.message)
  process.exit(1)
})
