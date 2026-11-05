try {
  process.loadEnvFile() // reads keys from .env for local runs
} catch {}

const express = require("express")
const path = require("path")
const albumHandler = require("./api/album")
const { renderRoute } = require("./lib/render.js")

const app = express()
const PORT = 4000

// Serve all static files (HTML, CSS, JS, images, animations)
app.use(express.static(path.join(__dirname)))

// Mount the same serverless handler that Vercel uses in production
app.get("/api/album", albumHandler)

// Same public pages that vercel.json routes to api/page.js
const page = (route) => (req, res) => {
  const { status, html } = renderRoute(route(req.params))
  res.status(status).type("html").send(html)
}
app.get("/album/:slug", page((p) => ({ type: "album", slug: p.slug })))
app.get("/genre/:genre", page((p) => ({ type: "genre", genre: p.genre })))
app.get("/genre/:genre/page/:page", page((p) => ({ type: "genre", genre: p.genre, page: p.page })))

app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`)
})
