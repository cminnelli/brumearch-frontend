import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Aporte, ResumenAportes } from '../../shared/models/gasto-vario.model';

@Injectable({ providedIn: 'root' })
export class AporteService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  /** Equipo: lista + resumen (aportado, aplicado, saldo, reparto por rubro). */
  resumen(projectId: string): Observable<ResumenAportes> { return this.http.get<ResumenAportes>(`${this.api}/projects/${projectId}/aportes`); }
  create(projectId: string, fd: FormData): Observable<Aporte> { return this.http.post<Aporte>(`${this.api}/projects/${projectId}/aportes`, fd); }
  update(projectId: string, id: string, fd: FormData): Observable<Aporte> { return this.http.put<Aporte>(`${this.api}/projects/${projectId}/aportes/${id}`, fd); }
  remove(projectId: string, id: string): Observable<void> { return this.http.delete<void>(`${this.api}/projects/${projectId}/aportes/${id}`); }
  /** Propietario: solo lectura. */
  resumenCliente(projectId: string): Observable<ResumenAportes> { return this.http.get<ResumenAportes>(`${this.api}/client/projects/${projectId}/aportes`); }
}
