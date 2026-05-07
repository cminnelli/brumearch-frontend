import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Proveedor } from '../../shared/models/proveedor.model';

@Injectable({ providedIn: 'root' })
export class ProveedorService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/proveedores`;

  list(subrubroId?: string) {
    const params = subrubroId ? `?subrubroId=${subrubroId}` : '';
    return this.http.get<Proveedor[]>(`${this.base}${params}`);
  }

  create(data: any)            { return this.http.post<Proveedor>(this.base, data); }
  update(id: string, data: any){ return this.http.put<Proveedor>(`${this.base}/${id}`, data); }
  remove(id: string)                          { return this.http.delete(`${this.base}/${id}`); }
}
