const ACTIONS = {
    STATE_GET: 'STATE_GET',
    SYSTEM_GET: 'SYSTEM_GET',
    BOT_RUN_ALL: 'BOT_RUN_ALL',
    BOT_RUN_ACCOUNT: 'BOT_RUN_ACCOUNT',
    BOT_STOP: 'BOT_STOP',
    CLUSTERS_SET: 'CLUSTERS_SET',
    CONFIG_GET: 'CONFIG_GET',
    CONFIG_SAVE: 'CONFIG_SAVE'
}

const state = {
    apiBase: localStorage.getItem('pbRemote.apiBase') || '',
    userToken: localStorage.getItem('pbRemote.userToken') || '',
    hosterId: localStorage.getItem('pbRemote.hosterId') || 'hoster-main',
    desk: null,
    system: null,
    jobs: []
}

const $ = id => document.getElementById(id)

$('apiBase').value = state.apiBase
$('userToken').value = state.userToken
$('hosterId').value = state.hosterId

$('connectionForm').addEventListener('submit', event => {
    event.preventDefault()
    state.apiBase = trimSlash($('apiBase').value.trim())
    state.userToken = $('userToken').value.trim()
    state.hosterId = $('hosterId').value.trim() || 'hoster-main'
    localStorage.setItem('pbRemote.apiBase', state.apiBase)
    localStorage.setItem('pbRemote.userToken', state.userToken)
    localStorage.setItem('pbRemote.hosterId', state.hosterId)
    refreshAll().catch(showError)
})

$('refreshStateBtn').addEventListener('click', () => refreshDesk().catch(showError))
$('refreshJobsBtn').addEventListener('click', () => refreshJobs().catch(showError))
$('runAllBtn').addEventListener('click', () => submitAndWatch(ACTIONS.BOT_RUN_ALL).catch(showError))
$('stopBtn').addEventListener('click', () => submitAndWatch(ACTIONS.BOT_STOP).catch(showError))
$('runAccountBtn').addEventListener('click', () => {
    const accountIndex = Number($('accountIndexInput').value || 0)
    submitAndWatch(ACTIONS.BOT_RUN_ACCOUNT, { accountIndex }).catch(showError)
})
$('setClustersBtn').addEventListener('click', () => {
    const clusters = Number($('clustersInput').value || 1)
    submitAndWatch(ACTIONS.CLUSTERS_SET, { clusters }).catch(showError)
})
$('loadConfigBtn').addEventListener('click', () => loadConfig().catch(showError))
$('saveConfigBtn').addEventListener('click', () => saveConfig().catch(showError))

if (state.apiBase && state.userToken) refreshAll().catch(showError)

async function refreshAll() {
    await refreshHealth()
    await refreshDesk()
    await refreshJobs()
}

async function refreshHealth() {
    const data = await api('/api/health')
    const host = data.hosts && data.hosts[state.hosterId]
    $('connectionStatus').textContent = `Connected to ${state.apiBase} using ${data.storage} storage`
    $('hosterStatus').textContent = host ? 'online' : 'offline'
    $('hosterUpdated').textContent = host ? `last heartbeat ${new Date(host.at).toLocaleString()}` : 'waiting for heartbeat'
}

async function refreshDesk() {
    const data = await api(`/api/snapshot?hosterId=${encodeURIComponent(state.hosterId)}`)
    const snapshot = data.snapshot
    state.desk = snapshot.desk || null
    state.system = snapshot.system || null
    state.jobs = snapshot.jobs || state.jobs
    $('connectionStatus').textContent = snapshot.lastError
        ? `Snapshot loaded with local warning: ${snapshot.lastError}`
        : `Snapshot loaded from hoster JSON at ${new Date(snapshot.updatedAt).toLocaleString()}`
    renderDesk()
    renderSystem()
    renderJobs()
}

async function loadConfig() {
    const job = await submitAndWatch(ACTIONS.CONFIG_GET, {}, false)
    $('configText').value = JSON.stringify(job.result.config || {}, null, 4)
    await refreshJobs()
}

async function saveConfig() {
    let config
    try {
        config = JSON.parse($('configText').value || '{}')
    } catch {
        throw new Error('Configurator JSON is invalid')
    }
    await submitAndWatch(ACTIONS.CONFIG_SAVE, { config })
    state.desk = null
    await refreshDesk()
}

async function submitAndWatch(type, payload = {}, refresh = true) {
    const created = await api('/api/jobs', {
        method: 'POST',
        body: {
            type,
            payload,
            targetHosterId: state.hosterId
        }
    })
    const job = await waitForJob(created.job.id)
    if (refresh) await refreshJobs()
    if (job.status === 'failed') throw new Error(job.error || `${type} failed`)
    return job
}

async function waitForJob(id) {
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
        const data = await api(`/api/jobs?id=${encodeURIComponent(id)}`)
        if (data.job.status === 'done' || data.job.status === 'failed') return data.job
        await sleep(900)
    }
    throw new Error(`Timed out waiting for ${id}`)
}

async function refreshJobs() {
    const data = await api('/api/jobs')
    state.jobs = data.jobs || []
    renderJobs()
}

async function api(route, options = {}) {
    if (!state.apiBase) throw new Error('API Base is required')
    if (!state.userToken) throw new Error('User Token is required')

    const init = {
        method: options.method || 'GET',
        headers: {
            Authorization: `Bearer ${state.userToken}`,
            'Content-Type': 'application/json'
        }
    }
    if (options.body !== undefined) init.body = JSON.stringify(options.body)

    const res = await fetch(`${state.apiBase}${route}`, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ? `${res.status}: ${data.error}` : `Request failed with ${res.status}`)
    return data
}

function renderDesk() {
    const desk = state.desk
    if (!desk) return
    $('botStatus').textContent = desk.running ? 'running' : 'idle'
    $('botMeta').textContent = desk.pid ? `pid ${desk.pid}` : 'no active process'
    $('accountCount').textContent = String(desk.accounts?.length || 0)
    $('ranToday').textContent = `${(desk.accounts || []).filter(account => account.ranToday).length} ran today`
    $('clusterCount').textContent = String(desk.config?.clusters ?? '--')
    $('clustersInput').value = String(desk.config?.clusters ?? 1)

    $('accountsBody').innerHTML = (desk.accounts || [])
        .map(account => {
            const latest = account.latest
                ? `${signed(account.latest.collectedPoints)} (${account.latest.initialPoints} -> ${account.latest.finalPoints})`
                : 'No data'
            return `
                <tr>
                    <td title="${escapeHtml(account.email)}">${escapeHtml(account.email)}</td>
                    <td>${account.ranToday ? '<span class="tag good">done</span>' : '<span class="tag warn">pending</span>'}</td>
                    <td>${escapeHtml(latest)}</td>
                    <td>${account.proxySet ? '<span class="tag">set</span>' : '<span class="tag muted">none</span>'}</td>
                </tr>
            `
        })
        .join('')
}

function renderSystem() {
    const system = state.system
    if (!system) return
    $('cpuUsage').textContent = system.cpu?.usagePercent == null ? '--' : `${system.cpu.usagePercent}%`
    $('cpuMeta').textContent = system.cpu?.temperature?.temperatureC
        ? `${Math.round(system.cpu.temperature.temperatureC)}C | ${system.cpu.model}`
        : system.cpu?.model || 'system loaded'
}

function renderJobs() {
    $('jobsList').innerHTML = state.jobs
        .map(job => `
            <article class="job ${escapeHtml(job.status)}">
                <div>
                    <strong>${escapeHtml(job.type)}</strong>
                    <span>${escapeHtml(job.status)}</span>
                </div>
                <small>${escapeHtml(job.id)} | ${new Date(job.updatedAt || job.createdAt).toLocaleString()}</small>
                ${job.error ? `<p>${escapeHtml(job.error)}</p>` : ''}
            </article>
        `)
        .join('')
}

function showError(error) {
    $('connectionStatus').textContent = error.message
    $('hosterStatus').textContent = 'error'
    console.error(error)
}

function trimSlash(value) {
    return String(value || '').replace(/\/+$/, '')
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function signed(value) {
    const number = Number(value || 0)
    return `${number >= 0 ? '+' : ''}${number}`
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
}
