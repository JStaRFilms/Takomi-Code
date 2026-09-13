import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { playTurnCompleteSound } from "./turnCompleteSound";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "Audio");
  vi.restoreAllMocks();
});

describe("playTurnCompleteSound", () => {
  it("plays the completion chime from its first sample", () => {
    const sound = {
      currentTime: 3,
      play: vi.fn().mockResolvedValue(undefined),
      preload: "none",
    };
    const AudioMock = vi.fn(function AudioMock() {
      return sound;
    });
    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: AudioMock,
    });

    playTurnCompleteSound();

    expect(AudioMock).toHaveBeenCalledWith(expect.stringMatching(/turn-complete-chime\.mp3/));
    expect(sound.preload).toBe("auto");
    expect(sound.currentTime).toBe(0);
    expect(sound.play).toHaveBeenCalledOnce();
  });
  it("ignores blocked playback", async () => {
    const sound = {
      currentTime: 0,
      play: vi.fn().mockRejectedValue(new Error("blocked")),
      preload: "none",
    };
    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: vi.fn(function AudioMock() {
        return sound;
      }),
    });

    expect(() => playTurnCompleteSound()).not.toThrow();
    await vi.waitFor(() => expect(sound.play).toHaveBeenCalledOnce());
  });
});
