import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfigService, EtapaPlantilla, Rubro, Subrubro } from '../../core/services/config.service';
import { ProveedorService } from '../../core/services/proveedor.service';
import { Proveedor, Direccion, CondicionIva, CONDICION_IVA_LABELS } from '../../shared/models/proveedor.model';
import { MapPickerComponent, MapLocation } from '../../shared/components/map-picker/map-picker.component';
import { ProvidersMapComponent } from '../../shared/components/providers-map/providers-map.component';
import { ProviderFinderComponent, ProviderImport } from '../../shared/components/provider-finder/provider-finder.component';
import { AfipService, isValidCuit } from '../../core/services/afip.service';

type Tab = 'etapas' | 'rubros' | 'proveedores';
type ViewMode = 'grid' | 'map';
type ProvView = 'list' | 'form' | 'edit' | 'finder';

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [CommonModule, FormsModule, MapPickerComponent, ProvidersMapComponent, ProviderFinderComponent],
  templateUrl: './config.component.html',
  styleUrl: './config.component.scss',
})
export class ConfigComponent implements OnInit {
  private svc     = inject(ConfigService);
  private provSvc = inject(ProveedorService);
  private afipSvc = inject(AfipService);

  afipLoading = signal(false);
  afipError   = signal('');
  afipOk      = signal(false);

  activeTab   = signal<Tab>('etapas');
  viewMode    = signal<ViewMode>('grid');
  provView    = signal<ProvView>('list');
  showFinder  = signal(false);
  etapas      = signal<EtapaPlantilla[]>([]);
  rubros      = signal<Rubro[]>([]);
  subrubros   = signal<Subrubro[]>([]);
  proveedores = signal<Proveedor[]>([]);
  showForm    = signal(false);

  editingProveedor   = signal<Proveedor | null>(null);
  expandedProvId     = signal<string | null>(null);

  // Proveedores: búsqueda, filtros y acordeón jerárquico
  busquedaProv       = signal('');
  filtroRubro        = signal('');
  filtroRating       = signal(0);        // 0=todos, 3=≥3★, 4=≥4★, -1=sin rating
  sortProv           = signal<'az' | 'rating'>('az');
  formRubrosExpanded = signal<Set<string>>(new Set());
  editRubrosExpanded = signal<Set<string>>(new Set());

  readonly STARS              = [1, 2, 3, 4, 5];
  readonly CONDICION_IVA_OPTS: { value: CondicionIva; label: string }[] = [
    { value: '',                    label: 'No especificado' },
    { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
    { value: 'monotributo',         label: 'Monotributo' },
    { value: 'exento',              label: 'Exento' },
  ];
  readonly CONDICION_IVA_LABELS = CONDICION_IVA_LABELS;

  private readonly AVATAR_COLORS = [
    '#4f46e5','#0891b2','#059669','#d97706',
    '#dc2626','#7c3aed','#db2777','#0369a1',
  ];

  // ── Filtros ───────────────────────────────────────────
  proveedoresFiltrados = computed(() => {
    const q    = this.busquedaProv().toLowerCase().trim();
    const rId  = this.filtroRubro();
    const minR = this.filtroRating();
    const sort = this.sortProv();

    let result = this.proveedores();

    if (q) result = result.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.cuit?.toLowerCase().includes(q) ||
      p.responsable?.toLowerCase().includes(q) ||
      p.zona?.address?.toLowerCase().includes(q) ||
      p.direcciones?.some(d => d.address?.toLowerCase().includes(q)) ||
      p.subrubros.some(s => s.nombre.toLowerCase().includes(q))
    );

    if (rId) result = result.filter(p =>
      p.subrubros.some(s => s.rubroId?._id === rId)
    );

    if (minR === -1) result = result.filter(p => !p.rating);
    else if (minR > 0) result = result.filter(p => (p.rating ?? 0) >= minR);

    return sort === 'rating'
      ? [...result].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      : [...result].sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  hayFiltrosActivos = computed(() =>
    !!this.busquedaProv() || !!this.filtroRubro() || this.filtroRating() !== 0
  );

  limpiarFiltros() {
    this.busquedaProv.set('');
    this.filtroRubro.set('');
    this.filtroRating.set(0);
  }

  // ── Avatar helpers ─────────────────────────────────────
  avatarColor(nombre: string): string {
    const idx = nombre.charCodeAt(0) % this.AVATAR_COLORS.length;
    return this.AVATAR_COLORS[idx];
  }

  avatarInitials(nombre: string): string {
    const words = nombre.trim().split(/\s+/);
    return words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : nombre.substring(0, 2).toUpperCase();
  }

  // ── Editing state ─────────────────────────────────────
  editingId  = signal<string | null>(null);
  draft: any = {};

  // ── Forms ──────────────────────────────────────────────
  etapaForm     = this.emptyEtapa();
  rubroForm     = this.emptyRubro();
  subrubroForm  = this.emptySubrubro();
  proveedorForm = this.emptyProveedor();

  ngOnInit() { this.loadAll(); }

  loadAll() {
    this.svc.getEtapas().subscribe(d    => this.etapas.set(d));
    this.svc.getRubros().subscribe(d    => this.rubros.set(d));
    this.svc.getSubrubros().subscribe(d => this.subrubros.set(d));
    this.provSvc.list().subscribe(d     => this.proveedores.set(d));
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
    this.showForm.set(false);
    this.editingId.set(null);
    this.viewMode.set('grid');
    this.provView.set('list');
  }

  toggleForm() {
    this.showForm.update(v => !v);
    this.editingId.set(null);
    if (this.showForm()) this.showFinder.set(false);
  }

  toggleFinder() {
    this.showFinder.update(v => !v);
    if (this.showFinder()) {
      this.showForm.set(false);
      this.editingId.set(null);
    }
  }

  openNewProveedor() {
    this.proveedorForm = this.emptyProveedor();
    this.afipOk.set(false);
    this.afipError.set('');
    this.provView.set('form');
    this.editingId.set(null);
  }

  openFinder() {
    this.provView.set('finder');
    this.editingId.set(null);
  }

  backToList() {
    this.provView.set('list');
    this.editingId.set(null);
    this.editingProveedor.set(null);
    this.draft = {};
    this.afipOk.set(false);
    this.afipError.set('');
  }

  // ── AFIP auto-lookup ──────────────────────────────────
  onFormCuitBlur() {
    const cuit = this.proveedorForm.cuit;
    if (!isValidCuit(cuit)) return;
    this.afipLoading.set(true);
    this.afipError.set('');
    this.afipOk.set(false);
    this.afipSvc.lookup(cuit).subscribe({
      next: (d) => {
        if (d.razonSocial) this.proveedorForm.razonSocial  = d.razonSocial;
        if (d.condicionIva) this.proveedorForm.condicionIva = d.condicionIva as CondicionIva;
        this.afipLoading.set(false);
        this.afipOk.set(true);
      },
      error: () => {
        this.afipError.set('CUIT no encontrado en AFIP');
        this.afipLoading.set(false);
      },
    });
  }

  onDraftCuitBlur() {
    const cuit = this.draft.cuit as string;
    if (!isValidCuit(cuit)) return;
    this.afipLoading.set(true);
    this.afipError.set('');
    this.afipOk.set(false);
    this.afipSvc.lookup(cuit).subscribe({
      next: (d) => {
        if (d.razonSocial)  this.draft.razonSocial  = d.razonSocial;
        if (d.condicionIva) this.draft.condicionIva  = d.condicionIva;
        this.afipLoading.set(false);
        this.afipOk.set(true);
      },
      error: () => {
        this.afipError.set('CUIT no encontrado en AFIP');
        this.afipLoading.set(false);
      },
    });
  }

  onImportar(data: ProviderImport) {
    this.afipOk.set(false);
    this.afipError.set('');
    this.proveedorForm = {
      ...this.emptyProveedor(),
      nombre:      data.nombre,
      telefono:    data.telefono ?? '',
      web:         data.web      ?? '',
      zona:        data.zona,
      subrubros:   data.subrubroId ? [data.subrubroId] : [],
      direcciones: data.zona
        ? [{ label: '', address: data.zona.address, lat: data.zona.lat, lng: data.zona.lng }]
        : [],
    };
    this.provView.set('form');
    this.showFinder.set(false);
  }

  // ── EDIT ──────────────────────────────────────────────
  startEdit(item: any) {
    this.editingId.set(item._id);
    this.showForm.set(false);
    this.editRubrosExpanded.set(new Set());
    this.draft = {
      nombre:      item.nombre,
      codigo:      item.codigo,
      descripcion: item.descripcion || '',
      orden:       item.orden,
      activo:      item.activo,
      rubroId:     item.rubroId?._id || item.rubroId || '',
    };
  }

  startEditProveedor(p: Proveedor) {
    this.editingId.set(p._id);
    this.editingProveedor.set(p);
    this.editRubrosExpanded.set(new Set());
    this.afipOk.set(false);
    this.afipError.set('');
    this.draft = {
      nombre:       p.nombre,
      razonSocial:  p.razonSocial  || '',
      responsable:  p.responsable  || '',
      cuit:         p.cuit         || '',
      telefono:     p.telefono     || '',
      email:        p.email        || '',
      web:          p.web          || '',
      instagram:    p.instagram    || '',
      condicionIva: p.condicionIva || '',
      notas:        p.notas        || '',
      rating:       p.rating       ?? null,
      subrubros:    (p.subrubros ?? []).map((s: any) => s._id ?? s),
      direcciones:  this.buildDirecciones(p),
    };
    this.provView.set('edit');
  }

  private buildDirecciones(p: Proveedor): Direccion[] {
    if (p.direcciones && p.direcciones.length > 0) {
      return p.direcciones.map(d => ({ label: d.label || '', address: d.address, lat: d.lat, lng: d.lng }));
    }
    if (p.zona?.address) {
      return [{ label: '', address: p.zona.address, lat: p.zona.lat, lng: p.zona.lng }];
    }
    return [];
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editingProveedor.set(null);
    this.draft = {};
    if (this.activeTab() === 'proveedores') this.provView.set('list');
  }

  saveEditEtapa(id: string) {
    this.svc.updateEtapa(id, this.draft).subscribe(updated => {
      this.etapas.update(list => list.map(e => e._id === id ? updated : e).sort((a, b) => a.orden - b.orden));
      this.cancelEdit();
    });
  }

  saveEditRubro(id: string) {
    this.svc.updateRubro(id, this.draft).subscribe(updated => {
      this.rubros.update(list => list.map(r => r._id === id ? updated : r).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.cancelEdit();
    });
  }

  saveEditSubrubro(id: string) {
    this.svc.updateSubrubro(id, this.draft).subscribe(updated => {
      this.subrubros.update(list => list.map(s => s._id === id ? updated : s).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.cancelEdit();
    });
  }

  // ── CREATE ────────────────────────────────────────────
  saveEtapa() {
    if (!this.etapaForm.nombre || !this.etapaForm.codigo) return;
    this.svc.createEtapa(this.etapaForm).subscribe(e => {
      this.etapas.update(l => [...l, e].sort((a, b) => a.orden - b.orden));
      this.etapaForm = this.emptyEtapa();
      this.showForm.set(false);
    });
  }

  saveRubro() {
    if (!this.rubroForm.nombre || !this.rubroForm.codigo) return;
    this.svc.createRubro(this.rubroForm).subscribe(r => {
      this.rubros.update(l => [...l, r].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.rubroForm = this.emptyRubro();
      this.showForm.set(false);
    });
  }

  saveSubrubro() {
    if (!this.subrubroForm.nombre || !this.subrubroForm.codigo || !this.subrubroForm.rubroId) return;
    this.svc.createSubrubro(this.subrubroForm).subscribe(s => {
      this.subrubros.update(l => [...l, s].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.subrubroForm = this.emptySubrubro();
      this.showForm.set(false);
    });
  }

  // ── DELETE ────────────────────────────────────────────
  deleteEtapa(id: string, nombre: string) {
    if (!confirm(`¿Eliminar etapa "${nombre}"?`)) return;
    this.svc.deleteEtapa(id).subscribe(() => this.etapas.update(l => l.filter(e => e._id !== id)));
  }

  deleteRubro(id: string, nombre: string) {
    if (!confirm(`¿Eliminar rubro "${nombre}"?`)) return;
    this.svc.deleteRubro(id).subscribe(() => this.rubros.update(l => l.filter(r => r._id !== id)));
  }

  deleteSubrubro(id: string, nombre: string) {
    if (!confirm(`¿Eliminar subrubro "${nombre}"?`)) return;
    this.svc.deleteSubrubro(id).subscribe(() => this.subrubros.update(l => l.filter(s => s._id !== id)));
  }

  // ── PROVEEDOR CRUD ────────────────────────────────────
  saveProveedor() {
    if (!this.proveedorForm.nombre) return;
    this.provSvc.create(this.proveedorForm).subscribe(p => {
      this.proveedores.update(l => [...l, p].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.proveedorForm = this.emptyProveedor();
      this.provView.set('list');
    });
  }

  saveEditProveedor(id: string) {
    this.provSvc.update(id, this.draft).subscribe(updated => {
      this.proveedores.update(l => l.map(p => p._id === id ? updated : p).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.cancelEdit();
    });
  }

  // ── Direcciones ────────────────────────────────────────
  addFormDireccion() {
    this.proveedorForm.direcciones.push({ label: '', address: '' });
  }

  removeFormDireccion(i: number) {
    this.proveedorForm.direcciones.splice(i, 1);
  }

  onFormDireccionChange(i: number, loc: MapLocation | null) {
    if (loc) {
      this.proveedorForm.direcciones[i] = {
        label: this.proveedorForm.direcciones[i].label || '',
        address: loc.address, lat: loc.lat, lng: loc.lng,
      };
    } else {
      this.proveedorForm.direcciones[i] = { label: this.proveedorForm.direcciones[i].label || '', address: '' };
    }
  }

  getFormDireccionLoc(i: number): MapLocation | null {
    const d = this.proveedorForm.direcciones?.[i];
    if (!d?.address || d.lat == null || d.lng == null) return null;
    return { address: d.address, lat: d.lat, lng: d.lng };
  }

  addDraftDireccion() {
    if (!this.draft.direcciones) this.draft.direcciones = [];
    this.draft.direcciones.push({ label: '', address: '' });
  }

  removeDraftDireccion(i: number) {
    this.draft.direcciones.splice(i, 1);
  }

  onDraftDireccionChange(i: number, loc: MapLocation | null) {
    if (loc) {
      this.draft.direcciones[i] = {
        label: this.draft.direcciones[i].label || '',
        address: loc.address, lat: loc.lat, lng: loc.lng,
      };
    } else {
      this.draft.direcciones[i] = { label: this.draft.direcciones[i].label || '', address: '' };
    }
  }

  getDraftDireccionLoc(i: number): MapLocation | null {
    const dirs = this.draft.direcciones;
    if (!dirs || !dirs[i]) return null;
    const d = dirs[i];
    if (!d?.address || d.lat == null || d.lng == null) return null;
    return { address: d.address, lat: d.lat, lng: d.lng };
  }

  deleteProveedor(id: string, nombre: string) {
    if (!confirm(`¿Eliminar proveedor "${nombre}"?`)) return;
    this.provSvc.remove(id).subscribe(() => this.proveedores.update(l => l.filter(p => p._id !== id)));
  }

  // ── Subrubros selección ───────────────────────────────
  toggleProveedorSubrubro(subrubroId: string) {
    const list: string[] = this.draft.subrubros ?? [];
    const idx = list.indexOf(subrubroId);
    this.draft.subrubros = idx === -1 ? [...list, subrubroId] : list.filter((s: string) => s !== subrubroId);
  }

  isProvSubrubroChecked(subrubroId: string): boolean {
    return (this.draft.subrubros ?? []).includes(subrubroId);
  }

  toggleFormSubrubro(subrubroId: string) {
    const list: string[] = this.proveedorForm.subrubros ?? [];
    const idx = list.indexOf(subrubroId);
    this.proveedorForm.subrubros = idx === -1 ? [...list, subrubroId] : list.filter((s: string) => s !== subrubroId);
  }

  isFormSubrubroChecked(subrubroId: string): boolean {
    return (this.proveedorForm.subrubros ?? []).includes(subrubroId);
  }

  // ── Acordeón rubros ───────────────────────────────────
  toggleFormRubro(rubroId: string) {
    this.formRubrosExpanded.update(s => { const n = new Set(s); n.has(rubroId) ? n.delete(rubroId) : n.add(rubroId); return n; });
  }
  isFormRubroExpanded(rubroId: string) { return this.formRubrosExpanded().has(rubroId); }

  toggleEditRubro(rubroId: string) {
    this.editRubrosExpanded.update(s => { const n = new Set(s); n.has(rubroId) ? n.delete(rubroId) : n.add(rubroId); return n; });
  }
  isEditRubroExpanded(rubroId: string) { return this.editRubrosExpanded().has(rubroId); }

  formSelCount(rubroId: string): number {
    return this.subrubrosDe(rubroId).filter(s => this.isFormSubrubroChecked(s._id)).length;
  }
  editSelCount(rubroId: string): number {
    return this.subrubrosDe(rubroId).filter(s => this.isProvSubrubroChecked(s._id)).length;
  }

  // ── Zona (Google Maps) ────────────────────────────────
  onFormZonaChange(loc: MapLocation | null) {
    this.proveedorForm.zona = loc ?? undefined;
  }

  onDraftZonaChange(loc: MapLocation | null) {
    this.draft.zona = loc ?? null;
  }

  mapsLink(loc: { address?: string; lat?: number; lng?: number }): string {
    if (loc.lat != null && loc.lng != null)
      return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
    return `https://www.google.com/maps/search/${encodeURIComponent(loc.address ?? '')}`;
  }

  // ── Rating helpers ────────────────────────────────────
  setFormRating(n: number) {
    this.proveedorForm.rating = this.proveedorForm.rating === n ? null : n;
  }
  setDraftRating(n: number) {
    this.draft.rating = this.draft.rating === n ? null : n;
  }

  toggleProv(id: string) {
    this.expandedProvId.update(cur => cur === id ? null : id);
  }

  specsLine(prov: Proveedor): string {
    if (!prov.subrubros.length) return prov.zona?.address ?? '';
    const groups = this.subsPorRubro(prov);
    return groups.map(g => `${g.rubroNombre} · ${g.subs.join(', ')}`).join(' / ');
  }

  ratingDotClass(rating: number | null | undefined): string {
    if (!rating) return '';
    if (rating >= 4)  return 'pv-item__dot--green';
    if (rating >= 3)  return 'pv-item__dot--amber';
    return 'pv-item__dot--red';
  }

  // ── Display helpers ───────────────────────────────────
  subsPorRubro(prov: Proveedor): { rubroNombre: string; subs: string[] }[] {
    const map = new Map<string, { rubroNombre: string; subs: string[] }>();
    for (const s of prov.subrubros) {
      const rId  = s.rubroId?._id  ?? 'otros';
      const rNom = s.rubroId?.nombre ?? 'Otros';
      if (!map.has(rId)) map.set(rId, { rubroNombre: rNom, subs: [] });
      map.get(rId)!.subs.push(s.nombre);
    }
    return Array.from(map.values());
  }

  whatsappUrl(telefono: string): string {
    const num = telefono.replace(/\D/g, '');
    return `https://wa.me/${num}`;
  }

  instagramUrl(handle: string): string {
    const clean = handle.replace(/^@/, '');
    return `https://instagram.com/${clean}`;
  }

  // ── Rubros tree ───────────────────────────────────────
  countSubrubros(rubroId: string) {
    return this.subrubros().filter(s => s.rubroId?._id === rubroId).length;
  }

  subrubrosDe(rubroId: string) {
    return this.subrubros().filter(s => s.rubroId?._id === rubroId);
  }

  expandedRubros = signal<Set<string>>(new Set());

  toggleRubro(id: string) {
    this.expandedRubros.update(set => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  isExpanded(id: string) { return this.expandedRubros().has(id); }

  // ── Inline subrubro ───────────────────────────────────
  inlineSubrubroForms: Record<string, { nombre: string; codigo: string }> = {};

  getInlineForm(rubroId: string) {
    if (!this.inlineSubrubroForms[rubroId]) {
      this.inlineSubrubroForms[rubroId] = { nombre: '', codigo: '' };
    }
    return this.inlineSubrubroForms[rubroId];
  }

  saveInlineSubrubro(rubroId: string) {
    const f = this.inlineSubrubroForms[rubroId];
    if (!f?.nombre || !f?.codigo) return;
    this.svc.createSubrubro({ nombre: f.nombre, codigo: f.codigo, rubroId }).subscribe(s => {
      this.subrubros.update(l => [...l, s].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.inlineSubrubroForms[rubroId] = { nombre: '', codigo: '' };
    });
  }

  nextOrden() {
    return this.etapas().reduce((m, e) => Math.max(m, e.orden), 0) + 1;
  }

  private emptyEtapa() {
    return { nombre: '', codigo: '', orden: this.nextOrden(), descripcion: '' };
  }
  private emptyRubro()    { return { nombre: '', codigo: '', descripcion: '' }; }
  private emptySubrubro() { return { nombre: '', codigo: '', rubroId: '', descripcion: '' }; }
  private emptyProveedor() {
    return {
      nombre: '', razonSocial: '', responsable: '',
      cuit: '', telefono: '', email: '', web: '', instagram: '',
      condicionIva: '' as CondicionIva,
      zona: undefined as MapLocation | undefined,
      notas: '', rating: null as number | null,
      subrubros: [] as string[],
      direcciones: [] as Direccion[],
    };
  }
}
