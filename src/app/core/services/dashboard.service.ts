import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProjectStatus, ProjectType } from '../../shared/models/project.model';

export type PorMoneda = { ARS: number; USD: number; EUR: number };

export interface ProjectSummary {
  _id: string;
  name: string;
  status: ProjectStatus;
  type: ProjectType;
  coverImage?: string;
  city?: string;
  client?: string;
  budget?: { estimated?: number; currency: string };
  startDate?: string;
  endDate?: string;
  updatedAt: string;
  avance: { total: number; completadas: number; activa: string | null; pct: number };
  aprobado: PorMoneda;
  gastado: PorMoneda;
  pagado: PorMoneda;
  porPagar: PorMoneda;
  pendientes: number;
  vencidos: number;
}

export interface PagoPendiente {
  projectId: string;
  projectName: string;
  gastoId: string;
  pagoId: string;
  proveedor: string | null;
  concepto: string | null;
  monto: number;
  moneda: keyof PorMoneda;
  fecha: string;
  vencido: boolean;
  faltaPago: boolean;
  faltaFirma: boolean;
}

export interface DashboardData {
  proyectos: ProjectSummary[];
  pagosPendientes: PagoPendiente[];
  totales: { aprobado: PorMoneda; gastado: PorMoneda; pagado: PorMoneda; porPagar: PorMoneda };
  pagosVencidos: number;
}

export const MONEDAS: (keyof PorMoneda)[] = ['ARS', 'USD', 'EUR'];

/** Monedas con movimiento, para mostrar solo las que importan. */
export function monedasUsadas(...fuentes: PorMoneda[]): (keyof PorMoneda)[] {
  return MONEDAS.filter(m => fuentes.some(f => f[m] > 0));
}

export function fmtMoney(n: number, m: string): string {
  return `${m} ${Math.round(n).toLocaleString('es-AR')}`;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  get(): Observable<DashboardData> {
    return this.http.get<DashboardData>(`${environment.apiUrl}/dashboard`);
  }
}
