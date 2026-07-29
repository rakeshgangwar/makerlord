export type InterfaceKind =
  | 'power' | 'i2c' | 'spi' | 'uart' | 'gpio' | 'analog' | 'pwm';

export interface BlockInterface {
  id: string;
  kind: InterfaceKind;
  direction: 'provides' | 'consumes';
  voltageV?: number;
  currentMa?: number;
}

export type Sourcing =
  | { type: 'buy'; partId: string }
  | { type: 'build'; partIds: string[] }
  | { type: 'undecided' };

export interface Block {
  id: string;
  name: string;
  sourcing: Sourcing;
  interfaces: BlockInterface[];
  power?: { activeMa: number; sleepMa?: number };
}

export interface BlockLink {
  from: { blockId: string; interfaceId: string };
  to: { blockId: string; interfaceId: string };
}
