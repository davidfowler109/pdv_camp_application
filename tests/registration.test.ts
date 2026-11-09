import assert from "node:assert/strict";
import { test } from "node:test";
import { ageOn, parseRegistration } from "../lib/registration.ts";

const today = "2026-11-06";
function registration() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    id:"952e8ec3-95ab-40ea-8ad2-d324c3eeab5e", week:"1", authorization:"yes", signerRole:"guardian",
    signer:"Laura", signerRelationship:"Mother", first:"Isabel", last:"Mora", birth:"2014-06-04", group:"female",
    home:"Last house past the church", contact:"Laura", relationship:"Mother", contactRoute:"Through the pastor",
    helperRole:"pastor", helper:"Mateo", food:"none", medicationAllergy:"unknown", medication:"none", accommodation:"none",
    arrival:"bus", arrivalStop:"Albrook", departure:"own", participation:"pending", photoPermission:"declined",
  })) form.set(key, value);
  return form;
}

test("data consent is explicit while participation may remain pending", () => {
  const form = registration();
  const item = parseRegistration(form, "online", today);
  assert.equal(item?.participation, "pending");
  assert.equal(item?.photoPermission, "declined");
  form.delete("photoPermission");
  assert.equal(parseRegistration(form, "online", today), null);
  form.set("photoPermission", "granted");
  assert.equal(parseRegistration(form, "online", today)?.photoPermission, "granted");
  assert.equal(item?.details.medicationAllergy, "unknown");
  form.delete("authorization");
  assert.equal(parseRegistration(form, "online", today), null);
});

test("the signer depends on age on the day of authorization", () => {
  const form = registration();
  form.set("birth", "2008-11-06");
  assert.equal(ageOn("2008-11-06", today), 18);
  assert.equal(ageOn("2008-11-07", today), 17);
  assert.equal(parseRegistration(form, "online", today), null);
  form.set("signerRole", "self");
  assert.equal(parseRegistration(form, "online", today)?.signerRole, "self");
});

test("paper intake requires a received route and staff recorder, not a witness", () => {
  const form = registration();
  form.set("authorizedOn", "2026-11-04");
  assert.equal(parseRegistration(form, "paper", today), null);
  form.set("paperRoute", "Delivered at camp");
  form.set("recorder", "Intake worker");
  form.set("paperSource", "Pastor");
  assert.equal(parseRegistration(form, "paper", today)?.details.paperSource, "Pastor");
  form.set("photoPermission", "unrecorded");
  assert.equal(parseRegistration(form, "paper", today)?.photoPermission, null);
});

test("applicable bus legs and reported health needs require detail", () => {
  const form = registration();
  form.set("food", "yes");
  assert.equal(parseRegistration(form, "online", today), null);
  form.set("foodDetails", "Fictional detail");
  form.delete("arrivalStop");
  assert.equal(parseRegistration(form, "online", today), null);
  form.set("arrivalStop", "Unlisted stop");
  assert.equal(parseRegistration(form, "online", today), null);
  form.set("arrival", "own");
  form.set("departure", "bus");
  form.set("departureStop", "Unlisted stop");
  assert.equal(parseRegistration(form, "online", today), null);
  form.set("departureStop", "La Espiga");
  const result = parseRegistration(form, "online", today);
  assert.equal(result?.details.departureStop, "La Espiga");
  assert.equal(result?.details.arrivalStop, undefined);
});
