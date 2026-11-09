export const staffSkills = ["guide","equipante","health","kitchen","program"] as const;
export const weeklyStaffRoles = ["health","kitchen","program"] as const;

export const staffCopy = {
  en: {
    title:"Staff", directory:"Staff directory", add:"Add staff member", edit:"Edit staff member", name:"Full name",
    skills:"Skills and qualifications", notes:"Qualification notes (optional)", adult:"Adult", active:"Active", inactive:"Inactive",
    save:"Save staff member", week:"Camp week", view:"View week", weekly:"Weekly assignments", cabin:"Cabin assignments", setup:"Manage cabin teams in Week setup",
    team:"Assigned staff", assign:"Add assignment", remove:"Remove assignment", nobody:"No one assigned",
    weekRequired:"Add a camp week before assigning staff.", access:"Staff assignments are separate from app access.",
    empty:"No staff members yet.", guide:"Cabin Leader", equipante:"Camp Counselor", health:"Health staff", kitchen:"Kitchen staff", program:"Program and activities",
    invalid:"Check the staff details and qualifications.", unavailable:"Unable to save the change.", saved:"Changes saved.",
  },
  es: {
    title:"Personal", directory:"Directorio del personal", add:"Agregar persona", edit:"Editar persona", name:"Nombre completo",
    skills:"Habilidades y cualificaciones", notes:"Notas sobre cualificaciones (opcional)", adult:"Persona adulta", active:"Activo", inactive:"Inactivo",
    save:"Guardar persona", week:"Semana de campamento", view:"Ver semana", weekly:"Asignaciones semanales", cabin:"Equipos de dormitorios", setup:"Configurar equipos en Preparar la semana",
    team:"Personal asignado", assign:"Agregar asignación", remove:"Quitar asignación", nobody:"Sin personal asignado",
    weekRequired:"Agrega una semana antes de asignar personal.", access:"Las asignaciones del personal son independientes del acceso a la aplicación.",
    empty:"Aún no hay personal registrado.", guide:"Guía de Cabañas", equipante:"Equipante", health:"Personal de salud", kitchen:"Personal de cocina", program:"Programa y actividades",
    invalid:"Revisa los datos y las cualificaciones del personal.", unavailable:"No se pudo guardar el cambio.", saved:"Cambios guardados.",
  },
};
