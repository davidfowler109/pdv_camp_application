import { getDatabase } from "../../../lib/database";
import { facilitiesCopy } from "../../../lib/facilities-copy";
import { copy, type Locale } from "../../../lib/copy";
import { housingCopy } from "../../../lib/housing-copy";
import { changeLanguage, logout, saveReadiness, saveRoom } from "../actions";
import { StaffNav } from "../staff-nav";
import { requireReview } from "../intake/review-frame";

type Room = {
  id:number; building:string; name:string; physical_beds:number; default_beds:number;
  room_kind:"camper"|"hotel"; active:boolean; needs_cleaning:boolean;
};

function RoomForm({ locale, room }: { locale:Locale; room?:Room }) {
  const t = copy[locale], h = housingCopy[locale];
  return <form action={saveRoom}>
    <input name="locale" type="hidden" value={locale} />
    {room && <><input name="dorm" type="hidden" value={room.id} /><input name="kind" type="hidden" value={room.room_kind} /></>}
    <div className="grid">
      {!room && <label>{h.roomKind}<select name="kind"><option value="camper">{h.camper}</option><option value="hotel">{h.hotel}</option></select></label>}
      <label>{t.building}<input name="building" maxLength={80} defaultValue={room?.building} required /></label>
      <label>{h.room}<input name="name" maxLength={80} defaultValue={room?.name} required /></label>
      <label>{t.beds}<input name="physical" type="number" min={1} max={1000} defaultValue={room?.physical_beds ?? 2} required /></label>
      <label>{h.defaultBeds}<input name="usable" type="number" min={0} max={1000} defaultValue={room?.default_beds ?? 2} required /></label>
    </div>
    <label className="check"><input name="active" type="checkbox" defaultChecked={room?.active ?? true} />{t.active}</label>
    <button>{t.saveDorm}</button>
  </form>;
}

export default async function Page({ params, searchParams }: {
  params:Promise<{locale:string}>; searchParams:Promise<{status?:string;week?:string}>;
}) {
  const { locale, role } = await requireReview((await params).locale);
  const { status, week } = await searchParams;
  const selectedWeek = week && /^\d+$/.test(week) ? Number(week) : undefined;
  const t = copy[locale], h = housingCopy[locale];
  const db = await getDatabase();
  const { rows } = await db.query<Room>(
    `SELECT d.id,d.name,b.name AS building,d.physical_beds,COALESCE(d.default_usable_beds,d.physical_beds) AS default_beds,
      d.room_kind,d.active,d.needs_cleaning FROM dorm d JOIN building b ON b.id=d.building_id ORDER BY b.name,d.name`,
  );
  const order = new Intl.Collator(locale,{numeric:true});
  rows.sort((a,b) => order.compare(a.building,b.building) || order.compare(a.name,b.name) || a.id-b.id);
  return <>
    <header><div><div className="brand"><img src="/palabra-de-vida.png" width={118} height={54} alt="Palabra de Vida Panamá" /><small>{t.pilot}</small></div>
      <div className="actions">
        <form action={changeLanguage}>
          <input name="locale" type="hidden" value={locale === "en" ? "es" : "en"} />
          <input name="section" type="hidden" value="housing" />
          {selectedWeek && <input name="week" type="hidden" value={selectedWeek} />}
          <button lang={locale === "en" ? "es" : "en"}>{t.switch}</button>
        </form>
        <form action={logout}><input type="hidden" name="locale" value={locale} /><button>{t.logout}</button></form>
      </div>
    </div></header>
    <main>
      <StaffNav locale={locale} active="housing" week={selectedWeek} />
      <h1>{h.housing}</h1><p>{h.inventoryHelp}</p><p className="muted">{h.turnoverHelp}</p>
      {status === "saved" && <p className="notice" role="status">{t.saved}</p>}
      {status === "facilityConflict" && <p className="notice" role="alert">{facilitiesCopy[locale].weekConflict}</p>}
      {status === "invalid" && <p className="notice" role="alert">{t.invalid}</p>}
      {status === "unavailable" && <p className="notice" role="alert">{t.unavailable}</p>}
      {role === "leadership" && <section className="card"><details><summary>{h.addRoom}</summary><RoomForm locale={locale} /></details></section>}
      {(["camper","hotel"] as const).map(kind => <section key={kind}>
        <h2>{kind === "camper" ? t.dorms : h.hotel}</h2>
        <div className="dorms">{rows.filter(room => room.room_kind === kind).map(room => <article className="card" key={room.id}>
          <h3>{room.name}</h3><p>{room.building} · {room.active ? t.active : t.closed}</p>
          <p>{t.beds}: {room.physical_beds} · {h.defaultBeds}: {room.default_beds}</p>
          <p><span className={room.needs_cleaning ? "badge warn" : "badge"}>{room.needs_cleaning ? h.cleaning : h.roomReady}</span></p>
          {role === "leadership" && <>
            <form action={saveReadiness}>
              <input name="locale" type="hidden" value={locale} /><input name="dorm" type="hidden" value={room.id} />
              <label>{h.readiness}<select name="readiness" defaultValue={room.needs_cleaning ? "cleaning" : "ready"}>
                <option value="ready">{h.roomReady}</option><option value="cleaning">{h.cleaning}</option>
              </select></label><button>{h.changeReadiness}</button>
            </form>
            <details><summary>{h.editRoom}</summary><RoomForm locale={locale} room={room} /></details>
          </>}
        </article>)}</div>
      </section>)}
    </main>
  </>;
}
