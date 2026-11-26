import { Engine } from "@haelp/teto/engine";
import { describe, expect, it } from "vitest";

import { UnsupportedReplayError, applyNoSzo, assertSupported, simulateGame, toEngineConfig, type PlayerGame } from "../src";
import { TS, soloGame } from "./helpers/synthetic";

const withOptions = (extra: Record<string, unknown>): PlayerGame => {
  const g = soloGame([["hardDrop"]]);
  return { ...g, options: { ...g.options, ...extra } };
};

describe("assertSupported", () => {
  it("accepts plain 7-bag solo and no_szo 7-bag", () => {
    expect(() => assertSupported(withOptions({}))).not.toThrow();
    expect(() => assertSupported(withOptions({ no_szo: true }))).not.toThrow();
  });
  it.each([
    [{ levels: true }, /level gravity/],
    [{ zenith: true }, /Zenith/],
    [{ bagtype: "zenith" }, /Zenith/],
    [{ bagtype: "mystery-bag" }, /not supported/],
    [{ no_szo: true, bagtype: "14-bag" }, /only supported with 7-bag/]
  ])("rejects %o", (opts, msg) => {
    expect(() => assertSupported(withOptions(opts))).toThrow(UnsupportedReplayError);
    expect(() => assertSupported(withOptions(opts))).toThrow(msg);
  });
  it("simulateGame refuses unsupported games", () => {
    expect(() => simulateGame(withOptions({ levels: true }), TS)).toThrow(UnsupportedReplayError);
  });
});

describe("applyNoSzo", () => {
  // Seed taken from a real 40L replay: Triangle's raw first bag is z s j o t i l.
  const engineFor = (seed: number) => new Engine(toEngineConfig(withOptions({ seed }), TS));

  it("rotates leading S/Z/O pieces of the first bag to its back", () => {
    const e = engineFor(1331160362);
    expect([e.falling.symbol, ...e.queue.slice(0, 6)].join("")).toBe("zsjotil");
    applyNoSzo(e);
    expect([e.falling.symbol, ...e.queue.slice(0, 6)].join("")).toBe("jotilzs");
    expect(e.queue.slice(6, 13).join("")).toBe("sjzitlo"); // second bag untouched
  });

  it("is a no-op when the first piece is already valid", () => {
    const e = engineFor(1852990159);
    const before = [e.falling.symbol, ...e.queue.slice(0, 13)].join("");
    applyNoSzo(e);
    expect([e.falling.symbol, ...e.queue.slice(0, 13)].join("")).toBe(before);
  });

  it("refuses to run after the game started", () => {
    const e = engineFor(1331160362);
    e.tick([]);
    expect(() => applyNoSzo(e)).toThrow(/before the first tick/);
  });
});
