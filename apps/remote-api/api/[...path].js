const {
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
} = require('./_lib')

module.exports = async function handler(req, res) {
    cors(res)
    if (req.method === 'OPTIONS') return res.end()

    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname

    try {
        if (pathname === '/api/health') return await handleHealth(req, res)
        if (pathname === '/api/snapshot') return await handleSnapshot(req, res, url)
        if (pathname === '/api/jobs') return await handleJobs(req, res, url)
        if (pathname === '/api/agent') return await handleAgent(req, res, url)
        return send(res, 404, { error: 'Not found' })
    } catch (error) {
        return send(res, error.status || 500, { error: error.message })
    }
}

async function handleHealth(req, res) {
    requireUser(req)
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })

    const hosts = await loadHosts()
    return send(res, 200, {
        ok: true,
        storage: 'single-function-memory-mailbox',
        hosts
    })
}

async function handleSnapshot(req, res, url) {
    requireUser(req)
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })

    const hosterId = url.searchParams.get('hosterId') || 'hoster-main'
    const snapshots = await loadSnapshots()
    const snapshot = snapshots[hosterId]
    if (!snapshot) throw statusError(404, 'Snapshot not available yet')
    return send(res, 200, { snapshot })
}

async function handleJobs(req, res, url) {
    requireUser(req)

    if (req.method === 'GET') {
        const id = url.searchParams.get('id')
        const jobs = await loadJobs()
        if (id) {
            const job = jobs.find(item => item.id === id)
            if (!job) throw statusError(404, 'Job not found')
            return send(res, 200, { job: publicJob(job) })
        }
        return send(res, 200, { jobs: jobs.slice(-50).reverse().map(publicJob) })
    }

    if (req.method === 'POST') {
        const body = await readBody(req)
        const job = createJob(body)
        const jobs = await loadJobs()
        jobs.push(job)
        await saveJobs(jobs)
        return send(res, 201, { job: publicJob(job) })
    }

    return send(res, 405, { error: 'Method not allowed' })
}

async function handleAgent(req, res, url) {
    requireHoster(req)

    if (req.method === 'GET') {
        const hosterId = url.searchParams.get('hosterId') || 'hoster-main'
        const waitMs = Math.min(Number(url.searchParams.get('waitMs') || 0), 25000)
        const started = Date.now()

        while (Date.now() - started <= waitMs) {
            const jobs = await loadJobs()
            const job = jobs.find(item => item.targetHosterId === hosterId && item.status === 'pending' && !isExpired(item))
            if (job) return send(res, 200, { job: publicJob(job) })
            if (!waitMs) break
            await sleep(700)
        }

        return send(res, 200, { job: null })
    }

    if (req.method === 'POST') {
        const body = await readBody(req)
        const hosterId = body.hosterId || 'hoster-main'

        if (body.kind === 'heartbeat') {
            const hosts = await loadHosts()
            hosts[hosterId] = {
                id: hosterId,
                online: true,
                at: new Date().toISOString(),
                localDeskBase: body.localDeskBase || null,
                agentVersion: body.agentVersion || null
            }
            await saveHosts(hosts)

            if (body.snapshot) {
                const snapshots = await loadSnapshots()
                snapshots[hosterId] = body.snapshot
                await saveSnapshots(snapshots)
            }

            return send(res, 200, { ok: true, host: hosts[hosterId] })
        }

        if (body.kind === 'started') {
            await updateJob(body.jobId, hosterId, job => {
                job.status = 'running'
                job.updatedAt = new Date().toISOString()
            })
            return send(res, 200, { ok: true })
        }

        if (body.kind === 'result') {
            await updateJob(body.jobId, hosterId, job => {
                job.status = body.ok ? 'done' : 'failed'
                job.result = body.ok ? body.result || null : null
                job.error = body.ok ? null : body.error || 'Job failed'
                job.updatedAt = new Date().toISOString()
            })
            return send(res, 200, { ok: true })
        }

        throw statusError(400, 'Unknown agent event')
    }

    return send(res, 405, { error: 'Method not allowed' })
}

async function updateJob(jobId, hosterId, mutate) {
    const jobs = await loadJobs()
    const job = jobs.find(item => item.id === jobId && item.targetHosterId === hosterId)
    if (!job) throw statusError(404, 'Job not found')
    mutate(job)
    await saveJobs(jobs)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}
