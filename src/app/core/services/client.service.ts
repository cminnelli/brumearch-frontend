import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClientProject } from '../../shared/models/client-project.model';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private http    = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/client`;

  listProjects(): Observable<{ projects: ClientProject[] }> {
    return this.http.get<{ projects: ClientProject[] }>(`${this.baseUrl}/projects`);
  }

  getProject(id: string): Observable<{ project: ClientProject }> {
    return this.http.get<{ project: ClientProject }>(`${this.baseUrl}/projects/${id}`);
  }
}
