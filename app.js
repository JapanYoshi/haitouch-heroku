var express = require("express");
const { stringify } = require("querystring");
//const { connect } = require("http2");
var app = express();
var server = require("http").Server(app);

app.get("/", function(req, res){
    //console.log("get request received")
    res.sendFile(__dirname + "/index.html");
});
app.use("/client", express.static(__dirname + "/client"));

var port = process.env.PORT || 3001;

const WebSocket = require('ws');
const wss = new WebSocket.Server({
    server
});

server.listen(port);
console.log("Server started. Port = " + port);

var shortid = require('shortid');


// This seems like the problem:
let sockets = {};
wss.on('connection', function(ws) {
    var name = shortid.generate();
    console.log(`New client connected. Name: ${name}`);
    sockets[name] = ws;
    ws.send(JSON.stringify({
        type: 'onGetMyName',
        name: name
    }));
    console.log("sent onGetMyName (initialize connection)");
    console.log("sockets dict now has these keys: " + Object.keys(sockets))
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
            case 'hello':
                // msg.name has last used name
                ws.send(JSON.stringify({
                    type: 'onGetMyName', name: name
                }));
                console.log("sent onGetMyName (1)");
                break;
            case 'getMyName':
                ws.send(JSON.stringify({
                    type: 'onGetMyName',
                    name: name
                }));
                console.log("sent onGetMyName (2)");
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
                });
                break;
            case 'message':
                console.log("received message")
                if (sockets[data.to] != undefined) {
                    data.type = 'onMessage';
                    sockets[data.to].send(JSON.stringify(data));
                    console.log("sent message (OK)");
                } else {
                    ws.send(JSON.stringify({
                        type: 'onMessage',
                        from: "server",
                        to: name,
                        message: `Could not find client with name ${data.to}.`
                    }));
                    console.log("sent message (client not found error). sockets dict has these keys:", Object.keys(sockets));
                }
                break;
            default:
                console.log("Unrecognized type: ", data.type);
        }
    });

    // When a socket closes, or disconnects, remove it from the array.
    ws.on('close', function() {
        delete sockets[name];
    });
});

// I want to let Godot connect with Websockets
// var io = require("socket.io")(server, {});

// io.sockets.on("connection", function(socket){
//     var clientName = shortid.generate();
//     console.log("A client is connected. Current keys in connections: " + Object.keys(connections));
//     socket.on("hello", function(data){
//         // data.name has stored name
//         console.log("Assigning a name: " + clientName);
//         connections[clientName] = socket;
//         // give the name immediately
//         socket.emit("onGetMyName", {
//             name: clientName
//         });
//     });
    
//     socket.on("disconnect", function() {
//         console.log("Disconnected: " + clientName);
//         connections[clientName] = undefined;
//     })

//     socket.on("getMyName", function() {
//         socket.emit("onGetMyName", {
//             name: clientName
//         });
//         console.log("Emitted name: " + clientName)
//     });

//     socket.on("message", function(data){
//         console.log(`Message event, from ${data.from}, to ${data.to}, content ${data.message}.`);
//         // forward to the correct client (broadcasts to all for now)
//         connections[data.to].emit("onMessage", data);
//     })
// })