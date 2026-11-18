import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { GastoVarioService } from '../../../../core/services/gasto-vario.service';
import { ConfigService, Rubro, Subrubro } from '../../../../core/services/config.service';
import { MonedaService } from '../../../../core/services/moneda.service';
import { ConfirmService } from '../../../../core/services/confirm.service';
import { GastoVario } from '../../../../shared/models/gasto-vario.model';
import { TipoCambioComponent } from '../../../../shared/components/tipo-cambio/tipo-cambio.component';
import { fileUrl } from '../../../../shared/utils/file-url';

type Periodo = 'todos' | 'mes' | 'mes_anterior';
const hoyISO = () => new Date().toISOString().split('T')[0];

/**
 * Gastos varios (caja chica): gastos chicos de la obra, sin pagos, categorizados.
 * Las categorías son los subrubros del rubro que se marcó como caja chica en el catálogo.
 */
@Component({
  selector: 'app-gastos-varios',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe, TipoCambioComponent],
  templateUrl: './gastos-varios.component.html',
  styleUrl: './gastos-varios.component.scss',
})
export class GastosVariosComponent implements OnInit {
  @Input({ required: true }) projectId!: string;
  @Input() canEdit = false;
  /** Avisa que cambió algo, para refrescar los totales del proyecto. */
  @Output() cambio = new EventEmitter<void>();

  private svc = inject(GastoVarioService);
  private cfg = inject(ConfigService);
  private confirmSvc = inject(ConfirmService);
  m = inject(MonedaService);
  fileUrl = fileUrl;

  items = signal<GastoVario[]>([]);
  rubroCaja = signal<Rubro | null>(null);
  categorias = signal<Subrubro[]>([]);
  loading = signal(true);
  guardando = signal(false);
  error = signal('');

  // filtros
  q = signal('');
  catId = signal<string>('todas');
  periodo = signal<Periodo>('todos');
  vista = signal<'lista' | 'categorias'>((() => { try { return (localStorage.getItem('gv_vista') as 'lista' | 'categorias') || 'lista'; } catch { return 'lista' as const; } })());
  abierto = signal<string | null>(null);
  editandoId = signal<string | null>(null);

  form = this.vacio();
  archivo: File | null = null;

  private vacio() { return { fecha: hoyISO(), concepto: '', subrubroId: '', monto: null as number | null, moneda: 'ARS', tipoCambio: null as number | null, notas: '' }; }

  ngOnInit() {
    this.cfg.getRubros().subscribe(rs => {
      const caja = rs.find(r => r.esCajaChica) ?? null;
      this.rubroCaja.set(caja);
      this.cfg.getSubrubros().subscribe(subs => {
        this.categorias.set(caja ? subs.filter(s => s.rubroId._id === caja._id && s.activo !== false) : []);
        this.loading.set(false);
      });
    });
    this.cargar();
  }
  cargar() { this.svc.list(this.projectId).subscribe(l => { this.items.set(l); this.cambio.emit(); }); }

  setVista(v: 'lista' | 'categorias') { this.vista.set(v); try { localStorage.setItem('gv_vista', v); } catch { /* sin storage */ } }

  // ── importes en la moneda elegida ──
  enVista(g: GastoVario): number | null { return this.m.aVista(g.monto, g.moneda, g.tipoCambio); }
  fmtVista(g: GastoVario): string { const v = this.enVista(g); return v === null ? this.m.fmt(g.monto, g.moneda) : this.m.fmt(v, this.m.vista()); }
  esOtraMoneda(g: GastoVario) { return g.moneda !== this.m.vista() && this.enVista(g) !== null; }
  /** "18 nov 26" (sin "de", para que entre en las columnas). */
  fmtFecha(d: string) {
    const f = new Date(d);
    const mes = f.toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
    return `${f.getUTCDate()} ${mes} ${String(f.getUTCFullYear()).slice(2)}`;
  }

  // ── filtrado ──
  /** Búsqueda y período aplicados, sin filtrar por categoría (para que el resumen por categoría siga visible al elegir una). */
  base = computed(() => {
    const q = this.q().trim().toLowerCase(), per = this.periodo();
    const hoy = new Date(); const ini = (off: number) => new Date(hoy.getFullYear(), hoy.getMonth() + off, 1);
    return this.items().filter(g => {
      if (q && !g.concepto.toLowerCase().includes(q)) return false;
      if (per !== 'todos') { const f = new Date(g.fecha); const d = per === 'mes' ? ini(0) : ini(-1); const h = per === 'mes' ? ini(1) : ini(0); if (f < d || f >= h) return false; }
      return true;
    });
  });
  filtrados = computed(() => { const cat = this.catId(); return cat === 'todas' ? this.base() : this.base().filter(g => g.subrubroId?._id === cat); });
  total = computed(() => this.suma(this.filtrados()));
  private suma(l: GastoVario[]): { valor: number; completo: boolean } {
    let valor = 0, completo = true;
    for (const g of l) { const v = this.enVista(g); if (v === null) completo = false; else valor += v; }
    return { valor, completo };
  }
  porCategoria = computed(() => {
    const mapa = new Map<string, { id: string; nombre: string; items: GastoVario[] }>();
    for (const g of this.filtrados()) { const id = g.subrubroId?._id ?? 'x'; const e = mapa.get(id) ?? { id, nombre: g.subrubroId?.nombre ?? 'Sin categoría', items: [] }; e.items.push(g); mapa.set(id, e); }
    const arr = [...mapa.values()].map(e => ({ ...e, ...this.suma(e.items) })).sort((a, b) => b.valor - a.valor);
    const max = Math.max(1, ...arr.map(a => a.valor));
    return arr.map(a => ({ ...a, pct: Math.round(a.valor / max * 100) }));
  });
  /** Una "ficha" por categoría con su total y su parte del gasto, para el resumen visual. */
  fichas = computed(() => {
    const mapa = new Map<string, { id: string; nombre: string; items: GastoVario[] }>();
    for (const g of this.base()) { const id = g.subrubroId?._id ?? 'x'; const e = mapa.get(id) ?? { id, nombre: g.subrubroId?.nombre ?? 'Sin categoría', items: [] }; e.items.push(g); mapa.set(id, e); }
    const arr = [...mapa.values()].map(e => ({ ...e, ...this.suma(e.items), n: e.items.length })).sort((a, b) => b.valor - a.valor);
    const tot = arr.reduce((t, a) => t + a.valor, 0);
    return arr.map(a => ({ ...a, parte: tot ? a.valor / tot * 100 : 0, color: this.color(a.id) }));
  });
  readonly COLORES = ['#ff4f00', '#2563eb', '#16a34a', '#a855f7', '#d97706', '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#64748b'];
  /** Cada categoría tiene siempre el mismo color (según su lugar en el catálogo). */
  color(id: string) { const i = this.categorias().findIndex(c => c._id === id); return this.COLORES[(i < 0 ? 0 : i) % this.COLORES.length]; }
  inicial(nombre?: string) { return (nombre ?? '?').trim().charAt(0).toUpperCase(); }
  conteoCat = (id: string) => this.items().filter(g => g.subrubroId?._id === id).length;

  // ── alta / edición ──
  guardar() {
    const f = this.form;
    if (!f.concepto.trim() || !f.subrubroId || !f.monto || this.guardando()) { this.error.set('Completá el concepto, la categoría y el monto.'); return; }
    this.error.set(''); this.guardando.set(true);
    const fd = new FormData();
    fd.append('fecha', f.fecha); fd.append('concepto', f.concepto.trim()); fd.append('subrubroId', f.subrubroId);
    fd.append('monto', String(f.monto)); fd.append('moneda', f.moneda);
    if (f.tipoCambio) fd.append('tipoCambio', String(f.tipoCambio));
    if (f.notas) fd.append('notas', f.notas);
    if (this.archivo) fd.append('comprobante', this.archivo);
    const id = this.editandoId();
    const op = id ? this.svc.update(this.projectId, id, fd) : this.svc.create(this.projectId, fd);
    op.subscribe({
      next: () => {
        this.guardando.set(false); this.editandoId.set(null); this.archivo = null;
        // se conserva la categoría y la fecha para cargar varios seguidos
        this.form = { ...this.vacio(), subrubroId: f.subrubroId, fecha: f.fecha, moneda: f.moneda, tipoCambio: f.tipoCambio };
        this.cargar();
      },
      error: (e: HttpErrorResponse) => { this.guardando.set(false); this.error.set(e.error?.message ?? 'No se pudo guardar.'); },
    });
  }
  editar(g: GastoVario) {
    this.editandoId.set(g._id); this.abierto.set(null); this.archivo = null;
    this.form = { fecha: g.fecha.substring(0, 10), concepto: g.concepto, subrubroId: g.subrubroId._id, monto: g.monto, moneda: g.moneda, tipoCambio: g.tipoCambio ?? null, notas: g.notas ?? '' };
    setTimeout(() => document.getElementById('gv-concepto')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
  cancelarEdicion() { this.editandoId.set(null); this.form = this.vacio(); this.archivo = null; this.error.set(''); }
  async eliminar(g: GastoVario) {
    if (!await this.confirmSvc.confirm('Esta acción no se puede deshacer.', `¿Eliminar "${g.concepto}"?`)) return;
    this.svc.remove(this.projectId, g._id).subscribe(() => { this.items.update(l => l.filter(x => x._id !== g._id)); this.abierto.set(null); });
  }
  onArchivo(e: Event) { this.archivo = (e.target as HTMLInputElement).files?.[0] ?? null; }
  esImagen(g: GastoVario) { return !!g.comprobante?.mimetype?.startsWith('image/'); }
}
