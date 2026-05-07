import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Solicitud, Presupuesto } from '../../shared/models/obra.model';

@Injectable({ providedIn: 'root' })
export class SolicitudService {
  private http = inject(HttpClient);
  private base = (pid: string) => `${environment.apiUrl}/projects/${pid}/solicitudes`;

  list(pid: string) {
    return this.http.get<Solicitud[]>(this.base(pid));
  }

  create(pid: string, body: { subrubroId: string; descripcion?: string }) {
    return this.http.post<Solicitud>(this.base(pid), body);
  }

  addCotizacion(pid: string, id: string, fd: FormData) {
    return this.http.post<Solicitud>(`${this.base(pid)}/${id}/cotizaciones`, fd);
  }

  removeCotizacion(pid: string, id: string, cotId: string) {
    return this.http.delete<Solicitud>(`${this.base(pid)}/${id}/cotizaciones/${cotId}`);
  }

  seleccionar(pid: string, id: string, cotId: string) {
    return this.http.post<{ solicitud: Solicitud; presupuesto: Presupuesto }>(
      `${this.base(pid)}/${id}/cotizaciones/${cotId}/seleccionar`, {}
    );
  }
}
