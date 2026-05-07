import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Reserva, Movimiento } from '../../shared/models/obra.model';

@Injectable({ providedIn: 'root' })
export class ReservaService {
  private http = inject(HttpClient);

  private base(pid: string) {
    return `${environment.apiUrl}/projects/${pid}/reservas`;
  }

  list(pid: string) {
    return this.http.get<Reserva[]>(this.base(pid));
  }

  create(pid: string, body: { nombre: string; moneda: string; descripcion?: string }) {
    return this.http.post<Reserva>(this.base(pid), body);
  }

  update(pid: string, id: string, body: { nombre: string; descripcion?: string }) {
    return this.http.put<Reserva>(`${this.base(pid)}/${id}`, body);
  }

  remove(pid: string, id: string) {
    return this.http.delete(`${this.base(pid)}/${id}`);
  }

  addMovimiento(pid: string, id: string, body: Partial<Movimiento>) {
    return this.http.post<Reserva>(`${this.base(pid)}/${id}/movimientos`, body);
  }

  removeMovimiento(pid: string, id: string, movId: string) {
    return this.http.delete<Reserva>(`${this.base(pid)}/${id}/movimientos/${movId}`);
  }
}
