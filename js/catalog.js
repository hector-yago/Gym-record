// Catálogo de músculos y ejercicios con nombres comunes en castellano. Datos estáticos (no se guardan en el documento):
// el usuario solo guarda sus ajustes por ejercicio (apodo, salto de kg, rango de reps, foto) y sus ejercicios propios.

export const MUSCLES = {
  chest: { name: 'Pecho', hint: 'pectoral', group: 'Tren superior' },
  shoulders: { name: 'Hombros', hint: 'deltoides', group: 'Tren superior' },
  biceps: { name: 'Bíceps', hint: 'parte delantera del brazo', group: 'Tren superior' },
  triceps: { name: 'Tríceps', hint: 'parte trasera del brazo', group: 'Tren superior' },
  forearms: { name: 'Antebrazos', hint: 'agarre', group: 'Tren superior' },
  lats: { name: 'Dorsales', hint: 'laterales de la espalda', group: 'Espalda' },
  upper_back: { name: 'Espalda alta', hint: 'trapecio y romboides, entre los omóplatos', group: 'Espalda' },
  lower_back: { name: 'Lumbares', hint: 'espalda baja', group: 'Espalda' },
  abs: { name: 'Abdomen', hint: 'abdominales y oblicuos', group: 'Core' },
  glutes: { name: 'Glúteos', hint: 'culo', group: 'Tren inferior' },
  quads: { name: 'Cuádriceps', hint: 'muslo delantero', group: 'Tren inferior' },
  hamstrings: { name: 'Isquiotibiales', hint: 'muslo trasero', group: 'Tren inferior' },
  adductors: { name: 'Aductores', hint: 'cara interna del muslo', group: 'Tren inferior' },
  calves: { name: 'Gemelos', hint: 'pantorrilla', group: 'Tren inferior' },
};
export const MUSCLE_IDS = Object.keys(MUSCLES);

export const EQUIPMENT = {
  machine: 'Máquina',
  cable: 'Polea',
  dumbbell: 'Mancuernas',
  barbell: 'Barra',
  body: 'Peso corporal',
  other: 'Otro',
};

// [id, nombre, otros nombres, músculo principal, secundarios, equipo, salto kg, [reps mín, reps máx], cómo se usa]
const RAW = [
  // Pecho
  ['press-pecho-maquina', 'Press de pecho en máquina', 'Chest press, máquina de pecho', 'chest', ['triceps', 'shoulders'], 'machine', 5, [8, 12], 'Sentado, espalda pegada. Ajusta el asiento para que los agarres queden a la altura del pecho. Empuja hacia delante sin bloquear los codos.'],
  ['press-banca-barra', 'Press banca con barra', 'Banca plana', 'chest', ['triceps', 'shoulders'], 'barbell', 2.5, [6, 10], 'Tumbado en el banco, baja la barra al pecho con control y empuja. Con compañero o topes de seguridad.'],
  ['press-banca-mancuernas', 'Press banca con mancuernas', 'Press plano con mancuernas', 'chest', ['triceps', 'shoulders'], 'dumbbell', 2, [8, 12], 'Tumbado, baja las mancuernas a los lados del pecho y empuja juntándolas arriba.'],
  ['press-inclinado-mancuernas', 'Press inclinado con mancuernas', 'Pecho superior', 'chest', ['shoulders', 'triceps'], 'dumbbell', 2, [8, 12], 'Banco inclinado 30-45°. Trabaja la parte alta del pecho.'],
  ['press-inclinado-maquina', 'Press inclinado en máquina', 'Chest press inclinado', 'chest', ['shoulders', 'triceps'], 'machine', 5, [8, 12], 'Igual que el press de pecho pero con el recorrido hacia arriba; parte alta del pecho.'],
  ['aperturas-mariposa', 'Aperturas en máquina (mariposa)', 'Pec deck, contractora', 'chest', ['shoulders'], 'machine', 5, [10, 15], 'Sentado, codos ligeramente flexionados. Junta los brazos delante del pecho y vuelve despacio.'],
  ['aperturas-mancuernas', 'Aperturas con mancuernas', 'Aperturas planas', 'chest', ['shoulders'], 'dumbbell', 1, [10, 15], 'Tumbado, abre los brazos en arco con codos semiflexionados y vuelve juntando las mancuernas.'],
  ['cruce-poleas', 'Cruce de poleas', 'Cruces', 'chest', ['shoulders'], 'cable', 2.5, [10, 15], 'De pie entre dos poleas altas, junta las manos delante del pecho con los codos suaves.'],
  ['fondos-paralelas', 'Fondos en paralelas', 'Dips', 'chest', ['triceps', 'shoulders'], 'body', 2.5, [6, 12], 'Cuerpo ligeramente inclinado hacia delante para pecho; baja hasta que el codo llegue a 90°.'],
  ['flexiones', 'Flexiones', 'Push-ups', 'chest', ['triceps', 'shoulders', 'abs'], 'body', 0, [8, 20], 'Cuerpo recto como una tabla; baja el pecho al suelo y empuja.'],
  // Espalda
  ['jalon-pecho', 'Jalón al pecho', 'Polea alta, lat pulldown', 'lats', ['biceps', 'upper_back'], 'cable', 5, [8, 12], 'Sentado con los muslos fijos. Tira de la barra hacia la parte alta del pecho llevando los codos abajo.'],
  ['jalon-agarre-cerrado', 'Jalón con agarre cerrado (triángulo)', 'Jalón neutro', 'lats', ['biceps', 'upper_back'], 'cable', 5, [8, 12], 'Igual que el jalón pero con asa en V; agarre neutro, trabaja más el dorsal bajo.'],
  ['dominadas', 'Dominadas', 'Pull-ups', 'lats', ['biceps', 'upper_back', 'forearms'], 'body', 2.5, [4, 10], 'Cuélgate con agarre más ancho que los hombros y sube la barbilla por encima de la barra.'],
  ['dominadas-asistidas', 'Dominadas asistidas (máquina)', 'Máquina de dominadas con contrapeso', 'lats', ['biceps', 'upper_back'], 'machine', 5, [8, 12], 'El peso que marcas te ayuda: menos peso = más difícil. Arrodíllate en la plataforma.'],
  ['remo-sentado-polea', 'Remo sentado en polea', 'Remo bajo, remo con polea', 'upper_back', ['lats', 'biceps'], 'cable', 5, [8, 12], 'Sentado, tira del asa hacia el abdomen juntando los omóplatos, sin balancear el tronco.'],
  ['remo-maquina', 'Remo en máquina', 'Remo con apoyo en el pecho', 'upper_back', ['lats', 'biceps'], 'machine', 5, [8, 12], 'Pecho apoyado en la almohadilla; tira de los agarres hacia atrás juntando omóplatos.'],
  ['remo-mancuerna', 'Remo con mancuerna a una mano', 'Remo unilateral', 'lats', ['upper_back', 'biceps'], 'dumbbell', 2, [8, 12], 'Una rodilla y una mano en el banco; tira de la mancuerna hacia la cadera.'],
  ['remo-barra', 'Remo con barra', 'Remo inclinado', 'upper_back', ['lats', 'biceps', 'lower_back'], 'barbell', 2.5, [6, 10], 'Tronco inclinado y espalda recta; tira de la barra hacia el abdomen.'],
  ['pullover-polea', 'Pullover en polea', 'Pull-over', 'lats', ['chest'], 'cable', 2.5, [10, 15], 'De pie ante la polea alta, brazos casi rectos, baja la barra hacia los muslos.'],
  ['face-pull', 'Face pull', 'Tirón a la cara, deltoides posterior en polea', 'shoulders', ['upper_back'], 'cable', 2.5, [12, 15], 'Polea a la altura de la cara con cuerda; tira hacia la frente abriendo los codos. Bueno para postura.'],
  ['encogimientos', 'Encogimientos de hombros', 'Shrugs, trapecio', 'upper_back', ['forearms'], 'dumbbell', 2, [10, 15], 'De pie con mancuernas; sube los hombros hacia las orejas sin girarlos.'],
  ['extension-lumbar', 'Extensión lumbar (banco romano)', 'Hiperextensiones', 'lower_back', ['glutes', 'hamstrings'], 'body', 0, [10, 15], 'Apoyado en el banco, baja el tronco y sube hasta quedar recto, sin arquear de más.'],
  ['peso-muerto', 'Peso muerto', 'Deadlift', 'hamstrings', ['glutes', 'lower_back', 'upper_back', 'forearms'], 'barbell', 5, [5, 8], 'Barra pegada a las piernas, espalda neutra, empuja el suelo con los pies. Técnica antes que peso.'],
  ['peso-muerto-rumano', 'Peso muerto rumano', 'RDL', 'hamstrings', ['glutes', 'lower_back'], 'barbell', 2.5, [8, 12], 'Piernas casi rectas, lleva la cadera atrás bajando la barra por los muslos; notas estirar el muslo trasero.'],
  // Hombros
  ['press-hombros-maquina', 'Press de hombros en máquina', 'Shoulder press', 'shoulders', ['triceps'], 'machine', 5, [8, 12], 'Sentado, empuja los agarres hacia arriba desde la altura de los hombros.'],
  ['press-militar-mancuernas', 'Press de hombros con mancuernas', 'Press militar', 'shoulders', ['triceps'], 'dumbbell', 2, [8, 12], 'Sentado o de pie, empuja las mancuernas sobre la cabeza.'],
  ['elevaciones-laterales', 'Elevaciones laterales', 'Vuelos laterales', 'shoulders', [], 'dumbbell', 1, [12, 15], 'Sube las mancuernas a los lados hasta la altura de los hombros, codos ligeramente flexionados.'],
  ['elevaciones-laterales-polea', 'Elevaciones laterales en polea', 'Laterales con polea', 'shoulders', [], 'cable', 1.25, [12, 15], 'Polea baja, sube el brazo de lado hasta el hombro. Tensión constante.'],
  ['elevaciones-frontales', 'Elevaciones frontales', 'Vuelos frontales', 'shoulders', ['chest'], 'dumbbell', 1, [10, 15], 'Sube la mancuerna al frente hasta la altura de los ojos.'],
  ['pajaros', 'Pájaros (deltoides posterior)', 'Vuelos posteriores, reverse fly', 'shoulders', ['upper_back'], 'dumbbell', 1, [12, 15], 'Inclinado hacia delante, abre los brazos hacia los lados juntando los omóplatos.'],
  ['pajaros-maquina', 'Pájaros en máquina (mariposa inversa)', 'Reverse pec deck', 'shoulders', ['upper_back'], 'machine', 2.5, [12, 15], 'Sentado mirando al respaldo, abre los brazos hacia atrás.'],
  // Bíceps
  ['curl-biceps-mancuernas', 'Curl de bíceps con mancuernas', 'Curl alterno', 'biceps', ['forearms'], 'dumbbell', 1, [8, 12], 'De pie o sentado, sube la mancuerna girando la muñeca; codo pegado al cuerpo.'],
  ['curl-biceps-barra', 'Curl de bíceps con barra', 'Curl barra Z', 'biceps', ['forearms'], 'barbell', 2.5, [8, 12], 'De pie, sube la barra sin balancear el cuerpo.'],
  ['curl-martillo', 'Curl martillo', 'Hammer curl', 'biceps', ['forearms'], 'dumbbell', 1, [8, 12], 'Como el curl pero con las palmas enfrentadas (agarre neutro); trabaja también el antebrazo.'],
  ['curl-polea', 'Curl en polea baja', 'Curl con cuerda', 'biceps', ['forearms'], 'cable', 2.5, [10, 15], 'De pie ante la polea baja, sube el agarre con los codos fijos.'],
  ['curl-predicador', 'Curl en banco predicador', 'Scott, máquina de curl', 'biceps', [], 'machine', 2.5, [8, 12], 'Brazos apoyados en la almohadilla inclinada; sube y baja despacio. Aísla el bíceps.'],
  // Tríceps
  ['extension-triceps-polea', 'Extensión de tríceps en polea', 'Jalón de tríceps, pushdown', 'triceps', [], 'cable', 2.5, [10, 15], 'De pie ante la polea alta, codos pegados, estira los brazos hacia abajo.'],
  ['triceps-cuerda', 'Tríceps con cuerda', 'Pushdown con cuerda', 'triceps', [], 'cable', 2.5, [10, 15], 'Igual que el jalón pero con cuerda; abre las manos al final.'],
  ['press-frances', 'Press francés', 'Rompecráneos', 'triceps', [], 'barbell', 2.5, [8, 12], 'Tumbado, baja la barra hacia la frente doblando solo los codos y estira.'],
  ['extension-triceps-mancuerna', 'Extensión de tríceps sobre la cabeza', 'Copa, trasnuca', 'triceps', [], 'dumbbell', 1, [10, 15], 'Una mancuerna a dos manos detrás de la cabeza; estira los brazos hacia arriba.'],
  ['fondos-banco', 'Fondos en banco', 'Fondos de tríceps', 'triceps', ['chest', 'shoulders'], 'body', 0, [8, 15], 'Manos en el banco detrás de ti, baja el cuerpo doblando los codos y sube.'],
  ['fondos-maquina', 'Fondos en máquina', 'Dip machine', 'triceps', ['chest', 'shoulders'], 'machine', 5, [8, 12], 'Sentado, empuja los agarres hacia abajo.'],
  // Piernas
  ['sentadilla-barra', 'Sentadilla con barra', 'Squat', 'quads', ['glutes', 'hamstrings', 'lower_back'], 'barbell', 2.5, [5, 10], 'Barra en la espalda alta, baja con la espalda recta hasta que los muslos queden paralelos y sube.'],
  ['sentadilla-multipower', 'Sentadilla en multipower', 'Smith machine', 'quads', ['glutes'], 'machine', 2.5, [8, 12], 'Barra guiada: más estable. Pies algo adelantados.'],
  ['sentadilla-goblet', 'Sentadilla goblet', 'Sentadilla con mancuerna', 'quads', ['glutes'], 'dumbbell', 2, [8, 15], 'Mancuerna al pecho con las dos manos; baja con el torso erguido.'],
  ['prensa', 'Prensa de piernas', 'Leg press', 'quads', ['glutes', 'hamstrings'], 'machine', 10, [8, 12], 'Tumbado/sentado, empuja la plataforma con los pies; no bloquees las rodillas arriba.'],
  ['extension-cuadriceps', 'Extensión de cuádriceps', 'Silla de cuádriceps, leg extension', 'quads', [], 'machine', 5, [10, 15], 'Sentado, estira las piernas hasta arriba y baja controlando.'],
  ['curl-femoral-tumbado', 'Curl femoral tumbado', 'Leg curl tumbado', 'hamstrings', ['calves'], 'machine', 2.5, [8, 12], 'Tumbado boca abajo, lleva los talones hacia los glúteos.'],
  ['curl-femoral-sentado', 'Curl femoral sentado', 'Leg curl sentado', 'hamstrings', [], 'machine', 5, [8, 12], 'Sentado, baja el rodillo doblando las rodillas.'],
  ['zancadas', 'Zancadas', 'Lunges, estocadas', 'quads', ['glutes', 'hamstrings'], 'dumbbell', 2, [8, 12], 'Da un paso largo y baja la rodilla trasera casi al suelo; alterna piernas.'],
  ['sentadilla-bulgara', 'Sentadilla búlgara', 'Bulgarian split squat', 'quads', ['glutes'], 'dumbbell', 2, [8, 12], 'Pie trasero apoyado en un banco; baja con la pierna delantera.'],
  ['hip-thrust', 'Hip thrust (empuje de cadera)', 'Puente de glúteos con barra', 'glutes', ['hamstrings'], 'barbell', 5, [8, 12], 'Espalda alta apoyada en el banco, barra sobre la cadera; sube la cadera apretando glúteos.'],
  ['patada-gluteo-polea', 'Patada de glúteo en polea', 'Kickback', 'glutes', ['hamstrings'], 'cable', 2.5, [10, 15], 'Con tobillera, lleva la pierna hacia atrás sin arquear la espalda.'],
  ['abductores-maquina', 'Abductores en máquina', 'Abducción de cadera', 'glutes', [], 'machine', 5, [12, 20], 'Sentado, abre las piernas contra las almohadillas.'],
  ['aductores-maquina', 'Aductores en máquina', 'Aducción de cadera', 'adductors', [], 'machine', 5, [12, 20], 'Sentado, junta las piernas contra las almohadillas.'],
  ['gemelos-de-pie', 'Gemelos de pie', 'Elevación de talones', 'calves', [], 'machine', 5, [12, 20], 'De pie en la máquina o escalón, sube de puntillas y baja estirando.'],
  ['gemelos-sentado', 'Gemelos sentado', 'Soleo', 'calves', [], 'machine', 5, [12, 20], 'Sentado con las rodillas bajo la almohadilla, sube los talones.'],
  ['gemelos-prensa', 'Gemelos en prensa', 'Elevación de talones en prensa', 'calves', [], 'machine', 10, [12, 20], 'En la prensa, empuja solo con la punta de los pies.'],
  // Abdomen
  ['plancha', 'Plancha', 'Plank', 'abs', ['lower_back', 'shoulders'], 'body', 0, [30, 60], 'Apoyado en antebrazos y puntas, cuerpo recto. En «reps» pon los segundos.'],
  ['crunch-maquina', 'Crunch en máquina', 'Abdominales en máquina', 'abs', [], 'machine', 5, [10, 15], 'Sentado, encoge el tronco hacia las rodillas contra la resistencia.'],
  ['crunch-polea', 'Crunch en polea alta', 'Abdominales con cuerda', 'abs', [], 'cable', 2.5, [10, 15], 'De rodillas ante la polea alta, flexiona el tronco llevando los codos a las rodillas.'],
  ['elevacion-piernas', 'Elevación de piernas', 'Leg raise', 'abs', ['quads'], 'body', 0, [10, 15], 'Colgado o en banco, sube las piernas con control sin balancear.'],
  ['rueda-abdominal', 'Rueda abdominal', 'Ab wheel', 'abs', ['shoulders', 'lower_back'], 'other', 0, [6, 12], 'De rodillas, rueda hacia delante manteniendo el abdomen duro y vuelve.'],
  ['giro-ruso', 'Giros rusos', 'Russian twist', 'abs', [], 'body', 0, [15, 30], 'Sentado inclinado atrás, gira el tronco de lado a lado.'],
  // Otros / compuestos
  ['kettlebell-swing', 'Kettlebell swing', 'Balanceo de pesa rusa', 'glutes', ['hamstrings', 'lower_back', 'shoulders'], 'other', 4, [10, 20], 'Bisagra de cadera: lanza la pesa al frente con la cadera, no con los brazos.'],
  ['farmer-walk', 'Paseo del granjero', 'Farmer walk', 'forearms', ['upper_back', 'abs'], 'dumbbell', 2, [30, 60], 'Camina con una mancuerna pesada en cada mano. En «reps» pon los segundos.'],
  ['remo-menton', 'Remo al mentón', 'Upright row', 'shoulders', ['upper_back', 'biceps'], 'barbell', 2.5, [8, 12], 'Sube la barra pegada al cuerpo hasta el pecho con los codos por encima de las manos.'],
  ['abductor-polea', 'Abducción de cadera en polea', 'Patada lateral', 'glutes', [], 'cable', 2.5, [10, 15], 'Con tobillera, abre la pierna hacia el lado sin inclinar el tronco.'],
  ['press-pecho-polea', 'Press de pecho en polea', 'Press con poleas', 'chest', ['triceps', 'shoulders'], 'cable', 2.5, [8, 12], 'De pie de espaldas a las poleas, empuja los agarres hacia delante.'],
  ['curl-concentrado', 'Curl concentrado', 'Curl con el codo apoyado en el muslo', 'biceps', [], 'dumbbell', 1, [10, 15], 'Sentado, codo apoyado en el muslo interior, sube la mancuerna despacio.'],
  ['remo-trx', 'Remo invertido', 'Remo con el propio peso', 'upper_back', ['lats', 'biceps'], 'body', 0, [8, 15], 'Tumbado bajo una barra baja, tira del pecho hacia la barra.'],
  ['sentadilla-hack', 'Sentadilla hack', 'Hack squat', 'quads', ['glutes'], 'machine', 10, [8, 12], 'Espalda apoyada en el respaldo inclinado; baja flexionando rodillas y empuja.'],
  ['buenos-dias', 'Buenos días', 'Good morning', 'lower_back', ['hamstrings', 'glutes'], 'barbell', 2.5, [8, 12], 'Barra a la espalda, inclina el tronco llevando la cadera atrás con la espalda recta.'],
];

/** @typedef {{id:string,name:string,alt:string,primary:string,secondary:string[],equipment:string,step:number,reps:[number,number],how:string,custom?:boolean}} Exercise */
/** @type {Exercise[]} */
export const CATALOG = RAW.map(([id, name, alt, primary, secondary, equipment, step, reps, how]) => ({ id, name, alt, primary, secondary, equipment, step, reps, how }));
const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

export const REP_LIMITS = { min: 1, max: 100 };
export const STEP_OPTIONS = [0, 0.5, 1, 1.25, 2, 2.5, 4, 5, 10];

/** Une catálogo + ejercicios propios + ajustes del usuario (apodo, salto, reps, foto). */
export function resolveExercises(doc) {
  const overrides = doc.exerciseSettings ?? {};
  const all = [...CATALOG, ...(doc.customExercises ?? []).map((e) => ({ ...e, custom: true }))];
  return all.map((e) => {
    const o = overrides[e.id] ?? {};
    return {
      ...e,
      nickname: o.nickname ?? '',
      step: o.step ?? e.step,
      reps: o.reps ?? e.reps,
      hasPhoto: Boolean(o.photo),
      notes: o.notes ?? '',
      hidden: Boolean(o.hidden),
    };
  });
}

export const exerciseIndex = (list) => new Map(list.map((e) => [e.id, e]));
export const catalogEntry = (id) => BY_ID.get(id);

/** Nombre a mostrar: apodo si lo hay; el nombre oficial aparece como detalle. */
export const displayName = (e) => e?.nickname || e?.name || 'Ejercicio desconocido';

export const normalizeText = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchExercises(list, query, muscle = '') {
  const q = normalizeText(query).trim();
  return list.filter((e) => {
    if (e.hidden) return false;
    if (muscle && e.primary !== muscle && !e.secondary.includes(muscle)) return false;
    if (!q) return true;
    return normalizeText(`${e.name} ${e.alt} ${e.nickname} ${MUSCLES[e.primary]?.name} ${MUSCLES[e.primary]?.hint} ${EQUIPMENT[e.equipment]}`).includes(q);
  });
}
