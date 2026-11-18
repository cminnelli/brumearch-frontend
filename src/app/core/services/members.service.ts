import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type MemberRole = 'editor' | 'lector';
/** Rol efectivo en un proyecto. 'admin' = superadmin. */
export type ProjectRole = 'admin' | MemberRole;

export interface ProjectMember {
  _id: string;
  email: string;
  role: MemberRole;
  cargo?: string;
  createdAt: string;
  registrado: boolean;
  user: { name: string; avatar?: string } | null;
}

export interface PlatformUser {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  isActive: boolean;
  superadmin: boolean;
  superadminFijo: boolean;
  createdAt: string;
  proyectos: { _id: string; name: string; role: MemberRole }[];
}

@Injectable({ providedIn: 'root' })
export class MembersService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  myRole(projectId: string): Observable<{ role: ProjectRole }> {
    return this.http.get<{ role: ProjectRole }>(`${this.api}/projects/${projectId}/access`);
  }
  list(projectId: string): Observable<ProjectMember[]> {
    return this.http.get<ProjectMember[]>(`${this.api}/projects/${projectId}/members`);
  }
  add(projectId: string, data: { email: string; role: MemberRole; cargo?: string }): Observable<ProjectMember> {
    return this.http.post<ProjectMember>(`${this.api}/projects/${projectId}/members`, data);
  }
  update(projectId: string, memberId: string, data: Partial<Pick<ProjectMember, 'role' | 'cargo'>>): Observable<ProjectMember> {
    return this.http.put<ProjectMember>(`${this.api}/projects/${projectId}/members/${memberId}`, data);
  }
  remove(projectId: string, memberId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.api}/projects/${projectId}/members/${memberId}`);
  }

  users(): Observable<PlatformUser[]> {
    return this.http.get<PlatformUser[]>(`${this.api}/users`);
  }
  updateUser(id: string, data: { superadmin?: boolean; isActive?: boolean }): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`${this.api}/users/${id}`, data);
  }
}
