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

let previousAlbumId = null // Prevent duplicates

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

// Find best match from Spotify results
function findBestMatch(discogsAlbum, spotifyResults) {
  if (
    !spotifyResults ||
    !spotifyResults.body ||
    !spotifyResults.body.albums ||
    !spotifyResults.body.albums.items ||
    spotifyResults.body.albums.items.length === 0
  ) {
    return null
  }

  const items = spotifyResults.body.albums.items

  // Calculate scores for each result
  const scoredResults = items.map((album) => {
    // Title similarity (most important)
    const titleScore = similarityScore(discogsAlbum.title, album.name) * 0.6

    // Artist similarity
    let artistScore = 0
    if (album.artists && album.artists.length > 0) {
      const artistName = album.artists[0].name
      artistScore = similarityScore(discogsAlbum.artist, artistName) * 0.4
    }

    // Year similarity (bonus if available)
    let yearScore = 0
    if (discogsAlbum.year && album.release_date) {
      const albumYear = album.release_date.substring(0, 4)
      if (discogsAlbum.year === albumYear) {
        yearScore = 10
      }
    }

    const totalScore = titleScore + artistScore + yearScore

    return {
      album,
      score: totalScore,
      details: {
        titleScore,
        artistScore,
        yearScore,
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
      `   Title: ${result.details.titleScore.toFixed(2)}, Artist: ${result.details.artistScore.toFixed(2)}, Year: ${result.details.yearScore}`,
    )
  })

  // Return the best match if it has a reasonable score
  return scoredResults[0].score > 40 ? scoredResults[0].album : null
}

async function fetchRandomAlbumFromStore(storeName) {
  const inventoryURL = `${storeInventories[storeName]}?token=${TOKEN}&per_page=250`
  try {
    const response = await axios.get(inventoryURL)
    const items = response.data.listings.filter((item) => item.release.id !== previousAlbumId)

    if (items.length === 0) return null

    const randomIndex = Math.floor(Math.random() * items.length)
    const item = items[randomIndex].release
    previousAlbumId = item.id // Save ID to prevent duplicates

    console.log(`Found album in ${storeName} store: ${item.title}`)
    const releaseDetails = await axios.get(`${item.resource_url}?token=${TOKEN}`)
    const releaseData = releaseDetails.data

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
  } catch (error) {
    console.error(`Error fetching data from ${storeName}:`, error.message)
    return null
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

async function fetchRandomAlbum() {
  try {
    await spotifyApi.clientCredentialsGrant().then((data) => {
      spotifyApi.setAccessToken(data.body["access_token"])
    })

    const storeNames = Object.keys(storeInventories)
    const randomStoreName = storeNames[Math.floor(Math.random() * storeNames.length)]
    const album = await fetchRandomAlbumFromStore(randomStoreName)

    if (album) {
      // Try multiple search strategies
      let spotifyAlbum = null
      let searchResults = null

      // Strategy 1: Search with exact artist and title
      const searchQuery1 = `${album.artist} ${album.title}`.trim()
      console.log(`Search strategy 1: "${searchQuery1}"`)
      searchResults = await spotifyApi.searchAlbums(searchQuery1, { limit: 10 })
      spotifyAlbum = findBestMatch(album, searchResults)

      // Strategy 2: If no good match, try with cleaned search terms
      if (!spotifyAlbum) {
        const cleanedArtist = cleanSearchTerm(album.artist)
        const cleanedTitle = cleanSearchTerm(album.title)
        const searchQuery2 = `${cleanedArtist} ${cleanedTitle}`.trim()

        if (searchQuery2 !== searchQuery1) {
          console.log(`Search strategy 2: "${searchQuery2}"`)
          searchResults = await spotifyApi.searchAlbums(searchQuery2, { limit: 10 })
          spotifyAlbum = findBestMatch(album, searchResults)
        }
      }

      // Strategy 3: If still no good match, try with just the album title
      if (!spotifyAlbum) {
        const searchQuery3 = `${album.title}`.trim()
        console.log(`Search strategy 3: "${searchQuery3}"`)
        searchResults = await spotifyApi.searchAlbums(searchQuery3, { limit: 10 })
        spotifyAlbum = findBestMatch(album, searchResults)
      }

      // Strategy 4: If we have a label, try searching with label and title
      if (!spotifyAlbum && album.labels) {
        const mainLabel = album.labels.split(",")[0].trim()
        const searchQuery4 = `${mainLabel} ${album.title}`.trim()
        console.log(`Search strategy 4: "${searchQuery4}"`)
        searchResults = await spotifyApi.searchAlbums(searchQuery4, { limit: 10 })
        spotifyAlbum = findBestMatch(album, searchResults)
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
        output.spotifyLink = spotifyAlbum.external_urls.spotify
        output.spotifyName = spotifyAlbum.name
        output.spotifyArtist = spotifyAlbum.artists[0].name

        console.log(`✅ Found match on Spotify: "${spotifyAlbum.name}" by ${spotifyAlbum.artists[0].name}`)
      } else {
        // אם לא נמצא אלבום, נחפש את האמן
        try {
          const artistSearchResult = await spotifyApi.searchArtists(album.artist)
          if (
            artistSearchResult.body.artists &&
            artistSearchResult.body.artists.items &&
            artistSearchResult.body.artists.items.length > 0
          ) {
            // אם נמצא האמן, נשתמש בקישור אליו
            output.spotifyLink = artistSearchResult.body.artists.items[0].external_urls.spotify
            console.log(`🎵 Found artist on Spotify: ${artistSearchResult.body.artists.items[0].name}`)
          } else {
            // אם לא נמצא גם האמן, נשתמש בקישור לחיפוש
            const searchQuery = encodeURIComponent(`${album.artist} ${album.title}`)
            output.spotifyLink = `https://open.spotify.com/search/${searchQuery}`
            console.log(`🔍 Created search link: ${output.spotifyLink}`)
          }
        } catch (err) {
          // במקרה של שגיאה, נשתמש בקישור לחיפוש
          const searchQuery = encodeURIComponent(`${album.artist} ${album.title}`)
          output.spotifyLink = `https://open.spotify.com/search/${searchQuery}`
          console.log(`🔍 Created search link: ${output.spotifyLink}`)
        }

        console.log("❌ No good album match found on Spotify")
      }

      console.log("Final output:", output)
      return output
    } else {
      console.log("No album found in the selected store.")
      return null
    }
  } catch (error) {
    console.error("Error:", error.message)
    return null
  }
}

// Export using CommonJS
module.exports = {
  fetchRandomAlbum,
  fetchCustomAlbum,
}
