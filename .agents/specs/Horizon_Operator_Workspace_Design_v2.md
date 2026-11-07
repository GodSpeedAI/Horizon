# Horizon: The Operator's Desk

**Status:** Design, version 2 (revised after a second independent review and a readiness review). Replaces v1, which is kept for history.
**Date:** 2026-11-06
**Companion:** the technical annex, kept with this one. It holds the file names, commands and technical facts, so this document holds none of them.
**How the review findings were settled:** the 6 November 2026 review report, kept with the project's review records.
**Visual reference:** the operator's third screen mockup, kept with the design files.

---

## 1. What we are building

### The promise

You can hand work to AI agents and see, without relying on what they report about themselves:

- what they were expected to do,
- what they actually did,
- what the independent record shows,
- whether the rules allowed it,
- whether a person accepted it.

You can write a thought down in a second and find it again by the day you wrote it. You decide the outcomes that matter.

### The system this belongs to

Horizon is not a standalone product. It is the desk on top of a system you have already built in several parts:

| Part | What it does | Name |
| --- | --- | --- |
| Rulebook | Writes down what things are, who may do what, and the rules. Each checked edition carries a check code, so everyone can confirm they are reading the same edition. | DomainForge |
| Case keeper | Keeps the work that exists (cases and their steps), decides who may move it, and makes the final acceptance check | SEA-Forge |
| Workshop | Where agents do the work | Cognate Workbench (built on the Cognate toolkit) |
| Record keeper | An independent record that cannot be quietly edited. It writes down what was expected *before* the work and what happened *after*, and keeps the difference. | RealityTrace |
| Session copier | Copies your sessions from other AI coding tools into the record, with their usage cost, and scores each session against the plans written in the rulebook | your agent tools and their cost log |
| Typed-command entry point | Makes a command typed by hand and the same command run by a tool leave the same kind of history | gs-term |
| Agent panel builder | Lets agents build panels from fixed parts filled with real data, never raw page code, and requires the agent to reply to every answer you give it | the product-actualizer cockpit |
| **Operator's desk** | **Where the person sees, writes, decides and checks** | **Horizon** |

The whole system runs one loop:

> **Expect → Act → Record → Decide → Learn**
> 1. Write down what should happen, and how success will be judged, before acting.
> 2. A person or an agent acts within the rules.
> 3. The record keeper records what actually happened.
> 4. A person decides, with the expectation, the record and the difference in front of them.
> 5. What was learned is kept, and offered for reuse only after a person accepts it.

Each part does its own piece of the loop today. **What is missing is one place where you see the whole loop for a piece of work and act on it.** That is Horizon.

### The first thing people should see

The demonstration that makes the value plain: **"What the agent reports" next to "What the independent record shows."**

| What the agent reports | What the independent record shows |
| --- | --- |
| "Ran the tests. Tests passed." | **Expected**, written down before the run: "all checkout tests pass"<br>**Observed:** 3 tests failed<br>**Difference:** contradicted<br>**Rules in force:** payments rulebook, edition 1.0.0. The step was allowed by the rule "tests must pass before a fix goes in".<br>**Record intact:** yes, checked just now<br>**Accepted:** no, waiting for you |

Most tools show only the left column. This system adds the right one. The right column is useful even without the case keeper, because it is a record of expected against observed that cannot be quietly edited. That can support decisions and the training of agents. With the case keeper and the rulebook it also shows *which rule allowed it* and *who accepted it*.

**Honesty rule.** The view shows only rows that have real data behind it. Any other row says **"not recorded"**, with one line saying why. What each build stage can honestly show:

| Stage | Rows with real data |
| --- | --- |
| 1 | Expected, observed and difference for sessions the session copier has already scored against a rulebook plan, and for Horizon's existing automatic checks. "Record intact" for everything in the record. Every other row reads "not recorded". |
| 4 | Adds expected, observed, difference, allowed by rule and accepted for every piece of work handed to agents through a case |
| 5 | Adds the rulebook edition to every record, plus records for each AI request and each message you typed |

---

## 2. Words used in this document

**People and things**

| Word | Meaning |
| --- | --- |
| **Operator** | The person using Horizon (you). |
| **Agent** | An AI program given a piece of work to do. |
| **Organization** | A group whose cases, notes and records are kept separate from every other group's. |
| **Session** | One sitting in which an agent works, made of **turns**. A turn is one message from a person and the agent's reply. |
| **AI request** | One call from an agent to an AI model. Each request costs **usage**: the amount of text the model read and wrote, which is what the provider charges for. |
| **Case** | One piece of work with a goal, made of steps. Its steps and decisions are held by the case keeper. |
| **Case keeper** | The part that holds all cases and their steps, decides who may move them, and makes the final acceptance check. |
| **Workshop** | The place where agents do the work. |
| **Step** | One item of work inside a case. It can be a task for a person, a task for an agent (which may be of the review kind), a milestone, or a wait. A step can carry a link back to where it came from (a GitHub issue or a ticket). |
| **Ticket** | A request for work made in another tool, such as a bug report with a title, description and link. The workshop makes its own tickets; it grew out of the earlier ticket-making agent tool, so there is no separate tool to connect. Every ticket becomes a step (§7.4). |
| **Assignment** | A step handed to an agent in the workshop, carrying its limits and how its result will be checked. |
| **Rulebook edition** | One checked edition of the rulebook. A record made under an old edition stays tied to that edition. "Edition" is used only for the rulebook. |
| **Add-on pack** | A named bundle of extra abilities that agents can use. |
| **Connector** | A small program that keeps GitHub and the case keeper in step. |
| **GitHub issue** | A task on GitHub. A **sub-issue** is a smaller task inside one. A **GitHub tag** is the label on an issue. A **GitHub board** is a GitHub Project: a board of cards, one per case. A **repository** is a project's folder of code on GitHub. |
| **Build stage** | One of the six planned steps in §9. Each ends with a working demonstration. |
| **Setup** | One complete, separate environment: its own folder, organization, stored data and record. There are two. |
| **Test setup** | The setup used for all building, testing and demonstrating. It can be thrown away whole. It uses a **test repository** and a **test board** on GitHub. |
| **Production** | The real setup. It starts empty. |

**Records and checks**

| Word | Meaning |
| --- | --- |
| **Record keeper** | The independent part that keeps the records. |
| **Record** | One entry in a record store. Records are numbered in order, and each one carries a check code made from the record before it, so any change to an earlier record is detected. A single record can never be removed from a record store. |
| **Record store** | A separate place where records are kept. There are three (§9.1): the personal record, the test record and the production record. |
| **Check code** | A short code made from some content. The same content always gives the same code, any change gives a different one, and the code reveals nothing about the content. |
| **Expectation** | What should happen and how success will be judged, recorded before the work starts. |
| **Observed** | What the record shows actually happened. |
| **Difference** | The result of comparing expected with observed: *matched*, *contradicted*, *expected but not seen*, or *seen but not expected*. |
| **Rules in force** | The rulebook edition and the rules that applied to a step. |
| **Allowed by rule** | The rule under which the case keeper said yes to a step. |
| **Record intact** | The check codes of the records were verified just now, and no earlier record has been changed. |
| **Acceptance check** | The case keeper's final check of a result against the agreed tests for success. "The agent finished" is not acceptance. |
| **The seven checks** | What Horizon already checks before offering any action: can you **see** it; can you **reach** it; is the **cost** covered; do you have the **authority**; does the **capability** exist; can it be **undone or recovered**; may you **see the final outcome**. |
| **Automatic check** | A check Horizon already runs by itself, such as confirming a change works before offering it. |
| **Label** | What you record about one agent run: pass or fail, plus "the first thing that went wrong". |
| **Automatic label** | A label produced by an automatic check and shown next to yours. |
| **Mark** | A note such as "reviewed by operator" placed next to a piece of work. It never changes the work's state. |

**Decisions**

| Word | Meaning |
| --- | --- |
| **Decision** | A person's choice: **accept**, **reject** (optionally with new instructions), or **hold** (with a reason). The case keeper records who decided and under which rule. People accept; rules allow. |
| **Allowed** | The case keeper's yes under a rule. It is not the same as accepted. |
| **Final sign-off** | Closing the case and recording its final outcome. It cannot be undone. |
| **Preview** | A trial run that shows what an action would change, who may do it, how to undo it and what it opens next. Nothing happens. |
| **Lesson** | Something an agent learned and proposes for reuse, such as "in this project, run the full check, not only the quick one". It is active only after a person accepts it. |

**Screen words**

| Word | Meaning |
| --- | --- |
| **Desk** | All of Horizon. |
| **View** | One of the four main sections: Today, Explore, Decide and Work. |
| **Page** | One of the old separate screens that are being retired (§11). |
| **Panel** | A screen area built by an agent from fixed parts (a table, a timeline, a comparison, a question and so on) filled with real data. Neither Horizon nor an agent ever writes raw page code. |
| **Status bar** | The strip across the top that always shows where you are and what needs you. |
| **Inspector** | The right-hand column showing the one selected item, where it came from and its history. |
| **Composer** | The text box at the bottom where you write, search, ask and hand off work. |
| **Mode tag** | The small box on the composer showing how your text will be taken before you send it. |
| **Link** | A small box inside your text that points to a case, step, note, record, day or person and opens the inspector. |
| **Highlight colour** | The one colour reserved for "this needs your decision". |
| **Layer** | Anything that opens over the main view, such as a menu or a preview. |
| **Pinned** | Kept in place by you, so that updates do not move it. |
| **Presenting** | A switch that replaces project and repository names with steady stand-ins, on screen and in exports. |
| **Attention rules** | The nine rules in §5.2 that decide what may take your attention. |

**The states of a piece of work.** These are always shown in words and never merged into one green tick:

| State | Meaning | Who says so |
| --- | --- | --- |
| requested | someone asked for it | Horizon or the workshop |
| allowed | the case keeper said yes under a rule | case keeper |
| queued | waiting for an agent to pick it up | workshop |
| running | an agent is working on it | workshop |
| done | the workshop reports it finished | workshop |
| recorded | the record keeper recorded what happened | record keeper |
| checked | the acceptance check passed | case keeper |
| accepted | a person decided yes | person (recorded by the case keeper) |

Three more words describe what Horizon is showing rather than the work itself:

- **preview**: not real yet; this shows a preview, and nothing has happened.
- **changed since you looked**: the source moved on after you pinned it.
- **not recorded**: no data exists.

A mark puts "reviewed by operator" next to a piece of work. It never moves the work to a new state.

---

## 3. Who owns what

Horizon shows things and passes your decisions to the part that owns them. It owns only what you write.

| What | Owner | Horizon's part |
| --- | --- | --- |
| Rulebook editions | Rulebook | Show the edition next to every record |
| Cases, steps, who may move them, acceptance checks, decisions | Case keeper | Show cases and steps, show previews, send decisions. **No second ticket list, no second list of decisions waiting and no second history.** |
| Agent sessions, tools, teams, reviews, add-on packs | Workshop | Start work through the case keeper, show progress, open the exact session in the workshop |
| What really happened | Record keeper | Read and compare. Never present a record as acceptance. |
| Sessions from other AI coding tools, and their cost | Your agent tools, whose sessions the session copier writes into your personal record | Read them from the personal record, not from your private folders. Never write to it. |
| Looking up reference material for "Ask" | The reference library Horizon already connects to | Show answers with links to their sources. Show "not connected" when it is not connected. |
| GitHub issues, sub-issues and boards | GitHub, kept in step by the connector from the case keeper | Show the link. The case keeper's state wins. (§7.5) |
| Notes, days, tags, labels, marks, layout preferences | **Horizon** | Write, find, revise |

Two rules hold everywhere:

1. **A person's decision never overrides the rulebook.** The organization allows actions through the case keeper. You decide outcomes within what is allowed.
2. **Agents propose. People decide.** No agent can accept its own work. The part that owns the decision enforces this, not the screen. The case keeper refuses to let anyone accept their own request, and also refuses when it cannot tell who is asking. The workshop will not take a review as done without evidence from a second agent. Only a person can make a lesson active.

---

## 4. What exists and what is missing

Horizon builds on what is already there and adds only what nothing does today. The annex gives evidence for every row.

| Need | Already exists | Missing |
| --- | --- | --- |
| Screen parts | Horizon has a fixed set of 15 parts and a strict rule-check that rejects badly built parts. The agent panel builder has the same 15 part names, but is built differently inside. | A way for agents to build Horizon panels, ported from the agent panel builder into Horizon's format (stage 4). A part for notes, and links to cases, steps, sessions, records, days and notes (stage 2). |
| The seven checks | Yes | — |
| "Where am I" (rulebook edition, point in history, thing in view) | Yes | — |
| Decisions waiting, with the rule that nobody accepts their own request | Yes, in the case keeper. Horizon has a page for them. | Move it into the new desk (stage 3) |
| Trial runs of case actions | Yes, in the case keeper | Show them as preview cards (stage 3) |
| Writing the expectation before a check | Yes, for Horizon's automatic checks | Do the same for every step handed to agents (stage 4) |
| Agent session history | Yes, in the workshop | A link that opens one exact session and turn (a small change in stage 1) |
| Agent work reaching the record | Partly. Actions and final answers are recorded now. AI requests and typed messages are not, and records are tied to a stand-in rulebook. | Wider coverage and the real rulebook edition. Stage 5 also makes records hold check codes only, not words. |
| Sessions from other AI coding tools | Yes. Your agent tools already send them to your personal record, where they are scored against rulebook plans. | Reading them in Horizon (stage 1) |
| Cost per session | Yes, in your cost log | Joining cost to accepted outcomes (stage 3) |
| A place to keep notes | No | Notes in Horizon's existing store (stage 2) |
| One door for work | The case keeper already records who proposed each step, and the workshop makes tickets. No path leads from tickets or GitHub issues into case steps. | One door with three entries: Hand off, GitHub issues and agents proposing follow-up steps (§7.4, stage 4) |
| Running a review as work in a case | The review method exists, and the workshop has team reviews | Reviews run as case steps (stage 6) |

---

## 5. The experience

A system with a poor interface is hard to use. This section is required.

### 5.1 One layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ STATUS BAR   Acme · Setup: testing · Rules: payments 1.0.0 ·             │
│              Case: Checkout fix · Needs you: 2                           │
│              Records: up to date · Cases: connected                      │
├────────────┬───────────────────────────────────────────┬─────────────────┤
│ Today      │                                           │ INSPECTOR       │
│ Explore    │   The open view                           │ the one         │
│ Decide (2) │   (a day, a case, the decision list,      │ selected item,  │
│ Work       │    or running work)                       │ its source and  │
│ ────────── │                                           │ its history     │
│ Days       │                                           │                 │
│ Cases      ├───────────────────────────────────────────┤                 │
│ Tags       │ [Write ▾] type here…            COMPOSER  │                 │
└────────────┴───────────────────────────────────────────┴─────────────────┘
```

The main way to move around is the left column. Keyboard shortcuts also work (§5.4). The left column holds four views and three lists.

| View | Answers | Shows |
| --- | --- | --- |
| **Today** (opens on launch) | "What am I doing?" | Today's notes and today's activity, in time order |
| **Explore** | "What is here?" | Cases, people, rulebook entries, records and related notes, all searchable |
| **Decide** | "What needs me?" | Decision cards, oldest first, each with its preview |
| **Work** | "What is running and how did it go?" | Assignments, sessions, the comparison view, labels and cost |

The lists are **Days**, **Cases** and **Tags**.

- The **status bar** always shows the organization, which setup is active, the rulebook edition, the open case, the count of things waiting on you, the days left on the workshop access key when 7 or fewer remain (§9.1), and the health of each connected part in words ("Records: 3 minutes behind").
- The status bar shows only what the connected parts report. **An agent can never change it or cover it.**
- The status bar has a **Presenting** switch. When it is on, every project and repository name is replaced by a stand-in that is the same every time (for example, one project is always "Project K7QF"). The stand-in is made with a secret kept in the setup's folder, so it cannot be worked back to the real name. This applies on screen and in every exported file. The records underneath are unchanged, so the comparison stays true. While Presenting is on, exports always use stand-ins. With Presenting off, the export asks, and the default is stand-ins.
- These views reuse the areas the current desk already has (context, decision, evidence, inspector, history, agent), so no new screen design is needed.

### 5.2 Attention rules

These rules decide what may take your attention. Each one has a test.

1. **One decision, one highlight.** At most one thing on screen uses the highlight colour. Others wait as "1 of N".
   *Test:* two pending decisions show exactly one highlighted card.
2. **Agents never move your cursor or your place.** Agent activity may only change counts, add items at the end of a list, update the inspector, or open a panel you asked for.
   *Test:* fire 50 agent updates while you type; the cursor, the selection and any open layer stay unchanged.
3. **Only you move the keyboard cursor, and Escape always takes you back** one layer at a time.
   *Test:* open three layers, press Escape three times, and the cursor is back where it started.
4. **Three strengths of interruption.**
   - A **count** appears beside a view name.
   - A **notice** waits in Decide.
   - A **decision card** shows its age and can be held with a reason.
   *Test:* a mix of events gives the right counts and order, with no change of cursor position.
5. **Never scroll away from what you are reading.** New items while you read show "N new ↓" instead of moving the screen.
   *Test:* scroll up, add items, and the position holds while the count is right.
6. **Every item states its state in words**, using the states in §2. Colour is only ever a second cue.
   *Test:* with colour removed, every state can still be told apart.
7. **Missing data says "not recorded".** It never says 0 and never says "passed". A note cannot make a check pass.
   *Test:* a step with no record shows "not recorded" and counts as unchecked.
8. **Problems come first.** Anything you rely on that has been contradicted sorts to the top of its view, in plain words.
   *Test:* a contradicted record is the first item in Work.
9. **What you pin stays put.** A pinned item shows the date it was pinned and is shown as "changed since you looked" when the source moves on. It is never silently refreshed.
   *Test:* change the source; the notice appears and the content is unchanged.

The shared list of standard screen pieces sets the general rules that apply everywhere and need no design of their own here: every greyed-out control says why it is off, every empty area offers one next step, and shortcuts never fire while you are typing.

### 5.3 The composer

One text box. **Before you send, the mode tag shows how your text will be taken.** Tab changes it.

| Mode | What happens | Stage |
| --- | --- | --- |
| **Write** (default) | Saves a note on today, and on the open case if there is one | 2 |
| **Find** | Searches notes, days, tags, cases and records. Results appear in place. | 2 |
| **Ask** | Asks a question. Answers link to their sources. Shows "not connected" when no reference library is connected. | 2 |
| **Hand off** | Turns your text into a proposed step for an agent. It always shows a preview first and never acts directly. | 4 |

- Typing @ adds a link to a case, step, note, record, day or person. The link shows as a small box that opens the inspector.
- A draft you have not sent survives switching views and restarting.
- If Horizon guesses a different mode, it shows the guess. It never applies it silently.
- Other actions, such as building an add-on pack in the workshop, are in the quick menu (Ctrl/Cmd+P), not in the composer.

### 5.4 Keys

| Keys | Action |
| --- | --- |
| Ctrl/Cmd+K | Go to the composer |
| Ctrl/Cmd+P | Quick menu: jump to a day, case or tag, or run any action |
| Ctrl/Cmd+1 / 2 / 3 / 4 | Today, Explore, Decide, Work |
| Ctrl/Cmd+[ and ] | Previous / next day |
| J / K | Next / previous item |
| Enter | Open the item in the inspector |
| A / R / H | On a decision card: open the preview to accept, reject or hold |
| Esc | Close the top layer |
| ? | Show all keys |

**No single key ever completes a decision.** A, R and H open the preview, and the decision is confirmed there.

### 5.5 The decision card

Taken from the third screen mockup. It is the only thing that uses the highlight colour.

```
NEEDS YOU · Checkout fix · Step: add the fix to the main code · waiting 2 hours
Accept the checkout fix?
Expected: all checkout tests pass (written down before the run)
Observed: 3 tests failed                         Difference: contradicted
Known: tests ran on the latest code             Not known: whether the failures are random
Rule: tests must pass before a fix goes in (payments rulebook, edition 1.0.0)
[ Hold — write the missing test ]   [ Reject… ]   [ Accept… ]
If you hold: nothing changes and the step keeps waiting. To undo: release the hold.
```

- The safe choice comes first.
- Every choice says what it will do and how to undo it.
- After you decide, the card stays where it was, showing who decided, when and under which rule.

### 5.6 The preview

Every choice that changes anything opens a preview first. It shows:

- **Kind:** *can be undone*, *changes things*, or *cannot be undone*.
- **What it touches** and its current state.
- **What will happen.** Each effect is shown as *certain*, *follows from the rules*, *expected*, *unknown*, or *only known afterwards*.
- **Who may do this**: the rule, and the seven checks, each passed or failed with its reason.
- **Stops if** (the condition that halts it) and **limits** (time, cost, scope).
- **How to undo it**, and **what it makes possible next**.

**The confirm button applies to this exact preview.** If anything it shows changes before you confirm, the button switches off and says "preview out of date — refresh". This is checked by the case keeper, not only on screen. The decision carries the preview's check code (made from the exact action, its settings and the items it touches), and the case keeper refuses it if the two no longer match.

**Actions that cannot be undone also need a typed reason.**

### 5.7 The comparison view

This is the demonstration from §1. It is the main panel in Work and also appears in the inspector for every session and step.

- **Columns:** "What the agent reports" and "What the independent record shows".
- **Rows:** expected, observed, difference, rules in force, allowed by rule, record intact, accepted.
- **Missing rows** say "not recorded" and give the reason.
- **A filter** shows only *contradicted* and *expected but not seen*. It is the fastest way to find where agents went wrong.
- **Beside every run:** the label control (pass or fail, and the first thing that went wrong). Labelling starts in stage 1, so the first demonstration already builds the set of labelled runs (§8.2).

### 5.8 Look and feel

- Use the workshop's existing visual design, taking its colours and text settings rather than redrawing them.
- One filled button per screen. Calm motion, and none at all when "reduce motion" is on. Text is large enough to read easily (at least 12 pixels). You can always see where the keyboard cursor is.
- Screen labels use plain words, never product names. GitHub is the one exception, because you must recognise it. The status bar says "Rules", "Cases", "Records".

---

## 6. The notebook

### 6.1 What you can do

- **Write without choosing anything.** Today opens on launch. Type and press Enter in Write mode, and the note is saved on today, with no form, folder or ticket.
- **Write different kinds of note.** A note can be a paragraph, a checklist, or a link to something else (a case, step, record, session or file).
- **Find things by when you did them.** "What was I doing last Tuesday?" opens that day: your notes and the activity of that day (case decisions, agent work, records), each shown with where it came from.
- **One note, two places.** A note written while a case is open also appears on that case. It is the same note, not a copy. Editing it changes it in both places. Removing it from the case does not delete it.
- **Tags** help you find things. A tag never allows anything and is never evidence: a note tagged "accepted" accepts nothing.
- **History.** Every edit is kept, and you can read any earlier wording. (Bringing old wording back is left for after the first release.)
- **A day is the date in your chosen time zone** at the moment you write. Travelling does not split a day unless you change the setting.

### 6.2 Privacy and separation

- Every search, list, count and suggestion leaves out what you may not see *before* counting. A hidden note never appears even as a number.
- Your own notes are not sent to the record keeper. They are your own writing, not evidence. Actions and decisions are always sent.

### 6.3 What a day shows

Each source is named on the screen. A source that is not connected says so:

| Source | Shows | When missing |
| --- | --- | --- |
| Cases | case decisions and step changes | "Cases not connected — case activity not shown" |
| Agent work | agent sessions and their results | "Agent work not connected" |
| Records | records, including sessions from other AI coding tools | "Records not connected" |

An empty day says *why* it is empty: no activity, a source is not connected, or it is still loading. It never just shows nothing.

---

## 7. Handing work to agents

### 7.1 The path

```
Your words ──► proposed step in a case ──► allowed by the case keeper
  ──► expectation recorded ──► assignment in the workshop
  ──► work recorded ──► acceptance check ──► your decision
```

1. In Hand off mode, describe the work. Horizon asks the case keeper for a preview of adding the step, and shows it.
2. When you confirm, the case keeper adds the step and decides whether it is allowed. Horizon keeps no list of work of its own.
3. **Before any agent starts, the expectation goes to the record keeper:** what the step must achieve, and how each agreed test for success will be checked.
4. The step becomes an assignment in the workshop. It carries the case and step, the scope, the agreed tests for success, the allowed tools, time and cost limits, and the number of the expectation record. It is not a forwarded chat.
5. The workshop does the work and the record keeper records it. **Progress in Horizon comes only from the workshop and the record keeper.** Nothing is invented.
6. When the work is reported done, the case keeper runs the acceptance check against the recorded evidence.
7. A decision card appears in Decide, and you accept, reject (optionally with new instructions) or hold.

**Asking twice changes nothing.** Every request carries a unique reference number. The case keeper refuses a second step with the same number, and the workshop refuses a second assignment for the same step. For Hand off, the number is made when a draft starts and survives a restart. A retried send makes no new step. A new draft makes a new step. *Test:* send the same request three times, and exactly one step and one assignment exist.

### 7.2 When the window closes

The workshop keeps working when its window is closed. When you reopen Horizon, it rebuilds what is running from the case keeper and the workshop. It never shows work as running without a fresh report from the workshop. If the workshop is not set to keep running when Horizon is closed, the status bar says so.

### 7.3 Panels made by agents

An agent can show its results as a panel built from Horizon's fixed parts, for example a table of the files it changed or a comparison of before and after. This comes from the agent panel builder:

- The agent supplies data. Horizon checks it, builds the panel, and opens it **beside** the current view, never over it, and only after you asked for it.
- If you answer a question in an agent's panel, your answer is recorded. The agent must reply to every answer. Until it has, the step cannot be accepted.
- A panel you have pinned keeps its place when the agent updates it. At most eight panels are open at once, and closing one can be undone.

### 7.4 One door for work

The case keeper holds all work. Every piece of work enters it as a step, through the same door. There is no separate ticket list and no second list to keep in step. Three entries lead to the door:

1. **Hand off.** You describe the work in the composer (§7.1).
2. **GitHub issues.** The connector adds issues tagged for Horizon as steps (§7.5).
3. **Agents in the workshop** propose follow-up steps. Tickets that the workshop makes arrive this way. The case keeper already records who proposed each step, and a proposed step waits for a decision like any other.

The same rules apply to all three:

- A ticket's title, description and link become the step's text.
- The unique reference number comes from the source: the draft for Hand off, the issue's owner, repository and number for GitHub, and the ticket's own number for tickets. So the same source sent twice still makes one step.
- A step that came from a GitHub issue or a ticket carries a link back to it, shown in the inspector. Steps saved before this link existed still open. A test confirms it.
- There are no existing tickets to move. The door is built in stage 4, and everything made while building lives in the test setup (§9.1).

### 7.5 GitHub issues and boards

GitHub is a second view of the same work, for collaborators and for code. It is never a second list. The case keeper decides; GitHub shows.

| In this system | On GitHub | Direction |
| --- | --- | --- |
| Step | A GitHub issue | An issue with the GitHub tag for Horizon becomes a step. The step's state goes back to the issue as a GitHub tag plus a short comment with a link. |
| Case | A parent issue, with the case's steps as its sub-issues | The case keeper creates and updates it. If GitHub does not support sub-issues (checked when the test setup is made, §9.1), the parent issue lists the steps as a task list in its own text instead. |
| All cases of an organization | One GitHub board, with "Case" and "State" columns | The case keeper fills it. There is one board per organization and no per-case boards. |

- **How it works:** the connector watches issues tagged for Horizon and adds them as steps through the one door. It uses your existing GitHub sign-in, and Horizon stores no GitHub password or token. It writes state changes back to GitHub and records each write in the record keeper. After each successful write it saves its place (how far it has read). There is no queue of waiting updates.
- **How it fails:** if GitHub cannot be reached, steps keep working and the status bar shows "GitHub: not connected". When GitHub is back, the connector carries on from its last saved place.
- **Closing an issue on GitHub never accepts the work.** Only a person's decision in the case keeper does. An issue closed early shows as "closed on GitHub, not accepted" in Horizon and on the issue itself.
- **Comments on an issue appear on the step**, shown with their author. They are never decisions.
- **Access stays with GitHub.** Horizon shows a GitHub link only to people who can see that repository.

---

## 8. Reviews, checking whether the agents work, and learning

### 8.1 Independent review as normal work

A fresh-eyes review (the operator's Elephant-and-Goldfish method) works like this. The author drafts and keeps the full history. Reviewers who have never seen the author's earlier work check it. A person decides on each finding.

That method becomes an ordinary case step:

- A review is an agent task of the review kind, done by a workshop team. The workshop already refuses to take a review as done without evidence from a second, independent agent.
- **Today a reviewer is given the team's shared notes**, which can include the author's conclusions. One reviewer type (the critic) is already tested to start with no history. Review steps are not. Stage 6 fixes that, and the same test is extended to prove it.
- The review report is attached to the step as evidence. You accept or reject each finding, with a reason.

### 8.2 Checking whether the agents work

This is part of the product from the first stage, because a system that cannot show whether its agents work cannot be trusted with real work.

Two kinds of checking apply in the first release, in this order:

1. **You read real runs and label them.** On any run, you record pass or fail and write the first thing that went wrong. A label is a short written record holding the pass or fail, the first thing that went wrong, a link to the exact session and turn, and a link to the record if one exists yet.
2. **Automatic checks** that already exist cost nothing extra. The record keeper's differences ("contradicted", "expected but not seen") and the session copier's scores against rulebook plans appear as automatic labels next to yours.

A third kind comes later: **an AI reviewer that scores runs**, once there are enough human labels to check it against. It must be a different AI model from the one it reviews. It is not part of the first release.

What you can do with labels:

- **Labelled runs are listed in Work.** Group the list by "first thing that went wrong" to see which failure is most common. Export it as a file for training agents.
- **The first release shows no single score.** People should read failures before trusting a score.

### 8.3 The measure that matters: cost and effort per accepted outcome

| Part | Source |
| --- | --- |
| **Cost** | AI usage and money, from the cost log and the workshop |
| **Effort** | turns, repeat attempts and your time |
| **Accepted** | the acceptance check plus your decision |

Work shows this per case and per agent. A figure without a source shows "not recorded".

### 8.4 Lessons

An agent may *propose* a lesson. It appears in Decide, and it becomes active only if you accept it. The workshop already allows only a person to make a lesson active. Notes and agent guesses never become active lessons on their own.

---

## 9. Build stages

The order is fixed. Each stage ends with a real task working against the real connected parts, in the test setup (§9.1). A stage that works only on made-up data does not count. Real data means your personal record, which is not made-up data. Each stage lists what must be running. Files are listed in the annex.

Each change to the case keeper or the workshop ends the same way: one build at a time, after checking free memory; then stop that part; then start it again with the active setup's settings.

| Stage | You can… | Must be running | Done when |
| --- | --- | --- | --- |
| **1. See what really happened** | Open any session and see what the agent reports next to what the independent record shows, label runs pass or fail, jump to the exact session in the workshop, and switch on Presenting to hide project names | The record keeper, the workshop, and the session copier already in use | A recorded walk-through of three real sessions read from the personal record: one matched, one contradicted, one with rows "not recorded". Each is labelled. With Presenting on, no real project or repository name appears on screen or in an exported file. The time between something happening and its record appearing is measured, and the threshold for grouping records is set at a 2-second median unless the measurement shows otherwise. |
| **2. Write it down, find it later** | Write a note by typing and pressing Enter on the new running desk, close the app, and next week find it by day, tag or case | The same as stage 1 | A recorded walk-through: write a note, tag it, link it to a case, close Horizon, reopen, and find it by date and by tag. The note's author, history and case link are intact. Attention-rule tests 2, 3, 5, 6, 7 and 9 pass. |
| **3. Decide with a preview** | Accept, reject and hold from decision cards with previews, and see cost per accepted outcome. Every old page now lives in the new desk. | The same, plus the case keeper | A recorded accept, reject and hold against the running case keeper in the test setup. The confirm button turns off when its preview changes. The test of the full accept-and-final-sign-off path passes. Attention-rule tests 1, 4 and 8 pass. |
| **4. Hand work to agents** | Turn a sentence into a step that an agent does. Its expectation, records, acceptance check and your decision all appear in the comparison view. Agents can show results as panels and propose follow-up steps. | The same | One real piece of work goes from your words to an accepted outcome, with every row of the comparison filled from real data. One GitHub issue and one agent-proposed follow-up step arrive as steps and reach a decision the same way. The three-times-request test passes for Hand off, for GitHub issues and for tickets. |
| **5. Record everything** | Each AI request and each message you type leaves a record tied to the real rulebook edition. You can see that it is recorded, but not its words. | The same | Records show the rulebook edition. A test confirms records hold check codes, not text. The delay between something happening and its record appearing is measured again and compared with the stage 1 threshold (2-second median unless stage 1 showed otherwise). Grouping records is added only if the measurement is over that threshold. |
| **6. Review and learn** | Run a review as a case step, decide its findings, and accept or reject lessons. This stage needs the agent steps from stage 4. | The same | One real review is run and decided. A test proves the reviewer started without the author's conclusions. The test setup is cleared, a fresh production setup is created, and the empty check reports zero cases, notes, labels and production records (§9.1). |

### 9.1 Building in a test setup, shipping clean

A single record can never be removed from a record store. So test data cannot be cleaned out of a record afterwards. It has to be kept apart from the start. A whole separate test record can be thrown away, and the clear step does that.

- **Three record stores.**
  - The **personal record** is your existing record of sessions from other AI tools, written by the session copier. It is neither test data nor production data. Horizon only reads it, through the read-only access it already has, in both setups. It never writes to it, and it is never cleared.
  - The **test record** is a separate record store inside the test setup's folder.
  - The **production record** is a separate record store inside the production setup's folder.
- **Two setups.** One setting chooses the setup: testing or production. All building, testing and demonstrating runs in the test setup. Production is the real setup and starts empty. Each setup has its own folder in your home area, with a marker that says which setup it is. One table gives, for each setup, its own organization, Horizon's stored data, record store, case keeper data, workshop data, port, GitHub test repository and board. The workshop uses its own bundled store inside the setup's folder, so no outside store is needed.
- **Four steps, in plain words.**
  1. *Show the settings.* Prints the settings needed to start each part for the chosen setup.
  2. *Create.* Makes the setup's folder, its marker and fresh empty data folders.
  3. *Clear (test setup only).* First lists every folder and every GitHub item it would remove, and does nothing until you confirm. It refuses if the setup is production or the marker is missing. It deletes the test setup's folder (the test record included), the test issues and the test board. It never deletes a repository: its GitHub permission covers boards and issues, not deleting repositories.
  4. *Check empty (production).* Must report zero cases, notes, labels and production records, and an empty production store. The personal record is excluded by name.
- **Nothing mixes.** Every connected part is pointed at the setup by the same setting. The status bar shows which setup is active ("Setup: testing"). A record or case from one setup is never shown in the other.
- **GitHub too.** The test setup uses the test repository and the test board. Production uses the real repositories and the real board. These are named checks when the test setup is made: your GitHub sign-in has permission to manage boards, the test repository exists, and GitHub supports sub-issues (if not, the task-list fallback in §7.5 is used).
- **Workshop access key.** Horizon reaches the workshop with a key issued for at most 90 days. It is saved in the setup's folder, readable only by you, and never shown. The status bar warns when 7 days or fewer remain. A test confirms the key never appears in logs, records or exports.
- **The rulebook is the same in both.** Editions are content, not test data.
- **Before shipping:** clear the test setup, create production, and check that Today, Decide, Work, the production record and Horizon's production store are all empty. That check is part of the done criteria for stage 6.
- Your real sessions from other AI tools stay in the personal record. During building, Horizon reads them from there and never changes them, and the Presenting switch hides their names.

**Measure before adding speed-ups.** Stage 1 records how long a day, a record lookup and the comparison view take on real data. Speed-up measures are added only if the measurements show they are needed.

---

## 10. Decisions made by the operator (2026-11-06)

1. **One door for work.** The case keeper holds all work. Every piece of work enters as a step through one door with three entries: Hand off, GitHub issues, and agents proposing follow-up steps. There is no separate ticket list (§7.4). There are no existing tickets, so nothing is moved.
2. **Demonstration data.** Real names are shown on your own screen. They are replaced by steady stand-ins when Presenting is on. While Presenting is on, exports always use stand-ins. With Presenting off, the export asks, and the default is stand-ins (§5.1).
3. **A clean start for production.** Everything made while building and testing must be removable before shipping, using three separate record stores (§9.1).

---

## 11. What is removed, kept or deferred

| Item | Decision | Why |
| --- | --- | --- |
| Horizon's current pages (the desk, decisions waiting, inspect, cost, getting started, open case, final sign-off) | **Moved** into the new desk page by page, then removed in stage 3. The annex lists every page and where it goes. | Two desks would drift. Nothing is removed before its replacement works. |
| Empty folders and out-of-date notes about past versions | **Removed and corrected** in stage 1 | They mislead readers |
| The typed-command screen | **Kept as it is**, with nothing added | It works and is tested. It is not the desk. |
| Signing in from a phone | **Kept** | It is how you sign in from a phone |
| Horizon's automatic checks | **Kept and widened** (stage 4) | They already write the expectation before the check runs |
| A shared set of standard screen pieces for Horizon and the agent panel builder | **Deferred** until both are built the same way inside | Same part names, but different formats today. Merging now would cost more than it saves. |
| A separate ticket list | **Not built.** All work enters as steps through one door (§7.4). | A second way in would drift from the first |
| An AI reviewer that scores runs, and re-running all labelled runs | **Deferred** (§8.2) | Needs human labels first |
| Back-dated notes | **Deferred** | Not part of the promise |

---

## 12. Decisions, with the options turned down

| Decision | Chosen | Turned down, and why |
| --- | --- | --- |
| Where notes live | Kept in Horizon's existing store, each save completed in full | A new store (more to run). A running log of every change (more than needed). The record keeper (it keeps no content by design). |
| Screen parts | Horizon's existing parts and rule-check. The agent panel builder's way for agents to build panels is ported into them. | A shared set now (the formats differ). New parts written from scratch (wasteful). Agents writing their own screen code (unsafe). |
| Sessions from other AI tools | Read from the personal record, which already receives them | A separate export file (a second path to the same data) |
| Expectations | Widen Horizon's existing automatic checks to steps | A new service. Agents reporting on themselves. |
| Checking whether agents work in the first release | Your labels, plus the automatic checks that already exist | A scoring service first (you cannot write good scoring rules before reading real failures) |
| Desk shell | The current desk's areas, made live and usable from the keyboard | The agent panel builder's movable window layout (more than this needs). The current pages, which cannot update live or follow the keyboard rules. |
| Work intake | One door with three entries, each with a unique reference number | A separate ticket list. Keeping a second list in step. |
| GitHub | Issues and boards as a view the case keeper keeps updated. Issues come in as steps. Only the case keeper accepts. One board per organization. | Two-way sync where either side can decide (drifts, and closing an issue would bypass acceptance). One board per case (too many boards). |
| Test data | Three record stores: personal, test and production | One shared record (test data could never be removed from it) |
| Demonstration data | Real names on your screen, steady stand-ins when Presenting is on and in exports (the export asks when Presenting is off, defaulting to stand-ins) | Made-up data (less convincing). Always showing real names (exposes private projects). |

---

## 13. Risks

| Risk | What would go wrong | What prevents it | How it is checked |
| --- | --- | --- | --- |
| The comparison overclaims | People trust rows that were never recorded | Missing rows say "not recorded" | A run with no expectation shows only "record intact" |
| Notes leak between organizations | A private note shows up in another group's count or search | Hidden items are removed before counting | Two organizations with identical note titles give identical counts with and without the hidden notes |
| Work runs twice after a restart | Duplicate agent work and double cost | Unique reference numbers, refused a second time by both the case keeper and the workshop | The three-times-request test |
| The record keeper falls behind | The comparison shows old data as current | The status bar shows "Records: N behind", and rows show their age | Stop the record keeper, act, and confirm "behind" is shown, never "matched" |
| Private content reaches the record | Text stored in a record that cannot be removed | Only check codes and reference numbers are sent | A test confirms that a record of an agent's action holds none of the words it was given or returned |
| The workshop access key leaks | Someone else could use your workshop | The key is saved readable only by you, never shown, and expires within 90 days | A test confirms the key never appears in logs, records or exports |
| Agent panels grab attention | Your cursor or reading position is lost | Attention rules 2, 5 and 9 | The rule tests |
| GitHub and the case keeper disagree | An issue closed on GitHub is taken as finished work | The case keeper's state wins and the difference is shown in words | Close an issue on GitHub; the step stays unaccepted and both sides show "closed on GitHub, not accepted" |
| A project name shows while presenting | A private client or project name is exposed | Names are replaced everywhere names appear (screen and exports), not page by page | With Presenting on, a search of the screen text and the exported file finds no real project or repository name |
| Recording every AI request slows things down | Lag and heavy machine load | Measure first. Speed up only if needed. | The stage 5 measurement |

---

**In one sentence:** Horizon is the operator's desk for a system where every piece of work is expected, done, recorded, checked and decided in the open. It makes that loop plain enough that anyone can see the difference between what an agent reports and what really happened.
