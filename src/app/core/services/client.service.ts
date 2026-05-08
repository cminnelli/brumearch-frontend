import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClientProject } from '../../shared/models/client-project.model';
import { CuentaCliente, MovimientoCliente } from '../../shared/models/caja-cliente.model';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private http    = inject(HttpClient);
  private base    = `${environment.apiUrl}/client`;

  // ── Projects ────────────────────────────────────────────────
  listProjects(): Observable<{ projects: ClientProject[] }> {
    return this.http.get<{ projects: ClientProject[] }>(`${this.base}/projects`);
  }

  getProject(id: string): Observable<{ project: ClientProject }> {
    return this.http.get<{ project: ClientProject }>(`${this.base}/projects/${id}`);
  }

  // ── Cuentas ─────────────────────────────────────────────────
  listCuentas(projectId: string): Observable<{ cuentas: CuentaCliente[] }> {
    return this.http.get<{ cuentas: CuentaCliente[] }>(`${this.base}/projects/${projectId}/caja/cuentas`);
  }

  createCuenta(projectId: string, body: Partial<CuentaCliente>): Observable<{ cuenta: CuentaCliente }> {
    return this.http.post<{ cuenta: CuentaCliente }>(`${this.base}/projects/${projectId}/caja/cuentas`, body);
  }

  updateCuenta(projectId: string, id: string, body: Partial<CuentaCliente>): Observable<{ cuenta: CuentaCliente }> {
    return this.http.put<{ cuenta: CuentaCliente }>(`${this.base}/projects/${projectId}/caja/cuentas/${id}`, body);
  }

  deleteCuenta(projectId: string, id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/projects/${projectId}/caja/cuentas/${id}`);
  }

  // ── Movimientos ─────────────────────────────────────────────
  listMovimientos(projectId: string): Observable<{ movimientos: MovimientoCliente[] }> {
    return this.http.get<{ movimientos: MovimientoCliente[] }>(`${this.base}/projects/${projectId}/caja/movimientos`);
  }

  createMovimiento(projectId: string, body: Partial<MovimientoCliente>): Observable<{ movimiento: MovimientoCliente }> {
    return this.http.post<{ movimiento: MovimientoCliente }>(`${this.base}/projects/${projectId}/caja/movimientos`, body);
  }

  updateMovimiento(projectId: string, id: string, body: Partial<MovimientoCliente>): Observable<{ movimiento: MovimientoCliente }> {
    return this.http.put<{ movimiento: MovimientoCliente }>(`${this.base}/projects/${projectId}/caja/movimientos/${id}`, body);
  }

  deleteMovimiento(projectId: string, id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/projects/${projectId}/caja/movimientos/${id}`);
  }
}
