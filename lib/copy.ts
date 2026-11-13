export const copy = {
  es: {
    switch: "English", title: "Preparar la semana", subtitle: "Configura los dormitorios y sus equipos antes de que lleguen los campistas.",
    pilot: "Piloto · Datos ficticios", week: "Semana de campamento", capacity: "Cupo de campistas",
    label: "Nombre de la semana", min: "Edad mínima", max: "Edad máxima", saveWeek: "Guardar semana",
    dorms: "Dormitorios", add: "Agregar dormitorio", building: "Edificio", dorm: "Dormitorio",
    beds: "Camas físicas", usable: "Camas utilizables", guests: "Camas para huéspedes",
    group: "Grupo", female: "Femenino", male: "Masculino", active: "En servicio",
    guides: "Guías de Cabañas (adultos)", helpers: "Equipantes", saveDorm: "Guardar dormitorio",
    ready: "Disponible", closed: "Fuera de servicio", noBeds: "Sin camas disponibles",
    noTeam: "Se requieren al menos dos Guías de Cabañas adultos y de 1 a 3 Equipantes", noAdultTeam: "Se requieren al menos dos Guías de Cabañas adultos", open: "Camas para campistas",
    reader: "Vista de solo lectura", logout: "Cerrar sesión", access: "Acceso al piloto",
    login: "Iniciar sesión", password: "Contraseña de demostración", role: "Función",
    leadership: "Dirección del campamento", registration: "Inscripciones", guide: "Guía de Cabañas", health: "Personal de salud", kitchen: "Personal de cocina",
    invalid: "Revisa los valores y el equipo seleccionado.", denied: "Acceso no autorizado.",
    saved: "Cambios guardados.", unavailable: "La configuración del piloto no está disponible.",
  },
  en: {
    switch: "Español", title: "Set up camp week", subtitle: "Configure dorms and their teams before campers arrive.",
    pilot: "Pilot · Fictional data", week: "Camp week", capacity: "Camper capacity",
    label: "Week name", min: "Minimum age", max: "Maximum age", saveWeek: "Save week",
    dorms: "Dorms", add: "Add dorm", building: "Building", dorm: "Dorm",
    beds: "Physical beds", usable: "Usable beds", guests: "Guest beds",
    group: "Group", female: "Female", male: "Male", active: "In service",
    guides: "Adult Cabin Leaders", helpers: "Camp Counselors", saveDorm: "Save dorm",
    ready: "Available", closed: "Out of service", noBeds: "No beds available",
    noTeam: "Needs at least two adult Cabin Leaders and 1–3 Camp Counselors", noAdultTeam: "Needs at least two adult Cabin Leaders", open: "Camper beds",
    reader: "Read-only view", logout: "Sign out", access: "Pilot access",
    login: "Sign in", password: "Demo password", role: "Role",
    leadership: "Camp Leadership", registration: "Camp Registration", guide: "Cabin Leader", health: "Health staff", kitchen: "Kitchen staff",
    invalid: "Check the values and selected team.", denied: "Access denied.",
    saved: "Changes saved.", unavailable: "Pilot setup is unavailable.",
  },
};
export type Locale = keyof typeof copy;

export function isLocale(value: string): value is Locale {
  return value === "es" || value === "en";
}
