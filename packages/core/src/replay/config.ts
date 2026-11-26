import type { EngineInitializeParams } from "@haelp/teto/engine";

import type { PlayerGame } from "./types";

type Opts = Record<string, unknown>;

const num = (o: Opts, key: string, fallback: number): number =>
  typeof o[key] === "number" ? (o[key] as number) : fallback;
const bool = (o: Opts, key: string, fallback: boolean): boolean =>
  typeof o[key] === "boolean" ? (o[key] as boolean) : fallback;
const str = <T extends string>(o: Opts, key: string, fallback: T): T =>
  typeof o[key] === "string" ? (o[key] as T) : fallback;

/**
 * Map TETR.IO replay options to a Triangle.js engine config.
 *
 * Based on Triangle's own replay test adapter (test/engine/replay.ts) and Game.createEngine,
 * with board width/height in the right order. Defaults are TETR.IO league defaults.
 * `ts` matters: Triangle picks the garbage queue implementation and opener-phase rules by date.
 */
export function toEngineConfig(game: PlayerGame, ts: string): EngineInitializeParams {
  const o = game.options as Opts;
  const handling = (o.handling ?? {}) as Opts;
  const width = num(o, "boardwidth", 10);
  const height = num(o, "boardheight", 20);
  const b2bCharging = bool(o, "b2bcharging", false);

  const config: EngineInitializeParams = {
    board: { width, height, buffer: 20 },
    kickTable: str(o, "kickset", "SRS+") as EngineInitializeParams["kickTable"],
    options: {
      comboTable: str(o, "combotable", "multiplier") as EngineInitializeParams["options"]["comboTable"],
      garbageBlocking: str(o, "garbageblocking", "combo blocking") as EngineInitializeParams["options"]["garbageBlocking"],
      clutch: bool(o, "clutch", true),
      garbageTargetBonus: str(o, "garbagetargetbonus", "none"),
      spinBonuses: str(o, "spinbonuses", "all-mini+") as EngineInitializeParams["options"]["spinBonuses"],
      stock: 0
    },
    queue: {
      minLength: 10,
      seed: game.options.seed,
      type: str(o, "bagtype", "7-bag") as EngineInitializeParams["queue"]["type"]
    },
    garbage: {
      bombs: bool(o, "usebombs", false),
      cap: {
        absolute: num(o, "garbageabsolutecap", 0),
        increase: num(o, "garbagecapincrease", 0),
        max: num(o, "garbagecapmax", 40),
        value: num(o, "garbagecap", 8),
        marginTime: num(o, "garbagecapmargin", 0)
      },
      boardWidth: width,
      garbage: {
        speed: num(o, "garbagespeed", 20),
        holeSize: num(o, "garbageholesize", 1)
      },
      messiness: {
        change: num(o, "messiness_change", 1),
        nosame: bool(o, "messiness_nosame", false),
        timeout: num(o, "messiness_timeout", 0),
        within: num(o, "messiness_inner", 0),
        center: bool(o, "messiness_center", false)
      },
      multiplier: {
        value: num(o, "garbagemultiplier", 1),
        increase: num(o, "garbageincrease", 0.008),
        marginTime: num(o, "garbagemargin", 10800)
      },
      specialBonus: bool(o, "garbagespecialbonus", false),
      openerPhase: num(o, "openerphase", 0),
      seed: game.options.seed,
      rounding: str(o, "roundmode", "down") as EngineInitializeParams["garbage"]["rounding"]
    },
    gravity: {
      value: num(o, "g", 0.02),
      increase: num(o, "gincrease", 0),
      marginTime: num(o, "gmargin", 0)
    },
    handling: {
      arr: num(handling, "arr", 0),
      das: num(handling, "das", 6),
      dcd: num(handling, "dcd", 0),
      sdf: num(handling, "sdf", 41),
      safelock: bool(handling, "safelock", false),
      cancel: bool(handling, "cancel", false),
      may20g: bool(handling, "may20g", true),
      irs: str(handling, "irs", "tap"),
      ihs: str(handling, "ihs", "tap")
    },
    // Mirrors Triangle's validated adapter: chaining is off when charging (surge) is on.
    b2b: {
      chaining: !b2bCharging,
      charging: b2bCharging
        ? { at: num(o, "b2bcharge_at", 4), base: num(o, "b2bcharge_base", 3) }
        : false
    },
    pc:
      o.allclears === false
        ? false
        : { b2b: num(o, "allclear_b2b", 0), garbage: num(o, "allclear_garbage", 0) },
    misc: {
      allowed: {
        hardDrop: bool(o, "allow_harddrop", true),
        spin180: bool(o, "allow180", true),
        hold: bool(o, "display_hold", true),
        retry: bool(o, "can_retry", false),
        undo: bool(o, "can_undo", false)
      },
      infiniteHold: bool(o, "infinite_hold", false),
      movement: {
        infinite: bool(o, "infinite_movement", false),
        lockResets: num(o, "lockresets", 15),
        lockTime: num(o, "locktime", 30),
        may20G: bool(o, "gravitymay20g", true)
      },
      username: typeof o.username === "string" ? o.username : undefined,
      stride: bool(o, "stride", false),
      date: new Date(ts)
    }
  };

  if (game.kind === "versus") {
    config.multiplayer = {
      opponents: game.opponents,
      passthrough: str(o, "passthrough", "zero") as NonNullable<EngineInitializeParams["multiplayer"]>["passthrough"]
    };
  }

  return config;
}
