import { useState, useEffect, use } from "react";
import socket from '../../socket';
import './LobbyRoom.css';

//LobbyRoom is the next page and waiting area where players gather
//before the game starts
function LobbyRoom({lobbyData, onGameStarted}){
    const [players, setPlayers] = useState(lobbyData.players);      //list of the players in the lobby, updating live
    const [hostId, setHostId] = useState(lobbyData.hostId);         //showing who the host is
    const [copied, setCopied] = useState(false);                    //activates briefly after copying the code
    const [error, setError] = useState('');                         //error from the server if the start gets rejected
    const isHost = lobbyData.hostId === socket.id;                  //true if this player is the host
    const canStart = players.length >= 2;                           //host is only allowed to start the game if there are at least 2 people in the lobby

    //copy the lobby code to clipboard when the player clicks on it
    function handleCopyCode(){
        navigator.clipboard.writeText(lobbyData.code).then(() => {
            setCopied(true);                                        //show "Copied!" msg
            setTimeout(() => setCopied(false), 2000);               //reset after 2s
        })
    }

    //triggered when the host clicks Start Game
    function handleStart(){
        if(!canStart) return;                                       //extra guard, the button should already be disabled
        setError('');
        socket.emit('startGame');                                   //tell the server to start the game
    }

    useEffect(() => {

        //when another player joined or left, update the player list and host
        socket.on('lobby_updated', (data) => {
            setPlayers(data.players);                               //refresh the players list
            setHostId(data.hostId);                                 //host might have changed if the previous one left
        });

        //if starting the game worked, pass the initial game data up to the App.js to switch pages
        socket.on('game_started', (data) => {
            onGameStarted(data);
        });

        //if the server rejected the start of the game, display a msg why for example not enough players
        socket.on('game_error', (data) => {
            setError(data.message);
        });

        //clean up listeners when component unmounts
        return() => {
            socket.off('lobby_updated');
            socket.off('game_started');
            socket.off('game_error');
        };
    }, [onGameStarted]);

    return(
        <div className="lobby-screen">
            <div className="lobby-card">
                <h1 className="lobby-title">Madiao</h1>

                {/* lobby code and click to copy */}
                <div className="lobby-code-section">
                    <p className="lobby-code-label">Lobby Code</p>
                    <div
                        className="lobby-code"
                        onClick={handleCopyCode}
                        title="Click to copy"
                    >
                        {lobbyData.code}
                        <span className="lobby-code-hint">
                            {copied ? 'Copied!' : 'Click to copy'}
                        </span>
                    </div>
                </div>

                {/* live player list */}
                <div className="lobby-players">
                    <p className="lobby-players-label">
                        Players ({players.length}/6)
                    </p>
                    <ul className="lobby-player-list">
                        {players.map((players) => (
                            <li key={players.id} className="lobby-player-item">
                                {/* crown icon next to the host's name */}
                                {players.id === hostId && (
                                    <span className="lobby-host-crown">♛</span>
                                )}
                                <span className="lobby-player-name">
                                    {players.name}
                                </span>
                                {/* "You" tag next to the local player's name */}
                                {players.id === socket.id && (
                                    <span className="lobby-you-tag">You</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* host controls — only visible to the host */}
                {isHost && (
                    <div className="lobby-host-controls">
                        <button
                            className={`lobby-start-button ${!canStart ? 'lobby-start-button--disabled' : ''}`}
                            onClick={handleStart}
                            disabled={!canStart}
                        >
                            {canStart ? 'Start Game' : 'Need at least 2 players'}
                        </button>
                        {error && <p className="lobby-error">{error}</p>}
                    </div>
                )}

                {/* non-host message */}
                {isHost && (
                    <p className="lobby-waiting-msg">
                        Waiting for the host to start the game...
                    </p>
                )}
            </div>
        </div>
    );
}

export default LobbyRoom;