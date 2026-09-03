//deck test file
const {describe, it} = require ('node:test');
const assert = require ('node:assert/strict');
const {isPlayHonest, deckBuilding} = require('./deck');

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

        it('return false if at least one of the cards dont match the declared number alongside a matching card', () => {
            const cards = [
                {type: 'number', value: 5},
                {type: 'number', value: 3}
            ];
            assert.strictEqual(isPlayHonest(cards, 5), false);
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

    it('each number from 1 to 10 shows up exactly 4 times', () => {
        const deck = deckBuilding();

        for(let value = 1; value <= 10; value++){
            const count = deck.filter(card => card.type === 'number' && card.value === value).length;
            assert.strictEqual(count, 4, `expected 4 copies of ${value} but got ${count}`);
        }
    });

    it('each wild card also appears 4 times', () => {
        const deck = deckBuilding();

        for(let type = 0; type < 4; type++){
            const count = deck.filter(card => card.type === 'wild' && card.wildType === type).length;
            assert.strictEqual(count, 4, `expected 4 copies of wild type ${type} but got ${count}`);
        }
    });

    it('every cardID is unique', () => {
        const deck = deckBuilding();
        const ids = deck.map(card => card.id);
        const uniqueIds = new Set(ids);
        assert.strictEqual(uniqueIds.size, ids.length);
    });
});


