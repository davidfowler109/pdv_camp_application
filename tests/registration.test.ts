import type { TransportStop } from "../lib/camp-transport-options.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ageOn, parseRegistration as parseConfiguredRegistration } from "../lib/registration.ts";


const transportStops:TransportStop[]=[{id:"11111111-1111-4111-8111-111111111111",week_id:1,route_id:"33333333-3333-4333-8333-333333333333",leg:"arrival",location:"Albrook",time:"07:30",notes:"",active:true,revision:1,route:"Sample route",vehicle:"Bus 1",route_active:true,route_revision:1},{id:"22222222-2222-4222-8222-222222222222",week_id:1,route_id:"33333333-3333-4333-8333-333333333333",leg:"departure",location:"La Espiga",time:"15:30",notes:"",active:true,revision:1,route:"Sample route",vehicle:"Bus 1",route_active:true,route_revision:1}];
const parseRegistration=(form:FormData,channel:"online"|"desk"|"paper",today:string)=>parseConfiguredRegistration(form,channel,today,transportStops);

const today = "2026-11-06";
function registration() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    id:"952e8ec3-95ab-40ea-8ad2-d324c3eeab5e", week:"1", authorization:"yes", signerRole:"guardian",
    signer:"Laura", signerRelationship:"Mother", first:"Isabel", last:"Mora", birth:"2014-06-04", group:"female",
    home:"Last house past the church", contact:"Laura", relationship:"Mother", contactRoute:"Through the pastor",
    helperRole:"pastor", helper:"Mateo", food:"none", diet:"none", medicationAllergy:"unknown", medication:"none", accommodation:"none",
    arrival:"bus", arrivalStop:"11111111-1111-4111-8111-111111111111", arrivalStopVersion:"1:1", departureStopVersion:"1:1", departure:"own", participation:"pending", photoPermission:"declined",
  })) form.set(key, value);
  return form;
}

test("dietary requirements need an explicit answer and details when reported", () => {
  const form = registration();
  form.delete("diet");
  assert.equal(parseRegistration(form,"online",today),null);
  form.set("diet","yes");
  assert.equal(parseRegistration(form,"online",today),null);
  form.set("dietDetails","Fictional lactose intolerance");
  assert.equal(parseRegistration(form,"online",today)?.details.dietDetails,"Fictional lactose intolerance");
});

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

test("bus selections must belong to the selected week's configured journey and current version",()=>{
  const form=registration();
  assert.equal(parseConfiguredRegistration(form,"online",today),null);
  form.set("arrivalStopVersion","older");assert.equal(parseRegistration(form,"online",today),null);
  form.set("arrivalStopVersion","1:1");form.set("week","2");assert.equal(parseRegistration(form,"online",today),null);
  form.set("week","1");form.set("arrivalStop",transportStops[1].id);assert.equal(parseRegistration(form,"online",today),null);
  form.set("arrival","own");assert.ok(parseRegistration(form,"online",today));
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
  form.set("departureStop", "22222222-2222-4222-8222-222222222222");
  const result = parseRegistration(form, "online", today);
  assert.equal(result?.details.departureStop, "La Espiga");
  assert.equal(result?.details.arrivalStop, undefined);
});
