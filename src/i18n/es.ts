// The source of truth for every visible UI string. Another language is a copy of this object
// that `satisfies Record<Key, string>`, so a missing key fails the typecheck.
// Keys under `client.` are also used by the browser scripts; the page ships them as JSON.
export const es = {
  'meta.og_image_alt': 'Logo de eslojusto.es: una hoja con una pestaña naranja.',

  'footer.note':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Las cifras siguen el Estatuto de los Trabajadores y la guía del CGPJ (v0.6, julio de 2026).',
  'footer.note_rental':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Las cifras siguen la Ley de Arrendamientos Urbanos (Ley 29/1994), la Ley 12/2023 y el IRAV y el IPC del INE.',
  'footer.note_employment':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Las cifras siguen el Estatuto de los Trabajadores, el Real Decreto 723/2026 y los reales decretos del SMI de cada año.',
  'footer.note_household':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Las cifras siguen el Real Decreto 1620/2011, el Real Decreto-ley 16/2022 y los reales decretos del SMI de cada año.',
  'footer.note_general':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Cada cifra lleva la norma de la que sale.',
  'footer.note_insurance':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Las fechas siguen la Ley de Contrato de Seguro (Ley 50/1980) y la Ley 22/2007, de comercialización a distancia de servicios financieros.',
  'footer.note_benefit':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Las cifras del paro siguen la Ley General de la Seguridad Social (arts. 262 a 277) y el IPREM; las del finiquito, el Estatuto de los Trabajadores y la guía del CGPJ (v0.6, julio de 2026).',
  'footer.nav': 'Información legal',
  'footer.legal_notice': 'Aviso legal',
  'footer.privacy': 'Privacidad',

  'rent_indices.title': 'IRAV e IPC para el alquiler: {mes}',
  'rent_indices.description':
    'El IRAV de {mes} es del {irav} y el IPC, del {ipc}. Cada mes desde noviembre de 2024, con su día de publicación y el enlace al INE.',
  'rent_indices.breadcrumb': 'Ruta',
  'rent_indices.home': 'Portada',
  'rent_indices.h1': 'IRAV e IPC de cada mes',
  'rent_indices.lead':
    'Los índices que marcan cuánto puede subir tu alquiler cada año, con el día en que el INE publicó cada cifra. El IRAV sale cada mes junto con el IPC definitivo.',
  'rent_indices.checked': 'Cifras comprobadas el {fecha}',
  'rent_indices.sources': 'Fuentes',
  'rent_indices.source_irav': 'IRAV (INE)',
  'rent_indices.source_ipc': 'IPC (INE)',
  'rent_indices.source_igc': 'IGC (INE)',
  'rent_indices.who': 'Quién está detrás',

  'rent_indices.latest': 'Último dato: IRAV e IPC de {mes}',
  'rent_indices.latest_irav': 'IRAV de {mes}',
  'rent_indices.latest_ipc': 'IPC de {mes}, definitivo',
  'rent_indices.latest_flash': 'IPC de {mes}, adelantado',
  'rent_indices.latest_igc': 'IGC de {mes}',
  'rent_indices.published_on': 'Publicado el {fecha}',
  'rent_indices.next':
    'El IRAV de {mes} saldrá con el IPC definitivo de ese mes, normalmente hacia mediados del mes siguiente.',

  'rent_indices.table_title': 'Cada mes desde noviembre de 2024',
  'rent_indices.table_lead':
    'Variación anual de cada índice. Debajo de cada cifra, el día en que la publicó el INE, con el enlace a la fuente.',
  'rent_indices.caption':
    'IRAV, IPC e IGC por mes, en variación anual, con el día en que el INE publicó cada cifra',
  'rent_indices.col_month': 'Mes',
  'rent_indices.col_irav': 'IRAV',
  'rent_indices.col_ipcFlash': 'IPC adelantado',
  'rent_indices.col_ipc': 'IPC definitivo',
  'rent_indices.col_igc': 'IGC',
  'rent_indices.cell_published': 'publicado el',
  'rent_indices.cell_pending': 'Pendiente',
  'rent_indices.note_flash':
    'El IPC adelantado es una estimación que el INE da al final de cada mes; el definitivo llega unas dos semanas después y a veces cambia una décima. El IRAV no tiene adelantado.',
  'rent_indices.note_igc':
    'El INE publica el IGC tal como sale de su fórmula, y a menudo es negativo. Para revisar un precio con él, la Ley 2/2015 lo deja entre el {min} y el {max}: si es negativo, la revisión es del {min}, y si pasa del {max}, se toma el {max}.',

  'rent_indices.caps_title': 'Cuánto puede subir tu alquiler cada año',
  'rent_indices.caps_lead':
    'Si tu contrato es del 1 de abril de 2015 o posterior, tu alquiler solo puede subir si el contrato lo dice, y una vez al año: el día en que se cumple cada año de contrato. Sube según el índice que pacta el contrato, sin pasar del tope legal de ese momento. Estos son los topes de los contratos de vivienda desde el 6 de marzo de 2019:',
  'rent_indices.cap.ipc.when': 'Del 06-03-2019 al 30-03-2022',
  'rent_indices.cap.ipc.rule': 'El IPC.',
  'rent_indices.cap.igc.when': 'Del 31-03-2022 al 31-12-2023',
  'rent_indices.cap.igc.rule':
    'El IGC (como mucho un 2 %), o el IPC si es más bajo. Un nuevo pacto podía cambiar el IGC por otra subida, nunca por encima del IPC. Si tu casero es gran tenedor (más de diez inmuebles de uso residencial o más de 1.500 m² de uso residencial), la subida no puede pasar del IGC aunque pactarais otra subida.',
  'rent_indices.cap.three.when': 'En 2024',
  'rent_indices.cap.three.rule':
    'Un 3 %, o el IPC si es más bajo. Un nuevo pacto podía cambiar el 3 % por otra subida, nunca por encima del IPC. Si tu casero es gran tenedor, la subida no puede pasar del 3 % aunque pactarais otra subida. Desde el 26-05-2023 es gran tenedor quien tiene más de diez inmuebles de uso residencial o más de 1.500 m² de uso residencial, y en una zona de mercado tensionado declarada la comunidad autónoma puede bajarlo a cinco o más inmuebles de uso residencial en esa zona.',
  'rent_indices.cap.irav.when': 'Desde el 01-01-2025',
  'rent_indices.cap.irav.when_until': 'Del 01-01-2025 al {hasta}',
  'rent_indices.cap.irav.rule':
    'En los contratos desde el 26-05-2023, el IRAV o el IPC, el más bajo; en los anteriores, el IPC.',
  'rent_indices.cap.two.when': 'Desde el {desde}',
  'rent_indices.cap.two.rule':
    'El IRAV en todos los contratos. Y hasta el 31-12-2027, sin nuevo pacto, como mucho un 2 %. Si tu vivienda está en una zona de mercado tensionado y tu renta supera el límite de precio que fija allí el sistema de índices de referencia, no cabe ninguna subida.',
  'rent_indices.large_landlord_source':
    'art. 3.k (Ley 12/2023, de 24 de mayo, por el derecho a la vivienda)',
  'rent_indices.reference_index':
    'Sistema Estatal de Referencia del Precio del Alquiler de Vivienda (Ministerio de Vivienda)',
  'rent_indices.status.pending_validation':
    'Estado a {fecha}: el {norma} rige desde el {desde} y está pendiente de convalidación. El Congreso tiene que votarlo en los 30 días siguientes a su promulgación; si no lo convalida, queda derogado.',
  'rent_indices.status.in_force':
    'Estado a {fecha}: el Congreso convalidó el {norma}; el acuerdo se publicó el {estado}.',
  'rent_indices.status.repealed':
    'Estado a {fecha}: el Congreso derogó el {norma}; el acuerdo se publicó el {estado}. Su tope del 2 % ya no se aplica.',
  'rent_indices.status_short.pending_validation': 'pendiente de que el Congreso lo convalide',
  'rent_indices.status_short.in_force': 'convalidado por el Congreso',
  'rent_indices.status_short.repealed': 'derogado por el Congreso',
  'rent_indices.now':
    'Con el último IRAV ({irav}) y mientras rija el {norma}, el tope sin nuevo pacto es el {tope}: el más bajo de los dos. Si tu vivienda está en una zona de mercado tensionado y tu renta supera el límite de precio que fija allí el sistema de índices de referencia, no cabe ninguna subida.',
  'rent_indices.repealed':
    'Decretos con el mismo tope del 2 % que el Congreso derogó: {lista}. Una subida de esos días es un caso dudoso.',
  'rent_indices.repealed_item': 'el {norma}, que rigió {periodo}',
  'rent_indices.span.since': 'desde el {desde}',
  'rent_indices.span.day': 'el {dia}',
  'rent_indices.span.day_uncertain': 'el {dia} (o hasta el {dudoso})',
  'rent_indices.span.range': 'del {desde} al {hasta}',
  'rent_indices.span.range_uncertain': 'del {desde} hasta el {hasta} o el {dudoso}',
  'rent_indices.notice':
    'La renta nueva se paga desde el mes siguiente a que te avisen por escrito (art. 18.2 LAU).',

  'rent_indices.example_title': 'Un ejemplo',
  'rent_indices.example_label': 'Ejemplo.',
  'rent_indices.example':
    'Pagas {renta} al mes por un contrato de 2024 que se actualiza con el IRAV. El {dia} se cumple un año más de contrato, y ese día el último IRAV publicado es el de {mes}: {irav}, publicado el {publicado}. Tu renta puede pasar a {maximo} como mucho.',
  'rent_indices.example_later':
    'Si se cumpliera el {dia}, sin nuevo pacto el tope sería el 2 %, o el IRAV si fuera más bajo, mientras rija el {norma}: {maximo} como mucho. Y si tu vivienda estuviera en una zona de mercado tensionado y esos {renta} superaran el límite de precio que fija allí el sistema de índices de referencia, la renta no podría subir.',

  'rent_indices.check_title': 'Comprueba tu subida',
  'rent_indices.check':
    'Revisa si tu casero te ha subido la renta más de lo que permite la ley, con la fecha de tu contrato y el índice de cada mes.',
  'rent_indices.check_link': 'Revisar mi alquiler',
  'rent_indices.soon_title': 'Próximamente: comprueba tu subida',
  'rent_indices.soon':
    'Estamos preparando una calculadora que compruebe tu subida con la fecha de tu contrato y el índice de cada mes. Aún no está disponible.',

  'rent_indices.faq': 'Preguntas frecuentes',
  'rent_indices.faq.what_is_irav': '¿Qué es el IRAV?',
  'rent_indices.faq.what_is_irav_answer':
    'Es el índice que el INE publica cada mes para limitar la subida anual del alquiler de vivienda (disposición adicional 11.ª de la LAU). Es el valor más bajo entre el IPC, el IPC subyacente y una media que acerca el resultado al 2 %. Sirve de tope desde el 1 de enero de 2025.',
  'rent_indices.faq.which_month': '¿Qué mes cuenta para subir mi alquiler?',
  'rent_indices.faq.which_month_answer':
    'El último publicado el día en que se cumple cada año de contrato, no el del mes de ese día (art. 18.1 LAU). Si tu contrato cumple años el {dia}, cuenta el IRAV de {mes}, publicado el {publicado}.',
  'rent_indices.faq.irav_or_ipc': '¿Me toca el IRAV o el IPC?',
  'rent_indices.faq.irav_or_ipc_answer':
    'Depende de cuándo empezó tu contrato y de cuándo se cumple el año. Desde 2025, en los contratos desde el 26 de mayo de 2023 el tope es el IRAV o el IPC, el más bajo; en los anteriores, el IPC. {decreto}',
  'rent_indices.faq.decree_live':
    'Desde el {desde}, el {norma} pone el IRAV para todos ({estado}).',
  'rent_indices.faq.decree_repealed':
    'El {norma} lo puso para todos {periodo}, pero el Congreso lo derogó.',
  'rent_indices.faq.flash': '¿Cuenta el IPC adelantado?',
  'rent_indices.faq.flash_answer':
    'El INE da una estimación del IPC al final de cada mes y el dato definitivo unas dos semanas después. La ley habla del último índice publicado sin aclarar si el adelantado cuenta, por eso aquí ves los dos. El IRAV no tiene adelantado: sale con el IPC definitivo.',
  'rent_indices.faq.no_clause': '¿Me pueden subir el alquiler si el contrato no dice nada?',
  'rent_indices.faq.no_clause_answer':
    'No, si tu contrato es del 1 de abril de 2015 o posterior: sin una cláusula de actualización, la renta no se actualiza (art. 18.1 LAU). Si la cláusula dice que se actualiza pero no con qué índice, se usa el IGC, salvo mientras rige un decreto que pone el IRAV: {decretos}. En los contratos anteriores al 1 de abril de 2015, con la redacción de 1994 o la de la Ley 4/2013, la ley actualiza la renta con el IPC aunque el contrato no lo diga.',
  'rent_indices.faq.no_clause_item': 'el {norma} {periodo}, {estado}',
  'rent_indices.faq.igc_negative': '¿Por qué el IGC sale negativo?',
  'rent_indices.faq.igc_negative_answer':
    'El INE publica el IGC tal como sale de su fórmula, que compara los precios de España con los de la zona euro. Para revisar un precio con él, la Ley 2/2015 lo deja entre el 0 % y el 2 %: si es negativo, la revisión es del 0 %.',

  'rent_indices.dataset_name': 'IRAV, IPC e IGC de cada mes',
  'rent_indices.dataset_description':
    'Variación anual del Índice de Referencia de Arrendamientos de Vivienda (IRAV), del Índice de Precios de Consumo (IPC, adelantado y definitivo) y del Índice de Garantía de Competitividad (IGC) de cada mes desde noviembre de 2024, con el día en que el INE publicó cada cifra.',

  'home.title': 'Calcula tu finiquito y comprueba si es justo · eslojusto.es',
  'home.description':
    'Calcula el mínimo legal de tu finiquito y compáralo con lo que te pagan, partida por partida y con el artículo de cada cifra. Todo en tu dispositivo.',
  'home.h1': 'Comprueba si te pagan lo justo',
  'home.lead':
    'eslojusto.es pone lo que te pagan o te cobran al lado de lo que marca la ley, cifra a cifra y con el artículo del que sale cada una.',
  'home.note':
    'Lo que escribes no sale de tu dispositivo. Se mide qué pasos usas, sin cookies y sin identificarte.',
  'home.note_documents':
    'Lo que escribes no sale de tu dispositivo, y un documento que subas se lee en la Unión Europea y no se guarda. Se mide qué pasos usas, sin cookies y sin identificarte.',
  'home.group_work': 'Trabajo',
  'home.group_housing': 'Vivienda',
  'home.group_money': 'Dinero',
  'home.review': 'Revisar',
  'home.final_pay_situation': 'Te vas o te echan: comprueba cada partida',
  'home.benefit_situation': 'Te quedas sin trabajo: cuánto cobrarías y durante cuánto tiempo',
  'home.contract_situation': 'Tienes un contrato o una oferta: cada condición frente a la ley',
  'home.rent_situation': 'Vives de alquiler: lo que te cobran frente a lo que permite la ley',
  'home.mortgage': 'Hipoteca',
  'home.finance': 'Financiación y seguros',
  'home.credit': 'Financiación',
  'home.insurance': 'Seguros',
  'home.insurance_situation': 'Renuevas tu seguro de hogar o de coche: sus plazos frente a la ley',
  'home.bills': 'Facturas',
  'home.coming_soon': 'Próximamente: {secciones}',
  'home.final_pay': 'Finiquito',
  'home.final_pay_citation': 'Estatuto de los Trabajadores · guía del CGPJ v0.6',
  'home.benefit': 'Paro',
  'home.benefit_citation': 'Ley General de la Seguridad Social · cuantías del SEPE 2026',
  'home.contract': 'Contrato de trabajo',
  'home.rent': 'Alquiler',
  'home.rent_indices': 'IRAV e IPC de cada mes',

  'final_pay.title': 'Calcular finiquito 2026: compáralo con el mínimo legal',
  'final_pay.description':
    'Calcula tu finiquito por despido, baja voluntaria o fin de contrato frente al mínimo legal: vacaciones, pagas extra, indemnización y preaviso. Y tu paro.',
  'final_pay.h1': 'Calcula tu finiquito',
  'final_pay.lead':
    'Calcula el mínimo legal de tu finiquito por despido, baja voluntaria o fin de contrato y compáralo con lo que te ofrece la empresa.',
  'final_pay.no_js':
    'La revisión necesita JavaScript. Se hace entera en tu dispositivo y lo que escribes no sale de él.',
  'tabs.nav': 'Secciones',
  'section.cause': 'Causa',
  'section.dates': 'Fechas',
  'section.salary': 'Salario',
  'section.holidays': 'Vacaciones y paro',
  'section.settlement': 'Tu finiquito',
  'section.result': 'Resultado',

  'form.aria': 'Revisión del finiquito',
  'form.back': 'Atrás',
  'form.next': 'Siguiente',
  'form.review': 'Revisar',
  'form.yes': 'Sí',
  'form.no': 'No',

  'cause.question': '¿Cómo terminó tu contrato?',
  'cause.help': 'Mira la carta de tu empresa.',
  'cause.resignation': 'Baja voluntaria (dimisión)',
  'cause.resignation_hint': 'Te vas por decisión propia.',
  'cause.fixed_term_end': 'Fin de contrato temporal',
  'cause.fixed_term_end_hint': 'Llega su fecha de fin.',
  'cause.objective_dismissal': 'Despido objetivo',
  'cause.objective_dismissal_hint': 'Causas económicas u otras.',
  'cause.collective_dismissal': 'Despido colectivo (ERE)',
  'cause.collective_dismissal_hint': 'Por un ERE de tu empresa.',
  'cause.unfair_dismissal': 'Despido improcedente',
  'cause.unfair_dismissal_hint': 'Reconocido o declarado así.',
  'cause.disciplinary_dismissal': 'Despido disciplinario',
  'cause.disciplinary_dismissal_hint': 'Alegan una falta grave.',
  'cause.unknown': 'No lo sé',
  'cause.unknown_hint': 'Está en la carta y en el certificado de empresa.',

  'fixed_term.question': '¿Qué tipo de contrato temporal tenías?',
  'fixed_term.help': 'Lo pone tu contrato, arriba.',
  'fixed_term.production_circumstances': 'Eventual',
  'fixed_term.production_circumstances_hint': 'Por circunstancias de la producción.',
  'fixed_term.replacement': 'Sustitución',
  'fixed_term.replacement_hint': 'Para cubrir a otra persona.',
  'fixed_term.training': 'Formativo',
  'fixed_term.training_hint': 'De formación o de prácticas.',

  'dates.question': '¿Cuándo empezaste y cuándo acabas?',
  'dates.help':
    'Las dos fechas están en tu contrato y en la carta de baja. Si aún no te has ido, pon la prevista.',
  'dates.start': 'Fecha de alta',
  'dates.start_hint': 'Tu primer día en esta empresa.',
  'dates.end': 'Fecha de baja',
  'dates.end_hint': 'Tu último día de trabajo.',
  'situations.question': '¿Se daba alguna situación que pueda hacer nulo el despido?',
  'situations.help':
    'Como un embarazo, un permiso por nacimiento o una baja médica. Es opcional, y lo que contestes se queda en tu navegador: no se envía a ningún sitio.',
  'situations.no': 'No',
  'situations.yes': 'Sí, marcar cuáles',
  'situations.legend': 'Cuando te despidieron:',
  'situations.pregnancy': 'Estabas embarazada',
  'situations.family_leave':
    'Estabas de permiso o suspensión por nacimiento, adopción, guarda o acogimiento, riesgo en el embarazo o la lactancia, o permiso parental',
  'situations.back_from_leave':
    'Hacía menos de 12 meses que habías vuelto de un permiso por nacimiento, adopción, guarda o acogimiento',
  'situations.care_rights':
    'Habías pedido o tenías un permiso o una reducción de jornada por cuidado, una adaptación de jornada (art. 34.8 ET) o una excedencia por cuidado (art. 46.3 ET)',
  'situations.gender_violence': 'Eras víctima de violencia de género o sexual',
  'situations.sick_leave': 'Estabas de baja médica',

  'prorating.question': '¿Tus pagas extra van prorrateadas en la nómina?',
  'prorating.help':
    'Si cada nómina trae una parte de las pagas extra, van prorrateadas. Si las cobras aparte, en junio y en diciembre por ejemplo, no.',
  'salary.question': '¿Cuánto cobras?',
  'salary.help': 'En tu nómina, el bruto es lo que va antes de descuentos.',
  'salary.monthly': 'Salario bruto mensual',
  'salary.monthly_hint_yes':
    'Lo que pone tu nómina cada mes, con la parte de pagas extra incluida. Por ejemplo, 1.850,00.',
  'salary.monthly_hint_no': 'Tu bruto mensual sin las pagas extra. Por ejemplo, 1.850,00.',
  'erte.question': '¿Estabas en un ERTE cuando te despidieron?',
  'erte.help': 'Lo pone tu nómina.',
  'erte.none': 'No',
  'erte.reduced': 'Sí, con jornada reducida',
  'erte.suspended': 'Sí, con el contrato suspendido',
  'erte.unknown': 'No lo sé',
  'erte.pre_salary': 'Salario de antes del ERTE',
  'erte.pre_salary_hint': 'Bruto al mes, de un mes entero sin ERTE. Si no lo sabes, en blanco.',

  'extra_pay.question': '¿Cómo son tus pagas extra?',
  'extra_pay.help': 'Mira tu nómina de diciembre.',
  'extra_pay.count': 'Número de pagas extra',
  'extra_pay.count_hint': 'Lo normal son 2.',
  'extra_pay.amount': 'Importe de cada paga',
  'extra_pay.amount_hint': 'En bruto.',
  'extra_pay.accrual': '¿Cuándo se generan?',
  'extra_pay.accrual_hint': 'Lo dice tu convenio. Si no lo sabes, se miran las dos.',
  'extra_pay.annual': 'Anual',
  'extra_pay.semiannual': 'Semestral',
  'extra_pay.unknown': 'No lo sé',

  'holidays.question': 'Tus vacaciones',
  'notice.question': 'Tu preaviso',
  'holidays.annual': 'Vacaciones al año',
  'holidays.unit': '¿Cómo cuentas los días de vacaciones?',
  'holidays.unit_working': 'Días laborables',
  'holidays.unit_calendar': 'Días naturales',
  'holidays.week': '¿Cuántos días a la semana trabajas?',
  'holidays.week_5': '5 (de lunes a viernes)',
  'holidays.week_6': '6 (de lunes a sábado)',
  'holidays.week_other': 'Otro',
  'holidays.week_other_days': 'Días a la semana',
  'holidays.annual_hint_working':
    '22 laborables equivalen a los 30 naturales de la ley; 26 si trabajas de lunes a sábado.',
  'holidays.annual_hint_calendar': '30 es el mínimo de la ley.',
  'holidays.taken': 'Disfrutados este año',
  'holidays.taken_hint_working': 'Este año, en días laborables.',
  'holidays.taken_hint_calendar': 'Este año. Una semana son 7.',
  'holidays.taken_unknown': 'No lo sé',
  'holidays.notice_received': 'Días de preaviso que te dio la empresa',
  'holidays.notice_received_hint': 'Entre la carta y tu último día; en blanco, 0.',
  'holidays.agreement_notice': 'Preaviso del convenio',
  'holidays.agreement_notice_hint': 'Días. Si no lo sabes, en blanco.',
  'holidays.notice_given': 'Días que avisaste',
  'holidays.notice_given_hint': 'En blanco cuenta 0.',

  'children.question': '¿Cuántos hijos o hijas tienes a tu cargo?',
  'children.help': 'Cambia el mínimo y el máximo de tu paro.',
  'children.who':
    'Para el SEPE cuentan los menores de 26 años, los mayores con discapacidad y los menores en acogida que viven contigo o dependen de ti y no ingresan más del salario mínimo.',
  'children.none': 'Ninguno',
  'children.one': '1',
  'children.two': '2 o más',
  'children.not_said': 'Prefiero no decirlo',

  'other_contracts.question': '¿Has trabajado en otros sitios en los últimos 6 años?',
  'other_contracts.help':
    'Es opcional. Con sus fechas, la duración del paro se acerca más a la tuya.',
  'other_contracts.no': 'No',
  'other_contracts.yes': 'Sí, añadir fechas',
  'other_contracts.list': 'Otros trabajos',
  'other_contracts.start': 'Alta',
  'other_contracts.end': 'Baja',
  'other_contracts.add': 'Añadir otro',
  'other_contracts.remove': 'Quitar',
  'other_contracts.benefit': '¿Has cobrado paro después de alguno?',
  'other_contracts.unknown': 'No lo sé',
  'other_contracts.work_history': 'Las fechas de alta y baja salen en tu',
  'other_contracts.work_history_link': 'informe de vida laboral (sede de la Seguridad Social)',

  'figures.question': '¿Qué pone tu finiquito?',
  'figures.help': 'Copia cada importe bruto. Si una partida no aparece, en blanco.',
  'figures.pending_salary': 'Salario del mes de la baja',
  'figures.holiday_pay': 'Vacaciones no disfrutadas',
  'figures.extra_pay': 'Pagas extra',
  'figures.severance': 'Indemnización',
  'figures.employer_notice': 'Falta de preaviso',
  'figures.notice_deduction': 'Descuento por no preavisar',
  'paid.question': '¿Te han pagado ya el finiquito?',
  'paid.help': 'Si todavía no, el salario que falta lleva un interés por el retraso.',

  'result.title': 'Resultado',
  'result.lead':
    'Una hoja por partida, con lo que pone tu finiquito, el mínimo legal y de dónde sale.',
  'result.unchecked': 'Lo que esta revisión no comprueba',
  'result.summary': 'En resumen',
  'result.proposal': 'La propuesta de liquidación',
  'result.proposal_1':
    'Cuando te comunican el fin del contrato, la empresa tiene que darte una propuesta del documento de liquidación, que es el finiquito con cada partida (art. 49.2 del Estatuto de los Trabajadores).',
  'result.proposal_2':
    'Puedes pedir que alguien de la representación legal de la plantilla esté presente cuando suscribas el recibo del finiquito.',
  'result.proposal_3':
    'Un despacho laboralista, un despacho de graduado social o un sindicato pueden revisar tu caso con todos tus documentos.',
  'result.proposal_source': 'Estatuto de los Trabajadores, art. 49',
  'result.in_your_final_pay': 'En tu finiquito',
  'result.based_on_your_answer': 'Según tu dato.',
  'result.based_on_your_answer_note':
    'Esta cifra parte de una respuesta tuya que la revisión no puede comprobar.',
  'result.how_it_is_calculated': 'Cómo se calcula',
  'result.restart': 'Empezar de nuevo',
  'result.benefit': 'Tu paro (estimación)',
  'result.benefit_lead':
    'Una estimación con los datos de esta revisión. La cifra que vale es la que reconozca el SEPE.',
  'result.benefit_requirements':
    'Además hace falta estar de alta o en situación asimilada, inscribirte como demandante de empleo, suscribir el acuerdo de actividad y no tener la edad de jubilación (art. 266 LGSS). Esta revisión no lo comprueba.',
  'result.benefit_amount': 'Cuánto',
  'result.benefit_full_time':
    'Estas cifras suponen jornada completa; con jornada parcial son menores.',
  'result.benefit_duration': 'Cuánto tiempo',
  'result.benefit_contributed': 'Días cotizados',
  'result.benefit_deadline': 'Cómo y cuándo pedirlo',
  'result.benefit_deadline_text':
    'Sin inscribirte como demandante de empleo no hay paro: date de alta en el servicio de empleo de tu comunidad y pide la prestación al SEPE en los 15 días hábiles siguientes al fin del contrato. Si tu finiquito paga vacaciones no disfrutadas, el plazo cuenta desde que terminan esos días; si lo pides tarde, pierdes los días de retraso (arts. 266 y 268 LGSS).',
  'result.benefit_work_history':
    'Tu vida laboral muestra cada alta y cada baja y los días cotizados:',
  'result.benefit_work_history_link': 'informe de tu vida laboral (sede de la Seguridad Social)',
  'result.benefit_just_cause':
    'Hay excepciones. Irte por alguno de estos motivos sí es situación legal de desempleo y, si cumples el resto de requisitos, da derecho a paro: un traslado (art. 40 ET), una modificación sustancial de tus condiciones que te perjudique (art. 41.3 ET), un incumplimiento grave de la empresa, como no pagarte o pagarte tarde una y otra vez (art. 50 ET), o la violencia de género o sexual (art. 49.1.m ET). Lo recoge el art. 267.1.a.5.º LGSS. La salida por el art. 50 la suele declarar un juzgado.',
  'result.benefit_calculation':
    'La base es la media de lo cotizado por desempleo en los últimos 180 días; aquí sale de tu salario bruto anual con las pagas extra, entre 12, dentro de las bases mínima y máxima de 2026. Se cobra el 70 % de la base los primeros 180 días y el 60 % después, con un mínimo y un máximo según tus hijos o hijas a cargo. La duración sigue la escala del art. 269.1: 360 días cotizados en los últimos 6 años dan 120 días de paro, y cada 180 más suman 60, hasta 720.',

  'guide.title': 'Cómo se calcula un finiquito',
  'guide.example': 'Ejemplo.',
  'guide.what_it_includes': 'Qué lleva el finiquito',
  'guide.difference': 'Finiquito e indemnización no son lo mismo',
  'guide.salary': 'Salario del mes de la baja',
  'guide.holidays': 'Vacaciones no disfrutadas',
  'guide.extra_pay': 'Pagas extra',
  'guide.severance': 'Indemnización según la causa',
  'guide.unfair_dismissal': 'Finiquito por despido improcedente',
  'guide.objective_dismissal': 'Finiquito por despido objetivo',
  'guide.collective_dismissal': 'Finiquito por despido colectivo (ERE)',
  'guide.fixed_term_end': 'Finiquito por fin de contrato temporal',
  'guide.resignation': 'Finiquito por baja voluntaria',
  'guide.disciplinary_dismissal': 'Finiquito por despido disciplinario',
  'guide.before_2012': 'Si empezaste antes del 12 de febrero de 2012',
  'guide.proposal': 'Firmar el finiquito como «no conforme»',
  'guide.deadlines': 'Plazos',
  'guide.unchecked': 'Lo que esta revisión no comprueba',
  'guide.benefit': 'Y el paro',
  'guide.benefit_amount': 'Cuánto paro se cobra',
  'guide.benefit_duration': 'Cuánto dura el paro',
  'guide.benefit_deadline': 'Plazo para pedir el paro',
  'guide.faq': 'Preguntas frecuentes',
  'guide.cases': 'El finiquito según la causa',
  'guide.by_seniority': 'Cuánto es el finiquito según el tiempo trabajado',
  'guide.updated': 'Actualizado: octubre de 2026',
  'guide.sources': 'Fuentes',
  'guide.source_et': 'Estatuto de los Trabajadores (BOE)',
  'guide.source_cgpj': 'guía del CGPJ v0.6',
  'guide.source_lgss': 'Ley General de la Seguridad Social (BOE)',
  'guide.source_sepe': 'cuantías del SEPE',
  'guide.who': 'Quién está detrás',

  'faq.resignation': '¿Me corresponde finiquito si pido la baja voluntaria?',
  'faq.resignation_answer':
    'Sí. El finiquito recoge lo que ya has ganado y aún no has cobrado, como el salario del último mes, las vacaciones no disfrutadas y la parte generada de las pagas extra. La dimisión no genera indemnización (art. 49.1.d ET).',
  'faq.unfair_dismissal': '¿Cuánto es la indemnización por despido improcedente?',
  'faq.unfair_dismissal_answer':
    'Son 33 días de salario por año trabajado, con un tope de 24 mensualidades (720 días), según el art. 56 ET. Si tu contrato empezó antes del 12 de febrero de 2012, el tiempo hasta el 11 de febrero de 2012 se cuenta a 45 días por año (disposición transitoria 11.ª ET). El tope sigue en 720 días, salvo que ese primer tramo ya lo supere, y nunca más de 1.260.',
  'faq.objective_dismissal': '¿Cuánto es la indemnización por despido objetivo?',
  'faq.objective_dismissal_answer':
    'Son 20 días de salario por año trabajado, con un tope de 12 mensualidades (360 días), y 15 días de preaviso (art. 53 ET). Si la empresa no da el preaviso, los días que falten se pagan.',
  'faq.collective_dismissal': '¿Cuánto es la indemnización en un despido colectivo (ERE)?',
  'faq.collective_dismissal_answer':
    'Como mínimo, la de un despido objetivo: 20 días de salario por año trabajado, con un tope de 12 mensualidades, y 15 días de preaviso (arts. 51.4 y 53.1 ET). El acuerdo del periodo de consultas puede mejorar ese mínimo, y suele hacerlo (art. 51.2 ET). La revisión no conoce tu acuerdo, así que da el mínimo legal «o más, según el acuerdo del ERE».',
  'faq.daily_salary': '¿Cómo se calcula el salario diario?',
  'faq.daily_salary_answer':
    'Es tu salario bruto anual, con las pagas extra, entre 365. Así lo calcula la guía del CGPJ para las indemnizaciones.',
  'faq.erte': '¿Y si me despiden durante un ERTE?',
  'faq.erte_answer':
    'La indemnización debería calcularse con el salario completo de antes del ERTE, no con el de tus últimas nóminas. Con jornada reducida, con el de antes de la reducción (STS 678/2018, de 27 de junio); con el contrato suspendido, con lo cobrado en los meses trabajados (STS 638/2022, de 7 de julio). La revisión te pide ese salario, y sin él no da una cifra.',
  'faq.fixed_term': '¿Hay indemnización al acabar un contrato temporal?',
  'faq.fixed_term_answer':
    'Sí, 12 días por año, en proporción a los días trabajados (art. 49.1.c ET). Para contratos que empezaron entre 2011 y 2014 son de 8 a 11 días (disposición transitoria 8.ª ET). Los contratos de sustitución y los formativos no tienen indemnización, ni los firmados antes del 4 de marzo de 2001 (disposición transitoria 8.ª.2 ET).',
  'faq.unknown_cause': '¿Y si no sé cómo terminó mi contrato?',
  'faq.unknown_cause_answer':
    'Marca «No lo sé». Se revisan las partidas que no dependen de la causa: el salario del mes de la baja, las vacaciones y las pagas extra. La indemnización depende de la causa y sin ella no se calcula. La causa está en la carta de despido y en el certificado de empresa, en la casilla «causa de la situación legal de desempleo».',
  'faq.deadlines': '¿Qué plazo tengo para pedir lo que falta en mi finiquito?',
  'faq.deadlines_answer':
    'Para cantidades como el salario pendiente, las vacaciones, las pagas extra o la indemnización por fin de contrato temporal, un año (art. 59.1 ET). En un despido (objetivo, colectivo, improcedente o disciplinario), el plazo para impugnarlo es de 20 días hábiles (art. 59.3 ET), y quien no esté de acuerdo con su indemnización suele plantearlo por esa misma vía. El plazo es corto, y un despacho laboralista, un despacho de graduado social o un sindicato pueden decirte cuál se aplica a tu caso.',
  'faq.null_dismissal': '¿Cuándo puede ser nulo un despido?',
  'faq.null_dismissal_answer':
    'Si te despiden estando embarazada, de permiso por nacimiento, adopción, guarda o acogimiento o en los 12 meses después de volver de él, teniendo o habiendo pedido un permiso, una reducción o una adaptación de jornada o una excedencia por cuidado, o siendo víctima de violencia de género o sexual, el despido podría ser nulo, salvo que el motivo no tenga nada que ver con esa situación (art. 55.5 ET). Estando de baja médica, podría serlo si el motivo es la enfermedad (Ley 15/2022, arts. 2.1 y 26), aunque los tribunales todavía no lo aplican de forma uniforme. La revisión te avisa si lo marcas, sin dar cifras para ese caso. Para impugnar el despido hay 20 días hábiles (art. 59.3 ET).',
  'faq.late_interest': '¿Y si todavía no me han pagado el finiquito?',
  'faq.late_interest_answer':
    'Lo que es salario lleva un interés por el retraso del 10 % al año desde la baja (art. 29.3 ET), aunque la cantidad se discuta (STS de 17 de junio de 2014, rcud 1315/2013). La revisión lo cuenta sobre el mínimo legal del salario del mes de la baja y de las pagas extra. La indemnización no lo lleva, y las vacaciones no disfrutadas no se suman porque es dudoso que lo lleven. Para reclamar las cantidades del finiquito hay un año desde la baja (art. 59.1 y 59.2 ET).',
  'faq.benefit': '¿Tengo paro si me despiden o se acaba mi contrato?',
  'faq.benefit_answer':
    'Cualquier despido es situación legal de desempleo, también el disciplinario aunque sea procedente, y el fin de un contrato temporal también lo es si no lo terminaste tú (arts. 267.1.a y 268.4 LGSS). Dejar el trabajo por decisión propia no lo es, salvo excepciones como un traslado o impagos graves de la empresa (art. 267 LGSS). Además hacen falta 360 días cotizados en los últimos 6 años, que pueden venir de varios trabajos, e inscribirte como demandante de empleo, entre otros requisitos (arts. 266 y 269.1 LGSS).',
  'faq.benefit_amount': '¿Cuánto paro voy a cobrar?',
  'faq.benefit_amount_answer':
    'Depende de lo cotizado por desempleo en los últimos 180 días. Se cobra el 70 % de esa base los primeros 180 días y el 60 % después (art. 270 LGSS), y en 2026 cada mes queda entre 560 € y 1.575 € brutos según tus hijos o hijas a cargo (SEPE). Dura de 120 a 720 días según lo cotizado en los últimos 6 años (art. 269.1 LGSS). La revisión del finiquito lo estima con tus datos, para jornada completa.',
  'faq.not_agreed': '¿Qué es firmar el finiquito como «no conforme»?',
  'faq.not_agreed_answer':
    'Es suscribirlo añadiendo «recibí no conforme» o «no conforme». Algunas personas lo hacen cuando no están de acuerdo con alguna cantidad. La ley prevé además que puedas pedir que esté presente alguien de la representación legal de la plantilla (art. 49.2 ET). Lo contamos solo como información, y qué hacer en cada caso puede valorarlo un despacho laboralista, un despacho de graduado social o un sindicato.',
  'faq.not_checkable': '¿Cuándo sale una partida como «no se puede comprobar»?',
  'faq.not_checkable_answer':
    'Cuando falta un dato sin el que no hay una cifra legal con la que comparar. Pasa con el preaviso de una dimisión, que fija tu convenio, y con los días de vacaciones que has disfrutado si marcas «No lo sé». Las vacaciones y las pagas extra sí se comparan. Como las empresas las calculan por días o por meses, se da el margen entre las dos cuentas, y tu convenio puede mejorar esas cifras.',
  'faq.data': '¿Se envían mis datos a algún sitio?',
  'faq.data_answer':
    'Lo que escribes, no. La revisión se calcula entera en tu navegador y no se guarda. Sí se mide qué pasos usas, sin cookies y sin identificarte: qué secciones abres, qué campo no se acepta o en qué tramo queda la diferencia. Nunca tus importes ni tus fechas. El detalle está en la página de privacidad.',

  'final_pay.lead_documents':
    'Calcula el mínimo legal de tu finiquito por despido, baja voluntaria o fin de contrato y compáralo con lo que te ofrece la empresa. Escribe los datos o sube una foto de tu finiquito.',

  'documents.start.question': '¿Cómo quieres empezar?',
  'documents.start.help':
    'Puedes subir los documentos que te ha dado la empresa para rellenar los datos con lo que se lea en ellos, o escribirlos tú. Antes de calcular nada, revisas cada dato.',
  'documents.start.choices': 'Cómo empezar',
  'documents.start.upload': 'Sube tus documentos',
  'documents.start.upload_hint':
    'Una IA lee los datos y tú los confirmas. Gratis, 2 lecturas al día.',
  'documents.start.manual': 'Rellenar a mano',
  'documents.start.manual_hint': 'Escribes los datos tú y nada sale de tu dispositivo.',
  'documents.start.unavailable':
    'La lectura automática de documentos no está disponible ahora mismo. Puedes escribir los datos a mano; el cálculo es el mismo.',
  'documents.upload.question': 'Sube tus documentos',
  'documents.upload.files': 'Sube lo que te hayan dado',
  'documents.upload.files_hint':
    'Por ejemplo, la carta de despido, el finiquito, tus nóminas, el certificado de empresa o tu vida laboral, en el orden que sea. Hasta 25 fotos o páginas de PDF en total. Las fotos y las páginas de los PDF se convierten en imágenes en tu dispositivo antes de enviarse.',
  'documents.upload.drop': 'Arrastra aquí tus fotos o PDF, o elígelos con el botón.',
  'documents.upload.camera': 'Hacer foto',
  'documents.upload.choose': 'Elegir fotos o PDF',
  'documents.upload.consent':
    'Doy mi consentimiento explícito para que una IA lea estos documentos y rellene el formulario. Sé que pueden incluir datos sensibles, como la afiliación a un sindicato o una baja médica. Se leen en la Unión Europea y no se guardan.',
  'documents.upload.consent_link': 'Cómo se tratan tus documentos',
  'documents.upload.send': 'Leer los documentos',
  'documents.upload.back': 'Volver',
  'documents.upload.selected': 'Archivos elegidos',
  'documents.upload.retake': 'Repetir',
  'documents.upload.send_anyway': 'Enviar igualmente',
  'documents.done.question': 'Datos leídos',
  'documents.done.continue': 'Revisar los datos',
  'documents.done.another': 'Subir más documentos',

  'documents.pass.title': 'Informe en PDF y carta «recibí no conforme»',
  'documents.pass.text':
    'Descarga el informe completo con el cálculo paso a paso, las fuentes legales y la carta «recibí no conforme» por 4,99 €. Se generan en tu dispositivo.',
  'documents.pass.price':
    '4,99 € con IVA incluido. Un solo pago, sin cuenta ni suscripción. El pase dura 7 días y solo vale en este navegador: en ese tiempo puedes rehacer o corregir tu revisión, leer hasta 15 paquetes de documentos y volver a descargar el informe y la carta sin pagar otra vez. En otro dispositivo, en una ventana privada o si borras los datos de navegación, se pierde.',
  'documents.pass.waiver':
    'Quiero el informe ahora. Sé que, al ser contenido digital que se entrega al momento, pierdo el derecho de desistimiento (art. 103.m de la Ley General para la Defensa de los Consumidores y Usuarios).',
  'documents.pass.conditions': 'Condiciones de venta',
  'documents.pass.pay': 'Pagar 4,99 €',
  'documents.pass.paid_question': '¿Ya has pagado?',
  'documents.pass.paid_help':
    'Si pagaste desde este navegador y no ves la descarga, recupera aquí tu pase. Solo funciona en el navegador con el que pagaste.',
  'documents.pass.session': 'Código del pago',
  'documents.pass.session_hint':
    'Empieza por «cs_» y está en la dirección a la que volviste tras pagar. En blanco, se usa el último pago de este navegador.',
  'documents.pass.recover': 'Recuperar el pase',
  'documents.pass.download_report': 'Descargar el informe (PDF)',
  'documents.pass.download_letter': 'Descargar la carta (PDF)',
  'documents.letter.legend': 'Tus datos para la carta (opcional)',
  'documents.letter.hint': 'Lo que dejes en blanco queda como una línea para escribirlo a mano.',
  'documents.letter.name': 'Tu nombre y apellidos',
  'documents.letter.id': 'DNI o NIE',
  'documents.letter.company': 'Empresa',
  'documents.letter.place': 'Localidad',
  'documents.letter.date': 'Fecha',
  'documents.letter.privacy':
    'Estos datos solo se usan para rellenar la carta en tu dispositivo; no se envían ni se guardan.',
  'documents.notice.letter_details':
    'Más abajo puedes poner tu nombre y otros datos en la carta y descargarla otra vez.',
  'documents.pass.verify_retry': 'Comprobar otra vez',
  'documents.pass.letter_note':
    'La carta es una plantilla: si falta algo, lleva tus cifras. Usarla o no, y cómo, es decisión tuya.',

  'rental.documents.start_help':
    'Puedes subir tu contrato y los demás papeles del alquiler para rellenar los datos con lo que se lea en ellos, o escribirlos tú. Antes de calcular nada, revisas cada dato.',
  'rental.documents.upload':
    'Sube tu contrato y, si los tienes, avisos de subida, recibos, factura de la agencia y devolución de la fianza',
  'rental.documents.files_hint':
    'El contrato y, si los tienes, los avisos de subida, los recibos, la factura de la agencia o la devolución de la fianza, en el orden que sea. Hasta 25 fotos o páginas de PDF en total. Las fotos y las páginas de los PDF se convierten en imágenes en tu dispositivo antes de enviarse.',
  'rental.documents.consent':
    'Doy mi consentimiento explícito para que una IA lea estos documentos y rellene el formulario. Sé que pueden incluir datos personales, como nombres, DNI, direcciones o números de cuenta. Se leen en la Unión Europea y no se guardan.',
  'rental.pass.title': 'El detalle, el informe y las cartas',
  'rental.pass.text':
    'Por 4,99 € ves el cálculo paso a paso de cada partida (mes a mes y año a año, con el índice, el tope que aplica y las fuentes legales) y descargas el informe en PDF y, si tu revisión tiene cifras para ellas, las cartas sobre la fianza y las subidas. Se generan en tu dispositivo.',
  'rental.pass.price':
    '4,99 € con IVA incluido. Un solo pago, sin cuenta ni suscripción. El pase dura 7 días y solo vale en este navegador, también para la revisión del finiquito: en ese tiempo puedes rehacer o corregir tu revisión, leer hasta 15 paquetes de documentos y volver a ver el detalle y descargar el informe y las cartas sin pagar otra vez. En otro dispositivo, en una ventana privada o si borras los datos de navegación, se pierde.',
  'rental.pass.paid_help':
    'Si pagaste desde este navegador y no ves el detalle ni las descargas, recupera aquí tu pase. Solo funciona en el navegador con el que pagaste.',
  'rental.pass.waiver':
    'Quiero ver el detalle y el informe ahora. Sé que, al ser contenido digital que se entrega al momento, pierdo el derecho de desistimiento (art. 103.m de la Ley General para la Defensa de los Consumidores y Usuarios).',
  'rental.pass.download_deposit_letter': 'Descargar la carta de la fianza (PDF)',
  'rental.pass.download_rent_letter': 'Descargar la carta de la renta (PDF)',
  'rental.pass.letter_note':
    'Las cartas son plantillas con tus cifras. Se descargan en tu dispositivo y no se envían desde aquí: usarlas o no, y cómo, es decisión tuya.',
  'rental.letter.legend': 'Tus datos para las cartas (opcional)',
  'rental.letter.landlord': 'Nombre de tu casero o de la empresa',
  'rental.letter.address': 'Dirección de la vivienda',
  'rental.letter.iban': 'Cuenta (IBAN) para devolverte la fianza',
  'rental.letter.iban_hint': 'Solo va en la carta de la fianza.',
  'rental.letter.privacy':
    'Estos datos solo se usan para rellenar las cartas en tu dispositivo; no se envían ni se guardan.',
  'faq.pass': '¿Qué incluye el pase de 4,99 €?',
  'faq.pass_answer':
    'El pase vale para cualquier revisión durante 7 días, y solo en el navegador con el que pagas: en ese tiempo puedes rehacer o corregir tu revisión, leer hasta 15 paquetes de documentos y volver a descargar el informe y la carta sin pagar otra vez. No guardamos tu revisión en ningún sitio, así que conviene descargar el informe y la carta en cuanto pagas. El pase vive solo en ese navegador: en otro dispositivo, en una ventana privada o si borras los datos de navegación, se pierde, y «¿Ya has pagado?» solo lo recupera en el navegador con el que pagaste.',
  'faq.documents': '¿Qué pasa con mis documentos?',
  'faq.documents_answer':
    'Si subes tus documentos (la carta de despido, el finiquito, tus nóminas, el certificado de empresa o tu vida laboral), se envían cifrados a un servidor de Amazon Web Services en España, que se los pasa a un modelo de IA (Claude, de Anthropic, a través de Amazon Bedrock) dentro de la Unión Europea. El modelo indica qué es cada página, copia solo los datos que necesita el formulario y no calcula nada. Ni el servidor ni el modelo guardan el documento: se procesa en memoria y se descarta. Antes de subirlo te pedimos tu consentimiento, porque una nómina puede mostrar datos sensibles. Si prefieres no subir nada, puedes escribir los datos y nada sale de tu dispositivo.',

  'legal.updated': 'Actualizado el 9 de octubre de 2026',
  'legal.owner_name_label': 'Titular',
  'legal.owner_name': 'Endika Iglesias',
  'legal.owner_id_label': 'NIF',
  'legal.owner_id': '72406514F',
  'legal.owner_address_label': 'Domicilio',
  // Rendered only when not empty.
  'legal.owner_address': 'Calle Barranco del Novillo 26, 28051 Madrid',
  'legal.owner_contact_label': 'Contacto',
  'legal_notice.title': 'Aviso legal · eslojusto.es',
  'legal_notice.description':
    'Quién está detrás de eslojusto.es y qué hace y qué no hace su revisión del finiquito. Informa sobre la ley y no da asesoramiento jurídico.',
  'legal_notice.h1': 'Aviso legal',
  'legal_notice.who': 'Quién está detrás',
  'legal_notice.what_it_does': 'Qué hace la herramienta',
  'legal_notice.what_it_does_not': 'Qué no hace',
  'legal_notice.errors': 'Errores en las cifras',
  'legal_notice.conditions': 'Condiciones de venta del pase',
  'legal_notice.updated': 'Actualizado el 9 de octubre de 2026',
  'legal_notice.owner':
    'eslojusto.es es un proyecto personal. Estos son los datos de su titular (art. 10 de la Ley de Servicios de la Sociedad de la Información):',
  'legal_notice.seller': 'Lo vende {titular}, con NIF {nif}, titular de eslojusto.es.',
  'legal_notice.seller_address': 'Su domicilio es {domicilio}.',
  'not_found.title': 'Página no encontrada · eslojusto.es',
  'not_found.description':
    'Esta dirección no lleva a ninguna página de eslojusto.es. Desde aquí puedes ir a la revisión del finiquito o a la portada.',
  'not_found.h1': 'No encontramos esta página',
  'not_found.lead':
    'Puede que el enlace esté mal escrito o que la página haya cambiado de dirección.',
  'not_found.index': 'Páginas de eslojusto.es',
  'not_found.final_pay_text':
    'Calcula el mínimo legal de tu finiquito y compáralo con lo que te ofrece la empresa.',
  'not_found.home': 'Portada',
  'not_found.home_text': 'Qué revisa eslojusto.es y qué llegará después.',
  'privacy.title': 'Privacidad · eslojusto.es',
  'privacy.description':
    'Lo que escribes al revisar tu finiquito no sale de tu navegador. No hay cookies y los pasos se miden sin identificarte, con PostHog en la Unión Europea.',
  'privacy.h1': 'Privacidad',
  'privacy.summary': 'En resumen',
  'privacy.data': 'Qué se guarda y dónde',
  'privacy.data_review': 'Lo que escribes en la revisión',
  'privacy.data_theme': 'Tu elección de tema (claro u oscuro)',
  'privacy.data_analytics': 'Lo que se mide de tu visita',
  'privacy.data_server': 'Los registros del servidor',
  'privacy.data_documents': 'Los documentos que subes',
  'privacy.data_pass': 'Las lecturas gratis y el pase',
  'privacy.data_checkout': 'Tu revisión mientras pagas',
  'privacy.documents': 'Documentos y pagos',
  'privacy.analytics': 'Qué se mide',
  'privacy.who': 'Quién lo recibe',
  'privacy.cookies': 'Sin cookies',
  'privacy.legal_basis': 'Por qué se mide',
  'privacy.controller': 'Responsable, contacto y derechos',
  'privacy.rental.summary':
    'La revisión del alquiler funciona igual: lo que escribes se calcula en tu navegador y no se guarda.',
  'privacy.rental.data_review': 'Lo que escribes en la revisión del alquiler',
  'privacy.rental.data_review_where':
    'Solo en tu navegador, mientras la página está abierta. Las fechas de tu contrato, tus rentas y subidas, la fianza, los gastos y lo que te devolvieron se calculan en tu dispositivo y no se envían a ningún servidor ni se guardan. Al cerrar o recargar la página, desaparecen.',
  'privacy.rental.data_documents': 'Los documentos del alquiler que subes',
  'privacy.rental.data_documents_where':
    'Solo si eliges subirlos y das tu consentimiento: el contrato, los avisos de subida, los recibos, la factura de la agencia o la devolución de la fianza. Siguen el mismo camino que los demás documentos, por el mismo servidor en España y el mismo modelo en la Unión Europea, y tampoco se guardan. Un contrato de alquiler lleva datos personales tuyos y de otras personas: nombres y DNI de las partes y de quien avale, la dirección de la vivienda, cuentas bancarias o firmas. El modelo tiene orden de no copiar nombres de personas, DNI, NIE, cuentas, teléfonos, correos ni firmas, y el nombre del casero solo si es una empresa. Además, el servidor descarta cualquier texto copiado que aún lleve un DNI, una cuenta, un correo o un teléfono, y el nombre de un casero que no sea una empresa.',
  'privacy.rental.data_letters': 'Los datos de las cartas del alquiler',
  'privacy.rental.data_letters_where':
    'Lo que añades a las cartas (tu nombre, tu DNI o NIE, el nombre de tu casero, la dirección de la vivienda, la localidad y la cuenta IBAN en la que pides la fianza) solo rellena la carta en tu navegador. Las cartas y la cuenta no salen de tu dispositivo ni se guardan.',
  'privacy.rental.consent':
    'En el alquiler, el contrato y los demás papeles llevan datos personales tuyos y de terceros, como el casero, quien avale o la agencia: nombres, DNI, la dirección de la vivienda o cuentas bancarias. Por eso también te pedimos tu consentimiento explícito antes de subirlos, con la misma base jurídica. El modelo tiene orden de no copiar esos datos y el servidor descarta lo que aún los lleve; nada se guarda.',
  'privacy.rental.tracked_sheets': 'En la revisión del alquiler',
  'privacy.rental.tracked_sheets_what':
    'Lo mismo que en el finiquito con sus hojas (contrato, casero, entrada, renta, subidas, gastos, salida y resultado): que abres cada una, cuánto tardas en tramos y si vuelves atrás. Si un dato no se acepta, el nombre del campo, por ejemplo «fecha del contrato», nunca lo que escribiste. Qué pregunta frecuente abres o de qué partida miras «Cómo se calcula», por su tipo (honorarios, fianza, garantía, pago por adelantado, subida, gasto, devolución o intereses de la fianza), nunca su concepto. Y si pulsas «Empezar de nuevo».',
  'privacy.rental.tracked_scope': 'Si tu contrato queda fuera de la revisión',
  'privacy.rental.tracked_scope_what':
    'El motivo, de una lista cerrada: firmado antes del 6 de marzo de 2019, de temporada, por habitaciones, para otro uso, de vivienda protegida o de renta antigua.',
  'privacy.rental.tracked_review': 'Al revisar el alquiler',
  'privacy.rental.tracked_review_what':
    'En qué tramo se firmó el contrato (de marzo de 2019 a mayo de 2023, de mayo de 2023 a octubre de 2026, o después), si el casero es una persona o una empresa, si es gran tenedor (sí, no o no lo sabes), qué tipo de cláusula de actualización tiene y cuántas subidas añadiste, en un tramo: 0, 1, 2 o 3 o más. De cada grupo de partidas (honorarios, garantías, subidas, gastos y devolución de la fianza), el resultado que más pesa, como «pagas de más» o «dentro del límite», o que no hay ninguna. Qué dudas cambian algún resultado, como una norma pendiente de convalidación o un «No lo sé». Si la diferencia es cero, menor de 100 €, de 100 a 500 €, de 500 a 2.000 € o mayor, si se ofrece el pase, si el resultado sale en resumen o con el detalle del pase, cuántas veces has revisado en esta página y cuánto tardaste, en tramos. Nunca un importe, una fecha, tu comunidad, tu código postal ni nada de lo que pone tu contrato.',
  'privacy.rental.tracked_documents': 'Al leer documentos del alquiler',
  'privacy.rental.tracked_documents_what':
    'Los mismos avisos que con los demás documentos, con los tipos del alquiler (contrato, aviso de subida, recibo, factura de la agencia o devolución de la fianza) y, si una página no es del alquiler, ese motivo. Al descargar, si es el informe, la carta de la fianza o la de la renta y, de una carta, si rellenaste ninguno, alguno o todos sus datos, nunca cuáles. Nunca nada de lo que ponen los documentos ni de lo que escribes en las cartas.',

  'privacy.employment.summary':
    'La revisión del contrato de trabajo funciona igual: lo que escribes se calcula en tu navegador y no se guarda.',
  'privacy.employment.data_review': 'Lo que escribes en la revisión del contrato',
  'privacy.employment.data_review_where':
    'Solo en tu navegador, mientras la página está abierta. Las fechas de tu contrato, tu salario, tu jornada, tus nóminas, tus contratos anteriores, la oferta de empleo y tus respuestas se calculan en tu dispositivo y no se envían a ningún servidor ni se guardan. La respuesta sobre si tienes una discapacidad reconocida, que solo se pregunta en un contrato de práctica profesional, tampoco sale de tu navegador. Al cerrar o recargar la página, desaparece todo.',
  'privacy.employment.data_documents': 'Los documentos del contrato que subes',
  'privacy.employment.data_documents_where':
    'Solo si eliges subirlos y das tu consentimiento: el contrato con sus anexos, tus nóminas, la oferta de empleo o tu vida laboral. Siguen el mismo camino que los demás documentos, por el mismo servidor en España y el mismo modelo en la Unión Europea, y tampoco se guardan. Un contrato puede llevar tu DNI, tu domicilio y a veces una discapacidad; una nómina, la cuota de un sindicato. El modelo tiene orden de no copiar nombres de personas, DNI, NIE, número de la Seguridad Social, domicilios, cuentas, teléfonos, correos ni firmas, ni nada sobre discapacidad, salud, bajas o afiliación sindical, y el nombre de la empresa solo si es una empresa. Además, el servidor descarta cualquier texto copiado que aún lleve un DNI, un NIE, un número de la Seguridad Social, una cuenta, un correo o un teléfono, o que hable de salud, bajas, discapacidad, sindicatos o embargos.',
  'privacy.employment.data_letters': 'Los datos de las cartas del contrato',
  'privacy.employment.data_letters_where':
    'Lo que añades a las cartas (tu nombre, tu DNI o NIE, la empresa, el centro de trabajo y la localidad) solo rellena la carta en tu navegador. Las cartas no salen de tu dispositivo ni se guardan.',
  'privacy.employment.consent':
    'En el contrato de trabajo, el contrato, las nóminas y la vida laboral pueden mostrar datos especialmente protegidos, como una discapacidad, una baja o la afiliación a un sindicato por su cuota. Por eso también te pedimos tu consentimiento explícito antes de subirlos, con la misma base jurídica. El modelo tiene orden de no copiar esos datos y el servidor descarta los textos que aún los lleven; nada se guarda.',
  'privacy.employment.tracked_sheets': 'En la revisión del contrato',
  'privacy.employment.tracked_sheets_what':
    'Lo mismo que en el finiquito con sus hojas (relación, tipo de contrato, contratos anteriores, salario, nóminas, jornada, periodo de prueba, vacaciones, cláusulas, información, oferta y resultado): que abres cada una, cuánto tardas en tramos y si vuelves atrás. Si un dato no se acepta, el nombre del campo, por ejemplo «fecha de inicio», nunca lo que escribiste. Qué pregunta frecuente abres o de qué punto miras «Cómo se calcula», por su tipo (salario, tipo de contrato, encadenamiento, periodo de prueba, jornada, tiempo parcial, vacaciones y pagas, cláusulas, información, oferta o referencia), nunca su texto. Y si pulsas «Empezar de nuevo».',
  'privacy.employment.tracked_scope': 'Si tu contrato queda fuera de la revisión del contrato',
  'privacy.employment.tracked_scope_what':
    'El motivo, de una lista cerrada: una relación laboral especial, personal funcionario, un contrato por empresa de trabajo temporal, un contrato de relevo o tener menos de 18 años.',
  'privacy.employment.tracked_review': 'Al revisar el contrato',
  'privacy.employment.tracked_review_what':
    'En qué tramo empezó el contrato (antes de la reforma de marzo de 2022, en 2022 o 2023, en 2024 o 2025, o desde 2026), su tipo tal como lo eliges, si es a tiempo parcial, y si tienes contrato por escrito, eres técnico titulado o tu empresa tiene menos de 25 personas (sí, no o no lo sabes). De cada grupo de puntos (salario, tipo de contrato, encadenamiento, periodo de prueba, jornada, tiempo parcial, vacaciones, pagas extra, cláusulas e información), el resultado que más pesa, como «por debajo del mínimo» o «dentro del límite», que depende de un «No lo sé», o que no hay ninguno. En cuántos años queda el salario por debajo del SMI (0, 1, 2 o 3 o más) y si algún año aún no tiene SMI publicado. Cuántas nóminas añadiste, en un tramo (0, de 1 a 3, o 4 o más), y si añadiste tu vida laboral o una oferta y si el contrato nombra un convenio, nunca cuál. Si la diferencia es cero, menor de 100 €, de 100 a 500 €, de 500 a 2.000 € o mayor, si se ofrece el pase, si el resultado sale en resumen o con el detalle del pase, cuántas veces has revisado en esta página y cuánto tardaste, en tramos. Nunca un importe, una fecha, el nombre de la empresa o del convenio, tu respuesta sobre discapacidad ni nada de lo que pone tu contrato.',
  'privacy.employment.tracked_documents': 'Al leer documentos del contrato',
  'privacy.employment.tracked_documents_what':
    'Los mismos avisos que con los demás documentos, con los tipos del contrato (contrato, nómina, vida laboral u oferta de empleo). Al descargar, si es el informe, la carta a la empresa, la carta para pedir la información por escrito o la petición del certificado de contratos temporales y, de una carta, si rellenaste ninguno, alguno o todos sus datos, nunca cuáles. Nunca nada de lo que ponen los documentos ni de lo que escribes en las cartas.',

  'legal_notice.employment': 'La revisión del contrato de trabajo',
  'legal_notice.employment.does':
    'Compara un contrato de trabajo de relación laboral común en España con lo que garantiza la ley: el salario frente al SMI de cada año, el tipo de contrato y su temporalidad, el encadenamiento de contratos con tu vida laboral, el periodo de prueba, la jornada y los descansos, el tiempo parcial, las vacaciones y las pagas extra, los límites que la ley pone a algunas cláusulas y la información que la empresa tiene que darte por escrito (Real Decreto 723/2026). Cada punto lleva la norma de la que sale, con su vigencia. Cuando la ley dice que un contrato temporal pasa a fijo, cita el artículo con su texto; no decide tu caso.',
  'legal_notice.employment.does_not':
    'No lee convenios colectivos ni sus tablas: lo que depende de tu convenio lo dice, y el salario de tu categoría solo lo compara si lo metes tú. No valora si la causa de un contrato temporal está justificada ni si una cláusula es válida más allá de lo que la ley fija por escrito, como su duración o su compensación. No calcula el salario neto, el IRPF ni las cotizaciones. No revisa relaciones laborales especiales, contratos por empresa de trabajo temporal, contratos de relevo ni a menores de 18 años, y en los contratos anteriores al 30 de marzo de 2022 no revisa la temporalidad.',
  'legal_notice.employment.beta':
    'Es una sección en pruebas: puede tener errores mientras se revisa con casos reales. Si ves un punto que no cuadra con la ley, puedes escribir a',
  'legal_notice.employment.pass':
    'En la revisión del contrato, el mismo pase muestra el detalle de cada punto y permite descargar un informe en PDF y la carta a la empresa, también generados en tu dispositivo. La carta para pedir la información por escrito y la petición del certificado de contratos temporales se descargan gratis. El pase vale para cualquier revisión durante sus {dias} días.',

  'legal_notice.rental': 'La revisión del alquiler',
  'legal_notice.rental.does':
    'Compara lo que pagas o has pagado por un alquiler de vivienda habitual, con contrato firmado desde el 6 de marzo de 2019, con lo que permite la ley: honorarios de la agencia, fianza y garantías, subidas anuales, gastos y devolución de la fianza con sus intereses. Cada partida lleva la norma de la que sale, con su vigencia y su estado.',
  'legal_notice.rental.pending':
    'Varias normas del alquiler cambiaron en 2026, y algunas están pendientes de que el Congreso las convalide. Cada regla dice si está en vigor, pendiente de convalidación o derogada. Cuando un resultado depende de una norma pendiente, da las dos cuentas y el total solo suma la más baja; si depende de un decreto que el Congreso derogó, da las dos cuentas y no la suma.',
  'legal_notice.rental.does_not':
    'No valora desperfectos ni si un descuento de la fianza procede, no calcula el tope de la renta inicial en las zonas tensionadas, no aplica las normas propias de cada comunidad autónoma y no comprueba prórrogas ni preavisos más allá de sus fechas. Tampoco revisa contratos de temporada, por habitaciones, para otro uso ni firmados antes del 6 de marzo de 2019.',
  'legal_notice.rental.beta':
    'Es una sección en pruebas: puede tener errores mientras se revisa con casos reales. Si ves una cifra que no cuadra con la ley, puedes escribir a',
  'legal_notice.rental.pass':
    'En la revisión del alquiler, el mismo pase muestra el detalle de cada partida y permite descargar un informe en PDF y, si la revisión tiene cifras para ellas, cartas sobre la fianza y las subidas, también generados en tu dispositivo. El pase vale para cualquier revisión durante sus {dias} días, también la del finiquito.',

  'client.theme.to_dark': 'Tema: pasar a oscuro',
  'client.theme.to_light': 'Tema: pasar a claro',
  'client.other_language.aria': 'Otro idioma',
  'client.other_language.text': 'Esta página también está en {idioma}.',
  'client.other_language.close': 'Cerrar el aviso de idioma',

  'client.summary.shortfall':
    'Con las cifras que has metido, a tu finiquito le podría faltar dinero:',
  'client.summary.all_match':
    'Tu finiquito coincide con el mínimo legal en todas las partidas que se pueden comprobar.',
  'client.summary.nothing_short':
    'Ninguna de las cifras que has metido está por debajo del mínimo legal.',
  'client.summary.no_figures':
    'Sin las cifras de tu finiquito no hay nada que comparar; puedes meterlas en la hoja «Tu finiquito».',
  'client.summary.missing': '{partida}: podrían faltarte unos {importe}.',
  'client.summary.missing_little': '{partida}: podrían faltarte menos de 10 €.',
  'client.summary.deduction': '{partida}: el descuento podría pasarse en unos {importe}.',
  'client.summary.deduction_little': '{partida}: el descuento podría pasarse en menos de 10 €.',
  'client.summary.benefit_yes':
    'Esta causa da derecho a paro: {cuantia} al mes en bruto los primeros 6 meses, si sumas al menos 360 días cotizados en los últimos 6 años.',
  'client.summary.benefit_yes_no_figures':
    'Esta causa da derecho a paro si sumas al menos 360 días cotizados en los últimos 6 años; la cuantía depende de tus últimas nóminas.',
  'client.summary.benefit_no': 'Esta causa no da derecho a paro.',
  'client.summary.benefit_unknown':
    'El paro depende de la causa: un despido o el fin de un contrato temporal dan derecho si sumas al menos 360 días cotizados en los últimos 6 años; una baja voluntaria, no.',
  'client.summary.dismissal_deadline':
    'El plazo para impugnar un despido es de 20 días hábiles (art. 59.3 ET).',
  'client.summary.benefit_deadline':
    'Para cobrar el paro tienes que inscribirte como demandante de empleo y pedirlo en los 15 días hábiles siguientes al fin del contrato. Si tu finiquito paga vacaciones no disfrutadas, el plazo cuenta desde que terminan esos días (arts. 266 y 268 LGSS).',

  'client.status.below_minimum': 'Por debajo del mínimo legal: faltan {importe}',
  'client.status.matches': 'Coincide con el mínimo legal',
  'client.status.above_minimum': 'Por encima del mínimo legal',
  'client.status.deduction_too_high': 'El descuento supera el máximo: {importe}',
  'client.status.deduction_within_max': 'Descuento dentro del máximo',
  'client.status.not_checkable': 'No se puede comprobar sin tu convenio',
  'client.status.no_employer_figure': 'No has metido la cifra de tu finiquito',
  'client.status.no_severance': 'No te corresponde indemnización por ley en este caso',
  'client.status.no_severance_disciplinary':
    'Si el despido es procedente, no hay indemnización (art. 55.7 ET). Si se declarara improcedente, la referencia sería {importe}; el plazo para impugnar un despido es de 20 días hábiles (art. 59.3 ET).',
  'client.status.not_checkable_days': 'No se puede comprobar sin los días que has disfrutado',
  'client.status.not_checkable_cause': 'Sin la causa no se calcula la indemnización',
  'client.status.not_checkable_erte': 'No se puede comprobar sin tu salario de antes del ERTE',
  'client.range.minimum': 'Mínimo legal',
  'client.range.maximum_deduction': 'Máximo que pueden descontarte',
  'client.range.agreement': 'Depende de tu convenio',
  'client.range.days': 'Depende de los días que has disfrutado',
  'client.range.cause': 'Depende de la causa',
  'client.range.erte': 'Depende de tu salario de antes del ERTE',
  'client.range.between': 'entre {minimo} y {maximo}',
  'client.no_figure': 'Sin cifra',
  'client.agreement_may_improve': 'Tu convenio puede mejorar esta cifra (más días, otro devengo).',
  'client.or_more.ere_agreement':
    'O más, según el acuerdo del ERE: el acuerdo del periodo de consultas puede mejorar este mínimo, y suele hacerlo (art. 51.2 ET). Esta revisión no lo conoce.',
  'client.source.in_force': 'en vigor desde {fecha}',
  'client.unfair_reference':
    'Si un juzgado declarase improcedente el despido, la indemnización sería de {importe}.',
  'client.unfair_reference_objective':
    'Referencia: si un juzgado declarase improcedente el despido, la indemnización sería de {importe} (33 días de salario por año trabajado, 45 por el tiempo anterior al 12 de febrero de 2012, con sus topes). Es la cifra con la que suelen compararse los acuerdos de mejora.',

  'client.other_contracts.contract': 'Otro trabajo {n}',
  'client.other_contracts.start': 'Fecha de alta del trabajo {n}',
  'client.other_contracts.end': 'Fecha de baja del trabajo {n}',
  'client.other_contracts.remove': 'Quitar el otro trabajo {n}',

  'client.unemployment.status.yes':
    'Esta causa da derecho a paro si cumples el resto de requisitos',
  'client.unemployment.status.no': 'No da derecho a paro',
  'client.unemployment.status.unknown': 'Depende de la causa',
  'client.unemployment.reason.resignation':
    'Dejar el trabajo por decisión propia no es situación legal de desempleo (art. 267.2.a LGSS).',
  'client.unemployment.reason.fixed_term_end':
    'El fin de un contrato temporal es situación legal de desempleo, salvo que lo terminaras tú (art. 267.1.a.6.º LGSS).',
  'client.unemployment.reason.objective_dismissal':
    'El despido objetivo es situación legal de desempleo (art. 267.1.a.4.º LGSS).',
  'client.unemployment.reason.collective_dismissal':
    'El despido colectivo es situación legal de desempleo (art. 267.1.a.1.º LGSS).',
  'client.unemployment.reason.unfair_dismissal':
    'El despido es situación legal de desempleo (art. 267.1.a.3.º LGSS).',
  'client.unemployment.reason.disciplinary_dismissal':
    'El despido disciplinario también es situación legal de desempleo, aunque no se impugne (arts. 267.1.a.3.º y 268.4 LGSS).',
  'client.unemployment.reason.unknown':
    'Depende de la causa: un despido o el fin de un contrato temporal son situación legal de desempleo; una baja voluntaria, no (art. 267 LGSS).',
  'client.unemployment.about': 'unos {importe}',
  'client.unemployment.amount.two':
    'Serían {tramo1} al mes los primeros 6 meses y {tramo2} después, en bruto.',
  'client.unemployment.amount.one': 'Serían {tramo1} al mes, en bruto.',
  'client.unemployment.amount.children_unknown':
    'Es un margen porque no has dicho cuántos hijos o hijas tienes a tu cargo: el mínimo y el máximo cambian según cuántos tengas.',
  'client.unemployment.deduction':
    'De ahí se descuentan unos {ss} al mes de Seguridad Social y el IRPF que te corresponda, que esta revisión no calcula.',
  'client.unemployment.no_figures':
    'Depende de tus últimas nóminas. La cantidad sale de lo cotizado en los últimos 180 días (art. 270.1 LGSS) y este contrato dura menos, así que entra otro trabajo que esta revisión no conoce.',
  'client.unemployment.no_figures_base':
    'Con este salario no podemos estimar la cuantía (puede ser jornada parcial); depende de tus bases de cotización.',
  'client.unemployment.duration.maximum': 'Unos {dias} días ({meses} meses), el máximo.',
  'client.unemployment.duration.at_least':
    'Al menos unos {dias} días ({meses} meses) solo por este trabajo. Si cotizaste en otros trabajos en los últimos 6 años y no los usaste para otro paro, puede ser más; lo ves en tu vida laboral.',
  'client.unemployment.duration.exact':
    'Unos {dias} días ({meses} meses), con las fechas que has puesto.',
  'client.unemployment.duration.up_to':
    'Hasta unos {dias} días ({meses} meses); si cobraste paro después de alguno de estos contratos, esos días ya se usaron y puede ser menos (art. 269.2 LGSS).',
  'client.unemployment.duration.depends':
    'Depende de lo que hayas cotizado en otros trabajos: con lo que sabe esta revisión no se llega a 360 días. Lo ves en tu vida laboral.',
  'client.unemployment.duration.holiday_note':
    'Las vacaciones pagadas y no disfrutadas también cuentan como cotizadas (art. 269.4 LGSS) y aquí no se suman, así que puede salir algo más.',
  'client.unemployment.qualifying.this_contract':
    'Solo con este contrato ya tienes los 360 días cotizados que hacen falta en los últimos 6 años (art. 269.1 LGSS).',
  'client.unemployment.qualifying.other_contracts':
    'Con este contrato y los que has añadido sumas {dias} días cotizados; hacen falta 360 en los últimos 6 años (art. 269.1 LGSS).',
  'client.unemployment.qualifying.depends':
    'Con este contrato llevas {dias} días cotizados; hacen falta 360 en los últimos 6 años (art. 269.1 LGSS). Si trabajaste antes, lo ves en tu vida laboral.',
  'client.unemployment.qualifying.depends_other_contracts':
    'Con estos contratos sumas {dias} días cotizados; hacen falta 360 en los últimos 6 años que no hayas usado ya para otro paro (art. 269 LGSS). Lo ves en tu vida laboral.',

  'client.item.pending_salary': 'Salario del mes de la baja',
  'client.item.holiday_pay': 'Vacaciones devengadas y no disfrutadas',
  'client.item.extra_pay': 'Pagas extra devengadas',
  'client.item.severance': 'Indemnización',
  'client.item.employer_notice': 'Preaviso no dado por la empresa',
  'client.item.notice_deduction': 'Descuento por preaviso no cumplido',

  'client.calculation.pending_salary':
    '{salario} × {dias} días trabajados del mes, entre 30 días (mes comercial) y {dias_mes} días (mes natural): de {desde} a {hasta}.',
  'client.calculation.holiday_pay.accrual':
    '{anuales} días {unidad} al año: por días, × {dias}/{dias_ejercicio} días trabajados en {ejercicio} = {por_dias} días devengados; por meses, × {meses}/12 = {por_meses} días devengados',
  'client.calculation.holiday_pay.accrual_from_start':
    '{anuales} días {unidad} al año: por días, × {dias}/{dias_ejercicio} días trabajados en {ejercicio} = {por_dias} días devengados; por meses, × {meses}/12 = {por_meses} días devengados; por meses desde el alta, × {meses_alta}/12 = {por_meses_alta} días devengados',
  'client.calculation.holiday_pay.days_unknown':
    '{devengo}. Sin saber cuántos días has disfrutado este año no se puede comprobar.',
  'client.calculation.holiday_pay.over_taken':
    '{devengo}, menos {disfrutados} disfrutados: has disfrutado más días de los devengados. Que proceda o no un descuento por los días disfrutados de más depende del convenio.',
  'client.calculation.holiday_pay.pending':
    '{devengo}, menos {disfrutados} disfrutados = entre {minimo} y {maximo} días naturales pendientes × {diario_mensual} (salario mensual / 30) o {diario_anual} (salario anual / 365) al día.',
  'client.calculation.holiday_pay.pending_working':
    '{devengo}, menos {disfrutados} disfrutados = entre {minimo} y {maximo} días laborables pendientes. {minimo_laborables} días laborables equivalen a 30 naturales, así que son entre {minimo_naturales} y {maximo_naturales} días naturales × {diario_mensual} (salario mensual / 30) o {diario_anual} (salario anual / 365) al día.',
  'client.calculation.holiday_pay.counted':
    'Hemos contado {disfrutados} días {unidad} disfrutados de {anuales} al año.',
  'client.calculation.holiday_pay.unit.working': 'laborables ({dias_semana} por semana)',
  'client.calculation.holiday_pay.unit.calendar': 'naturales',
  'client.calculation.methods.two_counts':
    'Las empresas lo calculan por días naturales o por meses (meses enteros más los días del mes en curso / 30); se muestran las dos cuentas.',
  'client.calculation.methods.three_counts':
    'Las empresas lo calculan por días naturales o por meses (meses enteros más los días sueltos / 30), contando los meses por calendario o desde tu fecha de alta; se muestran las tres cuentas.',
  'client.calculation.extra_pay.share':
    '{importe} × {dias}/{total} días = {por_dias} o × {meses}/{meses_periodo} meses = {por_meses}',
  'client.calculation.extra_pay.share_from_start':
    '{importe} × {dias}/{total} días = {por_dias} o × {meses}/{meses_periodo} meses = {por_meses} o × {meses_alta}/{meses_periodo} meses desde el alta = {por_meses_alta}',
  'client.calculation.extra_pay.annual':
    'Devengo anual: {verano} + {navidad}, suponiendo que no se ha cobrado nada del periodo abierto.',
  'client.calculation.extra_pay.semiannual':
    'Devengo semestral: {paga}, suponiendo que no se ha cobrado nada del periodo abierto.',
  'client.calculation.extra_pay.unknown':
    'Sin saber cómo se devengan las pagas, entre el devengo semestral y el anual ({verano} + {navidad}; o bien {paga}).',
  'client.calculation.extra_pay.same_count_for_both':
    'Cada cuenta se aplica igual a las dos pagas.',
  'client.calculation.extra_pay.summer_in_last_payslip':
    'La paga de verano se suele cobrar en junio o julio: puede ir ya en la nómina de ese mes, así que el mínimo de esa paga parte de 0 €.',
  'client.calculation.extra_pay.christmas_in_last_payslip':
    'La paga de Navidad se suele cobrar en diciembre: puede ir ya en la nómina de ese mes, así que el mínimo de esa paga parte de 0 €.',
  'client.calculation.extra_pay.single':
    'Con una sola paga extra no se sabe cuál es (verano o Navidad), por lo que se muestra el rango entre ambas.',
  'client.calculation.extra_pay.over_two':
    'Solo se calculan las dos pagas habituales (verano y Navidad); las demás dependen del convenio.',
  'client.calculation.employer_notice':
    '{preaviso} días de preaviso − {recibidos} recibidos = {faltan} días × entre {minimo} y {maximo} al día.',
  'client.calculation.notice_deduction':
    '{convenio} días de preaviso del convenio − {dados} dados = {faltan} días × {diario} al día como máximo.',
  'client.calculation.notice_deduction.agreement_unknown':
    'El plazo de preaviso de una dimisión lo fija el convenio; sin ese dato no se puede comprobar el descuento.',
  'client.calculation.severance.unfair': '{meses} meses × 2,75 = {dias} días.',
  'client.calculation.severance.objective': '{meses} meses × 20/12 = {dias} días.',
  'client.calculation.severance.collective':
    'En un despido colectivo, cada despido sigue el art. 53.1 ET (art. 51.4 ET): 20 días por año, prorrateando por meses, con un tope de 12 mensualidades.',
  'client.calculation.severance.cause_unknown':
    'La indemnización depende de la causa y sin ella no se calcula. Lo que no depende de la causa (el salario del mes, las vacaciones y las pagas extra) sí se revisa. La causa está en la carta de despido y en el certificado de empresa, en la casilla «causa de la situación legal de desempleo».',
  'client.calculation.severance.erte_reduced':
    'Con un ERTE de reducción de jornada, la indemnización se calcula con el salario de antes de la reducción (STS 678/2018, de 27 de junio): {salario} al mes.',
  'client.calculation.severance.erte_suspended':
    'Con un ERTE de suspensión, los meses suspendidos no cuentan: la indemnización se calcula con lo cobrado en los meses trabajados (STS 638/2022, de 7 de julio): {salario} al mes.',
  'client.calculation.severance.erte_salary_unknown':
    'Con un ERTE, la indemnización debería calcularse con el salario completo de antes del ERTE, no con el de tus últimas nóminas (STS 678/2018 y STS 638/2022). Sin ese salario no se da una cifra.',
  'client.calculation.severance.first_stretch':
    'Tramo hasta 11-02-2012: {meses} meses × 3,75 = {dias} días.',
  'client.calculation.severance.second_stretch':
    'Tramo desde 12-02-2012: {meses} meses × 2,75 = {dias} días.',
  'client.calculation.severance.over_cap':
    'Supera {tope} días: el tramo posterior no suma y el máximo es {maximo} días.',
  'client.calculation.severance.cap': 'Tope de {tope} días.',
  'client.calculation.severance.total': 'Total {dias} días × {diario}/día.',
  'client.calculation.severance.cgpj_range':
    'La calculadora del CGPJ y su guía cuentan distinto los meses en este caso (un mes de diferencia); por eso damos un margen entre ambas cifras.',
  'client.calculation.severance.fixed_term': '{dias} días × {dias_anuales}/365 × {diario}/día',
  'client.calculation.severance.fixed_term_before_2001':
    'Los contratos temporales firmados antes del 4 de marzo de 2001 no tienen esta indemnización: se rigen por la norma de entonces (DT 8.ª ET). Si tu convenio la prevé, revísalo.',
  'client.calculation.severance.replacement':
    'Los contratos de sustitución no generan indemnización por fin de contrato.',
  'client.calculation.severance.training':
    'Los contratos de formación no generan indemnización por fin de contrato.',
  'client.calculation.severance.resignation': 'La dimisión voluntaria no genera indemnización.',
  'client.calculation.severance.disciplinary':
    'El despido disciplinario declarado procedente no genera indemnización. Si se declara improcedente, se calcula como un despido improcedente.',

  'client.calculation.late_interest':
    '10 % al año × {base} × {dias} días desde la baja / 365 = {importe}. El Tribunal Supremo lo aplica a las deudas de salario aunque la cantidad se discuta (STS de 17 de junio de 2014, rcud 1315/2013).',
  'client.calculation.late_interest.scope':
    'Solo cuenta lo que es salario: el salario del mes de la baja y las pagas extra, por su mínimo legal. La indemnización no lleva este interés, y las vacaciones no disfrutadas no se suman porque es dudoso que lo lleven.',

  'client.warning.cause_unknown.title': 'Sin la causa',
  'client.warning.cause_unknown':
    'Sin la causa solo se revisan las partidas que no dependen de ella: el salario del mes de la baja, las vacaciones y las pagas extra. La indemnización no se calcula. La causa está en la carta de despido y en el certificado de empresa, en la casilla «causa de la situación legal de desempleo».',
  'client.warning.null_dismissal.title': 'Este despido podría ser nulo',
  'client.warning.null_dismissal.protected':
    'Por lo que has marcado, el despido podría ser nulo (art. 55.5 ET), salvo que el motivo no tenga nada que ver con esa situación.',
  'client.warning.null_dismissal.sick_leave':
    'Despedir a alguien de baja médica podría ser nulo si el motivo es la enfermedad: la Ley 15/2022 prohíbe discriminar por enfermedad o condición de salud y hace nulos esos actos (arts. 2.1 y 26). Los tribunales todavía no lo aplican de forma uniforme.',
  'client.warning.null_dismissal.effects':
    'Si un juzgado lo declarase nulo, la empresa tendría que readmitirte y pagarte los salarios que dejaste de cobrar (arts. 55.6 y 53.4 ET). Esta revisión no calcula cifras para ese caso.',
  'client.warning.null_dismissal.deadline':
    'Para impugnar el despido hay 20 días hábiles desde la fecha de baja (art. 59.3 ET); presentar la papeleta de conciliación interrumpe el plazo. Consulta a un abogado laboralista o a un sindicato antes de que pasen.',
  'client.warning.erte_unknown.title': 'Si estabas en un ERTE',
  'client.warning.erte_unknown':
    'Con un ERTE, la indemnización debería calcularse con el salario completo de antes del ERTE: con jornada reducida, el de antes de la reducción (STS 678/2018); con el contrato suspendido, lo cobrado en los meses trabajados (STS 638/2022). Si alguna de tus últimas nóminas es de un ERTE, la indemnización de esta revisión puede quedarse corta.',
  'client.warning.late_interest.title': 'Si aún no te han pagado',
  'client.warning.late_interest.amount':
    'Lo que es salario lleva un interés por el retraso del 10 % al año (art. 29.3 ET): unos {importe} desde la baja hasta hoy. La indemnización no lo lleva, y las vacaciones no disfrutadas no se suman porque es dudoso que lo lleven.',
  'client.warning.late_interest.none':
    'Lo que es salario lleva un interés por el retraso del 10 % al año (art. 29.3 ET), contado desde la baja; hoy todavía no suma nada. La indemnización no lo lleva, y las vacaciones no disfrutadas no se suman porque es dudoso que lo lleven.',
  'client.warning.late_interest.days_left':
    'Para reclamar las cantidades del finiquito hay un año desde la baja (art. 59.1 y 59.2 ET): te quedan {dias} días para reclamarlo.',
  'client.warning.late_interest.one_day_left':
    'Para reclamar las cantidades del finiquito hay un año desde la baja (art. 59.1 y 59.2 ET): te queda 1 día para reclamarlo.',
  'client.warning.late_interest.last_day':
    'Para reclamar las cantidades del finiquito hay un año desde la baja (art. 59.1 y 59.2 ET): hoy es el último día.',
  'client.warning.late_interest.lapsed':
    'Ha pasado más de un año desde la baja, así que puede haber prescrito (art. 59.1 y 59.2 ET), salvo que algo interrumpiera el plazo. Por eso no se cuenta el interés.',
  'client.warning.late_interest.other_deadline':
    'Es un plazo distinto de los 20 días hábiles para impugnar un despido (art. 59.3 ET).',

  'client.unchecked.net_pay': 'El neto: retenciones de IRPF y cotizaciones',
  'client.unchecked.bonuses':
    'Pluses, complementos, horas extra y comisiones de tu convenio o contrato',
  'client.unchecked.additional_extra_pay': 'Pagas extra además de las dos ordinarias',
  'client.unchecked.dismissal_cause':
    'Si la causa de despido está justificada, algo que decide un juzgado',
  'client.unchecked.processing_wages': 'Salarios de tramitación',

  'client.error.missing_cause': 'Elige cómo terminó tu contrato',
  'client.error.missing_fixedTermType': 'Elige el tipo de contrato temporal',
  'client.error.missing_startDate': 'Escribe la fecha de alta',
  'client.error.missing_endDate': 'Escribe la fecha de baja',
  'client.error.missing_monthlySalary': 'Escribe tu salario bruto mensual',
  'client.error.missing_extraPayProrated': 'Elige sí o no',
  'client.error.missing_extraPayCount': 'Escribe cuántas pagas extra tienes',
  'client.error.missing_extraPayAmount': 'Falta el importe',
  'client.error.missing_annualHolidayDays': 'Escribe cuántos días de vacaciones tienes al año',
  'client.error.missing_holidayDaysTaken':
    'Escribe cuántos días has disfrutado este año (0 si ninguno) o marca «No lo sé»',
  'client.error.missing_value': 'Falta este dato',
  'client.error.invalid_date': 'La fecha no es válida',
  'client.error.invalid_amount': 'No se entiende la cifra: escríbela como 1.234,56',
  'client.error.invalid_start_date': 'La fecha de alta no es válida',
  'client.error.invalid_end_date': 'La fecha de baja no es válida',
  'client.error.end_before_start': 'La fecha de baja es anterior a la de alta',
  'client.error.end_too_far_ahead': 'La fecha de baja no puede estar a más de un año en el futuro',
  'client.error.salary_out_of_range':
    'El salario mensual debe ser mayor que 0 y no pasar de 1.000.000 €',
  'client.error.extra_pay_count_out_of_range': 'El número de pagas debe estar entre 0 y 6',
  'client.error.extra_pay_amount_out_of_range':
    'El importe de la paga extra debe ser mayor que 0 y no pasar de 1.000.000 €',
  'client.error.annual_holidays_out_of_range':
    'Los días naturales de vacaciones al año deben estar entre 0 y 60',
  'client.error.holidays_taken_out_of_range':
    'Los días naturales disfrutados deben estar entre 0 y 60',
  'client.error.annual_working_holidays_out_of_range':
    'Los días laborables de vacaciones al año no pueden pasar del doble del mínimo de la ley',
  'client.error.working_holidays_taken_out_of_range':
    'Los días laborables disfrutados no pueden pasar del doble del mínimo de la ley',
  'client.error.work_week_out_of_range': 'Escribe cuántos días trabajas a la semana, de 1 a 7',
  'client.error.notice_out_of_range': 'Los días de preaviso deben estar entre 0 y 90',
  'client.error.missing_fixed_term_type': 'Indica el tipo de contrato temporal',
  'client.error.missing_children': 'Elige una opción; «Prefiero no decirlo» también vale',
  'client.error.missing_benefitDrawnSince': 'Elige sí, no o «No lo sé»',
  'client.error.other_contract_invalid_start_date':
    'La fecha de alta de este contrato no es válida',
  'client.error.other_contract_invalid_end_date': 'La fecha de baja de este contrato no es válida',
  'client.error.other_contract_end_before_start':
    'La fecha de baja de este contrato es anterior a la de alta',
  'client.error.other_contract_ends_after_this_one':
    'La fecha de baja de este contrato es posterior a la del contrato que estás revisando',
  'client.documents.mark': 'Leído del documento · confianza {nivel}',
  'client.documents.mark_derived': 'Sale del total de tu nómina · confianza {nivel}',
  'client.documents.mark_low': ': compruébalo',
  'client.documents.mark_conflict':
    'Leído del documento · otro documento dice otra cosa: compáralos',
  'client.documents.confidence.high': 'alta',
  'client.documents.confidence.medium': 'media',
  'client.documents.confidence.low': 'baja',
  'client.documents.status.preparing': 'Preparando los archivos…',
  'client.documents.status.preparing_n': 'Preparando {k} de {total}…',
  'client.documents.status.captcha': 'Comprobando que no eres un robot…',
  'client.documents.status.reading':
    'Leyendo los documentos. Puede tardar hasta dos minutos si son muchas páginas.',
  'client.documents.photo': 'Foto {n}',
  'client.documents.pdf_page': '{nombre}, página {n}',
  'client.documents.pdf_page_detail': 'Página {n} de {total}',
  'client.documents.pdf_added': 'Añadido: {nombre}. Páginas: {total}.',
  'client.documents.pdf_pages_fit':
    'De {nombre} caben las páginas 1 a {k} de {total}: como mucho 25 fotos o páginas en total.',
  'client.documents.count': 'Llevas {n} de 25.',
  'client.documents.status.opening': 'Abriendo el PDF…',
  'client.documents.remove': 'Quitar',
  'client.documents.remove_label': 'Quitar {nombre}',
  'client.documents.added_one': 'Añadido: {nombre}. Llevas {n} de 25.',
  'client.documents.added_many': 'Añadidos {k} archivos. Llevas {n} de 25.',
  'client.documents.already_added': 'Ya estaba añadido: {nombre}.',
  'client.documents.removed': 'Quitado: {nombre}. Llevas {n} de 25.',
  'client.documents.left_out_one': '1 archivo no se ha añadido.',
  'client.documents.left_out_many': '{k} archivos no se han añadido.',
  'client.documents.kind.settlement_proposal': 'Propuesta de finiquito',
  'client.documents.kind.payslip': 'Nómina',
  'client.documents.kind.payslip_month': 'Nómina de {mes}',
  'client.documents.kind.dismissal_letter': 'Carta de despido',
  'client.documents.kind.company_certificate': 'Certificado de empresa',
  'client.documents.kind.settlement_agreement': 'Acuerdo o acta de conciliación',
  'client.documents.kind.work_history': 'Vida laboral',
  'client.documents.kind.pages': '{nombre} ({n} páginas)',
  'client.documents.kind.other_one': '1 página sin datos útiles',
  'client.documents.kind.other_many': '{n} páginas sin datos útiles',
  'client.documents.source.settlement_proposal': 'la propuesta de finiquito',
  'client.documents.source.payslip': 'la nómina',
  'client.documents.source.dismissal_letter': 'la carta de despido',
  'client.documents.source.company_certificate': 'el certificado de empresa',
  'client.documents.source.settlement_agreement': 'el acuerdo o acta de conciliación',
  'client.documents.source.work_history': 'la vida laboral',
  'client.documents.field.startDate': 'Fecha de alta',
  'client.documents.field.endDate': 'Fecha de baja',
  'client.documents.field.cause': 'Cómo terminó el contrato',
  'client.documents.field.fixedTermType': 'Tipo de contrato temporal',
  'client.documents.field.pending_salary': 'Salario pendiente',
  'client.documents.field.holiday_pay': 'Vacaciones no disfrutadas',
  'client.documents.field.extra_pay': 'Pagas extra',
  'client.documents.field.severance': 'Indemnización',
  'client.documents.field.employer_notice': 'Falta de preaviso',
  'client.documents.field.notice_deduction': 'Descuento por preaviso',
  'client.documents.field.annualHolidayDays': 'Días de vacaciones al año',
  'client.documents.field.holidayDaysTaken': 'Días de vacaciones disfrutados',
  'client.documents.field.deposit': 'Fianza',
  'client.documents.kind.lease': 'Contrato de alquiler',
  'client.documents.kind.rent_update_notice': 'Aviso de subida de la renta',
  'client.documents.kind.rent_receipt': 'Recibo del alquiler',
  'client.documents.kind.rent_receipt_month': 'Recibo de {mes}',
  'client.documents.kind.agency_invoice': 'Factura de la agencia',
  'client.documents.kind.deposit_return': 'Devolución de la fianza',
  'client.documents.source.lease': 'el contrato',
  'client.documents.source.rent_update_notice': 'el aviso de subida',
  'client.documents.source.rent_receipt': 'el recibo',
  'client.documents.source.agency_invoice': 'la factura de la agencia',
  'client.documents.source.deposit_return': 'la devolución de la fianza',
  'client.documents.agreement_offer': 'El acuerdo que has subido ofrece {importe} en total.',
  'client.documents.conflict':
    '{dato}: los documentos no dicen lo mismo. Se ha usado lo que pone {fuente}; compáralo con los demás.',
  'client.documents.done':
    'Se han leído {n} datos. Pasa por cada hoja y confírmalos antes de revisar: los leídos llevan la marca «Leído del documento».',
  'client.documents.done_one':
    'Se ha leído 1 dato. Pasa por cada hoja y confírmalo antes de revisar: lleva la marca «Leído del documento».',
  'client.documents.done_none':
    'No se ha leído ningún dato que sirva para el formulario. Puedes subir otros documentos o rellenar a mano.',
  'client.documents.holiday_unit':
    'Los documentos no siempre dicen si los días de vacaciones son laborables o naturales: compruébalo en la hoja de vacaciones.',
  'client.documents.done_low':
    'Algún dato se ha leído con confianza baja: compáralo con tus documentos.',
  'client.documents.reads_differ':
    'Algún dato de estos documentos no dice lo mismo que lo leído antes: se ha dejado lo que ya había, con una marca para que lo compares con tus documentos.',
  'client.documents.typed_differs':
    'Algún dato que escribiste no dice lo mismo que estos documentos: se ha dejado lo que escribiste. Compáralo con tus documentos.',
  'client.documents.recalculated':
    'Algunas cifras que salen de tus documentos se han vuelto a calcular con todo lo leído: compruébalas.',
  'client.documents.rows_full':
    'En alguna lista ya no caben todas las filas leídas: se han dejado las que ya tenías y se han añadido las que caben. Compara la lista con tus documentos y completa lo que falte.',
  'client.documents.check.end_before_start':
    'La fecha de baja leída es anterior a la de alta: revisa las dos.',
  'client.documents.check.items_do_not_sum':
    'Las partidas leídas no suman el total del documento: revisa las cifras.',
  'client.documents.check.period_end_before_start':
    'Las fechas del periodo de la nómina no cuadran: revísalas.',
  'client.documents.check.start_after_period_end':
    'La fecha de antigüedad leída es posterior al periodo de la nómina: revísala.',
  'client.documents.check.proration_exceeds_total':
    'La prorrata de pagas extra leída es mayor que el total: revisa el salario.',
  'client.documents.check.contract_end_before_start':
    'Algún contrato de la vida laboral termina antes de empezar: revisa sus fechas.',
  'client.documents.nothing_read':
    'No se ha leído ningún dato, así que esta lectura no cuenta. Puedes cambiar las fotos o páginas que fallan y volver a probar, o rellenar a mano.',
  'client.documents.skipped.line': '{nombre}: {motivo}',
  'client.documents.skipped.done': 'Se ha saltado {nombre}: {motivo}',
  'client.documents.skipped.blurry': 'sale borrosa. Prueba con más luz y el móvil quieto.',
  'client.documents.skipped.dark': 'sale muy oscura. Prueba con más luz.',
  'client.documents.skipped.cropped': 'sale cortada. Prueba a que se vea la hoja entera.',
  'client.documents.skipped.handwritten':
    'parece escrito a mano. Es mejor que escribas los datos tú.',
  'client.documents.skipped.not_labour_document': 'no parece un documento laboral.',
  'client.documents.skipped.not_rental_document': 'no parece un documento del alquiler.',
  'client.documents.skipped.foreign_jurisdiction':
    'es de otro país. Esta revisión aplica la ley española.',
  'client.documents.skipped.unknown_format': 'es un tipo de documento que no se reconoce.',
  'client.documents.skipped.no_data': 'no trae datos que use esta revisión.',
  'client.documents.skipped.unread': 'no se ha podido leer.',
  'client.documents.quality.dark': '{nombre} se ve muy oscura.',
  'client.documents.quality.blurry': '{nombre} se ve borrosa.',
  'client.documents.quality.small': '{nombre} es muy pequeña: puede que la letra no se lea.',
  'client.documents.quality.ask_one': '¿La repites?',
  'client.documents.quality.ask_many': '¿Las repites?',
  'client.documents.error.consent_missing': 'Para leer los documentos hace falta tu consentimiento',
  'client.documents.error.method_not_allowed':
    'No se ha podido leer el documento. Prueba otra vez o rellena a mano.',
  'client.documents.error.invalid_request':
    'No se ha podido leer el documento. Prueba otra vez o rellena a mano.',
  'client.documents.error.payload_too_large':
    'Los archivos ocupan demasiado para enviarlos juntos. Quita alguna foto y prueba otra vez. Si tienes algún documento en PDF, súbelo en PDF y no en foto: sus páginas pesan menos.',
  'client.documents.error.no_files': 'Añade al menos una foto o un PDF',
  'client.documents.error.too_many_files': 'Como mucho 25 fotos o páginas de PDF en total',
  'client.documents.error.unsupported_media_type':
    'Ese tipo de archivo no se puede leer. Sube fotos o PDF.',
  'client.documents.error.image_unreadable':
    'Alguna foto no se puede abrir. Prueba a hacerla de nuevo o a subirla en otro formato.',
  'client.documents.error.image_too_large':
    'Alguna foto es demasiado grande. Prueba otra vez; se reduce antes de enviarla.',
  'client.documents.error.pdf_unreadable':
    'Este PDF no se puede abrir: puede estar dañado. Prueba a descargarlo otra vez o sube fotos de sus páginas.',
  'client.documents.error.pdf_encrypted':
    'Este PDF está protegido con contraseña y no se puede abrir aquí. Sube fotos de sus páginas.',
  'client.documents.error.pdf_too_slow':
    'Este PDF tarda demasiado en abrirse aquí. Sube fotos de sus páginas.',
  'client.documents.error.pdf_too_large':
    'Un PDF pesa más de 20 MB y no se puede abrir aquí. Sube fotos de las páginas con datos.',
  'client.documents.error.document_too_dense':
    'Los documentos tienen demasiado texto para leerlos de una vez. Sube solo las páginas con los datos.',
  'client.documents.error.captcha_failed':
    'No se ha podido comprobar que no eres un robot. Prueba otra vez.',
  'client.documents.error.daily_limit_reached':
    'Ya has usado las 2 lecturas gratis de hoy en este navegador. Puedes rellenar a mano o volver mañana.',
  'client.documents.error.pass_invalid':
    'Tu pase ya no sirve para leer documentos en este navegador; el informe y la carta siguen disponibles hasta que caduque. Prueba otra vez con una lectura gratis o rellena a mano.',
  'client.documents.error.pass_expired':
    'Tu pase ha caducado y se ha quitado de este navegador. Prueba otra vez con una lectura gratis o rellena a mano.',
  'client.documents.error.pass_exhausted':
    'Ya has usado las 15 lecturas de tu pase. Puedes rellenar a mano; el informe y la carta siguen disponibles.',
  'client.documents.error.pass_revoked':
    'Este pase ya no vale porque su pago se devolvió o se anuló. Puedes rellenar a mano.',
  'client.documents.error.pass_unconfirmed':
    'No hemos podido comprobar tu pase ahora mismo. Prueba otra vez en un momento.',
  'client.documents.error.document_unreadable':
    'No se han podido leer los documentos. Prueba con fotos más nítidas o rellena a mano.',
  'client.documents.error.model_unavailable':
    'La lectura no está disponible ahora mismo. Prueba más tarde o rellena a mano.',
  'client.documents.error.session_not_found': 'No encontramos ese pago. Revisa el código.',
  'client.documents.error.session_mismatch':
    'Ese pago no se hizo desde este navegador, y el pase solo se recupera en el navegador con el que se pagó. Para devoluciones o quejas, escribe a hola@eslojusto.es.',
  'client.documents.error.payment_not_complete':
    'El pago aún no está completo. Si acabas de pagar, prueba en un momento.',
  'client.documents.error.price_mismatch':
    'Ese pago no corresponde al pase. Escribe a hola@eslojusto.es con el justificante.',
  'client.documents.error.payment_provider_unavailable':
    'El pago no está disponible ahora mismo. Prueba más tarde.',
  'client.documents.error.service_unavailable':
    'El servicio está ocupado o no responde ahora mismo. Prueba otra vez en unos minutos o rellena a mano.',
  'client.documents.error.network_error':
    'No hay conexión con el servicio. Comprueba tu conexión y prueba otra vez.',
  'client.documents.error.unexpected_response':
    'La respuesta del servicio no se entiende. Prueba otra vez o rellena a mano.',
  'client.documents.error.captcha_unavailable':
    'No se ha podido cargar la comprobación de que no eres un robot. Prueba otra vez o rellena a mano.',
  'client.documents.error.file_type': 'Solo se pueden subir fotos o PDF',
  'client.documents.error.checkout_unavailable':
    'No se ha podido abrir el pago. Prueba otra vez en un momento.',
  'client.documents.error.no_checkout':
    'No hay ningún pago hecho desde este navegador. El pase solo se recupera en el navegador con el que se pagó. Para devoluciones o quejas, escribe a hola@eslojusto.es.',
  'client.documents.pass.waiver_missing': 'Marca la casilla para seguir',
  'client.documents.pass.redirecting': 'Abriendo el pago de Stripe…',
  'client.documents.pass.checking': 'Comprobando el pago…',
  'client.documents.pass.issued': 'Pago recibido. Ya puedes descargar el informe y la carta.',
  'client.documents.pass.valid_until': 'Tu pase vale hasta el {fecha}.',
  'client.documents.pass.renewed': 'Tu pase se ha renovado. Prueba otra vez a leer los documentos.',
  'client.documents.pass.generating': 'Preparando el PDF…',
  'client.documents.pass.generated': 'PDF listo.',
  'client.documents.verify.checking': 'Comprobando tu pase…',
  'client.documents.verify.unavailable':
    'No hemos podido comprobar tu pase ahora mismo. Prueba otra vez en un momento.',
  'client.documents.verify.pass_invalid':
    'Este pase no es válido y se ha quitado de este navegador.',
  'client.documents.verify.pass_invalid_recoverable':
    'Este pase no es válido y se ha quitado de este navegador. Como pagaste desde aquí, puedes recuperarlo en «¿Ya has pagado?».',
  'client.documents.verify.pass_expired': 'Tu pase ha caducado y se ha quitado de este navegador.',
  'client.documents.verify.pass_revoked':
    'Este pase ya no vale porque su pago se devolvió o se anuló, y se ha quitado de este navegador.',
  'client.documents.notice.full':
    'Descarga ahora tu informe y tu carta y guárdalos: no guardamos tu revisión en ningún sitio. Durante 7 días, en este navegador, puedes corregir tus datos y volver a descargarlos sin pagar otra vez.',
  'client.documents.notice.done':
    'Informe y carta descargados. Guárdalos: no guardamos tu revisión.',
  'client.documents.pass.lost':
    'Hemos vuelto del pago, pero la revisión no se ha podido recuperar. Repítela y aparecerán las descargas.',

  'client.documents.report.title': 'Revisión de tu finiquito',
  'client.documents.report.generated': 'eslojusto.es · {fecha}',
  'client.documents.report.intro':
    'Este informe compara tu finiquito con el mínimo que marca la ley, partida por partida, con los datos que confirmaste en la revisión. Informa sobre la ley y no es asesoramiento jurídico.',
  'client.documents.report.your_data': 'Tus datos',
  'client.documents.report.cause': 'Causa',
  'client.documents.report.start': 'Fecha de alta',
  'client.documents.report.end': 'Fecha de baja',
  'client.documents.report.salary': 'Salario bruto mensual',
  'client.documents.report.extra_pay': 'Pagas extra',
  'client.documents.report.extra_pay_prorated': 'Prorrateadas en la nómina',
  'client.documents.report.extra_pay_apart': '{n} pagas de {importe}',
  'client.documents.report.holidays': 'Vacaciones',
  'client.documents.report.holidays_text':
    '{anuales} días {unidad} al año; {disfrutados} disfrutados',
  'client.documents.report.holidays_unknown':
    '{anuales} días {unidad} al año; disfrutados, sin dato',
  'client.documents.report.cause.resignation': 'Baja voluntaria (dimisión)',
  'client.documents.report.cause.fixed_term_end': 'Fin de contrato temporal',
  'client.documents.report.cause.objective_dismissal': 'Despido objetivo',
  'client.documents.report.cause.unfair_dismissal': 'Despido improcedente',
  'client.documents.report.cause.disciplinary_dismissal': 'Despido disciplinario',
  'client.documents.report.cause.collective_dismissal': 'Despido colectivo (ERE)',
  'client.documents.report.cause.unknown': 'Sin indicar',
  'client.documents.report.fixed_term.production_circumstances': 'eventual',
  'client.documents.report.fixed_term.replacement': 'de sustitución',
  'client.documents.report.fixed_term.training': 'formativo',
  'client.documents.report.items': 'Partida por partida',
  'client.documents.report.employer': 'En tu finiquito',
  'client.documents.report.how': 'Cómo se calcula',
  'client.documents.report.sources': 'Fuentes',
  'client.documents.report.unchecked': 'Lo que esta revisión no comprueba',
  'client.documents.report.benefit': 'Tu paro (estimación)',
  'client.documents.report.footer':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Cifras según la ley en vigor el {fecha}.',
  'client.documents.report.page': 'Página {n} de {total}',
  'client.documents.report.filename': 'eslojusto-informe-finiquito.pdf',

  'client.documents.letter.title': 'Recibí no conforme',
  'client.documents.letter.name': 'Nombre y apellidos',
  'client.documents.letter.id': 'DNI o NIE',
  'client.documents.letter.company': 'Empresa',
  'client.documents.letter.body':
    'He recibido la propuesta de liquidación (finiquito) por el fin de mi contrato, con fecha de baja el {fecha}, y hago constar que no estoy conforme con estas cantidades:',
  'client.documents.letter.body_general':
    'He recibido la propuesta de liquidación (finiquito) por el fin de mi contrato, con fecha de baja el {fecha}, y hago constar que la recibo sin mostrar mi conformidad con su contenido.',
  'client.documents.letter.credit':
    '{partida}: la propuesta recoge {empresa} y el mínimo legal es {minimo}; faltan {diferencia}.',
  'client.documents.letter.deduction':
    '{partida}: la propuesta descuenta {empresa} y el máximo legal es {maximo}; sobran {diferencia}.',
  'client.documents.letter.closing':
    'Este recibí deja constancia de que he recibido el documento, no de que esté de acuerdo con sus cantidades.',
  'client.documents.letter.place_date': 'En {lugar}, a {fecha}',
  'client.documents.letter.place_blank': '____________________',
  'client.documents.letter.date_blank': '____ de ____________________ de ________',
  'client.documents.letter.glyph_warning':
    'Algunas letras no se pueden escribir en la carta: se deja la línea en blanco para escribirlo a mano.',
  'client.documents.letter.id_warning':
    'No parece un DNI ni un NIE: revísalo. La carta se descarga igualmente.',
  'client.documents.letter.received': 'Recibí no conforme,',
  'client.documents.letter.filename': 'eslojusto-recibi-no-conforme.pdf',
  'home.insurance_citation': 'Ley de Contrato de Seguro · Ley 22/2007',
  'home.rent_citation': 'Ley de Arrendamientos Urbanos · Ley 12/2023 · IRAV e IPC del INE',
  'home.beta': 'Beta',

  'home.contract_citation': 'Estatuto de los Trabajadores · SMI 2026 · RD 723/2026',
  'home.household': 'Empleada de hogar',
  'home.household_situation': 'Trabajas en una casa: tu sueldo y el desistimiento frente a la ley',
  'home.household_citation': 'RD 1620/2011 · RDL 16/2022 · SMI de cada año',

  'employment.title': 'Revisa tu contrato de trabajo: SMI, temporalidad y prueba',
  'employment.description':
    'Comprueba tu contrato de trabajo frente a la ley: salario y SMI, temporalidad, periodo de prueba, jornada, vacaciones y cláusulas, con su artículo.',
  'employment.h1': 'Comprueba si tu contrato de trabajo es justo',
  'employment.lead':
    'Revisa tu contrato punto por punto frente al Estatuto de los Trabajadores y el SMI: qué queda por debajo de lo que garantiza la ley o por encima de sus límites, con el artículo al lado.',
  'employment.beta': 'Beta',
  'employment.beta_note':
    'Sección en pruebas. Tu convenio colectivo puede mejorar lo que dice la ley: lo que depende de él se dice siempre.',
  'employment.no_js':
    'La revisión necesita JavaScript. Se hace entera en tu dispositivo y lo que escribes no sale de él.',
  'employment.reviewed': 'Revisado el {fecha}',
  'employment.app_name': 'Revisión de contrato de trabajo',

  'employment.guide.title': 'Qué garantiza la ley en tu contrato de trabajo',
  'employment.guide.lead':
    'Las reglas con las que la revisión compara cada punto de tu contrato, con la norma de cada una y su texto en el BOE. Tu convenio colectivo puede mejorarlas: lo que depende de él se dice siempre.',
  'employment.guide.sources': 'Fuentes',
  'employment.guide.source_et': 'Estatuto de los Trabajadores (BOE)',
  'employment.guide.source_smi': 'SMI de {anio} (BOE)',
  'employment.guide.source_rd723': 'Real Decreto 723/2026 (BOE)',
  'employment.guide.who': 'Quién está detrás',
  'employment.guide.norms': 'Normas',
  'employment.guide.norm.upcoming': 'en vigor desde el {fecha}',
  'employment.guide.norm.ended': 'con efectos hasta el {fecha}',
  'employment.guide.norm.never_applied': 'derogada antes de aplicarse',
  'employment.guide.norm_clause_upcoming': '{norma}, que entra en vigor el {desde},',
  'employment.guide.norm_clause_pending_validation':
    '{norma}, en vigor desde el {desde} y pendiente de convalidación,',
  'employment.guide.norm_repealed':
    'La norma {norma} se aplicó del {desde} al {hasta} y después se derogó: la revisión ya no la aplica.',
  'employment.guide.norm_never':
    'La norma {norma} no llegó a aplicarse: se derogó antes de entrar en vigor.',
  'employment.guide.quote_link': 'Texto en el BOE: {cita}',

  'employment.guide.minimum_wage.title': 'Salario mínimo (SMI) de cada año',
  'employment.guide.minimum_wage.lead':
    'El Gobierno fija cada año el salario mínimo interprofesional por real decreto (art. 27.1). Es para la jornada completa y cuenta lo que cobras en un año: ningún salario puede quedar por debajo, salvo que trabajes menos horas.',
  'employment.guide.minimum_wage.table': 'El SMI de cada año, a jornada completa',
  'employment.guide.minimum_wage.year': 'Año',
  'employment.guide.minimum_wage.monthly': 'Al mes, en 14 pagas',
  'employment.guide.minimum_wage.twelve': 'Al mes, en 12 pagas',
  'employment.guide.minimum_wage.annual': 'Al año',
  'employment.guide.minimum_wage.daily': 'Al día',
  'employment.guide.minimum_wage.norm': 'Norma',
  'employment.guide.minimum_wage.twelve_note':
    'La cifra en 12 pagas es la anual dividida entre 12: los reales decretos dan la de 14 pagas y la anual.',
  'employment.guide.minimum_wage.current':
    'En {anio}, el SMI es de {mensual} al mes en 14 pagas, {anual} al año, o {doce} al mes si cobras en 12 pagas. Lo fija {norma}, publicado en el BOE el {publicado} y con efectos desde el {efectos}.',
  'employment.guide.minimum_wage.not_published':
    'El SMI de {anio} aún no se ha publicado en el BOE. Hasta que salga, la revisión usa el de {referencia} solo como referencia y no da diferencia para {anio}.',
  'employment.guide.minimum_wage.prorata':
    'A tiempo parcial, el mínimo se cobra en proporción a tu jornada (art. 1 de cada real decreto del SMI): con 20 horas a la semana frente a 40, la mitad. La revisión hace la proporción con la jornada completa de tu convenio si la metes; si no, con las 40 horas de la ley.',
  'employment.guide.minimum_wage.temporary':
    'Cuando los servicios a una misma empresa no pasan de 120 días, cada real decreto del SMI fija un mínimo por jornada legal que incluye la parte de los domingos, los festivos y las pagas extra: {diario} en {anio} (art. 4.1). La revisión lo aplica cuando el contrato paga por días.',

  'employment.guide.what_counts.title': 'Qué cuenta para el SMI',
  'employment.guide.what_counts.lead':
    'El SMI se compara con lo que cobras en un año: el salario base, los complementos fijos y las pagas extra, aunque vayan prorrateadas.',
  'employment.guide.what_counts.in_kind':
    'El salario en especie, como una vivienda o un vehículo, no puede pasar del 30 % de lo que cobras ni bajar de la cifra del SMI lo que cobras en dinero (art. 26.1).',
  'employment.guide.what_counts.absorption':
    'Cuando sube el SMI, un salario que en su conjunto y en cómputo anual ya era más alto no tiene que subir (art. 27.1).',
  'employment.guide.what_counts.review':
    'La revisión suma el salario base, los complementos fijos y las pagas extra. Deja fuera los complementos variables, las horas extra, las dietas y el salario en especie, y lo dice. Si no sabes si un complemento es fijo o variable, da las dos cuentas.',

  'employment.guide.modalities.title': 'Tipos de contrato desde la reforma de 2022',
  'employment.guide.modalities.lead':
    'Desde el {desde}, un contrato de trabajo se presume indefinido. Un contrato temporal solo cabe por circunstancias de la producción o para sustituir a otra persona, y tiene que explicar con precisión su causa, las circunstancias que la justifican y su relación con la duración (art. 15.1):',
  'employment.guide.modalities.production':
    'Por circunstancias de la producción: hasta 6 meses, o hasta un año si lo amplía tu convenio sectorial, con una sola prórroga dentro de ese máximo (art. 15.2).',
  'employment.guide.modalities.occasional':
    'Para situaciones ocasionales y previsibles de corta duración, la empresa puede usarlo hasta 90 días en el año natural, que no pueden ser seguidos (art. 15.2).',
  'employment.guide.modalities.agrifood':
    'En los sectores agrario y agroalimentario, {norma} amplía ese límite a 120 días.',
  'employment.guide.modalities.replacement':
    'De sustitución: para cubrir a una persona con derecho a reserva de su puesto, con su nombre y la causa en el contrato, o hasta 3 meses para cubrir un puesto durante un proceso de selección (art. 15.3).',
  'employment.guide.modalities.discontinuous':
    'Fijo discontinuo: es indefinido, para trabajos de temporada o que se repiten con periodos sin actividad. El contrato dice el periodo de actividad, la jornada y su distribución, aunque sea de forma estimada (art. 16.2).',
  'employment.guide.modalities.training':
    'Formativos: el de formación en alternancia dura entre 3 meses y 2 años, y el de práctica profesional entre 6 meses y un año (art. 11).',
  'employment.guide.modalities.abolished':
    'Los contratos de obra o servicio y los eventuales por circunstancias de la producción desaparecieron con la reforma: los hechos antes del 31 de diciembre de 2021 siguen sus reglas anteriores hasta su fin (disposición transitoria 3.ª del Real Decreto-ley 32/2021), y los hechos del 31 de diciembre de 2021 al 30 de marzo de 2022 también, pero sin pasar de 6 meses (disposición transitoria 4.ª).',
  'employment.guide.modalities.written':
    'La ley pide por escrito, entre otros, los contratos de prácticas y para la formación y el aprendizaje, a tiempo parcial, fijos discontinuos, de relevo y de trabajo a distancia, y los temporales de más de cuatro semanas (art. 8.2).',
  'employment.guide.modalities.before_reform':
    'En un contrato que empezó antes del {desde}, la revisión comprueba todo lo demás y dice que su temporalidad no se revisa en esta versión.',

  'employment.guide.permanent.title': 'Cuándo un contrato temporal pasa a fijo',
  'employment.guide.permanent.lead':
    'Un contrato temporal tiene que cumplir el artículo 15 del Estatuto: una causa de producción o de sustitución explicada con precisión, y su duración máxima. La revisión no decide tu caso: cita lo que dice la ley. Si tu contrato no lo cumple:',
  'employment.guide.permanent.chaining':
    'Con varios contratos: si en un periodo de 24 meses has tenido contratos durante más de 18, seguidos o no, con la misma empresa o grupo de empresas, mediante dos o más contratos por circunstancias de la producción, también a través de una ETT:',
  'employment.guide.permanent.not_written':
    'Y si un contrato que la ley pide por escrito no se hizo por escrito:',
  'employment.guide.permanent.quote_15_4':
    'El artículo 15.4 del Estatuto de los Trabajadores dice:',
  'employment.guide.permanent.quote_15_5':
    'El artículo 15.5 del Estatuto de los Trabajadores dice:',
  'employment.guide.permanent.quote_8_2': 'El artículo 8.2 del Estatuto de los Trabajadores dice:',
  'employment.guide.permanent.certificate':
    'Puedes pedir por escrito al servicio público de empleo un certificado de los contratos temporales que has tenido (art. 15.9). Con tu vida laboral, la revisión suma tus contratos para el límite de 18 meses dentro de 24.',
  'employment.guide.permanent.review':
    'Cuando la cuenta depende de algo que no se sabe, como qué contrato anterior a la reforma cuenta, la revisión da las dos lecturas y no cita el paso a fijo hasta que coinciden.',

  'employment.guide.trial.title': 'Periodo de prueba',
  'employment.guide.trial.lead':
    'El periodo de prueba solo cabe si se pacta por escrito, y su duración la fija tu convenio. Si el convenio no dice nada, estos son los máximos (art. 14.1):',
  'employment.guide.trial.technicians': '6 meses para técnicos titulados.',
  'employment.guide.trial.others': '2 meses para el resto.',
  'employment.guide.trial.small_company':
    '3 meses para quien no es técnico titulado en una empresa de menos de 25 personas en plantilla.',
  'employment.guide.trial.temporary':
    '1 mes en un contrato temporal de 6 meses o menos, salvo que el convenio diga otra cosa.',
  'employment.guide.trial.void':
    'No cabe periodo de prueba si ya habías hecho las mismas funciones en la empresa, con cualquier contrato (art. 14.1).',
  'employment.guide.trial.training':
    'En un contrato de formación en alternancia no hay periodo de prueba (art. 11.2.l); en uno de práctica profesional, como mucho 1 mes, salvo que el convenio diga otra cosa (art. 11.3.e). Y quien sigue en la empresa tras un contrato formativo no hace un periodo de prueba nuevo (art. 11.4.g).',

  'employment.guide.working_time.title': 'Jornada y descansos',
  'employment.guide.working_time.lead':
    'La jornada máxima sigue en 40 horas semanales de trabajo efectivo, de media en el año (art. 34.1). Además:',
  'employment.guide.working_time.daily':
    'Como mucho 9 horas ordinarias al día, salvo que tu convenio o un acuerdo de empresa las repartan de otra forma (art. 34.3).',
  'employment.guide.working_time.rest':
    'Al menos 12 horas entre el final de una jornada y el inicio de la siguiente (art. 34.3).',
  'employment.guide.working_time.weekly_rest':
    'Un descanso semanal de día y medio seguido, que puede acumularse en periodos de hasta 14 días (art. 37.1).',
  'employment.guide.working_time.break':
    'Una pausa de al menos 15 minutos cuando la jornada seguida pasa de 6 horas (art. 34.4).',
  'employment.guide.working_time.night':
    'Quien trabaja de noche no pasa de 8 horas al día de media en 15 días ni hace horas extra (art. 36.1).',
  'employment.guide.working_time.overtime':
    'Como mucho 80 horas extra al año, sin contar las compensadas con descanso en los 4 meses siguientes. Se pagan al menos como la hora ordinaria o se compensan con descanso, y son voluntarias salvo que las pacte el convenio o el contrato (art. 35).',
  'employment.guide.working_time.record':
    'La empresa registra cada día el inicio y el final de tu jornada (art. 34.9). Algunos sectores y los cambios de turno tienen reglas especiales sobre jornada y descansos (Real Decreto 1561/1995); la revisión las nombra cuando pueden aplicarse.',

  'employment.guide.part_time.title': 'Tiempo parcial',
  'employment.guide.part_time.lead':
    'Un contrato a tiempo parcial dice las horas de trabajo y cómo se reparten; si no lo dice, se presume a jornada completa, salvo prueba en contrario (art. 12.4.a). La empresa registra tus horas cada día y te da el resumen del mes con la nómina (art. 12.4.c).',
  'employment.guide.part_time.overtime':
    'A tiempo parcial no se hacen horas extra, salvo para prevenir o reparar daños urgentes (arts. 12.4.c y 35.3).',
  'employment.guide.part_time.complementary':
    'Las horas complementarias se pactan por escrito y solo con 10 horas semanales o más de media en el año. No pasan del 30 % de las horas ordinarias, o del porcentaje que fije el convenio, de entre el 30 % y el 60 %, y te las avisan con al menos 3 días de antelación, salvo que el convenio fije menos (art. 12.5).',
  'employment.guide.part_time.voluntary':
    'En un contrato indefinido, la empresa puede ofrecerte además horas complementarias voluntarias, hasta el 15 %, o el 30 % si lo fija el convenio (art. 12.5.g).',

  'employment.guide.holidays_pay.title': 'Vacaciones y pagas extra',
  'employment.guide.holidays_pay.holidays':
    'Las vacaciones son al menos 30 días naturales al año, retribuidos; el convenio o el contrato pueden dar más (art. 38.1). En un contrato de menos de un año, corresponde la parte proporcional.',
  'employment.guide.holidays_pay.money':
    'Mientras sigue el contrato, las vacaciones no se pueden cambiar por dinero (art. 38.1).',
  'employment.guide.holidays_pay.extra_pays':
    'Hay dos pagas extra al año: una en Navidad y la otra en el mes que fije el convenio o un acuerdo entre la empresa y los representantes de los trabajadores. Su importe lo fija el convenio, que también puede prorratearlas en las doce mensualidades (art. 31).',
  'employment.guide.holidays_pay.public_holidays':
    'Además, hay hasta 14 fiestas laborales al año, retribuidas y que no se recuperan (art. 37.2).',

  'employment.guide.clauses.title': 'Cláusulas',
  'employment.guide.clauses.lead': 'Algunas cláusulas tienen límites en la ley:',
  'employment.guide.clauses.non_compete':
    'No competencia después del contrato: como mucho 2 años para técnicos y 6 meses para el resto, y solo si la empresa tiene un interés efectivo y te paga una compensación económica adecuada (art. 21.2).',
  'employment.guide.clauses.exclusivity':
    'Plena dedicación a una sola empresa: se pacta con una compensación económica expresa (art. 21.1).',
  'employment.guide.clauses.retention':
    'Permanencia: solo tras una especialización profesional pagada por la empresa, como mucho 2 años y siempre por escrito (art. 21.4).',
  'employment.guide.clauses.waiver':
    'Renuncias: los derechos que la ley reconoce como de derecho necesario no se pueden renunciar, ni antes ni después de tenerlos (art. 3.5). Si una cláusula no vale, se sustituye por lo que dice la ley y el resto del contrato sigue valiendo (art. 9.1).',
  'employment.guide.clauses.remote':
    'Teletrabajo: con trabajo a distancia regular, {norma} pone a cargo de la empresa los gastos de equipos, herramientas y medios (art. 12).',
  'employment.guide.clauses.review':
    'La revisión mira la letra de cada cláusula que confirmas: su duración, si prevé una compensación y si consta por escrito. No valora si una compensación es adecuada ni si la empresa tiene un interés efectivo.',

  'employment.guide.information.title': 'Qué tiene que darte la empresa por escrito',
  'employment.guide.information.lead':
    'Desde el {desde}, {norma} dice que la empresa tiene que darte por escrito los elementos esenciales de tu relación laboral (art. 3.2):',
  'employment.guide.information.when':
    'Si tu relación empezó desde ese día, tenía que dártelos antes de empezar (art. 7.1). Si ya estaba en marcha, puedes pedirlos por escrito y la empresa tiene 30 días hábiles para dártelos (disposición transitoria única). No se aplica a relaciones de cuatro semanas o menos (art. 2.2).',
  'employment.guide.information.review':
    'Algunos puntos pueden remitir a la ley o al convenio. La revisión te pregunta por cada uno y dice cuáles faltan.',

  'employment.guide.agreement.title': 'Cómo encontrar tu convenio',
  'employment.guide.agreement.lead':
    'Desde el {desde}, la empresa tiene que informarte por escrito de qué convenio se aplica, con su código y su fecha de publicación (art. 3.2.o del {nombre}).',
  'employment.guide.agreement.binding':
    'Tu convenio colectivo fija tu salario por categoría, tus pluses, tu jornada y muchas de las duraciones de esta página, y obliga a la empresa dentro de su ámbito (art. 82.3).',
  'employment.guide.agreement.where':
    'Los convenios se publican en el BOE, si son estatales, o en el boletín oficial de tu comunidad o tu provincia, y están en REGCON, el registro público de convenios del Ministerio de Trabajo, donde se buscan por nombre, sector o código.',
  'employment.guide.agreement.review':
    'La revisión no lee convenios ni sus tablas: si metes el salario de tu categoría según tu convenio, lo compara como dato tuyo.',

  'employment.guide.faq': 'Preguntas frecuentes',
  'employment.faq.minimum_wage': '¿Cuál es el salario mínimo en {anio}?',
  'employment.faq.minimum_wage_answer':
    'En {anio}, el salario mínimo interprofesional (SMI) es de {mensual} al mes en 14 pagas, {anual} al año. Si cobras en 12 pagas, equivale a {doce} al mes, y por días es de {diario}. Lo fija el {norma}, con efectos desde el {efectos}. Es para la jornada completa: con menos horas se cobra en proporción.',
  'employment.faq.minimum_wage_not_published':
    'El SMI de {anio} aún no se ha publicado en el BOE. El último publicado es el de {referencia}: {mensual} al mes en 14 pagas, {anual} al año. Mientras no salga el de {anio}, la revisión lo usa solo como referencia y no da diferencia para {anio}.',
  'employment.faq.part_time': '¿Cómo se calcula el SMI si trabajo a tiempo parcial?',
  'employment.faq.part_time_answer':
    'En proporción a tu jornada: el SMI es para la jornada completa, y con menos horas se cobra a prorrata (art. 1 de cada real decreto del SMI). Por ejemplo, con 20 horas a la semana frente a 40, en {anio} el mínimo es la mitad: {mitad} al año. La revisión hace la proporción con la jornada completa de tu convenio si la metes; si no, con las 40 horas de la ley.',
  'employment.faq.temporary': '¿Cuánto puede durar un contrato temporal?',
  'employment.faq.temporary_answer':
    'Por circunstancias de la producción, hasta 6 meses, o hasta un año si lo amplía tu convenio sectorial, con una sola prórroga dentro de ese máximo; para situaciones ocasionales y previsibles, la empresa puede usarlo hasta 90 días en el año natural, no seguidos. De sustitución, mientras dura la ausencia de la persona a la que sustituyes, o hasta 3 meses para cubrir un puesto durante un proceso de selección (art. 15). Si en 24 meses has tenido contratos durante más de 18 con la misma empresa o grupo, mediante dos o más contratos por circunstancias de la producción, el artículo 15.5 del Estatuto de los Trabajadores dice que esas personas «adquirirán la condición de personas trabajadoras fijas».',
  'employment.faq.trial': '¿Cuánto puede durar el periodo de prueba?',
  'employment.faq.trial_answer':
    'Lo fija tu convenio, y solo cabe si se pacta por escrito. Si el convenio no dice nada, como mucho 6 meses para técnicos titulados y 2 meses para el resto, o 3 en empresas de menos de 25 personas. En un contrato temporal de 6 meses o menos, 1 mes, salvo que el convenio diga otra cosa. Si ya habías hecho las mismas funciones en la empresa, no cabe (art. 14.1). En un contrato de formación en alternancia no hay periodo de prueba (art. 11.2.l).',
  'employment.faq.holidays': '¿Cuántas vacaciones me corresponden?',
  'employment.faq.holidays_answer':
    'Al menos 30 días naturales al año, retribuidos; tu convenio o tu contrato pueden dar más (art. 38.1). Si tu contrato dura menos de un año, te corresponde la parte proporcional. Mientras sigue el contrato, las vacaciones no se pueden cambiar por dinero.',
  'employment.faq.information': '¿Qué información me tiene que dar la empresa?',
  'employment.faq.information_answer':
    'Desde el {desde}, {norma} dice que la empresa tiene que darte por escrito los elementos esenciales de tu relación laboral: quiénes son las partes, el puesto y la categoría, el salario y sus complementos, la jornada y las vacaciones, el periodo de prueba, el convenio colectivo con su código y cómo termina el contrato, entre otros. Si tu relación empezó desde ese día, antes de empezar; si ya estaba en marcha, puedes pedirlos por escrito y la empresa tiene 30 días hábiles. No se aplica a relaciones de cuatro semanas o menos.',
  'employment.faq.january': '¿Qué pasa en enero antes de que salga el nuevo SMI?',
  'employment.faq.january_answer':
    'Cada año, el SMI lo fija un real decreto. El de {anio} se publicó en el BOE el {publicado}, con efectos desde el {efectos}. Hasta que sale el del año, la revisión no pone una cifra que aún no existe: dice que el SMI de ese año aún no se ha publicado, usa el último publicado solo como referencia y no da diferencia para ese año. Cuando sale en el BOE, la revisión compara ese año también.',
  'employment.faq.documents': '¿Qué pasa con mis documentos?',
  'employment.faq.documents_answer':
    'Si subes tu contrato y, si los tienes, tus nóminas, la oferta de empleo o tu vida laboral, se envían cifrados a un servidor de Amazon Web Services en España, que se los pasa a un modelo de IA (Claude, de Anthropic, a través de Amazon Bedrock) dentro de la Unión Europea. El modelo indica qué es cada página y copia solo los datos que necesita el formulario. Tiene orden de no copiar nombres de personas, DNI, NIE, número de la Seguridad Social, domicilios, cuentas, teléfonos ni correos, ni nada sobre discapacidad, salud, bajas o afiliación sindical, como la cuota del sindicato de una nómina. El servidor descarta cualquier texto copiado que aún lleve un DNI, un número de la Seguridad Social, una cuenta, un correo o un teléfono, o que hable de salud, bajas, discapacidad, sindicatos o embargos. No se guarda nada: los documentos se procesan en memoria y se descartan. Si prefieres no subir nada, puedes escribir los datos y nada sale de tu dispositivo.',
  'employment.faq.pass': '¿Qué incluye el pase de 4,99 €?',
  'employment.faq.pass_answer':
    'El pase vale para cualquier revisión durante 7 días, también las del finiquito y el alquiler, y solo en el navegador con el que pagas. En la del contrato te enseña el cálculo paso a paso de cada punto y te deja descargar el informe en PDF y la carta a la empresa sobre lo que no coincide con la ley. En esos días puedes rehacer o corregir tu revisión y leer hasta 15 paquetes de documentos sin pagar otra vez. La carta para pedir la información por escrito y la petición del certificado de contratos temporales se descargan gratis. No guardamos tu revisión en ningún sitio: en otro dispositivo, en una ventana privada o si borras los datos de navegación, el pase se pierde.',

  'employment.form_aria': 'Revisión del contrato de trabajo',
  'employment.tab.relacion': 'Relación',
  'employment.tab.modalidad': 'Contrato',
  'employment.tab.salario': 'Salario',
  'employment.tab.jornada': 'Jornada',
  'employment.tab.prueba': 'Condiciones',
  'employment.tab.resultado': 'Resultado',
  'employment.choose': 'Elige uno',
  'employment.answer.yes': 'Sí',
  'employment.answer.no': 'No',
  'employment.answer.unknown': 'No lo sé',
  'employment.rows.full': 'Has llegado al máximo de filas de esta lista.',

  'employment.relation.question': 'Tu relación laboral',
  'employment.relation.help':
    'Esta revisión es para la relación laboral común del Estatuto de los Trabajadores. Con estas respuestas sabrás si la tuya entra.',
  'employment.relation.kind': '¿Qué relación tienes con la empresa?',
  'employment.relationship.common': 'Trabajo por cuenta ajena',
  'employment.relationship.common_hint':
    'La relación de casi todo el mundo: trabajas para una empresa a cambio de un salario.',
  'employment.relationship.household': 'Empleo del hogar',
  'employment.relationship.household_hint': 'Trabajas en una casa particular.',
  'employment.relationship.senior_management': 'Alta dirección',
  'employment.relationship.senior_management_hint':
    'Diriges la empresa con poderes propios de su titular.',
  'employment.relationship.sport': 'Deporte profesional',
  'employment.relationship.sport_hint': 'Eres deportista profesional.',
  'employment.relationship.artist': 'Artes escénicas',
  'employment.relationship.artist_hint': 'Trabajas en espectáculos o en la producción artística.',
  'employment.relationship.law_firm': 'Abogacía en un despacho',
  'employment.relationship.law_firm_hint': 'Ejerces la abogacía en un despacho ajeno.',
  'employment.relationship.medical_resident': 'Residencia sanitaria',
  'employment.relationship.medical_resident_hint': 'Haces la residencia (MIR, EIR, FIR…).',
  'employment.relationship.special_employment_centre': 'Centro especial de empleo',
  'employment.relationship.special_employment_centre_hint':
    'Trabajas en un centro especial de empleo con una discapacidad reconocida.',
  'employment.relationship.public_servant': 'Personal funcionario',
  'employment.relationship.public_servant_hint': 'Eres funcionario o funcionaria.',
  'employment.relationship.other_special': 'Otra relación especial',
  'employment.relationship.other_special_hint':
    'Por ejemplo, estibadores, penados en instituciones penitenciarias o representantes de comercio.',
  'employment.relation.agency':
    '¿Te contrató una empresa de trabajo temporal para trabajar en otra?',
  'employment.relation.agency_hint': 'Una ETT que te pone a disposición de una empresa usuaria.',
  'employment.relation.relief': '¿Es un contrato de relevo?',
  'employment.relation.relief_hint':
    'El que se hace para sustituir a quien se jubila de forma parcial.',
  'employment.relation.minor': '¿Tienes menos de 18 años?',
  'employment.relation.written': '¿Tienes el contrato por escrito?',
  'employment.relation.written_hint': 'Un documento con tu nombre y el de la empresa.',
  'employment.relation.start': 'Fecha de inicio',
  'employment.relation.start_hint': 'El día en que empezaste o empiezas a trabajar.',
  'employment.relation.end': 'Fecha de fin',
  'employment.relation.end_hint': 'Si el contrato es temporal y la dice. Si no, déjalo en blanco.',
  'employment.relation.signed': 'Fecha del contrato',
  'employment.relation.signed_hint':
    'El día en que se firmó el contrato, si lo sabes. Si no, déjalo en blanco.',

  'employment.modality.question': 'Tu tipo de contrato',
  'employment.modality.help':
    'Lo dice el título del contrato o su primera cláusula. Si en tus nóminas sale una clave (100, 402, 410…), también ayuda a reconocerlo.',
  'employment.modality.kind': '¿Qué tipo de contrato es?',
  'employment.modality.permanent_hint': 'Sin fecha de fin. Clave 100 o 200.',
  'employment.modality.discontinuous_hint':
    'Indefinido, pero solo trabajas en temporadas o periodos. Clave 300.',
  'employment.modality.production_hint':
    'Temporal por un aumento de trabajo que no se puede atender con la plantilla. Clave 402 o 502.',
  'employment.modality.production_occasional_hint':
    'Temporal por situaciones ocasionales y previsibles de corta duración, como campañas.',
  'employment.modality.replacement_hint':
    'Temporal para sustituir a alguien con derecho a volver a su puesto. Clave 410 o 510.',
  'employment.modality.replacement_selection_hint':
    'Temporal para cubrir un puesto mientras dura un proceso de selección.',
  'employment.modality.training_alternance_hint':
    'Trabajo y estudios a la vez, con un plan formativo. Clave 421.',
  'employment.modality.training_practice_hint':
    'Primer trabajo tras terminar los estudios, para practicar lo aprendido. Clave 420.',
  'employment.modality.work_or_service_hint':
    'Un nombre de antes de 2022. Si tu contrato lo usa, márcalo aunque sea reciente.',
  'employment.modality.eventual_hint':
    'Otro nombre de antes de 2022 para el contrato por circunstancias de la producción.',
  'employment.modality.interim_hint':
    'Otro nombre de antes de 2022 para el contrato de sustitución.',
  'employment.modality.unknown_hint': 'Si no lo tienes claro, márcalo y lo dirá el resultado.',
  'employment.modality.extensions': 'Número de prórrogas',
  'employment.modality.extensions_hint': 'Las veces que se ha alargado. Si ninguna, 0.',
  'employment.modality.cause': '¿El contrato explica la causa de que sea temporal?',
  'employment.modality.cause_hint':
    'Qué ha pasado en la empresa para necesitar el contrato: un pedido, una campaña…',
  'employment.modality.circumstances':
    '¿Y explica las circunstancias concretas y su relación con la duración?',
  'employment.modality.replaced_named':
    '¿El contrato dice el nombre de la persona a la que sustituyes?',
  'employment.modality.replacement_cause': '¿Y la causa de la sustitución?',
  'employment.modality.discontinuous_help': 'Pueden estar de forma estimada.',
  'employment.modality.activity_period': '¿El contrato dice el periodo de actividad?',
  'employment.modality.discontinuous_hours': '¿Dice la jornada?',
  'employment.modality.distribution': '¿Dice cómo se reparte el horario?',
  'employment.modality.plan': '¿El contrato lleva tu plan formativo individual?',
  'employment.modality.studies_end': 'Fecha en que acabaste los estudios',
  'employment.modality.studies_end_hint': 'Los que dan acceso a este contrato.',
  'employment.modality.disability': '¿Tienes una discapacidad reconocida?',
  'employment.modality.disability_hint': 'Cambia el plazo desde que acabaste los estudios.',
  'employment.modality.effective_1': 'Trabajo efectivo el primer año, en %',
  'employment.modality.effective_hint':
    'La parte de la jornada que trabajas, sin la formación. Si no lo sabes, déjalo en blanco.',
  'employment.modality.effective_2': 'Trabajo efectivo el segundo año, en %',

  'employment.history.question': 'Tus contratos anteriores',
  'employment.history.help':
    'Opcional. Con tu vida laboral se puede comprobar si los contratos temporales seguidos pasan del límite de 18 meses en 24. Cuenta también el actual si sale en ella.',
  'employment.history.ask': '¿Quieres meter contratos de tu vida laboral?',
  'employment.history.yes': 'Sí, añadirlos',
  'employment.history.add': 'Añadir contrato',
  'employment.history.from': 'Desde',
  'employment.history.to': 'Hasta',
  'employment.history.employer': 'Empresa',
  'employment.history.kind': 'Tipo de contrato',
  'employment.history.incomplete': 'Faltan contratos más antiguos en esta lista',
  'employment.history.incomplete_hint':
    'Márcalo si tu vida laboral tiene contratos anteriores que no has metido aquí: entonces no se puede confirmar que estés dentro del límite.',
  'employment.employer.same': 'La misma empresa',
  'employment.employer.same_group': 'Otra empresa del mismo grupo',
  'employment.employer.same_via_agency': 'La misma empresa, a través de una ETT',
  'employment.employer.other': 'Otra empresa',
  'employment.period_kind.production': 'Por circunstancias de la producción',
  'employment.period_kind.replacement': 'De sustitución',
  'employment.period_kind.training': 'Formativo',
  'employment.period_kind.permanent': 'Indefinido',
  'employment.period_kind.unknown': 'No lo sé',

  'employment.salary.question': 'Tu salario',
  'employment.salary.help':
    'Lo que dice el contrato, en bruto. Se compara con el SMI del año en que se firmó o empezó, el más tardío; para los años siguientes hacen falta tus nóminas, porque te lo pueden haber subido. Si no tienes un dato opcional, déjalo en blanco.',
  'employment.salary.amount': 'Salario bruto',
  'employment.salary.amount_hint': 'En euros, antes de impuestos y cotizaciones.',
  'employment.salary.period': '¿Por qué periodo es esa cifra?',
  'employment.period.year': 'Al año',
  'employment.period.month': 'Al mes',
  'employment.period.day': 'Al día',
  'employment.period.hour': 'A la hora',
  'employment.salary.extra_pays': 'Pagas extra al año',
  'employment.salary.extra_pays_hint':
    'Lo normal son 2, en verano y en Navidad. Cuéntalas también si van prorrateadas en la nómina: lo dirás en la pregunta siguiente. Si no hay ninguna, 0.',
  'employment.salary.prorated': '¿Las pagas extra van prorrateadas en cada nómina?',
  'employment.salary.prorated_hint': 'Repartidas en las 12 nóminas en vez de cobrarse aparte.',
  'employment.salary.in_kind': 'Salario en especie',
  'employment.salary.in_kind_hint':
    'Vivienda, comida, coche… en euros y por el mismo periodo que el salario. Opcional.',
  'employment.salary.breakdown': '¿El contrato desglosa el salario?',
  'employment.salary.breakdown_hint':
    'Salario base y complementos por separado, en el mismo periodo que el total.',
  'employment.salary.breakdown_yes': 'Sí, añadir las partes',
  'employment.salary.parts_add': 'Añadir parte',
  'employment.salary.part_kind': 'Concepto',
  'employment.salary.part_amount': 'Importe',
  'employment.part.base': 'Salario base',
  'employment.part.fixed_complement': 'Complemento fijo',
  'employment.part.variable': 'Complemento variable',
  'employment.part.unknown': 'No sé de qué tipo',
  'employment.salary.weekly_hours': 'Horas a la semana',
  'employment.salary.weekly_hours_hint': 'Las que fija el contrato.',
  'employment.salary.annual_hours': 'Horas al año',
  'employment.salary.annual_hours_hint': 'Si el contrato las da al año en vez de a la semana.',
  'employment.agreement.title': 'Tu convenio',
  'employment.agreement.help':
    'Esta revisión no tiene las tablas de los convenios. Si sabes estos datos, se comparan «según tu dato».',
  'employment.agreement.named': '¿El contrato nombra tu convenio colectivo?',
  'employment.agreement.full_time': 'Jornada completa de tu convenio, horas a la semana',
  'employment.agreement.full_time_hint': 'Si no la sabes, se toma la legal de 40 horas.',
  'employment.agreement.category_salary': 'Salario de tu categoría en el convenio, al año',
  'employment.agreement.annual_hours': 'Jornada anual de tu convenio, en horas',
  'employment.agreement.your_figure': 'Opcional: se usa como dato tuyo.',

  'employment.payslips.question': 'Tus nóminas',
  'employment.payslips.help':
    'Opcional. Cada nómina de un mes completo y sin incidencias se compara con el SMI de ese mes.',
  'employment.payslips.ask': '¿Quieres meter nóminas?',
  'employment.payslips.yes': 'Sí, añadirlas',
  'employment.payslips.add': 'Añadir nómina',
  'employment.payslips.month': 'Mes',
  'employment.payslips.month_hint': 'Como 2026-03.',
  'employment.payslips.salary': 'Devengos salariales en dinero',
  'employment.payslips.salary_hint':
    'Salario base y complementos, sin horas extra, dietas ni la prorrata de pagas.',
  'employment.payslips.prorated': 'Prorrata de pagas extra',
  'employment.payslips.in_kind': 'Salario en especie',
  'employment.payslips.whole_month': '¿Trabajaste el mes completo?',
  'employment.payslips.incidents': '¿Tiene incidencias (baja, ausencias)?',

  'employment.time.question': 'Tu jornada',
  'employment.time.schedule': '¿Quieres meter tu horario semanal?',
  'employment.time.schedule_hint':
    'Con él se comprueban las horas al día, los descansos y las pausas.',
  'employment.time.schedule_yes': 'Sí, añadir el horario',
  'employment.time.slots_hint': 'Un tramo por fila: si partes la jornada, dos tramos ese día.',
  'employment.time.slot_add': 'Añadir tramo',
  'employment.time.day': 'Día',
  'employment.time.from': 'Desde',
  'employment.time.to': 'Hasta',
  'employment.time.shifts': '¿Trabajas a turnos?',
  'employment.time.night': '¿Trabajas de noche?',
  'employment.time.night_hint': 'Al menos 3 horas de tu jornada entre las 22:00 y las 6:00.',
  'employment.time.irregular': '¿El contrato reparte la jornada de forma irregular en el año?',
  'employment.time.irregular_hint': 'Semanas con más horas y otras con menos.',
  'employment.time.overtime': '¿El contrato te obliga a hacer horas extra?',
  'employment.time.overtime_hint': 'Una cláusula que las hace obligatorias, no las voluntarias.',
  'employment.time.overtime_yes': 'Sí',
  'employment.time.overtime_kind': '¿Cuántas?',
  'employment.time.overtime_hours_choice': 'Un número de horas al año',
  'employment.time.overtime_as_needed': 'Las que hagan falta',
  'employment.time.overtime_hours': 'Horas extra al año',
  'employment.time.overtime_paid': '¿Se pagan en dinero?',
  'employment.time.overtime_paid_hint': 'En vez de compensarse con descanso.',
  'employment.time.part_time': '¿Es un contrato a tiempo parcial?',
  'employment.time.hours_stated': '¿El contrato dice cuántas horas trabajas?',
  'employment.time.distribution_stated': '¿Dice cómo se reparten?',
  'employment.time.complementary': '¿Tiene un pacto de horas complementarias?',
  'employment.time.complementary_hint':
    'Horas además de las del contrato que la empresa puede pedirte.',
  'employment.time.complementary_percent': 'Horas complementarias, en % de las ordinarias',
  'employment.time.complementary_notice': 'Días de preaviso',
  'employment.time.voluntary_percent': 'Horas complementarias voluntarias, en %',
  'employment.time.voluntary_hint': 'Si el contrato las ofrece. Si no, déjalo en blanco.',
  'employment.time.remote': 'Teletrabajo, en % de tu jornada',
  'employment.time.remote_hint': 'Si no teletrabajas, 0. Opcional.',
  'employment.time.real_hours': 'Horas que trabajas de verdad a la semana',
  'employment.time.real_hours_hint': 'Opcional: solo para comparar con el salario.',

  'employment.trial.question': 'Tu periodo de prueba',
  'employment.trial.ask': '¿El contrato tiene periodo de prueba?',
  'employment.trial.amount': 'Duración',
  'employment.trial.unit': 'En',
  'employment.unit.days': 'Días',
  'employment.unit.weeks': 'Semanas',
  'employment.unit.months': 'Meses',
  'employment.trial.technical': '¿Eres técnico titulado?',
  'employment.trial.technical_hint':
    'Con un título universitario o de formación profesional superior, y trabajas en funciones de ese título.',
  'employment.trial.small_company': '¿Tu empresa tiene menos de 25 personas en plantilla?',
  'employment.trial.same_duties': '¿Ya habías hecho este mismo trabajo en esta empresa?',
  'employment.trial.after_training': '¿Vienes de un contrato formativo en esta empresa?',
  'employment.trial.agreement': 'Periodo de prueba máximo de tu convenio, en meses',

  'employment.holidays.question': 'Tus vacaciones',
  'employment.holidays.ask': '¿El contrato dice cuántos días de vacaciones tienes?',
  'employment.holidays.days': 'Días de vacaciones al año',
  'employment.holidays.unit': '¿Qué días son?',
  'employment.holidays.calendar': 'Naturales',
  'employment.holidays.working': 'Laborables',
  'employment.holidays.per_week': 'Días de trabajo a la semana',
  'employment.holidays.per_week_hint': 'Como 5, de lunes a viernes.',
  'employment.holidays.in_salary': '¿Dice que las vacaciones van incluidas en el salario?',
  'employment.holidays.in_salary_hint': 'Pagadas en dinero en vez de disfrutadas.',
  'employment.holidays.agreement': 'Días de vacaciones de tu convenio',

  'employment.clauses.question': 'Cláusulas',
  'employment.clauses.help':
    'Opcional. Elige qué tipo de cláusula es y responde lo que se pregunta: se revisa por sus datos, no por su redacción.',
  'employment.clauses.ask': '¿Quieres revisar alguna cláusula?',
  'employment.clauses.yes': 'Sí, añadirlas',
  'employment.clauses.add': 'Añadir cláusula',
  'employment.clauses.label': 'Tipo de cláusula',
  'employment.clauses.months': 'Duración, en meses',
  'employment.clauses.months_hint': 'Si no la dice, déjalo en blanco.',
  'employment.clauses.compensation': '¿Prevé una compensación económica?',
  'employment.clauses.training': '¿Menciona una formación pagada por la empresa?',
  'employment.clauses.waived': '¿A qué renuncias?',
  'employment.waived.holidays': 'A vacaciones',
  'employment.waived.salary': 'A parte del salario',
  'employment.waived.severance': 'A la indemnización',
  'employment.waived.other': 'A otra cosa',
  'employment.clauses.costs': '¿Pone a tu cargo los gastos del teletrabajo?',
  'employment.clauses.text': 'Lo que dice la cláusula',
  'employment.clauses.text_hint': 'Opcional: se muestra en el resultado tal como lo escribas.',

  'employment.info.question': 'Lo que el contrato tiene que decir',
  'employment.info.help':
    'Desde el 5 de octubre de 2026 la empresa tiene que darte esta información por escrito. Marca si está en el contrato o en otro documento.',
  'employment.info.present': 'Está',
  'employment.info.by_reference': 'Remite al convenio o a la ley',
  'employment.info.absent': 'No está',

  'employment.offer.question': 'La oferta de empleo',
  'employment.offer.help':
    'Opcional. Se pone al lado del contrato, sin decir cuál vale: la ley no fija qué valor tiene una oferta.',
  'employment.offer.ask': '¿Quieres comparar la oferta con el contrato?',
  'employment.offer.yes': 'Sí, añadir la oferta',
  'employment.offer.gross': 'Salario al año de la oferta',
  'employment.offer.gross_hint': 'Si no lo decía, déjalo en blanco.',
  'employment.offer.hours': 'Horas a la semana de la oferta',
  'employment.offer.net': '¿La cifra de la oferta era neta?',
  'employment.offer.modality': 'Tipo de contrato de la oferta',
  'employment.offer.remote': 'Teletrabajo de la oferta',
  'employment.offer.not_said': 'No lo decía',

  'employment.result.title': 'Resultado',
  'employment.result.out_of_scope': 'Fuera de esta revisión',
  'employment.result.household_link':
    'Si trabajas en una casa, revisa tu caso como empleada de hogar',
  'employment.result.summary': 'Resumen',
  'employment.result.information': 'Para que lo sepas',
  'employment.result.unchecked': 'Lo que esta revisión no mira',
  'employment.result.rules': 'Normas',
  'employment.result.how': 'Cómo se calcula',
  'employment.result.sources': 'Fuentes',
  'employment.result.duty_list': 'La lista completa',
  'employment.result.offer_detail': 'Lado a lado',
  'employment.result.restart': 'Empezar de nuevo',

  'law.quote.source': 'Fuente: {cita}',
  'law.quote.case_law': 'Criterio del {tribunal}: {cita}',

  'client.employment.about': 'unos {importe}',
  'client.employment.and': '{a} y {b}',
  'client.employment.unit.day_one': '{n} día',
  'client.employment.unit.day_many': '{n} días',
  'client.employment.unit.week_one': '{n} semana',
  'client.employment.unit.week_many': '{n} semanas',
  'client.employment.unit.month_one': '{n} mes',
  'client.employment.unit.month_many': '{n} meses',
  'client.employment.unit.contract_one': '{n} contrato',
  'client.employment.unit.contract_many': '{n} contratos',
  'client.employment.unit.extension_one': '{n} prórroga',
  'client.employment.unit.extension_many': '{n} prórrogas',
  'client.employment.unit.extra_pay_one': '{n} paga extra',
  'client.employment.unit.extra_pay_many': '{n} pagas extra',
  'client.employment.weekday.1': 'lunes',
  'client.employment.weekday.2': 'martes',
  'client.employment.weekday.3': 'miércoles',
  'client.employment.weekday.4': 'jueves',
  'client.employment.weekday.5': 'viernes',
  'client.employment.weekday.6': 'sábado',
  'client.employment.weekday.7': 'domingo',

  'client.employment.modality.permanent': 'Indefinido',
  'client.employment.modality.discontinuous': 'Fijo discontinuo',
  'client.employment.modality.production': 'Por circunstancias de la producción',
  'client.employment.modality.production_occasional': 'Por situaciones ocasionales y previsibles',
  'client.employment.modality.replacement': 'De sustitución',
  'client.employment.modality.replacement_selection':
    'Para cubrir un puesto durante un proceso de selección',
  'client.employment.modality.training_alternance': 'Formativo en alternancia',
  'client.employment.modality.training_practice': 'Formativo para la práctica profesional',
  'client.employment.modality.work_or_service': 'De obra o servicio',
  'client.employment.modality.eventual': 'Eventual por circunstancias de la producción',
  'client.employment.modality.interim': 'De interinidad',
  'client.employment.modality.unknown': 'No lo sé',
  'client.employment.remote.none': 'sin teletrabajo',
  'client.employment.remote.hybrid': 'en parte',
  'client.employment.remote.full': 'todo en teletrabajo',
  'client.employment.clause.non_compete': 'No competencia',
  'client.employment.clause.retention': 'Permanencia',
  'client.employment.clause.exclusivity': 'Exclusividad',
  'client.employment.clause.waiver': 'Renuncia a un derecho',
  'client.employment.clause.mandatory_overtime': 'Horas extra obligatorias',
  'client.employment.clause.overtime_included': 'Horas extra incluidas en el salario',
  'client.employment.clause.remote_work_costs': 'Gastos del teletrabajo',
  'client.employment.clause.other': 'Otra cláusula',
  'client.employment.info.a': 'Quiénes son las partes',
  'client.employment.info.b': 'Fecha de inicio y, si es temporal, de fin o duración',
  'client.employment.info.c': 'Domicilio de la empresa y centro de trabajo',
  'client.employment.info.d': 'Tus funciones y, si es temporal, su causa',
  'client.employment.info.e': 'Categoría o grupo profesional y descripción del puesto',
  'client.employment.info.f': 'Salario base, cada complemento, cuándo y cómo se paga',
  'client.employment.info.g': 'Jornada, horario, turnos, horas extra y vacaciones',
  'client.employment.info.h': 'Periodo de prueba y su duración',
  'client.employment.info.i': 'Formación',
  'client.employment.info.j': 'Empresa de trabajo temporal y empresa usuaria',
  'client.employment.info.k': 'Sistemas algorítmicos que deciden sobre tu trabajo',
  'client.employment.info.l': 'Plan de igualdad y protocolo contra el acoso',
  'client.employment.info.m': 'Medidas para la igualdad de las personas LGTBI',
  'client.employment.info.n': 'Cómo termina el contrato y sus preavisos',
  'client.employment.info.o': 'Convenio colectivo, con su código y su fecha de publicación',
  'client.employment.info.p': 'Mutua, mejoras voluntarias y planes de pensiones',
  'client.employment.info.q': 'Cuándo se puede modificar el contrato',

  'client.employment.rows.history': 'Contrato {n}',
  'client.employment.rows.history_remove': 'Quitar el contrato {n}',
  'client.employment.rows.parts': 'Parte {n}',
  'client.employment.rows.parts_remove': 'Quitar la parte {n}',
  'client.employment.rows.payslips': 'Nómina {n}',
  'client.employment.rows.payslips_remove': 'Quitar la nómina {n}',
  'client.employment.rows.schedule': 'Tramo {n}',
  'client.employment.rows.schedule_remove': 'Quitar el tramo {n}',
  'client.employment.rows.clauses': 'Cláusula {n}',
  'client.employment.rows.clauses_remove': 'Quitar la cláusula {n}',
  'client.employment.rows.remove': 'Quitar',

  'client.employment.error.missing_value': 'Falta este dato',
  'client.employment.error.missing_choice': 'Elige una respuesta',
  'client.employment.error.invalid_amount': 'No se entiende la cifra: escríbela como 1.234,56',
  'client.employment.error.invalid_number': 'Escribe un número entero',
  'client.employment.error.invalid_date': 'La fecha no es válida',
  'client.employment.error.too_far_ahead': 'La fecha es más de un año posterior a hoy',
  'client.employment.error.before_start': 'Es anterior a la fecha de inicio',
  'client.employment.error.too_late_after_start': 'Es más de un año posterior a la fecha de inicio',
  'client.employment.error.amount_range': 'Escribe una cifra mayor que cero y de hasta un millón',
  'client.employment.error.hours_range': 'El número de horas no es válido',
  'client.employment.error.percent_range': 'Escribe un porcentaje entre 0 y 100',
  'client.employment.error.payments_range': 'El número de pagas no es válido',
  'client.employment.error.count_range': 'El número no es válido',
  'client.employment.error.invalid_month': 'Escribe el mes como 2026-03',
  'client.employment.error.invalid_time': 'La hora no es válida',
  'client.employment.error.empty_slot': 'El tramo empieza y acaba a la misma hora',

  'client.employment.result.lead': 'Cada punto, con lo que dice la ley y la norma en que se apoya.',
  'client.employment.result.lead_locked': 'Cada punto con su resultado y la norma en que se apoya.',
  'client.employment.result.lead_out_of_scope':
    'Con lo que has contestado, esta revisión no calcula nada.',
  'client.employment.partial.notice':
    'Revisión parcial: tu contrato empezó o se hizo antes del 30 de marzo de 2022. Se revisan el salario, el periodo de prueba, la jornada, las vacaciones y las cláusulas; la temporalidad se rige por la norma anterior y esta versión no la revisa.',
  'client.employment.out_of_scope.status': 'Esta revisión no cubre tu tipo de contrato',
  'client.employment.out_of_scope.special_relationship':
    'Es una relación laboral especial, con sus propias normas, que esta versión no revisa.',
  'client.employment.out_of_scope.public_servant':
    'El personal funcionario tiene su propio régimen, fuera del Estatuto de los Trabajadores.',
  'client.employment.out_of_scope.temp_agency':
    'Un contrato con una empresa de trabajo temporal para trabajar en otra tiene reglas propias que esta versión no revisa.',
  'client.employment.out_of_scope.relief':
    'Un contrato de relevo tiene reglas propias que esta versión no revisa.',
  'client.employment.out_of_scope.minor':
    'Con menos de 18 años hay reglas propias de jornada y descanso. Esta versión no las calcula: abajo las tienes como información.',

  'client.employment.headline.found': 'Hay puntos que no cumplen lo que marca la ley.',
  'client.employment.headline.to_review':
    'Hay puntos que revisar o que dependen de tu convenio o de tus respuestas.',
  'client.employment.headline.nothing_found':
    'Con los datos que has metido, nada queda por debajo de lo que garantiza la ley ni por encima de sus límites.',
  'client.employment.headline.nothing_entered':
    'No has metido datos que se puedan comparar con la ley.',
  'client.employment.warning.breakdown_short_of_total':
    'El desglose suma menos que el salario: la parte que falta se cuenta como un complemento de tipo desconocido.',

  'client.employment.status.below_minimum': 'Por debajo del mínimo legal',
  'client.employment.status.below_minimum_year': 'Por debajo del SMI: {importe} al año',
  'client.employment.status.below_minimum_day': 'Por debajo del SMI: {importe} por jornada',
  'client.employment.status.below_minimum_payslips': 'Por debajo del SMI: {importe} en tus nóminas',
  'client.employment.status.below_minimum_total': 'Por debajo del mínimo legal: {importe}',
  'client.employment.status.below_minimum_year_up_to':
    'Por debajo del SMI: {importe} al año, y hasta {maximo} según tu respuesta',
  'client.employment.status.below_minimum_day_up_to':
    'Por debajo del SMI: {importe} por jornada, y hasta {maximo} según tu respuesta',
  'client.employment.status.below_minimum_payslips_up_to':
    'Por debajo del SMI: {importe} en tus nóminas, y hasta {maximo} según tu respuesta',
  'client.employment.status.below_minimum_total_up_to':
    'Por debajo del mínimo legal: {importe}, y hasta {maximo} según tu respuesta',
  'client.employment.letter.pay.lowest':
    'Estas cifras son las más bajas de las cuentas posibles con lo que sé de mi salario.',
  'client.employment.status.over_legal_limit': 'Por encima del límite legal',
  'client.employment.status.clause_void': 'Esta cláusula no vale',
  'client.employment.status.becomes_permanent': 'La ley prevé la condición de fija',
  'client.employment.status.missing_requirement': 'Falta lo que exige la ley',
  'client.employment.status.within_limit': 'Dentro del límite',
  'client.employment.status.depends_on_agreement': 'Depende de tu convenio',
  'client.employment.status.review_it': 'Revísalo',
  'client.employment.status.not_applicable_to_date': 'No aplica a tu fecha',
  'client.employment.status.not_entered': 'No lo has metido',
  'client.employment.status.not_reviewed_in_this_version': 'No se revisa en esta versión',
  'client.employment.status.not_published': 'SMI aún no publicado',
  'client.employment.status.depends': 'Depende',
  'client.employment.reading_status.below_minimum': 'por debajo del mínimo legal',
  'client.employment.reading_status.below_minimum_year': 'por debajo del SMI en {importe} al año',
  'client.employment.reading_status.below_minimum_day':
    'por debajo del SMI en {importe} por jornada',
  'client.employment.reading_status.below_minimum_payslips':
    'por debajo del SMI en {importe} en tus nóminas',
  'client.employment.reading_status.below_minimum_total':
    'por debajo del mínimo legal en {importe}',
  'client.employment.reading_status.over_legal_limit': 'por encima del límite legal',
  'client.employment.reading_status.clause_void': 'esta cláusula no vale',
  'client.employment.reading_status.becomes_permanent': 'la ley prevé la condición de fija',
  'client.employment.reading_status.missing_requirement': 'falta lo que exige la ley',
  'client.employment.reading_status.within_limit': 'dentro del límite',
  'client.employment.reading_status.depends_on_agreement': 'depende de tu convenio',
  'client.employment.reading_status.review_it': 'revísalo',
  'client.employment.reading_status.not_applicable_to_date': 'no aplica a tu fecha',
  'client.employment.reading_status.not_entered': 'sin dato',
  'client.employment.reading_status.not_reviewed_in_this_version': 'no se revisa en esta versión',
  'client.employment.reading_status.not_published': 'SMI aún no publicado',
  'client.employment.reading_line': '{cuando}: {resultado}',
  'client.employment.question.technical': 'Depende de si eres técnico titulado:',
  'client.employment.question.small_company':
    'Depende de si tu empresa tiene menos de 25 personas en plantilla:',
  'client.employment.question.chaining_cutoff':
    'Depende de qué contrato anterior a la reforma de 2022 cuenta:',
  'client.employment.question.chaining_group':
    'Depende de si cuentan los contratos con otras empresas del grupo o por ETT:',
  'client.employment.question.chaining_overlap':
    'Depende de si los contratos que se solapan son uno solo:',
  'client.employment.question.complement_kind':
    'Depende de si los complementos cuentan para el SMI:',
  'client.employment.question.paid_hours':
    'Depende de si las horas al año incluyen el descanso pagado:',
  'client.employment.question.technical_post': 'Depende de si tu puesto es técnico (art. 21.2):',
  'client.employment.question.technical_and_staff':
    'Depende de si eres técnico titulado y del tamaño de tu empresa:',
  'client.employment.reading.technical': 'Si eres técnico titulado',
  'client.employment.reading.not_technical': 'Si no lo eres',
  'client.employment.reading.technical_post': 'Si tu puesto es técnico',
  'client.employment.reading.not_technical_post': 'Si no lo es',
  'client.employment.reading.under_25_staff': 'Con menos de 25 personas',
  'client.employment.reading.from_25_staff': 'Con 25 personas o más',
  'client.employment.reading.cutoff_2021_12_31': 'Si cuenta el vigente el 31-12-2021',
  'client.employment.reading.cutoff_2022_03_30': 'Si cuenta el vigente el 30-03-2022',
  'client.employment.reading.group_counted': 'Si cuentan',
  'client.employment.reading.group_not_counted': 'Si no cuentan',
  'client.employment.reading.overlap_same_contract': 'Si son un solo contrato',
  'client.employment.reading.overlap_separate_contracts': 'Si son contratos distintos',
  'client.employment.reading.complement_fixed': 'Si cuentan todos los complementos',
  'client.employment.reading.complement_variable':
    'Si solo cuentan el salario base y los complementos fijos',
  'client.employment.reading.effective_hours': 'Si son horas de trabajo efectivo',
  'client.employment.reading.with_paid_rest': 'Si incluyen el descanso pagado',
  'client.employment.reading.not_technical_under_25_staff':
    'Si no lo eres y tu empresa tiene menos de 25 personas',
  'client.employment.reading.not_technical_from_25_staff':
    'Si no lo eres y tu empresa tiene 25 o más',
  'client.employment.since_year':
    'Desde {anio}, {importe} en total. Las cantidades se pueden pedir durante un año desde que se debieron pagar (art. 59.2): lo explica «Plazos», más abajo.',
  'client.employment.note.your_answer': 'Según lo que has contestado.',
  'client.employment.note.agreement': 'Tu convenio puede fijar otro límite.',
  'client.employment.permanent.15_4':
    'El artículo 15.4 del Estatuto de los Trabajadores dice que, en un caso como el tuyo, la persona adquiere la condición de fija:',
  'client.employment.permanent.15_5':
    'El artículo 15.5 del Estatuto de los Trabajadores dice que, en un caso como el tuyo, la persona adquiere la condición de fija:',
  'client.employment.literal.intro': 'Lo que dice la norma ({cita}):',
  'client.employment.literal.link': 'Texto en el BOE: {cita}',
  'client.employment.clause_not_assessed':
    'Sin veredicto: esta revisión no valora esta cláusula por su redacción.',
  'client.employment.clause_checked_in': 'Se revisa con tu jornada, en las horas extra.',
  'client.employment.norm.in_force': 'en vigor',
  'client.employment.norm.pending_validation': 'pendiente de convalidación',
  'client.employment.norm.repealed': 'derogada el {fecha}',
  'client.employment.source.since': 'con efectos desde el {desde}',
  'client.employment.source.between': 'con efectos del {desde} al {hasta}',

  'client.employment.duty.title': 'Información obligatoria por escrito',
  'client.employment.duty.short_relation': 'No aplica: tu contrato dura cuatro semanas o menos.',
  'client.employment.duty.ended_before_decree':
    'No aplica: tu contrato terminó antes del 5 de octubre de 2026.',
  'client.employment.duty.missing_one': 'Falta {n} punto de los que pide la ley',
  'client.employment.duty.missing_many': 'Faltan {n} puntos de los que pide la ley',
  'client.employment.duty.review_one': 'Revisa {n} punto',
  'client.employment.duty.review_many': 'Revisa {n} puntos',
  'client.employment.duty.complete': 'Están todos los puntos que pide la ley',
  'client.employment.duty.before_start':
    'Tu contrato empezó desde el 5 de octubre de 2026: la empresa tenía que darte esta información por escrito antes de empezar.',
  'client.employment.duty.on_request':
    'Tu contrato ya estaba en marcha el 5 de octubre de 2026: puedes pedir esta información por escrito y la empresa tiene 30 días hábiles.',
  'client.employment.duty.temp_agency_only': 'Solo para contratos por ETT',

  'client.employment.offer.title': 'La oferta frente al contrato',
  'client.employment.offer.none': 'Sin diferencias en lo que se puede comparar',
  'client.employment.offer.count_one': 'Difieren en {n} punto',
  'client.employment.offer.count_many': 'Difieren en {n} puntos',
  'client.employment.offer.no_verdict':
    'Solo se ponen lado a lado: esta revisión no dice cuál de los dos vale.',
  'client.employment.offer.difference.gross_annual':
    'Salario bruto al año: la oferta decía {oferta}; el contrato dice {contrato}.',
  'client.employment.offer.difference.weekly_hours':
    'Horas a la semana: la oferta decía {oferta}; el contrato dice {contrato}.',
  'client.employment.offer.difference.modality':
    'Tipo de contrato: la oferta decía {oferta}; el contrato dice {contrato}.',
  'client.employment.offer.difference.remote':
    'Teletrabajo: la oferta decía {oferta}; el contrato dice {contrato}.',
  'client.employment.offer.field.gross_annual': 'el salario',
  'client.employment.offer.field.weekly_hours': 'las horas',
  'client.employment.offer.field.modality': 'el tipo de contrato',
  'client.employment.offer.field.remote': 'el teletrabajo',
  'client.employment.offer.not_compared.net_against_gross':
    'No se compara {dato}: la oferta da una cifra neta y el contrato, bruta.',
  'client.employment.offer.not_compared.not_known':
    'No se compara {dato}: falta en la oferta o en el contrato.',

  'client.employment.reference.title': 'Si un juzgado lo declarase así',
  'client.employment.reference.lead':
    'Dos cifras de referencia a {fecha}, por si un juzgado declarase indefinido tu contrato. No son una recomendación ni una cantidad a tu favor.',
  'client.employment.reference.fixed_term_end':
    'Fin de contrato temporal (art. 49.1.c): {importe}.',
  'client.employment.reference.fixed_term_end_range':
    'Fin de contrato temporal (art. 49.1.c): entre {minimo} y {maximo}.',
  'client.employment.reference.unfair_dismissal': 'Despido improcedente (art. 56): {importe}.',
  'client.employment.reference.unfair_dismissal_range':
    'Despido improcedente (art. 56): entre {minimo} y {maximo}.',

  'client.employment.block.agreement': 'Tu convenio colectivo',
  'client.employment.block.public_holidays': 'Festivos',
  'client.employment.block.time_record': 'Registro de jornada',
  'client.employment.block.late_payment_interest': 'Retrasos en el pago',
  'client.employment.block.limitation': 'Plazos',
  'client.employment.block.information_model': 'Modelo de documento informativo',
  'client.employment.block.minors': 'Menores de 18 años',
  'client.employment.block.out_of_scope': 'Fuera de esta revisión',
  'client.employment.link.regcon': 'REGCON, registro de convenios colectivos',

  'client.employment.unchecked.agreement_tables': 'Las tablas salariales de tu convenio.',
  'client.employment.unchecked.bonuses': 'Los pluses y complementos que fija tu convenio.',
  'client.employment.unchecked.real_hours': 'Las horas que trabajas de verdad.',
  'client.employment.unchecked.equal_pay': 'La igualdad retributiva.',
  'client.employment.unchecked.contributions': 'La cotización a la Seguridad Social.',
  'client.employment.unchecked.net_pay': 'El salario neto y el IRPF.',
  'client.employment.unchecked.later_agreements': 'Si un acuerdo posterior cambió el contrato.',

  'client.employment.finding.smi_annual': 'Salario frente al SMI',
  'client.employment.finding.smi_prorata': 'Salario frente al SMI, en proporción a tu jornada',
  'client.employment.finding.smi_in_kind_cap': 'Salario en especie',
  'client.employment.finding.smi_temporary_120': 'Salario por jornada frente al SMI',
  'client.employment.finding.smi_absorption': 'Absorción del SMI',
  'client.employment.finding.smi_monthly': 'Nóminas frente al SMI',
  'client.employment.finding.agreement_salary': 'Salario de tu categoría, según tu dato',
  'client.employment.finding.fixed_term_presumption': 'Tipo de contrato y su causa',
  'client.employment.finding.production_6_months': 'Duración del contrato por producción',
  'client.employment.finding.production_1_year': 'Duración del contrato por producción',
  'client.employment.finding.production_one_extension': 'Prórrogas',
  'client.employment.finding.production_occasional_90': 'Días por situaciones ocasionales',
  'client.employment.finding.production_occasional_agrifood_120':
    'Días por situaciones ocasionales',
  'client.employment.finding.replacement_name_cause': 'Contrato de sustitución',
  'client.employment.finding.replacement_selection_3_months':
    'Sustitución durante un proceso de selección',
  'client.employment.finding.abolished_modalities': 'Modalidad de contrato',
  'client.employment.finding.permanent_on_breach': 'Contrato temporal fuera de la ley',
  'client.employment.finding.chaining_18_in_24': 'Contratos temporales encadenados',
  'client.employment.finding.temporary_certificate': 'Certificado de contratos temporales',
  'client.employment.finding.discontinuous_essentials': 'Contrato fijo discontinuo',
  'client.employment.finding.training_alternance_duration':
    'Duración de la formación en alternancia',
  'client.employment.finding.training_alternance_effective_work': 'Tiempo de trabajo efectivo',
  'client.employment.finding.training_alternance_no_overtime': 'Turnos, noche y horas extra',
  'client.employment.finding.training_alternance_no_trial': 'Periodo de prueba',
  'client.employment.finding.training_alternance_pay': 'Salario en alternancia',
  'client.employment.finding.training_practice_window': 'Plazo desde que acabaste los estudios',
  'client.employment.finding.training_practice_duration': 'Duración del contrato en prácticas',
  'client.employment.finding.training_practice_trial': 'Periodo de prueba',
  'client.employment.finding.training_practice_no_overtime': 'Horas extra',
  'client.employment.finding.training_practice_pay': 'Salario en prácticas',
  'client.employment.finding.training_plan_attached': 'Plan formativo',
  'client.employment.finding.training_no_new_trial': 'Periodo de prueba',
  'client.employment.finding.written_form': 'Contrato por escrito',
  'client.employment.finding.trial_limits': 'Periodo de prueba',
  'client.employment.finding.trial_temporary_1_month': 'Periodo de prueba',
  'client.employment.finding.trial_void_same_duties': 'Periodo de prueba',
  'client.employment.finding.weekly_40': 'Horas a la semana',
  'client.employment.finding.daily_9': 'Horas al día',
  'client.employment.finding.rest_12': 'Descanso entre jornadas',
  'client.employment.finding.weekly_rest_36': 'Descanso semanal',
  'client.employment.finding.break_15': 'Pausa en la jornada',
  'client.employment.finding.night_limits': 'Trabajo nocturno',
  'client.employment.finding.overtime_cap_80': 'Horas extra',
  'client.employment.finding.overtime_voluntary': 'Horas extra',
  'client.employment.finding.overtime_value': 'Horas extra incluidas en el salario',
  'client.employment.finding.time_record': 'Registro de jornada',
  'client.employment.finding.special_working_time': 'Jornadas especiales',
  'client.employment.finding.part_time_contents': 'Contrato a tiempo parcial',
  'client.employment.finding.part_time_no_overtime': 'Horas extra a tiempo parcial',
  'client.employment.finding.part_time_record': 'Resumen mensual de horas',
  'client.employment.finding.complementary_hours': 'Horas complementarias',
  'client.employment.finding.voluntary_complementary': 'Horas complementarias voluntarias',
  'client.employment.finding.holidays_30': 'Vacaciones',
  'client.employment.finding.holidays_not_paid_out': 'Vacaciones pagadas en el salario',
  'client.employment.finding.extra_pays': 'Pagas extra',
  'client.employment.finding.non_compete': 'No competencia',
  'client.employment.finding.exclusivity': 'Exclusividad',
  'client.employment.finding.retention': 'Permanencia',
  'client.employment.finding.waiver': 'Renuncia a un derecho',
  'client.employment.finding.partial_nullity': 'Nulidad parcial',
  'client.employment.finding.remote_costs': 'Gastos del teletrabajo',
  'client.employment.finding.info_elements': 'Información obligatoria',
  'client.employment.finding.info_before_start': 'Información antes de empezar',
  'client.employment.finding.info_on_request': 'Información a petición',
  'client.employment.finding.info_short_relations': 'Relaciones de cuatro semanas o menos',
  'client.employment.finding.info_model': 'Modelo de documento informativo',
  'client.employment.finding.public_holidays': 'Festivos',
  'client.employment.finding.minors_work': 'Trabajo de menores',
  'client.employment.finding.late_payment_interest': 'Retrasos en el pago',
  'client.employment.finding.limitation': 'Plazos',

  'client.employment.calculation.minimum_wage.not_published':
    'El SMI de {year} aún no se ha publicado en el BOE. Como referencia, el de {referenceYear}: {reference}. Para {year} no se calcula ninguna diferencia.',
  'client.employment.calculation.minimum_wage.not_loaded':
    'Esta revisión tiene el SMI desde {from}: los años anteriores no se comparan.',
  'client.employment.calculation.minimum_wage.pay.year': 'Salario pactado: {annual} al año.',
  'client.employment.calculation.minimum_wage.pay.month':
    'Salario pactado: {monthly} al mes en {payments} pagas, contando cada paga extra como una mensualidad: {annual} al año.',
  'client.employment.calculation.minimum_wage.pay.month_prorated':
    'Salario pactado: {monthly} al mes con las pagas extra prorrateadas: {annual} al año.',
  'client.employment.calculation.minimum_wage.pay.day':
    'Salario pactado: {daily} al día por {days}: {annual} al año.',
  'client.employment.calculation.minimum_wage.pay.hour':
    'Salario pactado: {hourly} la hora por {hours} h al año: {annual}.',
  'client.employment.calculation.minimum_wage.pay.hour_weekly':
    'Salario pactado: {hourly} la hora por {weekly} h a la semana durante {weeks} semanas: {annual} al año.',
  'client.employment.calculation.minimum_wage.pay.hour_with_paid_rest':
    'Si tus {hours} h al año son solo de trabajo efectivo, con el descanso pagado (vacaciones y festivos, {restDays}) son {paidHours} h pagadas: {hourly} la hora, {annual} al año.',
  'client.employment.calculation.minimum_wage.pay.hours_unknown':
    'Sin las horas del contrato, un salario por hora no se puede pasar a un año.',
  'client.employment.calculation.minimum_wage.pay.extra_pays_unknown':
    'El contrato tiene {count} sin prorratear y no se sabe su importe: no se suman al año.',
  'client.employment.calculation.minimum_wage.breakdown_gap':
    'El desglose deja sin explicar {gap}: se cuenta como un complemento de tipo desconocido.',
  'client.employment.calculation.minimum_wage.excluded':
    'No se cuentan {excluded} de complementos variables o de tipo desconocido.',
  'client.employment.calculation.minimum_wage.in_kind_not_counted':
    'El salario en especie no se cuenta: el SMI se paga en dinero.',
  'client.employment.calculation.minimum_wage.prorata':
    'Jornada de {hours} h a la semana sobre {fullTime} h a tiempo completo: el SMI se aplica en proporción ({coefficient}).',
  'client.employment.calculation.minimum_wage.prorata_annual':
    'Jornada de {hours} h al año sobre {fullTime} h a tiempo completo: el SMI se aplica en proporción ({coefficient}).',
  'client.employment.calculation.minimum_wage.legal_week':
    'Se toma como tiempo completo la semana legal de 40 horas; si tu convenio fija menos, el mínimo es algo mayor.',
  'client.employment.calculation.minimum_wage.year.within':
    '{year}: SMI de {minimum}; tu salario, {pay}. No queda por debajo.',
  'client.employment.calculation.minimum_wage.year.below':
    '{year}: SMI de {minimum}; tu salario, {pay}. Faltan {difference} al año; en {days} de contrato ese año, {accrued}.',
  'client.employment.calculation.minimum_wage.year.below_no_total':
    '{year}: SMI de {minimum}; tu salario, {pay}. Faltan {difference} al año.',
  'client.employment.calculation.minimum_wage.year.effects_unverified':
    '{year}: tu salario, {pay}, queda por debajo del SMI de {minimum}, pero no está comprobado que ese SMI se aplique desde el 1 de enero; el del año anterior era {previous}.',
  'client.employment.calculation.minimum_wage.year.effects_unverified_no_previous':
    '{year}: tu salario, {pay}, queda por debajo del SMI de {minimum}, pero no está comprobado que ese SMI se aplique desde el 1 de enero.',
  'client.employment.calculation.minimum_wage.year.hours_unknown':
    '{year}: SMI de {minimum}; tu salario, {pay}. Puede quedar por debajo, pero sin las horas del contrato no se sabe.',
  'client.employment.calculation.minimum_wage.year.extra_pays_unknown':
    '{year}: SMI de {minimum}; tu salario sin las pagas extra, {pay}. Puede quedar por debajo, pero falta el importe de las pagas extra.',
  'client.employment.calculation.minimum_wage.year.training_effective_work':
    '{year}: SMI de {minimum}; tu salario, {pay}. En formación en alternancia el mínimo va en proporción al tiempo de trabajo efectivo, que esta revisión no calcula.',
  'client.employment.calculation.minimum_wage.year.salary_may_have_risen':
    '{year}: SMI de {minimum}; el salario de tu contrato, {pay}, quedaría por debajo, pero no se sabe si te lo subieron después de firmarlo. Tus nóminas de {year} lo dirán.',
  'client.employment.calculation.minimum_wage.temporary.within':
    '{year}: mínimo por jornada de {minimum} en contratos de hasta 120 días; tu salario por día, {pay}. No queda por debajo.',
  'client.employment.calculation.minimum_wage.temporary.below':
    '{year}: mínimo por jornada de {minimum} en contratos de hasta 120 días; tu salario por día, {pay}. Faltan {difference} por jornada.',
  'client.employment.calculation.minimum_wage.temporary.effects_unverified':
    '{year}: tu salario por día, {pay}, queda por debajo del mínimo por jornada de {minimum}, pero no está comprobado que se aplique desde el 1 de enero; el del año anterior era {previous}.',
  'client.employment.calculation.minimum_wage.temporary.effects_unverified_no_previous':
    '{year}: tu salario por día, {pay}, queda por debajo del mínimo por jornada de {minimum}, pero no está comprobado que se aplique desde el 1 de enero.',
  'client.employment.calculation.minimum_wage.temporary.hours_unknown':
    '{year}: mínimo por jornada de {minimum}; tu salario por día, {pay}. Sin las horas del contrato no se sabe si queda por debajo.',
  'client.employment.calculation.minimum_wage.temporary.extra_pays_unknown':
    '{year}: mínimo por jornada de {minimum}; tu salario por día, {pay}. Falta el importe de las pagas extra.',
  'client.employment.calculation.minimum_wage.temporary.training_effective_work':
    '{year}: mínimo por jornada de {minimum}; tu salario por día, {pay}. En formación en alternancia el mínimo va en proporción al trabajo efectivo.',
  'client.employment.calculation.minimum_wage.temporary.salary_may_have_risen':
    '{year}: mínimo por jornada de {minimum}; el salario por día de tu contrato, {pay}, quedaría por debajo, pero no se sabe si te lo subieron en {year}. Tus nóminas de ese año lo dirán.',
  'client.employment.calculation.minimum_wage.discontinuous_periods':
    'En un fijo discontinuo solo cuentan los periodos de actividad, así que no se da un total.',
  'client.employment.calculation.minimum_wage.total': 'En total, {total}.',
  'client.employment.calculation.minimum_wage.agreement_may_pay_more':
    'Tu convenio puede fijar un salario mayor que el SMI: está en su tabla salarial.',
  'client.employment.calculation.minimum_wage.payslip.within':
    'Nómina de {month} de {year}: {paid}; el mínimo de ese mes es {minimum}.',
  'client.employment.calculation.minimum_wage.payslip.below':
    'Nómina de {month} de {year}: {paid}; el mínimo de ese mes es {minimum}. Faltan {difference}.',
  'client.employment.calculation.minimum_wage.payslip.effects_unverified':
    'Nómina de {month} de {year}: {paid}, por debajo de {minimum}, pero no está comprobado que el SMI de ese año se aplique desde el 1 de enero.',
  'client.employment.calculation.minimum_wage.payslip.hours_unknown':
    'Nómina de {month} de {year}: {paid}, por debajo de {minimum} a tiempo completo; sin las horas del contrato no se puede aplicar la proporción.',
  'client.employment.calculation.minimum_wage.payslip.extra_pays_unknown':
    'Nómina de {month} de {year}: {paid}; el mínimo de ese mes es {minimum}, y falta el importe de las pagas extra.',
  'client.employment.calculation.minimum_wage.payslip.training_effective_work':
    'Nómina de {month} de {year}: {paid}; el mínimo a tiempo completo es {minimum}, y en formación en alternancia va en proporción al trabajo efectivo.',
  'client.employment.calculation.minimum_wage.payslip.not_compared':
    'Nómina de {month} de {year}: no es de un mes completo o tiene incidencias, así que no se compara.',
  'client.employment.calculation.minimum_wage.payslip.not_published':
    'Nómina de {month} de {year}: el SMI de {year} aún no se ha publicado; el de {referenceYear} era {reference} al mes.',
  'client.employment.calculation.minimum_wage.payslip.not_loaded':
    'Nómina de {month} de {year}: esta revisión no tiene el SMI de ese año.',
  'client.employment.calculation.minimum_wage.payslip.annual_decides':
    'Nómina de {month} de {year}: {paid}, por debajo de los {minimum} de ese mes; con las pagas extra aparte, lo que cuenta es el cómputo anual.',
  'client.employment.calculation.minimum_wage.payslip.prorated_count_unknown':
    'Nómina de {month} de {year}: {paid} con parte de las pagas extra; no se sabe cuántas van prorrateadas, así que lo que cuenta es el cómputo anual (mínimo de {minimum}).',
  'client.employment.calculation.minimum_wage.payslip.annual_within':
    'Nómina de {month} de {year}: {paid}, por debajo de los {minimum} de ese mes; pero el SMI se compara en el conjunto del año, y tu salario de {year} no queda por debajo. Un mes solo no basta.',
  'client.employment.calculation.minimum_wage.payslip.annual_unproven':
    'Nómina de {month} de {year}: {paid}, por debajo de los {minimum} de ese mes; el SMI se compara en el conjunto del año, así que hacen falta las demás nóminas de {year} para saberlo.',
  'client.employment.calculation.minimum_wage.payslip.none': 'No has metido nóminas.',
  'client.employment.calculation.minimum_wage.in_kind':
    'En especie, {inKind} al año; en dinero, {money}. La especie es el {percent} % del salario y el máximo es el 30 %.',
  'client.employment.calculation.minimum_wage.in_kind_rate':
    'Con un salario por día o por hora no se puede calcular qué parte del año es especie ({inKind} por periodo); el máximo es el 30 %.',
  'client.employment.calculation.minimum_wage.agreement.within':
    'Según tu dato, tu categoría cobra {category} al año ({minimum} con tu jornada); tu salario, {pay}, no queda por debajo.',
  'client.employment.calculation.minimum_wage.agreement.below':
    'Según tu dato, tu categoría cobra {category} al año ({minimum} con tu jornada); tu salario, {pay}, queda {difference} por debajo. Depende de tu convenio: está en su tabla salarial.',
  'client.employment.calculation.modality.before_reform':
    'Tu contrato empezó o se hizo antes del 30 de marzo de 2022: su temporalidad se rige por la norma anterior y esta versión no la revisa.',
  'client.employment.calculation.modality.permanent':
    'Es un contrato indefinido: no tiene límites de temporalidad.',
  'client.employment.calculation.modality.unknown':
    'Sin saber el tipo de contrato no se pueden comprobar sus límites.',
  'client.employment.calculation.modality.abolished':
    'Desde el 30 de marzo de 2022 ya no se puede hacer un contrato de obra o servicio: un contrato temporal solo cabe por circunstancias de la producción o por sustitución.',
  'client.employment.calculation.modality.outdated_label':
    'El contrato usa un nombre de antes de la reforma de 2022; se revisa como el tipo actual que le corresponde.',
  'client.employment.calculation.modality.permanent_on_breach':
    'El artículo 15.4 del Estatuto de los Trabajadores dice que, en un caso como el tuyo, la persona adquiere la condición de fija.',
  'client.employment.calculation.modality.rule_in_doubt':
    'La norma en que se apoya está en duda ese día, así que solo se pide revisarlo.',
  'client.employment.calculation.modality.cause_stated':
    'Según lo que has contestado, el contrato explica la causa y las circunstancias.',
  'client.employment.calculation.modality.cause_missing':
    'Según lo que has contestado, el contrato no explica la causa, las circunstancias o su relación con la duración, como pide el art. 15.1.',
  'client.employment.calculation.modality.cause_unknown':
    'No sabes si el contrato explica la causa y las circunstancias.',
  'client.employment.calculation.modality.duration': 'El contrato dura {duracion}.',
  'client.employment.calculation.modality.duration_so_far':
    'Sin fecha de fin, el contrato lleva {duracion} hasta hoy.',
  'client.employment.calculation.modality.no_end_date':
    'Sin fecha de fin no se puede saber si pasará del límite.',
  'client.employment.calculation.modality.production_within':
    'No pasa de 6 meses, el límite del art. 15.2.',
  'client.employment.calculation.modality.production_agreement_year':
    'Pasa de 6 meses: solo cabe si tu convenio sectorial amplía la duración, hasta un año.',
  'client.employment.calculation.modality.production_over_year':
    'Pasa de un año, el máximo del art. 15.2 incluso con convenio.',
  'client.employment.calculation.modality.extensions':
    'Ha tenido {prorrogas}; el art. 15.2 permite una sola.',
  'client.employment.calculation.modality.occasional_days':
    'En {anio}, {dias} de contrato; el límite para situaciones ocasionales es de {limite} al año.',
  'client.employment.calculation.modality.occasional_agrifood':
    'En el sector agroalimentario el límite es de 120 días, y esta revisión no sabe tu sector.',
  'client.employment.calculation.modality.replacement_stated':
    'Según lo que has contestado, el contrato dice a quién sustituyes y por qué.',
  'client.employment.calculation.modality.replacement_missing':
    'Según lo que has contestado, al contrato le falta el nombre de la persona sustituida o la causa, que pide el art. 15.3.',
  'client.employment.calculation.modality.replacement_unknown':
    'No sabes si el contrato dice a quién sustituyes y por qué.',
  'client.employment.calculation.modality.selection_within':
    'No pasa de 3 meses, el máximo para cubrir un puesto durante un proceso de selección; tu convenio puede fijar menos.',
  'client.employment.calculation.modality.selection_over':
    'Pasa de 3 meses, el máximo para cubrir un puesto durante un proceso de selección.',
  'client.employment.calculation.modality.training_too_short':
    'Dura menos de {minimo}, el mínimo legal (entre {minimo} y {maximo}). Puede que acabara antes por otra causa.',
  'client.employment.calculation.modality.training_too_long':
    'Pasa de {maximo}, el máximo legal (entre {minimo} y {maximo}).',
  'client.employment.calculation.modality.training_within':
    'Está entre {minimo} y {maximo}, lo que fija la ley.',
  'client.employment.calculation.modality.training_max_disability':
    'Las bajas y otras suspensiones paran la cuenta, y con discapacidad el máximo puede ser mayor.',
  'client.employment.calculation.modality.practice_window':
    'Se hizo {meses} después de acabar los estudios; el límite es de {limite}.',
  'client.employment.calculation.modality.practice_window_disability_unknown':
    'Con una discapacidad el límite es de 5 años, y no sabemos si es tu caso.',
  'client.employment.calculation.modality.effective_work':
    'Año {anio} del contrato: {porcentaje} % de trabajo efectivo; el máximo es el {limite} %.',
  'client.employment.calculation.modality.effective_work_unknown':
    'No has metido el porcentaje de trabajo efectivo.',
  'client.employment.calculation.modality.alternance_shifts_or_night':
    'En formación en alternancia no se trabaja a turnos ni de noche, salvo de forma excepcional si la formación lo necesita.',
  'client.employment.calculation.modality.plan_attached':
    'Según lo que has contestado, el contrato lleva el plan formativo individual.',
  'client.employment.calculation.modality.plan_missing':
    'Según lo que has contestado, el contrato no lleva el plan formativo individual que pide el art. 11.4.c.',
  'client.employment.calculation.modality.plan_unknown':
    'No sabes si el contrato lleva el plan formativo individual.',
  'client.employment.calculation.modality.studies_end_unknown':
    'Sin la fecha en que acabaste los estudios no se puede comprobar el plazo.',
  'client.employment.calculation.modality.written_missing':
    'Según lo que has contestado, no tienes contrato por escrito, y tu tipo de contrato tiene que hacerse por escrito (art. 8.2).',
  'client.employment.calculation.modality.written_unknown':
    'No sabes si tienes contrato por escrito, y tu tipo de contrato tiene que hacerse por escrito.',
  'client.employment.calculation.modality.discontinuous_stated':
    'Según lo que has contestado, el contrato dice el periodo de actividad, la jornada y su distribución.',
  'client.employment.calculation.modality.discontinuous_missing':
    'Según lo que has contestado, al contrato le falta el periodo de actividad, la jornada o su distribución, que pide el art. 16.2, aunque sea de forma estimada.',
  'client.employment.calculation.modality.discontinuous_unknown':
    'No sabes si el contrato dice el periodo de actividad, la jornada y su distribución.',
  'client.employment.calculation.chaining.no_history':
    'Sin tu vida laboral no se pueden sumar tus contratos. El art. 15.5 pone un límite de 18 meses dentro de 24 con dos o más contratos por circunstancias de la producción.',
  'client.employment.calculation.chaining.within':
    'En la ventana de 24 meses con más días, {contratos} suman {dias}; el límite es de 18 meses ({limite}).',
  'client.employment.calculation.chaining.history_incomplete':
    'En la lista faltan contratos más antiguos de tu vida laboral: si alguno es con la misma empresa, podría sumar. Con lo que hay no se puede confirmar que estés dentro del límite.',
  'client.employment.calculation.chaining.near_limit':
    'En una ventana de 24 meses, {contratos} suman {dias}, tan cerca del límite de 18 meses ({limite}) que depende de cómo se cuenten el primer y el último día.',
  'client.employment.calculation.chaining.exceeds':
    'En una ventana de 24 meses, {contratos} suman {dias}, más que los 18 meses ({limite}) del art. 15.5.',
  'client.employment.calculation.chaining.permanent':
    'El artículo 15.5 del Estatuto de los Trabajadores dice que, en un caso como el tuyo, la persona adquiere la condición de fija.',
  'client.employment.calculation.chaining.depends_on_cutoff':
    'Depende de qué contrato anterior a la reforma cuenta: el vigente el 31 de diciembre de 2021 o el vigente el 30 de marzo de 2022.',
  'client.employment.calculation.chaining.depends_on_group':
    'Depende de si cuentan los contratos con otras empresas del grupo o a través de una ETT.',
  'client.employment.calculation.chaining.depends_on_overlap':
    'Depende de si los contratos que se solapan son uno solo o varios.',
  'client.employment.calculation.chaining.same_group_not_counted':
    'No se han sumado {contratos} con otras empresas del grupo o a través de una ETT.',
  'client.employment.calculation.chaining.kind_unknown_not_counted':
    'No se han sumado {contratos} con la misma empresa cuyo tipo no sabes.',
  'client.employment.calculation.clause.partial_nullity':
    'Esa parte del contrato se sustituye por lo que dice la ley y el resto sigue valiendo (art. 9.1).',
  'client.employment.calculation.trial.amount_days': '{amount}',
  'client.employment.calculation.trial.amount_weeks': '{amount}',
  'client.employment.calculation.trial.amount_months': '{amount}',
  'client.employment.calculation.trial.within_legal_limit':
    'Periodo de prueba de {trial}; el límite legal es de {months}.',
  'client.employment.calculation.trial.over_legal_limit':
    'Periodo de prueba de {trial}; pasa del límite legal de {months}, aunque tu convenio puede fijar otro.',
  'client.employment.calculation.trial.within_your_agreement':
    'Periodo de prueba de {trial}; según tu dato, tu convenio permite {months}.',
  'client.employment.calculation.trial.over_your_agreement':
    'Periodo de prueba de {trial}; según tu dato, tu convenio permite {months}, y lo pasa.',
  'client.employment.calculation.trial.temporary_end_unknown':
    'Sin fecha de fin no se sabe si el contrato dura 6 meses o menos; si es así, el límite es de {months}.',
  'client.employment.calculation.trial.void_alternance':
    'En un contrato de formación en alternancia no cabe periodo de prueba, y el tuyo pone {trial}.',
  'client.employment.calculation.trial.void_after_training':
    'Si sigues en la empresa después de un contrato formativo, no cabe un periodo de prueba nuevo, y el tuyo pone {trial}.',
  'client.employment.calculation.trial.void_same_duties':
    'Según lo que has contestado, ya habías hecho este trabajo en la empresa, y entonces no cabe periodo de prueba; el tuyo pone {trial}.',
  'client.employment.calculation.trial.not_in_writing':
    'El periodo de prueba solo cabe si se pacta por escrito, y según lo que has contestado no tienes contrato por escrito; el tuyo sería de {trial}.',
  'client.employment.calculation.working_time.weekly_hours_agreed':
    'El contrato fija {hours} h a la semana; el máximo legal es de 40 h de media.',
  'client.employment.calculation.working_time.weekly_hours_scheduled':
    'Tu horario suma {hours} h a la semana; el máximo legal es de 40 h de media.',
  'client.employment.calculation.working_time.irregular_distribution':
    'Con una distribución irregular, el límite de 40 h es de media en el año.',
  'client.employment.calculation.working_time.time_worked_counts':
    'El límite es de trabajo efectivo de media en el año: las pausas o los turnos pueden bajar la cuenta.',
  'client.employment.calculation.working_time.longest_day':
    'El día más largo es el {day}, con {hours} h; el límite es de 9 h ordinarias, salvo que tu convenio o un acuerdo las repartan de otra forma.',
  'client.employment.calculation.working_time.shortest_rest':
    'El descanso más corto entre dos jornadas es de {hours} h; el mínimo es de 12 h.',
  'client.employment.calculation.working_time.longest_rest':
    'El descanso más largo de la semana es de {hours} h; el mínimo es de 36 h seguidas.',
  'client.employment.calculation.working_time.special_regimes':
    'Algunos sectores y los cambios de turno tienen reglas especiales que permiten acortarlo con compensación (RD 1561/1995).',
  'client.employment.calculation.working_time.longest_stretch':
    'El tramo seguido más largo es de {hours} h; a partir de 6 h seguidas hay una pausa de al menos 15 minutos.',
  'client.employment.calculation.working_time.night_hours_in_schedule':
    'Tu horario tiene al menos 3 h de noche en {days} a la semana.',
  'client.employment.calculation.working_time.night_average':
    'De media trabajas {hours} h al día; en trabajo nocturno el límite es de 8 h.',
  'client.employment.calculation.working_time.night_overtime':
    'Quien trabaja de noche no hace horas extra, y tu contrato las pacta.',
  'client.employment.calculation.working_time.overtime_not_allowed':
    'En tu tipo de contrato no se hacen horas extra, salvo para prevenir o reparar daños urgentes (art. 35.3).',
  'client.employment.calculation.working_time.overtime_as_needed':
    'El contrato te obliga a las horas extra que hagan falta, sin límite; la ley pone un máximo de {cap} h al año.',
  'client.employment.calculation.working_time.overtime_hours':
    'El contrato pacta {hours} h extra al año; el máximo legal para tu jornada es de {cap} h.',
  'client.employment.calculation.working_time.overtime_rest_not_counted':
    'Las horas compensadas con descanso en los 4 meses siguientes no cuentan para ese máximo.',
  'client.employment.calculation.working_time.time_record':
    'La empresa registra cada día el inicio y el final de tu jornada, y tienes derecho a verlo (art. 34.9).',
  'client.employment.calculation.part_time.hours_missing':
    'El contrato no dice cuántas horas trabajas.',
  'client.employment.calculation.part_time.distribution_missing':
    'El contrato no dice cómo se reparten tus horas.',
  'client.employment.calculation.part_time.full_time_presumed':
    'Sin eso, el art. 12.4.a presume que el contrato es a jornada completa, salvo prueba en contrario.',
  'client.employment.calculation.part_time.complementary_under_10_hours':
    'Con {hours} h a la semana no caben horas complementarias: el mínimo es de 10 h.',
  'client.employment.calculation.part_time.complementary_percent':
    'Las horas complementarias pactadas son el {percent} % de las ordinarias; el límite es el {cap} %, y tu convenio puede subirlo hasta el {agreementMax} %.',
  'client.employment.calculation.part_time.complementary_notice':
    'Te avisan con {days} de antelación; el mínimo es de {minimum}, salvo que tu convenio fije menos.',
  'client.employment.calculation.part_time.voluntary_percent':
    'Las horas complementarias voluntarias son el {percent} %; el límite es el {cap} %, y tu convenio puede subirlo hasta el {agreementMax} %.',
  'client.employment.calculation.part_time.voluntary_needs_open_ended':
    'Las horas complementarias voluntarias solo caben en contratos indefinidos.',
  'client.employment.calculation.part_time.monthly_summary':
    'A tiempo parcial, tienes derecho a una copia del resumen de tus horas de cada mes junto con la nómina (art. 12.4.c).',
  'client.employment.calculation.holidays.calendar_days':
    'El contrato fija {days} naturales de vacaciones; el mínimo legal es de 30.',
  'client.employment.calculation.holidays.working_days':
    'El contrato fija {days} laborables de vacaciones.',
  'client.employment.calculation.holidays.working_days_equivalent':
    '{days} laborables con {week} de trabajo a la semana equivalen a unos {calendar} naturales.',
  'client.employment.calculation.holidays.counted_in_calendar_days':
    'El mínimo legal se cuenta en días naturales: {minimum}.',
  'client.employment.calculation.holidays.under_your_agreement':
    'Según tu dato, tu convenio da {agreed}.',
  'client.employment.calculation.holidays.span_unknown':
    'Sin fecha de fin no se sabe si te corresponden los 30 días enteros o la parte proporcional.',
  'client.employment.calculation.holidays.prorated_entitlement':
    'Para un contrato de {span}, la parte proporcional de 30 días es de {entitled}.',
  'client.employment.calculation.holidays.may_be_annual':
    'La cifra del contrato puede ser al año y no solo para este contrato.',
  'client.employment.calculation.holidays.prorated_if_temporary':
    'Solo un contrato temporal cuenta la parte proporcional; si es indefinido, son 30 días.',
  'client.employment.calculation.holidays.under_your_agreement_prorated':
    'Según tu dato, tu convenio da {agreed} al año: {entitled} para este contrato.',
  'client.employment.calculation.holidays.included_in_salary':
    'Las vacaciones no se pueden cambiar por dinero mientras sigue el contrato (art. 38.1).',
  'client.employment.calculation.holidays.short_temporary_exception':
    'En contratos temporales de hasta {days}, la norma del SMI permite pagar las vacaciones con el salario de cada día.',
  'client.employment.calculation.extra_pays.count': 'El contrato fija {count} al año.',
  'client.employment.calculation.extra_pays.amount_by_agreement': 'Su importe lo fija tu convenio.',
  'client.employment.calculation.extra_pays.one_may_be_prorated':
    'La ley prevé 2 pagas extra al año; puede que la otra vaya prorrateada.',
  'client.employment.calculation.extra_pays.prorated_by_agreement':
    'Las pagas extra van prorrateadas: el art. 31 prevé que eso lo acuerde el convenio.',
  'client.employment.calculation.extra_pays.none_over_minimum':
    'Tu salario de {year}, {annual} al año, llega al SMI, que es de {minimum}. El art. 31 da derecho a dos pagas extra, pero su importe lo fija tu convenio, que también puede repartirlas en las 12 nóminas: puede que tu salario ya las lleve dentro.',
  'client.employment.calculation.extra_pays.none_below_minimum':
    'Sin pagas extra, tu salario de {year}, {annual} al año, no llega al SMI, que es de {minimum} y ya cuenta las dos pagas (art. 31).',
  'client.employment.calculation.extra_pays.none_pay_unknown':
    'El art. 31 da derecho a dos pagas extra, y el convenio puede repartirlas en las 12 nóminas; sin saber tu salario al año no se puede comprobar si van dentro.',
  'client.employment.calculation.extra_pays.in_daily_minimum':
    'En un contrato temporal de hasta {days} pagado por días, el mínimo por jornada ya incluye las pagas extra, los domingos y los festivos (art. 4.1 del real decreto del SMI de cada año).',
  'client.employment.calculation.extra_pays.may_be_in_daily_minimum':
    'En servicios de hasta {days}, el mínimo por jornada puede incluir las pagas extra, los domingos y los festivos (art. 4.1 del real decreto del SMI de cada año): si tu salario las lleva dentro, no faltan.',
  'client.employment.calculation.clauses.months_unknown': 'No has metido cuánto dura.',
  'client.employment.calculation.clauses.non_compete_months':
    'El pacto dura {months}; el máximo es de {cap}.',
  'client.employment.calculation.clauses.non_compete_no_compensation':
    'El pacto de no competencia no prevé una compensación económica, que el art. 21.2 pide.',
  'client.employment.calculation.clauses.non_compete_adequacy':
    'Prevé una compensación; esta revisión no puede valorar si es adecuada.',
  'client.employment.calculation.clauses.non_compete_compensation_unknown':
    'No sabes si el pacto prevé una compensación económica.',
  'client.employment.calculation.clauses.retention_months':
    'El compromiso de permanencia dura {months}; el máximo es de {cap}.',
  'client.employment.calculation.clauses.retention_training_missing':
    'La permanencia solo cabe tras una especialización profesional pagada por la empresa, y la cláusula no la menciona.',
  'client.employment.calculation.clauses.exclusivity_compensated':
    'La exclusividad prevé una compensación expresa.',
  'client.employment.calculation.clauses.exclusivity_no_compensation':
    'La exclusividad no prevé una compensación expresa.',
  'client.employment.calculation.clauses.exclusivity_compensation_unknown':
    'No sabes si la exclusividad prevé una compensación.',
  'client.employment.calculation.clauses.waiver_holidays':
    'Renuncia a las vacaciones: los derechos que da la ley no se pueden renunciar (art. 3.5).',
  'client.employment.calculation.clauses.waiver_salary':
    'Renuncia a parte del salario: los derechos que da la ley no se pueden renunciar (art. 3.5).',
  'client.employment.calculation.clauses.waiver_severance':
    'Renuncia a la indemnización legal: los derechos que da la ley no se pueden renunciar (art. 3.5).',
  'client.employment.calculation.clauses.waiver_other':
    'Si lo que se renuncia es un derecho que da la ley, la renuncia no vale (art. 3.5).',
  'client.employment.calculation.clauses.overtime_hours_unknown':
    'Sin las horas extra pactadas no se puede comparar con el máximo de 80 h al año.',
  'client.employment.calculation.clauses.overtime_included':
    'El salario «incluye» las horas extra; la hora extra nunca se paga por debajo de la ordinaria (art. 35.1).',
  'client.employment.calculation.clauses.hourly_pay':
    'Con {hours} h reales a la semana, tu salario sale a {euros} la hora.',
  'client.employment.calculation.clauses.agreement_hourly_pay':
    'Según tus datos del convenio, la hora ordinaria de tu categoría sale a {euros}.',
  'client.employment.calculation.clauses.remote_share_unknown':
    'No has metido qué parte de tu jornada es teletrabajo.',
  'client.employment.calculation.clauses.remote_not_regular':
    'El teletrabajo es el {percent} % de tu jornada; la ley de trabajo a distancia se aplica desde el {regular} %.',
  'client.employment.calculation.clauses.remote_costs_on_worker':
    'Con teletrabajo regular, los gastos de equipos y medios no pueden ir a tu cargo (Ley 10/2021, art. 12).',
  'client.employment.calculation.clauses.remote_costs_unknown':
    'No sabes si la cláusula pone a tu cargo los gastos del teletrabajo.',
  'client.employment.calculation.information.present':
    'Está en el contrato o en un documento aparte.',
  'client.employment.calculation.information.by_reference':
    'Remite a la ley o al convenio, como se permite para este punto.',
  'client.employment.calculation.information.reference_not_allowed':
    'Para este punto no basta con remitir a la ley o al convenio.',
  'client.employment.calculation.information.reference_covers_part':
    'La remisión a la ley o al convenio solo vale para una parte de este punto.',
  'client.employment.calculation.information.missing_before_start':
    'La empresa tenía que dártelo por escrito antes de que empezaras (art. 7.1).',
  'client.employment.calculation.information.missing_on_request':
    'Puedes pedirlo por escrito y la empresa tiene 30 días hábiles para dártelo.',
  'client.employment.calculation.information.only_if_used':
    'Solo hace falta si la empresa lo usa o lo tiene, y eso el contrato no lo dice.',
  'client.employment.calculation.information.unknown': 'No sabes si está.',
  'client.employment.calculation.information.temporary_cause':
    'En un contrato temporal tiene que decir con precisión la causa, las circunstancias y su relación con la duración.',
  'client.employment.calculation.information.agreement.named':
    'El contrato nombra tu convenio: en él están tu tabla salarial, tus pluses y tu jornada.',
  'client.employment.calculation.information.agreement.not_named':
    'El contrato no nombra tu convenio. Desde el 5 de octubre de 2026 tiene que constar con su código y su fecha de publicación.',
  'client.employment.calculation.information.agreement.where':
    'Los convenios se publican en el BOE o en el boletín de tu provincia o comunidad, y están en el registro público REGCON.',
  'client.employment.calculation.information.agreement.sector_salary_amount_priority':
    'Desde 2022, en el salario base y los complementos manda el convenio del sector sobre el de empresa (art. 84.2).',
  'client.employment.calculation.information.public_holidays':
    'Tienes hasta 14 fiestas laborales al año, retribuidas y que no se recuperan (art. 37.2).',
  'client.employment.calculation.information.late_payment_interest':
    'Si la empresa se retrasa en pagarte el salario, el interés por mora es del 10 % de la cantidad pagada con retraso (art. 29.3).',
  'client.employment.calculation.information.limitation':
    'Lo que nace del contrato prescribe al año de terminar; para cantidades, al año desde que se pudieron pedir (art. 59).',
  'client.employment.calculation.information.model':
    'El RD 723/2026 prevé un modelo oficial de documento informativo del servicio público de empleo.',
  'client.employment.calculation.information.minors.hours':
    'Con menos de 18 años no se trabajan más de 8 horas al día, contando la formación.',
  'client.employment.calculation.information.minors.no_night_or_overtime':
    'Tampoco se trabaja de noche ni se hacen horas extra.',
  'client.employment.calculation.information.minors.rest':
    'Hay al menos dos días seguidos de descanso a la semana y, con más de 4 h y media seguidas, una pausa de 30 minutos.',
  'client.employment.calculation.information.out_of_scope.special_relationship':
    'Las relaciones laborales especiales tienen sus propias normas, que esta versión no revisa.',
  'client.employment.calculation.information.out_of_scope.public_servant':
    'El personal funcionario tiene su propio régimen, que esta versión no revisa.',
  'client.employment.calculation.information.out_of_scope.temp_agency':
    'Los contratos por empresas de trabajo temporal tienen reglas propias, que esta versión no revisa.',
  'client.employment.calculation.information.out_of_scope.relief':
    'El contrato de relevo tiene reglas propias, que esta versión no revisa.',

  'employment.documents.start_help':
    'Puedes subir tu contrato y los demás papeles de tu trabajo para rellenar los datos con lo que se lea en ellos, o escribirlos tú. Antes de revisar nada, confirmas cada dato.',
  'employment.documents.upload':
    'Sube tu contrato y, si los tienes, nóminas, la oferta de empleo y tu vida laboral',
  'employment.documents.files_hint':
    'El contrato con sus anexos y, si los tienes, tus nóminas, la oferta de empleo o tu vida laboral, en el orden que sea. Hasta 25 fotos o páginas de PDF en total. Las fotos y las páginas de los PDF se convierten en imágenes en tu dispositivo antes de enviarse.',
  'employment.documents.consent':
    'Doy mi consentimiento explícito para que una IA lea estos documentos y rellene el formulario. Sé que pueden incluir datos sensibles, como la afiliación a un sindicato, una baja médica o una discapacidad. Se leen en la Unión Europea y no se guardan.',
  'employment.pass.title': 'El detalle, el informe y la carta',
  'employment.pass.text':
    'Por 4,99 € ves el cálculo paso a paso de cada punto de tu contrato (año a año y nómina a nómina, con la norma que aplica y su fuente) y descargas el informe en PDF y, si tu revisión tiene puntos para ella, la carta a la empresa. Se generan en tu dispositivo.',
  'employment.pass.price':
    '4,99 € con IVA incluido. Un solo pago, sin cuenta ni suscripción. El pase dura 7 días y solo vale en este navegador, también para las revisiones del finiquito y del alquiler: en ese tiempo puedes rehacer o corregir tu revisión, leer hasta 15 paquetes de documentos y volver a ver el detalle y descargar el informe y la carta sin pagar otra vez. En otro dispositivo, en una ventana privada o si borras los datos de navegación, se pierde.',
  'employment.pass.paid_help':
    'Si pagaste desde este navegador y no ves el detalle ni las descargas, recupera aquí tu pase. Solo funciona en el navegador con el que pagaste.',
  'employment.pass.waiver':
    'Quiero ver el detalle y el informe ahora. Sé que, al ser contenido digital que se entrega al momento, pierdo el derecho de desistimiento (art. 103.m de la Ley General para la Defensa de los Consumidores y Usuarios).',
  'employment.pass.download_information_letter':
    'Descargar la carta que pide la información por escrito (PDF, gratis)',
  'employment.pass.download_certificate_request':
    'Descargar la petición del certificado de contratos temporales (PDF, gratis)',
  'employment.pass.download_company_letter': 'Descargar la carta a la empresa (PDF)',
  'employment.pass.letter_note':
    'Las cartas son plantillas. Se descargan en tu dispositivo y no se envían desde aquí: usarlas o no, y cómo, es decisión tuya.',
  'employment.letters.title': 'Cartas que puedes descargar gratis',
  'employment.letters.text':
    'Estas cartas solo piden información y se descargan gratis. Se generan en tu dispositivo.',
  'employment.letter.legend': 'Tus datos para las cartas (opcional)',
  'employment.letter.id': 'DNI o NIE (opcional)',
  'employment.letter.workplace': 'Centro de trabajo',
  'employment.letter.privacy':
    'Estos datos solo se usan para rellenar las cartas en tu dispositivo; no se envían ni se guardan.',
  'client.documents.kind.employment_contract': 'Contrato de trabajo',
  'client.documents.kind.job_offer': 'Oferta de empleo',
  'client.documents.source.employment_contract': 'el contrato',
  'client.documents.source.job_offer': 'la oferta de empleo',
  'client.employment.documents.mark_derived':
    'Sale de lo leído en tus documentos · confianza {nivel}',
  'client.employment.documents.quote.modality': 'Cómo llama tu contrato a su modalidad',
  'client.employment.documents.quote.causeStated': 'Lo que dice tu contrato sobre su causa',
  'client.employment.documents.quote.replacementCauseStated':
    'Lo que dice tu contrato sobre su causa',
  'client.employment.documents.quote.agreementNamed': 'El convenio que nombran tus documentos',
  'client.employment.documents.quote.categorySalary':
    'La categoría o el grupo que dicen tus documentos',
  'client.employment.documents.quote.hasSchedule': 'Lo que dice tu contrato sobre el horario',
  'client.employment.documents.quote_note':
    'Copiado tal cual del documento: compáralo con lo que marcas aquí.',
  'client.employment.documents.agreement_with_code': '{nombre} (código {codigo})',
  'client.employment.documents.agreement_code': 'Código {codigo}',
  'client.employment.documents.conflict.category':
    'La categoría o el grupo no es el mismo en el contrato y en alguna nómina: compáralos con tus documentos, porque el salario de tu convenio depende de ella.',
  'client.employment.documents.conflict.agreementName':
    'El convenio no es el mismo en el contrato y en alguna nómina: compáralos con tus documentos.',
  'client.employment.documents.lines_left_out':
    'En los devengos salariales de cada nómina se suman el salario base y los complementos fijos. No se han sumado: {lineas}. Si alguno debe contar, corrige la cifra en la hoja de nóminas.',
  'client.employment.documents.line.variable': 'incentivos y otros pluses variables',
  'client.employment.documents.line.overtime': 'horas extra',
  'client.employment.documents.line.complementary_hours': 'horas complementarias',
  'client.employment.documents.line.extra_pay': 'pagas extra cobradas ese mes',
  'client.employment.documents.line.expenses': 'dietas y gastos',
  'client.employment.documents.line.one_off': 'atrasos y pagos sueltos',
  'client.employment.documents.line.other': 'otros conceptos',
  'client.employment.documents.payslip_no_lines':
    'De alguna nómina no se han leído sus devengos: escribe tú la cifra en la hoja de nóminas.',
  'client.employment.documents.payslip_partial':
    'De la nómina más antigua puede que solo se hayan leído algunos devengos, así que no se ha sumado su cifra: escríbela tú en la hoja de nóminas.',
  'client.employment.documents.extras_in_twelve':
    'El contrato dice 12 pagas con las extra prorrateadas, así que las pagas extra parecen ir dentro de esas 12. Dinos en la hoja de salario cuántas son y si van prorrateadas.',
  'client.employment.documents.offer_period':
    'La oferta no da el salario al año, así que no se ha pasado: escribe tú la cifra anual en la hoja de la oferta.',
  'client.employment.documents.cut.salaryParts':
    'El contrato desglosa el salario en más partes de las que se leen de una vez: se han leído {n}. Compara el desglose con tu contrato.',
  'client.employment.documents.cut.clauses':
    'El contrato tiene más cláusulas de las que se leen de una vez: se han leído {n}. Añade tú las que falten.',
  'client.employment.documents.cut.payslips':
    'Has subido más nóminas de las que se leen de una vez: se han leído las {n} más recientes.',
  'client.employment.documents.cut.lines':
    'Tus nóminas tienen más devengos de los que se leen de una vez: se han leído los {n} más recientes, así que las nóminas más antiguas pueden quedar incompletas.',
  'client.employment.documents.cut.contracts':
    'Tu vida laboral tiene más filas de las que se leen de una vez: se han leído las {n} más recientes, y la lista queda marcada como incompleta.',
  'client.employment.documents.cut.unknown':
    'Alguna lista de tus documentos tenía más filas de las que se leen de una vez: se han leído las más recientes. Compara las listas con tus documentos.',
  'client.employment.documents.rows_cut':
    'Se ha leído más de lo que cabe en alguna lista: compara sus filas con tus documentos y completa lo que falte.',
  'client.employment.documents.check.end_before_start':
    'Alguna fecha de fin leída es anterior a la de inicio, en el contrato, en una nómina o en tu vida laboral: revisa esas fechas.',
  'client.employment.documents.check.payslip_not_whole_month':
    'Alguna nómina no cubre el mes entero: revisa en la hoja de nóminas si trabajaste el mes completo.',
  'client.employment.documents.check.payslip_lines_do_not_sum':
    'Los devengos leídos de alguna nómina no suman su total devengado: revisa las cifras de la hoja de nóminas.',
  'client.employment.documents.check.hours_over_week':
    'Las horas a la semana leídas son demasiadas para una semana de trabajo: revísalas.',
  'client.employment.documents.check.salary_period_mismatch':
    'El salario al mes por el número de pagas no da el salario al año que dice el contrato: revisa el salario y las pagas extra.',
  'client.employment.documents.error.pass_invalid':
    'Tu pase ya no sirve para leer documentos en este navegador; el detalle sigue disponible hasta que caduque. Prueba otra vez con una lectura gratis o rellena a mano.',
  'client.employment.documents.error.pass_exhausted':
    'Ya has usado las 15 lecturas de tu pase. Puedes rellenar a mano; el detalle sigue disponible.',
  'client.employment.documents.pass.issued':
    'Pago recibido. Ya puedes ver el detalle de cada punto y descargar el informe.',
  'client.employment.documents.pass.lost':
    'Hemos vuelto del pago, pero la revisión no se ha podido recuperar. Repítela y verás el detalle y las descargas.',
  'client.employment.report.title': 'Revisión de tu contrato de trabajo',
  'client.employment.report.intro':
    'Este informe compara tu contrato con lo que marca la ley, punto por punto, con los datos que confirmaste en la revisión. Donde el resultado depende de una respuesta «No lo sé», da cada lectura. Informa sobre la ley y no es asesoramiento jurídico.',
  'client.employment.report.footer':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Normas y SMI según su estado el {fecha}.',
  'client.employment.report.filename': 'eslojusto-informe-contrato.pdf',
  'client.employment.report.your_data': 'Tus datos',
  'client.employment.report.start': 'Fecha de inicio',
  'client.employment.report.end': 'Fecha de fin',
  'client.employment.report.no_end': 'Sin fecha de fin',
  'client.employment.report.modality': 'Tipo de contrato',
  'client.employment.report.salary': 'Salario bruto',
  'client.employment.report.salary_per.year': '{importe} al año',
  'client.employment.report.salary_per.month': '{importe} al mes',
  'client.employment.report.salary_per.day': '{importe} al día',
  'client.employment.report.salary_per.hour': '{importe} la hora',
  'client.employment.report.payments': 'Pagas al año',
  'client.employment.report.weekly_hours': 'Horas a la semana',
  'client.employment.report.annual_hours': 'Horas al año',
  'client.employment.report.full_time': 'Jornada completa de tu convenio',
  'client.employment.report.category_salary': 'Salario de tu categoría',
  'client.employment.report.trial': 'Periodo de prueba',
  'client.employment.report.holidays': 'Vacaciones',
  'client.employment.report.holidays_calendar': '{dias} días naturales',
  'client.employment.report.holidays_working': '{dias} días laborables',
  'client.employment.report.payslips': 'Nóminas',
  'client.employment.report.history': 'Contratos en tu vida laboral',
  'client.employment.report.no_figure': 'Sin dato',
  'client.employment.report.summary': 'Resumen',
  'client.employment.report.points': 'Punto por punto',
  'client.employment.report.how': 'Cómo se calcula',
  'client.employment.report.information': 'Para que lo tengas en cuenta',
  'client.employment.report.unchecked': 'Lo que esta revisión no comprueba',
  'client.employment.letter.workplace': 'Centro de trabajo',
  'client.employment.letter.regards': 'Un saludo.',
  'client.employment.letter.company.title': 'Revisión de mi contrato de trabajo',
  'client.employment.letter.company.body':
    'Te escribo por mi contrato de trabajo, que empezó el {inicio}.',
  'client.employment.letter.company.filename': 'eslojusto-carta-empresa.pdf',
  'client.employment.letter.information.title': 'Información de mi contrato por escrito',
  'client.employment.letter.information.on_request':
    'Según el {norma} (art. 3 y disposición transitoria única), puedo pedir por escrito la información de mi relación laboral y la empresa tiene 30 días hábiles para darla. Te pido por escrito la que no encuentro en mi contrato:',
  'client.employment.letter.information.before_start':
    'Según el {norma} (arts. 3 y 7.1), esta información se da por escrito antes de empezar a trabajar. Como no la encuentro en mi contrato, te la pido por escrito:',
  'client.employment.letter.information.filename': 'eslojusto-carta-informacion.pdf',
  'client.employment.letter.pay.intro':
    'He comparado mi salario con el salario mínimo interprofesional (SMI) de cada año, y en estos años queda por debajo:',
  'client.employment.letter.pay.year':
    'En {anio}, el {norma}, fija un mínimo anual de {completo} a jornada completa. Mi salario pactado es de {salario} al año: {diferencia} menos al año.',
  'client.employment.letter.pay.year_prorata':
    'En {anio}, el {norma}, fija un mínimo anual de {completo} a jornada completa, que en proporción a mi jornada es de {minimo}. Mi salario pactado es de {salario} al año: {diferencia} menos al año.',
  'client.employment.letter.pay.day':
    'En {anio}, el {norma}, fija un mínimo de {completo} por jornada legal para los contratos de hasta 120 días. Mi salario pactado es de {salario} por jornada: {diferencia} menos por jornada.',
  'client.employment.letter.pay.day_prorata':
    'En {anio}, el {norma}, fija un mínimo de {completo} por jornada legal para los contratos de hasta 120 días, que en proporción a mi jornada es de {minimo}. Mi salario pactado es de {salario} por jornada: {diferencia} menos por jornada.',
  'client.employment.letter.pay.ask': 'Te pido que se revise mi salario.',
  'client.employment.letter.points.intro':
    'También he comparado mi contrato con lo que marca la ley, y estos puntos no coinciden:',
  'client.employment.letter.points.line': '{punto}: {norma}.',
  'client.employment.letter.points.ask': 'Te pido que se revisen.',
  'client.employment.letter.certificate.title': 'Petición del certificado de contratos temporales',
  'client.employment.letter.certificate.to': 'Al servicio público de empleo',
  'client.employment.letter.certificate.company': 'Empresa de los contratos',
  'client.employment.letter.certificate.body':
    'Pido por escrito el certificado de los contratos de duración determinada o temporales que he celebrado con la empresa indicada arriba, como prevé el {cita}:',
  'client.employment.letter.certificate.filename': 'eslojusto-certificado-contratos-temporales.pdf',

  'rental.title': 'Subida del alquiler y fianza: revisa si pagas de más',
  'rental.description':
    'Comprueba si la subida, la fianza, los gastos o la agencia de tu alquiler pasan de lo que permite la ley, partida por partida y con la norma de cada una.',
  'rental.h1': 'Comprueba si tu alquiler es justo',
  'rental.lead':
    'Revisa lo que pagas o has pagado por tu alquiler de vivienda frente a lo que permite la ley: agencia, fianza y garantías, subidas, gastos y devolución de la fianza.',
  'rental.beta': 'Beta',
  'rental.beta_note':
    'Sección en pruebas. Las normas del alquiler han cambiado varias veces en 2026: cada regla dice si está en vigor, pendiente de convalidación o derogada.',
  'rental.no_js':
    'La revisión necesita JavaScript. Se hace entera en tu dispositivo y lo que escribes no sale de él.',
  'rental.reviewed': 'Revisado el {fecha}',
  'rental.app_name': 'Revisión de alquiler',

  'rental.guide.title': 'Qué permite la ley en tu alquiler',
  'rental.guide.lead':
    'Las reglas con las que la revisión compara cada partida, según la fecha de tu contrato y con la norma de cada una. Varias han cambiado en 2026: cada norma dice si está en vigor, pendiente de convalidación o derogada.',
  'rental.guide.sources': 'Fuentes',
  'rental.guide.source_lau': 'Ley de Arrendamientos Urbanos (BOE)',
  'rental.guide.source_irav': 'IRAV (INE)',
  'rental.guide.source_bde': 'Interés legal (Banco de España)',
  'rental.guide.who': 'Quién está detrás',
  'rental.guide.norms': 'Normas',
  'rental.guide.decree_live': 'el {norma}, en vigor desde el {desde} y {estado},',
  'rental.guide.decree_upcoming': 'el {norma}, que entra en vigor el {desde} y está {estado},',
  'rental.guide.decree_never':
    'El {norma} no llegó a aplicarse: el Congreso lo derogó antes de que entrara en vigor.',
  'rental.guide.decree_repealed':
    'El {norma} lo cambió {periodo}, pero el Congreso lo derogó: sigue la regla anterior.',

  'rental.guide.fees.title': 'Honorarios de la agencia',
  'rental.guide.fees.lead':
    'Los gastos de gestión inmobiliaria y de formalización del contrato van según la fecha de tu contrato:',
  'rental.guide.fees.2019':
    'Contratos firmados entre el 6 de marzo de 2019 y el 25 de mayo de 2023: son del casero cuando es una empresa (persona jurídica). Si es una persona, la ley no dice quién los paga.',
  'rental.guide.fees.2023':
    'Contratos firmados entre el 26 de mayo de 2023 y el {hasta}: son siempre del casero.',
  'rental.guide.fees.2023_open':
    'Contratos firmados desde el 26 de mayo de 2023: son siempre del casero.',
  'rental.guide.fees.2026':
    'Contratos firmados desde el {desde}: {decreto} dice que no pueden cobrarse al inquilino ni directa ni indirectamente, con ningún concepto o nombre. Cubre cualquier servicio para preparar, formalizar, gestionar, renovar o cambiar el contrato; otro servicio que no haga falta para el contrato solo puede cobrarse si lo pediste por escrito sabiendo que era opcional y su precio.',
  'rental.guide.fees.other_names':
    'Un cargo con otro nombre, como «estudio de solvencia», «reserva» o «gestión», puede ser un honorario. En un contrato anterior al {desde}, la revisión lo señala para que lo mires, sin cifra; desde esa fecha, lo cuenta como pagado de más, salvo que fuera un servicio opcional que pediste por escrito.',
  'rental.guide.fees.other_names_open':
    'Un cargo con otro nombre, como «estudio de solvencia», «reserva» o «gestión», puede ser un honorario. La revisión lo señala para que lo mires, sin cifra.',

  'rental.guide.guarantees.title': 'Fianza, garantías y pago por adelantado',
  'rental.guide.guarantees.deposit':
    'La fianza es obligatoria y, en un alquiler de vivienda, de una mensualidad de renta en metálico (art. 36.1 LAU).',
  'rental.guide.guarantees.extra':
    'Además, el contrato puede pedir otra garantía: más dinero, un aval o un seguro. En los contratos firmados desde el 6 de marzo de 2019 de hasta cinco años, o hasta siete si el casero es una empresa, esa garantía adicional no puede pasar de dos mensualidades de renta (art. 36.5 LAU).',
  'rental.guide.guarantees.advance':
    'Por adelantado, el casero no puede exigir más de una mensualidad de renta (art. 17.2 LAU).',
  'rental.guide.guarantees.insurance':
    'Además, {decreto} dice que no se puede exigir al inquilino que contrate un seguro de impago de la renta ni otra cobertura parecida.',
  'rental.guide.guarantees.money':
    'La revisión compara con esos topes el dinero que entregaste. Un aval o un seguro no es dinero entregado: los señala, sin cifra.',

  'rental.guide.update.title': 'Cómo se actualiza la renta',
  'rental.guide.update.clause':
    'En los contratos firmados desde el 6 de marzo de 2019, la renta solo se actualiza si el contrato lo pacta, y una vez al año: el día en que se cumple cada año de contrato. Si la cláusula dice que se actualiza pero no con qué índice, se usa el que fija la ley. Y la subida nunca puede pasar del tope legal de ese día (art. 18.1 LAU).',
  'rental.guide.update.notice':
    'La renta nueva se paga desde el mes siguiente a que te avisen por escrito, con el porcentaje aplicado; vale una nota en el recibo del mes anterior (art. 18.2 LAU).',
  'rental.guide.update.caps_lead':
    'El tope de cada año, según el día en que se cumple el año de contrato:',
  'rental.guide.update.indices':
    'El índice que cuenta es el último publicado ese día. Las cifras de cada mes, con el día en que las publicó el INE, están aquí:',
  'rental.guide.update.indices_link': 'IRAV e IPC de cada mes',
  'rental.guide.update.doubtful':
    'Si una subida cae en los días de un decreto que el Congreso derogó, la revisión da las dos cuentas y no la suma al total. Si depende de una norma pendiente de convalidación, da las dos y el total solo suma la más baja.',

  'rental.guide.charges.title': 'Gastos: comunidad, IBI y basura',
  'rental.guide.charges.pact':
    'El casero solo puede cobrarte los gastos generales del edificio o los servicios sin contador si lo pactasteis por escrito y con su importe anual a la fecha del contrato (art. 20.1 LAU). Los tributos, como el IBI, tienen su regla aparte, más abajo.',
  'rental.guide.charges.increase':
    'En los cinco primeros años de contrato, o siete si el casero es una empresa, esos gastos, salvo los tributos, solo pueden subir una vez al año, por acuerdo, y nunca más del doble de lo que puede subir la renta (art. 20.2 LAU, que el Real Decreto-ley 29/2026 numera como 20.3).',
  'rental.guide.charges.meters':
    'Lo que se mide con un contador propio de la vivienda, como el agua o la luz, lo pagas tú (art. 20.3 LAU, que el Real Decreto-ley 29/2026 numera como 20.4).',
  'rental.guide.charges.taxes':
    'Además, {decreto} dice que los tributos de la vivienda, como el IBI, no pueden cargarse al inquilino, salvo que sea el inquilino quien tiene que pagarlos. La revisión lo aplica a los contratos firmados desde esa fecha; en los anteriores, lo da como información.',
  'rental.guide.charges.taxes_before':
    'En los contratos firmados antes del {desde}, los tributos, como el IBI, solo podían pasarse al inquilino con un pacto por escrito y con su importe anual a la fecha del contrato (art. 20.1 LAU, en su redacción anterior).',

  'rental.guide.return.title': 'Devolución de la fianza',
  'rental.guide.return.month':
    'Cuando acaba el contrato y entregas las llaves, el casero tiene un mes para devolverte la fianza. Pasado ese mes, lo que falte por devolver genera el interés legal del dinero (art. 36.4 LAU).',
  'rental.guide.return.rate':
    'El interés legal es del {tipo} desde {desde}: lo fijó la Ley de Presupuestos Generales del Estado para 2023 y sigue mientras esos presupuestos estén prorrogados. El tipo de cada año está en la tabla del Banco de España. Como ninguna norma dice si el año cuenta 365 o 360 días, la revisión da el interés con las dos cuentas.',
  'rental.guide.return.deductions':
    'El casero puede descontar desperfectos o deudas. La revisión no valora si un descuento procede: compara lo devuelto con la fianza y los descuentos que anotes, y calcula el interés del retraso.',
  'rental.guide.return.closing':
    'Además, {decreto} prevé un documento de finalización del contrato que suscriben las dos partes; si no se hace o no recoge desperfectos, se presume, salvo prueba en contrario, que la vivienda se entregó en buen estado (art. 36.7 LAU).',

  'rental.guide.zones.title': 'Zonas tensionadas',
  'rental.guide.zones.declared':
    'Las comunidades autónomas pueden declarar zonas de mercado residencial tensionado, y el Ministerio de Vivienda publica cada declaración en el BOE. En una zona declarada, la renta de un contrato nuevo puede tener tope: la del contrato anterior o, en algunos casos, como con un gran tenedor, el precio del sistema estatal de referencia (art. 17.6 y 17.7 LAU).',
  'rental.guide.zones.rise':
    'Y en las actualizaciones hasta el 31 de diciembre de 2027, {decreto} dice que si la renta supera el límite máximo de precio que le sea aplicable según el sistema de índices de precios de referencia, no cabe ninguna subida. El decreto no dice en qué casos se aplica ese límite; la ley lo fija para algunos contratos nuevos en zonas tensionadas (art. 17.7 LAU).',
  'rental.guide.zones.unchecked':
    'La revisión no calcula estos topes: pregunta si tu vivienda está en una zona tensionada y te da el enlace al sistema estatal de referencia.',
  'rental.guide.zones.link': 'Sistema Estatal de Referencia del Precio del Alquiler (SERPAVI)',

  'rental.guide.term.title': 'Duración y prórrogas',
  'rental.guide.term.minimum':
    'Si el contrato pacta menos de cinco años, o siete si el casero es una empresa, se prorroga cada año hasta llegar a ellos, salvo que avises con 30 días de antelación de que no quieres seguir (art. 9.1 LAU).',
  'rental.guide.term.tacit':
    'Cumplido ese plazo, si nadie avisa (el casero con cuatro meses de antelación y tú con dos), el contrato sigue un año más cada vez, hasta tres años, y puedes dejarlo al acabar cualquiera de esos años avisando con un mes de antelación (art. 10.1 LAU).',
  'rental.guide.term.extension':
    'Además, {decreto} prevé, con requisitos y excepciones, una prórroga extraordinaria por años, hasta dos más, si la pides. Los principales: el contrato tiene que estar en vigor el {desde}; su prórroga del art. 9.1, su prórroga tácita o su tácita reconducción tiene que acabar antes del 31 de diciembre de 2028, y tienes que estar al corriente del pago de la renta y haberlo estado cada mes durante los ocho anteriores. No se aplica si pactáis otras condiciones, un contrato nuevo o una renovación con una renta al menos un 5 % más baja, ni si el casero comunica que necesita la vivienda para sí o su familia (art. 9.3 LAU). Si cabe la prórroga de las zonas tensionadas (art. 10.3 LAU), se aplica esa.',
  'rental.guide.term.rdl28':
    'Por otro lado, {decreto} reescribe el art. 10 de la LAU, el de las prórrogas, y desde entonces deja fuera la prórroga extraordinaria del Real Decreto-ley 29/2026 cuando proceda la prórroga del nuevo art. 10.1.',
  'rental.guide.term.unchecked':
    'La revisión no comprueba prórrogas ni preavisos: te da las fechas de tu contrato como información.',

  'rental.guide.regional.title': 'Normas de tu comunidad autónoma',
  'rental.guide.regional.state':
    'La Ley de Arrendamientos Urbanos se aplica en toda España, y la revisión solo aplica las normas estatales. Tu comunidad puede tener normas propias que se suman a ellas, como las de sus zonas tensionadas.',
  'rental.guide.regional.lodging':
    'Las comunidades pueden obligar al casero a depositar la fianza en un organismo público (disposición adicional 3.ª LAU). Es una obligación del casero con la administración: no cambia lo que pagas.',

  'rental.guide.pages': 'Guías',
  'rental.page.decree.rise':
    '{decreto} dice que, hasta el 31 de diciembre de 2027 y sin un nuevo pacto entre las partes, la renta no puede subir más del 2 % (disposición final 6.ª), y que el IRAV rige en todos los contratos (art. 4.Dos).',
  'rental.page.decree.zones':
    '{decreto} dice que, hasta el 31 de diciembre de 2027, si la renta supera el límite máximo de precio que le sea aplicable según el sistema de índices de precios de referencia, no cabe ninguna subida. El decreto no dice en qué casos se aplica ese límite; la ley lo fija para algunos contratos nuevos en zonas tensionadas (art. 17.7 LAU).',
  'rental.page.decree.fees':
    '{decreto} dice que, en los contratos firmados desde el {desde}, los gastos de gestión inmobiliaria y de formalización del contrato no pueden cobrarse al inquilino ni directa ni indirectamente, con ningún concepto o nombre (art. 20.2 LAU).',
  'rental.page.decree.insurance':
    '{decreto} dice que no se puede exigir al inquilino que contrate un seguro de impago de la renta ni otra cobertura parecida (art. 36.5 LAU).',
  'rental.page.decree.taxes':
    '{decreto} dice que los tributos de la vivienda, como el IBI, no pueden cargarse al inquilino, salvo que sea el inquilino quien tiene que pagarlos (art. 20.1 LAU). La revisión lo aplica a los contratos firmados desde esa fecha; en los anteriores, lo da como información.',
  'rental.page.decree.closing':
    '{decreto} prevé un documento de finalización del contrato que suscriben las dos partes; si no se hace o no recoge desperfectos, se presume, salvo prueba en contrario, que la vivienda se entregó en buen estado (art. 36.7 LAU).',
  'rental.page.charges.community':
    '{decreto} dice que, en los edificios que no están en propiedad horizontal, no se pueden imputar los gastos de comunidad al inquilino (art. 20.1 LAU).',
  'rental.guide.faq': 'Preguntas frecuentes',
  'rental.faq.agency_fees': '¿Me pueden cobrar honorarios de agencia?',
  'rental.faq.agency_fees_answer':
    'Depende de cuándo se firmó tu contrato. Desde el 26 de mayo de 2023, los gastos de gestión inmobiliaria y de formalización del contrato son del casero (art. 20.1 LAU, en su redacción anterior al Real Decreto-ley 29/2026). Entre el 6 de marzo de 2019 y el 25 de mayo de 2023, lo eran cuando el casero era una empresa. {decreto}',
  'rental.faq.agency_fees_decree':
    'Además, {decreto} dice que, en los contratos firmados desde entonces, no pueden cobrarse al inquilino con ningún concepto o nombre.',
  'rental.faq.rent_rise': '¿Cuánto me pueden subir el alquiler este año?',
  'rental.faq.rent_rise_answer':
    'Solo lo que pacte tu contrato, una vez al año y sin pasar del tope legal del día en que se cumple el año de contrato (art. 18.1 LAU). {decreto} La tabla de esta página da el tope de cada año.',
  'rental.faq.rent_rise_decree':
    'Hasta el 31 de diciembre de 2027, según {decreto} el tope sin un nuevo pacto es el IRAV, y como mucho un 2 %.',
  'rental.faq.irav': '¿Qué es el IRAV?',
  'rental.faq.deposit': '¿Cuánta fianza me pueden pedir?',
  'rental.faq.deposit_answer':
    'Una mensualidad de renta en metálico (art. 36.1 LAU). Aparte, el contrato puede pedir una garantía adicional: en los contratos firmados desde el 6 de marzo de 2019 de hasta cinco años, o siete si el casero es una empresa, no más de dos mensualidades (art. 36.5 LAU). Y por adelantado, no más de una mensualidad (art. 17.2 LAU).',
  'rental.faq.deposit_return': '¿Cuándo me tienen que devolver la fianza?',
  'rental.faq.deposit_return_answer':
    'Pasado un mes desde que entregas las llaves, lo que falte por devolver genera el interés legal del dinero (art. 36.4 LAU). El casero puede descontar desperfectos o deudas; la revisión no valora si un descuento procede, pero sí calcula el interés del retraso.',
  'rental.faq.pending_norms': '¿Qué pasa con las normas pendientes de convalidación?',
  'rental.faq.pending_norms_answer':
    'Un real decreto-ley rige desde que entra en vigor, pero el Congreso tiene que convalidarlo en los 30 días siguientes a su promulgación; si no lo hace, queda derogado. {pendientes} Cuando un resultado depende de una norma pendiente, la revisión da las dos cuentas y el total solo suma la más baja. {derogados}',
  'rental.faq.pending_norms_list': 'A {fecha} están pendientes de convalidación {lista}.',
  'rental.faq.pending_norms_none': 'A {fecha} no hay ninguna pendiente.',
  'rental.faq.pending_norms_item_live': 'el {norma}, en vigor desde el {desde}',
  'rental.faq.pending_norms_item_upcoming': 'el {norma}, que entra en vigor el {desde}',
  'rental.faq.pending_norms_never':
    'El Congreso derogó el {lista} antes de que entrara en vigor, así que no llegó a aplicarse.',
  'rental.faq.pending_norms_repealed':
    'Si una subida cae en los días de un decreto que el Congreso derogó, la revisión da las dos cuentas y no la suma al total. Los derogados: {lista}.',
  'rental.faq.documents': '¿Qué pasa con mis documentos?',
  'rental.faq.documents_answer':
    'Si subes tu contrato y los demás papeles del alquiler, se envían cifrados a un servidor de Amazon Web Services en España, que se los pasa a un modelo de IA (Claude, de Anthropic, a través de Amazon Bedrock) dentro de la Unión Europea. El modelo indica qué es cada página y copia solo los datos que necesita el formulario. Tiene orden de no copiar nombres de personas, DNI, NIE, cuentas bancarias, teléfonos ni correos, y el servidor descarta cualquier texto copiado que aún lleve un DNI, una cuenta, un correo o un teléfono. No se guarda nada: el documento se procesa en memoria y se descarta. Si prefieres no subir nada, puedes escribir los datos y nada sale de tu dispositivo.',
  'rental.faq.pass': '¿Qué incluye el pase de 4,99 €?',
  'rental.faq.pass_answer':
    'El pase vale para cualquier revisión durante 7 días, también la del finiquito, y solo en el navegador con el que pagas. En la del alquiler te enseña el cálculo paso a paso de cada partida y te deja descargar el informe en PDF y, si tu revisión tiene cifras para ellas, las cartas sobre la fianza y las subidas. En esos días puedes rehacer o corregir tu revisión y leer hasta 15 paquetes de documentos sin pagar otra vez. No guardamos tu revisión en ningún sitio: en otro dispositivo, en una ventana privada o si borras los datos de navegación, el pase se pierde.',

  'rental.form_aria': 'Revisión del alquiler',
  'rental.tab.contrato': 'Contrato',
  'rental.tab.entrada': 'Entrada',
  'rental.tab.renta': 'Renta',
  'rental.tab.gastos': 'Gastos',
  'rental.tab.salida': 'Salida',
  'rental.tab.resultado': 'Resultado',

  'rental.contract.question': 'Tu contrato',
  'rental.contract.help':
    'Esta revisión es para contratos de alquiler de vivienda habitual. Con estas respuestas sabrás si el tuyo entra.',
  'rental.contract.type': '¿Qué tipo de contrato es?',
  'rental.contract_type.main_home': 'Vivienda habitual',
  'rental.contract_type.main_home_hint': 'Vives en ella de forma permanente.',
  'rental.contract_type.seasonal': 'De temporada',
  'rental.contract_type.seasonal_hint':
    'Para una temporada: estudios, un trabajo temporal o vacaciones.',
  'rental.contract_type.room': 'Por habitaciones',
  'rental.contract_type.room_hint': 'Alquilas una habitación, no la vivienda entera.',
  'rental.contract_type.other_use': 'Otro uso',
  'rental.contract_type.other_use_hint': 'Un local, una oficina, un garaje o un trastero.',
  'rental.contract_type.protected': 'Vivienda protegida',
  'rental.contract_type.protected_hint': 'Una vivienda de protección oficial.',
  'rental.contract_type.old_rent': 'Renta antigua',
  'rental.contract_type.old_rent_hint': 'Un contrato anterior al 9 de mayo de 1985.',
  'rental.contract.signed': 'Fecha del contrato',
  'rental.contract.signed_hint': 'El día en que se firmó el contrato.',
  'rental.contract.start': 'Fecha de entrada',
  'rental.contract.start_hint': 'El día desde el que cuenta el contrato: marca cada aniversario.',

  'rental.landlord.question': 'Tu casero',
  'rental.landlord.type': '¿Quién te alquila la vivienda?',
  'rental.landlord.type_hint':
    'Lo dice el contrato: el nombre de una persona o el de una sociedad (S.L., S.A.).',
  'rental.landlord.large': '¿Tu casero es gran tenedor?',
  'rental.landlord.large_hint':
    'Es gran tenedor quien tiene más de diez viviendas o más de 1.500 m² de uso residencial, sin contar garajes ni trasteros (art. 3.k de la Ley 12/2023); en una zona tensionada, la comunidad autónoma puede bajarlo a cinco o más viviendas. Ser una empresa no basta: una sociedad con pocos pisos no lo es.',
  'rental.landlord.region': 'Comunidad autónoma',
  'rental.landlord.region_hint': 'Donde está la vivienda.',
  'rental.landlord.region_choose': 'Elige una',
  'rental.landlord.stressed': '¿Está la vivienda en una zona tensionada?',
  'rental.landlord.stressed_hint':
    'Una zona declarada de mercado residencial tensionado. Si no lo sabes, el resultado te dice dónde mirarlo.',

  'rental.entry.question': 'Lo que pagaste al entrar',
  'rental.entry.help':
    'La fianza, otras garantías y lo que te cobraron la agencia o el casero al empezar. Si no tienes un dato, déjalo en blanco.',
  'rental.entry.deposit': 'Fianza',
  'rental.entry.deposit_hint': 'En euros.',
  'rental.entry.advance': 'Mensualidades por adelantado',
  'rental.entry.advance_hint': 'Las que pagaste al entrar, contando la del primer mes.',
  'rental.entry.guarantees': '¿Diste otras garantías además de la fianza?',
  'rental.entry.guarantees_hint':
    'Un depósito o garantía en dinero, un aval bancario o un seguro de impago.',
  'rental.entry.guarantees_yes': 'Sí, añadirlas',
  'rental.entry.guarantees_add': 'Añadir garantía',
  'rental.entry.guarantee_kind': 'Tipo',
  'rental.entry.guarantee_amount': 'Importe',
  'rental.entry.guarantee_amount_hint':
    'Si es un aval o un seguro y no lo sabes, déjalo en blanco.',
  'rental.entry.fees': '¿Pagaste a la agencia o al casero algo más al entrar?',
  'rental.entry.fees_hint':
    'Honorarios, formalización del contrato, estudio de solvencia, reserva o gestión.',
  'rental.entry.fees_yes': 'Sí, añadir pagos',
  'rental.entry.fees_add': 'Añadir pago',
  'rental.entry.fee_kind': 'Concepto',
  'rental.entry.fee_amount': 'Importe',
  'rental.entry.fee_later': '¿Te lo descontaron después de la renta o de la fianza?',
  'rental.entry.fee_requested': '¿Pediste ese servicio por escrito?',

  'rental.rent.question': 'La renta',
  'rental.rent.initial': 'Renta al empezar',
  'rental.rent.initial_hint': 'La que fija el contrato, en euros al mes.',
  'rental.rent.months': 'Duración pactada, en meses',
  'rental.rent.months_hint': 'Un año son 12 meses; cinco años, 60.',
  'rental.rent.clause': '¿Qué dice el contrato sobre actualizar la renta?',
  'rental.rent.clause_help':
    'Búscalo en la cláusula de «actualización» o de «revisión» de la renta: suele nombrar el IRAV, el IPC o un porcentaje.',
  'rental.clause.none': 'Nada: no prevé actualizarla',
  'rental.clause.irav': 'El IRAV',
  'rental.clause.ipc': 'El IPC',
  'rental.clause.igc': 'El índice de garantía de competitividad (IGC)',
  'rental.clause.unspecified_index': 'Que se actualiza, sin nombrar el índice',
  'rental.clause.fixed_percent': 'Un porcentaje fijo',
  'rental.clause.other': 'Otra fórmula',
  'rental.rent.percent': 'Porcentaje al año',
  'rental.rent.percent_hint': 'El que dice el contrato, por ejemplo 3.',

  'rental.updates.question': 'Las subidas',
  'rental.updates.help':
    'Una fila por cada subida de la renta, con lo que pagabas antes y lo que pagas después.',
  'rental.updates.none': 'No ha habido subidas',
  'rental.updates.yes': 'Sí, añadirlas',
  'rental.updates.add': 'Añadir subida',
  'rental.updates.year': 'Año de la subida',
  'rental.updates.year_hint': 'El del aniversario del contrato en que subió.',
  'rental.updates.previous': 'Renta antes',
  'rental.updates.new': 'Renta después',
  'rental.updates.charged_from': 'Primer recibo con la renta nueva',
  'rental.updates.charged_from_hint': 'Vale cualquier día de ese mes.',
  'rental.updates.notice': '¿Cómo te avisaron?',
  'rental.notice.letter': 'Carta',
  'rental.notice.burofax': 'Burofax',
  'rental.notice.receipt_note': 'Nota en el recibo',
  'rental.notice.annex': 'Anexo al contrato',
  'rental.notice.email': 'Correo electrónico',
  'rental.notice.messaging': 'Mensaje (WhatsApp, SMS…)',
  'rental.notice.verbal': 'De palabra',
  'rental.notice.none': 'No me avisaron',
  'rental.updates.notice_on': 'Fecha del aviso',
  'rental.updates.agreed': '¿Aceptaste esa subida?',
  'rental.updates.agreed_written': 'Sí, por escrito',
  'rental.updates.agreed_verbal': 'Sí, de palabra',

  'rental.charges.question': 'Los gastos',
  'rental.charges.help':
    'Gastos que te pasa el casero aparte de la renta: comunidad, IBI o basuras. Los suministros con contador (luz, agua, gas) son tuyos y no se revisan.',
  'rental.charges.ask': '¿Te cobran gastos aparte de la renta?',
  'rental.charges.yes': 'Sí, añadirlos',
  'rental.charges.rows_hint': 'Una fila por concepto y año.',
  'rental.charges.add': 'Añadir gasto',
  'rental.charges.same_concept': 'Lo que dice el contrato de este concepto va en su primera fila.',
  'rental.charges.kind': 'Concepto',
  'rental.charges.in_contract': '¿Lo pone el contrato?',
  'rental.charges.agreed': 'Importe al año que fija el contrato',
  'rental.charges.agreed_hint': 'Déjalo en blanco si el contrato no da una cifra.',
  'rental.charges.year': 'Año',
  'rental.charges.amount': 'Importe de los gastos de ese año (el año al que corresponden)',

  'rental.moveout.question': 'La salida',
  'rental.moveout.ask': '¿Has dejado ya la vivienda?',
  'rental.moveout.keys': 'Día en que devolviste las llaves',
  'rental.moveout.returns': 'Lo que te han devuelto de la fianza',
  'rental.moveout.returns_hint': 'Una fila por cada pago; si no te han devuelto nada, ninguna.',
  'rental.moveout.returns_add': 'Añadir devolución',
  'rental.moveout.return_on': 'Fecha',
  'rental.moveout.return_amount': 'Importe',
  'rental.moveout.deductions': 'Lo que te han descontado',
  'rental.moveout.deductions_add': 'Añadir descuento',
  'rental.moveout.deduction_kind': 'Motivo',
  'rental.moveout.deduction_amount': 'Importe',
  'rental.deduction.damage': 'Desperfectos',
  'rental.deduction.cleaning': 'Limpieza',
  'rental.deduction.unpaid_rent': 'Renta pendiente',
  'rental.deduction.unpaid_bills': 'Recibos pendientes',
  'rental.deduction.wear': 'Desgaste',
  'rental.deduction.other': 'Otro',

  'rental.result.title': 'Resultado',
  'rental.result.out_of_scope': 'Fuera de esta revisión',
  'rental.result.summary': 'Resumen',
  'rental.result.information': 'Para que lo sepas',
  'rental.result.unchecked': 'Lo que esta revisión no mira',
  'rental.result.rules': 'Normas',
  'rental.result.how': 'Cómo se calcula',
  'rental.result.sources': 'Fuentes',
  'rental.result.restart': 'Empezar de nuevo',

  'client.rental.answer.yes': 'Sí',
  'client.rental.answer.no': 'No',
  'client.rental.answer.unknown': 'No lo sé',
  'client.rental.landlord.person': 'Una persona',
  'client.rental.landlord.company': 'Una empresa',
  'client.rental.guarantee.cash': 'Dinero',
  'client.rental.guarantee.bank_guarantee': 'Aval bancario',
  'client.rental.guarantee.insurance': 'Seguro de impago',
  'client.rental.guarantee.other': 'Otra',
  'client.rental.fee.agency_fee': 'Honorarios de agencia',
  'client.rental.fee.formalisation': 'Formalización del contrato',
  'client.rental.fee.solvency_check': 'Estudio de solvencia',
  'client.rental.fee.reservation': 'Reserva',
  'client.rental.fee.management': 'Gestión',
  'client.rental.fee.other': 'Otro concepto',
  'client.rental.charge.community': 'Comunidad',
  'client.rental.charge.property_tax': 'IBI',
  'client.rental.charge.waste': 'Basuras',
  'client.rental.charge.other': 'Otro gasto',
  'client.rental.region.AN': 'Andalucía',
  'client.rental.region.AR': 'Aragón',
  'client.rental.region.AS': 'Principado de Asturias',
  'client.rental.region.IB': 'Illes Balears',
  'client.rental.region.CN': 'Canarias',
  'client.rental.region.CB': 'Cantabria',
  'client.rental.region.CL': 'Castilla y León',
  'client.rental.region.CM': 'Castilla-La Mancha',
  'client.rental.region.CT': 'Cataluña',
  'client.rental.region.VC': 'Comunitat Valenciana',
  'client.rental.region.EX': 'Extremadura',
  'client.rental.region.GA': 'Galicia',
  'client.rental.region.MD': 'Comunidad de Madrid',
  'client.rental.region.MC': 'Región de Murcia',
  'client.rental.region.NC': 'Comunidad Foral de Navarra',
  'client.rental.region.PV': 'País Vasco',
  'client.rental.region.RI': 'La Rioja',
  'client.rental.region.CE': 'Ceuta',
  'client.rental.region.ML': 'Melilla',

  'client.rental.rows.guarantees': 'Garantía {n}',
  'client.rental.rows.guarantees_remove': 'Quitar la garantía {n}',
  'client.rental.rows.fees': 'Pago {n}',
  'client.rental.rows.fees_remove': 'Quitar el pago {n}',
  'client.rental.rows.updates': 'Subida {n}',
  'client.rental.rows.updates_remove': 'Quitar la subida {n}',
  'client.rental.rows.charges': 'Gasto {n}',
  'client.rental.rows.charges_remove': 'Quitar el gasto {n}',
  'client.rental.rows.returns': 'Devolución {n}',
  'client.rental.rows.returns_remove': 'Quitar la devolución {n}',
  'client.rental.rows.deductions': 'Descuento {n}',
  'client.rental.rows.deductions_remove': 'Quitar el descuento {n}',
  'client.rental.rows.remove': 'Quitar',

  'client.rental.error.missing_value': 'Falta este dato',
  'client.rental.error.missing_choice': 'Elige una respuesta',
  'client.rental.error.invalid_date': 'La fecha no es válida',
  'client.rental.error.invalid_amount': 'No se entiende la cifra: escríbela como 1.234,56',
  'client.rental.error.invalid_number': 'Escribe un número entero',
  'client.rental.error.signed_in_future': 'La fecha del contrato es posterior a hoy',
  'client.rental.error.start_too_early':
    'La fecha de entrada es más de un año anterior a la del contrato',
  'client.rental.error.amount_out_of_range':
    'Escribe una cifra mayor que cero y de hasta un millón',
  'client.rental.error.months_out_of_range': 'El número de meses no es válido',
  'client.rental.error.percent_out_of_range': 'Escribe un porcentaje entre 0 y 100',
  'client.rental.error.percent_missing': 'Falta el porcentaje',
  'client.rental.error.unknown_region': 'Elige una comunidad autónoma',
  'client.rental.error.not_an_anniversary':
    'Ese año no hay aniversario del contrato: tiene que ser posterior al año de entrada',
  'client.rental.error.effective_outside_year':
    'El primer recibo con la renta nueva no cae en el año de esa subida',
  'client.rental.error.update_in_future': 'Esa subida es posterior a hoy',
  'client.rental.error.update_repeated': 'Esta subida ya está en otra fila',
  'client.rental.error.charged_before_start':
    'El primer recibo con la renta nueva es anterior a la fecha de entrada',
  'client.rental.error.notice_date_missing': 'Falta la fecha del aviso',
  'client.rental.error.notice_in_future': 'La fecha del aviso es posterior a hoy',
  'client.rental.error.year_out_of_range': 'El año no encaja con las fechas del contrato',
  'client.rental.error.keys_before_start': 'La entrega de llaves es anterior a la fecha de entrada',
  'client.rental.error.keys_in_future': 'La entrega de llaves es posterior a hoy',
  'client.rental.error.return_before_keys': 'La devolución es anterior a la entrega de llaves',
  'client.rental.error.return_in_future': 'La devolución es posterior a hoy',

  'client.rental.result.lead': 'Cada partida, con lo que dice la ley y la norma en que se apoya.',
  'client.rental.documents.mark_derived': 'Sale de lo leído en tus documentos · confianza {nivel}',
  'client.rental.documents.receipt_sums':
    'Los gastos de cada año suman solo los recibos leídos: si falta alguno, corrige la cifra en la hoja de gastos.',
  'client.rental.documents.receipt_other_lines':
    'Los recibos traen otros importes, como suministros, que no se pasan a la hoja de gastos: si alguno es un gasto de la vivienda, añádelo tú.',
  'client.rental.documents.receipt_duplicate':
    'Hay recibos del mismo mes que no dicen lo mismo: se ha usado uno de ellos. Compara las cifras de ese mes con tus recibos.',
  'client.rental.documents.gap_unclear':
    'Entre el recibo de {desde} ({antes}) y el de {hasta} ({despues}) la renta cambió, pero en medio hubo más de un aniversario, así que pudo subir más de una vez. No se ha pasado a la hoja de subidas: sube los recibos o avisos de esos meses, o añade tú cada subida.',
  'client.rental.documents.decrease':
    'Tus documentos muestran que la renta bajó en algún momento. Una bajada no es una subida, así que no se pasa a la hoja de subidas.',
  'client.rental.documents.check.return_before_keys':
    'La devolución leída es anterior a la entrega de llaves: revisa las dos fechas.',
  'client.rental.documents.check.receipt_parts_do_not_sum':
    'Las partes de algún recibo no suman su total: revisa las cifras de los recibos.',
  'client.rental.documents.check.invoice_total_mismatch':
    'La base y el IVA de alguna factura no suman su total: revisa el importe en la hoja de entrada.',
  'client.rental.documents.check.notice_rent_mismatch':
    'En algún aviso, la renta nueva no sale de aplicar el porcentaje a la anterior: revisa las cifras de la subida.',
  'client.rental.documents.check.start_long_before_signing':
    'La fecha de entrada leída es muy anterior a la del contrato: revisa las dos.',
  'client.rental.documents.rows_cut':
    'Se ha leído más de lo que cabe en alguna lista: compara sus filas con tus documentos y completa lo que falte.',
  'client.rental.documents.quote.updateClause': 'Lo que dice tu contrato sobre actualizar la renta',
  'client.rental.documents.quote.hasFees':
    'Lo que dice tu contrato sobre honorarios y gastos de gestión',
  'client.rental.documents.quote.hasCharges':
    'Lo que dice tu contrato sobre gastos aparte de la renta',
  'client.rental.documents.quote_note':
    'Copiado tal cual del documento: compáralo con lo que marcas aquí.',
  'client.rental.documents.error.pass_invalid':
    'Tu pase ya no sirve para leer documentos en este navegador; el detalle sigue disponible hasta que caduque. Prueba otra vez con una lectura gratis o rellena a mano.',
  'client.rental.documents.error.pass_exhausted':
    'Ya has usado las 15 lecturas de tu pase. Puedes rellenar a mano; el detalle sigue disponible.',
  'client.rental.documents.pass.issued':
    'Pago recibido. Ya puedes ver el detalle de cada partida y descargar el informe.',
  'client.rental.documents.pass.lost':
    'Hemos vuelto del pago, pero la revisión no se ha podido recuperar. Repítela y verás el detalle y las descargas.',
  'client.rental.report.title': 'Revisión de tu alquiler',
  'client.rental.report.intro':
    'Este informe compara lo que pagas o has pagado por tu alquiler con lo que permite la ley, partida por partida, con los datos que confirmaste en la revisión. Donde el resultado depende de una duda, da las dos cuentas. Informa sobre la ley y no es asesoramiento jurídico.',
  'client.rental.report.footer':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Normas e índices según su estado el {fecha}.',
  'client.rental.report.filename': 'eslojusto-informe-alquiler.pdf',
  'client.rental.report.your_data': 'Tus datos',
  'client.rental.report.signed': 'Fecha del contrato',
  'client.rental.report.start': 'Fecha de entrada',
  'client.rental.report.landlord': 'Casero',
  'client.rental.report.large_landlord': '¿Gran tenedor?',
  'client.rental.report.region': 'Comunidad autónoma',
  'client.rental.report.stressed_zone': '¿Zona tensionada?',
  'client.rental.report.agreed_months': 'Duración pactada',
  'client.rental.report.months': '{meses} meses',
  'client.rental.report.initial_rent': 'Renta al empezar',
  'client.rental.report.clause': 'Actualización de la renta',
  'client.rental.report.clause.none': 'El contrato no dice nada',
  'client.rental.report.clause.ipc': 'El IPC',
  'client.rental.report.clause.irav': 'El IRAV',
  'client.rental.report.clause.igc': 'El IGC',
  'client.rental.report.clause.fixed_percent': 'Un {tasa} fijo al año',
  'client.rental.report.clause.unspecified_index': 'Un índice sin decir cuál',
  'client.rental.report.clause.other': 'Otra fórmula',
  'client.rental.report.deposit': 'Fianza',
  'client.rental.report.advance': 'Mensualidades por adelantado',
  'client.rental.report.keys': 'Llaves devueltas el',
  'client.rental.report.no_figure': 'Sin dato',
  'client.rental.report.summary': 'Resumen',
  'client.rental.report.items': 'Partida por partida',
  'client.rental.report.how': 'Cómo se calcula',
  'client.rental.report.indices': 'Índices usados, con su mes y su publicación',
  'client.rental.report.norms': 'Las normas y su estado',
  'client.rental.report.information': 'Para que lo tengas en cuenta',
  'client.rental.report.unchecked': 'Lo que esta revisión no comprueba',
  'client.rental.letter.landlord': 'Casero',
  'client.rental.letter.address': 'Vivienda',
  'client.rental.letter.iban': 'Cuenta (IBAN)',
  'client.rental.letter.regards': 'Un saludo.',
  'client.rental.letter.deposit.title': 'Devolución de la fianza',
  'client.rental.letter.deposit.body':
    'Te escribo por nuestro contrato de alquiler de esta vivienda, con fecha {contrato}. Te devolví las llaves el {llaves} y de la fianza queda por devolver {pendiente}.',
  'client.rental.letter.deposit.interest_rule':
    'Como referencia, el art. 36.4 LAU prevé interés legal pasado un mes desde la entrega de las llaves.',
  'client.rental.letter.deposit.interest': 'Hasta el {fecha}, ese interés suma {importe}.',
  'client.rental.letter.deposit.account': 'Te pido que me devuelvas lo pendiente en esta cuenta:',
  'client.rental.letter.deposit.body_late':
    'Te escribo por nuestro contrato de alquiler de esta vivienda, con fecha {contrato}. Te devolví las llaves el {llaves} y me devolviste la fianza el {devuelta}, pasado el mes que prevé el art. 36.4 LAU; los intereses legales de ese retraso son {importe}.',
  'client.rental.letter.deposit.account_interest':
    'Te pido que me ingreses esos intereses en esta cuenta:',
  'client.rental.letter.lowest': 'Esta cifra es la más baja de las cuentas posibles.',
  'client.rental.letter.deposit.filename': 'eslojusto-carta-fianza.pdf',
  'client.rental.letter.rent.title': 'Revisión de la renta',
  'client.rental.letter.rent.body':
    'Te escribo por nuestro contrato de alquiler de esta vivienda, con fecha {contrato}. He comparado las subidas de la renta con lo que permite el art. 18 de la Ley de Arrendamientos Urbanos y el tope legal de cada año, y en estas la renta que resulta es más baja que la que pago:',
  'client.rental.letter.rent.rise': 'Subida del {aniversario}',
  'client.rental.letter.rent.index': 'el {indice} de {mes}, {tasa}',
  'client.rental.letter.rent.index_flash': 'el {indice} adelantado de {mes}, {tasa}',
  'client.rental.letter.rent.fixed': 'el {tasa} fijo del contrato',
  'client.rental.letter.rent.cap_fixed': 'el tope del {tasa} de ese año, según {norma}',
  'client.rental.letter.rent.cap_index': 'el tope de ese año, {indice}, según {norma}',
  'client.rental.letter.rent.line':
    '{subida}: con {criterio}, la renta que resulta según el art. 18 LAU es {renta} al mes; pago {pagada}, {diferencia} más cada mes.',
  'client.rental.letter.rent.line_no_rate':
    '{subida}: la renta que resulta según el art. 18 LAU es {renta} al mes; pago {pagada}, {diferencia} más cada mes.',
  'client.rental.letter.rent.cap': 'Tope legal de ese año: {norma}.',
  'client.rental.letter.rent.pending':
    'Esta cifra es la más baja de las dos cuentas posibles, porque una norma de la que depende está pendiente de convalidación por el Congreso: {normas}.',
  'client.rental.letter.rent.ask': 'Por eso te pido que revises el importe.',
  'client.rental.letter.rent.filename': 'eslojusto-carta-renta.pdf',
  'client.rental.result.lead_locked':
    'Cada partida con su resultado redondeado y la norma en que se apoya.',
  'client.rental.result.lead_out_of_scope':
    'Con lo que has contestado, esta revisión no calcula nada.',
  'client.rental.out_of_scope.status': 'Esta revisión no cubre tu tipo de contrato',
  'client.rental.out_of_scope.before_2019_status': 'Esta revisión no cubre tu contrato',
  'client.rental.out_of_scope.before_2019':
    'Esta versión no revisa contratos firmados antes del 6 de marzo de 2019: siguen otras reglas para actualizar la renta.',
  'client.rental.out_of_scope.seasonal':
    'Esta revisión aún no cubre los contratos de temporada. En los firmados desde el 8 de octubre de 2026, el Real Decreto-ley 29/2026, pendiente de convalidación, trata como de vivienda habitual el contrato temporal que no recoge una causa de temporalidad real y acreditable. Los firmados antes siguen con las reglas de entonces hasta que acaba el plazo pactado (disposición transitoria 8.ª de la Ley de Arrendamientos Urbanos).',
  'client.rental.out_of_scope.room':
    'Esta revisión aún no cubre los alquileres por habitaciones. El Real Decreto-ley 29/2026, en vigor desde el 8 de octubre de 2026 y pendiente de convalidación, los incluye en el alquiler de vivienda, habitual o temporal según la necesidad que cubran.',
  'client.rental.out_of_scope.other_use':
    'Un contrato para un uso distinto del de vivienda tiene sus propias reglas.',
  'client.rental.out_of_scope.protected':
    'Una vivienda protegida tiene su renta máxima y sus reglas propias.',
  'client.rental.out_of_scope.old_rent': 'Un contrato de renta antigua sigue otras reglas.',

  'client.rental.headline.found': 'Hay partidas por encima de lo que permite la ley.',
  'client.rental.headline.only_doubtful':
    'Nada seguro por encima de la ley: lo que sale depende de dudas que esta revisión no puede resolver.',
  'client.rental.headline.nothing_found':
    'Con los datos que has metido, nada sale por encima de lo que permite la ley.',
  'client.rental.headline.nothing_entered':
    'No has metido datos que se puedan comparar con la ley.',
  'client.rental.total.paidOver': 'Pagas o has pagado de más al menos {importe}.',
  'client.rental.total.paidOver_up_to':
    'Pagas o has pagado de más al menos {importe}, y hasta {maximo} según se resuelvan las dudas.',
  'client.rental.total.paidOver_doubtful':
    'Según se resuelvan las dudas, podrías haber pagado de más hasta {maximo}.',
  'client.rental.total.owed': 'Te deben al menos {importe}.',
  'client.rental.total.owed_up_to':
    'Te deben al menos {importe}, y hasta {maximo} según se resuelvan las dudas.',
  'client.rental.total.owed_doubtful':
    'Según se resuelvan las dudas, podrían deberte hasta {maximo}.',
  'client.rental.total.overCap': 'Por encima del tope legal, al menos {importe}.',
  'client.rental.total.overCap_up_to':
    'Por encima del tope legal, al menos {importe}, y hasta {maximo} según se resuelvan las dudas.',
  'client.rental.total.overCap_doubtful':
    'Según se resuelvan las dudas, podría haber hasta {maximo} por encima del tope legal.',

  'client.rental.item.fee': 'Pago al entrar: {concepto}',
  'client.rental.item.guarantees': 'Fianza y garantías en dinero',
  'client.rental.item.guarantee': 'Garantía: {tipo}',
  'client.rental.item.advance': 'Pago por adelantado',
  'client.rental.item.rent_update': 'Subida del {fecha}',
  'client.rental.item.charge_year': '{concepto} de {ejercicio}',
  'client.rental.item.deposit_return': 'Devolución de la fianza',
  'client.rental.item.deposit_interest': 'Intereses por el retraso',
  'client.rental.item.rules': 'Normas de esta partida',

  'client.rental.status.paid_over': 'Pagas de más: {importe}',
  'client.rental.status.paid_over_little': 'Pagas de más: menos de 10 €',
  'client.rental.status.owed': 'Te deben {importe}',
  'client.rental.status.owed_little': 'Te deben menos de 10 €',
  'client.rental.status.over_cap': 'Por encima del tope: {importe}',
  'client.rental.status.over_cap_little': 'Por encima del tope: menos de 10 €',
  'client.rental.status.over_cap_no_amount': 'Por encima del tope',
  'client.rental.status.within_limit': 'Dentro del límite',
  'client.rental.status.not_checkable': 'No se puede comprobar',
  'client.rental.status.not_applicable_to_date': 'No aplica a la fecha de tu contrato',
  'client.rental.status.not_entered': 'No lo has metido',
  'client.rental.status.review_it': 'Revísalo',
  'client.rental.status.not_yet_due': 'Aún en plazo',
  'client.rental.status.depends': 'Depende',
  'client.rental.reading.paid_over': 'pagas de más',
  'client.rental.reading.owed': 'te deben',
  'client.rental.reading.over_cap': 'por encima del tope',
  'client.rental.reading.within_limit': 'dentro del límite',
  'client.rental.reading.not_checkable': 'no se puede comprobar',
  'client.rental.reading.not_applicable_to_date': 'no aplica a tu fecha',
  'client.rental.reading.not_entered': 'sin dato',
  'client.rental.reading.review_it': 'revísalo',
  'client.rental.reading.not_yet_due': 'aún en plazo',
  'client.rental.about': 'unos {importe}',
  'client.rental.reading_amount.paid_over': 'pagas de más {importe}',
  'client.rental.reading_amount.owed': 'te deben {importe}',
  'client.rental.reading_amount.over_cap': 'por encima del tope en {importe}',
  'client.rental.depends': 'Depende de {motivo}: entre {minimo} y {maximo}',
  'client.rental.depends_status': 'Depende de {motivo}: {una} o {otra}',
  'client.rental.reason.pending_validation':
    'si el Congreso convalida una norma aún pendiente de convalidación',
  'client.rental.reason.repealed_window': 'cómo se lea una norma que ya está derogada',
  'client.rental.reason.large_landlord_unknown': 'si tu casero es gran tenedor',
  'client.rental.reason.index_month_doubtful': 'qué dato del índice estaba publicado ese día',
  'client.rental.reason.agreement_unknown': 'si lo pactasteis por escrito',
  'client.rental.reason.agreement_verbal': 'si se puede probar que la aceptaste de palabra',
  'client.rental.reason.notice_form_doubtful':
    'si un aviso por correo o mensaje cuenta como aviso por escrito',
  'client.rental.reason.notice_missing_paid':
    'si pagar la subida sin aviso por escrito cuenta como aceptarla',
  'client.rental.reason.interest_day_count': 'si el año de intereses cuenta 365 días o 360',
  'client.rental.reason.extraordinary_cap_reach':
    'si los topes extraordinarios de la renta alcanzan a los gastos',
  'client.rental.reason_list': '{a}, de {b}',
  'client.rental.reason_join': '{a} y de {b}',
  'client.rental.share.out': 'No se suma al total mientras esa duda siga abierta.',
  'client.rental.share.lowest': 'Al total se suma solo la cuenta más baja: {importe}.',
  'client.rental.hint.company_landlord':
    'En tu contrato el casero es una empresa: puede ser gran tenedor.',
  'client.rental.norm.in_force': 'en vigor',
  'client.rental.norm.pending_validation': 'pendiente de convalidación',
  'client.rental.norm.repealed': 'derogada el {fecha}',
  'client.rental.source.since': 'con efectos desde el {desde}',
  'client.rental.source.between': 'con efectos del {desde} al {hasta}',

  'client.rental.detail.base': 'Renta de partida',
  'client.rental.detail.agreed': 'Lo pactado',
  'client.rental.detail.cap': 'Tope legal',
  'client.rental.detail.max_rent': 'Renta máxima',
  'client.rental.detail.charged': 'Renta que pagas',
  'client.rental.detail.months': 'Meses contados',
  'client.rental.detail.monthly': 'De más cada mes',
  'client.rental.detail.accumulated': 'De más en total',
  'client.rental.detail.index': '{indice} de {mes}: {tasa}, publicado el {fecha}',
  'client.rental.detail.index_flash': '{indice} adelantado de {mes}: {tasa}, publicado el {fecha}',
  'client.rental.detail.fixed_rate': '{tasa} fijo',
  'client.rental.detail.reading_low': 'Una cuenta',
  'client.rental.detail.reading_high': 'La otra cuenta',
  'client.rental.index.irav': 'IRAV',
  'client.rental.index.ipc': 'IPC',
  'client.rental.index.igc': 'IGC',

  'client.rental.info.serpavi':
    'SERPAVI, precio de referencia del alquiler (Ministerio de Vivienda)',
  'client.rental.info.lau': 'Ley de Arrendamientos Urbanos (BOE)',
  'client.rental.info.stressed_zone.title': 'Zona tensionada',
  'client.rental.info.stressed_zone.text_yes':
    'En una zona tensionada la renta inicial puede tener tope (art. 17.6 y 17.7 LAU). Esta revisión no lo calcula; el precio de referencia está en SERPAVI.',
  'client.rental.info.stressed_zone.text_unknown':
    'Si la vivienda está en una zona tensionada, la renta inicial puede tener tope (art. 17.6 y 17.7 LAU). Las zonas las declara cada comunidad; el precio de referencia está en SERPAVI.',
  'client.rental.info.reference_price.title': 'Precio de referencia',
  'client.rental.info.reference_price.text':
    'En las actualizaciones del 8 de octubre de 2026 al 31 de diciembre de 2027, el Real Decreto-ley 29/2026, pendiente de convalidación, dice que no cabe ninguna subida si la renta supera el límite de precio que le sea aplicable según el sistema de índices de referencia; no dice en qué casos se aplica ese límite. Esta revisión no lo calcula; el precio está en SERPAVI.',
  'client.rental.info.minimum_term.title': 'Hasta cuándo dura tu contrato',
  'client.rental.info.minimum_term.text':
    'Tu contrato acaba el {contractEnd}. Con la prórroga obligatoria, tu plazo mínimo acaba el {mandatoryEnd}.',
  'client.rental.info.notice_windows.title': 'Prórroga año a año',
  'client.rental.info.notice_windows.text':
    'Si nadie avisa a tiempo (el casero, hasta el {landlordBy}; tú, hasta el {tenantBy}), el contrato sigue año a año hasta el {tacitUntil}.',
  'client.rental.info.extensions_rdl28.title': 'Prórrogas desde el 15 de noviembre de 2026',
  'client.rental.info.extensions_rdl28.text':
    'El Real Decreto-ley 28/2026, pendiente de convalidación, cambia las prórrogas desde el 15 de noviembre de 2026. Tu plazo mínimo acaba el {mandatoryEnd}.',
  'client.rental.info.extension_rdl29.title': 'Prórroga extraordinaria',
  'client.rental.info.extension_rdl29.text':
    'El Real Decreto-ley 29/2026, pendiente de convalidación, prevé una prórroga extraordinaria para los contratos cuyo plazo acaba entre el {from} y el {until}.',
  'client.rental.info.deposit_lodging.title': 'Depósito de la fianza',
  'client.rental.info.deposit_lodging.text':
    'El casero deposita la fianza en el organismo de la comunidad autónoma que lo prevea (disposición adicional 3.ª LAU).',
  'client.rental.info.regional_rules.title': 'Normas de tu comunidad',
  'client.rental.info.regional_rules.text':
    '{comunidad} puede tener normas propias que se suman a las estatales. Esta revisión solo aplica las estatales.',
  'client.rental.info.meters.title': 'Suministros con contador',
  'client.rental.info.meters.text':
    'La luz, el agua o el gas con contador los pagas según lo que gastas (art. 20.3 LAU, art. 20.4 desde el 8 de octubre de 2026), así que no se revisan aquí.',
  'client.rental.info.guarantee_return.title': 'Devolución de las garantías',
  'client.rental.info.guarantee_return.text':
    'Las garantías en dinero, además de la fianza, también vuelven a ti al acabar el contrato.',
  'client.rental.info.closing_document.title': 'Documento de finalización',
  'client.rental.info.closing_document.text':
    'Desde el 8 de octubre de 2026, si al dejar la vivienda no hay un documento de finalización, se presume que la devolviste en buen estado (art. 36.7 LAU).',

  'client.rental.unchecked.initial_rent_cap': 'El tope de la renta inicial en zonas tensionadas.',
  'client.rental.unchecked.regional_rules': 'Las normas propias de tu comunidad autónoma.',
  'client.rental.unchecked.extensions': 'Las prórrogas y los preavisos, más allá de sus fechas.',
  'client.rental.unchecked.damage': 'Si los desperfectos justifican un descuento de la fianza.',
  'client.rental.unchecked.later_agreements': 'Si un acuerdo posterior cambió el contrato.',

  'client.rental.calculation.item.not_entered': 'No has metido este dato.',
  'client.rental.calculation.rent_update.base_initial':
    'Se parte de la renta del contrato: {rent}.',
  'client.rental.calculation.rent_update.base_previous_max':
    'Se parte de la renta máxima del año anterior, no de la cobrada: {rent}.',
  'client.rental.calculation.rent_update.base_from_answer':
    'Sin la subida del año anterior, se parte de la renta que pagabas antes: {rent}.',
  'client.rental.calculation.rent_update.no_clause':
    'El contrato no prevé actualizar la renta, así que no cabe subida (art. 18.1 LAU).',
  'client.rental.calculation.rent_update.before_anniversary_one':
    'Se cobró 1 mes con la renta nueva antes del aniversario del {anniversary}; en él tocaba pagar {base}.',
  'client.rental.calculation.rent_update.before_anniversary_many':
    'Se cobraron {months} meses con la renta nueva antes del aniversario del {anniversary}; en ellos tocaba pagar {base}.',
  'client.rental.calculation.rent_update.second_rise':
    'Ya hubo una subida en el año del aniversario del {anniversary}: la del {date} no cabe.',
  'client.rental.calculation.rent_update.figure.index':
    '{index} de {month}: {rate}, publicado el {published}',
  'client.rental.calculation.rent_update.figure.flash':
    '{index} adelantado de {month}: {rate}, publicado el {published}',
  'client.rental.calculation.rent_update.figure.fixed': '{rate} fijo',
  'client.rental.calculation.rent_update.agreed': 'Lo que pacta el contrato: {rate}.',
  'client.rental.calculation.rent_update.agreed_other':
    'El contrato pacta otra fórmula: la subida solo se compara con el tope.',
  'client.rental.calculation.rent_update.cap': 'Tope legal: {rate}.',
  'client.rental.calculation.rent_update.max_rent': 'Renta máxima: {base} más el {rate}, {max}.',
  'client.rental.calculation.rent_update.negative_rate':
    'La variación fue del {rate}: no permite subir.',
  'client.rental.calculation.rent_update.agreed_in_writing':
    'Aceptaste la subida por escrito, así que no se compara con el índice.',
  'client.rental.calculation.rent_update.agreed_verbally':
    'Aceptaste la subida de palabra: si se puede probar, vale como pacto y no se compara con el índice.',
  'client.rental.calculation.rent_update.large_landlord_cap':
    'Si tu casero es gran tenedor, el tope se aplica aunque aceptaras la subida.',
  'client.rental.calculation.rent_update.charged_before_notice_one':
    'Se cobró 1 mes con la renta nueva antes del mes siguiente al aviso por escrito; en él tocaba pagar {base}.',
  'client.rental.calculation.rent_update.charged_before_notice_many':
    'Se cobraron {months} meses con la renta nueva antes del mes siguiente al aviso por escrito; en ellos tocaba pagar {base}.',
  'client.rental.calculation.rent_update.notice_not_written_one':
    'Sin aviso por escrito, se cobró 1 mes con la renta nueva cuando tocaba pagar {base}.',
  'client.rental.calculation.rent_update.notice_not_written_many':
    'Sin aviso por escrito, se cobraron {months} meses con la renta nueva cuando tocaba pagar {base}.',
  'client.rental.calculation.rent_update.accepted_by_paying':
    'No te avisaron por escrito, pero pagaste la subida: si eso cuenta como aceptarla, la renta nueva valía desde el aniversario.',
  'client.rental.calculation.rent_update.accepted_by_paying_up_to_max':
    'No te avisaron por escrito, pero pagaste la subida: si eso cuenta como aceptarla, desde el aniversario valía la subida hasta la renta máxima. Lo que pasa de ella lo pagas de más igualmente.',
  'client.rental.calculation.rent_update.months': 'Meses contados: {months}, de {from} a {to}.',
  'client.rental.calculation.rent_update.monthly_over': 'Pagas {monthly} de más cada mes.',
  'client.rental.calculation.rent_update.within_limit': 'La renta nueva no pasa de la máxima.',
  'client.rental.calculation.rent_update.other_clause_within_cap':
    'La renta nueva no pasa del tope; lo que pacta tu contrato no se puede comprobar.',
  'client.rental.calculation.rent_update.index_not_loaded':
    'El dato del índice de ese mes aún no está en esta revisión, así que no se calcula.',
  'client.rental.calculation.rent_update.index_publication_unknown':
    'No se sabe qué día se publicó el dato del índice de ese mes, así que no se calcula.',
  'client.rental.calculation.rent_update.index_none_published':
    'El índice aún no se publicaba ese día, así que no se puede aplicar.',
  'client.rental.calculation.rent_update.flash_not_loaded':
    'Ese día ya había un IPC adelantado que esta revisión no tiene, así que no se calcula.',
  'client.rental.calculation.rent_update.too_many_readings':
    'Hay demasiadas dudas abiertas a la vez para calcular esta subida.',
  'client.rental.calculation.fees.company_landlord':
    'En un contrato firmado desde el 6 de marzo de 2019 con una empresa como casero, estos gastos son de la empresa.',
  'client.rental.calculation.fees.person_landlord':
    'Con un casero persona y un contrato anterior al 26 de mayo de 2023, la ley no ponía estos gastos a su cargo.',
  'client.rental.calculation.fees.landlord_pays':
    'Desde el 26 de mayo de 2023, la gestión inmobiliaria y la formalización del contrato son del casero.',
  'client.rental.calculation.fees.any_name':
    'Desde el 8 de octubre de 2026 no se te puede cobrar la gestión ni la formalización, se llame como se llame.',
  'client.rental.calculation.fees.other_name':
    'Puede ser un honorario con otro nombre: el art. 20.1 LAU, en su redacción anterior al Real Decreto-ley 29/2026, pone a cargo del casero la gestión inmobiliaria y la formalización del contrato.',
  'client.rental.calculation.fees.requested_in_writing':
    'Si pediste ese servicio por escrito, la ley permite cobrarlo.',
  'client.rental.calculation.fees.paid_over': 'Pagaste {amount} por ello.',
  'client.rental.calculation.guarantees.deposit_excess':
    'La fianza es de una mensualidad: de los {deposit}, {excess} pasan de los {rent} y cuentan como garantía.',
  'client.rental.calculation.guarantees.money': 'Garantías en dinero: {money}; el tope es {cap}.',
  'client.rental.calculation.guarantees.over_cap': 'Pasan del tope {amount}.',
  'client.rental.calculation.guarantees.within_cap': 'No pasan del tope.',
  'client.rental.calculation.guarantees.long_contract':
    'Con una duración pactada de {months} meses, por encima de {limit}, la ley no pone tope a las garantías.',
  'client.rental.calculation.guarantees.not_money':
    'Esta garantía no es dinero: no se suma al tope en euros.',
  'client.rental.calculation.guarantees.only_money_compared':
    'Solo las garantías en dinero se comparan con el tope.',
  'client.rental.calculation.guarantees.insurance_banned':
    'Desde el 8 de octubre de 2026 no se puede exigir un seguro de impago.',
  'client.rental.calculation.guarantees.insurance_before_ban':
    'Antes del 8 de octubre de 2026, si un seguro de impago cuenta dentro del tope de dos mensualidades no está resuelto.',
  'client.rental.calculation.advance.over_cap':
    'Pagaste {months} mensualidades por adelantado y la ley permite una: pasan del tope {amount}, a {rent} al mes.',
  'client.rental.calculation.advance.within_cap': 'No pasa de una mensualidad por adelantado.',
  'client.rental.calculation.charges.not_in_contract':
    'Este gasto no aparece en tu contrato; te cobraron {charged}.',
  'client.rental.calculation.charges.no_annual_amount':
    'El contrato no fija su importe al año, que el art. 20.1 LAU pide para pasártelo.',
  'client.rental.calculation.charges.agreed': 'Importe al año pactado: {amount}.',
  'client.rental.calculation.charges.year_cap':
    'En {year} la renta podía subir un {rise} y el gasto, el doble: de {previous} a {cap}.',
  'client.rental.calculation.charges.over_cap':
    'Te cobraron {charged} y el máximo era {cap}: {amount} de más.',
  'client.rental.calculation.charges.year_unclear':
    'En {year} te cobraron {charged}, más de vez y media lo pactado al año: puede que entren recibos de otro año. Comprueba a qué año corresponde cada recibo.',
  'client.rental.calculation.charges.within_cap': 'Te cobraron {charged}, sin pasar de {cap}.',
  'client.rental.calculation.charges.rise_upper_bound':
    'Esa cifra es solo un máximo, porque tu contrato pacta otra fórmula: lo cobrado no pasa de ahí.',
  'client.rental.calculation.charges.rise_not_checkable':
    'La subida que permitía la renta en {year} no se puede calcular, así que tampoco la del gasto.',
  'client.rental.calculation.charges.too_many_readings':
    'Hay demasiadas dudas abiertas a la vez para calcular este gasto.',
  'client.rental.calculation.charges.past_first_years':
    'Pasados los {years} primeros años del contrato, la ley no limita cuánto sube este gasto.',
  'client.rental.calculation.charges.tax_outside_cap':
    'Es un tributo: queda fuera del límite de subida de los gastos.',
  'client.rental.calculation.charges.tax_banned':
    'En un contrato firmado desde el 8 de octubre de 2026, los tributos de la vivienda no se te pueden pasar salvo que debas pagarlos tú; te cobraron {charged}.',
  'client.rental.calculation.charges.waste_may_be_tax':
    'La tasa de basuras es un tributo en la mayoría de municipios: queda fuera del límite de subida.',
  'client.rental.calculation.charges.other_kind':
    'Puede ser un suministro con contador, que es tuyo, o un tributo: no se compara con un límite.',
  'client.rental.calculation.deposit.pending':
    'Fianza {deposit}; devuelto {returned}; descontado {deducted}; queda {pending}.',
  'client.rental.calculation.deposit.deduction.damage': 'Descuento por desperfectos: {amount}.',
  'client.rental.calculation.deposit.deduction.cleaning': 'Descuento por limpieza: {amount}.',
  'client.rental.calculation.deposit.deduction.unpaid_rent':
    'Descuento por renta pendiente: {amount}.',
  'client.rental.calculation.deposit.deduction.unpaid_bills':
    'Descuento por recibos pendientes: {amount}.',
  'client.rental.calculation.deposit.deduction.wear': 'Descuento por desgaste: {amount}.',
  'client.rental.calculation.deposit.deduction.other': 'Otro descuento: {amount}.',
  'client.rental.calculation.deposit.deductions_not_judged':
    'Esta revisión no valora si los descuentos están justificados.',
  'client.rental.calculation.deposit.owed': 'Te deben {amount} de la fianza.',
  'client.rental.calculation.deposit.not_yet_due':
    'El casero tiene hasta el {due} para devolverla.',
  'client.rental.calculation.deposit.returned_in_full': 'No queda nada por devolver.',
  'client.rental.calculation.deposit.returned_on_time':
    'Te la devolvieron antes del {from}, cuando habría empezado a correr el interés.',
  'client.rental.calculation.deposit.returned_after_month':
    'Te la devolvieron el {from}, el día en que empezaba a correr el interés: no da intereses.',
  'client.rental.calculation.deposit.late_part_above_month':
    'Lo devuelto tarde es lo que pasaba de una mensualidad ({rent}), que no genera interés.',
  'client.rental.calculation.deposit.interest_not_yet': 'El interés empieza a correr el {from}.',
  'client.rental.calculation.deposit.interest_deposit_only':
    'Solo genera interés la fianza, una mensualidad ({rent}); lo que pasaba de ella es otra garantía.',
  'client.rental.calculation.deposit.interest_stretch_one':
    '{amount} del {from} al {to}: 1 día al {rate} sobre {yearDays} días al año, {interest}.',
  'client.rental.calculation.deposit.interest_stretch_many':
    '{amount} del {from} al {to}: {days} días al {rate} sobre {yearDays} días al año, {interest}.',
  'client.rental.calculation.deposit.interest_day_count':
    'Ninguna norma dice si el año de intereses cuenta 365 días o 360: se hacen las dos cuentas.',
  'client.rental.calculation.deposit.interest_total': 'Intereses: {total}.',
  'client.rental.calculation.deposit.interest_rate_not_loaded':
    'El interés legal de {year} aún no está en esta revisión: desde ese año no se cuenta.',
  // The household domestic worker review's engine phrases, shown only with PUBLIC_HOUSEHOLD=1.
  'client.household.calculation.minimum_wage.not_published':
    'El SMI de {year} aún no se ha publicado en el BOE. Como referencia, el de {referenceYear}: {reference}. Para {year} no se calcula ninguna diferencia.',
  'client.household.calculation.minimum_wage.not_loaded':
    'Esta revisión no tiene el SMI de ese año: no se compara.',
  'client.household.calculation.minimum_wage.minimum':
    'SMI de {year}: {monthly} al mes en 14 pagas, {annual} al año, para 40 horas a la semana. Con {hours} horas a la semana se aplica en proporción ({coefficient}): {requiredMonthly} al mes, {requiredAnnual} al año.',
  'client.household.calculation.minimum_wage.twelve_payments_enough':
    'Solo con las doce mensualidades cobras {paid} al año en dinero: llegas al mínimo aunque no se sumen las pagas extra.',
  'client.household.calculation.minimum_wage.extra_pays_unknown':
    'Con las doce mensualidades cobras {paid} al año y no se sabe el importe de las pagas extra: no se puede decir si llegas al mínimo.',
  'client.household.calculation.minimum_wage.paid_prorated':
    'Cobras {monthly} al mes en dinero, con las pagas extra incluidas: {annual} al año.',
  'client.household.calculation.minimum_wage.paid_apart':
    'Cobras {monthly} al mes en dinero y {extras} al año en pagas extra: {annual} al año.',
  'client.household.calculation.minimum_wage.shortfall':
    'Podrían faltarte {annual} al año, unos {monthly} al mes.',
  'client.household.calculation.minimum_wage.hourly':
    'Mínimo por hora de {year} para quien trabaja por horas y no vive en la casa: {minimum}. Cobras {paid} la hora.',
  'client.household.calculation.minimum_wage.hourly_includes_everything':
    'Ese precio incluye todos los conceptos, también las vacaciones y las pagas extra, y se paga en dinero: no se reclaman aparte.',
  'client.household.calculation.minimum_wage.hourly_shortfall':
    'Te faltan {difference} por cada hora trabajada.',
  'client.household.calculation.in_kind.share':
    'El salario en especie ({inKind}) es el {share} % de tu salario total ({total}). El máximo es el {cap} %.',
  'client.household.calculation.in_kind.share_annual':
    'Contando el año entero con las pagas extra, el salario en especie ({inKind}) es el {share} % de tu salario total ({total}). El máximo es el {cap} %.',
  'client.household.calculation.in_kind.extra_pays_unknown':
    'Sin el importe de las pagas extra no se puede medir el año entero, y con ellas el porcentaje podría quedar dentro del límite: no se cuenta como superado.',
  'client.household.calculation.in_kind.cash_only':
    'El mínimo se compara con lo que cobras en dinero: la manutención y el alojamiento no cuentan para llegar a él.',
  'client.household.calculation.extra_pays.prorated':
    'Tus pagas extra están repartidas en las doce mensualidades. La norma las fija al final de cada semestre salvo pacto en otro sentido: conviene comprobar que lo pactaste así.',
  'client.household.calculation.extra_pays.fewer_than_two':
    'Tienes {count} al año y la norma prevé dos pagas extra, una al final de cada semestre.',
  'client.household.calculation.extra_pays.once_a_year':
    'La norma fija las pagas extra al final de cada semestre salvo pacto: pagarlas de otra forma podría ser válido si lo pactaste.',
  'client.household.calculation.extra_pays.two_or_more':
    'Tienes {count} pagas extra al año; la norma prevé al menos dos, al final de cada semestre salvo pacto.',
  'client.household.calculation.working_time.weekly_hours':
    'Trabajas {hours} horas a la semana de trabajo efectivo; la jornada ordinaria es de {limit} como máximo, y lo que pase de ahí serían horas extraordinarias.',
  'client.household.calculation.working_time.presence_apart':
    'El tiempo de presencia se cuenta aparte y no suma a esa jornada.',
  'client.household.calculation.working_time.rest':
    'Descansas {hours} horas entre jornadas; el mínimo es de {limit}.',
  'client.household.calculation.working_time.rest_live_in':
    'Descansas {hours} horas entre jornadas. Si vives en la casa, el descanso puede bajar hasta {limit} horas.',
  'client.household.calculation.working_time.rest_made_up':
    'La diferencia hasta las 12 horas se compensa en el plazo de cuatro semanas.',
  'client.household.calculation.working_time.rest_not_made_up':
    'La diferencia hasta las 12 horas no se compensa en el plazo de cuatro semanas.',
  'client.household.calculation.working_time.rest_made_up_unknown':
    'No consta si la diferencia hasta las 12 horas se compensa en el plazo de cuatro semanas.',
  'client.household.calculation.working_time.rest_below':
    'Descansas {hours} horas entre jornadas y el mínimo es de {limit}.',
  'client.household.calculation.working_time.rest_below_live_in':
    'Descansas {hours} horas entre jornadas: menos de las {liveInLimit} a las que, como mucho, puede bajar el descanso de quien vive en la casa, y menos de las {limit} generales.',
  'client.household.calculation.working_time.weekly_rest':
    'Tu descanso semanal es de {hours} horas; el mínimo es de {limit}.',
  'client.household.calculation.holidays.days':
    'Tienes {days} días naturales de vacaciones al año; el mínimo es de {limit}.',
  'client.household.calculation.holidays.stretch':
    'Tu periodo de vacaciones más largo es de {days} días seguidos; al menos uno ha de ser de {limit}.',
  'client.household.calculation.termination.et_cause':
    'La relación termina por una causa del artículo 49.1 del Estatuto de los Trabajadores. Esta revisión no valora esa causa ni la hora a la que se comunicó la decisión de terminar (artículo 11.4), que solo mira en el desistimiento.',
  'client.household.calculation.termination.cause.income_drop_or_expense_rise':
    'La causa indicada es una disminución de los ingresos de la familia o un aumento de sus gastos por una circunstancia sobrevenida.',
  'client.household.calculation.termination.cause.family_needs_change':
    'La causa indicada es un cambio sustancial en las necesidades de la familia.',
  'client.household.calculation.termination.cause.loss_of_trust':
    'La causa indicada es la pérdida de confianza, que ha de ser razonable y proporcionada.',
  'client.household.calculation.termination.cause_truth_not_judged':
    'La revisión mira solo la categoría de la causa; no valora si es cierta.',
  'client.household.calculation.termination.cause_none':
    'El desistimiento no indica ninguna causa y la norma exige una de tres.',
  'client.household.calculation.termination.cause_other':
    'La causa indicada no es una de las tres que admite la norma: menos ingresos o más gastos de la familia por una circunstancia sobrevenida, cambio sustancial de sus necesidades o pérdida de confianza razonable y proporcionada.',
  'client.household.calculation.termination.not_in_writing':
    'El desistimiento no se comunicó por escrito y la norma lo exige.',
  'client.household.calculation.termination.cause_not_in_writing':
    'El escrito no expresa la causa y la norma exige que la exprese.',
  'client.household.calculation.termination.in_writing':
    'El desistimiento se comunicó por escrito y con su causa.',
  'client.household.calculation.termination.writing_unknown':
    'No consta si se comunicó por escrito y con su causa.',
  'client.household.calculation.dismissal.no_written_notice':
    'Sin la comunicación por escrito, la norma presume que se trata de un despido y podrían aplicarse sus reglas.',
  'client.household.calculation.dismissal.no_severance':
    'Sin la indemnización puesta a tu disposición a la vez que te comunicaron la extinción, la norma presume que se trata de un despido y podrían aplicarse sus reglas.',
  'client.household.calculation.dismissal.unknown':
    'Según lo que contestas no se puede descartar que falten el escrito o la indemnización, y sin ellos la norma presume que se trata de un despido.',
  'client.household.calculation.dismissal.none_of_the_two':
    'Hubo escrito y se puso a tu disposición la indemnización: por esos dos motivos la norma no presume el despido.',
  'client.household.calculation.dismissal.none_of_the_two_no_severance_due':
    'Hubo escrito y, con esta forma de contar el año incompleto, no se debía indemnización: no faltó ponerla a tu disposición y la norma no presume el despido.',
  'client.household.calculation.dismissal.short_notice':
    'Un preaviso más corto no lleva a esa presunción, pero se te debe la diferencia.',
  'client.household.calculation.dismissal.figure_difference':
    'Un error disculpable en el importe de la indemnización no lleva a esa presunción, pero se te debe la diferencia; si el importe fuera muy inferior, podría valorarse de otro modo.',
  'client.household.calculation.night.notice_time':
    'Te comunicaron el fin de la relación a las {time}.',
  'client.household.calculation.night.on_the_hour':
    'Con quien vive en la casa, la decisión de terminar no podrá llevarse a cabo entre las 17:00 y las 08:00; la revisión lo mira por la hora del aviso. A las 17:00 o a las 08:00 en punto no queda claro si esa hora está dentro, y no se cuenta.',
  'client.household.calculation.night.serious_breach_alleged':
    'Entre las 17:00 y las 08:00 solo cabe si la terminación se debe a una falta muy grave a los deberes de lealtad y confianza; esta revisión no valora si la hubo.',
  'client.household.calculation.night.inside':
    'Con quien vive en la casa, la decisión de terminar no podrá llevarse a cabo entre las 17:00 y las 08:00, salvo falta muy grave a los deberes de lealtad y confianza; la revisión lo mira por la hora a la que te lo comunicaron.',
  'client.household.calculation.severance.figure':
    'Indemnización: 12 días de salario por año de servicio. Son {days} a {daily} al día: {amount}.',
  'client.household.calculation.severance.capped':
    'La indemnización tiene un tope de {months} mensualidades: queda en {amount}.',
  'client.household.calculation.severance.not_made_available':
    'No se puso a tu disposición a la vez que te comunicaron la extinción: se te debe entera.',
  'client.household.calculation.severance.shortfall':
    'Se puso a tu disposición {offered}: faltan {difference}.',
  'client.household.calculation.severance.offered_unknown':
    'No consta qué importe se puso a tu disposición.',
  'client.household.calculation.severance.salary_unknown':
    'Sin tu salario en dinero no se puede calcular la indemnización.',
  'client.household.calculation.severance.prorated_note':
    'Esta lectura cuenta como un día cada mes empezado. La norma no dice cómo contar un año incompleto: solo cuenta la lectura con los {years} años completos, y esta es lo más que podría salir.',
  'client.household.calculation.notice.days':
    'Preaviso: {required} días naturales, contados desde el día siguiente al aviso. Se dieron {given} y faltan {missing}.',
  'client.household.calculation.notice.salary_unknown':
    'Sin tu salario en dinero no se puede valorar en euros lo que falta de preaviso.',
  'client.household.calculation.notice.substitute':
    'Los {missing} días que faltan se pueden sustituir por su salario: a {daily} al día, {amount}.',
  'client.household.calculation.notice.substitute_paid': 'Se te pagaron {paid}: cubren esos días.',
  'client.household.calculation.notice.substitute_short':
    'Se te pagaron {paid}: faltan {difference}.',
  'client.household.calculation.notice.leave':
    'Durante el preaviso, la norma da a quien trabaja a tiempo completo {hours} horas semanales retribuidas para buscar trabajo.',
  'client.household.calculation.unemployment.situation':
    'El desistimiento del artículo 11.2 es una situación legal de desempleo: podrías pedir la prestación por desempleo.',
  'client.household.calculation.unemployment.general_rules':
    'Desde el 1 de octubre de 2022 el desempleo se cotiza y se aplican las reglas generales: 360 días cotizados en los últimos seis años (art. 266.b LGSS) que no hayas usado ya para otra prestación (art. 269.2 LGSS), y una prestación del 70 % y después del 60 %. Esta revisión no calcula la prestación.',

  // The household domestic worker review, built only with PUBLIC_HOUSEHOLD=1.
  'household.title': 'Empleada de hogar: revisa tu sueldo y el desistimiento frente a la ley',
  'household.description':
    'Comprueba el sueldo, la jornada, las vacaciones, el finiquito y el desistimiento de tu trabajo en una casa frente a la ley, cifra a cifra y con su artículo.',
  'household.h1': 'Comprueba si lo que te pagan en casa es justo',
  'household.lead':
    'Trabajas en una casa: pon tu sueldo, tu jornada y, si ha terminado, cómo terminó, al lado de lo que marca la ley. Cada cifra lleva el artículo del que sale.',
  'household.beta': 'Beta',
  'household.beta_note':
    'Sección en pruebas. Lo que hayas pactado con la familia puede mejorar lo que dice la ley: lo que depende de ello se dice siempre.',
  'household.no_js':
    'La revisión necesita JavaScript. Se hace entera en tu dispositivo y lo que escribes no sale de él.',
  'household.reviewed': 'Revisado el {fecha}',
  'household.app_name': 'Revisión de empleada de hogar',
  'household.form_aria': 'Revisión de empleada de hogar',
  'household.tab.trabajo': 'Trabajo',
  'household.tab.fechas': 'Fechas',
  'household.tab.desistimiento': 'El final',
  'household.tab.sueldo': 'Sueldo',
  'household.tab.jornada': 'Jornada',
  'household.tab.resultado': 'Resultado',
  'household.answer.yes': 'Sí',
  'household.answer.no': 'No',
  'household.answer.unknown': 'No lo sé',

  'household.work.question': '¿Cómo trabajas en la casa?',
  'household.work.legend': 'Tipo de trabajo',
  'household.work.hourly_external': 'Por horas, sin vivir en la casa',
  'household.work.monthly': 'Por meses, sin vivir en la casa',
  'household.work.live_in': 'Viviendo en la casa',

  'household.dates.question': '¿Sigues trabajando?',
  'household.dates.start': 'Fecha de inicio',
  'household.dates.ending': 'Tu situación',
  'household.dates.working': 'Sí, sigo trabajando',
  'household.dates.desistimiento': 'No: la familia ha desistido',
  'household.dates.et_cause': 'No: terminó por otra causa',
  'household.dates.unknown': 'No: no sé cómo terminó',
  'household.dates.end': 'Último día de trabajo',

  'household.pay.question': '¿Cuánto cobras?',
  'household.pay.monthly': 'Sueldo al mes en dinero (bruto)',
  'household.pay.monthly_hint':
    'Antes de descuentos. Si las pagas extra van repartidas, cuéntalas.',
  'household.pay.in_kind': 'Pago en especie al mes',
  'household.pay.in_kind_hint': 'Comida y alojamiento. En blanco si no hay.',
  'household.pay.hourly': 'Precio por hora (bruto)',
  'household.pay.hourly_hint': 'Antes de descuentos, con vacaciones y pagas extra dentro.',
  'household.pay.average': 'Lo que cobras al mes de media (bruto)',
  'household.pay.average_hint': 'Para la indemnización y el preaviso. En blanco si no lo sabes.',

  'household.extras.question': '¿Y las pagas extra?',
  'household.extras.count': 'Pagas extra al año',
  'household.extras.count_hint': '0 si no tienes. La norma prevé dos.',
  'household.extras.prorated': '¿Van repartidas en las doce mensualidades?',
  'household.extras.amount': 'Importe de cada paga extra (bruto)',
  'household.extras.amount_hint': 'En blanco si no lo sabes.',
  'household.extras.when_question': '¿Y cuándo las cobras?',
  'household.time.rest_question': '¿Y los descansos?',
  'household.severance.writing_question': '¿Cómo te lo comunicaron?',
  'household.notice.night_question': '¿A qué hora te avisaron?',
  'household.extras.accrual': '¿Cuándo se pagan?',
  'household.extras.semiannual': 'Al final de cada semestre',
  'household.extras.annual': 'Una vez al año',

  'household.time.question': '¿Cuántas horas trabajas?',
  'household.time.hours': 'Horas de trabajo a la semana',
  'household.time.hours_hint':
    'Trabajo efectivo; la presencia se cuenta aparte. En blanco si no lo sabes.',
  'household.time.rest': 'Descanso más corto entre jornadas (horas)',
  'household.time.rest_made_up': 'Si descansas menos de 12 horas, ¿se compensa en cuatro semanas?',
  'household.time.weekly_rest': 'Descanso semanal seguido (horas)',
  'household.time.weekly_rest_hint': 'Por ejemplo, 36.',

  'household.holidays.question': '¿Y las vacaciones?',
  'household.holidays.days': 'Días naturales de vacaciones al año',
  'household.holidays.stretch': 'Vacaciones seguidas más largas (días)',
  'household.holidays.taken': 'Días ya disfrutados este año',
  'household.holidays.taken_hint': 'Para el finiquito. En blanco si no lo sabes.',

  'household.desistimiento.question': '¿Qué decía el desistimiento?',
  'household.desistimiento.cause': '¿Qué causa indicaba?',
  'household.desistimiento.income_drop_or_expense_rise': 'Menos ingresos o más gastos sobrevenidos',
  'household.desistimiento.family_needs_change': 'Un cambio sustancial de sus necesidades',
  'household.desistimiento.loss_of_trust': 'Pérdida de confianza',
  'household.desistimiento.other': 'Otra causa',
  'household.desistimiento.none': 'Ninguna causa',
  'household.desistimiento.writing': '¿Te lo comunicaron por escrito?',

  'household.severance.question': '¿Y la indemnización?',
  'household.severance.available': '¿Pusieron la indemnización a tu disposición al avisarte?',
  'household.severance.offered': 'Importe a tu disposición (bruto)',

  'household.notice.question': '¿Con cuánta antelación te avisaron?',
  'household.notice.days': 'Días de antelación',
  'household.notice.days_hint':
    'Los días naturales entre el aviso y tu último día. En blanco si no lo sabes.',
  'household.notice.substitute': 'Pago por los días de preaviso que faltaron',
  'household.notice.substitute_hint':
    'Si te pagaron esos días en lugar de avisarte. En blanco si no te pagaron nada.',
  'household.notice.night': '¿Fue entre las 17:00 y las 08:00?',
  'household.notice.serious': '¿Alegaron una falta muy grave a la lealtad y la confianza?',

  'household.result.title': 'Resultado',
  'household.result.summary': 'Resumen',
  'household.result.out_of_scope': 'Fuera de esta revisión',
  'household.result.rules': 'Norma',
  'household.result.how': 'Cómo se calcula',
  'household.result.sources': 'Fuentes',
  'household.result.final_pay': 'Lo que queda por cobrar al terminar',
  'household.result.unemployment': 'Paro',
  'household.result.unemployment_text':
    'Desde el Real Decreto-ley 16/2022, las personas empleadas de hogar pueden cobrar el paro si reúnen los requisitos generales, entre ellos 360 días cotizados por desempleo en los seis años anteriores (arts. 266 y 269.1 de la Ley General de la Seguridad Social). El desistimiento del artículo 11.2 es una situación legal de desempleo (art. 267.1.a) 8.º) y el desempleo se cotiza desde el 1 de octubre de 2022 (disposición transitoria 2.ª del Real Decreto-ley 16/2022).',
  'household.result.unemployment_link': 'Estima cuánto cobrarías de paro',
  'household.result.unchecked': 'Lo que esta revisión no mira',
  'household.result.restart': 'Empezar de nuevo',

  'household.guide.title': 'Qué marca la ley en el trabajo del hogar',
  'household.guide.lead':
    'Lo esencial de lo que la revisión comprueba, con la norma de la que sale cada cosa. Es información sobre la ley, no asesoramiento.',
  'household.guide.sources': 'Fuentes',
  'household.guide.who': 'Quién está detrás',
  'household.guide.norms': 'Normas',
  'household.guide.faq': 'Preguntas frecuentes',
  'household.guide.pay.title': 'Tu sueldo',
  'household.guide.pay.p1':
    'El salario mínimo interprofesional se aplica también en el servicio del hogar: con jornada completa, de 40 horas a la semana, es la cifra mensual del real decreto del año en 14 pagas y, con menos horas, se aplica en proporción (art. 8.1 del Real Decreto 1620/2011).',
  'household.guide.pay.p2':
    'Quien trabaja por horas y no vive en la casa cobra como mínimo el precio por hora del real decreto del SMI del año. Ese precio incluye todos los conceptos, también las vacaciones y las pagas extra, y se paga en dinero (art. 8.5).',
  'household.guide.pay.p3':
    'El alojamiento y la manutención pueden pactarse como pago en especie, hasta el 30 % del salario total, y no cuentan para llegar al mínimo en dinero (art. 8.2). Hay dos pagas extra al año, una al final de cada semestre salvo pacto en otro sentido (art. 8.4).',
  'household.guide.time.title': 'Jornada, descansos y vacaciones',
  'household.guide.time.p1':
    'La jornada ordinaria es de 40 horas de trabajo efectivo a la semana, y el tiempo de presencia se cuenta aparte (art. 9.1); lo que pase de ahí serían horas extraordinarias (art. 9.3). Entre una jornada y la siguiente hay 12 horas de descanso, que a quien vive en la casa pueden quedar en 10 si la diferencia se compensa en cuatro semanas. El descanso semanal es de 36 horas seguidas.',
  'household.guide.time.p2':
    'Las vacaciones son de 30 días naturales al año, y al menos un periodo ha de ser de 15 días seguidos (art. 9). Si no se cumple, la revisión lo señala como aviso: un aviso no suma importes.',
  'household.guide.desistimiento.title': 'El desistimiento de la familia',
  'household.guide.desistimiento.p1':
    'La familia puede terminar la relación por desistimiento solo por una de tres causas, y siempre que estén justificadas: menos ingresos o más gastos de la familia por una circunstancia sobrevenida, un cambio sustancial de sus necesidades o una pérdida de confianza razonable y proporcionada. Se comunica por escrito, con la causa (art. 11.2).',
  'household.guide.desistimiento.p2':
    'La indemnización es de 12 días de salario por año de servicio, con un tope de seis mensualidades, y se pone a disposición simultáneamente a la comunicación de la extinción (art. 11.2). El preaviso es de 20 días si llevas más de un año y de 7 si no, contados desde que te comunican la decisión, y se puede sustituir por el salario de esos días. Son días naturales: en los plazos civiles no se excluyen los inhábiles (art. 5 del Código Civil). Quien trabaja a tiempo completo tiene seis horas semanales pagadas para buscar trabajo durante el preaviso.',
  'household.guide.desistimiento.p3':
    'La revisión mira la categoría de la causa que se indica, no si es cierta: eso lo decide un juzgado.',
  'household.guide.dismissal.title': 'Sin escrito o sin indemnización',
  'household.guide.dismissal.p1':
    'Si falta el escrito, o la indemnización no se puso a disposición con el aviso, la norma presume que no es un desistimiento sino un despido, y podrían aplicarse sus reglas (art. 11.3). Un preaviso más corto o un error disculpable en el importe no llevan a esa presunción: se debe la diferencia.',
  'household.guide.dismissal.p2':
    'Con quien vive en la casa, la decisión de terminar no podrá llevarse a cabo entre las 17:00 y las 08:00 del día siguiente, salvo que se deba a una falta muy grave a los deberes de lealtad y confianza (art. 11.4). La revisión lo mira por la hora a la que te lo comunicaron.',
  'household.guide.incomplete.title': 'Cómo se cuenta un año incompleto',
  'household.guide.incomplete.p1':
    'El texto no dice cómo contar un año incompleto en la indemnización. La revisión cuenta los años completos; la lectura que cuenta un día por cada mes empezado se da solo como «y hasta». El salario diario es el salario anual entre 365.',
  'household.guide.unemployment.title': 'Paro',
  'household.guide.unemployment.p1':
    'Desde el Real Decreto-ley 16/2022, las personas empleadas de hogar pueden cobrar el paro si reúnen los requisitos generales, entre ellos 360 días cotizados por desempleo en los seis años anteriores (arts. 266 y 269.1 de la Ley General de la Seguridad Social). El desistimiento es una situación legal de desempleo (art. 267.1.a) 8.º) y el desempleo se cotiza desde el 1 de octubre de 2022 (disposición transitoria 2.ª del Real Decreto-ley 16/2022).',
  'household.guide.unemployment.link': 'Estima cuánto cobrarías de paro',
  'household.guide.unchecked.title': 'Lo que la revisión no mira',
  'household.guide.unchecked.p1':
    'Si la causa del desistimiento es cierta, lo que hayas pactado con la familia, las cotizaciones y lo que cobras en neto. Tampoco pide nombre, DNI, domicilio, nacionalidad, situación administrativa, salud ni embarazo: no los necesita.',

  'household.faq.minimum_wage': '¿Cuál es el sueldo mínimo en el servicio del hogar?',
  'household.faq.minimum_wage_answer':
    'En {anio}, el SMI es de {mensual} al mes en 14 pagas ({anual} al año) para 40 horas a la semana, y en proporción con menos horas (art. 8.1 del Real Decreto 1620/2011). Quien trabaja por horas y no vive en la casa cobra al menos {hora} la hora, con vacaciones y pagas extra incluidas (art. 8.5).',
  'household.faq.minimum_wage_not_published':
    'El real decreto del SMI de {anio} aún no está en el BOE. Como referencia, el de {referencia} fija {mensual} al mes en 14 pagas ({anual} al año) para 40 horas a la semana, y {hora} la hora para quien trabaja por horas y no vive en la casa (arts. 8.1 y 8.5 del Real Decreto 1620/2011). Para {anio} no se calcula ninguna diferencia.',
  'household.faq.hourly': '¿Qué incluye el precio por hora?',
  'household.faq.hourly_answer':
    'Quien trabaja por horas y no vive en la casa cobra un precio que incluye todos los conceptos: también las vacaciones y las pagas extra, y se paga en dinero. Por eso la revisión no calcula esas partidas aparte en su finiquito (art. 8.5 del Real Decreto 1620/2011). Por encima del mínimo, lo que hayáis pactado decide.',
  'household.faq.desistimiento': '¿Qué es el desistimiento y qué tiene que cumplir?',
  'household.faq.desistimiento_answer':
    'Es la forma en que la familia termina la relación sin despido. Ha de tener una de tres causas, y estar justificada: menos ingresos o más gastos de la familia por una circunstancia sobrevenida, cambio sustancial de sus necesidades o pérdida de confianza razonable y proporcionada. Se comunica por escrito con la causa, y la indemnización se pone a disposición con el aviso: 12 días de salario por año de servicio, con un tope de seis mensualidades. El preaviso es de 20 días si llevas más de un año y de 7 si no (art. 11.2 del Real Decreto 1620/2011); son días naturales, porque en los plazos civiles no se excluyen los inhábiles (art. 5 del Código Civil).',
  'household.faq.dismissal': '¿Cuándo se presume que es un despido?',
  'household.faq.dismissal_answer':
    'Cuando no hay escrito o cuando la indemnización no se puso a disposición con el aviso, la norma presume que es un despido y podrían aplicarse sus reglas (art. 11.3 del Real Decreto 1620/2011). Un preaviso corto o un error disculpable en el importe no lo provocan: se debe la diferencia.',
  'household.faq.night': '¿Pueden avisarme de noche si vivo en la casa?',
  'household.faq.night_answer':
    'La norma dice que, con quien vive en la casa, la decisión de terminar no podrá llevarse a cabo entre las 17:00 y las 08:00 del día siguiente, salvo falta muy grave a los deberes de lealtad y confianza (art. 11.4 del Real Decreto 1620/2011). La revisión lo mira por la hora a la que te lo comunicaron; a las 17:00 o a las 08:00 en punto el texto no aclara si esa hora cuenta, y no la cuenta como infracción.',
  'household.faq.incomplete': '¿Cómo cuenta la revisión un año incompleto?',
  'household.faq.incomplete_answer':
    'El texto no lo dice. La revisión cuenta los años completos de servicio y da la lectura que cuenta un día por cada mes empezado solo como «y hasta», sin sumarla a lo que cuenta. El salario diario es el anual entre 365.',
  'household.faq.working_time': '¿Qué pasa si trabajo más de 40 horas?',
  'household.faq.working_time_answer':
    'La revisión lo señala como aviso. La jornada ordinaria es de 40 horas a la semana de trabajo efectivo, con el tiempo de presencia aparte (art. 9.1 del Real Decreto 1620/2011), y lo que pase de ahí serían horas extraordinarias (art. 9.3). Entre jornadas hay 12 horas de descanso (10 para quien vive en la casa, si se compensa en cuatro semanas) y el descanso semanal es de 36 horas seguidas (arts. 9.4 y 9.5). Un aviso no suma importes.',
  'household.faq.unemployment': '¿Tengo paro como empleada de hogar?',
  'household.faq.unemployment_answer':
    'Desde el Real Decreto-ley 16/2022, las personas empleadas de hogar pueden cobrar el paro si reúnen los requisitos generales, entre ellos 360 días cotizados por desempleo en los seis años anteriores (arts. 266 y 269.1 de la Ley General de la Seguridad Social). El desistimiento es situación legal de desempleo (art. 267.1.a) 8.º) y el desempleo se cotiza desde el 1 de octubre de 2022 (disposición transitoria 2.ª del Real Decreto-ley 16/2022). Con la estimación del paro puedes ver cuánto y durante cuánto tiempo.',
  'household.faq.data': '¿Qué datos pide la revisión?',
  'household.faq.data_answer':
    'Solo fechas, cifras y respuestas sobre el trabajo y su final. No pide nombre, DNI, domicilio, nacionalidad, situación administrativa, salud ni embarazo. Todo se calcula en tu dispositivo y lo que escribes no sale de él.',

  'client.household.about': 'unos {importe}',
  'client.household.status.below_minimum': 'Por debajo de lo que marca la norma',
  'client.household.status.over_legal_limit': 'Por encima del límite de la norma',
  'client.household.status.missing_requirement': 'Falta un requisito de la norma',
  'client.household.status.warning': 'Aviso: conviene revisarlo',
  'client.household.status.dismissal_regime_presumed': 'La norma presume que es un despido',
  'client.household.status.within_limit': 'Dentro de lo que marca la norma',
  'client.household.status.review_it': 'Conviene revisarlo',
  'client.household.status.information': 'Información',
  'client.household.status.not_entered': 'No has indicado este dato',
  'client.household.status.not_published': 'El dato de ese año aún no está publicado',
  'client.household.status.not_reviewed_in_this_version': 'No se revisa en esta versión',
  'client.household.status.depends': 'Depende de cómo se cuente',
  'client.household.status.owed': 'Podrían faltarte {importe}',
  'client.household.status.owed_up_to': 'Podrían faltarte {importe}, y hasta {maximo}',
  'client.household.status.depends_up_to':
    'Depende de cómo se cuente: en una lectura podrían faltarte hasta {maximo}',
  'client.household.reading_status.below_minimum': 'por debajo de lo que marca la norma',
  'client.household.reading_status.over_legal_limit': 'por encima del límite de la norma',
  'client.household.reading_status.missing_requirement': 'falta un requisito de la norma',
  'client.household.reading_status.warning': 'aviso',
  'client.household.reading_status.dismissal_regime_presumed': 'la norma presume que es un despido',
  'client.household.reading_status.within_limit': 'dentro de lo que marca la norma',
  'client.household.reading_status.review_it': 'conviene revisarlo',
  'client.household.reading_status.information': 'información',
  'client.household.reading_status.not_entered': 'sin dato',
  'client.household.reading_status.not_published': 'dato aún sin publicar',
  'client.household.reading_status.not_reviewed_in_this_version': 'no se revisa en esta versión',
  'client.household.reading_status.owed': 'podrían faltarte {importe}',
  'client.household.reading_line': '{cuando}: {resultado}',
  'client.household.question.incomplete_year':
    'La norma no dice cómo contar un año incompleto. Según la lectura:',
  'client.household.question.notice_service_date':
    'La norma no dice hasta qué día se cuenta el tiempo de servicio para el preaviso. Según la lectura:',
  'client.household.question.in_kind_base':
    'La norma no dice si el 30 % se mide sobre el mes o sobre el año. Según la lectura:',
  'client.household.reading.complete_years_only': 'contando solo los años completos',
  'client.household.reading.prorated_by_months': 'contando un día por cada mes empezado',
  'client.household.reading.measured_at_notice': 'contando el servicio hasta el aviso',
  'client.household.reading.measured_at_termination': 'contando el servicio hasta el último día',
  'client.household.reading.month_without_extra_pays': 'midiendo el mes sin pagas extra',
  'client.household.reading.year_with_extra_pays': 'midiendo el año con las pagas extra',
  'client.household.note.your_answer':
    'Este punto se apoya en lo que has contestado, no en un documento.',
  'client.household.note.agreement':
    'Lo que hayas pactado con la familia puede fijar otra cosa; la revisión no lo conoce.',
  'client.household.norm.in_force': 'en vigor',
  'client.household.norm.pending_validation': 'pendiente de convalidación',
  'client.household.norm.repealed': 'derogada el {fecha}',
  'client.household.source.since': 'con efectos desde el {desde}',
  'client.household.source.between': 'con efectos del {desde} al {hasta}',

  'client.household.finding.smi_monthly': 'Sueldo frente al SMI',
  'client.household.finding.smi_hourly_external': 'Precio por hora frente al mínimo',
  'client.household.finding.smi_in_kind_cap': 'Pago en especie',
  'client.household.finding.extra_pays': 'Pagas extra',
  'client.household.finding.weekly_40': 'Horas a la semana',
  'client.household.finding.rest_between_shifts': 'Descanso entre jornadas',
  'client.household.finding.weekly_rest_36': 'Descanso semanal',
  'client.household.finding.holidays_30': 'Días de vacaciones',
  'client.household.finding.holidays_stretch_15': 'Vacaciones seguidas',
  'client.household.finding.termination_causes': 'Causa de la terminación',
  'client.household.finding.desistimiento_cause': 'Causa del desistimiento',
  'client.household.finding.desistimiento_written': 'Desistimiento por escrito',
  'client.household.finding.dismissal_presumed': 'Presunción de despido',
  'client.household.finding.live_in_night_notice': 'Aviso entre las 17:00 y las 08:00',
  'client.household.finding.desistimiento_severance': 'Indemnización del desistimiento',
  'client.household.finding.desistimiento_notice': 'Preaviso',
  'client.household.finding.desistimiento_leave': 'Horas para buscar trabajo',
  'client.household.finding.unemployment_situation': 'Paro',
  'client.household.finding.transitional_application': 'Aplicación de la reforma',
  'client.household.finding.et_termination_causes': 'Causa de la terminación',
  'client.household.finding.notice_calendar_days': 'Cómo se cuentan los días',
  'client.household.finding.unemployment_contribution': 'Cotización por desempleo',
  'client.household.finding.unemployment_general': 'Paro',

  'client.household.headline.found': 'Hay puntos que quedan por debajo de lo que marca la norma.',
  'client.household.headline.to_review': 'Hay puntos que conviene revisar.',
  'client.household.headline.nothing_found':
    'Con lo que has contestado, no se ve nada por debajo de lo que marca la norma.',
  'client.household.headline.nothing_entered':
    'Con lo que has contestado no hay nada que comparar: faltan datos.',
  'client.household.total.counted': 'Lo que cuenta en todas las lecturas: {importe}.',
  'client.household.total.up_to':
    'Según cómo se cuenten los puntos que la norma deja abiertos, podría llegar a {maximo}.',
  'client.household.total.only_up_to':
    'En la lectura que cuenta no falta nada; en otra, podrían faltar hasta {maximo}.',
  'client.household.total.none': 'No hay importes que sumar.',
  'client.household.total.found_without_amount':
    'Lo que se ha encontrado no lleva un importe que sumar: cada punto explica por qué.',
  'client.household.warning.working_time':
    'Tu jornada pasa de la ordinaria o tus descansos quedan por debajo de lo que marca la norma. Es un aviso: no suma importes.',
  'client.household.warning.holidays':
    'Tus vacaciones quedan por debajo de lo que marca la norma. Es un aviso: no suma importes.',
  'client.household.warning.presumed':
    'Sin escrito o sin la indemnización a tu disposición, la norma presume que es un despido (art. 11.3).',
  'client.household.warning.night_notice':
    'Con quien vive en la casa, la decisión de terminar no podrá llevarse a cabo entre las 17:00 y las 08:00, salvo falta muy grave a los deberes de lealtad y confianza (art. 11.4). La revisión lo mira por la hora a la que te lo comunicaron.',
  'client.household.ending_unknown':
    'Como no sabes cómo terminó, no se ha revisado el final: ni el desistimiento, ni la indemnización, ni el preaviso, ni lo que queda por cobrar.',
  'client.household.result.lead':
    'Cada punto lleva el artículo del que sale. Es información sobre la ley, no asesoramiento.',
  'client.household.result.lead_out_of_scope':
    'Esta relación queda fuera de la revisión. Es información sobre la ley, no asesoramiento.',
  'client.household.out_of_scope.status': 'Fuera de esta revisión',
  'client.household.out_of_scope.before_reform':
    'La relación terminó antes del 9 de septiembre de 2022, cuando entró en vigor la reforma del Real Decreto-ley 16/2022 (disposición final 7.ª; disposición transitoria 1.ª). Antes se aplicaba otro régimen, que esta revisión no cubre.',
  'client.household.final_pay.pending_salary': 'Salario pendiente',
  'client.household.final_pay.holiday_pay': 'Vacaciones sin disfrutar',
  'client.household.final_pay.extra_pay': 'Pagas extra',
  'client.household.final_pay.severance': 'Indemnización',
  'client.household.final_pay.employer_notice': 'Preaviso',
  'client.household.final_pay.notice_deduction': 'Descuento por preaviso',
  'client.household.final_pay.no_figure': 'No se puede calcular con lo que has contestado',
  'client.household.final_pay.up_to': '{importe}, y hasta {maximo}',
  'client.household.final_pay.extra_missing':
    'No se han calculado las pagas extra porque no has indicado su importe.',
  'client.household.final_pay.hourly_included':
    'Con el precio por hora, las vacaciones y las pagas extra ya van incluidas (art. 8.5): no se calculan aparte.',
  'client.household.final_pay.not_entered':
    'Sin el sueldo mensual no se puede calcular lo que queda por cobrar.',
  'client.household.unchecked.cause_truth':
    'Si la causa que se indica en el desistimiento es cierta.',
  'client.household.unchecked.in_kind_in_severance':
    'Si el pago en especie cuenta en la indemnización: la revisión solo cuenta el dinero.',
  'client.household.unchecked.contributions': 'Las cotizaciones a la Seguridad Social.',
  'client.household.unchecked.net_pay': 'Lo que cobras en neto, tras los descuentos.',

  'client.household.error.invalid_date': 'Escribe una fecha válida.',
  'client.household.error.too_far_ahead': 'Esa fecha queda demasiado lejos.',
  'client.household.error.before_start': 'La fecha es anterior a la de inicio.',
  'client.household.error.after_end': 'La fecha es posterior al último día.',
  'client.household.error.amount_range':
    'Escribe un importe razonable y sin signo menos; el sueldo, mayor que cero.',
  'client.household.error.hours_range': 'Escribe un número de horas razonable.',
  'client.household.error.count_range': 'Escribe un número entero razonable.',
  'client.household.error.invalid_time': 'Escribe una hora válida.',
  'client.household.error.year_range': 'Ese año no es válido.',
  'client.household.error.regime_mismatch': 'Quien vive en la casa no cobra por horas.',
  'client.household.error.notice_before_start':
    'Ese preaviso empieza antes de que empezaras a trabajar.',
  'client.household.error.missing_value': 'Falta este dato.',
  'client.household.error.missing_choice': 'Elige una respuesta.',
  'client.household.error.invalid_amount': 'Escribe una cifra, por ejemplo 1.250,00.',
  'client.household.error.invalid_number': 'Escribe un número entero.',
  'privacy.household.summary':
    'La revisión de empleada de hogar funciona igual: lo que escribes se calcula en tu navegador y no se guarda. No te pide nombre, DNI, domicilio, nacionalidad, situación administrativa, salud ni embarazo.',
  'privacy.household.data_review': 'Lo que escribes en la revisión de empleada de hogar',
  'privacy.household.data_review_where':
    'Solo en tu navegador, mientras la página está abierta. Tus fechas, tu sueldo, tu jornada, tus vacaciones y tus respuestas sobre cómo terminó la relación se calculan en tu dispositivo y no se envían a ningún servidor ni se guardan. Al cerrar o recargar la página, desaparecen.',
  'privacy.household.tracked_sheets': 'En la revisión de empleada de hogar',
  'privacy.household.tracked_sheets_what':
    'Lo mismo que en el finiquito con cada una de sus hojas, del trabajo al resultado: que abres cada una, cuánto tardas en tramos y si vuelves atrás. Si un dato no se acepta, el nombre del campo, por ejemplo «fecha de inicio», nunca lo que escribiste. Qué pregunta frecuente abres y de qué punto del resultado abres el cálculo, por su tipo.',
  'privacy.household.tracked_scope': 'Si tu caso queda fuera de la revisión de empleada de hogar',
  'privacy.household.tracked_scope_what':
    'El motivo, de una lista cerrada: que la relación terminó antes de la reforma de septiembre de 2022.',
  'privacy.household.tracked_review': 'Al revisar la empleada de hogar',
  'privacy.household.tracked_review_what':
    'Cómo trabajas (por horas, por meses o viviendo en la casa), el tramo del año del sueldo (2022 o 2023, 2024 o 2025, o desde 2026), cómo va la relación (sigue, desistimiento, otra causa o no lo sabes), si hay pagas extra y cómo (ninguna, repartidas o aparte), si hay pago en especie, y si el desistimiento fue por escrito y con la indemnización a disposición (sí, no o no lo sabes). De cada grupo de puntos (sueldo, jornada, vacaciones, terminación, indemnización y preaviso), el estado que más pesa. Cuánto falta, en un tramo, nunca el importe; cuántas veces revisas y cuánto tardas, en tramos.',
  'legal_notice.household': 'La revisión de empleada de hogar',
  'legal_notice.household.does':
    'Compara el sueldo, la jornada, las vacaciones, el finiquito y el desistimiento de una persona empleada de hogar con lo que fijan el Real Decreto 1620/2011, el Real Decreto-ley 16/2022 y los reales decretos del SMI de cada año, cifra a cifra y con el artículo del que sale cada una.',
  'legal_notice.household.does_not':
    'No valora si la causa de un desistimiento es cierta, ni lo que hayas pactado con la familia, ni las cotizaciones, ni lo que cobras en neto. No pide nombre, DNI, domicilio, nacionalidad, situación administrativa, salud ni embarazo. Informa sobre la ley y no es asesoramiento jurídico.',
  'legal_notice.household.beta':
    'Es una sección en pruebas: puede tener errores mientras se revisa con casos reales. Si ves un punto que no cuadra con la ley, puedes escribir a',
  'insurance.title': 'Fechas de tu seguro: renovación y desistimiento',
  'insurance.description':
    'Con las fechas de tu seguro de hogar o de coche: último día para decir que no lo renuevas, si el aviso de cambios llegó a tiempo y plazo para desistir.',
  'insurance.h1': 'Las fechas de tu seguro de hogar o de coche',
  'insurance.lead':
    'Hasta cuándo puedes comunicar que no renuevas tu póliza, si el aviso de cambios llegó con la antelación que pide la ley y, si la contrataste a distancia, hasta cuándo puedes desistir. Solo fechas: no valora el precio ni las coberturas.',
  'insurance.beta': 'Beta',
  'insurance.beta_note':
    'Sección en pruebas. Las fechas salen de lo que escribes y de la ley; lo que diga tu póliza también cuenta.',
  'insurance.no_js':
    'La revisión necesita JavaScript. Se hace entera en tu dispositivo y lo que escribes no sale de él.',
  'insurance.reviewed': 'Revisado el {fecha}',
  'insurance.form_aria': 'Revisión de las fechas de tu seguro',
  'insurance.tab.poliza': 'Póliza',
  'insurance.tab.contratacion': 'Contratación',
  'insurance.tab.renovacion': 'Renovación',
  'insurance.tab.resultado': 'Resultado',
  'insurance.answer.yes': 'Sí',
  'insurance.answer.no': 'No',
  'insurance.answer.unknown': 'No lo sé',

  'insurance.policy.question': 'Tu póliza',
  'insurance.policy.help': 'Ten a mano la póliza o el último recibo.',
  'insurance.policy.line': '¿Qué seguro es?',
  'insurance.policy.line.home': 'Hogar',
  'insurance.policy.line.car': 'Coche',
  'insurance.policy.line.life': 'Vida',
  'insurance.policy.line.health': 'Salud',
  'insurance.policy.line.funeral': 'Decesos',
  'insurance.policy.line.other': 'Otro',
  'insurance.policy.car_cover': '¿Qué cubre tu seguro de coche?',
  'insurance.policy.car_cover.compulsory_only': 'Solo el seguro obligatorio',
  'insurance.policy.car_cover.with_voluntary':
    'También coberturas voluntarias, como daños propios, lunas o robo',
  'insurance.policy.mortgage': '¿La pide tu hipoteca?',
  'insurance.policy.mortgage_hint':
    'Si tienes una hipoteca sobre esta vivienda y el préstamo te pide asegurarla.',
  'insurance.policy.renews': '¿Se renueva sola cada año?',
  'insurance.policy.renews_hint': 'Lo pone la póliza, en su duración o en su prórroga.',
  'insurance.policy.expires': 'Día en que vence según tu póliza',
  'insurance.policy.expires_hint':
    'Escribe el día que figura en la póliza como vencimiento, tal cual.',

  'insurance.cover.question': 'Más sobre tu póliza',
  'insurance.expiry.question': 'Cuándo vence',
  'insurance.terms.question': 'Las condiciones del contrato',
  'insurance.premiums.question': 'La prima',
  'insurance.changes.question': 'Otros cambios',

  'insurance.contracting.question': 'Cómo la contrataste',
  'insurance.contracting.distance': '¿La contrataste por internet o por teléfono sin ver a nadie?',
  'insurance.contracting.distance_hint':
    'Puede darte 14 días naturales para desistir, según el seguro.',
  'insurance.contracting.concluded': '¿Cuándo la contrataste?',
  'insurance.contracting.concluded_hint': 'No el día en que empezó a cubrirte.',
  'insurance.contracting.received': '¿Has recibido las condiciones del contrato?',
  'insurance.contracting.received_hint':
    'La póliza con sus condiciones, en papel o por correo electrónico.',
  'insurance.contracting.received_on': 'Día en que las recibiste',
  'insurance.contracting.received_on_hint': 'Si no lo sabes, déjalo en blanco.',

  'insurance.renewal.question': 'El aviso de renovación',
  'insurance.renewal.has_notice': '¿Te ha llegado el aviso de renovación de la aseguradora?',
  'insurance.renewal.has_notice_hint':
    'La carta o el correo con la prima o las condiciones del periodo siguiente.',
  'insurance.renewal.received_on': 'Día en que te llegó el aviso',
  'insurance.renewal.previous': 'Prima del periodo que acaba',
  'insurance.renewal.previous_hint':
    'En euros, el total del año, por ejemplo 300,00. Si no la tienes, déjala en blanco.',
  'insurance.renewal.next': 'Prima del periodo siguiente',
  'insurance.renewal.next_hint': 'La que dice el aviso. Si no la dice, déjala en blanco.',
  'insurance.renewal.changes':
    '¿El aviso cambia algo además del precio, como coberturas o franquicias?',

  'insurance.result.title': 'Resultado',
  'insurance.result.out_of_scope': 'Fuera de esta revisión',
  'insurance.result.information': 'Para que lo sepas',
  'insurance.result.unchecked': 'Lo que esta revisión no mira',
  'insurance.result.rules': 'Normas',
  'insurance.result.how': 'Cómo se calcula',
  'insurance.result.channels': 'Dónde informarte gratis',
  'insurance.result.channels_dgsfp':
    'La Dirección General de Seguros y Fondos de Pensiones, que supervisa a las aseguradoras.',
  'insurance.result.channels_service':
    'El Servicio de Reclamaciones de la Dirección General de Seguros y Fondos de Pensiones.',
  'insurance.result.channels_consumer':
    'Las oficinas municipales de información al consumidor (OMIC) y los servicios de consumo de tu comunidad autónoma.',
  'insurance.result.restart': 'Empezar de nuevo',

  'client.insurance.result.lead':
    'Cada fecha, con la cuenta que lleva a ella y la norma en que se apoya. Los días que quedan se cuentan desde hoy.',
  'client.insurance.result.lead_out_of_scope':
    'Esta póliza queda fuera de lo que revisa esta página.',
  'client.insurance.unit.day_one': '{n} día',
  'client.insurance.unit.day_many': '{n} días',

  'client.insurance.item.non_renewal': 'Comunicar que no renuevas',
  'client.insurance.item.change_notice': 'Aviso de cambios antes del vencimiento',
  'client.insurance.item.premium': 'Prima del periodo siguiente',
  'client.insurance.item.distance_withdrawal': 'Desistir de un seguro contratado a distancia',
  'client.insurance.item.distance_withdrawal_compulsory': 'Desistir: seguro obligatorio del coche',
  'client.insurance.item.distance_withdrawal_voluntary':
    'Desistir: coberturas voluntarias del coche',

  'client.insurance.status.open': 'Te quedan {dias} (hasta el {fecha})',
  'client.insurance.status.open_today': 'Hoy es el último día ({fecha})',
  'client.insurance.status.ended': 'El plazo terminó el {fecha}',
  'client.insurance.status.not_started': 'El plazo aún no ha empezado',
  'client.insurance.status.not_applicable': 'No aplica',
  'client.insurance.status.review_it': 'Revísalo',
  'client.insurance.status.not_entered': 'No lo has metido',
  'client.insurance.status.on_time': 'Llegó con al menos dos meses de antelación',
  'client.insurance.status.late': 'Llegó con {days} de antelación: la ley pide al menos dos meses',
  'client.insurance.status.up': 'Tu prima sube un {percent} ({difference})',
  'client.insurance.status.same': 'Tu prima no cambia',
  'client.insurance.status.down': 'Tu prima baja un {percent} ({difference})',
  'client.insurance.status.out_of_scope': 'Esta revisión no cubre esta póliza',

  'client.insurance.calculation.item.not_entered':
    'No has metido este dato, así que no se calcula.',
  'client.insurance.calculation.non_renewal.last_day':
    'Tu póliza vence el {expiry}. La ley pide comunicar por escrito que no la renuevas con al menos un mes de antelación: el último día es el {day}.',
  'client.insurance.calculation.non_renewal.days_left': 'Desde hoy quedan {days}.',
  'client.insurance.calculation.non_renewal.days_left_today': 'Hoy es ese último día.',
  'client.insurance.calculation.non_renewal.ended': 'Ese plazo terminó el {day}.',
  'client.insurance.calculation.non_renewal.arrive_by':
    'Cuenta con que tu escrito tiene que llegar a la aseguradora como tarde el {day}: no está aclarado que baste con enviarlo ese día.',
  'client.insurance.calculation.non_renewal.midnight':
    'Si tu póliza vence a las 00:00 h de ese día, el periodo acaba el día anterior: cuenta un día menos.',
  'client.insurance.calculation.non_renewal.month_end':
    'El mes anterior al vencimiento no tiene ese mismo día, así que se toma su último día. Ninguna norma resuelve este caso al contar hacia atrás: es una interpretación, y por eso se da el día más temprano.',
  'client.insurance.calculation.non_renewal.extension_assumed':
    'Como no sabes si tu póliza se renueva sola, se calcula como si lo hiciera; lo dice tu póliza.',
  'client.insurance.calculation.non_renewal.no_extension':
    'Tu póliza no se renueva sola: termina en su fecha y no hay renovación a la que oponerse.',
  'client.insurance.calculation.change_notice.deadline':
    'La aseguradora tiene que comunicarte cualquier modificación del contrato con dos meses de antelación al vencimiento: como tarde el {day}.',
  'client.insurance.calculation.change_notice.on_time':
    'El aviso te llegó el {received}, {days} antes del vencimiento.',
  'client.insurance.calculation.change_notice.late':
    'El aviso te llegó el {received}, {days} antes del vencimiento: menos de los dos meses que pide la ley.',
  'client.insurance.calculation.change_notice.month_end':
    'Dos meses antes del vencimiento no hay ese mismo día, así que se toma el último día de ese mes. Ninguna norma resuelve este caso al contar hacia atrás: es una interpretación.',
  'client.insurance.calculation.change_notice.any_change':
    'La ley habla de cualquier modificación del contrato. Qué consecuencia tiene un aviso que llega tarde no se dice aquí: no se ha encontrado en una fuente oficial.',
  'client.insurance.calculation.change_notice.premium_only':
    'Si lo único que cambia es la prima, aquí no se afirma si eso cuenta como modificación del contrato a estos efectos.',
  'client.insurance.calculation.premium.up':
    'Pasas de {previous} a {next}: {difference} más, un {percent} más. Es un dato: no dice si el precio es alto o bajo.',
  'client.insurance.calculation.premium.same': 'La prima sigue en {previous}.',
  'client.insurance.calculation.premium.down':
    'Pasas de {previous} a {next}: {difference} menos, un {percent} menos.',
  'client.insurance.calculation.withdrawal.not_distance':
    'No la contrataste a distancia, así que este plazo de 14 días no aplica.',
  'client.insurance.calculation.withdrawal.channel_unknown':
    'Sin saber si la contrataste a distancia no se puede decir si tienes este plazo. Si fue por internet o por teléfono sin ver a nadie, son 14 días naturales.',
  'client.insurance.calculation.withdrawal.before_law':
    'La contrataste antes del 12-10-2007, cuando entró en vigor la ley de servicios financieros a distancia: este plazo no aplica.',
  'client.insurance.calculation.withdrawal.start':
    'Son 14 días naturales, contados desde el {day}, el día en que la contrataste, sin contar ese día.',
  'client.insurance.calculation.withdrawal.start_on_terms':
    'Son 14 días naturales desde que recibes las condiciones del contrato: como llegaron después de contratarla, se cuentan desde el {day}, sin contar ese día.',
  'client.insurance.calculation.withdrawal.receipt_unknown':
    'No has metido el día en que recibiste las condiciones del contrato, así que se cuenta desde el día en que la contrataste; si las recibiste después, el plazo acaba más tarde.',
  'client.insurance.calculation.withdrawal.days_left':
    'Desde hoy quedan {days}, hasta el {day} incluido.',
  'client.insurance.calculation.withdrawal.days_left_today': 'Hoy, {day}, es el último día.',
  'client.insurance.calculation.withdrawal.ended': 'El plazo terminó el {day}.',
  'client.insurance.calculation.withdrawal.not_started':
    'Son 14 días naturales desde que recibes las condiciones del contrato. Como aún no las has recibido, el plazo aún no ha empezado.',
  'client.insurance.calculation.withdrawal.compulsory_excluded':
    'La ley deja fuera del desistimiento los seguros con los que cumples una obligación de asegurarte, como el seguro obligatorio del coche.',
  'client.insurance.calculation.withdrawal.voluntary_unverified':
    'Tu póliza incluye también coberturas voluntarias. No está comprobado en una fuente oficial si se puede desistir solo de ellas, así que no se da una fecha.',
  'client.insurance.calculation.withdrawal.mortgage_unverified':
    'Si tu hipoteca te pide asegurar la vivienda, este seguro podría cumplir una obligación de asegurarte, que la ley deja fuera del desistimiento. La norma de la hipoteca aún no se ha comprobado, así que no se da una fecha.',
  'client.insurance.calculation.information.policy_correction':
    'Si la póliza no coincide con lo que pediste o con lo que acordaste, la ley da un mes desde que te la entregan para pedir a la aseguradora que lo corrija; pasado ese mes, vale lo que dice la póliza.',
  'client.insurance.calculation.information.policy_correction.until':
    'Con tus fechas, ese mes llega hasta el {day}.',
  'client.insurance.calculation.information.policy_correction.no_policy':
    'El mes empieza a contar cuando recibes la póliza.',
  'client.insurance.calculation.information.policy_correction.delivery_unknown':
    'Sin el día en que recibiste la póliza no se puede dar una fecha: el mes se cuenta desde ese día.',
  'client.insurance.calculation.information.questionnaire':
    'Antes de contratar, la ley te pide declarar lo que te pregunta la aseguradora en su cuestionario y que conozcas. Lo que el cuestionario no pregunta no tienes el deber de declararlo.',
  'client.insurance.calculation.information.proportional_rule':
    'Si la suma asegurada es menor que lo que vale lo asegurado, la aseguradora paga el daño en la misma proporción, salvo que la póliza lo excluya.',
  'client.insurance.calculation.information.proportional_rule.example':
    'Por ejemplo, una vivienda que vale {value} asegurada por {insured}: ante un daño de {damage}, la aseguradora paga {paid}.',
  'client.insurance.calculation.information.overinsurance':
    'Si la suma asegurada supera mucho lo que vale lo asegurado, cualquiera de las partes puede pedir que se reduzca, junto con la prima; y en un siniestro se paga el daño que hubo.',
  'client.insurance.calculation.information.out_of_scope.life':
    'Esta revisión es solo para seguros de hogar y de coche; los seguros de vida tienen reglas propias que aquí no se calculan.',
  'client.insurance.calculation.information.out_of_scope.health':
    'Esta revisión es solo para seguros de hogar y de coche; los seguros de salud tienen reglas propias que aquí no se calculan.',
  'client.insurance.calculation.information.out_of_scope.funeral':
    'Esta revisión es solo para seguros de hogar y de coche; los seguros de decesos tienen reglas propias que aquí no se calculan.',
  'client.insurance.calculation.information.out_of_scope.other_line':
    'Esta revisión es solo para seguros de hogar y de coche.',
  'client.insurance.calculation.information.out_of_scope.before_2016':
    'Tu póliza venció antes del 01-01-2016, cuando empezaron los plazos de aviso que se calculan aquí; antes regían otros.',

  'client.insurance.info.policy_correction': 'Si la póliza no coincide con lo acordado',
  'client.insurance.info.questionnaire': 'Lo que declaras al contratar',
  'client.insurance.info.proportional_rule': 'Si aseguras por menos de lo que vale',
  'client.insurance.info.overinsurance': 'Si aseguras por más de lo que vale',
  'client.insurance.info.out_of_scope': 'Por qué no se calcula',

  'client.insurance.unchecked.clause_transparency':
    'Si las cláusulas de tu póliza son claras y válidas',
  'client.insurance.unchecked.premium_price': 'Si el precio de tu seguro es caro o barato',
  'client.insurance.unchecked.insured_value':
    'Si la suma asegurada se ajusta a lo que valen tu casa o tu coche',
  'client.insurance.unchecked.claims': 'Cómo se valora un siniestro',

  'client.insurance.norm.in_force': 'en vigor',
  'client.insurance.norm.pending_validation': 'pendiente de convalidación',
  'client.insurance.norm.repealed': 'derogada el {fecha}',
  'client.insurance.source.since': 'con efectos desde el {desde}',

  'client.insurance.error.missing_value': 'Falta este dato',
  'client.insurance.error.missing_choice': 'Elige una respuesta',
  'client.insurance.error.invalid_date': 'La fecha no es válida',
  'client.insurance.error.invalid_amount': 'No se entiende la cifra: escríbela como 1.234,56',
  'client.insurance.error.too_far_ahead': 'Esa fecha está a más de dos años de hoy',
  'client.insurance.error.in_future': 'Esa fecha aún no ha llegado',
  'client.insurance.error.after_expiry': 'Esa fecha es posterior al vencimiento',
  'client.insurance.error.before_concluded': 'Esa fecha es anterior al día en que la contrataste',
  'client.insurance.error.amount_range': 'Escribe una cifra mayor que 0',
} as const satisfies Record<string, string>;

export type Key = keyof typeof es;
