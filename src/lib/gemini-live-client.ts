/* Browser side of a Gemini Live audio session (raw WebSocket, ephemeral token).
   Mic: PCM16 mono 16 kHz. Playback: PCM16 mono 24 kHz. */

const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export type LiveEvents = {
  onReady?: () => void;
  onUserText?: (text: string) => void;
  onModelText?: (text: string) => void;
  onTurnComplete?: () => void;
  onSpeaking?: (speaking: boolean) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => unknown;
  onClose?: (reason: string | null) => void;
};

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function downsampleToPcm16(input: Float32Array, inRate: number): Uint8Array {
  const ratio = inRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return new Uint8Array(out.buffer);
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private micCtx: AudioContext | null = null;
  private outCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private proc: ScriptProcessorNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private closed = false;
  private ready = false;

  constructor(private ev: LiveEvents) {}

  /** Call synchronously inside the user's tap (iOS unlocks audio only there). */
  prepare() {
    this.outCtx = new AudioContext({ sampleRate: 24000 });
    this.micCtx = new AudioContext();
    void this.outCtx.resume();
    void this.micCtx.resume();
    this.micP = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }
  private micP: Promise<MediaStream> | null = null;

  async start(token: string, setup: unknown) {
    if (!this.micP) this.prepare();
    this.stream = await this.micP!;

    const ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ setup }));
    ws.onmessage = async (e) => {
      const raw = typeof e.data === "string" ? e.data : await (e.data as Blob).text();
      this.handle(JSON.parse(raw));
    };
    ws.onclose = (e) => {
      const reason = this.closed ? null : e.reason || `Connexion fermée (${e.code})`;
      this.teardown();
      this.ev.onClose?.(reason);
    };
  }

  private startMic() {
    if (!this.micCtx || !this.stream) return;
    const src = this.micCtx.createMediaStreamSource(this.stream);
    const proc = this.micCtx.createScriptProcessor(4096, 1, 1);
    const rate = this.micCtx.sampleRate;
    proc.onaudioprocess = (e) => {
      if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
      const pcm = downsampleToPcm16(e.inputBuffer.getChannelData(0), rate);
      this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: toBase64(pcm), mimeType: "audio/pcm;rate=16000" } } }));
    };
    const mute = this.micCtx.createGain();
    mute.gain.value = 0;
    src.connect(proc);
    proc.connect(mute);
    mute.connect(this.micCtx.destination);
    this.proc = proc;
  }

  private play(b64: string) {
    const ctx = this.outCtx;
    if (!ctx) return;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const buf = ctx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.02, this.nextTime);
    node.start(at);
    this.nextTime = at + buf.duration;
    this.sources.add(node);
    this.ev.onSpeaking?.(true);
    node.onended = () => {
      this.sources.delete(node);
      if (this.sources.size === 0) this.ev.onSpeaking?.(false);
    };
  }

  private flushPlayback() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextTime = 0;
    this.ev.onSpeaking?.(false);
  }

  private handle(m: any) {
    if (m.setupComplete) {
      this.ready = true;
      this.startMic();
      this.ev.onReady?.();
      return;
    }
    if (m.toolCall?.functionCalls) {
      const functionResponses = m.toolCall.functionCalls.map((fc: any) => {
        let result: unknown;
        try {
          result = this.ev.onToolCall?.(fc.name, fc.args ?? {}) ?? "ok";
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        return { id: fc.id, name: fc.name, response: { result } };
      });
      this.ws?.send(JSON.stringify({ toolResponse: { functionResponses } }));
    }
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.interrupted) this.flushPlayback();
    // One event can carry several parts (audio + transcript): read them all.
    for (const p of sc.modelTurn?.parts ?? []) {
      if (p.inlineData?.data) this.play(p.inlineData.data);
    }
    if (sc.inputTranscription?.text) this.ev.onUserText?.(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) this.ev.onModelText?.(sc.outputTranscription.text);
    if (sc.turnComplete) this.ev.onTurnComplete?.();
  }

  private teardown() {
    this.ready = false;
    this.flushPlayback();
    this.proc?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.micCtx?.close().catch(() => {});
    void this.outCtx?.close().catch(() => {});
    this.proc = null;
    this.stream = null;
    this.micCtx = null;
    this.outCtx = null;
  }

  stop() {
    this.closed = true;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    this.teardown();
  }
}
