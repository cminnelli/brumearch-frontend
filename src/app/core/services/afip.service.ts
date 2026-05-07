import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AfipData {
  razonSocial:  string;
  activo:       boolean;
  condicionIva: '' | 'responsable_inscripto' | 'monotributo' | 'exento';
  domicilio?:   string;
}

export function isValidCuit(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11;
}

@Injectable({ providedIn: 'root' })
export class AfipService {
  private http = inject(HttpClient);

  lookup(cuit: string): Observable<AfipData> {
    const digits = cuit.replace(/\D/g, '');
    return this.http.get<AfipData>(`${environment.apiUrl}/afip/${digits}`);
  }
}
