/*
 * Module responsible for fetching, storing and sorting torrent objects.
 */
var Torrents = (function ($) {
    var pub = {}
        // Stores all torrent data, using array so it can be sorted.
        , torrents = []
        , globalInformation = {};

    function sortCallback(a, b) {
        switch (localStorage.sortColumn) {
        case 'name':
            a = a.name;
            b = b.name;
            break;
  
        case 'size':
            a = a.size;
            b = b.size;
            break;
  
        case 'progress':
            a = a.progress;
            b = b.progress;
            break;
  
        case 'speed':
            a = a.speed;
            b = b.speed;
            break;
  
        case 'eta':
            a = a.eta;
            b = b.eta;
            break;
  
        case 'position':
            a = a.position;
            b = b.position;
            break;
      
        // Sort by queue asc if nothing is already set.
        default:
            a = a.position;
            b = b.position;
            // Set them for future use.
            localStorage.sortColumn = 'position';
            localStorage.sortMethod = 'asc';
            break;
        }

        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        
        return 0;
    }

    pub.getAll = function () {
        return torrents;
    };

    pub.getById = function (val) {
        var i;
        for (i = 0; i < torrents.length; i += 1) {
            if (torrents[i].id === val) {
                return torrents[i];
            }
        }
        return false;
    };

    pub.getGlobalInformation = function () {
        return globalInformation;
    };

    pub.cleanup = function () {
        var i;
        for (i = 0; i < torrents.length; i += 1) {
            torrents[i] = null;
        }
        torrents = null;
    };

    pub.update = function () {
        var that = this
            , api = Deluge.api('web.update_ui', [[
            'queue', 'name', 'total_size', 'state', 'progress',
            'download_payload_rate', 'upload_payload_rate', 'eta',
            'ratio', 'is_auto_managed'], {}], { timeout: 2000 })
            .success(function (response) {
                var id, tmp;
                // Reset torrents array.
                that.cleanup();
                torrents = [];
                for (id in response.torrents) {
                    if (response.torrents.hasOwnProperty(id)) {
                        torrents.push(new Torrent(id, response.torrents[id]));
                    }
                }
        
                for (id in response.filters.state) {
                    if (response.filters.state.hasOwnProperty(id)) {
                        tmp = response.filters.state[id];
                        globalInformation[tmp[0].toLowerCase()] = tmp[1];
                    }
                }
        
                response = null;
        
                // Sort the torrents.
                torrents.sort(sortCallback);
                if (localStorage.sortMethod === 'desc') {
                    torrents.reverse();
                }
                if (Global.getDebugMode()) {
                    console.log(torrents);
                }
            });

        return api;
    };

    return pub;
}(jQuery));
