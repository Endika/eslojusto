// The source of truth for every visible UI string. Another language is a copy of this object
// that `satisfies Record<Clave, string>`, so a missing key fails the typecheck.
// Keys under `cli.` are also used by the browser scripts; the page ships them as JSON.
export const es = {
  'meta.og_imagen_alt': 'Logo de eslojusto.es: una hoja con una pestaña naranja.',

  'pie.nota':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Las cifras siguen el Estatuto de los Trabajadores y la guía del CGPJ (v0.6, julio de 2026).',
  'pie.nav': 'Información legal',
  'pie.aviso_legal': 'Aviso legal',
  'pie.privacidad': 'Privacidad',

  'portada.titulo': 'Calcula tu finiquito y comprueba si es justo · eslojusto.es',
  'portada.descripcion':
    'Calcula el mínimo legal de tu finiquito y compáralo con lo que te pagan, partida por partida y con el artículo de cada cifra. Todo en tu dispositivo.',
  'portada.h1': 'Comprueba si te pagan lo justo',
  'portada.entrada':
    'eslojusto.es compara lo que te pagan o te cobran con lo que marca la ley, cifra a cifra y con el artículo al lado. Por ahora revisa el finiquito.',
  'portada.nota':
    'Todo se calcula en tu dispositivo y lo que escribes no sale de él. Sí se mide qué pasos usas, sin cookies y sin identificarte.',
  'portada.indice': 'Trámites',
  'portada.finiquito': 'Finiquito',
  'portada.finiquito_texto':
    'Tu finiquito frente al mínimo legal, partida por partida (salario del último mes, vacaciones, pagas extra, indemnización y preaviso), y una estimación de tu paro.',
  'portada.finiquito_cita': 'Estatuto de los Trabajadores · guía del CGPJ v0.6',
  'portada.contrato': 'Contrato de trabajo',
  'portada.alquiler': 'Alquiler',
  'portada.proximamente': 'Próximamente',
  'portada.proximamente_aria': '{nombre}, próximamente',

  'finiquito.titulo': 'Calcular finiquito 2026: compáralo con el mínimo legal',
  'finiquito.descripcion':
    'Calcula tu finiquito por despido, baja voluntaria o fin de contrato frente al mínimo legal: vacaciones, pagas extra, indemnización y preaviso. Y tu paro.',
  'finiquito.h1': 'Calcula tu finiquito',
  'finiquito.entrada':
    'Calcula el mínimo legal de tu finiquito por despido, baja voluntaria o fin de contrato y compáralo con lo que te ofrece la empresa.',
  'finiquito.sin_js':
    'La revisión necesita JavaScript. Se hace entera en tu dispositivo y lo que escribes no sale de él.',
  'pestanas.nav': 'Secciones',
  'seccion.causa': 'Causa',
  'seccion.fechas': 'Fechas',
  'seccion.salario': 'Salario',
  'seccion.vacaciones': 'Vacaciones y paro',
  'seccion.finiquito': 'Tu finiquito',
  'seccion.resultado': 'Resultado',

  'form.aria': 'Revisión del finiquito',
  'form.atras': 'Atrás',
  'form.siguiente': 'Siguiente',
  'form.revisar': 'Revisar',
  'form.si': 'Sí',
  'form.no': 'No',

  'causa.pregunta': '¿Cómo terminó tu contrato?',
  'causa.ayuda': 'Mira la carta de tu empresa.',
  'causa.dimision': 'Baja voluntaria (dimisión)',
  'causa.dimision_pista': 'Te vas por decisión propia.',
  'causa.fin_temporal': 'Fin de contrato temporal',
  'causa.fin_temporal_pista': 'Llega su fecha de fin.',
  'causa.objetivo': 'Despido objetivo',
  'causa.objetivo_pista': 'Causas económicas u otras.',
  'causa.improcedente': 'Despido improcedente',
  'causa.improcedente_pista': 'Reconocido o declarado así.',
  'causa.disciplinario': 'Despido disciplinario',
  'causa.disciplinario_pista': 'Alegan una falta grave.',

  'temporal.pregunta': '¿Qué tipo de contrato temporal tenías?',
  'temporal.ayuda': 'Lo pone tu contrato, arriba.',
  'temporal.circunstancias': 'Eventual',
  'temporal.circunstancias_pista': 'Por circunstancias de la producción.',
  'temporal.sustitucion': 'Sustitución',
  'temporal.sustitucion_pista': 'Para cubrir a otra persona.',
  'temporal.formativo': 'Formativo',
  'temporal.formativo_pista': 'De formación o de prácticas.',

  'fechas.pregunta': '¿Cuándo empezaste y cuándo acabas?',
  'fechas.ayuda':
    'Las dos fechas están en tu contrato y en la carta de baja. Si aún no te has ido, pon la prevista.',
  'fechas.alta': 'Fecha de alta',
  'fechas.alta_pista': 'Tu primer día en esta empresa.',
  'fechas.baja': 'Fecha de baja',
  'fechas.baja_pista': 'Tu último día de trabajo.',

  'prorrateo.pregunta': '¿Tus pagas extra van prorrateadas en la nómina?',
  'prorrateo.ayuda':
    'Si cada nómina trae una parte de las pagas extra, van prorrateadas. Si las cobras aparte, en junio y en diciembre por ejemplo, no.',
  'salario.pregunta': '¿Cuánto cobras?',
  'salario.ayuda': 'En tu nómina, el bruto es lo que va antes de descuentos.',
  'salario.mensual': 'Salario bruto mensual',
  'salario.mensual_pista_si':
    'Lo que pone tu nómina cada mes, con la parte de pagas extra incluida. Por ejemplo, 1.850,00.',
  'salario.mensual_pista_no': 'Tu bruto mensual sin las pagas extra. Por ejemplo, 1.850,00.',

  'pagas.pregunta': '¿Cómo son tus pagas extra?',
  'pagas.ayuda': 'Mira tu nómina de diciembre.',
  'pagas.numero': 'Número de pagas extra',
  'pagas.numero_pista': 'Lo normal son 2.',
  'pagas.importe': 'Importe de cada paga',
  'pagas.importe_pista': 'En bruto.',
  'pagas.devengo': '¿Cuándo se generan?',
  'pagas.devengo_pista': 'Lo dice tu convenio. Si no lo sabes, se miran las dos.',
  'pagas.anual': 'Anual',
  'pagas.semestral': 'Semestral',
  'pagas.no_lo_se': 'No lo sé',

  'vacaciones.pregunta': 'Tus vacaciones y tu preaviso',
  'vacaciones.anuales': 'Vacaciones al año',
  'vacaciones.anuales_pista': 'Días naturales; 30 es el mínimo.',
  'vacaciones.disfrutadas': 'Días naturales disfrutados',
  'vacaciones.disfrutadas_pista': 'Este año. Una semana son 7.',
  'vacaciones.disfrutadas_no_lo_se': 'No lo sé',
  'vacaciones.preaviso_recibido': 'Días de preaviso que te dio la empresa',
  'vacaciones.preaviso_recibido_pista': 'Entre la carta y tu último día; en blanco, 0.',
  'vacaciones.preaviso_convenio': 'Preaviso del convenio',
  'vacaciones.preaviso_convenio_pista': 'Días. Si no lo sabes, en blanco.',
  'vacaciones.preaviso_dado': 'Días que avisaste',
  'vacaciones.preaviso_dado_pista': 'En blanco cuenta 0.',
  'vacaciones.sin_preaviso':
    'Con un despido improcedente o disciplinario no hay preaviso que revisar.',

  'hijos.pregunta': '¿Cuántos hijos o hijas tienes a tu cargo?',
  'hijos.ayuda': 'Cambia el mínimo y el máximo de tu paro.',
  'hijos.quien':
    'Para el SEPE cuentan los menores de 26 años, los mayores con discapacidad y los menores en acogida que viven contigo o dependen de ti y no ingresan más del salario mínimo.',
  'hijos.ninguno': 'Ninguno',
  'hijos.uno': '1',
  'hijos.dos': '2 o más',
  'hijos.no_dice': 'Prefiero no decirlo',

  'otros.pregunta': '¿Has trabajado en otros sitios en los últimos 6 años?',
  'otros.ayuda': 'Es opcional. Con sus fechas, la duración del paro se acerca más a la tuya.',
  'otros.no': 'No',
  'otros.si': 'Sí, añadir fechas',
  'otros.lista': 'Otros trabajos',
  'otros.alta': 'Alta',
  'otros.baja': 'Baja',
  'otros.anadir': 'Añadir otro',
  'otros.quitar': 'Quitar',
  'otros.paro': '¿Has cobrado paro después de alguno?',
  'otros.no_lo_se': 'No lo sé',
  'otros.vida_laboral': 'Las fechas de alta y baja salen en tu',
  'otros.vida_laboral_enlace': 'informe de vida laboral (sede de la Seguridad Social)',

  'cifras.pregunta': '¿Qué pone tu finiquito?',
  'cifras.ayuda': 'Copia cada importe bruto. Si una partida no aparece, en blanco.',
  'cifras.salario_pendiente': 'Salario del mes de la baja',
  'cifras.vacaciones': 'Vacaciones no disfrutadas',
  'cifras.pagas_extra': 'Pagas extra',
  'cifras.indemnizacion': 'Indemnización',
  'cifras.preaviso_empresa': 'Falta de preaviso',
  'cifras.descuento_preaviso': 'Descuento por no preavisar',

  'resultado.titulo': 'Resultado',
  'resultado.entrada':
    'Una hoja por partida, con lo que pone tu finiquito, el mínimo legal y de dónde sale.',
  'resultado.no_revisado': 'Lo que esta revisión no comprueba',
  'resultado.propuesta': 'La propuesta de liquidación',
  'resultado.propuesta_1':
    'Cuando te comunican el fin del contrato, la empresa tiene que darte una propuesta del documento de liquidación, que es el finiquito con cada partida (art. 49.2 del Estatuto de los Trabajadores).',
  'resultado.propuesta_2':
    'Puedes pedir que alguien de la representación legal de la plantilla esté presente cuando suscribas el recibo del finiquito.',
  'resultado.propuesta_3':
    'Un despacho laboralista, un despacho de graduado social o un sindicato pueden revisar tu caso con todos tus documentos.',
  'resultado.propuesta_fuente': 'Estatuto de los Trabajadores, art. 49',
  'resultado.en_tu_finiquito': 'En tu finiquito',
  'resultado.segun_tu_dato': 'Según tu dato.',
  'resultado.segun_tu_dato_nota':
    'Esta cifra parte de una respuesta tuya que la revisión no puede comprobar.',
  'resultado.como_se_calcula': 'Cómo se calcula',
  'resultado.reiniciar': 'Empezar de nuevo',
  'resultado.paro': 'Tu paro (estimación)',
  'resultado.paro_entrada':
    'Una estimación con los datos de esta revisión. La cifra que vale es la que reconozca el SEPE.',
  'resultado.paro_requisitos':
    'Además hace falta estar de alta o en situación asimilada, inscribirte como demandante de empleo, suscribir el acuerdo de actividad y no tener la edad de jubilación (art. 266 LGSS). Esta revisión no lo comprueba.',
  'resultado.paro_cuanto': 'Cuánto',
  'resultado.paro_jornada':
    'Estas cifras suponen jornada completa; con jornada parcial son menores.',
  'resultado.paro_cuanto_tiempo': 'Cuánto tiempo',
  'resultado.paro_cotizado': 'Días cotizados',
  'resultado.paro_plazo': 'Plazo para pedirlo',
  'resultado.paro_plazo_texto':
    'Se pide en los 15 días hábiles siguientes al fin del contrato. Si tu finiquito paga vacaciones no disfrutadas, el plazo cuenta desde que terminan esos días (art. 268 LGSS).',
  'resultado.paro_vida_laboral':
    'Tu vida laboral muestra cada alta y cada baja y los días cotizados:',
  'resultado.paro_vida_laboral_enlace': 'informe de tu vida laboral (sede de la Seguridad Social)',
  'resultado.paro_causa_justa':
    'Hay excepciones. Irte por alguno de estos motivos sí es situación legal de desempleo y, si cumples el resto de requisitos, da derecho a paro: un traslado (art. 40 ET), un cambio sustancial de tus condiciones (art. 41.3 ET), un incumplimiento grave de la empresa, como no pagarte o pagarte tarde una y otra vez (art. 50 ET), o la violencia de género o sexual (art. 49.1.m ET). Lo recoge el art. 267.1.a.5.º LGSS. La salida por el art. 50 la suele declarar un juzgado.',
  'resultado.paro_calculo':
    'La base es la media de lo cotizado por desempleo en los últimos 180 días; aquí sale de tu salario bruto anual con las pagas extra, entre 12, dentro de las bases mínima y máxima de 2026. Se cobra el 70 % de la base los primeros 180 días y el 60 % después, con un mínimo y un máximo según tus hijos o hijas a cargo. La duración sigue la escala del art. 269.1: 360 días cotizados en los últimos 6 años dan 120 días de paro, y cada 180 más suman 60, hasta 720.',

  'guia.titulo': 'Cómo se calcula un finiquito',
  'guia.ejemplo': 'Ejemplo.',
  'guia.que_lleva': 'Qué lleva el finiquito',
  'guia.diferencia': 'Finiquito e indemnización no son lo mismo',
  'guia.salario': 'Salario del mes de la baja',
  'guia.vacaciones': 'Vacaciones no disfrutadas',
  'guia.pagas': 'Pagas extra',
  'guia.indemnizacion': 'Indemnización según la causa',
  'guia.por_improcedente': 'Finiquito por despido improcedente',
  'guia.por_objetivo': 'Finiquito por despido objetivo',
  'guia.por_fin_temporal': 'Finiquito por fin de contrato temporal',
  'guia.por_dimision': 'Finiquito por baja voluntaria',
  'guia.por_disciplinario': 'Finiquito por despido disciplinario',
  'guia.antes_2012': 'Si empezaste antes del 12 de febrero de 2012',
  'guia.propuesta': 'Firmar el finiquito como «no conforme»',
  'guia.plazos': 'Plazos',
  'guia.no_revisa': 'Lo que esta revisión no comprueba',
  'guia.paro': 'Y el paro',
  'guia.paro_cuanto': 'Cuánto paro se cobra',
  'guia.paro_duracion': 'Cuánto dura el paro',
  'guia.paro_plazo': 'Plazo para pedir el paro',
  'guia.preguntas': 'Preguntas frecuentes',
  'guia.actualizado': 'Actualizado: octubre de 2026',
  'guia.fuentes': 'Fuentes',
  'guia.fuente_et': 'Estatuto de los Trabajadores (BOE)',
  'guia.fuente_cgpj': 'guía del CGPJ v0.6',
  'guia.fuente_lgss': 'Ley General de la Seguridad Social (BOE)',
  'guia.fuente_sepe': 'cuantías del SEPE',
  'guia.quien': 'Quién está detrás',

  'faq.dimision': '¿Me corresponde finiquito si pido la baja voluntaria?',
  'faq.dimision_r':
    'Sí. El finiquito recoge lo que ya has ganado y aún no has cobrado, como el salario del último mes, las vacaciones no disfrutadas y la parte generada de las pagas extra. La dimisión no genera indemnización (art. 49.1.d ET).',
  'faq.improcedente': '¿Cuánto es la indemnización por despido improcedente?',
  'faq.improcedente_r':
    'Son 33 días de salario por año trabajado, con un tope de 24 mensualidades (720 días), según el art. 56 ET. Si tu contrato empezó antes del 12 de febrero de 2012, el tiempo hasta el 11 de febrero de 2012 se cuenta a 45 días por año (disposición transitoria 11.ª ET). El tope sigue en 720 días, salvo que ese primer tramo ya lo supere, y nunca más de 1.260.',
  'faq.objetivo': '¿Cuánto es la indemnización por despido objetivo?',
  'faq.objetivo_r':
    'Son 20 días de salario por año trabajado, con un tope de 12 mensualidades (360 días), y 15 días de preaviso (art. 53 ET). Si la empresa no da el preaviso, los días que falten se pagan.',
  'faq.salario_diario': '¿Cómo se calcula el salario diario?',
  'faq.salario_diario_r':
    'Es tu salario bruto anual, con las pagas extra, entre 365. Así lo calcula la guía del CGPJ para las indemnizaciones.',
  'faq.temporal': '¿Hay indemnización al acabar un contrato temporal?',
  'faq.temporal_r':
    'Sí, 12 días por año, en proporción a los días trabajados (art. 49.1.c ET). Para contratos que empezaron entre 2011 y 2014 son de 8 a 11 días (disposición transitoria 8.ª ET). Los contratos de sustitución y los formativos no tienen indemnización.',
  'faq.plazos': '¿Qué plazo tengo para pedir lo que falta en mi finiquito?',
  'faq.plazos_r':
    'Para cantidades como el salario pendiente, las vacaciones, las pagas extra o la indemnización por fin de contrato temporal, un año (art. 59.1 ET). En un despido (objetivo, improcedente o disciplinario), el plazo para impugnarlo es de 20 días hábiles (art. 59.3 ET), y quien no esté de acuerdo con su indemnización suele plantearlo por esa misma vía. El plazo es corto, y un despacho laboralista, un despacho de graduado social o un sindicato pueden decirte cuál se aplica a tu caso.',
  'faq.paro': '¿Tengo paro si me despiden o se acaba mi contrato?',
  'faq.paro_r':
    'Cualquier despido es situación legal de desempleo, también el disciplinario aunque sea procedente, y el fin de un contrato temporal también lo es si no lo terminaste tú (arts. 267.1.a y 268.4 LGSS). Dejar el trabajo por decisión propia no lo es, salvo excepciones como un traslado o impagos graves de la empresa (art. 267 LGSS). Además hacen falta 360 días cotizados en los últimos 6 años, que pueden venir de varios trabajos, e inscribirte como demandante de empleo, entre otros requisitos (arts. 266 y 269.1 LGSS).',
  'faq.paro_cuanto': '¿Cuánto paro voy a cobrar?',
  'faq.paro_cuanto_r':
    'Depende de lo cotizado por desempleo en los últimos 180 días. Se cobra el 70 % de esa base los primeros 180 días y el 60 % después (art. 270 LGSS), y en 2026 cada mes queda entre 560 € y 1.575 € brutos según tus hijos o hijas a cargo (SEPE). Dura de 120 a 720 días según lo cotizado en los últimos 6 años (art. 269.1 LGSS). La revisión del finiquito lo estima con tus datos, para jornada completa.',
  'faq.no_conforme': '¿Qué es firmar el finiquito como «no conforme»?',
  'faq.no_conforme_r':
    'Es suscribirlo añadiendo «recibí no conforme» o «no conforme». Algunas personas lo hacen cuando no están de acuerdo con alguna cantidad. La ley prevé además que puedas pedir que esté presente alguien de la representación legal de la plantilla (art. 49.2 ET). Lo contamos solo como información, y qué hacer en cada caso puede valorarlo un despacho laboralista, un despacho de graduado social o un sindicato.',
  'faq.no_comprobable': '¿Cuándo sale una partida como «no se puede comprobar»?',
  'faq.no_comprobable_r':
    'Cuando falta un dato sin el que no hay una cifra legal con la que comparar. Pasa con el preaviso de una dimisión, que fija tu convenio, y con los días de vacaciones que has disfrutado si marcas «No lo sé». Las vacaciones y las pagas extra sí se comparan. Como las empresas las calculan por días o por meses, se da el margen entre las dos cuentas, y tu convenio puede mejorar esas cifras.',
  'faq.datos': '¿Se envían mis datos a algún sitio?',
  'faq.datos_r':
    'Lo que escribes, no. La revisión se calcula entera en tu navegador y no se guarda. Sí se mide qué pasos usas, sin cookies y sin identificarte: qué secciones abres, qué campo no se acepta o en qué tramo queda la diferencia. Nunca tus importes ni tus fechas. El detalle está en la página de privacidad.',

  'legal.actualizado': 'Actualizado el 6 de octubre de 2026',
  'aviso.titulo': 'Aviso legal · eslojusto.es',
  'aviso.descripcion':
    'Quién está detrás de eslojusto.es y qué hace y qué no hace su revisión del finiquito. Informa sobre la ley y no da asesoramiento jurídico.',
  'aviso.h1': 'Aviso legal',
  'aviso.quien': 'Quién está detrás',
  'aviso.que_hace': 'Qué hace la herramienta',
  'aviso.no_hace': 'Qué no hace',
  'aviso.errores': 'Errores en las cifras',
  'no_encontrada.titulo': 'Página no encontrada · eslojusto.es',
  'no_encontrada.descripcion':
    'Esta dirección no lleva a ninguna página de eslojusto.es. Desde aquí puedes ir a la revisión del finiquito o a la portada.',
  'no_encontrada.h1': 'No encontramos esta página',
  'no_encontrada.entrada':
    'Puede que el enlace esté mal escrito o que la página haya cambiado de dirección.',
  'no_encontrada.indice': 'Páginas de eslojusto.es',
  'no_encontrada.finiquito_texto':
    'Calcula el mínimo legal de tu finiquito y compáralo con lo que te ofrece la empresa.',
  'no_encontrada.portada': 'Portada',
  'no_encontrada.portada_texto': 'Qué revisa eslojusto.es y qué llegará después.',
  'privacidad.titulo': 'Privacidad · eslojusto.es',
  'privacidad.descripcion':
    'Lo que escribes al revisar tu finiquito no sale de tu navegador. No hay cookies y los pasos se miden sin identificarte, con PostHog en la Unión Europea.',
  'privacidad.h1': 'Privacidad',
  'privacidad.resumen': 'En resumen',
  'privacidad.datos': 'Qué se guarda y dónde',
  'privacidad.dato_revision': 'Lo que escribes en la revisión',
  'privacidad.dato_tema': 'Tu elección de tema (claro u oscuro)',
  'privacidad.dato_medicion': 'Lo que se mide de tu visita',
  'privacidad.dato_servidor': 'Los registros del servidor',
  'privacidad.medicion': 'Qué se mide',
  'privacidad.quien': 'Quién lo recibe',
  'privacidad.cookies': 'Sin cookies',
  'privacidad.base': 'Por qué se mide',
  'privacidad.responsable': 'Responsable, contacto y derechos',

  'cli.tema.a_oscuro': 'Tema: pasar a oscuro',
  'cli.tema.a_claro': 'Tema: pasar a claro',
  'cli.otro_idioma.aria': 'Otro idioma',
  'cli.otro_idioma.texto': 'Esta página también está en {idioma}.',
  'cli.otro_idioma.cerrar': 'Cerrar el aviso de idioma',

  'cli.estado.por_debajo': 'Por debajo del mínimo legal: faltan {importe}',
  'cli.estado.coincide': 'Coincide con el mínimo legal',
  'cli.estado.por_encima': 'Por encima del mínimo legal',
  'cli.estado.descuento_mayor': 'El descuento supera el máximo: {importe}',
  'cli.estado.descuento_dentro': 'Descuento dentro del máximo',
  'cli.estado.no_comprobable': 'No se puede comprobar sin tu convenio',
  'cli.estado.sin_cifra_empresa': 'No has metido la cifra de tu finiquito',
  'cli.estado.sin_indemnizacion': 'No te corresponde indemnización por ley en este caso',
  'cli.estado.sin_indemnizacion_disciplinario':
    'Si el despido es procedente, no hay indemnización (art. 55.7 ET). Si se declarara improcedente, la referencia sería {importe}; el plazo para impugnar un despido es de 20 días hábiles (art. 59.3 ET).',
  'cli.estado.no_comprobable_dias': 'No se puede comprobar sin los días que has disfrutado',
  'cli.rango.minimo': 'Mínimo legal',
  'cli.rango.maximo_descuento': 'Máximo que pueden descontarte',
  'cli.rango.convenio': 'Depende de tu convenio',
  'cli.rango.dias': 'Depende de los días que has disfrutado',
  'cli.rango.entre': 'entre {minimo} y {maximo}',
  'cli.sin_cifra': 'Sin cifra',
  'cli.convenio_mejora': 'Tu convenio puede mejorar esta cifra (más días, otro devengo).',
  'cli.fuente.vigente': 'en vigor desde {fecha}',
  'cli.referencia_improcedente':
    'Si un juzgado declarase improcedente el despido, la indemnización sería de {importe}.',

  'cli.otros.contrato': 'Otro trabajo {n}',
  'cli.otros.alta': 'Fecha de alta del trabajo {n}',
  'cli.otros.baja': 'Fecha de baja del trabajo {n}',
  'cli.otros.quitar': 'Quitar el otro trabajo {n}',

  'cli.paro.estado.si': 'Esta causa da derecho a paro si cumples el resto de requisitos',
  'cli.paro.estado.no': 'No da derecho a paro',
  'cli.paro.motivo.dimision':
    'Dejar el trabajo por decisión propia no es situación legal de desempleo (art. 267.2.a LGSS).',
  'cli.paro.motivo.fin_temporal':
    'El fin de un contrato temporal es situación legal de desempleo, salvo que lo terminaras tú (art. 267.1.a.6.º LGSS).',
  'cli.paro.motivo.objetivo':
    'El despido objetivo es situación legal de desempleo (art. 267.1.a.4.º LGSS).',
  'cli.paro.motivo.improcedente':
    'El despido es situación legal de desempleo (art. 267.1.a.3.º LGSS).',
  'cli.paro.motivo.disciplinario':
    'El despido disciplinario también es situación legal de desempleo, aunque no se impugne (arts. 267.1.a.3.º y 268.4 LGSS).',
  'cli.paro.unos': 'unos {importe}',
  'cli.paro.cuantia.dos':
    'Serían {tramo1} al mes los primeros 6 meses y {tramo2} después, en bruto.',
  'cli.paro.cuantia.uno': 'Serían {tramo1} al mes, en bruto.',
  'cli.paro.cuantia.sin_hijos':
    'Es un margen porque no has dicho cuántos hijos o hijas tienes a tu cargo: el mínimo y el máximo cambian según cuántos tengas.',
  'cli.paro.descuento':
    'De ahí se descuentan unos {ss} al mes de Seguridad Social y el IRPF que te corresponda, que esta revisión no calcula.',
  'cli.paro.sin_cifras':
    'Depende de tus últimas nóminas. La cantidad sale de lo cotizado en los últimos 180 días (art. 270.1 LGSS) y este contrato dura menos, así que entra otro trabajo que esta revisión no conoce.',
  'cli.paro.sin_cifras_base':
    'Con este salario no podemos estimar la cuantía (puede ser jornada parcial); depende de tus bases de cotización.',
  'cli.paro.duracion.maximo': 'Unos {dias} días ({meses} meses), el máximo.',
  'cli.paro.duracion.al_menos':
    'Al menos unos {dias} días ({meses} meses) solo por este trabajo. Si cotizaste en otros trabajos en los últimos 6 años y no los usaste para otro paro, puede ser más; lo ves en tu vida laboral.',
  'cli.paro.duracion.exacta': 'Unos {dias} días ({meses} meses), con las fechas que has puesto.',
  'cli.paro.duracion.hasta':
    'Hasta unos {dias} días ({meses} meses); si cobraste paro después de alguno de estos contratos, esos días ya se usaron y puede ser menos (art. 269.2 LGSS).',
  'cli.paro.duracion.depende':
    'Depende de lo que hayas cotizado en otros trabajos: con lo que sabe esta revisión no se llega a 360 días. Lo ves en tu vida laboral.',
  'cli.paro.duracion.vacaciones':
    'Las vacaciones pagadas y no disfrutadas también cuentan como cotizadas (art. 269.4 LGSS) y aquí no se suman, así que puede salir algo más.',
  'cli.paro.carencia.este':
    'Solo con este contrato ya tienes los 360 días cotizados que hacen falta en los últimos 6 años (art. 269.1 LGSS).',
  'cli.paro.carencia.otros':
    'Con este contrato y los que has añadido sumas {dias} días cotizados; hacen falta 360 en los últimos 6 años (art. 269.1 LGSS).',
  'cli.paro.carencia.depende':
    'Con este contrato llevas {dias} días cotizados; hacen falta 360 en los últimos 6 años (art. 269.1 LGSS). Si trabajaste antes, lo ves en tu vida laboral.',
  'cli.paro.carencia.depende_otros':
    'Con estos contratos sumas {dias} días cotizados; hacen falta 360 en los últimos 6 años que no hayas usado ya para otro paro (art. 269 LGSS). Lo ves en tu vida laboral.',

  'cli.partida.salario_pendiente': 'Salario del mes de la baja',
  'cli.partida.vacaciones': 'Vacaciones devengadas y no disfrutadas',
  'cli.partida.pagas_extra': 'Pagas extra devengadas',
  'cli.partida.indemnizacion': 'Indemnización',
  'cli.partida.preaviso_empresa': 'Preaviso no dado por la empresa',
  'cli.partida.descuento_preaviso': 'Descuento por preaviso no cumplido',

  'cli.no_revisado.neto': 'El neto: retenciones de IRPF y cotizaciones',
  'cli.no_revisado.pluses':
    'Pluses, complementos, horas extra y comisiones de tu convenio o contrato',
  'cli.no_revisado.pagas_adicionales': 'Pagas extra además de las dos ordinarias',
  'cli.no_revisado.causa_despido':
    'Si la causa de despido está justificada, algo que decide un juzgado',
  'cli.no_revisado.salarios_tramitacion': 'Salarios de tramitación',

  'cli.error.falta_causa': 'Elige cómo terminó tu contrato',
  'cli.error.falta_tipoTemporal': 'Elige el tipo de contrato temporal',
  'cli.error.falta_fechaAlta': 'Escribe la fecha de alta',
  'cli.error.falta_fechaBaja': 'Escribe la fecha de baja',
  'cli.error.falta_salarioMensual': 'Escribe tu salario bruto mensual',
  'cli.error.falta_pagasProrrateadas': 'Elige sí o no',
  'cli.error.falta_numeroPagas': 'Escribe cuántas pagas extra tienes',
  'cli.error.falta_importePaga': 'Falta el importe',
  'cli.error.falta_diasVacacionesAnuales': 'Escribe cuántos días de vacaciones tienes al año',
  'cli.error.falta_diasVacacionesDisfrutadas':
    'Escribe cuántos días has disfrutado este año (0 si ninguno) o marca «No lo sé»',
  'cli.error.falta_dato': 'Falta este dato',
  'cli.error.fecha_no_valida': 'La fecha no es válida',
  'cli.error.cifra_no_valida': 'No se entiende la cifra: escríbela como 1.234,56',
  'cli.error.fecha_alta_no_valida': 'La fecha de alta no es válida',
  'cli.error.fecha_baja_no_valida': 'La fecha de baja no es válida',
  'cli.error.baja_antes_de_alta': 'La fecha de baja es anterior a la de alta',
  'cli.error.baja_muy_lejana': 'La fecha de baja no puede estar a más de un año en el futuro',
  'cli.error.salario_fuera_de_rango':
    'El salario mensual debe ser mayor que 0 y no pasar de 1.000.000 €',
  'cli.error.pagas_fuera_de_rango': 'El número de pagas debe estar entre 0 y 6',
  'cli.error.importe_paga_fuera_de_rango':
    'El importe de la paga extra debe ser mayor que 0 y no pasar de 1.000.000 €',
  'cli.error.vacaciones_anuales_fuera_de_rango':
    'Los días de vacaciones al año deben estar entre 0 y 60',
  'cli.error.vacaciones_disfrutadas_fuera_de_rango':
    'Los días de vacaciones disfrutados deben estar entre 0 y 60',
  'cli.error.preaviso_fuera_de_rango': 'Los días de preaviso deben estar entre 0 y 90',
  'cli.error.falta_tipo_temporal': 'Indica el tipo de contrato temporal',
  'cli.error.falta_hijos': 'Elige una opción; «Prefiero no decirlo» también vale',
  'cli.error.falta_paroCobradoDespues': 'Elige sí, no o «No lo sé»',
  'cli.error.otro_contrato_fecha_alta_no_valida': 'La fecha de alta de este contrato no es válida',
  'cli.error.otro_contrato_fecha_baja_no_valida': 'La fecha de baja de este contrato no es válida',
  'cli.error.otro_contrato_baja_antes_de_alta':
    'La fecha de baja de este contrato es anterior a la de alta',
  'cli.error.otro_contrato_baja_posterior':
    'La fecha de baja de este contrato es posterior a la del contrato que estás revisando',
} as const satisfies Record<string, string>;

export type Clave = keyof typeof es;
