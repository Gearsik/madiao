import { useState, useEffect, useRef, useCallback } from 'react';
import socket from '../../socket';
import PlayerFrame from './PlayerFrame';
import CardHand from './CardHand';
import Pile from './Pile';
import PlayerPendingZone from './PlayerPendingZone';
import DeclareModal from './DeclareModal';
import { ChallengeNotification, TimeoutNotification } from './ChallengeNotification';
import GameOverNotification from './GameOverNotification';
import './GameTable.css';
import { turnDurationMs, autoSubmitLeadMs } from '../../shared/constants';









// #region TABLE LAYOUT
// ========== TABLE LAYOUT ==========

//the order here decides where each opponent sits depending on how many players are in the game
const playersSeats = {
    2: ['top-centre'],
    3: ['top-right', 'top-left'],
    4: ['mid-right', 'top-centre', 'mid-left'],
    5: ['mid-right', 'top-right', 'top-left', 'mid-left'],
    6: ['mid-right', 'top-right', 'top-centre', 'top-left', 'mid-left'],
};  

const MAX_CARDS_PER_PLAY = 10;
const TURN_DURATION_SECONDS = turnDurationMs / 1000;

//this is the main game screen, it keeps the client-side game state in sync with the server
//and passes the parts each smaller component needs to display the table
function GameTable ({initialGameData, onMainMenu}){


    // #region GAME STATE
    // ========== GAME STATE ==========
    //game state, all of it arrives from the server and none of it is worked out here

    const [players, setPlayers] = useState(initialGameData.players);                                        //all players public info
    const [myHand, setMyHand] = useState(initialGameData.hand);                                             //this player's cards at hand
    const [pile, setPile] = useState(initialGameData.pile ?? { count: 0 });                                 //how many cards are sat in the pile
    const [pendingPlay, setPendingPlay] = useState(initialGameData.pendingPlay);                            //the play waiting to be challenged, or null when there isn't one
    const [currentPlayerIndex, setCurrentPlayerIndex] = useState(initialGameData.currentPlayerIndex);       //whose turn it is
    const [phase, setPhase] = useState(initialGameData.phase);                                              //current game phase
    const [winner, setWinner] = useState(initialGameData.winner);                                           //null until we have a winner
    const [gameOverInfo, setGameOverInfo] = useState(initialGameData.gameOverInfo ?? null);                 //extra detail about how the game ended, used by the game over screen
    const [roundDeclaredNumber, setRoundDeclaredNumber] = useState(initialGameData.roundDeclaredNumber);    //the number in play this round
    const [turnStartedAt, setTurnStartedAt] = useState(initialGameData.turnStartedAt ?? null);              //server timestamp of when the current turn began, used to calculate time remaining

    //  #region LOCAL UI STATE
    // ========== LOCAL UI STATE ==========
    //UI state, this lot is purely local and never leaves the browser

    const [selectedCards, setSelectedCards] = useState([]);                                                 //card IDs the player has selected in their hand
    const [pendingZoneCards, setPendingZoneCards] = useState([]);                                           //cards that have been declared, they stay face up to us while they wait

    const [showDeclare, setShowDeclare] = useState(false);                                                  //whether the declare window is open or not
    const [playingCards, setPlayingCards] = useState(false);                                                //true when the animation plays
    const [turnTimeLeft, setTurnTimeLeft] = useState(null);                                                 //seconds left on the current turn, counted down locally

    const [error, setError] = useState('');                                                                 //error message from the server
    const [challengeResult, setChallengeResult] = useState(null);                                           //the challenge result screen
    const [timeoutPlayerName, setTimeoutPlayerName] = useState(null);                                                 //the "did not play in time" screen
    const [drinkingNotif, setDrinkingNotif] = useState(null);                                               //who is currently drinking and how drunk that leaves them
    const [eliminated, setEliminated] = useState(null);                                                     //elimination notification

    const [rematchReadyPlayerIds, setRematchReadyPlayerIds] = useState([]);                                 //everyone who has pressed ready on the game over screen
    const [rematchPlayerCount, setRematchPlayerCount] = useState(players.length);                           //how many players we are waiting on for that rematch

    //manual clicks and the automatic timer can happen very close together, this stops the same play being sent twice
    const submissionStartedRef = useRef(false);

    //keeps hold of the short card animation delay so it can be cancelled if the turn ends before the cards are sent
    const submissionTimerRef = useRef(null);

    //these callbacks stay the same between renders so the notification timers don't restart unnecessarily
    const handleChallengeDone = useCallback(() => {
        setChallengeResult(null);
    }, []);

    const handleTimeoutDone = useCallback(() => {
        setTimeoutPlayerName(null);
    }, []);


    //  #region CURRENT PLAYER/TABLE DATA
    // ========== CURRENT PLAYER/TABLE DATA ==========

    //find where we are sat in the player list by matching our own socket id
    const myIndex = players.findIndex(p => p.id === socket.id);
    const isMyTurn = currentPlayerIndex === myIndex;    //true when it is this player's turn

    const me = players[myIndex];
    const amIOut = me?.isOut ?? false;                  //eliminated players stay on the screen but cannot do anything

    //a null round number means this is the first play and the player still needs to choose a declaration, == allows us to catch both null and undentify
    const isFirstPlay = roundDeclaredNumber == null;

    //we also should have the cards sorted, only the ones at hand, im going with wildcards on the left and 10 -> descanding so from left to right
    //sorting on every render keeps the hand in the same order no matter what order the cards actually arrived in
    const sortedHand = [...myHand].sort((a, b) => {
        if (a.type === 'wild' && b.type !== 'wild') return -1;      //wilds cards go left
        if (a.type !== 'wild' && b.type === 'wild') return 1;       //numbers go onto their right
        if (a.type === 'wild' && b.type === 'wild') return 0;       //wild cards stay grouped
        return b.value - a.value;                                   //everything else counts down from 10
    });

    //place the opponents around the table in the same order the server takes turns in
    //we step forward through the player list starting from the player after us, which puts them anti-clockwise around the table
    //that way the turn passing round the table matches the order the server is actually using
    const opponentSeats = (() => {
        const out = [];
        const total = players.length;

        for(let i = 1; i < total; i++) {
            const index = (myIndex + i) % total;                     //wrap back to the start of the list when we run off the end
            out.push({...players[index], originalIndex: index});     //keep their real position, the seat needs it to know whose turn it is
        }

        return out;
    })();    

    const opponentSeatNames = playersSeats[players.length] ?? [];       //seat name for each opponent in the above order

    //any active player can challenge while the window is open, except the player who made the pending play
    const canChallenge = !amIOut && phase === 'challenge_open' && pendingPlay !== null && pendingPlay.playerId !== socket.id;

    //a play can only be submitted during your own playable turn and while at least one card is selected
    const canDeclare = !amIOut && isMyTurn && selectedCards.length > 0 && !playingCards && (phase === 'waiting' || phase === 'challenge_open');

    const isRematchReady = rematchReadyPlayerIds.includes(socket.id);

    //the opening player has to choose a number, everybody after them is locked into it, so the button says so
    const playButtonLabel = isFirstPlay ? 'Declare' : `Play as ${roundDeclaredNumber}s`;

    //  #region HELPERS
    // ========== HELPERS ==========

    //clears cards that were selected but have not become a confirmed pending play
    function clearSectionDraft(){
        setSelectedCards([]);
        setShowDeclare(false);
        setPlayingCards(false);
    }

    //clears the face up preview of the cards we have already declared
    function clearPendingPreview(){
        setPendingZoneCards([]);
    }

    //wipes everything to do with playing cards and unlocks submitting again, used whenever the turn is well and truly over
    function clearEntirePlayDraft(){

        //if the cards were still waiting for their short submit animation, stop them being sent after the turn has already ended
        if(submissionTimerRef.current){
            clearTimeout(submissionTimerRef.current);
            submissionTimerRef.current = null;
        }

        clearSectionDraft();
        clearPendingPreview();

        submissionStartedRef.current = false;
    }

    //  #region SERVER EVENTS
    // ========== SERVER EVENTS ==========

    //listen for all game events from the server
    //the empty dependency array means this only ever runs once, when the screen first appears
    useEffect(() => {

        //this is the main public state update and keeps every client looking at the same game
        function handleGameStateUpdated(data){

            //the screen would break badly on a malformed payload, so we check before touching any of it
            if (!data || !Array.isArray(data.players)){
                console.error('BAD game_state_updated payload:', data);
                return
            }

            setPlayers(data.players);
            setPile(data.pile);
            setPendingPlay(data.pendingPlay);
            setCurrentPlayerIndex(data.currentPlayerIndex);
            setPhase(data.phase);
            setWinner(data.winner);
            setGameOverInfo(data.gameOverInfo ?? null);
            setRoundDeclaredNumber(data.roundDeclaredNumber);
            setTurnStartedAt(data.turnStartedAt);

            //the server only reaches these phases after any drinking animation has finished
            //so seeing any of them is our signal to take the drinking overlay down
            const drinkingHasFinished =
                data.phase === 'waiting' ||
                data.phase === 'challenge_open' ||
                data.phase === 'game_over';

            if (drinkingHasFinished){
                setDrinkingNotif(null);
            }

            //we work these out from the incoming data rather than from state, since state has not caught up yet at this point
            const updatedMyIndex = data.players.findIndex(player => player.id === socket.id);
            const willBeMyTurn = data.currentPlayerIndex === updatedMyIndex;
            const mySubmittedPlayIsStillPending = data.pendingPlay?.playerId === socket.id;

            //cards that were selected but never sent should not carry over into somebody else's turn
            if (!willBeMyTurn){
                clearSectionDraft();
            }

            //our face up preview is only meant to be there while our own play is still waiting to be challenged
            if (!mySubmittedPlayIsStillPending){
                clearPendingPreview();
            }

            //nothing should be left selected once the game is finished
            if (data.phase === 'game_over'){
                clearEntirePlayDraft();
            }

        }

        //the server sends the full private hand whenever this player has to take the pile
        function handleHandUpdated(data){
            setMyHand(data.hand);
            setPlayingCards(false);
            submissionStartedRef.current = false;
        }

        //a resolved challenge clears the current draft and opens the shared result screen
        function handleChallengeResult(data){
            clearEntirePlayDraft();
            setChallengeResult(data);
        }

        //the timeout message is shown first, the separate player_drinking event starts the avatar animation afterwards
        function handleTimeoutDrink(data){
            setTimeoutPlayerName(data.playerName);

            if (data.playerId === socket.id) {
                clearEntirePlayDraft();
            }
        }

        //the previous result screen is removed before the drinking animation begins around the player's avatar
        function handlePlayerDrinking(data){
            setChallengeResult(null);
            setTimeoutPlayerName(null);

            setDrinkingNotif({
                playerId: data.playerId,
                drunkness: data.drunkness
            });
        }

        function handlePlayerEliminated(data){
            setEliminated(data);

            setTimeout(() => {
                setEliminated(null);
            }, 4000);
        }

        function handleGameError(data) {
            setError(data.message);

            setTimeout(() => {
                setError('');
            }, 3000);
        }

        function handleRematchStatus(data) {
            setRematchReadyPlayerIds(data.readyPlayerIds ?? []);

            if (typeof data.playerCount === 'number') {
                setRematchPlayerCount(data.playerCount);
            }
        }

        //GameTable stays mounted after Game Over, so a rematch replaces the finished state inside the same component
        function handleGameStarted(data) {
            setPlayers(data.players);
            setMyHand(data.hand);
            setPile(data.pile ?? { count: 0 });
            setPendingPlay(data.pendingPlay ?? null);
            setCurrentPlayerIndex(data.currentPlayerIndex);
            setPhase(data.phase);
            setWinner(data.winner ?? null);
            setGameOverInfo(data.gameOverInfo ?? null);
            setRoundDeclaredNumber(data.roundDeclaredNumber ?? null);
            setTurnStartedAt(data.turnStartedAt ?? null);

            clearEntirePlayDraft();

            setChallengeResult(null);
            setTimeoutPlayerName(null);
            setDrinkingNotif(null);
            setEliminated(null);

            setRematchReadyPlayerIds([]);
            setRematchPlayerCount(data.players.length);
            setTurnTimeLeft(null);
        }

        socket.on('game_state_updated', handleGameStateUpdated);
        socket.on('hand_updated', handleHandUpdated);
        socket.on('challenge_result', handleChallengeResult);
        socket.on('timeout_drink', handleTimeoutDrink);
        socket.on('player_drinking', handlePlayerDrinking);
        socket.on('player_eliminated', handlePlayerEliminated);
        socket.on('game_error', handleGameError);
        socket.on('rematch_status', handleRematchStatus);
        socket.on('game_started', handleGameStarted);

        //remove only the listeners created by this component rather than every listener using the same event name
        return () => {
            socket.off('game_state_updated', handleGameStateUpdated);
            socket.off('hand_updated', handleHandUpdated);
            socket.off('challenge_result', handleChallengeResult);
            socket.off('timeout_drink', handleTimeoutDrink);
            socket.off('player_drinking', handlePlayerDrinking);
            socket.off('player_eliminated', handlePlayerEliminated);
            socket.off('game_error', handleGameError);
            socket.off('rematch_status', handleRematchStatus);
            socket.off('game_started', handleGameStarted);
        };
    }, []);

    //  #region AUTO-SUBMIT
    // ========== AUTO-SUBMIT ==========
    //auto-submit, so a player who has already picked their cards is not punished for being slow on the button

    useEffect(() => {

        if (!isMyTurn) return;                          //only ever acts on our own turn
        if(turnStartedAt === null) return;              //no turn is running, so there is nothing to count down to
        if(selectedCards.length === 0) return;          //nothing picked, so there is nothing to send
        if (isFirstPlay) return;                        
        if (submissionStartedRef.current) return;       //a play is already on its way

        //the first play needs a number chosen in the declaration window, later plays already know the round number
        //trigger tiny bit before the server's deadline, that gap allows the play time to actually reach the server
        const autoSubmitAt = turnStartedAt + turnDurationMs - autoSubmitLeadMs;
        const delay = Math.max(0, autoSubmitAt - Date.now());

        const timer = setTimeout(() => {
            if(submissionStartedRef.current) return;    //checked again here, they may well have pressed the button while we were waiting

            submitSelectedCards(roundDeclaredNumber, {  //no time left for the animation, this one needs to go straight away
                skipAnimationDelay: true
            })
        }, delay);

        return() => clearTimeout(timer);

    }, [turnStartedAt, isMyTurn, selectedCards, isFirstPlay, roundDeclaredNumber]);

    //  #region TURN TIMER
    // ========== TURN TIMER ==========
    //the visible turn countdown
    //it is worked out from the server's timestamp rather than counted down locally, so a slow or busy browser cannot drift out of sync

    useEffect(() => {

        if (turnStartedAt === null){
            setTurnTimeLeft(null);
            return;
        }
        
        setTurnTimeLeft(TURN_DURATION_SECONDS);

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
            const remaining = Math.max(0, TURN_DURATION_SECONDS - elapsed);

            setTurnTimeLeft(remaining);
        }, 1000);

        return () => clearInterval(interval);

    }, [turnStartedAt]);

    //  #region PLAYERS ACTION
    // ========== PLAYERS ACTION ==========

    //selecting a card moves it into the local pending preview, clicking it there deselects it again
    function handleCardsClick(cardId){

        if(amIOut) return;                                              //eliminated players are spectators
        if(!isMyTurn) return;                                           //can't select cards when its not your turn
        if(phase !== 'waiting' && phase !== 'challenge_open') return;   //and only during the phases where a play would be accepted

        const isAlreadySelected = selectedCards.includes(cardId);

        //the server enforces this limit too, we check it here as well so the player finds out immediately instead of after sending
        if (!isAlreadySelected && selectedCards.length >= MAX_CARDS_PER_PLAY){

            setError(`You can select a maximum of ${MAX_CARDS_PER_PLAY} cards`)
            setTimeout(() => {
                setError('');
            }, 3000);   
            return;
        }
    
        setSelectedCards(prev =>
            prev.includes(cardId)
                ? prev.filter(id => id !== cardId)      //deselect if already selected
                : [...prev, cardId]                     //select if not selected
        );
    }

    //called when the player clicks Declare and opens up the Declare window menu, every play after that already uses the number set for the round
    function handleDeclare(){
        if(selectedCards.length === 0) return;     //need at least 1 card selected

        //the opening player still has a number to choose, so we open the declare window instead of sending anything
        if (isFirstPlay){
            setShowDeclare(true);
            return;
        }

        //everybody after them is locked into the number the round is already being played as
        submitSelectedCards(roundDeclaredNumber);
    }
    
    //triggered when the player confirms the number they want to declare
    function handleConfirmDeclare(declaredNumber){
        submitSelectedCards(declaredNumber);
    }

    //runs when they back out of the declare window, the cards stay selected so they can try again
    function handleCancelDeclare(){
        setShowDeclare(false);
    }

    //keeps the cards visible locally while the server checks and confirms the submitted play
    function submitSelectedCards(declaredNumber, {skipAnimationDelay = false} = {}){
        if(submissionStartedRef.current) return;        //a play is already on its way, this stops the button and the timer sending the same one twice
        if(selectedCards.length === 0) return;
        if(declaredNumber == null) return;
    
        submissionStartedRef.current = true;

        const cardIds = [...selectedCards];
        const cardsData = sortedHand.filter(card => cardIds.includes(card.id));

        //move the cards into our own pending zone, where they stay face up to us while everybody else only sees the backs
        setPendingZoneCards(cardsData);
        setSelectedCards([]);                       //the selection is cleared straight away rather than after the animation, so the cards do not appear in two places at once
        setShowDeclare(false);
        setPlayingCards(true);                      //start the animation that takes the cards out of the hand

        const emitDeclaration = () => {

            //the delayed submission has now either fired or been skipped
            submissionTimerRef.current = null;

            //the timeout means we hear about a dead connection instead of leaving the player staring at a frozen screen
            socket.timeout(3000).emit('declareCards', {
                cardIds,
                declaredNumber
            },
            (timeoutError, response) => {
                setPlayingCards(false);
                submissionStartedRef.current = false;

                //the server turned the play down, or never answered at all
                if(timeoutError || !response?.ok){

                    //the server rejected the play before changing myHand, so put the cards back into the local selection
                    setPendingZoneCards([]);
                    setSelectedCards(cardIds);

                    setError(response?.message ?? 'The server did not confirm your play');

                    setTimeout(() => {
                        setError('');
                    }, 3000);
                }
            });
        };

        //if the turn is nearly over there is not enough room for the animation delay,
        //so send the cards immediately just like the automatic submission does
        const timeRemaining =
            turnStartedAt === null
                ? Infinity
                : (turnStartedAt + turnDurationMs) - Date.now();

        const shouldSkipAnimation =
            skipAnimationDelay  || timeRemaining <= 600 + autoSubmitLeadMs;

        if(shouldSkipAnimation){
            emitDeclaration();
        } else {
            submissionTimerRef.current = setTimeout(() => {
                submissionTimerRef.current = null;
                emitDeclaration();
            }, 600);
        }

    }

    //activates when the a player clicks the challenge button
    //the server does all the work here, all we do is say that we pressed it
    function handleChallenge(){
        if (!pendingPlay) return;

        socket.emit('challenge', {
            pendingPlayerId: pendingPlay.playerId
        });
    }

    //activates when the player leaves the finished game from the game over screen
    function handleMainMenu(){
        socket.timeout(3000).emit('leaveGame', (timeoutError, response) => {

            //if the server never confirmed it we stay put, leaving the screen anyway would drop them out of a lobby they are still sat in
            if (timeoutError || !response?.ok){
                setError('Could not leave the game');

                setTimeout(() => {
                    setError('');
                }, 3000);

                return;
            }

            onMainMenu?.();
        });
    }

    //pressing play again is a toggle, pressing it a second time takes the ready back off
    function handlePlayAgain(){
        socket.emit('toggleRematchReady');
    }

    //  #region RENDER DATA
    // ========== RENDER DATA ==========

    //the hand only shows the cards that are not being displayed somewhere else
    //anything selected or already declared is drawn in the pending zone instead, so it is filtered out here to avoid drawing it twice
    const pendingZoneIds = new Set(pendingZoneCards.map(c => c.id));
    const handCards = sortedHand.filter(c => !selectedCards.includes(c.id) && !pendingZoneIds.has(c.id));

    if(myIndex === -1) return null;                     //if we can't find ourselves in the player list yet, don't render

    //the game over screen waits its turn, going up on top of a challenge or a drink would hide the reason the game ended
    const canShowGameOver = winner && !challengeResult && !timeoutPlayerName && !drinkingNotif;

    return(
        <div className={`game-table game-table--${players.length}p`}>

            {/* the opponents, each one gets their named seat and their own pending zone */}
            {opponentSeats.map((opponent, seatIndex) => {
                const seatName = opponentSeatNames[seatIndex];
                return (
                    <div key={opponent.id} className={`seat-${seatName}`}>
                        <PlayerFrame
                            player={opponent}
                            isCurrentPlayer={opponent.originalIndex === currentPlayerIndex}
                            isMe={false}
                            turnTimeLeft={opponent.originalIndex === currentPlayerIndex ? turnTimeLeft : null}
                            pendingPlay={pendingPlay}
                            seat={seatName}
                            phase={phase}
                            isDrinking={drinkingNotif?.playerId === opponent.id}
                            drinkingLevel={drinkingNotif?.playerId === opponent.id ? drinkingNotif.drunkness : null}
                        />
                    </div>
                );
            })}

            {/* shared pile in the middle of the table */}
            <div className="table-surface">
                <Pile pile={pile} />
            </div>

            {/* our own player frame, bottom left */}
            <div className="my-frame">
                <PlayerFrame
                    player={players[myIndex]}
                    isCurrentPlayer={isMyTurn}
                    isMe={true}
                    turnTimeLeft={isMyTurn ? turnTimeLeft : null}
                    pendingPlay={pendingPlay}
                    seat={null}
                    phase={phase}
                    isDrinking={drinkingNotif?.playerId === socket.id}
                    drinkingLevel={drinkingNotif?.playerId === socket.id 
                        ? drinkingNotif.drunkness 
                        : null
                    }
                />
            </div>

            {/* our own pending zone, sat above the hand, this is the one place cards are shown face up */}
            {(selectedCards.length > 0 || pendingZoneCards.length > 0) && (
                <div className='my-pending-zone'>
                    <PlayerPendingZone
                        declaredCount={pendingZoneCards.length > 0 ? pendingZoneCards.length : selectedCards.length}
                        singleRow={true}
                        faceUp={true}
                        myPendingCards={pendingZoneCards.length > 0 ? pendingZoneCards : sortedHand.filter(c => selectedCards.includes(c.id))}
                        onCardClick={pendingZoneCards.length > 0 ? null : handleCardsClick}
                        isMyTurn={isMyTurn}
                        isSubmitting={playingCards}
                    />
                </div>
            )}

            {/* the hand and the two action buttons */}
            <div className="hand-and-buttons">
                <div className="my-hand-area">
                    <CardHand
                        cards={handCards}
                        onCardClick={handleCardsClick}
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
            </div>

            {/* declare window that is shown when player clicks Declare button */}
            {showDeclare && (
                <DeclareModal
                    selectedCount={selectedCards.length}
                    onConfirm={handleConfirmDeclare}
                    onCancel={handleCancelDeclare}
                />
            )}
                
            {/* the game over screen, with the rematch and main menu buttons on it */}
            {canShowGameOver && (
                <GameOverNotification
                    winner={winner}
                    players={players}
                    gameOverInfo={gameOverInfo}
                    onPlayAgain={handlePlayAgain}
                    isRematchReady={isRematchReady}
                    rematchReadyCount={rematchReadyPlayerIds.length}
                    rematchPlayerCount={rematchPlayerCount}
                    onMainMenu={handleMainMenu}
                />
            )}

            {/* error message that auto closes after 3 seconds */}
            {error && <div className="game-error-toast">{error}</div>}
            {eliminated && !winner &&(
                <div className="eliminated-toast">
                    {eliminated.playerName} has been eliminated
                </div>
            )}

            {/* the challenge result, it tells us itself when it has finished */}
            {challengeResult && (
                <ChallengeNotification
                    result={challengeResult}
                    onDone={handleChallengeDone}
                />
            )}

            {/* the timeout screen, same idea as the one above */}
            {timeoutPlayerName && (
                <TimeoutNotification
                    playerName={timeoutPlayerName}
                    onDone={handleTimeoutDone}
                />
            )}
        </div>
    );
}
export default GameTable;