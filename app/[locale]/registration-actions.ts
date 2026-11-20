"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDatabase } from "../../lib/database";
import { panamaDate, parseRegistration, noticeVersion, type IntakeChannel } from "../../lib/registration";
import { currentRole } from "../../lib/session";
import { getCampTransport,activeTransport,transportVersion } from "../../lib/camp-transport";
import { integer } from "../../lib/housing";

export type RegistrationStatus = "saved" | "invalid" | "unavailable" | "transportChanged" | null;

export async function submitRegistration(channel: IntakeChannel, _: RegistrationStatus, form: FormData): Promise<RegistrationStatus> {
  if (process.env.PDV_LOCAL_DEMO !== "1" || (channel !== "online" && channel !== "paper" && channel !== "desk")) return "unavailable";
  const role = await currentRole();
  if (channel !== "online" && role !== "leadership" && role !== "registration") return "unavailable";
  const today = panamaDate();
  try {
    const db = await getDatabase();
    const status=await db.transaction(async tx=>{
    const week=integer(form.get("week"),1,2147483647);
    if(week===null)return "invalid";
    const locked=await tx.query("SELECT id FROM camp_week WHERE id=$1 FOR UPDATE",[week]);
    if(!locked.rows.length)return "invalid";
    const id=String(form.get("id")??"");
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))return "invalid";
    const existing=(await tx.query<{week_id:number;intake_channel:string}>("SELECT week_id,intake_channel FROM registration WHERE id=$1",[id])).rows[0];
    if(existing)return existing.week_id===week&&existing.intake_channel===channel?"saved":"invalid";
    const stops=activeTransport((await getCampTransport(tx,week)).stops);
    for(const leg of ["arrival","departure"] as const)if(form.get(leg)==="bus"){
      const stop=stops.find(stop=>stop.id===form.get(leg+"Stop")&&stop.leg===leg);
      if(!stop||transportVersion(stop)!==form.get(leg+"StopVersion"))return "transportChanged";
    }
    const item=parseRegistration(form,channel,today,stops);
    if(!item)return "invalid";
    const inserted = await tx.query(
      `INSERT INTO registration(id,week_id,first_name,last_name,date_of_birth,gender_group,intake_channel,
          participation,notice_version,authorized_on,signer_role,signer_name,details,fee_at_registration_cents,photo_permission)
       SELECT $1,w.id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,
         CASE WHEN w.early_bird_ends_on >= $14::date THEN w.early_bird_cents ELSE w.fee_cents END,$15
       FROM camp_week w WHERE w.id=$2
       ON CONFLICT(id) DO UPDATE SET id=excluded.id WHERE registration.intake_channel=excluded.intake_channel AND registration.week_id=excluded.week_id RETURNING id`,
      [item.id,item.week,item.first,item.last,item.birth,item.group,item.channel,item.participation,noticeVersion,
        item.authorizationDate,item.signerRole,item.signer,JSON.stringify(item.details),today,item.photoPermission],
    );
    if (!inserted.rows.length) return "invalid";
    return "saved";
    });
    if(status!=="saved")return status;
    revalidatePath("/[locale]/intake", "page");
  } catch {
    return "unavailable";
  }
  if (channel === "online") redirect("/"+(form.get("locale") === "en" ? "en" : "es")+"/register?receipt="+String(form.get("id")));
  return "saved";
}
