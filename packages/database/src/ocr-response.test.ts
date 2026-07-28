import { describe, expect, it } from "vitest";
import { assessOcrQuality } from "./ocr-response";

const fields = {
  challenge_completed: { status: "ok", confidence: 0.9 },
  viewer_player: { status: "ok", confidence: 0.9 },
  map_name: { status: "ok", confidence: 0.9 },
  difficulty: { status: "ok", confidence: 0.9 },
};

describe("assessOcrQuality", () => {
  it("requires all map challenge fields to be reliable", () => {
    expect(assessOcrQuality("difficulty_completion", { schema_version: "1", ok: true, fields }).accepted).toBe(true);
    expect(assessOcrQuality("difficulty_completion", { schema_version: "1", ok: true, fields: { ...fields, difficulty: { status: "missing", confidence: 0 } } }).reasons).toContain("difficulty:missing");
  });

  it("requires only completion and viewer player for title challenges", () => {
    expect(assessOcrQuality("title_achievement", { schema_version: "1", ok: true, fields: { challenge_completed: fields.challenge_completed, viewer_player: fields.viewer_player } }).accepted).toBe(true);
    expect(assessOcrQuality("title_achievement", { schema_version: "2", ok: true, fields: { challenge_completed: fields.challenge_completed, viewer_player: { status: "ok", confidence: 0.2 } } }).reasons).toEqual(["unsupported_schema_version", "viewer_player:low_confidence"]);
  });

  it("requires the map name for map-scoped title challenges", () => {
    expect(assessOcrQuality("map_title_achievement", { schema_version: "1", ok: true, fields: { challenge_completed: fields.challenge_completed, viewer_player: fields.viewer_player, map_name: fields.map_name } }).accepted).toBe(true);
    expect(assessOcrQuality("map_title_achievement", { schema_version: "1", ok: true, fields: { challenge_completed: fields.challenge_completed, viewer_player: fields.viewer_player } }).reasons).toContain("map_name:missing_evidence");
  });
});
