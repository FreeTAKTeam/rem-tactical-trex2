import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHeading } from "../common/tacticalDisplay.js";

test("compass heading preserves valid angles and normalizes wraparound", () => {
  for (const angle of [0, 90, 180, 270, 287]) assert.equal(normalizeHeading(angle), angle);
  assert.equal(normalizeHeading(359.8), 0);
  assert.equal(normalizeHeading(-1), 359);
});

test("invalid heading never turns into a plausible north reading", () => {
  for (const value of [undefined, null, "", "INVALID", "123bad", NaN, Infinity]) {
    assert.equal(normalizeHeading(value), null);
  }
});
