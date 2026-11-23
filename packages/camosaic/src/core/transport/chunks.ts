import { deserializeMessage, serializeMessage } from "./messages";
import type { Link, WireMessage } from "../types";

const CHUNK_SIZE = 12000;

interface Chunk {
  t: "_chunk";
  id: number;
  i: number;
  n: number;
  d: string;
}

export function attachDataChannel(channel: RTCDataChannel): Link {
  const link: Link = { kind: "rtc", send: () => undefined, close: () => channel.close() };
  const partial = new Map<number, { n: number; chunks: string[]; got: number; createdAt: number }>();
  let sequence = 0;
  link.send = (message) => {
    if (channel.readyState !== "open") throw new Error("Data channel is not open.");
    const text = serializeMessage(message);
    if (text.length <= CHUNK_SIZE) {
      channel.send(text);
      return;
    }
    const id = ++sequence;
    const count = Math.ceil(text.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      channel.send(JSON.stringify({ t: "_chunk", id, i, n: count, d: text.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) } satisfies Chunk));
    }
  };
  channel.addEventListener("message", (event: MessageEvent<string>) => {
    try {
      const raw: unknown = JSON.parse(String(event.data));
      if (raw && typeof raw === "object" && (raw as { t?: unknown }).t === "_chunk") {
        const chunk = raw as Chunk;
        if (!Number.isInteger(chunk.id) || !Number.isInteger(chunk.i) || !Number.isInteger(chunk.n) ||
          chunk.n < 1 || chunk.n > 700 || chunk.i < 0 || chunk.i >= chunk.n ||
          typeof chunk.d !== "string" || chunk.d.length > CHUNK_SIZE) return;
        const now = Date.now();
        for (const [id, record] of partial) if (now - record.createdAt > 30000) partial.delete(id);
        let record = partial.get(chunk.id);
        if (!record) {
          if (partial.size >= 8) partial.delete(partial.keys().next().value!);
          record = { n: chunk.n, chunks: new Array(chunk.n), got: 0, createdAt: now };
          partial.set(chunk.id, record);
        }
        if (record.n !== chunk.n || record.chunks[chunk.i] !== undefined) return;
        record.chunks[chunk.i] = chunk.d;
        record.got++;
        if (record.got === record.n) {
          partial.delete(chunk.id);
          link.onmessage?.(deserializeMessage(record.chunks.join("")));
        }
        return;
      }
      link.onmessage?.(deserializeMessage(String(event.data)));
    } catch { /* Ignore malformed/untrusted channel payloads. */ }
  });
  return link;
}
