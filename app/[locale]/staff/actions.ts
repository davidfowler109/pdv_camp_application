"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "../../../lib/database";
import { currentRole } from "../../../lib/session";
import { assignWeeklyStaff,saveStaffAvailability } from "../../../lib/staff-availability";
import { integer } from "../../../lib/housing";
import { lockWeek } from "../../../lib/review";
import { staffSkills, weeklyStaffRoles } from "../../../lib/staff-copy";

function text(form:FormData,key:string) {
  const value=form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveStaff(form:FormData) {
  const locale = text(form,"locale") === "en" ? "en" : "es";
  if (await currentRole() !== "leadership") redirect("/"+locale);
  const id = integer(form.get("staff"),1,2147483647), week = integer(form.get("week"),1,2147483647);
  const operation = text(form,"operation");
  let status = "invalid";
  try {
    const db = await getDatabase();
    if (operation === "member") {
      const name = text(form,"name"), notes = text(form,"notes"), adult = form.has("adult"), active = form.has("active");
      const skills = [...new Set(form.getAll("skill"))];
      if ((!form.has("staff") || id) && name && name.length <= 100 && notes.length <= 500 && skills.length &&
          skills.every(skill => staffSkills.some(valid => valid === skill)) && (adult || !skills.includes("guide"))) {
        const result = id ? await db.transaction(async tx => {
          await tx.query("SELECT id FROM staff_member WHERE id=$1 FOR UPDATE",[id]);
          if (!adult && (await tx.query(
            "SELECT 1 FROM weekly_dorm_staff x JOIN staff_member s ON s.id=x.staff_id WHERE s.id=$1 AND COALESCE(x.assignment_role,s.team_role)='guide' LIMIT 1",[id],
          )).rows.length) return { rows:[] };
          return tx.query("UPDATE staff_member SET name=$2,adult=$3,active=$4,skills=$5::text[],qualifications=$6 WHERE id=$1 RETURNING id",
            [id,name,adult,active,skills,notes || null]);
        }) : await db.query(
          "INSERT INTO staff_member(name,adult,active,skills,qualifications) VALUES($1,$2,$3,$4::text[],$5) RETURNING id",
          [name,adult,active,skills,notes || null],
        );
        if (result.rows.length) status = "saved";
      }
    } else if(id&&week&&operation==='availability'){
      const values=form.getAll('availableWeek'),weeks=values.map(value=>integer(value,1,2147483647));
      const revision=integer(form.get('availabilityRevision'),0,2147483647);
      if(revision!==null&&weeks.every((value):value is number=>value!==null))status=await db.transaction(tx=>saveStaffAvailability(tx,{staff:id,week,weeks,revision,application:text(form,'availabilityApplication'),reason:text(form,'availabilityReason')}));
    } else if (id && week && (operation === "assign" || operation === "remove")) {
      const role = text(form,"role");
      if (weeklyStaffRoles.some(valid => valid === role)) status = await db.transaction(async tx => {
        if (!(await lockWeek(tx,week))) return "invalid";
        if (operation === "remove") {
          await tx.query("DELETE FROM weekly_staff_assignment WHERE week_id=$1 AND staff_id=$2 AND assignment_role=$3",[week,id,role]);
          return "saved";
        }
        return assignWeeklyStaff(tx,week,id,role,{confirmed:form.has('overrideConfirmed'),reason:text(form,'overrideReason')});

      });
    }
  } catch {
    status = "unavailable";
  }
  redirect("/"+locale+"/staff?status="+status+(week ? "&week="+week : ""));
}
