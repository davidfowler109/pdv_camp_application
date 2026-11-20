// Display stages are shared by the roster, review and applicant pages.
export const staffApplicationStatuses=['draft','submitted','review','information','approved','preparationReceived','ready','declined','withdrawn'] as const;
export function staffApplicationStatus(app:{status:string;ready:boolean;data:Record<string,string>}){
  if(app.ready)return 'ready';
  if(app.status==='approved'&&app.data.preparationSubmittedAt)return 'preparationReceived';
  return app.status;
}
