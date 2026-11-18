import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MembersService, PlatformUser, MemberRole } from '../../core/services/members.service';
import { ProjectService } from '../../core/services/project.service';
import { AuthService } from '../../core/services/auth.service';
import { Project } from '../../shared/models/project.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

type Filtro = 'todos' | 'sin_asignar' | 'superadmin' | 'desactivados';
const SIETE_DIAS = 7 * 86400000;

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, AvatarComponent],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.scss',
})
export class UsuariosComponent implements OnInit {
  private svc      = inject(MembersService);
  private projects = inject(ProjectService);
  private auth     = inject(AuthService);

  users    = signal<PlatformUser[]>([]);
  proyectos = signal<Project[]>([]);
  loading  = signal(true);
  error    = signal('');
  query    = signal('');
  filtro   = signal<Filtro>('todos');

  /** Usuario con el panel "Dar acceso" abierto y su formulario. */
  asignando = signal<string | null>(null);
  form: { projectId: string; role: MemberRole; cargo: string } = { projectId: '', role: 'lector', cargo: '' };
  guardando = signal(false);

  esNuevo = (u: PlatformUser) => Date.now() - new Date(u.createdAt).getTime() < SIETE_DIAS;
  sinAsignar = (u: PlatformUser) => u.isActive && !u.superadmin && !u.proyectos.length;

  conteo = computed(() => ({
    todos: this.users().length,
    sin_asignar: this.users().filter(this.sinAsignar).length,
    superadmin: this.users().filter(u => u.superadmin).length,
    desactivados: this.users().filter(u => !u.isActive).length,
  }));

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const f = this.filtro();
    return this.users()
      .filter(u => f === 'todos' || (f === 'sin_asignar' ? this.sinAsignar(u) : f === 'superadmin' ? u.superadmin : !u.isActive))
      .filter(u => !q || u.name.toLowerCase().includes(q) || u.email.includes(q))
      // los que esperan asignación primero, después los más recientes
      .sort((a, b) => Number(this.sinAsignar(b)) - Number(this.sinAsignar(a)) || +new Date(b.createdAt) - +new Date(a.createdAt));
  });

  filtros: { id: Filtro; label: string }[] = [
    { id: 'todos', label: 'Todos' }, { id: 'sin_asignar', label: 'Sin asignar' },
    { id: 'superadmin', label: 'Superadmin' }, { id: 'desactivados', label: 'Desactivados' },
  ];

  ngOnInit() {
    this.load();
    this.projects.getAll().subscribe(p => this.proyectos.set(p));
  }

  load() {
    this.svc.users().subscribe({
      next: (u) => { this.users.set(u); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar la lista de usuarios.'); this.loading.set(false); },
    });
  }

  isMe(u: PlatformUser) { return u._id === this.auth.currentUser()?._id; }

  /** Proyectos a los que la persona todavía no tiene acceso. */
  disponibles(u: PlatformUser) {
    const tiene = new Set(u.proyectos.map(p => p._id));
    return this.proyectos().filter(p => !tiene.has(p._id));
  }

  abrirAsignar(u: PlatformUser) {
    if (this.asignando() === u._id) { this.asignando.set(null); return; }
    const libres = this.disponibles(u);
    this.form = { projectId: libres.length === 1 ? libres[0]._id : '', role: 'lector', cargo: '' };
    this.asignando.set(u._id);
    this.error.set('');
  }

  asignar(u: PlatformUser) {
    if (!this.form.projectId || this.guardando()) return;
    this.guardando.set(true);
    this.svc.add(this.form.projectId, { email: u.email, role: this.form.role, cargo: this.form.cargo || undefined }).subscribe({
      next: () => { this.guardando.set(false); this.asignando.set(null); this.load(); },
      error: (e: HttpErrorResponse) => { this.error.set(e.error?.message ?? 'No se pudo dar el acceso.'); this.guardando.set(false); },
    });
  }

  quitar(u: PlatformUser, p: PlatformUser['proyectos'][number]) {
    if (!confirm(`¿Quitar a ${u.name} de "${p.name}"?`)) return;
    this.svc.remove(p._id, p.memberId).subscribe({
      next: () => this.load(),
      error: () => this.error.set('No se pudo quitar el acceso.'),
    });
  }

  toggleSuper(u: PlatformUser) {
    const next = !u.superadmin;
    const msg = next
      ? `¿Dar rol de superadmin a ${u.name}? Va a poder ver y modificar todos los proyectos y administrar usuarios.`
      : `¿Quitar el rol de superadmin a ${u.name}?`;
    if (!confirm(msg)) return;
    this.patch(u, { superadmin: next });
  }

  toggleActive(u: PlatformUser) {
    const next = !u.isActive;
    if (!confirm(next ? `¿Reactivar a ${u.name}?` : `¿Desactivar a ${u.name}? No va a poder entrar a la plataforma.`)) return;
    this.patch(u, { isActive: next });
  }

  private patch(u: PlatformUser, data: { superadmin?: boolean; isActive?: boolean }) {
    this.error.set('');
    this.svc.updateUser(u._id, data).subscribe({
      next: () => this.users.update(list => list.map(x => x._id === u._id ? { ...x, ...data } : x)),
      error: (e: HttpErrorResponse) => this.error.set(e.error?.message ?? 'No se pudo guardar el cambio.'),
    });
  }
}
