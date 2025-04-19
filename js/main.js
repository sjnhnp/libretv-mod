(function() {
    document.addEventListener('keydown', function(e) {
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && e.key === 'I') ||
            (e.ctrlKey && e.shiftKey && e.key === 'J')
        ) {
            e.preventDefault();
            forceRefresh();
            return false;
        }
    });

    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });

    function isDevToolsOpen() {
        const start = performance.now();
        (function() {
            let sum = 0;
            for (let i = 0; i < 1000000; i++) {
                sum += Math.random();
            }
        })();
        const timeDiff = performance.now() - start;

        let debuggerDetected = false;
        try {
            (function() {
                const evil = new Function('debugger');
                evil.call(evil);
            })();
        } catch (e) {
            debuggerDetected = e instanceof ReferenceError ? false : true;
        }

        return timeDiff > 100 || debuggerDetected;
    }

    function forceRefresh() {
        try {
            window.location.reload(true);
        } catch (e) {
            window.location.href = window.location.href;
        }
        throw new Error("Debugging detected");
    }
    setInterval(function() {
        if (isDevToolsOpen()) {
            forceRefresh();
        }
    }, 1000);
})();