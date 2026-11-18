import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MembersService, PlatformUser } from '../../core/services/members.service';
import { AuthService } from '../../core/services/auth.service';
import { fileUrl } from '../../shared/utils/file-url';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.scss',
})
export class UsuariosComponent implements OnInit {
  private svc  = inject(MembersService);
  private auth = inject(AuthService);

  users   = signal<PlatformUser[]>([]);
  loading = signal(true);
  error   = signal('');
  query   = signal('');
  fileUrl = fileUrl;

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.users().filter(u => u.name.toLowerCase().includes(q) || u.email.includes(q)) : this.users();
  });
  superCount = computed(() => this.users().filter(u => u.superadmin).length);

  ngOnInit() { this.load(); }

  load() {
    this.svc.users().subscribe({
      next: (u) => { this.users.set(u); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar la lista de usuarios.'); this.loading.set(false); },
    });
  }

  isMe(u: PlatformUser) { return u._id === this.auth.currentUser()?._id; }

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

  initials(u: PlatformUser) { return u.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase(); }
}
