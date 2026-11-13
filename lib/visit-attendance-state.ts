export type AttendanceOperation = "arrive"|"depart"|"undoArrival"|"undoDeparture";
export type AttendancePerson = {
  id:string; first_name:string; last_name:string; visitor_role:"student"|"adult"|"leader";
  arrived_at:string|null; departed_at:string|null; withdrawn_at:string|null; presence_revision:number; room:string|null;
};
export type AttendanceResult = {status:"saved"|"invalid"|"closed"|"stale"|"wrongState"|"unavailable"; count?:number};

export function attendanceState(person:Pick<AttendancePerson,"arrived_at"|"departed_at"|"withdrawn_at">) {
  return person.withdrawn_at ? "withdrawn" : person.departed_at ? "departed" : person.arrived_at ? "present" : "expected";
}

export function canRecordAttendance(person:Pick<AttendancePerson,"arrived_at"|"departed_at"|"withdrawn_at">,operation:AttendanceOperation) {
  const state = attendanceState(person);
  return state === (operation === "arrive" ? "expected" : operation === "undoDeparture" ? "departed" : "present");
}
