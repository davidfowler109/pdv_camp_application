"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "../../../lib/database";
import { lockFacilityRooms, roomConflict, validFacilityTime } from "../../../lib/facilities";
import { integer } from "../../../lib/housing";
import { moneyCents } from "../../../lib/review";
import { currentRole } from "../../../lib/session";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function read(form:FormData,key:string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

type SaveStatus = "saved"|"invalid"|"unavailable"|"conflict"|"dateError"|"attendanceError"|"roomsRequireOvernight"|"roomUnavailable"|"eventNameError"|"turnoverError"|"capacityError"|"feeError"|"staleEvent"|"attendeeCapacity"|"attendeeAttendance";
export type EventSaveError = {status:Exclude<SaveStatus,"saved">;detail?:string};

async function writeEvent(form:FormData) {
  const locale = read(form,"locale") === "en" ? "en" : "es";
  if (await currentRole() !== "leadership") redirect("/"+locale);
  const id = read(form,"id"), operation = read(form,"operation");
  const name = read(form,"name"), start = read(form,"start"), end = read(form,"end");
  const turnover = integer(form.get("turnover"),0,10080), capacity = integer(form.get("capacity"),1,1000);
  const rawFee = read(form,"fee"), fee = rawFee ? moneyCents(rawFee.replace(/^(?:US\$|\$)\s*/i,"")) : null;
  const requested = [...new Set(form.getAll("room").map(value => integer(value,1,2147483647)))];
  const rooms = requested.filter((item):item is number => item !== null);
  const day = form.has("day"), overnight = form.has("overnight");
  let status:SaveStatus = "staleEvent";
  let conflictMessage = "";
  if (uuid.test(id)) {
    try {
      const db = await getDatabase();
      status = await db.transaction(async tx => {
        const existing = (await tx.query<{cancelled_at:Date|null}>("SELECT cancelled_at FROM special_event WHERE id=$1 FOR UPDATE",[id])).rows[0];
        if (operation === "cancel") {
          if (!existing) return "invalid";
          await tx.query("UPDATE special_event SET cancelled_at=COALESCE(cancelled_at,CURRENT_TIMESTAMP) WHERE id=$1",[id]);
          return "saved";
        }
        if ((operation !== "create" && operation !== "edit") || existing?.cancelled_at) return "staleEvent";
        if (!name || name.length > 120) return "eventNameError";
        if (turnover === null) return "turnoverError";
        if (capacity === null) return "capacityError";
        if (rawFee && fee === null) return "feeError";
        if (rooms.length !== requested.length) return "roomUnavailable";
        if (!validFacilityTime(start) || !validFacilityTime(end) || start >= end) return "dateError";
        if (!day && !overnight) return "attendanceError";
        if (!overnight && rooms.length) return "roomsRequireOvernight";
        if (operation === "edit" && !existing) return "staleEvent";
        if (operation === "create" && existing) return "saved";
        if (existing) {
          const attendees = (await tx.query<{confirmed:number;day:number;overnight:number}>(
            `SELECT count(*) FILTER (WHERE place_status='confirmed')::integer AS confirmed,
              count(*) FILTER (WHERE attendance='day' AND place_status<>'released')::integer AS day,
              count(*) FILTER (WHERE attendance='overnight' AND place_status<>'released')::integer AS overnight
             FROM event_attendee WHERE event_id=$1`,[id],
          )).rows[0];
          if (capacity < attendees.confirmed) return "attendeeCapacity";
          if ((!day && attendees.day) || (!overnight && attendees.overnight)) return "attendeeAttendance";
        }
        const previous = (await tx.query<{dorm_id:number}>("SELECT dorm_id FROM event_room_reservation WHERE event_id=$1",[id])).rows.map(room => room.dorm_id);
        const locked = await lockFacilityRooms(tx,[...new Set([...rooms,...previous])]);
        if (rooms.some(room => !locked.some(item => item.id === room && item.active))) return "roomUnavailable";
        const conflict = await roomConflict(tx,rooms,start,end,turnover,id,true);
        if (conflict) {
          conflictMessage = conflict.room+" · "+conflict.booking;
          return "conflict";
        }
        await tx.query(
          `INSERT INTO special_event(id,name,starts_at,ends_at,turnover_minutes,capacity,fee_cents,day_attendance,overnight_attendance,supervisor_required)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
             turnover_minutes=excluded.turnover_minutes,capacity=excluded.capacity,fee_cents=excluded.fee_cents,
             day_attendance=excluded.day_attendance,overnight_attendance=excluded.overnight_attendance,supervisor_required=excluded.supervisor_required`,
          [id,name,start,end,turnover,capacity,fee,day,overnight,overnight && form.has("supervisor")],
        );
        await tx.query("DELETE FROM event_room_reservation WHERE event_id=$1",[id]);
        await tx.query("INSERT INTO event_room_reservation(event_id,dorm_id) SELECT $1,unnest($2::integer[])",[id,rooms]);
        return "saved";
      });
    } catch {
      status = "unavailable";
    }
  }
  return {status,conflictMessage,id,locale};
}

export async function submitEvent(_:EventSaveError|null,form:FormData):Promise<EventSaveError> {
  const {status,conflictMessage,id,locale} = await writeEvent(form);
  if (status !== "saved") return {status,detail:conflictMessage || undefined};
  redirect("/"+locale+"/events?"+new URLSearchParams({status,event:id}));
}

export async function saveEvent(form:FormData) {
  const {status,id,locale} = await writeEvent(form);
  const query = new URLSearchParams({status});
  if (uuid.test(id)) query.set("event",id);
  redirect("/"+locale+"/events?"+query);
}
