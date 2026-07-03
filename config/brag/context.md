# Brag Context

This file is read by the brag-documenter agent every time it runs.
Edit it directly in the repo — changes take effect on the next `/brag` run.

# Company Values

**We dream big.** Goal is to build an AI Doctor and win the first LatAm Nobel Prize in Medicine since 1984. We want to radically improve healthcare — from scarcity to abundance.

**We play to win, by a landslide.**
- Winning is the only thing.
- We act as owners (everybody has stock options). Bias to action.
- We work hard, smart, and long — all three.
- Sense of urgency. Prioritize ruthlessly. Never at rest.

**We are customer obsessed.** Client says jump, we say how high.

**We have a Science DNA. We solve for learning.**
- Feedback from reality, not from our heads.
- Fall in love with problems, not solutions.
- Devil's in the details. Radical transparency.

**No ego.**
- We all share the same mission: building an AI Doctor.
- The enemy is outside the building.
- Intelligence, energy, integrity, no ego.

# Software Engineer Role Expectations

- Map, don't pack — Look at complex, undocumented systems and build a clear mental model from first principles, not just from specs handed to you
- Move with high agency — Don't wait to be unblocked. Hit a wall? Find a way around it, document the decision, and keep the team informed
- Own production — Write runbooks, follow up on incidents, ship and stand behind your work
- Mentor actively — Raise the floor of the team through meaningful code reviews and explaining the why, not just the what
- Engage with open source — Read source code to debug issues, contribute patches, and build thoughtfully on top of OSS


# What a DRI is at Telepatia

A **DRI (Directly Responsible Individual)** is the single person who **owns an initiative end-to-end and makes the decisions for it**. Not a committee. Not "the people who care about this." One name.

If you can't answer "who is the DRI?" with exactly one person, the initiative doesn't have a DRI yet - it has owners and involved individuals.

## A DRI is not always an engineer - but it's always the person doing most of the work *directly*

The DRI is whoever is best placed to drive a given initiative - and that depends on what the initiative *is*, not on someone's title.

- **A client installation that needs no active coding** can have an **onboarding specialist** as DRI. Their job isn't to write code - it's to set up the deployment and rally and coordinate the team that supports it.
- **A large cross-cutting initiative** like B2C can have a **PM** as DRI, pushing it forward. And a DRI of a big initiative can in turn **delegate sub-initiatives** to their own DRIs - delegation of ownership downward is fine and expected at scale.
- **A manager can be a DRI** too. It's allowed - but usually not preferred, because a manager's time is better spent making *their team* succeed than carrying a project themselves. If a manager takes a DRI hat, it should be a deliberate choice, not the default.

**The unit of ownership is the initiative, and the right DRI is whoever can actually implement it.**

## Ownership vs. Accountability - they are not the same

These two words get used interchangeably, and that confusion is the root of most of our coordination failures. A DRI holds **both**, but they mean different things.

### Ownership = the authority to decide

Ownership is forward-looking. It's the right to make the calls and the obligation to actually make them:

- Architecture and technical approach (or, for non-eng initiatives, the equivalent plan of attack)
- Roadmap, scope, and what's in/out
- Dates and timeline
- How and when we communicate with the client
- Status updates (the DRI writes the WBR entry for their area)

Ownership is **non-transferable as a role, but delegable as work.** The DRI can ask someone else to design the database layer, draft the client email, run a sub-initiative, or build a piece - but the decision and the responsibility for it stay with the DRI. **"I delegated it" is never an excuse for a bad outcome.**

The failure mode we're killing: a project where Miguel decides the date, Assis decides the architecture, Vic talks to the client, and the named DRI hears about the project 1 week before the deadline. That's four owners and zero DRIs.

### Accountability = owning the outcome, good or bad

Accountability is backward-looking. When the initiative ships, the DRI is the person who answers for the result - including the parts they delegated.

- If the feature is broken, that's the DRI's problem to fix (or coordinate the fix), not a reason to point at whoever wrote that piece or seek blame.
- **"I don't know backend" is not a way out.** If you're the DRI, *figure it out* - pull in help, ask another engineer, learn it. The backend is part of the feature; the feature is yours.
- Accountability can't be split. **The moment two people are "accountable," no one is** - each assumes the other is paying attention, and the thing falls through the gap.

**The clean way to hold the two ideas together:** Ownership is "I get to decide." Accountability is "I have to answer for it." A DRI signs up for both at once. You don't get the authority without the exposure, and you don't carry the exposure without the authority. **When someone is handed accountability but denied the authority to act on it, that's not a DRI** - that's a scapegoat, and it's unfair. We don't do that.

### The manager is accountable too - and their job is to make the DRI succeed

Naming a DRI **does not transfer the outcome off the manager's shoulders**. The Manager is ultimately **also accountable** for the team's results. If the team ships something broken, that is the manager's fault - full stop. "My team didn't deliver" is never an acceptable answer from a manager; their job is to find a way.

Critically, the manager's accountability points in one direction: **make the DRI succeed, not punish them for failing.** When a DRI struggles, the manager's response is support - unblock them, bring in help, coach, remove the organizational noise - **not blame**. The manager is the coach on the sideline, the artillery behind the line: there to make the player score, not to bench them when they miss. A DRI failing is a signal the manager has work to do, not a person to point at.

So accountability stacks rather than transfers: **the DRI answers for the project, and the manager answers for the DRI having everything they needed to win.**

### Losing is never grounds for punishment

This deserves its own line, because everything above depends on it: **making a mistake or losing must never be the reason to punish a DRI.** Punishing ownership teaches people to stop owning. It breeds fear, defensiveness, and decisions pushed up the chain "to be safe." If we punish DRIs for missing, we shouldn't have DRIs at all - we should just make every call top-down and hire a room full of drones to execute them. We don't want that. We want people who take real bets, and that means making it safe to sometimes lose one.

It's important to note that **we want to learn from mistakes**. So it's important that the DRIs find ways to communicate **“what did we learn?”**. No prescribed format here - anything from retrospectives to individual write-ups goes.

## DRI is not a golden bullet - and definitely not a badge

DRI is a tool, not a religion. **Not everyone needs to be a DRI, and not all the time.** Trying to force everyone into a DRI role as a requirement actively *destroys* collaboration - it turns teammates into a set of walled-off fiefdoms, each defending their box, when half the good work happens in the overlap. 

Effective team setups have *fewer initiatives than they have people* - forcing teams into extreme levels of parallelism is one of the most well known methods to destroy productivity.

Treat DRI as a **temporary assignment tied to an initiative**, not a title, a rank, or a badge someone earns and keeps. When the initiative ends, the DRI hat comes off. Someone can be a DRI this month and a supporting player the next, and that's exactly how it should work. The goal is clear ownership *where ownership is needed* - not a company where every person is clutching their own little crown. Long-running DRIs are a bad pattern because they turn initiatives with fiefdoms and lead to silos where change cannot happen.

## Being a good DRI is a social exercise

Owning the decision is not a license to be a lone wolf or a contrarian. A good DRI sits between two failure modes and avoids both:

- **Not a tyrant.** Deciding doesn't mean overruling everyone or disagreeing for the sake of it. Arbitrary, "because I said so" calls are not ownership - they just demonstrate lack of maturity.
- **Not a lone wolf.** Going rogue, building in a corner, blindsiding the team with decisions nobody saw coming - even if paired with the best intentions - invariably create chaos and lasting damage.
- **But also not blocked.** A DRI does not sit and wait for approval before acting. The moment you need a sign-off to move, the real decision is being made by whoever you're waiting on - and you're not the DRI anymore. You should escalate to your manager for support and find ways to unblock yourself.
- **Not at rest.** The best DRIs are the ones who get visibly uncomfortable when the initiative isn't moving. Not defensive, not anxious, not depressed. Uncomfortable.

The way through the middle is communication. A good DRI **listens to the people who know things, communicates diligently, and keeps the important parties aligned and informed** - and *then* makes the call and moves. Ownership is exercised in the open, with the team, not against it.

## What a DRI actually does

- **Decides.** Architecture, scope, dates, client approach. Makes the call when there's ambiguity instead of waiting for one - after listening, not before.
- **Owns the communication.** Writes the status update (eg WBR entry) for their area. Is the single point of contact for the initiative's direction. **Someone else *can* interface with the broader business *on the DRI's behalf* - but the DRI owns what's being communicated.**
- **Pulls in help.** Delegating work, asking another engineer for the backend, handing a sub-initiative to its own DRI, bringing in a designer - all encouraged. Owning the initiative means orchestrating it, not personally doing every part.
- **Keeps people aligned.** Listens to those with context, keeps stakeholders informed, and brings the team along instead of surprising them.
- **Absorbs the noise it makes sense to absorb, and pushes the rest to the PM/EM.** The DRI shouldn't spend the day answering the same "is it moving?" question in seven channels. That's what the PM is for. But the DRI does own the answer.
- **Owns the outcomes.** If you ship a feature, you own watching it for two weeks. If you don't get usage, you figure out why. You see the data, you talk to customers, you see what broke.

## What a DRI is not

- **Not a committee.** "Shared ownership" is the disease, not the cure.
- **Not a permanent badge.** It's a temporary assignment for an initiative, not a rank you carry around.
- **Not mandatory for everyone, always.** Forcing universal DRI-hood kills collaboration.
- **Not a tyrant or a lone wolf.** No arbitrary calls, no going rogue, no disagreeing for sport.
- **Not someone who waits to be told.** If you're waiting on Miguel for the date and Assis for the architecture, you're not the DRI of anything.
- **Not a person who can opt out of half the work.** No "I'll do the frontend but someone else has to own the database." The whole initiative is the unit of ownership.
- **Not a title assigned to someone against their will or knowledge.** A DRI who doesn't want the job (or wasn't empowered to do it) isn't set up to succeed. **Ownership has to be accepted, not imposed or implied.**

## How to check whether an initiative has a real DRI

Ask these out loud:

1. Can you name the DRI - *one* person?
2. Does that person make the key calls (plan, dates, client communication) - after listening, without waiting for sign-off?
3. If it ships broken, is it unambiguous whose problem that is to fix - and is it clear we'll fix it, not punish it?
4. Did that person *accept* the role, with the authority to do it?
5. Does this person have the skills and context to actually succeed, or are we setting them up to fail?

If any answer is fuzzy, the initiative needs to be restructured before it moves forward.

## The most important principle behind all of this

**Decisions should be made by the person doing the work, at the level closest to the work** - not escalated upward to a manager or sideways to a committee. 

Leadership's job is to make sure the initiatives that *need* a clear DRI have one, and then get out of their way - not to make the DRI's decisions for them, and not to turn everyone into a DRI for its own sake. 

**If your boss (or three other people) are making your initiative's calls, you're not the DRI** - and we should fix that, because the work moves fastest when the person accountable for it is also the one empowered to decide, supported by their team and safe to occasionally lose.