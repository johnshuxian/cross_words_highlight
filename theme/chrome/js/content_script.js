let bg_key

function htmlspecialchars(str) {
    let s = "";
    if (str.length === 0) return "";
    for   (let i=0; i<str.length; i++)
    {
        switch (str.substr(i,1))
        {
            case "<": s += "&lt;"; break;
            case ">": s += "&gt;"; break;
            case "&": s += "&amp;"; break;
            case " ":
                if(str.substr(i + 1, 1) === " "){
                    s += " &nbsp;";
                    i++;
                } else s += " ";
                break;
            case "\"": s += "&quot;"; break;
            case "\n": s += "<br>"; break;
            default: s += str.substr(i,1); break;
        }
    }
    return s;
}

function getSelectedText() {
    let t = "";
    window.getSelection ? t = window.getSelection() : document.getSelection ? t = document.getSelection() : document.selection && (t = document.selection.createRange().text)

    return t
}

const PAGE_STORAGE_PREFIX = 'highlight-mengshou';
const DEFAULT_HIGHLIGHT_COLOR = 'yellow';
const MENU_POSITION_STORAGE_KEY = 'johns-highlight-ui-menu-top';
const DEFAULT_UI_LANGUAGE = 'zh';
const FLOATING_BUTTON_ESTIMATED_WIDTH = 72;
const FLOATING_BUTTON_OFFSET_Y = 10;
const FLOATING_BUTTON_EDGE_GAP = 12;
const MENU_TOGGLE_SIZE = 56;
const MENU_TOP_EDGE_GAP = 12;
const EDITOR_PANEL_WIDTH = 220;
const EDITOR_PANEL_ESTIMATED_HEIGHT = 228;
const EDITOR_PANEL_OFFSET_Y = 12;
const EDITOR_EDGE_GAP = 12;
const RESTORE_UI_EXCLUDE_SELECTOR = '#johns-menu-drag, #johns-highlight, #johns-editor, .layui-layer';
const RESTORE_META_INDEX_WINDOW = 12;
const RESTORE_CONTEXT_LENGTH = 24;
const RESTORE_RETRY_INTERVAL_MS = 1200;
const RESTORE_MUTATION_DEBOUNCE_MS = 500;
const RESTORE_WATCH_MAX_MS = 15000;
const RESTORE_IGNORE_TAGS = {
    SCRIPT: true,
    STYLE: true,
    NOSCRIPT: true,
    TEXTAREA: true,
    SELECT: true,
    OPTION: true
};
const CONTENT_SCRIPT_TEXT = {
    zh: {
        menuHeading: '高亮记录',
        floatingActionLabel: '高亮',
        colorPalette: '颜色',
        copyText: '复制文本',
        addNote: '添加备注',
        removeNote: '删除备注',
        deleteHighlight: '删除高亮',
        notePromptTitle: '添加备注',
        notePromptPlaceholder: '补充一点备注，后面回看时更容易找到重点',
        notePromptHint: '支持多行输入，保存后会同步到侧栏和配置页。',
        saveAction: '保存',
        cancelAction: '取消',
        noteSaved: '备注已保存',
        copiedToClipboard: '已复制到剪贴板'
    },
    en: {
        menuHeading: 'Highlights',
        floatingActionLabel: 'Mark',
        colorPalette: 'Color',
        copyText: 'Copy text',
        addNote: 'Add note',
        removeNote: 'Remove note',
        deleteHighlight: 'Delete highlight',
        notePromptTitle: 'Add note',
        notePromptPlaceholder: 'Add a short note so this highlight is easier to find later',
        notePromptHint: 'Multi-line notes are supported and will sync to the sidebar and config page.',
        saveAction: 'Save',
        cancelAction: 'Cancel',
        noteSaved: 'Note saved',
        copiedToClipboard: 'Copied to clipboard'
    }
};
const COLOR_PICKER_OPTIONS = [
    {value: 'yellow', title: {zh: '暖黄', en: 'Warm Yellow'}},
    {value: 'green', title: {zh: '草绿', en: 'Soft Green'}},
    {value: 'pink', title: {zh: '玫粉', en: 'Rose Pink'}},
    {value: 'blue', title: {zh: '天蓝', en: 'Sky Blue'}},
    {value: 'orange', title: {zh: '杏橙', en: 'Apricot Orange'}},
    {value: 'purple', title: {zh: '薰紫', en: 'Lavender Purple'}},
    {value: 'mint', title: {zh: '薄荷', en: 'Fresh Mint'}},
    {value: 'pearl', title: {zh: '珍珠灰', en: 'Soft Pearl'}}
];
const SIDEBAR_MARKER_COLOR_MAP = {
    yellow: '#f8d66d',
    green: '#bee7a5',
    pink: '#f6a6c1',
    blue: '#9eddf8',
    orange: '#fdba74',
    purple: '#c4b5fd',
    mint: '#99f6e4',
    pearl: '#e2e8f0'
};

/**
 * 运行时缓存只保存在 content script 内存里。
 * 这样做的目的是彻底避免把扩展内部状态写进网页自己的 localStorage。
 */
const runtimeStore = {
    wrappedSourcesById: {},
    commentsById: {},
    colorsById: {},
    menuTop: '',
    uiLanguage: DEFAULT_UI_LANGUAGE,
    restoreSourcesById: {},
    pendingRestoreSourcesById: {},
    ignoredRemoveCacheIds: {},
    manualRestoreSource: null,
    isManualTextRestore: false,
    restoreRetryTimer: null,
    restoreObserver: null,
    restoreWatchStartedAt: 0,
    isRestoreRunning: false,
    restoreLoadListenerBound: false
};
let pageStorageWriteQueue = Promise.resolve()

/**
 * 内容页和配置页共用 uiLanguage。
 * 这里把所有非英文值都回退成中文，避免存储被写入异常值时出现未定义文案。
 * @param language
 * @returns {string}
 */
function normalizeUiLanguage(language) {
    return language === 'en' ? 'en' : 'zh'
}

/**
 * 读取当前语言对应的内容页文案。
 * 所有内容页按钮、标题、提示都统一从这里取，避免字符串散落在事件回调里。
 * @param key
 * @returns {string}
 */
function getContentText(key) {
    const language = normalizeUiLanguage(runtimeStore.uiLanguage)
    const currentLanguagePack = CONTENT_SCRIPT_TEXT[language] || CONTENT_SCRIPT_TEXT.zh

    return currentLanguagePack[key] || CONTENT_SCRIPT_TEXT.zh[key] || ''
}

/**
 * 读取颜色按钮当前语言下的 title。
 * 颜色值本身不跟语言耦合，只切换展示文案。
 * @param option
 * @returns {string}
 */
function getColorTitle(option) {
    const language = normalizeUiLanguage(runtimeStore.uiLanguage)

    if (!option || !option.title) {
        return ''
    }

    return option.title[language] || option.title.zh || ''
}

/**
 * 统一更新运行时语言并刷新已经渲染在页面上的扩展 UI。
 * 这样配置页切语言后，不需要刷新网页也能看到新的按钮文案。
 * @param language
 */
function setRuntimeUiLanguage(language) {
    runtimeStore.uiLanguage = normalizeUiLanguage(language)
    refreshRuntimeUiText()
}

/**
 * 当前页面的持久化 key 仍然放在扩展自己的 storage.local 中。
 * 这里统一生成 key，避免不同位置重复拼接字符串。
 */
function getCurrentPageStorageKey() {
    return PAGE_STORAGE_PREFIX + '-' + location.href.replace(location.hash, '')
}

/**
 * 数值边界收口。
 * 内容页浮层要避免贴边或跑出可视区，统一走这个方法更直观。
 * @param value
 * @param minValue
 * @param maxValue
 * @returns {number}
 */
function clampNumber(value, minValue, maxValue) {
    if (value < minValue) {
        return minValue
    }

    if (value > maxValue) {
        return maxValue
    }

    return value
}

/**
 * 基于划词后的 Range 计算悬浮按钮位置。
 * 按钮固定出现在选区下方，并且会在视口左右两侧做边界收口。
 * @param rect
 * @returns {{left: number, top: number}}
 */
function getFloatingButtonPositionByRect(rect) {
    const viewportLeft = window.pageXOffset
    const viewportTop = window.pageYOffset
    const viewportRight = viewportLeft + window.innerWidth
    const targetCenterX = rect.left + viewportLeft + rect.width / 2
    const left = clampNumber(
        targetCenterX - FLOATING_BUTTON_ESTIMATED_WIDTH / 2,
        viewportLeft + FLOATING_BUTTON_EDGE_GAP,
        viewportRight - FLOATING_BUTTON_ESTIMATED_WIDTH - FLOATING_BUTTON_EDGE_GAP
    )

    return {
        left: left,
        top: rect.bottom + viewportTop + FLOATING_BUTTON_OFFSET_Y
    }
}

/**
 * 统一从当前选区读取可视区域矩形。
 * 少数页面会返回 0 宽高矩形，这里做一次兜底判断。
 * @param selection
 * @returns {DOMRect|null}
 */
function getSelectionRect(selection) {
    if (!selection || selection.rangeCount === 0) {
        return null
    }

    try {
        const rect = selection.getRangeAt(0).getBoundingClientRect()

        if (!rect || (!rect.width && !rect.height)) {
            return null
        }

        return rect
    } catch (error) {
        return null
    }
}

/**
 * 高亮操作面板优先出现在高亮文本下方。
 * 如果视口底部空间不够，就自动翻到高亮文本上方。
 * 这里只负责给出“初始可用位置”，真正渲染后还会再按实际面板高度修正一次。
 * @param id
 * @param panelHeight
 * @returns {{left: number, top: number, placement: string}}
 */
function getEditorPositionByHighlight(id, panelHeight) {
    const doms = highlighter.getDoms(id)
    const measuredPanelHeight = panelHeight && panelHeight > 0 ? panelHeight : EDITOR_PANEL_ESTIMATED_HEIGHT

    if (!doms || doms.length === 0) {
        return {
            left: window.pageXOffset + EDITOR_EDGE_GAP,
            top: window.pageYOffset + EDITOR_PANEL_OFFSET_Y,
            placement: 'bottom'
        }
    }

    let minLeft = Number.POSITIVE_INFINITY
    let maxRight = Number.NEGATIVE_INFINITY
    let minTop = Number.POSITIVE_INFINITY
    let maxBottom = Number.NEGATIVE_INFINITY

    doms.forEach(function (dom) {
        const rect = dom.getBoundingClientRect()

        if (!rect || (!rect.width && !rect.height)) {
            return
        }

        if (rect.left < minLeft) {
            minLeft = rect.left
        }

        if (rect.right > maxRight) {
            maxRight = rect.right
        }

        if (rect.top < minTop) {
            minTop = rect.top
        }

        if (rect.bottom > maxBottom) {
            maxBottom = rect.bottom
        }
    })

    if (
        !Number.isFinite(minLeft) ||
        !Number.isFinite(maxRight) ||
        !Number.isFinite(minTop) ||
        !Number.isFinite(maxBottom)
    ) {
        return {
            left: window.pageXOffset + EDITOR_EDGE_GAP,
            top: window.pageYOffset + EDITOR_PANEL_OFFSET_Y,
            placement: 'bottom'
        }
    }

    const viewportLeft = window.pageXOffset
    const viewportTop = window.pageYOffset
    const viewportRight = viewportLeft + window.innerWidth
    const viewportBottom = viewportTop + window.innerHeight
    const targetCenterX = (minLeft + maxRight) / 2 + viewportLeft
    const left = clampNumber(
        targetCenterX - EDITOR_PANEL_WIDTH / 2,
        viewportLeft + EDITOR_EDGE_GAP,
        viewportRight - EDITOR_PANEL_WIDTH - EDITOR_EDGE_GAP
    )
    const belowTop = maxBottom + viewportTop + EDITOR_PANEL_OFFSET_Y
    const aboveTop = minTop + viewportTop - measuredPanelHeight - EDITOR_PANEL_OFFSET_Y
    const canPlaceBelow = belowTop + measuredPanelHeight + EDITOR_EDGE_GAP <= viewportBottom
    const canPlaceAbove = aboveTop >= viewportTop + EDITOR_EDGE_GAP

    if (!canPlaceBelow && canPlaceAbove) {
        return {
            left: left,
            top: aboveTop,
            placement: 'top'
        }
    }

    if (canPlaceBelow) {
        return {
            left: left,
            top: belowTop,
            placement: 'bottom'
        }
    }

    /**
     * 如果上下都不够完整容纳，就挑“溢出更少”的一边。
     * 这样在极窄视口里也至少能尽量多地露出面板本体，而不是固定压到屏幕外。
     */
    const belowOverflow = Math.max(0, belowTop + measuredPanelHeight + EDITOR_EDGE_GAP - viewportBottom)
    const aboveOverflow = Math.max(0, viewportTop + EDITOR_EDGE_GAP - aboveTop)

    if (aboveOverflow < belowOverflow) {
        return {
            left: left,
            top: Math.max(viewportTop + EDITOR_EDGE_GAP, aboveTop),
            placement: 'top'
        }
    }

    return {
        left: left,
        top: clampNumber(
            belowTop,
            viewportTop + EDITOR_EDGE_GAP,
            Math.max(viewportTop + EDITOR_EDGE_GAP, viewportBottom - measuredPanelHeight - EDITOR_EDGE_GAP)
        ),
        placement: 'bottom'
    }
}

/**
 * 恢复高亮时只比较“文本内容是否一致”，不比较 DOM 结构。
 * 页面刷新后换行和空白经常会轻微变化，所以这里只做空白折叠。
 * @param text
 * @returns {string}
 */
function normalizeHighlightText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim()
}

/**
 * 新高亮在创建时把前后文一起写进 extra。
 * 老数据没有这份信息，所以恢复时只能退回旧元数据和页面坐标。
 * 新数据带上前后文后，后续页面结构轻微变化时会稳定很多。
 * @param start
 * @param end
 * @param rootNode
 * @returns {{restoreContext: {prefixText: string, suffixText: string}}}
 */
function buildRestoreRecordInfo(start, end, rootNode) {
    const restoreContext = {
        prefixText: '',
        suffixText: ''
    }

    if (!rootNode || !start || !end || !start.$node || !end.$node) {
        return {restoreContext: restoreContext}
    }

    try {
        const prefixRange = document.createRange()
        prefixRange.setStart(rootNode, 0)
        prefixRange.setEnd(start.$node, start.offset || 0)
        restoreContext.prefixText = normalizeHighlightText(prefixRange.toString()).slice(-RESTORE_CONTEXT_LENGTH)
    } catch (error) {
        restoreContext.prefixText = ''
    }

    try {
        const suffixRange = document.createRange()
        suffixRange.setStart(end.$node, end.offset || 0)
        suffixRange.setEnd(rootNode, rootNode.childNodes.length)
        restoreContext.suffixText = normalizeHighlightText(suffixRange.toString()).slice(0, RESTORE_CONTEXT_LENGTH)
    } catch (error) {
        restoreContext.suffixText = ''
    }

    return {restoreContext: restoreContext}
}

/**
 * 创建一个安全的 DOM Range 文本读取。
 * 高亮库恢复出的起止点如果有问题，这里会直接返回空串，避免再抛异常。
 * @param start
 * @param end
 * @returns {string}
 */
function getTextFromDomPoints(start, end) {
    if (!start || !end || !start.$node || !end.$node) {
        return ''
    }

    try {
        const range = document.createRange()
        range.setStart(start.$node, start.offset || 0)
        range.setEnd(end.$node, end.offset || 0)
        return range.toString()
    } catch (error) {
        return ''
    }
}

/**
 * 找到两个节点最近的公共祖先。
 * 后面做恢复兜底时，会优先在这个局部区域里找目标文本，减少误匹配。
 * @param leftNode
 * @param rightNode
 * @returns {Node|null}
 */
function getCommonAncestorNode(leftNode, rightNode) {
    if (!leftNode || !rightNode) {
        return null
    }

    let currentNode = leftNode

    while (currentNode) {
        if (currentNode.contains && currentNode.contains(rightNode)) {
            return currentNode
        }

        currentNode = currentNode.parentNode
    }

    return null
}

/**
 * 过滤掉扩展自身 UI 和无意义标签里的文本节点。
 * 恢复兜底搜索必须只看网页正文，不能把左侧菜单、弹层里的文字也当成候选。
 * @param textNode
 * @returns {boolean}
 */
function shouldSkipRestoreTextNode(textNode) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        return true
    }

    const parentElement = textNode.parentElement

    if (!parentElement) {
        return true
    }

    if (RESTORE_IGNORE_TAGS[parentElement.tagName]) {
        return true
    }

    if (parentElement.closest(RESTORE_UI_EXCLUDE_SELECTOR)) {
        return true
    }

    /**
     * 普通正文里纯空白文本节点基本没有恢复价值，直接跳过可以减少噪音。
     * 但代码块、预格式化文本里的换行和缩进本身就是内容结构的一部分，
     * 如果这里一刀切跳过，刷新后就很容易出现“高亮文本找不到”的情况。
     */
    if (!textNode.textContent || !textNode.textContent.trim()) {
        if (!parentElement.closest('pre, code')) {
            return true
        }
    }

    return false
}

/**
 * 把根节点里的文本压平成“归一化字符序列”。
 * 这里会把连续空白折叠成一个空格，并记录每个字符对应的原始 DOM 起止位置。
 * 这样既能容忍换行/空格变化，又能把匹配结果重新映射回真实 Range。
 * @param rootNode
 * @returns {{fullText: string, entries: Array}}
 */
function buildRestoreSearchIndex(rootNode) {
    const entries = []
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false)
    let currentNode = walker.nextNode()

    while (currentNode) {
        if (!shouldSkipRestoreTextNode(currentNode)) {
            const rawText = currentNode.textContent || ''

            for (let index = 0; index < rawText.length; index++) {
                const currentChar = rawText.charAt(index)
                const isWhitespace = /\s/.test(currentChar)
                const lastEntry = entries.length ? entries[entries.length - 1] : null

                if (isWhitespace) {
                    if (!lastEntry || lastEntry.char === ' ') {
                        if (lastEntry && lastEntry.char === ' ') {
                            lastEntry.end = {
                                $node: currentNode,
                                offset: index + 1
                            }
                        }

                        continue
                    }

                    entries.push({
                        char: ' ',
                        start: {
                            $node: currentNode,
                            offset: index
                        },
                        end: {
                            $node: currentNode,
                            offset: index + 1
                        }
                    })

                    continue
                }

                entries.push({
                    char: currentChar,
                    start: {
                        $node: currentNode,
                        offset: index
                    },
                    end: {
                        $node: currentNode,
                        offset: index + 1
                    }
                })
            }
        }

        currentNode = walker.nextNode()
    }

    while (entries.length && entries[0].char === ' ') {
        entries.shift()
    }

    while (entries.length && entries[entries.length - 1].char === ' ') {
        entries.pop()
    }

    return {
        fullText: entries.map(function (entry) {
            return entry.char
        }).join(''),
        entries: entries
    }
}

/**
 * 把归一化文本上的命中区间映射回 DOM Range 所需的起止点。
 * @param searchIndex
 * @param startIndex
 * @param endIndex
 * @returns {{start: {$node: *, offset: number}, end: {$node: *, offset: number}}|null}
 */
function resolveRestoreRangeFromIndex(searchIndex, startIndex, endIndex) {
    if (!searchIndex || !searchIndex.entries || !searchIndex.entries.length) {
        return null
    }

    const startEntry = searchIndex.entries[startIndex]
    const endEntry = searchIndex.entries[endIndex - 1]

    if (!startEntry || !endEntry) {
        return null
    }

    return {
        start: startEntry.start,
        end: endEntry.end
    }
}

/**
 * 在指定根节点下按“归一化文本”搜索高亮原文。
 * 这样可以兼容页面因为换行、缩进、额外空格导致的轻微结构变化。
 * @param rootNode
 * @param targetText
 * @returns {Array}
 */
function findRestoreMatchesInRoot(rootNode, targetText) {
    const normalizedTargetText = normalizeHighlightText(targetText)

    if (!rootNode || !normalizedTargetText) {
        return []
    }

    const searchIndex = buildRestoreSearchIndex(rootNode)

    if (!searchIndex.fullText) {
        return []
    }

    const matches = []
    let searchStartIndex = 0
    let foundIndex = searchIndex.fullText.indexOf(normalizedTargetText, searchStartIndex)

    while (foundIndex !== -1) {
        const mappedRange = resolveRestoreRangeFromIndex(
            searchIndex,
            foundIndex,
            foundIndex + normalizedTargetText.length
        )

        if (mappedRange) {
            matches.push({
                start: mappedRange.start,
                end: mappedRange.end,
                startIndex: foundIndex,
                endIndex: foundIndex + normalizedTargetText.length,
                searchIndex: searchIndex
            })
        }

        searchStartIndex = foundIndex + 1
        foundIndex = searchIndex.fullText.indexOf(normalizedTargetText, searchStartIndex)
    }

    return matches
}

/**
 * 读取存储里可选的前后文锚点。
 * 老数据没有 extra.restoreContext，调用方需要自动回退。
 * @param storedSource
 * @returns {{prefixText: string, suffixText: string}}
 */
function getStoredRestoreContext(storedSource) {
    const restoreContext = storedSource && storedSource.extra && storedSource.extra.restoreContext

    return {
        prefixText: normalizeHighlightText(restoreContext && restoreContext.prefixText),
        suffixText: normalizeHighlightText(restoreContext && restoreContext.suffixText)
    }
}

/**
 * 统计两个字符串从左侧开始连续相同的字符数。
 * 恢复时不要求上下文完全一致，但相同越长，命中的可信度越高。
 * @param leftText
 * @param rightText
 * @returns {number}
 */
function getSamePrefixLength(leftText, rightText) {
    const length = Math.min(leftText.length, rightText.length)
    let index = 0

    while (index < length && leftText.charAt(index) === rightText.charAt(index)) {
        index++
    }

    return index
}

/**
 * 统计两个字符串从右侧开始连续相同的字符数。
 * 前文更适合用“后缀相同”判断，因为真正有效的是命中前紧贴着高亮的那段文本。
 * @param leftText
 * @param rightText
 * @returns {number}
 */
function getSameSuffixLength(leftText, rightText) {
    const length = Math.min(leftText.length, rightText.length)
    let index = 0

    while (
        index < length &&
        leftText.charAt(leftText.length - 1 - index) === rightText.charAt(rightText.length - 1 - index)
    ) {
        index++
    }

    return index
}

/**
 * 根据存储的前后文给某个候选命中打分。
 * 新数据会带上 restoreContext，命中上下文越贴近，分数越高。
 * @param match
 * @param storedSource
 * @returns {number}
 */
function getRestoreContextScore(match, storedSource) {
    const restoreContext = getStoredRestoreContext(storedSource)
    let score = 0

    if (restoreContext.prefixText) {
        const actualPrefix = match.searchIndex.fullText.slice(
            Math.max(0, match.startIndex - restoreContext.prefixText.length),
            match.startIndex
        )

        score += getSameSuffixLength(actualPrefix, restoreContext.prefixText) * 40

        if (actualPrefix === restoreContext.prefixText) {
            score += restoreContext.prefixText.length * 120
        }
    }

    if (restoreContext.suffixText) {
        const actualSuffix = match.searchIndex.fullText.slice(
            match.endIndex,
            match.endIndex + restoreContext.suffixText.length
        )

        score += getSamePrefixLength(actualSuffix, restoreContext.suffixText) * 40

        if (actualSuffix === restoreContext.suffixText) {
            score += restoreContext.suffixText.length * 120
        }
    }

    return score
}

/**
 * 读取候选命中和旧页面坐标之间的距离。
 * 老数据没有上下文时，position 是仅剩的可用辅助定位信息。
 * @param match
 * @param storedSource
 * @returns {number}
 */
function getRestorePositionDistance(match, storedSource) {
    if (!storedSource || !storedSource.position) {
        return Number.POSITIVE_INFINITY
    }

    try {
        const range = document.createRange()
        range.setStart(match.start.$node, match.start.offset)
        range.setEnd(match.end.$node, match.end.offset)

        const rect = range.getBoundingClientRect()

        return Math.abs(rect.top + window.pageYOffset - storedSource.position.top) +
            Math.abs(rect.left + window.pageXOffset - storedSource.position.left)
    } catch (error) {
        return Number.POSITIVE_INFINITY
    }
}

/**
 * 把可能的根节点加入候选列表。
 * 这里统一去重，并把文本节点自动抬到父元素，避免后续 TreeWalker 根节点异常。
 * @param candidateRoots
 * @param rootNode
 */
function pushRestoreCandidateRoot(candidateRoots, rootNode) {
    if (!rootNode) {
        return
    }

    let normalizedRootNode = rootNode

    if (normalizedRootNode.nodeType === Node.TEXT_NODE) {
        normalizedRootNode = normalizedRootNode.parentElement
    }

    if (!normalizedRootNode || normalizedRootNode.nodeType !== Node.ELEMENT_NODE) {
        return
    }

    if (candidateRoots.indexOf(normalizedRootNode) === -1) {
        candidateRoots.push(normalizedRootNode)
    }
}

/**
 * 旧元数据里只有“父标签名 + 同标签序号”。
 * 页面轻微改版时，这个序号通常只会偏移几位，所以这里在附近窗口里补一轮搜索。
 * @param candidateRoots
 * @param meta
 */
function appendMetaCandidateRoots(candidateRoots, meta) {
    if (!meta || !meta.parentTagName || typeof meta.parentIndex !== 'number' || meta.parentIndex < 0) {
        return
    }

    const elements = document.getElementsByTagName(meta.parentTagName)

    if (!elements || elements.length === 0) {
        return
    }

    const startIndex = Math.max(0, meta.parentIndex - RESTORE_META_INDEX_WINDOW)
    const endIndex = Math.min(elements.length - 1, meta.parentIndex + RESTORE_META_INDEX_WINDOW)

    for (let index = startIndex; index <= endIndex; index++) {
        pushRestoreCandidateRoot(candidateRoots, elements[index])
        pushRestoreCandidateRoot(candidateRoots, elements[index] && elements[index].parentElement)
    }
}

/**
 * 汇总一条高亮当前可用的全部恢复候选根节点。
 * 顺序从“最局部、最像原位置”到“整页兜底”。
 * @param storedSource
 * @param guessedStart
 * @param guessedEnd
 * @returns {Array}
 */
function collectRestoreCandidateRoots(storedSource, guessedStart, guessedEnd) {
    const candidateRoots = []
    const commonAncestor = getCommonAncestorNode(
        guessedStart ? guessedStart.$node : null,
        guessedEnd ? guessedEnd.$node : null
    )

    pushRestoreCandidateRoot(candidateRoots, commonAncestor)
    /**
     * 代码高亮页常见结构是 pre/code/span 多层嵌套。
     * 这里把最近的 pre/code 容器也加入候选，避免公共祖先过细时只搜到局部 token。
     */
    pushRestoreCandidateRoot(
        candidateRoots,
        commonAncestor && commonAncestor.nodeType === Node.ELEMENT_NODE
            ? commonAncestor.closest('pre, code')
            : null
    )
    appendMetaCandidateRoots(candidateRoots, storedSource && storedSource.startMeta)
    appendMetaCandidateRoots(candidateRoots, storedSource && storedSource.endMeta)
    pushRestoreCandidateRoot(candidateRoots, document.body)

    return candidateRoots
}

/**
 * 多个相同文本命中时，优先使用最接近原始页面位置的那个。
 * 这是当前存量数据里最稳定的附加定位信息。
 * @param matches
 * @param storedSource
 * @returns {*|null}
 */
function pickBestRestoreMatch(matches, storedSource) {
    if (!Array.isArray(matches) || matches.length === 0) {
        return null
    }

    let bestMatch = matches[0]
    let bestScore = Number.NEGATIVE_INFINITY
    let bestDistance = Number.POSITIVE_INFINITY

    matches.forEach(function (match) {
        const contextScore = getRestoreContextScore(match, storedSource)
        const distance = getRestorePositionDistance(match, storedSource)
        let totalScore = contextScore

        if (Number.isFinite(distance)) {
            totalScore = totalScore * 1000 - distance
        }

        if (totalScore > bestScore || (totalScore === bestScore && distance < bestDistance)) {
            bestScore = totalScore
            bestDistance = distance
            bestMatch = match
        }
    })

    return bestMatch ? {
        start: bestMatch.start,
        end: bestMatch.end
    } : null
}

/**
 * 当高亮库按原始元数据恢复出来的文本不正确时，
 * 再用“精确高亮文本 + 原始位置”做一次保守恢复。
 * @param storedSource
 * @param guessedStart
 * @param guessedEnd
 * @returns {*|null}
 */
function resolveRestoreRangeFromText(storedSource, guessedStart, guessedEnd) {
    if (!storedSource || !storedSource.text) {
        return null
    }

    const candidateRoots = collectRestoreCandidateRoots(storedSource, guessedStart, guessedEnd)
    const matches = []

    for (let index = 0; index < candidateRoots.length; index++) {
        matches.push.apply(matches, findRestoreMatchesInRoot(candidateRoots[index], storedSource.text))
    }

    return pickBestRestoreMatch(matches, storedSource)
}

/**
 * 读取某条高亮当前实际渲染出来的文本。
 * 恢复完成后会拿它和存储文本做一次比对，防止整段错高亮被保留下来。
 * @param id
 * @returns {string}
 */
function getRenderedHighlightText(id) {
    if (!highlighter) {
        return ''
    }

    let text = ''

    highlighter.getDoms(id).forEach(function (dom) {
        text += dom.textContent || ''
    })

    return text
}

/**
 * 恢复后做一次最终校验。
 * 如果渲染结果和原始选中文本对不上，宁可不恢复，也不能把整段错误高亮留在页面上。
 * @param hs
 * @returns {boolean}
 */
function validateRestoredHighlight(hs) {
    const renderedText = normalizeHighlightText(getRenderedHighlightText(hs.id))
    const targetText = normalizeHighlightText(hs.text)

    if (!renderedText || !targetText) {
        return false
    }

    return renderedText === targetText
}

/**
 * 清空当前页面的运行时缓存。
 * 页面重新恢复高亮前必须先重置，避免旧页面状态残留。
 */
function resetRuntimeStore() {
    if (runtimeStore.restoreRetryTimer) {
        clearTimeout(runtimeStore.restoreRetryTimer)
    }

    if (runtimeStore.restoreObserver) {
        runtimeStore.restoreObserver.disconnect()
    }

    runtimeStore.wrappedSourcesById = {}
    runtimeStore.commentsById = {}
    runtimeStore.colorsById = {}
    runtimeStore.restoreSourcesById = {}
    runtimeStore.pendingRestoreSourcesById = {}
    runtimeStore.ignoredRemoveCacheIds = {}
    runtimeStore.manualRestoreSource = null
    runtimeStore.isManualTextRestore = false
    runtimeStore.restoreRetryTimer = null
    runtimeStore.restoreObserver = null
    runtimeStore.restoreWatchStartedAt = 0
    runtimeStore.isRestoreRunning = false
    runtimeStore.restoreLoadListenerBound = false
}

/**
 * 把一条高亮记录写入运行时缓存。
 * 后续修改评论、颜色时会直接从这里拿原始高亮 source。
 * @param wrappedSource
 */
function cacheWrappedSource(wrappedSource) {
    if (!wrappedSource || !wrappedSource.hs || !wrappedSource.hs.id) {
        return
    }

    runtimeStore.wrappedSourcesById[wrappedSource.hs.id] = wrappedSource
}

/**
 * 批量缓存新建的高亮记录。
 * @param wrappedSources
 */
function cacheWrappedSources(wrappedSources) {
    if (!Array.isArray(wrappedSources)) {
        return
    }

    wrappedSources.forEach(function (wrappedSource) {
        cacheWrappedSource(wrappedSource)
    })
}

/**
 * 恢复历史高亮时，把评论和颜色一起放进内存缓存。
 * 这样 hover、改色、改评论都不需要读取页面存储。
 * @param hs
 */
function cacheRestoredSource(hs) {
    if (!hs || !hs.id) {
        return
    }

    cacheWrappedSource({hs: hs})
    setHighlightComment(hs.id, hs.comment || '')
    setHighlightColor(hs.id, hs.color || DEFAULT_HIGHLIGHT_COLOR)
}

/**
 * 根据高亮 id 读取缓存里的完整记录。
 * @param id
 * @returns {*|null}
 */
function getWrappedSource(id) {
    return runtimeStore.wrappedSourcesById[id] || null
}

/**
 * 统一管理评论缓存。
 * 空字符串代表当前高亮没有评论，此时会把旧评论删除掉。
 * @param id
 * @param comment
 */
function setHighlightComment(id, comment) {
    if (!id) {
        return
    }

    if (comment) {
        runtimeStore.commentsById[id] = comment
        return
    }

    delete runtimeStore.commentsById[id]
}

/**
 * 获取某个高亮的评论。
 * @param id
 * @returns {string}
 */
function getHighlightComment(id) {
    return runtimeStore.commentsById[id] || ''
}

/**
 * 统一管理高亮颜色缓存。
 * @param id
 * @param color
 */
function setHighlightColor(id, color) {
    if (!id) {
        return
    }

    runtimeStore.colorsById[id] = color || DEFAULT_HIGHLIGHT_COLOR
}

/**
 * 获取高亮颜色，默认回退到黄色。
 * @param id
 * @returns {string}
 */
function getHighlightColor(id) {
    return runtimeStore.colorsById[id] || DEFAULT_HIGHLIGHT_COLOR
}

/**
 * 左侧目录前面的圆点直接使用当前高亮颜色。
 * 这里单独把颜色值映射成稳定的十六进制，避免依赖页面里的 class 样式去猜颜色。
 * @param id
 * @returns {string}
 */
function getAnchorMarkerColor(id) {
    const color = getHighlightColor(id)

    if (!SIDEBAR_MARKER_COLOR_MAP[color]) {
        return SIDEBAR_MARKER_COLOR_MAP[DEFAULT_HIGHLIGHT_COLOR]
    }

    return SIDEBAR_MARKER_COLOR_MAP[color]
}

/**
 * 删除单条高亮的全部运行时状态。
 * @param id
 */
function removeCachedHighlight(id) {
    delete runtimeStore.wrappedSourcesById[id]
    delete runtimeStore.commentsById[id]
    delete runtimeStore.colorsById[id]
}

/**
 * 只移除页面上的错误高亮，不清空内存里的原始记录。
 * 恢复失败后后面还要继续重试，所以这里不能把缓存一起删掉。
 * @param id
 */
function removeHighlightDomPreserveCache(id) {
    if (!id) {
        return
    }

    runtimeStore.ignoredRemoveCacheIds[id] = true
    highlighter.removeClass('highlight-wrap-hover', id)
    highlighter.remove(id)
    removeAnchorItemById(id)
    $("#johns-editor").remove()
}

/**
 * 应用某条高亮当前缓存里的颜色 class。
 * 恢复成功后统一走这个方法，避免页面上残留默认色。
 * @param id
 */
function applyHighlightColorClass(id) {
    $("i.highlight-mengshou-wrap[data-highlight-id='" + id + "']").attr(
        'class',
        'highlight-mengshou-wrap annotation ' + getHighlightColor(id)
    )
}

/**
 * 手动文本恢复成功后，把最新的元数据静默写回扩展存储。
 * 这样下一次刷新时就不必再次撞旧的 startMeta/endMeta。
 * @param hs
 */
function syncRestoredSourceMeta(hs) {
    if (!hs || !hs.id) {
        return
    }

    const doms = highlighter.getDoms(hs.id)

    if (doms && doms[0]) {
        hs.position = getPosition(doms[0])
    }

    cacheWrappedSource({hs: hs})
    persistWrappedSources([{hs: hs}])

    chrome.runtime.sendMessage({
        from: "content_js",
        action: 'add',
        data: {
            href: location.href.replace(location.hash, ''),
            sources: [hs]
        }
    }, function () {
    })
}

/**
 * 把老记录上的展示字段合并到手动恢复生成的新 source 上。
 * fromRange 会产出新的 startMeta/endMeta/extra，但评论、颜色、标题等页面信息仍然沿用旧值。
 * @param currentSource
 * @param storedSource
 * @returns {*}
 */
function mergeStoredSourceMetadata(currentSource, storedSource) {
    if (!currentSource || !storedSource) {
        return currentSource
    }

    currentSource.comment = storedSource.comment || ''
    currentSource.color = storedSource.color || DEFAULT_HIGHLIGHT_COLOR
    currentSource.href = storedSource.href || location.href.replace(location.hash, '')
    currentSource.title = storedSource.title || document.title
    currentSource.icon = storedSource.icon || ''
    currentSource.readDate = storedSource.readDate || ''
    currentSource.position = storedSource.position || {top: 0, left: 0}

    return currentSource
}

/**
 * 尝试用“手动构造 Range + 固定原始 id”的方式恢复高亮。
 * 这条链路专门处理 fromStore 仍然恢复错位、或者页面正文晚加载的场景。
 * @param storedSource
 * @returns {boolean}
 */
function tryManualRestore(storedSource) {
    const restoreRange = resolveRestoreRangeFromText(storedSource)

    if (!restoreRange) {
        return false
    }

    try {
        const range = document.createRange()
        range.setStart(restoreRange.start.$node, restoreRange.start.offset)
        range.setEnd(restoreRange.end.$node, restoreRange.end.offset)

        runtimeStore.manualRestoreSource = storedSource
        runtimeStore.isManualTextRestore = true

        const restoredSource = highlighter.fromRange(range)

        runtimeStore.manualRestoreSource = null
        runtimeStore.isManualTextRestore = false

        if (!restoredSource || !validateRestoredHighlight(storedSource)) {
            removeHighlightDomPreserveCache(storedSource.id)
            cacheRestoredSource(storedSource)
            return false
        }

        applyHighlightColorClass(storedSource.id)
        syncRestoredSourceMeta(restoredSource)

        return true
    } catch (error) {
        runtimeStore.manualRestoreSource = null
        runtimeStore.isManualTextRestore = false
        cacheRestoredSource(storedSource)
        return false
    }
}

/**
 * 单条高亮恢复的统一入口。
 * 先尝试高亮库自己的 fromStore，再在失败时退回到“手动 Range 恢复”。
 * @param storedSource
 * @returns {boolean}
 */
function tryRestoreStoredSource(storedSource) {
    if (!storedSource || !storedSource.id) {
        return true
    }

    if (validateRestoredHighlight(storedSource)) {
        applyHighlightColorClass(storedSource.id)
        return true
    }

    if (highlighter.getDoms(storedSource.id).length > 0) {
        removeHighlightDomPreserveCache(storedSource.id)
        cacheRestoredSource(storedSource)
    }

    runtimeStore.restoreSourcesById[storedSource.id] = storedSource

    const restoredSource = highlighter.fromStore(
        storedSource.startMeta,
        storedSource.endMeta,
        storedSource.text,
        storedSource.id,
        storedSource.extra
    )

    delete runtimeStore.restoreSourcesById[storedSource.id]

    if (restoredSource && validateRestoredHighlight(storedSource)) {
        applyHighlightColorClass(storedSource.id)
        return true
    }

    if (restoredSource || highlighter.getDoms(storedSource.id).length > 0) {
        removeHighlightDomPreserveCache(storedSource.id)
        cacheRestoredSource(storedSource)
    }

    return tryManualRestore(storedSource)
}

/**
 * 当前页是否还存在待恢复的高亮。
 * 恢复完全结束后可以停止 MutationObserver，避免一直监听正文变化。
 * @returns {boolean}
 */
function hasPendingRestoreSources() {
    return Object.keys(runtimeStore.pendingRestoreSourcesById).length > 0
}

/**
 * 安排下一轮恢复重试。
 * 多次 DOM 变化会被压成一次延迟执行，避免动态页面频繁突变时重复跑整页匹配。
 * @param delay
 */
function scheduleRestoreRetry(delay) {
    if (runtimeStore.restoreRetryTimer) {
        clearTimeout(runtimeStore.restoreRetryTimer)
    }

    runtimeStore.restoreRetryTimer = setTimeout(function () {
        runtimeStore.restoreRetryTimer = null
        runPendingRestore()
    }, delay)
}

/**
 * 停止这页的恢复观察器和重试定时器。
 * 恢复全部完成或者超过观察窗口时都要收口，避免长期挂在页面上。
 */
function stopRestoreWatch() {
    if (runtimeStore.restoreRetryTimer) {
        clearTimeout(runtimeStore.restoreRetryTimer)
        runtimeStore.restoreRetryTimer = null
    }

    if (runtimeStore.restoreObserver) {
        runtimeStore.restoreObserver.disconnect()
        runtimeStore.restoreObserver = null
    }
}

/**
 * 启动恢复观察。
 * 动态页面在 document_idle 之后仍然可能继续异步渲染正文，所以这里会在短时间内持续观察 DOM。
 */
function startRestoreWatch() {
    if (!hasPendingRestoreSources()) {
        return
    }

    if (!runtimeStore.restoreWatchStartedAt) {
        runtimeStore.restoreWatchStartedAt = Date.now()
    }

    if (!runtimeStore.restoreObserver && document.body) {
        runtimeStore.restoreObserver = new MutationObserver(function () {
            if (hasPendingRestoreSources()) {
                scheduleRestoreRetry(RESTORE_MUTATION_DEBOUNCE_MS)
            }
        })

        runtimeStore.restoreObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        })
    }

    if (!runtimeStore.restoreLoadListenerBound) {
        runtimeStore.restoreLoadListenerBound = true

        window.addEventListener('load', function () {
            if (hasPendingRestoreSources()) {
                scheduleRestoreRetry(0)
            }
        }, {once: true})
    }

    scheduleRestoreRetry(0)
}

/**
 * 执行一轮待恢复高亮的重试。
 * 成功的高亮会从 pending 列表里移除；剩余的继续等正文后续渲染完成。
 */
function runPendingRestore() {
    if (runtimeStore.isRestoreRunning) {
        return
    }

    if (!hasPendingRestoreSources()) {
        stopRestoreWatch()
        return
    }

    runtimeStore.isRestoreRunning = true

    Object.keys(runtimeStore.pendingRestoreSourcesById).forEach(function (id) {
        const storedSource = runtimeStore.pendingRestoreSourcesById[id]

        if (tryRestoreStoredSource(storedSource)) {
            delete runtimeStore.pendingRestoreSourcesById[id]
        }
    })

    runtimeStore.isRestoreRunning = false

    if (!hasPendingRestoreSources()) {
        stopRestoreWatch()
        return
    }

    if (Date.now() - runtimeStore.restoreWatchStartedAt < RESTORE_WATCH_MAX_MS) {
        scheduleRestoreRetry(RESTORE_RETRY_INTERVAL_MS)
        return
    }

    stopRestoreWatch()
}

/**
 * 菜单拖动位置属于扩展 UI 状态，写入扩展自己的 storage.local。
 * 这里只保存一个简单字符串，避免影响网页本身的数据。
 * @returns {Promise<string>}
 */
function restoreMenuTop() {
    return new Promise(function (resolve) {
        chrome.storage.local.get([MENU_POSITION_STORAGE_KEY], function (res) {
            runtimeStore.menuTop = normalizeMenuTop(res[MENU_POSITION_STORAGE_KEY])
            resolve(runtimeStore.menuTop)
        })
    })
}

/**
 * 菜单按钮只允许在当前视口内上下拖动。
 * 旧版本直接保存原始 top，页面高度一变就可能把按钮恢复到屏幕外。
 * @param top
 * @returns {string}
 */
function normalizeMenuTop(top) {
    if (typeof top !== 'string' || !top.trim()) {
        return ''
    }

    const numericTop = parseFloat(top)

    if (!Number.isFinite(numericTop)) {
        return ''
    }

    const maxTop = Math.max(MENU_TOP_EDGE_GAP, window.innerHeight - MENU_TOGGLE_SIZE - MENU_TOP_EDGE_GAP)
    const nextTop = clampNumber(numericTop, MENU_TOP_EDGE_GAP, maxTop)

    return nextTop + 'px'
}

/**
 * 保存拖动后的菜单位置。
 * @param top
 */
function saveMenuTop(top) {
    runtimeStore.menuTop = normalizeMenuTop(top)
    chrome.storage.local.set({[MENU_POSITION_STORAGE_KEY]: runtimeStore.menuTop}, function () {
    })
}

/**
 * 当前内容页也保留一条本地写队列。
 * 这样高亮创建后会先直接写入扩展存储，再异步通知后台页。
 * 即使用户立刻刷新，数据也不会因为消息链时序而丢失。
 * @param worker
 * @returns {Promise<*>}
 */
function queueCurrentPageStorageWrite(worker) {
    pageStorageWriteQueue = pageStorageWriteQueue
        .catch(function () {
        })
        .then(function () {
            return worker()
        })

    return pageStorageWriteQueue
}

/**
 * 读取当前页面的持久化高亮数据。
 * @returns {Promise<Array>}
 */
function getPersistedPageSources() {
    const storageKey = getCurrentPageStorageKey()

    return new Promise(function (resolve) {
        chrome.storage.local.get([storageKey], function (res) {
            if (!Array.isArray(res[storageKey])) {
                resolve([])
                return
            }

            resolve(res[storageKey])
        })
    })
}

/**
 * 覆盖写入当前页面的高亮数组。
 * 空数组时直接删除 key，避免留下无意义记录。
 * @param wrappedSources
 * @returns {Promise<void>}
 */
function setPersistedPageSources(wrappedSources) {
    const storageKey = getCurrentPageStorageKey()

    return new Promise(function (resolve) {
        if (!Array.isArray(wrappedSources) || wrappedSources.length === 0) {
            chrome.storage.local.remove([storageKey], function () {
                resolve()
            })
            return
        }

        chrome.storage.local.set({[storageKey]: wrappedSources}, function () {
            resolve()
        })
    })
}

/**
 * 把当前操作后的高亮记录直接写到扩展存储中。
 * 这里沿用 {hs} 结构，和后台页保持一致。
 * @param wrappedSources
 * @returns {Promise<void>}
 */
function persistWrappedSources(wrappedSources) {
    if (!Array.isArray(wrappedSources) || wrappedSources.length === 0) {
        return Promise.resolve()
    }

    return queueCurrentPageStorageWrite(async function () {
        const stores = await getPersistedPageSources()
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

        await setPersistedPageSources(stores)
    })
}

/**
 * 删除当前页面中某一条持久化高亮。
 * @param id
 * @returns {Promise<void>}
 */
function removePersistedHighlight(id) {
    return queueCurrentPageStorageWrite(async function () {
        const stores = await getPersistedPageSources()
        const nextStores = stores.filter(function (store) {
            return store && store.hs && store.hs.id !== id
        })

        await setPersistedPageSources(nextStores)
    })
}
const log = console.log.bind(console, '[highlighter]');

let isMove = false

const createTag = (top, left, id) => {
    const $span = document.createElement('span');
    $span.style.left = `${left - 20}px`;
    $span.style.top = `${top - 25}px`;
    $span.dataset['id'] = id;
    $span.textContent = '删除';
    $span.classList.add('my-remove-tip');
    document.body.appendChild($span);
};

function getPosition($node) {
    let offset = {
        top: 0,
        left: 0
    };
    while ($node) {
        offset.top += $node.offsetTop;
        offset.left += $node.offsetLeft;
        $node = $node.offsetParent;
    }

    return offset;
}

function copyToClipboard(t) {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.setAttribute('value', t);
    input.select();
    if (document.execCommand('copy')) {
        document.execCommand('copy');
        layer.msg(getContentText('copiedToClipboard'))
        // console.log('复制成功',t);
    }
    document.body.removeChild(input);
}

/**
 * 颜色按钮的 HTML 单独集中生成。
 * 颜色配置增加时只需要维护上面的常量，不需要再手改整段字符串。
 * @returns {string}
 */
function createColorButtonsHtml() {
    let html = ''

    COLOR_PICKER_OPTIONS.forEach(function (option) {
        html += "<button type=\"button\" data-color=\"" + option.value + "\" title=\"" + getColorTitle(option) + "\" class=\"js-color-picker color " + option.value + "\"></button>"
    })

    return html
}

/**
 * 配置页切换语言后，已经挂在网页上的扩展 UI 也要同步切换。
 * 这里不重置用户数据，只更新按钮文本和菜单标题。
 */
function refreshRuntimeUiText() {
    const $floatingButton = $("#johns-highlight .gtx-johns-icon")

    if ($floatingButton.length) {
        $floatingButton.text(getContentText('floatingActionLabel'))
    }

    const $menuHeading = $("#johns-menu-drag .johns-menu-heading")

    if ($menuHeading.length) {
        $menuHeading.text(getContentText('menuHeading'))
    }

    const $editor = $("#johns-editor")

    if ($editor.length) {
        const id = $editor.attr("data-id")
        const editorPosition = getEditorPositionByHighlight(id)

        createHtml(editorPosition.left, editorPosition.top, id, editorPosition.placement)
    }
}

function createHtml(left, top, id, placement) {
    $("#johns-editor").remove();

    let removeCommentClass = getHighlightComment(id) ? '' : ' editor-action-hidden';
    let placementClass = placement === 'top' ? ' editor-placement-top' : ''

    let html = "<div id=\"johns-editor\" class=\"" + placementClass.trim() + "\" data-id='" + id + "' style=\"z-index:100000000;left: " + left + "px; top: " + top + "px; display: block;\">" +
        "<div class=\"editor-panel\">" +
        "<div class=\"editor-section\">" +
        "<div class=\"editor-section-title\">" + getContentText('colorPalette') + "</div>" +
        "<div class=\"editor-color-grid\">" + createColorButtonsHtml() + "</div>" +
        "</div>" +
        "<div class=\"editor-section editor-actions\">" +
        "<button type=\"button\" class=\"editor-action js-copy\">" + getContentText('copyText') + "</button>" +
        "<button type=\"button\" class=\"editor-action js-input\">" + getContentText('addNote') + "</button>" +
        "<button type=\"button\" class=\"editor-action js-input-delete" + removeCommentClass + "\">" + getContentText('removeNote') + "</button>" +
        "<button type=\"button\" class=\"editor-action editor-action-danger js-remove-annotation\">" + getContentText('deleteHighlight') + "</button>" +
        "</div>" +
        "</div>" +
        "</div>"

    $("body").prepend(html)

    let color = getHighlightColor(id)

    $("#johns-editor .js-color-picker." + color).addClass('active')

    /**
     * 初始位置只用估算高度做判断。
     * 面板真实渲染出来后，再用实际高度重算一次，避免靠近视口底部时仍然出现半截被裁掉。
     */
    const $editor = $("#johns-editor")
    const editorHeight = $editor.outerHeight()

    if (editorHeight) {
        const adjustedPosition = getEditorPositionByHighlight(id, editorHeight)

        $editor
            .css({
                left: adjustedPosition.left + 'px',
                top: adjustedPosition.top + 'px'
            })
            .toggleClass('editor-placement-top', adjustedPosition.placement === 'top')
    }
}

/**
 * 备注保存逻辑单独抽出来。
 * 这样“点保存按钮”和“Ctrl/Cmd + Enter 提交”都能走同一条落盘流程，
 * 不会因为入口不同出现一个能同步、一个不同步的情况。
 * @param id
 * @param value
 */
function saveHighlightNote(id, value) {
    if (!value) {
        return
    }

    setHighlightComment(id, value)
    const wrappedSource = getWrappedSource(id)
    contactBackJs('add', wrappedSource)
    persistWrappedSources([wrappedSource])
    refreshAnchorItemById(id)
    layer.msg(getContentText('noteSaved'))
}

/**
 * 自定义备注输入弹窗。
 * 这里不用 layer.prompt 的默认表单，是为了把输入框、留白和按钮都收成扩展自己的风格。
 * @param id
 */
function openHighlightNoteDialog(id) {
    const currentText = getHighlightComment(id) || ''
    const contentHtml = "<div class='johns-note-dialog'>" +
        "<div class='johns-note-dialog-copy'>" + getContentText('notePromptHint') + "</div>" +
        "<textarea class='johns-note-textarea'></textarea>" +
        "</div>"

    layer.open({
        type: 1,
        title: getContentText('notePromptTitle'),
        skin: 'johns-note-layer',
        area: ['420px', 'auto'],
        resize: false,
        move: false,
        btn: [getContentText('saveAction'), getContentText('cancelAction')],
        content: contentHtml,
        success: function (layero) {
            const $textarea = $(layero).find('.johns-note-textarea')

            $textarea
                .attr('placeholder', getContentText('notePromptPlaceholder'))
                .val(currentText)

            setTimeout(function () {
                const textareaNode = $textarea[0]

                if (!textareaNode) {
                    return
                }

                textareaNode.focus()
                textareaNode.selectionStart = textareaNode.value.length
                textareaNode.selectionEnd = textareaNode.value.length
            }, 0)

            /**
             * 快捷键保存只在这个备注弹窗里生效。
             * 用 Ctrl/Cmd + Enter 提交，能减少每次都去点按钮的操作成本。
             */
            $textarea.on('keydown', function (event) {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault()
                    const currentLayerIndex = layero.attr('times')
                    const pass = $textarea.val()

                    saveHighlightNote(id, pass)
                    layer.close(currentLayerIndex)
                }
            })
        },
        yes: function (index, layero) {
            const pass = $(layero).find('.johns-note-textarea').val()

            saveHighlightNote(id, pass)
            layer.close(index)
        }
    })
}

/**
 * 锚点调转
 * @param id
 */
function goto(id) {
    let position = getPosition(highlighter.getDoms(id)[0])
    // console.log(position)
    const currentY = document.documentElement.scrollTop || document.body.scrollTop

    scrollAnimation(position.left, currentY, position.top - window.screen.availHeight / 2)
    // window.scrollTo(position.left, position.top - window.screen.availHeight / 2);
}

function handleText(text, len) {
    text = htmlspecialchars(text)
    let length = text.length

    if (length <= len) {
        return text
    }

    return text.substring(0, len) + '...'
}

/**
 * 左侧目录的单条记录统一从这里生成。
 * 标题固定左对齐，备注作为第二行灰色小字展示；右侧保留一个直接删除按钮。
 * @param id
 * @param text
 * @param left
 * @param top
 * @returns {string}
 */
function createAnchorItemHtml(id, text, left, top) {
    const comment = getHighlightComment(id)
    const markerColor = getAnchorMarkerColor(id)
    let noteHtml = ''

    if (comment) {
        noteHtml = "<span class='johns-tag-note'>" + handleText(comment, 34) + "</span>"
    }

    return "<li data-highlight-id='" + id + "' data-left='" + left + "' data-top='" + top + "'>" +
        "<span class='johns-tag-marker' style='background:" + markerColor + ";'></span>" +
        "<div class='johns-tag-row'>" +
        "<a id='" + id + "' href=\"javascript:void(0);\" title='" + text + "' class='johns-tag-goto'>" +
        "<span class='johns-tag-text'>" + handleText(text, 28) + "</span>" +
        noteHtml +
        "</a>" +
        "<button type='button' class='johns-tag-remove' data-id='" + id + "' title='" + getContentText('deleteHighlight') + "' aria-label='" + getContentText('deleteHighlight') + "'>×</button>" +
        "</div>" +
        "</li>"
}

/**
 * 左侧目录项改成了固定的 data-highlight-id 结构。
 * 删除和备注刷新都按高亮 id 精确命中，避免依赖 DOM 层级。
 * @param id
 */
function removeAnchorItemById(id) {
    if (!id) {
        return
    }

    $("#johns-tags li[data-highlight-id='" + id + "']").remove()
}

/**
 * 备注更新后，左侧目录项也需要同步刷新。
 * 这里直接按现有位置替换当前 li，不改它的排序信息。
 * @param id
 */
function refreshAnchorItemById(id) {
    const $currentItem = $("#johns-tags li[data-highlight-id='" + id + "']")
    const wrappedSource = getWrappedSource(id)

    if ($currentItem.length === 0 || !wrappedSource || !wrappedSource.hs) {
        return
    }

    const left = $currentItem.attr('data-left') || '0'
    const top = $currentItem.attr('data-top') || '0'

    $currentItem.replaceWith(createAnchorItemHtml(id, wrappedSource.hs.text || '', left, top))
}

function scrollAnimation(targetX, currentY, targetY) {
    // 获取当前位置方法

    // 计算需要移动的距离
    let needScrollTop = targetY - currentY
    let _currentY = currentY
    setTimeout(() => {
        // 一次调用滑动帧数，每次调用会不一样
        const dist = Math.ceil(needScrollTop / 10)
        _currentY += dist
        window.scrollTo(targetX, _currentY)
        // 如果移动幅度小于十个像素，直接移动，否则递归调用，实现动画效果
        if (needScrollTop > 10 || needScrollTop < -10) {
            scrollAnimation(targetX, _currentY, targetY)
        } else {
            window.scrollTo(targetX, targetY)
        }
    }, 1)
}

function mySort(a, b) {
    if (a.top !== b.top) {
        return a.top < b.top ? -1 : 1;
    }

    if (a.left !== b.left) {
        return a.left < b.left ? -1 : 1;
    }

    return -1;
}

/**
 * retrieve from local store
 */

function restore() {
    bg_key = getCurrentPageStorageKey()

    resetRuntimeStore()
    $("#johns-tags").empty()

    chrome.storage.local.get([bg_key], function (res) {
        if (Array.isArray(res[bg_key])) {
            res[bg_key].forEach(function (storeItem) {
                if (!storeItem || !storeItem.hs || !storeItem.hs.id) {
                    return
                }

                cacheRestoredSource(storeItem.hs)
                runtimeStore.pendingRestoreSourcesById[storeItem.hs.id] = storeItem.hs
            })
        }

        highlighter.stop()
        startRestoreWatch()
    })
}

//日期格式化
Date.prototype.Format = function (fmt) {
    let o = {
        "M+": this.getMonth() + 1, //月份
        "d+": this.getDate(), //日
        "h+": this.getHours(), //小时
        "m+": this.getMinutes(), //分
        "s+": this.getSeconds(), //秒
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度
        "S": this.getMilliseconds() //毫秒
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (let k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}

/**
 * avoid re-highlighting the existing selection
 */
function getIds(selected) {
    if (!selected || !selected.$node || !selected.$node.parentNode) {
        return [];
    }
    return [
        highlighter.getIdByDom(selected.$node.parentNode),
        ...highlighter.getExtraIdByDom(selected.$node.parentNode)
    ].filter(i => i)
}

function contactBackJs(action = 'add', sources) {
    let info = {
        href: location.href.replace(location.hash,''),
        host: location.host,
        title: document.title,
    };

    switch (action) {
        case 'add':
            if (!sources) {
                return
            }

            if (!Array.isArray(sources)) {
                if (!sources.hs) {
                    return
                }
                sources = [sources.hs];
            }

            let favicon = $("link[rel*='icon']")

            let icon

            if (favicon.length) {
                icon = favicon.attr('href')
            } else {
                icon = '/favicon.ico'
            }

            if (!/https?:/.test(icon)) {
                if (/^\/\w+/.test(icon)) {
                    icon = location.protocol + '//' + info.host + icon
                } else if (/^\w+/.test(icon)) {
                    icon = location.protocol + '//' + info.host + '/' + icon
                } else if (/^\/\/\w+/.test(icon)) {
                    icon = location.protocol + icon
                } else {
                    icon = ''
                }
            }


            sources.forEach(function (store, idx) {
                let position = getPosition(highlighter.getDoms(store.id)[0]);
                store.comment = getHighlightComment(store.id)
                store.color = getHighlightColor(store.id)
                store.href = info.href
                store.title = info.title
                store.icon = icon
                store.readDate = new Date().Format("yyyy-MM-dd hh:mm:ss")
                store.position = position
                sources[idx] = store

                $("i.highlight-mengshou-wrap[data-highlight-id='" + store.id + "']").attr('class', 'highlight-mengshou-wrap annotation ' + store.color)
            })

            info.sources = sources;

            break;
        case 'remove':
            info.sources = sources
            break;
    }

    chrome.runtime.sendMessage({from: "content_js", action: action, data: info}, function (response) {
    });
}

function getIntersection(arrA, arrB) {
    const record = {};
    const intersection = [];
    arrA.forEach(i => record[i] = true);
    arrB.forEach(i => record[i] && intersection.push(i) && (record[i] = false));
    return intersection;
}

/**
 * 只在当前页面内移除高亮，不向后台回写。
 * 这个方法给后台广播删除时复用，避免形成消息回环。
 * @param id
 */
function removeHighlightLocally(id) {
    removeCachedHighlight(id)
    highlighter.removeClass('highlight-wrap-hover', id);
    highlighter.remove(id);
    removeAnchorItemById(id)
    $("#johns-editor").remove();
}

function remove(id) {
    // log('*click remove-tip*', id);
    removeHighlightLocally(id)
    removePersistedHighlight(id)
    contactBackJs('remove', id)
}


/**
 * 拖动功能
 * @param id
 */
function dragFunc(id) {
    let Drag = document.getElementById(id);
    let beginX;
    let beginY;
    let endX;
    let endY;
    restoreMenuTop().then(function (oldY) {
        if (oldY) {
            Drag.style.top = oldY
            Drag.style.bottom = 'auto'
        }
    })

    Drag.onmousedown = function (event) {
        let ev = event || window.event;
        event.stopPropagation();
        let disX = ev.clientX - Drag.offsetLeft;
        let disY = ev.clientY - Drag.offsetTop;

        beginX = ev.clientX;
        beginY = ev.clientY;

        document.onmousemove = function (event) {
            let ev = event || window.event;
            // Drag.style.left = ev.clientX - disX + "px";
            Drag.style.top = normalizeMenuTop((ev.clientY - disY) + "px");
            Drag.style.bottom = 'auto'
            Drag.style.cursor = "move";
        };
    };
    Drag.onmouseup = function (e) {
        document.onmousemove = null;
        this.style.cursor = "default";
        endX = e.clientX;
        endY = e.clientY;

        if (Math.abs(endY - beginY) >= 5) {
            isMove = true
        } else {
            isMove = false
        }

        saveMenuTop(Drag.style.top)
    };
}


function buildButton(left, top) {
    $("body").append("<div id=\"johns-highlight\" style=\"z-index:9999999999;position: absolute; left: " + left + "px; top: " + top + "px;\"><button type=\"button\" class=\"gtx-johns-icon\">" + getContentText('floatingActionLabel') + "</button></div>")
}

function buildAnchor() {
    $("#johns-menu-drag").remove()
    $("body").prepend("<div id='johns-menu-drag' class=\"johns-menu-wrap\">\n" +
        "        <input type=\"checkbox\" id='john-checkbox' class=\"toggler\" autocomplete=\"off\">\n" +
        "        <div class=\"hamburger\"><div></div></div>\n" +
        "        <div class=\"johns-menu\" id='johns-ex-navbar'>\n" +
        "            <div>\n" +
        "                <div class='johns-menu-heading'>" + getContentText('menuHeading') + "</div>\n" +
        "                <ul id='johns-tags'>\n" +
        "                </ul>\n" +
        "            </div>\n" +
        "        </div>\n" +
        "    </div>")

    /**
     * 刷新后左下角按钮必须默认处于收起态。
     * 某些页面会把 checkbox 的旧状态短暂带回来，这里主动重置两次，避免按钮闪一下就消失。
     */
    const menuToggle = document.getElementById('john-checkbox')

    if (menuToggle) {
        menuToggle.checked = false

        requestAnimationFrame(function () {
            menuToggle.checked = false
        })
    }

    dragFunc('johns-menu-drag')
}

// auto-highlight selections
// highlighter.stop()

let hoveredTipId;
let layer_index = null
let highlighter

chrome.storage.sync.get(['setting', 'uiLanguage'], function (item) {
    const setting = item.setting || {use: true}
    setRuntimeUiLanguage(item.uiLanguage || DEFAULT_UI_LANGUAGE)

    if (!item.setting) {
        chrome.storage.sync.set({setting: setting})
    }

    if (!setting.use) {
        return;
    }

    buildAnchor()

    /**
     * 内容页直接监听 sync 里的语言切换。
     * 配置页一旦修改语言，这里会立刻刷新现有按钮和弹层文案。
     */
    chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== 'sync' || !changes.uiLanguage) {
            return
        }

        setRuntimeUiLanguage(changes.uiLanguage.newValue)
    })

    highlighter = new Highlighter({
        wrapTag: 'i',
        exceptSelectors: []
    });

    /**
     * 手动文本恢复时要沿用旧高亮 id。
     * 这里只在 manualRestoreSource 存在时覆写 UUID，正常用户新建高亮仍然走库自己的随机 id。
     */
    highlighter.hooks.Render.UUID.tap(function () {
        if (runtimeStore.manualRestoreSource && runtimeStore.manualRestoreSource.id) {
            return runtimeStore.manualRestoreSource.id
        }
    })

    /**
     * 新建高亮时记录前后文锚点。
     * 这部分数据只写进 source.extra，不影响旧数据结构。
     */
    highlighter.hooks.Serialize.RecordInfo.tap(function (start, end, rootNode) {
        return buildRestoreRecordInfo(start, end, rootNode)
    })

    /**
     * 高亮库按序列化元数据恢复时，如果页面结构变了，范围可能会被放大。
     * 这里先让库给出一个“猜测起止点”，如果猜出来的文本和原始高亮文本不一致，
     * 再回退到我们自己的精确文本搜索逻辑。
     */
    highlighter.hooks.Serialize.Restore.tap(function (guessedStart, guessedEnd) {
        const storedSource = runtimeStore.restoreSourcesById[this.id]

        if (!storedSource) {
            return [guessedStart, guessedEnd]
        }

        const guessedText = normalizeHighlightText(getTextFromDomPoints(guessedStart, guessedEnd))
        const targetText = normalizeHighlightText(storedSource.text)

        if (guessedText === targetText) {
            return [guessedStart, guessedEnd]
        }

        const fallbackRange = resolveRestoreRangeFromText(storedSource, guessedStart, guessedEnd)

        if (!fallbackRange) {
            return [guessedStart, guessedEnd]
        }

        return [fallbackRange.start, fallbackRange.end]
    })

    document.addEventListener('click', e => {
        const $ele = e.target;
        let shouldKeepMenuExpanded = false

        if ($($ele).parents('.johns-menu-wrap').length !== 0 && isMove) {
            $("#john-checkbox").click()
            isMove = false
            return false
        }

        isMove = false

        // delete highlight
        if ($ele.classList.contains('js-remove-annotation')) {
            e.preventDefault()
            const id = $($ele).parents("#johns-editor").attr("data-id")

            remove(id)
        } else if ($ele.classList.contains('js-copy')) {
            e.preventDefault()
            const id = $($ele).parents("#johns-editor").attr("data-id")
            let text = ''

            highlighter.getDoms(id).forEach(function (i) {
                text += i.textContent
            })

            copyToClipboard(text)
            // highlighter.removeClass('highlight-wrap-hover', id);
            // highlighter.remove(id);
            $("#johns-editor").remove();
        } else if ($ele.classList.contains('js-input')) {
            const id = $($ele).parents("#johns-editor").attr("data-id")
            e.preventDefault()

            openHighlightNoteDialog(id)

            $("#johns-editor").remove();
        } else if ($ele.classList.contains('js-input-delete')) {
            e.preventDefault()
            const id = $($ele).parents("#johns-editor").attr("data-id")

            setHighlightComment(id, '')

            const wrappedSource = getWrappedSource(id)
            contactBackJs('add', wrappedSource)
            persistWrappedSources([wrappedSource])
            refreshAnchorItemById(id)

            // layer.msg("done!")

            $("#johns-editor").remove();
        } else if ($ele.classList.contains("gtx-johns-icon")) {
            e.preventDefault()
            const selection = window.getSelection();
            if (selection.isCollapsed) {
                return;
            }
            highlighter.fromRange(selection.getRangeAt(0));
            window.getSelection().removeAllRanges();
            $("#johns-highlight").remove()
        } else if ($ele.classList.contains('johns-tag-remove')) {
            e.preventDefault()
            const id = $ele.getAttribute('data-id')
            shouldKeepMenuExpanded = true

            remove(id)
        } else if ($ele.classList.contains('johns-tag-goto')) {
            e.preventDefault()
            if ($ele.id) {
                let id = $ele.id
                let text = getHighlightComment(id)
                if (text) {
                    layer_index = layer.tips(text, "i.highlight-mengshou-wrap[data-highlight-id='" + id + "']", {
                        tips: [1, '#3595CC'],
                        time: 0
                    });
                }
                //锚点跳转
                goto(id)
            }
        } else if ($ele.classList.contains('js-color-picker') && $($ele).parents('#johns-editor').length !== 0) {
            //选择了颜色
            e.preventDefault()
            const id = $($ele).parents("#johns-editor").attr("data-id")

            let color = $($ele).attr('data-color');
            setHighlightColor(id, color)
            applyHighlightColorClass(id)

            $($ele).siblings('.active').removeClass('active')

            $($ele).addClass('active')

            const wrappedSource = getWrappedSource(id)
            contactBackJs('add', wrappedSource)
            persistWrappedSources([wrappedSource])
            refreshAnchorItemById(id)

        } else if (!$ele.classList.contains('highlight-mengshou-wrap')) {
            $("#johns-editor").remove();
        }

        if (
            !shouldKeepMenuExpanded &&
            $($ele).parents('.johns-menu').length === 0 &&
            $($ele).attr('id') !== 'john-checkbox' &&
            $("#john-checkbox").is(":checked")
        ) {
            $("#john-checkbox").click()
        }
    });

    document.addEventListener('mouseover', e => {
        const $ele = e.target;

        // toggle highlight hover state
        if ($ele.classList.contains('highlight-mengshou-wrap') && hoveredTipId !== $ele.dataset.id) {
            // hoveredTipId = $ele.dataset.id;
            // highlighter.removeClass('highlight-wrap-hover');
            // highlighter.addClass('highlight-wrap-hover', hoveredTipId);
        } else if (!$ele.classList.contains('highlight-mengshou-wrap')) {
            // highlighter.removeClass('highlight-wrap-hover', hoveredTipId);
            // hoveredTipId = null;

            layer.close(layer_index)
        }
    });

    document.addEventListener('mouseup', e => {
        let text = getSelectedText().toString()

        let $ele = e.target

        if (!$ele.classList.contains("gtx-johns-icon") && $($ele).parents('.johns-menu').length === 0) {
            $("#johns-highlight").remove()

            text = text.replace(/\s*/g, "");

            if (text) {
                const selectionRect = getSelectionRect(window.getSelection())

                if (selectionRect) {
                    const buttonPosition = getFloatingButtonPositionByRect(selectionRect)
                    buildButton(buttonPosition.left, buttonPosition.top)
                }
            }
        }
    });

    /**
     * 后台页在配置页删除高亮后，会主动通知已经打开的内容页同步移除。
     * 这里只做本地 DOM 和缓存清理，不再回写后台，避免重复删除。
     */
    chrome.runtime.onMessage.addListener(function (request) {
        if (!request || request.from !== 'bg_js' || !request.data) {
            return
        }

        if (request.data.href !== location.href.replace(location.hash, '')) {
            return
        }

        if (request.action === 'deleteHighlight') {
            removeHighlightLocally(request.data.id)
            return
        }

        if (request.action === 'updateHighlight' && request.data.source) {
            cacheRestoredSource(request.data.source)
            applyHighlightColorClass(request.data.source.id)
            refreshAnchorItemById(request.data.source.id)
            return
        }

        if (request.action === 'deletePage') {
            Object.keys(runtimeStore.wrappedSourcesById).forEach(function (id) {
                removeHighlightLocally(id)
            })
            $("#johns-tags").empty()
        }
    })

    highlighter
        .on(Highlighter.event.CLICK, ({id}) => {
            // event.preventDefault()
            const editorPosition = getEditorPositionByHighlight(id)
            createHtml(editorPosition.left, editorPosition.top, id, editorPosition.placement)
            // log('click -', id);
        })
        .on(Highlighter.event.HOVER, ({id}) => {
            // log('hover -', id);
            // highlighter.addClass('highlight-wrap-hover', id);

            let text = getHighlightComment(id)

            if (text) {
                layer_index = layer.tips(text, "i.highlight-mengshou-wrap[data-highlight-id='" + id + "']", {
                    tips: [1, '#3595CC'],
                    time: 0
                });
            }
        })
        .on(Highlighter.event.HOVER_OUT, ({id}) => {
            // log('hover out -', id);
            highlighter.removeClass('highlight-wrap-hover', id);

            if (layer_index) {
                layer.close(layer_index)
                layer_index = null
            }
        })
        .on(Highlighter.event.CREATE, ({sources, type}) => {
            // log('create -', sources);

            $("#johns-editor").remove();

            const isManualRestoreCreate = runtimeStore.isManualTextRestore &&
                runtimeStore.manualRestoreSource &&
                sources &&
                sources[0] &&
                sources[0].id === runtimeStore.manualRestoreSource.id
            const isRestoreCreate = type === 'from-store' || isManualRestoreCreate

            if (isManualRestoreCreate) {
                sources.forEach(function (source, index) {
                    sources[index] = mergeStoredSourceMetadata(source, runtimeStore.manualRestoreSource)
                })
            }

            if (!isRestoreCreate) {
                contactBackJs('add', sources)
                const wrappedSources = sources.map(function (hs) {
                    return {hs: hs}
                })

                cacheWrappedSources(wrappedSources)
                persistWrappedSources(wrappedSources)
            } else {
                cacheWrappedSources(sources.map(function (hs) {
                    return {hs: hs}
                }))
            }

            sources.forEach(s => {
                //增加锚点
                let position = getPosition(highlighter.getDoms(s.id)[0])

                if (isRestoreCreate) {
                    applyHighlightColorClass(s.id)
                }

                let selector = $("#johns-tags>li")

                let arr = []

                selector.each(function (index, v) {
                    let left = v.getAttribute('data-left')
                    let top = v.getAttribute('data-top')

                    arr.push({left: parseInt(left), top: parseInt(top), id: $(v).find('.johns-tag-goto').attr('id')});
                })

                arr.push({left: position.left, top: position.top, id: s.id})

                arr.sort(mySort)

                let index = arr.findIndex(function (v) {
                    return v.id === s.id
                })

                if (index > 0) {
                    $("#johns-tags").children("li:eq(" + (index - 1) + ")").after(createAnchorItemHtml(s.id, s.text, position.left, position.top))
                } else {
                    $("#johns-tags").prepend(createAnchorItemHtml(s.id, s.text, position.left, position.top))
                }
            });
        })
        .on(Highlighter.event.REMOVE, ({ids}) => {
            // log('remove -', ids);
            ids.forEach(function (id) {
                if (runtimeStore.ignoredRemoveCacheIds[id]) {
                    delete runtimeStore.ignoredRemoveCacheIds[id]
                    return
                }

                removeCachedHighlight(id)
            });
        });

    highlighter.hooks.Render.SelectedNodes.tap((id, selectedNodes) => {
        selectedNodes = selectedNodes.filter(n => n.$node.textContent);
        if (selectedNodes.length === 0) {
            return [];
        }

        const candidates = selectedNodes.slice(1).reduce(
            (left, selected) => getIntersection(left, getIds(selected)),
            getIds(selectedNodes[0])
        );
        for (let i = 0; i < candidates.length; i++) {
            if (highlighter.getDoms(candidates[i]).length === selectedNodes.length) {
                return [];
            }
        }

        return selectedNodes;
    });

    restore();
})
