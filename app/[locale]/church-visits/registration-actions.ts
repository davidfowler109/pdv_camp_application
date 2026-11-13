"use server";

import { getDatabase } from "../../../lib/database";
import { currentRole } from "../../../lib/session";
import { panamaDate } from "../../../lib/registration";
import { changeVisitorStatus, writeVisitor, type VisitorMode, type VisitorResult } from "../../../lib/church-visitors";

export async function registerVisitor(mode:VisitorMode,_:VisitorResult,form:FormData):Promise<VisitorResult> {
  if (process.env.PDV_LOCAL_DEMO !== "1" || !["online","desk","edit"].includes(mode)) return "closed";
  if (mode !== "online" && await currentRole() !== "leadership") return "closed";
  try {
    const db = await getDatabase();
    return await db.transaction(tx => writeVisitor(tx,form,mode,panamaDate()));
  } catch {
    return "unavailable";
  }
}

export async function updateVisitorStatus(_:VisitorResult,form:FormData):Promise<VisitorResult> {
  if (await currentRole() !== "leadership") return "closed";
  try {
    const db = await getDatabase();
    return await db.transaction(tx => changeVisitorStatus(tx,form));
  } catch {
    return "unavailable";
  }
}
