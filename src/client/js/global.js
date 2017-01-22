module.exports = {
    // Keys and other mathematical constants
    borderDraw: false,
    spin: -Math.PI,
    enemySpin: -Math.PI,
    foodSides: 10,
    virusSides: 20,

    // Canvas
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    gameWidth: 0,
    gameHeight: 0,
    xoffset: -0,
    yoffset: -0,
    gameStart: false,
    disconnected: false,
    died: false,
    kicked: false,
    continuity: false,
    startPingTime: 0,
    toggleMassState: 0,
    backgroundColor: '#f2fbff',
    lineColor: '#000000',
};