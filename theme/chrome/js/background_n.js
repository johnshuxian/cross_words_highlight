/**
 * 所有持久化写操作都统一经过后台页。
 * 这样可以避免 content script、配置页同时执行“先读后写”时产生覆盖。
 */
const PAGE_STORAGE_PREFIX = 'highlight-mengshou-'

/**
 * 每个 storage key 单独维护一条写入队列。
 * 不同页面的数据彼此独立，同一个页面的数据必须串行落盘。
 */
const writeQueueByStorageKey = {}

/**
 * 生成某个页面的持久化 key。
 * @param pageUrl
 * @returns {string}
 */
function buildPageStorageKey(pageUrl) {
    return PAGE_STORAGE_PREFIX + pageUrl
}

/**
 * 读取扩展自己的 storage.local。
 * @param key
 * @returns {Promise<Object>}
 */
function getStorageLocalData(key) {
    return new Promise(function (resolve, reject) {
        chrome.storage.local.get(key, function (items) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            resolve(items)
        })
    })
}

/**
 * 写入扩展自己的 storage.local。
 * @param payload
 * @returns {Promise<void>}
 */
function setStorageLocalData(payload) {
    return new Promise(function (resolve, reject) {
        chrome.storage.local.set(payload, function () {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            resolve()
        })
    })
}

/**
 * 删除扩展自己的 storage.local key。
 * @param key
 * @returns {Promise<void>}
 */
function removeStorageLocalData(key) {
    return new Promise(function (resolve, reject) {
        chrome.storage.local.remove([key], function () {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            resolve()
        })
    })
}

/**
 * 把同一个页面的数据写入串行化。
 * 这里不做全局锁，只锁单个 key，避免无关页面互相阻塞。
 * @param storageKey
 * @param worker
 * @returns {Promise<*>}
 */
function queueStorageWrite(storageKey, worker) {
    const previousTask = writeQueueByStorageKey[storageKey] || Promise.resolve()
    const nextTask = previousTask
        .catch(function () {
        })
        .then(function () {
            return worker()
        })

    let cleanupTask
    cleanupTask = nextTask.finally(function () {
        if (writeQueueByStorageKey[storageKey] === cleanupTask) {
            delete writeQueueByStorageKey[storageKey]
        }
    })

    writeQueueByStorageKey[storageKey] = cleanupTask

    return nextTask
}

/**
 * 后台页内部使用的页面级存储。
 * 这里只处理持久化数据，不掺杂 UI 状态。
 */
class HighlightPageStore {
    constructor(pageUrl) {
        this.key = buildPageStorageKey(pageUrl)
    }

    /**
     * 读取某个页面的全部高亮。
     * @returns {Promise<Array>}
     */
    async readAll() {
        const items = await getStorageLocalData(this.key)
        const stores = items[this.key]

        if (!Array.isArray(stores)) {
            return []
        }

        return stores
    }

    /**
     * 把完整数组写回 storage.local。
     * 空数组直接删除 key，避免留下无效页面记录。
     * @param stores
     * @returns {Promise<Array>}
     */
    async writeAll(stores) {
        if (!Array.isArray(stores) || stores.length === 0) {
            await removeStorageLocalData(this.key)
            return []
        }

        await setStorageLocalData({[this.key]: stores})
        return stores
    }

    /**
     * 新增或覆盖高亮。
     * 同一个 id 出现时直接覆盖，保证评论和颜色更新能落到同一条记录上。
     * @param wrappedSources
     * @returns {Promise<Array>}
     */
    async save(wrappedSources) {
        const currentStore = this

        return queueStorageWrite(this.key, async function () {
            const stores = await currentStore.readAll()
            const indexMap = {}

            stores.forEach(function (store, idx) {
                if (store && store.hs && store.hs.id) {
                    indexMap[store.hs.id] = idx
                }
            })

            wrappedSources.forEach(function (wrappedSource) {
                if (!wrappedSource || !wrappedSource.hs || !wrappedSource.hs.id) {
                    return
                }

                if (indexMap[wrappedSource.hs.id] !== undefined) {
                    stores[indexMap[wrappedSource.hs.id]] = wrappedSource
                    return
                }

                stores.push(wrappedSource)
            })

            return currentStore.writeAll(stores)
        })
    }

    /**
     * 删除某个页面内的一条高亮。
     * @param id
     * @returns {Promise<Array>}
     */
    async remove(id) {
        const currentStore = this

        return queueStorageWrite(this.key, async function () {
            const stores = await currentStore.readAll()
            const nextStores = stores.filter(function (store) {
                return store && store.hs && store.hs.id !== id
            })

            return currentStore.writeAll(nextStores)
        })
    }

    /**
     * 删除整页高亮记录。
     * @returns {Promise<Array>}
     */
    async removePage() {
        const currentStore = this

        return queueStorageWrite(this.key, async function () {
            return currentStore.writeAll([])
        })
    }
}

/**
 * content script 发来的是原始 hs 数组。
 * 后台页统一包成 {hs} 结构后再持久化，保持历史数据格式不变。
 * @param sources
 * @returns {Array}
 */
function normalizeSourcesForSave(sources) {
    if (!Array.isArray(sources)) {
        return []
    }

    return sources
        .filter(function (source) {
            return source && source.id
        })
        .map(function (source) {
            return {hs: source}
        })
}

/**
 * 重新加载当前激活页。
 * 这个动作只保留给扩展开关切换使用。
 * @returns {Promise<void>}
 */
function reloadActiveTab() {
    return new Promise(function (resolve, reject) {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            if (!tabs || !tabs[0]) {
                resolve()
                return
            }

            chrome.tabs.executeScript(tabs[0].id, {
                code: "location.reload()"
            }, function () {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError)
                    return
                }

                resolve()
            })
        })
    })
}

/**
 * 把后台页产生的删除动作广播给所有内容页。
 * 不同 tab 是否处理，由内容页自己按 href 判断。
 * @param message
 * @returns {Promise<void>}
 */
function broadcastToContentScripts(message) {
    return new Promise(function (resolve) {
        chrome.tabs.query({}, function (tabs) {
            if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
                resolve()
                return
            }

            let pendingCount = tabs.length

            tabs.forEach(function (tab) {
                chrome.tabs.sendMessage(tab.id, message, function () {
                    pendingCount--

                    if (pendingCount === 0) {
                        resolve()
                    }
                })
            })
        })
    })
}

/**
 * 处理 content script 的增删请求。
 * @param request
 * @returns {Promise<{ok: boolean}>}
 */
async function handleContentMessage(request) {
    const info = request.data || {}

    if (!info.href) {
        return {ok: false, error: 'Missing href'}
    }

    const stores = new HighlightPageStore(info.href)

    switch (request.action) {
        case 'add':
            await stores.save(normalizeSourcesForSave(info.sources))
            return {ok: true}
        case 'remove':
            await stores.remove(info.sources)
            return {ok: true}
        default:
            return {ok: false, error: 'Unknown content action'}
    }
}

/**
 * 处理配置页和 popup 发来的请求。
 * @param request
 * @returns {Promise<{ok: boolean}>}
 */
async function handlePopupMessage(request) {
    const info = request.data || {}

    switch (request.action) {
        case 'reload':
            await reloadActiveTab()
            return {ok: true}
        case 'deleteHighlight':
            if (!info.href || !info.id) {
                return {ok: false, error: 'Missing deleteHighlight payload'}
            }

            await new HighlightPageStore(info.href).remove(info.id)
            await broadcastToContentScripts({
                from: 'bg_js',
                action: 'deleteHighlight',
                data: {
                    href: info.href,
                    id: info.id
                }
            })
            return {ok: true}
        case 'deletePage':
            if (!info.href) {
                return {ok: false, error: 'Missing deletePage payload'}
            }

            await new HighlightPageStore(info.href).removePage()
            await broadcastToContentScripts({
                from: 'bg_js',
                action: 'deletePage',
                data: {
                    href: info.href
                }
            })
            return {ok: true}
        case 'updateHighlight':
            if (!info.href || !info.source || !info.source.id) {
                return {ok: false, error: 'Missing updateHighlight payload'}
            }

            await new HighlightPageStore(info.href).save(normalizeSourcesForSave([info.source]))
            await broadcastToContentScripts({
                from: 'bg_js',
                action: 'updateHighlight',
                data: {
                    href: info.href,
                    source: info.source
                }
            })
            return {ok: true}
        default:
            return {ok: false, error: 'Unknown popup action'}
    }
}

/**
 * 统一消息入口。
 * 后台页只负责落盘和少量全局动作，不再做 UI 刷新逻辑。
 */
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (!request || !request.from) {
        return false
    }

    if (request.from === 'content_js') {
        handleContentMessage(request)
            .then(function (result) {
                sendResponse(result)
            })
            .catch(function (error) {
                sendResponse({ok: false, error: error && error.message ? error.message : String(error)})
            })

        return true
    }

    if (request.from === 'pop_js') {
        handlePopupMessage(request)
            .then(function (result) {
                sendResponse(result)
            })
            .catch(function (error) {
                sendResponse({ok: false, error: error && error.message ? error.message : String(error)})
            })

        return true
    }

    return false
})

const options = {
    type: 'checkbox',
    id: 'stopUse',
    title: 'disable',
    checked: false,
    onclick: function (info, tab) {
        chrome.storage.sync.set({setting: {use: !info.checked}}, function () {
            chrome.tabs.executeScript(tab.id, {
                code: "location.reload()"
            })
        })
    }
}

chrome.contextMenus.create(options)

chrome.storage.sync.get(['setting'], function (item) {
    if (!item.setting) {
        chrome.storage.sync.set({setting: {use: true}}, function () {
        })
        chrome.contextMenus.update('stopUse', {checked: false})
        return
    }

    chrome.contextMenus.update('stopUse', {checked: !item.setting.use})
})
