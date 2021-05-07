let lists = {};

async function getData(){
    const res = await new Promise(((resolve, reject) => {
        chrome.storage.sync.get(['video_list_keys'], function (list){
            list = list.video_list_keys

            if(list){
                chrome.storage.sync.get(list, function (info){
                    resolve(info)
                })
            }else{
                resolve({})
            }
        })
    }))

    return { tableData: Object.values(res)}
}

$(function(){
    $(document).attr("title", chrome.runtime.getManifest().name+" - Configurations");

    var Main = {
        created() {
            let that = this

             getData().then(function (v){
                 console.log(v.tableData)
                 that.tableData = v.tableData
             })
        },
        methods: {
            tableRowClassName({row, rowIndex}) {
                if (rowIndex === 1) {
                    return 'warning-row';
                } else if (rowIndex === 3) {
                    return 'success-row';
                }
                return '';
            },
            openUrl(url){
                window.open(url)
            },
            del(detail){
                let that = this
                chrome.storage.sync.get(['video_list_keys'],function (item){
                    let list = item.video_list_keys

                    if(list){
                        let temp_list = [];

                       for (let i = 0;i<list.length;i++){
                        if(detail !== list[i]){
                            temp_list.push(list[i])
                        }else{
                            chrome.storage.sync.remove([detail])
                        }

                       }

                        chrome.storage.sync.set({video_list_keys:temp_list})
                    }

                    getData().then(function (v){
                        that.tableData = v.tableData
                    })
                })
            }
        },
        data() {
            return {
                tableData: []
            }
        }
    }

    var Ctor = Vue.extend(Main)
    new Ctor().$mount('#app')
});