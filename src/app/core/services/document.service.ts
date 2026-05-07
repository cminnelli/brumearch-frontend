import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type DocTipo = 'planos' | 'reglamentos' | 'contratos' | 'presupuestos' | 'gastos' | 'fotos' | 'otros';

export const DOC_TIPO_LABELS: Record<DocTipo, string> = {
  planos:        'Planos',
  reglamentos:   'Reglamentos',
  contratos:     'Contratos',
  presupuestos:  'Presupuestos',
  gastos:        'Gastos',
  fotos:         'Fotos',
  otros:         'Otros',
};

export const DOC_TIPO_ICONS: Record<DocTipo, string> = {
  planos:        '📐',
  reglamentos:   '📋',
  contratos:     '📑',
  presupuestos:  '💰',
  gastos:        '🧾',
  fotos:         '🖼️',
  otros:         '📎',
};

export const DOC_TIPO_ORDER: DocTipo[] = ['planos', 'contratos', 'reglamentos', 'presupuestos', 'gastos', 'fotos', 'otros'];

export interface ProjectDocument {
  _id: string;
  project: string;
  originalName: string;
  filename: string;
  mimetype: string;
  size: number;
  tipo: DocTipo;
  parseStatus: 'pending' | 'parsed' | 'failed' | 'skipped';
  parsedData?: any;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private http = inject(HttpClient);

  private url(projectId: string) {
    return `${environment.apiUrl}/projects/${projectId}/documents`;
  }

  list(projectId: string) {
    return this.http.get<ProjectDocument[]>(this.url(projectId));
  }

  upload(projectId: string, file: File, tipo: DocTipo = 'otros') {
    const form = new FormData();
    form.append('file', file);
    form.append('tipo', tipo);
    return this.http.post<ProjectDocument>(this.url(projectId), form);
  }

  remove(projectId: string, docId: string) {
    return this.http.delete<void>(`${this.url(projectId)}/${docId}`);
  }
}
