export const signedFormMaxBytes = 10 * 1024 * 1024;
export const signedFormMaxFiles = 12;
export const signedFormId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export const signedFormTypes = {
  "image/jpeg": {extension:"jpg", signature:[0xff,0xd8,0xff]},
  "image/png": {extension:"png", signature:[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]},
  "application/pdf": {extension:"pdf", signature:[0x25,0x50,0x44,0x46,0x2d]},
} as const;

export function isSignedFormType(value:string): value is keyof typeof signedFormTypes {
  return Object.hasOwn(signedFormTypes,value);
}
