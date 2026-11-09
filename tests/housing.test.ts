import assert from "node:assert/strict";
import { test } from "node:test";
import { availability, camperBedCapacity, integer } from "../lib/housing.ts";

test("availability requires service, open beds and complete staffing", () => {
  assert.equal(availability(false, 5, 1, 1), "closed");
  assert.equal(availability(true, 5, 0, 1), "noTeam");
  assert.equal(availability(true, 5, 1, 0), "noTeam");
  assert.equal(availability(true, 5, 1, 4), "noTeam");
  assert.equal(availability(true, 0, 1, 1), "noBeds");
  assert.equal(availability(true, 5, 2, 3), "ready");
});

test("camper beds exclude guests and each assigned team member", () => {
  assert.equal(camperBedCapacity(12, 0, 2, 0), 10);
  assert.equal(camperBedCapacity(12, 0, 2, 3), 7);
  assert.equal(camperBedCapacity(10, 1, 2, 3), 4);
  assert.equal(camperBedCapacity(2, 1, 2, 1), 0);
  assert.equal(availability(true, camperBedCapacity(3, 0, 2, 1), 2, 1), "noBeds");
});

test("integer fields reject blank, fractional and out of range values", () => {
  for (const value of [null, "", "1.5", "-1", "251"]) assert.equal(integer(value, 0, 250), null);
  assert.equal(integer("0", 0, 250), 0);
  assert.equal(integer("250", 0, 250), 250);
});
