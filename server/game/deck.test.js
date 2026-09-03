//deck test file
const {describe, it} = require ('node:test');
const assert = require ('node:assert/strict');
const { isPlayHonest } = require ('./deck');
const {deckBuilding} = require ('./deck');
const { type } = require('node:os');

//testing isPlayHonest function
describe('isPlayHonest', () => {

    //testing when the play is honest, so cards that match the declaration were played
    describe('honest_play', () => {

        it('returns true when all cards match the declared number', () => {
            const cards = [
                {type: 'number', value: 7},
                {type: 'number', value: 7}
            ];
            assert.strictEqual(isPlayHonest(cards, 7), true);
        });

        it('return true when one of the cards is a wild card alongside a matching card', () => {
            const cards = [
                {type: 'number', value: 4},
                {type: 'wild', wildType: 0}
            ];
            assert.strictEqual(isPlayHonest(cards, 4), true);
        });

        it('return true if all cards played are wild cards', () => {
            const cards = [
                {type: 'wild', wildType:0},
                {type: 'wild', wildType:1}
            ];
            assert.strictEqual(isPlayHonest(cards, 3), true);
        });

        it('return false if at least one of the cards dont match the declared number alongside a matching card', () => {
            const cards = [
                {type: 'number', value: 5},
                {type: 'number', value: 3}
            ];
            assert.strictEqual(isPlayHonest(cards, 5), false);
        });
    });

    //testing when the play is a bluff
    describe('bluff', () => {

        it('returns false when one card doesnt match', () => {
            const cards = [
                {type: 'number', value:7},
                {type: 'number', value:3}
            ];
            assert.strictEqual(isPlayHonest(cards, 1), false);
        });

        it('return false when no cards match', () => {
            const cards = [
                {type: 'number', value:3},
                {type: 'number', value:6}
            ];
            assert.strictEqual(isPlayHonest(cards, 2), false);
        });
    });
})

//testing deckBuilding function
describe('deckBuilding', () => {

    it('are there 56 total cards in the deck?', () => {
        const deck = deckBuilding();
        assert.strictEqual(deck.length, 56);
    });

    it('are there 40 numbered cards in the deck?', () => {
        const deck = deckBuilding();
        const numberedCards = deck.filter(card => card.type === 'number');
        assert.strictEqual(numberedCards.length, 40);
    });

    it('are there 16 wild cards in the deck?', () => {
        const deck = deckBuilding();
        const wildCards = deck.filter(card => card.type === 'wild');
        assert.strictEqual(wildCards.length, 16);
    });
});


