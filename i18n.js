/* UI strings (EN / ES). Data content (names, notes, quests) carries its own {en, es} fields. */
(function (root) {
  var STR = {
    en: {
      title: 'Bandurrias', lang: 'ES',
      lock_hint: 'Enter the passphrase to open the map', lock_btn: 'Unlock', lock_pass: 'Passphrase', lock_wrong: 'Wrong passphrase', lock_working: 'Unlocking…', days: 'days', lock_show: 'Show', lock_hide: 'Hide', lock_left: '{n} attempts left', lock_locked: 'Too many wrong attempts. Locked on this device. Try again in {t}.',
      bare: 'Bare', existing: 'Existing', prospective: 'Prospective',
      bare_sub: 'Land only', existing_sub: 'What is here today', prospective_sub: 'Today + planned',
      quests: 'Action items', show_quests: 'Show action areas on the map', places: 'Places', locate: 'My location',
      now: 'Now', next: 'Next', later: 'Later', todo: 'To do', doing: 'In progress', done: 'Done',
      pampa: 'Pampa', area: 'Area', ha: 'ha', section: 'Section', notes: 'Notes', no_notes: 'No notes yet.',
      region: 'Region', related_quests: 'Action items here', golf: 'Golf', hole: 'Hole', tee: 'Tee', green: 'Green', total: 'Total',
      planned: 'Planned', on_ground: 'On the ground today', yd: 'yd', m: 'm',
      search: 'Search places…', pampas: 'Pampas', sites: 'Sites', golf_holes: 'Golf holes (9)',
      trails: 'Hiking trails',
      credits: 'River lines: © OpenStreetMap contributors. Property outline from the plano predial (about ±10 m). Elevation: Copernicus DEM + walked GPS surface (about ±5–10 m).',
      close: 'Close', no_results: 'Nothing found.',
      offline_ready: 'Offline ready', offline_saving: 'Saving', offline_none: 'Online only', offline_partial: 'Partly saved',
      gps_denied: 'Location is blocked. Allow it in your browser settings.', gps_outside: 'You are outside the mapped area.', gps_waiting: 'Finding you…',
      gps_off: 'Location off', accuracy: 'accuracy',
      view_close: 'Pampa view', view_property: 'Property view', tilt_auto: 'Auto tilt', tilt_north: 'North up', tilt_tilted: 'Tilted', terrain: 'Terrain', on: 'on', off: 'off', show_terrain: 'Terrain (lines + height tint)', compass: 'North is up. Tap to see the whole map', terrain_legend: 'Height of cleared ground', terrain_note: 'Approximate, about ±5–10 m',
      elevation: 'Elevation', avg_slope: 'Avg slope', range: 'Range', above_avg: 'above the average cleared ground', below_avg: 'below the average cleared ground', about_same: 'About the same height as the average cleared ground'
    },
    es: {
      title: 'Bandurrias', lang: 'EN',
      lock_hint: 'Escribe la frase de acceso para abrir el mapa', lock_btn: 'Desbloquear', lock_pass: 'Frase de acceso', lock_wrong: 'Frase de acceso incorrecta', lock_working: 'Desbloqueando…', days: 'días', lock_show: 'Mostrar', lock_hide: 'Ocultar', lock_left: 'quedan {n} intentos', lock_locked: 'Demasiados intentos fallidos. Bloqueado en este dispositivo. Vuelve a intentar en {t}.',
      bare: 'Base', existing: 'Existente', prospective: 'Proyectado',
      bare_sub: 'Solo el terreno', existing_sub: 'Lo que hay hoy', prospective_sub: 'Hoy + planificado',
      quests: 'Tareas', show_quests: 'Mostrar las zonas de tareas en el mapa', places: 'Lugares', locate: 'Mi ubicación',
      now: 'Ahora', next: 'Siguiente', later: 'Después', todo: 'Pendiente', doing: 'En curso', done: 'Hecho',
      pampa: 'Pampa', area: 'Superficie', ha: 'ha', section: 'Sección', notes: 'Notas', no_notes: 'Aún no hay notas.',
      region: 'Zona', related_quests: 'Tareas aquí', golf: 'Golf', hole: 'Hoyo', tee: 'Salida', green: 'Green', total: 'Total',
      planned: 'Planificado', on_ground: 'Existe hoy', yd: 'yd', m: 'm',
      search: 'Buscar lugares…', pampas: 'Pampas', sites: 'Sitios', golf_holes: 'Hoyos de golf (9)',
      trails: 'Senderos',
      credits: 'Ríos: © colaboradores de OpenStreetMap. Límite del predio según el plano predial (aprox. ±10 m). Elevación: Copernicus DEM + superficie GPS recorrida (aprox. ±5–10 m).',
      close: 'Cerrar', no_results: 'No se encontró nada.',
      offline_ready: 'Offline listo', offline_saving: 'Guardando', offline_none: 'Solo en línea', offline_partial: 'Parcial',
      gps_denied: 'La ubicación está bloqueada. Permítela en los ajustes del navegador.', gps_outside: 'Estás fuera del área del mapa.', gps_waiting: 'Buscando tu ubicación…',
      gps_off: 'Ubicación desactivada', accuracy: 'precisión',
      view_close: 'Vista pampas', view_property: 'Vista predio', tilt_auto: 'Inclinación auto', tilt_north: 'Norte arriba', tilt_tilted: 'Inclinado', terrain: 'Relieve', on: 'activado', off: 'desactivado', show_terrain: 'Relieve (curvas de nivel + color por altura)', compass: 'El norte está arriba. Toca para ver todo el mapa', terrain_legend: 'Altura del terreno despejado', terrain_note: 'Aproximado, unos ±5–10 m',
      elevation: 'Elevación', avg_slope: 'Pendiente media', range: 'Rango', above_avg: 'sobre el promedio del terreno despejado', below_avg: 'bajo el promedio del terreno despejado', about_same: 'Casi a la misma altura que el promedio del terreno despejado'
    }
  };
  root.I18N = { STR: STR, pick: function (obj, lang) { return obj ? (obj[lang] || obj.en || '') : ''; } };
})(this);
