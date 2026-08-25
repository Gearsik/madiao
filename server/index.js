const express = require('express');                 //needed to connect to a web server
const http = require('http');                       //node's built-in http module, needed to create the raw server socket.io attaches to
const {Server} = require('socket.io');              //the websocket library that handles all real-time communication
const { startGame } = require('./game/state');      //function that builds the full starting game state when a game begins. It requires the state.js file to work
const {isPlayHonest} = require('./game/deck');      //checks whether a declared play was honest or a bluff, it requires the deck.js file to work
const { applyDrink } = require('./game/rules');     //gives a player a drink and tells us whether that drink knocked them out, and it requires the rules.js file to work

//shared timing values, the client reads the very same file so both sides always agree on how long things take
const { turnDurationMs, cooldownMs, drinkAnimationMs, challengeOverlayMs, timeoutOverlayMs } = require('./shared/constants');

const app = express();
const server = http.createServer(app);

//CLIENT_ORIGIN can be provided by Docker/production, otherwise local React is used
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

const io = new Server(server, {
    cors: {
        origin: CLIENT_ORIGIN,
        methods: ['GET', 'POST']
    }
});     

//simple page we can use to quickly confirm that the game server is running by simply opening it in a browser
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











// #region ACTIVE LOBBIES AND GAMES

// ========== ACTIVE LOBBIES AND GAMES ==========

//defining a new lobbies variable to store all lobbies in.
//all lobby/game information is kept in memory, so restarting the server clears it
const lobbies = new Map();

//we also need somewhere to keep the live games and their timers
const gameStates = new Map();       //tracks the live game states of each active game by lobby code **NOT TO CONFUSE WITH gameState**
const gameTimers = new Map();       //the server side timers of each game, kept separately since timers are not game state and should never be sent to clients
const socketLobbies = new Map();    //maps each socket id to its lobby code so we can find a player's lobby instantly instead of scanning every lobby

const MAX_PLAYERS = 6;
const MAX_CARDS_PER_PLAY = 10;
const MAX_PLAYER_NAME_LENGTH = 20;











// #region HELPER FUNCTIONS

// ========== HELPER FUNCTIONS ==========

//creates a 6-character lobby code, leaving out characters that are easy to misread on smaller screens such as 0, O and 1
function generateLobbyCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';               //specify which characters the code can use
    let code = '';                                                  //start with an empty string and build it up
    for (let i = 0; i < 6; i++){                                    //repeat 6 times, once per character
        code += chars[Math.floor(Math.random() * chars.length)];    //pick a random character from the pool and add it
    }
    return code;                                                    //return the finished 6-char code
}

//sends the latest lobby player list and host to everyone waiting in that lobby
function broadcastLobby(io, lobby){             
    io.to(lobby.code).emit('lobby_updated', {   //send to everyone in this lobby's room
        players: lobby.players,                 //the full updated player list
        hostId: lobby.hostId                    //who the host currently is
    });
}

//builds the public version of the game state that is safe to send to any player
//private card values stay on the server and each player only receives their own hand separately
function buildPublicState(gameState) {
    return{
        players: gameState.players.map(p => ({  //build a safe version of each player with public info only
            id: p.id,                           //their socket id so the client knows who is who
            name: p.name,                       //their name
            cardCount: p.hand.length,           //how many cards they are holding, the number is public but the cards are not
            drunkness: p.drunkness,             //their current drunkness level
            isOut: p.isOut,                     //whether they've been eliminated
            connected: p.connected              //whether they're currently connected, this one matters as it triggers the disconnected icon in the UI
        })),
        pile: {count: gameState.pile.cards.length},                         //only the pile size is public, not the cards currently inside it
        pendingPlay: gameState.pendingPlay ? {                              //the declaration is public, while the real cards stay hidden until somebody challenges
            playerId: gameState.pendingPlay.playerId,                       //who played it
            declaredNumber: gameState.pendingPlay.declaredNumber,           //what number they claimed
            declaredCount: gameState.pendingPlay.declaredCount,             //how many cards they said they played
        }   : null,                                                         //no pending play, send null so the client knows to hide the pending zone
        roundDeclaredNumber: gameState.roundDeclaredNumber ?? null,         //the number the whole round is being played as, everyone needs to know it
        currentPlayerIndex: gameState.currentPlayerIndex,                   //whose turn it is
        turnStartedAt: gameState.turnStartedAt ?? null,                     //when the current turn started, used by clients to calculate the countdown timer
        phase: gameState.phase,                                             //what stage the game is in right now
        winner: gameState.winner,                                           //null until someone wins
        gameOverInfo: gameState.gameOverInfo ?? null                        //extra detail about how the game ended, used by the game over screen
    };
}

//one place for broadcasting game state keeps every client update consistent
function broadcastGameState(io, lobbyCode, gameState){
    io.to(lobbyCode).emit('game_state_updated', buildPublicState(gameState));
}

//moves forward through the player list until it finds somebody still in the game
function getNextPlayerIndex(gameState){
    const total = gameState.players.length;                 //total number of players including eliminated ones
    let next = (gameState.currentPlayerIndex + 1) % total;  //start by looking at the next seat, wrapping around to 0 if we reach the end

    //keep stepping forward until we find a player who is still in the game
    while (gameState.players[next].isOut){
        next = (next + 1) % total;          //move one more seat forward, wrapping around if needed
    }
    return next;        //return the index of the next active player
}

// #endregion








// #region GAME SETUP/REMATCH

// ========== GAME SETUP/REMATCH ==========

//creates a fresh game for the lobby and sends every player their own private hand
function beginGame(io, lobbyCode, lobby){

    //build the full starting game state, that being the shuffled deck, the dealt hands, a random starting player and so on
    //everything the server needs to run the game from this point is stored in this object
    const gameState = startGame(lobby.players);

    gameStates.set(lobbyCode, gameState);  //gameStates is the Map that holds all active game, gameState is the specific game state object for this lobby

    //timers are kept outside gameState because clients do not need to receive them, so we need to add them
    gameTimers.set(lobbyCode, {
        turnTimer : null, 
        cooldownTimer: null,
        resolutionTimer: null,
        drinkTimer: null
    });

    //every player should only ever see their own hand
    //so instead of one broadcast, we send to each player individually, which means nobody ever receives another player's cards
    gameState.players.forEach(player => {
        io.to(player.id).emit('game_started', {
            ...buildPublicState(gameState),         //everything that is safe to share with everyone
            hand: player.hand                       //their private cards, only sent to them
        });
    });

    //the first player's turn begins as soon as the game is created
    const timers = gameTimers.get(lobbyCode);

    timers.turnTimer = setTimeout(() => {
        handleTurnTimeout(io, lobbyCode, gameState, timers);
    }, turnDurationMs)

    return gameState;
}

//starts another game once every player still in the lobby has marked themselves ready
function tryStartRematch(io, lobbyCode, lobby){

    //a game still needs at least 2 players
    if (lobby.players.length < 2){
        return false;
    }

    //every player still in the lobby has to be ready, one person not ready is enough to hold it
    const everyoneReady = lobby.players.every(player => lobby.rematchReady.has(player.id));

    if (!everyoneReady){
        return false;
    }

    console.log(`Everyone ready in lobby ${lobbyCode} — starting rematch`);

    //the ready state belonged to the game that just finished, so it is cleared before the new one begins
    lobby.rematchReady.clear();

    //launch a completely fresh game with whoever is still in the lobby
    beginGame(io, lobbyCode, lobby);

    return true;
}
// #endregion











// #region TURN TIMEOUT

// ========== TURN TIMEOUT ==========


//runs when the current player's turn timer reaches the end without any play
function handleTurnTimeout(io, lobbyCode, gameState, timers){
    
    timers.turnTimer = null;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];  //the player who just timed out

    //if the previous player used their final cards and nobody challenged them in time, they win here
    if(gameState.pendingPlay && gameState.pendingPlay.isEmptyingHand){

        const prevPlayer = gameState.players.find(
            player => player.id === gameState.pendingPlay.playerId
        );

        if (prevPlayer && prevPlayer.hand.length === 0){
            gameState.winner = prevPlayer.id;
            gameState.gameOverInfo = {type: 'empty_hand'};

            gameState.phase = 'game_over';
            gameState.turnStartedAt = null;

            broadcastGameState(io, lobbyCode, gameState);

            console.log(
                `${prevPlayer.name} wins by empty hand, unchallenged`
            );

            return;
        }
    }

    console.log(`${currentPlayer.name} timed out and taking a penalty drink`);

    //lock normal input while the timeout message and drinking sequence are happening
    gameState.phase = 'resolving_timeout';
    gameState.turnStartedAt = null;

    //tell all clients to remove the running timer and lock input
    broadcastGameState(io, lobbyCode, gameState);

    //first notification: X didn't play in time
    io.to(lobbyCode).emit('timeout_drink', {
        playerId: currentPlayer.id,
        playerName: currentPlayer.name
    });

    //first let the timeout notification finish, then start the drinking animation
    timers.resolutionTimer = setTimeout(() => {

        timers.resolutionTimer = null;

        //now start the real drinking animation
        io.to(lobbyCode).emit('player_drinking', {
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
            drunkness: currentPlayer.drunkness + 1
        });

        //the drink is applied only after the animation finishes so the UI and server stay in sync
        timers.drinkTimer = setTimeout(() => {

            timers.drinkTimer = null;

            const {eliminated} = applyDrink(currentPlayer);

            if (eliminated){
                eliminatePlayer(io, lobbyCode, gameState, currentPlayer.id, 'drunkness');
            };

            //eliminatePlayer already broadcasts game_over if this was one of the final two players
            if(gameState.phase === 'game_over') return;

            //the timed-out player's opportunity to challenge the previous play is over so that pending play is now safe and becomes part of the pile
            if (gameState.pendingPlay){
                gameState.pile.cards.push(
                    ...gameState.pendingPlay.cards
                );

                gameState.pendingPlay = null;
            }
            

            gameState.currentPlayerIndex = getNextPlayerIndex(gameState);   //only NOW move to the next player

            //the round itself carries on as normal
            gameState.phase = 'waiting';
            gameState.turnStartedAt = Date.now();

            broadcastGameState(io, lobbyCode, gameState);

            timers.turnTimer = setTimeout(() => {
                handleTurnTimeout(io, lobbyCode, gameState, timers);
            }, turnDurationMs);

        }, drinkAnimationMs);

    }, timeoutOverlayMs);
}
// #endregion














// #region ELIMINATION/DRINKING

// ========== ELIMINATION/DRINKING ==========

//marks a player as out and checks whether that leaves only one player still standing
function eliminatePlayer(io, lobbyCode, gameState, playerId, reason){
    const player = gameState.players.find(p => p.id === playerId);          //find the player being eliminated
    if (!player || player.isOut) return;                                    //they are already out or do not exist, so there is nothing to do

    player.isOut = true;        //mark them as eliminated

    console.log(`${player.name} has been eliminated (reason: ${reason})`);

    //tell all players someone was knocked out and why
    io.to(lobbyCode).emit('player_eliminated', {
        playerId: player.id,        //who got eliminated
        playerName: player.name,    //their name for the notification
        reason                      //why it happened, for example 'drunkness'
    });

    //if only one player is left standing then the game is over
    const activePlayers = gameState.players.filter(p => !p.isOut);      //everyone still in the game

    if (activePlayers.length === 1){
        gameState.winner = activePlayers[0].id;         //the last standing player wins

        //the game over screen also shows who went out and why, so we pass that along with the winner
        gameState.gameOverInfo = {
            type: 'elimination',

            eliminatedPlayerId: player.id,

            eliminatedPlayerName: player.name,

            reason
        };

        gameState.phase = 'game_over';                  //lock the game, no more actions accepted

        broadcastGameState(io, lobbyCode, gameState);   //tell everyone the game is over and who won

        console.log(`Game over in lobby ${lobbyCode} — ${activePlayers[0].name} wins`);
    }
}

//gives the challenge loser a drink and rolls to see if they get eliminated
//called after every challenge, once the result screen the players are looking at has finished
function rollDrunkness(io, lobbyCode, gameState, timers, winner, loser){

    //wait until the whole challenge result window has been and gone before touching anything
    timers.resolutionTimer = setTimeout(()=> {

        timers.resolutionTimer = null;

        //now begin the ACTUAL drinking animation
        io.to(lobbyCode).emit('player_drinking', {
            playerId: loser.id,
            playerName: loser.name,
            drunkness: loser.drunkness + 1
        });

        //the consequences are only worked out once that animation has finished
        timers.drinkTimer = setTimeout(() => {

            timers.drinkTimer = null;

            const { eliminated } = applyDrink(loser);

            if(eliminated){
                eliminatePlayer(io, lobbyCode, gameState, loser.id, 'drunkness');   //knock them out and check whether that ends the game
            }

            //if that drink eliminated one of the last two players, game-over was just broadcast
            if(gameState.phase === 'game_over') return;     //if the game just ended from the elimination above, stop here

            //if the challenge winner has no cards left then they win immediately
            if(winner.hand.length === 0){
                gameState.winner = winner.id;                   //set them as the winner
                gameState.gameOverInfo = {type: 'empty_hand'};

                gameState.phase = 'game_over';                  //lock the game
                broadcastGameState(io, lobbyCode, gameState);   //tell everyone
                console.log(`${winner.name} wins by empty hand after challenge`);
                return;     //stop here, as no next turn needed
            }

            //otherwise the game carries on and the challenge winner gets the next turn
            gameState.currentPlayerIndex = gameState.players.findIndex( p => p.id === winner.id);
            gameState.phase = 'waiting';     //open the floor for the next declaration
            gameState.turnStartedAt = Date.now();
            broadcastGameState(io, lobbyCode, gameState);   //tell everyone it's the winner's turn

            //start the turn timer for the challenge winner
            timers.turnTimer = setTimeout(() => {
                handleTurnTimeout(io, lobbyCode, gameState, timers);    //penalise them if they do not play in time
            }, turnDurationMs);

        }, drinkAnimationMs);

    }, challengeOverlayMs);   //wait for the full result screen to finish before resuming
}
// #endregion








// #region CREATE LOBBY

// ========== CREATE LOBBY ==========

//every player on connection gets their own socket, aka socket.id. That ID is used to identify each player from others.
//there is no login in this game, so as far as the server is concerned a player is simply a socket id
io.on('connection', (socket) => {
    console.log('A player connected', socket.id);

    //player once connected can create a new lobby
    socket.on('createLobby', (data) => {
        const playerName =      //the name the player typed in
            typeof data?.name === 'string'
                ? data.name.trim()
                : '';
        
        if (!playerName){
            socket.emit('lobby_error', {
                message: 'Please enter your name'
            });

            return;
        }

        if (playerName.length > MAX_PLAYER_NAME_LENGTH){
            socket.emit('lobby_error', {
                message: `Your name cannot be longer than ${MAX_PLAYER_NAME_LENGTH} characters`
            });

            return;
        }

        if (socketLobbies.has(socket.id)){
            socket.emit('lobby_error', {
                message: 'You are already in a lobby'
            });

            return;
        }

        //keep generating codes until we get one that is not already taken
        //the chances of a clash are astronomically small, but its always better to check especially if it costs nothing
        let code = generateLobbyCode();

        while(lobbies.has(code)){
        code = generateLobbyCode();     //keep trying until we get a unique code
        }

        //the lobby creator is automatically the first player and the host
        //they're added to the lobby here so they don't have to join separately after creating it
        const lobby = {
            code: code,         //the 6-char code others use to join
            hostId: socket.id,  //the host is whoever created the lobby
            players: [
                {id: socket.id, name: playerName}   //creator is added as the first player automatically
            ],
            gameStarted: false,  //flips to true when the host starts the game, blocks new joins after that

            //everyone who has pressed ready for a rematch after the game is over
            rematchReady: new Set()
        };

        lobbies.set(code, lobby);   //store the new lobby so other players can find it by code
        socket.join(code);          //put this socket in the socket.io room for this lobby so we can broadcast to everyone in it later

        socketLobbies.set(socket.id, lobby.code);   //remember which lobby this socket belongs to so we can find it instantly later

        //here we just inform the creator of the lobby, that the lobby was in fact created correctly
        socket.emit('lobby_created', {
            code: lobby.code,           //the code they'll share with friends
            players: lobby.players,     //just them for now
            hostId: lobby.hostId,       //confirms they are the host
        });

        //currently mostly used for debugging purposes, to see if lobbies get created correctly
        console.log(`Lobby ${code} created by ${playerName}`);
    });
    // #endregion








    // #region JOIN LOBBY

    // ========== JOIN LOBBY ==========

    //handles everything that happens when a player tries to join an existing lobby
    socket.on('joinLobby', (data) => {

        //trim and uppercase the input so stray spaces or wrong capitalisation don't cause a failed join
        const playerName =
            typeof data?.name === 'string'
                ? data.name.trim()
                : '';

        const code =
            typeof data?.code === 'string'
                ? data.code.trim().toUpperCase()
                : '';

        //a player can only ever be in one lobby at a time
        if(socketLobbies.has(socket.id)){
            socket.emit('lobby_error', {
                message: 'You are already in a lobby'
            });
            return;
        }

        //reject straight away if either field is empty, there is no point looking anything up without both of them
        if (!playerName || !code) {
            socket.emit('lobby_error', {
                message: 'Please enter your name and a lobby code:'});
            return;
        }

        if (playerName.length > MAX_PLAYER_NAME_LENGTH){
            socket.emit('lobby_error', {
                message: `Your name cannot be longer than ${MAX_PLAYER_NAME_LENGTH} characters`
            });

            return;
        }

        const lobby = lobbies.get(code);    //try to find a lobby with that code

        //if the lobby does not exist we say so.
        if (!lobby){
            socket.emit('lobby_error', {
                message: 'Lobby not found'});
            return;
        }

        //the lobby was found, but joining mid game should not be allowed, so we block it here with an error message
        if (lobby.gameStarted){
            socket.emit('lobby_error', {
                message: 'The game has already started'});
            return;
        }

        //make sure no more than 6 players can join the lobby at the same time
        if (lobby.players.length >= MAX_PLAYERS){
            socket.emit('lobby_error', {
                message: 'This lobby is full'
            });
            return;
        }

        //an important guard against double joins, in case the client retries and sends the same socket id twice
        //as it could corrupt the player list
        const alreadyJoined = lobby.players.some((player) => player.id === socket.id);

        if (!alreadyJoined){        //they are not in the lobby yet, so let them in

            lobby.players.push({id: socket.id, name: playerName});      //add them to the lobby's player list

            socket.join(code);                                          //put their socket in the lobby's room
            
            socketLobbies.set(socket.id, code);                         //record which lobby this socket joined
                
            //tell the joining player the full lobby state so they can see who's already there
            socket.emit('lobby_joined', {
                code: lobby.code,           //confirms which lobby they joined
                players: lobby.players,     //the full player list including themselves
                hostId: lobby.hostId,       //so they know who the host is
        });

            broadcastLobby(io, lobby);      //tell everyone else in the lobby that a new player joined
            console.log(`${playerName} joined the lobby ${code}`);
        } else {
            socket.emit('lobby_error', {message: 'You are already in this lobby'});
        }
    });
    // #endregion













    // #region START GAME

    // ========== START GAME ==========

    //now we need to define what happens when the "start" button in the lobby is pressed
    socket.on('startGame', () => {

        //find the lobby this socket belongs to, as only the host is allowed to start we then match against hostId
        const lobbyCode = socketLobbies.get(socket.id);
        if (!lobbyCode) return;

        const lobby = lobbies.get(lobbyCode);
        if (!lobby) return;

        if (lobby.hostId !== socket.id) return;

        //now we check if there are at least 2 players to start the game
        //thats to avoid allowing the host to start the game on its own
        if(lobby.players.length < 2) {
            socket.emit('game_error', {message: 'You need at least 2 players to start the game'});
            return;
        }
         
        //to avoid any issues disable a second startGame if someone decides to spam the button
        if(lobby.gameStarted){
            socket.emit('game_error', {message: 'The game has already started'});
            return
        }
        
        //once the the started, change the lobby status
        lobby.gameStarted = true;

        beginGame(io, lobbyCode, lobby);
    });
    // #endregion









    // #region REMATCH READY

    // ========== REMATCH READY ==========

    //players use this after game over to say whether they're ready for another game
    socket.on('toggleRematchReady', () => {

        const lobbyCode = socketLobbies.get(socket.id);
        if(!lobbyCode) return;

        const lobby = lobbies.get(lobbyCode);
        const gameState = gameStates.get(lobbyCode);

        if(!lobby || !gameState) return;

        //we can only rematch once the ongoing game is over
        if (gameState.phase !== 'game_over'){
            socket.emit('game_error', {
                message: 'You cannot request a rematch right now'
            });
            return;
        }

        //a safety check so that only players who are actually in the lobby can get ready
        const playerExists = lobby.players.some(
            player => player.id === socket.id
        );

        if (!playerExists) return;

        //press once to get ready and again to unready
        if (lobby.rematchReady.has(socket.id)){
            lobby.rematchReady.delete(socket.id);
        } else {
            lobby.rematchReady.add(socket.id);
        }

        //tell everybody who's currently ready which shows up as a tick on the game screen
        io.to(lobbyCode).emit('rematch_status', {

            readyPlayerIds: [...lobby.rematchReady],    //the ids of everyone who has pressed ready
            readyCount: lobby.rematchReady.size,        //how many that is in total
            playerCount:lobby.players.length            //how many players we are waiting on

        });

        //that press may well have been the last one we needed, so we check whether the rematch can start
        tryStartRematch(io, lobbyCode, lobby);
    });
    // #endregion











    // #region LEAVE FINISHED GAME

    // ========== LEAVE FINISHED GAME ==========

    //a player choosing to leave the finished game and go back to the main menu
    socket.on('leaveGame', (acknowledge) => {

        //the client can pass a callback so it knows the server dealt with it, but it does not have to
        const respond = typeof acknowledge === 'function' ? acknowledge : null;

        const lobbyCode = socketLobbies.get(socket.id);
        if(!lobbyCode)return;

        const lobby = lobbies.get(lobbyCode);
        if(!lobby) return;

        const gameState = gameStates.get(lobbyCode);

        //Main Menu is currently only available after the game has ended
        if (gameState && gameState.phase !== 'game_over'){
            return;
        }

        const playerIndex = lobby.players.findIndex(
            player => player.id === socket.id
        );

        if (playerIndex === -1) return;

        //take this player out of the lobby, so they are not counted for any rematch
        lobby.players.splice(playerIndex, 1);

        //they're no longer ready for a rematch either
        lobby.rematchReady.delete(socket.id);

        //remove their socket
        socketLobbies.delete(socket.id);

        //stop receiving broadcasts from this lobby
        socket.leave(lobbyCode);

        //if nobody remains, destroy the lobby completely
        if (lobby.players.length === 0){

            //cancel any running timers first, otherwise they would keep firing against a game nobody is playing
            const timers = gameTimers.get(lobbyCode);

            if(timers){

                if (timers.turnTimer){
                    clearTimeout(timers.turnTimer);
                }

                if (timers.cooldownTimer){
                    clearTimeout(timers.cooldownTimer);
                }

                if (timers.resolutionTimer){
                    clearTimeout(timers.resolutionTimer);
                }

                if (timers.drinkTimer){
                    clearTimeout(timers.drinkTimer);
                }

                gameTimers.delete(lobbyCode);
            }

            gameStates.delete(lobbyCode);
            lobbies.delete(lobbyCode);

            console.log(`Lobby ${lobbyCode} deleted after the final player left`);

            //confirm the leave before returning, otherwise the final player will wait for an acknowledgement that will never arrive
            respond?.({ok: true});
            return;
        }

        //if the host is the one who left, hand host duties to whoever is first in the list
        if (lobby.hostId === socket.id){
            lobby.hostId = lobby.players[0].id;
        }

        //update everyone who stayed behind, the ready count has changed now that somebody has gone
        io.to(lobbyCode).emit('rematch_status', {

            readyPlayerIds: [...lobby.rematchReady],
            readyCount: lobby.rematchReady.size,
            playerCount: lobby.players.length

        });

        //somebody leaving can be the thing that completes the ready set, so we check for a rematch here as well
        tryStartRematch(io, lobbyCode, lobby);

        respond?.({ok: true});

        console.log(`${socket.id} left finished lobby ${lobbyCode}`
        );
    })
    // #endregion















    // #region DECLARE CARDS

    // ========== DECLARE CARDS ==========

    //handles a player selecting their cards and confirming a declaration
    //this is the main action of each turn, picking cards, naming a number, and committing to it
    socket.on('declareCards', (data, acknowledge) => {

        //the client passes a callback so it can be told whether the play was accepted or not
        const respond = typeof acknowledge === 'function' ? acknowledge : null;
        
        //declarations normally use an acknowledgement so the client knows whether its local play animation can finish
        function rejectDeclaration(message){
            if (respond){
                respond({
                    ok: false,
                    message
                });
            } else {
                socket.emit('game_error', {
                    message
                });
            }
        }

        const lobbyCode = socketLobbies.get(socket.id);     //look up which lobby this socket belongs to instantly
        if (!lobbyCode) return;                             //if not in any, then ignore 

        const lobby = lobbies.get(lobbyCode);               //get the lobby object
        const gameState = gameStates.get(lobbyCode);        //get the live game state for this lobby
        const timers = gameTimers.get(lobbyCode);           //get the timers for this lobby

        if(!lobby||!gameState||!timers) return;             //safety check, if any of these are missing the game isn't running yet

        //only accept declarations during 'waiting' (first turn) or 'challenge_open' (every turn after)
        //any other phase means something else is happening and we shouldn't accept new plays
        if (gameState.phase !== 'waiting' && gameState.phase !== 'challenge_open'){
            rejectDeclaration('You cannot declare cards right now');
            return;
        }

        const currentPlayer = gameState.players[gameState.currentPlayerIndex];

        //eliminated players are spectators from that point on
        if (currentPlayer.isOut){
            rejectDeclaration('You have been eliminated and cannot play cards');
            return;
        }
        
        //only the player whose turn it is can declare anything
        if (currentPlayer.id !== socket.id){
            rejectDeclaration('It is not your turn');
            return;
        }

        //check the incoming structure before trying to use any values inside it
        if(!data || typeof data !== 'object'){
            rejectDeclaration('Invalid decleration data');
            return;
        }

        const {declaredNumber, cardIds} = data;     //pull the declared number and the list of selected card ids out of the event

        //cardIds must be an array before using Set, .length or .map
        if(!Array.isArray(cardIds)){
            rejectDeclaration('Invalid card selection');
            return;
        }

        //it also has to contain at least one card
        if(cardIds.length === 0){
            rejectDeclaration('You must declare at least one card');
            return;
        }

        //every id should be a string, since that is what our cards use
        if(!cardIds.every(id => typeof id === 'string')){
            rejectDeclaration('Invalid card ID');
            return;
        }

        //duplicate IDs could otherwise make one real card count as more than one selected card
        const uniqueIds = [...new Set(cardIds)];

        if (uniqueIds.length !== cardIds.length) {
            rejectDeclaration('Duplicate cards selected');
            return;
        }

        //the declared number has to be a whole number between 1 and 10, as those are the only values in the game
        if (!Number.isInteger(declaredNumber) || declaredNumber < 1 || declaredNumber > 10){
            rejectDeclaration('Declared number must be between 1 and 10');
            return;
        }

        //once a round has a number, everybody has to keep declaring that same number until the round ends
        if (gameState.roundDeclaredNumber !== null && declaredNumber !== gameState.roundDeclaredNumber){
            rejectDeclaration(`This round is being played as ${gameState.roundDeclaredNumber}s`);
            return;
        }

        //there is a limit on how many cards can go down in one play
        if (uniqueIds.length > MAX_CARDS_PER_PLAY){
            rejectDeclaration(`You can only play a maximum of ${MAX_CARDS_PER_PLAY} cards`);
            return;
        }

        //never trust card IDs from the client without checking that this player actually owns them
        const declaredCards = uniqueIds.map(id => currentPlayer.hand.find(c => c.id === id)); 

        if (declaredCards.some(c => c === undefined)){
            rejectDeclaration('One or more selected cards are not in your hand');
            return;
        }

        //a previous pending play becomes safe as soon as the next player successfully confirms their own play
        if (gameState.pendingPlay){

            //if that previous play used the player's last cards, this is also the point where an unchallenged win becomes official
            if(gameState.pendingPlay.isEmptyingHand){
                const prevPlayer = gameState.players.find(
                    p => p.id === gameState.pendingPlay.playerId    //find the player who put down their last card
                );

                //double check their hand really is empty, a successful challenge would have
                //handed the pile back to them, so this guard catches that case and does not award the win
                if (prevPlayer && prevPlayer.hand.length === 0){

                    //the game is ending here, so the current turn timer is no longer needed
                    if (timers.turnTimer){
                        clearTimeout(timers.turnTimer);
                        timers.turnTimer = null;
                    }

                    gameState.winner = prevPlayer.id;               //they win
                    gameState.gameOverInfo = {type: 'empty_hand'};

                    gameState.phase = 'game_over';                  //lock the game
                    gameState.turnStartedAt = null;

                    broadcastGameState(io, lobbyCode, gameState);   //tell everyone who won

                    //the declaration was valid and successfully triggered the win check
                    respond?.({ok: true});

                    console.log(`${prevPlayer.name} wins by empty hand, unchallenged`);

                    return;     //stop here, don't process the new declaration
                }
            }
            gameState.pile.cards.push(...gameState.pendingPlay.cards)   //no empty hand win, merge the previous play into the pile as normal
        }

        //the first valid declaration decides which number is used for the rest of this round
        if (gameState.roundDeclaredNumber === null){
            gameState.roundDeclaredNumber = declaredNumber;
        }

        //committed cards leave the player's hand immediately and become the new pending play
        currentPlayer.hand = currentPlayer.hand.filter(c => !uniqueIds.includes(c.id));

        //confirm the play to the declaring player with their updated hand
        //this is the signal the client uses to remove the played cards
        io.to(socket.id).emit('hand_updated', {hand: currentPlayer.hand});

        //create the new pending play. This sits in the pending zone visible to all players
        //actual cards are stored here server-side but never sent to other players unless a challenge happens
        gameState.pendingPlay = {
            playerId: socket.id,                    //who made this play
            cards: declaredCards,                   //the real cards, ones that are hidden from other players
            declaredNumber,                         //the number they claimed
            declaredCount: declaredCards.length,    //how many cards they said they played, this is what others see
            isEmptyingHand: currentPlayer.hand.length === 0  //true if this play used their last card, checked on the next turn to trigger an empty hand win
        };

        gameState.phase = 'cooldown';               //nobody can challenge yet, the cooldown just started

        //cancel the turn timer, they played in time so there is no penalty coming
        if (timers.turnTimer){
            clearTimeout(timers.turnTimer);
            timers.turnTimer = null;
        }

        broadcastGameState(io, lobbyCode, gameState);   //tell everyone about the new pending play

        respond?.({ok: true});

        //once the cooldown is over, open the challenge window and start the next player's turn
        timers.cooldownTimer = setTimeout(() => {
            timers.cooldownTimer = null;
            gameState.phase = 'challenge_open';                     //the game is now inside a phase where a challenge is allowed

            const nextPlayerIndex = getNextPlayerIndex(gameState);  //work out who goes next, skipping eliminated players
            gameState.currentPlayerIndex = nextPlayerIndex;         //set them as the current player
            gameState.turnStartedAt = Date.now();

            broadcastGameState(io, lobbyCode, gameState);           //tell everyone the window is open and whose turn it is

            //start the turn timer for the next player
            timers.turnTimer = setTimeout(() => {
                handleTurnTimeout(io, lobbyCode, gameState, timers);    //penalise them if they do not play in time
           }, turnDurationMs);

        }, cooldownMs);
    });
    // #endregion


















    // #region CHALLENGE

    // ========== CHALLENGE ==========

    //resolves the current pending play, reveals the real cards and decides who takes the pile
    socket.on('challenge', (data) => {

        const lobbyCode = socketLobbies.get(socket.id);     //look up which lobby this socket belongs to instantly
        if (!lobbyCode) return;                             //if not in any, then ignore 

        const lobby = lobbies.get(lobbyCode);               //get the lobby object
        const gameState = gameStates.get(lobbyCode);        //get the live game state for this lobby
        const timers = gameTimers.get(lobbyCode);           //get the timers for this lobby

        if(!lobby||!gameState||!timers) return;             //safety check, if any of these are missing the game isn't running yet

        //challenges only work when the window is open, and reject anything that arrives outside of that
        if(gameState.phase !== 'challenge_open'){
            socket.emit('game_error', {message: 'You cannot challenge right now'});
            return;
        }

        //there is nothing to challenge if no play is waiting
        if (!gameState.pendingPlay){
            return;
        }

        //make sure the request is still referring to the same pending play the player clicked Challenge on
        //otherwise a delayed request could accidentally challenge the next player's play instead
        if(!data || data.pendingPlayerId !== gameState.pendingPlay.playerId){
            socket.emit('game_error', {
                message: 'That play is no longer available to challenge'
            });

            return;
        }

        //find the player trying to challenge
        const challenger = gameState.players.find(
            player => player.id === socket.id
        );

        //eliminated players are spectators from this point on
        if (!challenger || challenger.isOut){
            socket.emit('game_error', {
                message: 'You have been eliminated and cannot challenge'
            });

            return;
        }

        //a player can't challenge their own play
        if (gameState.pendingPlay.playerId === socket.id){
            socket.emit('game_error', {message: 'You cannot challenge your own play'});

            return;
        }

        //lock the game immediately, the first challenge to arrive wins the race and everything after it is ignored
        gameState.phase = 'resolving_challenge';

        //cancel both timers, the game is paused while the challenge is resolved
        if(timers.cooldownTimer){
            clearTimeout(timers.cooldownTimer);
            timers.cooldownTimer = null;
        }

        if(timers.turnTimer){
            clearTimeout(timers.turnTimer);
            timers.turnTimer = null;
        }

        //tell every client that input is now locked
        gameState.turnStartedAt = null;
        broadcastGameState(io, lobbyCode, gameState);

        //save the pending play details before we clear it, we need these for the result screen
        const pendingPlay = gameState.pendingPlay;
        const pendingCards = pendingPlay.cards;             //the actual cards that were played
        const declaredNumber = pendingPlay.declaredNumber;  //what number they claimed

        const accused = gameState.players.find(p => p.id === pendingPlay.playerId);     //the player being challenged

        //check if the play was honest, every card must match the declared number or be a wild
        const honest = isPlayHonest(pendingCards, declaredNumber);

        //an honest play means the challenger was wrong and loses, a bluff means the accused has been caught and loses
        const loser = honest ? challenger : accused;
        const winner = honest ? accused : challenger;

        //the loser takes everything, so the pile and the pending play are combined and handed to them
        const allPileCards = [...gameState.pile.cards, ...pendingCards];
        loser.hand = [...loser.hand, ...allPileCards];
        io.to(loser.id).emit('hand_updated', { hand: loser.hand });     //send the loser their updated hand privately since they just took the pile

        gameState.pile.cards= [];                //pile is now empty, as it all went to the loser
        gameState.pendingPlay = null;            //pending play is resolved, so clear it
        gameState.roundDeclaredNumber = null;    //round is over, next play starts a fresh declaration

        //show the result to everyone, this is what reveals the actual cards and locks input on the client while it is up
        io.to(lobbyCode).emit('challenge_result', {
            challengerId: challenger.id,        //the challenger ID
            challengerName: challenger.name,    //their name
            accusedId: accused.id,              //the ID of the one that got challenged
            accusedName: accused.name,          //their name
            honest,                             //true means the play was honest, false means it was a bluff and got caught
            actualCards: pendingCards,          //the real cards, now revealed to everyone
            declaredNumber,                     //what the accused claimed they were playing
            loserId: loser.id,                  //who lost the challenge
            loserName: loser.name               //their name
        });

        //hand over to the drinking sequence, which waits for the result screen before doing anything
        rollDrunkness(io, lobbyCode, gameState, timers, winner, loser);
    });
    // #endregion













    // #region DISCONNECT

    // ========== DISCONNECT ==========

    //reconnection is not implemented yet, so an active-game disconnect keeps the player's seat but marks them as offline
    socket.on ('disconnect', () => {

        //look up which lobby this socket was in before doing anything else
        //if they weren't in any lobby there's nothing to clean up
        const lobbyCode = socketLobbies.get(socket.id);
        if (!lobbyCode) return;

        //remove the lookup entry now that we have the code we need
        socketLobbies.delete(socket.id);

        const roomLobby = lobbies.get(lobbyCode);
        if (!roomLobby) return;     //lobby was already deleted somehow, nothing to do

        //check if this player is actually in the lobby's player list
        const playerIndex = roomLobby.players.findIndex(player => player.id === socket.id);
        if (playerIndex === -1) return;     //they weren't in the list, nothing to clean up

        const gameState = roomLobby.gameStarted
            ? gameStates.get(lobbyCode)
            : null;

        //during a running game their seat stays in gameState so the current game can finish normally
        if (gameState){
            const player = gameState.players.find(p => p.id === socket.id);

            if (player){
                player.connected = false;

                console.log(
                    `${player.name} disconnected from active game in lobby ${lobbyCode}`
                );

                //tell everyone so the disconnected icon appears straight away
                broadcastGameState(io, lobbyCode, gameState);
            }
        }

        //there is no reconnection yet, so they should not count towards a future rematch
        roomLobby.players.splice(playerIndex, 1);
        roomLobby.rematchReady.delete(socket.id);

        //if nobody connected remains, there is no reason to keep the lobby or game alive
        if (roomLobby.players.length === 0){

            const timers = gameTimers.get(lobbyCode);

            if(timers){

                if (timers.turnTimer){
                    clearTimeout(timers.turnTimer);
                }

                if (timers.cooldownTimer){
                    clearTimeout(timers.cooldownTimer);
                }

                if (timers.resolutionTimer){
                    clearTimeout(timers.resolutionTimer);
                }

                if (timers.drinkTimer){
                    clearTimeout(timers.drinkTimer);
                }

                gameTimers.delete(lobbyCode);
            }

            lobbies.delete(lobbyCode);
            gameStates.delete(lobbyCode);

            console.log(
                `Lobby ${lobbyCode} deleted after the final player disconnected`
            );

            return;
        }

        //if the host left, hand host duties to whoever is next in the list
        //without this nobody would have the power to start the game
        if (roomLobby.hostId === socket.id){
            roomLobby.hostId = roomLobby.players[0].id;     //first remaining player becomes the new host
        }

        if(roomLobby.gameStarted){

            io.to(lobbyCode).emit('rematch_status', {
                readyPlayerIds: [...roomLobby.rematchReady],
                readyCount: roomLobby.rematchReady.size,
                playerCount: roomLobby.players.length
            });

            if (gameState?.phase === 'game_over'){
                tryStartRematch(io, lobbyCode, roomLobby);
            }

            return;
        }

        //before the game starts, update everybody still waiting
        broadcastLobby(io, roomLobby);
    });
});
// #endregion