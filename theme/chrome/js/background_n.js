/**
 * 通信
 */
chrome.runtime.onMessage.addListener(
     function(request, sender, sendResponse) {
        if(request.from === 'content_js'){
            let info,stores;
            switch (request.action) {
                case "add":
                    info = request.data

                     info.sources = info.sources.map(hs => ({hs}));

                    // console.log(info.sources)
                    stores = new store(info.href)

                    stores.save(info.sources)
                    break;
                case "remove":
                    info = request.data
                    // console.log(info.sources)
                    stores = new store(info.href)

                    stores.remove(info.sources)

                    break
            }


            // chrome.runtime.sendMessage({from: "bg_js", action: request.action,data:request.data}, function (response) {});

        }
    }
);

/**
 * 缓存变更监听
 */
// chrome.storage.onChanged.addListener(function (changes, namespace) {
//     for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
//         if(namespace === 'sync'){
//             chrome.storage.sync.get([key],function (res){
//                 console.log(res)
//             })
//         }
//         console.log(
//             `Storage key "${key}" in namespace "${namespace}" changed.`,
//             `Old value was "${oldValue}", new value is "${newValue}".`
//         );
//     }
// });

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

const options = {
    type: 'checkbox',
    id: 'stopUse',
    title: '扩展停用',
    checked: false,
    onclick: function (info,tab){
        chrome.storage.sync.set({setting:{use:!info.checked}},function (){
            chrome.tabs.executeScript(tab.id,{
                code:"location.reload()"
            })
        })
    },
}
chrome.contextMenus.create(options);

chrome.storage.sync.get(['setting'],function (item){
    if(!item.setting){
        chrome.storage.sync.set({setting:{use:true}},function (){})
        chrome.contextMenus.update('stopUse',{checked: false})
    }else{
        chrome.contextMenus.update('stopUse',{checked: !item.setting.use})
    }
})