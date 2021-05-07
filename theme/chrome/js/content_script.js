function getSelectedText() {
    let t = "";
    window.getSelection ? t = window.getSelection() : document.getSelection ? t = document.getSelection() : document.selection && (t = document.selection.createRange().text)

    return t
}

function createHtml(){
    let html = "<div id=\"annotation-editor\" style=\"left: 407px; top: 478px; display: block;\"><ul class=\"dropdown-list\"><li class=\"colors\" style=\"display: list-item;\"><span data-color=\"yellow\" class=\"js-color-picker color yellow active\"></span><span data-color=\"green\" class=\"js-color-picker color green \"></span><span data-color=\"pink\" class=\"js-color-picker color pink \"></span><span data-color=\"blue\" class=\"js-color-picker color blue \"></span></li><li><a href=\"#\" class=\"js-copy\"><i class=\"icon copy\"></i> 复制</a></li></li><li class=\"js-remove-annotation-wrapper\" style=\"display: none;\"><a href=\"#\" class=\"js-remove-annotation\"><i class=\"icon remove red\"></i> 移除高亮</a></li></ul></div>"

    $("body").prepend(html)
}


document.body.addEventListener('mouseup', function (e) {
    let text_dom = getSelectedText()

    let txt = text_dom.toString()

    if(txt){
        let sh = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

        let left = (e.clientX - 40 < 0) ? e.clientX + 20 : e.clientX - 40, top = (e.clientY - 40 < 0) ? e.clientY + sh + 20 : e.clientY + sh - 40;

        createHtml(text_dom)

        console.log(left,top)
    }

},false);


var $sinaMiniBlogShare = function(eleShare, eleContainer) {
    var eleTitle = document.getElementsByTagName("title")[0];
    eleContainer = eleContainer || document;
    var funGetSelectTxt = function() {
        var txt = "";
        if(document.selection) {
            txt = document.selection.createRange().text;    // IE
        } else {
            txt = document.getSelection();
        }
        return txt.toString();
    };
    eleContainer.onmouseup = function(e) {
        e = e || window.event;
        var txt = funGetSelectTxt(), sh = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        var left = (e.clientX - 40 < 0) ? e.clientX + 20 : e.clientX - 40, top = (e.clientY - 40 < 0) ? e.clientY + sh + 20 : e.clientY + sh - 40;
        if (txt) {
            eleShare.style.display = "inline";
            eleShare.style.left = left + "px";
            eleShare.style.top = top + "px";
        } else {
            eleShare.style.display = "none";
        }
    };
    eleShare.onclick = function() {
        var txt = funGetSelectTxt(), title = (eleTitle && eleTitle.innerHTML)? eleTitle.innerHTML : "未命名页面";
        if (txt) {
            window.open('http://v.t.sina.com.cn/share/share.php?title=' + txt + '→来自页面"' + title + '"的文字片段&url=' + window.location.href);
        }
    };
};