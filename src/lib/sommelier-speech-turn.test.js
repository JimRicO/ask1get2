import { describe, expect, test } from "bun:test";
import { createSpeechTranscript, createSpeechTurn, SPEECH_PAUSE_MS } from "./sommelier-speech-turn";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const result = (text, isFinal = false) => ({ 0: { transcript: text }, isFinal });

describe("Sommelier transcript assembly", () => {
  test("revised interim results replace the same index", () => {
    const transcript = createSpeechTranscript();
    transcript.startSession();
    transcript.update([result("tu en")], 0);
    expect(transcript.update([result("tu en penses quoi du Cap Nord", true)], 0).text)
      .toBe("tu en penses quoi du Cap Nord");
  });
  test("cumulative hypotheses from the supplied dialogue are not concatenated", () => {
    const transcript = createSpeechTranscript();
    const fragments = ["non", "non tu", "non tu en", "non tu en penses", "non tu en penses quoi", "non tu en penses quoi du", "non tu en penses quoi du Cap Nord"];
    expect(transcript.update(fragments.map((text) => result(text, true)), 0).text)
      .toBe("non tu en penses quoi du Cap Nord");
  });
  test("final segments survive later interim revisions and browser restarts", () => {
    const transcript = createSpeechTranscript();
    transcript.update([result("Je voudrais", true), result("un rouge")], 0);
    transcript.update([result("Je voudrais", true), result("un rouge léger", true)], 1);
    transcript.startSession();
    expect(transcript.update([result("pour ce soir", true)], 0).text)
      .toBe("Je voudrais un rouge léger pour ce soir");
  });
  test("a restarted browser replaying the same hypothesis does not duplicate it", () => {
    const transcript = createSpeechTranscript();
    transcript.update([result("tu en penses quoi")], 0);
    transcript.startSession();
    expect(transcript.update([result("tu en penses quoi du Cap Nord", true)], 0).text)
      .toBe("tu en penses quoi du Cap Nord");
  });
  test("intentional repetition inside an utterance is preserved and reset clears it", () => {
    const transcript = createSpeechTranscript();
    expect(transcript.update([result("non non j'ai dit Cap Nord", true)], 0).text)
      .toBe("non non j'ai dit Cap Nord");
    transcript.reset();
    expect(transcript.update([result("un blanc", true)], 0).text).toBe("un blanc");
  });
});

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