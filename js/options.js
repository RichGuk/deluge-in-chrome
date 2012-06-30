$(function () {
    var $address = $('#address')
        , $password = $('#password')
        , $delugeDownloadIcon = $('#enable_download_torrent')
        , $oneClickMagnets = $('#enable_one_click_magnet')
        , $debugMode = $('#enable_debug_mode')
        , $contextMenu = $('#enable_context_menu')
        , background = chrome.extension.getBackgroundPage();
    
    function restoreOptions(version) {
        $address.val(localStorage.delugeAddress);
        $password.val(localStorage.delugePassword);
  
        if (localStorage.delugeDownloadIcon === 'true') {
            $delugeDownloadIcon.attr('checked', 'checked');
        } else {
            $delugeDownloadIcon.removeAttr('checked');
        }
        
        if (version.major > 1 || (version.major === 1 && version.minor > 3) ||
                (version.major === 1 && version.minor === 3 && version.build > 3)) {
            $('#magnet').show();
            
            if (localStorage.oneClickMagnets === 'true') {
                $oneClickMagnets.attr('checked', 'checked');
            } else {
                $oneClickMagnets.removeAttr('checked');
            }
        } 
    
        if (localStorage.contextMenu === 'true') {
            $contextMenu.attr('checked', 'checked');
        } else {
            $contextMenu.removeAttr('checked');
        }
  
        if (localStorage.debugMode === 'true') {
            $debugMode.attr('checked', 'checked');
        } else {
            $debugMode.removeAttr('checked');
        }
    }

    function saveOptions() {
        var message = []
            , addressVal = $address.val()
            , passwordVal = $password.val()
            , $downloadLinkChecked = $delugeDownloadIcon.is(':checked')
            , $oneClickMagnetsChecked = $oneClickMagnets.is(':checked')
            , $debugModeChecked = $debugMode.is(':checked')
            , $contextMenuChecked = $contextMenu.is(':checked')
            , downloadIcon = localStorage.delugeDownloadIcon
            , oneClickMagnets = localStorage.oneClickMagnets
            , contextMenu = localStorage.contextMenu
            , debugMode = localStorage.debugMode
            , messageText = ''
            , $message = $('#status-message');

        if (addressVal) {
            if (localStorage.delugeAddress !== addressVal) {
                message.push('Address updated.');
            }
            localStorage.delugeAddress = addressVal.replace(/\/$/, '');
        }
        
        if (passwordVal) {
            if (localStorage.delugePassword !== passwordVal) {
                message.push('Password updated.');
            }
            localStorage.delugePassword = passwordVal;
        }
        
        if ($downloadLinkChecked && String($downloadLinkChecked) !== downloadIcon) {
            message.push('Download torrent icon enabled!');
        } else if (String($downloadLinkChecked) !== downloadIcon) {
            message.push('Download torrent icon disabled!');
        }
        localStorage.delugeDownloadIcon = $downloadLinkChecked;
        
        if ($oneClickMagnetsChecked && String($oneClickMagnetsChecked) !== oneClickMagnets) {
            message.push('One click magnet downloads enabled!');
        } else if (String($oneClickMagnetsChecked) !== oneClickMagnets) {
            message.push('One click magnet downloads disabled!');
        }
        localStorage.oneClickMagnets = $oneClickMagnetsChecked;
        
        if ($contextMenuChecked && String($contextMenuChecked) !== contextMenu) {
            message.push('Context Menu enabled!');
            background.Background.addContextMenu();
        } else if (String($contextMenuChecked) !== contextMenu) {
            message.push('Context Menu disabled!');
            background.Background.removeContextMenu();
        }
        localStorage.contextMenu = $contextMenuChecked; 

        if ($debugModeChecked && String($debugModeChecked) !== debugMode) {
            message.push('Debug mode enabled!');
        } else if (String($debugModeChecked) !== debugMode) {
            message.push('Debug mode disabled!');
        }
        localStorage.debugMode = $debugModeChecked;  

        background.Background.checkStatus();

        if ($debugModeChecked) {
            console.log('Deluge: options saved!');
        }
        
        function hideMessage() {
            $message.fadeOut();
        }
        
        if (message.length > 0) {
            $.each(message, function (index, obj) {
                messageText += obj + '<br>';
            });
            $message.html(messageText).fadeIn();
            setTimeout(hideMessage, 5000);
        }
    }


    (function () {
        $('.buttons .save').live('click', function () {
            saveOptions();
            window.close();
            return false;
        });

        $('.buttons .apply').live('click', function () {
            saveOptions();
            return false;
        });

        $('.buttons .cancel').live('click', function () {
            window.close();
            return false;
        });

        
        background.Background.getVersion(restoreOptions);
    }());
});