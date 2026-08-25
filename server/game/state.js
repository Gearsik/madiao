const { deckBuilding, shuffle } = require('./deck');

//here we set up everything we need to start a new/fresh game
//it takes the players from the lobby, deals their cards and creates the starting game state
function startGame(lobbyPlayers) {

    //build and shuffle a fresh deck so every game starts with a different card order
    const deck = shuffle(deckBuilding());

    //split the deck as evenly as possible between everybody in the lobby
    //any cards left over after dividing it evenly are simply not dealt
    const handSize = Math.floor(deck.length / lobbyPlayers.length);

    //create the game version of each player with their hand and starting values
    const players = lobbyPlayers.map((player, index) => ({
        id: player.id,
        name: player.name,

        hand: deck.slice(index * handSize, (index + 1) * handSize), //each player receives their own section of the shuffled deck
        drunkness: 0,               //each player starts with 0 drunkness and can survive max 3 drinks, the 4th one eliminates them from the game
        isOut: false,               //flips to true once the player has been eliminated
        connected: true             //used by the UI to show when somebody disconnects
    }));

    //choose a random starting player instead of always giving the first lobby player the opening turn
    const currentPlayerIndex = Math.floor(Math.random() * players.length);

    //this is the complete starting state the server uses to run the game
    return {
        players,
        pile: {
            cards: []               //confirmed cards are moved into the shared pile
        },
        pendingPlay: null,          //the most recent play waiting to be challenged or accepted
        currentPlayerIndex,         //index of the player whose turn it currently is
        turnStartedAt: Date.now(),  //server timestamp used to run and display the current turn timer
        phase: 'waiting',           //the current player is allowed to make a play
        winner: null,               //stays null until the game has a winner
        roundDeclaredNumber: null   //set by the first declaration and used for the rest of that round
    };
}

module.exports = { startGame };

