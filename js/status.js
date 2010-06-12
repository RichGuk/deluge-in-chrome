var ENDPOINT = localStorage.deluge_address + '/json';

// Used to store the timer.
var INTERVAL_UI = 0;
// Notice: This might not be in order (order being queue position).
var STORED_TORRENT_STATE = {};
var COUNTER = 0;
// How often should we refresh the torrent information.
var STATUS_REFRESH_INTERVAL = 2000;

/**
 * Update the torrent state UI elements.
 * Number of downloading torrents, seeding etc...
 *
 * @param {object} states The different type of states returned by Deluge.
 */
function update_torrent_states(states) {
  for(var i in states) {
    if (states.hasOwnProperty(i)) {
      var id = states[i][0].toLowerCase();
      var val = states[i][1];

      $('#global-information .' + id).html(val);
    }
  }
}

/**
 * Update the torrent listings table with the latest torrent information.
 *
 * @params {object} List of torrent information.
 */
function update_torrents(torrents) {
  if(!torrents) {
    console.log('deluge: missing torrent information.');
    return false;
  }

  var sorted_torrents = [];
  for(var torrent_id in torrents) {
    if(torrents.hasOwnProperty(torrent_id)) {
      sorted_torrents.push([torrent_id, torrents[torrent_id]]);
    }
  }

  // Sort the torrents list based on queue position.
  sorted_torrents = sorted_torrents.sort(function(a, b) {
      var q1 = a[1].queue, q2 = b[1].queue;

      if(q1 < q2) {
        return -1;
      }
      if(q1 > q2) {
        return 1;
      }
      return 0;
    });

  // Simple method of updating the table, lets just replace the tbody content.
  var tbody = $('<tbody>');

  for(var i = 0; i < sorted_torrents.length; i++) {
    var id = sorted_torrents[i][0];
    var torrent = sorted_torrents[i][1];

    // Update / add to the stored torrents variable - so we can access
    // the latest state of torrents in other functions.
    eval('STORED_TORRENT_STATE._' + id + '= torrent');

    var buttons = $('<td>').addClass('right buttons');
    buttons.append('<a href="#delete" class="delete" title="Delete"><img src="images/remove.png" alt="X" /></a>');
    if(torrent.state.toLowerCase() == 'paused') {
      buttons.append('<a href="#resume" class="pause-resume" title="Resume"><img src="images/start.png" alt="P" /></a>');
    } else {
      buttons.append('<a href="#pause" class="pause-resume" title="Pause"><img src="images/pause.png" alt="P" /></a>');
    }
    buttons.append('<a href="#up" class="queue-up" title="Move up"><img src="images/up.png" alt="U" /></a>');
    buttons.append('<a href="#down" class="queue-down" title="Move down"><img src="images/down.png" alt="D" /></a>');
    if(torrent.is_auto_managed) {
      buttons.append('<a href="#managed" class="auto-managed" title="Turn off auto managed"><img src="images/manage_active.png" alt="M" /></a>');
    } else {
      buttons.append('<a href="#managed" class="auto-managed" title="Turn on auto managed"><img src="images/manage.png" alt="M" /></a>');
    }


    var progress_bar = $('<div>').addClass('progress-bar');
    var progress_bar_inner = $('<div>').addClass('progress');
    var percent = (Math.round(torrent.progress * Math.pow(10,2)) / Math.pow(10, 2)) + '%';

    // Set the width to the current progress of the torrent, so x percent.
    progress_bar_inner.css('width', percent);
    // Add some text based on state and percent like "Downloadng 80%"
    progress_bar_inner.append($('<span>').html(torrent.state + ' ' + percent));
    progress_bar.append(progress_bar_inner);

    // Work out the torrent size.
    var torrent_size = fsize(torrent.total_size);
    var torrent_speed = fspeed(torrent.download_payload_rate) + ' - ' + fspeed(torrent.upload_payload_rate);
    var queue = torrent.queue + 1;
    if(queue <= 0) {
      queue = '';
    }

    // Create a checkbox for globally applied options.
    var checkbox = $('<input class="selected_torrents" type="checkbox"/>');
    checkbox.attr({name: 'selected_torrents[]', value: id});

    var tr = $('<tr>').attr('id', id);
    tr.append($('<td>').addClass('left').html(checkbox));
    tr.append($('<td>').html(queue));
    tr.append($('<td>').html(torrent.name).addClass('name'));
    tr.append($('<td>').html(torrent_size));
    tr.append($('<td>').html(progress_bar));
    tr.append($('<td>').html(torrent_speed));
    tr.append($('<td>').html(ftime(torrent.eta)));
    tr.append(buttons);

    tbody.append(tr);
  }
  // Now update the old tbody with the new content.
  $('#torrents table tbody').replaceWith(tbody);
}


/**
 * Fetch latest torrent information from Deluge and update various
 * variables and UI elements.
 */
function update_ui() {
  COUNTER++;

  $.post(ENDPOINT,
    JSON.stringify({method: 'web.update_ui',
      params: [[
        'queue', 'name', 'total_size', 'state', 'progress',
        'download_payload_rate', 'upload_payload_rate', 'eta',
        'ratio', 'is_auto_managed'
      ], {}], id: COUNTER}),
    function(obj, status) {
      if(!obj || obj.error !== null || !obj.result) {
        console.log('deluge: error fetching torrent status information!');
        return;
      }

      update_torrent_states(obj.result.filters.state);
      update_torrents(obj.result.torrents);
    }, 'json');
}


/**
 * Pause the table refresh.
 */
 function pause_table_refresh() {
   clearInterval(INTERVAL_UI);
   $('#table-refresh-status span').removeClass('active').addClass('inactive').html('Paused');
 }

 /**
  * Resume the table refresh.
  */
  function resume_table_refresh() {
    if (INTERVAL_UI) {
      clearInterval(INTERVAL_UI);
      INTERVAL_UI = null;
    }
    INTERVAL_UI = setInterval('update_ui()', STATUS_REFRESH_INTERVAL);
    $('#table-refresh-status span').removeClass('inactive').addClass('active').html(STATUS_REFRESH_INTERVAL / 1000 + 's');
  }

$('.buttons .delete').live('click', function() {
  // Stop the table refresh, so we can show the delete options for
  // this torrent.
  pause_table_refresh();

  var parent = $(this).parents('tr');
  var parent_td = $(this).parent('td');

  var new_elm = $('<div>');
  new_elm.addClass('delete-options');
  parent_td.append(new_elm);
  new_elm.animate({width: '100px'}, 'fast', function() {
    var tmp = $(this);
    tmp.append('<a href="#cancel" title="Cancel" rel="cancel"><img src="images/cancel.png" alt="C" /></a>');
    tmp.append('<a href="#delete-data" title="Delete torrent AND data" rel="data"><img src="images/trash.png" alt="TD" /></a>');
    tmp.append('<a href="#delete-torrent" title="Just delete torrent file" rel="torrent"><img src="images/file.png" alt="T" /></a>');
  });
});

$('.buttons .delete-options a').live('click', function() {

  var elm = $(this);
  var parent = $(this).parents('tr');
  var torrent_id = parent.attr('id');

  var action = $(this).attr('rel') || 'cancel';
  // If canceling remove overlay and resume refresh now and return.
  if(action == 'cancel') {
    $('.delete-options').fadeOut('fast', function() {
      // Force an update.
      update_ui();
      resume_table_refresh();
    });
    return false;
  }

  var del_data = (action == 'data') ? true : false;
  COUNTER++;
  $.post(ENDPOINT,
    JSON.stringify({
      method: 'core.remove_torrent',
      params: [torrent_id, del_data],
      id: COUNTER
    }),
    function(obj, status) {
      // Remove buttons, resume refresh.
      $('.delete-options').fadeOut('fast', function() {
        resume_table_refresh();
        // Force an update.
        update_ui();
      });
    },'json');
});

$('.buttons .auto-managed').live('click', function() {
  var parent = $(this).parents('tr');
  var torrent_id = parent.attr('id');
  var torrent = eval('STORED_TORRENT_STATE._' + torrent_id);
  var auto_managed = !torrent.is_auto_managed;

  COUNTER++;
  $.post(ENDPOINT,
    JSON.stringify({method: 'core.set_torrent_auto_managed', params: [
      torrent_id,
      auto_managed
    ], id: COUNTER}),
    function(obj, status) {
      update_ui();
    },'json');
});

$('.buttons .pause-resume').live('click', function() {
  var parent = $(this).parents('tr');
  var torrent_id = parent.attr('id');
  var torrent = eval('STORED_TORRENT_STATE._' + torrent_id);
  var _method = torrent.state == 'Paused' ? 'core.resume_torrent' : 'core.pause_torrent';

  COUNTER++;
  $.post(ENDPOINT,
    JSON.stringify({method: _method, params: [[torrent_id]], id: COUNTER}),
    function(obj, status) {
      // Just update the UI, should reflect any changes.
      update_ui();
    }, 'json');

  return false;
});

$('.buttons .queue-up').live('click', function() {
  var parent = $(this).parents('tr');
  var torrent_id = parent.attr('id');

  COUNTER++;
  $.post(ENDPOINT,
    JSON.stringify({method: 'core.queue_up', params: [[
      torrent_id
    ]], id: COUNTER}),
    update_ui,
    'json');
});

$('.buttons .queue-down').live('click', function() {
  var parent = $(this).parents('tr');
  var torrent_id = parent.attr('id');

  COUNTER++;
  $.post(ENDPOINT,
    JSON.stringify({method: 'core.queue_down', params: [[
      torrent_id
    ]], id: COUNTER}),
    update_ui,
    'json');
});

//
//Global events.
//

$('.selected_torrents').live('click', function() {
  if($(this + ':checked').length > 0) {
    pause_table_refresh();
  } else {
    resume_table_refresh();
  }
});

// Global start (un-pause).
$('.global_actions .start').live('click', function() {
  var parent = $(this).parents('tr');

  // Get a list of selected torrent IDs.
  var torrent_ids = [];
  $('.selected_torrents:checked').each(function(i, sel) {
    torrent_ids.push($(sel).val());
  });

  // See if we have any torrent ids to send, no point doing call if not.
  if(torrent_ids.length == 0) {
    return false;
  }
  COUNTER++;
  $.post(ENDPOINT,
    JSON.stringify({method: 'core.resume_torrent', params: [torrent_ids], id: COUNTER}),
    function(obj, status) {
      // Just update the UI, should reflect any changes.
      update_ui();
      resume_table_refresh();
    }, 'json');

  return false;
});

// Global pause.
$('.global_actions .pause').live('click', function() {
  var parent = $(this).parents('tr');

  // Get a list of selected torrent IDs.
  var torrent_ids = [];
  $('.selected_torrents:checked').each(function(i, sel) {
    torrent_ids.push($(sel).val());
  });

  // See if we have any torrent ids to send, no point doing call if not.
  if(torrent_ids.length == 0) {
    return false;
  }
  COUNTER++;
  $.post(ENDPOINT,
    JSON.stringify({method: 'core.pause_torrent', params: [torrent_ids], id: COUNTER}),
    function(obj, status) {
      // Just update the UI, should reflect any changes.
      update_ui();
      resume_table_refresh();
    }, 'json');

  return false;
});

// Global up.
$('.global_actions .queue-up').live('click', function() {
  var parent = $(this).parents('tr');

  // Get a list of selected torrent IDs.
  var torrent_ids = [];
  $('.selected_torrents:checked').each(function(i, sel) {
    torrent_ids.push($(sel).val());
  });

  // See if we have any torrent ids to send, no point doing call if not.
  if(torrent_ids.length == 0) {
    return false;
  }
  COUNTER++;
  $.post(ENDPOINT,
    JSON.stringify({method: 'core.queue_up', params: [torrent_ids], id: COUNTER}),
    function(obj, status) {
      // Just update the UI, should reflect any changes.
      update_ui();
      resume_table_refresh();
    }, 'json');

  return false;
});

// Global down.
$('.global_actions .queue-down').live('click', function() {
  var parent = $(this).parents('tr');

  // Get a list of selected torrent IDs.
  var torrent_ids = [];
  $('.selected_torrents:checked').each(function(i, sel) {
    torrent_ids.push($(sel).val());
  });

  // See if we have any torrent ids to send, no point doing call if not.
  if(torrent_ids.length == 0) {
    return false;
  }
  COUNTER++;
  $.post(ENDPOINT,
    JSON.stringify({method: 'core.queue_down', params: [torrent_ids], id: COUNTER}),
    function(obj, status) {
      // Just update the UI, should reflect any changes.
      update_ui();
      resume_table_refresh();
    }, 'json');

  return false;
});

var GLOBAL_AUTO_MANAGED_STATE = true;
$('.global_actions .auto-managed').live('click', function() {
  var parent = $(this).parents('tr');
  var selected_torrents = $('.selected_torrents:checked');
  var auto_managed_button = $(this);

  // If non are selected return, no point doing anything.
  if(selected_torrents.length == 0) {
    return false;
  }

  selected_torrents.each(function(i, sel) {
    var torrent_id = $(sel).val();

    COUNTER++;
    $.ajax({
      type: 'POST',
      url: ENDPOINT,
      async: false,
      data: JSON.stringify({
        method: 'core.set_torrent_auto_managed',
        params: [torrent_id, !GLOBAL_AUTO_MANAGED_STATE],
        id: COUNTER
      }),
      success: function(obj, status) {
        if(i == (selected_torrents.length - 1)) {
          if(GLOBAL_AUTO_MANAGED_STATE) {
            $('img', auto_managed_button).attr('src', '/images/manage.png');
            $('span', auto_managed_button).html('Enable auto-managed state');
            auto_managed_button.attr('title', 'Enable auto-managed state');
          } else {
            $('img', auto_managed_button).attr('src', '/images/manage_active.png');
            $('span', auto_managed_button).html('Disable auto-managed state');
            auto_managed_button.attr('title', 'Disable auto-managed state');
          }
          GLOBAL_AUTO_MANAGED_STATE = !GLOBAL_AUTO_MANAGED_STATE;

          resume_table_refresh();
          update_ui();
        }
      }
    });
  }); // Each
});

// Deleting torrents.
$('.global_actions .delete').live('click', function() {
  var action = $(this).attr('rel');
  var remove_data = (action == 'data') ? true : false;
  var parent = $(this).parents('tr');
  var selected_torrents = $('.selected_torrents:checked');

  // If non are selected return, no point doing anything.
  if(selected_torrents.length == 0) {
    return false;
  }

  selected_torrents.each(function(i, sel) {
    var torrent_id = $(sel).val();

    COUNTER++;
    $.ajax({
      type: 'POST',
      url: ENDPOINT,
      async: false,
      data: JSON.stringify({
        method: 'core.remove_torrent',
        params: [torrent_id, remove_data],
        id: COUNTER
      }),
      success: function(obj, status) {
        if(i == (selected_torrents.length - 1)) {
          resume_table_refresh();
          update_ui();
        }
      }
    });
  }); // Each
});

var GLOBAL_CHECKBOX_STATE = false;
$('.global_checkbox').click(function() {
  if(GLOBAL_CHECKBOX_STATE) {
    $('.selected_torrents').removeAttr('checked');
    resume_table_refresh();
  } else {
    $('.selected_torrents').attr('checked', 'checked');
    pause_table_refresh();
  }

  GLOBAL_CHECKBOX_STATE = !GLOBAL_CHECKBOX_STATE;
});

$('#logo a').click(function() {
  // TODO: Add a check to make sure it's not already open in a tab.
  // Switch to that tab if it is.
  chrome.tabs.create({url: localStorage.deluge_address});
  window.close();
  return false;
});

$(document).ready(function() {
  // Call the status check method in the background page on load.
  var background = chrome.extension.getBackgroundPage();
  background.deluge_status_check({
    success: function(obj) {
      background.enable_icon();
      // Make sure we have the latest UI.
      update_ui();
      // And we'll udate the UI every x seconds too.
      if(!INTERVAL_UI) {
        resume_table_refresh();
      }
    },
    error: function(obj) {
      background.disable_icon();
      // No need to pointlessly update the UI.
      pause_table_refresh();
    }
  });
});
