import { Component, Input, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PresupuestoService } from '../../../../core/services/presupuesto.service';
import { GastoService } from '../../../../core/services/gasto.service';
import { ProveedorService } from '../../../../core/services/proveedor.service';
import { ConfigService, Rubro, Subrubro } from '../../../../core/services/config.service';
import { ReservaService } from '../../../../core/services/reserva.service';
import { SolicitudService } from '../../../../core/services/solicitud.service';
import {
  Presupuesto, Gasto, Moneda, MetodoPago,
  METODO_LABELS, METODO_ICONS, METODO_HINT,
  Reserva, saldoReserva, totalPagadoGasto, estadoGasto,
  Solicitud, Cotizacion,
} from '../../../../shared/models/obra.model';
import { Proveedor } from '../../../../shared/models/proveedor.model';

@Component({
  selector: 'app-obra',
  standalone: true,
  imports: [CommonModule, NgTemplateOutlet, FormsModule],
  templateUrl: './obra.component.html',
  styleUrl: './obra.component.scss',
})
export class ObraComponent implements OnInit {
  @Input() projectId!: string;

  private presSvc      = inject(PresupuestoService);
  private gastoSvc     = inject(GastoService);
  private provSvc      = inject(ProveedorService);
  private cfgSvc       = inject(ConfigService);
  private reservaSvc   = inject(ReservaService);
  private solicitudSvc = inject(SolicitudService);

  // ── Data ────────────────────────────────────────────────
  presupuestos = signal<Presupuesto[]>([]);
  gastos       = signal<Gasto[]>([]);
  rubros       = signal<Rubro[]>([]);
  allSubrubros = signal<Subrubro[]>([]);
  reservas     = signal<Reserva[]>([]);

  // ── Presupuestos por estado ──────────────────────────────
  presPendientes = computed(() => this.presupuestos().filter(p => p.estado === 'pendiente'));
  presAprobados  = computed(() => this.presupuestos().filter(p => p.estado === 'aprobado'));
  presRechazados = computed(() => this.presupuestos().filter(p => p.estado === 'rechazado'));

  // ── Summary totals ───────────────────────────────────────
  totalPresupuestado = computed(() => this.presAprobados().reduce((s, p) => s + p.monto, 0));
  totalEjecutado     = computed(() => this.gastos().reduce((s, g) => s + g.monto, 0));
  totalPagado        = computed(() => this.gastos().reduce((s, g) => s + totalPagadoGasto(g), 0));
  totalPorPagar      = computed(() => this.totalEjecutado() - this.totalPagado());

  // ── Solicitudes ──────────────────────────────────────────
  solicitudes          = signal<Solicitud[]>([]);
  showSolicitudForm    = signal(false);
  savingSolicitud      = signal(false);
  solicitudForm        = { rubroId: '', subrubroId: '', descripcion: '' };
  solicitudFormSubs    = signal<Subrubro[]>([]);
  addingCotizacionId   = signal<string | null>(null);
  savingCotizacion     = signal(false);
  cotizacionForm: {
    proveedorId: string; monto: number | null; moneda: Moneda;
    notas: string; plazo: string; condiciones: string;
    archivos: File[]; provs: Proveedor[];
  } = { proveedorId: '', monto: null, moneda: 'ARS', notas: '', plazo: '', condiciones: '', archivos: [], provs: [] };

  // ── Filter ──────────────────────────────────────────────
  obraFilter = signal<'todos' | 'cotizaciones' | 'pendiente' | 'aprobado' | 'rechazado' | 'gasto'>('todos');

  // ── Master/detail selection ──────────────────────────────
  selectedId   = signal<string | null>(null);
  selectedType = signal<'pres' | 'gasto' | 'sol' | null>(null);

  selectedPres  = computed(() => this.selectedType() === 'pres'  ? this.presupuestos().find(p => p._id === this.selectedId()) ?? null : null);
  selectedGasto = computed(() => this.selectedType() === 'gasto' ? this.gastos().find(g => g._id === this.selectedId()) ?? null : null);
  selectedSol   = computed(() => this.selectedType() === 'sol'   ? this.solicitudes().find(s => s._id === this.selectedId()) ?? null : null);

  select(type: 'pres' | 'gasto' | 'sol', id: string) {
    if (this.selectedId() === id) { this.selectedId.set(null); this.selectedType.set(null); return; }
    this.selectedId.set(id);
    this.selectedType.set(type);
    this.editingPresId.set(null);
    this.generandoGastoPresId.set(null);
    this.activePagoGastoId.set(null);
    this.addingCotizacionId.set(null);
    this.showPresForm.set(false);
    this.showSolicitudForm.set(false);
  }

  deselect() { this.selectedId.set(null); this.selectedType.set(null); }

  // ── UI: comprobante upload per gasto ─────────────────────
  uploadingComprobanteId = signal<string | null>(null);

  // ── UI: NEW presupuesto form ─────────────────────────────
  showPresForm  = signal(false);
  savingPres    = signal(false);
  presForm      = this.emptyPresForm();
  presFormSubs  = signal<Subrubro[]>([]);
  presFormProvs = signal<Proveedor[]>([]);

  // ── UI: EDIT presupuesto form ────────────────────────────
  editingPresId = signal<string | null>(null);
  editPresForm: any = {};
  editProvs     = signal<Proveedor[]>([]);
  savingEdit    = signal(false);

  // ── UI: Generar gasto (from presupuesto aprobado) ────────
  generandoGastoPresId = signal<string | null>(null);
  savingGenerar        = signal(false);
  generarError         = signal<string | null>(null);
  generarGastoForm: {
    fecha: string;
    comprobante: File | null;
    fuente: '' | 'reserva' | 'cliente';
    reservaId: string;
    metodoPago: MetodoPago | '';
  } = { fecha: '', comprobante: null, fuente: '', reservaId: '', metodoPago: '' };

  // ── UI: Pago form ────────────────────────────────────────
  activePagoGastoId = signal<string | null>(null);
  pagoForm          = this.emptyPagoForm();
  savingPago        = signal(false);
  pagoError         = signal<string | null>(null);

  // ── Constants for template ───────────────────────────────
  readonly metodoLabels = METODO_LABELS;
  readonly metodoIcons  = METODO_ICONS;
  readonly metodoHint   = METODO_HINT;
  readonly metodos = Object.keys(METODO_LABELS) as MetodoPago[];

  ngOnInit() {
    this.cfgSvc.getRubros().subscribe(d => this.rubros.set(d));
    this.cfgSvc.getSubrubros().subscribe(d => this.allSubrubros.set(d));
    this.reservaSvc.list(this.projectId).subscribe(d => this.reservas.set(d));
    this.solicitudSvc.list(this.projectId).subscribe(d => this.solicitudes.set(d));
    this.reload();
  }

  reload() {
    this.presSvc.list(this.projectId).subscribe(d => this.presupuestos.set(d));
    this.gastoSvc.list(this.projectId).subscribe(d => this.gastos.set(d));
  }

  // ── (expand replaced by master-detail selection) ─────────

  // ── Presupuesto CRUD ─────────────────────────────────────
  onPresRubroChange() {
    this.presForm.subrubroId = '';
    this.presFormSubs.set(this.allSubrubros().filter(s => s.rubroId._id === this.presForm.rubroId));
    this.presFormProvs.set([]);
  }

  onPresSubChange() {
    if (this.presForm.subrubroId)
      this.provSvc.list(this.presForm.subrubroId).subscribe(d => this.presFormProvs.set(d));
  }

  onPresFiles(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files) this.presForm.archivos = Array.from(files);
  }

  savePres() {
    if (!this.presForm.subrubroId || !this.presForm.monto) return;
    this.savingPres.set(true);
    const fd = new FormData();
    fd.append('subrubroId', this.presForm.subrubroId);
    fd.append('monto',      String(this.presForm.monto));
    fd.append('moneda',     this.presForm.moneda);
    if (this.presForm.proveedorId) fd.append('proveedorId', this.presForm.proveedorId);
    if (this.presForm.descripcion) fd.append('descripcion', this.presForm.descripcion);
    if (this.presForm.notas)       fd.append('notas',       this.presForm.notas);
    for (const f of this.presForm.archivos) fd.append('archivos', f);
    this.presSvc.create(this.projectId, fd).subscribe({
      next: item => {
        this.presupuestos.update(l => [item, ...l]);
        this.presForm = this.emptyPresForm();
        this.presFormSubs.set([]); this.presFormProvs.set([]);
        this.showPresForm.set(false);
        this.savingPres.set(false);
        this.selectedId.set(item._id); this.selectedType.set('pres');
      },
      error: () => this.savingPres.set(false),
    });
  }

  startEditPres(p: Presupuesto) {
    this.selectedId.set(p._id); this.selectedType.set('pres');
    this.editingPresId.set(p._id);
    this.editPresForm = {
      descripcion: p.descripcion || '', monto: p.monto,
      moneda: p.moneda, proveedorId: p.proveedorId?._id || '', notas: p.notas || '',
    };
    this.provSvc.list(p.subrubroId._id).subscribe(d => this.editProvs.set(d));
  }

  cancelEditPres() { this.editingPresId.set(null); }

  saveEditPres(id: string) {
    this.savingEdit.set(true);
    this.presSvc.update(this.projectId, id, this.editPresForm).subscribe({
      next: updated => {
        this.presupuestos.update(l => l.map(x => x._id === id ? updated : x));
        this.editingPresId.set(null);
        this.savingEdit.set(false);
      },
      error: () => this.savingEdit.set(false),
    });
  }

  aprobar(p: Presupuesto) {
    this.presSvc.patchEstado(this.projectId, p._id, 'aprobado').subscribe(updated => {
      this.presupuestos.update(l => l.map(x => x._id === p._id ? updated : x));
    });
  }

  rechazar(p: Presupuesto) {
    this.presSvc.patchEstado(this.projectId, p._id, 'rechazado').subscribe(updated => {
      this.presupuestos.update(l => l.map(x => x._id === p._id ? updated : x));
    });
  }

  reactivar(p: Presupuesto) {
    this.presSvc.patchEstado(this.projectId, p._id, 'pendiente').subscribe(updated => {
      this.presupuestos.update(l => l.map(x => x._id === p._id ? updated : x));
    });
  }

  removePres(p: Presupuesto) {
    if (!confirm('¿Eliminar este presupuesto?')) return;
    this.presSvc.remove(this.projectId, p._id).subscribe(() => {
      this.presupuestos.update(l => l.filter(x => x._id !== p._id));
      if (this.selectedId() === p._id) this.deselect();
    });
  }

  // ── Generar Gasto desde Presupuesto ─────────────────────
  tieneGasto(presId: string): boolean {
    return this.gastos().some(g => g.presupuestoId?._id === presId);
  }

  startGenerarGasto(p: Presupuesto) {
    this.selectedId.set(p._id); this.selectedType.set('pres');
    this.generarGastoForm = { fecha: this.todayISO(), comprobante: null, fuente: '', reservaId: '', metodoPago: '' };
    this.generarError.set(null);
    this.generandoGastoPresId.set(p._id);
  }

  cancelGenerarGasto() {
    this.generandoGastoPresId.set(null);
    this.generarError.set(null);
  }

  onGenerarComprobante(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.generarGastoForm.comprobante = f;
  }

  confirmarGenerarGasto(p: Presupuesto) {
    if (!this.generarGastoForm.fecha) return;

    // Validar saldo de reserva si corresponde
    if (this.generarGastoForm.fuente === 'reserva' && this.generarGastoForm.reservaId) {
      const rv = this.reservas().find(r => r._id === this.generarGastoForm.reservaId);
      if (rv && saldoReserva(rv) < p.monto) {
        this.generarError.set(`Saldo insuficiente en "${rv.nombre}": disponible ${this.fmt(saldoReserva(rv), rv.moneda)}`);
        return;
      }
    }

    this.generarError.set(null);
    this.savingGenerar.set(true);
    const fd = new FormData();
    fd.append('subrubroId',    p.subrubroId._id);
    fd.append('presupuestoId', p._id);
    fd.append('monto',         String(p.monto));
    fd.append('moneda',        p.moneda);
    fd.append('fecha',         this.generarGastoForm.fecha);
    if (p.proveedorId)                     fd.append('proveedorId', p.proveedorId._id);
    if (p.descripcion)                     fd.append('descripcion', p.descripcion);
    if (p.notas)                           fd.append('notas',       p.notas);
    if (this.generarGastoForm.comprobante) fd.append('comprobante', this.generarGastoForm.comprobante);

    this.gastoSvc.create(this.projectId, fd).subscribe({
      next: item => {
        this.gastos.update(l => [item, ...l]);

        // Registrar pago inmediato si se indicó fuente
        const { fuente, reservaId, metodoPago } = this.generarGastoForm;
        if (fuente && metodoPago) {
          const pagoBody: any = { fecha: this.generarGastoForm.fecha, monto: p.monto, metodoPago };
          if (fuente === 'reserva' && reservaId) pagoBody.reservaId = reservaId;
          this.gastoSvc.addPago(this.projectId, item._id, pagoBody).subscribe({
            next: updatedGasto => {
              this.gastos.update(l => l.map(g => g._id === item._id ? updatedGasto : g));
              if (pagoBody.reservaId) this.reservaSvc.list(this.projectId).subscribe(d => this.reservas.set(d));
            },
          });
        }

        this.savingGenerar.set(false);
        this.generandoGastoPresId.set(null);
        this.selectedId.set(item._id); this.selectedType.set('gasto');
      },
      error: () => this.savingGenerar.set(false),
    });
  }

  removeGasto(g: Gasto) {
    if (!confirm('¿Eliminar este gasto?')) return;
    this.gastoSvc.remove(this.projectId, g._id).subscribe(() =>
      this.gastos.update(l => l.filter(x => x._id !== g._id))
    );
  }

  // ── Pagos ────────────────────────────────────────────────
  openPagoForm(g: Gasto) {
    this.selectedId.set(g._id); this.selectedType.set('gasto');
    this.activePagoGastoId.set(g._id);
    const restante = Math.max(0, g.monto - totalPagadoGasto(g));
    this.pagoForm = { ...this.emptyPagoForm(), monto: restante > 0 ? restante : (null as any) };
  }

  cancelPago() { this.activePagoGastoId.set(null); this.pagoError.set(null); }

  savePago(g: Gasto) {
    if (!this.pagoForm.monto || !this.pagoForm.fecha || !this.pagoForm.metodoPago) return;

    if (this.pagoForm.reservaId) {
      const rv = this.reservas().find(r => r._id === this.pagoForm.reservaId);
      if (rv && saldoReserva(rv) < this.pagoForm.monto) {
        this.pagoError.set(`Saldo insuficiente en "${rv.nombre}": disponible ${this.fmt(saldoReserva(rv), rv.moneda)}`);
        return;
      }
    }

    this.pagoError.set(null);
    this.savingPago.set(true);
    this.gastoSvc.addPago(this.projectId, g._id, this.pagoForm).subscribe({
      next: updated => {
        this.gastos.update(l => l.map(x => x._id === g._id ? updated : x));
        if (this.pagoForm.reservaId) {
          this.reservaSvc.list(this.projectId).subscribe(d => this.reservas.set(d));
        }
        this.activePagoGastoId.set(null);
        this.pagoForm = this.emptyPagoForm();
        this.savingPago.set(false);
      },
      error: () => this.savingPago.set(false),
    });
  }

  reservaNombre(reservaId: string): string {
    return this.reservas().find(r => r._id === reservaId)?.nombre ?? '';
  }

  reservaSaldo(reservaId: string): string {
    const rv = this.reservas().find(r => r._id === reservaId);
    return rv ? this.fmt(saldoReserva(rv), rv.moneda) : '';
  }

  onAddComprobante(g: Gasto, event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingComprobanteId.set(g._id);
    this.gastoSvc.addComprobante(this.projectId, g._id, file).subscribe({
      next: updated => {
        this.gastos.update(l => l.map(x => x._id === g._id ? updated : x));
        this.uploadingComprobanteId.set(null);
        (event.target as HTMLInputElement).value = '';
      },
      error: () => this.uploadingComprobanteId.set(null),
    });
  }

  removeComprobanteFile(g: Gasto, comprobanteId: string) {
    this.gastoSvc.removeComprobante(this.projectId, g._id, comprobanteId).subscribe(updated =>
      this.gastos.update(l => l.map(x => x._id === g._id ? updated : x))
    );
  }

  deletePago(g: Gasto, pagoId: string) {
    this.gastoSvc.removePago(this.projectId, g._id, pagoId).subscribe(updated =>
      this.gastos.update(l => l.map(x => x._id === g._id ? updated : x))
    );
  }

  // ── Solicitudes de Cotización ────────────────────────────
  onSolicitudRubroChange() {
    this.solicitudForm.subrubroId = '';
    this.solicitudFormSubs.set(this.allSubrubros().filter(s => s.rubroId._id === this.solicitudForm.rubroId));
  }

  saveSolicitud() {
    if (!this.solicitudForm.subrubroId) return;
    this.savingSolicitud.set(true);
    const body: any = { subrubroId: this.solicitudForm.subrubroId };
    if (this.solicitudForm.descripcion) body.descripcion = this.solicitudForm.descripcion;
    this.solicitudSvc.create(this.projectId, body).subscribe({
      next: item => {
        this.solicitudes.update(l => [item, ...l]);
        this.solicitudForm = { rubroId: '', subrubroId: '', descripcion: '' };
        this.solicitudFormSubs.set([]);
        this.showSolicitudForm.set(false);
        this.savingSolicitud.set(false);
        this.selectedId.set(item._id); this.selectedType.set('sol');
      },
      error: () => this.savingSolicitud.set(false),
    });
  }

  openAddCotizacion(s: Solicitud) {
    this.selectedId.set(s._id); this.selectedType.set('sol');
    this.cotizacionForm = { proveedorId: '', monto: null, moneda: 'ARS', notas: '', plazo: '', condiciones: '', archivos: [], provs: [] };
    this.provSvc.list(s.subrubroId._id).subscribe(d => { this.cotizacionForm.provs = d; });
    this.addingCotizacionId.set(s._id);
  }

  cancelAddCotizacion() { this.addingCotizacionId.set(null); }

  onCotizacionFiles(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files) this.cotizacionForm.archivos = Array.from(files);
  }

  saveAddCotizacion(s: Solicitud) {
    this.savingCotizacion.set(true);
    const fd = new FormData();
    fd.append('moneda', this.cotizacionForm.moneda);
    if (this.cotizacionForm.proveedorId) fd.append('proveedorId', this.cotizacionForm.proveedorId);
    if (this.cotizacionForm.monto != null) fd.append('monto', String(this.cotizacionForm.monto));
    if (this.cotizacionForm.notas) fd.append('notas', this.cotizacionForm.notas);
    if (this.cotizacionForm.plazo) fd.append('plazo', this.cotizacionForm.plazo);
    if (this.cotizacionForm.condiciones) fd.append('condiciones', this.cotizacionForm.condiciones);
    for (const f of this.cotizacionForm.archivos) fd.append('archivos', f);
    this.solicitudSvc.addCotizacion(this.projectId, s._id, fd).subscribe({
      next: updated => {
        this.solicitudes.update(l => l.map(x => x._id === s._id ? updated : x));
        this.addingCotizacionId.set(null);
        this.savingCotizacion.set(false);
      },
      error: () => this.savingCotizacion.set(false),
    });
  }

  analizarConIA(s: Solicitud) {
    const payload = {
      solicitud: {
        subrubro: s.subrubroId.nombre,
        descripcion: s.descripcion ?? '',
      },
      cotizaciones: s.cotizaciones.map(c => ({
        proveedor: c.proveedorId?.nombre ?? 'Sin proveedor',
        monto: c.monto != null ? `${c.moneda} ${c.monto}` : 'Sin monto',
        plazo: c.plazo ?? '',
        condiciones: c.condiciones ?? '',
        notas: c.notas ?? '',
        archivos: c.archivos.map(f => f.originalName),
      })),
    };
    console.log('[IA] Payload listo para análisis:', JSON.stringify(payload, null, 2));
    // TODO: conectar con el servicio de IA
  }

  removeCotizacion(s: Solicitud, cotId: string) {
    this.solicitudSvc.removeCotizacion(this.projectId, s._id, cotId).subscribe(updated =>
      this.solicitudes.update(l => l.map(x => x._id === s._id ? updated : x))
    );
  }

  seleccionar(s: Solicitud, cotId: string) {
    this.solicitudSvc.seleccionar(this.projectId, s._id, cotId).subscribe(res => {
      this.solicitudes.update(l => l.map(x => x._id === s._id ? res.solicitud : x));
      this.presupuestos.update(l => [res.presupuesto, ...l]);
      this.deselect();
    });
  }

  // ── Helpers ─────────────────────────────────────────────
  totalPagadoG(g: Gasto)  { return totalPagadoGasto(g); }
  estadoG(g: Gasto)        { return estadoGasto(g); }
  pctPagado(g: Gasto)      { return g.monto ? Math.min(100, Math.round(totalPagadoGasto(g) / g.monto * 100)) : 0; }
  restante(g: Gasto)        { return Math.max(0, g.monto - totalPagadoGasto(g)); }

  getPresById(id: string | null)   { return id ? this.presupuestos().find(p => p._id === id) ?? null : null; }
  getGastoById(id: string | null)  { return id ? this.gastos().find(g => g._id === id) ?? null : null; }

  fileUrl(filename: string) { return `/uploads/${filename}`; }
  fileIcon(mime: string)    { return mime?.includes('pdf') ? '📄' : mime?.includes('sheet') || mime?.includes('excel') || mime?.includes('csv') ? '📊' : mime?.includes('word') ? '📝' : mime?.includes('image') ? '🖼️' : '📎'; }
  fmtSize(b: number)        { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

  fmt(monto: number, moneda = 'ARS') {
    return `${moneda} ${monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
  }

  fmtFecha(fecha: string) {
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  todayISO() { return new Date().toISOString().substring(0, 10); }

  private emptyPresForm() {
    return { rubroId: '', subrubroId: '', proveedorId: '', descripcion: '', monto: null as any, moneda: 'ARS' as Moneda, notas: '', archivos: [] as File[] };
  }

  onPagoFuenteChange() {
    if (this.pagoForm.fuente !== 'reserva') this.pagoForm.reservaId = '';
    this.pagoError.set(null);
  }

  private emptyPagoForm() {
    return {
      fecha:      this.todayISO(),
      monto:      null as any,
      metodoPago: '' as MetodoPago | '',
      referencia: '',
      notas:      '',
      reservaId:  '',
      fuente:     '' as '' | 'reserva' | 'cliente',
    };
  }
}
