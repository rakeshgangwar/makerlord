import { describe, expect, it } from 'vitest';
import { parseFzp } from '../src/fzp/parse.js';

const LED_FZP = `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="0.1" moduleId="5mmColorLEDModuleID">
 <title>Red LED - 5mm</title>
 <properties>
  <property name="family">LED</property>
  <property name="color" showInLabel="yes">Red (633nm)</property>
  <property name="current">0.030A</property>
 </properties>
 <views>
  <breadboardView><layers image="breadboard/LED-5mm-red-leg.svg">
   <layer layerId="breadboard"/></layers></breadboardView>
  <schematicView><layers image="schematic/led.svg">
   <layer layerId="schematic"/></layers></schematicView>
 </views>
 <connectors>
  <connector id="connector0" name="cathode" type="male">
   <views>
    <breadboardView><p layer="breadboard" svgId="connector0pin" legId="connector0leg"/></breadboardView>
    <schematicView><p layer="schematic" svgId="connector0pin" terminalId="connector0terminal"/></schematicView>
   </views>
  </connector>
  <connector id="connector1" name="anode" type="male">
   <views>
    <breadboardView><p layer="breadboard" svgId="connector1pin"/></breadboardView>
   </views>
  </connector>
 </connectors>
</module>`;

const WITH_BUS = `<module moduleId="bb">
 <title>Board</title>
 <connectors>
  <connector id="A1" name="A1" type="female"/>
  <connector id="B1" name="B1" type="female"/>
 </connectors>
 <buses><bus id="bus0-4">
  <nodeMember connectorId="A1"/><nodeMember connectorId="B1"/>
 </bus></buses>
</module>`;

describe('parseFzp', () => {
  it('reads module identity and title', () => {
    const p = parseFzp(LED_FZP);
    expect(p.moduleId).toBe('5mmColorLEDModuleID');
    expect(p.title).toBe('Red LED - 5mm');
  });

  it('reads properties as a flat map, ignoring attributes', () => {
    const p = parseFzp(LED_FZP);
    expect(p.properties.family).toBe('LED');
    expect(p.properties.current).toBe('0.030A');
    expect(p.properties.color).toBe('Red (633nm)');
  });

  it('reads connectors with per-view pins', () => {
    const p = parseFzp(LED_FZP);
    expect(p.connectors).toHaveLength(2);
    const cathode = p.connectors[0]!;
    expect(cathode.id).toBe('connector0');
    expect(cathode.name).toBe('cathode');
    expect(cathode.type).toBe('male');
    expect(cathode.breadboard?.svgId).toBe('connector0pin');
    expect(cathode.breadboard?.legId).toBe('connector0leg');
    expect(cathode.schematic?.terminalId).toBe('connector0terminal');
  });

  it('tolerates a connector missing a view', () => {
    const p = parseFzp(LED_FZP);
    expect(p.connectors[1]!.schematic).toBeUndefined();
  });

  it('reads view image paths', () => {
    const p = parseFzp(LED_FZP);
    expect(p.views.breadboard).toBe('breadboard/LED-5mm-red-leg.svg');
    expect(p.views.schematic).toBe('schematic/led.svg');
  });

  it('reads buses with their members', () => {
    const p = parseFzp(WITH_BUS);
    expect(p.buses).toEqual([{ id: 'bus0-4', members: ['A1', 'B1'] }]);
  });

  it('returns an empty bus list when there are none', () => {
    expect(parseFzp(LED_FZP).buses).toEqual([]);
  });

  it('handles a single connector not wrapped in an array', () => {
    const one = `<module moduleId="m"><title>t</title><connectors>
      <connector id="c0" name="pin" type="male"/></connectors></module>`;
    expect(parseFzp(one).connectors).toHaveLength(1);
  });
});

describe('XML entities in titles (2026-07-30 audit)', () => {
  it('decodes numeric and named entities — "220 &#8486; Resistor" is 220 Ω', () => {
    const fzp = `<module moduleId="ResistorModuleID">
      <title>220 &#8486; Resistor &amp; friends &#x2126;</title>
      <connectors><connector id="c0" name="Pin 0" type="male"/></connectors>
    </module>`;
    const parsed = parseFzp(fzp);
    expect(parsed.title).toBe('220 Ω Resistor & friends Ω');
    expect(parsed.title).not.toMatch(/&#|&amp/);
  });
});
