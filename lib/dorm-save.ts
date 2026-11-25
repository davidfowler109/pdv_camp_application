export type DormSaveStatus='saved'|'invalid'|'denied'|'unavailable'|'availabilityRequired'|'facilityConflict'|'groupConflict'|'bedCapacity'|'staffInvalid'|'staffConflict'|'occupiedTeam';
export type DormSaveResult={status:DormSaveStatus;problems:string[]};
