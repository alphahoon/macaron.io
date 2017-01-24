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
        this.cv.addEventListener('mousedown', this.mouseDown, false);
        this.cv.addEventListener('mouseup', this.mouseUp, false);
        this.cv.addEventListener('keydown', this.keyDown, false);
        this.cv.addEventListener('keyup', this.keyUp, false);
        this.cv.parent = self;
        global.canvas = this;
    }

    gameInput(mouse) {
        this.parent.target.x = mouse.clientX - this.width / 2;
        this.parent.target.y = mouse.clientY - this.height / 2;
        global.target = this.parent.target;
    }

    mouseDown(mouse) {
        if (this.parent.readyFire) {
            this.parent.socket.emit('fire');
            this.parent.readyFire = false;
        }
    }

    mouseUp(mouse) {
        this.parent.readyFire = true;
    }

    keyDown(event) {
        var key = event.which || event.keyCode;
       
        if ((key === global.KEY_W || key ===global.KEY_small_w )&& this.parent.readyFire) {
            this.parent.socket.emit('fireReverse');
            this.parent.readyFire = false;
        } else if (key === global.KEY_SPACE) this.parent.socket.emit('boost');
        else if(key===global.KEY_S || key===global.KEY_small_s) this.parent.socket.emit('stop');
    }

    keyUp(event) {
        var key = event.which || event.keyCode;
        if (key === global.KEY_W || key ===global.KEY_small_w ) {
            this.parent.readyFire = true;
        } else if (key === global.KEY_SPACE) this.parent.socket.emit('boostQuit');
        else if(key===global.KEY_S || key===global.KEY_small_s) this.parent.socket.emit('stopQuit');
    }
}

module.exports = Canvas;