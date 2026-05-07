import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Presupuesto, EstadoPresupuesto } from '../../shared/models/obra.model';

@Injectable({ providedIn: 'root' })
export class PresupuestoService {
  private http = inject(HttpClient);
  private base = (projectId: string) => `${environment.apiUrl}/projects/${projectId}/presupuestos`;

  list(projectId: string, filters: { subrubroId?: string; estado?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.subrubroId) params.set('subrubroId', filters.subrubroId);
    if (filters.estado)     params.set('estado', filters.estado);
    const qs = params.toString() ? `?${params}` : '';
    return this.http.get<Presupuesto[]>(`${this.base(projectId)}${qs}`);
  }

  create(projectId: string, formData: FormData) {
    return this.http.post<Presupuesto>(this.base(projectId), formData);
  }

  update(projectId: string, id: string, data: Partial<Presupuesto>) {
    return this.http.put<Presupuesto>(`${this.base(projectId)}/${id}`, data);
  }

  patchEstado(projectId: string, id: string, estado: EstadoPresupuesto) {
    return this.http.patch<Presupuesto>(`${this.base(projectId)}/${id}/estado`, { estado });
  }

  remove(projectId: string, id: string) {
    return this.http.delete(`${this.base(projectId)}/${id}`);
  }
}
