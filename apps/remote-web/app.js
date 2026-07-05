const ACTIONS = {
    STATE_GET: 'STATE_GET',
    SYSTEM_GET: 'SYSTEM_GET',
    BOT_RUN_ALL: 'BOT_RUN_ALL',
    BOT_RUN_ACCOUNT: 'BOT_RUN_ACCOUNT',
    BOT_STOP: 'BOT_STOP',
    CLUSTERS_SET: 'CLUSTERS_SET',
    CONFIG_GET: 'CONFIG_GET',
    CONFIG_SAVE: 'CONFIG_SAVE',
    ACCOUNT_ADD: 'ACCOUNT_ADD',
    ACCOUNT_UPDATE: 'ACCOUNT_UPDATE',
    ACCOUNT_DELETE: 'ACCOUNT_DELETE'
}

const state = {
    apiBase: localStorage.getItem('pbRemote.apiBase') || '',
    userToken: localStorage.getItem('pbRemote.userToken') || '',
    hosterId: localStorage.getItem('pbRemote.hosterId') || 'hoster-main',
    desk: null,
    system: null,
    todayUpdates: null,
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
$('refreshTodayBtn').addEventListener('click', () => refreshDesk().catch(showError))
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
$('accountForm').addEventListener('submit', event => {
    event.preventDefault()
    saveAccount().catch(showError)
})
$('accountResetBtn').addEventListener('click', () => resetAccountForm())
$('accountsBody').addEventListener('click', event => {
    const button = event.target.closest('button[data-account-action]')
    if (!button) return
    const index = Number(button.dataset.index)
    if (button.dataset.accountAction === 'edit') editAccount(index)
    if (button.dataset.accountAction === 'delete') deleteAccount(index).catch(showError)
})

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
    state.todayUpdates = snapshot.todayUpdates || snapshot.desk?.todayUpdates || null
    state.jobs = snapshot.jobs || state.jobs
    $('connectionStatus').textContent = snapshot.lastError
        ? `Snapshot loaded with local warning: ${snapshot.lastError}`
        : `Snapshot loaded from hoster JSON at ${new Date(snapshot.updatedAt).toLocaleString()}`
    renderDesk()
    renderSystem()
    renderTodayUpdates()
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

async function saveAccount() {
    const account = accountFromForm()
    if (!account.email) throw new Error('Account email is required')

    const indexValue = $('accountEditIndex').value
    const isEdit = indexValue !== ''
    if (!isEdit && !account.password) throw new Error('Password is required for a new account')

    const type = isEdit ? ACTIONS.ACCOUNT_UPDATE : ACTIONS.ACCOUNT_ADD
    const payload = isEdit ? { index: Number(indexValue), account } : { account }
    await submitAndWatch(type, payload)
    resetAccountForm()
    await refreshDesk()
}

async function deleteAccount(index) {
    const account = (state.desk?.accounts || [])[index]
    if (!account) throw new Error('Account not found')
    const ok = window.confirm(`Delete account ${account.email}? A local backup will be created first.`)
    if (!ok) return
    await submitAndWatch(ACTIONS.ACCOUNT_DELETE, { index })
    resetAccountForm()
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
                    <td class="row-actions">
                        <button type="button" data-account-action="edit" data-index="${account.index}">Edit</button>
                        <button type="button" class="danger" data-account-action="delete" data-index="${account.index}">Delete</button>
                    </td>
                </tr>
            `
        })
        .join('')
}

function renderTodayUpdates() {
    const updates = state.todayUpdates
    const body = $('todayUpdatesBody')
    const meta = $('todayUpdatesMeta')
    if (!body || !meta) return

    const groups = updates?.groups || []
    meta.textContent = updates?.dateLabel
        ? `${updates.totalEntries || 0} entries from ${updates.dateLabel} | snapshot ${new Date(updates.generatedAt).toLocaleString()}`
        : 'No dataUpdate.txt entries found on the hoster yet.'

    if (!groups.length) {
        body.innerHTML = '<div class="empty-feed">No entries available for today or latest dataUpdate date.</div>'
        return
    }

    body.innerHTML = groups
        .map(group => {
            const count = group.entries.length
            return `
                <section class="today-group">
                    <h3>Group ${group.start} - ${group.end} (${count} ${count === 1 ? 'entry' : 'entries'})</h3>
                    <div class="today-list">
                        ${group.entries
                            .map(
                                entry => `
                                    <article class="today-entry">
                                        <div>
                                            <strong>${escapeHtml(entry.email)} <span>(Nilai: ${entry.finalPoints})</span></strong>
                                            <small>Data: ${escapeHtml(entry.dateTimeLabel)}</small>
                                        </div>
                                        <span class="tag good">${signed(entry.collectedPoints)}</span>
                                    </article>
                                `
                            )
                            .join('')}
                    </div>
                </section>
            `
        })
        .join('')
}

function editAccount(index) {
    const account = (state.desk?.accounts || [])[index]
    if (!account) return
    $('accountEditIndex').value = String(index)
    $('accountFormTitle').textContent = `Edit ${account.email}`
    $('accountSubmitBtn').textContent = 'Save Account'
    $('accountEmail').value = account.email || ''
    $('accountPassword').value = ''
    $('accountTotpSecret').value = ''
    $('accountRecoveryEmail').value = account.recoveryEmail || ''
    $('accountGeoLocale').value = account.geoLocale || 'auto'
    $('accountLangCode').value = account.langCode || 'en'
    $('accountProxyHttp').checked = Boolean(account.proxy?.proxyAxios)
    $('accountProxyUrl').value = account.proxy?.url || ''
    $('accountProxyPort').value = account.proxy?.port || ''
    $('accountProxyUsername').value = account.proxy?.username || ''
    $('accountProxyPassword').value = ''
    $('accountSaveMobile').checked = Boolean(account.saveFingerprint?.mobile)
    $('accountSaveDesktop').checked = Boolean(account.saveFingerprint?.desktop)
    $('accountEmail').focus()
}

function resetAccountForm() {
    $('accountForm').reset()
    $('accountEditIndex').value = ''
    $('accountFormTitle').textContent = 'Add Account'
    $('accountSubmitBtn').textContent = 'Add Account'
    $('accountGeoLocale').value = 'auto'
    $('accountLangCode').value = 'en'
}

function accountFromForm() {
    return {
        email: $('accountEmail').value.trim(),
        password: $('accountPassword').value,
        totpSecret: $('accountTotpSecret').value.trim(),
        recoveryEmail: $('accountRecoveryEmail').value.trim(),
        geoLocale: $('accountGeoLocale').value.trim() || 'auto',
        langCode: $('accountLangCode').value.trim() || 'en',
        proxy: {
            proxyAxios: $('accountProxyHttp').checked,
            url: $('accountProxyUrl').value.trim(),
            port: Number($('accountProxyPort').value || 0),
            username: $('accountProxyUsername').value.trim(),
            password: $('accountProxyPassword').value
        },
        saveFingerprint: {
            mobile: $('accountSaveMobile').checked,
            desktop: $('accountSaveDesktop').checked
        }
    }
}

function renderSystem() {
    const system = state.system
    if (!system) return
    $('cpuUsage').textContent = system.cpu?.usagePercent == null ? '--' : `${system.cpu.usagePercent}%`
    $('cpuMeta').textContent = system.cpu?.temperature?.temperatureC
        ? `${Math.round(system.cpu.temperature.temperatureC)}C | ${system.cpu.model}`
        : system.cpu?.model || 'system loaded'
    $('ramUsage').textContent = system.memory?.usedPercent == null ? '--' : `${system.memory.usedPercent}%`
    $('ramMeta').textContent =
        system.memory?.usedBytes && system.memory?.totalBytes
            ? `${formatBytes(system.memory.usedBytes)} / ${formatBytes(system.memory.totalBytes)}`
            : 'memory not loaded'
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

function formatBytes(bytes) {
    const value = Number(bytes || 0)
    if (!value) return '--'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    return `${(value / 1024 ** index).toFixed(index <= 1 ? 0 : 1)} ${units[index]}`
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
}
