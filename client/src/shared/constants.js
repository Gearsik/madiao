//shared timing values used by both the server and client
//keeping them in one place makes sure the game flow and the UI animations stay in sync


// ========== GENERAL TIMINGS ==========

const turnDurationMs = 40000;       //full amount of time a player has to make their play
const autoSubmitLeadMs = 650;       //sends an already prepared play slightly before the server's turn timer expires
const drinkAnimationMs = 3000;      //time given to the drinking animation before the server continues the game
const notificationFadeMs = 500;     //standard fade-out time used by the result and timeout screens


// ========== CHALLENGE SEQUENCE ==========

const challengeFlashMs = 1200;      //how long the large CHALLENGE title stays in the middle of the screen
const challengeTransition = 700;    //time used to move the title into the result layout
const challengeResultMs = 3500;     //time players have to see the revealed cards and challenge result

//the server waits for this full sequence before moving on to the drinking animation
const challengeOverlayMs =
    challengeFlashMs +
    challengeTransition +
    challengeResultMs +
    notificationFadeMs;


// ========== TIMEOUT SEQUENCE ==========

const timeoutMessageMs = 1600;      //main time the "didn't play in time" message stays on screen
const timeoutDrinkNoticeMs = 700;   //extra time the timeout screen remains visible before it starts fading

//the server waits for the whole timeout screen to disappear before starting the drinking animation
const timeoutOverlayMs =
    timeoutMessageMs +
    timeoutDrinkNoticeMs +
    notificationFadeMs;


//the next player's challenge window currently opens immediately after a play is committed
const cooldownMs = 0;


module.exports = {
    turnDurationMs,
    autoSubmitLeadMs,

    drinkAnimationMs,
    notificationFadeMs,

    challengeFlashMs,
    challengeTransition,
    challengeResultMs,
    challengeOverlayMs,

    timeoutMessageMs,
    timeoutDrinkNoticeMs,
    timeoutOverlayMs,

    cooldownMs
};