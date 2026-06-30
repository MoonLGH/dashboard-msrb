const crypto = require('crypto')

const memory = globalThis.__perfectbotDashboardStore || {
    jobs: [],
    hosts: {},
    snapshots: {}
}
globalThis.__perfectbotDashboardStore = memory

const VALID_ACTIONS = new Set([
    'STATE_GET',
    'SYSTEM_GET',
    'BOT_RUN_ALL',
    'BOT_RUN_ACCOUNT',
    'BOT_STOP',
    'CLUSTERS_SET',
    'CONFIG_GET',
    'CONFIG_SAVE',
    'ACCOUNT_ADD',
    'ACCOUNT_UPDATE',
    'ACCOUNT_DELETE'
])

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function send(res, status, body) {
    cors(res)
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = ''
        req.on('data', chunk => {
            body += chunk
            if (body.length > 2_000_000) {
                reject(new Error('Request body too large'))
                req.destroy()
            }
        })
        req.on('end', () => {
            if (!body) return resolve({})
            try {
                resolve(JSON.parse(body))
            } catch (error) {
                reject(error)
            }
        })
    })
}

function bearer(req) {
    const value = req.headers.authorization || ''
    const match = String(value).match(/^Bearer\s+(.+)$/i)
    return match ? match[1] : ''
}

function requireUser(req) {
    const expected = process.env.DASHBOARD_USER_TOKEN
    if (!expected) throw statusError(500, 'DASHBOARD_USER_TOKEN is not configured')
    if (bearer(req) !== expected) throw statusError(401, 'Invalid user token')
}

function requireHoster(req) {
    const expected = process.env.DASHBOARD_HOSTER_TOKEN
    if (!expected) throw statusError(500, 'DASHBOARD_HOSTER_TOKEN is not configured')
    if (bearer(req) !== expected) throw statusError(401, 'Invalid hoster token')
}

function statusError(status, message) {
    const error = new Error(message)
    error.status = status
    return error
}

async function loadJobs() {
    return memory.jobs || []
}

async function saveJobs(jobs) {
    memory.jobs = jobs.slice(-200)
}

async function loadHosts() {
    return memory.hosts || {}
}

async function saveHosts(hosts) {
    memory.hosts = hosts
}

async function loadSnapshots() {
    return memory.snapshots || {}
}

async function saveSnapshots(snapshots) {
    memory.snapshots = snapshots
}

function publicJob(job) {
    return {
        id: job.id,
        type: job.type,
        targetHosterId: job.targetHosterId,
        payload: job.payload,
        status: job.status,
        result: job.result || null,
        error: job.error || null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        expiresAt: job.expiresAt
    }
}

function createJob({ type, payload, targetHosterId, createdBy }) {
    if (!VALID_ACTIONS.has(type)) throw statusError(400, `Unsupported action: ${type}`)
    const now = new Date()
    return {
        id: `job_${now.getTime()}_${crypto.randomBytes(4).toString('hex')}`,
        type,
        payload: payload || {},
        targetHosterId: targetHosterId || 'hoster-main',
        createdBy: createdBy || 'remote-user',
        status: 'pending',
        result: null,
        error: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString()
    }
}

function isExpired(job) {
    return Date.now() > Date.parse(job.expiresAt || 0)
}

module.exports = {
    cors,
    send,
    readBody,
    requireUser,
    requireHoster,
    statusError,
    loadJobs,
    saveJobs,
    loadHosts,
    saveHosts,
    loadSnapshots,
    saveSnapshots,
    publicJob,
    createJob,
    isExpired
}
