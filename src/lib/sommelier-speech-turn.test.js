import { describe, expect, test } from "bun:test";
import { createSpeechTurn, SPEECH_PAUSE_MS } from "./sommelier-speech-turn";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Sommelier microphone turn", () => {
  test("a browser session ending does not send immediately", async () => {
    const sent = [];
    const turn = createSpeechTurn((text) => sent.push(text));
    turn.update("Je voudrais", false);
    turn.ended();
    await pause(100);
    expect(sent).toEqual([]);
    await pause(SPEECH_PAUSE_MS);
    expect(sent).toEqual(["Je voudrais"]);
  });
  test("continued speech preserves the whole sentence across recognition sessions", async () => {
    const sent = [];
    const turn = createSpeechTurn((text) => sent.push(text));
    turn.update("Je voudrais", false);
    turn.ended();
    await pause(100);
    turn.speechStarted();
    await pause(SPEECH_PAUSE_MS + 100);
    expect(sent).toEqual([]);
    turn.update("Je voudrais un rouge léger pour ce soir", false);
    await pause(SPEECH_PAUSE_MS + 100);
    expect(sent).toEqual(["Je voudrais un rouge léger pour ce soir"]);
  }, 10000);
  test("interim speech cannot trigger a response while still speaking", async () => {
    const sent = [];
    const turn = createSpeechTurn((text) => sent.push(text));
    turn.update("Un vin", true);
    await pause(SPEECH_PAUSE_MS + 100);
    expect(sent).toEqual([]);
    turn.ended();
    await pause(SPEECH_PAUSE_MS + 100);
    expect(sent).toEqual(["Un vin"]);
  }, 10000);
  test("stopping the microphone cancels a pending response", async () => {
    const sent = [];
    const turn = createSpeechTurn((text) => sent.push(text));
    turn.update("Un blanc", false);
    turn.cancel();
    await pause(SPEECH_PAUSE_MS + 100);
    expect(sent).toEqual([]);
  });
});