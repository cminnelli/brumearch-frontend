export interface ProjectOwner {
  name:  string;
  email: string;
  phone?: string;
}

export interface ProjectEtapa {
  etapaId: string;
  orden:   number;
  nombre:  string;
  estado:  'pendiente' | 'activa' | 'completada';
  fechaInicio?: string | null;
  duracion?:    number | null;
}

export interface ClientProject {
  _id:         string;
  name:        string;
  description?: string;
  type:        string;
  status:      'draft' | 'active' | 'completed' | 'archived';
  location?: {
    address?:      string;
    neighborhood?: string;
    city?:         string;
    province?:     string;
    country?:      string;
    isGatedCommunity?: boolean;
  };
  features?: {
    levels?:    number;
    surface?:   number;
    lotSurface?: number;
    bedrooms?:  number;
    bathrooms?: number;
    hasLaundry?: boolean;
    units?:     number;
  };
  services:  string[];
  startDate?: string;
  endDate?:   string;
  coverImage?: string;
  tags?:       string[];
  owner?:      ProjectOwner;
  owners?:     ProjectOwner[];
  etapas?:     ProjectEtapa[];
  createdAt:   string;
  updatedAt:   string;
}

export const SERVICE_LABELS: Record<string, string> = {
  diseno_integral:          'Diseño integral',
  renderismo:               'Renders',
  documentacion_ejecutiva:  'Doc. ejecutiva',
  cotizacion:               'Cotización',
  gestoria_tramites:        'Gestoría / trámites',
  construccion_direccion:   'Construcción y dirección',
};

export const STATUS_LABELS: Record<string, string> = {
  draft:     'Borrador',
  active:    'Activo',
  completed: 'Finalizado',
  archived:  'Archivado',
};
