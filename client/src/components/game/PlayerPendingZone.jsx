import './PlayerPendingZone.css';

const MAX_VISIBLE_CARDS = 10;
const CARDS_PER_ROW = 5;
const STACK_OFFSET_PX = 3;

//this is the small area where selected or recently played cards are shown
//our own cards stay face up, while everybody else only sees the same amount of face-down cards

function PlayerPendingZone({
    declaredCount = 0, 
    faceUp, 
    myPendingCards = [], 
    onCardClick, 
    isMyTurn, 
    singleRow = false, 
    isSubmitting = false
}) {

    //our own cards still need grouping in the same way as the hand, otherwise duplicate cards would sit beside each other
    const faceUpStacks = [];
    const stackIndexes = new Map();

    if(faceUp){
        myPendingCards.forEach(card => {
            const stackKey = card.type === 'wild' 
            ? `wild-${card.wildType ?? 0}` 
            : `num-${card.value}`;

            if(!stackIndexes.has(stackKey)){
                stackIndexes.set(stackKey, faceUpStacks.length);
                faceUpStacks.push({stackKey, cards:[]});
            }
            faceUpStacks[stackIndexes.get(stackKey)].cards.push(card);            
        });
    }

    //we do not know an opponent's real cards, so their public declaration count is enough to draw the correct number of backs
    const faceDownCards = Array.from({length: Math.min(declaredCount, MAX_VISIBLE_CARDS)}, (_, index) => index);

    //the local pending zone has room for one long row, opponent cards use two shorter rows instead
    const firstRow = faceUp 
        ? faceUpStacks.slice(0, singleRow ? MAX_VISIBLE_CARDS : CARDS_PER_ROW) 
        : faceDownCards.slice(0, singleRow ? MAX_VISIBLE_CARDS : CARDS_PER_ROW);

    const secondRow = faceUp 
        ? faceUpStacks.slice(CARDS_PER_ROW, MAX_VISIBLE_CARDS) 
        : faceDownCards.slice(CARDS_PER_ROW, MAX_VISIBLE_CARDS);

    const canClickPendingCards =
        faceUp &&
        isMyTurn &&
        !isSubmitting &&
        typeof onCardClick === 'function';

    //both rows are drawn the same way, keeping that logic here stops the second row becoming a slightly different copy later on
    function renderRow(row, rowNumber) {
        return (
            <div
                key={rowNumber}
                className="pending-row"
            >
                {faceUp 
                    ? row.map(({ stackKey, cards: stackCards }) => (
                        <div
                            key={stackKey}
                            className="pending-stack"
                        >
                            {stackCards.map((card, copyIndex) => {
                                return (
                                    <div
                                        key={card.id}
                                        className={[
                                            'pending-card',
                                            'pending-card--faceup',
                                            canClickPendingCards
                                                ? 'pending-card--clickable'
                                                : '',
                                            isSubmitting
                                                ? 'pending-card--submitting'
                                                : ''
                                        ].filter(Boolean).join(' ')}
                                        style={{
                                            bottom: `${(stackCards.length - 1 - copyIndex) * STACK_OFFSET_PX}px`,
                                            zIndex: copyIndex + 1
                                        }}
                                        onClick={() => {
                                            if (canClickPendingCards) {
                                                onCardClick?.(card.id);
                                            }
                                        }}
                                    >
                                        <img
                                            src={card.type === 'wild'
                                                ? `/assets/cards/wild-${card.wildType ?? 0}.svg`
                                                : '/assets/cards/card-template.svg'
                                            }
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                width: '100%',
                                                height: '100%'
                                            }}
                                            alt=""
                                        />

                                        {card.type !== 'wild' && (
                                            <span className="pending-card-value">
                                                {card.value}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))
                    : row.map(cardIndex => (
                        <div
                            key={cardIndex}
                            className="pending-stack"
                        >
                            <div className="pending-card pending-card--facedown" />
                        </div>
                    ))
                }
            </div>
        );
    }

    return (
        <div className='player-pending-zone'>
            <div className="pending-rows">
                {renderRow(firstRow, 1)}

                {!singleRow && secondRow.length > 0 && (
                    renderRow(secondRow, 2)
                )}
            </div>
        </div>
    );
}
export default PlayerPendingZone;