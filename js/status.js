/*
 * Module responsible for fetching, storing and sorting torrent objects.
 */
var Torrents = (function($) {
    var pub = {};
    // Stores all torrent data, using array so it can be sorted.
    var torrents = [];

    function sortCallback(a, b) {
        a = a.name;
        b = b.name;

        if(a < b) {
            return -1;
        }
        if(a > b) {
            return 1;
        }
        return 0;
    }

    pub.get_all = function() {
        return torrents;
    };

    pub.get_by_id = function(val) {
        for (var i = 0; i < torrents.length; i++) {
            if (torrents[i].id == val) {
                return torrents[i];
            }
        }
    };

    pub.cleanup = function() {
        for(var i=0; i < torrents.length; i++) {
            torrents[i] = null;
        }
        torrents = null;
    };

    pub.update = function() {
        var that = this;
        var api = Deluge.api('web.update_ui', [[
            'queue', 'name', 'total_size', 'state', 'progress',
            'download_payload_rate', 'upload_payload_rate', 'eta',
            'ratio', 'is_auto_managed'], {}], { timeout: 2000 })
            .success(function(response) {
                // Reset torrents array.
                that.cleanup();
                torrents = [];
                for(var id in response.torrents) {
                    if (response.torrents.hasOwnProperty(id)) {
                        torrents.push(new Torrent(id, response.torrents[id]));
                    }
                }
                response = null;

                // Sort the torrents.
                torrents.sort(sortCallback);
                if (localStorage.sort_method == 'desc') {
                    torrents.reverse();
                }
            });

        return api;
    };

    return pub;
}(jQuery));

/*
 * Responsible for all display, page or functional control on the status page.
 *
 * - Setting refresh timers.
 * - Rendering HTML for table.
 * - Logic for action buttons.
 */
jQuery(document).ready(function($) {
    // Get extension background page for use within the code.
    var background_page = chrome.extension.getBackgroundPage();
    // Setup timer information.
    var refresh_timer = null, refresh_interval = 2000;
    // Store the extension activation state.
    var extension_activated = false;

    // Set the initial height for the overlay.
    var $overlay = $('#overlay').css({ height: $(document).height() });
    // I can't get the popup to play nicely when there is a scroll bar and then
    // when there isn't - so going to adjust the width if a scroll bar is
    // visible (this needs to be done on timeout to give popup time to show).
    //
    // See: http://code.google.com/p/chromium/issues/detail?id=31494
    //
    // Listen for a table refresh event and add the class if needed.
    $(document).bind('table_updated', function(e) {
        if($(document).height() > $(window).height()) {
            $('body').addClass('scrollbars');
        }
    });

    /*
     * Helper function for creating progress bar element.
     */
    function progress_bar(torrent) {
        var $bar = $(document.createElement('div')).addClass('progress_bar');
        $(document.createElement('div'))
            .addClass('inner')
            .css('width', torrent.get_percent())
            .html($(document.createElement('span')).html(torrent.state + ' ' + torrent.get_percent()))
            .appendTo($bar);

        return $bar;
    }

    function action_links(torrent) {
        // Work out which state class to add based on torrent information.
        var state = torrent.state == "Paused" ? 'resume' : 'pause';
        // Do the same with auto managed state.
        var managed = torrent.auto_managed ? 'managed' : 'unmanaged';

        return $(document.createElement('div'))
            .addClass('main_actions')
            .append(
                // Delete.
                $(document.createElement('a')).addClass('delete'),
                // Pause/Resume buttons.
                $(document.createElement('a')).addClass('state').addClass(state),
                // Move up button.
                $(document.createElement('a')).addClass('move_up'),
                $(document.createElement('a')).addClass('move_down'),
                // Auto managed options.
                $(document.createElement('a')).addClass('toggle_managed').addClass(managed),
                // More options..
                $(document.createElement('a')).addClass('more')
            );
    }

    function update_table() {
        // Clear out any existing timers.
        clearTimeout(refresh_timer);
        Torrents.update()
            .success(function() {
                render_table();
                refresh_timer = setTimeout(update_table, refresh_interval);
            })
            .error(function() {
                // Problem fetching information, perform a status check.
                // Note: Not setting a timeout, should happen once update_table
                // gets called when extension check is OK.
                check_status();
            });
    }

    function render_table() {
        // Fetch new information.
        var torrents = Torrents.get_all();
        var $tbody = jQuery('#torrent_table tbody');

        $tbody.empty();
        for(var i=0; i < torrents.length; i++) {
            var torrent = torrents[i];

            var $tr = $(document.createElement('tr'))
                .data({ id: torrent.id }) /* Store torrent id on the tr */
                .append(
                // Checkbox.
                $(document.createElement('td'))
                    .addClass('table_cell_checkbox')
                    .html($('<input type="checkbox" name="selected_torrents[]">').val(torrent.id)),

                // Position cell.
                $(document.createElement('td'))
                    .addClass('table_cell_position')
                    .html(torrent.get_position()),

                // name.
                $(document.createElement('td'))
                    .addClass('table_cell_name')
                    .html(torrent.name),

                // Size.
                $(document.createElement('td'))
                    .addClass('table_cell_size')
                    .html(torrent.get_human_size()),

                // Progress bar.
                $(document.createElement('td'))
                    .addClass('table_cell_progress')
                    .html(progress_bar(torrent)),

                // Speed.
                $(document.createElement('td'))
                    .addClass('table_cell_speed')
                    .html(torrent.get_speeds()),

                // Estimated time.
                $(document.createElement('td'))
                    .addClass('table_cell_eta')
                    .html(torrent.get_eta()),

                // Action menus.
                $(document.createElement('td'))
                    .addClass('table_cell_actions')
                    .append(action_links(torrent))
            );

            torrent = null;
            $tbody.append($tr);
        }
        $(document).trigger('table_updated');
    }

    /*
     * Check the status of the extension and do the handling for the popup.
     *
     * This function only displays error messages, it's the job of the
     * background page to inform us the error has been resolved so we can update
     * the table.
     */
    function check_status() {
        background_page.Background.check_status({ timeout: 1000 }).success(function(response) {
            if (response === false) {
                // Most likely still waiting on daemon to start.
                $('span', $overlay).removeClass().addClass('error').html(
                    chrome.i18n.getMessage('error_daemon_not_running')
                );
                $overlay.show();
            }
        }).error(function(jqXHR, text, err) {
            var message = chrome.i18n.getMessage('error_generic');
            /*
             * Ignore any unauthenticated errors here - they are normally
             * resolved by an auto login in the background stuff and is normally
             * sorted before this message can be fully displayed.
             *
             * We will instead receive errors from the global event for auto
             * login failure to display the message to the user - see
             * auto_login_failed and Chrome extension addListner.
             */
            if (err.code !== Deluge.API_AUTH_CODE) {
                $('span', $overlay).removeClass().addClass('error').html(message);
                $overlay.show();
            }
        });
    }

    // This function is called when the background page sends an activated
    // message, this happens roughly every minute so we only want to call
    // update_table, or hide any current overlays once, we can let the local
    // timers in within this script handle table updating.
    function activated() {
        if (!extension_activated) {
            console.log('ACTIVATED');
            extension_activated = true;
            $overlay.hide();
            update_table();
        }
    }

    function deactivated() {
        extension_activated = false;
    }

    function auto_login_failed() {
        var message = chrome.i18n.getMessage('error_unauthenticated');
        $('span', $overlay).addClass('error').html(message);
        $overlay.show();
    }

    // Setup listeners for closing message overlays coming from background.
    chrome.extension.onRequest.addListener(
        function(request, sender, sendResponse) {
            if (request.msg == 'extension_activated') {
                activated();
            } else if (request.msg == 'extension_deactivated') {
                deactivated();
            } else if (request.msg == 'auto_login_failed') {
                auto_login_failed();
            }
        }
    );

    // Do initial check.
    check_status();
});
