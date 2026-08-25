import './GameOverNotification.css';

//shows the final result once the last challenge/drinking sequence has finished
//it also handles rematch readiness and leaving the finished game
function GameOverNotification({
    winner,
    players,
    gameOverInfo,

    onPlayAgain,
    isRematchReady,
    rematchReadyCount,
    rematchPlayerCount,

    onMainMenu
}){

    const winnerPlayer = players.find(player => player.id === winner);
    const eliminatedPlayer = gameOverInfo?.eliminatedPlayerId ? players.find(player => player.id === gameOverInfo.eliminatedPlayerId) : null;

    //the server normally sends the eliminated player's name directly,
    //but falling back to the player list still gives us something useful if it is missing
    const eliminatedPlayerName = gameOverInfo?.eliminatedPlayerName ?? eliminatedPlayer?.name ?? 'One of the last two players';

    const rematchButtonClass = [
        'game-over-action',
        'game-over-action--rematch',
        isRematchReady
            ? 'game-over-action--ready'
            : ''
    ].filter(Boolean).join(' ');

    //the game can currently finish either because somebody was eliminated,
    //or because the winner safely got rid of every card in their hand
    function renderGameOverReason(){
        if (gameOverInfo?.type === 'elimination') {
            return (
                <>
                    <strong>
                        {eliminatedPlayerName}
                    </strong>

                    {gameOverInfo.reason === 'drunkness'
                        ? ' took a drink and passed out.'
                        : ' was knocked out.'
                    }
                </>
            );
        }

        if (gameOverInfo?.type === 'empty_hand') {
            return (
                <>
                    <strong>
                        {winnerPlayer?.name}
                    </strong>
                    {' '}played all of their cards.
                </>
            );
        }

        return 'The game has ended.';
    }

    return(
        <div className='game-over-overlay'>
            <div className = 'game-over-screen'>

                {/* starts large in the centre before moving up to make room for the final result */}
                <h1 className='game-over-title'>
                    Game Over
                </h1>

                {/* Final result appears after title moves */}
                <div className='game-over-content'>
                    <div className='game-over-reason-area'>
                        <p className='game-over-reason'>
                            {renderGameOverReason()}
                        </p>
                    </div>

                    <div className="game-over-divider" />

                    {/* winner and the 2 choices for main menu and rematch */}
                    <div className='game-over-winner-area'>
                        <div className='game-over-winner-name'>
                            {winnerPlayer?.name}
                        </div>

                        <div className='game-over-wins'>
                            Wins
                        </div>

                        <div className='game-over-actions'>
                            <button
                                className={rematchButtonClass}
                                type='button'
                                onClick={onPlayAgain}
                            >
                                {isRematchReady
                                    ? '✓ Ready'
                                    : 'Play Again'
                                }
                            </button>

                            <button
                                className='game-over-action'
                                type='button'
                                onClick={onMainMenu}
                            >
                                Main Menu
                            </button>
                        </div>
                        
                        <div className='game-over-rematch-status'>

                            {rematchReadyCount}
                            {' / '}
                            {rematchPlayerCount}
                            {' ready'}
                        </div>
                    </div>
                </div>
            </div>
        </div>      
    );
}

export default GameOverNotification;