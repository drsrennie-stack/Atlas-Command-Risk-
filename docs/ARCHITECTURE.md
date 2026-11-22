# How Atlas Command fits together

## The parts

```
Student browser  ─┐
Student browser  ─┼──  Game server (Node.js)  ──  Private question bank and images
Teacher browser  ─┘        rooms, rules, answer checking
```

- **Browser.** Draws the map and sends choices. It holds no questions and no answers.
- **Server.** One small Node.js program with no added packages. It holds every room, checks every move, picks every question, and checks every answer.
- **Question bank.** A file on the server, built from copies of your Recall Rx and Loops repos.

Browsers send actions with ordinary web requests and receive live updates over a one-way stream (Server-Sent Events). This works through school networks that block other kinds of connections.

## What a student's browser receives

| Moment | Sent |
|---|---|
| Question opens | Question text, the four options or the question image, topic. No answer. |
| After every side has answered or time is up | Correct answer, explanation, option notes, answer image |
| End of match | That student's own side summary. The teacher sees all sides. |

Images are sent through one-time addresses that stop working when the turn ends, so the game itself never shows a student where the answer slide lives. The Loops pictures are fetched by the server from your public Loops site. Anyone who already knows that site can still browse it directly, the same as today.

## What this protects, and what it does not

- The full bank and the answer keys stay on the server. A student cannot download them from the page or from the browser code.
- A question that a student is shown can be copied. They can photograph it, and after the reveal they have seen the answer. No web game can prevent that.
- A private GitHub repo protects the files in the repo. It does not protect anything a browser has already been sent. That is why the bank is not in the browser at all.
- The teacher code is one shared password. Anyone who has it can host rooms and import questions. Change it by changing TEACHER_CODE on the host.

## Kajabi

| Job | Kajabi | Game server |
|---|---|---|
| Sell teacher memberships, take payment | Yes | No |
| Gate the teacher page behind a login | Yes | No |
| Show the game inside a page (iframe) | Yes | Serves the page |
| Run rooms, turns and live play | No | Yes |
| Hold the answer key and check answers | No | Yes |
| Know which teacher created which room | No | Not yet |

Kajabi cannot run server code or hold live game state, so the game needs its own host.

### Trial setup (now)

- The teacher membership page in Kajabi shows the game and the teacher code.
- Students use an open page or the join link. They never pay or log in.

### Selling setup (next stage, not built)

- Kajabi sends a message (webhook) to the game server when a membership starts or ends.
- The server keeps a list of teacher emails and gives each teacher their own sign-in link or code.
- Rooms are tied to a teacher, so a lapsed membership stops new rooms.
- This needs a small database on the game host. That same database is what would make saved progress and rooms that survive a restart possible.

## Limits to know for the trial

- Rooms live in the server's memory. A restart or a sleeping free-tier host ends open rooms.
- Rooms close after 6 hours without activity.
- One server process handles all rooms. A classroom or several at once is well within reach. It has not been load tested beyond simulated matches.
- Individual mode holds 6 players because the map has 11 territories. Larger groups use team mode.
- The end-of-match summary and Practice next are for that match only. Nothing is saved to a student.

## Building in stages

| Stage | Contents | Status |
|---|---|---|
| 1 | Server, rules engine, nervous system map, Recall Rx and Loops import, team and individual play, intro, summary, practice, import page | Done, tested locally |
| 2 | Online deploy, classroom trial, rule tuning, your review of tags and connection notes | Yours and mine, this month |
| 3 | Host overrule for typed answers, rooms that survive restarts, class report download | Not built |
| 4 | Teacher accounts through Kajabi webhooks, saved progress | Not built |
| 5 | Eleven more systems with simple boards and their cards | Done, tested locally |
| 6 | Hand drawn boards for the other systems, a body plan board, Rounds sets with several structures | Not built |
| Later | Peripheral nerve territories on the nervous map | Not built |
