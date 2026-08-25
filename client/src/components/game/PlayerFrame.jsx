import './PlayerFrame.css'
import PlayerPendingZone from './PlayerPendingZone';
import { ReactComponent as SakeCups } from '../../assets/icons/sake-cups.svg';

const TIMER_APPEARS_AT_SECONDS = 20;
const URGENT_TIMER_AT_SECONDS = 10;

//displays one player's permanent information together with whatever they are currently doing
function PlayerFrame({ player, 
    isCurrentPlayer, 
    isMe, turnTimeLeft, 
    pendingPlay, 
    seat, 
    phase, 
    isDrinking = false, 
    drinkingLevel = null
}) {
    if (!player) return null;

    //while the drinking animation is running we receive the new level separately, before the normal player state catches up
    const drunkness = drinkingLevel ?? player.drunkness ?? 0;

    const isPlayableTurnPhase =
     phase === 'waiting' ||
     phase === 'challenge_open';

    //the first half of a normal turn uses the thinking dots, then the final 20 seconds switch to a visible timer
    const showThinking = isPlayableTurnPhase && isCurrentPlayer && turnTimeLeft !== null && turnTimeLeft > TIMER_APPEARS_AT_SECONDS;
    const showTimer = isPlayableTurnPhase && isCurrentPlayer && turnTimeLeft !== null && turnTimeLeft <= TIMER_APPEARS_AT_SECONDS;
    const isUrgent= turnTimeLeft !== null && turnTimeLeft <=URGENT_TIMER_AT_SECONDS;

    //a pending play belongs to the player who made the most recent declaration and is still waiting to be challenged or accepted
    const hasPendingPlay = pendingPlay?.playerId === player.id;

    const frameClassName = [
        'player-frame',
        seat ? `player-frame--${seat}` : '',
        player.isOut ? 'player-frame--out' : ''
    ].filter(Boolean).join(' ');

return (
    <div
        className={frameClassName}>

            {/* only our own frame needs the extra stamp telling us when the turn begins */}
            {isMe &&
                isCurrentPlayer &&
                isPlayableTurnPhase && (
                    <div
                        className="your-turn-stamp"
                        role="status"
                        aria-live="polite"
                    >
                        Your Turn
                    </div>
                )}
            
            <div className='player-layout'>

                {/* information that stays around the player for the entire game */}
                <div className="player-hud-row">

                    {/* Card count */}
                    <div className="player-card-count">
                        <span className="card-count-number">
                            {player.cardCount}
                        </span>

                        <span className="card-count-label">
                            cards
                        </span>
                    </div>

                    {/* Avatar */}
                    <div className="player-avatar">

                        <div className="avatar-x" />

                        <img
                            className="player-avatar-frame"
                            src="/assets/frames/pedant-tag-frame.svg"
                            alt=""
                            aria-hidden="true"
                        />

                        {!player.connected && (
                            <div className="avatar-disconnected">
                                DC
                            </div>
                        )}

                        <span className="player-name">
                            {player.name}
                        </span>
                        
                    </div>

                    {/* Drunkness indicator */}
                    <div className="player-drunkness">
                        <SakeCups
                            className={`sake-cups drunkness-${drunkness}`}
                        />
                    </div>
                </div>

                {/* temporary information changes depending on what this player is doing right now */}
                <div className='player-activity'>

                    <div className='player-status-slot'>

                        {isDrinking ? (
                            <div className='player-status player-status--drinking'>
                                Fine, I'll drink
                            </div>

                        ) : hasPendingPlay ? (

                            <div className='player-status player-status--declaration'>
                                {pendingPlay.declaredCount}{' '}
                                {pendingPlay.declaredCount === 1 
                                    ? 'card'
                                    : 'cards'}
                                    {' '}({pendingPlay.declaredNumber})
                            </div>

                        ) : showThinking ? (

                            <div className='player-status player-status--thinking'>
                                <div className="thinking-dot" />
                                <div className="thinking-dot" />
                                <div className="thinking-dot" />
                            </div>

                        ) : showTimer ? (

                            <div 
                                className={`
                                    player-status
                                    player-status--timer
                                    ${isUrgent
                                        ? 'player-status--urgent'
                                        : ''}
                                `}
                            >
                                {turnTimeLeft}s
                            </div>

                        ) : null}

                    </div>

                    {/* opponents only expose the number of cards they played, so their pending cards stay face down */}
                    {!isMe && hasPendingPlay && (
                        <PlayerPendingZone
                            declaredCount={pendingPlay.declaredCount}
                            faceUp={false}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
export default PlayerFrame;