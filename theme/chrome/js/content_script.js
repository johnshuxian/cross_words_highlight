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
        }
        catch (e) {
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

    removeAll() {
        this.jsonToStore([]);
    }
});
const log = console.log.bind(console, '[highlighter]');

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
        console.log('复制成功',t);
    }
    document.body.removeChild(input);
}

function createHtml(left,top,id){
    $("#johns-editor").remove();

    let display = localStorage.getItem(id)?'list-item':'none';

    let html = "<div id=\"johns-editor\" data-id='"+id+"' style=\"z-index:100000000;left: "+left+"px; top: "+top+"px; display: block;\"><ul class=\"dropdown-list\"><li style='text-align: center'><a  onclick='return false;'  href=\"#\" class=\"js-copy\">复制</a></li><li class=\"js-remove-annotation-wrapper\" style=\"display: list-item;text-align: center\"><a href=\"#\" onclick='return false;' class=\"js-remove-annotation\">移除高亮</a></li><li style='text-align: center'><a  onclick='return false;'  href=\"#\" class=\"js-input\">相关批注</a></li><li style='text-align: center;display: "+display+"'><a  onclick='return false;'  href=\"#\" class=\"js-input-delete\">删除批注</a></li></ul></div>"

    $("body").prepend(html)
}

/**
 * 锚点调转
 * @param id
 */
function goto(id){
    let position = getPosition(highlighter.getDoms(id)[0])
    console.log(position)
    window.scrollTo(position.left,position.top-window.screen.availHeight/2);
}

function mySort(a,b){
    if(a.top !== b.top){
        return a.top < b.top ? -1 : 1;
    }

     if(a.left !== b.left){
        return a.left < b.left ? -1 : 1;
    }

    return -1;
}

buildAnchor()

const highlighter = new Highlighter({
    wrapTag: 'i',
    exceptSelectors: ['.my-remove-tip', 'pre', 'code']
});

let layer_index = null

highlighter
    .on(Highlighter.event.CLICK, ({id}) => {
        // event.preventDefault()
        const position = getPosition(highlighter.getDoms(id)[0]);
        createHtml(position.left-20,position.top-20,id)
        log('click -', id);
    })
    .on(Highlighter.event.HOVER, ({id}) => {
        log('hover -', id);
        highlighter.addClass('highlight-wrap-hover', id);

        let text = localStorage.getItem(id)

        if(text){
            layer_index = layer.tips(text, "i.highlight-mengshou-wrap[data-highlight-id='"+id+"']", {
                tips: [1, '#3595CC'],
                time: 0
            });
        }
    })
    .on(Highlighter.event.HOVER_OUT, ({id}) => {
        log('hover out -', id);
        highlighter.removeClass('highlight-wrap-hover', id);

        if(layer_index){
            layer.close(layer_index)
            layer_index = null
        }
    })
    .on(Highlighter.event.CREATE, ({sources}) => {
        log('create -', sources);

        $("#johns-editor").remove();

        sources.forEach(s => {
            //增加锚点
            let position = getPosition(highlighter.getDoms(s.id)[0])

            let selector = $("#johns-tags>li")

            let arr = []

            selector.each(function (index,v){
                let left = v.getAttribute('data-left')
                let top = v.getAttribute('data-top')

                arr.push({left:parseInt(left),top:parseInt(top),id:$(v).children('a').attr('id')});
            })

            arr.push({left:position.left,top:position.top,id:s.id})

            arr.sort(mySort)

            let index = arr.findIndex(function (v) {
                return v.id === s.id
            })

            console.log(index,s.id,arr)

            if(index > 0){
                $("#johns-tags").children("li:eq("+(index-1)+")").after("<li data-left='"+position.left+"' data-top='"+position.top+"'><span></span><a id='"+s.id+"' href=\"javascript:void(0);\" title='"+s.text+"...' class='johns-tag-goto'>"+s.text.slice(0,10)+"...</a></li>")
            }else{
                $("#johns-tags").prepend("<li data-left='"+position.left+"' data-top='"+position.top+"'><span></span><a id='"+s.id+"' href=\"javascript:void(0);\" title='"+s.text+"...' class='johns-tag-goto'>"+s.text.slice(0,10)+"...</a></li>")
            }
        });
        sources = sources.map(hs => ({hs}));
        store.save(sources);
    })
    .on(Highlighter.event.REMOVE, ({ids}) => {
        log('remove -', ids);
        ids.forEach(id => store.remove(id));
    });

/**
 * retrieve from local store
 */
const storeInfos =  store.getAll();
storeInfos.forEach(
    ({hs}) => highlighter.fromStore(hs.startMeta, hs.endMeta, hs.text, hs.id, hs.extra)
);

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
function getIntersection(arrA, arrB) {
    const record = {};
    const intersection = [];
    arrA.forEach(i => record[i] = true);
    arrB.forEach(i => record[i] && intersection.push(i) && (record[i] = false));
    return intersection;
}
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

document.addEventListener('click', e => {
    const $ele = e.target;

    // delete highlight
    if ($ele.classList.contains('js-remove-annotation')) {

        const id = $($ele).parents("#johns-editor").attr("data-id")

        localStorage.removeItem(id)
        log('*click remove-tip*', id);
        highlighter.removeClass('highlight-wrap-hover', id);
        highlighter.remove(id);
        $("a#"+id).parent().remove()
        $("#johns-editor").remove();
    }else if($ele.classList.contains('js-copy')){
        const id = $($ele).parents("#johns-editor").attr("data-id")
        let text = ''

        highlighter.getDoms(id).forEach(function (i){
            text+=i.textContent
        })

        copyToClipboard(text)
        // highlighter.removeClass('highlight-wrap-hover', id);
        // highlighter.remove(id);
        $("#johns-editor").remove();
    }else if($ele.classList.contains('js-input')){
        const id = $($ele).parents("#johns-editor").attr("data-id")
        let text = localStorage.getItem(id)

        layer.prompt({title: '批注',value:text, formType: 2}, function(pass, index){
            if(pass){
                localStorage.setItem(id,pass)
                layer.msg("添加成功")
            }

            layer.close(index);
        });

        $("#johns-editor").remove();
    }else if($ele.classList.contains('js-input-delete')){
        const id = $($ele).parents("#johns-editor").attr("data-id")

        localStorage.removeItem(id)

        layer.msg("删除成功")

        $("#johns-editor").remove();
    }else if ($ele.classList.contains("gtx-johns-icon")) {
        console.log($($ele).text())
        const selection = window.getSelection();
        if (selection.isCollapsed) {
            return;
        }
        highlighter.fromRange(selection.getRangeAt(0));
        window.getSelection().removeAllRanges();
        $("#johns").remove()
    }else if($ele.classList.contains('johns-tag-goto')){
        if($ele.id){
            //锚点跳转
            goto($ele.id)
        }
    }else if(!$ele.classList.contains('highlight-mengshou-wrap')){
        $("#johns-editor").remove();
    }
});

let hoveredTipId;
document.addEventListener('mouseover', e => {
    const $ele = e.target;

    // toggle highlight hover state
    if ($ele.classList.contains('highlight-mengshou-wrap') && hoveredTipId !== $ele.dataset.id) {
        hoveredTipId = $ele.dataset.id;
        highlighter.removeClass('highlight-wrap-hover');
        highlighter.addClass('highlight-wrap-hover', hoveredTipId);
    }else if($ele.id === 'johns-ex-navbar'){
        $("#johns-ex-navbar>ul").show()
    } else if (!$ele.classList.contains('highlight-mengshou-wrap')) {
        highlighter.removeClass('highlight-wrap-hover', hoveredTipId);
        hoveredTipId = null;

        if($($ele).parents("div[id='johns-ex-navbar']").length === 0){
            $("#johns-ex-navbar>ul").hide()
        }
    }
});

document.addEventListener('mouseup', e => {
    let text = getSelectedText().toString()

    let $ele = e.target

    if(!$ele.classList.contains("gtx-johns-icon")){
        $("#johns").remove()

        if(text){
            let sh = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            let left = (e.clientX - 40 < 0) ? e.clientX + 20 : e.clientX - 40, top = (e.clientY - 40 < 0) ? e.clientY + sh + 20 : e.clientY + sh - 40;
            buildButton(left+20,top+8)
        }
    }
});

function buildButton(left,top){
    $("body").append("<div id=\"johns\" style=\"z-index:9999999999;position: absolute; left: "+left+"px; top: "+top+"px;\"><a href='javascript:void(0)' class=\"gtx-johns-icon\">🔖</a></div>")
}

function buildAnchor(){
    let html = "<div id=\"johns-ex-navbar\"><i class=\"johns-fa\">📑</i>" +
        "<ul id='johns-tags' style='padding-top: 5px'>" +
        "</ul>" +
        "</div>";

    $("body").append(html)
}

// auto-highlight selections
highlighter.stop()