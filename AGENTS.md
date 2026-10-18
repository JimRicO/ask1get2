# Architecture rules

- Keep the sommelier expertise contract in a browser-safe shared module consumed by both text and live-voice server functions, so reasoning and evidence rules cannot drift between modes.
- Use the shared page metadata helper for leaf route titles and descriptions to keep brand and social metadata consistent without root-level preview images.- Sommelier voice is browser speech recognition -> askCellarSommelier -> Google TTS (speakSommelier), not Gemini Live: one deliberate reasoning path for text and voice.
