import { useState, useEffect } from 'react';
import { challengeFlashMs, challengeTransition, challengeResultMs, notificationFadeMs, timeoutMessageMs, timeoutDrinkNoticeMs } from '../../shared/constants';
import './ChallengeNotification.css';

// #region CHALLENGE NOTIFICATION
// ========== CHALLENGE NOTIFICATION ==========

//one screen handles the full challenge sequence, from the first CHALLENGE flash to the final result fading away
function ChallengeNotification({result, onDone}){
    const [phase, setPhase] = useState('intro');                //which of the three stages we are in, the CSS does the actual moving and resizing
    const [visible, setVisible] = useState(true);               //flips to false to start the fade out
    const [revealCards, setRevealCards] = useState(false);      //flips to true to turn the cards face up

    useEffect(() => {

        //large central CHALLENGE notification with its text shrinking and moving down
        const layoutTimer = setTimeout(() => {
            setPhase('layout');
        }, challengeFlashMs);

        //start flipping the cards shortly after the result layout appears
        const revealTimer = setTimeout(() => {
            setRevealCards(true);
        }, challengeFlashMs + 400);

        //once the title has moved into place, replace it with the final challenge result
        const resolvedTimer = setTimeout(() => {
            setPhase('resolved');
        }, challengeFlashMs + challengeTransition);

        //leave enough time to inspect the cards and result, then fade the whole screen away
        const fadeTimer = setTimeout(() => {
            setVisible(false);
        }, challengeFlashMs + challengeTransition + challengeResultMs);

        //only remove the window once the fade itself has finished
        const doneTimer = setTimeout(() => {
            onDone?.();
        }, challengeFlashMs + challengeTransition + challengeResultMs + notificationFadeMs);

        //cancel everything still waiting if the overlay is removed early, otherwise a timer would fire against a component that has gone
        return() => {
            clearTimeout(layoutTimer); 
            clearTimeout(revealTimer)
            clearTimeout(resolvedTimer); 
            clearTimeout(fadeTimer); 
            clearTimeout(doneTimer);
        };
    }, [onDone]); //run once on mount only

    if (!result) return null;

    //honest = challenger was wrong
    //bluff = challenger was right
    const challengeSuccessful = !result.honest;
    const actualCards = result.actualCards ?? [];
    const challengedCardCount = result.actualCards?.length ?? 0;

    const resultClass = phase === 'resolved'
        ? challengeSuccessful
            ? 'challenge-hero--successful'
            : 'challenge-hero--unsuccessful'
        : '';

    return(
        <div className={`chall-notif-overlay ${!visible ? 'chall-notif-overlay--hidden' : ''}`}>
            <div className='challenge-screen'>

                {/* starts as the large CHALLENGE title, then moves down and changes into the final result */}
                <div 
                    className={[
                        'challenge-hero', 
                        `challenge-hero--${phase}`, 
                        resultClass
                    ].join(' ')}
                >
                    <span className='challenge-hero-text'>
                       {phase === 'resolved'
                            ?(
                                challengeSuccessful
                                    ? 'Challenge Successful'
                                    : 'Challenge Unsuccessful'
                            )
                            : 'Challenge'
                       } 
                    </span>
                </div>

                {/* the result information appears while the title is moving into its smaller position */}
                {phase !== 'intro' && (
                    <div className='challenge-content'>

                        {/* challenger information */}
                        <section className="challenge-player-info">
                            <h2 className='challenge-player-name'>
                                {result.challengerName}
                            </h2>

                            <p className='challenge-player-target'>
                                challenged{' '}
                                <strong>
                                    {result.accusedName}
                                </strong>
                            </p>

                            <p className='challenge-player-declaration'>
                                {challengedCardCount}{' '}
                                {challengedCardCount === 1
                                    ? 'card'
                                    : 'cards'
                                }
                                {' '}of{' '}

                                <strong>
                                    {result.declaredNumber}
                                </strong>
                            </p>
                        </section>

                        {/* horizontal line to separate sections visually */}
                        <div className='challenge-divider'/>

                        {/* revealed cards */}
                        <section className='challenge-reveal'>
                            <div className='challenge-cards'>
                                {actualCards.map((card, index) => {
                                    //wild cards are always valid, only a normal card with the wrong value proves there was a bluff
                                    const isBluff = card.type !== 'wild' && card.value !== result.declaredNumber;

                                    return (
                                        <div
                                            key={card.id ?? index}
                                            className={[
                                                'challenge-card-wrapper',
                                                revealCards ? 'challenge-card-wrapper--flipped' : '',
                                                isBluff   ? 'challenge-card-wrapper--bluff'   : '',
                                            ].join(' ')}
                                            style={{
                                                '--flip-delay': `${index * 120}ms`
                                            }}
                                        >
                                            {/* the back is shown first, then the wrapper rotates to reveal the real card */}
                                            <div className='challenge-card--back' />
                            
                                            {/* card face using an SVG image + number overlay, same pattern as CardHand */}
                                            <div className='challenge-card--face'>
                                                <img
                                                    src={card.type === 'wild'
                                                        ? `/assets/cards/wild-${card.wildType ?? 0}.svg`
                                                        : `/assets/cards/card-template.svg`
                                                    }
                                                    alt=''
                                                />
                                                {card.type !== 'wild' && (
                                                    <span className='challenge-card-value'>{card.value}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* honest/bluff verdict */}
                            <h3 className={`challenge-verdict ${result.honest ? 'challenge-verdict--honest' : 'challenge-verdict--bluff'}`}
                            >
                                {result.honest ? 'Honest Play' : 'Bluff Caught'}
                            </h3>

                            {/* One clear consequence sentence */}
                            <p className='challenge-penalty'>
                                <strong>
                                    {result.loserName}
                                </strong>

                                {' '}takes the pile and takes a drink.
                            </p>

                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}

// #region TIMEOUT NOTIFICATION
// ========== TIMEOUT NOTIFICATION ==========

//a timeout only needs a short message here, the actual drinking animation happens around the player's avatar afterwards
function TimeoutNotification({playerName, onDone}){
    const [visible, setVisible] = useState(true);

    useEffect(() => {

        //show players that the timeout happened and, fade the notification away
        const fadeTimer = setTimeout(() => {
            setVisible(false);
        }, timeoutMessageMs + timeoutDrinkNoticeMs);

        //remove the notification after the fade finishes
        const doneTimer = setTimeout(() => {
            onDone?.();
        }, timeoutMessageMs + timeoutDrinkNoticeMs + notificationFadeMs);

        return() => {
            clearTimeout(fadeTimer);
            clearTimeout(doneTimer);
        };

    }, [onDone]);

    return(
        <div className={`timeout-overlay ${!visible ? 'timeout-overlay--hidden' : ''}`}>
            <div className='timeout-box'>
                <p className='timeout-message'>
                    <strong>
                        {playerName}
                    </strong>

                    {' '}didn't declare cards in time and must take a penalty drink.

                </p>
            </div>
        </div>
    );
}

export { ChallengeNotification, TimeoutNotification };