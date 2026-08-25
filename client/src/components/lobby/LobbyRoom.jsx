import { useState, useEffect } from "react";
import socket from '../../socket';
import './LobbyRoom.css';

// #region LOBBY SETUP
// ========== LOBBY SETUP ==========

const MAX_PLAYERS = 6;

//waiting area where players gather before the game starts
function LobbyRoom({lobbyData, onGameStarted}){

    // #region LOBBY STATE
    // ========== LOBBY STATE ==========
    
    const [players, setPlayers] = useState(lobbyData.players);      //list of the players in the lobby, updating live
    const [hostId, setHostId] = useState(lobbyData.hostId);         //showing who the host is
    const [copied, setCopied] = useState(false);                    //activates briefly after copying the code
    const [error, setError] = useState('');                         //error from the server if the start gets rejected
    const canStart = players.length >= 2;                           //host is only allowed to start the game if there are at least 2 people in the lobby
    const isHost = hostId === socket.id;                            //everything below either shows the host controls or the waiting message based on this

    const hostPlayer = players.find(player => player.id === hostId);    //needed so we can name the host in the waiting message

    //the table always has 6 visible seats, empty ones are filled with null so the layout never changes shape
    const lobbySlots = Array.from(
        {length: MAX_PLAYERS},
        (_, index) => players[index] ?? null
    );

    // #region LOBBY ACTIONS
    // ========== LOBBY ACTIONS ==========

    //copies the invite code, with an older browser fallback for cases where the Clipboard API is not available
    function handleCopyCode(){
        const code = lobbyData.code;

        function showCopied(){
            setCopied(true);

            setTimeout(() => {
                setCopied(false);
            }, 2000);
        }

        function fallbackCopy(){
            const textArea = document.createElement('textarea');

            textArea.value = code;

            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';

            document.body.appendChild(textArea);

            textArea.focus();
            textArea.select();

            document.execCommand('copy');

            document.body.removeChild(textArea);

            showCopied();
        }

        if (navigator.clipboard && window.isSecureContext){
            navigator.clipboard
                .writeText(code)
                .then(showCopied)
                .catch(() => {
                    fallbackCopy();
                });

            return;
        }

        fallbackCopy();
    }

    //the button is already disabled with less than 2 players, this check makes sure nothing is sent if it somehow gets triggered anyway
    function handleStart(){
        if(!canStart) return;                                       //extra guard, the button should already be disabled
        setError('');
        socket.emit('startGame');                                   //tell the server to start the game
    }

    // #region SERVER EVENTS
    // ========== SERVER EVENTS ==========

    //keep the waiting room in sync until the server tells us the actual game has started
    useEffect(() => {

        //players can join, leave or cause the host to change while everybody is waiting here
        function handleLobbyUpdated(data){
            setPlayers(data.players);
            setHostId(data.hostId);
        }

        //pass the initial game state back up so the app can replace the lobby with the game table
        function handleGameStarted(data){
            onGameStarted(data);
        }

        //most likely the host tried to start too early or the server rejected the request for another reason
        function handleGameError(data){
            setError(data.message);
        }

        //when another player joined or left, update the player list and host
        socket.on('lobby_updated', handleLobbyUpdated);

        //if starting the game worked, pass the initial game data up to the App.js to switch pages
        socket.on('game_started', handleGameStarted);

        //if the server rejected the start of the game, display a msg why for example not enough players
        socket.on('game_error', handleGameError);

        //clean up listeners when component unmounts
        return() => {
            socket.off('lobby_updated', handleLobbyUpdated);
            socket.off('game_started', handleGameStarted);
            socket.off('game_error', handleGameError);
        };
    }, [onGameStarted]);

    // #region RENDER
    // ========== RENDER ==========

    return(

        <div className="lobby-screen">

            {/* dark layer used to separate the waiting room from the table artwork behind it */}
            <div
                className="lobby-background-shade"
                aria-hidden='true'
            />

            <main className="lobby-shell">


                {/* game title */}
                <header className="lobby-header">

                    <h1 className="lobby-title">
                        Madiao
                    </h1>

                    <div 
                        className="lobby-title-divider"
                        aria-hidden
                    >
                        <span>
                            ◆
                        </span>
                    </div>

                    <p className="lobby-subtitle">
                        Waiting Table
                    </p>

                </header>

                {/* all 6 seats stay visible, occupied seats simply replace their empty placeholder */}
                <section className="lobby-table">
                    {lobbySlots.map(
                        (player, index) => {
                            const slotNumber = index +1;
                            const playerIsHost = player?.id === hostId;
                            const playerIsMe = player?.id === socket.id;

                            return (
                                <div
                                    key={player?.id ?? `empty-${index}`}
                                    className={`
                                        lobby-seat
                                        lobby-seat--${slotNumber}
                                    `}
                                >
                                    {player ? (
                                        <div
                                            className={[
                                                'lobby-player-slot',
                                                playerIsMe
                                                    ? 'lobby-player-slot--me'
                                                    : ''
                                            ].filter(Boolean).join(' ')}
                                        >
                                            {/* simple frame */}
                                            <div className="lobby-player-portrait">
                                                <div className="lobby-player-x"/>
                                            </div>

                                            <div className="lobby-player-info">
                                                <span className="lobby-player-name">
                                                    {player.name}
                                                </span>

                                                {(playerIsHost || playerIsMe) && (
                                                    <div className="lobby-player-tags">
                                                        {playerIsHost && (
                                                            <span className="lobby-player-tag lobby-player-tag--host">
                                                                Host
                                                            </span>
                                                        )}

                                                        {playerIsMe && (
                                                            <span className="lobby-player-tag lobby-player-tag--you">
                                                                You
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (

                                        <div className="lobby-open-seat">

                                            <div className="lobby-open-seat-mark">
                                                +
                                            </div>

                                            <span>
                                                Open Seat
                                            </span>

                                        </div>
                                    )}
                                </div>
                            );
                        }
                    )}

                    {/* invite code sits in the middle rather than belonging to any one seat */}
                    <div className="lobby-centre">

                        <span className="lobby-code-label">
                            Invite Code
                        </span>

                        <button
                            type="button"
                            className={`
                                lobby-code
                                ${
                                    copied
                                        ? 'lobby-code--copied'
                                        : ''
                                }
                            `}
                            onClick={handleCopyCode}
                            aria-label={
                                copied
                                    ? 'Lobby code copied'
                                    : 'Copy lobby code'
                            }
                        >
                            <span className="lobby-code-value">
                                {lobbyData.code}
                            </span>

                            <span className="lobby-code-hint">
                                {copied
                                    ? 'Copied'
                                    : 'Click to copy'
                                }
                            </span>

                        </button>

                        <div className="lobby-player-count">

                            <span className="lobby-player-count-current">
                                {players.length}
                            </span>

                            <span className="lobby-player-count-divider">
                                /
                            </span>

                            <span>
                                {MAX_PLAYERS}
                            </span>

                            <span className="lobby-player-count-label">
                                Players
                            </span>
                        </div>
                    </div>
                </section>

                {/* only the host gets the start button, everybody else sees who they are waiting for */}
                <footer className="lobby-controls">

                    {isHost ? (

                        <>
                            <button
                                type="button"
                                className={`
                                    lobby-start-button
                                    ${
                                        !canStart
                                            ? 'lobby-start-button--disabled'
                                            : ''
                                    }
                                `}
                                onClick={handleStart}
                                disabled={!canStart}
                            >

                                {canStart
                                    ? 'Start Game'
                                    : 'Waiting for players'
                                }
                            </button>

                            {!canStart && (

                                <p className="lobby-status-message">
                                    At least one more player is needed.
                                </p>
                            )}
                        </>
                    ) : (

                        <div className="lobby-waiting">

                            <div
                                className="lobby-waiting-dots"
                                aria-hidden='true'
                            >

                                <span />
                                <span />
                                <span />

                            </div>

                            <p className="lobby-status-message">

                                Waiting for{' '}

                                <strong>
                                    {hostPlayer?.name ?? 'the host'}
                                </strong>

                                {' '}to start the game
                            </p>
                        </div>
                    )}

                    {error && (
                        <p
                            className="lobby-error"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                </footer>
            </main>
        </div>
    );
}

export default LobbyRoom;