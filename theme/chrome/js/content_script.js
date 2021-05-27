function getSelectedText() {
    let t = "";
    window.getSelection ? t = window.getSelection() : document.getSelection ? t = document.getSelection() : document.selection && (t = document.selection.createRange().text)

    return t
}

const store = new (class LocalStore {
    constructor(id) {
        this.key = id !== undefined ? `highlight-mengshou-${id}` : 'highlight-mengshou';
    }

    storeToJson() {
        const store = localStorage.getItem(this.key);
        let sources;
        try {
            sources = JSON.parse(store) || [];
        } catch (e) {
            sources = [];
        }
        return sources;
    }

    jsonToStore(stores) {
        localStorage.setItem(this.key, JSON.stringify(stores));
    }

    save(data) {
        const stores = this.storeToJson();
        const map = {};
        stores.forEach((store, idx) => map[store.hs.id] = idx);

        if (!Array.isArray(data)) {
            data = [data];
        }

        data.forEach(store => {
            // update
            if (map[store.hs.id] !== undefined) {
                stores[map[store.hs.id]] = store;
            }
            // append
            else {
                stores.push(store);
            }
        })
        this.jsonToStore(stores);
    }

    forceSave(store) {
        const stores = this.storeToJson();
        stores.push(store);
        this.jsonToStore(stores);
    }

    remove(id) {
        const stores = this.storeToJson();
        let index = null;
        for (let i = 0; i < stores.length; i++) {
            if (stores[i].hs.id === id) {
                index = i;
                break;
            }
        }
        stores.splice(index, 1);
        this.jsonToStore(stores);
    }

    getAll() {
        return this.storeToJson();
    }

    get(id) {
        const stores = this.storeToJson();
        let index = null;
        for (let i = 0; i < stores.length; i++) {
            if (stores[i].hs.id === id) {
                index = i;
                break;
            }
        }
        return stores[index]
    }

    removeAll() {
        this.jsonToStore([]);
    }
});
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
        layer.msg('Copy success!')
        // console.log('复制成功',t);
    }
    document.body.removeChild(input);
}

function createHtml(left, top, id) {
    $("#johns-editor").remove();

    let display = localStorage.getItem(id) ? 'list-item' : 'none';

    let html = "<div id=\"johns-editor\" data-id='" + id + "' style=\"z-index:100000000;left: " + left + "px; top: " + top + "px; display: block;\"><ul class=\"dropdown-list\"><li class=\"colors\" style=\"display: list-item;\"><span data-color=\"yellow\" class=\"js-color-picker color yellow \"></span><span data-color=\"green\" class=\"js-color-picker color green \"></span><span data-color=\"pink\" class=\"js-color-picker color pink \"></span><span data-color=\"blue\" class=\"js-color-picker color blue \"></span></li><li style='text-align: center'><a  onclick='return false;'  href=\"#\" class=\"js-copy\">copy</a></li><li class=\"js-remove-annotation-wrapper\" style=\"display: list-item;text-align: center\"><a href=\"#\" onclick='return false;' class=\"js-remove-annotation\">remove</a></li><li style='text-align: center'><a  onclick='return false;'  href=\"#\" class=\"js-input\">comment</a></li><li style='text-align: center;display: " + display + "'><a  onclick='return false;'  href=\"#\" class=\"js-input-delete\">remove comment</a></li></ul></div>"

    $("body").prepend(html)

    let color = localStorage.getItem(id + '-color') || 'yellow'

    $("#johns-editor span." + color).addClass('active')
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
    let length = text.length

    if (length <= len) {
        return text
    }

    return text.substring(0, len) + '...'
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
        window.scrollTo(_currentY, currentY)
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
    let bg_key = store.key + '-' + location.href

    store.removeAll()

    let need_rem = []

    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i); //获取本地存储的Key
        if(/^(\w+-){4}\w+(|-color)$/.test(key)){
            need_rem.push(key);
        }
    }

    need_rem.forEach(function (key){
        localStorage.removeItem(key)
    })

    chrome.storage.local.get([bg_key], function (res) {
        if (res[bg_key]) {
            res[bg_key].forEach(function ({hs}) {
                localStorage.setItem(hs.id + '-color', hs.color || 'yellow')

                highlighter.fromStore(hs.startMeta, hs.endMeta, hs.text, hs.id, hs.extra)
                if (hs.comment) {
                    localStorage.setItem(hs.id, hs.comment)
                }
            });
        }

        highlighter.stop()
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
        href: location.href,
        host: location.host,
        title: document.title,
    };

    switch (action) {
        case 'add':
            if (!Array.isArray(sources)) {
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
                store.comment = localStorage.getItem(store.id) || ''
                store.color = localStorage.getItem(store.id + '-color') || 'yellow'
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

function remove(id) {
    localStorage.removeItem(id)
    // log('*click remove-tip*', id);
    highlighter.removeClass('highlight-wrap-hover', id);
    highlighter.remove(id);
    $("a#" + id).parent().remove()
    $("#johns-editor").remove();
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
    let oldY = localStorage.getItem('johns-menu-top');

    if (oldY) {
        Drag.style.top = oldY
    }

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
            Drag.style.top = ev.clientY - disY + "px";
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

        localStorage.setItem('johns-menu-top', Drag.style.top)
    };
}


function buildButton(left, top) {
    $("body").append("<div id=\"johns-highlight\" style=\"z-index:9999999999;position: absolute; left: " + left + "px; top: " + top + "px;\"><a href='javascript:void(0)' class=\"gtx-johns-icon\">🔖</a></div>")
}

function buildAnchor() {
    $("body").prepend("<div id='johns-menu-drag' class=\"johns-menu-wrap\">\n" +
        "        <input type=\"checkbox\" id='john-checkbox' class=\"toggler\">\n" +
        "        <div class=\"hamburger\"><div></div></div>\n" +
        "        <div class=\"johns-menu\" id='johns-ex-navbar'>\n" +
        "            <div>\n" +
        "                <ul id='johns-tags'>\n" +
        "                </ul>\n" +
        "            </div>\n" +
        "        </div>\n" +
        "    </div>")

    dragFunc('johns-menu-drag')
}

// auto-highlight selections
// highlighter.stop()

let hoveredTipId;
let layer_index = null
let highlighter

chrome.storage.sync.get(['setting'], function (item) {
    if (!item.setting) {
        chrome.storage.sync.set({setting: {use: true}})
    }

    if (!item.setting.use) {
        return;
    }

    buildAnchor()

    highlighter = new Highlighter({
        wrapTag: 'i',
        exceptSelectors: ['.my-remove-tip', 'pre', 'code']
    });

    document.addEventListener('click', e => {
        const $ele = e.target;

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
            let text = localStorage.getItem(id)
            e.preventDefault()

            layer.prompt({title: 'comment', value: text, formType: 2, btn: ['Done', 'Cancel']}, function (pass, index) {
                if (pass) {
                    localStorage.setItem(id, pass)
                    contactBackJs('add', store.get(id))
                    layer.msg("Add success!")
                }

                layer.close(index);
            });

            $("#johns-editor").remove();
        } else if ($ele.classList.contains('js-input-delete')) {
            e.preventDefault()
            const id = $($ele).parents("#johns-editor").attr("data-id")

            localStorage.removeItem(id)

            contactBackJs('add', store.get(id))

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
        } else if ($ele.classList.contains('johns-tag-goto')) {
            e.preventDefault()
            if ($ele.id) {
                let id = $ele.id
                let text = localStorage.getItem(id)
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
            localStorage.setItem(id + '-color', color)

            $($ele).siblings('.active').removeClass('active')

            $($ele).addClass('active')

            contactBackJs('add', store.get(id))

        } else if (!$ele.classList.contains('highlight-mengshou-wrap')) {
            $("#johns-editor").remove();
        }

        if ($($ele).parents('.johns-menu').length === 0 && $($ele).attr('id') !== 'john-checkbox' && $("#john-checkbox").is(":checked")) {
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
                let sh = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                let left = (e.clientX - 40 < 0) ? e.clientX + 20 : e.clientX - 40,
                    top = (e.clientY - 40 < 0) ? e.clientY + sh + 20 : e.clientY + sh - 40;
                buildButton(left + 10, top + 8)
            }
        }
    });

    highlighter
        .on(Highlighter.event.CLICK, ({id}) => {
            // event.preventDefault()
            const position = getPosition(highlighter.getDoms(id)[0]);
            createHtml(position.left - 20, position.top - 20, id)
            // log('click -', id);
        })
        .on(Highlighter.event.HOVER, ({id}) => {
            // log('hover -', id);
            // highlighter.addClass('highlight-wrap-hover', id);

            let text = localStorage.getItem(id)

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
        .on(Highlighter.event.CREATE, ({sources}) => {
            // log('create -', sources);

            contactBackJs('add', sources)

            $("#johns-editor").remove();

            sources.forEach(s => {
                //增加锚点
                let position = getPosition(highlighter.getDoms(s.id)[0])

                let selector = $("#johns-tags>li")

                let arr = []

                selector.each(function (index, v) {
                    let left = v.getAttribute('data-left')
                    let top = v.getAttribute('data-top')

                    arr.push({left: parseInt(left), top: parseInt(top), id: $(v).children('a').attr('id')});
                })

                arr.push({left: position.left, top: position.top, id: s.id})

                arr.sort(mySort)

                let index = arr.findIndex(function (v) {
                    return v.id === s.id
                })

                if (index > 0) {
                    $("#johns-tags").children("li:eq(" + (index - 1) + ")").after("<li data-left='" + position.left + "' data-top='" + position.top + "'><span></span><a id='" + s.id + "' href=\"javascript:void(0);\" title='" + s.text + "' class='johns-tag-goto'>" + handleText(s.text, 20) + "</a></li>")
                } else {
                    $("#johns-tags").prepend("<li data-left='" + position.left + "' data-top='" + position.top + "'><span></span><a id='" + s.id + "' href=\"javascript:void(0);\" title='" + s.text + "' class='johns-tag-goto'>" + handleText(s.text, 20) + "</a></li>")
                }
            });
            sources = sources.map(hs => ({hs}));
            store.save(sources);
        })
        .on(Highlighter.event.REMOVE, ({ids}) => {
            // log('remove -', ids);
            ids.forEach(id => store.remove(id));
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