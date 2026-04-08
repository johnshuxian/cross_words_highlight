/**
 * 所有持久化写操作都统一经过后台页。
 * 这样可以避免 content script、配置页同时执行“先读后写”时产生覆盖。
 */
const PAGE_STORAGE_PREFIX = 'highlight-mengshou-'
const PAGE_INDEX_STORAGE_KEY = 'johns-highlight-page-index'
const CONTEXT_MENU_ID = 'stopUse'

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
 * 页面高亮数据在 storage.local 里统一保持 {hs} 数组结构。
 * 导入、保存、删除都先走这层过滤，避免把无效对象写进持久化存储。
 * @param stores
 * @returns {Array}
 */
function normalizeWrappedSourcesForStorage(stores) {
    if (!Array.isArray(stores)) {
        return []
    }

    return stores
        .filter(function (store) {
            return store && store.hs && store.hs.id
        })
        .map(function (store) {
            return {hs: store.hs}
        })
}

/**
 * 从 storage key 里反推出页面 url。
 * 索引恢复、导入和配置页详情读取都会复用这条规则。
 * @param storageKey
 * @returns {string}
 */
function extractPageUrlFromStorageKey(storageKey) {
    if (typeof storageKey !== 'string' || storageKey.indexOf(PAGE_STORAGE_PREFIX) !== 0) {
        return ''
    }

    return storageKey.slice(PAGE_STORAGE_PREFIX.length)
}

/**
 * 把单页高亮数组压成配置页主列表需要的摘要数据。
 * 主列表不再直接依赖完整 hs 数组，避免每次打开都把所有详情一起搬进内存。
 * @param storageKey
 * @param stores
 * @returns {{href: string, title: string, nums: number, commentNums: number, icon: string, readDate: string, key: string}}
 */
function buildPageSummary(storageKey, stores) {
    const safeStores = normalizeWrappedSourcesForStorage(stores)
    const summary = {
        href: extractPageUrlFromStorageKey(storageKey),
        title: '',
        nums: safeStores.length,
        commentNums: 0,
        icon: '',
        readDate: '',
        key: storageKey
    }

    safeStores.forEach(function (store) {
        const currentHighlight = store.hs

        if (currentHighlight.comment) {
            summary.commentNums++
        }

        if (currentHighlight.href) {
            summary.href = currentHighlight.href
        }

        if (!summary.readDate || String(currentHighlight.readDate || '') >= summary.readDate) {
            summary.title = currentHighlight.title || summary.title
            summary.icon = currentHighlight.icon || summary.icon
            summary.readDate = currentHighlight.readDate || summary.readDate
        }
    })

    return summary
}

/**
 * 读取页面摘要索引。
 * 索引缺失时返回 null，调用方决定是否触发一次全量回填。
 * @returns {Promise<Object|null>}
 */
async function getHighlightIndexMap() {
    const items = await getStorageLocalData(PAGE_INDEX_STORAGE_KEY)
    const indexMap = items[PAGE_INDEX_STORAGE_KEY]

    if (!indexMap || typeof indexMap !== 'object' || Array.isArray(indexMap)) {
        return null
    }

    return indexMap
}

/**
 * 覆盖写入页面摘要索引。
 * 索引本身不大，直接整包写入更直观，后续排查也更容易。
 * @param indexMap
 * @returns {Promise<void>}
 */
function setHighlightIndexMap(indexMap) {
    return setStorageLocalData({
        [PAGE_INDEX_STORAGE_KEY]: indexMap || {}
    })
}

/**
 * 首次启用索引缓存时，老数据还没有摘要。
 * 这里从 storage.local 现有页面数据重建一次，后续更新再走增量同步。
 * @returns {Promise<Object>}
 */
async function rebuildHighlightIndexFromLocalStorage() {
    const items = await getStorageLocalData(null)
    const nextIndexMap = {}

    Object.keys(items || {}).forEach(function (key) {
        if (key === PAGE_INDEX_STORAGE_KEY) {
            return
        }

        if (key.indexOf(PAGE_STORAGE_PREFIX) !== 0) {
            return
        }

        const safeStores = normalizeWrappedSourcesForStorage(items[key])

        if (safeStores.length === 0) {
            return
        }

        nextIndexMap[key] = buildPageSummary(key, safeStores)
    })

    await setHighlightIndexMap(nextIndexMap)
    return nextIndexMap
}

/**
 * 对配置页来说，索引要么已经存在，要么现场回填。
 * 这样主列表第一次切到索引模式时，不会因为旧用户没有索引而丢数据。
 * @returns {Promise<Object>}
 */
async function ensureHighlightIndexMap() {
    const indexMap = await getHighlightIndexMap()

    if (indexMap) {
        return indexMap
    }

    return rebuildHighlightIndexFromLocalStorage()
}

/**
 * 单页高亮写入完成后，同步维护页面摘要索引。
 * 页面数据和索引分别串行，但索引本身再用独立 key 做一次队列收口，
 * 避免多个页面同时更新时互相覆盖索引映射。
 * @param storageKey
 * @param stores
 * @returns {Promise<void>}
 */
function syncHighlightIndexEntry(storageKey, stores) {
    const safeStores = normalizeWrappedSourcesForStorage(stores)

    return queueStorageWrite(PAGE_INDEX_STORAGE_KEY, async function () {
        const indexMap = await ensureHighlightIndexMap()
        const nextIndexMap = Object.assign({}, indexMap)

        if (safeStores.length === 0) {
            delete nextIndexMap[storageKey]
        } else {
            nextIndexMap[storageKey] = buildPageSummary(storageKey, safeStores)
        }

        await setHighlightIndexMap(nextIndexMap)
    })
}

/**
 * 读取当前 sync 里的少量全局设置。
 * 导入时要先拿旧值，后面才能判断是否需要刷新所有已打开页面。
 * @returns {Promise<{setting: {use: boolean}, uiLanguage: string}>}
 */
function getSyncPreferences() {
    return new Promise(function (resolve, reject) {
        chrome.storage.sync.get(['setting', 'uiLanguage'], function (item) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            resolve({
                setting: item && item.setting && typeof item.setting.use === 'boolean'
                    ? {use: item.setting.use}
                    : {use: true},
                uiLanguage: item && item.uiLanguage === 'en' ? 'en' : 'zh'
            })
        })
    })
}

/**
 * tab.url 带 hash 时，导入后的页面匹配会失准。
 * 这里统一去掉 hash，保证“同一页面不同锚点”也能命中刷新。
 * @param url
 * @returns {string}
 */
function normalizeTabUrl(url) {
    return typeof url === 'string' ? url.replace(/#.*$/, '') : ''
}

/**
 * 只处理正常网页标签页。
 * chrome://、edge:// 这类页面不允许脚本注入，也不需要参与高亮同步。
 * @param url
 * @returns {boolean}
 */
function isReloadableWebUrl(url) {
    return /^https?:\/\//i.test(url || '')
}

/**
 * 导入后刷新当前已经打开的目标页面。
 * 这样用户不需要手动刷新，就能看到刚导入进来的高亮记录。
 * @param pageUrls
 * @returns {Promise<void>}
 */
function reloadTabsByPageUrls(pageUrls) {
    const targetUrls = {}

    ;(pageUrls || []).forEach(function (pageUrl) {
        const normalizedUrl = normalizeTabUrl(pageUrl)

        if (normalizedUrl) {
            targetUrls[normalizedUrl] = true
        }
    })

    if (Object.keys(targetUrls).length === 0) {
        return Promise.resolve()
    }

    return new Promise(function (resolve) {
        chrome.tabs.query({}, function (tabs) {
            if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
                resolve()
                return
            }

            const reloadTasks = tabs
                .filter(function (tab) {
                    return isReloadableWebUrl(tab.url) && targetUrls[normalizeTabUrl(tab.url)]
                })
                .map(function (tab) {
                    return reloadTabById(tab.id).catch(function () {
                    })
                })

            Promise.all(reloadTasks).finally(function () {
                resolve()
            })
        })
    })
}

/**
 * 如果导入包把扩展开关从开改到关，或者从关改到开，
 * 当前所有已打开网页都需要重新执行一次初始化流程。
 * 导入不是高频操作，这里直接整批刷新可读性更高，也更稳。
 * @returns {Promise<void>}
 */
function reloadAllWebTabs() {
    return new Promise(function (resolve) {
        chrome.tabs.query({}, function (tabs) {
            if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
                resolve()
                return
            }

            const reloadTasks = tabs
                .filter(function (tab) {
                    return isReloadableWebUrl(tab.url)
                })
                .map(function (tab) {
                    return reloadTabById(tab.id).catch(function () {
                    })
                })

            Promise.all(reloadTasks).finally(function () {
                resolve()
            })
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
        this.pageUrl = pageUrl
        this.key = buildPageStorageKey(pageUrl)
    }

    /**
     * 读取某个页面的全部高亮。
     * @returns {Promise<Array>}
     */
    async readAll() {
        const items = await getStorageLocalData(this.key)
        return normalizeWrappedSourcesForStorage(items[this.key])
    }

    /**
     * 把完整数组写回 storage.local。
     * 空数组直接删除 key，避免留下无效页面记录。
     * @param stores
     * @returns {Promise<Array>}
     */
    async writeAll(stores) {
        const safeStores = normalizeWrappedSourcesForStorage(stores)

        if (safeStores.length === 0) {
            await removeStorageLocalData(this.key)
            await syncHighlightIndexEntry(this.key, [])
            return []
        }

        await setStorageLocalData({[this.key]: safeStores})
        await syncHighlightIndexEntry(this.key, safeStores)
        return safeStores
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
     * 导入时按整页替换数据。
     * 这里仍然走页面级写入队列，避免和页面内正在进行的增删改互相覆盖。
     * @param wrappedSources
     * @returns {Promise<Array>}
     */
    async replaceAll(wrappedSources) {
        const currentStore = this
        const safeStores = normalizeWrappedSourcesForStorage(wrappedSources)

        return queueStorageWrite(this.key, async function () {
            return currentStore.writeAll(safeStores)
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
 * 把后台页里保存的 {hs} 数组还原成配置页和内容页更容易直接消费的 hs 数组。
 * 这层只做结构展开，不改动原始高亮字段。
 * @param stores
 * @returns {Array}
 */
function unwrapStoredHighlights(stores) {
    return normalizeWrappedSourcesForStorage(stores).map(function (store) {
        return store.hs
    })
}

/**
 * MV3 下执行脚本要改走 chrome.scripting.executeScript。
 * 这里统一封装一个“刷新某个 tab”的 helper，避免调用点继续散落旧 API。
 * @param tabId
 * @returns {Promise<void>}
 */
function reloadTabById(tabId) {
    return new Promise(function (resolve, reject) {
        if (!tabId) {
            resolve()
            return
        }

        chrome.scripting.executeScript({
            target: {tabId: tabId},
            func: function () {
                location.reload()
            }
        }, function () {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            resolve()
        })
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

            reloadTabById(tabs[0].id)
                .then(resolve)
                .catch(reject)
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
        case 'getPageIndex': {
            const indexMap = await ensureHighlightIndexMap()

            return {
                ok: true,
                items: Object.keys(indexMap).map(function (key) {
                    return indexMap[key]
                })
            }
        }
        case 'getPageHighlights': {
            const pageUrl = info.href || extractPageUrlFromStorageKey(info.key)

            if (!pageUrl) {
                return {ok: false, error: 'Missing getPageHighlights payload'}
            }

            const stores = await new HighlightPageStore(pageUrl).readAll()

            return {
                ok: true,
                highlights: unwrapStoredHighlights(stores)
            }
        }
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
        case 'importBackup':
            if (!info.highlights || typeof info.highlights !== 'object') {
                return {ok: false, error: 'Missing importBackup payload'}
            }

            /**
             * 老用户第一次导入时，本地可能还没有索引缓存。
             * 这里先确保索引存在，再按页替换导入数据，避免首次导入只把“本次导入页”写进索引。
             */
            await ensureHighlightIndexMap()

            const importKeys = Object.keys(info.highlights)
            const importedPageUrls = []

            for (let index = 0; index < importKeys.length; index++) {
                const storageKey = importKeys[index]
                const pageUrl = extractPageUrlFromStorageKey(storageKey)

                if (!pageUrl) {
                    continue
                }

                await new HighlightPageStore(pageUrl).replaceAll(info.highlights[storageKey])
                importedPageUrls.push(pageUrl)
            }

            const appliedPreferences = await applyImportedPreferences(info.preferences)

            if (appliedPreferences.settingChanged) {
                await reloadAllWebTabs()
            } else {
                await reloadTabsByPageUrls(importedPageUrls)
            }

            return {
                ok: true,
                importedPages: importedPageUrls.length
            }
        default:
            return {ok: false, error: 'Unknown popup action'}
    }
}

/**
 * MV3 service worker 会反复启动和销毁。
 * 菜单注册不能再依赖旧的 background page 常驻状态，所以这里单独做成可重复调用的初始化函数。
 */
function ensureContextMenu() {
    chrome.contextMenus.removeAll(function () {
        chrome.contextMenus.create({
            type: 'checkbox',
            id: CONTEXT_MENU_ID,
            title: 'disable',
            checked: false
        }, function () {
        })

        syncContextMenuCheckedState()
    })
}

/**
 * 根据 storage.sync 里的启用状态，同步菜单勾选态。
 * popup 切开关、浏览器重启、扩展更新后都走同一条收口逻辑。
 */
function syncContextMenuCheckedState() {
    chrome.storage.sync.get(['setting'], function (item) {
        if (!item.setting) {
            chrome.storage.sync.set({setting: {use: true}}, function () {
            })
            chrome.contextMenus.update(CONTEXT_MENU_ID, {checked: false}, function () {
            })
            return
        }

        chrome.contextMenus.update(CONTEXT_MENU_ID, {checked: !item.setting.use}, function () {
        })
    })
}

/**
 * 右键菜单点击后切换启用状态，并刷新当前 tab。
 * 旧版本把点击回调直接塞进 create options 里，service worker 下改成统一监听更稳妥。
 * @param info
 * @param tab
 */
function handleContextMenuClick(info, tab) {
    if (!info || info.menuItemId !== CONTEXT_MENU_ID) {
        return
    }

    chrome.storage.sync.set({setting: {use: !info.checked}}, function () {
        reloadTabById(tab && tab.id).catch(function () {
        })
    })
}

/**
 * 导入备份时同步写入少量 sync 设置。
 * 这里只处理语言和启用状态，不把其他临时 UI 状态带进 sync。
 * @param preferences
 * @returns {Promise<void>}
 */
async function applyImportedPreferences(preferences) {
    const nextPreferences = preferences || {}
    const currentPreferences = await getSyncPreferences()
    const nextSetting = nextPreferences.setting && typeof nextPreferences.setting.use === 'boolean'
        ? {use: nextPreferences.setting.use}
        : {use: true}
    const nextLanguage = nextPreferences.uiLanguage === 'en' ? 'en' : 'zh'

    return new Promise(function (resolve, reject) {
        chrome.storage.sync.set({
            setting: nextSetting,
            uiLanguage: nextLanguage
        }, function () {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            syncContextMenuCheckedState()
            resolve({
                previousUse: currentPreferences.setting.use,
                nextUse: nextSetting.use,
                settingChanged: currentPreferences.setting.use !== nextSetting.use,
                previousLanguage: currentPreferences.uiLanguage,
                nextLanguage: nextLanguage
            })
        })
    })
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
chrome.contextMenus.onClicked.addListener(handleContextMenuClick)
chrome.runtime.onInstalled.addListener(ensureContextMenu)
chrome.runtime.onStartup.addListener(ensureContextMenu)
