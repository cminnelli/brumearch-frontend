/**
 * Análisis del cronograma: contrasta lo planificado (fecha de inicio + duración) con lo real
 * (fechas reales y avance) y proyecta cuándo terminaría la obra al ritmo actual.
 */
export type EstadoEtapa = 'pendiente' | 'activa' | 'completada';

export interface EtapaIn {
  id: string;
  nombre: string;
  orden: number;
  estado: EstadoEtapa;
  avance?: number | null;
  fechaInicio?: string | null;     // planificada
  duracion?: number | null;        // semanas planificadas
  fechaInicioReal?: string | null;
  fechaFinReal?: string | null;
  /** Fin que estima una persona para una etapa en curso o pendiente. */
  fechaFinEstimada?: string | null;
}

export type Tono = 'ok' | 'warn' | 'bad' | 'none';

export interface EtapaAnalisis {
  id: string;
  nombre: string;
  estado: EstadoEtapa;
  planInicio: Date | null;
  planFin: Date | null;
  realInicio: Date | null;
  realFin: Date | null;
  /** Fin real (si terminó) o proyectado al ritmo actual. */
  proyFin: Date | null;
  /** Días de desvío del fin: positivo = tarde, negativo = antes. */
  desvioDias: number | null;
  texto: string;
  /** Para la etiqueta chica: "+30 d", "-3 d" o "En plazo". */
  corto: string;
  tono: Tono;
}

export interface Analisis {
  etapas: EtapaAnalisis[];
  planFin: Date | null;
  proyFin: Date | null;
  desvioDias: number | null;
  tono: Tono;
  /** Hitos de la obra completa. */
  inicioPlan: Date | null;
  inicioReal: Date | null;
  /** Fin real: solo si todas las etapas terminaron y tienen fecha de fin real. */
  finReal: Date | null;
  insights: { tono: Tono; texto: string }[];
  /** Rango de fechas del gráfico. */
  desde: Date | null;
  hasta: Date | null;
  completo: boolean;
}

const DIA = 86400000;
export const parseDia = (s?: string | null): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
};
const sumar = (d: Date, dias: number) => new Date(d.getTime() + Math.round(dias) * DIA);
export const diasEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DIA);
const tonoDe = (d: number | null): Tono => (d === null ? 'none' : d <= 0 ? 'ok' : d <= 7 ? 'warn' : 'bad');
export const fmtCorta = (d: Date | null) => d ? d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—';
export const fmtLarga = (d: Date | null) => d ? d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const plural = (n: number) => `${Math.abs(n)} día${Math.abs(n) !== 1 ? 's' : ''}`;

export function analizarCronograma(entrada: EtapaIn[], hoy: Date = new Date()): Analisis {
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const lista = [...entrada].sort((a, b) => a.orden - b.orden);
  let carry = 0;                      // días de atraso que arrastran las etapas que siguen
  const etapas: EtapaAnalisis[] = lista.map(e => {
    const planInicio = parseDia(e.fechaInicio);
    const planFin = planInicio && e.duracion ? sumar(planInicio, e.duracion * 7) : null;
    const realInicio = parseDia(e.fechaInicioReal) ?? (e.estado !== 'pendiente' ? planInicio : null);
    const realFin = parseDia(e.fechaFinReal);
    const estimada = parseDia(e.fechaFinEstimada);
    let proyFin: Date | null = null, desvio: number | null = null, texto = '', tono: Tono = 'none';

    if (e.estado === 'completada') {
      proyFin = realFin;
      if (realFin && planFin) {
        desvio = diasEntre(planFin, realFin);
        texto = desvio > 0 ? `Terminó ${plural(desvio)} tarde` : desvio < 0 ? `Terminó ${plural(desvio)} antes` : 'Terminó en fecha';
        carry = desvio;
      } else texto = realFin ? 'Terminada' : 'Cargá la fecha real de fin';
    } else if (e.estado === 'activa') {
      const base = realInicio ?? planInicio;
      const av = e.avance;                         // solo se proyecta con un % que cargó una persona
      if (estimada) proyFin = estimada;            // la fecha que cargó una persona manda sobre el cálculo
      else if (base && av && av > 0) {
        const transcurrido = Math.max(1, diasEntre(base, h));
        proyFin = sumar(base, transcurrido / (av / 100));
      } else if (planFin) proyFin = planFin;       // sin avance cargado: como mínimo, el plan
      if (proyFin && proyFin < h && !estimada) proyFin = h;
      if (planFin && planFin < h && (!proyFin || proyFin < h) && !estimada) proyFin = h;   // venció el plan: el atraso corre solo
      if (proyFin && planFin) {
        desvio = diasEntre(planFin, proyFin);
        texto = desvio > 0 ? `${estimada ? 'Estimás' : 'Va'} ${plural(desvio)} tarde` : desvio < 0 ? `Estimás terminar ${plural(desvio)} antes` : 'En plazo';
        carry = Math.max(0, desvio);
      } else texto = 'Sin fechas planificadas';
    } else {
      if (planInicio && planFin && estimada) {
        proyFin = estimada;
        desvio = diasEntre(planFin, estimada);
        texto = desvio > 0 ? `Estimás ${plural(desvio)} tarde` : desvio < 0 ? `Estimás terminar ${plural(desvio)} antes` : 'En plazo';
        carry = Math.max(carry, desvio);
      } else if (planInicio && planFin) {
        if (diasEntre(planInicio, h) > carry) carry = diasEntre(planInicio, h);   // ya debería haber empezado
        if (diasEntre(planFin, h) > carry) carry = diasEntre(planFin, h);         // y si venció su fin, el atraso corre solo
        const c = Math.max(0, carry);
        proyFin = sumar(planFin, c);
        desvio = c;
        texto = c > 0 ? (planFin < h ? `Sin iniciar: ${plural(c)} de atraso` : `Se corre ~${plural(c)}`) : 'En plazo';
      } else texto = 'Sin fechas planificadas';
    }
    tono = tonoDe(desvio);
    const corto = desvio === null ? '' : desvio > 0 ? `+${desvio} d` : desvio < 0 ? `${desvio} d` : 'En plazo';
    return { id: e.id, nombre: e.nombre, estado: e.estado, planInicio, planFin, realInicio, realFin, proyFin, desvioDias: desvio, texto, corto, tono };
  });

  const conPlan = etapas.filter(x => x.planFin);
  const planFin = conPlan.length ? new Date(Math.max(...conPlan.map(x => x.planFin!.getTime()))) : null;
  const conProy = etapas.filter(x => x.proyFin);
  const proyFin = conProy.length ? new Date(Math.max(...conProy.map(x => x.proyFin!.getTime()))) : null;
  const desvioDias = planFin && proyFin ? diasEntre(planFin, proyFin) : null;
  const completo = etapas.length > 0 && etapas.every(x => x.planInicio && x.planFin);

  const insights: { tono: Tono; texto: string }[] = [];
  if (!etapas.length) { /* nada que analizar */ }
  else if (!completo) insights.push({ tono: 'none', texto: 'Cargá el inicio y la duración de todas las etapas para analizar los desvíos.' });
  else if (desvioDias !== null && planFin && proyFin) {
    if (etapas.every(x => x.estado === 'completada')) {
      insights.push({ tono: tonoDe(desvioDias), texto: desvioDias > 0 ? `La obra terminó ${plural(desvioDias)} después de lo planificado (${fmtLarga(planFin)}).` : desvioDias < 0 ? `La obra terminó ${plural(desvioDias)} antes de lo planificado.` : 'La obra terminó en la fecha planificada.' });
    } else insights.push({ tono: tonoDe(desvioDias), texto: desvioDias > 0
      ? `Con lo cargado hasta hoy la obra terminaría el ${fmtLarga(proyFin)}, ${plural(desvioDias)} después del plan (${fmtLarga(planFin)}).`
      : `La obra va en fecha: fin previsto el ${fmtLarga(planFin)}.` });
    const act = lista.find(e => e.estado === 'activa' && e.avance);
    if (desvioDias > 0 && act && !act.fechaFinEstimada) insights[insights.length - 1].texto += ` Estimado con el ${act.avance}% de avance de ${act.nombre}: cargá su fin estimado para ajustarlo.`;
  }
  const activa = etapas.find(x => x.estado === 'activa');
  if (activa?.planFin && activa.desvioDias && activa.desvioDias > 0 && activa.planFin < h) {
    insights.push({ tono: activa.tono, texto: `${activa.nombre} debía terminar el ${fmtLarga(activa.planFin)} y sigue en curso (${plural(diasEntre(activa.planFin, h))} de atraso).` });
  }
  const terminadas = etapas.filter(x => x.estado === 'completada' && x.desvioDias !== null);
  const peor = [...terminadas].sort((a, b) => b.desvioDias! - a.desvioDias!)[0];
  if (peor && peor.desvioDias! > 0) insights.push({ tono: peor.tono, texto: `${peor.nombre} fue la etapa con más desvío: terminó ${plural(peor.desvioDias!)} tarde.` });
  const mejor = [...terminadas].sort((a, b) => a.desvioDias! - b.desvioDias!)[0];
  if (mejor && mejor.desvioDias! < 0) insights.push({ tono: 'ok', texto: `${mejor.nombre} se adelantó ${plural(mejor.desvioDias!)}.` });
  const sinAvance = lista.find(e => e.estado === 'activa' && !e.avance && !e.fechaFinEstimada);
  if (sinAvance) insights.push({ tono: 'none', texto: `Cargá la fecha de fin estimada de ${sinAvance.nombre} (o su % de avance) para proyectar cuándo termina.` });
  const sinFecha = etapas.filter(x => x.estado === 'completada' && !x.realFin);
  if (sinFecha.length) insights.push({ tono: 'none', texto: sinFecha.length > 2 ? `Faltan las fechas reales de fin de ${sinFecha.length} etapas completadas para medir su desvío.` : `Falta la fecha real de fin de ${sinFecha.map(x => x.nombre).join(' y ')} para medir su desvío.` });

  const iniPlan = etapas.filter(x => x.planInicio).map(x => x.planInicio!.getTime());
  const iniReal = etapas.filter(x => x.realInicio && x.estado !== 'pendiente').map(x => x.realInicio!.getTime());
  const inicioPlan = iniPlan.length ? new Date(Math.min(...iniPlan)) : null;
  const inicioReal = iniReal.length ? new Date(Math.min(...iniReal)) : null;
  const finReal = etapas.length && etapas.every(x => x.estado === 'completada' && x.realFin) ? new Date(Math.max(...etapas.map(x => x.realFin!.getTime()))) : null;

  const fechas = etapas.flatMap(x => [x.planInicio, x.realInicio, x.planFin, x.proyFin].filter(Boolean) as Date[]);
  const desde = fechas.length ? new Date(Math.min(...fechas.map(d => d.getTime()))) : null;
  const hasta = fechas.length ? new Date(Math.max(...fechas.map(d => d.getTime()), h.getTime())) : null;
  return { etapas, planFin, proyFin, desvioDias, tono: tonoDe(desvioDias), inicioPlan, inicioReal, finReal, insights: insights.slice(0, 5), desde, hasta, completo };
}
