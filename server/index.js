const express = require('express');             //needed to connect to a web server
const http = require('http');                   //node's built-in http module, needed to create the raw server socket.io attaches to
const {Server} = require('socket.io');          //the websocket library that handles all real-time communication
const crypto = require('crypto');               // built-in node module, used to generate secure random tokens
const { startGame } = require('./game/state');  //function that builds the full starting game state when a game begins. It requires the state.js file to work
const {isPlayHonest} = require('./game/deck');  //function that checks if a declared play was honest or a bluff. It requires the deck.js file to work
const app = express();                          //creates the express app
const server = http.createServer(app);          //wraps express in a raw http server so socket.io can attach to it
const io = new Server(server);                  //creates the socket.io server on top of the http server

//a basic test block page so we can confirm the server is running when we open it in a browser
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

//we also need to define variables for live game states and timers
const gameStates = new Map();       //tracks the live game states of each active game keyed by lobby code **NOT TO CONFUSE WITH gameState**
const gameTimers = new Map();       //tracks the server-side timers of each game separately, since timers aren't game state we keep them out of the object that gets sent to clients
const socketLobbies = new Map();    //maps each socket id to its lobby code so we can look up a player's lobby instantly without scanning all lobbies every time
const playerTokens = new Map();     // maps each token to the player it belongs to, the format: token -> { lobbyCode, playerId }

//A function to generate a 6-chars lobby code
//0, O and 1 are excluded from the pool of characters for ease of use on smaller screens
function generateLobbyCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';               //character pool with easy-to-misread characters removed
    let code = '';                                                  //start with an empty string and build it up
    for (let i = 0; i < 6; i++){                                    //repeat 6 times, once per character
        code += chars[Math.floor(Math.random() * chars.length)];    //pick a random character from the pool and add it
    }
    return code;    //return the finished 6-char code
}

//sends the list of all the players to everyone in the lobby, and gets called when the lobby state changes.
//keeps the data emited to all players in lobbies consistent, and the client needs only one handler to stay in sync
function broadcastLobby(io, lobby){             
    io.to(lobby.code).emit('lobby_updated', {   //send to everyone in this lobby's room
        players: lobby.players,                 //the full updated player list
        hostId: lobby.hostId                    //who the host currently is
    });
}

//sends the current game state to everyone in the lobby
//we strip out private info here so nobody ever receives another player's actual cards, since that's kinda the point of the game
function broadcastGameState(io, lobbyCode, gameState){
    const publicState = {
        players: gameState.players.map(p => ({  //build a safe version of each player with public info only
            id: p.id,                           //their socket id so the client knows who is who
            name: p.name,                       //their name
            cardCount: p.hand.length,           //the number of cards they have (visable to all)
            drunkness: p.drunkness,             //their current drunkness level
            isOut: p.isOut,                     //whether they've been eliminated
            connected: p.connected              //whether they're currently connected, this one matters as it triggers the disconnected icon in the UI
        })),
        pile: {count: gameState.pile.cards.length},                         //just the pile size, not the actual cards in it
        pendingPlay: gameState.pendingPlay ? {                              //if there is a pending play, send the public version of it
            playerId: gameState.pendingPlay.playerId,                       //who played it
            declaredNumber: gameState.pendingPlay.declaredNumber,           //what number they claimed
            declaredCount: gameState.pendingPlay.declaredCount,             //how many cards they said they played
            challengeWindowOpen: gameState.pendingPlay.challengeWindowOpen  //whether the challenge button is active yet
        } : null,                                                           //no pending play, send null so the client knows to hide the pending zone
        currentPlayerIndex: gameState.currentPlayerIndex,                   //whose turn it is
        phase: gameState.phase,                                             //what stage the game is in right now
        winner: gameState.winner                                            //null until someone wins
    };

    io.to(lobbyCode).emit('game_state_updated', publicState);               //send the safe public version to everyone in the lobby
}

//works out whose turn comes next by stepping forward from the current player
//skips anyone who has been eliminated so they never get a turn after they're out
function getNextPlayerIndex(gameState){
    const total = gameState.players.length;                 //total number of players including eliminated ones
    let next = (gameState.currentPlayerIndex + 1) % total;  //start by looking at the next seat, wrapping around to 0 if we reach the end

    //keep stepping forward until we find a player who is still in the game
    while (gameState.players[next].isOut){
        next = (next + 1) % total;          //move one more seat forward, wrapping around if needed
    }
    return next;        //return the index of the next active player
}

function generatePlayerToken(socketID, lobbyCode) {
    const token = crypto.randomBytes(32).toString('hex');       //32 random bytes turned into a 64-char hex string making it effectively impossible to guess
    playerTokens.set(token, {playerId: socketID, lobbyCode});   //store which player and lobby this token belongs to so we can look it up on reconnect
    return token;   //return it so we can send it privately to the player
}

//called when a player's 20 second turn timer runs out without them playing
//adds a skip to their count and eliminates them if they hit 3 in a row
function handleTurnTimeout(io, lobbyCode, gameState, timers){
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];  //the player who just timed out

    // if the previous play was someone emptying their hand and nobody challenged before the timer ran out, they win now
    if(gameState.pendingPlay && gameState.pendingPlay.isEmptyingHand){
        const prevPlayer = gameState.players.find(p => p.id === gameState.pendingPlay.playerId);
        if(prevPlayer && prevPlayer.hand.length === 0){
            gameState.winner = prevPlayer.id;
            gameState.phase = 'game_over';
            broadcastGameState(io, lobbyCode, gameState);
            console.log(`${prevPlayer.name} wins by empty hand, timer expired`);
            return;
        }
    }

    currentPlayer.consecutive_skips += 1;   //add one to their skip streak

    console.log(`${currentPlayer.name} timed out. Consecutive skips: ${currentPlayer.consecutive_skips}`);

    //3 skips in a row means they're out, same elimination path as losing a drunkness roll
    if (currentPlayer.consecutive_skips >= 3){
         eliminatePlayer(io, lobbyCode, gameState, currentPlayer.id, 'skips');      //eliminate them and check if the game is over
         return;    //stop here, eliminatePlayer handles everything from this point
    }

    //not eliminated yet, just move on to the next player
    gameState.currentPlayerIndex = getNextPlayerIndex(gameState);   //advance to the next active player
    broadcastGameState(io, lobbyCode, gameState);                   //tell everyone whose turn it is now

    //start a fresh 20 second timer for the next player
    timers.turnTimer = setTimeout(() => {
        handleTurnTimeout(io, lobbyCode, gameState, timers);    //if they also time out, this function runs again for them
    }, 20000);
}

//marks a player as eliminated, tells everyone about it, and checks if only one player is left
//called from two places: skip streak (3 missed turns) and drunkness roll (losing a challenge)
function eliminatePlayer(io, lobbyCode, gameState, playerId, reason){
    const player = gameState.players.find(p => p.id === playerId);          //find the player being eliminated
    if (!player || player.isOut) return;                                    //if they already out or doesn't exist, then nothing to do

    player.isOut = true;        //mark them as eliminated

    console.log(`${player.name} has been eliminated (reason: ${reason})`);

    //tell all players someone was knocked out and why
    io.to(lobbyCode).emit('player_eliminated', {
        playerId: player.id,        //who got eliminated
        playerName: player.name,    //their name for the notification
        reason                      //reasons why for example 'skips' or 'drunkness'
    });

    //check if only one player is left standing — if so the game is over
    const activePlayers = gameState.players.filter(p => !p.isOut);      //everyone still in the game
    if (activePlayers.length === 1){
        gameState.winner = activePlayers[0].id;         //the last standing player wins
        gameState.phase = 'game_over';                  //lock the game, no more actions accepted
        broadcastGameState(io, lobbyCode, gameState);   //tell everyone the game is over and who won
        console.log(`Game over in lobby ${lobbyCode} — ${activePlayers[0].name} wins`);
    }
}

//gives the challenge loser a drink and rolls to see if they get eliminated
//called after every challenge resolves, once the 7 second result screen is done
function rollDrunkness(io, lobbyCode, gameState, timers, winner, loser){

    loser.drunkness = Math.min(loser.drunkness +1, 4);  //add one drink, but never go above 4

    //elimination chance goes up with each drink, the 4th drink is always fatal
    const eliminationChance = {
        1: 0.25,    //25% chance on the first drink
        2: 0.50,    //50% on the second
        3: 0.75,    //75% on the third
        4: 1.00     //and finally 100% on the fourth which is a guaranteed out
    };

    const roll = Math.random();                         //random number between 0 and 1
    const chance = eliminationChance[loser.drunkness];  //look up their current elimination chance
    const eliminated = roll < chance;                   //true if the roll falls within the elimination chance

    //wait 7 seconds for the challenge result screen to finish before resuming the game
    setTimeout(() => {

        if(eliminated){
            eliminatePlayer(io, lobbyCode, gameState, loser.id, 'drunkness');   //knock them out and check for last standing win
        }

        if(gameState.phase === 'game_over') return;     //if the game just ended from the elimination above, stop here

        //check if the challenge winner emptied their hand, if so they win immediately
        if(winner.hand.length === 0){
            gameState.winner = winner.id;                   //set them as the winner
            gameState.phase = 'game_over';                  //lock the game
            broadcastGameState(io, lobbyCode, gameState);   //tell everyone
            console.log(`${winner.name} wins by empty hand after challenge`);
            return;     //stop here, as no next turn needed
        }

        //the challenge winner always starts the next turn, jump directly to their index
        gameState.currentPlayerIndex = gameState.players.findIndex( p => p.id === winner.id);
        gameState.phase = 'waiting';     //open the floor for the next declaration

        broadcastGameState(io, lobbyCode, gameState);   //tell everyone it's the winner's turn

        //start the 20 second turn timer for the challenge winner
        timers.turnTimer = setTimeout(() => {
            handleTurnTimeout(io, lobbyCode, gameState, timers);    //skip them if they don't play in time
        }, 20000);

    }, 7000);   //7 seconds matches the result screen duration shown to all players
}

//every player on connection gets their own socket, aka socket.id. That ID is used to identify each player from others.
//since there is no login, a player in this case just refers to every socketID
io.on('connection', (socket) => {
    console.log('A player connected', socket.id);

    //player once connected can create a new lobby
    socket.on('createLobby', (data) => {
        const playerName = data.name;   //the name the player typed in

        //generate codes until we get one that isn't taken and check for collision even with tiny chances of it happening.
        //the chances for that happening are astronomically small, but its always better to check especially if it costs nothing
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
            gameStarted: false  //flips to true when the host starts the game, blocks new joins after that
        };

        lobbies.set(code, lobby);   //store the new lobby so other players can find it by code
        socket.join(code);          //put this socket in the socket.io room for this lobby so we can broadcast to everyone in it later

        socketLobbies.set(socket.id, lobby.code);   //remember which lobby this socket belongs to so we can find it instantly later

        //here we just inform the creator of the lobby, that the lobby was in fact created correctly
        socket.emit('lobby_created', {
            code: lobby.code,           //the code they'll share with friends
            players: lobby.players,     //just them for now
            hostId: lobby.hostId,       //confirms they are the host
            token: generatePlayerToken(socket.id, lobby.code)       // their private reconnect token, it is only ever sent to them, never broadcast
        });

        //currently mostly used for debugging purposes, to see if lobbies get created correctly
        console.log(`Lobby ${code} created by ${playerName}`);
    });

    //handles everything that happens when a player tries to join an existing lobby
    socket.on('joinLobby', (data) => {
        //trim and uppercase the input so stray spaces or wrong capitalisation don't cause a failed join
        const playerName = data.name.trim();
        const code =  data.code.toUpperCase().trim();

        //reject immediately if either field is empty, no point looking anything up without both
        if (!playerName || !code) {
            socket.emit('lobby_error', {message: 'Please enter your name and a lobby code: '});
            return;
        }

        const lobby = lobbies.get(code);    //try to find a lobby with that code

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
        //as it could corrupt the player list
        const alreadyJoined = lobby.players.some((player) => player.id === socket.id);

        if (!alreadyJoined){ //if the player isnt in the room, then let them join
            lobby.players.push({id: socket.id, name: playerName});      //add them to the lobby's player list
            socket.join(code);                                          //put their socket in the lobby's room
            socketLobbies.set(socket.id, code);                         //record which lobby this socket joined

            //tell the joining player the full lobby state so they can see who's already there
            socket.emit('lobby_joined', {
                code: lobby.code,           //confirm which lobby they joined
                players: lobby.players,     //the full player list including themselves
                hostId: lobby.hostId,        //so they know who the host is
                token: generatePlayerToken(socket.id, code)
        });

            broadcastLobby(io, lobby);      //tell everyone else in the lobby that a new player joined
            console.log(`${playerName} joined the lobby ${code}`);
        } else {
            socket.emit('lobby_error', {message: 'You are already in this lobby'});
        }
    });

    //now we need to define what happens when the "start" button in the lobby is pressed
    socket.on('startGame', () => {

        //find the lobby this host belongs to, as only the host can start, so we match by hostId
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

        //now we just build the full starting game state, shuffled decks, pick the starting player at random, etc.
        //everything the server needs to run the game from this point is stored in this object
        const gameState = startGame(lobby.players);
        gameStates.set(lobbyCode, gameState);  //gameStates is the Map that holds all active game, gameState is the specific game state object for this lobby

        //set up a timer slot for this lobby
        //as each turn progresses we will fill turnTimer and cooldownTimer
        gameTimers.set(lobbyCode, {turnTimer : null, cooldownTimer: null});

        //every player should only see their own hand, not other players hands
        //here we loop through players and emit to each socket individually, rather than broadcast it
        gameState.players.forEach(player => {
            io.to(player.id).emit('game_started', {
                hand: player.hand,                      //emit their cards only
                players: gameState.players.map(p => ({   //everyone's name and id, but NOT their hand
                    id: p.id,
                    name: p.name,
                    cardCount: p.hand.length            //how many cards each player got is still visable
                })),
                currentPlayerIndex: gameState.currentPlayerIndex,   //who goes first
                phase: gameState.phase                              //starts as 'waiting'
            });
        });
        console.log(`Game started in lobby ${lobbyCode} with ${lobby.players.length} players`);
    });

    //handles a player selecting their cards and confirming a declaration
    //this is the main action of each turn, picking cards, naming a number, and committing to it
    socket.on('declareCards', (data) => {

        const lobbyCode = socketLobbies.get(socket.id);     //look up which lobby this socket belongs to instantly
        if (!lobbyCode) return;                             //if not in any, then ignore 

        const lobby = lobbies.get(lobbyCode);               //get the lobby object
        const gameState = gameStates.get(lobbyCode);        //get the live game state for this lobby
        const timers = gameTimers.get(lobbyCode);           //get the timers for this lobby

        if(!lobby||!gameState||!timers) return;             //safety check, if any of these are missing the game isn't running yet

        //only accept declarations during 'waiting' (first turn) or 'challenge_open' (every turn after)
        //any other phase means something else is happening and we shouldn't accept new plays
        if (gameState.phase !== 'waiting' && gameState.phase !== 'challenge_open'){
            socket.emit('game_error', {message: 'You cannot declare cards right now'});
            return;
        }

        const currentPlayer = gameState.players[gameState.currentPlayerIndex];      //the player whose turn it currently is
        if (currentPlayer.id !== socket.id){
            socket.emit('game_error', {message: 'It is not your turn'});            //reject if it's not their turn
            return;
        }

        const {declaredNumber, cardIds} = data;     //pull the declared number and list of selected card ids from the event

        //declared number must be between 1 and 10, as those are the only valid numbers in the game
        if (!declaredNumber || declaredNumber < 1 || declaredNumber > 10){
            socket.emit('game_error', {message: 'Declared number must be between 1 and 10'});
            return;
        }

        //must select at least one card, an empty declaration doesn't make sense
        if (!cardIds || cardIds.length === 0){
            socket.emit('game_error', {message: 'You must declare at least one card'});
            return;
        }

        //look up each selected card id in the player's actual hand to make sure they own all of them
        const declaredCards = cardIds.map(id => currentPlayer.hand.find(c => c.id === id));
        if (declaredCards.some(c => c === undefined)){
            socket.emit('game_error', {message: 'One or more selected cards are not in your hand'});
            return;
        }

        //if there's a previous pending play still waiting, check for an empty hand win before merging it
        //this is the correct moment to trigger the win, the challenge window has already been open,
        //nobody challenged, and the next player confirming their own play is the trigger
        if (gameState.pendingPlay){
            if(gameState.pendingPlay.isEmptyingHand){
                const prevPlayer = gameState.players.find(
                    p => p.id === gameState.pendingPlay.playerId    //find the player who played their last card
                );

                //double check their hand really is empty, a successful challenge would have
                //given the pile back to them, so this guard catches that case and won't trigger a win
                if (prevPlayer && prevPlayer.hand.length === 0){
                    gameState.winner = prevPlayer.id;               //they win
                    gameState.phase = 'game_over';                  //lock the game
                    broadcastGameState(io, lobbyCode, gameState);   //tell everyone who won
                    console.log(`${prevPlayer.name} wins by empty hand, unchallenged`);
                    return;     //stop here, don't process the new declaration
                }
            }
            gameState.pile.cards.push(...gameState.pendingPlay.cards)   //no empty hand win, merge the previous play into the pile as normal
        }

        //remove the declared cards from the player's hand now that they've been committed
        currentPlayer.hand = currentPlayer.hand.filter(c => !cardIds.includes(c.id));

        //create the new pending play. This sits in the pending zone visible to all players
        //actual cards are stored here server-side but never sent to other players unless a challenge happens
        gameState.pendingPlay = {
            playerId: socket.id,                    //who made this play
            cards: declaredCards,                   //the real cards, ones that are hidden from other players
            declaredNumber,                         //the number they claimed
            declaredCount: declaredCards.length,    //how many cards they said they played, this is what others see
            playedAt: Date.now(),                   //timestamp used to track the 5 second cooldown
            challengeWindowOpen: false,              //starts closed, flips to true after 5 seconds
            isEmptyingHand: currentPlayer.hand.length === 0  //true if this play used their last card, checked on the next turn to trigger an empty hand win
        };

        currentPlayer.consecutive_skips = 0;        //they played successfully so reset their skip streak

        gameState.phase = 'cooldown';               //nobody can challenge yet, the 5 second cooldown just started

        //cancel the turn timer since they played in time
        if (timers.turnTimer){
            clearTimeout(timers.turnTimer);
            timers.turnTimer = null;
        }

        broadcastGameState(io, lobbyCode, gameState);               //tell everyone about the new pending play

        //after 5 seconds, open the challenge window and start the next player's turn timer
        timers.cooldownTimer = setTimeout(() => {
            gameState.pendingPlay.challengeWindowOpen = true;       //challenge button becomes active for all other players
            gameState.phase = 'challenge_open';                     //game is now in the challengeable window

            const nextPlayerIndex = getNextPlayerIndex(gameState);  //work out who goes next, skipping eliminated players
            gameState.currentPlayerIndex = nextPlayerIndex;         //set them as the current player

            broadcastGameState(io, lobbyCode, gameState);           //tell everyone the window is open and whose turn it is

            //start the 20 second turn timer for the next player
            timers.turnTimer = setTimeout(() => {
                handleTurnTimeout(io, lobbyCode, gameState, timers);    //skip them if they don't play in time
           }, 20000);

        }, 5000);       //5 second cooldown before anyone can challenge
    });

    //handles a player clicking the challenge button on someone else's pending play
    socket.on('challenge', () => {

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

        //a player can't challenge their own play
        if (gameState.pendingPlay.playerId === socket.id){
            socket.emit('game_error', {message: 'You cannot challenge your own play'});
            return;
        }

        //the player whose turn it currently is can't challenge either, they should be playing cards
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        if(currentPlayer.id === socket.id){
            socket.emit('game_error', {message: 'You cannot challenge when its your turn to play'});
            return;
        }

        //lock the game immediately, first challenge wins the race, all others are ignored from this point
        gameState.phase = 'resolving_challenge';

        //cancel both timers, the cooldown is done but the next player's turn timer needs to stop
        if(timers.cooldownTimer){
            clearTimeout(timers.cooldownTimer);
            timers.cooldownTimer = null;
        }

        if(timers.turnTimer){
            clearTimeout(timers.turnTimer);
            timers.turnTimer = null;
        }

        //save the pending play details before we clear it, we need these for the result screen
        const pendingPlay = gameState.pendingPlay;
        const pendingCards = pendingPlay.cards;             //the actual cards that were played
        const declaredNumber = pendingPlay.declaredNumber;  //what number they claimed

        const challenger = gameState.players.find(p => p.id === socket.id)              //the player who pressed challenge
        const accused = gameState.players.find(p => p.id === pendingPlay.playerId);     //the player being challenged

        //check if the play was honest, every card must match the declared number or be a wild
        const honest = isPlayHonest(pendingCards, declaredNumber);

        //honest play means the challenger was wrong and loses, bluff means the accused gets caught and loses
        const loser = honest ? challenger : accused;
        const winner = honest ? accused : challenger;

        //loser takes everything, combine the pile and the pending play cards, add them all to the loser's hand
        const allPileCards = [...gameState.pile.cards, ...pendingCards];
        loser.hand = [...loser.hand, ...allPileCards];

        gameState.pile.cards= [];       //pile is now empty, as it all went to the loser
        gameState.pendingPlay = null;   //pending play is resolved, so clear it

        //show the result screen to everyone, this reveals the actual cards and blocks all input for 7 seconds on the client
        io.to(lobbyCode).emit('challenge_result', {
            challengerId: challenger.id,        //the challenger ID
            challengerName: challenger.name,    //their name
            accusedId: accused.id,              //the ID of the one that got challenged
            accusedName: accused.name,          //their name
            honest,                             //true = the play was honest, false = the play was a bluff and got caught
            actualCards: pendingCards,          //the real cards, now revealed to everyone
            declaredNumber,                     //what the accused claimed they were playing
            loserId: loser.id,                  //who lost the challenge
            loserName: loser.name               
        });

        //give the loser a drink and roll for elimination, it resumes the game after 7 seconds
        rollDrunkness(io, lobbyCode, gameState, timers, winner, loser);
    });

    //triggered automatically by the client when they reconnect, using the token they saved locally
    //this is what lets a player rejoin their game after a dropped connection or page refresh
    socket.on('rejoinGame', (data) => {
        const {token, lobbyCode} = data;    //the token and lobby code the client stored when they first joined

        //reject straight away if either piece is missing, we need both to verify who they are
        if (!token||!lobbyCode) {
            socket.emit('rejoin_error', {message: 'Missing token or lobby code'});
            return;
        }

        const tokenData = playerTokens.get(token);      //look up the token to find which player it belongs to

        //token doesn't exist or doesn't match the lobby they're claiming to be in
        if (!tokenData||tokenData.lobbyCode !== lobbyCode) {
            socket.emit('rejoin_error', {message: 'Invalid or expired token'});
            return;
        }

        const lobby = lobbies.get(lobbyCode);       //find the lobby they're trying to rejoin

        //lobby was deleted while they were gone, nothing to rejoin
        if (!lobby){
            socket.emit('rejoin_error', {message: 'Lobby no longer exists'});
            playerTokens.delete(token);     //clean up the now useless token
            return;
        }

        const oldSocketId = tokenData.playerId;     //their old socket id before they disconnected

        tokenData.playerId = socket.id;             //update the token to point to their new socket id

        //update the socket-to-lobby lookup so future events from this new socket find the right lobby
        socketLobbies.set(socket.id, lobbyCode);        //add new socket id
        socketLobbies.delete(oldSocketId);              //remove the old one so it doesn't linger

        //swap their old socket id for the new one in the lobby's player list
        const lobbyPlayer = lobby.players.find(p => p.id === oldSocketId);
        if(lobbyPlayer){
            lobbyPlayer.id = socket.id;     //update to new socket id
        }

        //if they were the host, update that too so they keep host privileges
        if (lobby.hostId === oldSocketId){
            lobby.hostId = socket.id
        }

        socket.join(lobbyCode);     //put their new socket into the lobby's room so broadcasts reach them again

        //restore their full game state so they can pick up exactly where they left off
        if(lobby.gameStarted){
            const gameState = gameStates.get(lobbyCode);        //get the live game state for this lobby

            if (gameState){
                const gamePlayer = gameState.players.find(p => p.id === oldSocketId);   //find them by their old id

                if(gamePlayer){
                    gamePlayer.id = socket.id;      //update their id in the game state to the new socket
                    gamePlayer.connected = true;    //mark them as connected again, clears the disconnected icon

                    console.log(`${gamePlayer.name} reconnected to lobby ${lobbyCode}`);

                    //send them their private game state so they can see their own hand and the full current situation
                    socket.emit('rejoin_success', {
                        hand: gamePlayer.hand,                      //their cards, private, only sent to them
                        players: gameState.players.map(p => ({      //everyone's public info
                            id: p.id,
                            name: p.name,
                            cardCount: p.hand.length,               //how many cards each player has
                            drunkness: p.drunkness,                 //their drunkness level
                            isOut: p.isOut,                         //whether they've been eliminated
                            connected: p.connected                  //whether they're currently connected
                        })),
                        pile: {count: gameState.pile.cards.length},     //current pile size
                        pendingPlay: gameState.pendingPlay ? {          //current pending play if there is one
                            playerId: gameState.pendingPlay.playerId,
                            declaredNumber: gameState.pendingPlay.declaredNumber,
                            declaredCount: gameState.pendingPlay.declaredCount,
                            challengeWindowOpen: gameState.pendingPlay.challengeWindowOpen
                        } : null,
                        currentPlayerIndex: gameState.currentPlayerIndex,       //whose turn it is
                        phase: gameState.phase,                                 //what stage the game is in
                        winner: gameState.winner                                //null unless the game is already over
                    });

                    broadcastGameState(io, lobbyCode, gameState);               //tell everyone else they reconnected, clears the disconnected icon on their screens
                }
            }
        } else {

            //just send them the current lobby state so they can see who's there
            socket.emit('rejoin_success', {
                code: lobby.code,           //the lobby code
                players: lobby.players,     //the current player list
                hostId: lobby.hostId        //who the host is
            });

            broadcastLobby(io, lobby);      //tell everyone else they're back
        }
    }); 

    //runs whevener a player/socket disconnets for any reason (closed tab, refresh, lost connection)
    //there isn't a "leave lobby" event or anything like that so this is the place where the removal happens
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

        if(roomLobby.gameStarted){
            //during an active game, we don't remove the player's seat
            //their hand, position, and drunkness stay exactly as they were
            //the turn timer keeps running just the same as if they were AFK
            const gameState = gameStates.get(lobbyCode);

            if (gameState){
                const player = gameState.players.find(p => p.id === socket.id);

                if(player){
                    player.connected = false;   //only their connected flag changes, which triggers the disconnected icon in the UI
                    console.log(`${player.name} disconnected from active game in lobby ${lobbyCode}`);
                    broadcastGameState(io, lobbyCode, gameState);   //tell everyone so the disconnected icon appears straight away
                }
            }
            return;     //stop here, don't remove them from the lobby during an active game
        }

        roomLobby.players.splice(playerIndex, 1);   //remove the disconnected player from the list

        //if the lobby is now empty, delete it and clean up any tokens that belonged to it
        //no point keeping an empty lobby alive, it just wastes memory and occupies a code
        if (roomLobby.players.length === 0){
            for(const[token, data] of playerTokens.entries()){
                if(data.lobbyCode === lobbyCode) {
                    playerTokens.delete(token);     //remove every token that pointed to this lobby
                }
            }
            lobbies.delete(lobbyCode);
            return;
        }

        //if the host left, hand host duties to whoever is next in the list
        //without this nobody would have the power to start the game
        if (roomLobby.hostId === socket.id){
            roomLobby.hostId = roomLobby.players[0].id;     //first remaining player becomes the new host
        }

        broadcastLobby(io, roomLobby);  //tell everyone in the lobby about the updated player list
    });
});