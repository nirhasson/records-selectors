// Use CommonJS imports
const axios = require("axios")
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
  "LoFi-Concept": "https://api.discogs.com/users/LoFi-Concept/inventory",
}

// Cache to store recently shown albums (prevent repeats)
const recentAlbumsCache = new Set()
const MAX_CACHE_SIZE = 100 // Maximum number of album IDs to remember

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

// Instead of reading from a file, use a hardcoded array for custom albums
const customAlbums = [
  {
    title: "Kind of Blue",
    artist: "Miles Davis",
    year: "1959",
    genre: "Jazz",
    image: "https://i.scdn.co/image/ab67616d0000b273e8e28219724c2423afa4d320",
    spotifyLink: "https://open.spotify.com/album/1weenld61qoidwYuZ1GESA",
  },
]

function getCustomAlbums() {
  return customAlbums
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

  // Return the best match if it has a reasonable score
  return scoredResults[0].score > 40 ? scoredResults[0].album : null
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

  // Return the best match if it has a reasonable score
  return scoredResults[0].score > 40 ? scoredResults[0].track : null
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

// Check if album was recently shown
function wasRecentlyShown(albumId) {
  return recentAlbumsCache.has(albumId)
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

// Get a random album from a store with pagination and duplicate prevention
async function fetchRandomAlbumFromStore(storeName, options = {}) {
  try {
    // Choose a random page if the store has multiple pages
    let page = 1
    const perPage = 100

    // If we know the total pages for this store, pick a random page
    if (storeMetadata[storeName].totalPages > 1) {
      page = Math.floor(Math.random() * storeMetadata[storeName].totalPages) + 1
    }

    // Fetch the chosen page
    const listings = await fetchStoreInventoryPage(storeName, page, perPage)

    if (!listings || listings.length === 0) {
      console.log(`No listings found in ${storeName} store on page ${page}`)
      return null
    }

    // Filter out recently shown albums
    let availableListings = listings.filter((item) => !wasRecentlyShown(item.release.id))

    // אם יש ז'אנרים נבחרים, נסנן את הרשימה
    const selectedGenres = options.selectedGenres || []
    if (selectedGenres.length > 0) {
      console.log(`Filtering by genres: ${selectedGenres.join(', ')} in ${storeName}`)

      // נצטרך לבדוק את הז'אנר של כל אלבום
      const filteredListings = []

      for (const listing of availableListings) {
        try {
          // קבל מידע מפורט על האלבום
          const releaseDetails = await axios.get(`${listing.release.resource_url}?token=${TOKEN}`)
          const albumGenres = releaseDetails.data.genres || []
          const albumStyles = releaseDetails.data.styles || []

          // בדוק אם יש התאמה לאחד הז'אנרים שנבחרו
          const hasMatchingGenre = selectedGenres.some(selectedGenre =>
            albumGenres.some(genre => genre.toLowerCase().includes(selectedGenre.toLowerCase())) ||
            albumStyles.some(style => style.toLowerCase().includes(selectedGenre.toLowerCase()))
          )

          if (hasMatchingGenre) {
            filteredListings.push(listing)
          }
        } catch (error) {
          console.error(`Error fetching details for release ${listing.release.id}:`, error.message)
        }
      }

      availableListings = filteredListings
      console.log(`Found ${availableListings.length} albums matching selected genres in ${storeName}`)
    }

    if (availableListings.length === 0) {
      console.log(`No albums matching criteria found on page ${page} of ${storeName}. Trying another page...`)

      // Try another random page
      if (storeMetadata[storeName].totalPages > 1) {
        let newPage
        do {
          newPage = Math.floor(Math.random() * storeMetadata[storeName].totalPages) + 1
        } while (newPage === page)

        return fetchRandomAlbumFromStore(storeName, options)
      }

      // If there's only one page and no matching albums, return null
      console.log(`No matching albums found in ${storeName}`)
      return null
    }

    // Choose a random album from available listings
    const randomIndex = Math.floor(Math.random() * availableListings.length)
    const item = availableListings[randomIndex].release

    // Add to recent cache
    addToRecentCache(item.id)

    console.log(`Selected album in ${storeName} store: ${item.title} (ID: ${item.id})`)
    const releaseDetails = await axios.get(`${item.resource_url}?token=${TOKEN}`)
    return processReleaseData(releaseDetails.data, storeName)
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

async function fetchRandomAlbum(options = {}) {
  try {
    await spotifyApi.clientCredentialsGrant().then((data) => {
      spotifyApi.setAccessToken(data.body["access_token"])
    })

    // בדוק אם יש ז'אנרים נבחרים
    const selectedGenres = options.selectedGenres || []
    if (selectedGenres.length > 0) {
      console.log(`Filtering by genres: ${selectedGenres.join(', ')}`)
    }

    // Choose a random store with equal probability
    const randomStoreName = chooseRandomStore()
    console.log(`Attempting to fetch album from ${randomStoreName} store...`)

    // Try to get an album from the selected store
    const album = await fetchRandomAlbumFromStore(randomStoreName, { selectedGenres })

    // If no album found, try another store
    if (!album) {
      console.log(`No album found in ${randomStoreName}, trying another store...`)
      const otherStores = Object.keys(storeInventories).filter((store) => store !== randomStoreName)

      // Try up to 3 other stores
      for (let i = 0; i < Math.min(3, otherStores.length); i++) {
        const backupStore = otherStores[Math.floor(Math.random() * otherStores.length)]
        console.log(`Trying backup store: ${backupStore}`)
        const backupAlbum = await fetchRandomAlbumFromStore(backupStore, { selectedGenres })
        if (backupAlbum) {
          console.log(`Found album in backup store ${backupStore}`)
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
    // אם לא נמצא אלבום או שיר, נחפש את האמן
    try {
      const artistSearchResult = await spotifyApi.searchArtists(album.artist)
      if (
        artistSearchResult.body.artists &&
        artistSearchResult.body.artists.items &&
        artistSearchResult.body.artists.items.length > 0
      ) {
        // אם נמצא האמן, נשתמש בקישור אליו
        output.spotifyLink = artistSearchResult.body.artists.items[0].external_urls.spotify
        output.spotifyType = "artist"
        output.spotifyArtist = artistSearchResult.body.artists.items[0].name
        output.matchSource = "artist-only"
        console.log(`🎵 Found artist on Spotify: ${artistSearchResult.body.artists.items[0].name}`)
      } else {
        // אם לא נמצא גם האמן, נשתמש בקישור לחיפוש
        const searchQuery = encodeURIComponent(`${album.artist} ${album.title}`)
        output.spotifyLink = `https://open.spotify.com/search/${searchQuery}`
        output.spotifyType = "search"
        output.matchSource = "search-fallback"
        console.log(`🔍 Created search link: ${output.spotifyLink}`)
      }
    } catch (err) {
      // במקרה של שגיאה, נשתמש בקישור לחיפוש
      const searchQuery = encodeURIComponent(`${album.artist} ${album.title}`)
      output.spotifyLink = `https://open.spotify.com/search/${searchQuery}`
      output.spotifyType = "search"
      output.matchSource = "search-fallback"
      console.log(`🔍 Created search link: ${output.spotifyLink}`)
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
