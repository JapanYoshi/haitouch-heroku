var express = require("express");
//const { stringify } = require("querystring");
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
app.get("/heartbeat", function(req, res) {
    res.sendStatus(200); // send an OK response
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
    FULL_AUDI: 2,
    INGAME: 3,
    ENDED: 4
}

server.listen(port);
console.log("Server started. Port = " + port);

// Generating a random short ID. (For some reason there's a library for this)
var shortid = require('shortid');
// const { send } = require("process");
// const { readlink } = require("fs");

// rejects bad room codes
// lots of them are based on pokemon nickname censors
// ref: https://bulbapedia.bulbagarden.net/wiki/List_of_censored_words_in_Generation_V
const badRoomCodes = ["ARSE","ARSH","BICH","BITE","BSTD","BTCH","CAZI","CAZO","CAZZ","CCUM","CHNK","CLIT","COCC","COCK","COCU","COKC","COKK","CONO","COON","CUCK","CULE","CULO","CUUL","CUMM","CUMS","CUNT","CUUM","DAMN","DICC","DICK","DICS","DICX","DIKC","DIKK","DIKS","DIKX","DIXX","DKHD","DYKE","FAAG","FAGG","FAGS","FFAG","FICA","FICK","FIGA","FOTZ","FCUK","FUCC","FUCK","FUCT","FUCX","FUKC","FUKK","FUKT","FUKX","FUXX","GIMP","GYPS","HEIL","HOES","HOMO","HORE","HTLR","JODA","JODE","JAPS","JEWS","JIPS","JIZZ","KACK","KIKE","KUNT","MERD","MRCA","MRCN","MRDE","NAZI","NCUL","NEGR","NGGR","NGRR","NGRS","NIGG","NIGR","NUTE","NUTT","PAKI","PCHA","PEDE","PEDO","PHUC","PHUK","PINE","PISS","PLLA","PNIS","POOP","PORN","POYA","PUTA","PUTE","PUTN","PUTO","RAEP","RAPE","SECS","SECX","SEKS","SEKX","SEXX","SHAT","SHIT","SHIZ","SHYT","SIMP","SLAG","SPAS","SPAZ","SPRM","TARD","TITS","TROA","TROI","TWAT","VAGG","VIOL","WANK","WHOR"];
const badRoomSubstr = ["ASS","FAG","KKK"];
function isBadRoomCode(roomCode) {
    if (badRoomCodes.includes(roomCode)) {
        return true;
    }
    for (let i = 0; i < badRoomSubstr.length; i++) {
        if (roomCode.indexOf(badRoomSubstr[i]) !== -1) {
            return true;
        }
    }
    return false;
}

// A dictionary with the key being the assigned ID and the value being the socket.
let sockets = {};
// A dictionary with the key being the room code
// and the value being the assigned ID of the host of that room code.
let rooms = {};
// The 8 most recent "heartbeat" messages sent by each client
let heartbeat_log = [];
wss.on('connection', function(ws) {
    var name = shortid.generate();
    console.log(`New client connected. Generated ID: ${name}`);
    ws.on('message', (msg) => {
        var data;
        try {
            data = JSON.parse(msg);
            //console.log(`WebSocket message received: `, data);
        } catch (e) {
            console.log(`Invalid JSON: ${msg.data}`);
            return
        }
        switch (data.type) {
            case 'heartbeat':
                heartbeat_log.push(name);
                if (heartbeat_log.length >= 8) {
                    console.log("heartbeats: ", JSON.stringify(heartbeat_log));
                    heartbeat_log = [];
                }
                break;
            case 'hello':
                // msg.name has last used name
                console.log("Socket " + data.name + " says hello.");
                if (Object.keys(sockets).includes(data.name)) {
                    // name already used
                    sendError("Requested ID is already in use. Please log in only once per browser.");
                    ws.close();
                    console.error("Closed socket for duplicate ID.");
                    return;
                // sure, implicit type casting is the js way but i want it to be explicit because i am a messy coder
                } else if (Boolean(data.name) == false) {
                    console.log(`Assigning new ID: ${name}`);
                } else {
                    name = data.name;
                    console.log(`Assigning requested ID: ${data.name}`);
                }
                ws.send(JSON.stringify({
                    type: 'onGetMyName',
                    name: name
                }));
                console.log("Sent name to socket (after hello).");
                sockets[name] = ws;
                console.log("Current connections: " + Object.keys(sockets).length + " " + Object.keys(sockets));
                break;
            case 'getMyName':
                ws.send(JSON.stringify({
                    type: 'onGetMyName',
                    name: name
                }));
                console.log("Sent name " + name + " to socket.");
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
                        console.error("Could not send because sockets[" + key + "] is " + sockets[key]);
                    }
                    sendOk(`Message broadcast to all clients.`);
                });
                break;
            case 'message':
                console.log("Received message from " + name + ".");
                if (sockets[data.to] != undefined) {
                    data.type = 'onMessage';
                    sockets[data.to].send(JSON.stringify(data));
                    sendOk(`Message sent to client ${data.to}.`);
                    console.log("Sent message to " + data.to + ". (OK)");
                } else {
                    sendError(`Could not find client with name ${data.to}.`);
                    console.error("Could not find recipient " + data.to + ". Sent back an error.");
                }
                break;
            case 'hostRoom':
                console.log("Received hostRoom from " + name + ".");
                // expected keys: data.roomCode, data.gameName
                if (
                    data.hasOwnProperty("roomCode")
                    && data.hasOwnProperty("gameName")
                    && data.hasOwnProperty("controller")
                    && data.hasOwnProperty("maxPlayers")
                    && data.hasOwnProperty("maxAudience")
                ) {
                    // OK
                    if (data.roomCode.length != 4) {
                        sendError("Room code must be 4 characters long.");
                        console.error("Invalid room code length: " + data.roomCode);
                        break;
                    }
                    if (isBadRoomCode(data.roomCode)) {
                        sendError("Room code is forbidden.");
                        console.error("Forbidden room code: " + data.roomCode);
                        break;
                    }
                    if (data.gameName.length == 0) {
                        sendError("Game name must not be empty.");
                        console.error("Empty game name.");
                        break;
                    }
                    let found = false
                    for (const [k, v] of Object.entries(rooms)) {
                        if (v.host == name) {
                            // you're already hosting a different room
                            sendError("You are already hosting a room with the room code " + k);
                            console.error(name + " is already hosting a room: " + k + ".");
                            found = true;
                            break;
                        }
                    }
                    if (found) {
                        break;
                    }
                    if (rooms[data.roomCode]) {
                        // a room with that room code exists
                        sendError("The room code " + data.roomCode + " is already taken.");
                        console.error("The room code " + data.roomCode + " is already taken.");
                        break;
                    }
                    rooms[data.roomCode] = {
                        host: name,
                        gameName: data.gameName,
                        status: ROOM_STAT.OPEN,
                        playerNames: [],
                        controller: data.controller,
                        players: 0,
                        maxPlayers: data.maxPlayers,
                        audience: 0,
                        maxAudience: data.maxAudience
                    };
                    // confirm success
                    ws.send(JSON.stringify({
                        type: 'onRoomMade',
                        roomCode: data.roomCode
                    }));
                    console.log("Checks succeeded. Room is created.", rooms[data.roomCode]);
                } else {
                    // Not enough data
                    sendError("hostRoom message must contain the following keys: roomCode (string length 4), gameName (non-empty string), controller (HTML file name), maxPlayers (int >= 1), maxAudience (int >= 0).");
                    console.error("Missing properties. Room not created.")
                }
                break;
            case 'queryRoom':
                console.log("Received queryRoom from " + name + ".");
                // expected keys: data.roomCode, data.nick (may be empty)
                if (data.hasOwnProperty("roomCode")) {
                    // OK
                    if (data.roomCode.length != 4) {
                        sendError("Room code must be 4 characters long.");
                        console.error("Invalid room code: " + data.roomCode + ".");
                        break;
                    }
                    if (isBadRoomCode(data.roomCode)) {
                        sendError("This room code is forbidden.");
                        console.error("Forbidden room code: " + data.roomCode + ".");
                        break;
                    }
                    if (rooms[data.roomCode]) {
                        // room exists
                        ws.send(JSON.stringify({
                            type: 'roomFound',
                            gameName: rooms[data.roomCode].gameName,
                            status: rooms[data.roomCode].status
                        }));
                        console.log("Room " + data.roomCode + " exists. Sent roomFound message to " + name + ".");
                    } else {
                        // room doesn't exist
                        ws.send(JSON.stringify({
                            type: 'roomNotFound'
                        }));
                        console.log("Room doesn't exist. Sent roomNotFound message to " + name + ".");
                    }
                } else {
                    console.error("The message does not contain a room code.");
                }
                break;
            case 'joinRoom':
                console.log("Received joinRoom from " + name + ".");
                // expected keys: data.roomCode, data.nick (may be empty)
                if (data.hasOwnProperty("roomCode") && data.hasOwnProperty("nick")) {
                    // OK
                    if (data.roomCode.length != 4) {
                        sendError("Room code must be 4 characters long.");
                        console.error("Invalid room code: " + data.roomCode + ".");
                        return;
                    }
                    if (rooms[data.roomCode]) {
                        // room exists
                        let rm = rooms[data.roomCode];
                        console.log("Sockets:", Object.keys(sockets), "Room:", rm);
                        // is user already in? (if so, rejoin)
                        if (rm.playerNames.includes(name)) {
                            if (rm.host in Object.keys(sockets)) {
                                sockets[rm.host].send(JSON.stringify({
                                    type: 'onPlayerJoin',
                                    name: name,
                                    nick: data.nick
                                }));
                                rm.playerNames.push(name);
                                ws.send(JSON.stringify({
                                    type: 'onJoinRoom',
                                    message: "Rejoined Room " + data.roomCode + " successfully.",
                                    controller: rm.controller
                                }) );
                                console.log("Welcome back to Room " + data.roomCode + ", " + name + "!");
                            } else {
                                console.error("Host is gone! WTF?");
                            }
                            break;
                        }
                        // is room full?
                        else if (rm.status == ROOM_STAT.FULL_AUDI) {
                            sendError("Room " + data.roomCode + " is full.");
                            console.log("Declined join; specified room is full.");
                            break;
                        }
                        // is game in progress?
                        /*else if (rm.status == ROOM_STAT.INGAME) {
                            sendError("Room " + data.roomCode + " has already started playing.");
                            break;
                        }*/
                        // is game ended?
                        else if (rm.status == ROOM_STAT.INGAME) {
                            sendError("Room " + data.roomCode + " has already finished playing.");
                            console.log("Declined join; specified game is already over.");
                            break;
                        }
                        // all clear, join.
                        else {
                            let asAudience = false;
                            if (rm.players >= rm.maxPlayers) {
                                asAudience = true;
                            }
                            sockets[rm.host].send(JSON.stringify({
                                type: 'onPlayerJoin',
                                name: name,
                                nick: data.nick,
                                asAudience: asAudience
                            }));
                            rm.playerNames.push(name);
                            ws.send(JSON.stringify({
                                type: 'onJoinRoom',
                                message: "Joined Room " + data.roomCode + " successfully.",
                                controller: rm.controller
                            }) );
                            console.log("Welcome to " + data.roomCode + ", " + name + "!");
                            // keep count of players
                            if (asAudience) {
                                rm.audience ++;
                                if (rm.audience >= rm.maxAudience) {
                                    rm.status = ROOM_STAT.FULL_AUDI;
                                }
                            }
                            else {
                                rm.players ++;
                                if (rm.players >= rm.maxPlayers) {
                                    if (rm.maxAudience <= 0) {
                                        rm.status = ROOM_STAT.FULL_AUDI;
                                    } else {
                                        rm.status = ROOM_STAT.FULL;
                                    }
                                }
                            }
                        }
                    } else {
                        // room does not exist
                        sendError("Could not find a room with that room code (" + data.roomCode + ").");
                        console.log("Room not found: " + data.roomCode);
                    }
                } else {
                    // Not enough data
                    sendError("joinRoom message must contain the following keys: roomCode (string length 4), nick (string length 0 to 12).");
                    console.error("Missing properties.");
                }
                break;
            case 'editRoom':
                console.log('received editRoom from ' + name);
                // expected keys: roomCode, one of gameName, status
                if (rooms[data.roomCode]) {
                    // room exists
                    if (rooms[data.roomCode].host != name) {
                        sendError("You are not the host of room " + data.roomCode + ".");
                        console.error(name + " tried to edit a room of which they are not the host.");
                    } else {
                        if ("gameName" in data) {
                            rooms[data.roomCode].gameName = data.gameName;
                            console.log("Changed gameName to " + data.gameName);
                        } else if ("status" in data) {
                            if (data.status in ROOM_STAT) {
                                rooms[data.roomCode].status = ROOM_STAT[data.status];
                                console.log("Changed status to " + data.status + " = " + ROOM_STAT[data.status]);
                            } else {
                                sendError("Invalid room status code. Valid ones are:\n" + JSON.stringify(ROOM_STAT, null, 2));
                                console.error("Tried to set the room status code to an invalid value: " + data.status);
                            }
                        } else {
                            sendError("No valid keys to be edited. Supports editing gameName, status");
                            console.error("No valid keys: gameName, status");
                        }
                    }
                } else {
                    sendError("No such room exists: " + data.roomCode + ".");
                    console.error("Room was not found: " + data.roomCode);
                }
                break;
            case 'kickFromRoom':
                console.log('received kickFromRoom from ' + name);
                // expected keys: roomCode, name, message (optional)
                if (rooms[data.roomCode]) {
                    // room exists
                    if (rooms[data.roomCode].host != name) {
                        sendError("You are not the host of room " + data.roomCode + ".");
                    } else {
                        if ("name" in data) {
                            // search for player
                            let found = false;
                            for (let i = 0; i < rooms[data.roomCode].playerNames.length; i++) {
                                if (rooms[data.roomCode].playerNames[i] == data.name) {
                                    sockets[data.name].send(JSON.stringify({
                                        type: 'onKick',
                                        message: data.message
                                    }));
                                    rooms[data.roomCode].playerNames.splice(
                                        i , 1
                                    );
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) {
                                sendError("The player " + data.name + " is not in your room.");
                            }
                        } else {
                            sendError("The key 'name' is absent.");
                        }
                    }
                } else {
                    sendError("No such room exists: " + data.roomCode + ".");
                }
                break;
            case 'sendToRoom':
                console.log("received sendToRoom: roomCode=" + data.roomCode + " and there are " + Object.keys(rooms).length + " rooms"); // why is Object.keys(objInstance).length the quickest way to do this
                // expected keys: roomCode (string length 4). should contain additional data
                if (rooms[data.roomCode]) {
                    // room exists
                    if (rooms[data.roomCode].host == name) {
                        rooms[data.roomCode].playerNames.forEach((e) => {
                            if (sockets.hasOwnProperty(e)) {
                                sockets[e].send(JSON.stringify(data))
                            };
                        });
                    } else {
                        sendError("You are not the host of room " + data.roomCode + ".");
                    }
                } else {
                    sendError("Could not find a room with that room code (" + data.roomCode + ").");
                }
                break;
            case 'sendToHost':
                console.log("received sendToHost from " + name + ": roomCode=" + data.roomCode + " and there are " + Object.keys(rooms).length + " rooms");
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
                console.log("Received closeRoom from " + name);
                closeRoomBy(name);
                console.log("Finished closing the room.");
                break;
            default:
                console.log("Unrecognized type: ", data.type);
        }
    });

    // When a socket closes, or disconnects, remove it from the array.
    ws.on('close', function(code, reason) {
        console.log("Socket closed: " + name);
        console.log("code = " + code + " and reason = " + reason);
        // if (closeRoomBy(name)) {
            // don't automatically leave, player may rejoin
            // let found = false
            // for (const [k, v] of Object.entries(rooms)) {
            //     for (i = 0; i < v.playerNames.length; i++) {
            //         if (v.playerNames[i] == name) {
            //             found = true;
            //             v.playerNames.splice(i, 1);
            //             sockets[v.host].send(JSON.stringify({
            //                 type: 'onRoomLeave',
            //                 message: name
            //             }));
            //             break
            //         }
            //     }
            //     if (found) {break;}
            // }    
        // };
        delete sockets[name];
        console.log(`Socket ${name} is disconnected.`);
        console.log("Sockets dict now has these keys: " + Object.keys(sockets))
        return;
    });

    ws.on('error', function(error) {
        console.error("An error occurred on the Websocket connection.", error);
    });

    // Close the room, whether due to unintentional disconnection or due to manual closing.
    // Returns false if the room was found and closed. Returns true otherwise.
    function closeRoomBy(hostName) {
        for (const [k, v] of Object.entries(rooms)) {
            if (v.host == hostName) {
                console.log(hostName + " is hosting a room. Room code is " + k);
                v.playerNames.forEach((e) => {
                    if (sockets.hasOwnProperty(e)) {
                        sockets[e].send(JSON.stringify({
                            type: 'onRoomClosed',
                            message: ""
                        }) );
                        console.log("Notified socket " + e + " that the room is closed.");
                    }
                });
                ws.send(JSON.stringify({
                    type: "onRoomClose",
                    message: "Your room " + k + " was closed."
                }));
                delete rooms[k];
                return false
            }
        }
        console.log("Socket " + hostName + " is not hosting a room.");
        return true
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

wss.on('error', function(error) {
    console.error("An error occurred on the underlying server.", error);
});