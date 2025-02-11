import axios from 'axios';
import SpotifyWebApi from 'spotify-web-api-node'
import fs from 'fs';
import path from 'path'

// const axios = require('axios');
// const SpotifyWebApi = require('spotify-web-api-node');
// const fs = require('fs');
// const path = require('path');

const TOKEN = 'vXJXtxmtPTPMbptayjsnIaNWIsnaaBcqsbJdZext';

// Initialize Spotify API connection
const spotifyApi = new SpotifyWebApi({
  clientId: 'aed4b36b93454410ab42ba33c4f3ae6c',
  clientSecret: '5ffaf812e47e4498a06888f67c46197b',
});

const storeInventories = {
  'RookRecords': 'https://api.discogs.com/users/RookRecords/inventory',
  'CrocoDiscos': 'https://api.discogs.com/users/CrocoDiscos/inventory',
  'Peekaboo_records': 'https://api.discogs.com/users/Peekaboo_records/inventory',
  'superflyrecordsparis': 'https://api.discogs.com/users/superflyrecordsparis/inventory',
  'eskotrackl': 'https://api.discogs.com/users/eskotrackl/inventory',
  'Taboca_Discos': 'https://api.discogs.com/users/Taboca_Discos/inventory',
  'RushHour': 'https://api.discogs.com/users/RushHour/inventory',
};

let previousAlbumId = null; // למניעת כפילויות

function getCustomAlbums() {
  const filePath = path.join(__dirname, 'custom_albums.json');
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
  }
  return [];
}

async function fetchRandomAlbumFromStore(storeName) {
  const inventoryURL = `${storeInventories[storeName]}?token=${TOKEN}&per_page=250`;
  try {
    const response = await axios.get(inventoryURL);
    const items = response.data.listings.filter(item => item.release.id !== previousAlbumId);

    if (items.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * items.length);
    const item = items[randomIndex].release;
    previousAlbumId = item.id; // שמירת ID למניעת כפילות

    console.log(`Found album in ${storeName} store: ${item.title}`);
    const releaseDetails = await axios.get(`${item.resource_url}?token=${TOKEN}`);
    const releaseData = releaseDetails.data;

    return {
      title: releaseData.title || 'N/A',
      artist: releaseData.artists_sort || (releaseData.artists && releaseData.artists.length > 0 ? releaseData.artists[0].name : 'Unknown Artist'),
      year: releaseData.year || 'N/A',
      genre: releaseData.genres ? releaseData.genres.join(', ') : (releaseData.styles ? releaseData.styles.join(', ') : 'Unknown Genre'),
      image: releaseData.images && releaseData.images.length > 0 ? releaseData.images[0].resource_url : 'https://via.placeholder.com/300',
      searchQuery: `${releaseData.artists_sort || ''} ${releaseData.title || ''}`.trim(),
    };
  } catch (error) {
    console.error(`Error fetching data from ${storeName}:`, error.message);
    return null;
  }
}

export async function fetchRandomAlbum() {
  try {
    await spotifyApi.clientCredentialsGrant().then(data => {
      spotifyApi.setAccessToken(data.body['access_token']);
    });

    // const customAlbums = getCustomAlbums();
    // const useCustomList = Math.random() < 0.02;

    let album;
    // if (useCustomList && customAlbums.length > 0) {
    //   const randomIndex = Math.floor(Math.random() * customAlbums.length);
    //   album = customAlbums[randomIndex];
    //   console.log("Using custom album:", album);
    // } else {
    const storeNames = Object.keys(storeInventories);
    const randomStoreName = storeNames[Math.floor(Math.random() * storeNames.length)];
    album = await fetchRandomAlbumFromStore(randomStoreName);
    // }

    if (album) {
      const searchQuery = `${album.artist} ${album.title}`.trim();
      console.log(`Searching Spotify for: ${searchQuery}`);
      const searchResult = await spotifyApi.searchAlbums(searchQuery);
      const spotifyAlbum = searchResult.body.albums.items[0];

      if (spotifyAlbum) {
        let output = {
          title: album.title,
          artist: album.artist,
          year: album.year,
          genre: album.genre,
          image: album.image,
          spotifyLink: spotifyAlbum.external_urls.spotify
        };
        console.log('This is Discogs output:', output)
        return output;
      } else {
        console.log('Album not found on Spotify.');
        return null;
      }
    } else {
      console.log('No album found in the selected store.');
      return null;
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}
