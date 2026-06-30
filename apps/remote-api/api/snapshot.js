const { cors, send, requireUser, loadSnapshots, statusError } = require('./_lib')

module.exports = async function handler(req, res) {
    cors(res)
    if (req.method === 'OPTIONS') return res.end()

    try {
        requireUser(req)
        if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })

        const url = new URL(req.url, 'http://localhost')
        const hosterId = url.searchParams.get('hosterId') || 'hoster-main'
        const snapshots = await loadSnapshots()
        const snapshot = snapshots[hosterId]
        if (!snapshot) throw statusError(404, 'Snapshot not available yet')
        return send(res, 200, { snapshot })
    } catch (error) {
        return send(res, error.status || 500, { error: error.message })
    }
}
