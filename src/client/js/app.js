var io = require('socket.io-client');
var Canvas = require('./canvas');
var global = require('./global');

var playerNameInput = document.getElementById('playerNameInput');
var socket;

var debug = function(args) {
    if (console && console.log) {
        console.log(args);
    }
};

function startGame(type) {
    global.playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '').substring(0, 25);
    global.playerType = type;

    global.screenWidth = window.innerWidth;
    global.screenHeight = window.innerHeight;

    document.getElementById('startMenuWrapper').style.maxHeight = '0px';
    document.getElementById('gameAreaWrapper').style.opacity = 1;

    if (!socket) {
        socket = io({ query: "type=" + type });
        setupSocket(socket);
    }

    if (!global.animLoopHandle)
        animloop();

    socket.emit('respawn');
    window.canvas.socket = socket;
    global.socket = socket;
    debug('Game Start!');
}

// Checks if the nick chosen contains valid alphanumeric characters (and underscores).
function validNick() {
    var regex = /^[\s0-9a-zA-Zㄱ-ㅎㅏ-ㅣ가-힣]*$/;
    debug('Regex Test', regex.exec(playerNameInput.value));
    return regex.exec(playerNameInput.value) !== null;
}

window.onload = function() {

    var btn = document.getElementById('startButton'),
        nickErrorText = document.querySelector('#startMenu .input-error');

    btn.onclick = function() {
        // Checks if the nick is valid.
        if (validNick()) {
            nickErrorText.style.opacity = 0;
            startGame('player');
        } else {
            nickErrorText.style.opacity = 1;
        }
    };
    var instructions = document.getElementById('instructions');

    playerNameInput.addEventListener('keypress', function(e) {
        var key = e.which || e.keyCode;

        if (key === global.KEY_ENTER) {
            if (validNick()) {
                nickErrorText.style.opacity = 0;
                startGame('player');
            } else {
                nickErrorText.style.opacity = 1;
            }
        }
    });
};

// TODO: Break out into GameControls.

var macaronConfig = {
    border: 0,
};

var playerConfig = {
    border: 6,
    textColor: '#FFFFFF',
    textBorder: '#000000',
    textBorderSize: 3,
    defaultSize: 30
};

var player = {
    id: -1,
    x: global.screenWidth / 2,
    y: global.screenHeight / 2,
    screenWidth: global.screenWidth,
    screenHeight: global.screenHeight,
    target: { x: global.screenWidth / 2, y: global.screenHeight / 2 }
};
global.player = player;

var macarons = [];
var firedMacaron = [];
var users = [];
var leaderboard = [];
var target = { x: player.x, y: player.y };
global.target = target;

window.canvas = new Canvas();

var c = window.canvas.cv;
var graph = c.getContext('2d');

// socket stuff.
function setupSocket(socket) {
    // Handle error.
    socket.on('connect_failed', function() {
        socket.close();
        global.disconnected = true;
        debug('Connect Failed!');
    });

    socket.on('disconnect', function() {
        socket.close();
        global.disconnected = true;
        debug('Disconnected!');
    });

    // Handle connection.
    socket.on('welcome', function(playerSettings) {
        player = playerSettings;
        player.name = global.playerName;
        player.screenWidth = global.screenWidth;
        player.screenHeight = global.screenHeight;
        player.target = window.canvas.target;
        global.player = player;
        console.log('WELCOME: global.player');
        console.log(global.player);
        socket.emit('gotit', player);
        global.gameStart = true;
        debug('Game started at: ' + global.gameStart);
        c.focus();
    });

    socket.on('gameSetup', function(data) {
        global.gameWidth = data.gameWidth;
        global.gameHeight = data.gameHeight;
        resize();
        debug('Game Setup');
    });

    socket.on('leaderboard', function(data) {
        leaderboard = data.leaderboard;
        var status = '<span class="title">점수판</span>';
        for (var i = 0; i < leaderboard.length; i++) {
            status += '<br />';
            if (leaderboard[i].id == player.id) {
                if (leaderboard[i].name.length !== 0)
                    status += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + "</span>";
                else
                    status += '<span class="me">' + (i + 1) + ". 익명</span>";
            } else {
                if (leaderboard[i].name.length !== 0)
                    status += (i + 1) + '. ' + leaderboard[i].name;
                else
                    status += (i + 1) + '. 익명';
            }
        }
        //status += '<br />Players: ' + data.players;
        document.getElementById('status').innerHTML = status;
    });

    // Handle movement.
    socket.on('serverTellPlayerMove', function(visiblePlayer, visibleMacaron, visibleBullet) {

        var playerData;
        for (var i = 0; i < visiblePlayer.length; i++) {
            if (typeof(visiblePlayer[i].id) == "undefined") {
                playerData = visiblePlayer[i];
                i = visiblePlayer.length;
            }
        }
        if (global.playerType == 'player') {
            var xoffset = player.x - playerData.x;
            var yoffset = player.y - playerData.y;

            player.x = playerData.x;
            player.y = playerData.y;
            player.hue = playerData.hue;
            player.mass = playerData.mass;
            player.xoffset = isNaN(xoffset) ? 0 : xoffset;
            player.yoffset = isNaN(yoffset) ? 0 : yoffset;
        }

        users = visiblePlayer;
        macarons = visibleMacaron;
        firedMacaron = visibleBullet;
    });

    // Death.
    socket.on('death', function() {
        global.gameStart = false;
        global.died = true;
        window.setTimeout(function() {
            document.getElementById('gameAreaWrapper').style.opacity = 0;
            document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
            global.died = false;
            if (global.animLoopHandle) {
                window.cancelAnimationFrame(global.animLoopHandle);
                global.animLoopHandle = undefined;
            }
        }, 2500);
    });
}

function drawCircle(centerX, centerY, radius, sides) {
    var theta = 0;
    var x = 0;
    var y = 0;

    graph.beginPath();

    for (var i = 0; i < sides; i++) {
        theta = (i / sides) * 2 * Math.PI;
        x = centerX + radius * Math.sin(theta);
        y = centerY + radius * Math.cos(theta);
        graph.lineTo(x, y);
    }

    graph.closePath();
    graph.stroke();
    graph.fill();
}

function drawMacaron(macaron) {
    graph.strokeStyle = 'hsl(' + macaron.hue + ', 100%, 45%)';
    graph.fillStyle = 'hsl(' + macaron.hue + ', 100%, 50%)';
    graph.lineWidth = macaronConfig.border;
    drawCircle(macaron.x - player.x + global.screenWidth / 2,
        macaron.y - player.y + global.screenHeight / 2,
        macaron.radius, global.macaronSides);
}

function drawBullet(mass) {
    graph.strokeStyle = 'hsl(' + mass.hue + ', 100%, 45%)';
    graph.fillStyle = 'hsl(' + mass.hue + ', 100%, 50%)';
    graph.lineWidth = playerConfig.border + 10;
    drawCircle(mass.x - player.x + global.screenWidth / 2,
        mass.y - player.y + global.screenHeight / 2,
        mass.radius - 5, 18 + (~~(mass.masa / 5)));
}

function drawPlayers(order) {
    var start = {
        x: player.x - (global.screenWidth / 2),
        y: player.y - (global.screenHeight / 2)
    };

    for (var z = 0; z < order.length; z++) {
        var currentPlayer = users[order[z].num];
        console.log(currentPlayer);

        var x = 0,
            y = 0;
        var points = 30 + ~~(currentPlayer.mass / 10);
        var increase = Math.PI * 2 / points;
        var circle = {
            x: currentPlayer.x - start.x,
            y: currentPlayer.y - start.y
        };

        graph.strokeStyle = 'hsl(' + currentPlayer.hue + ', 100%, 45%)';
        graph.fillStyle = 'hsl(' + currentPlayer.hue + ', 100%, 50%)';
        graph.lineWidth = playerConfig.border;
        drawCircle(circle.x, circle.y, currentPlayer.radius, points);

        var playerName = "";
        if (typeof(currentPlayer.id) == "undefined")
            playerName = player.name;
        else
            playerName = currentPlayer.name;

        var fontSize = Math.max(currentPlayer.radius / 3, 12);

        graph.lineWidth = playerConfig.textBorderSize;
        graph.fillStyle = playerConfig.textColor;
        graph.strokeStyle = playerConfig.textBorder;
        graph.miterLimit = 1;
        graph.lineJoin = 'round';
        graph.textAlign = 'center';
        graph.textBaseline = 'middle';
        graph.font = 'bold ' + fontSize + 'px sans-serif';

        graph.strokeText(playerName, circle.x, circle.y);
        graph.fillText(playerName, circle.x, circle.y);
        graph.font = 'bold ' + Math.max(fontSize / 3 * 2, 10) + 'px sans-serif';

        if (playerName.length === 0) fontSize = 0;
        graph.strokeText(Math.round(currentPlayer.mass), circle.x, circle.y + fontSize);
        graph.fillText(Math.round(currentPlayer.mass), circle.x, circle.y + fontSize);
    }
}

function valueInRange(min, max, value) {
    return Math.min(max, Math.max(min, value));
}

function drawborder() {
    graph.lineWidth = 1;
    graph.strokeStyle = playerConfig.borderColor;

    // Left-vertical.
    if (player.x <= global.screenWidth / 2) {
        graph.beginPath();
        graph.moveTo(global.screenWidth / 2 - player.x, 0 ? player.y > global.screenHeight / 2 : global.screenHeight / 2 - player.y);
        graph.lineTo(global.screenWidth / 2 - player.x, global.gameHeight + global.screenHeight / 2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Top-horizontal.
    if (player.y <= global.screenHeight / 2) {
        graph.beginPath();
        graph.moveTo(0 ? player.x > global.screenWidth / 2 : global.screenWidth / 2 - player.x, global.screenHeight / 2 - player.y);
        graph.lineTo(global.gameWidth + global.screenWidth / 2 - player.x, global.screenHeight / 2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Right-vertical.
    if (global.gameWidth - player.x <= global.screenWidth / 2) {
        graph.beginPath();
        graph.moveTo(global.gameWidth + global.screenWidth / 2 - player.x,
            global.screenHeight / 2 - player.y);
        graph.lineTo(global.gameWidth + global.screenWidth / 2 - player.x,
            global.gameHeight + global.screenHeight / 2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Bottom-horizontal.
    if (global.gameHeight - player.y <= global.screenHeight / 2) {
        graph.beginPath();
        graph.moveTo(global.gameWidth + global.screenWidth / 2 - player.x,
            global.gameHeight + global.screenHeight / 2 - player.y);
        graph.lineTo(global.screenWidth / 2 - player.x,
            global.gameHeight + global.screenHeight / 2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }
}

window.requestAnimFrame = (function() {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function(callback) {
            window.setTimeout(callback, 1000 / 75);
        };
})();

window.cancelAnimFrame = (function(handle) {
    return window.cancelAnimationFrame ||
        window.mozCancelAnimationFrame;
})();

function animloop() {
    global.animLoopHandle = window.requestAnimFrame(animloop);
    gameLoop();
}

function gameLoop() {
    if (global.died) {
        graph.fillStyle = '#333333';
        graph.fillRect(0, 0, global.screenWidth, global.screenHeight);

        graph.textAlign = 'center';
        graph.fillStyle = '#FFFFFF';
        graph.font = 'bold 30px sans-serif';
        graph.fillText('You died!', global.screenWidth / 2, global.screenHeight / 2);
    } else if (!global.disconnected) {
        if (global.gameStart) {
            graph.fillStyle = global.backgroundColor;
            graph.fillRect(0, 0, global.screenWidth, global.screenHeight);

            macarons.forEach(drawMacaron);
            firedMacaron.forEach(drawMacaron);

            if (global.borderDraw) {
                drawborder();
            }

            var orderMass = [];
            for (var i = 0; i < users.length; i++) {
                orderMass.push({
                    num: i,
                    mass: users[i].mass
                });
            }
            orderMass.sort(function(obj1, obj2) {
                return obj1.mass - obj2.mass;
            });

            console.log(orderMass);
            drawPlayers(orderMass);
            socket.emit('move', window.canvas.target);
        } else {
            graph.fillStyle = '#333333';
            graph.fillRect(0, 0, global.screenWidth, global.screenHeight);

            graph.textAlign = 'center';
            graph.fillStyle = '#FFFFFF';
            graph.font = 'bold 30px sans-serif';
            graph.fillText('Game Over!', global.screenWidth / 2, global.screenHeight / 2);
        }
    } else {
        graph.fillStyle = '#333333';
        graph.fillRect(0, 0, global.screenWidth, global.screenHeight);

        graph.textAlign = 'center';
        graph.fillStyle = '#FFFFFF';
        graph.font = 'bold 30px sans-serif';
        graph.fillText('Disconnected!', global.screenWidth / 2, global.screenHeight / 2);
    }
}

window.addEventListener('resize', resize);

function resize() {
    if (!socket) return;
    player.screenWidth = c.width = global.screenWidth = window.innerWidth;
    player.screenHeight = c.height = global.screenHeight = window.innerHeight;
    socket.emit('windowResized', { screenWidth: global.screenWidth, screenHeight: global.screenHeight });
}