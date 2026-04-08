let configApp = null

/**
 * 配置页文案集中维护。
 * 这里保留中英文两套，默认语言固定回中文，只在 storage 里读到 en 时才切英文。
 */
const CONFIG_PAGE_TEXT = {
    zh: {
        pageTitle: '',
        libraryTitle: '列表',
        languageLabel: '界面语言',
        extensionStatusLabel: '扩展状态',
        searchPlaceholder: '搜索标题或域名',
        detailSearchPlaceholder: '搜索关键词',
        searchClearLabel: '清空搜索',
        detailSearchClearLabel: '清空详情搜索',
        sourceColumn: '来源',
        highlightMetaLabel: '高亮',
        noteMetaLabel: '备注',
        savedAtColumn: '保存时间',
        actionsColumn: '操作',
        readAction: '阅读',
        detailAction: '详情',
        deleteAction: '删除',
        exportAction: '导出',
        importAction: '导入',
        closeAction: '关闭',
        detailDialogTitle: '高亮详情',
        excerptColumn: '高亮内容',
        noteColumn: '备注',
        colorColumn: '颜色',
        noNoteText: '暂无备注',
        noteEditorPlaceholder: '双击后可直接编辑备注',
        emptyState: '还没有保存任何高亮，先去网页里划一段试试。',
        detailEmptyState: '这一页暂时没有可展示的高亮记录。',
        loadingText: '加载中...',
        copyConfirmBody: '要把当前内容复制到剪贴板吗？',
        copySuccess: '已复制到剪贴板',
        copyFailed: '复制失败',
        updateFailed: '备注保存失败',
        deleteFailed: '删除失败',
        exportFailed: '导出失败',
        importFailed: '导入失败',
        importInvalid: '导入文件格式不正确',
        importSuccess: '已导入 {pages} 个页面',
        exportSuccess: '已导出备份文件',
        pageSizeSuffix: '条/页',
        totalLabel: '共 {total} 条',
        pageJumpPrefix: '前往',
        pageJumpSuffix: '页'
    },
    en: {
        pageTitle: '',
        libraryTitle: 'List',
        languageLabel: 'Interface language',
        extensionStatusLabel: 'Extension status',
        searchPlaceholder: 'Search title or host',
        detailSearchPlaceholder: 'Search keywords',
        searchClearLabel: 'Clear search',
        detailSearchClearLabel: 'Clear detail search',
        sourceColumn: 'Source',
        highlightMetaLabel: 'Highlights',
        noteMetaLabel: 'Notes',
        savedAtColumn: 'Saved at',
        actionsColumn: 'Actions',
        readAction: 'Read',
        detailAction: 'Details',
        deleteAction: 'Delete',
        exportAction: 'Export',
        importAction: 'Import',
        closeAction: 'Close',
        detailDialogTitle: 'Highlight Details',
        excerptColumn: 'Excerpt',
        noteColumn: 'Note',
        colorColumn: 'Color',
        noNoteText: 'No note yet',
        noteEditorPlaceholder: 'Double-click to edit the note',
        emptyState: 'No highlights saved yet. Create one on a page first.',
        detailEmptyState: 'There are no highlights to show for this page yet.',
        loadingText: 'Loading...',
        copyConfirmBody: 'Copy the selected content to the clipboard?',
        copySuccess: 'Copied to clipboard',
        copyFailed: 'Copy failed',
        updateFailed: 'Failed to save note',
        deleteFailed: 'Delete failed',
        exportFailed: 'Export failed',
        importFailed: 'Import failed',
        importInvalid: 'Invalid backup file',
        importSuccess: 'Imported {pages} pages',
        exportSuccess: 'Backup exported',
        pageSizeSuffix: '/ page',
        totalLabel: 'Total {total}',
        pageJumpPrefix: 'Go to',
        pageJumpSuffix: ''
    }
}

/**
 * 详情页颜色列现在只显示色块。
 * 颜色值集中在这里，页面其余位置统一从这个表里取值。
 */
const HIGHLIGHT_COLOR_META = {
    yellow: '#f8d66d',
    green: '#bee7a5',
    pink: '#f6a6c1',
    blue: '#9eddf8',
    orange: '#fdba74',
    purple: '#c4b5fd',
    mint: '#99f6e4',
    pearl: '#e2e8f0'
}

/**
 * 读取扩展自己的 storage.local。
 * 配置页只负责展示和发消息，不在这里直接做落盘写队列。
 * @returns {Promise<Object>}
 */
function getAllStorageData() {
    return new Promise(function (resolve, reject) {
        chrome.storage.local.get(null, function (list) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            resolve(list || {})
        })
    })
}

/**
 * 配置页的所有删除、更新动作都交给后台页。
 * 后台页负责统一落盘和同步给内容页，配置页只发消息即可。
 * @param payload
 * @returns {Promise<*>}
 */
function sendBackgroundMessage(payload) {
    return new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage(payload, function (response) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            if (response && response.ok === false) {
                reject(new Error(response.error || 'Unknown runtime error'))
                return
            }

            resolve(response)
        })
    })
}

/**
 * 导出时需要把 sync 里的少量用户设置也一起带上。
 * 高亮主体仍然来自 local，界面语言和启用状态来自 sync。
 * @param {string[]} keys
 * @returns {Promise<Object>}
 */
function getSyncStorageData(keys) {
    return new Promise(function (resolve, reject) {
        chrome.storage.sync.get(keys, function (items) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
                return
            }

            resolve(items || {})
        })
    })
}

/**
 * 把 html lang 和 document.title 一起同步。
 * 这样浏览器标签标题和无障碍语言信息都能与当前语言保持一致。
 * @param language
 */
function updateDocumentMeta(language) {
    const text = CONFIG_PAGE_TEXT[language] || CONFIG_PAGE_TEXT.zh

    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
    document.title = text.pageTitle ? 'Cross Words Highlight - ' + text.pageTitle : 'Cross Words Highlight'
}

/**
 * 这个页面同时被当成 popup 和 options_page 使用。
 * popup 不是独立 tab，所以 tabs.getCurrent 会拿不到对象。
 * 这里用它来区分两种打开方式，避免继续依赖旧的 extension.getViews。
 * @returns {Promise<string>}
 */
function detectPageMode() {
    return new Promise(function (resolve) {
        /**
         * popup 场景下 extension.getViews 能直接拿到当前弹窗窗口。
         * 这个判断最稳定，优先走它。
         */
        try {
            if (chrome.extension && typeof chrome.extension.getViews === 'function') {
                const popupViews = chrome.extension.getViews({type: 'popup'}) || []

                for (let index = 0; index < popupViews.length; index++) {
                    if (popupViews[index] === window) {
                        resolve('popup')
                        return
                    }
                }
            }
        } catch (error) {
        }

        if (!chrome.tabs || typeof chrome.tabs.getCurrent !== 'function') {
            resolve(window.innerWidth <= 820 && window.innerHeight <= 620 ? 'popup' : 'page')
            return
        }

        chrome.tabs.getCurrent(function (tab) {
            if (chrome.runtime.lastError) {
                resolve(window.innerWidth <= 820 && window.innerHeight <= 620 ? 'popup' : 'page')
                return
            }

            if (!tab) {
                resolve('popup')
                return
            }

            resolve(window.innerWidth <= 820 && window.innerHeight <= 620 ? 'popup' : 'page')
        })
    })
}

/**
 * 给 html 和 body 打上页面模式类名。
 * 样式层会根据 popup/page 两种模式分别控制尺寸和底部控制条位置。
 * @param pageMode
 */
function applyPageMode(pageMode) {
    const normalizedPageMode = pageMode === 'popup' ? 'popup' : 'page'

    document.documentElement.classList.remove('page-popup', 'page-options')
    document.body.classList.remove('page-popup', 'page-options')

    if (normalizedPageMode === 'popup') {
        document.documentElement.classList.add('page-popup')
        document.body.classList.add('page-popup')
        return
    }

    document.documentElement.classList.add('page-options')
    document.body.classList.add('page-options')
}

/**
 * 优先使用现代剪贴板 API。
 * 老环境保留 execCommand 兜底。
 * @param text
 * @returns {Promise<void>}
 */
async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        return
    }

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.setAttribute('value', text)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
}

/**
 * 把用户内容转成安全的 HTML 文本。
 * 主列表标题、详情正文、备注都需要先做转义，避免把页面数据直接插进 DOM。
 * @param value
 * @returns {string}
 */
function escapeHtml(value) {
    /**
     * 这里只把 null / undefined 视为空。
     * 数值 0、布尔 false 这类合法内容必须保留下来，
     * 否则“备注 0”“高亮 0”这类计数会在渲染时被错误吃掉。
     */
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * 属性值同样走文本转义。
 * 这里单独保留一个函数，方便阅读时明确“这是给属性用的”。
 * @param value
 * @returns {string}
 */
function escapeAttribute(value) {
    return escapeHtml(value)
}

/**
 * 主列表优先读取后台维护好的页面摘要索引。
 * 这样 popup 打开时不用再把所有高亮详情都扫一遍。
 * @returns {Promise<Array>}
 */
async function getData() {
    const response = await sendBackgroundMessage({
        from: 'pop_js',
        action: 'getPageIndex',
        data: {}
    })

    if (!response || !Array.isArray(response.items)) {
        return []
    }

    return response.items
}

/**
 * 详情弹窗按需读取单页完整高亮数组。
 * 主列表只保留摘要字段，正文和恢复元数据都在这里再取。
 * @param key
 * @param href
 * @returns {Promise<Array>}
 */
async function getPageHighlights(key, href) {
    const response = await sendBackgroundMessage({
        from: 'pop_js',
        action: 'getPageHighlights',
        data: {
            key: key,
            href: href
        }
    })

    if (!response || !Array.isArray(response.highlights)) {
        return []
    }

    return response.highlights
}

/**
 * 这个页面的数据量不大，排序值直接复用时间字符串即可。
 * 现有时间格式是 YYYY-MM-DD HH:mm:ss，按字符串比较就能得到正确顺序。
 * @param value
 * @returns {string}
 */
function getSortableDateValue(value) {
    return String(value == null ? '' : value)
}

/**
 * 配置页原生化后的页面控制器。
 * 所有状态、渲染和交互都集中在这个类里，避免再散落到模板和第三方组件里。
 */
class ConfigPageApp {
    constructor(root) {
        this.root = root
        this.state = {
            tableDataOri: [],
            tableData: [],
            gridData: [],
            tableDataLength: 0,
            currentPage: 1,
            pageSize: 10,
            search: '',
            detailSearch: '',
            sortColumn: 'readDate',
            sortOrder: 'descending',
            loading: true,
            pageMode: 'page',
            uiLanguage: 'zh',
            extensionSettings: {use: true},
            dialogTableVisible: false,
            activeDetailTitle: '',
            activeDetailHref: '',
            detailLoading: false,
            editingCommentId: '',
            editingCommentDraft: '',
            savingCommentId: '',
            refreshToken: 0
        }

        this.nodes = this.collectNodes()
        this.bindStaticEvents()
    }

    /**
     * 收集页面里会反复用到的节点。
     * 统一放这里，渲染逻辑里直接读 this.nodes，便于后续维护。
     * @returns {Object}
     */
    collectNodes() {
        return {
            topbar: document.getElementById('config-topbar'),
            pageTitleWrap: document.getElementById('page-title-wrap'),
            pageTitle: document.getElementById('page-title'),
            libraryTitle: document.getElementById('library-title'),
            searchInput: document.getElementById('search-input'),
            searchClear: document.getElementById('search-clear'),
            sourceHeader: document.getElementById('source-header'),
            savedAtSortButton: document.getElementById('saved-at-sort'),
            savedAtLabel: document.getElementById('saved-at-label'),
            savedAtSortIndicator: document.getElementById('saved-at-sort-indicator'),
            actionsHeader: document.getElementById('actions-header'),
            tableFrame: document.getElementById('table-frame'),
            tableBody: document.getElementById('table-body'),
            tableEmpty: document.getElementById('table-empty'),
            panelFooter: document.getElementById('panel-footer'),
            inlineDock: document.getElementById('inline-dock'),
            pageDock: document.getElementById('page-dock'),
            paginationGroup: document.getElementById('pagination-group'),
            paginationTotal: document.getElementById('pagination-total'),
            pageSizeSelect: document.getElementById('page-size-select'),
            prevPageButton: document.getElementById('prev-page-button'),
            nextPageButton: document.getElementById('next-page-button'),
            pageNumberList: document.getElementById('page-number-list'),
            paginationJumperForm: document.getElementById('pagination-jumper-form'),
            paginationJumperPrefix: document.getElementById('pagination-jumper-prefix'),
            paginationJumperInput: document.getElementById('pagination-jumper-input'),
            paginationJumperSuffix: document.getElementById('pagination-jumper-suffix'),
            headerTransferControl: document.getElementById('header-transfer-control'),
            languageButtons: Array.from(document.querySelectorAll('[data-language]')),
            exportButtons: Array.from(document.querySelectorAll('[data-role="export-button"]')),
            importButtons: Array.from(document.querySelectorAll('[data-role="import-button"]')),
            switchInputs: Array.from(document.querySelectorAll('[data-role=\"extension-switch\"]')),
            switchDots: Array.from(document.querySelectorAll('.dock-status-dot')),
            inlineLanguageControl: document.getElementById('inline-language-control'),
            inlineSwitchControl: document.getElementById('inline-switch-control'),
            pageLanguageControl: document.getElementById('page-language-control'),
            pageSwitchControl: document.getElementById('page-switch-control'),
            importFileInput: document.getElementById('import-file-input'),
            detailModal: document.getElementById('detail-modal'),
            detailTitle: document.getElementById('detail-dialog-title'),
            detailLink: document.getElementById('detail-dialog-link'),
            detailSearchInput: document.getElementById('detail-search-input'),
            detailSearchClear: document.getElementById('detail-search-clear'),
            detailExcerptHeader: document.getElementById('detail-excerpt-header'),
            detailNoteHeader: document.getElementById('detail-note-header'),
            detailColorHeader: document.getElementById('detail-color-header'),
            detailActionsHeader: document.getElementById('detail-actions-header'),
            detailTableFrame: document.getElementById('detail-table-frame'),
            detailTableBody: document.getElementById('detail-table-body'),
            detailEmpty: document.getElementById('detail-empty'),
            detailCloseIcon: document.getElementById('detail-close-icon'),
            detailCloseButton: document.getElementById('detail-close-button'),
            toastStack: document.getElementById('toast-stack')
        }
    }

    /**
     * 初始化页面。
     * 这里先判断 popup/page，再读取设置和数据，最后统一渲染。
     * @returns {Promise<void>}
     */
    async init() {
        this.state.pageMode = await detectPageMode()

        /**
         * popup 的空间更小，默认页大小要直接压到 5。
         * 这样能稳定把分页和底部控制条一起露出来。
         */
        if (this.state.pageMode === 'popup') {
            this.state.pageSize = 5
        }

        applyPageMode(this.state.pageMode)
        await this.loadSettings()
        await this.refreshData()
    }

    /**
     * 读取扩展启用状态和界面语言。
     * 默认语言固定为中文，只认 en 这一种英文值。
     * @returns {Promise<void>}
     */
    loadSettings() {
        const app = this

        return new Promise(function (resolve) {
            chrome.storage.sync.get(['setting', 'uiLanguage'], function (item) {
                const setting = item && item.setting

                app.state.extensionSettings = setting && typeof setting.use === 'boolean'
                    ? {use: setting.use}
                    : {use: true}
                app.state.uiLanguage = item && item.uiLanguage === 'en' ? 'en' : 'zh'

                updateDocumentMeta(app.state.uiLanguage)
                app.render()
                resolve()
            })
        })
    }

    /**
     * 当前语言对应的文案对象。
     * 页面其余位置都从这里取值，避免多处手写语言判断。
     * @returns {Object}
     */
    getUiText() {
        return CONFIG_PAGE_TEXT[this.state.uiLanguage] || CONFIG_PAGE_TEXT.zh
    }

    /**
     * 刷新 storage.local 里的页面数据。
     * 内容页新增/删除高亮、配置页删除页面后都走这条刷新链。
     * @param {{preserveDetail?: boolean}=} options
     * @returns {Promise<void>}
     */
    async refreshData(options) {
        const refreshOptions = options || {}
        const refreshToken = ++this.state.refreshToken
        const preserveDetail = !!refreshOptions.preserveDetail && this.state.dialogTableVisible
        const preservedDetailHref = preserveDetail ? this.state.activeDetailHref : ''
        const preservedDetailSearch = preserveDetail ? this.state.detailSearch : ''

        this.state.loading = true
        this.renderMainTable()

        try {
            const tableData = await getData()

            if (refreshToken !== this.state.refreshToken) {
                return
            }

            this.state.tableDataOri = tableData.sort((a, b) => {
                const leftValue = getSortableDateValue(a.readDate)
                const rightValue = getSortableDateValue(b.readDate)

                if (leftValue === rightValue) {
                    return 0
                }

                return leftValue > rightValue ? -1 : 1
            })

            this.handleTableData()

            if (preserveDetail && preservedDetailHref) {
                const matchedRow = this.state.tableDataOri.find(function (row) {
                    return row.href === preservedDetailHref
                })

                if (matchedRow) {
                    this.state.activeDetailHref = matchedRow.href
                    this.state.activeDetailTitle = matchedRow.title || this.getReadableHost(matchedRow.href)
                    this.state.detailLoading = true
                    await this.loadDetailHighlights(matchedRow)
                    this.state.detailSearch = preservedDetailSearch
                } else {
                    this.resetDetailState(false)
                }
            }
        } finally {
            if (refreshToken === this.state.refreshToken) {
                this.state.loading = false
            }

            this.render()
        }
    }

    /**
     * 主表只在内存里做过滤、排序和分页。
     * 这样交互不会重复读 storage，也避免 popup 打开时一边输入一边频繁 IO。
     */
    handleTableData() {
        let temp = this.state.tableDataOri.slice()

        if (this.state.search) {
            const keyword = this.state.search.toLowerCase()

            temp = temp.filter(function (row) {
                const title = String(row.title || '').toLowerCase()
                const href = String(row.href || '').toLowerCase()

                return title.includes(keyword) || href.includes(keyword)
            })
        }

        temp.sort((a, b) => {
            const leftValue = getSortableDateValue(a[this.state.sortColumn])
            const rightValue = getSortableDateValue(b[this.state.sortColumn])

            if (leftValue === rightValue) {
                return 0
            }

            if (this.state.sortOrder === 'ascending') {
                return leftValue < rightValue ? -1 : 1
            }

            return leftValue > rightValue ? -1 : 1
        })

        this.state.tableDataLength = temp.length

        const totalPage = this.getTotalPageCount(temp.length)

        if (this.state.currentPage > totalPage) {
            this.state.currentPage = totalPage
        }

        if (this.state.currentPage < 1) {
            this.state.currentPage = 1
        }

        this.state.tableData = temp.slice(
            (this.state.currentPage - 1) * this.state.pageSize,
            this.state.currentPage * this.state.pageSize
        )
    }

    /**
     * 当前页总页数。
     * 空数据时仍然返回 1，避免分页和跳页逻辑出现 0 页状态。
     * @param {number=} total
     * @returns {number}
     */
    getTotalPageCount(total) {
        const totalCount = typeof total === 'number' ? total : this.state.tableDataLength

        return Math.max(1, Math.ceil(totalCount / this.state.pageSize))
    }

    /**
     * popup 始终展示底部行。
     * 因为 popup 的语言切换和开关都放在这行里，不能跟着分页一起消失。
     * @returns {boolean}
     */
    shouldShowBottomBar() {
        if (this.state.pageMode === 'popup') {
            return true
        }

        return this.shouldShowPaginationFooter()
    }

    /**
     * popup 只要列表有数据就显示分页区。
     * 独立配置页仍然保持“超出一页才显示”。
     * @returns {boolean}
     */
    shouldShowPaginationFooter() {
        if (this.state.tableDataLength === 0) {
            return false
        }

        if (this.state.pageMode === 'popup') {
            return true
        }

        return this.state.tableDataLength > this.state.pageSize
    }

    /**
     * 页大小选项在 popup 和 options 页分别控制。
     * popup 先保证可视区域够用，独立页再给更大的档位。
     * @returns {number[]}
     */
    getPaginationPageSizes() {
        if (this.state.pageMode === 'popup') {
            return [5, 10, 20, 40]
        }

        return [10, 20, 40, 80]
    }

    /**
     * 按页面内的 top/left 位置排序高亮。
     * 详情弹窗沿用这个顺序，方便用户从上往下核对页面内容。
     * @param {Array} highlights
     * @returns {Array}
     */
    sortHighlights(highlights) {
        return highlights.sort(function (a, b) {
            if (a.position.top !== b.position.top) {
                return a.position.top < b.position.top ? -1 : 1
            }

            if (a.position.left !== b.position.left) {
                return a.position.left < b.position.left ? -1 : 1
            }

            return 0
        })
    }

    /**
     * 主渲染入口。
     * 每次状态变化后统一从这里收口，保持 UI 更新顺序稳定。
     */
    render() {
        updateDocumentMeta(this.state.uiLanguage)
        this.renderStaticText()
        this.renderMainTable()
        this.renderFooter()
        this.renderDockControls()
        this.renderDetailDialog()
    }

    /**
     * 顶部标题、表头、输入框 placeholder 等静态文案一起刷新。
     */
    renderStaticText() {
        const uiText = this.getUiText()

        this.nodes.pageTitleWrap.hidden = !uiText.pageTitle
        this.nodes.pageTitle.textContent = uiText.pageTitle
        this.nodes.topbar.classList.toggle('is-compact', !uiText.pageTitle)

        this.nodes.libraryTitle.textContent = uiText.libraryTitle
        this.nodes.searchInput.placeholder = uiText.searchPlaceholder
        this.nodes.searchClear.setAttribute('aria-label', uiText.searchClearLabel)
        this.nodes.searchClear.title = uiText.searchClearLabel
        this.nodes.detailSearchInput.placeholder = uiText.detailSearchPlaceholder
        this.nodes.detailSearchClear.setAttribute('aria-label', uiText.detailSearchClearLabel)
        this.nodes.detailSearchClear.title = uiText.detailSearchClearLabel
        this.nodes.sourceHeader.textContent = uiText.sourceColumn
        this.nodes.savedAtLabel.textContent = uiText.savedAtColumn
        this.nodes.actionsHeader.textContent = uiText.actionsColumn
        this.nodes.exportButtons.forEach(function (button) {
            button.textContent = uiText.exportAction
            button.title = uiText.exportAction
        })
        this.nodes.importButtons.forEach(function (button) {
            button.textContent = uiText.importAction
            button.title = uiText.importAction
        })
        this.nodes.detailExcerptHeader.textContent = uiText.excerptColumn
        this.nodes.detailNoteHeader.textContent = uiText.noteColumn
        this.nodes.detailColorHeader.textContent = uiText.colorColumn
        this.nodes.detailActionsHeader.textContent = uiText.actionsColumn
        this.nodes.detailCloseButton.textContent = uiText.closeAction
        this.nodes.detailCloseIcon.setAttribute('aria-label', uiText.closeAction)
        this.nodes.headerTransferControl.title = uiText.exportAction + ' / ' + uiText.importAction

        this.nodes.savedAtSortButton.classList.toggle('is-ascending', this.state.sortOrder === 'ascending')
        this.nodes.savedAtSortButton.classList.toggle('is-descending', this.state.sortOrder === 'descending')
    }

    /**
     * 主列表渲染。
     * 表格数据、空状态和 loading 状态都在这里统一处理。
     */
    renderMainTable() {
        const uiText = this.getUiText()
        const isLoading = this.state.loading
        const isEmpty = !isLoading && this.state.tableData.length === 0

        this.nodes.searchInput.value = this.state.search
        this.toggleClearButton(this.nodes.searchInput, this.nodes.searchClear)

        if (isLoading) {
            this.nodes.tableBody.innerHTML = ''
            this.nodes.tableEmpty.textContent = uiText.loadingText
        } else if (isEmpty) {
            this.nodes.tableBody.innerHTML = ''
            this.nodes.tableEmpty.textContent = uiText.emptyState
        } else {
            this.nodes.tableBody.innerHTML = this.state.tableData.map((row, index) => {
                return this.buildMainTableRow(row, index)
            }).join('')
        }

        this.nodes.tableFrame.classList.toggle('is-loading', isLoading)
        this.nodes.tableFrame.classList.toggle('is-empty', isLoading || isEmpty)

        if (!isLoading && !isEmpty) {
            this.syncAvatarImages(this.nodes.tableBody)
        }
    }

    /**
     * 单行页面记录的 HTML。
     * 主列表字段不再单独展示“高亮/备注”列，而是并到来源下面的灰色小字里。
     * @param row
     * @param index
     * @returns {string}
     */
    buildMainTableRow(row, index) {
        const uiText = this.getUiText()
        const title = row.title || this.getReadableHost(row.href)
        const host = this.getReadableHost(row.href)
        const hostInitial = this.getHostInitial(row.href)
        const safeHref = escapeAttribute(row.href)
        const safeKey = escapeAttribute(row.key)
        const safeTitle = escapeHtml(title)
        const safeHost = escapeHtml(host)
        const safeIcon = row.icon ? escapeAttribute(row.icon) : ''

        return '' +
            '<tr data-href="' + safeHref + '" data-key="' + safeKey + '" data-row-index="' + index + '">' +
            '    <td class="col-source">' +
            '        <div class="source-cell">' +
            '            <span class="source-avatar" data-fallback="' + escapeAttribute(hostInitial) + '">' +
            (safeIcon ? '                <img class="source-avatar-image" data-src="' + safeIcon + '" alt="">' : '') +
            '                <span class="source-avatar-fallback">' + escapeHtml(hostInitial) + '</span>' +
            '            </span>' +
            '            <div class="source-copy">' +
            '                <div class="source-title" title="' + safeTitle + '">' + safeTitle + '</div>' +
            '                <div class="source-meta-line">' +
            '                    <span class="source-host">' + safeHost + '</span>' +
            '                    <span class="source-meta-group">' +
            '                        <span class="source-meta-chip">' + escapeHtml(uiText.highlightMetaLabel) + ' ' + escapeHtml(row.nums) + '</span>' +
            '                        <span class="source-meta-chip">' + escapeHtml(uiText.noteMetaLabel) + ' ' + escapeHtml(row.commentNums) + '</span>' +
            '                    </span>' +
            '                </div>' +
            '            </div>' +
            '        </div>' +
            '    </td>' +
            '    <td class="col-readdate">' +
            '        <span class="timestamp-text">' + escapeHtml(this.formatReadDate(row.readDate)) + '</span>' +
            '    </td>' +
            '    <td class="col-actions">' +
            '        <div class="action-group">' +
            '            <button type="button" class="action-button" data-action="open-url" data-href="' + safeHref + '">' + escapeHtml(uiText.readAction) + '</button>' +
            '            <button type="button" class="action-button" data-action="open-detail" data-row-index="' + index + '">' + escapeHtml(uiText.detailAction) + '</button>' +
            '            <button type="button" class="action-button is-danger" data-action="delete-page" data-row-index="' + index + '">' + escapeHtml(uiText.deleteAction) + '</button>' +
            '        </div>' +
            '    </td>' +
            '</tr>'
    }

    /**
     * 底部分页和 popup 内联控制条一起渲染。
     * popup 下无论是否有分页，都保留控制条；独立页继续用固定左下角控制条。
     */
    renderFooter() {
        const uiText = this.getUiText()
        const shouldShowBottomBar = this.shouldShowBottomBar()
        const shouldShowPaginationFooter = this.shouldShowPaginationFooter()
        const pageCount = this.getTotalPageCount()
        const pageSizes = this.getPaginationPageSizes()

        this.nodes.panelFooter.hidden = !shouldShowBottomBar
        this.nodes.inlineDock.hidden = this.state.pageMode !== 'popup'
        this.nodes.pageDock.hidden = this.state.pageMode === 'popup'
        this.nodes.paginationGroup.hidden = !shouldShowPaginationFooter

        if (!shouldShowPaginationFooter) {
            return
        }

        this.nodes.paginationTotal.textContent = uiText.totalLabel.replace('{total}', String(this.state.tableDataLength))
        this.nodes.paginationJumperPrefix.textContent = uiText.pageJumpPrefix
        this.nodes.paginationJumperSuffix.textContent = uiText.pageJumpSuffix
        this.nodes.paginationJumperForm.hidden = this.state.pageMode === 'popup'
        this.nodes.paginationJumperInput.value = ''
        this.nodes.prevPageButton.disabled = this.state.currentPage <= 1
        this.nodes.nextPageButton.disabled = this.state.currentPage >= pageCount

        this.nodes.pageSizeSelect.innerHTML = pageSizes.map(function (pageSize) {
            return '<option value="' + pageSize + '">' + pageSize + uiText.pageSizeSuffix + '</option>'
        }).join('')
        this.nodes.pageSizeSelect.value = String(this.state.pageSize)
        this.nodes.pageNumberList.innerHTML = this.buildPaginationButtons(pageCount)
    }

    /**
     * 左下角语言切换和扩展开关统一同步状态。
     * popup 底部内联控制条和 options 页固定控制条都会一起刷新。
     */
    renderDockControls() {
        const uiText = this.getUiText()
        const isUsingExtension = !!this.state.extensionSettings.use

        this.nodes.languageButtons.forEach((button) => {
            button.classList.toggle('is-active', button.dataset.language === this.state.uiLanguage)
        })

        this.nodes.switchInputs.forEach((input) => {
            input.checked = isUsingExtension
        })

        this.nodes.switchDots.forEach((dot) => {
            dot.classList.toggle('is-active', isUsingExtension)
        })

        this.nodes.inlineLanguageControl.title = uiText.languageLabel
        this.nodes.pageLanguageControl.title = uiText.languageLabel
        this.nodes.inlineSwitchControl.title = uiText.extensionStatusLabel
        this.nodes.pageSwitchControl.title = uiText.extensionStatusLabel
    }

    /**
     * 详情弹窗渲染。
     * 弹窗里的搜索、表格和内联备注编辑都在这一层收口。
     */
    renderDetailDialog() {
        const uiText = this.getUiText()
        const filteredGridData = this.getFilteredGridData()

        this.nodes.detailModal.hidden = !this.state.dialogTableVisible
        document.body.classList.toggle('modal-open', this.state.dialogTableVisible)

        if (!this.state.dialogTableVisible) {
            return
        }

        this.nodes.detailTitle.textContent = this.state.activeDetailTitle || uiText.detailDialogTitle
        this.nodes.detailLink.textContent = this.state.activeDetailHref
        this.nodes.detailLink.title = this.state.activeDetailHref
        this.nodes.detailSearchInput.value = this.state.detailSearch
        this.toggleClearButton(this.nodes.detailSearchInput, this.nodes.detailSearchClear)

        if (this.state.detailLoading) {
            this.nodes.detailTableBody.innerHTML = ''
            this.nodes.detailEmpty.textContent = uiText.loadingText
            this.nodes.detailTableFrame.classList.add('is-empty')
            return
        }

        if (filteredGridData.length === 0) {
            this.nodes.detailTableBody.innerHTML = ''
            this.nodes.detailEmpty.textContent = uiText.detailEmptyState
            this.nodes.detailTableFrame.classList.add('is-empty')
            return
        }

        this.nodes.detailTableFrame.classList.remove('is-empty')
        this.nodes.detailTableBody.innerHTML = filteredGridData.map((row) => {
            return this.buildDetailTableRow(row)
        }).join('')

        this.bindDetailEditor()
    }

    /**
     * 单条高亮详情的 HTML。
     * 非编辑态下正文和备注都限制成两行，避免把整行高度撑爆。
     * @param row
     * @returns {string}
     */
    buildDetailTableRow(row) {
        const uiText = this.getUiText()
        const isEditing = this.state.editingCommentId === row.id
        const isSaving = this.state.savingCommentId === row.id
        const noteText = row.comment || uiText.noNoteText
        const safeId = escapeAttribute(row.id)
        const safeText = escapeHtml(row.text)
        const safeNote = escapeHtml(noteText)
        const safeDraft = escapeHtml(this.state.editingCommentId === row.id ? this.state.editingCommentDraft : row.comment || '')
        const highlightColor = escapeAttribute(this.getHighlightColorHex(row.color))
        const excerptTitle = escapeAttribute(row.text)
        const noteTitle = escapeAttribute(noteText)

        return '' +
            '<tr data-highlight-id="' + safeId + '">' +
            '    <td class="detail-col-excerpt">' +
            '        <button type="button" class="detail-excerpt" data-action="copy-excerpt" data-id="' + safeId + '" title="' + excerptTitle + '">' +
            '            <span class="detail-text-clamp">' + safeText + '</span>' +
            '        </button>' +
            '    </td>' +
            '    <td class="detail-col-note">' +
            '        <div class="detail-comment-cell" data-role="detail-comment-cell" data-id="' + safeId + '">' +
            (isEditing
                ? '            <textarea class="detail-comment-editor-textarea" data-id="' + safeId + '" placeholder="' + escapeAttribute(uiText.noteEditorPlaceholder) + '"' + (isSaving ? ' disabled' : '') + '>' + safeDraft + '</textarea>'
                : '            <span class="detail-comment-view' + (!row.comment ? ' is-empty' : '') + '" title="' + noteTitle + '">' + safeNote + '</span>') +
            '        </div>' +
            '    </td>' +
            '    <td class="detail-col-color">' +
            '        <span class="detail-color-chip"><span class="detail-color-dot" style="background:' + highlightColor + ';"></span></span>' +
            '    </td>' +
            '    <td class="detail-col-actions">' +
            '        <button type="button" class="action-button is-danger" data-action="delete-detail" data-id="' + safeId + '">' + escapeHtml(uiText.deleteAction) + '</button>' +
            '    </td>' +
            '</tr>'
    }

    /**
     * popup 里把时间压成短格式，给操作列让空间。
     * 独立页保留完整时间，避免信息损失。
     * @param readDate
     * @returns {string}
     */
    formatReadDate(readDate) {
        if (!readDate) {
            return ''
        }

        if (this.state.pageMode !== 'popup') {
            return readDate
        }

        return String(readDate).replace(/^\d{4}-/, '').slice(0, 11)
    }

    /**
     * 当前详情弹窗的数据过滤结果。
     * 搜索同时匹配正文和备注。
     * @returns {Array}
     */
    getFilteredGridData() {
        if (!this.state.detailSearch) {
            return this.state.gridData
        }

        const keyword = this.state.detailSearch.toLowerCase()

        return this.state.gridData.filter(function (row) {
            return String(row.text || '').toLowerCase().includes(keyword) ||
                String(row.comment || '').toLowerCase().includes(keyword)
        })
    }

    /**
     * 绑定页面上只需要注册一次的事件。
     * 输入、按钮点击、分页和详情弹窗交互都集中在这里。
     */
    bindStaticEvents() {
        this.nodes.searchInput.addEventListener('input', () => {
            this.state.search = this.nodes.searchInput.value
            this.state.currentPage = 1
            this.handleTableData()
            this.render()
        })

        this.nodes.searchClear.addEventListener('click', () => {
            this.state.search = ''
            this.nodes.searchInput.value = ''
            this.state.currentPage = 1
            this.handleTableData()
            this.render()
            this.nodes.searchInput.focus()
        })

        this.nodes.detailSearchInput.addEventListener('input', () => {
            this.state.detailSearch = this.nodes.detailSearchInput.value
            this.renderDetailDialog()
        })

        this.nodes.detailSearchClear.addEventListener('click', () => {
            this.state.detailSearch = ''
            this.nodes.detailSearchInput.value = ''
            this.renderDetailDialog()
            this.nodes.detailSearchInput.focus()
        })

        this.nodes.savedAtSortButton.addEventListener('click', () => {
            this.state.sortOrder = this.state.sortOrder === 'descending' ? 'ascending' : 'descending'
            this.state.currentPage = 1
            this.handleTableData()
            this.render()
        })

        this.nodes.pageSizeSelect.addEventListener('change', () => {
            const nextPageSize = Number(this.nodes.pageSizeSelect.value)

            if (!nextPageSize) {
                return
            }

            this.state.pageSize = nextPageSize
            this.state.currentPage = 1
            this.handleTableData()
            this.render()
        })

        this.nodes.prevPageButton.addEventListener('click', () => {
            if (this.state.currentPage <= 1) {
                return
            }

            this.state.currentPage--
            this.handleTableData()
            this.render()
        })

        this.nodes.nextPageButton.addEventListener('click', () => {
            const totalPage = this.getTotalPageCount()

            if (this.state.currentPage >= totalPage) {
                return
            }

            this.state.currentPage++
            this.handleTableData()
            this.render()
        })

        this.nodes.pageNumberList.addEventListener('click', (event) => {
            const pageButton = event.target.closest('[data-page]')

            if (!pageButton) {
                return
            }

            const nextPage = Number(pageButton.dataset.page)

            if (!nextPage || nextPage === this.state.currentPage) {
                return
            }

            this.state.currentPage = nextPage
            this.handleTableData()
            this.render()
        })

        this.nodes.paginationJumperForm.addEventListener('submit', (event) => {
            event.preventDefault()

            const nextPage = Number(this.nodes.paginationJumperInput.value)
            const totalPage = this.getTotalPageCount()

            if (!nextPage) {
                return
            }

            this.state.currentPage = Math.max(1, Math.min(totalPage, nextPage))
            this.handleTableData()
            this.render()
        })

        this.nodes.languageButtons.forEach((button) => {
            button.addEventListener('click', () => {
                this.changeLanguage(button.dataset.language)
            })
        })

        this.nodes.exportButtons.forEach((button) => {
            button.addEventListener('click', () => {
                this.exportBackup()
            })
        })

        this.nodes.importButtons.forEach((button) => {
            button.addEventListener('click', () => {
                this.nodes.importFileInput.click()
            })
        })

        this.nodes.importFileInput.addEventListener('change', () => {
            this.importBackupFromInput()
        })

        this.nodes.switchInputs.forEach((input) => {
            input.addEventListener('change', () => {
                this.statusChange(input.checked)
            })
        })

        this.nodes.tableBody.addEventListener('click', (event) => {
            const actionButton = event.target.closest('[data-action]')

            if (!actionButton) {
                return
            }

            const action = actionButton.dataset.action
            const href = actionButton.dataset.href

            if (action === 'open-url' && href) {
                this.openUrl(href)
                return
            }

            const rowIndex = Number(actionButton.dataset.rowIndex)

            if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= this.state.tableData.length) {
                return
            }

            const row = this.state.tableData[rowIndex]

            if (action === 'open-detail') {
                this.openDetail(row)
                return
            }

            if (action === 'delete-page') {
                this.deletePage(row)
            }
        })

        this.nodes.detailTableBody.addEventListener('click', (event) => {
            const actionButton = event.target.closest('[data-action]')

            if (!actionButton) {
                return
            }

            const action = actionButton.dataset.action
            const highlightId = actionButton.dataset.id
            const row = this.getDetailRowById(highlightId)

            if (!row) {
                return
            }

            if (action === 'copy-excerpt') {
                this.copyExcerpt(row.text)
                return
            }

            if (action === 'delete-detail') {
                this.deleteDetail(row)
            }
        })

        this.nodes.detailTableBody.addEventListener('dblclick', (event) => {
            const commentCell = event.target.closest('[data-role="detail-comment-cell"]')

            if (!commentCell) {
                return
            }

            this.startCommentEdit(commentCell.dataset.id)
        })

        this.nodes.detailModal.addEventListener('click', (event) => {
            if (event.target === this.nodes.detailModal) {
                this.closeDetail()
            }
        })

        this.nodes.detailCloseIcon.addEventListener('click', () => {
            this.closeDetail()
        })

        this.nodes.detailCloseButton.addEventListener('click', () => {
            this.closeDetail()
        })

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (this.state.editingCommentId) {
                    this.cancelCommentEdit()
                    return
                }

                if (this.state.dialogTableVisible) {
                    this.closeDetail()
                }
            }
        })
    }

    /**
     * 详情备注编辑器是动态渲染出来的。
     * 每次进入编辑态后，都要把焦点和保存/取消快捷键重新挂到新 textarea 上。
     */
    bindDetailEditor() {
        const editor = this.nodes.detailTableBody.querySelector('.detail-comment-editor-textarea')

        if (!editor) {
            return
        }

        editor.addEventListener('input', () => {
            this.state.editingCommentDraft = editor.value
        })

        editor.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                this.cancelCommentEdit()
                return
            }

            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                this.saveCommentEdit(editor.dataset.id)
            }
        })

        editor.addEventListener('blur', () => {
            this.saveCommentEdit(editor.dataset.id)
        }, {once: true})

        requestAnimationFrame(function () {
            editor.focus()
            editor.select()
        })
    }

    /**
     * 导出当前扩展数据。
     * 这里把高亮记录和少量用户设置一起打成 JSON，方便跨设备手动迁移。
     * @returns {Promise<void>}
     */
    async exportBackup() {
        const uiText = this.getUiText()

        try {
            const localData = await getAllStorageData()
            const syncData = await getSyncStorageData(['setting', 'uiLanguage'])
            const highlightPages = {}

            Object.keys(localData).forEach(function (key) {
                if (!/^highlight-mengshou-/.test(key)) {
                    return
                }

                if (!Array.isArray(localData[key])) {
                    return
                }

                highlightPages[key] = localData[key]
            })

            const exportPayload = {
                schemaVersion: 1,
                exportedAt: new Date().toISOString(),
                highlights: highlightPages,
                preferences: {
                    setting: syncData.setting || {use: true},
                    uiLanguage: syncData.uiLanguage === 'en' ? 'en' : 'zh'
                }
            }

            const exportBlob = new Blob(
                [JSON.stringify(exportPayload, null, 2)],
                {type: 'application/json;charset=utf-8'}
            )
            const exportUrl = URL.createObjectURL(exportBlob)
            const exportLink = document.createElement('a')

            exportLink.href = exportUrl
            exportLink.download = this.buildExportFileName()
            document.body.appendChild(exportLink)
            exportLink.click()
            document.body.removeChild(exportLink)
            URL.revokeObjectURL(exportUrl)

            this.showToast(uiText.exportSuccess, 'success')
        } catch (error) {
            this.showToast(uiText.exportFailed, 'error')
        }
    }

    /**
     * 导出文件名使用本地日期，方便用户区分不同备份版本。
     * @returns {string}
     */
    buildExportFileName() {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hour = String(now.getHours()).padStart(2, '0')
        const minute = String(now.getMinutes()).padStart(2, '0')
        const second = String(now.getSeconds()).padStart(2, '0')

        return 'cross-words-highlight-backup-' + year + month + day + '-' + hour + minute + second + '.json'
    }

    /**
     * 读取文件输入框里的 JSON，并交给后台合并写入。
     * 导入完成后刷新当前页面数据，同时同步导入包里的语言和开关设置。
     * @returns {Promise<void>}
     */
    async importBackupFromInput() {
        const fileInput = this.nodes.importFileInput
        const file = fileInput.files && fileInput.files[0]
        const uiText = this.getUiText()

        if (!file) {
            return
        }

        try {
            const rawText = await file.text()
            const parsedPayload = JSON.parse(rawText)
            const normalizedPayload = this.normalizeImportedBackup(parsedPayload)

            await sendBackgroundMessage({
                from: 'pop_js',
                action: 'importBackup',
                data: normalizedPayload
            })

            /**
             * 导入包里的设置直接同步到当前页面状态。
             * 这样导入完成后，语言和开关不需要用户手动刷新页面。
             */
            this.state.uiLanguage = normalizedPayload.preferences.uiLanguage
            this.state.extensionSettings = {
                use: !!normalizedPayload.preferences.setting.use
            }

            await this.refreshData()
            this.showToast(
                uiText.importSuccess.replace('{pages}', String(Object.keys(normalizedPayload.highlights).length)),
                'success'
            )
        } catch (error) {
            if (error && error.message === 'INVALID_IMPORT_FILE') {
                this.showToast(uiText.importInvalid, 'error')
            } else {
                this.showToast(uiText.importFailed, 'error')
            }
        } finally {
            fileInput.value = ''
        }
    }

    /**
     * 把导入包规范化成当前扩展可接受的结构。
     * 只接收 highlight-mengshou-* 键，避免把不相关数据直接写进 storage.local。
     * @param payload
     * @returns {{highlights: Object, preferences: {setting: {use: boolean}, uiLanguage: string}}}
     */
    normalizeImportedBackup(payload) {
        if (!payload || typeof payload !== 'object') {
            throw new Error('INVALID_IMPORT_FILE')
        }

        const importedHighlights = {}
        const sourceHighlights = payload.highlights
        const sourcePreferences = payload.preferences || {}

        if (!sourceHighlights || typeof sourceHighlights !== 'object') {
            throw new Error('INVALID_IMPORT_FILE')
        }

        Object.keys(sourceHighlights).forEach(function (key) {
            if (!/^highlight-mengshou-/.test(key)) {
                return
            }

            if (!Array.isArray(sourceHighlights[key])) {
                return
            }

            importedHighlights[key] = sourceHighlights[key]
        })

        if (Object.keys(importedHighlights).length === 0) {
            throw new Error('INVALID_IMPORT_FILE')
        }

        return {
            highlights: importedHighlights,
            preferences: {
                setting: {
                    use: !(sourcePreferences.setting && sourcePreferences.setting.use === false)
                },
                uiLanguage: sourcePreferences.uiLanguage === 'en' ? 'en' : 'zh'
            }
        }
    }

    /**
     * popup 和 options 页共用一套语言切换。
     * 真正的持久化和文案刷新都收口到这里。
     * @param language
     */
    changeLanguage(language) {
        if (language !== 'zh' && language !== 'en') {
            return
        }

        if (this.state.uiLanguage === language) {
            return
        }

        this.state.uiLanguage = language
        chrome.storage.sync.set({uiLanguage: language}, function () {
        })
        this.render()
    }

    /**
     * 扩展开关仍然沿用原来的页面 reload 方案。
     * 这是因为内容页目前还不是完全热插拔架构。
     * @param val
     */
    statusChange(val) {
        this.state.extensionSettings.use = !!val
        this.renderDockControls()

        chrome.storage.sync.set({setting: {use: !!val}}, function () {
            chrome.contextMenus.update('stopUse', {checked: !val}, function () {
                sendBackgroundMessage({from: 'pop_js', action: 'reload', data: []}).catch(function () {
                })
            })
        })
    }

    /**
     * popup 里优先走 chrome.tabs.create。
     * 这样点击“阅读”时直接开新 tab，不会把 popup 自己的上下文带乱。
     * @param url
     */
    openUrl(url) {
        if (!url) {
            return
        }

        if (chrome.tabs && typeof chrome.tabs.create === 'function') {
            chrome.tabs.create({url: url})
            return
        }

        window.open(url, '_blank')
    }

    /**
     * 打开页面详情弹窗。
     * 标题、链接和当前页面的高亮数组在这里一次性同步到弹窗状态里。
     * @param row
     */
    openDetail(row) {
        const app = this

        this.state.dialogTableVisible = true
        this.state.activeDetailTitle = row.title || this.getReadableHost(row.href)
        this.state.activeDetailHref = row.href
        this.state.detailSearch = ''
        this.state.detailLoading = true
        this.state.gridData = []
        this.cancelCommentEdit(false)
        this.renderDetailDialog()

        this.loadDetailHighlights(row)
            .catch(function () {
            })
            .finally(function () {
                if (!app.state.dialogTableVisible || app.state.activeDetailHref !== row.href) {
                    return
                }

                app.renderDetailDialog()
            })
    }

    /**
     * 关闭详情弹窗，并重置弹窗专属状态。
     */
    closeDetail() {
        this.resetDetailState(true)
    }

    /**
     * 详情弹窗状态归零。
     * 删除整页高亮、关闭弹窗、刷新后找不到原页面时都可以复用这条链。
     * @param shouldRender
     */
    resetDetailState(shouldRender) {
        this.state.dialogTableVisible = false
        this.state.activeDetailTitle = ''
        this.state.activeDetailHref = ''
        this.state.detailSearch = ''
        this.state.detailLoading = false
        this.state.gridData = []
        this.state.editingCommentId = ''
        this.state.editingCommentDraft = ''
        this.state.savingCommentId = ''

        if (shouldRender !== false) {
            this.render()
        }
    }

    /**
     * 当前详情弹窗里按 id 找原始高亮对象。
     * 删除、复制、编辑备注都要走这条查找。
     * @param id
     * @returns {Object|null}
     */
    getDetailRowById(id) {
        const targetId = String(id || '')

        for (let index = 0; index < this.state.gridData.length; index++) {
            if (String(this.state.gridData[index].id) === targetId) {
                return this.state.gridData[index]
            }
        }

        return null
    }

    /**
     * 详情弹窗真正需要的是单页完整高亮数组。
     * 这里把后台返回的 hs 列表补成详情页统一使用的对象结构，并保留恢复元数据。
     * @param row
     * @returns {Promise<void>}
     */
    async loadDetailHighlights(row) {
        const targetHref = row.href
        const highlights = await getPageHighlights(row.key, row.href).catch(function () {
            return []
        })
        const nextGridData = []

        highlights.forEach(function (currentHighlight) {
            if (!currentHighlight || !currentHighlight.id) {
                return
            }

            nextGridData.push({
                text: currentHighlight.text || '',
                comment: currentHighlight.comment || '',
                key: row.key,
                id: currentHighlight.id,
                href: currentHighlight.href || row.href,
                color: currentHighlight.color || 'yellow',
                position: currentHighlight.position || {top: 0, left: 0},
                startMeta: currentHighlight.startMeta,
                endMeta: currentHighlight.endMeta,
                extra: currentHighlight.extra,
                title: currentHighlight.title,
                icon: currentHighlight.icon,
                readDate: currentHighlight.readDate
            })
        })

        if (!this.state.dialogTableVisible || this.state.activeDetailHref !== targetHref) {
            return
        }

        this.state.gridData = this.sortHighlights(nextGridData)
        this.state.detailLoading = false
    }

    /**
     * 双击备注列后，当前行直接进入内联编辑状态。
     * 这里不再弹二次确认层，减少详情页里的操作阻力。
     * @param id
     */
    startCommentEdit(id) {
        const row = this.getDetailRowById(id)

        if (!row) {
            return
        }

        this.state.editingCommentId = row.id
        this.state.editingCommentDraft = row.comment || ''
        this.state.savingCommentId = ''
        this.renderDetailDialog()
    }

    /**
     * 关闭详情页备注的内联编辑状态。
     * 取消和保存完成都复用这条收口逻辑，避免散落多处重复赋值。
     * @param shouldRender
     */
    cancelCommentEdit(shouldRender) {
        this.state.editingCommentId = ''
        this.state.editingCommentDraft = ''
        this.state.savingCommentId = ''

        if (shouldRender !== false) {
            this.renderDetailDialog()
        }
    }

    /**
     * 详情页修改备注后，同时更新详情数据和主列表里的评论数量。
     * 这样不需要关闭弹窗，也能马上看到最新评论状态。
     * @param updatedHighlight
     */
    syncPageHighlightState(updatedHighlight) {
        if (!updatedHighlight || !updatedHighlight.id) {
            return
        }

        const nextGridData = this.state.gridData.map(function (row) {
            if (row.id !== updatedHighlight.id) {
                return row
            }

            return Object.assign({}, row, updatedHighlight)
        })
        const nextCommentNums = nextGridData.filter(function (row) {
            return !!row.comment
        }).length

        this.state.gridData = nextGridData

        this.state.tableDataOri = this.state.tableDataOri.map(function (row) {
            if (row.href !== updatedHighlight.href) {
                return row
            }

            return Object.assign({}, row, {
                commentNums: nextCommentNums
            })
        })

        this.handleTableData()
    }

    /**
     * 详情页备注保存。
     * 真正的持久化仍然统一走后台页。
     * @param id
     * @returns {Promise<void>}
     */
    async saveCommentEdit(id) {
        const row = this.getDetailRowById(id)

        if (!row || this.state.editingCommentId !== row.id) {
            return
        }

        const nextComment = String(this.state.editingCommentDraft || '').trim()
        const currentComment = String(row.comment || '').trim()

        if (nextComment === currentComment) {
            this.cancelCommentEdit()
            return
        }

        const updatedHighlight = Object.assign({}, row, {
            comment: nextComment
        })

        this.state.savingCommentId = row.id
        this.renderDetailDialog()

        try {
            await sendBackgroundMessage({
                from: 'pop_js',
                action: 'updateHighlight',
                data: {
                    href: row.href,
                    source: updatedHighlight
                }
            })

            this.syncPageHighlightState(updatedHighlight)
            this.cancelCommentEdit(false)
            this.render()
        } catch (error) {
            this.state.savingCommentId = ''
            this.renderDetailDialog()
            this.showToast(this.getUiText().updateFailed, 'error')
        }
    }

    /**
     * 删除整页高亮。
     * 成功后只刷新当前页面数据，不做整页 reload。
     * @param row
     * @returns {Promise<void>}
     */
    async deletePage(row) {
        try {
            await sendBackgroundMessage({
                from: 'pop_js',
                action: 'deletePage',
                data: {
                    href: row.href
                }
            })

            if (this.state.activeDetailHref === row.href) {
                this.resetDetailState(false)
            }

            await this.refreshData()
        } catch (error) {
            this.showToast(this.getUiText().deleteFailed, 'error')
        }
    }

    /**
     * 删除详情弹窗里的单条高亮。
     * 成功后优先刷新当前状态，不做整页 reload。
     * @param row
     * @returns {Promise<void>}
     */
    async deleteDetail(row) {
        try {
            await sendBackgroundMessage({
                from: 'pop_js',
                action: 'deleteHighlight',
                data: {
                    href: row.href,
                    id: row.id
                }
            })

            await this.refreshData({preserveDetail: true})

            if (this.state.dialogTableVisible && this.state.gridData.length === 0) {
                this.resetDetailState(true)
            }
        } catch (error) {
            this.showToast(this.getUiText().deleteFailed, 'error')
        }
    }

    /**
     * 点击详情正文时，先确认再复制。
     * 这里直接沿用浏览器原生 confirm，去掉第三方弹层依赖。
     * @param text
     */
    copyExcerpt(text) {
        if (!text) {
            return
        }

        if (!window.confirm(this.getUiText().copyConfirmBody)) {
            return
        }

        copyToClipboard(text).then(() => {
            this.showToast(this.getUiText().copySuccess, 'success')
        }).catch(() => {
            this.showToast(this.getUiText().copyFailed, 'error')
        })
    }

    /**
     * 轻量提示。
     * 配置页不再依赖 Element Message，自己维护一层小 toast 即可。
     * @param message
     * @param type
     */
    showToast(message, type) {
        const toast = document.createElement('div')

        toast.className = 'toast-item' + (type === 'error' ? ' is-error' : ' is-success')
        toast.textContent = message
        this.nodes.toastStack.appendChild(toast)

        requestAnimationFrame(function () {
            toast.classList.add('is-visible')
        })

        window.setTimeout(function () {
            toast.classList.remove('is-visible')

            window.setTimeout(function () {
                toast.remove()
            }, 180)
        }, 1800)
    }

    /**
     * 搜索输入框右侧的清空按钮只在有值时展示。
     * @param input
     * @param button
     */
    toggleClearButton(input, button) {
        button.hidden = !input.value
    }

    /**
     * 头像图片加载成功后，才隐藏字母兜底。
     * 这样远程 favicon 失效时，仍然能稳妥显示 host 首字母。
     * @param container
     */
    syncAvatarImages(container) {
        const avatars = container.querySelectorAll('.source-avatar-image')

        avatars.forEach(function (image) {
            const wrapper = image.closest('.source-avatar')

            if (!wrapper) {
                return
            }

            const applyLoadedState = function () {
                wrapper.classList.add('has-image')
            }

            const applyErrorState = function () {
                wrapper.classList.remove('has-image')
                image.removeAttribute('src')
            }

            image.addEventListener('load', applyLoadedState, {once: true})
            image.addEventListener('error', applyErrorState, {once: true})

            if (image.dataset.src) {
                image.src = image.dataset.src
            }

            if (image.complete) {
                if (image.naturalWidth > 0) {
                    applyLoadedState()
                } else {
                    applyErrorState()
                }
            }
        })
    }

    /**
     * 表格里统一显示更短的 host。
     * @param url
     * @returns {string}
     */
    getReadableHost(url) {
        if (!url) {
            return ''
        }

        try {
            return new URL(url).host
        } catch (error) {
            return String(url).replace(/^https?:\/\//, '')
        }
    }

    /**
     * 头像兜底字符。
     * @param url
     * @returns {string}
     */
    getHostInitial(url) {
        const host = this.getReadableHost(url)

        if (!host) {
            return 'H'
        }

        return host.charAt(0).toUpperCase()
    }

    /**
     * 详情弹窗颜色圆点取值。
     * @param color
     * @returns {string}
     */
    getHighlightColorHex(color) {
        if (!HIGHLIGHT_COLOR_META[color]) {
            return HIGHLIGHT_COLOR_META.yellow
        }

        return HIGHLIGHT_COLOR_META[color]
    }

    /**
     * 主列表分页按钮构造。
     * 页数很少时直接全展示，页数很多时展示首尾和当前页邻近范围。
     * @param pageCount
     * @returns {string}
     */
    buildPaginationButtons(pageCount) {
        const pages = []
        const currentPage = this.state.currentPage

        if (pageCount <= 7) {
            for (let page = 1; page <= pageCount; page++) {
                pages.push(page)
            }
        } else {
            pages.push(1)

            if (currentPage > 3) {
                pages.push('ellipsis-left')
            }

            const middleStart = Math.max(2, currentPage - 1)
            const middleEnd = Math.min(pageCount - 1, currentPage + 1)

            for (let page = middleStart; page <= middleEnd; page++) {
                pages.push(page)
            }

            if (currentPage < pageCount - 2) {
                pages.push('ellipsis-right')
            }

            pages.push(pageCount)
        }

        return pages.map((page) => {
            if (String(page).indexOf('ellipsis') === 0) {
                return '<span class="page-ellipsis">…</span>'
            }

            return '<button type="button" class="page-number-button' + (page === currentPage ? ' is-active' : '') + '" data-page="' + page + '">' + page + '</button>'
        }).join('')
    }
}

document.addEventListener('DOMContentLoaded', function () {
    configApp = new ConfigPageApp(document.getElementById('app'))
    configApp.init().catch(function () {
        if (configApp) {
            configApp.state.loading = false
            configApp.render()
        }
    })
})

/**
 * 内容页新增或删除高亮后，配置页只做局部刷新。
 * 这里同时保留详情弹窗状态，避免用户正在看详情时弹窗被整段关掉。
 */
chrome.runtime.onMessage.addListener(function (request) {
    if (!configApp || !request || request.from !== 'content_js') {
        return
    }

    if (request.action === 'add' || request.action === 'remove') {
        configApp.refreshData({preserveDetail: true}).catch(function () {
        })
    }
})
