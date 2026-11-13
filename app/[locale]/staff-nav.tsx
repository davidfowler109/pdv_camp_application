import Link from "next/link";
import { currentRole } from "../../lib/session";
import type { Locale } from "../../lib/copy";

export async function StaffNav({ locale, active, week }: { locale: Locale; week?: number; active: "church-visits" | "facilities" | "events" | "staff" | "departure" | "check-in" | "health" | "housing" | "week" | "registrations" | "scholarships" }) {
  const role = await currentRole();
  const labels = locale === "es"
    ? { navigation:"Navegación del personal", registrations:"Inscripciones", scholarships:"Becas", week:"Preparar la semana", housing:"Alojamiento", staff:"Personal", facilities:"Calendario", events:"Eventos especiales", "check-in":"Llegada", departure:"Salida", health:role === "kitchen" ? "Alergias alimentarias" : "Salud de campistas" }
    : { navigation:"Staff navigation", registrations:"Registrations", scholarships:"Scholarships", week:"Week setup", housing:"Housing", staff:"Staff", facilities:"Facilities calendar", events:"Special events", "check-in":"Check-in", departure:"Departure", health:role === "kitchen" ? "Food allergies" : "Camper health" };
  const visitLabel = locale === "es" ? "Visitas de iglesias" : "Church visits";
  const sections = [
    ["registrations","/intake"], ["scholarships","/intake/scholarships"], ["check-in","/check-in"], ["departure","/departure"], ["health","/health"], ["week",""], ["housing","/housing"], ["staff","/staff"], ["facilities","/facilities"], ["events","/events"],
    ["church-visits","/church-visits"],
  ] as const;
  return <nav className="staff-nav" aria-label={labels.navigation}>
    {sections.filter(([key]) => key === "health" ? role === "leadership" || role === "health" || role === "kitchen" : key === "staff" || key === "events" || key === "church-visits" ? role === "leadership" : role === "leadership" || role === "registration").map(([key,route]) => <Link key={key} href={"/"+locale+route+(week && key !== "registrations" && key !== "events" && key !== "church-visits" && key !== "facilities" ? "?week="+week : "")}
      aria-current={key === active ? "page" : undefined}>{key === "church-visits" ? visitLabel : labels[key]}</Link>)}
  </nav>;
}

