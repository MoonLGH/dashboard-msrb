const fs = require('fs')
const path = require('path')
const { ACTIONS, DEFAULTS } = require('../../../packages/shared/src/actions')

loadDotEnv(path.resolve(__dirname, '..', '.env'))

const settings = {
    apiBase: trimSlash(requiredEnv('DASHBOARD_API_BASE')),
    hosterId: process.env.DASHBOARD_HOSTER_ID || DEFAULTS.hosterId,
    token: requiredEnv('DASHBOARD_HOSTER_TOKEN'),
    localDeskBase: trimSlash(process.env.PERFECTBOT_LOCAL_DESK || DEFAULTS.localDeskBase),
    pollMs: Number(process.env.DASHBOARD_POLL_MS || DEFAULTS.pollMs),
    snapshotFile: process.env.DASHBOARD_SNAPSHOT_FILE || path.resolve(__dirname, '..', '..', '..', '..', '.desk', 'remote-dashboard.json')
}

let stopped = false

process.on('SIGINT', () => {
    stopped = true
    console.log('Stopping dashboard host agent...')
})

process.on('SIGTERM', () => {
    stopped = true
    console.log('Stopping dashboard host agent...')
})

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})

async function main() {
    console.log(`PerfectBot host agent connected to ${settings.apiBase}`)
    console.log(`Forwarding jobs to ${settings.localDeskBase}`)
    console.log(`Hoster JSON snapshot at ${settings.snapshotFile}`)

    while (!stopped) {
        try {
            await heartbeat()
            const job = await nextJob()
            if (job) {
                await runJob(job)
                continue
            }
        } catch (error) {
            console.error(`[agent] ${error.message}`)
        }

        await sleep(settings.pollMs)
    }
}

async function heartbeat() {
    const snapshot = await refreshSnapshot()
    await api('/api/agent', {
        method: 'POST',
        body: {
            kind: 'heartbeat',
            hosterId: settings.hosterId,
            localDeskBase: settings.localDeskBase,
            agentVersion: '0.1.0',
            snapshot
        }
    })
}

async function nextJob() {
    const query = new URLSearchParams({
        hosterId: settings.hosterId,
        waitMs: String(DEFAULTS.longPollMs)
    })
    const data = await api(`/api/agent?${query}`)
    return data.job || null
}

async function runJob(job) {
    console.log(`[job] ${job.id} ${job.type}`)
    updateLocalJob(job, { status: 'running', startedAt: new Date().toISOString() })
    await api('/api/agent', {
        method: 'POST',
        body: {
            kind: 'started',
            hosterId: settings.hosterId,
            jobId: job.id
        }
    })

    try {
        const result = await executeAction(job.type, job.payload || {})
        updateLocalJob(job, {
            status: 'done',
            result,
            error: null,
            finishedAt: new Date().toISOString()
        })
        await api('/api/agent', {
            method: 'POST',
            body: {
                kind: 'result',
                hosterId: settings.hosterId,
                jobId: job.id,
                ok: true,
                result
            }
        })
        console.log(`[job] ${job.id} done`)
    } catch (error) {
        updateLocalJob(job, {
            status: 'failed',
            result: null,
            error: error.message,
            finishedAt: new Date().toISOString()
        })
        await api('/api/agent', {
            method: 'POST',
            body: {
                kind: 'result',
                hosterId: settings.hosterId,
                jobId: job.id,
                ok: false,
                error: error.message
            }
        })
        console.error(`[job] ${job.id} failed: ${error.message}`)
    }
}

async function refreshSnapshot() {
    const previous = readSnapshot()
    const next = {
        version: 1,
        hosterId: settings.hosterId,
        updatedAt: new Date().toISOString(),
        localDeskBase: settings.localDeskBase,
        agent: {
            online: true,
            version: '0.1.0',
            pid: process.pid
        },
        desk: previous.desk || null,
        system: previous.system || null,
        lastError: null,
        jobs: previous.jobs || []
    }

    try {
        next.desk = await localDesk('/api/state')
    } catch (error) {
        next.lastError = `state: ${error.message}`
    }

    try {
        next.system = await localDesk('/api/system')
    } catch (error) {
        next.lastError = next.lastError ? `${next.lastError}; system: ${error.message}` : `system: ${error.message}`
    }

    writeSnapshot(next)
    return publicSnapshot(next)
}

function updateLocalJob(job, patch) {
    const snapshot = readSnapshot()
    const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : []
    const index = jobs.findIndex(item => item.id === job.id)
    const next = {
        id: job.id,
        type: job.type,
        payload: job.payload || {},
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: new Date().toISOString(),
        ...patch
    }
    if (index === -1) jobs.push(next)
    else jobs[index] = { ...jobs[index], ...next }
    snapshot.jobs = jobs.slice(-100)
    snapshot.updatedAt = new Date().toISOString()
    snapshot.hosterId = settings.hosterId
    snapshot.localDeskBase = settings.localDeskBase
    writeSnapshot(snapshot)
}

function readSnapshot() {
    try {
        if (!fs.existsSync(settings.snapshotFile)) return {}
        return JSON.parse(fs.readFileSync(settings.snapshotFile, 'utf8'))
    } catch {
        return {}
    }
}

function writeSnapshot(snapshot) {
    fs.mkdirSync(path.dirname(settings.snapshotFile), { recursive: true })
    fs.writeFileSync(settings.snapshotFile, `${JSON.stringify(snapshot, null, 4)}\n`, 'utf8')
}

function publicSnapshot(snapshot) {
    return {
        version: snapshot.version || 1,
        hosterId: snapshot.hosterId,
        updatedAt: snapshot.updatedAt,
        localDeskBase: snapshot.localDeskBase,
        agent: snapshot.agent,
        desk: snapshot.desk,
        system: snapshot.system,
        lastError: snapshot.lastError || null,
        jobs: Array.isArray(snapshot.jobs) ? snapshot.jobs.slice(-50) : []
    }
}

async function executeAction(type, payload) {
    switch (type) {
        case ACTIONS.STATE_GET:
            return localDesk('/api/state')
        case ACTIONS.SYSTEM_GET:
            return localDesk('/api/system')
        case ACTIONS.BOT_RUN_ALL:
            return localDesk('/api/run', { method: 'POST', body: { mode: 'all' } })
        case ACTIONS.BOT_RUN_ACCOUNT:
            return localDesk('/api/run', { method: 'POST', body: { mode: 'individual', accountIndex: payload.accountIndex } })
        case ACTIONS.BOT_STOP:
            return localDesk('/api/stop', { method: 'POST' })
        case ACTIONS.CLUSTERS_SET:
            return localDesk('/api/clusters', { method: 'POST', body: { clusters: payload.clusters } })
        case ACTIONS.CONFIG_GET: {
            const state = await localDesk('/api/state')
            return { config: state.config || {} }
        }
        case ACTIONS.CONFIG_SAVE:
            return localDesk('/api/config', { method: 'POST', body: { config: payload.config || {} } })
        case ACTIONS.ACCOUNT_ADD:
            return localDesk('/api/accounts', { method: 'POST', body: { account: payload.account || payload } })
        case ACTIONS.ACCOUNT_UPDATE:
            return localDesk(`/api/accounts/${Number(payload.index)}`, {
                method: 'PUT',
                body: { account: payload.account || {} }
            })
        case ACTIONS.ACCOUNT_DELETE:
            return localDesk(`/api/accounts/${Number(payload.index)}`, { method: 'DELETE' })
        default:
            throw new Error(`Unsupported action: ${type}`)
    }
}

async function api(route, options = {}) {
    return request(`${settings.apiBase}${route}`, {
        label: `remote API ${route}`,
        ...options,
        headers: {
            Authorization: `Bearer ${settings.token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    })
}

async function localDesk(route, options = {}) {
    return request(`${settings.localDeskBase}${route}`, {
        label: `local desk ${route}`,
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    })
}

async function request(url, options = {}) {
    const init = {
        method: options.method || 'GET',
        headers: options.headers || {}
    }
    if (options.body !== undefined) init.body = JSON.stringify(options.body)

    let res
    try {
        res = await fetch(url, init)
    } catch (error) {
        const target = options.label || url
        throw new Error(`${target} is unreachable at ${url}: ${error.cause?.message || error.message}`)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `${init.method} ${url} failed with ${res.status}`)
    return data
}

function requiredEnv(name) {
    const value = process.env[name]
    if (!value) throw new Error(`${name} is required`)
    return value
}

function trimSlash(value) {
    return String(value || '').replace(/\/+$/, '')
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function loadDotEnv(file) {
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
