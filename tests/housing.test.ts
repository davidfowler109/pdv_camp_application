import assert from "node:assert/strict";
import { test } from "node:test";
import { availability, camperBedCapacity, integer } from "../lib/housing.ts";

test("placement requires two adult leaders and counselors for weeks serving minors", () => {
  assert.equal(availability(false, 5, 2, 1, true), "closed");
  assert.equal(availability(true, 5, 1, 3, true), "noTeam");
  assert.equal(availability(true, 5, 1, 0, false), "noTeam");
  assert.equal(availability(true, 5, 2, 0, true), "noTeam");
  assert.equal(availability(true, 5, 2, 4, true), "noTeam");
  assert.equal(availability(true, 0, 2, 1, true), "noBeds");
  assert.equal(availability(true, 5, 2, 3, true), "ready");
  assert.equal(availability(true, 5, 2, 0, false), "ready");
});

test("only adult cabin leaders and guests use cabin beds", () => {
  assert.equal(camperBedCapacity(16, 0, 2), 14);
  assert.equal(camperBedCapacity(10, 0, 2), 8);
  assert.equal(camperBedCapacity(10, 1, 2), 7);
  assert.equal(camperBedCapacity(2, 1, 2), 0);
});

test("integer fields reject blank, fractional and out of range values", () => {
  for (const value of [null, "", "1.5", "-1", "251"]) assert.equal(integer(value, 0, 250), null);
  assert.equal(integer("0", 0, 250), 0);
  assert.equal(integer("250", 0, 250), 250);
});
