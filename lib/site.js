// Shared settings and helpers for the public SEO pages (album, genre and radio pages).

// Change this once a custom domain is connected (or set SITE_URL in Vercel).
const SITE_URL = (process.env.SITE_URL || "https://wax-riffle.vercel.app").replace(/\/$/, "")

// Same keys and labels as the genre pills on the homepage.
// intro: short original text shown at the top of each genre page.
const GENRES = {
  "hip-hop": {
    label: "Hip-Hop / Rap",
    name: "hip-hop",
    intro:
      "Hip-hop and rap records pulled at random from the crates of record stores selling on Discogs: boom bap, jazz rap, G-funk, underground twelve-inches and the albums behind them.",
  },
  "funk-soul": {
    label: "Funk / Soul",
    name: "funk and soul",
    intro:
      "Funk, soul, disco and boogie records found in real record-store inventories: deep soul, modern soul, rare grooves and the dancefloor records diggers keep coming back to.",
  },
  jazz: {
    label: "Jazz",
    name: "jazz",
    intro:
      "Jazz records found in the crates of record stores around the world: spiritual jazz, hard bop, fusion, jazz-funk and modal records, each one linked to Spotify and Apple Music.",
  },
  electronic: {
    label: "Electronic",
    name: "electronic",
    intro:
      "Electronic records from real store inventories: house, techno, ambient, electro, downtempo and the experimental corners in between.",
  },
  rock: {
    label: "Rock",
    name: "rock",
    intro:
      "Rock records found in record-store crates: psych, krautrock, post-punk, prog and the records that rarely make it into a streaming playlist.",
  },
  blues: {
    label: "Blues",
    name: "blues",
    intro: "Blues records found in the crates of record stores selling on Discogs: Delta, Chicago, soul-blues and more.",
  },
  "reggae-dub": {
    label: "Reggae / Dub",
    name: "reggae and dub",
    intro:
      "Reggae and dub records from real record-store inventories: roots, dub, rocksteady, dancehall and lovers rock.",
  },
  world: {
    label: "World",
    name: "world music",
    intro:
      "Records from every corner of the map, found in record-store crates: African, Brazilian, Asian, Middle Eastern and folk music from around the world.",
  },
  folk: {
    label: "Folk",
    name: "folk",
    intro: "Folk records found in record-store crates: singer-songwriters, traditional music, psych-folk and acoustic albums.",
  },
  latin: {
    label: "Latin",
    name: "Latin",
    intro: "Latin records from real store inventories: salsa, cumbia, bossa nova, MPB, boogaloo and Latin jazz.",
  },
  classical: {
    label: "Classical",
    name: "classical",
    intro: "Classical and contemporary composition records found in record-store crates, from early music to minimalism.",
  },
}

// Discogs usernames → readable store names. Unknown stores fall back to the username.
const STORE_NAMES = {
  RushHour: "Rush Hour",
  superflyrecordsparis: "Superfly Records Paris",
  "LoFi-Concept": "LoFi Concept",
  CrocoDiscos: "Croco Discos",
  Peekaboo_records: "Peekaboo Records",
  Taboca_Discos: "Taboca Discos",
  RookRecords: "Rook Records",
}

function storeName(store) {
  if (!store) return ""
  return STORE_NAMES[store] || store.replace(/_/g, " ")
}

function storeUrl(store) {
  return `https://www.discogs.com/seller/${encodeURIComponent(store)}/profile`
}

// "Ezra Collective" + "Where I'm Meant To Be" → "ezra-collective-where-im-meant-to-be"
function slugify(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "")
}

// Same album = same artist + title, however it is spelled
function albumKey(artist, title) {
  const norm = (s) =>
    String(s || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\u0080-￿]+/g, "")
  return `${norm(artist)}|${norm(title)}`
}

// Album pages are split into small files by the first character of the slug,
// so a page request only loads one file.
function shardOf(slug) {
  const c = slug[0]
  return /[a-z0-9]/.test(c) ? c : "_"
}

// Radio show page slug and display title, matching the "Heard on ..." line in the app
function radioShow(album) {
  if (!album.show) return null
  const hostInShow = album.host && album.show.toLowerCase().includes(album.host.toLowerCase())
  const title = hostInShow || !album.host ? album.show : `${album.show} with ${album.host}`
  const slug = slugify(hostInShow || !album.host ? album.show : `${album.host} ${album.show}`)
  return { slug, title, show: album.show, host: album.host || "" }
}

module.exports = { SITE_URL, GENRES, storeName, storeUrl, slugify, albumKey, shardOf, radioShow }
