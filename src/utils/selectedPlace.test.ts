import assert from "node:assert/strict";
import { test } from "node:test";
import { selectedPlaceLeftTheList } from "./selectedPlace.ts";

test("a filter that hides the selected place closes its info window", () => {
  assert.equal(selectedPlaceLeftTheList("qpark-chinatown", ["barbican-car-park"]), true);
  assert.equal(selectedPlaceLeftTheList("qpark-chinatown", ["barbican-car-park", "qpark-chinatown"]), false);
  assert.equal(selectedPlaceLeftTheList(null, ["barbican-car-park"]), false);
  assert.equal(selectedPlaceLeftTheList("qpark-chinatown", []), true);
});
