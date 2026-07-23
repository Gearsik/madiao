import { useState, useEffect } from "react";
import socket from '../../socket';
import PlayerFrame from './PlayerFrame';
import CardHand from './CardHand';
import Pile from './Pile';
import PendingZone from './PendingZone';
import DeclareModal from './DeclareModal';
import './GameTable.css';

// the main game screen — manages all game state and passes it down to child components
function GameTable({ initialGameData, lobbyData }) {

    // --- game state from server ---
    const [players, setPlayers] = useState(initialGameData.players);
    const [myHand, setMyHand] = useState(initialGameData.hand);
    const [pile, setPile] = useState(initialGameData.pile);
    const [pendingPlay, setPendingPlay] = useState(initialGameData.pendingPlay);
    const [currentPlayerIndex, setCurrentPlayerIndex] = useState(initialGameData.currentPlayerIndex);
    const [phase, setPhase] = useState(initialGameData.phase);
    const [winner, setWinner] = useState(initialGameData.winner);
    const [roundDeclaredNumber, setRoundDeclaredNumber] = useState(initialGameData.roundDeclaredNumber); // the number in play this round

    // --- local UI state ---
    const [selectedCards, setSelectedCards] = useState([]);         // card ids the player has clicked
    const [showDeclare, setShowDeclare] = useState(false);          // whether the declare modal is open
    const [playingCards, setPlayingCards] = useState(false);        // true during the play animation
    const [error, setError] = useState('');                         // error message from the server
    const [challengeResult, setChallengeResult] = useState(null);   // result data during the 7s result screen
    const [eliminated, setEliminated] = useState(null);             // elimination notification data

    // find this player's position and whether it's their turn
    const myIndex = players.findIndex(p => p.id === socket.id);
    const isMyTurn = currentPlayerIndex === myIndex;

    // true if this is the first play of the round — no declared number yet means we need to pick one
    const isFirstPlay = roundDeclaredNumber === null;

    // sort hand: wilds leftmost, then numbers descending (10 → 1 rightmost)
    const sortedHand = [...myHand].sort((a, b) => {
        if (a.type === 'wild' && b.type !== 'wild') return -1;  // wilds go left
        if (a.type !== 'wild' && b.type === 'wild') return 1;   // numbers go right of wilds
        if (a.type === 'wild' && b.type === 'wild') return 0;   // wilds stay grouped
        return b.value - a.value;                                // numbers descending
    });

    // arrange opponents anti-clockwise around the table from this player's perspective
    function getOpponentSeats() {
        const opponents = [];
        const total = players.length;
        for (let i = 1; i < total; i++) {
            const index = (myIndex - i + total) % total;   // step backwards = anti-clockwise
            opponents.push({ ...players[index], originalIndex: index });
        }
        return opponents;
    }

    const opponentSeats = getOpponentSeats();

    // toggle a card selected or deselected in the player's hand
    function handleCardClick(cardId) {
        if (!isMyTurn) return;
        if (phase !== 'waiting' && phase !== 'challenge_open') return;

        setSelectedCards(prev =>
            prev.includes(cardId)
                ? prev.filter(id => id !== cardId)  // deselect
                : [...prev, cardId]                  // select
        );
    }

    // called when player clicks the Declare button — first play needs the modal, subsequent plays don't
    function handleDeclare() {
        if (selectedCards.length === 0) return;

        if (isFirstPlay) {
            setShowDeclare(true);   // first play — open the modal to pick a number
        } else {
            // round already has a declared number — play immediately without the modal
            playCards(roundDeclaredNumber);
        }
    }

    // called when the player confirms a number in the declare modal
    function handleConfirmDeclare(declaredNumber) {
        setShowDeclare(false);
        playCards(declaredNumber);
    }

    // handles the actual card play — triggers animation then emits to server
    function playCards(declaredNumber) {
        setPlayingCards(true);  // start exit animation on the selected cards

        // wait for the animation to finish before telling the server
        // 600ms matches the CSS animation duration
        setTimeout(() => {
            socket.emit('declareCards', {
                cardIds: selectedCards,
                declaredNumber
            });
            // remove played cards from hand immediately — don't wait for server confirmation
            setMyHand(prev => prev.filter(card => !selectedCards.includes(card.id)));
            setSelectedCards([]);
            setPlayingCards(false);
        }, 600);
    }

    // called when player cancels out of the declare modal — keeps their selection
    function handleCancelDeclare() {
        setShowDeclare(false);
    }

    // called when player clicks the challenge button
    function handleChallenge() {
        socket.emit('challenge');
    }

    // listen for all game events from the server
    useEffect(() => {

        // main state update — fires whenever anything changes in the game
        socket.on('game_state_updated', (data) => {
            setPlayers(data.players);
            setPile(data.pile);
            setPendingPlay(data.pendingPlay);
            setCurrentPlayerIndex(data.currentPlayerIndex);
            setPhase(data.phase);
            setWinner(data.winner);
            setRoundDeclaredNumber(data.roundDeclaredNumber);   // update the round declared number
        });

        // loser took the pile — update our full hand
        socket.on('hand_updated', (data) => {
            setMyHand(data.hand);
        });

        // challenge resolved — show result screen for 7 seconds
        socket.on('challenge_result', (data) => {
            setChallengeResult(data);
            setTimeout(() => setChallengeResult(null), 7000);
        });

        // a player was eliminated — show notification briefly
        socket.on('player_eliminated', (data) => {
            setEliminated(data);
            setTimeout(() => setEliminated(null), 4000);
        });

        // server rejected an action — show the reason
        socket.on('game_error', (data) => {
            setError(data.message);
            setTimeout(() => setError(''), 3000);
        });

        return () => {
            socket.off('game_state_updated');
            socket.off('hand_updated');
            socket.off('challenge_result');
            socket.off('player_eliminated');
            socket.off('game_error');
        };
    }, []);

    // label for the play button changes based on whether this is the first play or not
    const playButtonLabel = isFirstPlay
        ? `Declare (${selectedCards.length} ${selectedCards.length === 1 ? 'card' : 'cards'})`
        : `Play ${selectedCards.length} × ${roundDeclaredNumber}`;

    return (
        <div className="game-table">

            {/* opponents arranged anti-clockwise around the top of the table */}
            <div className={`opponent-seats opponent-seats--${opponentSeats.length}`}>
                {opponentSeats.map((opponent, seatIndex) => (
                    <PlayerFrame
                        key={opponent.id}
                        player={opponent}
                        isCurrentPlayer={opponent.originalIndex === currentPlayerIndex}
                        seatIndex={seatIndex}
                        totalOpponents={opponentSeats.length}
                    />
                ))}
            </div>

            {/* main table surface with pending zone and pile */}
            <div className="table-surface">
                <PendingZone
                    pendingPlay={pendingPlay}
                    players={players}
                    phase={phase}
                    onChallenge={handleChallenge}
                    myId={socket.id}
                    isMyTurn={isMyTurn}
                    roundDeclaredNumber={roundDeclaredNumber}
                />
                <Pile pile={pile} />
            </div>

            {/* this player's frame — always bottom left */}
            <div className="my-frame">
                <PlayerFrame
                    player={players[myIndex]}
                    isCurrentPlayer={isMyTurn}
                    isMe={true}
                />
            </div>

            {/* this player's hand — always bottom centre */}
            <div className="my-hand-area">
                <CardHand
                    cards={sortedHand}
                    selectedCards={selectedCards}
                    onCardClick={handleCardClick}
                    isMyTurn={isMyTurn}
                    phase={phase}
                    playingCards={playingCards}
                />

                {/* play/declare button — only shown on this player's turn with cards selected */}
                {isMyTurn && selectedCards.length > 0 && !playingCards && (
                    <button
                        className="declare-button"
                        onClick={handleDeclare}
                    >
                        {playButtonLabel}
                    </button>
                )}
            </div>

            {/* declare modal — only shown on the first play of a round */}
            {showDeclare && (
                <DeclareModal
                    selectedCount={selectedCards.length}
                    onConfirm={handleConfirmDeclare}
                    onCancel={handleCancelDeclare}
                />
            )}

            {/* error toast — auto-dismisses after 3 seconds */}
            {error && <div className="game-error-toast">{error}</div>}

            {/* elimination notification — auto-dismisses after 4 seconds */}
            {eliminated && (
                <div className="elimination-toast">
                    {eliminated.playerName} has been eliminated
                </div>
            )}

            {/* game over screen */}
            {winner && (
                <div className="game-over-overlay">
                    <div className="game-over-card">
                        <h2 className="game-over-title">Game Over</h2>
                        <p className="game-over-winner">
                            {players.find(p => p.id === winner)?.name} wins!
                        </p>
                    </div>
                </div>
            )}

            {/* challenge result screen — blocks all input for 7 seconds */}
            {challengeResult && (
                <div className="challenge-overlay">
                    <ChallengeResultScreen result={challengeResult} />
                </div>
            )}
        </div>
    );
}

// shows the result of a challenge — the actual cards played, with bluffs highlighted
function ChallengeResultScreen({ result }) {
    return (
        <div className="challenge-result-card">
            <h2 className={result.honest ? 'result-honest' : 'result-bluff'}>
                {result.honest ? 'Honest Play!' : 'Bluff Caught!'}
            </h2>
            <p className="result-summary">
                {result.challengerName} challenged {result.accusedName}
            </p>
            <p className="result-declared">
                Declared as {result.declaredNumber}s
            </p>

            {/* show each card that was played, highlight non-matching ones in red */}
            <div className="result-cards">
                {result.actualCards.map((card, i) => {
                    const isBluff = card.type !== 'wild' && card.value !== result.declaredNumber;
                    return (
                        <div
                            key={i}
                            className={`result-card ${isBluff ? 'result-card--bluff' : 'result-card--honest'} ${card.type === 'wild' ? 'result-card--wild' : ''}`}
                        >
                            <span className="result-card-value">
                                {card.type === 'wild' ? 'W' : card.value}
                            </span>
                        </div>
                    );
                })}
            </div>

            <p className="result-loser">
                {result.loserName} takes the pile
            </p>
        </div>
    );
}

export default GameTable;
