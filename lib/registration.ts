import { activeTransport,transportSnapshot,transportVersion,type TransportStop } from "./camp-transport-options.ts";

export const healthFields = ["food", "diet", "medicationAllergy", "medication", "accommodation"] as const;
export type IntakeChannel = "online" | "paper" | "desk";
export const noticeVersion = "pilot-2";

export function dateParts(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()] as const;
}

export function ageOn(birth: string, on: string) {
  const b = dateParts(birth);
  const d = dateParts(on);
  if (!b || !d || birth > on) return null;
  return d[0] - b[0] - Number(d[1] < b[1] || (d[1] === b[1] && d[2] < b[2]));
}

export function panamaDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Panama", dateStyle: "short" }).format();
}

export function parseRegistration(form: FormData, channel: IntakeChannel, today: string, transportStops:TransportStop[] = []) {
  const read = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const required = (keys: string[]) => keys.every(key => read(key).length > 0);
  const choice = (key: string, options: string[]) => options.includes(read(key));
  const available=activeTransport(transportStops,Number(read("week")));
  const busStop=(leg:"arrival"|"departure")=>available.find(stop=>stop.id===read(leg+"Stop")&&stop.leg===leg&&transportVersion(stop)===read(leg+"StopVersion"));
  const photo = read("photoPermission");
  const authorizationDate = channel === "paper" ? read("authorizedOn") : today;
  const age = ageOn(read("birth"), authorizationDate);
  if (!dateParts(authorizationDate) || authorizationDate > today || age === null ||
      !choice("signerRole", age < 18 ? ["guardian"] : ["self"]) || read("authorization") !== "yes" ||
      !required(["signer", "first", "last", "home", "contact", "relationship", "contactRoute"]) ||
      !choice("group", ["female", "male"]) || !choice("helperRole", ["none", "family", "pastor", "staff"]) ||
      (read("signerRole") === "guardian" && !required(["signerRelationship"])) ||
      (read("helperRole") !== "none" && !required(["helper"])) ||
      (channel !== "online" && !required(["recorder"])) ||
      (channel === "paper" && (!required(["paperRoute"]) || read("paperLocation").length > 1000)) ||
      (photo !== "granted" && photo !== "declined" && !(channel === "paper" && photo === "unrecorded")) ||
      !choice("participation", ["pending", "granted", "declined"]) ||
      !choice("arrival", ["bus", "own"]) || !choice("departure", ["bus", "own"]) ||
      (read("arrival") === "bus" && !busStop("arrival")) ||
      (read("departure") === "bus" && !busStop("departure")) ||
      healthFields.some(key => !choice(key, ["none", "yes", "unknown"]) || (read(key) === "yes" && !required([key + "Details"])))) return null;

  const id = read("id");
  const week = Number(read("week"));
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id) ||
      !/^\d+$/.test(read("week")) || !Number.isInteger(week) || week < 1 || week > 2147483647) return null;

  const keys = ["signer", "first", "last", "home", "contact", "relationship", "contactRoute",
    "signerRelationship", "additionalContact", "homeChurch", "notes", "helperRole", "helper", "arrival", "departure", "arrivalStop", "departureStop",
    "pickup", "scholarship", ...healthFields, ...healthFields.map(key => key + "Details")];
  if (channel === "paper") keys.push("paperRoute", "paperSource", "witness", "paperLocation");
  if (channel !== "online") keys.push("recorder");
  const details = Object.fromEntries(keys.map(key => [key, read(key)] as const).filter(([,value]) => value !== ""));
  if (Object.values(details).some(value => value.length > 1000)) return null;
  if (read("signerRole") === "self") delete details.signerRelationship;
  if (read("helperRole") === "none") delete details.helper;
  for (const leg of ["arrival", "departure"]) if (read(leg) !== "bus") delete details[leg + "Stop"];
  for (const key of healthFields) if (read(key) !== "yes") delete details[key + "Details"];
  let plannedDetails=details;
  for(const leg of ["arrival","departure"] as const)if(read(leg)==="bus")plannedDetails=transportSnapshot(plannedDetails,leg,busStop(leg)!);
  const { first, last, signer, ...restrictedDetails } = plannedDetails;
  return {
    id, week, first, last, birth: read("birth"), group: read("group"), channel,
    participation: read("participation"), photoPermission: photo === "unrecorded" ? null : photo,
    authorizationDate, signerRole: read("signerRole"), signer, details: restrictedDetails,
  };
}
