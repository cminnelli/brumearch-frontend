export type EstadoSeleccion = 'pendiente' | 'buscando' | 'seleccionado' | 'comprado';

export interface ItemPopulado {
  _id: string;
  nombre: string;
  unidad: string;
  descripcion?: string;
  subrubroId?: {
    _id: string;
    nombre: string;
    rubroId?: { _id: string; nombre: string };
  };
}

/** Algo que el cliente tiene que comprar por su cuenta. Puede venir del catálogo o estar escrito a mano. */
export interface Seleccion {
  _id: string;
  project: string;
  itemId?: ItemPopulado | null;
  nombre?: string;
  categoria?: string;
  fechaLimite?: string | null;   // para cuándo lo necesita el estudio
  link?: string;                 // referencia o modelo sugerido
  cantidad?: number;
  unidad?: string;
  observacion?: string;          // nota del estudio para el cliente
  orden: number;
  estadoCliente: EstadoSeleccion;
  notasCliente?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const ESTADO_SELECCION_LABELS: Record<EstadoSeleccion, string> = {
  pendiente:    'Pendiente',
  buscando:     'Buscando',
  seleccionado: 'Elegido',
  comprado:     'Comprado',
};

export const ESTADO_SELECCION_NEXT: Record<EstadoSeleccion, EstadoSeleccion> = {
  pendiente:    'buscando',
  buscando:     'seleccionado',
  seleccionado: 'comprado',
  comprado:     'pendiente',
};

// ── Helpers: la lista se arma igual para el equipo y para el cliente ──
export const nombreSel = (s: Seleccion) => s.nombre || s.itemId?.nombre || 'Ítem';
export const categoriaSel = (s: Seleccion) => s.categoria || s.itemId?.subrubroId?.rubroId?.nombre || 'Otros';
export const unidadSel = (s: Seleccion) => s.unidad || s.itemId?.unidad || '';

/** Cuánto falta para la fecha límite: 'vencido' | 'pronto' (≤ 14 días) | 'ok' | null (sin fecha o ya comprado). */
export function urgenciaSel(s: Seleccion, hoy = new Date()): { tono: 'vencido' | 'pronto' | 'ok'; texto: string } | null {
  if (!s.fechaLimite || s.estadoCliente === 'comprado') return null;
  const f = new Date(s.fechaLimite); const d0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dias = Math.round((new Date(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()).getTime() - d0.getTime()) / 86400000);
  const fecha = f.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
  if (dias < 0) return { tono: 'vencido', texto: `Era para el ${fecha} (hace ${-dias} d)` };
  if (dias === 0) return { tono: 'pronto', texto: 'Para hoy' };
  if (dias <= 14) return { tono: 'pronto', texto: `Para el ${fecha} (en ${dias} d)` };
  return { tono: 'ok', texto: `Para el ${fecha}` };
}

export interface GrupoSel { categoria: string; items: Seleccion[]; comprados: number }
/** Agrupa por categoría; dentro de cada una, primero lo que falta comprar y lo más urgente arriba. */
export function agruparSel(lista: Seleccion[]): GrupoSel[] {
  const mapa = new Map<string, Seleccion[]>();
  for (const s of lista) { const c = categoriaSel(s); mapa.set(c, [...(mapa.get(c) ?? []), s]); }
  const peso = (s: Seleccion) => (s.estadoCliente === 'comprado' ? 2 : 0) + (s.fechaLimite ? 0 : 1);
  return [...mapa.entries()].map(([categoria, items]) => ({
    categoria,
    items: [...items].sort((a, b) => peso(a) - peso(b) || (a.fechaLimite ?? '').localeCompare(b.fechaLimite ?? '') || a.orden - b.orden),
    comprados: items.filter(i => i.estadoCliente === 'comprado').length,
  })).sort((a, b) => a.categoria.localeCompare(b.categoria));
}
