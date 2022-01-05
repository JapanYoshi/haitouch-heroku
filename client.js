document.addEventListener('DOMContentLoaded', ()=>{
    var output = document.getElementById('output');
    var myName = document.getElementById('myName');
    var host = location.origin.replace(/^http/, 'ws');
    var ws = new WebSocket(host);
    function heartbeat(){
        ws.send(JSON.stringify({
            type: 'sendToHost',
            roomCode: sessionStorage.getItem("room"),
            data: "heartbeat"
        }));
    }
    ws.onmessage = (msg) => {
        var data;
        try {
            data = JSON.parse(msg.data);
        } catch (e) {
            output.innerText = `Invalid JSON: ${msg.data}`;
            return
        }
        console.log(`WebSocket message received: `, data);
        switch (data.type) {
            /* General */
            case 'onGetMyName':
                localStorage.setItem("name", data.name);
                myName.innerText = data.name;
                break
            /* Debugging. This won't be used in the actual app because all the communication will be within the room */
            case 'onBroadcast':
                output.innerText = (
                    `A client named ${data.from} broadcast this message: ${data.message}`
                );
                break
            case 'onMessage':
                output.innerText = (
                    `A client named ${data.from} sent you this message: ${data.message}`
                );
                break
            case 'onError':
                output.innerText = data.message;
                break
            /* Joining a room */
            case 'onJoinRoom':
                output.innerText = data.message;
                // fetch the controller file
                var xmlHttp = new XMLHttpRequest();
                xmlHttp.onreadystatechange = () => {
                    if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
                        //console.log(xmlHttp.responseText);
                        // manually extract the element div.game using specific comments
                        let header = "<!--START INJECTED HTML-->"
                        let start = xmlHttp.responseText.search(header) + header.length;
                        let end = xmlHttp.responseText.search("<!--END INJECTED HTML-->");
                        let htmlText = xmlHttp.responseText.substring(start, end);
                        document.body.innerHTML = htmlText;
                        setInterval(heartbeat, 1000);
                    }
                }
                xmlHttp.open("GET", data.controller, true);
                xmlHttp.send(null)
                break
            case 'onRoomClosed':
                alert("Room closed.");
                location.reload();
                break
            default:
                console.log('Undefined message type: ' + data.type);
        }
    };
    
    ws.onopen = (event => {
        let name = localStorage.getItem("name");
        if (!name) { name = ""; }
        console.log("name is", name);
        let firstMessage = {
            type: 'hello',
            name: name
        };
        console.log("first message is", firstMessage);
        let jsonString = JSON.stringify(firstMessage);
        console.log("stringified is", jsonString);
        ws.send(jsonString);
    });
    
    ws.onclose = (event => {
        myName.innerText = "Disconnected";
        alert("Room closed.");
        location.reload();
    });
    
    ws.onerror = (event => {
        myName.innerText = "Error";
        alert("Room closed.");
        location.reload();
    });
    
    function getMyName() {
        console.log(JSON.stringify({
            type: 'getMyName'
        }));
        ws.send(JSON.stringify({
            type: 'getMyName'
        }));
    }

    document.getElementById("btnGetMyName").addEventListener("click", getMyName);
    
    function broadcast() {
        ws.send(JSON.stringify({
            type: 'broadcast',
            from: localStorage.getItem("name"),
            message: document.getElementById("message").value
        }));
    }
    document.getElementById("btnBroadcast").addEventListener("click", broadcast);
    
    function sendMessage() {
        ws.send(JSON.stringify({
            type: 'message',
            from: localStorage.getItem("name"),
            to: document.getElementById("name").value,
            message: document.getElementById("message").value
        }));
    }
    document.getElementById("btnSendMessage").addEventListener("click", sendMessage);
    
    /*\
    |*| Join lobby stuff.
    \*/
    var inputRc = document.getElementById('rc');
    var inputNick = document.getElementById('nick');
    var btnJoin = document.getElementById('btnJoin');
    var joinStatus = document.getElementById('joinStatus');

    /*
     *  Only if the room code and nick are valid, enable the "join" button.
     */
    function validateChange() {
        let rc = inputRc.value;
        let nick = inputNick.value;
        if (
            rc.length == 4 &&
            inputRc.validity.valid &&
            inputNick.validity.valid
        ) {
            btnJoin.disabled = false;
        } else {
            btnJoin.disabled = true;
        }
    }
    inputRc.addEventListener("input", validateChange);
    
    /*
     *  If the nickname contains curly Unicode single quotes,
     *  replace them with the allowed typewriter/ASCII single quotes.
     */
    function fixNickQuotes() {
        // replace unicode single quotes
        var start = inputNick.selectionStart;
        var end = inputNick.selectionEnd;
        const quotes = /[\u2018-\u201b]/g
        inputNick.value = inputNick.value.replaceAll(quotes, "'");
        inputNick.setSelectionRange(start, end);
        validateChange();
    }
    inputNick.addEventListener("input", fixNickQuotes);
    fixNickQuotes()

    /*
     *  Tell the server that you would like to join a room.
     */
    function joinRoom() {
        let room = inputRc.value.toUpperCase();
        sessionStorage.setItem("room", room);
        let nick = inputNick.value.toUpperCase();
        ws.send(JSON.stringify({
            type: 'joinRoom',
            roomCode: room,
            nick: nick,
            from: localStorage.getItem("name")
        }));
        joinStatus.innerText = "Trying to connect to room " + inputRc.value.toUpperCase();
    }

    btnJoin.addEventListener("click", joinRoom);

    /*
     *  FOR TESTING: Start a room on the server.
     */
    function openRoom(){
        let room = inputRc.value.toUpperCase();
        ws.send(JSON.stringify({
            type: 'hostRoom',
            roomCode: room,
            gameName: "Test room from Web client",
            from: localStorage.getItem("name")
        }));
    }
    document.getElementById("btnOpenRoom").addEventListener("click", openRoom);
    /*
    *  FOR TESTING: Close a room on the server.
    */
   function closeRoom(){
       ws.send(JSON.stringify({
           type: 'closeRoom',
           from: localStorage.getItem("name")
        }));
    }
    document.getElementById("btnCloseRoom").addEventListener("click", closeRoom);
    /*
    *  FOR TESTING: Send a message to all clients in the room.
    */
   function sendToRoom(){
       ws.send(JSON.stringify({
           type: 'sendToRoom',
           roomCode: inputRc.value.toUpperCase(),
           data: document.getElementById("message").value
        }));
    }
    document.getElementById("btnSendToRoom").addEventListener("click", sendToRoom);
    

    console.log("client.js event function just ran.")
});
console.log("client.js document just ran.")