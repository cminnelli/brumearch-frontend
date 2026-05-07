export interface Archivo {
  _id?: string;
  originalName: string;
  filename: string;
  mimetype: string;
  size: number;
}

export type EstadoPresupuesto = 'pendiente' | 'aprobado' | 'rechazado';
export type Moneda = 'ARS' | 'USD' | 'EUR';
export type MetodoPago =
  | 'efectivo'
  | 'transferencia'
  | 'cheque'
  | 'tarjeta_credito'
  | 'tarjeta_debito';

export const METODO_LABELS: Record<MetodoPago, string> = {
  efectivo:        'Efectivo',
  transferencia:   'Transferencia',
  cheque:          'Cheque',
  tarjeta_credito: 'Tarjeta crédito',
  tarjeta_debito:  'Tarjeta débito',
};

export const METODO_ICONS: Record<MetodoPago, string> = {
  efectivo:        '💵',
  transferencia:   '🏦',
  cheque:          '📝',
  tarjeta_credito: '💳',
  tarjeta_debito:  '💳',
};

export const METODO_HINT: Record<MetodoPago, string> = {
  efectivo:        '',
  transferencia:   'Nro. de transacción o CBU',
  cheque:          'Nro. de cheque',
  tarjeta_credito: 'Últimos 4 / cuotas',
  tarjeta_debito:  'Últimos 4 dígitos',
};

export type MetodoMovimiento = 'efectivo' | 'bancario';

export interface Pago {
  _id: string;
  fecha: string;
  monto: number;
  metodoPago: MetodoPago;
  referencia?: string;
  notas?: string;
  reservaId?: string;
}

export interface Presupuesto {
  _id: string;
  project: string;
  subrubroId: { _id: string; nombre: string; codigo: string };
  proveedorId?: { _id: string; nombre: string };
  descripcion?: string;
  monto: number;
  moneda: Moneda;
  estado: EstadoPresupuesto;
  archivos: Archivo[];
  notas?: string;
  createdAt: string;
}

export interface Gasto {
  _id: string;
  project: string;
  presupuestoId?: { _id: string; descripcion?: string; monto: number; moneda: Moneda; archivos?: Archivo[] };
  subrubroId: { _id: string; nombre: string; codigo: string };
  proveedorId?: { _id: string; nombre: string };
  descripcion?: string;
  monto: number;
  moneda: Moneda;
  fecha: string;
  comprobante?:  Archivo;
  comprobantes?: Archivo[];
  notas?: string;
  pagos: Pago[];
  createdAt: string;
}

// ── Reservas / Caja ──────────────────────────────────────────
export type TipoMovimiento = 'ingreso' | 'egreso';

export interface Movimiento {
  _id:      string;
  tipo:     TipoMovimiento;
  monto:    number;
  fecha:    string;
  concepto?: string;
  origen?:  string;
  destino?: string;
  notas?:   string;
  metodo?:  MetodoMovimiento;
}

export interface Reserva {
  _id:         string;
  project:     string;
  nombre:      string;
  moneda:      Moneda;
  descripcion?: string;
  movimientos: Movimiento[];
  createdAt:   string;
}

export function saldoReserva(r: Reserva): number {
  return r.movimientos.reduce(
    (s, m) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0
  );
}

export function ingresadoReserva(r: Reserva): number {
  return r.movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
}

export function egresadoReserva(r: Reserva): number {
  return r.movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
}

// ── Solicitudes de Cotización ─────────────────────────────
export interface Cotizacion {
  _id:           string;
  proveedorId?:  { _id: string; nombre: string };
  monto?:        number;
  moneda:        Moneda;
  archivos:      Archivo[];
  notas?:        string;
  plazo?:        string;
  condiciones?:  string;
  seleccionada:  boolean;
  createdAt:     string;
}

export interface Solicitud {
  _id:           string;
  project:       string;
  subrubroId:    { _id: string; nombre: string; codigo: string };
  descripcion?:  string;
  estado:        'abierta' | 'cerrada';
  cotizaciones:  Cotizacion[];
  presupuestoId?: string;
  createdAt:     string;
}

// ── Planificación (estimaciones, no gastos reales) ───────────
export interface PlanSemana { semana: number; monto: number; }

export type PlanModo = 'parejo' | 'inicio' | 'fin' | 'hitos';

export type HitoPosicion = 'inicio' | 'cuarto' | 'mitad' | 'tres_cuartos' | 'fin';

export interface PlanHito { posicion: HitoPosicion; pct: number; }

export interface PlanLinea {
  _id?:        string;
  project:     string;
  subrubroId:  { _id: string; nombre: string; codigo: string; rubroId?: { _id: string; nombre: string } };
  concepto?:   string;
  etapaRef?:   string | null;
  etapaNombre?: string | null;
  monto:       number;
  modo:        PlanModo;
  hitos:       PlanHito[];
  semanas:     PlanSemana[];
}

// Tipos derivados — EstadoGasto se calcula, no se persiste
export type EstadoGasto = 'sin_pago' | 'parcial' | 'pagado';

export function totalPagadoGasto(g: Gasto): number {
  return (g.pagos || []).reduce((s, p) => s + p.monto, 0);
}

export function estadoGasto(g: Gasto): EstadoGasto {
  const pagado = totalPagadoGasto(g);
  if (pagado === 0) return 'sin_pago';
  if (pagado < g.monto) return 'parcial';
  return 'pagado';
}
