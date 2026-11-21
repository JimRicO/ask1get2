type CaptureStream = { getTracks(): Array<{ stop(): void }> };

/** An invalidated permission request must release its stream even if it resolves late. */
export function createCaptureLease() {
  let generation = 0;
  let stream: CaptureStream | null = null;
  const stopTracks = (value: CaptureStream | null) => value?.getTracks().forEach((track) => track.stop());
  return {
    begin() { return ++generation; },
    accept(ticket: number, value: CaptureStream) {
      if (ticket !== generation) { stopTracks(value); return false; }
      stopTracks(stream);
      stream = value;
      return true;
    },
    release() { generation++; stopTracks(stream); stream = null; },
  };
}