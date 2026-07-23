import { useState, useEffect } from "react";
import socket from '../../socket';
import PlayerFrame from './PlayerFrame';
import CardHand from './CardHand';
import Pile from './Pile';
import PendingZone from './PendingZone';
import DeclareModal from './DeclareModal';
import './GameTable.css';

//thats the main screen of the game, everything that players see when the game starts
//it manages all game states and distribiutes it to its child components
function GameTable ({initialGameData, lobbyData}){

    //game state
    const [players, setPlayers] = useState(initialGameData.players);                                        //all players public info
    const [myHand, setMyHand] = useState(initialGameData.hand);                                             //this player's cards at hand
    const [pile, setPile] = useState(initialGameData.pile ?? { count: 0 });                                 //the pile card count
    const [pendingPlay, setPendingPlay] = useState(initialGameData.pendingPlay);                            //cards in the pending play zone or null
    const [currentPlayerIndex, setCurrentPlayerIndex] = useState(initialGameData.currentPlayerIndex);       //whose turn it is
    const [phase, setPhase] = useState(initialGameData.phase);                                              //current game phase
    const [winner, setWinner] = useState(initialGameData.winner);                                           //null until we have a winner
    const [roundDeclaredNumber, setRoundDeclaredNumber] = useState(initialGameData.roundDeclaredNumber);    //the number in play this round
    const [turnStartedAt, setTurnStartedAt] = useState(initialGameData.turnStartedAt ?? null);              //server timestamp of when the current turn began, used to calculate time remaining

    //UI state
    const [selectedCards, setSelectedCards] = useState([]);                                                 //card IDs the player has selected in their hand
    const [showDeclare, setShowDeclare] = useState(false);                                                  //whether the declare window is open or not
    const [playingCards, setPlayingCards] = useState(false);                                                //true when the animation plays
    const [error, setError] = useState('');                                                                 //error message from the server
    const [challengeResult, setChallengeResult] = useState(null);                                           //result data during the 7s result window
    const [eliminated, setEliminated] = useState(null);                                                     //elimination notification
    const [turnTimeLeft, setTurnTimeLeft] = useState(null);

    //find this player's index in the players array using their socket.id
    const myIndex = players.findIndex(p => p.id === socket.id);
    const isMyTurn = currentPlayerIndex === myIndex;    //true when it is this player's turn

    //in the first play of the round there is no number declared yet, we need to pick one, == allows us to catch both null and undentify
    const isFirstPlay = roundDeclaredNumber == null;

    //we also should have the cards sorted, only the ones at hand, im going with wildcards on the left and 10 -> descanding so from left to right
    const sortedHand = [...myHand].sort((a, b) => {
        if (a.type === 'wild' && b.type !== 'wild') return -1;      //wilds cards go left
        if (a.type !== 'wild' && b.type === 'wild') return 1;       //numbers go onto their right
        if (a.type === 'wild' && b.type === 'wild') return 0;       //wild cards stay grouped
        return b.value - a.value;
    });

    //setting up the turn order going anti-clock wise from the player's perspective
    //and returns an array of players in order they should appear around the table
    function getOpponentSeats(){
        const opponents = [];
        const total = players.length;

        //go backwards through the array, so anti-clock wise starting from the player before us
        for(let i = 1; i < total; i++) {
            const index = (myIndex - i + total) % total;
            opponents.push({...players[index], originalIndex: index});     //wrap around the array going backwards
        }
        return opponents;
    }

    const opponentSeats = getOpponentSeats();       //opponents in anti-clock wise seat order

    //triggered when the player selects or deselects cards in their hand
    function handleCardsClick(cardId){
        if(!isMyTurn) return;                                           //can't select cards when its not your turn
        if(phase !== 'waiting' && phase !== 'challenge_open') return;   //can only select cards during the declaring phase
    
        setSelectedCards(prev =>
            prev.includes(cardId)
                ? prev.filter(id => id !== cardId)      //deselect if already selected
                : [...prev, cardId]                     //select if not selected
        );
    }

    //called when the player clicks Declare and opens up the Declare window menu
    function handleDeclare(){
        if(selectedCards.length === 0) return;     //need at least 1 card selected

        if (isFirstPlay){
            setShowDeclare(true);       //first play of the so open the declaration window
        } else{
            playCards(roundDeclaredNumber)       //if the number was declared then just play cards without declaring
        }
    }
    
    //triggered when the player confirms the number they want to declare
    function handleConfirmDeclare(declaredNumber){
        setShowDeclare(false);          //close the declaration window menu
        playCards(declaredNumber);
    }

    //triggered when the player confirms the number they want to declare
    function playCards(declaredNumber) {
        const cardsToPlay = [...selectedCards];     // capture immediately
        setPlayingCards(true);                      //start exit animation on the selected cards
        setSelectedCards([]);                       //clear selection right away, not after timeout

        //wait for the animation to finish before telling the server
        //600ms matches the CSS animation duration
        setTimeout(() => {
            socket.emit('declareCards', {
                cardIds: cardsToPlay,      //the id card of the actual card being played
                declaredNumber              //the number the player claims the card to be
            });

            setSelectedCards([]);           //clear selection after cards being played
            setPlayingCards(false);
        }, 600);
    }

    //triggered when the player chooses to close the menu to for example select different cards
    function handleCancelDeclare(){
        setShowDeclare(false);          //close the window, keep selected cards selected
    }

    //activates when the a player clicks the challenge button
    function handleChallenge(){
        socket.emit('challenge');
    }

    const playButtonLabel = isFirstPlay
    ? `Declare (${selectedCards.length} ${selectedCards.length === 1 ? 'card' : 'cards'})`
    : `Play ${selectedCards.length} × ${roundDeclaredNumber}`;

    //can challenge when: window is open, pending play exists,
    //it's not your play being challenged, and it's not your turn to play
    const canChallenge =
        phase === 'challenge_open' &&
        pendingPlay !== null &&
        pendingPlay.playerId !== socket.id;

    //can declare when it's your turn, you have cards selected,
    //and the phase allows it
    const canDeclare = 
        isMyTurn &&
        selectedCards.length > 0 &&
        !playingCards &&
        (phase === 'waiting' || phase === 'challenge_open');

    //listen for all game events from the server
    useEffect(() => {

        //main state update that activates whenever anything changes in the game
        socket.on('game_state_updated', (data) => {
            setPlayers(data.players);
            setPile(data.pile);
            setPendingPlay(data.pendingPlay);
            setCurrentPlayerIndex(data.currentPlayerIndex);
            setPhase(data.phase);
            setWinner(data.winner);
            setRoundDeclaredNumber(data.roundDeclaredNumber);       //update the round declared number
            setTurnStartedAt(data.turnStartedAt);                   //sync the turn start time whenever the game state updates
            
            if(data.phase === 'cooldown'){
                setTurnTimeLeft(null);
            }

            //update our hand from the player array if the server sent the it
            //only for the local player, as others don't get hand data
        });

        //losers takes the pile
        socket.on('hand_updated', (data) => {
            setMyHand(data.hand);   // full hand replacement when we take the pile
        });

        //show it after a challenge arrives and it was resolved, the window should be up for 7s
        socket.on('challenge_result', (data) => {
            setChallengeResult(data);
            setTimeout(() => setChallengeResult(null), 7000);   //close the window automatically after 7s and reset the result variable to null
        });

        //trigger when a player was eliminated to show a notification to others
        socket.on('player_eliminated', (data) => {
            setEliminated(data);
            setTimeout(() => setEliminated(null), 4000);        //close the notification auto after 4s
        });

        //show a notification if server rejects a request for some reason
        socket.on('game_error', (data) => {
            setError(data.message);
            setTimeout(() => setError(''), 3000);               //close the notification after 3s
        });

        return() => {
            socket.off('game_state_updated');
            socket.off('hand_updated');
            socket.off('challenge_result');
            socket.off('player_eliminated');
            socket.off('game_error');
        };
    }, []);

    useEffect(() => {

        setTurnTimeLeft(turnStartedAt === null ? null : 20);
        const interval = setInterval(() => {
            if(turnStartedAt === null){
                setTurnTimeLeft(null);
                return;
            }
            const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
            const remaining = Math.max(0, 20 - elapsed);
            setTurnTimeLeft(remaining);
        }, 1000);
        return () => clearInterval(interval);
    }, [turnStartedAt]);

    if(myIndex === -1) return null;                     //if we can't find ourselves in the player list yet, don't render


    return(
        <div className="game-table">

            {/* opponent seats arranged around the top of the table */}
            <div className={`opponent-seats opponent-seats--${opponentSeats.length}`}>
                {opponentSeats.map((opponents, seatIndex) => (
                    <PlayerFrame
                        key={opponents.id}
                        player={opponents}
                        isCurrentPlayer={opponents.originalIndex === currentPlayerIndex}
                        seatIndex={seatIndex}
                        totalOpponents={opponentSeats.length}
                        turnTimeLeft={opponents.originalIndex === currentPlayerIndex ? turnTimeLeft : null}

                    />
                ))}
            </div>

            {/* the main table surface */}
            <div className="table-surface">

                {/* pending zone — shows the current play waiting to be challenged or merged */}
                <PendingZone
                    pendingPlay={pendingPlay}
                    players={players}
                    phase={phase}
                    onChallenge={handleChallenge}
                    myId={socket.id}
                    isMyTurn={isMyTurn}
                    currentPlayerIndex={currentPlayerIndex}
                    roundDeclaredNumber={roundDeclaredNumber}
                />
                {/* the pile in the centre of the table */}
                <Pile pile={pile} />
            </div>

            {/* your player frame which is always bottom left */}
            <div className="my-frame">
                <PlayerFrame
                    player={players[myIndex]}
                    isCurrentPlayer={isMyTurn}
                    isMe={true}
                    turnTimeLeft={isMyTurn ? turnTimeLeft : null}
                />
            </div>

            {/* players hand always at the bottom centre for all */}
            <div className="my-hand-area">
                <CardHand
                    cards={sortedHand}
                    selectedCards={selectedCards}
                    onCardClick={handleCardsClick}
                    isMyTurn={isMyTurn}
                    phase={phase}
                    playingCards={playingCards}
                />
            </div>

            <div className="button-area">
                <button
                    className={`declare-button ${canDeclare ? 'action-active' : 'action-inactive'}`}
                    onClick={handleDeclare}
                    disabled={!canDeclare}
                >
                    {playButtonLabel}
                </button>

                <button
                    className={`challenge-button ${canChallenge ? 'action-active' : 'action-inactive'}`}
                    onClick={handleChallenge}
                    disabled={!canChallenge}
                >
                    Challenge
                </button>
            </div>

            {/* declare window that is shown when player clicks Declare button */}
            {showDeclare && (
                <DeclareModal
                    selectedCount={selectedCards.length}
                    onConfirm={handleConfirmDeclare}
                    onCancel={handleCancelDeclare}
                />
            )}

            {/* error message that auto closes after 3 seconds */}
            {error && (
                <div className="game-error-toast">
                    {error}
                </div>
            )}

            {/* elimination notification that disappears after 4 seconds */}
            {eliminated && (
                <div className="eliminated-toast">
                    {eliminated.playerName} has been eliminated
                </div>
            )}

            {/* game over screen */}
            {winner && (
                <div className="game-over-overlay">
                    <div className="game-over-card">
                        <h2 className="game-over-title">Game Over</h2>
                        <p className="game-over-winner">
                            {players.find(p => p.id === winner)?.name} is the winner
                        </p>
                    </div>
                </div>
            )}
            
            {/* challenge result screen that blocks all input for 7 seconds */}
            {challengeResult && (
                <div className="challenge-overlay">
                    <ChallengeResultScreen result={challengeResult} />
                </div>
            )}
        </div>
    );
}


//the challenge screen with the cards shown  and bluff cards highlited
function ChallengeResultScreen({result}){
    return(
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
                {(result.actualCards || []).map((card, i) => {
                    const isBluff = card.type !== 'wild' && card.value !== result.declaredNumber;
                    return(
                        <div
                            key={i}
                            className={`result-card ${isBluff ? 'result-card--bluff' : 'result-card--honest'} ${card.type === 'wild' ? 'result-card--wild' : ''}`}
                            >
                                <span className="result-card-value">
                                    {card.type === 'wild' ? 'W' : card.value}
                                </span>
                        </div>
                    )
                })}
            </div>

            <p className="result-loser">
                {result.loserName} takes the pile
            </p>
        </div>
    )
}

export default GameTable;