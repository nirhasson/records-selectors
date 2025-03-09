// Use CommonJS imports
const axios = require("axios")
const SpotifyWebApi = require("spotify-web-api-node")

// Don't use fs in serverless functions
// const fs = require('fs');
// const path = require('path');

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
// You should move this to a database in production
const customAlbums = [
  // Add a few sample albums here
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
  // Return the hardcoded array instead of reading from file
  return customAlbums
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

    return {
      title: releaseData.title || "N/A",
      artist:
        releaseData.artists_sort ||
        (releaseData.artists && releaseData.artists.length > 0 ? releaseData.artists[0].name : "Unknown Artist"),
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
      searchQuery: `${releaseData.artists_sort || ""} ${releaseData.title || ""}`.trim(),
      store: storeName,
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
      const searchQuery = `${album.artist} ${album.title}`.trim()
      console.log(`Searching Spotify for: ${searchQuery}`)
      const searchResult = await spotifyApi.searchAlbums(searchQuery)

      if (searchResult.body.albums && searchResult.body.albums.items && searchResult.body.albums.items.length > 0) {
        const spotifyAlbum = searchResult.body.albums.items[0]

        const output = {
          title: album.title,
          artist: album.artist,
          year: album.year,
          genre: album.genre,
          image: album.image,
          spotifyLink: spotifyAlbum.external_urls.spotify,
          store: album.store,
        }
        console.log("This is Discogs output:", output)
        return output
      } else {
        console.log("Album not found on Spotify.")
        return album // Return the album without Spotify link
      }
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
