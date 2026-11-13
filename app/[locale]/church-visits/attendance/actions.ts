"use server";

import { redirect } from "next/navigation";
import { currentRole } from "../../../../lib/session";
import { getDatabase } from "../../../../lib/database";
import { saveVisitAttendance } from "../../../../lib/visit-attendance";
import type { AttendanceResult } from "../../../../lib/visit-attendance-state";

export async function submitAttendance(_:AttendanceResult|null,form:FormData):Promise<AttendanceResult> {
  const locale = form.get("locale") === "es" ? "es" : "en";
  if (await currentRole() !== "leadership") redirect("/"+locale);
  let result:AttendanceResult;
  try {
    const db = await getDatabase();
    result = await db.transaction(tx => saveVisitAttendance(tx,form));
  } catch {
    return {status:"unavailable"};
  }
  if (result.status !== "saved") return result;
  const query = new URLSearchParams({visit:String(form.get("visit")),saved:String(result.count ?? 0)});
  const state = String(form.get("filter") ?? "");
  if (["all","expected","present","departed","withdrawn"].includes(state)) query.set("state",state);
  const search = String(form.get("q") ?? "").slice(0,100);
  if (search) query.set("q",search);
  redirect("/"+locale+"/church-visits/attendance?"+query);
}
