var express = require("express");
const { stringify } = require("querystring");
//const { connect } = require("http2");
var app = express();
var server = require("http").Server(app);

app.get("/", function(req, res){
    //console.log("get request received")
    res.sendFile(__dirname + "/index.html");
});
app.get("/client.js", function(req, res){
    //console.log("get request received")
    res.sendFile(__dirname + "/client.js");
});
app.get("/client.css", function(req, res){
    //console.log("get request received")
    res.sendFile(__dirname + "/client.css");
});
app.get("/controller_salty.html", function(req, res){
    //console.log("get request received")
    res.sendFile(__dirname + "/controller_salty.html");
});
app.get("/salty/:resName", function(req, res) {
    // use params to let people fetch any resource in the folder
    res.sendFile(__dirname + "/salty/" + req.params.resName);
});
app.get("/img/:resName", function(req, res) {
    // use params to let people fetch any resource in the folder
    res.sendFile(__dirname + "/img/" + req.params.resName);
});

app.use("/client", express.static(__dirname + "/client"));

var port = process.env.PORT || 3001;

const WebSocket = require('ws');
const wss = new WebSocket.Server({
    server
});

const ROOM_STAT = {
    OPEN: 0,
    FULL: 1,
    INGAME: 2,
    ENDED: 3
}

server.listen(port);
console.log("Server started. Port = " + port);

// Generating a random short ID. (For some reason there's a library for this)
var shortid = require('shortid');
const { send } = require("process");
const { readlink } = require("fs");

// A dictionary with the key being the assigned ID and the value being the socket.
let sockets = {};
// A dictionary with the key being the room code
// and the value being the assigned ID of the host of that room code.
let rooms = {};
wss.on('connection', function(ws) {
    var name = shortid.generate();
    console.log(`New client connected. Generated ID: ${name}`);
    ws.on('message', (msg) => {
        var data;
        try {
            data = JSON.parse(msg);
            console.log(`WebSocket message received: `, data);
        } catch (e) {
            console.log(`Invalid JSON: ${msg.data}`);
            return
        }
        switch (data.type) {
            case 'heartbeat':
                // do nothing
                break;
            case 'hello':
                // msg.name has last used name
                console.log(Object.keys(sockets), data.name, Object.keys(sockets).includes(data.name));
                if (Object.keys(sockets).includes(data.name)) {
                    // name already used
                    sendError("Requested ID is already in use. Please log in only once per browser.");
                    ws.close();
                    console.log("duplicate ID");
                    return;
                // sure, implicit type casting is the js way but i want it to be explicit because i am a messy coder
                } else if (Boolean(data.name) == false) {
                    console.log(`assigning new ID: ${name}`);
                } else {
                    name = data.name;
                    console.log(`assigning requested ID: ${data.name}`);
                }
                ws.send(JSON.stringify({
                    type: 'onGetMyName',
                    name: name
                }));
                console.log("sent onGetMyName (after hello)");
                sockets[name] = ws;
                console.log("sockets dict now has these keys: " + Object.keys(sockets))
                break;
            case 'getMyName':
                ws.send(JSON.stringify({
                    type: 'onGetMyName',
                    name: name
                }));
                console.log("sent onGetMyName (after getMyName)");
                break;
            case 'broadcast':
                Object.keys(sockets).forEach(key => {
                    // don't resend to original broadcaster
                    if (key == data.from) {return}
                    data.type = 'onBroadcast';
                    s = sockets[key];
                    // it SHOULD exist because I'm taking the keys from that dictionary
                    if (s) {
                        s.send(JSON.stringify(data));
                        console.log("sent onBroadcast to " + key);
                    } else {
                        console.log("could not send because sockets[" + key + "] is " + sockets[key]);
                    }
                    sendOk(`Message broadcast to all clients.`);
                });
                break;
            case 'message':
                console.log("received message")
                if (sockets[data.to] != undefined) {
                    data.type = 'onMessage';
                    sockets[data.to].send(JSON.stringify(data));
                    sendOk(`Message sent to client ${data.to}.`);
                    console.log("sent message (OK)");
                } else {
                    sendError(`Could not find client with name ${data.to}.`);
                    console.log("sent message (client not found error). sockets dict has these keys:", Object.keys(sockets));
                }
                break;
            case 'hostRoom':
                console.log("received hostRoom");
                // expected keys: data.roomCode, data.gameName
                if ("roomCode" in data && "gameName" in data) {
                    // OK
                    if (data.roomCode.length != 4) {
                        sendError("Room code must be 4 characters long.");
                        break;
                    }
                    if (data.gameName.length == 0) {
                        sendError("Game name must not be empty.");
                        break;
                    }
                    let found = false
                    for (const [k, v] of Object.entries(rooms)) {
                        if (v.host == name) {
                            // room already exists
                            sendError("You are already hosting a room with the room code " + k);
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                    if (rooms[data.roomCode]) {
                        // room exists
                        sendError("The room code " + data.roomCode + " is already taken.");
                        break;
                    }
                    rooms[data.roomCode] = {
                        host: name,
                        gameName: data.gameName,
                        status: ROOM_STAT.OPEN,
                        playerNames: [],
                        controller: "controller_salty.html" // hardcoded because there's only one game
                    };
                    // confirm success
                    ws.send(JSON.stringify({
                        type: 'onRoomMade',
                        roomCode: data.roomCode
                    }));
                } else {
                    // Not enough data
                    sendError("hostRoom message must contain the following keys: roomCode (string length 4), gameName (non-empty string)");
                }
                break;
            case 'queryRoom':
                console.log("received queryRoom");
                // expected keys: data.roomCode, data.nick (may be empty)
                if ("roomCode" in data) {
                    // OK
                    if (data.roomCode.length != 4) {
                        sendError("Room code must be 4 characters long.");
                        break;
                    }
                    if (rooms[data.roomCode]) {
                        // room exists
                        ws.send(JSON.stringify({
                            type: 'roomFound',
                            gameName: rooms[data.roomCode].gameName,
                            status: rooms[data.roomCode].status
                        }));
                        console.log("room exists, sent roomFound message");
                    } else {
                        // room doesn't exist
                        ws.send(JSON.stringify({
                            type: 'roomNotFound'
                        }));
                        console.log("room doesn't exist, sent roomNotFound message");
                    }
                }
                break;
            case 'joinRoom':
                console.log("received joinRoom");
                // expected keys: data.roomCode, data.nick (may be empty)
                if ("roomCode" in data && "nick" in data) {
                    // OK
                    if (data.roomCode.length != 4) {
                        sendError("Room code must be 4 characters long.");
                        return;
                    }
                    if (rooms[data.roomCode]) {
                        // room exists
                        let rm = rooms[data.roomCode];
                        console.log(rm);
                        // is room full?
                        if (rm.status == ROOM_STAT.FULL) {
                            sendError("Room " + data.roomCode + " is full.");
                            break;
                        }
                        // is game in progress?
                        else if (rm.status == ROOM_STAT.INGAME) {
                            sendError("Room " + data.roomCode + " has already started playing.");
                            break;
                        }
                        // is game ended?
                        else if (rm.status == ROOM_STAT.INGAME) {
                            sendError("Room " + data.roomCode + " has already finished playing.");
                            break;
                        }
                        // is user already in?
                        else if (rm.playerNames.includes(name)) {
                            sendError("You are already in Room " + data.roomCode + ".");
                            break;
                        }
                        // all clear, join.
                        else {
                            sockets[rm.host].send(JSON.stringify({
                                type: 'onPlayerJoin',
                                name: name,
                                nick: data.nick
                            }));
                            rm.playerNames.push(name);
                            ws.send(JSON.stringify({
                                type: 'onJoinRoom',
                                message: "Joined Room " + data.roomCode + " successfully.",
                                controller: rm.controller
                            }) );
                            console.log("Welcome!");
                        }
                    } else {
                        // room does not exist
                        sendError("Could not find a room with that room code (" + data.roomCode + ").");
                    }
                } else {
                    // Not enough data
                    sendError("joinRoom message must contain the following keys: roomCode (string length 4), nick (string length 0 to 12).");
                }
                break;
            case 'editRoom':
                console.log('received editRoom');
                // expected keys: roomCode, one of gameName, status
                if (rooms[data.roomCode]) {
                    // room exists
                    if (rooms[data.roomCode].host != name) {
                        sendError("You are not the host of room " + data.roomCode + ".");
                    } else {
                        if ("gameName" in data) {
                            rooms[data.roomCode].gameName = data.gameName;
                        } else if ("status" in data) {
                            if (data.status in ROOM_STAT) {
                                rooms[data.roomCode].status = ROOM_STAT[data.status];
                            } else {
                                sendError("Invalid room status code. Valid ones are:\n" + JSON.stringify(ROOM_STAT, null, 2));
                            }
                        } else {
                            sendError("No valid keys to be edited. Supports editing gameName, status");
                        }
                    }
                } else {
                    sendError("No such room exists: " + data.roomCode + ".");
                }
                break;
            case 'sendToRoom':
                console.log("received sendToRoom");
                // expected keys: roomCode (string length 4). should contain additional data
                if (rooms[data.roomCode]) {
                    // room exists
                    if (rooms[data.roomCode].host == name) {
                        rooms[data.roomCode].playerNames.forEach((e) => {
                            sockets[e].send(JSON.stringify(data));
                        });
                    } else {
                        sendError("You are not the host of room " + data.roomCode + ".");
                    }
                } else {
                    sendError("Could not find a room with that room code (" + data.roomCode + ").");
                }
                break;
            case 'sendToHost':
                console.log("received sendToHost");
                // expected keys: roomCode (string length 4). should contain additional data
                if (rooms[data.roomCode]) {
                    // room exists
                    if (rooms[data.roomCode].playerNames.includes(name)) {
                        sockets[
                            rooms[data.roomCode].host
                        ].send(JSON.stringify(data));
                    } else {
                        sendError("You are not in room " + data.roomCode + ".");
                    }
                } else {
                    sendError("Could not find a room with that room code (" + data.roomCode + ").");
                }
                break;
            case 'closeRoom':
                console.log("received closeRoom");
                closeRoomBy(name);
                break;
            default:
                console.log("Unrecognized type: ", data.type);
        }
    });

    // When a socket closes, or disconnects, remove it from the array.
    ws.on('close', function() {
        if (closeRoomBy(name)) {
            let found = false
            for (const [k, v] of Object.entries(rooms)) {
                for (i = 0; i < v.playerNames.length; i++) {
                    if (v.playerNames[i] == name) {
                        found = true;
                        v.playerNames.splice(i, 1);
                        sockets[v.host].send(JSON.stringify({
                            type: 'onRoomLeave',
                            message: name
                        }));
                        break
                    }
                }
                if (found) {break;}
            }
        };
        delete sockets[name];
    });

    // Close the room, whether due to unintentional disconnection or due to manual closing.
    // Returns false if the room was found and closed. Returns true otherwise.
    function closeRoomBy(hostName) {
        let found = false
        for (const [k, v] of Object.entries(rooms)) {
            if (v.host == hostName) {
                found = true
                console.log("Found the room. Room code is " + k);
                v.playerNames.forEach((e) => {
                    sockets[e].send(JSON.stringify({
                        type: 'onRoomClosed',
                        message: ""
                    }) );
                    console.log("Notified " + e + " that the room is closed.");
                });
                ws.send(JSON.stringify({
                    type: "onRoomClose",
                    message: "Room " + k + " closed."
                }));
                delete rooms[k];
                return false
            }
        }
        if (!found) {
            sendError("You are not hosting a room.");
            return true
        }
    }

    function sendOk(message) {
        ws.send(JSON.stringify({
            type: "onOk",
            message: message
        }));
    }

    function sendError(message) {
        ws.send(JSON.stringify({
            type: "onError",
            message: message
        }));
    }
});