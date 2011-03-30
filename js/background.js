var Background = (function($) {
    // Store all public methods and attributes.
    var pub = {};

    var status_timer = null;

    /*
     * Intervals used for status checking.
     * If an error occurs when checking the status then increase how often
     * things are checked.
     */
    var status_check_error_interval = 120000;
    var status_check_interval = 60000;

    /*
     * Start the daemon for a given host id.
     */
    function start_daemon(host_id) {
        // Attempt start the Daemon if not already.
        var deferred = $.Deferred(function(d) {
            // Find the current status of the daemon.
            Deluge.api('web.get_host_status', [host_id])
            .success(function(response) {
                if (response && response[3] == 'Offline') {
                    Deluge.api('web.start_daemon', [response[2]])
                        .success(function(response) {
                            // Give the Daemon a few seconds to start.
                            setTimeout(function() { d.resolve(); }, 2000);
                        });
                } else {
                    d.resolve();
                }
            })
            .error(function() {
                d.reject();
            });
        });

        return deferred.promise();
    }

    /*
     * Called when auto login failed - normally incorrect login details.
     */
    function auto_login_failed() {
        // Inform anyone who's listening.
        chrome.extension.sendRequest({ msg: 'auto_login_failed' });
    }

    /*
     * If we have login details perform a login to the Deluge webUI.
     */
    pub.login = function() {
        return Deluge.api('auth.login', [localStorage.deluge_password]);
    };

    pub.connect = function() {
        // Find a list of hosts; if we only have one option connect to it,
        // otherwise do nothing, as we can't handle these at the moment.
        var deferred = $.Deferred(function(d) {
            Deluge.api('web.get_hosts')
                .success(function(response) {
                    // Only one host found.
                    if (response.length == 1) {
                        var host_id = response[0][0];
                        // Check the daemon is running and then try connecting.
                        start_daemon(host_id).done(function() {
                            Deluge.api('web.connect', [host_id])
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
    pub.check_status = function(options) {
        var that = this;

        function check_status() {
            that.check_status();
        }

        // Clear any existing timers.
        clearTimeout(status_timer);

        var api = Deluge.api('web.connected', [], options)
            .success(function(response) {
                // Connected: activate the extension.
                if (response === true) {
                    that.activate();
                    status_timer = setTimeout(check_status, status_check_interval);
                } else {
                    // Authenticated but not connected - attempt to connect to
                    // daemon.
                    that.connect().done(function() {
                        that.activate();
                        // Create timer.
                        status_timer = setTimeout(check_status, status_check_interval);
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
                                    that.check_status();
                                } else {
                                    // Wrong login - not much we can do, try
                                    // checking in a bit.
                                    console.log('Deluge: Incorrect login details.');
                                    status_timer = setTimeout(check_status, status_check_error_interval);
                                    that.deactivate();
                                    auto_login_failed();
                                }
                            })
                            .error(function(jqXHR, text, err) {
                                that.deactivate();
                            });
                    } else {
                        // Unknown API error, deactivate the extension.
                        that.deactivate();
                    }
                    // Setup interval for a repeat check.
                    status_timer = setTimeout(check_status, status_check_interval);
                } else {
                    // Unknown error (resulting from 500/400 status codes
                    // normally); best thing to do is check again, but with a
                    // longer interval.
                    status_timer = setTimeout(check_status, status_check_error_interval);
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
    Background.check_status();
});
