let configVm = null

/**
 * 配置页文案集中在这里维护。
 * 这次只做中英文两套，后续要继续加语言时直接扩展同一结构即可。
 */
const CONFIG_PAGE_TEXT = {
    zh: {
        pageTitle: '',
        pageDescription: '集中查看已保存的高亮页面。',
        languageLabel: '界面语言',
        extensionStatusLabel: '扩展状态',
        switchOn: '开启',
        switchOff: '关闭',
        libraryTitle: '',
        libraryDescription: '按页面查看高亮记录，也可以直接跳回原文。',
        searchPlaceholder: '搜索标题或域名',
        detailSearchPlaceholder: '搜索关键词',
        sourceColumn: '来源',
        highlightMetaLabel: '高亮',
        noteMetaLabel: '备注',
        highlightsColumn: '高亮',
        notesColumn: '备注',
        savedAtColumn: '保存时间',
        actionsColumn: '操作',
        readAction: '阅读',
        detailAction: '详情',
        deleteAction: '删除',
        closeAction: '关闭',
        detailDialogTitle: '高亮详情',
        excerptColumn: '高亮内容',
        noteColumn: '备注',
        colorColumn: '颜色',
        noNoteText: '暂无备注',
        noteEditorPlaceholder: '双击后可直接编辑备注',
        updateFailed: '备注保存失败',
        emptyState: '还没有保存任何高亮，先去网页里划一段试试。',
        detailEmptyState: '这一页暂时没有可展示的高亮记录。',
        copyConfirmTitle: '复制内容',
        copyConfirmBody: '要把当前内容复制到剪贴板吗？',
        copySuccess: '已复制到剪贴板',
        copyFailed: '复制失败',
        deleteFailed: '删除失败',
        confirmAction: '确定',
        cancelAction: '取消'
    },
    en: {
        pageTitle: '',
        pageDescription: 'Browse saved pages with highlights in one place.',
        languageLabel: 'Interface language',
        extensionStatusLabel: 'Extension status',
        switchOn: 'On',
        switchOff: 'Off',
        libraryTitle: '',
        libraryDescription: 'Review saved highlight pages and jump back to the source.',
        searchPlaceholder: 'Search title or host',
        detailSearchPlaceholder: 'Search keywords',
        sourceColumn: 'Source',
        highlightMetaLabel: 'Highlights',
        noteMetaLabel: 'Notes',
        highlightsColumn: 'Highlights',
        notesColumn: 'Notes',
        savedAtColumn: 'Saved at',
        actionsColumn: 'Actions',
        readAction: 'Read',
        detailAction: 'Details',
        deleteAction: 'Delete',
        closeAction: 'Close',
        detailDialogTitle: 'Highlight Details',
        excerptColumn: 'Excerpt',
        noteColumn: 'Note',
        colorColumn: 'Color',
        noNoteText: 'No note yet',
        noteEditorPlaceholder: 'Double-click to edit the note',
        updateFailed: 'Failed to save note',
        emptyState: 'No highlights saved yet. Create one on a page first.',
        detailEmptyState: 'There are no highlights to show for this page yet.',
        copyConfirmTitle: 'Copy text',
        copyConfirmBody: 'Copy the selected content to the clipboard?',
        copySuccess: 'Copied to clipboard',
        copyFailed: 'Copy failed',
        deleteFailed: 'Delete failed',
        confirmAction: 'Confirm',
        cancelAction: 'Cancel'
    }
}

/**
 * Element UI 的内建文案也一起切换。
 * 这里显式列出本页会用到的 key，避免把语言逻辑分散到模板里。
 */
const ELEMENT_LOCALE_TEXT = {
    zh: {
        el: {
            pagination: {
                goto: '前往',
                pagesize: '条/页',
                total: '共 {total} 条',
                pageClassifier: '页'
            },
            messagebox: {
                title: '提示',
                confirm: '确定',
                cancel: '取消',
                error: '输入有误'
            },
            table: {
                emptyText: '暂无数据'
            },
            popconfirm: {
                confirmButtonText: '确定',
                cancelButtonText: '取消'
            },
            pageHeader: {
                title: '返回'
            }
        }
    },
    en: {
        el: {
            pagination: {
                goto: 'Go to',
                pagesize: '/ page',
                total: 'Total {total}',
                pageClassifier: ''
            },
            messagebox: {
                title: 'Notice',
                confirm: 'Confirm',
                cancel: 'Cancel',
                error: 'Invalid input'
            },
            table: {
                emptyText: 'No data'
            },
            popconfirm: {
                confirmButtonText: 'Confirm',
                cancelButtonText: 'Cancel'
            },
            pageHeader: {
                title: 'Back'
            }
        }
    }
}

/**
 * 详情页颜色列只显示色块，不再展示颜色名称。
 * 所以这里保留最小集合，只维护颜色值本身。
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
 * 配置页只负责展示数据，不在这里直接做底层写队列。
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
 * 配置页删除动作全部交给后台页。
 * 后台页负责统一落盘和同步给内容页。
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
 * 把 Element UI 的语言环境切到目标语言。
 * 只要脚本已经加载，就可以在运行时直接切换。
 * @param language
 */
function applyElementLocale(language) {
    if (!window.ELEMENT || typeof window.ELEMENT.locale !== 'function') {
        return
    }

    window.ELEMENT.locale(ELEMENT_LOCALE_TEXT[language] || ELEMENT_LOCALE_TEXT.zh)
}

/**
 * 同步 html lang 和 document.title。
 * 这样浏览器标签标题和无障碍语言信息都会一起更新。
 * @param language
 */
function updateDocumentMeta(language) {
    const text = CONFIG_PAGE_TEXT[language] || CONFIG_PAGE_TEXT.zh

    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
    document.title = 'Cross Words Highlight - ' + text.pageTitle
}

/**
 * 这个页面同时被当成 popup 和 options_page 使用。
 * popup 需要明确尺寸提示，否则浏览器会把它按最小内容宽度挤成细条。
 * @returns {string}
 */
function detectPageMode() {
    try {
        const popupViews = chrome.extension.getViews({type: 'popup'}) || []

        for (let index = 0; index < popupViews.length; index++) {
            if (popupViews[index] === window) {
                return 'popup'
            }
        }
    } catch (error) {
    }

    return 'page'
}

/**
 * 给 body/html 打上页面模式类名。
 * 样式层会根据 popup/page 两种模式分别控制尺寸。
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
 * 把 storage.local 里的高亮数据转换成页面列表数据。
 * 只抽取配置页真正要显示的字段，避免直接把底层结构暴露给模板。
 * @returns {Promise<{tableData: Array}>}
 */
async function getData() {
    const list = await getAllStorageData()
    const info = []

    for (let key in list) {
        if (!Object.prototype.hasOwnProperty.call(list, key)) {
            continue
        }

        if (!/^highlight-mengshou-/.test(key)) {
            continue
        }

        if (!Array.isArray(list[key]) || list[key].length === 0) {
            continue
        }

        let commentNums = 0
        let infoItem = {
            href: '',
            title: '',
            nums: list[key].length,
            commentNums: 0,
            icon: '',
            hs: [],
            readDate: '',
            key: key
        }

        list[key].forEach(function (storeItem) {
            if (!storeItem || !storeItem.hs) {
                return
            }

            const currentHighlight = storeItem.hs

            if (currentHighlight.comment) {
                commentNums++
            }

            infoItem.hs.push({
                text: currentHighlight.text || '',
                comment: currentHighlight.comment || '',
                key: key,
                id: currentHighlight.id,
                href: currentHighlight.href,
                color: currentHighlight.color || 'yellow',
                position: currentHighlight.position || {top: 0, left: 0},
                startMeta: currentHighlight.startMeta,
                endMeta: currentHighlight.endMeta,
                extra: currentHighlight.extra,
                title: currentHighlight.title,
                icon: currentHighlight.icon,
                readDate: currentHighlight.readDate
            })

            infoItem.href = currentHighlight.href
            infoItem.title = currentHighlight.title
            infoItem.icon = currentHighlight.icon
            infoItem.readDate = currentHighlight.readDate
        })

        infoItem.commentNums = commentNums
        info.push(infoItem)
    }

    return {tableData: info}
}

/**
 * 统一刷新页面数据。
 * 打开页面、内容页新增高亮、删除数据后都复用这一条刷新链。
 * @param vm
 */
function init(vm) {
    if (!vm) {
        return
    }

    vm.loading = true

    getData().then(function (result) {
        result.tableData.sort(function (a, b) {
            if (a.readDate !== b.readDate) {
                return a.readDate > b.readDate ? -1 : 1
            }

            return -1
        })

        vm.tableDataLength = result.tableData.length
        vm.tableDataOri = result.tableData
        vm.handleTableData()
        vm.loading = false
    }).catch(function () {
        vm.loading = false
    })
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

document.addEventListener('DOMContentLoaded', function () {
    const Main = {
        created() {
            const vm = this
            vm.pageMode = detectPageMode()

            /**
             * popup 的垂直空间远小于独立配置页。
             * 这里直接把默认每页数量压到 5 条，这样能更稳定地露出分页条，
             * 同时避免在 popup 里一页塞太多数据后只能靠表格内部滚动查看。
             */
            if (vm.pageMode === 'popup') {
                vm.pageSize = 5
            }

            chrome.storage.sync.get(['setting', 'uiLanguage'], function (item) {
                vm.extensionSettings = item.setting || {use: true}
                /**
                 * 配置页默认语言固定回中文。
                 * 这里只认 en，其他任何值都按中文处理，
                 * 这样旧版本残留值、空值或异常值都不会把界面带偏。
                 */
                vm.uiLanguage = item.uiLanguage === 'en' ? 'en' : 'zh'

                applyElementLocale(vm.uiLanguage)
                updateDocumentMeta(vm.uiLanguage)
            })

            init(vm)
        },
        mounted() {
            applyPageMode(this.pageMode)
            this.syncViewportHeight()
            window.addEventListener('resize', this.syncViewportHeight)
        },
        beforeDestroy() {
            window.removeEventListener('resize', this.syncViewportHeight)
        },
        watch: {
            /**
             * 搜索词变化时只重算当前表格视图。
             * 输入过程中不重新读取 storage，避免造成不必要的 IO。
             */
            search() {
                this.currentPage = 1
                this.handleTableData()
            },
            /**
             * 界面语言切换时，统一更新 Element UI、标题和同步存储。
             * 后续如果 popup 和 options 页面共用这个 key，也能保持一致。
             */
            uiLanguage(newValue) {
                applyElementLocale(newValue)
                updateDocumentMeta(newValue)
                chrome.storage.sync.set({uiLanguage: newValue}, function () {
                })
            }
        },
        computed: {
            /**
             * 当前语言对应的文案对象。
             * 模板直接读取 uiText，避免每个位置都手动判断语言。
             */
            uiText() {
                return CONFIG_PAGE_TEXT[this.uiLanguage] || CONFIG_PAGE_TEXT.zh
            },
            /**
             * popup 模式下始终展示分页区。
             * 这样用户可以直接看到当前总数和页码，不会误以为列表没有分页。
             * 独立配置页仍然保持“超过一页才显示分页”的传统行为。
             */
            shouldShowPaginationFooter() {
                if (this.tableDataLength === 0) {
                    return false
                }

                if (this.pageMode === 'popup') {
                    return true
                }

                return this.tableDataLength > this.pageSize
            },
            /**
             * popup 底部工具条和分页要占同一行。
             * 所以 popup 下无论是否出现分页，都保留底部行，确保语言和开关始终有固定位置。
             */
            shouldShowBottomBar() {
                if (this.pageMode === 'popup') {
                    return true
                }

                return this.shouldShowPaginationFooter
            },
            /**
             * popup 的页大小选项单独收紧。
             * 首档从 5 开始，优先保证小窗口里每页能完整显示。
             */
            paginationPageSizes() {
                if (this.pageMode === 'popup') {
                    return [5, 10, 20, 40]
                }

                return [10, 20, 40, 80]
            },
            /**
             * popup 底部空间有限，分页布局要更短。
             * 独立配置页继续保留跳页输入框，方便处理大量记录。
             */
            paginationLayout() {
                if (this.pageMode === 'popup') {
                    return 'total, sizes, prev, pager, next'
                }

                return 'total, sizes, prev, pager, next, jumper'
            },
            /**
             * 主表高度按当前窗口动态计算。
             * popup 需要额外给分页条让位，否则分页会被大表格挤出可视区域。
             */
            tableHeight() {
                if (this.pageMode === 'popup') {
                    /**
                     * popup 已经把底部工具条并入列表卡片内部了。
                     * 这里把预留高度收紧一档，让表格区域继续往下吃空间，
                     * 这样列表底框会更稳定地贴近窗口底部。
                     */
                    const popupReservedHeight = this.shouldShowPaginationFooter ? 212 : 164

                    return Math.max(248, this.viewportHeight - popupReservedHeight)
                }

                const reservedHeight = this.shouldShowPaginationFooter ? 176 : 132

                return Math.max(300, this.viewportHeight - reservedHeight)
            },
            /**
             * 详情弹窗内的数据过滤单独计算，避免模板里塞太长的表达式。
             */
            filteredGridData() {
                if (!this.detailSearch) {
                    return this.gridData
                }

                const keyword = this.detailSearch.toLowerCase()

                return this.gridData.filter(function (data) {
                    return (data.text || '').toLowerCase().includes(keyword) ||
                        (data.comment || '').toLowerCase().includes(keyword)
                })
            }
        },
        methods: {
            tableRowClassName({rowIndex}) {
                if (rowIndex % 2 === 1) {
                    return 'success-row'
                }

                return ''
            },
            /**
             * 语言切换按钮只负责设置当前值。
             * 真正的持久化和 UI 同步交给 watch 统一处理。
             * @param language
             */
            changeLanguage(language) {
                if (this.uiLanguage === language) {
                    return
                }

                this.uiLanguage = language
            },
            changeSort(orderInfo) {
                this.column = orderInfo.prop
                this.order = orderInfo.order
                this.currentPage = 1
                this.handleTableData()
            },
            /**
             * 把窗口高度同步到响应式状态里。
             * 表格高度通过计算属性依赖它，这样缩放窗口时列表会马上跟着变化。
             */
            syncViewportHeight() {
                this.viewportHeight = window.innerHeight
            },
            /**
             * popup 里把保存时间压缩成短格式，给操作列让出空间。
             * options 页仍然保留完整时间，避免信息损失。
             * @param readDate
             * @returns {string}
             */
            formatReadDate(readDate) {
                if (!readDate) {
                    return ''
                }

                if (this.pageMode !== 'popup') {
                    return readDate
                }

                return String(readDate).replace(/^\d{4}-/, '').slice(0, 11)
            },
            openUrl(url) {
                window.open(url)
            },
            /**
             * 删除详情弹窗里的单条高亮。
             * 成功后只刷新当前页面状态，不做整页 reload。
             * @param hs
             * @returns {Promise<void>}
             */
            async delDetail(hs) {
                try {
                    await sendBackgroundMessage({
                        from: 'pop_js',
                        action: 'deleteHighlight',
                        data: {
                            href: hs.href,
                            id: hs.id
                        }
                    })

                    /**
                     * 详情表格支持关键字过滤。
                     * 这里不能直接使用表格当前索引删除，因为过滤后 scope.$index 不是原始数组索引。
                     * 必须按高亮 id 回到原始 gridData 中精确移除，避免删错记录。
                     */
                    this.gridData = this.gridData.filter(function (row) {
                        return row.id !== hs.id
                    })

                    this.cancelCommentEdit()
                    this.syncPageHighlightState(hs)
                    init(this)
                } catch (error) {
                    this.$message({
                        type: 'error',
                        message: this.uiText.deleteFailed
                    })
                }
            },
            /**
             * 删除整页高亮。
             * @param row
             * @returns {Promise<void>}
             */
            async del(row) {
                try {
                    await sendBackgroundMessage({
                        from: 'pop_js',
                        action: 'deletePage',
                        data: {
                            href: row.href
                        }
                    })

                    const totalPage = Math.ceil((this.tableDataLength - 1) / this.pageSize)
                    const nextCurrentPage = this.currentPage > totalPage ? totalPage : this.currentPage

                    this.currentPage = nextCurrentPage < 1 ? 1 : nextCurrentPage
                    init(this)
                } catch (error) {
                    this.$message({
                        type: 'error',
                        message: this.uiText.deleteFailed
                    })
                }
            },
            handleSizeChange(size) {
                this.pageSize = size
                this.handleTableData()
            },
            handleCurrentChange(currentPage) {
                this.currentPage = currentPage
                this.handleTableData()
            },
            handlePrevClick(currentPage) {
                this.currentPage = currentPage
                this.handleTableData()
            },
            handleNextClick(currentPage) {
                this.currentPage = currentPage
                this.handleTableData()
            },
            /**
             * 主表只在内存中做过滤、排序和分页。
             * 这样交互响应会更直接，也不需要每次都重读存储。
             */
            handleTableData() {
                let temp = this.tableDataOri.slice()

                if (this.search) {
                    const keyword = this.search.toLowerCase()

                    temp = temp.filter((data) => {
                        const title = data.title || ''
                        const href = data.href || ''

                        return title.toLowerCase().includes(keyword) ||
                            href.toLowerCase().includes(keyword)
                    })
                }

                if (this.column && this.order) {
                    const currentOrder = this.order
                    const currentColumn = this.column

                    temp = temp.slice().sort(function (a, b) {
                        const leftValue = a[currentColumn]
                        const rightValue = b[currentColumn]

                        if (leftValue === rightValue) {
                            return 0
                        }

                        if (currentOrder === 'ascending') {
                            return leftValue < rightValue ? -1 : 1
                        }

                        return leftValue > rightValue ? -1 : 1
                    })
                }

                this.tableDataLength = temp.length

                const totalPage = temp.length === 0 ? 1 : Math.ceil(temp.length / this.pageSize)

                if (this.currentPage > totalPage) {
                    this.currentPage = totalPage
                }

                if (this.currentPage < 1) {
                    this.currentPage = 1
                }

                this.tableData = temp.slice(
                    (this.currentPage - 1) * this.pageSize,
                    this.pageSize * this.currentPage
                )
            },
            /**
             * 详情弹窗改成按页面整包传入。
             * 这样标题、链接和高亮数组能一次性同步到弹窗头部。
             * @param row
             */
            getDetail(row) {
                this.dialogTableVisible = true
                this.activeDetailTitle = row.title || this.getReadableHost(row.href)
                this.activeDetailHref = row.href
                this.detailSearch = ''
                this.cancelCommentEdit()

                this.gridData = row.hs.slice().sort(function (a, b) {
                    if (a.position.top !== b.position.top) {
                        return a.position.top < b.position.top ? -1 : 1
                    }

                    if (a.position.left !== b.position.left) {
                        return a.position.left < b.position.left ? -1 : 1
                    }

                    return -1
                })
            },
            closeDialog() {
                this.cancelCommentEdit()
                this.detailSearch = ''
                this.activeDetailTitle = ''
                this.activeDetailHref = ''
                init(this)
            },
            /**
             * 双击备注列后，当前行直接进入内联编辑状态。
             * 这里不再弹二次确认层，减少详情页里的操作阻力。
             * @param row
             */
            startCommentEdit(row) {
                if (!row || !row.id) {
                    return
                }

                this.editingCommentId = row.id
                this.editingCommentDraft = row.comment || ''

                this.$nextTick(function () {
                    const editorTextarea = document.querySelector('.detail-comment-editor textarea')

                    if (editorTextarea) {
                        editorTextarea.focus()
                        editorTextarea.select()
                    }
                })
            },
            /**
             * 关闭内联编辑状态。
             * 取消和保存完成都复用这条收口逻辑，避免散落多处重复赋值。
             */
            cancelCommentEdit() {
                this.editingCommentId = ''
                this.editingCommentDraft = ''
            },
            /**
             * 详情页修改备注后，同时把详情数据和主列表里的评论数量一起更新。
             * 这样不需要关掉弹窗也能看到最新状态。
             * @param updatedHighlight
             */
            syncPageHighlightState(updatedHighlight) {
                if (!updatedHighlight || !updatedHighlight.id) {
                    return
                }

                this.gridData = this.gridData.map(function (row) {
                    if (row.id !== updatedHighlight.id) {
                        return row
                    }

                    return Object.assign({}, row, updatedHighlight)
                })

                this.tableDataOri = this.tableDataOri.map(function (row) {
                    if (row.href !== updatedHighlight.href) {
                        return row
                    }

                    const nextHighlights = row.hs.map(function (currentHighlight) {
                        if (currentHighlight.id !== updatedHighlight.id) {
                            return currentHighlight
                        }

                        return Object.assign({}, currentHighlight, updatedHighlight)
                    })

                    return Object.assign({}, row, {
                        hs: nextHighlights,
                        commentNums: nextHighlights.filter(function (currentHighlight) {
                            return !!currentHighlight.comment
                        }).length
                    })
                })

                this.handleTableData()
            },
            /**
             * 详情页内联备注保存。
             * 统一走后台页落盘，并同步给已经打开的内容页。
             * @param row
             * @returns {Promise<void>}
             */
            async saveCommentEdit(row) {
                if (!row || !row.id || this.editingCommentId !== row.id) {
                    return
                }

                const nextComment = String(this.editingCommentDraft || '').trim()
                const currentComment = String(row.comment || '').trim()

                if (nextComment === currentComment) {
                    this.cancelCommentEdit()
                    return
                }

                const updatedHighlight = Object.assign({}, row, {
                    comment: nextComment
                })

                this.savingCommentId = row.id

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
                    this.cancelCommentEdit()
                } catch (error) {
                    this.$message({
                        type: 'error',
                        message: this.uiText.updateFailed
                    })
                } finally {
                    this.savingCommentId = ''
                }
            },
            errorHandler() {
                return false
            },
            /**
             * 开关状态仍然沿用原来的页面 reload 方案。
             * 这是因为内容页目前还不是完全热插拔架构。
             * @param val
             */
            statusChange(val) {
                chrome.storage.sync.set({setting: {use: val}}, function () {
                    chrome.contextMenus.update('stopUse', {checked: !val}, function () {
                        sendBackgroundMessage({from: 'pop_js', action: 'reload', data: []}).catch(function () {
                        })
                    })
                })
            },
            /**
             * 点击正文或备注时，先确认，再复制到剪贴板。
             * @param text
             */
            open(text) {
                if (!text) {
                    return
                }

                this.$confirm(this.uiText.copyConfirmBody, this.uiText.copyConfirmTitle, {
                    confirmButtonText: this.uiText.confirmAction,
                    cancelButtonText: this.uiText.cancelAction,
                    type: 'info'
                }).then(() => {
                    copyToClipboard(text).then(() => {
                        this.$message({
                            type: 'success',
                            message: this.uiText.copySuccess
                        })
                    }).catch(() => {
                        this.$message({
                            type: 'error',
                            message: this.uiText.copyFailed
                        })
                    })
                }).catch(() => {
                })
            },
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
            },
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
            },
            /**
             * 详情弹窗的颜色圆点颜色。
             * @param color
             * @returns {string}
             */
            getHighlightColorHex(color) {
                if (!HIGHLIGHT_COLOR_META[color]) {
                    return HIGHLIGHT_COLOR_META.yellow
                }

                return HIGHLIGHT_COLOR_META[color]
            }
        },
        data() {
            return {
                tableData: [],
                tableDataOri: [],
                gridData: [],
                dialogTableVisible: false,
                editingCommentId: '',
                editingCommentDraft: '',
                savingCommentId: '',
                order: '',
                column: '',
                search: '',
                detailSearch: '',
                tableDataLength: 0,
                currentPage: 1,
                pageSize: 10,
                loading: true,
                extensionSettings: {use: true},
                uiLanguage: 'zh',
                pageMode: 'page',
                viewportHeight: window.innerHeight,
                activeDetailTitle: '',
                activeDetailHref: ''
            }
        }
    }

    const Ctor = Vue.extend(Main)
    configVm = new Ctor().$mount('#app')
})

/**
 * 内容页新增或删除高亮后，配置页只做局部刷新。
 */
chrome.runtime.onMessage.addListener(function (request) {
    if (!request || request.from !== 'content_js') {
        return
    }

    if (request.action === 'add' || request.action === 'remove') {
        init(configVm)
    }
})
