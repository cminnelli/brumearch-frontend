import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MembersService, ProjectMember, MemberRole } from '../../../../core/services/members.service';
import { fileUrl } from '../../../../shared/utils/file-url';

@Component({
  selector: 'app-equipo',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './equipo.component.html',
  styleUrl: './equipo.component.scss',
})
export class EquipoComponent implements OnInit {
  @Input({ required: true }) projectId!: string;
  /** Solo el superadmin invita, cambia roles y quita accesos. */
  @Input() canManage = false;

  private svc = inject(MembersService);

  members = signal<ProjectMember[]>([]);
  loading = signal(true);
  error   = signal('');
  saving  = signal(false);

  form: { email: string; role: MemberRole; cargo: string } = { email: '', role: 'lector', cargo: '' };
  fileUrl = fileUrl;

  ngOnInit() { this.load(); }

  load() {
    this.svc.list(this.projectId).subscribe({
      next: (m) => { this.members.set(m); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el equipo.'); this.loading.set(false); },
    });
  }

  invite() {
    if (!this.form.email.trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.svc.add(this.projectId, { email: this.form.email, role: this.form.role, cargo: this.form.cargo || undefined }).subscribe({
      next: () => {
        this.form = { email: '', role: 'lector', cargo: '' };
        this.saving.set(false);
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.error.set(e.error?.message ?? 'No se pudo agregar a la persona.');
        this.saving.set(false);
      },
    });
  }

  changeRole(m: ProjectMember, role: MemberRole) {
    if (role === m.role) return;
    this.svc.update(this.projectId, m._id, { role }).subscribe({
      next: () => this.members.update(list => list.map(x => x._id === m._id ? { ...x, role } : x)),
      error: () => this.error.set('No se pudo cambiar el rol.'),
    });
  }

  remove(m: ProjectMember) {
    if (!confirm(`¿Quitar el acceso de ${m.user?.name ?? m.email} a este proyecto?`)) return;
    this.svc.remove(this.projectId, m._id).subscribe({
      next: () => this.members.update(list => list.filter(x => x._id !== m._id)),
      error: () => this.error.set('No se pudo quitar el acceso.'),
    });
  }

  initials(m: ProjectMember): string {
    return (m.user?.name ?? m.email).split(/[\s@.]+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase();
  }
}
