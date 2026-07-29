import { breadboardCurrentRule, resistorDissipationRule } from './dissipation.js';
import { envelopeRule } from './envelope.js';
import { ledCurrentLimitRule } from './led-current-limit.js';
import { pinCurrentRule } from './pin-current.js';
import { polarityRule } from './polarity.js';
import { railShortRule } from './rail-short.js';
import type { Rule } from './engine.js';
import { voltageDomainRule } from './voltage.js';

export const ALL_RULES: readonly Rule[] = [
  envelopeRule,
  railShortRule,
  ledCurrentLimitRule,
  polarityRule,
  pinCurrentRule,
  voltageDomainRule,
  resistorDissipationRule,
  breadboardCurrentRule,
];

export {
  BREADBOARD_MAX_A,
  breadboardCurrentRule,
  resistorDissipationRule,
} from './dissipation.js';
export { envelopeRule, MAX_SAFE_VOLTAGE } from './envelope.js';
export { ledCurrentLimitRule } from './led-current-limit.js';
export { loadOnNet, pinCurrentRule } from './pin-current.js';
export { polarityRule } from './polarity.js';
export { railShortRule } from './rail-short.js';
export { netVoltage, pinNameToVolts, voltageDomainRule } from './voltage.js';
export * from './engine.js';
export * from './context.js';
