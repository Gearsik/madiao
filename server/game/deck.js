//builds the full 56-card deck used for every game
//there are 40 numbered cards and 16 wild cards
function deckBuilding(){
    const deck = [];

    //numbers 1 to 10 each have four copies
    //every copy gets its own ID so the client can track individual cards
    for (let value = 1; value <= 10; value++) {
        for (let copy = 0; copy < 4; copy++) {
            deck.push({ id: `num_${value}_${copy}`, type: 'number', value});
        }
    }

    //wild cards automatically match any declared number
    //four visual types with four copies each gives us 16 wild cards in total
    const wildTypes = 4;
    for (let type = 0; type < wildTypes; type++){
        for(let copy =0; copy < 4; copy++){
            deck.push({id: `wild_${type}_${copy}`, type: 'wild', wildType:type});
        }
    }

    //total return should be 56 made out of 40 normal cards and 16 wild cards
    return deck;
}

//wild cards always match, numbered cards only match the number currently being declared
function cardAutoMatching(card, declaredNumber){
    return card.type === 'wild' || card.value === declaredNumber;
}

//a play is honest only if every card matches the declared number
//this is only checked when somebody challenges the play
function isPlayHonest(cards, declaredNumber){
    return cards.every((card)=> cardAutoMatching(card, declaredNumber));
}

//shuffles the deck in place before it is dealt
function shuffle(deck) {
    for(let i = deck.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

//export all functions and make them avaliable to other project files
module.exports = {deckBuilding, shuffle, cardAutoMatching, isPlayHonest};
