const express = require("express")
const path = require("path")
const albumHandler = require("./api/album")

const app = express()
const PORT = 4000

// Serve all static files (HTML, CSS, JS, images, animations)
app.use(express.static(path.join(__dirname)))

// Mount the same serverless handler that Vercel uses in production
app.get("/api/album", albumHandler)

app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`)
})
