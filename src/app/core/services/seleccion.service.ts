import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Seleccion, EstadoSeleccion } from '../../shared/models/seleccion.model';

@Injectable({ providedIn: 'root' })
export class SeleccionService {
  private http    = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  // Admin
  list(projectId: string): Observable<Seleccion[]> {
    return this.http.get<Seleccion[]>(`${this.baseUrl}/projects/${projectId}/selecciones`);
  }

  create(projectId: string, data: { itemId: string; cantidad?: number; unidad?: string; observacion?: string; orden?: number }): Observable<Seleccion> {
    return this.http.post<Seleccion>(`${this.baseUrl}/projects/${projectId}/selecciones`, data);
  }

  update(projectId: string, id: string, data: Partial<Seleccion>): Observable<Seleccion> {
    return this.http.put<Seleccion>(`${this.baseUrl}/projects/${projectId}/selecciones/${id}`, data);
  }

  remove(projectId: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/projects/${projectId}/selecciones/${id}`);
  }

  // Client
  listCliente(projectId: string): Observable<Seleccion[]> {
    return this.http.get<Seleccion[]>(`${this.baseUrl}/client/projects/${projectId}/selecciones`);
  }

  updateEstado(projectId: string, id: string, estadoCliente: EstadoSeleccion, notasCliente?: string): Observable<Seleccion> {
    return this.http.put<Seleccion>(`${this.baseUrl}/client/projects/${projectId}/selecciones/${id}`, { estadoCliente, notasCliente });
  }
}
