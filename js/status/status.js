/*
 * Responsible for all display, page or functional control on the status page.
 *
 * - Setting refresh timers.
 * - Rendering HTML for table.
 * - Logic for action buttons.
 */
jQuery(document).ready(function ($) {
    // Get extension background page for use within the code.
    var backgroundPage = chrome.extension.getBackgroundPage()
        // Store the extension activation state.
        , extensionActivated = false
        , checked = []
        // Set the initial height for the overlay.
        , $overlay = $('#overlay').css({ height: $(document).height() });


    // Setup timer information.
    const REFRESH_INTERVAL = 2000;
    var refreshTimer = Timer(REFRESH_INTERVAL);



    // I can't get the popup to play nicely when there is a scroll bar and then
    // when there isn't - so going to adjust the width if a scroll bar is
    // visible (this needs to be done on timeout to give popup time to show).
    //
    // See: http://code.google.com/p/chromium/issues/detail?id=31494
    //
    // Listen for a table refresh event and add the class if needed.
    $(document).bind('table_updated', function (e) {
        if ($(document).height() > $(window).height()) {
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
        // Work out which states to use based on torrent information.
        var state = torrent.state === 'Paused' ? 'resume' : 'pause'
            , managed = torrent.autoManaged ? 'managed' : 'unmanaged';

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
                $(document.createElement('a')).addClass('toggle_managed').addClass(managed)
            );
    }

    function updateTable() {
        // Clear out any existing timers.
        refreshTimer.unsubscribe();
        $('[name]=selected_torrents[checked]').each(function () {
            checked.push($(this).val());
        });
        Torrents.update()
            .success(function () {
                renderTable();
                renderGlobalInformation();
                refreshTimer.subscribe(updateTable);
            })
            .error(function () {
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
        refreshTimer.unsubscribe();
    }

     /**
    * Resume the table refresh.
    */
    function resumeTableRefresh() {
        refreshTimer.unsubscribe();
        refreshTimer.subscribe(updateTable);
    }

    function renderGlobalInformation() {
        var information = Torrents.getGlobalInformation();
        $globalInformation = $('#global-information');

        if (Global.getDebugMode()) {
            console.log(information);
        }

        $('.all', $globalInformation).html(information.all);
        $('.downloading', $globalInformation).html(information.downloading);
        $('.paused', $globalInformation).html(information.paused);
        $('.seeding', $globalInformation).html(information.seeding);
        $('.queued', $globalInformation).html(information.queued);
    }

    function renderTable() {
        // Fetch new information.
        var torrents = Torrents.getAll()
            , $tbody = $('#torrent_table tbody')
            , i, torrent, isChecked, $tr;

        $tbody.empty();
        for (i = 0; i < torrents.length; i += 1) {
            torrent = torrents[i];
            isChecked = '';

            if (checked.indexOf(torrent.id) !== -1) {
                isChecked = 'checked=checked';
            }
            $tr = $(document.createElement('tr'))
                .data({ id: torrent.id }) /* Store torrent id on the tr */
                .append(
                    // Checkbox.
                    $(document.createElement('td'))
                        .addClass('table_cell_checkbox')
                        .html($('<input type="checkbox" name="selected_torrents[]"' + isChecked + '>').val(torrent.id)),

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
        checked = [];
        $(document).trigger('table_updated');
    }

    (function () {
        function getRowData(element) {
            var $parent = $(element).parents('tr')
                , torrentId = $parent.data('id')
                , torrent = Torrents.getById(torrentId);
            return {'torrentId': torrentId, 'torrent': torrent};
        }

        var $mainActions = $('.main_actions');

        $('.toggle_managed', $mainActions).live('click', function () {
            var rowData = getRowData(this)
                , autoManaged = !rowData.torrent.autoManaged;

            Deluge.api('core.set_torrent_auto_managed', [rowData.torrentId, autoManaged])
                .success(function () {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Auto managed - ' + autoManaged);
                    }
                    updateTable();
                })
                .error(function () {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Failed to toggle auto managed');
                    }
                });
        });

        $('.state', $mainActions).live('click', function () {
            var rowData = getRowData(this)
                , method = rowData.torrent.state === 'Paused' ? 'core.resume_torrent' : 'core.pause_torrent';

            Deluge.api(method, [[rowData.torrentId]])
                .success(function () {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Updated state');
                    }
                    updateTable();
                })
                .error(function () {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Failed to update state');
                    }
                });
        });

        $('.move_up', $mainActions).live('click', function () {
            var rowData = getRowData(this);

            Deluge.api('core.queue_up', [[rowData.torrentId]])
                .success(function () {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Moved torrent up');
                    }
                    updateTable();
                })
                .error(function () {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Failed to move torrent up');
                    }
                });
        });

        $('.move_down', $mainActions).live('click', function () {
            var rowData = getRowData(this);

            Deluge.api('core.queue_down', [[rowData.torrentId]])
                .success(function () {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Moved torrent down');
                    }
                    updateTable();
                })
                .error(function () {
                    if (Global.getDebugMode()) {
                        console.log('Deluge: Failed to move torrent down');
                    }
                });
        });

        function showDeleteOptions($parent, actionClass) {
            var $parentTd = $parent
                , newElm = $('<div>');

            newElm.addClass('delete-options').hide();
            $(actionClass, $parentTd).hide();
            $parentTd.append(newElm);
            newElm.fadeIn('fast', function () {
                var $tmp = $(this);

                $tmp.append(
                    // Cancel.
                    $(document.createElement('a')).addClass('cancel').prop('rel', 'cancel'),
                    // Delete torrent and data.
                    $(document.createElement('a')).addClass('data').prop('rel', 'data'),
                    // Delete just torrent.
                    $(document.createElement('a')).addClass('torrent').prop('rel', 'torrent')
                );
            });
        }

        $('.delete', $mainActions).live('click', function () {
            pauseTableRefresh();
            showDeleteOptions($(this).parents('td'), '.main_actions');

        });

        $('.all_actions .delete').live('click', function () {
            pauseTableRefresh();
            showDeleteOptions($(this).parents('td'), '.all_actions');
        });

        $('.delete-options a').live('click', function () {
            var action = $(this).attr('rel') || 'cancel'
                , parentClass = $(this).parents('td').attr('class')
                , delData = (action === 'data') ? true : false
                , rowData;

            function removeButtons() {
                // Remove buttons, resume refresh.
                $('.delete-options').fadeOut('fast', function () {
                    resumeTableRefresh();
                    updateTable();
                });
            }

            // If canceling remove overlay and resume refresh now and return.
            if (action === 'cancel') {
                removeButtons();
                return false;
            }

            function removeTorrent(id) {
                Deluge.api('core.remove_torrent', [id, delData])
                    .success(function () {
                        if (Global.getDebugMode()) {
                            console.log('Deluge: Removed torrent');
                        }
                        removeButtons();
                    })
                    .error(function () {
                        if (Global.getDebugMode()) {
                            console.log('Deluge: Failed to remove torrent');
                        }
                        removeButtons();
                    });
            }

            if (parentClass === 'table_cell_actions') {
                rowData = getRowData(this);
                removeTorrent(rowData.torrentId);
            } else {
                $('[name]=selected_torrents[checked]').each(function () {
                    rowData = getRowData(this);
                    removeTorrent(rowData.torrentId);
                });
            }
            return false;
        });
    }());

    (function () {
        $('#add-torrent').click(function(e) {
            e.preventDefault();
            $('#add-torrent-dialog').show();
            $('#add-torrent-dialog').click(function(e) {
                $(this).hide();
            });

            /* Don't closed if clicked within .inner */
            $('#add-torrent-dialog .inner').click(function(e) {
                e.stopPropagation();
            });
        });
        // For some reason the link has focus when the status is shown, however
        // we can't blur straight away, wait 10ms then do it.
        setTimeout(function() { $('#add-torrent').blur(); }, '10');

        $('#add-torrent-dialog .close').click(function(e) {
            e.preventDefault();
            $('#add-torrent-dialog').hide()
        });

        var $inputBox = $('#manual_add_input')
            , $addButton = $('#manual_add_button');

        $inputBox.keydown(function (event) {
            if (event.keyCode === '13') {
                event.preventDefault();
                $addButton.click();
            }
        });

        $addButton.live('click', function (e) {
            e.preventDefault();
            var url = $inputBox.val();

            // Now check that the link contains either .torrent or download, get, etc...
            if (url.search(/\/(download|get)\//) > 0 || url.search(/\.torrent$/) > 0) {
                chrome.extension.sendRequest({ msg: 'add_torrent_from_url', url: url},
                    function (response) {
                        if (response.msg === 'success') {
                            $inputBox.val('');
                        }
                    });
            } else if (url.search(/magnet:/) != -1) {
                chrome.extension.sendRequest({ msg: 'add_torrent_from_magnet', url: url},
                    function (response) {
                        console.log(response);
                        if (response.msg === 'success') {
                            $inputBox.val('');
                        }
                    });
            }

            $('#add-torrent-dialog').hide();
        });
    }());

    /*
     * Check the status of the extension and do the handling for the popup.
     *
     * This function only displays error messages, it's the job of the
     * background page to inform us the error has been resolved so we can update
     * the table.
     */
    function checkStatus() {
        backgroundPage.Background.checkStatus({ timeout: 1000 }).success(function (response) {
            if (response === false) {
                // Most likely still waiting on daemon to start.
                $('span', $overlay).removeClass().addClass('error').html(
                    chrome.i18n.getMessage('error_daemon_not_running')
                );
                $overlay.show();
            }
        }).error(function (jqXHR, text, err) {
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
        function (request, sender, sendResponse) {
            if (Global.getDebugMode()) {
                console.log(request.msg);
            }
            if (request.msg === 'extension_activated') {
                activated();
            } else if (request.msg === 'extension_deactivated') {
                deactivated();
            } else if (request.msg === 'auto_login_failed') {
                autoLoginFailed();
            }
        }
    );

    // Do initial check.
    checkStatus();
});
