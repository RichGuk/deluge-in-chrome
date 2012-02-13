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

    pub.getAll = function() {
        return torrents;
    };

    pub.getById = function(val) {
        for (var i = 0; i < torrents.length; i++) {
            if (torrents[i].id == val) {
                return torrents[i];
            }
        }
        return false;
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
                if (localStorage.sortMethod == 'desc') {
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

/*
 * Responsible for all display, page or functional control on the status page.
 *
 * - Setting refresh timers.
 * - Rendering HTML for table.
 * - Logic for action buttons.
 */
jQuery(document).ready(function($) {
    // Get extension background page for use within the code.
    var backgroundPage = chrome.extension.getBackgroundPage();
    // Setup timer information.
    var refreshTimer = null;
    const REFRESH_INTERVAL = 2000;
    // Store the extension activation state.
    var extensionActivated = false;

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
    function progressBar(torrent) {
        var $bar = $(document.createElement('div')).addClass('progress_bar');
        $(document.createElement('div'))
            .addClass('inner')
            .css('width', torrent.getPercent())
            .appendTo($bar);

        $(document.createElement('span'))
            .html(torrent.state + ' ' + torrent.getPercent())
            .appendTo($bar);

        return $bar;
    }

    function actionLinks(torrent) {
        // Work out which state class to add based on torrent information.
        var state = torrent.state == "Paused" ? 'resume' : 'pause';
        // Do the same with auto managed state.
        var managed = torrent.autoManaged ? 'managed' : 'unmanaged';

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

    function updateTable() {
        // Clear out any existing timers.
        clearTimeout(refreshTimer);
        Torrents.update()
            .success(function() {
                renderTable();
                refreshTimer = setTimeout(updateTable, REFRESH_INTERVAL);
            })
            .error(function() {
                // Problem fetching information, perform a status check.
                // Note: Not setting a timeout, should happen once updateTable
                // gets called when extension check is OK.
                checkStatus();
            });
    }

    /**
     * Pause the table refresh.
     */
    function pauseTableRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
    }

     /**
    * Resume the table refresh.
    */
    function resumeTableRefresh() {
        if (refreshTimer) {
          clearInterval(refreshTimer);
          refreshTimer = null;
        }
        refreshTimer = setInterval('updateTable()', REFRESH_INTERVAL);
    }

    function renderTable() {
        // Fetch new information.
        var torrents = Torrents.getAll();
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
                    .html(torrent.getPosition()),

                // name.
                $(document.createElement('td'))
                    .addClass('table_cell_name')
                    .html(torrent.name),

                // Size.
                $(document.createElement('td'))
                    .addClass('table_cell_size')
                    .html(torrent.getHumanSize()),

                // Progress bar.
                $(document.createElement('td'))
                    .addClass('table_cell_progress')
                    .html(progressBar(torrent)),

                // Speed.
                $(document.createElement('td'))
                    .addClass('table_cell_speed')
                    .html(torrent.getSpeeds()),

                // Estimated time.
                $(document.createElement('td'))
                    .addClass('table_cell_eta')
                    .html(torrent.getEta()),

                // Action menus.
                $(document.createElement('td'))
                    .addClass('table_cell_actions')
                    .append(actionLinks(torrent))
            );

            torrent = null;
            $tbody.append($tr);
        }
        $(document).trigger('table_updated');
    }

    (function() {

        function getRowData(element) {
            var $parent = $(element).parents('tr');
            var torrentId = $parent.data('id');
            var torrent = Torrents.getById(torrentId);

            return {'torrentId': torrentId, 'torrent': torrent};
        }

        $('.main_actions .toggle_managed').live('click', function() {
            var rowData = getRowData(this);
            var autoManaged = !rowData.torrent.autoManaged;

            Deluge.api('core.set_torrent_auto_managed', [rowData.torrentId, autoManaged])
                .success(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Auto managed - ' + autoManaged);
                    }
                    updateTable();
                })
                .error(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Failed to toggle auto managed');
                    }
                });
        });

        $('.main_actions .state').live('click', function() {
            var rowData = getRowData(this);
            var method = rowData.torrent.state == 'Paused' ? 'core.resume_torrent' : 'core.pause_torrent';

            Deluge.api(method, [[rowData.torrentId]])
                .success(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Updated state');
                    }
                    updateTable();
                })
                .error(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Failed to update state');
                    }
                });
        });

        $('.main_actions .move_up').live('click', function() {
            var rowData = getRowData(this);

            Deluge.api('core.queue_up', [[rowData.torrentId]])
                .success(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Moved torrent up');
                    }
                    updateTable();
                })
                .error(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Failed to move torrent up');
                    }
                });
        });

        $('.main_actions .move_down').live('click', function() {
            var rowData = getRowData(this);

            Deluge.api('core.queue_down', [[rowData.torrentId]])
                .success(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Moved torrent down');
                    }
                    updateTable();
                })
                .error(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Failed to move torrent down');
                    }
                });
        });

        $('.main_actions .delete').live('click', function() {
            pauseTableRefresh();

            var parentTd = $(this).parents('td');
            var newElm = $('<div>');
            newElm.addClass('delete-options');
            parentTd.append(newElm);
            newElm.animate({width: '100px'}, 'fast', function() {
                var tmp = $(this);
                tmp.append('<a href="#cancel" title="Cancel" rel="cancel"><img src="images/cancel.png" alt="C" /></a>');
                tmp.append('<a href="#delete-data" title="Delete torrent AND data" rel="data"><img src="images/trash.png" alt="TD" /></a>');
                tmp.append('<a href="#delete-torrent" title="Just delete torrent file" rel="torrent"><img src="images/file.png" alt="T" /></a>');
            });
        });

        $('.delete-options a').live('click', function() {
            var rowData = getRowData(this);

            var action = $(this).attr('rel') || 'cancel';
            // If canceling remove overlay and resume refresh now and return.
            if(action == 'cancel') {
                $('.delete-options').fadeOut('fast', function() {
                  // Force an update.
                  resumeTableRefresh();
                  updateTable();
                });
                return false;
            }

            function removeButtons() {
                // Remove buttons, resume refresh.
                $('.delete-options').fadeOut('fast', function() {
                    resumeTableRefresh();
                    updateTable();
                });
            }

            var delData = (action == 'data') ? true : false;
            Deluge.api('core.remove_torrent', [rowData.torrentId, delData])
                .success(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Removed torrent');
                    }
                    removeButtons();
                })
                .error(function() {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Failed to remove torrent');
                    }
                    removeButtons();
                });
            return false;
        });
    })();

    (function() {
        var $inputBox = $('#manual_add_input');
        var $addButton = $('#manual_add_button');

        $inputBox.keydown(function(event){
            if (event.keyCode == '13') {
                event.preventDefault();
                $addButton.click();
            }
        });

        $addButton.live('click', function() {
            var url = $inputBox.val();

            // Now check that the link contains either .torrent or download, get, etc...
            if(url.search(/\/(download|get)\//) > 0 || url.search(/\.torrent$/) > 0) {
                chrome.extension.sendRequest({ msg: 'add_torrent_from_url', url: url},
                function(response) {
                    if(response.msg == 'success') {
                        $inputBox.val('');
                    }
                });
                return false;
            }
            return false;
        });
    })();

    /*
     * Check the status of the extension and do the handling for the popup.
     *
     * This function only displays error messages, it's the job of the
     * background page to inform us the error has been resolved so we can update
     * the table.
     */
    function checkStatus() {
        backgroundPage.Background.checkStatus({ timeout: 1000 }).success(function(response) {
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
             * autoLoginFailed and Chrome extension addListner.
             */
            if (err.code !== Deluge.API_AUTH_CODE) {
                $('span', $overlay).removeClass().addClass('error').html(message);
                $overlay.show();
            }
        });
    }

    // This function is called when the background page sends an activated
    // message, this happens roughly every minute so we only want to call
    // updateTable, or hide any current overlays once. We can let the local
    // timers within this script handle table updating.
    function activated() {
        if (!extensionActivated) {
            if (Global.getDebugMode()) {
                console.log('Deluge: ACTIVATED');
            }
            extensionActivated = true;
            $overlay.hide();
            updateTable();
        }
    }

    function deactivated() {
        extensionActivated = false;
    }

    function autoLoginFailed() {
        var message = chrome.i18n.getMessage('error_unauthenticated');
        $('span', $overlay).addClass('error').html(message);
        $overlay.show();
    }

    // Setup listeners for closing message overlays coming from background.
    chrome.extension.onRequest.addListener(
        function(request, sender, sendResponse) {
            if (Global.getDebugMode()) {
                console.log(request.msg);
            }
            if (request.msg == 'extension_activated') {
                activated();
            } else if (request.msg == 'extension_deactivated') {
                deactivated();
            } else if (request.msg == 'auto_login_failed') {
                autoLoginFailed();
            }
        }
    );

    // Do initial check.
    checkStatus();
});
