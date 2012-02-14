var Global = (function () {
    var pub = {};
    
    pub.getDebugMode = function () {
        return localStorage.debugMode || false;
    };
    
    return pub;
}());