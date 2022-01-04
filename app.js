var express = require("express");
const { connect } = require("http2");
var app = express();
var server = require("http").Server(app);

app.get("/", function(req, res)
{
    res.sendFile(__dirname + "/index.html");
});
app.use("/client", express.static(__dirname + "/client"));

var port = 8080;
server.listen(port);
console.log("Server started. Port = " + port);

var shortid = require('shortid');

var io = require("socket.io")(server, {});

io.sockets.on("connection", function(socket){
    var clientName = shortid.generate();
    console.log("A client is connected. Assigned ID is: " + clientName);
    
    socket.on("disconnect", function() {
        console.log("Disconnected: " + clientName);
    })

    socket.on("getMyName", function() {
        socket.emit("onGetMyName", {
            name: clientName
        });
        console.log("Emitted name: " + clientName)
    });

    socket.on("sendMyNameToAllClients", function(){
        socket.broadcast.emit("onSendMyNameToAllClients", {
            name: clientName
        });
        console.log("Broadcast name: " + clientName)
    });
})