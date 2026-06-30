const { cors, send, requireUser, loadHosts } = require('./_lib')

module.exports = async function handler(req, res) {
    cors(res)
    if (req.method === 'OPTIONS') return res.end()
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })

    try {
        requireUser(req)
        const hosts = await loadHosts()
        return send(res, 200, {
            ok: true,
            storage: 'memory-mailbox',
            hosts
        })
    } catch (error) {
        return send(res, 500, { error: error.message })
    }
}
