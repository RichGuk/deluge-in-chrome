jQuery(document).ready(function($) {
    // Get extension background page for use within the code.
    var background_page = chrome.extension.getBackgroundPage();

    // Setup some initial translations.
    $('#loading_data_text').html(chrome.i18n.getMessage('loading_data'));

    // Set the initial height for the overlay.
    var $overlay = $('#overlay').css({ height: $(document).height() });
    // I can't get the popup to play nicely when there is a scroll bar and then
    // when there isn't - so going to adjust the width if a scroll bar is
    // visible (this needs to be done on timeout to give popup time to show).
    //
    // See: http://code.google.com/p/chromium/issues/detail?id=31494
    setTimeout(function() {
        if($(document).height() > $(window).height()) {
            $('body').addClass('scrollbars');
        }
    }, 5);

    /*
     * Check the status of the extension and do the handling for the popup.
     *
     * This function only displays error messages, it's the job of the
     * background page to inform us the error has been resolved.
     */
    function check_status() {
        // Perform a status check.
        background_page.Background.check_status({ timeout: 1000 }).success(function(response) {
            if (response === true) {
                $overlay.fadeOut('fast');
            } else {
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

    function activated() {
        $overlay.hide();
        // TODO: Fetch content.
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
            } else if (request.msg == 'auto_login_failed') {
                auto_login_failed();
            }
        }
    );

    // Do initial check.
    check_status($overlay);
});
