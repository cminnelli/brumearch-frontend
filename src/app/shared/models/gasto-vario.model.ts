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
}

export interface ResumenAportes {
  aportes: Aporte[];
  aportado: Equiv;
  aplicado: Equiv;
  saldo: Equiv;
  pctAplicado: number;
  porRubro: { rubro: string; ARS: number; USD: number; pct: number; gastosVarios: boolean }[];
  tcReferencia: number | null;
  sinTC: number;
  proyecto?: { name: string };
}
