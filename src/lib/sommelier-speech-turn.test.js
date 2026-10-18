import { afterEach, describe, expect, jest, test } from "bun:test";
import { createSpeechTurn, SPEECH_PAUSE_MS } from "./sommelier-speech-turn";

afterEach(() => jest.useRealTimers());

describe("Sommelier microphone turn", () => {
  test("a browser session ending does not send immediately", () => {
    jest.useFakeTimers();
    const sent = [];
    const turn = createSpeechTurn((text) => sent.push(text));
    turn.update("Je voudrais", false);
    turn.ended();
    jest.advanceTimersByTime(SPEECH_PAUSE_MS - 1);
    expect(sent).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(sent).toEqual(["Je voudrais"]);
  });
  test("continued speech preserves the whole sentence across recognition sessions", () => {
    jest.useFakeTimers();
    const sent = [];
    const turn = createSpeechTurn((text) => sent.push(text));
    turn.update("Je voudrais", false);
    turn.ended();
    jest.advanceTimersByTime(1000);
    turn.speechStarted();
    jest.advanceTimersByTime(3000);
    expect(sent).toEqual([]);
    turn.update("Je voudrais un rouge léger pour ce soir", false);
    jest.advanceTimersByTime(SPEECH_PAUSE_MS);
    expect(sent).toEqual(["Je voudrais un rouge léger pour ce soir"]);
  });
  test("interim speech cannot trigger a response while still speaking", () => {
    jest.useFakeTimers();
    const sent = [];
    const turn = createSpeechTurn((text) => sent.push(text));
    turn.update("Un vin", true);
    jest.advanceTimersByTime(5000);
    expect(sent).toEqual([]);
    turn.ended();
    jest.advanceTimersByTime(SPEECH_PAUSE_MS);
    expect(sent).toEqual(["Un vin"]);
  });
  test("stopping the microphone cancels a pending response", () => {
    jest.useFakeTimers();
    const sent = [];
    const turn = createSpeechTurn((text) => sent.push(text));
    turn.update("Un blanc", false);
    turn.cancel();
    jest.advanceTimersByTime(SPEECH_PAUSE_MS);
    expect(sent).toEqual([]);
  });
});