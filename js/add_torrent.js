/*
 * This is a generalised search for torrent links.
 */

function showDownloadIcon() {
    var links = [];
  
    // Find any anchor links that mention torrents.
    $('a[href*=torrent], a:contains(torrent)').each(function(i) {
        if(this === undefined) {
            return false;
        }
  
        // Now check that the link contains either .torrent or download, get, etc...
        if(this.href.search(/\/(download|get)\//) > 0 || this.href.search(/\.torrent$/) > 0) {
            links.push(this);
        }
        return false;
    });

    // For all the found links, add the little download icon.
    var icon = chrome.extension.getURL('images/icons/16.png');
    var iconAdded = chrome.extension.getURL('images/icons/16_green.png');
  
    for(var i = 0; i < links.length; i++) {
        // Check we don't already have the icon.
        if($(links[i]).next('.deluge-icon').length > 0) {
          continue;
        }
        $(links[i]).after('<a class="deluge-icon" title="Download in Deluge!" href="' + links[i].href + '"><img src="' + icon + '" alt="Download in Deluge" style="border:0;" /></a>');
    }
  
    // For all the new Deluge download links we need to send a message to the main
    // extension to perform the adding action (see background.html).
    $('.deluge-icon').live('click', function() {
        var link = this;
    
        chrome.extension.sendRequest({ msg: 'add_torrent_from_url', url: this.href},
        function(response) {
          if(response.msg == 'success') {
            $('img', link).attr('src', iconAdded);
          }
        });
        return false;
    });
}

chrome.extension.sendRequest({msg: 'enable_download_icon'}, function(response) {
    if(response == 'true') {
        showDownloadIcon();
    }
});