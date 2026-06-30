const ACTIONS = Object.freeze({
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
})

const ACTION_LABELS = Object.freeze({
    [ACTIONS.STATE_GET]: 'Refresh desk state',
    [ACTIONS.SYSTEM_GET]: 'Refresh system telemetry',
    [ACTIONS.BOT_RUN_ALL]: 'Run all accounts',
    [ACTIONS.BOT_RUN_ACCOUNT]: 'Run one account',
    [ACTIONS.BOT_STOP]: 'Stop bot',
    [ACTIONS.CLUSTERS_SET]: 'Set cluster count',
    [ACTIONS.CONFIG_GET]: 'Load configurator',
    [ACTIONS.CONFIG_SAVE]: 'Save configurator',
    [ACTIONS.ACCOUNT_ADD]: 'Add account',
    [ACTIONS.ACCOUNT_UPDATE]: 'Update account',
    [ACTIONS.ACCOUNT_DELETE]: 'Delete account'
})

const DEFAULTS = Object.freeze({
    localDeskBase: 'http://127.0.0.1:4784',
    hosterId: 'hoster-main',
    pollMs: 900,
    longPollMs: 25000
})

module.exports = { ACTIONS, ACTION_LABELS, DEFAULTS }
