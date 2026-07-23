import './PendingZone.css';

// shows the current play sitting in the pending zone waiting to be challenged or merged
// also shows the challenge button when the window is open
function PendingZone({ pendingPlay, players, phase, onChallenge, myId, isMyTurn, roundDeclaredNumber }) {

    // can challenge if: window is open, it wasn't our play, and it's not our turn to declare
    const canChallenge = phase === 'challenge_open'
        && pendingPlay
        && pendingPlay.playerId !== myId
        && !isMyTurn;

    // find the name of whoever made the pending play
    const playedBy = players.find(p => p.id === pendingPlay?.playerId);

    return (
        <div className="pending-zone">

            {/* show the declared number for the round if one exists */}
            {roundDeclaredNumber && (
                <div className="pending-round-number">
                    Round: <span>{roundDeclaredNumber}s</span>
                </div>
            )}

            {pendingPlay ? (
                <>
                    <div className="pending-info">
                        <span className="pending-player">{playedBy?.name}</span>
                        <span className="pending-declaration">
                            played {pendingPlay.declaredCount} × {pendingPlay.declaredNumber}
                        </span>
                    </div>

                    {/* face-down cards in the pending zone — animate in from below */}
                    <div className="pending-cards">
                        {Array.from({ length: pendingPlay.declaredCount }).map((_, i) => (
                            <div
                                key={i}
                                className="pending-card"
                                style={{ animationDelay: `${i * 60}ms` }}  // cards arrive one after another
                            />
                        ))}
                    </div>

                    {/* challenge button — only active when window is open */}
                    {canChallenge && (
                        <button className="challenge-button" onClick={onChallenge}>
                            Challenge
                        </button>
                    )}

                    {/* show a subtle label during cooldown so players know why they can't challenge yet */}
                    {phase === 'cooldown' && (
                        <p className="pending-cooldown">Settling...</p>
                    )}
                </>
            ) : (
                <p className="pending-empty">
                    {roundDeclaredNumber
                        ? `Playing ${roundDeclaredNumber}s — waiting for next play`
                        : 'Waiting for first play...'}
                </p>
            )}
        </div>
    );
}

export default PendingZone;
