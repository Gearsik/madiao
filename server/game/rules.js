//elimination chance goes up with each drink, the 4th drink is always fatal
const eliminationChance = 
    Object.freeze ({
        1: 0.25,    //25% chance on the first drink
        2: 0.50,    //50% on the second
        3: 0.75,    //75% on the third
        4: 1.00,     //and finally 100% on the fourth which is a guaranteed out
    });

function applyDrink(player, random = Math.random){
    player.drunkness = Math.min(
        player.drunkness + 1,
        4
    );

    const chance = eliminationChance[player.drunkness];

    const eliminated = random() < chance;

    return{
        drunkness: player.drunkness,
        chance,
        eliminated,
    };
}

module.exports = {applyDrink, eliminationChance};