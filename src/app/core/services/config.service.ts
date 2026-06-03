import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface EtapaPlantilla {
  _id: string;
  nombre: string;
  codigo: string;
  orden: number;
  descripcion?: string;
}

export interface Rubro {
  _id: string;
  nombre: string;
  codigo: string;
  descripcion?: string;
  activo: boolean;
}

export interface Subrubro {
  _id: string;
  nombre: string;
  codigo: string;
  rubroId: { _id: string; nombre: string; codigo: string };
  descripcion?: string;
  activo: boolean;
}

export interface Item {
  _id: string;
  nombre: string;
  unidad: string;
  descripcion?: string;
  activo: boolean;
  subrubroId: {
    _id: string;
    nombre: string;
    codigo: string;
    rubroId: { _id: string; nombre: string; codigo: string };
  };
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/config`;

  getEtapas()    { return this.http.get<EtapaPlantilla[]>(`${this.base}/etapas`); }
  getRubros()    { return this.http.get<Rubro[]>(`${this.base}/rubros`); }
  getSubrubros() { return this.http.get<Subrubro[]>(`${this.base}/subrubros`); }

  createEtapa(data: Partial<EtapaPlantilla>)   { return this.http.post<EtapaPlantilla>(`${this.base}/etapas`, data); }
  createRubro(data: Partial<Rubro>)             { return this.http.post<Rubro>(`${this.base}/rubros`, data); }
  createSubrubro(data: any)                     { return this.http.post<Subrubro>(`${this.base}/subrubros`, data); }

  updateEtapa(id: string, data: Partial<EtapaPlantilla>) { return this.http.put<EtapaPlantilla>(`${this.base}/etapas/${id}`, data); }
  updateRubro(id: string, data: Partial<Rubro>)           { return this.http.put<Rubro>(`${this.base}/rubros/${id}`, data); }
  updateSubrubro(id: string, data: any)                   { return this.http.put<Subrubro>(`${this.base}/subrubros/${id}`, data); }

  deleteEtapa(id: string)    { return this.http.delete(`${this.base}/etapas/${id}`); }
  deleteRubro(id: string)    { return this.http.delete(`${this.base}/rubros/${id}`); }
  deleteSubrubro(id: string) { return this.http.delete(`${this.base}/subrubros/${id}`); }

  getItems(subrubroId?: string) {
    const params = subrubroId ? `?subrubroId=${subrubroId}` : '';
    return this.http.get<Item[]>(`${this.base}/items${params}`);
  }
  createItem(data: { nombre: string; unidad: string; descripcion?: string; subrubroId: string; activo?: boolean }) { return this.http.post<Item>(`${this.base}/items`, data); }
  updateItem(id: string, data: Partial<Item>)              { return this.http.put<Item>(`${this.base}/items/${id}`, data); }
  deleteItem(id: string)                                   { return this.http.delete(`${this.base}/items/${id}`); }
}
