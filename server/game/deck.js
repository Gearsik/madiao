//Responsible for building the deck. Needed 40 cards from 1 - 10 with 4 copies of each
//plus additional 16 wild cards. The deck is static as it has no need to change regardless how many players play
//the only thing that updates is the hand size.
function deckBuilding(){
    const deck = [];

    //for loop needed for cards id + index copy for front end tracking reasons
    for (let value = 1; value <= 10; value++) {
        for (let copy = 0; copy < 4; copy++) {
            deck.push({ id: `num_${value}_${copy}`, type: 'number', value});
        }
    }

    //since wildcards have no value as they auto-match
    //we only need to track their uniquness with their ID
    //and ensure there are 16 of them generated
    for (let i = 0; i <16; i++){
        deck.push({id: `wild_${i}`, type: 'wild'});
    }

    //total return should be 56 made out of 40 normal cards and 16 wild cards
    return deck;
}

//since wild cards are supposed to act like Jokers in other card games,
//here we just declare that any card with a "wild" tag always matches the value that's declared
function cardAutoMatching(card, declaredNumber){
    return card.type === 'wild' || card.value === declaredNumber;
}

//On top of all that we also need to have a check for honest/dishonest play
//here we check for every played card to check if it matches the declared number
//wild card play is ALWAYS treated as honest since they auto match the declared number
//that function only triggers when a challenge arrives
function isPlayHonest(cards, declaredNumber){
    return cards.every((card)=> cardAutoMatching(card, declaredNumber));
}

//naturally to make it radnom the deck needs to be shuffled before every game,
//otherwise it would follow the same card sequence every time
function shuffle(deck) {
    for(let i = deck.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

//export all functions and make them avaliable to other project files
module.exports = {deckBuilding, shuffle, cardAutoMatching, isPlayHonest};

//check for testing if the deck builds everything correctly
//const deck = shuffle(deckBuilding());
//console.log('Total cards:', deck.length); //number of all cards, should be 56
//console.log('Wild cards:', deck.filter(c => c.type === 'wild').length); //this number should come out as 16
//console.log('Numbers:', deck.filter(c => c.type === 'number').length); //number of all numbered cards including copies, 40 in total