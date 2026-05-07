export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived';
export type ProjectType = 'residential' | 'commercial' | 'industrial' | 'urban' | 'mixed';
export type ProjectService =
  | 'diseno_integral'
  | 'renderismo'
  | 'documentacion_ejecutiva'
  | 'cotizacion'
  | 'gestoria_tramites'
  | 'construccion_direccion';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  residential: 'Residencial',
  commercial:  'Comercial',
  industrial:  'Industrial',
  urban:       'Urbanismo',
  mixed:       'Mixto',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft:     'Borrador',
  active:    'Activo',
  completed: 'Completado',
  archived:  'Archivado',
};

export const SERVICE_LABELS: Record<ProjectService, string> = {
  diseno_integral:       'Diseño integral de proyecto',
  renderismo:            'Renderismo',
  documentacion_ejecutiva: 'Documentación ejecutiva',
  cotizacion:            'Cotización',
  gestoria_tramites:     'Gestoría y trámites',
  construccion_direccion: 'Construcción y dirección de obra',
};

export interface ProjectOwner {
  name?:  string;
  email?: string;
  phone?: string;
}

export interface ProjectFeatures {
  levels?:     number;
  surface?:    number;
  lotSurface?: number;
  bedrooms?:   number;
  bathrooms?:  number;
  hasLaundry?: boolean;
  units?:      number;
}

export interface ProjectLocation {
  address?:          string;
  neighborhood?:     string;
  city?:             string;
  province?:         string;
  country?:          string;
  isGatedCommunity?: boolean;
  coordinates?:      { lat: number; lng: number };
}

export interface Project {
  _id:         string;
  name:        string;
  description?: string;
  type:        ProjectType;
  status:      ProjectStatus;
  owner?:      ProjectOwner;
  services?:   ProjectService[];
  location?:   ProjectLocation;
  features?:   ProjectFeatures;
  budget?:     { estimated?: number; currency: string };
  startDate?:  string;
  endDate?:    string;
  tags?:       string[];
  coverImage?: string;
  createdAt:   string;
  updatedAt:   string;
}
