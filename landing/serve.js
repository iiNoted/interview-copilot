const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 8102
const DIR = __dirname

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const server = http.createServer((req, res) => {
  let filePath = path.join(DIR, req.url === '/' ? 'index.html' : req.url)
  
  // Serve privacy/terms from project root
  if (req.url === '/privacy-policy.html' || req.url === '/terms-of-service.html') {
    filePath = path.join(DIR, '..', req.url)
  }

  const ext = path.extname(filePath)
  const contentType = MIME[ext] || 'application/octet-stream'

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' })
      res.end('<h1>404</h1>')
      return
    }
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`Interview Copilot landing page: http://localhost:${PORT}`)
})
