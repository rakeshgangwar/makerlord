import { XMLParser } from 'fast-xml-parser';
import type { RawBus, RawConnector, RawFzp, RawPin, RawViews } from './types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  trimValues: true,
});

/** fast-xml-parser collapses single children; always work with a list. */
function list<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** A node is either a bare scalar or an object carrying attributes plus #text. */
/** The corpus writes Ω as &#8486; — the parser decodes named entities
 *  but leaves numeric ones, and a literal "&#8486;" then leaks into
 *  every title consumer (UI, CLI, agent prose). Decode them here. */
function decodeNumericEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .normalize('NFC');   // U+2126 OHM SIGN → the canonical Ω
}

function text(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'object') {
    const t = (node as Record<string, unknown>)['#text'];
    return t === undefined ? '' : decodeNumericEntities(String(t));
  }
  return decodeNumericEntities(String(node));
}

function pin(viewNode: unknown): RawPin | undefined {
  if (!viewNode || typeof viewNode !== 'object') return undefined;
  const p = list((viewNode as Record<string, unknown>).p)[0] as
    | Record<string, unknown>
    | undefined;
  if (!p) return undefined;
  const svgId = p['@svgId'];
  if (svgId === undefined) return undefined;
  const out: RawPin = { layer: String(p['@layer'] ?? ''), svgId: String(svgId) };
  if (p['@terminalId'] !== undefined) out.terminalId = String(p['@terminalId']);
  if (p['@legId'] !== undefined) out.legId = String(p['@legId']);
  return out;
}

function image(viewNode: unknown): string | undefined {
  if (!viewNode || typeof viewNode !== 'object') return undefined;
  const layers = (viewNode as Record<string, unknown>).layers as
    | Record<string, unknown>
    | undefined;
  const img = layers?.['@image'];
  return img === undefined ? undefined : String(img);
}

export function parseFzp(xml: string): RawFzp {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const mod = doc.module as Record<string, unknown> | undefined;
  if (!mod) throw new Error('fzp: missing <module> root');

  const properties: Record<string, string> = {};
  const propsNode = mod.properties as Record<string, unknown> | undefined;
  for (const p of list(propsNode?.property) as Record<string, unknown>[]) {
    const name = p['@name'];
    if (name !== undefined) properties[String(name)] = text(p);
  }

  const viewsNode = mod.views as Record<string, unknown> | undefined;
  const views: RawViews = {};
  const bb = image(viewsNode?.breadboardView);
  const sc = image(viewsNode?.schematicView);
  const ic = image(viewsNode?.iconView);
  if (bb) views.breadboard = bb;
  if (sc) views.schematic = sc;
  if (ic) views.icon = ic;

  const connectorsNode = mod.connectors as Record<string, unknown> | undefined;
  const connectors: RawConnector[] = [];
  for (const c of list(connectorsNode?.connector) as Record<string, unknown>[]) {
    const cv = c.views as Record<string, unknown> | undefined;
    const conn: RawConnector = {
      id: String(c['@id'] ?? ''),
      name: String(c['@name'] ?? ''),
      type: String(c['@type'] ?? ''),
    };
    const b = pin(cv?.breadboardView);
    const s = pin(cv?.schematicView);
    if (b) conn.breadboard = b;
    if (s) conn.schematic = s;
    connectors.push(conn);
  }

  const busesNode = mod.buses as Record<string, unknown> | undefined;
  const buses: RawBus[] = [];
  for (const b of list(busesNode?.bus) as Record<string, unknown>[]) {
    const members = (list(b.nodeMember) as Record<string, unknown>[])
      .map((n) => String(n['@connectorId'] ?? ''))
      .filter((m) => m.length > 0);
    buses.push({ id: String(b['@id'] ?? ''), members });
  }

  return {
    moduleId: String(mod['@moduleId'] ?? ''),
    title: text(mod.title),
    properties,
    connectors,
    buses,
    views,
  };
}
