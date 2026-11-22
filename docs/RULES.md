# Atlas Command ruleset, version 1

This is the first concrete ruleset. It is built and playable. The numbers are in one place (the RULES block at the top of server/engine.js), so any of them can change after your trial.

## Setup

- The nervous system has 11 territories: frontal, parietal, temporal and occipital lobes, thalamus, hypothalamus, cerebellum, midbrain, pons, medulla oblongata, spinal cord. The other systems have 6 to 8 each.
- A side is one player (individual mode, 2 to 6 players) or one team (team mode, 2 to 6 teams).
- Everyone starts with no territory. The whole map is open.
- Default match: 8 rounds. Each side takes one turn per round.

## A turn

One action, one question.

| Action | Where | Right answer | Wrong answer |
|---|---|---|---|
| Claim | An open territory | You hold it at strength 1 | It stays open |
| Reinforce | A territory you hold, below strength 3 | Strength goes up 1 | No change |
| Challenge | Another side's territory | See below | See below |

## Legal moves

- First claim: any open territory.
- After that: claim or challenge only a territory connected to one you hold.
- Reinforcement limit: strength 3.
- A side with no territory is never out. It can claim any open territory. If none are open, it can challenge any territory on the map.

## Challenge

Both sides answer the same question at the same time. The defender does not see the challenger's answer.

| Challenger | Defender | Result |
|---|---|---|
| Right | Wrong | Challenger captures it at strength 1 |
| Right | Right | Tie. Defender holds. Strength drops 1, never below 1. |
| Wrong | Right | Defender holds and gains 1 strength |
| Wrong | Wrong | No change |

Speed does not break ties. Teams need time to talk.

## Keeping the match open

- Rally rule: when the side with the fewest territories challenges the side with the most, and both are right on a strength 1 territory, the challenger takes it.
- From round 2, the lowest score goes first each round.
- Every correct answer scores a point, even on defense or on a failed capture.
- Ties wear a territory down, so a strong territory still needs defending.

## Time

- 45 seconds to choose a move. If time runs out, the turn passes.
- Answer time: 60 seconds in individual mode, 120 seconds in team mode. No answer in time counts as a miss.
- After each question the answer and explanation stay up for 25 seconds, or until the acting spokesperson or the host presses Continue.

## Team play

- Teammates hold territories together.
- One spokesperson chooses the move and submits the answer. The spokesperson changes every time the team answers, on offense or defense.
- Teammates see the question and can send a suggested answer. The team sees who suggested what.
- If the spokesperson disconnects, the next connected teammate takes over.

## Scoring

- 3 points per territory held
- 1 point per strength level above 1
- 1 point per correct answer

## How a match ends

- The last round finishes, or
- the optional match timer runs out (the turn in progress finishes first), or
- one side holds every territory, or
- the host ends it.

The highest score wins. Ties go to more territories, then more correct answers. If still tied, the win is shared.

## Questions

- The question comes from cards tagged to the target territory when there are unused ones. Otherwise it comes from the system-wide nervous system cards and is labeled "System-wide question".
- No card repeats in a match until the bank runs out.
- Recall, image identification and application cards are all in the mix. College level leans to application cards.

## Map connections

Every line on the map is a true anatomical relationship, and the map says which kind.

- Nervous system: a solid line means the two regions touch or are continuous. A dotted line means a named fiber pathway joins them (thalamic radiations, cerebellar peduncles).
- Other systems use the same two line styles with their own meanings, shown in the key under each map. For example, in the cardiovascular system a dotted line means blood flows from one to the other.
- Smaller maps (6 to 8 territories) fill up faster, so challenges start sooner. With 5 or 6 teams on a small map, expect most turns to be challenges.

Peripheral nerves, cranial nerves and the Circle of Willis are not territories yet. Their cards are in the system-wide pool. The map has room for them later.
