var io = require('socket.io-client');
var Canvas = require('./canvas');
var global = require('./global');

var playerNameInput = document.getElementById('playerNameInput');
var socket;

var startHTML = "<div class=\"yumyum\"> <div class=\"macaron\"> <span class=\"cover\"></span> <span class=\"oval top\">" +
    "</span><span class=\"oval cream\"></span> <span class=\"oval bottom\"></span> </div></div><div id=\"startMenu\"><img style=\"margin:0px auto;display:block\"" +
    "src=\"img\\title.png\" width: \"100\"> <br/> <br/> <input type=\"text\" tabindex=\"0\" autofocus placeholder=\"닉네임을 입력해주세요 ʕ·ᴥ·ʔ\" id=\"playerNameInput\"" +
    "maxlength=\"25\" /> <b class=\"input-error\">특수문자는 사용할 수 없어요!! 다시 입력해주세요 ʕ◔ᴥ◔ʔ</b><br /> <button id=\"startButton\">PLAY</button> <br />" +
    "<div id=\"instructions\"> <h3 align=\"middle\">게임하는 방법</h3><ul> <li>마카롱을 먹으면서 몸집을 키우세요!</li><li>너무 많은 마카롱을 먹으면 몸이 터져요!</li>" +
    "<li>자신보다 몸집이 큰 플레이어에게 잡아먹힐 수도 있어요!</li> <li>체중조절하면서 오래 살아남으세요!</li> </ul> </div> </div>";



function startGame(type) {
    global.playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '').substring(0, 25);
    global.playerType = type;

    global.screenWidth = window.innerWidth;
    global.screenHeight = window.innerHeight;
    document.getElementById('startMenuWrapper').style.maxHeight = '0px';
    document.getElementById('startMenuWrapper').innerHTML = '';
    document.getElementById('startMenuWrapper').style.opacity = 0.5;
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
    
}

// Checks if the nick chosen contains valid alphanumeric characters (and underscores).
function validNick() {
    var regex = /^[\s0-9a-zA-Zㄱ-ㅎㅏ-ㅣ가-힣]*$/;
    
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
    border: 4,
    borderColor: '#000000'
};

var playerConfig = {
    border: 4,
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
       
    });

    socket.on('disconnect', function() {
        socket.close();
        global.disconnected = true;
       
    });

    // Handle connection.
    socket.on('welcome', function(playerSettings) {
        player = playerSettings;
        player.name = global.playerName;
        player.screenWidth = global.screenWidth;
        player.screenHeight = global.screenHeight;
        player.target = window.canvas.target;
        global.player = player;
       
        socket.emit('gotit', player);
        global.gameStart = true;
        
        c.focus();
    });

    socket.on('gameSetup', function(data) {
        global.gameWidth = data.gameWidth;
        global.gameHeight = data.gameHeight;
        resize();
      
    });

    socket.on('leaderboard', function(data) {
        leaderboard = data.leaderboard;
        var status = '<span class="title">점수판</span>';
        for (var i = 0; i < leaderboard.length; i++) {
            status += '<br />';
            if (leaderboard[i].id == player.id) {
                if (leaderboard[i].name.length !== 0)
                    status += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + ' ' + getSurviveTime(leaderboard[i].born) + '</span>';
                else
                    status += '<span class="me">' + (i + 1) + '. ' + '익명' + ' ' + getSurviveTime(leaderboard[i].born) + '</span>';
            } else {
                if (leaderboard[i].name.length !== 0)
                    status += (i + 1) + '. ' + leaderboard[i].name + ' ' + getSurviveTime(leaderboard[i].born);
                else
                    status += (i + 1) + '. ' + '익명' + ' ' + getSurviveTime(leaderboard[i].born);
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

    socket.on('deathStarve', function() {
        global.gameStart = false;
        global.died = true;
        global.reason = 1;
        window.setTimeout(function() {
            document.getElementById('gameAreaWrapper').style.opacity = 0;
            document.getElementById('startMenuWrapper').style.opacity = 1;
            document.getElementById('startMenuWrapper').innerHTML = startHTML;
            document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
            playerNameInput = document.getElementById('playerNameInput');
            window.onload();
            global.died = false;
            if (global.animLoopHandle) {
                window.cancelAnimationFrame(global.animLoopHandle);
                global.animLoopHandle = undefined;
            }
        }, 2500);
    });

    socket.on('deathObesity', function() {
        global.gameStart = false;
        global.died = true;
        global.reason = 2;
        window.setTimeout(function() {
            document.getElementById('gameAreaWrapper').style.opacity = 0;
            document.getElementById('startMenuWrapper').style.opacity = 1;
            document.getElementById('startMenuWrapper').innerHTML = startHTML;
            document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
            playerNameInput = document.getElementById('playerNameInput');
            window.onload();
            global.died = false;
            if (global.animLoopHandle) {
                window.cancelAnimationFrame(global.animLoopHandle);
                global.animLoopHandle = undefined;
            }
        }, 2500);
    });

    socket.on('deathAbsorb', function() {
        global.gameStart = false;
        global.died = true;
        global.reason = 3;
        window.setTimeout(function() {
            document.getElementById('gameAreaWrapper').style.opacity = 0;
            document.getElementById('startMenuWrapper').style.opacity = 1;
            document.getElementById('startMenuWrapper').innerHTML = startHTML;
            document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
            playerNameInput = document.getElementById('playerNameInput');
            window.onload();
            global.died = false;
            if (global.animLoopHandle) {
                window.cancelAnimationFrame(global.animLoopHandle);
                global.animLoopHandle = undefined;
            }
        }, 2500);
    });
}

function getSurviveTime(time) {
    var now = new Date().getTime();
    var diff = (now - time) / 1000;
    var min = 0;
    if (diff > 60) {
        min = Math.floor(diff / 60);
        diff -= 60 * min;
    }
    var sec = Math.floor(diff);
    var surviveTime = '';
    surviveTime += ' ' + min + '분 ' + sec + '초 ';
    return surviveTime;
}

function drawBackground() {
    img = new Image();
    img.src = 'http://www.designbolts.com/wp-content/uploads/2013/02/Free-Seamless-Wood-Textures-Patterns-For-3D-Mapping-2.jpg';
    img.onload = function() {
        var ptrn = graph.createPattern(img, 'repeat');
        graph.fillStyle = ptrn;
        graph.fillRect(0, 0, global.gameWidth, global.gameHeight);
    };
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
    graph.strokeStyle = 'hsl(' + macaron.hue + ', 100%, 0%)';
    graph.fillStyle = 'hsl(' + macaron.hue + ', 80%, 75%)';
    graph.lineWidth = macaronConfig.border;
    graph.lineColor = macaronConfig.borderColor;
    drawCircle(macaron.x - player.x + global.screenWidth / 2,
        macaron.y - player.y + global.screenHeight / 2,
        macaron.radius, global.macaronSides);
}

function drawPlayers(order) {
    var start = {
        x: player.x - (global.screenWidth / 2),
        y: player.y - (global.screenHeight / 2)
    };

    for (var z = 0; z < order.length; z++) {
        var currentPlayer = users[order[z].num];
       
        var x = 0,
            y = 0;
        var points = 30 + ~~(currentPlayer.mass / 10);
        var increase = Math.PI * 2 / points;
        var circle = {
            x: currentPlayer.x - start.x,
            y: currentPlayer.y - start.y
        };

        graph.strokeStyle = 'hsl(' + currentPlayer.hue + ', 100%, 0%)';
        graph.fillStyle = 'hsl(' + currentPlayer.hue + ', 80%, 75%)';
        graph.lineWidth = playerConfig.border;
        drawCircle(circle.x, circle.y, currentPlayer.radius, points);

        var playerName = "";
        if (typeof(currentPlayer.id) == "undefined")
            playerName = player.name;
        else
            playerName = currentPlayer.name;

        if (playerName === "")
            playerName = '익명';

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
    }
}

function valueInRange(min, max, value) {
    return Math.min(max, Math.max(min, value));
}

function drawborder() {
    graph.lineWidth = 5;
    graph.strokeStyle = playerConfig.borderColor;

    var topLeft = { x: global.screenWidth / 2 - player.x, y: global.screenHeight / 2 - player.y };
    var bottomLeft = { x: global.screenWidth / 2 - player.x, y: global.gameHeight + global.screenHeight / 2 - player.y };
    var topRight = { x: global.gameWidth + global.screenWidth / 2 - player.x, y: global.screenHeight / 2 - player.y };
    var bottomRight = { x: global.gameWidth + global.screenWidth / 2 - player.x, y: global.gameHeight + global.screenHeight / 2 - player.y };

    graph.fillStyle = global.backgroundColor;
    graph.fillRect(topLeft.x, topLeft.y, global.gameWidth, global.gameHeight);


    // Left-vertical.
    if (player.x <= global.screenWidth / 2) {
        graph.beginPath();
        graph.moveTo(global.screenWidth / 2 - player.x, global.screenHeight / 2 - player.y);
        graph.lineTo(global.screenWidth / 2 - player.x, global.gameHeight + global.screenHeight / 2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Top-horizontal.
    if (player.y <= global.screenHeight / 2) {
        graph.beginPath();
        graph.moveTo(global.screenWidth / 2 - player.x, global.screenHeight / 2 - player.y);
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
            window.setTimeout(callback, 1000 / 60);
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
        if (global.reason == 1)
            graph.fillText('당신은 굶어 죽었습니다! 마카롱을 드세요!', global.screenWidth / 2, global.screenHeight / 2);
        else if (global.reason == 2)
            graph.fillText('당신은 배가 터져 죽었습니다! 거봐요! 마카롱은 위험하댔죠! ', global.screenWidth / 2, global.screenHeight / 2);
        else if (global.reason == 3)
            graph.fillText('당신은 잡아먹혔습니다! 복수하러 가세요!', global.screenWidth / 2, global.screenHeight / 2);
    } else if (!global.disconnected) {
        if (global.gameStart) {
            graph.fillStyle = '#5d5d5d';
            graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
            drawborder();

            macarons.forEach(drawMacaron);
            firedMacaron.forEach(drawMacaron);


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

            drawPlayers(orderMass);
            socket.emit('move', window.canvas.target);
        }
    } else {
        graph.fillStyle = '#333333';
        graph.fillRect(0, 0, global.screenWidth, global.screenHeight);

        graph.textAlign = 'center';
        graph.fillStyle = '#FFFFFF';
        graph.font = 'bold 30px sans-serif';
        graph.fillText('연결이 끊어졌습니다!', global.screenWidth / 2, global.screenHeight / 2);
    }
}

window.addEventListener('resize', resize);

function resize() {
    if (!socket) return;
    player.screenWidth = c.width = global.screenWidth; //= window.innerWidth;
    player.screenHeight = c.height = global.screenHeight; //= window.innerHeight;
    socket.emit('windowResized', { screenWidth: global.screenWidth, screenHeight: global.screenHeight });
    console.log("RESIZE!!!!");
}