$(function() {
    var $address = $('#address');
    var $password = $('#password');
    var $delugeDownloadIcon = $('#enable_download_torrent');
    var $debugMode = $('#enable_debug_mode');

    function restoreOptions() {
        $address.val(localStorage.delugeAddress);
        $password.val(localStorage.delugePassword);
  
        if (localStorage.delugeDownloadIcon == 'true') {
            $delugeDownloadIcon.attr('checked', 'checked');
        } else {
            $delugeDownloadIcon.removeAttr('checked');
        }
  
        if (localStorage.debugMode == 'true') {
            $debugMode.attr('checked', 'checked');
        } else {
            $debugMode.removeAttr('checked');
        }
    }

    function saveOptions() {
        var message = new Array();
        var addressVal = $address.val();
        var passwordVal = $password.val();
        var $downloadLinkChecked = $delugeDownloadIcon.is(':checked');
        var $debugModeChecked = $debugMode.is(':checked');

        if (addressVal) {
            if (localStorage.delugeAddress != addressVal) {
                message.push('Address updated.');
            }
            localStorage.delugeAddress = addressVal.replace(/\/$/, '');
        }
        
        if (passwordVal) {
            if (localStorage.delugePassword != passwordVal) {
                message.push('Password updated.');
            }
            localStorage.delugePassword = passwordVal;
        }
        
        var downloadIcon = localStorage.delugeDownloadIcon;
        if ($downloadLinkChecked
            && String($downloadLinkChecked) != downloadIcon) {
            message.push('Download torrent icon enabled!');
        } else if (String($downloadLinkChecked) != downloadIcon) {
            message.push('Download torrent icon disabled!');
        }
        localStorage.delugeDownloadIcon = $downloadLinkChecked;   

        var debugMode = localStorage.debugMode;
        if ($debugModeChecked
            && String($debugModeChecked) != debugMode) {
            message.push('Debug mode enabled!');
        } else if (String($debugModeChecked) != debugMode) {
            message.push('Debug mode disabled!');
        }
        localStorage.debugMode = $debugModeChecked;  

        var background = chrome.extension.getBackgroundPage();
        background.Background.check_status();

        if ($debugModeChecked) {
            console.log('deluge: options saved!');
        }
        
        if(message.length > 0) {
            var messageText = '';
            $.each(message, function(index, obj) {
                messageText += obj + '<br>';
            });
            $('#status-message').html(messageText).fadeIn();
            setTimeout('$("#status-message").fadeOut();', 5000);
        }
    }


    (function() {
        $('.buttons .save').live('click', function() {
            saveOptions();
            window.close();
            return false;
        });

        $('.buttons .apply').live('click', function() {
            saveOptions();
            return false;
        });

        $('.buttons .cancel').live('click', function() {
            window.close();
            return false;
        });

        restoreOptions();
    })();
});