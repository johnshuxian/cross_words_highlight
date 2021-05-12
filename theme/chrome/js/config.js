function getStorageSyncData(key) {
    // Immediately return a promise and start asynchronous work
    return new Promise((resolve, reject) => {
        // Asynchronously fetch all data from storage.sync.
        chrome.storage.sync.get(key, (items) => {
            // Pass any observed errors down the promise chain.
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            // Pass the data retrieved from storage down the promise chain.
            resolve(items);
        });
    });
}

const store = class LocalStore {
    constructor(id) {
        this.key = id !== undefined ? `highlight-mengshou-${id}` : 'highlight-mengshou';
    }

    async storeToJson() {
        let store = [];

        await getStorageSyncData(this.key).then(items => {
            // Copy the data retrieved from storage into storageCache.
            Object.assign(store, items[this.key]);
        });

        return store;
    }

    jsonToStore(stores) {
        if(stores.length === 0){
            chrome.storage.sync.remove([this.key])
        }else{
            chrome.storage.sync.set({[this.key]:stores}, function(res) {})
        }
        // localStorage.setItem(this.key, JSON.stringify(stores));
    }

    save(data) {
        this.storeToJson().then(stores=>{

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
        });
    }

    forceSave(store) {
        this.storeToJson().then(stores=>{
            stores.push(store);
            this.jsonToStore(stores);
        })
    }

    remove(id) {
        this.storeToJson().then(stores=>{
            let index = null;
            for (let i = 0; i < stores.length; i++) {
                if (stores[i].hs.id === id) {
                    index = i;
                    break;
                }
            }
            stores.splice(index, 1);
            this.jsonToStore(stores);
        })
    }

    getAll() {
        return this.storeToJson();
    }

    removeAll() {
        this.jsonToStore([]);
    }
};

async function getData(){
    const res = await new Promise(((resolve, reject) => {
        chrome.storage.sync.get(null, function (list){
            let info = [];
            for (let key in list){
                let nums = list[key].length
                let commentNums = 0

                let info_i = {href:'',title:'',nums:nums,commentNums:0,icon:'',hs:[]}

                list[key].forEach(function (v){
                    if(v.hs.comment){
                        commentNums++
                    }
                    info_i.hs.push({text:v.hs.text,comment:v.hs.comment,key:key,id:v.hs.id,href:v.hs.href})

                    info_i.href = v.hs.href
                    info_i.title = v.hs.title
                    info_i.icon = v.hs.icon
                    info_i.readDate = v.hs.readDate
                    info_i.key = key
                })

                info_i.commentNums = commentNums

                info.push(info_i)
            }
            // list = list.video_list_keys
            //
            if(list){
                resolve(info)
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
            delDetail(index,hs){
                let stores = new store(hs.href)

                stores.remove(hs.id)

                this.gridData.splice(index,1)
            },
            del(key){
                let that = this
                chrome.storage.sync.remove(key,function (){
                    getData().then(function (v){
                        that.currentPage = 1
                        that.tableData = v.tableData
                    })
                })
            },
            handleSizeChange: function (size) {
                this.pageSize = size;
            },
            handleCurrentChange: function(currentPage){
                this.currentPage = currentPage;
            },
            handleDetailSizeChange: function (size) {
                this.detailPageSize = size;
            },
            handleDetailCurrentChange: function(currentPage){
                this.detailPage = currentPage;
            },
            filterTag(value, row) {
                return row.icon === value;
            },
            getDetail(detail){
                this.dialogTableVisible = true;this.gridData = detail;
            },
            closeDialog(){
                location.reload();
            }
        },
        data() {
            return {
                tableData: [],
                gridData:[],
                dialogTableVisible:false,
                search: '',
                value:'',
                currentPage:1, //初始页
                pageSize:5,    //每页的数据
            }
        }
    }

    var Ctor = Vue.extend(Main)
    new Ctor().$mount('#app')
});