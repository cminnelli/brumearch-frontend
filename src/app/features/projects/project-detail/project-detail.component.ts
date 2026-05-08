import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { DocumentService, ProjectDocument, DocTipo, DOC_TIPO_LABELS, DOC_TIPO_ICONS, DOC_TIPO_ORDER } from '../../../core/services/document.service';
import { PresupuestoService } from '../../../core/services/presupuesto.service';
import { GastoService } from '../../../core/services/gasto.service';
import { ReservaService } from '../../../core/services/reserva.service';
import { ConfigService, Rubro, Subrubro } from '../../../core/services/config.service';
import {
  Project, ProjectType, ProjectStatus, ProjectService as ProjService,
  PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS, SERVICE_LABELS,
} from '../../../shared/models/project.model';
import { Presupuesto, Gasto, totalPagadoGasto, Reserva, Moneda, saldoReserva } from '../../../shared/models/obra.model';
import { ObraComponent } from './obra/obra.component';
import { CajaComponent } from './caja/caja.component';
import { EtapasComponent } from './etapas/etapas.component';
import { PlanificacionComponent } from './planificacion/planificacion.component';
import { SafePipe } from '../../../shared/pipes/safe.pipe';
import { ArsNumPipe } from '../../../shared/pipes/ars-num.pipe';
import { ChatContextService } from '../../../core/services/chat-context.service';

type DetailTab = 'info' | 'documentos' | 'resumen' | 'obra' | 'caja' | 'config' | 'planificacion';

const ALL_SERVICES = Object.entries(SERVICE_LABELS) as [ProjService, string][];

export interface SubrubroResumen {
  subrubroId: string;
  subrubroNombre: string;
  presupuestado: number;
  gastado: number;
  pagado: number;
}

export interface RubroResumen {
  rubroId: string;
  rubroNombre: string;
  subrubros: SubrubroResumen[];
  presupuestado: number;
  gastado: number;
  pagado: number;
}

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ObraComponent, CajaComponent, EtapasComponent, PlanificacionComponent, SafePipe, ArsNumPipe],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss',
})
export class ProjectDetailComponent implements OnInit, OnDestroy {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private projectService = inject(ProjectService);
  private documentService = inject(DocumentService);
  private presSvc        = inject(PresupuestoService);
  private gastoSvc       = inject(GastoService);
  private cfgSvc         = inject(ConfigService);
  private reservaSvc     = inject(ReservaService);
  private chatCtx        = inject(ChatContextService);

  project = signal<Project | null>(null);
  docs    = signal<ProjectDocument[]>([]);
  loading = signal(true);
  editing = signal(false);
  uploading      = signal(false);
  coverUploading = signal(false);
  showUploadPanel = signal(false);
  uploadTipo      = signal<DocTipo>('otros');
  docFiltroTipo = signal<DocTipo | 'todos'>('todos');

  docsFiltered = computed(() => {
    const tipo = this.docFiltroTipo();
    const all = [...this.docs()].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    return tipo === 'todos' ? all : all.filter(d => (d.tipo || 'otros') === tipo);
  });

  readonly DOC_TIPO_LABELS  = DOC_TIPO_LABELS;
  readonly DOC_TIPO_ICONS   = DOC_TIPO_ICONS;
  readonly DOC_TIPOS        = DOC_TIPO_ORDER;

  docsPorTipo = computed(() => {
    const groups = new Map<DocTipo, ProjectDocument[]>();
    for (const d of this.docs()) {
      const t: DocTipo = (d.tipo || 'otros') as DocTipo;
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t)!.push(d);
    }
    return DOC_TIPO_ORDER
      .filter(t => groups.has(t))
      .map(t => ({ tipo: t, label: DOC_TIPO_LABELS[t], icon: DOC_TIPO_ICONS[t], docs: groups.get(t)! }));
  });

  // Resumen data
  presupuestos  = signal<Presupuesto[]>([]);
  gastos        = signal<Gasto[]>([]);
  rubros        = signal<Rubro[]>([]);
  allSubrubros  = signal<Subrubro[]>([]);
  reservas      = signal<Reserva[]>([]);
  resumenLoaded   = signal(false);
  configSection   = signal<string>('etapas');

  activeTab = toSignal(
    this.route.queryParamMap.pipe(map(p => (p.get('tab') as DetailTab) || 'info')),
    { initialValue: 'info' as DetailTab }
  );
  previewDoc = signal<ProjectDocument | null>(null);

  allServices   = ALL_SERVICES;
  statusOptions = Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
  form: any = {};

  // ── Resumen computed ─────────────────────────────────────
  resumenPorRubro = computed<RubroResumen[]>(() => {
    if (!this.resumenLoaded()) return [];
    const subs = this.allSubrubros();
    const pres = this.presupuestos().filter(p => p.estado === 'aprobado');
    const gsts = this.gastos();

    const map = new Map<string, RubroResumen>();

    // Init rubros from presupuestos
    for (const p of pres) {
      const sub = subs.find(s => s._id === p.subrubroId._id);
      if (!sub) continue;
      const rubroId = sub.rubroId._id;
      const rubroNombre = sub.rubroId.nombre;
      if (!map.has(rubroId)) map.set(rubroId, { rubroId, rubroNombre, subrubros: [], presupuestado: 0, gastado: 0, pagado: 0 });
      const r = map.get(rubroId)!;
      r.presupuestado += p.monto;
      let sr = r.subrubros.find(s => s.subrubroId === p.subrubroId._id);
      if (!sr) { sr = { subrubroId: p.subrubroId._id, subrubroNombre: sub.nombre, presupuestado: 0, gastado: 0, pagado: 0 }; r.subrubros.push(sr); }
      sr.presupuestado += p.monto;
    }

    // Add gastos
    for (const g of gsts) {
      const sub = subs.find(s => s._id === g.subrubroId._id);
      if (!sub) continue;
      const rubroId = sub.rubroId._id;
      const rubroNombre = sub.rubroId.nombre;
      if (!map.has(rubroId)) map.set(rubroId, { rubroId, rubroNombre, subrubros: [], presupuestado: 0, gastado: 0, pagado: 0 });
      const r = map.get(rubroId)!;
      const gPagado = totalPagadoGasto(g);
      r.gastado += g.monto;
      r.pagado  += gPagado;
      let sr = r.subrubros.find(s => s.subrubroId === g.subrubroId._id);
      if (!sr) { sr = { subrubroId: g.subrubroId._id, subrubroNombre: sub.nombre, presupuestado: 0, gastado: 0, pagado: 0 }; r.subrubros.push(sr); }
      sr.gastado += g.monto;
      sr.pagado  += gPagado;
    }

    return Array.from(map.values());
  });

  totalPresupuestado = computed(() => this.presupuestos().filter(p => p.estado === 'aprobado').reduce((s, p) => s + p.monto, 0));
  totalGastado       = computed(() => this.gastos().reduce((s, g) => s + g.monto, 0));
  totalPagado        = computed(() => this.gastos().reduce((s, g) => s + totalPagadoGasto(g), 0));
  totalPorPagar      = computed(() => this.totalGastado() - this.totalPagado());

  saldoReservasPorMoneda = computed(() => {
    const map = new Map<Moneda, { ingresado: number; egresado: number; saldo: number }>();
    for (const r of this.reservas()) {
      const cur = map.get(r.moneda) ?? { ingresado: 0, egresado: 0, saldo: 0 };
      const s = saldoReserva(r);
      const ing = r.movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
      const eg  = r.movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0);
      map.set(r.moneda, { ingresado: cur.ingresado + ing, egresado: cur.egresado + eg, saldo: cur.saldo + s });
    }
    return Array.from(map.entries())
      .map(([moneda, v]) => ({ moneda, ...v }))
      .filter(v => v.ingresado > 0 || v.egresado > 0);
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.projectService.getById(id).subscribe({
      next: (p) => {
        this.project.set(p);
        this.loading.set(false);
        this.chatCtx.setProject(p._id, p.name);
        this.documentService.list(id).subscribe(d => this.docs.set(d));
        this.loadResumen(id);
      },
      error: () => this.router.navigate(['/projects']),
    });
  }

  loadResumen(projectId: string) {
    this.reservaSvc.list(projectId).subscribe(r => this.reservas.set(r));
    this.cfgSvc.getRubros().subscribe(d => this.rubros.set(d));
    this.cfgSvc.getSubrubros().subscribe(d => {
      this.allSubrubros.set(d);
      this.presSvc.list(projectId).subscribe(p => {
        this.presupuestos.set(p);
        this.gastoSvc.list(projectId).subscribe(g => {
          this.gastos.set(g);
          this.resumenLoaded.set(true);
        });
      });
    });
  }

  setTab(tab: DetailTab) {
    this.router.navigate([], { queryParams: { tab }, replaceUrl: false });
  }

  // ── Cover image ──────────────────────────────────────────
  onCoverFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.coverUploading.set(true);
    this.projectService.uploadCover(this.project()!._id, file).subscribe({
      next: ({ coverImage }) => {
        this.project.update(p => p ? { ...p, coverImage } : p);
        this.coverUploading.set(false);
      },
      error: () => this.coverUploading.set(false),
    });
  }

  // ── Edit project ─────────────────────────────────────────
  startEdit(p: Project) {
    this.editing.set(true);
    // Merge legacy owner + owners array, dedup by email
    const merged = [
      ...(p.owner?.name || p.owner?.email ? [{ name: p.owner!.name || '', email: p.owner!.email || '', phone: p.owner!.phone || '' }] : []),
      ...(p.owners ?? []).map(o => ({ name: o.name || '', email: o.email || '', phone: o.phone || '' })),
    ];
    const seen = new Set<string>();
    const owners = merged.filter(o => { const k = o.email || o.name; if (seen.has(k)) return false; seen.add(k); return true; });
    this.form = {
      description:      p.description || '',
      status:           p.status,
      owners:           owners.length ? owners : [{ name: '', email: '', phone: '' }],
      services:         [...(p.services || [])],
      address:          p.location?.address || '',
      neighborhood:     p.location?.neighborhood || '',
      city:             p.location?.city || '',
      province:         p.location?.province || '',
      isGatedCommunity: p.location?.isGatedCommunity || false,
      levels:           p.features?.levels || null,
      surface:          p.features?.surface || null,
      lotSurface:       p.features?.lotSurface || null,
      bedrooms:         p.features?.bedrooms || null,
      bathrooms:        p.features?.bathrooms || null,
      hasLaundry:       p.features?.hasLaundry || false,
      startDate:        p.startDate ? p.startDate.substring(0, 10) : '',
      endDate:          p.endDate ? p.endDate.substring(0, 10) : '',
      budgetEstimated:  p.budget?.estimated || null,
      budgetCurrency:   p.budget?.currency || 'USD',
    };
  }

  cancelEdit() { this.editing.set(false); this.form = {}; }

  allOwners(p: Project): import('../../../shared/models/project.model').ProjectOwner[] {
    const merged = [
      ...(p.owner?.name || p.owner?.email ? [p.owner!] : []),
      ...(p.owners ?? []),
    ];
    const seen = new Set<string>();
    return merged.filter(o => {
      const k = o.email || o.name || '';
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  save() {
    const id = this.project()!._id;
    const payload: Partial<Project> = {
      description: this.form.description || undefined,
      status:      this.form.status as ProjectStatus,
      owners: (this.form.owners as { name: string; email: string; phone: string }[])
        .filter(o => o.name || o.email)
        .map(o => ({ name: o.name || undefined, email: o.email || undefined, phone: o.phone || undefined })),
      owner: this.form.owners?.[0]
        ? { name: this.form.owners[0].name || undefined, email: this.form.owners[0].email || undefined, phone: this.form.owners[0].phone || undefined }
        : undefined,
      services: this.form.services,
      location: {
        address: this.form.address || undefined, neighborhood: this.form.neighborhood || undefined,
        city: this.form.city || undefined, province: this.form.province || undefined,
        isGatedCommunity: this.form.isGatedCommunity,
      },
      features: {
        levels: this.form.levels || undefined, surface: this.form.surface || undefined,
        lotSurface: this.form.lotSurface || undefined, bedrooms: this.form.bedrooms || undefined,
        bathrooms: this.form.bathrooms || undefined, hasLaundry: this.form.hasLaundry,
      },
      budget: { estimated: this.form.budgetEstimated || undefined, currency: this.form.budgetCurrency },
      startDate: this.form.startDate || undefined,
      endDate:   this.form.endDate   || undefined,
    };
    this.projectService.update(id, payload).subscribe(updated => {
      this.project.set(updated);
      this.editing.set(false);
    });
  }

  toggleService(s: ProjService) {
    const idx = this.form.services.indexOf(s);
    if (idx > -1) this.form.services.splice(idx, 1);
    else this.form.services.push(s);
  }

  // ── Documents ────────────────────────────────────────────
  onFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.documentService.upload(this.project()!._id, file, this.uploadTipo()).subscribe({
      next: (doc) => {
        this.docs.update(d => [doc, ...d]);
        this.uploading.set(false);
        this.showUploadPanel.set(false);
        (event.target as HTMLInputElement).value = '';
      },
      error: () => this.uploading.set(false),
    });
  }

  deleteDoc(docId: string) {
    if (!confirm('¿Eliminar este documento?')) return;
    this.documentService.remove(this.project()!._id, docId).subscribe(() => {
      this.docs.update(d => d.filter(x => x._id !== docId));
    });
  }

  deleteProject() {
    if (!confirm(`¿Eliminar el proyecto "${this.project()!.name}"? Esta acción no se puede deshacer.`)) return;
    this.projectService.delete(this.project()!._id).subscribe(() => this.router.navigate(['/projects']));
  }

  // ── Helpers ──────────────────────────────────────────────
  typeLabel(t: ProjectType)     { return PROJECT_TYPE_LABELS[t] ?? t; }
  statusLabel(s: ProjectStatus) { return PROJECT_STATUS_LABELS[s] ?? s; }
  serviceLabel(s: ProjService)  { return SERVICE_LABELS[s] ?? s; }
  fileIcon(mime: string)        { return mime?.includes('pdf') ? '📄' : mime?.includes('sheet') || mime?.includes('excel') || mime?.includes('csv') ? '📊' : mime?.includes('word') ? '📝' : mime?.includes('image') ? '🖼️' : '📎'; }
  formatSize(b: number)         { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

  openPreview(doc: ProjectDocument)  { this.previewDoc.set(doc); }
  closePreview()                     { this.previewDoc.set(null); }
  fileUrl(doc: ProjectDocument)      { return `/uploads/${doc.filename}`; }
  coverUrl(filename: string)         { return `/uploads/${filename}`; }
  isImage(mime: string)              { return mime?.startsWith('image/'); }
  isPdf(mime: string)                { return mime === 'application/pdf'; }

  locationStr(p: Project) {
    return [p.location?.address, p.location?.neighborhood, p.location?.city, p.location?.province].filter(Boolean).join(', ');
  }

  fmt(n: number) { return 'ARS ' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }); }
  fmtM(n: number, m: Moneda) { return m + ' ' + Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }); }

  pctBar(num: number, den: number) { return den ? Math.min(100, Math.round(num / den * 100)) : 0; }

  ngOnDestroy() {
    this.chatCtx.clearProject();
  }
}
