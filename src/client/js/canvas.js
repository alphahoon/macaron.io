var global = require('./global');

class Canvas {
    constructor(params) {
        this.target = global.target;
        this.socket = global.socket;
        this.readyFire = true;
        var self = this;

        this.cv = document.getElementById('cvs');
        this.cv.width = global.screenWidth;
        this.cv.height = global.screenHeight;
        this.cv.addEventListener('mousemove', this.gameInput, false);
        this.cv.addEventListener('mousedown', this.mousedown, false);
        this.cv.addEventListener('mouseup', function() {
            self.readyFire = true;
        }, false);
        this.cv.parent = self;
        global.canvas = this;
    }

    gameInput(mouse) {
        this.parent.target.x = mouse.clientX - this.width / 2;
        this.parent.target.y = mouse.clientY - this.height / 2;
        global.target = this.parent.target;
    }

    mousedown(mouse) {
        this.parent.socket.emit('fire');
        this.parent.readyFire = false;
    }
}

module.exports = Canvas;