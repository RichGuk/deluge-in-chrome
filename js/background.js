var Background = (function($) {
    // Store all public methods and attributes.
    var pub = {};

    var statusTimer = null;

    /*
     * Intervals used for status checking.
     * If an error occurs when checking the status then increase how often
     * things are checked.
     */
    const STATUS_CHECK_ERROR_INTERVAL = 120000;
    const STATUS_CHECK_INTERVAL = 60000;

    /*
     * Start the daemon for a given host id.
     */
    function startDaemon(hostId) {
        // Attempt start the Daemon if not already.
        var deferred = $.Deferred(function(d) {
            // Find the current status of the daemon.
            Deluge.api('web.get_host_status', [hostId])
            .success(function(response) {
                if (response && response[3] == 'Offline') {
                    Deluge.api('web.start_daemon', [response[2]])
                        .success(function(response) {
                            if (Global.getDebugMode()) {
                                console.log('Daemon started');
                            }
                            // Give the Daemon a few seconds to start.
                            setTimeout(function() { d.resolve(); }, 2000);
                        });
                } else {
                    d.resolve();
                }
            })
            .error(function() {
                if (Global.getDebugMode()) {
                    console.log('Deluge: Error getting host status');
                }
                d.reject();
            });
        });

        return deferred.promise();
    }

    /*
     * Called when auto login failed - normally incorrect login details.
     */
    function autoLoginFailed() {
        // Inform anyone who's listening.
        chrome.extension.sendRequest({ msg: 'auto_login_failed' });
    }

    /*
     * If we have login details perform a login to the Deluge webUI.
     */
    pub.login = function() {
        return Deluge.api('auth.login', [localStorage.delugePassword]);
    };

    pub.connect = function() {
        // Find a list of hosts; if we only have one option connect to it,
        // otherwise do nothing, as we can't handle these at the moment.
        var deferred = $.Deferred(function(d) {
            Deluge.api('web.get_hosts')
                .success(function(response) {
                    // Only one host found.
                    if (response.length == 1) {
                        var hostId = response[0][0];
                        // Check the daemon is running and then try connecting.
                        startDaemon(hostId).done(function() {
                            Deluge.api('web.connect', [hostId])
                                .success(function() { d.resolve(); })
                                .error(function() { d.reject(); });
                        });
                    } else {
                        d.reject({ error: 'More than one host' });
                    }
                });
        });

        var promise = deferred.promise();
        // Setup some alias that are expected.
        promise.success = deferred.done;

        return deferred;
    };

    /*
     * Talk to Deluge to find out if the WebUI is running and that we have access.
     *
     * @return API promise - can attach additional success/error callbacks.
     * */
    pub.checkStatus = function(options) {
        if (Global.getDebugMode()) {
            console.log('Deluge: Checking status');
        }
        
        var that = this;

        function checkStatus() {
            that.checkStatus();
        }

        // Clear any existing timers.
        clearTimeout(statusTimer);

        var api = Deluge.api('web.connected', [], options)
            .success(function(response) {
                // Connected: activate the extension.
                if (response === true) {
                    that.activate();
                    statusTimer = setTimeout(checkStatus, STATUS_CHECK_INTERVAL);
                } else {
                    // Authenticated but not connected - attempt to connect to
                    // daemon.
                    that.connect().done(function() {
                        that.activate();
                        // Create timer.
                        statusTimer = setTimeout(checkStatus, STATUS_CHECK_INTERVAL);
                    });
                }
            })
            .error(function(jqXHR, text, err) {
                if (text == Deluge.API_ERROR) {
                    // If unauthenticated then attempt login.
                    if (err.code == Deluge.API_AUTH_CODE) {
                        // Login and then check status again!
                        that.login()
                            .success(function(res) {
                                // If successful check status again now.
                                if (res === true) {
                                    that.checkStatus();
                                } else {
                                    // Wrong login - not much we can do, try
                                    // checking in a bit.
                                    if (Global.getDebugMode()) {
                                        console.log('Deluge: Incorrect login details.');
                                    }
                                    statusTimer = setTimeout(check_status, STATUS_CHECK_ERROR_INTERVAL);
                                    that.deactivate();
                                    autoLoginFailed();
                                }
                            })
                            .error(function(jqXHR, text, err) {
                                if (Global.getDebugMode()) {
                                    console.log('Deluge: Error logging in');
                                }
                                that.deactivate();
                            });
                    } else {
                        if (Global.getDebugMode()) {
                            console.log('Deluge: API error occured');
                        }
                        // Unknown API error, deactivate the extension.
                        that.deactivate();
                    }
                    // Setup interval for a repeat check.
                    statusTimer = setTimeout(checkStatus, STATUS_CHECK_INTERVAL);
                } else {
                    // Unknown error (resulting from 500/400 status codes
                    // normally); best thing to do is check again, but with a
                    // longer interval.
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Unknown error occured');
                    }
                    statusTimer = setTimeout(checkStatus, STATUS_CHECK_ERROR_INTERVAL);
                    that.deactivate();
                }
            });

        return api;
    };

    /*
     * Enable the extension (set correct status messages and enable icons).
     *
     * This is normally called after doing a status check which returned
     * successfully.
     */
    pub.activate = function() {
        if (Global.getDebugMode()) {
            console.log('Deluge: Extension activated');
        }
        chrome.browserAction.setIcon({path: 'images/icons/deluge_active.png'});
        chrome.browserAction.setTitle({
            title: chrome.i18n.getMessage('browser_title')
        });
        // Send activation to anything listening.
        chrome.extension.sendRequest({ msg: 'extension_activated' });
    };

    /* Disables the extension (status messages, disabling icons, etc..).
     *
     * This is normally called after doing a status check, which returned false.
     */
    pub.deactivate = function() {
        if (Global.getDebugMode()) {
            console.log('Deluge: Extension deactivated');
        }
        chrome.browserAction.setIcon({path: 'images/icons/deluge.png'});
        chrome.browserAction.setTitle({
            title: chrome.i18n.getMessage('browser_title_disabled')
        });
        // Send deactivation to anything listening.
        chrome.extension.sendRequest({ msg: 'extension_deactivated' });
    };
    
    /**
    * Add a torrent to Deluge using a URL. This method is meant to be called
    * as part of Chrome extensions messaging system.
    *
    * @see chrome.extension.sendRequest && chrome.extension.onRequest
    */
    pub.addTorrentFromUrl = function(request, sender, sendResponse) {
        /**
         * Fetches the configuration values needed to add the torrent before
         * adding the torrent to Deluge.
         *
         * @param {String} tmpTorrent The temp path to the downloaded torrent file (used by deluge to find the torrent).
         */
        function addTorrent(tmpTorrent) {
            /**
             * Add the torrent file into Deluge with the correct options.
             *
             * @param {Object} options The options for the torrent (download_path, max_connections, etc...).
             */
            function addToDeluge(options) {
                Deluge.api('web.add_torrents', [[{'path': tmpTorrent, 'options': options}]])
                    .success(function(obj) {
                        if(obj) {
                            if (Global.getDebugMode()) {
                                console.log('deluge: added torrent to deluge.');
                            }
                            sendResponse({msg: 'success', result: obj, error: null});
                            return;
                        }
                        if (Global.getDebugMode()) {
                            console.log('deluge: unable to add torrent to deluge.');
                        }
                        sendResponse({msg: 'error', result: null, error: 'unable to add torrent to deluge'});
                    })
                    .error(function(req, status, err) {
                        if (Global.getDebugMode()) {
                            console.log('deluge: unable to add torrent to deluge.');
                        }
                        sendResponse({msg: 'error', result: null, error: 'unable to add torrent to deluge'});
                    });
            }
   
            // Need to get config values to add with the torrent first.
            Deluge.api('core.get_config_values', [['add_paused', 'compact_allocation', 'download_location',
                'max_connections_per_torrent', 'max_download_speed_per_torrent',
                'max_upload_speed_per_torrent', 'max_upload_slots_per_torrent',
                'prioritize_first_last_pieces']])
                .success(function(obj) {
                    if(obj) {
                        if (Global.getDebugMode()) {
                            console.log('deluge: got options!');
                        }
                        addToDeluge(obj);
                        return;
                    }
                    if (Global.getDebugMode()) {
                        console.log('deluge: unable to fetch options.');
                    }
                    sendResponse({msg: 'error', result: null, error: 'unable to fetch options.'});
                })
                .error(function(req, status, err) {
                    if (Global.getDebugMode()) {
                        console.log('deluge: unable to fetch options.');
                    }
                    sendResponse({msg: 'error', result: null, error: 'unable to fetch options.'});
                });
        }

        // First we need to download the torrent file to a temp location in Deluge.
        Deluge.api('web.download_torrent_from_url', [request.url, ''])
            .success(function(obj) {
                if(obj) {
                    if (Global.getDebugMode()) {
                        console.log('deluge: downloaded torrent.');
                    }
                    addTorrent(obj);
                    return;
                }
                if (Global.getDebugMode()) {
                    console.log('deluge: failed to download torrent from URL, no obj or result.');
                }
                sendResponse({msg: 'error', result: null, error: 'failed to download torrent from URL.'});
            })
            .error(function(req, status, err) {
                if (Global.getDebugMode()) {
                    console.log('deluge: failed to download torrent from URL.');
                }
                sendResponse({msg: 'error', result: null, error: 'failed to download torrent from URL.'});
            });
    }
    
    function handleContextMenuClick(OnClickData) {
        var torrentUrl = OnClickData.linkUrl;
        if(torrentUrl.search(/\/(download|get)\//) > 0 || torrentUrl.search(/\.torrent$/) > 0) {
            Background.addTorrentFromUrl({url: torrentUrl}, [], function(response) {
                if(response.msg == 'success') {
                    if (Global.getDebugMode) {
                        console.log('Deluge: Torrent added');
                    }
                } else {
                    if (Global.getDebugMode) {
                        console.log('Deluge: Torrent could not be added');
                    }
                }
            });
        } else {
            if (Global.getDebugMode()) {
                console.log('Deluge: Link not a torrent!');
            }
        }
        
        return false;
    }
    
    var contextMenu = null;
    
    pub.addContextMenu = function() {
        if (contextMenu === null) {
            contextMenu = chrome.contextMenus.create({
                "title": "Add to Deluge",
                "contexts": ["link"],
                "onclick" : handleContextMenuClick
            });
        }
    }
    
    pub.removeContextMenu = function() {
        if (contextMenu  !== null) {
            chrome.contextMenus.remove(contextMenu);
            contextMenu = null;
        }
    }
    
    //for some reason the context menu is always added regardless of the if
    if (localStorage.contextMenu) {
        pub.addContextMenu();
    } else {
        pub.removeContextMenu();
    }

    return pub;
}(jQuery));

// Run init stuff for the plugin.
jQuery(document).ready(function($) {
    Background.checkStatus();
});

/*
* =====================================================================
* Event bindings.
* =====================================================================
*/

// Any requests send via chrome ext messaging system.
chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {

    if(request.msg == 'add_torrent_from_url') {
        Background.addTorrentFromUrl(request, sender, sendResponse);
        return;
    } else if(request.msg == 'enable_download_icon') {
        sendResponse(localStorage.delugeDownloadIcon);
    }
  
    // We need to send a reponse, even if it's empty.
    sendResponse({msg: 'error', result: null, error: 'nothing called!'});
});