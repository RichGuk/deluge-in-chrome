function Torrent(id, data) {
    this.id = id;
    this.name = data.name;
    this.progress = data.progress;
    this.state = data.state;
    this.size = data.total_size;
    this.position = data.queue;
    this.speedDownload = data.download_payload_rate;
    this.speedUpload = data.upload_payload_rate;
    this.eta = data.eta;
    this.autoManaged = data.is_auto_managed;
}

Torrent.prototype.calcSize = function(size) {
    bytes = size / 1024.0;
    if (bytes < 1024) {
        return bytes.toFixed(1) + ' KiB';
    }

    bytes = bytes / 1024;
    if (bytes < 1024) {
        return bytes.toFixed(1) + ' MiB';
    }

    return (bytes / 1024).toFixed(1) + ' GiB';
};

Torrent.prototype.getHumanSize = function() {
    return this.calcSize(this.size);
};

Torrent.prototype.getPosition = function() {
    if (this.position < 0) {
        return '';
    }
    return this.position;
};

Torrent.prototype.getPercent = function() {
    return (Math.round(this.progress * Math.pow(10, 2)) / Math.pow(10, 2)) + '%';
};

Torrent.prototype.getDownload = function() {
    return this.calcSize(this.speedDownload) + '/s';
};

Torrent.prototype.getUpload = function() {
    return this.calcSize(this.speedUpload) + '/s';
};

Torrent.prototype.getSpeeds = function() {
    return this.getDownload() + ' - ' + this.get_upload();
};

Torrent.prototype.getEta = function() {
    var secs = 0, mins = 0, hours = 0, days = 0;
    var time = this.eta;

    if (time === 0) {
        return '&infin;';
    }

    time = time.toFixed(0);
    if (time < 60) {
        return time + 's';
    }

    time = time / 60;
    if (time < 60) {
        mins = Math.floor(time);
        secs = Math.round(60 * (time - mins));

        if (secs > 0) {
            return mins + 'm' + ' ' + secs + 's';
        }
        return mins + 'm';
    }

    time = time / 60;
    if (time < 24) {
        hours = Math.floor(time);
        mins = Math.round(60 * (time - hours));

        if (mins > 0) {
            return hours + 'h' + ' ' + mins + 'm';
        }
        return hours + 'h';
    }

    time = time / 24;
    days = Math.floor(time);
    hours = Math.round(24 * (time - days));
    if (hours > 0) {
        return days + 'd' + ' ' + hours + 'h';
    }
    return days + 'd';
};
