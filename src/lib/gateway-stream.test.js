import { expect, test } from "bun:test";
import { readGatewayText } from "./gateway-stream";

test("streamed JSON survives byte splits and metadata frames", async () => {
  const frames = 'data: {"choices":[{"delta":{"content":"{\\\"speech\\\":"}}]}\n\ndata: {"choices":[{"delta":{"content":"\\\"été\\\"}"}}]}\n\ndata: [DONE]\n\n';
  const bytes = new TextEncoder().encode(frames);
  const response = new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } }));
  expect(JSON.parse(await readGatewayText(response))).toEqual({ speech: "été" });
});
test("a truncated generation is an error, not a partial sommelier answer", async () => {
  const response = new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
  expect(readGatewayText(response)).rejects.toThrow("interrupted");
});