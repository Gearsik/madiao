const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Madiao Test</title></head>
        <body>
            <p>Madiao server is alive again</p>
            <script src="/socket.io/socket.io.js"></script>
        </body>
        </html>
    `);
});

//making the localhost server listen on the port 3001
const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

//defining a new lobbies variable to store all lobbies in.
//all active lobbies live here, but since its in-memory only, they'll disappear after the server restarts
const lobbies = new Map();

//A function to generate a 6-chars lobby code
//0, O and 1 are excluded from the pool of characters for ease of use on smaller screens
function generateLobbyCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++){
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

//sends the list of all the players to everyone in the lobby, and gets called when the lobby state changes.
//keeps the data emited to all players in lobbies consistent, and the client needs only one handler to stay in sync
function broadcastLobby(io, lobby){
    io.to(lobby.code).emit('lobby_updated', {
        players: lobby.players,
        hostId: lobby.hostId
    });
}

//every player on connection gets their own socket, aka socket.id. That ID is used to identify each player from others.
//since there is no login, a player in this case just refers to every socketID
io.on('connection', (socket) => {
    console.log('A player connected', socket.id);

    //player once connected can create a new lobby
    socket.on('createLobby', (data) => {
        const playerName = data.name;

        //generate codes until we get one that isn't taken and check for collision even with tiny chances of it happening.
        //the chances for that happening are astronomically small, but its always better to check especially if it costs nothing
        let code = generateLobbyCode();
        while(lobbies.has(code)){
        code = generateLobbyCode();
        }

        //the lobby creator is automatically seen as the first player and the host
        //once the lobby is created, its creator is added to the lobby by default with no extra steps.
        //data each lobby stores 
        const lobby = {
            code: code,
            hostId: socket.id,
            players: [
                {id: socket.id, name: playerName}
            ],
            gameStarted: false
        };

        lobbies.set(code, lobby);
        //here we attach each code to a lobby, allowing us to later use socket.io to broadcast to any lobby automatically if there was a change in that lobby
        //such as a new player joining or a person leaving the lobby
        socket.join(code);

        //here we just inform the creator of the lobby, that the lobby was in fact created correctly
        socket.emit('lobby_created', {
            code: lobby.code,
            players: lobby.players,
            hostId: lobby.hostId,
        });

        //currently mostly used for debugging purposes, to see if lobbies get created correctly
        console.log(`Lobby ${code} created by ${playerName}`);

    });


    //here are events that happen when a player tries to join an existing lobby
    socket.on('joinLobby', (data) => {
        //trimming and uppercasing is for ease of use so the player doesn't have to type
        //the code perfectly avoid extra spaces or lowercase/uppercase letters
        const playerName = data.name.trim();
        const code =  data.code.toUpperCase().trim();

        //Validate input before even touching the lobbies maps, so a blank name or code never go further than looking it up in the "lobbies" variable
        if (!playerName || !code) {
            socket.emit('lobby_error', {message: 'Please enter your name and a lobby code: '});
            return;
        }

        //now we need to check that the share code that's being entered by the player exists (lobbies variable above).
        const lobby = lobbies.get(code);

        //if the lobby does not exist we display an error message.
        if (!lobby){
            socket.emit('lobby_error', {message: 'Lobby not found'});
            return;
        }

        //if the lobby was detected, joining-mid game shouldn't be allowed, so we just block it here by printing an error message.
        if (lobby.gameStarted){
            socket.emit('lobby_error', {message: 'The game has already started'});
            return;
        }

        //an important guard check against double-joins if for whatever reason the client would retry to enter the same socketID twice
        //breaking the whole lobby or just causing bugs.
        const alreadyJoined = lobby.players.some((player) => player.id === socket.id);

        if (!alreadyJoined){ //if the player isnt in the room, then let them join
            lobby.players.push({id: socket.id, name: playerName});
            socket.join(code);

            //once a player joined we're letting them know which lobby they joined, who other players in the lobby are and who's the host.
            //thats for the new joining player only
            socket.emit('lobby_joined', {
                code: lobby.code,
                players: lobby.players,
                hostId: lobby.hostId
        });

            //then we simply notify other lobby members that a new player joined and the list of the players changed
            broadcastLobby(io, lobby);
            console.log(`${playerName} joined the lobby ${code}`);
        } else {
            socket.emit('lobby_error', {message: 'You are already in this lobby'})
        }

    })

    //runs whevener a player/socket disconnets for any reason (closed tab, refresh, lost connection)
    //there isn't a "leave lobby" event or anything like that so this is the place where the removal happens
    socket.on ('disconnect', () => {

        //for now we scan through all lobbies to check in which lobby the disconnect happened
        //which probably would have to be replaced with something else if the number of lobbies got large
        for (const [roomCode, roomLobby] of lobbies.entries()){
            const playerIndex = roomLobby.players.findIndex((player) => player.id == socket.id);

            //if there was no disconnect detected in THIS lobby, move on, and check the next one
            if (playerIndex === -1) {
                continue;
            }

            roomLobby.players.splice(playerIndex, 1);

            //if a lobby with no players found was detected,
            //delete it immidiately to free up the space and the code it used
            if (roomLobby.players.length === 0){
                lobbies.delete(roomCode);
                break;
            }

            //in the case the host is the one leaving the room, there would be no players with power to start the game
            //hand over host to the next person in line
            if (roomLobby.hostId === socket.id && roomLobby.players.length > 0) {
                roomLobby.hostId = roomLobby.players[0].id;
            }
            broadcastLobby(io, roomLobby);
            //once the lobby the disconnected socket belong to was found,
            //since it can only be in a single lobby at a time
            //there is no need to scan other lobby maps.
            break;
        }
    })
});