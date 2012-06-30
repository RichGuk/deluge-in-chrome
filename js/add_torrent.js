/*
 * This is a generalised search for torrent links.
 */

function showDownloadIcon() {
    var links = []
        // For all the found links, add the little download icon.
        , icon = chrome.extension.getURL('images/icons/16.png')
        , iconAdded = chrome.extension.getURL('images/icons/16_green.png')
        , i;
  
    // Find any anchor links that mention torrents.
    $('a[href*=torrent], a:contains(torrent)').each(function (i) {
        if (this === undefined) {
            return false;
        }
  
        // Now check that the link contains either .torrent or download, get, etc...
        if (this.href.search(/\/(download|get)\//) > 0 || this.href.search(/\.torrent$/) > 0) {
            links.push(this);
        }
    });

  
    for (i = 0; i < links.length; i += 1) {
        // Check we don't already have the icon.
        if ($(links[i]).next('.deluge-icon').length === 0) {
            $(links[i]).after('<a class="deluge-icon" title="Download in Deluge!" href="' + links[i].href + '"><img src="' + icon + '" alt="Download in Deluge" style="border:0;" /></a>');
        }
    }
  
    // For all the new Deluge download links we need to send a message to the main
    // extension to perform the adding action (see background.html).
    $('.deluge-icon').live('click', function () {
        var link = this;
    
        chrome.extension.sendRequest({ msg: 'add_torrent_from_url', url: this.href},
            function (response) {
                if (response.msg === 'success') {
                    $('img', link).attr('src', iconAdded);
                }
            });
        return false;
    });
}

function detectMagnetLinks() {
    $('a[href*="magnet:?"], a:contains("magnet:?")').live('click', function () {
        var link = this;
        
        chrome.extension.sendRequest({ msg: 'add_torrent_from_magnet', url: this.href}
            );
        return false;
    });
}

chrome.extension.sendRequest({msg: 'get_download_options'}, function (response) {
    if (response.enable_deluge_icon === 'true') {
        showDownloadIcon();
    }
    if (response.enable_one_click_magnets === 'true') {
        detectMagnetLinks();
    }
});