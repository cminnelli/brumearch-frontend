export type EstadoSeleccion = 'pendiente' | 'buscando' | 'seleccionado' | 'comprado';

export interface ItemPopulado {
  _id: string;
  nombre: string;
  unidad: string;
  descripcion?: string;
  subrubroId: {
    _id: string;
    nombre: string;
    rubroId: { _id: string; nombre: string };
  };
}

export interface Seleccion {
  _id: string;
  project: string;
  itemId: ItemPopulado;
  cantidad?: number;
  unidad?: string;         // override de item.unidad
  observacion?: string;    // nota del admin para este proyecto
  orden: number;
  estadoCliente: EstadoSeleccion;
  notasCliente?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const ESTADO_SELECCION_LABELS: Record<EstadoSeleccion, string> = {
  pendiente:    'Pendiente',
  buscando:     'Buscando',
  seleccionado: 'Seleccionado',
  comprado:     'Comprado',
};

export const ESTADO_SELECCION_NEXT: Record<EstadoSeleccion, EstadoSeleccion> = {
  pendiente:    'buscando',
  buscando:     'seleccionado',
  seleccionado: 'comprado',
  comprado:     'pendiente',
};
