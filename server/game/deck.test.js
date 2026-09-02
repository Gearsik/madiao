//deck test file
const {describe, it} = require ('node:test');
const assert = require ('node:assert/strict');
const { isPlayHonest } = require ('./deck');

describe('isPlayHonest', () => {

    describe('honest_play', () => {

        it('returns true when all cards match the declared number', () => {
            const cards = [
                {type: 'number', value: 7},
                {type: 'number', value: 7}
            ];
            assert.strictEqual(isPlayHonest(cards, 7), true);
        });
    })
})