/**
 * The bridge as the maker experiences it (UI spec §11): nobody meets it
 * before they need it, and degradation is explicit, never silent.
 *
 * Browser fact resolved 2026-07-29: Firefox 151 ships Web Serial, so the
 * serial fallback triggers on SAFARI only — the bridge is a minority path.
 */
export type Browser = 'chromium' | 'firefox' | 'safari';

export function webSerialSupported(browser: Browser): boolean {
  return browser !== 'safari';
}

export type BridgeTrigger = 'flash-serial' | 'byo-agent' | 'local-clone';

export interface BridgePrompt {
  trigger: BridgeTrigger;
  message: string;
}

export function bridgePrompt(
  trigger: BridgeTrigger,
  browser: Browser,
): BridgePrompt | null {
  switch (trigger) {
    case 'flash-serial':
      if (webSerialSupported(browser)) return null;   // no prompt needed
      return {
        trigger,
        message:
          "Your browser can't talk to serial ports. Install the bridge, or " +
          'use Chrome or Firefox.',
      };
    case 'byo-agent':
      return {
        trigger,
        message: 'Your own agent runs on your machine. Install the bridge.',
      };
    case 'local-clone':
      return {
        trigger,
        message:
          'Cloning locally pairs with the PCB handoff — install the bridge ' +
          'as part of the same transition.',
      };
  }
}

export interface DisabledControl {
  control: string;
  disabled: true;
  reason: string;
}

/** A flash button that does nothing is worse than one that says why. */
export function bridgeAbsentControl(control: string): DisabledControl {
  return {
    control,
    disabled: true,
    reason:
      'This needs the local bridge, which is not running. Start it, or ' +
      'install it from Settings → Bridge.',
  };
}
