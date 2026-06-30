const http = require('http')
const path = require('path')

loadDotEnv(path.resolve(__dirname, '..', '.env.local'))
loadDotEnv(path.resolve(__dirname, '..', '.env'))

process.env.DASHBOARD_USER_TOKEN ||= 'local-user-token'
process.env.DASHBOARD_HOSTER_TOKEN ||= 'local-hoster-token'

const handlers = {
    '/api/agent': require('../api/agent'),
    '/api/health': require('../api/health'),
    '/api/jobs': require('../api/jobs'),
    '/api/snapshot': require('../api/snapshot')
}

const port = Number(process.env.PORT || 3000)

http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const handler = handlers[url.pathname]
    if (!handler) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'Not found' }))
        return
    }
    handler(req, res)
}).listen(port, () => {
    console.log(`PerfectBot remote API dev server at http://127.0.0.1:${port}`)
    console.log(`DASHBOARD_USER_TOKEN=${process.env.DASHBOARD_USER_TOKEN}`)
    console.log(`DASHBOARD_HOSTER_TOKEN=${process.env.DASHBOARD_HOSTER_TOKEN}`)
})

function loadDotEnv(file) {
    const fs = require('fs')
    if (!fs.existsSync(file)) return
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    for (const line of lines) {
        const clean = line.trim()
        if (!clean || clean.startsWith('#')) continue
        const index = clean.indexOf('=')
        if (index === -1) continue
        const key = clean.slice(0, index).trim()
        const value = clean.slice(index + 1).trim().replace(/^"|"$/g, '')
        if (!process.env[key]) process.env[key] = value
    }
}
