import type { SessionEvent } from '@makerlord/protocol';
import { FindingSurface } from './findings.js';

/**
 * The ONE SessionEvent consumer (UI spec §10). SSE from the hosted agent and
 * the bridge's localhost WebSocket both deliver SessionEvent; the UI has one
 * consumer and zero branches on which brain produced an event.
 */
export interface ConversationState {
  messages: { role: 'assistant' | 'maker'; text: string }[];
  thinking: string;
  toolActivity: { callId: string; name: string; done: boolean }[];
  turnActive: boolean;
  lastError?: string;
}

export class SessionConsumer {
  readonly findings = new FindingSurface();
  readonly state: ConversationState = {
    messages: [],
    thinking: '',
    toolActivity: [],
    turnActive: false,
  };

  private currentAssistantText = '';

  consume(event: SessionEvent): void {
    switch (event.t) {
      case 'message.delta':
        this.currentAssistantText += event.text;
        break;
      case 'thought.delta':
        this.state.thinking += event.text;
        break;
      case 'tool.start':
        this.state.toolActivity.push({
          callId: event.callId, name: event.name, done: false,
        });
        break;
      case 'tool.end': {
        const activity = this.state.toolActivity.find((a) => a.callId === event.callId);
        if (activity) activity.done = true;
        // A refusal stays a refusal all the way to the renderer: the card
        // comes from the ToolResult payload, verbatim — never from prose.
        if (!event.result.ok) {
          this.findings.reconcile(event.result.findings, 'tool-result');
        }
        break;
      }
      case 'turn.end':
        this.flushAssistantText();
        this.state.turnActive = false;
        break;
      case 'session.error':
        this.flushAssistantText();
        this.state.lastError = event.message;
        this.state.turnActive = false;
        break;
      case 'permission.ask':
      case 'plan':
        break; // rendered elsewhere; no finding-surface interaction
    }
  }

  private flushAssistantText(): void {
    if (this.currentAssistantText.length > 0) {
      this.state.messages.push({ role: 'assistant', text: this.currentAssistantText });
      this.currentAssistantText = '';
    }
  }
}
