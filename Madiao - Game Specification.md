# Madiao Online — Game Specification

This document is the single source of truth for how the game behaves.
Every rule the server enforces should trace back to something written here.
If a situation comes up during coding that this document doesn't answer,
that's a gap — come back and fill it before writing the code that handles it.

---

## 1. Setup

- Number of players: 2–6, single lobby type. Deck composition is **fixed**
  regardless of player count — no separate deck configurations per lobby size.
- Deck: numbers 1–10, **4 copies of each** (40 number cards) + **16 wild
  cards** = **56 cards total**. This matches the real game's proportions and
  never changes based on player count.
- Hand size is **dynamic**, calculated as `floor(56 / player_count)`:
  - 2 players → 28 cards each
  - 3 players → 18 cards each (2 cards left undealt)
  - 4 players → 14 cards each
  - 5 players → 11 cards each (1 card left undealt)
  - 6 players → 9 cards each (2 cards left undealt)
- Any leftover cards from the division are simply not dealt — they take no
  part in that game. This is one formula with zero player-count branching
  anywhere in the dealing logic.
- 28 cards at 2 players may make games run long — this is a **balance**
  question, not an architecture one. Don't pre-tune it; playtest the real
  build first and adjust deck size (e.g. drop to 3 copies per number) only
  if it's actually a problem in practice.
- Every player starts with `drunkness: 0`, `isOut: false`.
- A random player is chosen to declare first.

---

## 2. Turn Flow (numbered, in order)

1. It is `current_player`'s turn. All other players' card selection is locked —
   clicking a card during another player's turn shows the message
   *"wait for your turn to select cards"* and does nothing else.
2. Current player selects any number of cards from their hand. Selected cards
   visually lift and move toward the space between hand and pile.
3. Current player presses **Declare**. This opens the declare window where
   they choose what number the selected cards are declared as.
4. From the declare window, the player can either:
   - Confirm a number → proceeds to step 5, **or**
   - Press **X** to cancel → returns to step 2 with their selection intact,
     free to reselect.
5. On confirm: the declared cards move into a **pending zone** (visible to
   all players as a stack, with a count, not yet part of the pile). This is
   NOT the pile. The actual card values stay hidden from other players.
6. **5-second cooldown begins.** No one can challenge during this window.
   The challenge button is greyed out for all other players.
7. After 5 seconds: the challenge button becomes active for all players
   except the one who just played. This window stays open until **the next
   player's cards are confirmed at step 5** of their own turn — there is no
   fixed countdown beyond that.
8. The moment the *next* player confirms their declaration (step 5 again,
   for them): the *previous* player's pending cards are merged into the pile,
   their challenge window closes permanently (unchallengeable from now on),
   and the new player's pending cards begin their own 5-second cooldown
   (back to step 6, for the new play).

This is a single repeating cycle: **declare → pending → 5s cooldown →
challenge window open → (challenge OR next player declares) → pile/merge →
repeat.** The same rule applies identically whether the play follows a normal
turn or follows a challenge resolution. No special cases.

---

## 3. Challenges

- A challenge can only be raised against the current **pending** play (never
  the pile, never a play that's already been merged).
- The challenge button is disabled for: the player whose turn it currently is,
  the player who made the pending play being challenged, and everyone during
  the 5-second cooldown.
- First challenge the server receives wins the race. All challenge events
  arriving after the first are ignored — lock this out the instant the first
  one is accepted, not after processing it.
- The moment a challenge is accepted: a challenge result screen appears for
  **all players simultaneously**, blocking all input (no card selection, no
  declaring, no challenging) for **7 seconds**.
- The challenge screen shows: the actual cards that were played, the number
  they were declared as, the challenger's name, the result, and which cards
  (if any) don't match the declared number — those are visually highlighted.
- **Result — bluff caught** (at least one non-wild card doesn't match the
  declared number — wild cards always auto-match regardless of what they're
  declared as, including a play made entirely of wilds): the player who was
  challenged takes the entire pile into their hand, then resolves a
  drunkness roll (see Section 4). The challenger starts the next round and
  declares a fresh number.
- **Result — honest play** (every card matches the declared number, or is
  wild): the challenger takes the entire pile into their hand, then resolves
  a drunkness roll. The player who was originally declaring starts the next
  round and declares a fresh number.
- After the 7-second screen disappears, play resumes with the round winner's
  turn — back to Turn Flow step 1, and the 5-second cooldown rule applies to
  their upcoming play exactly as it would for any other play.

---

## 4. Drunkness and Elimination

- Drunkness starts at 0 for every player.
- Whoever loses a challenge (the bluffer if caught, or the wrongful
  challenger if not) takes a drink:
  - Drink 1 → 25% chance of elimination
  - Drink 2 → 50% chance of elimination
  - Drink 3 → 75% chance of elimination
  - Drink 4 → 100% chance of elimination (guaranteed)
- The roll happens server-side only, immediately after the drink is recorded.
- If the roll **succeeds** (player is eliminated): show a knockout
  notification to all players, auto-dismiss after 5 seconds. Set
  `isOut: true`. The player is removed from turn order but can keep watching.
  Immediately check the last-standing win condition (Section 5).
- If the roll **fails** (player survives): no notification beyond the
  challenge result screen already shown. Player keeps their drunkness level
  for next time — it does not reset.
- A player only takes the pile and rolls drunkness if they actually lost the
  challenge — i.e., this never happens on a turn with no challenge.

---

## 5. Win Conditions (both must be implemented, checked at different times)

**A. Empty hand win**
- Checked immediately after a player's pending play (Turn Flow step 5)
  leaves their hand empty.
- The challenge window for this play still opens normally (after the 5s
  cooldown) — an empty-hand play is just as challengeable as any other.
- If a challenge arrives and the empty-hand player is caught bluffing: they
  take the pile back into their (no longer empty) hand, normal game continues.
- If a challenge arrives and the empty-hand player was honest: the challenger
  takes the pile and rolls drunkness as normal. Since the empty-hand player's
  turn has now fully ended (their play stood, unchallenged successfully) and
  they hold zero cards, **the win triggers immediately** — the game ends the
  moment their turn concludes, regardless of who would nominally start the
  next round. There is no "round continues with an empty hand" case.
- If no challenge arrives before the next player's play is confirmed
  (Turn Flow step 8): the empty-hand player wins immediately. Game ends.

**B. Last standing win**
- Checked immediately after any player is marked `isOut: true`.
- Count all players where `isOut === false`. If exactly one remains, that
  player wins immediately regardless of their hand size. Game ends.

**Note on 2 vs 6 players:** no special-case logic needed for either win
condition. With 2 players, a single elimination immediately satisfies the
last-standing check. With 6 players, the same check just doesn't resolve
until 5 are out. Same code path either way.

---

## 6. Resolved Decisions Log

These were open questions during Phase 1 — kept here as a record of the
reasoning, since "why did I decide this?" is a question future-you will ask.

- **Empty-hand player wins an honest challenge with zero cards in hand:**
  the win triggers immediately when their turn concludes. No round
  continues with an empty hand.
- **Wild cards:** always auto-match the declared number, with no exceptions
  — including a play made entirely of wild cards. A challenge against an
  all-wild play always resolves as honest.
- **Deck size vs player count:** one fixed 56-card deck (4 of each number
  1–10, 16 wilds) for all lobby sizes. Hand size is `floor(56 / players)`,
  leftover cards sit out undealt. No per-player-count deck variants.

---

## 7. State Object Shape

```jsonc
{
  "players": [
    {
      "id": "p1",
      "name": "Miron",
      "hand": ["card_7_2", "card_wild_4"],
      "drunkness": 0,
      "isOut": false
    }
  ],

  "pile": {
    "cards": []                 // merged, unchallengeable cards only
  },

  "pending_play": {
    "player_id": "p1",
    "cards": ["card_7_2", "card_7_3"],   // actual cards — hidden from other players
    "declared_number": 7,
    "declared_count": 2,                  // this is what OTHER players are shown
    "played_at": 1718800000000,           // server timestamp, used to compute the 5s cooldown
    "challenge_window_open": false        // flips true 5s after played_at
  },

  "current_player_index": 0,
  "phase": "cooldown",   // "cooldown" | "challenge_open" | "resolving_challenge" | "game_over"

  "winner": null
}
```

**Notes on this shape:**
- `pile.cards` only ever contains cards that have been merged in — i.e. cards
  that survived their challenge window. Never put pending cards here.
- `pending_play` exists only while there's an active declared-but-not-yet-merged
  play. It's replaced (not appended to) on every new declaration.
- `declared_count` is redundant with `cards.length` but is listed separately
  on purpose — it's the field the server sends to *other* players (who never
  receive the real `cards` array until a challenge happens).
- `challenge_window_open` is a derived value in principle (you could always
  compute it from `played_at` + 5000ms), but storing it explicitly makes the
  phase transitions easier to reason about and broadcast.
- `phase: "resolving_challenge"` is the 7-second blocking window — while in
  this phase, the server should reject all incoming player actions outright,
  not just challenges.
