# Vision

## The problem

Someone learning electronics destroys components, damages boards, and
occasionally hurts themselves. Not because the information isn't available —
there are a million tutorials — but because **nothing checks their actual
circuit before power is applied.**

The existing tools split badly along a line that leaves the learner in the gap:

| Tool class | Examples | What it gives | What it can't do |
|---|---|---|---|
| Simulators | Tinkercad, Falstad, Wokwi | Safe experimentation | Nothing about the board on your desk |
| eCAD | Flux, KiCad, EasyEDA, Altium | Professional design | Assumes you already know what you're doing |
| LLM chat | ChatGPT, Claude | Answers any question | Confident wiring advice with no way to verify it |

A student following a YouTube tutorial has none of them checking the thing that
actually matters: *is the circuit in front of me safe to switch on?*

## What CircuitKing is

An AI coach for **real hardware**. Not a simulator, not an eCAD replacement.

The student holds a physical breadboard, real components, a microcontroller.
The agent:

1. Turns "I want a temperature sensor for Home Assistant" into a real circuit
2. Draws it as a schematic **and** a breadboard picture, cross-linked
3. Sequences the build hole by hole, power wires last
4. **Refuses to let them apply power until the circuit passes deterministic
   safety checks**
5. Generates firmware whose pin map is derived from the circuit, so code and
   hardware cannot drift
6. Walks them through bring-up when it doesn't work

## Why this can work now

Three things are true at once, and weren't a few years ago:

- **The part geometry is free.** The Fritzing corpus has 1,794 curated parts
  with breadboard artwork, connector positions, and — critically — declared
  electrical buses. The breadboard models its own topology. See
  [corpus-findings.md](corpus-findings.md).
- **Language models are good enough to translate intent into structure**, but
  not trustworthy enough to adjudicate safety. That asymmetry is exactly what
  the architecture exploits.
- **Browsers can talk to hardware.** Web Serial flashes an ESP32 from a tab with
  no toolchain install — a genuine barrier removed for beginners.

## The core bet

> **Safety must be a computable property, not a generated opinion.**

If the AI generates a *picture* of a circuit, the safety promise is theatre —
you cannot run a design-rule check on an image. If it generates a *netlist*,
safety becomes a property you can test, review, version, and cite by rule ID.

Everything else in the architecture follows from that. One structured model;
every artefact a projection of it; deterministic rules adjudicating; the
language model explaining but never overriding.

## Who it's for

Hobbyists and makers, all levels — from a teenager with an Arduino starter kit
to an experienced maker building a robot. Deliberately **not** vocational
electricians: mains AC is out of scope by design, encoded as a refusal rule.

The tool degrades honestly rather than refusing outright. A drone is not a
breadboard project, so it won't draw one — but it will size the battery, budget
the power, and pick the connectors. **Explicit statements of depth beat both
bluffing and closed doors.**

## What makes it different

Anyone can build a chat interface over a schematic renderer. Four things are
hard to copy:

1. **The safety overlay.** Fritzing gives geometry; only 2–4% of the corpus
   carries electrical limits. The hand-authored hazard metadata is the moat —
   it's the difference between a drawing tool and a safety tool.
2. **The measurement gate.** Never ask "did you check?" — always ask "what did
   it read?" A yes/no question is compliance theatre; a number is a real check
   *and* a lesson in using a multimeter.
3. **Hardware/firmware cross-checks.** Holding both models catches faults
   neither half can see alone — a pin set `OUTPUT HIGH` while wired to ground
   destroys the MCU, and is invisible to any hardware-only or code-only tool.
4. **The diagnostic.** "It doesn't work" opens a targeted binary search, because
   the system knows the intended netlist, the predicted voltage at every node,
   and which steps were confirmed. Two or three measurements localise most
   faults.

## What success looks like

**Near term.** A student describes what they want, gets a checked circuit and a
build sequence, and the gate catches a mistake that would have cost them a
component. That single moment is the product.

**Longer term.** The advisory→rule promotion loop means the rule set grows from
real student mistakes rather than a guessed hazard list. The safety corpus
becomes more valuable than the code around it.

**The failure mode to avoid.** An agent so capable that students can *assemble*
but not *design* — helpless the moment they're away from the tool. The pedagogy
mode toggle and the always-explained blockers exist to guard against exactly
this. The rule engine is, almost accidentally, a curriculum.

## Non-goals

- **Not an eCAD replacement.** No PCB layout, no manufacturing outputs.
- **Not a simulator.** The DC solver predicts what a multimeter will read; it is
  not SPICE and never will be.
- **Not mains.** Above 48 V the tool declines and explains. Being 95% right
  about mains is worse than being no help at all.
- **Not a parts marketplace.** Sourcing serves the build; it isn't the business.
