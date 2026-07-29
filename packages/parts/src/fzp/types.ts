export interface RawPin {
  layer: string;
  svgId: string;
  terminalId?: string;
  legId?: string;
}

export interface RawConnector {
  id: string;
  name: string;
  type: string;
  breadboard?: RawPin;
  schematic?: RawPin;
}

export interface RawBus {
  id: string;
  members: string[];
}

export interface RawViews {
  breadboard?: string;
  schematic?: string;
  icon?: string;
}

export interface RawFzp {
  moduleId: string;
  title: string;
  properties: Record<string, string>;
  connectors: RawConnector[];
  buses: RawBus[];
  views: RawViews;
}
