"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "../../../lib/database";
import { currentRole } from "../../../lib/session";
import { panamaDate } from "../../../lib/registration";
import { moneyCents } from "../../../lib/review";
import { eventNoticeVersion,eventUuid,parseEventAttendee,readEventField,type EventSource } from "../../../lib/event-registration";
import { releaseEventHousing } from "../../../lib/event-housing";

export type AttendeeResult = "received"|"invalid"|"closed"|"unavailable"|null;

export async function registerAttendee(source:EventSource,_:AttendeeResult,form:FormData):Promise<AttendeeResult> {
  if (!["online","desk","paper"].includes(source) || process.env.PDV_LOCAL_DEMO !== "1") return "closed";
  if (source !== "online" && await currentRole() !== "leadership") return "closed";
  const attendee = parseEventAttendee(form,source,panamaDate());
  if (!attendee) return "invalid";
  try {
    const db = await getDatabase();
    return await db.transaction(async tx => {
      const { rows } = await tx.query<{day_attendance:boolean;overnight_attendance:boolean;cancelled_at:Date|null}>(
        "SELECT day_attendance,overnight_attendance,cancelled_at FROM special_event WHERE id=$1 FOR UPDATE",[attendee.event],
      );
      const event = rows[0];
      if (!event || event.cancelled_at || (attendee.attendance === "day" ? !event.day_attendance : !event.overnight_attendance)) return "closed";
      const result = await tx.query(
        `INSERT INTO event_attendee(id,event_id,first_name,last_name,contact,attendance,rooming,church,rooming_code,food,accessibility,
          source,authorization_date,notice_version,authorization_source,recorder,food_answer,diet_answer,diet)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT(id) DO UPDATE SET id=excluded.id
         WHERE event_attendee.event_id=excluded.event_id AND event_attendee.source=excluded.source RETURNING id`,
        [attendee.id,attendee.event,attendee.first,attendee.last,attendee.contact,attendee.attendance,attendee.rooming,attendee.church,
          attendee.code,attendee.food,attendee.accessibility,source,attendee.date,eventNoticeVersion,attendee.authorizationSource,attendee.recorder,
          attendee.foodAnswer,attendee.dietAnswer,attendee.diet],
      );
      return result.rows.length ? "received" : "invalid";
    });
  } catch {
    return "unavailable";
  }
}

export async function reviewAttendee(form:FormData) {
  const read = (key:string) => readEventField(form,key);
  const locale = read("locale")==="en" ? "en" : "es";
  if (await currentRole()!=="leadership") redirect("/"+locale);
  const id=read("attendee"), eventId=read("event"), operation=read("operation");
  if (!eventUuid.test(eventId) || !eventUuid.test(id)) redirect("/"+locale+"/events");
  let status="invalid";
  try {
    const db=await getDatabase();
    status=await db.transaction(async tx => {
      const event=(await tx.query<{capacity:number;day_attendance:boolean;overnight_attendance:boolean;cancelled_at:Date|null}>(
        "SELECT capacity,day_attendance,overnight_attendance,cancelled_at FROM special_event WHERE id=$1 FOR UPDATE",[eventId],
      )).rows[0];
      if (!event || event.cancelled_at) return "closed";
      const attendee=(await tx.query<{place_status:string;attendance:"day"|"overnight"}>("SELECT place_status,attendance FROM event_attendee WHERE id=$1 AND event_id=$2",[id,eventId])).rows[0];
      if (!attendee) return "invalid";
      if (operation==="confirm") {
        if (attendee.place_status==="confirmed") return "saved";
        if (attendee.attendance === "day" ? !event.day_attendance : !event.overnight_attendance) return "closed";
        const count=(await tx.query<{count:number}>("SELECT count(*)::integer AS count FROM event_attendee WHERE event_id=$1 AND place_status='confirmed'",[eventId])).rows[0].count;
        if (count>=event.capacity) return "full";
        await tx.query("UPDATE event_attendee SET place_status='confirmed' WHERE id=$1",[id]);
      } else if (operation==="release") {
        if (attendee.place_status==="released") return "saved";
        const actor=read("actor"),reason=read("reason");
        if(!actor||actor.length>160||!reason||reason.length>1000)return "invalid";
        await releaseEventHousing(tx,eventId,id,actor,reason);
        await tx.query("UPDATE event_attendee SET place_status='released' WHERE id=$1",[id]);
      } else if (operation==="payment") {
        const amount=moneyCents(read("amount")), reference=read("reference"), actor=read("actor");
        if (!amount || !reference || reference.length>150 || !actor || actor.length>100) return "invalid";
        const result=await tx.query(
          `INSERT INTO event_attendee_payment(attendee_id,reference,amount_cents,recorded_by) VALUES($1,$2,$3,$4)
           ON CONFLICT(attendee_id,reference) DO UPDATE SET reference=excluded.reference
           WHERE event_attendee_payment.amount_cents=excluded.amount_cents RETURNING attendee_id`,[id,reference,amount,actor],
        );
        if (!result.rows.length) return "invalid";
      } else return "invalid";
      return "saved";
    });
  } catch {
    status="unavailable";
  }
  const query=new URLSearchParams({event:eventId,attendee:id,status});
  const search=read("q").slice(0,100), page=read("page");
  if(search) query.set("q",search);
  if(/^\d{1,6}$/.test(page)) query.set("page",page);
  redirect("/"+locale+"/events/attendees?"+query);
}
