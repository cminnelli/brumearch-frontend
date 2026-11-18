import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MembersService, ProjectMember, PlatformUser } from '../../../../core/services/members.service';
import { ProjectService } from '../../../../core/services/project.service';
import { Project, ProjectOwner } from '../../../../shared/models/project.model';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';

export type PersonaRol = 'propietario' | 'editor' | 'lector';

interface Persona {
  key: string;
  rol: PersonaRol;
  name: string;
  email: string;
  phone: string;
  cargo?: string;
  avatar?: string;
  /** Solo miembros: ¿ya se registró en la plataforma? */
  registrado?: boolean;
  memberId?: string;
}

const clave = (o: { email?: string; name?: string }) => (o.email || o.name || '').toLowerCase();

/**
 * Todas las personas de un proyecto en un solo lugar:
 *  - Propietario: el cliente. Ve su portal (avance, selecciones, caja) con el email que cargamos acá.
 *  - Editor / Lector: gente del estudio o externos con acceso a este proyecto.
 */
@Component({
  selector: 'app-personas',
  standalone: true,
  imports: [FormsModule, AvatarComponent],
  templateUrl: './personas.component.html',
  styleUrl: './personas.component.scss',
})
export class PersonasComponent implements OnInit {
  @Input({ required: true }) project!: Project;
  /** Superadmin: puede dar acceso al equipo. */
  @Input() canManage = false;
  /** Editor o superadmin: puede cargar propietarios. */
  @Input() canEdit = false;
  @Output() projectChange = new EventEmitter<Project>();

  private members = inject(MembersService);
  private projects = inject(ProjectService);

  miembros  = signal<ProjectMember[]>([]);
  usuarios  = signal<PlatformUser[]>([]);
  loading   = signal(true);
  saving    = signal(false);
  error     = signal('');
  editKey   = signal<string | null>(null);
  editForm  = { name: '', phone: '', email: '' };

  form: { name: string; email: string; phone: string; rol: PersonaRol; cargo: string } = this.vacio();
  sugeridos = signal(false);

  private vacio() { return { name: '', email: '', phone: '', rol: 'propietario' as PersonaRol, cargo: '' }; }

  /** Propietarios (campo legacy `owner` + `owners`, sin duplicados). */
  propietarios = computed<ProjectOwner[]>(() => {
    const p = this.project;
    const all = [...(p.owner?.name || p.owner?.email ? [p.owner!] : []), ...(p.owners ?? [])];
    const seen = new Set<string>();
    return all.filter(o => { const k = clave(o); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  });

  personas = computed<Persona[]>(() => {
    const usuarios = this.usuarios();
    const owners: Persona[] = this.propietarios().map(o => ({
      key: 'o:' + clave(o), rol: 'propietario', name: o.name || '', email: o.email || '', phone: o.phone || '',
      avatar: usuarios.find(u => u.email === (o.email || '').toLowerCase())?.avatar,
    }));
    const mems: Persona[] = this.miembros().map(m => ({
      key: 'm:' + m._id, rol: m.role, name: m.user?.name ?? '', email: m.email, phone: '', cargo: m.cargo,
      avatar: m.user?.avatar, registrado: m.registrado, memberId: m._id,
    }));
    return [...owners, ...mems];
  });

  /** Sugerencias de usuarios ya registrados (solo superadmin) mientras se escribe. */
  get coincidencias(): PlatformUser[] {
    const q = (this.form.name + ' ' + this.form.email).trim().toLowerCase();
    if (!this.canManage || q.length < 2) return [];
    const ya = new Set(this.personas().map(p => p.email.toLowerCase()).filter(Boolean));
    return this.usuarios().filter(u => !ya.has(u.email) && (u.name.toLowerCase().includes(q) || u.email.includes(q))).slice(0, 6);
  }

  ngOnInit() {
    this.cargarMiembros();
    if (this.canManage) this.members.users().subscribe(u => this.usuarios.set(u));
  }

  cargarMiembros() {
    this.members.list(this.project._id).subscribe({
      next: (m) => { this.miembros.set(m); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el equipo.'); this.loading.set(false); },
    });
  }

  elegir(u: PlatformUser) {
    this.form.name = u.name; this.form.email = u.email;
    this.form.rol = this.form.rol === 'propietario' ? 'lector' : this.form.rol;
    this.sugeridos.set(false);
  }

  // ── Alta ───────────────────────────────────────────────
  agregar() {
    const email = this.form.email.trim().toLowerCase();
    const name = this.form.name.trim();
    if (this.saving()) return;
    if (this.form.rol === 'propietario') {
      if (!name && !email) { this.error.set('Cargá al menos el nombre o el email.'); return; }
      if (this.propietarios().some(o => clave(o) === (email || name.toLowerCase()))) { this.error.set('Esa persona ya figura como propietaria.'); return; }
      this.guardarPropietarios([...this.propietarios(), { name, email, phone: this.form.phone.trim() }], () => { this.form = this.vacio(); });
    } else {
      if (!email) { this.error.set('Para dar acceso al equipo necesitamos el email.'); return; }
      this.run(this.members.add(this.project._id, { email, role: this.form.rol, cargo: this.form.cargo || undefined }), () => { this.form = this.vacio(); this.cargarMiembros(); });
    }
  }

  // ── Cambios ────────────────────────────────────────────
  cambiarRol(p: Persona, rol: PersonaRol) {
    if (rol === p.rol) return;
    if (p.rol !== 'propietario' && rol !== 'propietario') {
      this.run(this.members.update(this.project._id, p.memberId!, { role: rol }), () => this.cargarMiembros());
      return;
    }
    if (rol === 'propietario') {            // miembro → propietario
      this.run(this.members.remove(this.project._id, p.memberId!), () => {
        this.guardarPropietarios([...this.propietarios(), { name: p.name, email: p.email, phone: '' }], () => this.cargarMiembros());
      });
    } else {                                // propietario → miembro
      if (!p.email) { this.error.set('Para darle acceso al equipo necesitamos su email.'); return; }
      const resto = this.propietarios().filter(o => clave(o) !== clave(p));
      this.guardarPropietarios(resto, () => {
        this.run(this.members.add(this.project._id, { email: p.email, role: rol }), () => this.cargarMiembros());
      });
    }
  }

  editar(p: Persona) { this.editKey.set(p.key); this.editForm = { name: p.name, phone: p.phone, email: p.email }; }
  guardarEdicion(p: Persona) {
    const lista = this.propietarios().map(o => clave(o) === clave(p) ? { ...o, name: this.editForm.name.trim(), phone: this.editForm.phone.trim(), email: this.editForm.email.trim().toLowerCase() } : o);
    this.guardarPropietarios(lista, () => this.editKey.set(null));
  }

  quitar(p: Persona) {
    if (!confirm(`¿Quitar a ${p.name || p.email} de este proyecto?`)) return;
    if (p.rol === 'propietario') this.guardarPropietarios(this.propietarios().filter(o => clave(o) !== clave(p)));
    else this.run(this.members.remove(this.project._id, p.memberId!), () => this.cargarMiembros());
  }

  puedeGestionar(p: Persona) { return p.rol === 'propietario' ? this.canEdit : this.canManage; }

  // ── Internos ───────────────────────────────────────────
  private guardarPropietarios(lista: ProjectOwner[], ok?: () => void) {
    this.saving.set(true); this.error.set('');
    this.projects.update(this.project._id, { owners: lista, owner: lista[0] ?? { name: '', email: '', phone: '' } }).subscribe({
      next: (p) => { this.saving.set(false); this.project = { ...this.project, owners: p.owners, owner: p.owner }; this.projectChange.emit(this.project); ok?.(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.error.set(e.error?.message ?? 'No se pudo guardar.'); },
    });
  }

  private run<T>(obs: import('rxjs').Observable<T>, ok: () => void) {
    this.saving.set(true); this.error.set('');
    obs.subscribe({
      next: () => { this.saving.set(false); ok(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.error.set(e.error?.message ?? 'No se pudo completar la acción.'); },
    });
  }
}
