import { useState } from 'react';

function DeclareModal({ selectedCount, onConfirm, onCancel }) {
    const [selectedNumber, setSelectedNumber] = useState(null);

    return (
        <div className="declare-overlay">
            <div className="declare-modal">
                <h2 className="declare-title">Declare</h2>
                <p className="declare-count">
                    {selectedCount} {selectedCount === 1 ? 'card' : 'cards'} selected
                </p>
                <div className="declare-numbers">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button
                            key={n}
                            className={`declare-number ${selectedNumber === n ? 'declare-number--selected' : ''}`}
                            onClick={() => setSelectedNumber(n)}
                        >
                            {n}
                        </button>
                    ))}
                </div>
                <div className="declare-actions">
                    <button className="declare-cancel" onClick={onCancel}>Cancel</button>
                    <button
                        className="declare-confirm"
                        onClick={() => selectedNumber && onConfirm(selectedNumber)}
                        disabled={!selectedNumber}
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}
export default DeclareModal;