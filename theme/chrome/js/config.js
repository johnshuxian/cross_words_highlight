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

function init(that){
    getData().then(function (v){
        v.tableData.sort(function (a,b){
            if (a['readDate'] !== b['readDate']) {
                return a['readDate'] > b['readDate'] ? -1 : 1;
            }

            return -1;
        })

        that.tableDataLength = v.tableData.length
        that.tableData = v.tableData
        that.tableDataOri = v.tableData
        that.tableDataTem = v.tableData
        that.loading = false
    })
}

$(function(){
    $(document).attr("title", chrome.runtime.getManifest().name+" - Configurations");

    var Main = {
        created() {
            let that = this

             init(that)
        },
        watch: {
            //watch监视input输入值的变化,只要是watch变化了 search()就会被调用
            search(newVal) {
                this.handleSearch(newVal);
            },
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
            changeSort(orderInfo){
                let column = orderInfo.prop
                let order  = orderInfo.order

                this.currentPage = 1

                this.tableData = this.tableDataOri.sort(function (a,b){
                    if(order === 'ascending'){
                        if (a[column] !== b[column]) {
                            return a[column] < b[column] ? -1 : 1;
                        }
                    }else{
                        if (a[column] !== b[column]) {
                            return a[column] > b[column] ? -1 : 1;
                        }
                    }

                    return -1;
                });

                this.handleTableData(this.tableData)
            },
            openUrl(url){
                window.open(url)
            },
            handleSearch(val) {
                let search = val;

                if (search === "") {
                    this.currentPage = 1
                    this.tableDataOri = this.tableDataTem
                    this.tableDataLength = this.tableDataOri.length
                    this.handleTableData()
                }

                if (search !== "") {
                    //如果search等于空

                    this.tableDataOri = this.tableDataOri.filter(
                        (data) =>
                            !search || data.title.toLowerCase().includes(search.toLowerCase())
                    );

                    this.tableDataLength = this.tableDataOri.length

                    this.currentPage = 1

                    this.handleTableData()
                }
            },
            delDetail(index,hs){
                let stores = new store(hs.href)

                if(hs.comment){
                    this.tableData[this.index].commentNums--
                }

                this.tableData[this.index].nums--

                stores.remove(hs.id)

                if(this.tableData[this.index].nums === 0){
                    this.tableData.splice(this.index,1)
                }

                this.gridData.splice(index,1)
            },
            del(key){
                let that = this
                chrome.storage.sync.remove(key,function (){
                    getData().then(function (v){
                        // that.currentPage = 1
                        that.tableDataLength = v.tableData.length
                        that.tableData = v.tableData
                        that.tableDataOri = v.tableData
                    })
                })
            },
            handleSizeChange: function (size) {
                this.pageSize = size;
                this.handleTableData();
            },
            handleCurrentChange: function(currentPage){
                this.currentPage = currentPage;
                this.handleTableData()
            },
            handlePrevClick(val) {
                //点击向前的按钮 执行的方法
                this.currentPage = val;
                this.handleTableData();
            },
            handleNextClick(val) {
                this.currentPage = val;
                //再调用handleTableData 方法
                this.handleTableData();
            },
            handleDetailSizeChange: function (size) {
                this.detailPageSize = size;
            },
            handleTableData() {
                this.tableDataLength = this.tableDataOri.length;
                // console.log(this.currentPage,this.pageSize)
                this.tableData = this.tableDataOri.slice(
                    (this.currentPage - 1) * this.pageSize,
                    this.pageSize*this.currentPage
                );
            },
            handleDetailCurrentChange: function(currentPage){
                this.detailPage = currentPage;
            },
            filterTag(value, row) {
                return row.icon === value;
            },
            getDetail(detail,index){
                this.index = index
                this.dialogTableVisible = true;
                this.gridData = detail;
            },
            closeDialog(){
                // location.reload();
            },
            open(text) {
                this.$confirm('复制文字', '提示', {
                    confirmButtonText: '确定',
                    cancelButtonText: '取消',
                    type: 'info'
                }).then(() => {
                    copyToClipboard(text)
                    this.$message({
                        type: 'success',
                        message: '复制成功!'
                    });
                }).catch(() => {
                    this.$message({
                        type: 'info',
                        message: '取消复制'
                    });
                });
            }
        },
        data() {
            return {
                tableData: [],
                tableDataOri: [],
                tableDataTem: [],
                gridData:[],
                dialogTableVisible:false,
                search: '',
                value:'',
                tableDataLength:0,
                currentPage:1, //初始页
                pageSize:5,    //每页的数据
                loading: true
            }
        }
    }

    var Ctor = Vue.extend(Main)
    new Ctor().$mount('#app')
});

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        console.log(request)
        if(request.from === 'content_js'){
            switch (request.action) {
                case 'add':
                    location.reload()
                    break;
                case 'remove':
                    location.reload()
                    break;
            }
        }
    })


function copyToClipboard(t) {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.setAttribute('value', t);
    input.select();
    if (document.execCommand('copy')) {
        document.execCommand('copy');
    }
    document.body.removeChild(input);
}