const {describe, it} = require ('node:test');
const assert = require ('node:assert/strict');
const { type } = require('node:os');
const {startGame} = require ('./state');

//testing startGame function
describe('startGame', () => {

    it('deal the correct number of cards to each player', () => {
        const lobbyPlayers = [
            {id: 'player0', name: 'Bruno'},
            {id: 'player1', name: 'Ben'},
            {id: 'player2', name: 'Bryan'}
        ];

        const gameState = startGame(lobbyPlayers);

        gameState.players.forEach(player => {
            assert.strictEqual(player.hand.length, 18)
        });
    });
});