import './Pile.css';

//shows the shared pile in the middle of the table
//only the number of cards is public, so the pile itself is always shown face down

function Pile({pile}) {

    const count = pile?.count ?? 0;
    const hasCards = count > 0;

    return (
        <div className="pile">

            {hasCards ? (

                <div className="pile-cards">

                    {/* three slightly offset layers are enough to make the pile look stacked without drawing every card */}
                    <div className="pile-layer" />
                    <div className="pile-layer" />
                    <div className="pile-layer">
                        <div className="pile-count-badge">
                            {count}
                        </div>
                    </div>
                </div>
            ) : (
                <div
                    className="pile-empty"
                    aria-label="Pile is empty"
                >
                    0
                </div>
            )}

            <span className="pile-label">
                Pile
            </span>
        </div>
    );
}

export default Pile;

