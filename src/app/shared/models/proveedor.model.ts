export interface MapLocation {
  address: string;
  lat: number;
  lng: number;
}

export interface Direccion {
  label?: string;
  address: string;
  lat?: number;
  lng?: number;
}

export type CondicionIva = 'responsable_inscripto' | 'monotributo' | 'exento' | '';

export const CONDICION_IVA_LABELS: Record<CondicionIva, string> = {
  responsable_inscripto: 'Resp. Inscripto',
  monotributo: 'Monotributo',
  exento: 'Exento',
  '': '',
};

export interface Proveedor {
  _id: string;

  // Identificación
  nombre: string;
  cuit?: string;
  razonSocial?: string;

  // Contacto
  responsable?: string;
  telefono?: string;
  email?: string;
  web?: string;
  instagram?: string;

  // Fiscal
  condicionIva?: CondicionIva;

  // Zona (legado)
  zona?: MapLocation;

  // Múltiples direcciones
  direcciones?: Direccion[];

  // Rubros
  subrubros: {
    _id: string;
    nombre: string;
    codigo: string;
    rubroId?: { _id: string; nombre: string };
  }[];

  // Evaluación
  rating?: number;
  notas?: string;

  activo: boolean;
}
