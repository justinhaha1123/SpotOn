import assert from "node:assert/strict";
import { test } from "node:test";
import {
  askModelsWithinDeadline,
  isModelCoolingDown,
  resetModelCooldowns,
} from "./advisorRun.ts";
import { isIgnorableMapsTeardownError, shouldAttachMapMarkers } from "./mapsTeardown.ts";

test("a 503 switches to the next model immediately and cools the first one down", async () => {
  resetModelCooldowns();
  const calls: string[] = [];
  const result = await askModelsWithinDeadline({
    deadlineAt: Date.now() + 5000,
    models: ["gemini-3.8-flash", "gemini-3.5-flash"],
    perCallMs: 1000,
    callModel: async (model) => {
      calls.push(model);
      if (model === "gemini-3.8-flash") {
        const err = new Error("503 UNAVAILABLE high demand");
        (err as { status?: number }).status = 503;
        throw err;
      }
      return "Use Tower Street.";
    },
  });

  assert.equal(result.kind, "answer");
  if (result.kind === "answer") assert.equal(result.model, "gemini-3.5-flash");
  assert.deepEqual(calls, ["gemini-3.8-flash", "gemini-3.5-flash"]);
  assert.equal(isModelCoolingDown("gemini-3.8-flash"), true);
  assert.equal(isModelCoolingDown("gemini-3.5-flash"), false);

  const followUp: string[] = [];
  const second = await askModelsWithinDeadline({
    deadlineAt: Date.now() + 5000,
    models: ["gemini-3.8-flash", "gemini-3.5-flash"],
    perCallMs: 1000,
    callModel: async (model) => {
      followUp.push(model);
      return "Shelton Street.";
    },
  });
  assert.equal(second.kind, "answer");
  assert.deepEqual(followUp, ["gemini-3.5-flash"]);
});

test("the model attempt stops at the deadline instead of waiting out a hung call", async () => {
  resetModelCooldowns();
  const start = Date.now();
  const result = await askModelsWithinDeadline({
    deadlineAt: start + 600,
    models: ["gemini-3.8-flash", "gemini-3.5-flash"],
    perCallMs: 5000,
    callModel: () => new Promise(() => {}),
  });
  const elapsed = Date.now() - start;
  assert.equal(result.kind, "busy");
  assert.ok(elapsed < 1200, `elapsed ${elapsed}ms`);
  assert.ok(elapsed >= 400, `returned too fast (${elapsed}ms)`);
});

test("maps teardown swallows the referrer setAttribute crash only", () => {
  assert.equal(
    isIgnorableMapsTeardownError("Uncaught TypeError: Cannot read properties of undefined (reading 'setAttribute')"),
    true
  );
  assert.equal(
    isIgnorableMapsTeardownError("RefererNotAllowedMapError", "https://maps.googleapis.com/maps/api/js"),
    true
  );
  assert.equal(isIgnorableMapsTeardownError("Cannot read properties of undefined (reading 'map')", "app.js"), false);
  assert.equal(
    isIgnorableMapsTeardownError("Cannot read properties of undefined (reading 'getRootNode')", "https://maps.googleapis.com/maps/api/js/marker.js"),
    true
  );
});

test("markers stay off until the map has loaded and auth has not failed", () => {
  assert.equal(shouldAttachMapMarkers({ authFailed: false, apiLoaded: false, mapReady: false }), false);
  assert.equal(shouldAttachMapMarkers({ authFailed: false, apiLoaded: true, mapReady: false }), false);
  assert.equal(shouldAttachMapMarkers({ authFailed: true, apiLoaded: true, mapReady: true }), false);
  assert.equal(shouldAttachMapMarkers({ authFailed: false, apiLoaded: true, mapReady: true }), true);
});
