import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GastoVario } from '../../shared/models/gasto-vario.model';

@Injectable({ providedIn: 'root' })
export class GastoVarioService {
  private http = inject(HttpClient);
  private base = (p: string) => `${environment.apiUrl}/projects/${p}/gastos-varios`;

  list(projectId: string, filtros: Record<string, string> = {}): Observable<GastoVario[]> {
    return this.http.get<GastoVario[]>(this.base(projectId), { params: new HttpParams({ fromObject: filtros }) });
  }
  create(projectId: string, fd: FormData): Observable<GastoVario> { return this.http.post<GastoVario>(this.base(projectId), fd); }
  update(projectId: string, id: string, fd: FormData): Observable<GastoVario> { return this.http.put<GastoVario>(`${this.base(projectId)}/${id}`, fd); }
  remove(projectId: string, id: string): Observable<void> { return this.http.delete<void>(`${this.base(projectId)}/${id}`); }
}
