import { broker, hasPort, rawPort } from './flasher.js';
import type { FlashProgress } from './flasher.js';

/**
 * STK500v1 over WebSerial — the Uno's optiboot bootloader (D47: this
 * powers the board; the panel state machine gates it behind the power
 * gate long before this file runs). Protocol: pulse DTR to reset,
 * sync within optiboot's window, program 128-byte pages, leave.
 * The compiled artifact may be raw binary or Intel HEX — both handled.
 */

const INSYNC = 0x14;
const OK = 0x10;
const PAGE = 128;   // ATmega328P flash page

/** Intel HEX → contiguous bytes (gaps filled 0xFF). */
export function parseIntelHex(text: string): Uint8Array {
  let upper = 0;
  let max = 0;
  const chunks: { addr: number; data: number[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(':')) continue;
    const bytes: number[] = [];
    for (let i = 1; i < line.length - 1; i += 2) {
      bytes.push(parseInt(line.slice(i, i + 2), 16));
    }
    const [len, hi, lo, type] = bytes;
    if (len === undefined || type === undefined) continue;
    const data = bytes.slice(4, 4 + len);
    if (type === 0x00) {
      const addr = upper + ((hi! << 8) | lo!);
      chunks.push({ addr, data });
      max = Math.max(max, addr + data.length);
    } else if (type === 0x04 && data.length >= 2) {
      upper = ((data[0]! << 8) | data[1]!) << 16;
    } else if (type === 0x01) break;
  }
  const out = new Uint8Array(max).fill(0xff);
  for (const c of chunks) out.set(c.data, c.addr);
  return out;
}

function decodePayload(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  // Intel HEX is ASCII ':' records; a raw AVR image never starts with ':'.
  if (bytes[0] === 0x3a) {
    return parseIntelHex(new TextDecoder().decode(bytes));
  }
  return bytes;
}

export async function flashStk500(
  binBase64: string,
  onProgress: (p: FlashProgress) => void,
): Promise<void> {
  if (!hasPort()) throw new Error('no serial port — connect first');
  const lease = broker.acquire('flash');
  if (!lease) throw new Error('the serial port is busy (monitor open?) — close it first');
  const port = rawPort() as {
    open(o: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    setSignals(s: { dataTerminalReady: boolean; requestToSend: boolean }): Promise<void>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
  };
  const data = decodePayload(binBase64);
  onProgress({ percent: 0, phase: 'connecting' });

  await port.open({ baudRate: 115200 }).catch((e: Error) => {
    if (!/already open/i.test(e.message)) throw e;
  });
  const reader = port.readable!.getReader();
  const writer = port.writable!.getWriter();
  let pending: number[] = [];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function readBytes(n: number, timeoutMs = 1000): Promise<number[]> {
    const deadline = Date.now() + timeoutMs;
    while (pending.length < n) {
      const race = await Promise.race([
        reader.read(),
        sleep(Math.max(0, deadline - Date.now())).then(() => 'timeout' as const),
      ]);
      if (race === 'timeout') throw new Error('bootloader timeout');
      const { value, done } = race as { value?: Uint8Array; done: boolean };
      if (done) throw new Error('serial closed mid-flash');
      if (value) pending.push(...value);
    }
    return pending.splice(0, n);
  }

  async function cmd(bytes: number[], responseLen = 0): Promise<number[]> {
    await writer.write(new Uint8Array([...bytes, 0x20]));
    const head = await readBytes(1);
    if (head[0] !== INSYNC) throw new Error(`bootloader out of sync (0x${head[0]?.toString(16)})`);
    const body = responseLen > 0 ? await readBytes(responseLen) : [];
    const tail = await readBytes(1);
    if (tail[0] !== OK) throw new Error('bootloader refused the command');
    return body;
  }

  try {
    // Reset into optiboot: DTR pulse, then sync inside its window.
    await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await sleep(120);
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });
    await sleep(220);

    let synced = false;
    for (let i = 0; i < 8 && !synced; i += 1) {
      try {
        pending = [];
        await cmd([0x30]);   // STK_GET_SYNC
        synced = true;
      } catch { await sleep(120); }
    }
    if (!synced) {
      throw new Error('no bootloader answer — check the board is an Uno and nothing else holds the port');
    }

    // Signature check: ATmega328P is 1E 95 0F.
    const sig = await cmd([0x75], 3);   // STK_READ_SIGN
    const chip = sig.join(',') === '30,149,15' ? 'ATmega328P' : `sig ${sig.map((b) => b.toString(16)).join(' ')}`;
    onProgress({ percent: 0, phase: 'writing', chip });

    await cmd([0x50]);   // STK_ENTER_PROGMODE
    for (let addr = 0; addr < data.length; addr += PAGE) {
      const word = addr >> 1;
      await cmd([0x55, word & 0xff, (word >> 8) & 0xff]);   // STK_LOAD_ADDRESS
      const page = data.subarray(addr, Math.min(addr + PAGE, data.length));
      await writer.write(new Uint8Array([
        0x64, (page.length >> 8) & 0xff, page.length & 0xff, 0x46,   // STK_PROG_PAGE, 'F'
        ...page, 0x20,
      ]));
      const head = await readBytes(1, 2000);
      const tail = await readBytes(1, 2000);
      if (head[0] !== INSYNC || tail[0] !== OK) throw new Error(`page write failed at 0x${addr.toString(16)}`);
      onProgress({ percent: Math.round(((addr + page.length) / data.length) * 100), phase: 'writing', chip });
    }
    await cmd([0x51]);   // STK_LEAVE_PROGMODE — the sketch starts
    onProgress({ percent: 100, phase: 'done', chip });
  } finally {
    reader.releaseLock();
    writer.releaseLock();
    await port.close().catch(() => undefined);
    lease.release();
  }
}
