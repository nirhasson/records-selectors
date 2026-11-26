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
const MAGAZINE_DIR = path.join(__dirname, "../data/magazine")

// Editor's Picks issues, newest first (data/magazine/picks/*.json)
function getPicks() {
  if (!cache.has("picks")) {
    let issues = []
    try {
      const dir = path.join(MAGAZINE_DIR, "picks")
      issues = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch {}
    cache.set("picks", issues)
  }
  return cache.get("picks")
}
// album slug → the issues that featured it
function getArticles() {
  if (!cache.has("articles")) {
    let articles = []
    try {
      const dir = path.join(MAGAZINE_DIR, "articles")
      articles = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch {}
    cache.set("articles", articles)
  }
  return cache.get("articles")
}
// Guest lists from artists, DJs and producers (data/magazine/artists/*.json)
function getArtists() {
  if (!cache.has("artists")) {
    let artists = []
    try {
      const dir = path.join(MAGAZINE_DIR, "artists")
      artists = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch {}
    cache.set("artists", artists)
  }
  // Hidden pages (examples to show artists) open by direct link only: no menu, index, sitemap or search
  return cache.get("artists").filter((a) => !a.hidden)
}
const findArtist = (slug) => (getArtists(), cache.get("artists").find((a) => a.slug === slug))
const artistPath = (artist) => `/artists/${artist.slug}`
function artistsFeaturing(albumSlug) {
  return getArtists().filter((a) => a.albums.some((p) => p.slug === albumSlug))
}

const articlePath = (article) => `/magazine/${article.slug}`
function articlesFeaturing(albumSlug) {
  return getArticles().filter((a) => a.albums.some((p) => p.slug === albumSlug))
}

function issuesFeaturing(albumSlug) {
  return getPicks().filter((issue) => issue.albums.some((a) => a.slug === albumSlug))
}
const picksPath = (issue) => `/picks/${issue.slug}`
const picksName = (issue) => `Editor's Picks #${issue.issue}`

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
// Discogs tells same-name labels apart with "(2)" and repeats a label once per release; readers need neither
const cleanLabels = (labels) => [...new Set(String(labels || "").replace(/ \(\d+\)/g, "").split(/,\s*/).filter(Boolean))].join(", ")

const BANDCAMP_ICON = `<svg class="listen-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1DA0C3"/><path d="M4.2 16.2 9.1 7.8h10.7l-4.9 8.4Z" fill="#fff"/></svg>`
const APPLE_ICON = `<svg class="listen-icon" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="apple-music-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FB5C74"/><stop offset="1" stop-color="#FA233B"/></linearGradient></defs><rect width="24" height="24" rx="5.5" fill="url(#apple-music-gradient)"/><g fill="#fff" transform="translate(0.8 0)"><path d="M9.2 7.7 17.6 5.6v9.6h-1.35V8.75L10.55 10.2v6.6H9.2Z"/><ellipse cx="8.1" cy="16.9" rx="2.25" ry="1.75" transform="rotate(-18 8.1 16.9)"/><ellipse cx="15.15" cy="15.3" rx="2.25" ry="1.75" transform="rotate(-18 15.15 15.3)"/></g></svg>`

const GTM_HEAD = `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-M8F9XH4D');</script>`

function layout({ title, description, canonicalPath, image, ogType = "website", structuredData = [], body, noindex, section = "" }) {
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
<meta name="theme-color" content="#232326">
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
<header class="site-header">
<a href="/" class="logo-link"><img src="/images/WaxRiffle-logo-white.svg" alt="WaxRiffle home" id="logo"></a>
<nav class="site-nav" aria-label="Main">
<a class="nav-discover" href="/"${section === "discover" ? ' aria-current="page"' : ""}>Discover</a>
<a href="/picks"${section === "picks" ? ' aria-current="page"' : ""}>Editor's Picks</a>
${getArtists().length ? `<a href="/artists"${section === "artists" ? ' aria-current="page"' : ""}><span class="nav-full">Artist Picks</span><span class="nav-short">Artists</span></a>` : ""}
<a href="/magazine"${section === "magazine" ? ' aria-current="page"' : ""}>Magazine</a>
</nav>
</header>
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
  const bandcamp = album.links?.bandcamp
  // A Bandcamp-only album: skip the search fallbacks, which would lead nowhere
  const searchOnly = bandcamp && !album.spotifyLink
  return `<div class="listen-on"><p class="listen-on-label">Listen on</p><div class="listen-links">
${bandcamp ? `<a href="${esc(bandcamp)}" target="_blank" rel="noopener" class="listen-btn" aria-label="Listen to ${esc(album.title)} on Bandcamp">${BANDCAMP_ICON}<span class="listen-name">Bandcamp</span></a>` : ""}
${searchOnly ? "" : `<a href="${esc(spotify)}" target="_blank" rel="noopener" class="listen-btn" aria-label="Listen to ${esc(album.title)} on Spotify">${SPOTIFY_ICON}<span class="listen-name">Spotify</span></a>`}
${searchOnly && !album.links?.appleMusic ? "" : `<a href="${esc(apple)}" target="_blank" rel="noopener" class="listen-btn" aria-label="Listen to ${esc(album.title)} on Apple Music">${APPLE_ICON}<span class="listen-name">Apple Music</span></a>`}
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

  const pick = album.editorsPick && !show
  const pickedBy = !show && album.pickedBy ? getArtists().find((a) => a.slug === album.pickedBySlug) : null
  const sourceLine = pickedBy
    ? `Picked by <a href="${artistPath(pickedBy)}">${esc(pickedBy.name)}</a>`
    : show
    ? `Heard on ${esc(show.title)}${album.broadcastDate ? `, ${esc(formatDate(album.broadcastDate))}` : ""}`
    : pick
      ? "Editor's Pick"
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
  } else if (pickedBy) {
    about.push(`It was picked by ${esc(pickedBy.name)} for WaxRiffle's Artist Picks.`)
  } else if (pick) {
    about.push(`It was chosen as an Editor's Pick${album.pickedDate ? ` in ${esc(formatDate(album.pickedDate).replace(/^\d+ /, ""))}` : ""}.`)
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
      show ? `heard on ${show.title}` : pick ? "chosen as an Editor's Pick" : store ? `found at ${store}` : "picked by WaxRiffle"
    }. Stream it on Spotify or Apple Music.`,
    160,
  )

  const body = `${crumbs.html}
<article class="result-card album-card">
<img class="result-cover" src="${esc(album.image || NO_COVER)}" alt="${esc(album.title)} by ${esc(album.artist)}, album cover" width="600" height="600">
<h1 class="result-title">${esc(album.title)}</h1>
<p class="result-artist">${esc(album.artist)}</p>
<p class="result-meta">${[year, album.genre, cleanLabels(album.labels)].filter(Boolean).map(esc).join(" · ")}</p>
<p class="result-source">${sourceLine}</p>
${spotifyEmbed(album)}
${listenLinks(album)}
${buyLink}
</article>
<section class="page-section about-album">
<h2>About this record</h2>
<p>${about.join(" ")}</p>
${issuesFeaturing(album.slug)
  .map((issue) => `<p class="featured-in">Featured in <a href="${picksPath(issue)}#${esc(album.slug)}">${esc(picksName(issue))}: ${esc(issue.title)}</a></p>`)
  .join("")}
${artistsFeaturing(album.slug)
  .map((a) => `<p class="featured-in">Picked by <a href="${artistPath(a)}#${esc(album.slug)}">${esc(a.name)}</a></p>`)
  .join("")}
${articlesFeaturing(album.slug)
  .map((a) => `<p class="featured-in">Featured in <a href="${articlePath(a)}#${esc(album.slug)}">${esc(a.title)}</a></p>`)
  .join("")}
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


// ===== Magazine =====

const youtubeEmbed = (id, title) =>
  `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0" title="${esc(title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`

function pickEmbed(pick, album) {
  // No player id in the issue file: fall back to the album's own Spotify link
  if (!pick.spotify && !pick.bandcamp) {
    const id = String(album?.spotifyLink || "").match(/album\/([A-Za-z0-9]+)/)?.[1]
    if (id) pick = { ...pick, spotify: id }
  }
  if (pick.spotify)
    return `<div class="pick-embed"><iframe title="${esc(album?.title || "Album")} on Spotify" src="https://open.spotify.com/embed/album/${esc(pick.spotify)}?utm_source=generator&theme=0" height="152" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>`
  if (pick.bandcamp)
    return `<div class="pick-embed"><iframe title="${esc(album?.title || "Album")} on Bandcamp" src="https://bandcamp.com/EmbeddedPlayer/album=${esc(pick.bandcamp)}/size=large/bgcol=232326/linkcol=8281fe/tracklist=false/artwork=none/transparent=true/" height="120" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>`
  return ""
}

// Four covers from an issue, for cards and the page header
function issueCovers(issue, count = 4) {
  return issue.albums
    .map((p) => getAlbum(p.slug)?.image)
    .filter(Boolean)
    .slice(0, count)
}

function issueCard(issue) {
  const [cover] = issueCovers(issue, 1)
  return `<li><a class="issue-card" href="${picksPath(issue)}">
${cover ? `<img class="issue-cover" src="${esc(cover)}" alt="" loading="lazy" width="300" height="300">` : ""}
<span class="issue-number">${esc(picksName(issue))} · ${esc(formatDate(issue.date))}</span>
<span class="issue-title">${esc(issue.title)}</span>
</a></li>`
}

// The newest issue, shown large at the top of the index
function issueFeature(issue) {
  const [lead, ...rest] = issueCovers(issue, 5)
  return `<a class="issue-feature" href="${picksPath(issue)}">
${lead ? `<img class="issue-feature-cover" src="${esc(lead)}" alt="" width="400" height="400">` : ""}
<span class="issue-feature-text">
<span class="issue-number">${esc(picksName(issue))} · ${esc(formatDate(issue.date))}</span>
<span class="issue-feature-title">${esc(issue.title)}</span>
${issue.description ? `<span class="issue-feature-desc">${esc(issue.description)}</span>` : ""}
${rest.length ? `<span class="issue-strip" aria-hidden="true">${rest.map((c) => `<img src="${esc(c)}" alt="" loading="lazy" width="72" height="72">`).join("")}</span>` : ""}
</span>
</a>`
}

// One album inside an issue or an article: cover, titles, text, player. n numbers the albums in a list article.
// coverless: skip the small cover when the Spotify player below already shows it
function pickSection(pick, n, { coverless = false } = {}) {
  const album = getAlbum(pick.slug)
  if (!album) return ""
  const meta = [album.year, cleanLabels(album.labels) || pick.label].filter(Boolean).map(esc).join(" · ")
  const embed = pickEmbed(pick, album)
  const showCover = !(coverless && embed.includes("open.spotify.com"))
  return `<section class="pick${showCover ? "" : " is-coverless"}" id="${esc(pick.slug)}">
<div class="pick-head">
${showCover ? `<a class="pick-cover" href="/album/${esc(album.slug)}"><img src="${esc(album.image || NO_COVER)}" alt="${esc(album.title)} by ${esc(album.artist)}, album cover" width="160" height="160" loading="lazy"></a>` : ""}
<div class="pick-titles">
${n ? `<p class="pick-num">${n}</p>` : ""}
<h3><a href="/album/${esc(album.slug)}">${esc(album.title)}</a></h3>
<p class="pick-artist">${esc(album.artist)}</p>
${meta ? `<p class="pick-meta">${meta}</p>` : ""}
</div>
</div>
<div class="prose">${pick.text.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
${embed}
</section>`
}

// Guides and lists (data/magazine/articles/*.json). Until the first one is out, a holding page Google skips.
function renderMagazine() {
  const articles = getArticles()
  const crumbs = breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Magazine", path: "/magazine" },
  ])
  const intro = "Guides and deep dives for curious listeners: where to start with a sound, a label or an artist, told through the records that matter."
  const list = articles.length
    ? `<ul class="issue-list article-list">${articles
        .map((a) => {
          const [cover] = issueCovers(a, 1)
          return `<li><a class="issue-card" href="${articlePath(a)}">
${cover ? `<img class="issue-cover" src="${esc(cover)}" alt="" loading="lazy" width="300" height="300">` : ""}
<span class="issue-number">${esc(formatDate(a.date))}</span>
<span class="issue-title">${esc(a.title)}</span>
<span class="article-dek">${esc(a.description)}</span>
</a></li>`
        })
        .join("")}</ul>`
    : `<p class="coming-soon">The first stories are on their way.</p>
<div class="page-cta"><a class="cta-primary" href="/picks">Read the Editor's Picks</a></div>`
  const body = `${crumbs.html}
<section class="page-intro">
<h1>Magazine</h1>
<p>${intro}</p>
</section>
${list}`
  return layout({
    title: "Magazine: guides to music worth discovering | WaxRiffle",
    description: "Guides and deep dives for curious listeners: where to start with a sound, a label or an artist.",
    canonicalPath: "/magazine",
    section: "magazine",
    noindex: !articles.length,
    structuredData: [crumbs.data],
    body,
  })
}

function renderArtistsIndex() {
  const artists = getArtists()
  const crumbs = breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Artist Picks", path: "/artists" },
  ])
  const intro = "Musicians, DJs and producers share the albums everyone should hear, in their own words."
  const list = artists.length
    ? `<ul class="issue-list">${artists
        .map((a) => {
          const cover = a.photo || issueCovers(a, 1)[0]
          return `<li><a class="issue-card" href="${artistPath(a)}">
${cover ? `<img class="issue-cover${a.photo ? " is-photo" : ""}" src="${esc(cover)}" alt="" loading="lazy" width="300" height="300">` : ""}
<span class="issue-title">${esc(a.name)}</span>
${a.role ? `<span class="issue-number">${esc(a.role)}</span>` : ""}
</a></li>`
        })
        .join("")}</ul>`
    : `<p class="coming-soon">The first lists are on their way.</p>`
  const body = `${crumbs.html}
<section class="page-intro">
<h1>Artist Picks</h1>
<p>${intro}</p>
</section>
${list}`
  return layout({
    title: "Artist Picks: albums chosen by musicians, DJs and producers | WaxRiffle",
    description: "Musicians, DJs and producers share the albums everyone should hear, in their own words. Listen to every pick.",
    canonicalPath: "/artists",
    section: "artists",
    noindex: !artists.length,
    structuredData: [crumbs.data],
    body,
  })
}

function renderArtist(slug) {
  const artist = findArtist(slug)
  if (!artist) return null
  const crumbs = breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Artist Picks", path: "/artists" },
    { name: artist.name, path: artistPath(artist) },
  ])
  const albums = artist.albums.map((p) => getAlbum(p.slug)).filter(Boolean)
  const covers = albums.map((a) => a.image).filter(Boolean)
  const heading = `${artist.name}'s picks`
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${heading}: ${albums.length} albums everyone should hear`,
    datePublished: artist.date,
    author: { "@type": "Person", name: artist.name, ...(artist.link ? { url: artist.link } : {}) },
    publisher: { "@type": "Organization", name: "WaxRiffle", url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}${artistPath(artist)}`,
    ...(covers.length ? { image: artist.photo ? [artist.photo, ...covers] : covers } : {}),
    about: albums.map((a) => ({ "@type": "MusicAlbum", name: a.title, byArtist: { "@type": "MusicGroup", name: a.artist }, url: `${SITE_URL}/album/${a.slug}` })),
  }
  const links = [
    ...(artist.links || []).map((l) => `<a class="artist-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`),
    artist.link ? `<a class="artist-link" href="${esc(artist.link)}" target="_blank" rel="noopener">Listen to ${esc(artist.name)}</a>` : "",
    artist.instagram ? `<a class="artist-link" href="https://www.instagram.com/${esc(artist.instagram)}/" target="_blank" rel="noopener">Instagram</a>` : "",
  ].join("")
  const body = `${crumbs.html}
<article class="mag-article">
<div class="mag-head artist-head">
<h1>${esc(heading)}</h1>
${artist.role ? `<p class="mag-meta">${esc(artist.role)}</p>` : ""}
${artist.photo ? `<img class="artist-photo" src="${esc(artist.photo)}" alt="${esc(artist.name)}" width="640" height="640">` : ""}
${links ? `<div class="artist-links">${links}</div>` : ""}
${artist.bio?.length ? `<div class="prose mag-lede">${artist.bio.map((t) => `<p>${esc(t)}</p>`).join("")}</div>` : ""}
</div>
<section class="mag-section mag-list">
${artist.albums.map((pick) => pickSection(pick, 0, { coverless: true })).join("")}
</section>
<div class="page-cta"><a class="cta-primary" href="/">Find a random album</a><a class="cta-secondary" href="/artists">More Artist Picks</a></div>
</article>`
  return layout({
    title: `${heading}: ${albums.length} albums everyone should hear | WaxRiffle`,
    description: truncate(`${artist.name}${artist.role ? `, ${artist.role},` : ""} picks ${albums.length} albums everyone should hear: ${albums.slice(0, 4).map((a) => `${a.title} by ${a.artist}`).join(", ")} and more.`, 160),
    canonicalPath: artistPath(artist),
    image: artist.photo || covers[0],
    ogType: "article",
    section: "artists",
    noindex: Boolean(artist.hidden),
    structuredData: [data, crumbs.data],
    body,
  })
}

function renderArticle(slug) {
  const article = getArticles().find((a) => a.slug === slug)
  if (!article) return null
  const url = `${SITE_URL}${articlePath(article)}`
  const crumbs = breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Magazine", path: "/magazine" },
    { name: article.title, path: articlePath(article) },
  ])
  const albums = article.albums.map((p) => getAlbum(p.slug)).filter(Boolean)
  const covers = albums.map((a) => a.image).filter(Boolean)
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    author: { "@type": "Person", name: article.author },
    publisher: { "@type": "Organization", name: "WaxRiffle", url: SITE_URL },
    mainEntityOfPage: url,
    ...(covers.length ? { image: covers } : {}),
    about: albums.map((a) => ({ "@type": "MusicAlbum", name: a.title, byArtist: { "@type": "MusicGroup", name: a.artist }, url: `${SITE_URL}/album/${a.slug}` })),
  }
  const related = (article.related || [])
    .map(
      (r) => `<li><a href="${esc(r.path)}">${esc(r.title)}</a>${r.text ? `<span>${esc(r.text)}</span>` : ""}</li>`,
    )
    .join("")
  const body = `${crumbs.html}
<article class="mag-article">
<div class="mag-head">
<h1>${esc(article.title)}</h1>
<p class="mag-meta">${esc(formatDate(article.date))} · By ${esc(article.author)}</p>
<div class="prose mag-lede">${article.intro.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
</div>
<section class="mag-section mag-list">
${article.albums.map((pick, i) => pickSection(pick, i + 1)).join("")}
</section>
${related ? `<section class="mag-section"><h2>Keep digging</h2><ul class="related-list">${related}</ul></section>` : ""}
<div class="page-cta"><a class="cta-primary" href="/">Find a random album</a></div>
</article>`
  return layout({
    title: `${article.title} | WaxRiffle Magazine`,
    description: truncate(article.description, 160),
    canonicalPath: articlePath(article),
    image: covers[0],
    ogType: "article",
    section: "magazine",
    structuredData: [data, crumbs.data],
    body,
  })
}

function renderPicksIndex() {
  const issues = getPicks()
  const crumbs = breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Editor's Picks", path: "/picks" },
  ])
  const body = `${crumbs.html}
<section class="page-intro">
<h1>Editor's Picks</h1>
<p>Every week, the new albums the editor couldn't stop playing, with the stories behind them and a player for each one.</p>
</section>
${issues.length ? issueFeature(issues[0]) : ""}
<ul class="issue-list">${issues.slice(1).map(issueCard).join("")}</ul>`
  return layout({
    title: "Editor's Picks: the best new albums, every week | WaxRiffle",
    description: "Every week, the new albums the editor couldn't stop playing, with the stories behind them. Listen on Spotify and Bandcamp.",
    canonicalPath: "/picks",
    section: "picks",
    structuredData: [crumbs.data],
    body,
  })
}

function renderPicksIssue(slug) {
  const issues = getPicks()
  const index = issues.findIndex((i) => i.slug === slug)
  if (index === -1) return null
  const issue = issues[index]
  const newer = issues[index - 1]
  const older = issues[index + 1]
  const url = `${SITE_URL}${picksPath(issue)}`

  const crumbs = breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Editor's Picks", path: "/picks" },
    { name: `#${issue.issue}`, path: picksPath(issue) },
  ])

  const albumsHtml = issue.albums.map((pick) => pickSection(pick)).join("")

  const moreHtml = (issue.more || [])
    .map(
      (item) => `<section class="more-item">
<h3>${item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)}</h3>
<div class="prose">${item.text.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
${item.youtube ? youtubeEmbed(item.youtube, item.title) : ""}
${item.youtubeExtra ? youtubeEmbed(item.youtubeExtra, item.title) : ""}
${item.spotifyPlaylist ? `<div class="pick-embed"><iframe title="${esc(item.title)} on Spotify" src="https://open.spotify.com/embed/playlist/${esc(item.spotifyPlaylist)}?utm_source=generator&theme=0" height="352" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>` : ""}
${item.link ? `<p class="more-link"><a href="${esc(item.link)}" target="_blank" rel="noopener">Open ${esc(new URL(item.link).hostname.replace(/^www\./, ""))} ↗</a></p>` : ""}
</section>`,
    )
    .join("")

  const covers = issueCovers(issue, 5)
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${picksName(issue)}: ${issue.title}`,
    description: issue.description,
    datePublished: issue.date,
    author: { "@type": "Person", name: issue.author },
    publisher: { "@type": "Organization", name: "WaxRiffle", url: SITE_URL },
    mainEntityOfPage: url,
    ...(covers.length ? { image: covers } : {}),
    about: issue.albums
      .map((p) => getAlbum(p.slug))
      .filter(Boolean)
      .map((a) => ({ "@type": "MusicAlbum", name: a.title, byArtist: { "@type": "MusicGroup", name: a.artist }, url: `${SITE_URL}/album/${a.slug}` })),
  }

  const body = `${crumbs.html}
<article class="mag-article">
<div class="mag-head">
<h1>${esc(issue.title)}</h1>
<p class="mag-meta">${esc(picksName(issue))} · ${esc(formatDate(issue.date))} · By ${esc(issue.author)}</p>
<div class="prose mag-lede">${issue.intro.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
</div>
<section class="mag-section">
<h2>This week's records</h2>
${albumsHtml}
</section>
${moreHtml ? `<section class="mag-section"><h2>More music this week</h2>${moreHtml}</section>` : ""}
<nav class="issue-nav" aria-label="More issues">
${older ? `<a class="issue-nav-older" href="${picksPath(older)}"><span>Previous issue</span>${esc(picksName(older))}</a>` : "<span></span>"}
${newer ? `<a class="issue-nav-newer" href="${picksPath(newer)}"><span>Next issue</span>${esc(picksName(newer))}</a>` : "<span></span>"}
</nav>
<div class="page-cta"><a class="cta-primary" href="/">Find a random album</a></div>
</article>`

  return layout({
    title: `${picksName(issue)}: ${issue.title} | WaxRiffle`,
    description: truncate(issue.description, 160),
    canonicalPath: picksPath(issue),
    image: covers[0],
    ogType: "article",
    section: "picks",
    structuredData: [article, crumbs.data],
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
  else if (route.type === "artists") html = route.slug ? renderArtist(String(route.slug)) : renderArtistsIndex()
  else if (route.type === "magazine") html = route.slug ? renderArticle(String(route.slug)) : renderMagazine()
  else if (route.type === "picks") html = route.slug ? renderPicksIssue(String(route.slug)) : renderPicksIndex()
  return html ? { status: 200, html } : { status: 404, html: renderNotFound() }
}

module.exports = { renderRoute }
