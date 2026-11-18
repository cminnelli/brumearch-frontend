import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { DashboardService, ProjectSummary, fmtMoney } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { fileUrl } from '../../shared/utils/file-url';
import { ProjectService } from '../../core/services/project.service';
import { DocumentService, ProjectDocument } from '../../core/services/document.service';
import {
  Project,
  ProjectType,
  ProjectStatus,
  PROJECT_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
} from '../../shared/models/project.model';
import { AddressSearchComponent, ParsedAddress } from '../../shared/components/address-search/address-search.component';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AddressSearchComponent],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent implements OnInit {
  private projectService = inject(ProjectService);
  private documentService = inject(DocumentService);
  private dashboard = inject(DashboardService);
  private route = inject(ActivatedRoute);
  auth = inject(AuthService);

  projects = signal<ProjectSummary[]>([]);
  loading  = signal(true);
  query    = signal('');
  filtro   = signal<'todos' | ProjectStatus>('todos');
  vista    = signal<'tarjetas' | 'tabla'>((localStorage.getItem('proj_vista') as 'tarjetas' | 'tabla') || 'tarjetas');
  fmt = fmtMoney;
  fileUrl = fileUrl;

  conteo = computed(() => {
    const c: Record<string, number> = { todos: this.projects().length };
    for (const p of this.projects()) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  });
  visibles = computed(() => {
    const q = this.query().trim().toLowerCase();
    const f = this.filtro();
    return this.projects().filter(p =>
      (f === 'todos' || p.status === f) &&
      (!q || [p.name, p.client, p.city].some(v => v?.toLowerCase().includes(q))));
  });
  filtros: { id: 'todos' | ProjectStatus; label: string }[] = [
    { id: 'todos', label: 'Todos' }, { id: 'active', label: 'Activos' }, { id: 'draft', label: 'Borradores' },
    { id: 'completed', label: 'Completados' }, { id: 'archived', label: 'Archivados' },
  ];
  setVista(v: 'tarjetas' | 'tabla') { this.vista.set(v); try { localStorage.setItem('proj_vista', v); } catch { /* sin storage */ } }
  ejecucion(p: ProjectSummary) {
    const mon = (['USD', 'ARS', 'EUR'] as const).find(m => p.aprobado[m] > 0 || p.gastado[m] > 0);
    if (!mon) return null;
    const aprobado = p.aprobado[mon], gastado = p.gastado[mon];
    return { moneda: mon, gastado, aprobado, pct: aprobado ? Math.min(100, Math.round(gastado / aprobado * 100)) : 0 };
  }
  showForm = signal(false);
  docsMap = signal<Record<string, ProjectDocument[] | undefined>>({});
  uploadingFor = signal<string | null>(null);
  addressMode = signal<'maps' | 'manual'>('manual');

  typeOptions = Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value: value as ProjectType, label }));
  statusOptions = Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value: value as ProjectStatus, label }));

  form = this.emptyForm();

  ngOnInit() {
    this.load();
    if (this.route.snapshot.queryParamMap.get('nuevo') && this.auth.isAdmin) this.showForm.set(true);
  }

  load() {
    this.dashboard.get().subscribe({
      next: (d) => { this.projects.set(d.proyectos); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadDocs(projectId: string) {
    this.documentService.list(projectId).subscribe((docs) => {
      this.docsMap.update((m) => ({ ...m, [projectId]: docs }));
    });
  }

  onFileSelected(event: Event, projectId: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingFor.set(projectId);
    this.documentService.upload(projectId, file).subscribe({
      next: () => {
        this.uploadingFor.set(null);
        this.loadDocs(projectId);
        input.value = '';
      },
      error: () => {
        this.uploadingFor.set(null);
        input.value = '';
      },
    });
  }

  deleteDoc(projectId: string, docId: string) {
    this.documentService.remove(projectId, docId).subscribe(() => this.loadDocs(projectId));
  }

  fileIcon(mime: string): string {
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
    if (mime.includes('word')) return '📝';
    if (mime.includes('image')) return '🖼️';
    return '📎';
  }

  toggleForm() {
    this.showForm.update((v) => !v);
    if (!this.showForm()) {
      this.form = this.emptyForm();
      this.addressMode.set('manual');
    }
  }

  onAddressSelected(parsed: ParsedAddress | null) {
    if (!parsed) return;
    this.form.address = parsed.street || parsed.address;
    this.form.neighborhood = parsed.neighborhood;
    this.form.city = parsed.city;
    this.form.province = parsed.province;
    this.form.country = parsed.country || this.form.country;
    this.form.lat = parsed.lat;
    this.form.lng = parsed.lng;
  }

  create() {
    if (!this.form.name.trim()) return;
    const payload: Partial<Project> = {
      name: this.form.name,
      description: this.form.description || undefined,
      type: this.form.type as ProjectType,
      status: this.form.status as ProjectStatus,
      owner:  { name: this.form.client || undefined },
      owners: this.form.client ? [{ name: this.form.client }] : [],
      startDate: this.form.startDate || undefined,
      endDate: this.form.endDate || undefined,
      location: {
        address: this.form.address || undefined,
        neighborhood: this.form.neighborhood || undefined,
        city: this.form.city || undefined,
        province: this.form.province || undefined,
        country: this.form.country || 'Argentina',
        coordinates: (this.form.lat && this.form.lng)
          ? { lat: this.form.lat, lng: this.form.lng }
          : undefined,
      },
      features: {
        levels: this.form.floors || undefined,
        surface: this.form.builtSurface || undefined,
        lotSurface: this.form.lotSurface || undefined,
        units: this.form.units || undefined,
      },
      budget: {
        estimated: this.form.budgetEstimated || undefined,
        currency: this.form.budgetCurrency,
      },
    };
    this.projectService.create(payload).subscribe(() => {
      this.form = this.emptyForm();
      this.showForm.set(false);
      this.load();
    });
  }

  delete(id: string, name: string) {
    if (!confirm(`¿Eliminar el proyecto "${name}"? Esta acción no se puede deshacer.`)) return;
    this.projectService.delete(id).subscribe(() => this.load());
  }

  typeLabel(type: ProjectType) { return PROJECT_TYPE_LABELS[type] ?? type; }
  statusLabel(status: ProjectStatus) { return PROJECT_STATUS_LABELS[status] ?? status; }
  locationStr(p: ProjectSummary) { return p.city ?? ''; }

  private emptyForm() {
    return {
      name: '', description: '', type: 'residential', status: 'draft',
      client: '', startDate: '', endDate: '',
      address: '', neighborhood: '', city: '', province: '', country: 'Argentina',
      lat: null as number | null, lng: null as number | null,
      floors: null as number | null, basements: null as number | null,
      units: null as number | null, lotSurface: null as number | null,
      builtSurface: null as number | null,
      budgetEstimated: null as number | null, budgetCurrency: 'USD',
    };
  }
}
