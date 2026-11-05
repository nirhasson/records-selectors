// Builds the data behind the public album and genre pages, plus sitemap.xml and robots.txt.
// Runs nightly after collect-pool.js. Usage: node scripts/build-pages.js
//
// The archive keeps every album that was ever in the pool, so an album page stays online
// after the album rotates out of the pool (pages that disappear hurt search ranking).
//
// Output:
//   data/site/albums/<first character of slug>.json  — one album per line, keyed by slug
//   data/site/genres/<genre>.json                    — album list per genre, newest first
//   sitemap.xml, sitemaps/*.xml, robots.txt

const fs = require("fs")
const path = require("path")
const { albumMatchesGenres } = require("../discogs.js")
const { SITE_URL, GENRES, slugify, albumKey, shardOf } = require("../lib/site.js")

const ROOT = path.join(__dirname, "..")
const SITE_DIR = path.join(ROOT, "data/site")
const ALBUMS_DIR = path.join(SITE_DIR, "albums")
const GENRES_DIR = path.join(SITE_DIR, "genres")
const SITEMAPS_DIR = path.join(ROOT, "sitemaps")
const GENRE_PAGE_SIZE = 48
const SITEMAP_CHUNK = 40000 // Google allows 50,000 URLs per sitemap file

const DISCOGS_GENRES = [
  "Electronic", "Hip Hop", "Jazz", "Rock", "Funk / Soul", "Pop", "Folk, World, & Country", "Latin",
  "Reggae", "Blues", "Classical", "Stage & Screen", "Non-Music", "Children's", "Brass & Military",
]

// Discogs sometimes has no year ("N/A" or 0)
const cleanYear = (y) => (/^\d{4}$/.test(String(y || "")) ? Number(y) : null)

// Hand-added albums (radio shows) sometimes carry a style instead of a Discogs genre.
// These words place them in the right genre pages.
const STYLE_TO_GENRES = [
  [/afro|candombe|world|highlife|soukous/i, ["Folk, World, & Country"]],
  [/candombe|cumbia|salsa|bossa|latin/i, ["Latin"]],
  [/rave|house|techno|electro|ambient/i, ["Electronic"]],
  [/rave|indie|punk|core|metal|rock/i, ["Rock"]],
  [/afropop/i, ["Funk / Soul"]],
]

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return fallback
  }
}

// One entry per line keeps nightly git diffs small and readable
function writeLines(file, value) {
  const body = Array.isArray(value)
    ? `[\n${value.map((v) => JSON.stringify(v)).join(",\n")}\n]\n`
    : `{\n${Object.entries(value)
        .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
        .join(",\n")}\n}\n`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
}

function loadArchive() {
  const records = []
  if (!fs.existsSync(ALBUMS_DIR)) return records
  for (const file of fs.readdirSync(ALBUMS_DIR).filter((f) => f.endsWith(".json"))) {
    records.push(...Object.values(readJson(path.join(ALBUMS_DIR, file), {})))
  }
  return records
}

function fromPool(a) {
  return {
    discogsId: a.discogsId,
    title: a.title,
    artist: a.artist,
    year: cleanYear(a.year),
    genre: a.genre || "",
    genresRaw: a.genresRaw || [],
    stylesRaw: a.stylesRaw || [],
    labels: a.labels || "",
    image: a.image || "",
    store: a.store || "",
    discogsUrl: a.discogsUrl || "",
    listingUrl: a.listingUrl || "",
    price: a.price || "",
    spotifyLink: a.spotifyLink || "",
    spotifyType: a.spotifyType || "",
    links: a.links || {},
    firstSeen: (a.addedAt || new Date().toISOString()).slice(0, 10),
  }
}

function fromCustom(a, today) {
  const genre = String(a.genre || "").trim()
  const spotifyLink = String(a.spotifyLink || "").split("?")[0]
  return {
    title: String(a.title).trim(),
    artist: String(a.artist).trim(),
    year: cleanYear(a.year),
    genre,
    genresRaw: [
      ...new Set([
        ...DISCOGS_GENRES.filter((g) => genre.includes(g)),
        ...(/^Folk, World$/i.test(genre) ? ["Folk, World, & Country"] : []),
        ...STYLE_TO_GENRES.filter(([re]) => re.test(genre)).flatMap(([, g]) => g),
      ]),
    ],
    stylesRaw: genre ? [genre] : [],
    image: a.image || "",
    spotifyLink,
    spotifyType: /\/album\//.test(spotifyLink) ? "album" : "",
    links: a.links || {},
    show: a.show || "",
    host: a.host || "",
    broadcastDate: a.broadcastDate || "",
    firstSeen: a.broadcastDate || today,
  }
}

function build() {
  const today = new Date().toISOString().slice(0, 10)
  const pool = readJson(path.join(ROOT, "data/pool.json"), [])
  const custom = readJson(path.join(ROOT, "custom_albums.json"), [])

  const byKey = new Map()
  const slugsTaken = new Map() // slug → key
  for (const r of loadArchive()) {
    const key = albumKey(r.artist, r.title)
    byKey.set(key, { ...r, inPool: false })
    slugsTaken.set(r.slug, key)
  }
  const archivedBefore = byKey.size

  function upsert(fresh, inPool) {
    if (!fresh.title || !fresh.artist) return
    const key = albumKey(fresh.artist, fresh.title)
    const existing = byKey.get(key)
    if (existing) {
      // Keep the page address and first-seen date; refresh everything else. Empty values never erase known ones.
      const merged = { ...existing }
      for (const [field, value] of Object.entries(fresh)) {
        if (field === "firstSeen") continue
        const empty = value === "" || value == null || (typeof value === "object" && !Object.keys(value).length)
        if (!empty) merged[field] = value
      }
      merged.inPool = existing.inPool || inPool
      byKey.set(key, merged)
      return
    }
    let slug = slugify(`${fresh.artist} ${fresh.title}`) || `album-${fresh.discogsId || slugsTaken.size + 1}`
    if (slugsTaken.has(slug)) {
      const base = slug
      slug = `${base}-${fresh.discogsId || fresh.year || ""}`.replace(/-$/, "")
      for (let n = 2; slugsTaken.has(slug); n++) slug = `${base}-${n}`
    }
    slugsTaken.set(slug, key)
    byKey.set(key, { slug, ...fresh, inPool })
  }

  for (const a of pool) upsert(fromPool(a), true)
  for (const a of custom) upsert(fromCustom(a, today), false)

  // Newest first; slug breaks ties so the order is the same on every run
  const albums = [...byKey.values()].sort(
    (a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.slug.localeCompare(b.slug),
  )

  // Album records, split by first character of the slug
  fs.rmSync(ALBUMS_DIR, { recursive: true, force: true })
  const shards = {}
  for (const a of [...albums].sort((x, y) => x.slug.localeCompare(y.slug))) {
    const shard = shardOf(a.slug)
    shards[shard] = shards[shard] || {}
    const { inPool, ...rest } = a
    shards[shard][a.slug] = { ...rest, inPool }
  }
  for (const [shard, records] of Object.entries(shards)) writeLines(path.join(ALBUMS_DIR, `${shard}.json`), records)

  // Genre lists: just what a grid card needs
  fs.rmSync(GENRES_DIR, { recursive: true, force: true })
  const genreCounts = {}
  for (const genre of Object.keys(GENRES)) {
    const list = albums
      .filter((a) => albumMatchesGenres(a, [genre]))
      .map((a) => ({ s: a.slug, t: a.title, a: a.artist, y: a.year, i: a.image }))
    genreCounts[genre] = list.length
    writeLines(path.join(GENRES_DIR, `${genre}.json`), list)
  }

  // Sitemaps
  const pages = [{ loc: "/" }]
  for (const [genre, count] of Object.entries(genreCounts)) {
    if (!count) continue
    pages.push({ loc: `/genre/${genre}` })
    const pageCount = Math.ceil(count / GENRE_PAGE_SIZE)
    for (let p = 2; p <= pageCount; p++) pages.push({ loc: `/genre/${genre}/page/${p}` })
  }
  for (const a of albums) pages.push({ loc: `/album/${a.slug}`, lastmod: a.firstSeen })

  fs.rmSync(SITEMAPS_DIR, { recursive: true, force: true })
  fs.mkdirSync(SITEMAPS_DIR)
  const urlTag = (p) => `<url><loc>${SITE_URL}${p.loc}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ""}</url>`
  const files = []
  for (let i = 0; i < pages.length; i += SITEMAP_CHUNK) {
    const name = `sitemaps/pages-${files.length + 1}.xml`
    fs.writeFileSync(
      path.join(ROOT, name),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
        .slice(i, i + SITEMAP_CHUNK)
        .map(urlTag)
        .join("\n")}\n</urlset>\n`,
    )
    files.push(name)
  }
  fs.writeFileSync(
    path.join(ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files
      .map((f) => `<sitemap><loc>${SITE_URL}/${f}</loc></sitemap>`)
      .join("\n")}\n</sitemapindex>\n`,
  )
  fs.writeFileSync(
    path.join(ROOT, "robots.txt"),
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
  )

  console.log(
    `Albums: ${albums.length} (${albums.length - archivedBefore} new, ${albums.filter((a) => !a.inPool).length} not in the pool). ` +
      `Sitemap URLs: ${pages.length}.`,
  )
  console.log("Albums per genre page:", genreCounts)
}

build()
