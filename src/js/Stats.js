/**
 * @author mrdoob / http://mrdoob.com/
 */
/**
 * 
 * Modified by Charlie Zheng 
 */
var Stats = function () {

    var mode = [0];

    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:0;left:0;opacity:0.9;z-index:10000';
    // container.addEventListener('click', function (event) {

    //     event.preventDefault();
    //     showPanel(++mode % container.children.length);

    // }, false);
    //

    function addPanel(panel) {

        container.appendChild(panel.dom);
        return panel;

    }

    function showPanel(id) {

        for (var i = 0; i < container.children.length; i++) {
            container.children[i].style.display = id.includes(i) ? 'block' : 'none';
        }

        mode = id;

    }

    //

    var beginTime = (performance || Date).now(), prevTime = beginTime, frames = 0;

    var fpsPanel = addPanel(new Stats.Panel('FPS', '#0ff', '#002'));
    var msPanel = addPanel(new Stats.Panel('MS', '#0f0', '#020'));

    if (self.performance && self.performance.memory) {

        var memPanel = addPanel(new Stats.Panel('MB', '#f08', '#201'));

    }

    showPanel([0]);

    return {

        REVISION: 16,

        dom: container,

        addPanel: addPanel,
        showPanel: showPanel,

        begin: function () {

            beginTime = (performance || Date).now();

        },

        end: function () {

            frames++;

            var time = (performance || Date).now();

            msPanel.update(time - beginTime, 200);

            if (time >= prevTime + 1000) {

                fpsPanel.update((frames * 1000) / (time - prevTime), 100);

                prevTime = time;
                frames = 0;

                if (memPanel) {

                    var memory = performance.memory;
                    memPanel.update(memory.usedJSHeapSize / 1048576, memory.jsHeapSizeLimit / 1048576);

                }

            }

            return time;

        },

        update: function () {

            beginTime = this.end();

        },

        // Backwards Compatibility

        domElement: container,
        setMode: showPanel

    };

};

Stats.Panel = function (name, fg, bg) {

    var min = Infinity, max = 0, round = Math.round;
    var PR = round(window.devicePixelRatio || 1);

    var WIDTH = 130 * PR, HEIGHT = 60 * PR,
        TEXT_X = 4 * PR, TEXT_Y = 3 * PR,
        GRAPH_X = 4 * PR, GRAPH_Y = 15 * PR,
        GRAPH_WIDTH = 124 * PR, GRAPH_HEIGHT = 38 * PR;

    var canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.style.cssText = 'width:130px;height:60px';

    var context = canvas.getContext('2d');
    context.font = 'bold ' + (11.5 * PR) + 'px Helvetica,Arial,sans-serif';
    context.textBaseline = 'top';

    context.fillStyle = bg;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.fillStyle = fg;
    context.fillText(name, TEXT_X, TEXT_Y);
    context.fillRect(GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT);

    context.fillStyle = bg;
    context.globalAlpha = 0.9;
    context.fillRect(GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT);

    return {

        dom: canvas,

        update: function (value, maxValue) {

            min = Math.min(min, value);
            max = Math.max(max, value);

            context.fillStyle = bg;
            context.globalAlpha = 1;
            context.fillRect(0, 0, WIDTH, GRAPH_Y);
            context.fillStyle = fg;
            context.fillText(round(value) + ' ' + name + ' (' + round(min) + '-' + round(max) + ')', TEXT_X, TEXT_Y);

            context.drawImage(canvas, GRAPH_X + PR, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT, GRAPH_X, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT);

            context.fillRect(GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, GRAPH_HEIGHT);

            context.fillStyle = bg;
            context.globalAlpha = 0.9;
            context.fillRect(GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, round((1 - (value / maxValue)) * GRAPH_HEIGHT));

        }

    };

};

export function fpsUpdate(panel, max) {
    if (!max) {
        max = 40
    }
    let fpsInd = 0
    let timeBetweenUpdates = []
    let lastUpdateTime = 0
    let stablized = false
    let firstUpdate = 0
    return () => {
        if (!lastUpdateTime) {
            lastUpdateTime = performance.now()
            firstUpdate = lastUpdateTime
            return
        }
        const curr = performance.now()
        if (timeBetweenUpdates.length < 10) {
            timeBetweenUpdates.push(curr - lastUpdateTime)
            lastUpdateTime = curr
            return
        }
        timeBetweenUpdates[fpsInd] = curr - lastUpdateTime
        fpsInd = (fpsInd + 1) % timeBetweenUpdates.length
        if (stablized) {
            const avg_fps = 1000 / timeBetweenUpdates.reduce((a, b) => a + b, 0) * timeBetweenUpdates.length
            panel.update(avg_fps, max)
        } else if (curr - firstUpdate > 2000) {
            // has been 2s since first update
            stablized = true
        }
        lastUpdateTime = curr
    }
}

export { Stats as default };