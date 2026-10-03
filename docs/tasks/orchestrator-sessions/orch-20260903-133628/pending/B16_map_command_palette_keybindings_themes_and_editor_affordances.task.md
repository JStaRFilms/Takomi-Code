# B16 — Map command palette, keybindings, themes, and editor affordances

**Role:** Coder
**Stage:** Build
**Depends on:** B00, D01, D02, D03, B04, B09, B11

## Objective
Represent Pi's discoverable user actions throughout T3's normal entry points while honestly separating terminal-only behavior.

## Implement
Add provider-aware actions to web command palette and mobile hardware-keyboard registry for session picker, Run Details, model/thinking, compact, retry abort, queue clear, and supported Takomi controls. Dynamic extension shortcuts are imported only when Pi exposes stable action metadata; otherwise they remain terminal-only.

Provide optional Pi keybinding import/mapping for equivalent T3 actions without replacing T3's keybinding authority. Treat Pi terminal themes as a preview/token-mapping aid, not a promise of pixel parity. Map file references, image paste, multiline, external editor, and shell aliases through existing client/host features where applicable; document host-only behavior.

## Tests
Capability changes, shortcut conflict, stale dynamic command, mobile hardware key, keyboard-only navigation, theme parse failure, unknown token, reduced motion, and no action for unsupported providers.

## Definition of done
Every expected entry point has a deliberate decision and the UI never suggests that a web shortcut controls an unrelated CLI process.
