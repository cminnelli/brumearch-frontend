import { Archivo, Moneda } from './obra.model';

export interface GastoVario {
  _id: string;
  project: string;
  fecha: string;
  concepto: string;
  subrubroId: { _id: string; nombre: string; rubroId?: { _id: string; nombre: string } };
  monto: number;
  moneda: Moneda;
  tipoCambio?: number | null;
  notas?: string;
  comprobante?: Archivo;
}

export interface Equiv { ARS: number; USD: number }

export interface Aporte {
  _id: string;
  fecha: string;
  monto: number;
  moneda: Moneda;
  tipoCambio?: number | null;
  metodo?: string;
  origen?: string;
  concepto?: string;
  referencia?: string;
  notas?: string;
  comprobante?: Archivo;
  equiv: Equiv;
  // Solo equipo (el propietario nunca recibe esto)
  numero?: number;
  asignaciones?: AsignacionAporte[];
  utilidades?: UtilidadAporte[];
  asignado?: number;
  utilidad?: number;
  saldo?: number;
}

export interface AsignacionAporte {
  _id: string;
  fecha: string;
  gastoId: string;
  pagoId: string;
  monedaOperacion: Moneda;
  montoOperacion: number;
  descuenta: number;
  metodoPago?: string;
  concepto?: string;
  gasto: { descripcion?: string; proveedor?: string; subrubro?: string; rubro?: string } | null;
}
export interface UtilidadAporte { _id: string; fecha: string; monto: number; nota?: string }

export interface ResumenAportes {
  aportes: Aporte[];
  aportado: Equiv;
  totales?: { asignado: Equiv; utilidad: Equiv; saldo: Equiv };
  tcReferencia: number | null;
  sinTC: number;
  proyecto?: { name: string };
}
