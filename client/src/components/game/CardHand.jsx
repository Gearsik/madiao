import './CardHand.css';

//shows the cards this player still has in their hand
//duplicate cards are stacked together, while GameTable decides the order before they arrive here
function CardHand({ cards = [], onCardClick }) {

    //group matching cards together so copies of the same number or wild card sit in one stack
    const stacks =  [];
    const stackIndexes = new Map();

    cards.forEach(card => {
        const stackKey = card.type === 'wild'
        ? `wild-${card.wildType ?? 0}`
        : `num-${card.value}`;

        if(!stackIndexes.has(stackKey)){
            stackIndexes.set(stackKey, stacks.length);
            stacks.push({stackKey, cards: []});
        }
        stacks[stackIndexes.get(stackKey)].cards.push(card);
    });

    return (
        <div className="card-hand">
            {stacks.map(({stackKey, cards: stackCards}, stackIndex) => {
                const copyCount = stackCards.length;

                //the container grows slightly for every extra copy so none of the stacked cards get cut off
                const stackHeight = `
                    calc(
                        var(--my-card-h) + 
                        ${(copyCount - 1)} * var(--hand-stack-offset)
                        )
                    `;

                return(
                    <div 
                        key={stackKey} 
                        className='card-stack' 
                        style={{
                            height: stackHeight, 
                            zIndex: stackIndex + 1
                        }}
                    >
                        {stackCards.map((card, copyIndex) => {

                            return(
                                <div
                                    key={card.id}
                                    className='card'
                                    style={{
                                        //each copy sits stackOffset px higher than the one below
                                        //copy 0 is at the bottom, copy N-1 is at the top
                                        bottom:`
                                            calc(
                                                ${copyCount - 1 -copyIndex}
                                                * var(--hand-stack-offset)
                                            )
                                        `,
                                        //later copies sit in front visually
                                        zIndex: copyIndex + 1,
                                    }}
                                    onClick={() => onCardClick(card.id)}
                                >
                                <img
                                    src={card.type === 'wild'
                                        ? `/assets/cards/wild-${card.wildType ?? 0}.svg`
                                        : `/assets/cards/card-template.svg`
                                    }
                                    style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: '100%',
                                            height: '100%',
                                    }}
                                    alt=''
                                />
                                    {card.type !== 'wild' && (
                                        <span className='card-value'>
                                            {card.value}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

export default CardHand;