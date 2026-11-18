export interface EtapaAvance {
  estado: 'pendiente' | 'activa' | 'completada';
  avance?: number | null;
  duracion?: number | null;
}

/**
 * Avance de obra = promedio del avance de cada etapa, ponderado por su duración en semanas
 * (si alguna etapa no tiene duración, todas pesan igual).
 * Etapa completada = 100%, pendiente = 0%, en curso = el % cargado (50% si no se cargó).
 * Debe coincidir con backend/src/controllers/dashboard.controller.js.
 */
export function avanceObra(etapas: EtapaAvance[] | undefined | null): number {
  if (!etapas?.length) return 0;
  const pctDe = (e: EtapaAvance) => (e.estado === 'completada' ? 100 : e.estado === 'activa' ? (e.avance ?? 50) : 0);
  const ponderar = etapas.every(e => (e.duracion ?? 0) > 0);
  const peso = (e: EtapaAvance) => (ponderar ? e.duracion! : 1);
  const total = etapas.reduce((s, e) => s + peso(e), 0);
  return Math.round(etapas.reduce((s, e) => s + peso(e) * pctDe(e), 0) / total);
}
