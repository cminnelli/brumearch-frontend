import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Aporte, ResumenAportes } from '../../shared/models/gasto-vario.model';

@Injectable({ providedIn: 'root' })
export class AporteService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  /** Equipo: lista de pagos del propietario y total cobrado. */
  resumen(projectId: string): Observable<ResumenAportes> { return this.http.get<ResumenAportes>(`${this.api}/projects/${projectId}/aportes`); }
  create(projectId: string, fd: FormData): Observable<Aporte> { return this.http.post<Aporte>(`${this.api}/projects/${projectId}/aportes`, fd); }
  update(projectId: string, id: string, fd: FormData): Observable<Aporte> { return this.http.put<Aporte>(`${this.api}/projects/${projectId}/aportes/${id}`, fd); }
  remove(projectId: string, id: string): Observable<void> { return this.http.delete<void>(`${this.api}/projects/${projectId}/aportes/${id}`); }
  /** Pagar un gasto con plata de un aporte (crea el pago en Compras). Devuelve el resumen actualizado. */
  asignar(projectId: string, id: string, body: { gastoId: string; monedaOperacion: string; montoOperacion: number; metodoPago?: string; fecha?: string; concepto?: string }): Observable<ResumenAportes> {
    return this.http.post<ResumenAportes>(`${this.api}/projects/${projectId}/aportes/${id}/asignaciones`, body);
  }
  quitarAsignacion(projectId: string, id: string, asigId: string): Observable<ResumenAportes> { return this.http.delete<ResumenAportes>(`${this.api}/projects/${projectId}/aportes/${id}/asignaciones/${asigId}`); }
  /** Pasar parte del saldo a utilidad del estudio. */
  crearUtilidad(projectId: string, id: string, body: { monto: number; nota?: string; fecha?: string }): Observable<ResumenAportes> { return this.http.post<ResumenAportes>(`${this.api}/projects/${projectId}/aportes/${id}/utilidades`, body); }
  quitarUtilidad(projectId: string, id: string, uid: string): Observable<ResumenAportes> { return this.http.delete<ResumenAportes>(`${this.api}/projects/${projectId}/aportes/${id}/utilidades/${uid}`); }
  /** Propietario: solo lectura. */
  resumenCliente(projectId: string): Observable<ResumenAportes> { return this.http.get<ResumenAportes>(`${this.api}/client/projects/${projectId}/aportes`); }
}
