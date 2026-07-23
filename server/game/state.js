const { deckBuilding, shuffle } = require('./deck');

//here we set up everything we need to start a new/fresh game
//takes the list of players in the lobby and
//gives each a hand of cards, and sets all of the starting values for the game
function startGame(lobbyPlayers) {

    //now we need to build and shuffle the deck before doing anything else
    //that is to make sure every game starts with a different cards order
    const deck = shuffle(deckBuilding());

    //since the number of players can vary
    //we need to work out how many cards every player gets
    //so here we just divide the total number of cards
    //by the number of players and round it down
    //any leftovers just will not be dealt
    const handSize = Math.floor(deck.length / lobbyPlayers.length);

    //here we set up each players starting stats
    const players = lobbyPlayers.map((player, index) => ({
        id: player.id,
        name: player.name,
        hand: deck.slice(index * handSize, (index + 1) * handSize), ///each player gets some cards from the deck
        drunkness: 0,               //each player starts with 0 drunkness and can survive max 3 drinks, the 4th one eliminates them from the game
        isOut: false,               //gets set to true if the player gets eliminated
        consecutive_skips: 0,       //number of turns in a row a player have now missed, if its 3 they are out automatically to deal with AFK and DCs
        connected: true             //changes to false if a player disconnects, but only affects the UI
    }));

    //pick a random player to start the game, rather than having player number 1 to start always
    const currentPlayerIndex = Math.floor(Math.random() * players.length);

    //return the full starting state of the game
    //that is everything the server needs to know about the game at any point 
    return {
        players,
        pile: {
            cards: []               //cards that have been played and confirmed go here
        },
        pendingPlay: null,          //becomes the current play once a player declares their cards
        currentPlayerIndex,         //points to whoever's turn it is in the players array
        turnStartedAt: Date.now(),  //the 20s cooldown starts from here
        phase: 'waiting',         //the game hasnt started until the first card is played
        winner: null,               //starts null until we have a winner
        roundDeclaredNumber: null
    };
}

module.exports = { startGame };

