// Use CommonJS imports
const axios = require("axios")
const fs = require("fs")
const path = require("path")
const SpotifyWebApi = require("spotify-web-api-node")

// Use environment variables for sensitive data
const TOKEN = process.env.DISCOGS_TOKEN || "vXJXtxmtPTPMbptayjsnIaNWIsnaaBcqsbJdZext"

// Initialize Spotify API connection
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID || "aed4b36b93454410ab42ba33c4f3ae6c",
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "5ffaf812e47e4498a06888f67c46197b",
})

// Store inventories with pagination support
const storeInventories = {
  RookRecords: "https://api.discogs.com/users/RookRecords/inventory",
  CrocoDiscos: "https://api.discogs.com/users/CrocoDiscos/inventory",
  Peekaboo_records: "https://api.discogs.com/users/Peekaboo_records/inventory",
  superflyrecordsparis: "https://api.discogs.com/users/superflyrecordsparis/inventory",
  eskotrackl: "https://api.discogs.com/users/eskotrackl/inventory",
  Taboca_Discos: "https://api.discogs.com/users/Taboca_Discos/inventory",
  RushHour: "https://api.discogs.com/users/RushHour/inventory",
  LoFiConcept: "https://api.discogs.com/users/LoFi-Concept/inventory",
  srt: "https://api.discogs.com/users/S-R-T/inventory",
}

// Mapping from UI genre filters → Discogs genres/styles
// genres: Discogs top-level genre (broad); styles: Discogs style tags (specific)
// An album matches if its genres OR its styles contain any of the listed values.
const GENRE_MAP = {
  "hip-hop":    { genres: ["Hip Hop"],            styles: ["Hip Hop", "Rap", "Trap", "Gangsta", "Conscious", "Boom Bap", "G-Funk", "East Coast", "West Coast", "Hardcore Hip-Hop"] },
  "funk-soul":  { genres: ["Funk / Soul", "Pop"], styles: ["Funk", "Soul", "Gospel", "Neo Soul", "Rhythm & Blues", "Contemporary R&B", "Disco", "Nu-Disco", "Italo-Disco", "Boogie", "P.Funk"] },
  "jazz":       { genres: ["Jazz"],               styles: ["Fusion", "Swing", "Bebop", "Free Jazz", "Hard Bop", "Cool Jazz", "Modal", "Post Bop", "Latin Jazz", "Jazz-Funk", "Soul-Jazz"] },
  "electronic": { genres: ["Electronic"],         styles: ["Ambient", "Techno", "House", "Synth-pop", "Downtempo", "Trip Hop", "IDM", "Drum n Bass", "Jungle", "Breakbeat", "Electro"] },
  "rock":       { genres: ["Rock"],               styles: ["Heavy Metal", "Death Metal", "Black Metal", "Thrash", "Doom Metal", "Speed Metal", "Punk", "Alternative Rock", "Indie Rock", "Psychedelic Rock", "Classic Rock", "Hard Rock", "Prog Rock"] },
  "blues":      { genres: ["Blues"],              styles: ["Blues Rock", "Country Blues", "Soul Blues", "Chicago Blues", "Delta Blues", "Electric Blues", "Acoustic Blues", "Jump Blues"] },
  "reggae-dub": { genres: ["Reggae"],             styles: ["Reggae", "Dub", "Ska", "Dancehall", "Roots Reggae", "Rocksteady", "Dub Techno", "Lovers Rock", "Ragga"] },
  "world":      { genres: ["Folk, World, & Country", "Latin"], styles: ["World", "African", "Afrobeat", "Brazilian", "Celtic", "Flamenco", "Middle Eastern", "Asian", "Cumbia", "Caribbean"] },
  "folk":       { genres: ["Folk, World, & Country"], styles: ["Folk", "Country", "Bluegrass", "Acoustic", "Singer/Songwriter", "Indie Folk", "Folk Rock", "Contemporary Folk"] },
  "latin":      { genres: ["Latin"],              styles: ["Salsa", "Cumbia", "Bossa Nova", "Latin Jazz", "Tango", "Samba", "Mambo", "Cha-Cha", "Merengue", "Reggaeton", "Latin Pop"] },
  "classical":  { genres: ["Classical", "Stage & Screen"], styles: ["Baroque", "Romantic", "Contemporary", "Chamber Music", "Orchestral", "Opera", "Symphony", "Soundtrack"] },
}

function albumMatchesGenres(album, selectedGenres) {
  if (!selectedGenres || selectedGenres.length === 0) return true

  const albumGenres = (album.genresRaw || []).map((g) => g.toLowerCase())
  const albumStyles = (album.stylesRaw || []).map((s) => s.toLowerCase())

  return selectedGenres.some((filter) => {
    const mapping = GENRE_MAP[filter]
    if (!mapping) return false

    const genreMatch = mapping.genres.some((g) => albumGenres.includes(g.toLowerCase()))
    const styleMatch = mapping.styles.some((s) => albumStyles.includes(s.toLowerCase()))
    return genreMatch || styleMatch
  })
}

// Cache to store recently shown albums (prevent repeats)
const recentAlbumsCache = new Set()
const MAX_CACHE_SIZE = 100

// Store metadata to track pagination
const storeMetadata = {}
Object.keys(storeInventories).forEach((store) => {
  storeMetadata[store] = {
    totalPages: null,
    currentPage: 1,
    totalItems: 0,
    lastFetched: null,
    itemsCache: [], // Cache items to avoid refetching
  }
})

function getCustomAlbums() {
  try {
    const filePath = path.join(__dirname, "custom_albums.json")
    const data = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Error reading custom_albums.json:", error.message)
    return []
  }
}

// Clean search terms for better matching
function cleanSearchTerm(term) {
  if (!term) return ""

  // Remove text in parentheses which often causes issues
  let cleaned = term.replace(/$$[^)]*$$/g, "")

  // Remove special editions, versions, etc.
  cleaned = cleaned.replace(
    /(deluxe|special|limited|edition|reissue|remaster(ed)?|version|vol\.?|volume|pt\.?|part)/gi,
    "",
  )

  // Remove special characters that might interfere with search
  cleaned = cleaned.replace(/[&+_\-:;'"!@#$%^*=~`]/g, " ")

  // Remove extra spaces and trim
  cleaned = cleaned.replace(/\s+/g, " ").trim()

  return cleaned
}

// Calculate similarity score between two strings (0-100)
function similarityScore(str1, str2) {
  if (!str1 || !str2) return 0

  const s1 = cleanSearchTerm(str1.toLowerCase())
  const s2 = cleanSearchTerm(str2.toLowerCase())

  // Exact match
  if (s1 === s2) return 100

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 80
  }

  // Calculate word match percentage
  const words1 = s1.split(" ")
  const words2 = s2.split(" ")

  let matchCount = 0
  for (const word1 of words1) {
    if (word1.length < 3) continue // Skip short words
    for (const word2 of words2) {
      if (word2.length < 3) continue
      if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
        matchCount++
        break
      }
    }
  }

  const matchPercentage = (matchCount / Math.max(words1.length, words2.length)) * 100
  return matchPercentage
}

// Check if an artist name is a partial match (e.g., "Marisa" matches "Marisa Monte")
function isPartialArtistMatch(shortName, fullName) {
  if (!shortName || !fullName) return false

  const short = shortName.toLowerCase().trim()
  const full = fullName.toLowerCase().trim()

  // Exact match
  if (short === full) return true

  // Check if short name is a prefix of full name
  if (full.startsWith(short + " ")) return true

  // Check if short name is a complete word in full name
  const fullWords = full.split(" ")
  return fullWords.includes(short)
}

// Calculate year similarity (0-100)
function yearSimilarity(year1, year2) {
  if (!year1 || !year2) return 0

  // Try to parse years as numbers
  const y1 = Number.parseInt(year1)
  const y2 = Number.parseInt(year2)

  if (isNaN(y1) || isNaN(y2)) return 0

  // Exact match
  if (y1 === y2) return 100

  // Calculate difference
  const diff = Math.abs(y1 - y2)

  // Within 1 year
  if (diff <= 1) return 90

  // Within 2 years
  if (diff <= 2) return 80

  // Within 5 years
  if (diff <= 5) return 60

  // Within 10 years
  if (diff <= 10) return 40

  // More than 10 years
  return 0
}

// Calculate genre similarity (0-100)
function genreSimilarity(genre1, genre2) {
  if (!genre1 || !genre2) return 0

  const g1 = genre1.toLowerCase()
  const g2 = genre2.toLowerCase()

  // Split genres into arrays
  const genres1 = g1.split(/[,&/]/).map((g) => g.trim())
  const genres2 = g2.split(/[,&/]/).map((g) => g.trim())

  // Count matching genres
  let matchCount = 0
  for (const genre of genres1) {
    if (genre.length < 3) continue // Skip short genres
    for (const otherGenre of genres2) {
      if (otherGenre.length < 3) continue
      if (genre === otherGenre || genre.includes(otherGenre) || otherGenre.includes(genre)) {
        matchCount++
        break
      }
    }
  }

  // Calculate percentage
  const matchPercentage = (matchCount / Math.max(genres1.length, genres2.length)) * 100
  return matchPercentage
}

// Find best match from Spotify results with comprehensive scoring
function findBestMatch(discogsAlbum, spotifyResults, options = {}) {
  if (
    !spotifyResults ||
    !spotifyResults.body ||
    !spotifyResults.body.albums ||
    !spotifyResults.body.albums.items ||
    spotifyResults.body.albums.items.length === 0
  ) {
    return null
  }

  // Default weights
  const weights = {
    title: options.titleWeight || 0.4,
    artist: options.artistWeight || 0.3,
    year: options.yearWeight || 0.2,
    genre: options.genreWeight || 0.1,
    exactMatch: options.exactMatchBonus || 20,
    partialArtistPenalty: options.partialArtistPenalty || 10,
  }

  const items = spotifyResults.body.albums.items

  // Calculate scores for each result
  const scoredResults = items.map((album) => {
    // Title similarity
    const titleScore = similarityScore(discogsAlbum.title, album.name) * weights.title

    // Artist similarity
    let artistScore = 0
    let isPartialMatch = false
    if (album.artists && album.artists.length > 0) {
      const artistName = album.artists[0].name

      // Check for exact match first
      const exactMatchScore = similarityScore(discogsAlbum.artist, artistName)

      // Check for partial match (e.g., "Marisa" vs "Marisa Monte")
      isPartialMatch = isPartialArtistMatch(discogsAlbum.artist, artistName)

      // Use the higher score, but penalize partial matches slightly
      artistScore = exactMatchScore * weights.artist

      // Apply penalty for partial matches to prefer exact matches
      if (isPartialMatch && exactMatchScore < 90) {
        artistScore -= weights.partialArtistPenalty
      }
    }

    // Year similarity
    let yearScore = 0
    if (discogsAlbum.year && album.release_date) {
      const albumYear = album.release_date.substring(0, 4)
      yearScore = yearSimilarity(discogsAlbum.year, albumYear) * weights.year
    }

    // Genre similarity (if available)
    let genreScore = 0
    if (discogsAlbum.genre && album.genres && album.genres.length > 0) {
      const albumGenres = album.genres.join(", ")
      genreScore = genreSimilarity(discogsAlbum.genre, albumGenres) * weights.genre
    }

    // Exact match bonus (if both title and artist are exact matches)
    let exactMatchBonus = 0
    if (
      similarityScore(discogsAlbum.title, album.name) > 90 &&
      similarityScore(discogsAlbum.artist, album.artists[0].name) > 90
    ) {
      exactMatchBonus = weights.exactMatch
    }

    const totalScore = titleScore + artistScore + yearScore + genreScore + exactMatchBonus

    return {
      album,
      score: totalScore,
      details: {
        titleScore,
        artistScore,
        yearScore,
        genreScore,
        exactMatchBonus,
        isPartialMatch,
      },
    }
  })

  // Sort by score (highest first)
  scoredResults.sort((a, b) => b.score - a.score)

  // Log the top 3 results for debugging
  console.log("Top matches:")
  scoredResults.slice(0, 3).forEach((result, i) => {
    console.log(
      `${i + 1}. "${result.album.name}" by ${result.album.artists[0].name} (Score: ${result.score.toFixed(2)})`,
    )
    console.log(
      `   Title: ${result.details.titleScore.toFixed(2)}, Artist: ${result.details.artistScore.toFixed(2)}, Year: ${result.details.yearScore.toFixed(2)}, Genre: ${result.details.genreScore.toFixed(2)}, ExactBonus: ${result.details.exactMatchBonus}, PartialMatch: ${result.details.isPartialMatch}`,
    )
  })

  // Hard filter: reject any candidate whose artist is clearly wrong.
  // A perfect title match alone is not enough — the artist must have at least
  // 20% similarity to prevent e.g. "Enjoy Yourself / Billy Currington" being
  // returned when searching for "Enjoy Yourself / Allure".
  const MIN_ARTIST_SIMILARITY = 20
  const validResults = scoredResults.filter((result) => {
    if (!result.album.artists || result.album.artists.length === 0) return false
    return similarityScore(discogsAlbum.artist, result.album.artists[0].name) >= MIN_ARTIST_SIMILARITY
  })

  if (validResults.length === 0) {
    console.log("All candidates rejected — artist similarity too low")
    return null
  }

  return validResults[0].score > 40 ? validResults[0].album : null
}

// Find best match from Spotify track results
function findBestTrackMatch(discogsAlbum, spotifyResults, options = {}) {
  if (
    !spotifyResults ||
    !spotifyResults.body ||
    !spotifyResults.body.tracks ||
    !spotifyResults.body.tracks.items ||
    spotifyResults.body.tracks.items.length === 0
  ) {
    return null
  }

  // Default weights
  const weights = {
    title: options.titleWeight || 0.5,
    artist: options.artistWeight || 0.4,
    exactMatch: options.exactMatchBonus || 20,
    partialArtistPenalty: options.partialArtistPenalty || 10,
  }

  const items = spotifyResults.body.tracks.items

  // Calculate scores for each result
  const scoredResults = items.map((track) => {
    // Title similarity
    const titleScore = similarityScore(discogsAlbum.title, track.name) * weights.title

    // Artist similarity
    let artistScore = 0
    let isPartialMatch = false
    if (track.artists && track.artists.length > 0) {
      const artistName = track.artists[0].name

      // Check for exact match first
      const exactMatchScore = similarityScore(discogsAlbum.artist, artistName)

      // Check for partial match (e.g., "Marisa" vs "Marisa Monte")
      isPartialMatch = isPartialArtistMatch(discogsAlbum.artist, artistName)

      // Use the higher score, but penalize partial matches slightly
      artistScore = exactMatchScore * weights.artist

      // Apply penalty for partial matches to prefer exact matches
      if (isPartialMatch && exactMatchScore < 90) {
        artistScore -= weights.partialArtistPenalty
      }
    }

    // Exact match bonus (if both title and artist are exact matches)
    let exactMatchBonus = 0
    if (
      similarityScore(discogsAlbum.title, track.name) > 90 &&
      similarityScore(discogsAlbum.artist, track.artists[0].name) > 90
    ) {
      exactMatchBonus = weights.exactMatch
    }

    const totalScore = titleScore + artistScore + exactMatchBonus

    return {
      track,
      score: totalScore,
      details: {
        titleScore,
        artistScore,
        exactMatchBonus,
        isPartialMatch,
      },
    }
  })

  // Sort by score (highest first)
  scoredResults.sort((a, b) => b.score - a.score)

  // Log the top 3 results for debugging
  console.log("Top track matches:")
  scoredResults.slice(0, 3).forEach((result, i) => {
    console.log(
      `${i + 1}. "${result.track.name}" by ${result.track.artists[0].name} (Score: ${result.score.toFixed(2)})`,
    )
    console.log(
      `   Title: ${result.details.titleScore.toFixed(2)}, Artist: ${result.details.artistScore.toFixed(2)}, ExactBonus: ${result.details.exactMatchBonus}, PartialMatch: ${result.details.isPartialMatch}`,
    )
  })

  // Hard filter: same minimum artist similarity as findBestMatch
  const MIN_ARTIST_SIMILARITY = 20
  const validResults = scoredResults.filter((result) => {
    if (!result.track.artists || result.track.artists.length === 0) return false
    return similarityScore(discogsAlbum.artist, result.track.artists[0].name) >= MIN_ARTIST_SIMILARITY
  })

  if (validResults.length === 0) {
    console.log("All track candidates rejected — artist similarity too low")
    return null
  }

  return validResults[0].score > 40 ? validResults[0].track : null
}

// Find albums by a specific artist with exact name matching
async function findAlbumsByArtist(artistName, exactMatchOnly = false) {
  try {
    // First search for the artist
    const artistResults = await spotifyApi.searchArtists(artistName, { limit: 10 })

    if (
      !artistResults.body.artists ||
      !artistResults.body.artists.items ||
      artistResults.body.artists.items.length === 0
    ) {
      return null
    }

    // Find the best artist match
    const artists = artistResults.body.artists.items
    const scoredArtists = artists.map((artist) => {
      const exactScore = similarityScore(artistName, artist.name)
      const isPartial = isPartialArtistMatch(artistName, artist.name)

      // If we want exact matches only, penalize partial matches heavily
      const score = exactMatchOnly && isPartial && exactScore < 90 ? exactScore * 0.5 : exactScore

      return {
        artist,
        score,
        isExactMatch: exactScore > 90,
        isPartialMatch: isPartial,
      }
    })

    scoredArtists.sort((a, b) => b.score - a.score)

    // Log artist matches
    console.log("Artist matches:")
    scoredArtists.slice(0, 3).forEach((result, i) => {
      console.log(
        `${i + 1}. ${result.artist.name} (Score: ${result.score.toFixed(2)}, Exact: ${result.isExactMatch}, Partial: ${result.isPartialMatch})`,
      )
    })

    // If we have a good artist match
    if (scoredArtists[0].score > 60) {
      const artist = scoredArtists[0].artist
      console.log(`Found artist: ${artist.name} (Score: ${scoredArtists[0].score.toFixed(2)})`)

      // Get albums by this artist
      const albumsResult = await spotifyApi.getArtistAlbums(artist.id, { limit: 50, include_groups: "album,single" })

      if (albumsResult.body.items && albumsResult.body.items.length > 0) {
        console.log(`Found ${albumsResult.body.items.length} albums by ${artist.name}`)
        return {
          artist,
          albums: albumsResult.body.items,
          isExactMatch: scoredArtists[0].isExactMatch,
          isPartialMatch: scoredArtists[0].isPartialMatch,
        }
      }
    }

    return null
  } catch (error) {
    console.error("Error finding albums by artist:", error.message)
    return null
  }
}

// Try to find an exact artist match first, then fallback to partial matches
async function findExactArtistFirst(artistName, albumTitle, year) {
  try {
    console.log(`Searching for exact artist match: "${artistName}"`)

    // First try with exact artist name matching
    const exactArtistResult = await findAlbumsByArtist(artistName, true)

    if (exactArtistResult && exactArtistResult.isExactMatch) {
      console.log(`Found exact artist match: ${exactArtistResult.artist.name}`)

      // Try to find album with matching title
      if (albumTitle) {
        const artistAlbumMatches = exactArtistResult.albums.map((artistAlbum) => {
          const titleScore = similarityScore(albumTitle, artistAlbum.name)
          let yearScore = 0

          if (year && artistAlbum.release_date) {
            const albumYear = artistAlbum.release_date.substring(0, 4)
            yearScore = yearSimilarity(year, albumYear) * 0.2
          }

          return {
            album: artistAlbum,
            score: titleScore + yearScore,
            titleScore,
            yearScore,
          }
        })

        artistAlbumMatches.sort((a, b) => b.score - a.score)

        // Log the top matches
        console.log("Top exact artist album matches:")
        artistAlbumMatches.slice(0, 3).forEach((match, i) => {
          console.log(
            `${i + 1}. "${match.album.name}" (Score: ${match.score.toFixed(2)}, Title: ${match.titleScore.toFixed(2)}, Year: ${match.yearScore.toFixed(2)})`,
          )
        })

        // If we have a reasonable match, use it
        if (artistAlbumMatches.length > 0 && artistAlbumMatches[0].score > 40) {
          return {
            album: artistAlbumMatches[0].album,
            artist: exactArtistResult.artist,
            score: artistAlbumMatches[0].score,
            matchType: "exact-artist-album",
          }
        }

        // If no good album match but we have the exact artist, return the first album
        return {
          album: exactArtistResult.albums[0],
          artist: exactArtistResult.artist,
          score: 50, // Moderate score for having the right artist
          matchType: "exact-artist-first-album",
        }
      }
    }

    // If no exact artist match, try with partial matching
    console.log("No exact artist match, trying partial matching")
    const partialArtistResult = await findAlbumsByArtist(artistName, false)

    if (partialArtistResult) {
      console.log(`Found partial artist match: ${partialArtistResult.artist.name}`)

      // Try to find album with matching title
      if (albumTitle) {
        const artistAlbumMatches = partialArtistResult.albums.map((artistAlbum) => {
          const titleScore = similarityScore(albumTitle, artistAlbum.name)
          let yearScore = 0

          if (year && artistAlbum.release_date) {
            const albumYear = artistAlbum.release_date.substring(0, 4)
            yearScore = yearSimilarity(year, albumYear) * 0.2
          }

          return {
            album: artistAlbum,
            score: titleScore + yearScore,
            titleScore,
            yearScore,
          }
        })

        artistAlbumMatches.sort((a, b) => b.score - a.score)

        // Log the top matches
        console.log("Top partial artist album matches:")
        artistAlbumMatches.slice(0, 3).forEach((match, i) => {
          console.log(
            `${i + 1}. "${match.album.name}" (Score: ${match.score.toFixed(2)}, Title: ${match.titleScore.toFixed(2)}, Year: ${match.yearScore.toFixed(2)})`,
          )
        })

        // If we have a reasonable match, use it
        if (artistAlbumMatches.length > 0 && artistAlbumMatches[0].score > 40) {
          return {
            album: artistAlbumMatches[0].album,
            artist: partialArtistResult.artist,
            score: artistAlbumMatches[0].score * 0.8, // Slight penalty for partial artist match
            matchType: "partial-artist-album",
          }
        }

        // If no good album match but we have a partial artist match, return the first album
        return {
          album: partialArtistResult.albums[0],
          artist: partialArtistResult.artist,
          score: 40, // Lower score for partial artist match
          matchType: "partial-artist-first-album",
        }
      }
    }

    return null
  } catch (error) {
    console.error("Error in findExactArtistFirst:", error.message)
    return null
  }
}

// Add album ID to recent cache to prevent repeats
function addToRecentCache(albumId) {
  // If cache is full, remove oldest entry
  if (recentAlbumsCache.size >= MAX_CACHE_SIZE) {
    const firstItem = recentAlbumsCache.values().next().value
    recentAlbumsCache.delete(firstItem)
  }

  // Add new album ID
  recentAlbumsCache.add(albumId)
}

// Fetch a page of inventory from a store with pagination support
async function fetchStoreInventoryPage(storeName, page = 1, perPage = 100) {
  const timestamp = Date.now() // Add timestamp to prevent caching
  const inventoryURL = `${storeInventories[storeName]}?token=${TOKEN}&per_page=${perPage}&page=${page}&_=${timestamp}`

  try {
    console.log(`Fetching page ${page} from ${storeName} store...`)
    const response = await axios.get(inventoryURL)

    // Update store metadata
    if (!storeMetadata[storeName].totalPages) {
      const pagination = response.data.pagination
      storeMetadata[storeName].totalPages = pagination.pages
      storeMetadata[storeName].totalItems = pagination.items
      console.log(`Store ${storeName} has ${pagination.items} items across ${pagination.pages} pages`)
    }

    storeMetadata[storeName].currentPage = page
    storeMetadata[storeName].lastFetched = Date.now()

    return response.data.listings
  } catch (error) {
    console.error(`Error fetching page ${page} from ${storeName}:`, error.message)
    return []
  }
}

// Get a random album from a store with true pagination support
// Note: this runs serverless (Vercel), so storeMetadata is reset on every invocation.
// We always fetch page 1 first to discover totalPages, then jump to a random page.
async function fetchRandomAlbumFromStore(storeName, selectedGenres = []) {
  try {
    const perPage = 100

    // Step 1: fetch page 1 to learn totalPages (required every invocation in serverless)
    const page1Listings = await fetchStoreInventoryPage(storeName, 1, perPage)
    const totalPages = storeMetadata[storeName].totalPages || 1

    if (!page1Listings || page1Listings.length === 0) {
      console.log(`No listings found in ${storeName} store`)
      return null
    }

    // Step 2: pick a random page across ALL pages
    const randomPage = Math.floor(Math.random() * totalPages) + 1
    console.log(`Store ${storeName}: ${totalPages} total pages, selected page ${randomPage}`)

    // Step 3: use page 1 data if we already have it, otherwise fetch the random page
    let listings = page1Listings
    if (randomPage > 1) {
      const fetchedListings = await fetchStoreInventoryPage(storeName, randomPage, perPage)
      if (fetchedListings && fetchedListings.length > 0) {
        listings = fetchedListings
      } else {
        console.log(`Page ${randomPage} empty, falling back to page 1`)
      }
    }

    // Step 4: shuffle candidates and try up to maxCandidates items.
    // With genre filter active, try more candidates and up to 3 pages.
    const maxCandidates = selectedGenres.length > 0 ? 15 : 1
    const pagesToTry = selectedGenres.length > 0 ? [listings] : [listings]

    // For genre filtering, also try 2 additional random pages to improve hit rate
    if (selectedGenres.length > 0 && totalPages > 1) {
      for (let extra = 0; extra < 2; extra++) {
        const extraPage = Math.floor(Math.random() * totalPages) + 1
        const extraListings = await fetchStoreInventoryPage(storeName, extraPage, perPage)
        if (extraListings && extraListings.length > 0) pagesToTry.push(extraListings)
      }
    }

    for (const pageListings of pagesToTry) {
      const shuffled = [...pageListings].sort(() => Math.random() - 0.5)
      for (let i = 0; i < Math.min(maxCandidates, shuffled.length); i++) {
        const item = shuffled[i].release
        const releaseDetails = await axios.get(`${item.resource_url}?token=${TOKEN}`)
        const album = processReleaseData(releaseDetails.data, storeName)

        if (albumMatchesGenres(album, selectedGenres)) {
          addToRecentCache(item.id)
          console.log(`Selected album from ${storeName}: ${album.title}`)
          return album
        }

        console.log(`"${album.title}" (${album.genre}) — no match for [${selectedGenres.join(", ")}], trying next`)
      }
    }

    console.log(`No genre match found in ${storeName} for [${selectedGenres.join(", ")}]`)
    return null
  } catch (error) {
    console.error(`Error fetching data from ${storeName}:`, error.message)
    return null
  }
}

// Process release data from Discogs API
function processReleaseData(releaseData, storeName) {
  // Extract more detailed information from Discogs
  const artistName =
    releaseData.artists_sort ||
    (releaseData.artists && releaseData.artists.length > 0 ? releaseData.artists[0].name : "Unknown Artist")

  // Get the main artist name without numbers in parentheses
  const cleanArtistName = artistName.replace(/\s*$$\d+$$\s*$/, "")

  return {
    title: releaseData.title || "N/A",
    artist: cleanArtistName,
    artistRaw: artistName, // Keep the original for reference
    year: releaseData.year || "N/A",
    genre: releaseData.genres
      ? releaseData.genres.join(", ")
      : releaseData.styles
        ? releaseData.styles.join(", ")
        : "Unknown Genre",
    image:
      releaseData.images && releaseData.images.length > 0
        ? releaseData.images[0].resource_url
        : "https://via.placeholder.com/300",
    store: storeName,
    discogsId: releaseData.id,
    discogsUrl: releaseData.uri,
    labels: releaseData.labels ? releaseData.labels.map((l) => l.name).join(", ") : "",
    formats: releaseData.formats ? releaseData.formats.map((f) => f.name).join(", ") : "",
    genresRaw: releaseData.genres || [],
    stylesRaw: releaseData.styles || [],
  }
}

async function fetchCustomAlbum() {
  try {
    await spotifyApi.clientCredentialsGrant().then((data) => {
      spotifyApi.setAccessToken(data.body["access_token"])
    })

    const customAlbums = getCustomAlbums()

    if (customAlbums.length === 0) return null

    const randomIndex = Math.floor(Math.random() * customAlbums.length)
    const album = customAlbums[randomIndex]

    const output = {
      title: album.title,
      artist: album.artist,
      year: album.year,
      genre: album.genre,
      image: album.image,
      spotifyLink: album.spotifyLink,
    }

    console.log("This is Custom album output:", output)
    return output
  } catch (error) {
    console.log("fetchCustomAlbum finished with an error: ", error)
    return null
  }
}

// Choose a random store with completely random selection (equal probability)
function chooseRandomStore() {
  const storeNames = Object.keys(storeInventories)
  const randomIndex = Math.floor(Math.random() * storeNames.length)
  const selectedStore = storeNames[randomIndex]
  console.log(`Selected store ${selectedStore} randomly (equal probability)`)
  return selectedStore
}

async function fetchRandomAlbum(selectedGenres = []) {
  try {
    await spotifyApi.clientCredentialsGrant().then((data) => {
      spotifyApi.setAccessToken(data.body["access_token"])
    })

    const randomStoreName = chooseRandomStore()
    console.log(`Attempting to fetch album from ${randomStoreName} store... genres=[${selectedGenres.join(", ")}]`)

    const album = await fetchRandomAlbumFromStore(randomStoreName, selectedGenres)

    if (!album) {
      console.log(`No album found in ${randomStoreName}, trying all other stores...`)
      const otherStores = Object.keys(storeInventories)
        .filter((store) => store !== randomStoreName)
        .sort(() => Math.random() - 0.5) // shuffle so we don't always try the same order

      for (const backupStore of otherStores) {
        console.log(`Trying backup store: ${backupStore}`)
        const backupAlbum = await fetchRandomAlbumFromStore(backupStore, selectedGenres)
        if (backupAlbum) {
          return processSpotifyMatch(backupAlbum)
        }
      }

      console.log("Could not find album in any store")
      return null
    }

    return processSpotifyMatch(album)
  } catch (error) {
    console.error("Error:", error.message)
    return null
  }
}

// Process album and find Spotify match
async function processSpotifyMatch(album) {
  if (!album) return null

  console.log(`Processing album: "${album.title}" by ${album.artist} (${album.year})`)

  // Strategy 0: Try to find exact artist match first (new strategy)
  console.log("Strategy 0: Trying exact artist match first")
  const exactArtistResult = await findExactArtistFirst(album.artist, album.title, album.year)

  if (exactArtistResult && exactArtistResult.matchType.startsWith("exact-artist")) {
    console.log(`✅ Found exact artist match: ${exactArtistResult.artist.name}`)
    console.log(`Album: "${exactArtistResult.album.name}" (Match type: ${exactArtistResult.matchType})`)

    // Create output
    const output = {
      title: album.title,
      artist: album.artist,
      year: album.year,
      genre: album.genre,
      image: album.image,
      store: album.store,
      discogsUrl: album.discogsUrl,
      spotifyLink: exactArtistResult.album.external_urls.spotify,
      spotifyName: exactArtistResult.album.name,
      spotifyArtist: exactArtistResult.artist.name,
      spotifyType: "album",
      matchSource: exactArtistResult.matchType,
      matchScore: exactArtistResult.score,
    }

    console.log("Final output:", output)
    return output
  }

  // Try multiple search strategies
  let spotifyAlbum = null
  let spotifyTrack = null
  let artistAlbums = null
  let searchResults = null

  // Strategy 1: Search with exact artist and title
  const searchQuery1 = `${album.artist} ${album.title}`.trim()
  console.log(`Search strategy 1: "${searchQuery1}"`)
  searchResults = await spotifyApi.searchAlbums(searchQuery1, { limit: 10 })
  spotifyAlbum = findBestMatch(album, searchResults, {
    titleWeight: 0.4,
    artistWeight: 0.3,
    yearWeight: 0.2,
    genreWeight: 0.1,
  })

  // Strategy 2: If no good match, try with cleaned search terms
  if (!spotifyAlbum) {
    const cleanedArtist = cleanSearchTerm(album.artist)
    const cleanedTitle = cleanSearchTerm(album.title)
    const searchQuery2 = `${cleanedArtist} ${cleanedTitle}`.trim()

    if (searchQuery2 !== searchQuery1) {
      console.log(`Search strategy 2: "${searchQuery2}"`)
      searchResults = await spotifyApi.searchAlbums(searchQuery2, { limit: 10 })
      spotifyAlbum = findBestMatch(album, searchResults, {
        titleWeight: 0.4,
        artistWeight: 0.3,
        yearWeight: 0.2,
        genreWeight: 0.1,
      })
    }
  }

  // Strategy 3: If still no good match, try with just the album title
  if (!spotifyAlbum) {
    const searchQuery3 = `${album.title}`.trim()
    console.log(`Search strategy 3: "${searchQuery3}"`)
    searchResults = await spotifyApi.searchAlbums(searchQuery3, { limit: 10 })
    spotifyAlbum = findBestMatch(album, searchResults, {
      titleWeight: 0.6,
      artistWeight: 0.3,
      yearWeight: 0.1,
    })
  }

  // Strategy 4: If we have a label, try searching with label and title
  if (!spotifyAlbum && album.labels) {
    const mainLabel = album.labels.split(",")[0].trim()
    const searchQuery4 = `${mainLabel} ${album.title}`.trim()
    console.log(`Search strategy 4: "${searchQuery4}"`)
    searchResults = await spotifyApi.searchAlbums(searchQuery4, { limit: 10 })
    spotifyAlbum = findBestMatch(album, searchResults, {
      titleWeight: 0.5,
      artistWeight: 0.2,
      yearWeight: 0.2,
      genreWeight: 0.1,
    })
  }

  // Strategy 5: If no album found, try searching for tracks instead
  if (!spotifyAlbum) {
    console.log("No album match found, trying track search...")
    const trackSearchQuery = `${album.artist} ${album.title}`.trim()
    const trackResults = await spotifyApi.searchTracks(trackSearchQuery, { limit: 10 })
    spotifyTrack = findBestTrackMatch(album, trackResults, {
      titleWeight: 0.5,
      artistWeight: 0.5,
    })
  }

  // Strategy 6: If no track found, try finding the artist and their albums
  if (!spotifyAlbum && !spotifyTrack && !exactArtistResult) {
    console.log("No track match found, trying artist search...")
    artistAlbums = await findAlbumsByArtist(album.artist)

    // If we found albums by this artist, try to find the best match
    if (artistAlbums && artistAlbums.albums.length > 0) {
      const artistAlbumMatches = artistAlbums.albums.map((artistAlbum) => {
        const titleScore = similarityScore(album.title, artistAlbum.name)
        let yearScore = 0

        if (album.year && artistAlbum.release_date) {
          const albumYear = artistAlbum.release_date.substring(0, 4)
          yearScore = yearSimilarity(album.year, albumYear) * 0.2
        }

        return {
          album: artistAlbum,
          score: titleScore + yearScore,
          titleScore,
          yearScore,
        }
      })

      artistAlbumMatches.sort((a, b) => b.score - a.score)

      // Log the top matches
      console.log("Top artist album matches:")
      artistAlbumMatches.slice(0, 3).forEach((match, i) => {
        console.log(
          `${i + 1}. "${match.album.name}" (Score: ${match.score.toFixed(2)}, Title: ${match.titleScore.toFixed(2)}, Year: ${match.yearScore.toFixed(2)})`,
        )
      })

      // If we have a reasonable match, use it
      if (artistAlbumMatches[0].score > 30) {
        spotifyAlbum = artistAlbumMatches[0].album
        console.log(
          `Using best artist album match: "${spotifyAlbum.name}" (Score: ${artistAlbumMatches[0].score.toFixed(2)})`,
        )
      } else if (exactArtistResult) {
        // Use the exact artist result if available
        spotifyAlbum = exactArtistResult.album
        console.log(`Using exact artist album: "${spotifyAlbum.name}"`)
      } else {
        // Otherwise, just use the first album by this artist
        spotifyAlbum = artistAlbums.albums[0]
        console.log(`Using first album by artist: "${spotifyAlbum.name}"`)
      }
    }
  }

  // Create output with or without Spotify link
  const output = {
    title: album.title,
    artist: album.artist,
    year: album.year,
    genre: album.genre,
    image: album.image,
    store: album.store,
    discogsUrl: album.discogsUrl,
  }

  if (spotifyAlbum) {
    // אם נמצא אלבום
    output.spotifyLink = spotifyAlbum.external_urls.spotify
    output.spotifyName = spotifyAlbum.name
    output.spotifyArtist = spotifyAlbum.artists
      ? spotifyAlbum.artists[0].name
      : artistAlbums?.artist.name || album.artist
    output.spotifyType = "album"
    output.matchSource = exactArtistResult
      ? exactArtistResult.matchType
      : artistAlbums
        ? "artist-albums"
        : "album-search"

    console.log(`✅ Found album match on Spotify: "${spotifyAlbum.name}" by ${output.spotifyArtist}`)
  } else if (spotifyTrack) {
    // אם נמצא שיר
    output.spotifyLink = spotifyTrack.external_urls.spotify
    output.spotifyName = spotifyTrack.name
    output.spotifyArtist = spotifyTrack.artists[0].name
    output.spotifyType = "track"
    output.matchSource = "track-search"

    // אם יש אלבום לשיר, שמור גם את הקישור אליו
    if (spotifyTrack.album && spotifyTrack.album.external_urls) {
      output.spotifyAlbumLink = spotifyTrack.album.external_urls.spotify
      output.spotifyAlbumName = spotifyTrack.album.name
    }

    console.log(`✅ Found track match on Spotify: "${spotifyTrack.name}" by ${spotifyTrack.artists[0].name}`)
  } else {
    // No album or track found — try artist page only if the name is a strong match.
    // A threshold of 85% prevents completely unrelated artists (Shahaf Shvarzman,
    // Anna Zak, etc.) from appearing just because Spotify returns items[0].
    const searchQuery = encodeURIComponent(`${album.artist} ${album.title}`)
    let usedArtistPage = false

    try {
      const artistSearchResult = await spotifyApi.searchArtists(album.artist)
      if (
        artistSearchResult.body.artists &&
        artistSearchResult.body.artists.items &&
        artistSearchResult.body.artists.items.length > 0
      ) {
        const foundArtist = artistSearchResult.body.artists.items[0]
        const artistSim = similarityScore(album.artist, foundArtist.name)
        console.log(`Artist search: "${foundArtist.name}" similarity=${artistSim.toFixed(1)}%`)

        if (artistSim >= 85) {
          output.spotifyLink = foundArtist.external_urls.spotify
          output.spotifyType = "artist"
          output.spotifyArtist = foundArtist.name
          output.matchSource = "artist-only"
          usedArtistPage = true
          console.log(`🎵 Found matching artist on Spotify: ${foundArtist.name}`)
        } else {
          console.log(`❌ Artist similarity too low (${artistSim.toFixed(1)}%), skipping artist page`)
        }
      }
    } catch (err) {
      console.error("Artist search failed:", err.message)
    }

    if (!usedArtistPage) {
      output.spotifyLink = `https://open.spotify.com/search/${searchQuery}`
      output.spotifyType = "search"
      output.matchSource = "search-fallback"
      console.log(`🔍 No match found, created search link: ${output.spotifyLink}`)
    }

    console.log("❌ No good match found on Spotify")
  }

  console.log("Final output:", output)
  return output
}

// Export using CommonJS
module.exports = {
  fetchRandomAlbum,
  fetchCustomAlbum,
}
