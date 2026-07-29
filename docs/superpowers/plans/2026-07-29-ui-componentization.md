# UI componentization — from one 1,100-line page to a component shell

**Why now:** function-first is done (all seven specs live, ①→⑥ verified,
bridge shipped). `+page.svelte` absorbed every feature of that sprint. The
design pass, Playwright, and the Claude Design component bridge all get
cheaper once the shell is real components. Svelte 5 idiom: a runes store
module (`app.svelte.js`) holding state + actions; components import it
directly — no prop drilling.

**Invariants that must survive unchanged:** one SessionEvent consumer;
findings only from engine data, no dismiss control anywhere; the strip at
every breakpoint; current build step fixed during streaming; D15 gate
(number before prediction); stage-follow unless pinned.

## Tasks

- [x] `lib/md.js` — shared sanitised-markdown helper
- [x] `lib/app.svelte.js` — the store: session/conversation/bridge/panel/sim
      state + every action (api, consume, sendPrompt, bridge, files, gate)
- [x] `lib/components/StageRail.svelte` — rail + phase bands + bridge control
- [x] `lib/components/MessageList.svelte` + `ToolTrail.svelte` — shared chat bits
- [x] `lib/components/ConverseStart.svelte` — intent + project picker
- [x] `lib/components/Conversation.svelte` — full-page chat + composer
- [x] `lib/components/InspectView.svelte` — projections + checks + sim results
- [x] `lib/components/BenchView.svelte` — steps + the D15 gate
- [x] `lib/components/ChatDock.svelte` — docked chat (latch + autoscroll effects)
- [x] `lib/components/ArtifactsPanel.svelte` — bench facts / library / files tabs
- [x] `lib/components/FileOverlay.svelte` — workspace-wide file viewer
- [x] `lib/components/FindingStrip.svelte` — the meter footer
- [x] `+page.svelte` → thin composition (~90 lines); shared utility CSS
      (buttons, .msg, .md, .mono, responsive rules) moves to `+layout.svelte`
      as `:global`
- [x] Suite green + UI builds + live browser verification (picker, rail,
      tabs, dock, overlay, strip) + deploy
