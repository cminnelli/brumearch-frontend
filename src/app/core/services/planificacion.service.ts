import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PlanLinea } from '../../shared/models/obra.model';

@Injectable({ providedIn: 'root' })
export class PlanificacionService {
  private http = inject(HttpClient);
  private base = (pid: string) => `${environment.apiUrl}/projects/${pid}/planificacion`;

  list(pid: string)              { return this.http.get<PlanLinea[]>(this.base(pid)); }
  save(pid: string, body: any[]) { return this.http.put<PlanLinea[]>(this.base(pid), body); }
}
