// The source of truth for every visible UI string. Another language is a copy of this object
// that `satisfies Record<Key, string>`, so a missing key fails the typecheck.
// Keys under `client.` are also used by the browser scripts; the page ships them as JSON.
export const es = {
  'meta.og_image_alt': 'Logo de eslojusto.es: una hoja con una pestaña naranja.',

  'footer.note':
    'eslojusto.es informa sobre tus derechos y no da asesoramiento. Las cifras siguen el Estatuto de los Trabajadores y la guía del CGPJ (v0.6, julio de 2026).',
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
    'eslojusto.es compara lo que te pagan o te cobran con lo que marca la ley, cifra a cifra y con el artículo al lado. Por ahora revisa el finiquito.',
  'home.note':
    'Todo se calcula en tu dispositivo y lo que escribes no sale de él. Sí se mide qué pasos usas, sin cookies y sin identificarte.',
  'home.index': 'Trámites',
  'home.final_pay': 'Finiquito',
  'home.final_pay_text':
    'Tu finiquito frente al mínimo legal, partida por partida (salario del último mes, vacaciones, pagas extra, indemnización y preaviso), y una estimación de tu paro.',
  'home.final_pay_citation': 'Estatuto de los Trabajadores · guía del CGPJ v0.6',
  'home.benefit': 'Paro',
  'home.benefit_text':
    'Cuánto paro cobrarías al mes y durante cuánto tiempo, con las fechas de tu contrato, tu salario y tus hijos o hijas a cargo.',
  'home.benefit_citation': 'Ley General de la Seguridad Social · cuantías del SEPE 2026',
  'home.contract': 'Contrato de trabajo',
  'home.rent': 'Alquiler',
  'home.coming_soon': 'Próximamente',
  'home.coming_soon_aria': '{nombre}, próximamente',
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
  'cause.unfair_dismissal': 'Despido improcedente',
  'cause.unfair_dismissal_hint': 'Reconocido o declarado así.',
  'cause.disciplinary_dismissal': 'Despido disciplinario',
  'cause.disciplinary_dismissal_hint': 'Alegan una falta grave.',

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

  'prorating.question': '¿Tus pagas extra van prorrateadas en la nómina?',
  'prorating.help':
    'Si cada nómina trae una parte de las pagas extra, van prorrateadas. Si las cobras aparte, en junio y en diciembre por ejemplo, no.',
  'salary.question': '¿Cuánto cobras?',
  'salary.help': 'En tu nómina, el bruto es lo que va antes de descuentos.',
  'salary.monthly': 'Salario bruto mensual',
  'salary.monthly_hint_yes':
    'Lo que pone tu nómina cada mes, con la parte de pagas extra incluida. Por ejemplo, 1.850,00.',
  'salary.monthly_hint_no': 'Tu bruto mensual sin las pagas extra. Por ejemplo, 1.850,00.',

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
  'result.benefit_deadline': 'Plazo para pedirlo',
  'result.benefit_deadline_text':
    'Se pide en los 15 días hábiles siguientes al fin del contrato. Si tu finiquito paga vacaciones no disfrutadas, el plazo cuenta desde que terminan esos días (art. 268 LGSS).',
  'result.benefit_work_history':
    'Tu vida laboral muestra cada alta y cada baja y los días cotizados:',
  'result.benefit_work_history_link': 'informe de tu vida laboral (sede de la Seguridad Social)',
  'result.benefit_just_cause':
    'Hay excepciones. Irte por alguno de estos motivos sí es situación legal de desempleo y, si cumples el resto de requisitos, da derecho a paro: un traslado (art. 40 ET), un cambio sustancial de tus condiciones (art. 41.3 ET), un incumplimiento grave de la empresa, como no pagarte o pagarte tarde una y otra vez (art. 50 ET), o la violencia de género o sexual (art. 49.1.m ET). Lo recoge el art. 267.1.a.5.º LGSS. La salida por el art. 50 la suele declarar un juzgado.',
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
  'faq.daily_salary': '¿Cómo se calcula el salario diario?',
  'faq.daily_salary_answer':
    'Es tu salario bruto anual, con las pagas extra, entre 365. Así lo calcula la guía del CGPJ para las indemnizaciones.',
  'faq.fixed_term': '¿Hay indemnización al acabar un contrato temporal?',
  'faq.fixed_term_answer':
    'Sí, 12 días por año, en proporción a los días trabajados (art. 49.1.c ET). Para contratos que empezaron entre 2011 y 2014 son de 8 a 11 días (disposición transitoria 8.ª ET). Los contratos de sustitución y los formativos no tienen indemnización.',
  'faq.deadlines': '¿Qué plazo tengo para pedir lo que falta en mi finiquito?',
  'faq.deadlines_answer':
    'Para cantidades como el salario pendiente, las vacaciones, las pagas extra o la indemnización por fin de contrato temporal, un año (art. 59.1 ET). En un despido (objetivo, improcedente o disciplinario), el plazo para impugnarlo es de 20 días hábiles (art. 59.3 ET), y quien no esté de acuerdo con su indemnización suele plantearlo por esa misma vía. El plazo es corto, y un despacho laboralista, un despacho de graduado social o un sindicato pueden decirte cuál se aplica a tu caso.',
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

  'home.final_pay_text_documents':
    'Tu finiquito frente al mínimo legal, partida por partida (salario del último mes, vacaciones, pagas extra, indemnización y preaviso), y una estimación de tu paro. Escribe los datos o sube una foto de tu finiquito.',
  'home.note_documents':
    'Todo se calcula en tu dispositivo. Lo que escribes no sale de él; si subes un documento, se lee en la Unión Europea y no se guarda. Sí se mide qué pasos usas, sin cookies y sin identificarte.',
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

  'faq.pass': '¿Qué incluye el pase de 4,99 €?',
  'faq.pass_answer':
    'Durante 7 días, y solo en el navegador con el que pagas, puedes rehacer o corregir tu revisión, leer hasta 15 paquetes de documentos y volver a descargar el informe y la carta sin pagar otra vez. No guardamos tu revisión en ningún sitio, así que conviene descargar el informe y la carta en cuanto pagas. El pase vive solo en ese navegador: en otro dispositivo, en una ventana privada o si borras los datos de navegación, se pierde, y «¿Ya has pagado?» solo lo recupera en el navegador con el que pagaste.',
  'faq.documents': '¿Qué pasa con mis documentos?',
  'faq.documents_answer':
    'Si subes tus documentos (la carta de despido, el finiquito, tus nóminas, el certificado de empresa o tu vida laboral), se envían cifrados a un servidor de Amazon Web Services en España, que se los pasa a un modelo de IA (Claude, de Anthropic, a través de Amazon Bedrock) dentro de la Unión Europea. El modelo indica qué es cada página, copia solo los datos que necesita el formulario y no calcula nada. Ni el servidor ni el modelo guardan el documento: se procesa en memoria y se descarta. Antes de subirlo te pedimos tu consentimiento, porque una nómina puede mostrar datos sensibles. Si prefieres no subir nada, puedes escribir los datos y nada sale de tu dispositivo.',

  'legal.updated': 'Actualizado el 6 de octubre de 2026',
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
  'legal_notice.updated': 'Actualizado el 7 de octubre de 2026',
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
  'client.summary.dismissal_deadline':
    'El plazo para impugnar un despido es de 20 días hábiles (art. 59.3 ET).',
  'client.summary.benefit_deadline':
    'El paro se pide en los 15 días hábiles siguientes al fin del contrato. Si tu finiquito paga vacaciones no disfrutadas, el plazo cuenta desde que terminan esos días (art. 268 LGSS).',

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
  'client.range.minimum': 'Mínimo legal',
  'client.range.maximum_deduction': 'Máximo que pueden descontarte',
  'client.range.agreement': 'Depende de tu convenio',
  'client.range.days': 'Depende de los días que has disfrutado',
  'client.range.between': 'entre {minimo} y {maximo}',
  'client.no_figure': 'Sin cifra',
  'client.agreement_may_improve': 'Tu convenio puede mejorar esta cifra (más días, otro devengo).',
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
  'client.unemployment.reason.resignation':
    'Dejar el trabajo por decisión propia no es situación legal de desempleo (art. 267.2.a LGSS).',
  'client.unemployment.reason.fixed_term_end':
    'El fin de un contrato temporal es situación legal de desempleo, salvo que lo terminaras tú (art. 267.1.a.6.º LGSS).',
  'client.unemployment.reason.objective_dismissal':
    'El despido objetivo es situación legal de desempleo (art. 267.1.a.4.º LGSS).',
  'client.unemployment.reason.unfair_dismissal':
    'El despido es situación legal de desempleo (art. 267.1.a.3.º LGSS).',
  'client.unemployment.reason.disciplinary_dismissal':
    'El despido disciplinario también es situación legal de desempleo, aunque no se impugne (arts. 267.1.a.3.º y 268.4 LGSS).',
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
} as const satisfies Record<string, string>;

export type Key = keyof typeof es;
