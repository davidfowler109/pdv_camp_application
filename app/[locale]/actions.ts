"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "../../lib/database";
import { isLocale, type Locale } from "../../lib/copy";
import { endOfCampBlock, lockFacilityRooms, roomConflict } from "../../lib/facilities";
import { dateParts } from "../../lib/registration";
import { camperBedCapacity, hasCabinTeam, integer } from "../../lib/housing";
import { allocatedCount, confirmedCount, lockWeek, moneyCents } from "../../lib/review";
import { currentRole, isRole, setSession, validDemoPassword } from "../../lib/session";

function string(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function localeOf(form: FormData): Locale {
  const locale = string(form, "locale");
  return isLocale(locale) ? locale : "es";
}

function finish(form: FormData, status: "saved" | "invalid" | "denied" | "unavailable" | "groupConflict" | "facilityConflict"): never {
  const week = integer(form.get("week"), 1, 2147483647);
  redirect("/" + localeOf(form) + "?status=" + status + (week ? "&week=" + week : ""));
}

export async function changeLanguage(form: FormData) {
  const locale = localeOf(form);
  (await cookies()).set("pdv-language", locale, { path: "/", sameSite: "lax", maxAge: 31536000 });
  const section = string(form, "section");
  const week = integer(form.get("week"), 1, 2147483647);
  const followups = string(form,"followups");
  const query = new URLSearchParams();
  if (week) query.set("week",String(week));
  const receipt = string(form,"receipt");
  if (section === "register" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(receipt)) query.set("receipt",receipt);
  if (section === "intake" && ["open","overdue","today","undated"].includes(followups)) query.set("followups",followups);
  if (section === "intake/scholarships" && string(form,"scope") === "season") query.set("scope","season");
  if (section === "intake/new" && string(form,"method") === "paper") query.set("method","paper");
  const month = string(form,"month"), event = string(form,"event");
  if (section === "facilities" && /^20\d\d-(0[1-9]|1[0-2])$/.test(month)) query.set("month",month);
  if ((section === "events" || section === "events/attendees" || section === "events/housing") && (event === "new" || /^[a-f0-9-]{36}$/i.test(event))) query.set("event",event);
  const visit = string(form,"visit");
  if (["church-visits","church-visits/visitors","church-visits/housing","church-visits/attendance","church-visits/itinerary"].includes(section) && (visit === "new" || /^[a-f0-9-]{36}$/i.test(visit))) query.set("visit",visit);
  if (section === "church-visits/itinerary" && dateParts(string(form,"day"))) query.set("day",string(form,"day"));
  const visitor = string(form,"visitor");
  if (section === "church-visits/visitors" && /^[a-f0-9-]{36}$/i.test(visitor)) query.set("visitor",visitor);
  const from = string(form,"from");
  if (from) query.set("from",from.slice(0,500));
  redirect("/" + locale + (/^(?:register|housing|staff|facilities|church-visits(?:\/(?:attendance|housing|itinerary|visitors|(?:register|estimate)\/[0-9a-f-]{36}))?|events(?:\/(?:attendees|housing|register\/[0-9a-f-]{36}))?|health|check-in(?:\/dorms)?|departure|intake(?:\/(?:scholarships|new|print|[0-9a-f-]{36}))?)$/.test(section) ? "/" + section : "") + (query.size ? "?" + query : ""));
}

export async function login(form: FormData) {
  const role = string(form, "role");
  const password = String(form.get("password") ?? "");
  if (!isRole(role) || !validDemoPassword(role, password)) finish(form, "denied");
  await setSession(role);
  redirect("/" + localeOf(form));
}

export async function logout(form: FormData) {
  (await cookies()).delete("pdv-session");
  redirect("/" + localeOf(form));
}

export async function saveWeek(form: FormData) {
  if (await currentRole() !== "leadership") finish(form, "denied");
  const id = integer(form.get("week"), 1, 2147483647);
  const name = string(form, "name");
  const min = integer(form.get("min"), 7, 18);
  const max = integer(form.get("max"), min ?? 7, 18);
  const openEnded = min === 18 && string(form,"max") === "";
  const capacity = integer(form.get("capacity"), 1, 250);
  const fee = moneyCents(string(form, "fee"));
  const earlyRaw = string(form,"earlyPrice"), earlyDeadline = string(form,"earlyDeadline");
  const earlyPrice = earlyRaw ? moneyCents(earlyRaw) : null;
  if ((earlyRaw || earlyDeadline) && (earlyPrice === null || fee === null || earlyPrice >= fee || !dateParts(earlyDeadline))) finish(form,"invalid");
  const awardLimit = integer(form.get("awardLimit"), 0, 250);
  const start = string(form,"start");
  const end = string(form,"end");
  if ((form.has("week") && !id) || ((!id || start || end) && (!dateParts(start) || !dateParts(end) || end < start)) || !name || name.length > 80 || min === null || (max === null && !openEnded) || capacity === null || fee === null || awardLimit === null) finish(form, "invalid");

  const db = await getDatabase();
  if (!id) {
    const { rows } = await db.query<{ id:number }>(
      "INSERT INTO camp_week(name,minimum_age,maximum_age,capacity,fee_cents,award_limit,starts_on,ends_on,early_bird_cents,early_bird_ends_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
      [name,min,max,capacity,fee,awardLimit,start,end,earlyPrice,earlyDeadline || null],
    );
    form.set("week",String(rows[0].id));
    finish(form,"saved");
  }
  const updated = await db.transaction(async tx => {
    if (!(await lockWeek(tx,id)) || await confirmedCount(tx,id) > capacity) return false;
    if (await allocatedCount(tx,id) > awardLimit) return false;
    if (start && end) {
      const { rows } = await tx.query<{dorm_id:number}>(
        "SELECT dorm_id FROM weekly_dorm WHERE week_id=$1 AND in_service ORDER BY dorm_id",[id],
      );
      const rooms = (await lockFacilityRooms(tx,rows.map(row => row.dorm_id))).filter(room => room.active).map(room => room.id);
      if (await roomConflict(tx,rooms,start,endOfCampBlock(end),0,null,false)) return "facilityConflict" as const;
    }
    await tx.query("UPDATE camp_week SET name=$2, minimum_age=$3, maximum_age=$4, capacity=$5, fee_cents=$6, award_limit=$7, starts_on=$8, ends_on=$9, early_bird_cents=$10, early_bird_ends_on=$11 WHERE id=$1", [id,name,min,max,capacity,fee,awardLimit,start || null,end || null,earlyPrice,earlyDeadline || null]);
    return true;
  });
  finish(form, updated === "facilityConflict" ? updated : updated ? "saved" : "invalid");
}

export async function saveDorm(form: FormData) {
  if (await currentRole() !== "leadership") finish(form, "denied");
  const week = integer(form.get("week"), 1, 2147483647);
  const dorm = integer(form.get("dorm"), 1, 2147483647);
  const override = string(form, "usable");
  const usable = override ? integer(override, 0, 1000) : null;
  const guests = integer(form.get("guests"), 0, 1000);
  const min = integer(form.get("min"), 7, 18);
  const max = integer(form.get("max"), min ?? 7, 18);
  const openEnded = min === 18 && string(form,"max") === "";
  const group = string(form, "group");
  const assignments = form.getAll("staff").map(value => {
    const [role,id,...rest] = typeof value === "string" ? value.split(":") : [];
    const staffId = integer(id ?? null,1,2147483647);
    return !rest.length && staffId && (role === "guide" || role === "equipante") ? {id:staffId,role} : null;
  });
  const staff = assignments.flatMap(assignment => assignment ? [assignment] : []);
  if (!week || !dorm || (override && usable === null) || guests === null || min === null || (max === null && !openEnded) ||
      (group !== "female" && group !== "male") || staff.length !== assignments.length || new Set(staff.map(item => item.id)).size !== staff.length) finish(form, "invalid");

  const db = await getDatabase();
  const saved = await db.transaction(async tx => {
    const campWeek = await lockWeek(tx,week);
    if (!campWeek) return false;
    const { rows } = await tx.query<{ physical_beds:number; default_beds:number; active:boolean }>(
      "SELECT physical_beds,COALESCE(default_usable_beds,physical_beds) AS default_beds,active FROM dorm WHERE id=$1 AND room_kind='camper' FOR UPDATE", [dorm],
    );
    if (!rows.length || (usable !== null && usable > rows[0].physical_beds) || guests > (usable ?? rows[0].default_beds)) return false;
    if (rows[0].active && form.has("active")) {
      const dates = (await tx.query<{start:string|null;end:string|null}>(
        "SELECT starts_on::text AS start,ends_on::text AS end FROM camp_week WHERE id=$1",[week],
      )).rows[0];
      if (dates.start && dates.end && await roomConflict(tx,[dorm],dates.start,endOfCampBlock(dates.end),0,null,false)) return "facilityConflict" as const;
    }
    const ids = staff.map(item => item.id);
    const { rows: team } = await tx.query<{id:number;skills:string[];adult:boolean;active:boolean;previous_role:string|null}>(
      `SELECT s.id,s.adult,s.active,COALESCE(s.skills,ARRAY_REMOVE(ARRAY[s.team_role],NULL)) AS skills,
       (SELECT COALESCE(x.assignment_role,s.team_role) FROM weekly_dorm_staff x WHERE x.week_id=$2 AND x.dorm_id=$3 AND x.staff_id=s.id) AS previous_role
       FROM staff_member s WHERE s.id=ANY($1::integer[]) ORDER BY s.id FOR UPDATE`, [ids,week,dorm],
    );
    if (team.length !== staff.length || staff.some(item => {
      const member = team.find(person => person.id === item.id)!;
      return (item.role === "guide" && !member.adult) ||
        (item.role !== member.previous_role && (!member.active || !member.skills.includes(item.role)));
    })) return false;
    if ((await tx.query("SELECT 1 FROM weekly_dorm_staff WHERE week_id=$1 AND dorm_id<>$2 AND staff_id=ANY($3::integer[]) LIMIT 1",[week,dorm,ids])).rows.length) return false;
    const guides = staff.filter(item => item.role === "guide").length;
    const counselors = staff.filter(item => item.role === "equipante").length;
    if (counselors > 3) return false;
    const { rows: occupied } = await tx.query<{count:number; group_conflict:boolean}>(
      `SELECT count(*)::integer AS count,COALESCE(bool_or(r.gender_group<>$3),false) AS group_conflict
       FROM camper_placement p JOIN registration r ON r.id=p.registration_id
       WHERE p.week_id=$1 AND p.dorm_id=$2`,[week,dorm,group],
    );
    if (occupied[0].group_conflict) return "groupConflict" as const;
    // Existing placements must remain within capacity when their team changes.
    if (occupied[0].count && (!form.has("active") || !hasCabinTeam(guides,counselors,campWeek.minimum_age < 18) ||
        occupied[0].count > camperBedCapacity(usable ?? rows[0].default_beds,guests,guides))) return false;
    await tx.query(
      `INSERT INTO weekly_dorm(week_id,dorm_id,minimum_age,maximum_age,usable_beds,guest_beds,gender_group,in_service)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(week_id,dorm_id) DO UPDATE SET minimum_age=excluded.minimum_age,maximum_age=excluded.maximum_age,
         usable_beds=excluded.usable_beds,guest_beds=excluded.guest_beds,gender_group=excluded.gender_group,in_service=excluded.in_service`,
      [week,dorm,min,max,usable,guests,group,form.has("active")],
    );
    await tx.query("DELETE FROM weekly_dorm_staff WHERE week_id=$1 AND dorm_id=$2", [week,dorm]);
    await tx.query("INSERT INTO weekly_dorm_staff(week_id,dorm_id,staff_id,assignment_role) SELECT $1,$2,staff_id,role FROM unnest($3::integer[],$4::text[]) AS team(staff_id,role)", [week,dorm,ids,staff.map(item => item.role)]);
    return true;
  });
  finish(form, saved === "groupConflict" || saved === "facilityConflict" ? saved : saved ? "saved" : "invalid");
}

function housingResult(form: FormData, status: "saved"|"invalid"|"unavailable"|"facilityConflict"): never {
  redirect("/" + localeOf(form) + "/housing?status=" + status);
}

export async function saveRoom(form: FormData) {
  if (await currentRole() !== "leadership") finish(form,"denied");
  const id = integer(form.get("dorm"),1,2147483647);
  const building = string(form,"building");
  const name = string(form,"name");
  const kind = string(form,"kind");
  const physical = integer(form.get("physical"),1,1000);
  const usable = integer(form.get("usable"),0,physical ?? 0);
  if ((form.has("dorm") && !id) || !building || building.length > 80 || !name || name.length > 80 ||
      (kind !== "camper" && kind !== "hotel") || physical === null || usable === null) housingResult(form,"invalid");
  let saved: boolean | "facilityConflict";
  try {
    const db = await getDatabase();
    saved = await db.transaction(async tx => {
      if (id) {
        const { rows } = await tx.query<{active:boolean}>("SELECT active FROM dorm WHERE id=$1 AND room_kind=$2 FOR UPDATE",[id,kind]);
        if (!rows.length) return false;
        const conflicts = await tx.query(
          `SELECT 1 FROM weekly_dorm wd WHERE wd.dorm_id=$1 AND (wd.usable_beds>$2 OR (wd.usable_beds IS NULL AND
            (wd.guest_beds>$3 OR EXISTS (SELECT 1 FROM camper_placement p WHERE p.week_id=wd.week_id AND p.dorm_id=wd.dorm_id) AND
              wd.guest_beds
              + (SELECT count(*) FROM camper_placement p WHERE p.week_id=wd.week_id AND p.dorm_id=wd.dorm_id)
              + (SELECT count(*) FROM weekly_dorm_staff x WHERE x.week_id=wd.week_id AND x.dorm_id=wd.dorm_id) > $3))) LIMIT 1`,
          [id,physical,usable],
        );
        if (conflicts.rows.length) return false;
        if (!rows[0].active && form.has("active") && kind === "camper") {
          const weeks = await tx.query<{start:string;end:string}>(
            `SELECT w.starts_on::text AS start,w.ends_on::text AS end FROM weekly_dorm wd JOIN camp_week w ON w.id=wd.week_id
             WHERE wd.dorm_id=$1 AND wd.in_service AND w.starts_on IS NOT NULL AND w.ends_on IS NOT NULL`,[id],
          );
          for (const week of weeks.rows) {
            if (await roomConflict(tx,[id],week.start,endOfCampBlock(week.end),0,null,false)) return "facilityConflict" as const;
          }
        }
      }
      const { rows } = await tx.query<{ id:number }>(
        "INSERT INTO building(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id",[building],
      );
      if (id) await tx.query(
        "UPDATE dorm SET building_id=$1,name=$2,physical_beds=$3,default_usable_beds=$4,active=$5 WHERE id=$6",
        [rows[0].id,name,physical,usable,form.has("active"),id],
      );
      else await tx.query(
        "INSERT INTO dorm(building_id,name,physical_beds,default_usable_beds,active,room_kind) VALUES($1,$2,$3,$4,$5,$6)",
        [rows[0].id,name,physical,usable,form.has("active"),kind],
      );
      return true;
    });
  } catch (error) {
    housingResult(form,(error as {code?:string}).code === "23505" ? "invalid" : "unavailable");
  }
  housingResult(form,saved === "facilityConflict" ? saved : saved ? "saved" : "invalid");
}

export async function saveReadiness(form: FormData) {
  if (await currentRole() !== "leadership") finish(form,"denied");
  const id = integer(form.get("dorm"),1,2147483647);
  const state = string(form,"readiness");
  if (!id || (state !== "ready" && state !== "cleaning")) housingResult(form,"invalid");
  const db = await getDatabase();
  const result = await db.query(
    "UPDATE dorm SET needs_cleaning=$2,readiness_updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id",
    [id,state === "cleaning"],
  );
  housingResult(form,result.rows.length ? "saved" : "invalid");
}
