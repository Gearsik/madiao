import { useState } from 'react';
import './DeclareModal.css';

const DECLARATION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

//shown for the first play of a round, where the player still needs to choose which number they are declaring
function DeclareModal({ selectedCount, onConfirm, onCancel }) {
    const [selectedNumber, setSelectedNumber] = useState(null);

    const hasSelectedNumber = selectedNumber !== null;
    const cardLabel = selectedCount === 1 ? 'card' : 'cards';

    const confirmButtonLabel = hasSelectedNumber
        ? `Declare ${selectedCount} ${cardLabel} as ${selectedNumber}`
        : 'Choose a number';
    
    function handleConfirm(){
        if (!hasSelectedNumber) return;

        onConfirm(selectedNumber);
    }

    return (
        <div 
            className="declare-overlay" 
            onClick={onCancel}
        >

            {/* clicking outside closes the window, so clicks inside it need to stop at the panel */}
            <div 
                className="declare-modal" 
                onClick={e => e.stopPropagation()}
            >
                {/* Heading */}
                <div className='declare-heading'>
                    <h2 className="declare-title">
                        Declare your play
                    </h2>

                    <p className='declare-subtitle'>
                        <strong>
                            {selectedCount}
                        </strong>

                        {' '}
                        {cardLabel} selected

                        {hasSelectedNumber && (
                            <>
                                <span className='declare-subtitle-separator'>
                                    .
                                </span>
                                
                                declaring as

                                <strong className='declare-selected-number-text'>
                                    {selectedNumber}
                                </strong>
                            </>
                        )}
                    </p>
                </div>

                <div className='declare-divider' />

                {/* the opening player can choose any number from 1 to 10, this becomes the number used for the rest of the round */}
                <div 
                    className='declare-numbers'
                    role='group'
                    aria-label='Declared card number'
                >
                    {DECLARATION_NUMBERS.map((number, index) => {
                        const numberClassName = [
                            'declare-number',
                            selectedNumber === number
                                ?'declare-number--selected'
                                :''
                        ].filter(Boolean).join(' ');

                        return(
                            <button
                                key={number}
                                type='button'
                                className={numberClassName}
                                style={{
                                    '--declare-index': index
                                }}
                                aria-pressed={selectedNumber === number}
                                onClick={() => setSelectedNumber(number)}
                            >
                                {number}
                            </button>
                        );
                    })}
                </div>

                {/* cancel/confirm buttons */}
                <div className='declare-actions'>
                    <button
                        type='button'
                        className='declare-cancel'
                        onClick={onCancel}
                    >
                        Cancel
                    </button>

                    <button
                        type='button'
                        className='declare-confirm'
                        onClick={handleConfirm}
                        disabled={!hasSelectedNumber}
                    >
                        {confirmButtonLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
    

export default DeclareModal;