import { SerialBroker, parseSerialLine, type SerialLine } from './flash.js';

/**
 * The browser flasher + serial monitor (firmware spec §6, D37). One
 * WebSerial port, brokered: flash and monitor take turns, never fight.
 * esptool-js drives the whole ESP family; the wrapper stays thin so the
 * hardware checklist (plan task 17) is the only untested surface.
 *
 * NOTE flash addresses: ESP8266 Arduino builds are ONE combined image at
 * 0x0. ESP32 splits bootloader/partitions/app — its curated flash entry
 * will carry addresses when that board lands. Verified on hardware: ⏳.
 */

export const broker = new SerialBroker();

type SerialPortLike = {
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
};

let port: SerialPortLike | null = null;

/** One user-gesture port pick, reused for both flash and monitor. */
export async function requestPort(): Promise<boolean> {
  const serial = (navigator as { serial?: { requestPort(): Promise<SerialPortLike> } }).serial;
  if (!serial) return false;
  port = await serial.requestPort();
  return true;
}

export function hasPort(): boolean {
  return port !== null;
}

export interface FlashProgress {
  percent: number;
  phase: 'connecting' | 'writing' | 'resetting' | 'done';
  chip?: string;
}

export async function flashEsp(
  binBase64: string,
  baud: number,
  onProgress: (p: FlashProgress) => void,
): Promise<void> {
  if (!port) throw new Error('no serial port — connect first');
  const lease = broker.acquire('flash');
  if (!lease) throw new Error('the serial port is busy (monitor open?) — close it first');
  try {
    const { ESPLoader, Transport } = await import('esptool-js');
    onProgress({ percent: 0, phase: 'connecting' });
    const transport = new Transport(port as never, true);
    const loader = new ESPLoader({
      transport,
      baudrate: baud,
      terminal: {
        clean: () => undefined,
        writeLine: () => undefined,
        write: () => undefined,
      },
    } as never);
    const chip = (await loader.main()) as string;
    onProgress({ percent: 0, phase: 'writing', chip });

    const raw = atob(binBase64);
    const data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) data[i] = raw.charCodeAt(i);

    await loader.writeFlash({
      fileArray: [{ data, address: 0x0 }],
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (_i: number, written: number, total: number) => {
        onProgress({ percent: Math.round((written / total) * 100), phase: 'writing', chip });
      },
    } as never);

    onProgress({ percent: 100, phase: 'resetting', chip });
    await loader.after('hard_reset');
    await transport.disconnect();
    onProgress({ percent: 100, phase: 'done', chip });
  } finally {
    lease.release();
  }
}

/** Stream serial lines until stop() — the ⑧ symptom feed. Text is
 *  untrusted; parseSerialLine grants structure only to SELFTEST/LOG. */
export function openMonitor(
  baud: number,
  onLine: (line: SerialLine) => void,
): { stop: () => Promise<void> } | null {
  if (!port) return null;
  const lease = broker.acquire('monitor');
  if (!lease) return null;

  let stopped = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const run = async (): Promise<void> => {
    await port!.open({ baudRate: baud });
    let buffer = '';
    const decoder = new TextDecoder();
    while (!stopped && port!.readable) {
      reader = port!.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done || stopped) break;
          buffer += decoder.decode(value, { stream: true });
          let nl = buffer.indexOf('\n');
          while (nl >= 0) {
            const line = buffer.slice(0, nl).replace(/\r$/, '');
            buffer = buffer.slice(nl + 1);
            if (line.length > 0) onLine(parseSerialLine(line));
            nl = buffer.indexOf('\n');
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
  };
  const running = run().catch(() => undefined);

  return {
    stop: async () => {
      stopped = true;
      try { await reader?.cancel(); } catch { /* already closed */ }
      await running;
      try { await port!.close(); } catch { /* already closed */ }
      lease.release();
    },
  };
}
