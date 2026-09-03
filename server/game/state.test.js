const {describe, it} = require ('node:test');
const assert = require ('node:assert/strict');
const { type } = require('node:os');
const {startGame} = require ('./state');

//testing startGame function
describe('startGame', () => {

    describe('player default state', () => {

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

        it('players start with drunkness 0', () => {
            const lobbyPlayers = [
                {id: 'player0', name: 'Mata'},
                {id: 'player1', name: 'Kobby'}
            ];

            const gameState = startGame(lobbyPlayers);

            gameState.players.forEach(player => {
                assert.strictEqual(player.drunkness, 0);
            });
        });

        it('no player starts eliminated', () => {
            const lobbyPlayers = [
                {id: 'player0', name: 'Diogo'},
                {id: 'player1', name: 'Licha'}
            ];

            const gameState = startGame(lobbyPlayers);

            gameState.players.forEach(player => {
                assert.strictEqual(player.isOut, false);
            });
        });

        it('every player starts connected', () => {
            const lobbyPlayers = [
                {id: 'player0', name: 'Carlos'},
                {id: 'player1', name: 'Yuri'}
            ];

            const gameState = startGame(lobbyPlayers);

            gameState.players.forEach(player => {
                assert.strictEqual(player.connected, true);
            });
        });
    });

    describe('game default state', () => {

        it('pile starts empty', () => {
            const lobbyPlayers = [
                {id: 'player0', name: 'Michael'},
                {id: 'player1', name: 'Harry'}
            ];

            const gameState = startGame(lobbyPlayers);
            assert.strictEqual(gameState.pile.cards.length, 0);
        });

        it('pendingPlay starts as null', () => {
            const lobbyPlayers = [
                {id: 'player0', name: 'Leny'},
                {id: 'player1', name: 'Matthijs'}
            ];

            const gameState = startGame(lobbyPlayers);
            assert.strictEqual(gameState.pendingPlay, null);
        });

        it('phase starts as waiting', () => {
            const lobbyPlayers = [
                {id: 'player0', name: 'Amad'},
                {id: 'player1', name: 'Matheus'}
            ];

            const gameState = startGame(lobbyPlayers);
            assert.strictEqual(gameState.phase, 'waiting');
        });

        it('winner starts as null', () => {
            const lobbyPlayers = [
                {id: 'player0', name: 'Santos'},
                {id: 'player1', name: 'Marcus'}
            ];

            const gameState = startGame(lobbyPlayers);
            assert.strictEqual(gameState.winner, null);
        });

        it('roundDeclaredNumber starts as null', () => {
            const lobbyPlayers = [
                {id: 'player0', name: 'Benajmin'},
                {id: 'player1', name: 'Mason'}
            ];

            const gameState = startGame(lobbyPlayers);
            assert.strictEqual(gameState.roundDeclaredNumber, null);
        });

        it('starting player index is within bounds', () => {
            const lobbyPlayers = [
                {id: 'player0', name: 'Senne'},
                {id: 'player1', name: 'Tom'},
                {id: 'player2', name: 'Karl'}
            ];

            const gameState = startGame(lobbyPlayers);

            assert.ok(gameState.currentPlayerIndex >= 0);
            assert.ok(gameState.currentPlayerIndex < lobbyPlayers.length);
        });
    });
});