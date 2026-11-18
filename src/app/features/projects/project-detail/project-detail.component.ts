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
  PlanObraEntry,
} from '../../../shared/models/project.model';
import { Presupuesto, Gasto, totalPagadoGasto, Reserva, Moneda, saldoReserva } from '../../../shared/models/obra.model';
import { ObraComponent } from './obra/obra.component';
import { CajaComponent } from './caja/caja.component';
import { EtapasComponent } from './etapas/etapas.component';
import { PlanificacionComponent } from './planificacion/planificacion.component';
import { SeleccionesComponent } from './selecciones/selecciones.component';
import { SafePipe } from '../../../shared/pipes/safe.pipe';
import { ArsNumPipe } from '../../../shared/pipes/ars-num.pipe';
import { ChatContextService } from '../../../core/services/chat-context.service';
import { avanceObra } from '../../../shared/utils/avance';
import { fileUrl } from '../../../shared/utils/file-url';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { PersonasComponent } from './personas/personas.component';
import { MembersService, ProjectRole } from '../../../core/services/members.service';

export type DetailTab = 'info' | 'compras' | 'resumen' | 'caja' | 'config' | 'planificacion' | 'selecciones' | 'documentos' | 'personas';

/** Enlaces viejos (?tab=obra, ?tab=equipo) siguen funcionando. */
const LEGACY_TABS: Record<string, DetailTab> = { obra: 'compras', pagos: 'compras', equipo: 'personas' };

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
  imports: [CommonModule, FormsModule, RouterLink, ObraComponent, CajaComponent, EtapasComponent, PlanificacionComponent, SeleccionesComponent, PersonasComponent, AvatarComponent, SafePipe, ArsNumPipe],
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
  private membersSvc     = inject(MembersService);

  /** Mi rol en este proyecto: admin (superadmin) | editor | lector. Lo decide el backend. */
  myRole    = signal<ProjectRole | null>(null);
  canEdit   = computed(() => this.myRole() === 'admin' || this.myRole() === 'editor');
  isSuper   = computed(() => this.myRole() === 'admin');

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
  planObra      = signal<PlanObraEntry[]>([]);
  soloConDatos  = signal(false);
  resumenLoaded   = signal(false);
  configSection   = signal<string>('etapas');

  // ── Plan edición inline ──────────────────────────────────
  editingPlanSubId = signal<string | null>(null);
  editPlanForm     = { monto: 0, moneda: 'ARS' };
  savingPlan       = signal(false);

  activeTab = toSignal(
    this.route.queryParamMap.pipe(map(p => { const t = p.get('tab') ?? 'info'; return (LEGACY_TABS[t] ?? t) as DetailTab; })),
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

  // ── Finanzas: tabla completa con Plan ───────────────────
  finanzasData = computed(() => {
    if (!this.resumenLoaded()) return [];
    const rubros      = this.rubros();
    const subs        = this.allSubrubros();
    const gastos      = this.gastos();
    const plan        = this.planObra();
    const soloConData = this.soloConDatos();

    return rubros.map(rubro => {
      const rubroIdStr = String(rubro._id);
      const rubroSubs  = subs.filter(s => String(s.rubroId?._id ?? '') === rubroIdStr);

      const rows = rubroSubs.map(sub => {
        const subIdStr   = String(sub._id);
        const subGastos  = gastos.filter(g => String(g.subrubroId?._id ?? '') === subIdStr);
        const realTotal  = subGastos.reduce((acc, g) => acc + (g.monto ?? 0), 0);
        const realPagado = subGastos.reduce((acc, g) => acc + totalPagadoGasto(g), 0);
        const planEntry  = plan.find(p => p.subrubroId === subIdStr);
        const planMonto  = planEntry?.monto ?? 0;
        const planMoneda = planEntry?.moneda ?? 'ARS';
        const pct        = planMonto > 0 ? Math.min(999, Math.round(realPagado / planMonto * 100)) : null;
        const hasData    = realTotal > 0 || realPagado > 0 || planMonto > 0;
        return { sub, realTotal, realPagado, planMonto, planMoneda, pct, hasData };
      }).filter(r => !soloConData || r.hasData);

      const rubroRealTotal  = rows.reduce((acc, r) => acc + r.realTotal, 0);
      const rubroRealPagado = rows.reduce((acc, r) => acc + r.realPagado, 0);
      const rubroPlan       = rows.reduce((acc, r) => acc + r.planMonto, 0);
      const hasAnyData      = rows.some(r => r.hasData);
      return { rubro, rows, rubroRealTotal, rubroRealPagado, rubroPlan, hasAnyData };
    }).filter(r => r.rows.length > 0);
  });

  finanzasTotals() {
    const data = this.finanzasData();
    return {
      plan:       data.reduce((acc, r) => acc + r.rubroPlan, 0),
      realTotal:  data.reduce((acc, r) => acc + r.rubroRealTotal, 0),
      realPagado: data.reduce((acc, r) => acc + r.rubroRealPagado, 0),
    };
  }

  totalPresupuestado = computed(() => this.planObra().reduce((s, p) => s + p.monto, 0));
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
        this.planObra.set(p.planObra ?? []);
        this.loading.set(false);
        this.membersSvc.myRole(id).subscribe({ next: r => this.myRole.set(r.role), error: () => this.myRole.set('lector') });
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

  // ── Navegación agrupada ──────────────────────────────────
  /** Secciones ordenadas como se usa una obra: planear → comprar → pagar → controlar. */
  readonly NAV: { id: DetailTab; label: string; hint: string; group: DetailTab[]; sub?: { id: DetailTab; label: string }[] }[] = [
    { id: 'info',        label: 'Resumen',      group: ['info'],
      hint: 'Datos del proyecto, ubicación y servicios contratados.' },
    { id: 'config',      label: 'Cronograma',   group: ['config'],
      hint: 'Las etapas de la obra y su avance. De acá sale el porcentaje de avance del proyecto.' },
    { id: 'compras',     label: 'Compras',      group: ['compras'],
      hint: 'Cada compra, de la cotización al pago: pedí precios, elegí proveedor y registrá los pagos.' },
    { id: 'resumen',     label: 'Plan',         group: ['resumen', 'planificacion', 'caja'],
      sub: [{ id: 'resumen', label: 'Plan vs. real' }, { id: 'planificacion', label: 'Plan semanal' }, { id: 'caja', label: 'Reservas de fondos' }],
      hint: 'Cuánto se planeó gastar, cuánto se gastó y cuánto falta, por rubro. También el plan semanal y los fondos reservados.' },
    { id: 'selecciones', label: 'Selecciones',  group: ['selecciones'],
      hint: 'Lista de cosas que el cliente tiene que elegir o comprar (grifería, revestimientos…) y su estado.' },
    { id: 'documentos',  label: 'Documentos',   group: ['documentos'],
      hint: 'Planos, contratos y archivos del proyecto.' },
    { id: 'personas',    label: 'Personas',     group: ['personas'],
      hint: 'Propietarios, equipo del estudio y quién puede ver o modificar este proyecto.' },
  ];
  navTabs = computed(() => this.NAV.filter(t => t.id !== 'personas' || this.canEdit()));
  activeHint = computed(() => this.NAV.find(t => t.group.includes(this.activeTab()))?.hint ?? '');
  isGroupActive(t: { group: DetailTab[] }) { return t.group.includes(this.activeTab()); }
  activeSub = computed(() => this.NAV.find(t => t.sub && t.group.includes(this.activeTab()))?.sub ?? null);

  /** Cifras de cabecera por moneda (de mayor a menor movimiento). Una obra puede tener gastos en ARS y en USD. */
  kpis = computed(() => {
    const p = this.project();
    if (!p || !this.resumenLoaded()) return null;
    const f = (n: number, m: string) => `${m} ${Math.round(n).toLocaleString('es-AR')}`;
    const plan = (p.planObra ?? []).map(x => ({ monto: x.monto, moneda: x.moneda as string }));
    if (!plan.length && p.budget?.estimated) plan.push({ monto: p.budget.estimated, moneda: p.budget.currency });
    const gst = this.gastos();
    const monedas = [...new Set([...plan.map(x => x.moneda), ...gst.map(g => g.moneda as string)])];
    const filas = monedas.map(m => {
      const planM = plan.filter(x => x.moneda === m).reduce((s, x) => s + x.monto, 0);
      const gastado = gst.filter(g => g.moneda === m).reduce((s, g) => s + g.monto, 0);
      const pagado = gst.filter(g => g.moneda === m).reduce((s, g) => s + totalPagadoGasto(g), 0);
      // lo que falta es la suma de lo pendiente en cada gasto (un sobrepago no compensa a otro gasto)
      const pend = gst.filter(g => g.moneda === m).reduce((s, g) => s + Math.max(0, g.monto - totalPagadoGasto(g)), 0);
      return { m, plan: planM, gastado, pagado, pend, pct: planM ? Math.round(gastado / planM * 100) : null as number | null };
    }).sort((a, b) => (b.gastado + b.plan) - (a.gastado + a.plan));
    return { filas: filas.map(x => ({ ...x, fPlan: x.plan ? f(x.plan, x.m) : '—', fGastado: f(x.gastado, x.m), fPagado: f(x.pagado, x.m), fPend: f(x.pend, x.m) })), avance: avanceObra(p.etapas) };
  });

  fmtFecha(d?: string | Date | null) {
    return d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  }
  mapsUrl(p: Project) {
    const c = p.location?.coordinates;
    const q = c?.lat && c?.lng ? `${c.lat},${c.lng}` : this.locationStr(p);
    return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
  }

  /** Estado de la obra "ahora": etapa en curso, la que sigue, entrega y pagos por confirmar. */
  ahora = computed(() => {
    const p = this.project();
    if (!p) return null;
    const et = [...(p.etapas ?? [])].sort((a, b) => a.orden - b.orden);
    const activa = et.find(e => e.estado === 'activa') ?? null;
    const proxima = et.find(e => e.estado === 'pendiente') ?? null;
    const terminada = et.length > 0 && et.every(e => e.estado === 'completada');
    const fin = p.endDate ? new Date(p.endDate) : null;
    const dias = fin ? Math.round((fin.getTime() - Date.now()) / 86400000) : null;
    const entrega = dias === null ? '' : dias > 13 ? `en ${Math.round(dias / 7)} semanas` : dias >= 0 ? `en ${dias} día${dias !== 1 ? 's' : ''}` : `hace ${-dias} día${dias !== -1 ? 's' : ''}`;
    const porConfirmar = this.gastos().reduce((n, g) => n + g.pagos.filter(x => !x.pagado?.valor || !x.firmado?.valor).length, 0);
    return { activa, pctActiva: activa ? (activa.avance ?? 50) : 0, proxima, terminada, sinEtapas: !et.length, fin, entrega, atrasada: dias !== null && dias < 0 && !terminada, porConfirmar, avance: avanceObra(p.etapas) };
  });

  /** Números de la obra para la franja de características (solo los que tienen dato). */
  datos = computed(() => {
    const f = this.project()?.features;
    if (!f) return [];
    return [
      { v: f.levels, l: 'niveles' }, { v: f.surface, l: 'm² construidos' }, { v: f.lotSurface, l: 'm² de terreno' },
      { v: f.bedrooms, l: 'dormitorios' }, { v: f.bathrooms, l: 'baños' }, { v: f.units, l: 'unidades' },
    ].filter(x => x.v);
  });
  rasgos = computed(() => {
    const p = this.project();
    return [p?.features?.hasLaundry ? 'Lavadero' : '', p?.location?.isGatedCommunity ? 'Barrio cerrado' : ''].filter(Boolean);
  });

  onProjectChange(p: Project) { this.project.set(p); }
  onEtapasChange(etapas: NonNullable<Project['etapas']>) { this.project.update(p => p ? { ...p, etapas } : p); }

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

  ownerNames(p: Project) { return this.allOwners(p).map(o => o.name || o.email).filter(Boolean).join(', '); }

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
  fileUrl(doc: ProjectDocument)      { return fileUrl(doc.filename); }
  coverUrl(filename: string)         { return fileUrl(filename); }
  isImage(mime: string)              { return mime?.startsWith('image/'); }
  isPdf(mime: string)                { return mime === 'application/pdf'; }

  locationStr(p: Project) {
    return [p.location?.address, p.location?.neighborhood, p.location?.city, p.location?.province].filter(Boolean).join(', ');
  }

  fmt(n: number, moneda = 'ARS') { return moneda + ' ' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }); }
  fmtM(n: number, m: Moneda) { return m + ' ' + Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }); }

  pctBar(num: number, den: number) { return den ? Math.min(100, Math.round(num / den * 100)) : 0; }

  // ── Plan inline editing ──────────────────────────────────
  startEditPlan(sub: Subrubro) {
    const subId  = String(sub._id);
    const entry  = this.planObra().find(p => p.subrubroId === subId);
    this.editPlanForm = { monto: entry?.monto ?? 0, moneda: entry?.moneda ?? 'ARS' };
    this.editingPlanSubId.set(subId);
  }

  cancelEditPlan() { this.editingPlanSubId.set(null); }

  savePlan(sub: Subrubro) {
    const subId = String(sub._id);
    if (this.editingPlanSubId() !== subId || this.savingPlan()) return;
    const monto = this.editPlanForm.monto;
    if (monto == null || isNaN(+monto)) { this.cancelEditPlan(); return; }
    this.savingPlan.set(true);
    this.projectService.updatePlanObra(this.project()!._id, subId, +monto, this.editPlanForm.moneda).subscribe({
      next: entries => {
        this.planObra.set(entries);
        this.editingPlanSubId.set(null);
        this.savingPlan.set(false);
      },
      error: () => { this.editingPlanSubId.set(null); this.savingPlan.set(false); },
    });
  }

  finPct(pct: number | null): string {
    if (pct === null) return '—';
    return Math.round(pct) + '%';
  }

  finPctClass(pct: number | null): string {
    if (pct === null) return 'fin-pct--none';
    if (pct >= 100) return 'fin-pct--over';
    if (pct >= 75)  return 'fin-pct--warn';
    return 'fin-pct--ok';
  }

  rubroRawPct(ejecutado: number, plan: number): number {
    if (!plan) return 0;
    return Math.round(ejecutado / plan * 100);
  }

  ngOnDestroy() {
    this.chatCtx.clearProject();
  }
}
