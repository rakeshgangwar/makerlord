# Corpus Findings

Measured facts about the Fritzing parts corpus. These were expensive to obtain
and several are **load-bearing for the architecture** — the design would be
different if any were false.

Measured 2026-07-28 against `rakeshgangwar/fritzing-parts` at `master`.
Every finding below includes a command to reproduce it.

Set `CORPUS=/path/to/fritzing-parts` before running any of these.

---

## 1. Scale

| Metric | Value |
|---|---|
| Core parts (`.fzp`) | **1,794** |
| Contrib / obsolete / user | 375 / 396 / 1 |
| Total `.fzp` | 2,566 |
| Breadboard SVGs | 1,980 |
| Schematic SVGs | 2,163 |
| PCB SVGs | 3,679 |
| Icon SVGs | 1,306 |
| Repo size | **365 MB** (overwhelmingly SVG) |

```bash
find "$CORPUS/core" -name '*.fzp' | wc -l
find "$CORPUS/svg" -path '*/breadboard/*' -name '*.svg' | wc -l
du -sh "$CORPUS"
```

> **Consequence:** the runtime ships a *pruned bundle* of the curated set, never
> the whole fork.

---

## 2. The ETL is clean — 0 parse failures

All 1,794 core parts parse with a stdlib XML parser. No malformed files, no
encoding surprises.

```bash
python3 -c "
import xml.etree.ElementTree as ET, glob
ok=bad=0
for f in glob.glob('$CORPUS/core/*.fzp'):
    try: ET.parse(f); ok+=1
    except Exception: bad+=1
print('parsed', ok, 'failed', bad)"
```

> **Consequence:** this is the golden-file baseline in Task 5. A future upstream
> refresh that breaks it fails the suite loudly.

---

## 3. Electrical data is sparse — the central finding

Property key frequency across all 1,794 core parts:

```
family      1794   ← universal
package     1301
variant     1058
part number  330
voltage       75   ←  4%
current       41   ←  2%
power         38   ←  2%
max current   29   ←  2%
```

```bash
python3 -c "
import xml.etree.ElementTree as ET, glob, collections
c=collections.Counter()
for f in glob.glob('$CORPUS/core/*.fzp'):
    for p in ET.parse(f).getroot().iter('property'): c[p.get('name')]+=1
for k,v in c.most_common(12): print(f'{v:5d}  {k}')"
```

Values are **free text requiring unit parsing** — `0.030A`, `0.25W`, `4.7k`.

> **Consequence, and the reason the project has a moat:** the corpus gives
> geometry and connectivity but *not* the electrical limits the safety engine
> needs. The ETL harvests what exists as a seed; the rest is hand-authored.
> That hand-authored overlay is the difference between a drawing tool and a
> safety tool.

---

## 4. The breadboard models its own topology

`core/halfBreadboard.fzp` declares **420 connectors and 68 buses**. The
five-hole column groups and the power rails are already encoded.

```bash
python3 -c "
import xml.etree.ElementTree as ET
r=ET.parse('$CORPUS/core/halfBreadboard.fzp').getroot()
print('connectors:', len(r.find('connectors')))
print('buses:', len(r.find('buses')))
for b in list(r.find('buses'))[:2]:
    print(' ', b.get('id'), [n.get('connectorId') for n in b])"
```

```
connectors: 420
buses: 68
  bus0-4 ['A98', 'B98', 'C98', 'D98', 'E98']    ← column group
  bus1-4 ['A99', 'B99', 'C99', 'D99', 'E99']
```

Rail buses (`busX-2`, `busY-2`, `busZ-2`) carry 25 members each.

> **Consequence:** union-find runs over declared buses. **No breadboard geometry
> needs hand-modelling.** This was the riskiest piece of the core design and it
> turned out to be free.

---

## 5. ⚠️ Hole IDs are opaque — never infer topology from them

Two facts that will silently corrupt a netlist if ignored:

**Rails are not contiguous.** `busX-2` runs `X1, X2, X3, X4, X5, X7, X8, X9…` —
**`X6` is absent.**

**Names do not imply order.** `A98` and `A99` sit to the *left* of `A1`.

```bash
python3 -c "
import xml.etree.ElementTree as ET
r=ET.parse('$CORPUS/core/halfBreadboard.fzp').getroot()
b=[x for x in r.find('buses') if x.get('id')=='busX-2'][0]
m=[n.get('connectorId') for n in b]
print('busX-2:', m[:9], '... total', len(m))
print('X6 present?', 'X6' in m)"
```

> **Consequence:** a global constraint in the plan — *hole IDs are opaque
> strings*. Topology comes only from declared buses and extracted SVG geometry.

---

## 6. Internal ties come free too

`core/arduino_Uno_Rev3(fix).fzp` declares 8 buses including:

```
gnd   → connector44, connector50, connector57, connector88, connector89
+5v   → connector40, connector46, connector87
mosi  → connector42, connector54
miso  → connector39, connector55
```

440 of 1,794 core parts declare buses.

> **Consequence:** multi-pin ground and supply on microcontroller boards is
> modelled without any special-casing.

---

## 7. Polarity is semantic

`core/LED-generic-5mm.fzp` names its connectors `cathode` and `anode`.
Connector names are consistent enough across the corpus to auto-classify pin
roles:

```
gnd  1989      vcc  471      5v  295      vdd  207
```

```bash
python3 -c "
import xml.etree.ElementTree as ET, glob, collections
c=collections.Counter()
for f in glob.glob('$CORPUS/core/*.fzp'):
    for x in ET.parse(f).getroot().iter('connector'):
        c[(x.get('name') or '').lower()]+=1
for k,v in c.most_common(8): print(f'{v:5d}  {k}')"
```

> **Consequence:** polarity detection has a real hook rather than a heuristic,
> and supply/ground net classification — which the rail-short and
> voltage-domain rules both depend on — is largely automatable.

---

## 8. Hole positions are mechanically derivable

`svg/core/breadboard/halfBreadboard.svg` contains **420 `<g id="…pin">`
groups**. Each child path begins with an absolute moveto at the circle's left
edge; radius is 2.394, so the centre is `(Mx + 2.394, My)`.

| Hole | Path start | Centre |
|---|---|---|
| `A98pin` | `M8.527,36` | (10.921, 36.0) |
| `A1pin` | `M22.926,36` | (25.320, 36.0) |
| `E1pin` | `M22.926,64.8` | (25.320, 64.8) |
| `X1pin` | `M22.926,14.4` | (25.320, 14.4) |

Derived pitch:
- **Rows:** A1→E1 is 28.8 over 4 gaps = **7.2**
- **Columns:** A98→A1 is 14.4 over 2 gaps = **7.2**

**7.2 units = 0.1 inch at 72 dpi** — the standard breadboard pitch.

```bash
grep -c 'id="[A-Z]*[0-9]*pin"' "$CORPUS/svg/core/breadboard/halfBreadboard.svg"
```

> **Consequence:** the board grid is generated, not authored. The extractor
> asserts lattice regularity, so if the radius or pitch assumption ever breaks
> it fails loudly rather than producing a subtly wrong board.

---

## 9. Bonus: some parts carry SPICE models

`LED-generic-5mm.fzp` includes a `<spice>` block with a diode model and
`Vf=2.1V`. Not surveyed for coverage.

> **Possible future seed** for forward-voltage data in safety profiles. Not
> relied on — coverage is unknown and almost certainly low.

---

## Re-running everything

These are the facts the design rests on. If an upstream refresh changes any of
them, the affected design decision needs revisiting — not just the code.

| Finding | Breaks what, if false |
|---|---|
| 68 declared buses | The entire netlist derivation approach |
| 0 parse failures | The ETL's golden-file baseline |
| Non-contiguous rails | Any name-based topology inference |
| 7.2-unit lattice | Board grid generation |
| 2–4% electrical coverage | The scale of the hand-authoring effort |
