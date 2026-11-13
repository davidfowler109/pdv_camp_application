import type { Locale } from "./copy";

const labels = {
  es: {
    requiredFields:"* Campos obligatorios", title:"Inscripción al campamento", paper:"Registrar formulario en papel", roster:"Solicitudes recibidas", setup:"Preparar la semana",
    pilot:"Piloto con datos ficticios", notice:"Aviso de privacidad del piloto", noticeBody:"Palabra de Vida usa estos datos para tramitar la inscripción, comunicarse con la familia y organizar el cuidado y transporte. El acceso del personal depende de su función. Usa únicamente datos ficticios en este piloto.",
    authorization:"Autorizo la recolección de datos para estos fines. Si registro un formulario en papel, confirmo que contiene la autorización firmada.",
    signer:"Nombre de quien autoriza", signerRole:"Quién autoriza", guardian:"Madre, padre o tutor legal", self:"Campista mayor de edad", signerRelationship:"Relación de quien autoriza con el campista",
    authorizedOn:"Fecha de la firma", paperRoute:"Cómo llegó el formulario", paperSource:"Quién entregó el formulario, si se conoce", recorder:"Nombre de quien lo registra", witness:"Testigo, si alguien observó la firma",
    camper:"Campista y contacto de emergencia", week:"Semana", first:"Nombres", last:"Apellidos", birth:"Fecha de nacimiento", group:"Grupo para el dormitorio", female:"Femenino", male:"Masculino",
    home:"Dirección del campista", contact:"Contacto de emergencia", relationship:"Relación con el campista", contactRoute:"Teléfono o forma acordada de contacto", additionalContact:"Contacto adicional", homeChurch:"Iglesia", notes:"Comentarios o instrucciones",
    helperRole:"Quién ayuda a completar el formulario", noneHelper:"Sin ayuda", family:"Familiar", pastor:"Pastor", staff:"Personal del campamento", helper:"Nombre de quien ayuda",
    health:"Salud y cuidados", food:"Alergias alimentarias", diet:"Necesidades alimentarias", medicationAllergy:"Alergias a medicamentos", medication:"Medicamentos durante el campamento", accommodation:"Cuidados o adaptaciones", details:"Detalles", none:"Ninguno", yes:"Sí", unknown:"Se desconoce",
    transport:"Transporte", arrival:"Llegada", departure:"Regreso", arrivalStop:"Parada de recogida", departureStop:"Parada de regreso", bus:"Bus del campamento", own:"Por cuenta propia", pickup:"Persona autorizada para recoger, si aplica",
    photoPermission:"Permiso de uso de imagen en entrevistas", photoQuestion:"¿Autorizas a Palabra de Vida a usar la imagen del campista en entrevistas para promocionar el campamento en redes sociales?",
    no:"No", photoHelp:"Tu respuesta no afecta la inscripción ni la participación.", photoUnrecorded:"No consta en el formulario firmado", photoUnknown:"Sin registro",
    permissions:"Permisos y beca", participation:"Permiso de participación", pending:"Pendiente", granted:"Autorizado", declined:"No autorizado", scholarship:"Código de beca, si lo tiene",
    submit:"Enviar inscripción", saved:"Solicitud recibida. El equipo del campamento revisará los datos.", invalid:"Revisa los campos. La edad en la fecha de autorización debe corresponder a quien firma.", unavailable:"No se pudo guardar. Intenta de nuevo.", empty:"Todavía no hay solicitudes.", source:"Origen", online:"En línea", denied:"Inicia sesión como personal autorizado.",
  },
  en: {
    requiredFields:"* Required fields", title:"Camp registration", paper:"Enter paper registration", roster:"Received applications", setup:"Set up camp week",
    pilot:"Fictional-data pilot", notice:"Pilot privacy notice", noticeBody:"Palabra de Vida uses these details to process registration, contact families, and arrange care and transportation. Staff access depends on their role. Use fictional information only in this pilot.",
    authorization:"I authorize collection for these purposes. If entering a paper form, I confirm that it contains the signed authorization.",
    signer:"Signer name", signerRole:"Who authorizes", guardian:"Parent or legal guardian", self:"Adult camper", signerRelationship:"Signer’s relationship to the camper",
    authorizedOn:"Date signed", paperRoute:"How the form arrived", paperSource:"Who provided the form, if known", recorder:"Name of staff recorder", witness:"Witness, if someone observed the signature",
    camper:"Camper and emergency contact", week:"Week", first:"Given name(s)", last:"Surname(s)", birth:"Date of birth", group:"Dorm grouping", female:"Female", male:"Male",
    home:"Camper address", contact:"Emergency contact", relationship:"Relationship to camper", contactRoute:"Phone or agreed contact arrangement", additionalContact:"Additional contact", homeChurch:"Home church", notes:"Comments or instructions",
    helperRole:"Who helped complete the form", noneHelper:"No helper", family:"Family member", pastor:"Pastor", staff:"Camp staff", helper:"Helper name",
    health:"Health and accommodations", food:"Food allergies", diet:"Dietary requirements", medicationAllergy:"Medication allergies", medication:"Medication needed during camp", accommodation:"Care or activity accommodations", details:"Details", none:"None", yes:"Yes", unknown:"Unknown",
    transport:"Transportation", arrival:"Arrival", departure:"Departure", arrivalStop:"Bus pickup stop", departureStop:"Return bus stop", bus:"Camp bus", own:"Own transportation", pickup:"Authorized pickup person, if applicable",
    photoPermission:"Permission to use the camper’s image in interviews", photoQuestion:"Do you give Palabra de Vida permission to use the camper’s image in interviews to promote camp on social media?",
    no:"No", photoHelp:"Your answer does not affect registration or participation.", photoUnrecorded:"Not recorded on the signed form", photoUnknown:"Not recorded",
    permissions:"Permissions and scholarship", participation:"Permission to participate", pending:"Pending", granted:"Granted", declined:"Declined", scholarship:"Scholarship code, if issued",
    submit:"Submit registration", saved:"Application received. Camp staff will review the details.", invalid:"Check the fields. The signer must match the camper’s age on the authorization date.", unavailable:"Unable to save. Try again.", empty:"No applications yet.", source:"Source", online:"Online", denied:"Sign in as authorized staff.",
  },
} satisfies Record<Locale, Record<string, string>>;

export const registrationCopy = labels;
