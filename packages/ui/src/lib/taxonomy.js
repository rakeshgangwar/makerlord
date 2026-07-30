/**
 * Display names for corpus family strings (2026-07-30 audit). The
 * corpus is raw Fritzing vocabulary — inconsistent case, vendor noise
 * ("MaxDetect Technology"), one-part families. The mapping is curated
 * for the curated library; everything else gets title-case, which is
 * honest without inventing taxonomy.
 */
const FAMILIES = {
  'cpu board (raspberry pi)': 'Raspberry Pi',
  'maxdetect technology': 'Temperature & humidity',
  'dagu dgservo 9g': 'Servo',
  'bipolar transistor': 'Transistor',
  'capacitor [bidirectional]': 'Capacitor — ceramic',
  'capacitor [unidirectional]': 'Capacitor — electrolytic',
  'mystery part': 'Other',
};

export function displayFamily(family) {
  const raw = (family || 'other').trim();
  const mapped = FAMILIES[raw.toLowerCase()];
  if (mapped) return mapped;
  // Title-case, preserving things that look deliberate (LED, DC, 9V…).
  return raw
    .split(/\s+/)
    .map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
