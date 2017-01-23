/*jslint bitwise: true, node: true */
'use strict';

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SAT = require('sat');

// Import game settings.
var config = require('../../config.json');

// Import utilities.
var util = require('./lib/util');

// Import quadtree.
var quadtree = require('simple-quadtree');
var tree = quadtree(0, 0, config.gameWidth, config.gameHeight);

var users = [];
var firedMacaron = [];
var macaron = [];
var sockets = {};

var leaderboard = [];
var leaderboardChanged = false;

var V = SAT.Vector;
var C = SAT.Circle;

app.use(express.static(__dirname + '/../client'));

function addMacaron(num) {
    var radius = util.massToRadius(config.macaronMass);
    while (num--) {
        var position = util.uniformPosition(macaron, radius);
        macaron.push({
            id: ((new Date()).getTime() + '' + macaron.length) >>> 0,
            x: position.x,
            y: position.y,
            radius: radius,
            mass: config.macaronMass,
            hue: Math.round(Math.random() * 360)
        });
    }
}

function removeMacaron(num) {
    while (num--) {
        macaron.pop();
    }
}

var cnt = 0;

function movePlayer(player) {
    if (!player.died) {
        var x = 0,
            y = 0;

        var target = {
            x: player.target.x,
            y: player.target.y
        };

        var dist = Math.sqrt(Math.pow(target.y, 2) + Math.pow(target.x, 2));
        var deg = Math.atan2(target.y, target.x);

        var deltaY = player.speed * Math.sin(deg);
        var deltaX = player.speed * Math.cos(deg);

        if (dist < (50 + player.radius)) {
            deltaY *= dist / (50 + player.radius);
            deltaX *= dist / (50 + player.radius);
        }
        if (!isNaN(deltaY)) player.y += deltaY;
        if (!isNaN(deltaX)) player.x += deltaX;

        var borderCalc = player.radius / 3;
        if (player.x > config.gameWidth - borderCalc) {
            player.x = config.gameWidth - borderCalc;
        }
        if (player.y > config.gameHeight - borderCalc) {
            player.y = config.gameHeight - borderCalc;
        }
        if (player.x < borderCalc) {
            player.x = borderCalc;
        }
        if (player.y < borderCalc) {
            player.y = borderCalc;
        }
    }
}

function moveMass(mass) {
    var deg = Math.atan2(mass.target.y, mass.target.x);
    var deltaY = mass.speed * Math.sin(deg);
    var deltaX = mass.speed * Math.cos(deg);

    mass.speed -= 0.5;
    if (mass.speed < 0) {
        mass.speed = 0;
    }
    if (!isNaN(deltaY)) {
        mass.y += deltaY;
    }
    if (!isNaN(deltaX)) {
        mass.x += deltaX;
    }

    var borderCalc = mass.radius + 5;
    if (mass.x > config.gameWidth - borderCalc) {
        mass.x = config.gameWidth - borderCalc;
    }
    if (mass.y > config.gameHeight - borderCalc) {
        mass.y = config.gameHeight - borderCalc;
    }
    if (mass.x < borderCalc) {
        mass.x = borderCalc;
    }
    if (mass.y < borderCalc) {
        mass.y = borderCalc;
    }
}

function balanceMass() {
    var totalMass = macaron.length * config.macaronMass + users
        .map(function(u) { return u.mass; })
        .reduce(function(pu, cu) { return pu + cu; }, 0);

    var massDiff = config.gameMass - totalMass;
    var maxMacaronDiff = config.maxMacaron - macaron.length;
    var macaronDiff = parseInt(massDiff / config.macaronMass) - maxMacaronDiff;
    var numAdd = Math.min(macaronDiff, maxMacaronDiff);
    var numRemove = -Math.max(macaronDiff, maxMacaronDiff);

    if (numAdd > 0) {
        addMacaron(numAdd);
    } else if (numRemove > 0) {
        removeMacaron(numRemove);
    }
}

io.on('connection', function(socket) {
    console.log('A user connected!', socket.handshake.query.type);

    var type = socket.handshake.query.type;
    var mass = config.defaultPlayerMass;
    var radius = util.massToRadius(mass);
    var position = util.uniformPosition(users, radius);
    var hue = Math.round(Math.random() * 360);
    var speed = config.defaultPlayerSpeed;

    var currentPlayer = {
        id: socket.id,
        type: type,
        died: false,
        x: position.x,
        y: position.y,
        mass: mass,
        radius: radius,
        hue: hue,
        speed: speed,
        target: {
            x: 0,
            y: 0
        }
    };

    socket.on('gotit', function(player) {
        console.log('[INFO] Player ' + player.name + ' connected!');
        sockets[player.id] = socket;

        var mass = config.defaultPlayerMass;
        var radius = util.massToRadius(mass);
        var position = util.uniformPosition(users, radius);
        var hue = Math.round(Math.random() * 360);
        var speed = config.defaultPlayerSpeed;

        player.died = false;
        player.x = position.x;
        player.y = position.y;
        player.mass = mass;
        player.radius = radius;
        player.hue = hue;
        player.speed = speed;
        player.target.x = 0;
        player.target.y = 0;

        currentPlayer = player;
        users.push(currentPlayer);

        console.log('GOTIT: currentPlayer = ');
        console.log(currentPlayer);

        io.emit('playerJoin', { name: currentPlayer.name });

        socket.emit('gameSetup', {
            gameWidth: config.gameWidth,
            gameHeight: config.gameHeight
        });
        console.log('Total players: ' + users.length);
    });

    socket.on('windowResized', function(data) {
        currentPlayer.screenWidth = data.screenWidth;
        currentPlayer.screenHeight = data.screenHeight;
    });

    socket.on('respawn', function() {
        if (util.findIndex(users, currentPlayer.id) > -1)
            users.splice(util.findIndex(users, currentPlayer.id), 1);
        socket.emit('welcome', currentPlayer);
        console.log('[INFO] User ' + currentPlayer.name + ' respawned!');
    });

    socket.on('disconnect', function() {
        if (util.findIndex(users, currentPlayer.id) > -1)
            users.splice(util.findIndex(users, currentPlayer.id), 1);
        console.log('[INFO] User ' + currentPlayer.name + ' disconnected!');

        socket.broadcast.emit('playerDisconnect', { name: currentPlayer.name });
    });

    socket.on('move', function(target) {
        if (target.x !== currentPlayer.target.x || target.y !== currentPlayer.y)
            currentPlayer.target = target;
    });

    socket.on('fire', function() {
        if (currentPlayer.mass >= config.defaultPlayerMass + config.defaultBulletMass) {
            var mass = config.defaultBulletMass;
            var radius = util.massToRadius(mass);
            var hue = Math.round(Math.random() * 360);
            var speed = config.defaultBulletSpeed;
            currentPlayer.mass -= mass;

            firedMacaron.push({
                id: currentPlayer.id,
                x: currentPlayer.x,
                y: currentPlayer.y,
                mass: mass,
                radius: radius,
                hue: hue,
                speed: speed,
                target: {
                    x: currentPlayer.target.x,
                    y: currentPlayer.target.y
                }
            });
        }
    });
});

function tickPlayer(currentPlayer) {
    movePlayer(currentPlayer);

    if (currentPlayer.mass > 500) {
        explode(currentPlayer);
    }

    function funcMacaron(f) {
        return SAT.pointInCircle(new V(f.x, f.y), playerCircle);
    }

    function deleteMacaron(f) {
        macaron[f] = {};
        macaron.splice(f, 1);
    }

    function funcBullet(m) {
        if (SAT.pointInCircle(new V(m.x, m.y), playerCircle)) {
            if (m.id == currentPlayer.id && m.speed > 0)
                return false;
            if (currentPlayer.mass >= m.mass * 1.0)
                return true;
        }
        return false;
    }

    function check(user) {
        if (user.id !== currentPlayer.id) {
            var response = new SAT.Response();
            var collided = SAT.testCircleCircle(playerCircle,
                new C(new V(user.x, user.y), user.radius),
                response);
            if (collided) {
                response.aUser = currentPlayer;
                response.bUser = {
                    id: user.id,
                    name: user.name,
                    x: user.x,
                    y: user.y,
                    mass: user.mass,
                    died: false
                };
                playerCollisions.push(response);
            }
        }
        return true;
    }

    function collisionCheck(collision) {
        if (collision.aUser.mass > collision.bUser.mass * 1.0 && collision.aUser.radius > Math.sqrt(Math.pow(collision.aUser.x - collision.bUser.x, 2) + Math.pow(collision.aUser.y - collision.bUser.y, 2)) * 1.2) {
            console.log('[DEBUG] Killing user: ' + collision.bUser.id);
            console.log('[DEBUG] Collision info:');
            console.log(collision);

            var numUser = util.findIndex(users, collision.bUser.id);
            if (numUser > -1) {
                collision.bUser.died = true;
                users.mass -= collision.bUser.mass;
                users.splice(numUser, 1);
                sockets[collision.bUser.id].emit('death');
            }
            if (!collision.bUser.died) {
                currentPlayer.mass += collision.bUser.mass;
                collision.aUser.mass += collision.bUser.mass;
            }
        }
    }

    var playerCircle = new C(
        new V(currentPlayer.x, currentPlayer.y),
        currentPlayer.radius
    );

    var macaronEaten = macaron.map(funcMacaron)
        .reduce(function(a, b, c) { return b ? a.concat(c) : a; }, []);

    macaronEaten.forEach(deleteMacaron);

    var bulletEaten = firedMacaron.map(funcBullet)
        .reduce(function(a, b, c) { return b ? a.concat(c) : a; }, []);

    var macaronEatenMass = 0;

    for (var m = 0; m < bulletEaten.length; m++) {
        macaronEatenMass += firedMacaron[bulletEaten[m]].mass;
        firedMacaron[bulletEaten[m]] = {};
        firedMacaron.splice(bulletEaten[m], 1);
        for (var n = 0; n < bulletEaten.length; n++) {
            if (bulletEaten[m] < bulletEaten[n]) {
                bulletEaten[n]--;
            }
        }
    }

    if (typeof(currentPlayer.speed) == "undefined")
        currentPlayer.speed = config.defaultPlayerSpeed;

    macaronEatenMass += (macaronEaten.length * config.macaronMass);
    currentPlayer.mass += macaronEatenMass;
    currentPlayer.radius = util.massToRadius(currentPlayer.mass);
    playerCircle.r = currentPlayer.radius;

    tree.clear();
    users.forEach(tree.put);
    var playerCollisions = [];

    var otherUsers = tree.get(currentPlayer, check);

    playerCollisions.forEach(collisionCheck);
}

function moveloop() {
    for (var i = 0; i < users.length; i++) {
        tickPlayer(users[i]);
    }
    for (i = 0; i < firedMacaron.length; i++) {
        if (firedMacaron[i].speed > 0) moveMass(firedMacaron[i]);
    }
}

function gameloop() {
    if (users.length > 0) {
        users.sort(function(a, b) { return b.mass - a.mass; });

        var topUsers = [];

        for (var i = 0; i < Math.min(10, users.length); i++) {
            if (users[i].type == 'player') {
                topUsers.push({
                    id: users[i].id,
                    name: users[i].name
                });
            }
        }
        if (isNaN(leaderboard) || leaderboard.length !== topUsers.length) {
            leaderboard = topUsers;
            leaderboardChanged = true;
        } else {
            for (i = 0; i < leaderboard.length; i++) {
                if (leaderboard[i].id !== topUsers[i].id) {
                    leaderboard = topUsers;
                    leaderboardChanged = true;
                    break;
                }
            }
        }
    }
    balanceMass();
}

function explode(user) {
    var numUser = util.findIndex(users, user.id);
    user.died = true;
    var numFrag = user.mass / config.defaultBulletMass;
    for (var i = 0; i < numFrag; i++) {
        var mass = config.defaultBulletMass;
        var radius = util.massToRadius(mass);
        var speed = config.defaultBulletSpeed;
        var hue = Math.round(Math.random() * 360);
        var x_direction = util.randomInRange(-1000, 1000);
        var y_direction = util.randomInRange(-1000, 1000);

        firedMacaron.push({
            id: user.id,
            num: numUser,
            x: user.x,
            y: user.y,
            mass: mass,
            radius: radius,
            hue: hue,
            speed: speed,
            target: {
                x: x_direction,
                y: y_direction
            }
        });
    }
    users.splice(numUser, 1);
    sockets[user.id].emit('death');
}

function sendUpdates() {
    users.forEach(function(u) {
        u.x = u.x || config.gameWidth / 2;
        u.y = u.y || config.gameHeight / 2;

        var visibleMacaron = macaron
            .map(function(f) {
                if (f.x > u.x - u.screenWidth / 2 - 20 &&
                    f.x < u.x + u.screenWidth / 2 + 20 &&
                    f.y > u.y - u.screenHeight / 2 - 20 &&
                    f.y < u.y + u.screenHeight / 2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleBullet = firedMacaron
            .map(function(f) {
                if (f.x + f.radius > u.x - u.screenWidth / 2 - 20 &&
                    f.x - f.radius < u.x + u.screenWidth / 2 + 20 &&
                    f.y + f.radius > u.y - u.screenHeight / 2 - 20 &&
                    f.y - f.radius < u.y + u.screenHeight / 2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visiblePlayer = users
            .map(function(f) {
                if (f.x + f.radius > u.x - u.screenWidth / 2 - 20 &&
                    f.x - f.radius < u.x + u.screenWidth / 2 + 20 &&
                    f.y + f.radius > u.y - u.screenHeight / 2 - 20 &&
                    f.y - f.radius < u.y + u.screenHeight / 2 + 20) {
                    if (f.id !== u.id) {
                        return {
                            id: f.id,
                            x: f.x,
                            y: f.y,
                            mass: Math.round(f.mass),
                            radius: f.radius,
                            hue: f.hue,
                            name: f.name
                        };
                    } else {
                        return {
                            x: f.x,
                            y: f.y,
                            mass: Math.round(f.mass),
                            radius: f.radius,
                            hue: f.hue
                        };
                    }
                }
            })
            .filter(function(f) { return f; });

        sockets[u.id].emit('serverTellPlayerMove', visiblePlayer, visibleMacaron, visibleBullet);
        if (leaderboardChanged) {
            sockets[u.id].emit('leaderboard', {
                players: users.length,
                leaderboard: leaderboard
            });
        }
    });
    leaderboardChanged = false;
}

setInterval(moveloop, 1000 / 75);
setInterval(gameloop, 1000);
setInterval(sendUpdates, 1000 / 40);

// Don't touch, IP configurations.
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || process.env.IP || '0.0.0.0';
var serverport = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || config.port;
http.listen(serverport, ipaddress, function() {
    console.log('[DEBUG] Listening on ' + ipaddress + ':' + serverport);
});