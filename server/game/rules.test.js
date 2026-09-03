const {describe, it} = require ('node:test');
const assert = require ('node:assert/strict');
const { type } = require('node:os');
const {applyDrink} = require('./rules');

//test applyDrink function
describe('applyDrink', () => {

    describe('drunkness increase', () => {

        it('increase drunkness level by 1 each time', () => {
            const player = {drunkness: 0};
            const result = applyDrink(player, () => 1);
            assert.strictEqual(result.drunkness, 1);
        });

        it('drunkness cannot go above 4', () => {
            const player = {drunkness: 4};
            const result = applyDrink(player, () => 1);
            assert.strictEqual(result.drunkness, 4);
        });
    });

    describe('elimination', () => {

        it('eliminate the player when random falls below the chance', () => {
            const player = {drunkness: 0};
            const result = applyDrink(player, () => 0.10);  //roll below 0.25 to be eliminated
            assert.strictEqual(result.eliminated, true);
        });

        it('dont eliminate the player when random rolls above the chance', () => {
            const player = {drunkness: 0};
            const result = applyDrink(player, () => 0.99);  //roll above 0.25 to not get eliminated
            assert.strictEqual(result.eliminated, false);
        });

        it('always get eliminated on the 4th drink', () => {
            const player = {drunkness: 3};
            const result = applyDrink(player, () => 0.99);   //you can never roll 1, so you always get eliminated on the 4th drink
            assert.strictEqual(result.eliminated, true);
        });
    });

    describe('elimination chances match the table', () => {

        it('first drink has a 25% elimination chance', () => {
            const player = {drunkness: 0};
            const result = applyDrink(player, () => 1);
            assert.strictEqual(result.chance, 0.25);
        });

        it('second drink has a 50% chance', () => {
            const player = {drunkness: 1};
            const result = applyDrink(player, () => 1);
            assert.strictEqual(result.chance, 0.50);
        });

        it('third drink has 75% chance', () => {
            const player = {drunkness: 2};
            const result = applyDrink(player, () => 1);
            assert.strictEqual(result.chance, 0.75);
        });

    });
});

