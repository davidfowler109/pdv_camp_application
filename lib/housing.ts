export type Availability = "ready" | "closed" | "noBeds" | "noTeam";

export function availability(inService: boolean, camperBeds: number, guides: number, helpers: number): Availability {
  if (!inService) return "closed";
  if (guides < 1 || helpers < 1 || helpers > 3) return "noTeam";
  return camperBeds > 0 ? "ready" : "noBeds";
}

export function camperBedCapacity(usableBeds: number, guestBeds: number, guides: number, equipantes: number) {
  return Math.max(0, usableBeds - guestBeds - guides - equipantes);
}

export function integer(value: FormDataEntryValue | null, min: number, max: number) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
