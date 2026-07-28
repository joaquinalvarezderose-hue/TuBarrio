// Formatea fechas `date` de Postgres (YYYY-MM-DD) a texto legible en español.
// Se parsean los componentes manualmente y se formatea con timeZone: 'UTC'
// para evitar que new Date("2026-08-24") corra un día por el huso horario local.

const formatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const formatterWithYear = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const parseDateOnly = (value?: string | null): Date | null => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};

export const formatTournamentDate = (
  fechaInicio?: string | null,
  fechaFin?: string | null
): string => {
  const inicio = parseDateOnly(fechaInicio);
  const fin = parseDateOnly(fechaFin);

  if (!inicio && !fin) return 'Fecha a confirmar';
  if (inicio && fin && inicio.getTime() !== fin.getTime()) {
    return `${formatter.format(inicio)} al ${formatterWithYear.format(fin)}`;
  }
  return formatterWithYear.format(inicio || fin!);
};
