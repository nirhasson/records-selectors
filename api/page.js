// Public SEO pages. vercel.json rewrites /album/:slug and /genre/:genre here.
const { renderRoute } = require("../lib/render.js")

module.exports = (req, res) => {
  const { status, html } = renderRoute(req.query)
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  // Cached on Vercel's CDN for a day; every nightly deploy starts a fresh cache
  if (status === 200) res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800")
  res.status(status).send(html)
}
