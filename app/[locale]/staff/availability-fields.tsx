import {staffAvailabilityCopy} from '../../../lib/staff-availability-copy';
export function AvailabilityOverrideFields({locale,required=true}:{locale:'en'|'es';required?:boolean}){
 const t=staffAvailabilityCopy[locale];
 return <><p>{t.overrideHelp}</p><label className="check"><input type="checkbox" name="overrideConfirmed" required={required}/>{t.confirmed}</label><label>{t.overrideReason} *<textarea name="overrideReason" required={required} maxLength={2000}/></label></>;
}
