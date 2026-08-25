import { useState, useEffect, useRef } from "react";
import socket from '../../socket';
import './JoinScreen.css';

// #region SCREEN STATE
// ========== SCREEN STATE ==========

//this is the landing page, the first screen every player sees, from here they can either create a new lobby or join an existing one
function JoinScreen({onLobbyJoined}){

    const [mode, setMode] = useState('home');

    const [name, setName] = useState('');           //named the player typed
    const [code, setCode] = useState('');           //the lobby code, only needed when joining an existing game

    const [error, setError] = useState('');                    //error msg shown below the button if something is missing
    const [loadingAction, setLoadingAction] = useState(null);  //null when idle, otherwise CREATE or JOIN while we wait on the server
    
    //the name is kept here as well as in state, because by the time the server answers the player could have carried on typing
    //a ref holds the value we actually sent rather than whatever happens to be in the box at that moment
    const submittedNameRef = useRef('');

    // #region NAVIGATION
    // ========== NAVIGATION ==========

    //moving between the home screen and the two forms
    function openMode(nextMode){
        if(loadingAction !== null) return;      //ignore it while we are waiting on the server, changing screens mid request would be confusing

        setError('');
        setMode(nextMode);
    }

    function handleBack(){
        if(loadingAction !== null) return;

        setError('');
        setMode('home');
    }

    // #region LOBBY ACTIONS
    // ========== LOBBY ACTIONS ==========

    //creates a fresh lobby and makes this player the host
    function handleCreate(event){

        event?.preventDefault();        //stop the browser reloading the page as the form is only there for the enter key and accessibility

        if (!name.trim()){
            setError('Please enter your name');
            return;
        }

        const cleanName = name.trim();

        submittedNameRef.current = cleanName;

        setLoadingAction('create');     //this disables the whole form, so the button cannot be pressed twice
        setError('');

        //tell the server to create a new lobby with this player as a host
        socket.emit('createLobby', {name: cleanName});
    }

    //triggered when the player clicks the Join Lobby button
    function handleJoin(event){

        event?.preventDefault();

        if (!name.trim()){
            setError('Please enter your name');
            return;
        }
        if (!code.trim()){
            setError('Please enter a lobby code');
            return;
        }

        const cleanName = name.trim();
        const cleanCode = code.trim().toUpperCase();        //the server stores codes in uppercase, so we match that before sending

        submittedNameRef.current = cleanName;

        setLoadingAction('join');
        setError('');

        //tell the server to add this player to an existing lobby
        socket.emit('joinLobby', {name: cleanName, code: cleanCode});
    }

    // #region SERVER EVENTS
    // ========== SERVER EVENTS ==========

    //the server answers with one of these events after a create or join request
    useEffect(() => {

        //the server confirmed our new lobby, so we hand everything over and this screen is done with
        function handleLobbyCreated(data){

            setLoadingAction(null);

            onLobbyJoined({
                ...data,
                isHost: true,
                playerName: submittedNameRef.current
            });
        }

        //same as above, only this time we joined somebody else's lobby rather than making our own
        function handleLobbyJoined(data){

            setLoadingAction(null);

            onLobbyJoined({
                ...data,
                isHost: false,
                playerName: submittedNameRef.current
            });
        }

        //the server turned us down, so we show its reason and let the player try again
        function handleLobbyError(data){

            setError(data.message);
            setLoadingAction(null);
        }

        socket.on('lobby_created', handleLobbyCreated);

        socket.on('lobby_joined', handleLobbyJoined);

        socket.on('lobby_error', handleLobbyError);

        return() => {
            socket.off('lobby_created', handleLobbyCreated);
            socket.off('lobby_joined', handleLobbyJoined);
            socket.off('lobby_error', handleLobbyError);
        };

    }, [onLobbyJoined]);

    // #region INPUT HELPERS
    // ========== INPUT HELPERS ==========

    //typing in either box clears whatever error was on screen, so an old message does not sit there while they fix it
    function handleNameChange(event){

        setName(event.target.value);

        if(error){
            setError('');
        }
    }

    //lobby codes are always six uppercase characters, spaces are removed as the player types
    function handleCodeChange(event){

        const cleanCode =
            event.target.value
            .toUpperCase()
            .replace(/\s+/g, '')
            .slice(0, 6);

            setCode(cleanCode);

            if(error){
                setError('');
            }
    }

    // #region RENDER
    // ========== RENDER ==========

    return(
        <div className= 'join-screen'>
            {/* adds a little more depth over the table artwork without affecting the actual menu */}
            <div 
                className="join-background-shade"
                aria-hidden='true'
            />
            
            <main className='join-shell'>

                <header className="join-brand">

                    <h1 className="join-title">
                        Madiao
                    </h1>

                    <div 
                        className="join-brand-divider"
                        aria-hidden='true'
                    >
                        <span className="join-brand-mark">
                            ◆
                        </span>
                    </div>

                    <p className="join-subtitle">
                        A game of bluff and drink
                    </p>
                </header>

                {/* main menu */}
                {mode === 'home' && (
                    <section className="join-home">
                        <div className="join-home-actions">

                            <button
                                type="button"
                                className="join-choice"
                                onClick={() => openMode('host')}
                            >

                                <span className="join-choice-title">
                                    Host Game
                                </span>

                                <span className="join-choice-description">
                                    Start a new table
                                </span>
                            </button>

                            <button
                                type="button"
                                className="join-choice"
                                onClick={() => openMode('join')}
                            >
                                <span className="join-choice-title">
                                    Join Game
                                </span>

                                <span className="join-choice-description">
                                    Enter a lobby code
                                </span>
                            </button>
                        </div>
                    </section>
                )}

                {/* host a new game */}
                {mode === 'host' && (
                    <section className="join-flow">
                        <div className="join-flow-heading">

                            <h2 className="join-flow-title">
                                Host a Game
                            </h2>

                            <p className="join-flow-description">
                                Choose the name you'll use at the table
                            </p>

                        </div>

                        <div className="join-flow-divider"/>

                        <form
                            className="join-form"
                            onSubmit={handleCreate}
                        >
                            <label
                                className="join-field"
                                htmlFor="host-player-name"
                            >

                                <span className="join-field-label">
                                    Your name
                                </span>

                                <input
                                    id="host-player-name"
                                    className="join-input"
                                    type="text"
                                    placeholder="Enter your name"
                                    value={name}
                                    onChange={handleNameChange}
                                    maxLength={20}
                                    disabled={loadingAction !== null}
                                    autoComplete="name"
                                    autoFocus
                                />
                            </label>

                            {/* the label changes while we wait, so the player can see something is actually happening */}
                            <button
                                type="submit"
                                className="join-primary-button"
                                disabled={loadingAction !== null}
                            >
                                {loadingAction === 'create'
                                    ? 'Creating Table...'
                                    : 'Create Lobby'
                                }
                            </button>

                        </form>

                        {/* role="alert" makes a screen reader read the message out the moment it appears */}
                        {error && (
                            <p
                                className="join-error"
                                role="alert"
                            >
                                {error}
                            </p>
                        )}

                        <button
                            type="button"
                            className="join-back-button"
                            onClick={handleBack}
                            disabled={loadingAction !== null}
                        >
                            <span aria-hidden='true'>
                                ←
                            </span>

                            Back
                        </button>
                    </section>
                )}

                {/* join an existing game */}
                {mode === 'join' && (
                    <section className="join-flow">
                        <div className="join-flow-heading">

                            <h2 className="join-flow-title">
                                Join a Game
                            </h2>

                            <p className="join-flow-description">
                                Enter your name and the table's invite code.
                            </p>

                        </div>

                        <div className="join-flow-divider"/>

                        <form
                            className="join-form"
                            onSubmit={handleJoin}
                        >
                            <label
                                className="join-field"
                                htmlFor="join-player-name"
                            >
                                <span className="join-field-label">
                                    Your Name
                                </span>

                                {/* autocomplete is turned off, the browser's saved entries have no business with a random 6 character code */}
                                <input
                                    id="join-player-name"
                                    className="join-input"
                                    type="text"
                                    placeholder="Enter your name"
                                    value={name}
                                    onChange={handleNameChange}
                                    maxLength={20}
                                    disabled={loadingAction !== null}
                                    autoComplete="name"
                                    autoFocus
                                />
                        
                            </label>

                            <label
                                className="join-field"
                                htmlFor="join-lobby-code"
                            >
                                <span className="join-field-label">
                                    Lobby Code
                                </span>

                                <input
                                    id="join-lobby-code"
                                    className="join-input join-input--code"
                                    type="text"
                                    placeholder="MU26TW"
                                    value={code}
                                    onChange={handleCodeChange}
                                    maxLength={6}
                                    disabled={loadingAction !== null}
                                    autoComplete='off'
                                    spellCheck='off'
                                />
                            </label>

                            <button
                                type="submit"
                                className="join-primary-button"
                                disabled={loadingAction !== null}
                            >
                                {loadingAction === 'join'
                                    ? 'Joining Table...'
                                    : 'Join'
                                }

                            </button>

                        </form>

                        {error && (
                            <p
                                className="join-error"
                                role="alert"
                            >
                                {error}
                            </p>
                        )}

                        <button
                            type="button"
                            className="join-back-button"
                            onClick={handleBack}
                            disabled={loadingAction !== null}
                        >
                            <span aria-hidden='true'>
                                ←
                            </span>

                            Back
                        </button>

                    </section>

                )}

            </main>
        </div>
    );
}

export default JoinScreen;