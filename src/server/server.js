/*jslint bitwise: true, node: true */
'use strict';

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SAT = require('sat');

// Import game settings.
var c = require('../../config.json');

// Import utilities.
var util = require('./lib/util');

// Import quadtree.
var quadtree = require('simple-quadtree');

var tree = quadtree(0, 0, c.gameWidth, c.gameHeight);

var users = [];
var massFood = [];
var food = [];
var sockets = {};

var leaderboard = [];
var leaderboardChanged = false;

var V = SAT.Vector;
var C = SAT.Circle;

var initMassLog = util.log(c.defaultPlayerMass, c.slowBase);

app.use(express.static(__dirname + '/../client'));

function addFood(toAdd) {
    var radius = util.massToRadius(c.foodMass);
    while (toAdd--) {
        var position = c.foodUniformDisposition ? util.uniformPosition(food, radius) : util.randomPosition(radius);
        food.push({
            // Make IDs unique.
            id: ((new Date()).getTime() + '' + food.length) >>> 0,
            x: position.x,
            y: position.y,
            radius: radius,
            mass: Math.random() + 2,
            hue: Math.round(Math.random() * 360)
        });
    }
}

function removeFood(toRem) {
    while (toRem--) {
        food.pop();
    }
}

function movePlayer(player) {
    if (!player.died) {
        var x = 0,
            y = 0;
        for (var i = 0; i < player.cells.length; i++) {
            var target = {
                x: player.x - player.cells[i].x + player.target.x,
                y: player.y - player.cells[i].y + player.target.y
            };
            var dist = Math.sqrt(Math.pow(target.y, 2) + Math.pow(target.x, 2));
            var deg = Math.atan2(target.y, target.x);
            var slowDown = 1;
            if (player.cells[i].speed <= 6.25) {
                slowDown = util.log(player.cells[i].mass, c.slowBase) - initMassLog + 1;
            }

            var deltaY = player.cells[i].speed * Math.sin(deg);
            var deltaX = player.cells[i].speed * Math.cos(deg);

            if (player.cells[i].speed > 6.25) {
                player.cells[i].speed -= 0.5;
            }
            if (dist < (50 + player.cells[i].radius)) {
                deltaY *= dist / (50 + player.cells[i].radius);
                deltaX *= dist / (50 + player.cells[i].radius);
            }
            if (!isNaN(deltaY)) {
                player.cells[i].y += deltaY;
            }
            if (!isNaN(deltaX)) {
                player.cells[i].x += deltaX;
            }
            // Find best solution.
            for (var j = 0; j < player.cells.length; j++) {
                if (j != i && player.cells[i] !== undefined) {
                    var distance = Math.sqrt(Math.pow(player.cells[j].y - player.cells[i].y, 2) + Math.pow(player.cells[j].x - player.cells[i].x, 2));
                    var radiusTotal = (player.cells[i].radius + player.cells[j].radius);
                    if (distance < radiusTotal) {
                        if (player.lastSplit > new Date().getTime() - 1000 * c.mergeTimer) {
                            if (player.cells[i].x < player.cells[j].x) {
                                player.cells[i].x--;
                            } else if (player.cells[i].x > player.cells[j].x) {
                                player.cells[i].x++;
                            }
                            if (player.cells[i].y < player.cells[j].y) {
                                player.cells[i].y--;
                            } else if ((player.cells[i].y > player.cells[j].y)) {
                                player.cells[i].y++;
                            }
                        } else if (distance < radiusTotal / 1.75) {
                            player.cells[i].mass += player.cells[j].mass;
                            player.cells[i].radius = util.massToRadius(player.cells[i].mass);
                            player.cells.splice(j, 1);
                        }
                    }
                }
            }
            if (player.cells.length > i) {
                var borderCalc = player.cells[i].radius / 3;
                if (player.cells[i].x > c.gameWidth - borderCalc) {
                    player.cells[i].x = c.gameWidth - borderCalc;
                }
                if (player.cells[i].y > c.gameHeight - borderCalc) {
                    player.cells[i].y = c.gameHeight - borderCalc;
                }
                if (player.cells[i].x < borderCalc) {
                    player.cells[i].x = borderCalc;
                }
                if (player.cells[i].y < borderCalc) {
                    player.cells[i].y = borderCalc;
                }
                x += player.cells[i].x;
                y += player.cells[i].y;
            }
        }
        player.x = x / player.cells.length;
        player.y = y / player.cells.length;
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

    if (mass.x > c.gameWidth - borderCalc) {
        mass.x = c.gameWidth - borderCalc;
    }
    if (mass.y > c.gameHeight - borderCalc) {
        mass.y = c.gameHeight - borderCalc;
    }
    if (mass.x < borderCalc) {
        mass.x = borderCalc;
    }
    if (mass.y < borderCalc) {
        mass.y = borderCalc;
    }
}

function balanceMass() {
    var totalMass = food.length * c.foodMass +
        users
        .map(function(u) { return u.massTotal; })
        .reduce(function(pu, cu) { return pu + cu; }, 0);

    var massDiff = c.gameMass - totalMass;
    var maxFoodDiff = c.maxFood - food.length;
    var foodDiff = parseInt(massDiff / c.foodMass) - maxFoodDiff;
    var foodToAdd = Math.min(foodDiff, maxFoodDiff);
    var foodToRemove = -Math.max(foodDiff, maxFoodDiff);

    if (foodToAdd > 0) {
        //console.log('[DEBUG] Adding ' + foodToAdd + ' food to level!');
        addFood(foodToAdd);
        //console.log('[DEBUG] Mass rebalanced!');
    } else if (foodToRemove > 0) {
        //console.log('[DEBUG] Removing ' + foodToRemove + ' food from level!');
        removeFood(foodToRemove);
        //console.log('[DEBUG] Mass rebalanced!');
    }
}

io.on('connection', function(socket) {
    console.log('A user connected!', socket.handshake.query.type);

    var type = socket.handshake.query.type;
    var radius = util.massToRadius(c.defaultPlayerMass);
    var position = c.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);

    var cells = [];
    var massTotal = 0;
    if (type === 'player') {
        cells = [{
            mass: c.defaultPlayerMass,
            x: position.x,
            y: position.y,
            radius: radius
        }];
        massTotal = c.defaultPlayerMass;
    }

    var currentPlayer = {
        id: socket.id,
        x: position.x,
        y: position.y,
        w: c.defaultPlayerMass,
        h: c.defaultPlayerMass,
        cells: cells,
        massTotal: massTotal,
        hue: Math.round(Math.random() * 360),
        type: type,
        target: {
            x: 0,
            y: 0
        }
    };

    socket.on('gotit', function(player) {
        console.log('[INFO] Player ' + player.name + ' connected!');
        sockets[player.id] = socket;

        var radius = util.massToRadius(c.defaultPlayerMass);
        var position = c.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);

        player.x = position.x;
        player.y = position.y;
        player.target.x = 0;
        player.target.y = 0;
        if (type === 'player') {
            player.cells = [{
                mass: c.defaultPlayerMass,
                x: position.x,
                y: position.y,
                radius: radius
            }];
            player.massTotal = c.defaultPlayerMass;
            player.died = false;
        }
        player.hue = Math.round(Math.random() * 360);
        currentPlayer = player;
        users.push(currentPlayer);

        io.emit('playerJoin', { name: currentPlayer.name });

        socket.emit('gameSetup', {
            gameWidth: c.gameWidth,
            gameHeight: c.gameHeight
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
        // Fire food.
        for (var i = 0; i < currentPlayer.cells.length; i++) {
            if (((currentPlayer.cells[i].mass >= c.defaultPlayerMass + c.fireFood) && c.fireFood > 0) || (currentPlayer.cells[i].mass >= 20 && c.fireFood === 0)) {
                var masa = 1;
                if (c.fireFood > 0)
                    masa = c.fireFood;
                else
                    masa = currentPlayer.cells[i].mass * 0.1;
                currentPlayer.cells[i].mass -= masa;
                currentPlayer.massTotal -= masa;
                massFood.push({
                    id: currentPlayer.id,
                    num: i,
                    masa: masa,
                    hue: currentPlayer.hue,
                    target: {
                        x: currentPlayer.x - currentPlayer.cells[i].x + currentPlayer.target.x,
                        y: currentPlayer.y - currentPlayer.cells[i].y + currentPlayer.target.y
                    },
                    x: currentPlayer.cells[i].x,
                    y: currentPlayer.cells[i].y,
                    radius: util.massToRadius(masa),
                    speed: 25
                });
            }
        }
    });
});

function tickPlayer(currentPlayer) {
    movePlayer(currentPlayer);

    if (currentPlayer.massTotal > 300) {
        explode(currentPlayer);
    }

    function funcFood(f) {
        return SAT.pointInCircle(new V(f.x, f.y), playerCircle);
    }

    function deleteFood(f) {
        food[f] = {};
        food.splice(f, 1);
    }

    function eatMass(m) {
        if (SAT.pointInCircle(new V(m.x, m.y), playerCircle)) {
            if (m.id == currentPlayer.id && m.speed > 0 && z == m.num)
                return false;
            if (currentCell.mass > m.masa * 1.1)
                return true;
        }
        return false;
    }

    function check(user) {
        for (var i = 0; i < user.cells.length; i++) {
            if (user.cells[i].mass > 10 && user.id !== currentPlayer.id) {
                var response = new SAT.Response();
                var collided = SAT.testCircleCircle(playerCircle,
                    new C(new V(user.cells[i].x, user.cells[i].y), user.cells[i].radius),
                    response);
                if (collided) {
                    response.aUser = currentCell;
                    response.bUser = {
                        id: user.id,
                        name: user.name,
                        x: user.cells[i].x,
                        y: user.cells[i].y,
                        num: i,
                        mass: user.cells[i].mass
                    };
                    playerCollisions.push(response);
                }
            }
        }
        return true;
    }

    function killUser() {

    }

    function collisionCheck(collision) {
        if (collision.aUser.mass > collision.bUser.mass * 1.1 && collision.aUser.radius > Math.sqrt(Math.pow(collision.aUser.x - collision.bUser.x, 2) + Math.pow(collision.aUser.y - collision.bUser.y, 2)) * 1.75) {
            console.log('[DEBUG] Killing user: ' + collision.bUser.id);
            console.log('[DEBUG] Collision info:');
            console.log(collision);

            var numUser = util.findIndex(users, collision.bUser.id);
            if (numUser > -1) {
                if (users[numUser].cells.length > 1) {
                    users[numUser].massTotal -= collision.bUser.mass;
                    users[numUser].cells.splice(collision.bUser.num, 1);
                } else {
                    collision.bUser.died = true;
                    setTimeout(function() {
                        users.splice(numUser, 1);
                        sockets[collision.bUser.id].emit('death');
                    }, 3000);
                }
            }
            if (!collision.bUser.died) {
                currentPlayer.massTotal += collision.bUser.mass;
                collision.aUser.mass += collision.bUser.mass;
            }
        }
    }

    for (var z = 0; z < currentPlayer.cells.length; z++) {
        var currentCell = currentPlayer.cells[z];
        var playerCircle = new C(
            new V(currentCell.x, currentCell.y),
            currentCell.radius
        );

        var foodEaten = food.map(funcFood)
            .reduce(function(a, b, c) { return b ? a.concat(c) : a; }, []);

        foodEaten.forEach(deleteFood);

        var massEaten = massFood.map(eatMass)
            .reduce(function(a, b, c) { return b ? a.concat(c) : a; }, []);

        var masaGanada = 0;
        for (var m = 0; m < massEaten.length; m++) {
            masaGanada += massFood[massEaten[m]].masa;
            massFood[massEaten[m]] = {};
            massFood.splice(massEaten[m], 1);
            for (var n = 0; n < massEaten.length; n++) {
                if (massEaten[m] < massEaten[n]) {
                    massEaten[n]--;
                }
            }
        }

        if (typeof(currentCell.speed) == "undefined")
            currentCell.speed = 6.25;
        masaGanada += (foodEaten.length * c.foodMass);
        currentCell.mass += masaGanada;
        currentPlayer.massTotal += masaGanada;
        currentCell.radius = util.massToRadius(currentCell.mass);
        playerCircle.r = currentCell.radius;

        tree.clear();
        users.forEach(tree.put);
        var playerCollisions = [];

        var otherUsers = tree.get(currentPlayer, check);

        playerCollisions.forEach(collisionCheck);
    }
}

function moveloop() {
    for (var i = 0; i < users.length; i++) {
        tickPlayer(users[i]);
    }
    for (i = 0; i < massFood.length; i++) {
        if (massFood[i].speed > 0) moveMass(massFood[i]);
    }
}

function gameloop() {
    if (users.length > 0) {
        users.sort(function(a, b) { return b.massTotal - a.massTotal; });

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
    var numFrag = user.massTotal / c.fireFood;
    for (var i = 0; i < numFrag; i++) {
        massFood.push({
            id: user.id,
            num: i,
            masa: c.fireFood,
            hue: user.hue,
            target: {
                x: user.x + util.randomInRange(-25, 25),
                y: user.y + util.randomInRange(-25, 25)
            },
            x: user.x,
            y: user.y,
            radius: util.massToRadius(c.fireFood),
            speed: 25
        });
    }
    setTimeout(function() {
        users.splice(numUser, 1);
        sockets[user.id].emit('death');
    }, 3000);
}

function sendUpdates() {
    users.forEach(function(u) {
        // center the view if x/y is undefined, this will happen for spectators
        u.x = u.x || c.gameWidth / 2;
        u.y = u.y || c.gameHeight / 2;

        var visibleFood = food
            .map(function(f) {
                if (f.x > u.x - u.screenWidth / 2 - 20 &&
                    f.x < u.x + u.screenWidth / 2 + 20 &&
                    f.y > u.y - u.screenHeight / 2 - 20 &&
                    f.y < u.y + u.screenHeight / 2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleMass = massFood
            .map(function(f) {
                if (f.x + f.radius > u.x - u.screenWidth / 2 - 20 &&
                    f.x - f.radius < u.x + u.screenWidth / 2 + 20 &&
                    f.y + f.radius > u.y - u.screenHeight / 2 - 20 &&
                    f.y - f.radius < u.y + u.screenHeight / 2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleCells = users
            .map(function(f) {
                for (var z = 0; z < f.cells.length; z++) {
                    if (f.cells[z].x + f.cells[z].radius > u.x - u.screenWidth / 2 - 20 &&
                        f.cells[z].x - f.cells[z].radius < u.x + u.screenWidth / 2 + 20 &&
                        f.cells[z].y + f.cells[z].radius > u.y - u.screenHeight / 2 - 20 &&
                        f.cells[z].y - f.cells[z].radius < u.y + u.screenHeight / 2 + 20) {
                        z = f.cells.lenth;
                        if (f.id !== u.id) {
                            return {
                                id: f.id,
                                x: f.x,
                                y: f.y,
                                cells: f.cells,
                                massTotal: Math.round(f.massTotal),
                                hue: f.hue,
                                name: f.name
                            };
                        } else {
                            return {
                                x: f.x,
                                y: f.y,
                                cells: f.cells,
                                massTotal: Math.round(f.massTotal),
                                hue: f.hue,
                            };
                        }
                    }
                }
            })
            .filter(function(f) { return f; });

        sockets[u.id].emit('serverTellPlayerMove', visibleCells, visibleFood, visibleMass);
        if (leaderboardChanged) {
            sockets[u.id].emit('leaderboard', {
                players: users.length,
                leaderboard: leaderboard
            });
        }
    });
    leaderboardChanged = false;
}

setInterval(moveloop, 1000 / 120);
setInterval(gameloop, 1000 / 120);
setInterval(sendUpdates, 1000 / 120);

// Don't touch, IP configurations.
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || process.env.IP || '0.0.0.0';
var serverport = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || c.port;
http.listen(serverport, ipaddress, function() {
    console.log('[DEBUG] Listening on ' + ipaddress + ':' + serverport);
});