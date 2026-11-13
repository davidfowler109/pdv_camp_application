export type Availability = "ready" | "closed" | "noBeds" | "noTeam";

export function hasCabinTeam(adultLeaders: number, counselors: number, counselorsRequired: boolean) {
  return adultLeaders >= 2 && counselors >= (counselorsRequired ? 1 : 0) && counselors <= 3;
}

export function availability(inService: boolean, camperBeds: number, guides: number, counselors: number, counselorsRequired: boolean): Availability {
  if (!inService) return "closed";
  if (!hasCabinTeam(guides,counselors,counselorsRequired)) return "noTeam";
  return camperBeds > 0 ? "ready" : "noBeds";
}

export function camperBedCapacity(usableBeds: number, guestBeds: number, adultLeaders: number) {
  return Math.max(0, usableBeds - guestBeds - adultLeaders);
}

export function integer(value: FormDataEntryValue | null, min: number, max: number) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
