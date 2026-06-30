const {
    cors,
    send,
    readBody,
    requireUser,
    statusError,
    loadJobs,
    saveJobs,
    publicJob,
    createJob
} = require('./_lib')

module.exports = async function handler(req, res) {
    cors(res)
    if (req.method === 'OPTIONS') return res.end()

    try {
        requireUser(req)

        if (req.method === 'GET') {
            const url = new URL(req.url, 'http://localhost')
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
    } catch (error) {
        return send(res, error.status || 500, { error: error.message })
    }
}
