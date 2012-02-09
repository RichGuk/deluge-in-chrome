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

    return pub;
}(jQuery));

// Run init stuff for the plugin.
jQuery(document).ready(function($) {
    Background.checkStatus();
});