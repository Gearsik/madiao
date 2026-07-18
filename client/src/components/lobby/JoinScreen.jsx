import { useState, useEffect } from "react";
import socket from '../../socket';
import './JoinScreen.css';

//starting page of the game, the first page every player sees
function JoinScreen({onLobbyJoined}){
    const [name, setName] = useState('');           //named the player typed
    const [code, setCode] = useState('');           //lobby code for joining an exisitng game
    const [error, setError] = useState('');         //error msg shown below the button if something is missing
    const [loading, setLoading] = useState(false);  //after pressing the button enter the loading phase and disable any input

    //triggered when the player clicks the Create Lobby button
    function handleCreate(){
        if (!name.trim()){
            setError('Please enter your name');
            return;
        }
        setLoading(true);
        setError('');

        //tell the server to create a new lobby with this player as a host
        socket.emit('createLobby', {name: name.trim()});
    }

    //triggered when the player clicks the Join Lobby button
    function handleJoin(){
        if (!name.trim()){
            setError('Please enter your name');
            return;
        }
        if (!code.trim()){
            setError('Please enter lobby code');
            return;
        }
        setLoading(true);
        setError('');

        //tell the server to add this player to an existing lobby
        socket.emit('joinLobby', {name: name.trim(), code: code.trim()});
    }

    //set up socket listeners once when the component first loads
    //cleaned up when the component unmounts to avoid duplicate listeners
    useEffect(() => {
        
        //triggered when the server confirmed lobby was created, save the token for reconnection purposes and redirect the player to the next screen
        socket.on('lobby_created', (data) => {
            localStorage.setItem('madiao_token', data.token);   //save reconnect token in case of page refresh
            localStorage.setItem('madiao_lobby', data.code);    //save lobby code for the same reason
            setLoading(false);
            onLobbyJoined({...data, isHost: true, playerName: name.trim()}); //tell the App.js to redirect to the lobby screen
        });

        //trigger when the server confirmed lobby was joined, save the token and redirect to the lobby page
        socket.on('lobby_joined', (data) => {
            localStorage.setItem('madiao_token', data.token);   //save reconnect token in case of page refresh
            localStorage.setItem('madiao_lobby', data.code);    //save lobby code for the same reason
            setLoading(false);
            onLobbyJoined({...data, isHost:false, playerName: name.trim()}); //tell the App.js to redirect to the lobby screen
        });

        //triggered when the server rejected the create or join attempt, show the player the reason why 
        socket.on('lobby_error', (data) => {
            setError(data.message);
            setLoading(false);  //renable inputs so they can try again
        });

        //remove listeners when the component unmounts so they don't fire twice if the component remounts
        return() => {
            socket.off('lobby_created');
            socket.off('lobby_joined');
            socket.off('lobby_error');
        };
    }, [onLobbyJoined]);

    return(
        <div className="join-screen">
            <div className="join-card">
                <h1 className="join-title">Madiao</h1>
                <p className="join-subtitle"> A game of bluff and drink</p>

                <div className="join-form">
                    <input
                    className="join-input"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={20}
                    disabled={loading}
                    />

                    <button
                    className="join-button join-button--create"
                    onClick={handleCreate}
                    disabled={loading}
                    >
                        {loading ? 'Creating...' : 'Create Lobby'}
                    </button>

                    <div className="join-divider">
                        <span>or join an existing game</span>
                    </div>

                    <input
                    className="join-input join-input--code"
                    type="text"
                    placeholder="Lobby Code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    disabled={loading}
                    />

                    <button
                    className="join-button join-button--join"
                    disabled={loading}
                    onClick={handleJoin}
                    >
                        {loading ? 'Joining...' : 'Join Lobby'}
                    </button>

                    {error && <p className="join-error">{error}</p>}
                </div>
            </div>
        </div>
    );
}

export default JoinScreen;