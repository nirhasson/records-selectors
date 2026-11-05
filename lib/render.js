// Server-rendered public pages: /album/:slug and /genre/:genre.
// Used by api/page.js on Vercel and by local-server.js. Data comes from scripts/build-pages.js.

const fs = require("fs")
const path = require("path")
const { SITE_URL, GENRES, storeName, storeUrl, shardOf, radioShow } = require("./site.js")
const { albumMatchesGenres } = require("../discogs.js")

const DATA_DIR = path.join(__dirname, "../data/site")
const GENRE_PAGE_SIZE = 48
const RELATED_COUNT = 6

// Files are loaded once per server instance
const cache = new Map()
function load(file, fallback) {
  if (!cache.has(file)) {
    try {
      cache.set(file, JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")))
    } catch {
      cache.set(file, fallback)
    }
  }
  return cache.get(file)
}
const getAlbum = (slug) => load(`albums/${shardOf(slug)}.json`, {})[slug] || null
const getGenreList = (genre) => load(`genres/${genre}.json`, [])

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`
const truncate = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`)

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}

// The filter pill (genre key) an album belongs to first, for breadcrumbs and "more like this"
function primaryGenre(album) {
  return Object.keys(GENRES).find((g) => albumMatchesGenres(album, [g])) || null
}

const NO_COVER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23444'/%3E%3Ccircle cx='50' cy='50' r='30' fill='none' stroke='%23666' stroke-width='2'/%3E%3Ccircle cx='50' cy='50' r='5' fill='%23666'/%3E%3C/svg%3E"

const SPOTIFY_ICON = `<svg class="listen-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1DB954"/><g fill="none" stroke="#121212" stroke-linecap="round"><path d="M5.6 9.1c4-1.25 9-.95 12.6 1.2" stroke-width="2"/><path d="M6.3 12.7c3.4-1 7.5-.65 10.4 1.15" stroke-width="1.7"/><path d="M7 16.1c2.8-.75 5.8-.45 8.1.9" stroke-width="1.4"/></g></svg>`
const APPLE_ICON = `<svg class="listen-icon" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="apple-music-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FB5C74"/><stop offset="1" stop-color="#FA233B"/></linearGradient></defs><rect width="24" height="24" rx="5.5" fill="url(#apple-music-gradient)"/><g fill="#fff" transform="translate(0.8 0)"><path d="M9.2 7.7 17.6 5.6v9.6h-1.35V8.75L10.55 10.2v6.6H9.2Z"/><ellipse cx="8.1" cy="16.9" rx="2.25" ry="1.75" transform="rotate(-18 8.1 16.9)"/><ellipse cx="15.15" cy="15.3" rx="2.25" ry="1.75" transform="rotate(-18 15.15 15.3)"/></g></svg>`

const GTM_HEAD = `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-M8F9XH4D');</script>`

function layout({ title, description, canonicalPath, image, ogType = "website", structuredData = [], body, noindex }) {
  const url = `${SITE_URL}${canonicalPath}`
  const ogImage = image || `${SITE_URL}/images/og-image.png`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`}
<meta property="og:site_name" content="WaxRiffle">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="${image ? "summary" : "summary_large_image"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<meta name="theme-color" content="#8281FE">
<link rel="icon" type="image/png" href="/my-favicon/favicon-96x96.png" sizes="96x96">
<link rel="icon" type="image/svg+xml" href="/my-favicon/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/my-favicon/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jockey+One&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/pages.css">
${structuredData.map(jsonLd).join("\n")}
${GTM_HEAD}
</head>
<body class="seo-page">
<header><a href="/"><img src="/images/WaxRiffle-logo-white.svg" alt="WaxRiffle home" id="logo"></a></header>
<main class="page-main">
${body}
</main>
${siteFooter()}
</body>
</html>`
}

function siteFooter() {
  return `<footer class="site-footer">
<p>Want to collaborate or have questions? <a href="mailto:waxriffle@gmail.com">waxriffle@gmail.com</a></p>
</footer>`
}

function breadcrumbs(items) {
  const html = items
    .map((item, i) =>
      i === items.length - 1 ? `<span aria-current="page">${esc(item.name)}</span>` : `<a href="${item.path}">${esc(item.name)}</a>`,
    )
    .join('<span class="crumb-sep" aria-hidden="true">/</span>')
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  }
  return { html: `<nav class="crumbs" aria-label="Breadcrumb">${html}</nav>`, data }
}

function albumGrid(items, { showDate = false } = {}) {
  if (!items.length) return ""
  return `<ul class="album-grid">${items
    .map(
      (a) => `<li><a class="grid-card" href="/album/${esc(a.s)}">
<img src="${esc(a.i || NO_COVER)}" alt="${esc(a.t)} by ${esc(a.a)}" loading="lazy" width="300" height="300">
<span class="grid-title">${esc(a.t)}</span>
<span class="grid-artist">${esc(a.a)}</span>
${showDate && a.d ? `<span class="grid-meta">${esc(formatDate(a.d))}</span>` : a.y ? `<span class="grid-meta">${esc(a.y)}</span>` : ""}
</a></li>`,
    )
    .join("")}</ul>`
}

function spotifyEmbed(album) {
  const m = String(album.spotifyLink || "").match(/open\.spotify\.com\/(album|track|playlist)\/([A-Za-z0-9]+)/)
  if (!m) return ""
  return `<div class="spotify-embed"><iframe title="${esc(album.title)} on Spotify" src="https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0" width="100%" height="352" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe></div>`
}

function listenLinks(album) {
  const q = encodeURIComponent(`${album.artist} ${album.title}`)
  const spotify = album.spotifyLink || `https://open.spotify.com/search/${q}`
  const apple = album.links?.appleMusic || `https://music.apple.com/us/search?term=${q}`
  return `<div class="listen-on"><p class="listen-on-label">Listen on</p><div class="listen-links">
<a href="${esc(spotify)}" target="_blank" rel="noopener" class="listen-btn" aria-label="Listen to ${esc(album.title)} on Spotify">${SPOTIFY_ICON}<span class="listen-name">Spotify</span></a>
<a href="${esc(apple)}" target="_blank" rel="noopener" class="listen-btn" aria-label="Listen to ${esc(album.title)} on Apple Music">${APPLE_ICON}<span class="listen-name">Apple Music</span></a>
</div></div>`
}

// Neighbours in the genre list. New albums are added at the front, so for most albums
// these never change from night to night.
function relatedAlbums(album, genre) {
  if (!genre) return []
  const list = getGenreList(genre)
  const i = list.findIndex((a) => a.s === album.slug)
  if (i === -1) return list.slice(0, RELATED_COUNT)
  const older = list.slice(i + 1, i + 1 + RELATED_COUNT)
  return older.length === RELATED_COUNT ? older : [...older, ...list.slice(Math.max(0, i - (RELATED_COUNT - older.length)), i)]
}

function renderAlbum(slug) {
  const album = getAlbum(slug)
  if (!album) return null
  const genre = primaryGenre(album)
  const g = genre ? GENRES[genre] : null
  const show = radioShow(album)
  const store = storeName(album.store)
  const year = album.year ? String(album.year) : ""
  const genreText = album.genre || (g ? g.label : "")

  const sourceLine = show
    ? `Heard on ${esc(show.title)}${album.broadcastDate ? `, ${esc(formatDate(album.broadcastDate))}` : ""}`
    : store
      ? `Found at <a href="${esc(storeUrl(album.store))}" target="_blank" rel="noopener">${esc(store)}</a>`
      : "Hand-picked by WaxRiffle"

  // Original descriptive text built from the album's own data
  const about = []
  about.push(
    `<em>${esc(album.title)}</em> is ${year ? `a ${esc(year)} ` : "an "}${genreText ? `${esc(genreText.toLowerCase().replace(/folk, world, & country/, "folk and world"))} ` : ""}record by ${esc(album.artist)}${album.labels ? `, released on ${esc(album.labels)}` : ""}.`,
  )
  if (show) {
    about.push(
      `A track from it was played on ${esc(show.title)}${album.broadcastDate ? ` on ${esc(formatDate(album.broadcastDate))}` : ""}, and WaxRiffle added the full album to its crate.`,
    )
  } else if (store) {
    about.push(
      `WaxRiffle found it in the crate of ${esc(store)}, a record seller on Discogs${album.inPool && album.price ? `, where a copy was listed at ${esc(album.price)}` : ""}.`,
    )
  }
  if (album.stylesRaw?.length && !show) about.push(`Styles: ${album.stylesRaw.map(esc).join(", ")}.`)
  about.push("Listen to the full album on Spotify or Apple Music, or let WaxRiffle pick another record for you at random.")

  const buyLink =
    album.inPool && album.listingUrl
      ? `<a class="buy-link" href="${esc(album.listingUrl)}" target="_blank" rel="noopener">Buy the record${album.price ? ` · ${esc(album.price)}` : ""}</a>`
      : album.discogsUrl
        ? `<a class="buy-link" href="${esc(album.discogsUrl)}" target="_blank" rel="noopener">View on Discogs</a>`
        : ""

  const crumbs = breadcrumbs([
    { name: "Home", path: "/" },
    { name: album.title, path: `/album/${album.slug}` },
  ])

  const related = relatedAlbums(album, genre)
  const sameAs = [album.spotifyLink, album.links?.appleMusic, album.discogsUrl].filter(
    (u) => u && !u.includes("/search"),
  )
  const albumData = {
    "@context": "https://schema.org",
    "@type": "MusicAlbum",
    name: album.title,
    url: `${SITE_URL}/album/${album.slug}`,
    byArtist: { "@type": "MusicGroup", name: album.artist },
    ...(album.image ? { image: album.image } : {}),
    ...(year ? { datePublished: year } : {}),
    ...(album.genresRaw?.length ? { genre: album.genresRaw } : genreText ? { genre: genreText } : {}),
    ...(album.labels ? { recordLabel: { "@type": "Organization", name: album.labels.split(",")[0].trim() } } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  }

  const title = `${album.title} by ${album.artist}${year ? ` (${year})` : ""} | WaxRiffle`
  const description = truncate(
    `Listen to ${album.title} by ${album.artist}${year ? `, a ${year}` : ", a"} ${genreText ? genreText.split(",")[0].toLowerCase() + " " : ""}record ${
      show ? `heard on ${show.title}` : store ? `found at ${store}` : "picked by WaxRiffle"
    }. Stream it on Spotify or Apple Music.`,
    160,
  )

  const body = `${crumbs.html}
<article class="result-card album-card">
<img class="result-cover" src="${esc(album.image || NO_COVER)}" alt="${esc(album.title)} by ${esc(album.artist)}, album cover" width="600" height="600">
<h1 class="result-title">${esc(album.title)}</h1>
<p class="result-artist">${esc(album.artist)}</p>
<p class="result-meta">${[year, album.genre, album.labels].filter(Boolean).map(esc).join(" · ")}</p>
<p class="result-source">${sourceLine}</p>
${spotifyEmbed(album)}
${listenLinks(album)}
${buyLink}
</article>
<section class="page-section about-album">
<h2>About this record</h2>
<p>${about.join(" ")}</p>
</section>
<div class="page-cta">
<a class="cta-primary" href="/">Find a random album</a>
</div>
${
  related.length
    ? `<section class="page-section"><h2>More ${esc(g.name)} finds</h2>${albumGrid(related)}</section>`
    : ""
}`

  return layout({
    title,
    description,
    canonicalPath: `/album/${album.slug}`,
    image: album.image,
    ogType: "music.album",
    structuredData: [albumData, crumbs.data],
    body,
  })
}

function renderGenre(genre, page = 1) {
  const g = GENRES[genre]
  if (!g) return null
  const list = getGenreList(genre)
  const pageCount = Math.max(1, Math.ceil(list.length / GENRE_PAGE_SIZE))
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return null
  const items = list.slice((page - 1) * GENRE_PAGE_SIZE, page * GENRE_PAGE_SIZE)
  const pagePath = (p) => (p === 1 ? `/genre/${genre}` : `/genre/${genre}/page/${p}`)

  const crumbs = breadcrumbs([
    { name: "Home", path: "/" },
    { name: g.label, path: `/genre/${genre}` },
  ])
  const pager =
    pageCount > 1
      ? `<nav class="pager" aria-label="Pages">${page > 1 ? `<a href="${pagePath(page - 1)}" rel="prev">← Newer</a>` : "<span></span>"}<span>Page ${page} of ${pageCount}</span>${page < pageCount ? `<a href="${pagePath(page + 1)}" rel="next">Older →</a>` : "<span></span>"}</nav>`
      : ""

  const heading = `${g.label} records`
  const title = `${heading}: random ${g.name} albums from real record stores${page > 1 ? ` (page ${page})` : ""} | WaxRiffle`
  const body = `${crumbs.html}
<section class="page-intro">
<h1>${esc(heading)}</h1>
<p>${esc(g.intro)} ${list.length} records so far, with more added every day.</p>
<div class="page-cta"><a class="cta-primary" href="/">Find a random album</a></div>
</section>
${albumGrid(items)}
${pager}`

  return layout({
    title,
    description: truncate(`${g.intro} Listen on Spotify and Apple Music.`, 160),
    canonicalPath: pagePath(page),
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: heading,
        url: `${SITE_URL}${pagePath(page)}`,
        description: g.intro,
      },
      crumbs.data,
    ],
    body,
  })
}

function renderNotFound() {
  return layout({
    title: "Page not found | WaxRiffle",
    description: "This page doesn't exist.",
    canonicalPath: "/",
    noindex: true,
    body: `<section class="page-intro"><h1>This record isn't in the crate</h1><p>The page you're looking for doesn't exist.</p><div class="page-cta"><a class="cta-primary" href="/">Find a random album</a></div></section>`,
  })
}

// route: { type: "album" | "genre", slug, genre, page }
function renderRoute(route) {
  let html = null
  if (route.type === "album" && route.slug) html = renderAlbum(String(route.slug))
  else if (route.type === "genre") html = renderGenre(String(route.genre || ""), Number(route.page || 1))
  return html ? { status: 200, html } : { status: 404, html: renderNotFound() }
}

module.exports = { renderRoute }
