# Changelog

All notable changes to Madiao will be documented here.

## [0.3.0] - 2026-09-12

### Added
- MkDocs technical documentation and production runbook.
- Dedicated Docker documentation service.
- Server-side unit tests covering deck, rules and game-state logic.
- HTTPS production access through nginx and Let's Encrypt.

### Changed
- Bound the client, server and documentation services to localhost behind the host nginx reverse proxy.
- Updated production configuration for HTTPS and proxied Socket.IO traffic.
- Expanded deployment, Docker, troubleshooting, rollback, security and production-hardening documentation.

### Fixed
- Corrected production documentation and configuration references after the move from direct ports to HTTPS.
- Cleaned up final documentation structure and cross-file inconsistencies.

## [0.2.0] - 2026-08-25

### Added
- Completely redesigned game table and player UI.
- New player frames, card counters and drunkness indicators.
- Drinking animations and player drinking notifications.
- Redesigned declaration menu.
- Redesigned challenge sequence with animated card reveals.
- Redesigned timeout and game-over screens.
- Rematch system with player ready states.
- Player elimination notifications.
- Lobby player limit and improved lobby validation.
- Mobile landscape layout and portrait rotation warning.

### Changed
- Reworked the overall visual style of the game.
- Reworked player positioning for 2–6 player games.
- Improved card hand stacking and card selection behaviour.
- Pending plays are now displayed beside each player.
- Players now see thinking indicators and a countdown during turns.
- Challenge, timeout, drinking and game-over sequences now run as separate timed phases.
- Game timing values are shared between the client and server.
- Auto-submit now sends prepared plays shortly before the turn timer expires.
- Improved lobby and game state handling.
- Improved rematch behaviour when players leave after a game.

### Fixed
- Fixed challenge and timeout timing becoming desynchronised between client and server.
- Fixed drinking animations occurring at the wrong point in the game sequence.
- Fixed game-over appearing before drinking animations had finished.
- Fixed stale turn and resolution timers continuing after a game or lobby was removed.
- Fixed declarations being submitted after a turn had already ended.
- Fixed declarations close to the timer deadline being rejected because of the card animation delay.
- Fixed duplicate declaration submissions caused by manual play and auto-submit happening together.
- Fixed stale challenge requests being able to challenge a newer player's play.
- Fixed empty-hand wins leaving an active turn timer behind.
- Fixed empty-hand declarations not receiving a server acknowledgement.
- Fixed pending plays remaining after timeout/penalty sequences.
- Fixed several 1v1 pending-play and pile-state issues.
- Fixed eliminated players being able to affect normal gameplay.
- Fixed duplicate lobby joins and several lobby/disconnect edge cases.
- Fixed server/client Socket.IO event mismatches.
- Fixed a number of card stacking, rendering and pending-card interaction issues.

### Technical
- Consolidated shared timing constants between client and server.
- Improved server-side validation for declarations and lobby requests.
- Added server-side player-name validation.
- Added explicit tracking and cleanup for turn, cooldown, resolution and drinking timers.
- Improved Socket.IO listener cleanup.
- Cleaned up obsolete UI classes and unused gameplay state.
- Refactored and documented major parts of the client and server code.