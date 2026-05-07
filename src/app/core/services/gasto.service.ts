import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Gasto } from '../../shared/models/obra.model';

@Injectable({ providedIn: 'root' })
export class GastoService {
  private http = inject(HttpClient);
  private base = (projectId: string) => `${environment.apiUrl}/projects/${projectId}/gastos`;

  list(projectId: string, filters: Record<string, string> = {}) {
    const params = new HttpParams({ fromObject: filters });
    return this.http.get<Gasto[]>(this.base(projectId), { params });
  }

  create(projectId: string, formData: FormData) {
    return this.http.post<Gasto>(this.base(projectId), formData);
  }

  update(projectId: string, id: string, data: any) {
    return this.http.put<Gasto>(`${this.base(projectId)}/${id}`, data);
  }

  addPago(projectId: string, gastoId: string, pago: any) {
    return this.http.post<Gasto>(`${this.base(projectId)}/${gastoId}/pagos`, pago);
  }

  removePago(projectId: string, gastoId: string, pagoId: string) {
    return this.http.delete<Gasto>(`${this.base(projectId)}/${gastoId}/pagos/${pagoId}`);
  }

  patchComprobante(projectId: string, id: string, file: File) {
    const fd = new FormData();
    fd.append('comprobante', file);
    return this.http.patch<Gasto>(`${this.base(projectId)}/${id}/comprobante`, fd);
  }

  addComprobante(projectId: string, gastoId: string, file: File) {
    const fd = new FormData();
    fd.append('comprobante', file);
    return this.http.post<Gasto>(`${this.base(projectId)}/${gastoId}/comprobantes`, fd);
  }

  removeComprobante(projectId: string, gastoId: string, comprobanteId: string) {
    return this.http.delete<Gasto>(`${this.base(projectId)}/${gastoId}/comprobantes/${comprobanteId}`);
  }

  remove(projectId: string, id: string) {
    return this.http.delete(`${this.base(projectId)}/${id}`);
  }
}
