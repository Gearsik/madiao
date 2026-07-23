function PlayerFrame({ player, isCurrentPlayer, isMe, seatIndex, totalOpponents, turnTimeLeft}) {
    if (!player) return null;
    return (
        <div className={`player-frame ${isCurrentPlayer ? 'player-frame--active' : ''} ${player.isOut ? 'player-frame--out' : ''}`}>
            <div className="player-frame-name">{player.name}</div>
            <div className="player-frame-cards">{player.cardCount} cards</div>
            <div className="player-frame-drunkness">
                {[1,2,3,4].map(i => (
                    <div key={i} className={`drunkness-segment ${i <= player.drunkness ? 'drunkness-segment--filled' : ''}`} />
                ))}
            </div>
            {turnTimeLeft !== null && (
                <div className={`turn-timer ${turnTimeLeft <= 10 ? 'turn-timer--urgent' : ''}`}>
                    {turnTimeLeft}s
                </div>
            )}
        </div>
    );
}
export default PlayerFrame;