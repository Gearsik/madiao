import './CardHand.css';

// displays the player's hand of cards in a fan/stack layout
// cards are pre-sorted before being passed in — wilds left, numbers descending right
function CardHand({ cards, selectedCards, onCardClick, isMyTurn, phase, playingCards }) {
    const total = cards.length;

    return (
        <div className="card-hand">
            {cards.map((card, index) => {
                const isSelected = selectedCards.includes(card.id);
                const isWild = card.type === 'wild';
                const isInactive = !isMyTurn || (phase !== 'waiting' && phase !== 'challenge_open');

                // fan layout: each card shifts slightly to the right based on its position
                // cards overlap so only a sliver of each one peeks out behind the next
                const peekWidth = 28;   // how many pixels of each card are visible
                const leftOffset = index * peekWidth;

                return (
                    <div
                        key={card.id}
                        className={`
                            card
                            ${isWild ? 'card--wild' : ''}
                            ${isSelected ? 'card--selected' : ''}
                            ${isInactive ? 'card--inactive' : ''}
                            ${isSelected && playingCards ? 'card--playing' : ''}
                        `}
                        style={{ left: `${leftOffset}px` }}  // absolute position creates the fan
                        onClick={() => !isInactive && onCardClick(card.id)}
                    >
                        <span className="card-value">
                            {isWild ? 'W' : card.value}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export default CardHand;