import { userState, useState } from 'react';
import JoinScreen from './components/lobby/JoinScreen';
import LobbyRoom from './components/lobby/LobbyRoom';
import GameTable from './components/game/GameTable';
import './App.css';

function App(){
    const [screen, setScreen] = useState('join');
    const [lobbyData, setLobbyData] = useState(null);
    const [gameData, setGameData] = useState(null);

    function handleLobbyJoined(data){
        setLobbyData(data);
        setScreen('lobby');
    }

    function handleGamesStarted(data){
        setGameData(data);
        setScreen('game');
    }

    return(
        <div className="App">
            {screen === 'join' && (
                <JoinScreen onLobbyJoined={handleLobbyJoined}/>
            )}
            {screen === 'lobby' && (
                <LobbyRoom
                lobbyData={lobbyData}
                onGameStarted={handleGamesStarted}/>
            )}
            {screen === 'game' &&(
                <GameTable
                initialGameData={gameData}
                lobbyData={lobbyData}/>
            )}
        </div>
    );
}

export default App;