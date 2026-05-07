import { Component, Input, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PresupuestoService } from '../../../../core/services/presupuesto.service';
import { GastoService } from '../../../../core/services/gasto.service';
import { ProveedorService } from '../../../../core/services/proveedor.service';
import { ConfigService, Rubro, Subrubro } from '../../../../core/services/config.service';
import { ReservaService } from '../../../../core/services/reserva.service';
import { SolicitudService } from '../../../../core/services/solicitud.service';
import { ConfirmService } from '../../../../core/services/confirm.service';
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
  @Input() projectName = '';

  private presSvc      = inject(PresupuestoService);
  private gastoSvc     = inject(GastoService);
  private provSvc      = inject(ProveedorService);
  private cfgSvc       = inject(ConfigService);
  private reservaSvc   = inject(ReservaService);
  private solicitudSvc = inject(SolicitudService);
  private confirmSvc   = inject(ConfirmService);

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

  // ── UI: Edit gasto ──────────────────────────────────────
  editingGastoId = signal<string | null>(null);
  savingEditGasto = signal(false);
  editGastoForm: { monto: number | null; moneda: string; fecha: string; descripcion: string; notas: string; proveedorId: string } =
    { monto: null, moneda: 'ARS', fecha: '', descripcion: '', notas: '', proveedorId: '' };

  startEditGasto(g: Gasto) {
    this.editGastoForm = {
      monto:       g.monto,
      moneda:      g.moneda,
      fecha:       g.fecha ? g.fecha.substring(0, 10) : '',
      descripcion: g.descripcion ?? '',
      notas:       g.notas ?? '',
      proveedorId: (g.proveedorId as any)?._id ?? '',
    };
    this.editingGastoId.set(g._id);
  }

  cancelEditGasto() { this.editingGastoId.set(null); }

  saveEditGasto(g: Gasto) {
    if (!this.editGastoForm.monto || !this.editGastoForm.fecha) return;
    this.savingEditGasto.set(true);
    const data: any = {
      monto:       this.editGastoForm.monto,
      moneda:      this.editGastoForm.moneda,
      fecha:       this.editGastoForm.fecha,
      descripcion: this.editGastoForm.descripcion,
      notas:       this.editGastoForm.notas,
      proveedorId: this.editGastoForm.proveedorId || null,
    };
    this.gastoSvc.update(this.projectId, g._id, data).subscribe({
      next: updated => {
        this.gastos.update(l => l.map(x => x._id === g._id ? updated : x));
        this.editingGastoId.set(null);
        this.savingEditGasto.set(false);
      },
      error: () => this.savingEditGasto.set(false),
    });
  }

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

  async removePres(p: Presupuesto) {
    if (!await this.confirmSvc.confirm('Esta acción no se puede deshacer.', '¿Eliminar presupuesto?')) return;
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

        // El backend eliminó el presupuesto — quitarlo de la lista
        this.presupuestos.update(l => l.filter(x => x._id !== p._id));
        this.savingGenerar.set(false);
        this.generandoGastoPresId.set(null);
        this.selectedId.set(item._id); this.selectedType.set('gasto');
      },
      error: () => this.savingGenerar.set(false),
    });
  }

  async removeGasto(g: Gasto) {
    if (!await this.confirmSvc.confirm('Esta acción no se puede deshacer.', '¿Eliminar este gasto?')) return;
    this.gastoSvc.remove(this.projectId, g._id).subscribe(() => {
      this.gastos.update(l => l.filter(x => x._id !== g._id));
      if (this.selectedId() === g._id) this.deselect();
    });
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
    if (!this.pagoForm.monto || !this.pagoForm.fecha) return;

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

  imprimirComprobante(g: Gasto) {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(this.buildComprobanteHtml(g));
    w.document.close();
  }

  private buildComprobanteHtml(g: Gasto): string {
    const fecha     = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const fmtM      = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
    const totalPag  = totalPagadoGasto(g);
    const restante  = Math.max(0, g.monto - totalPag);
    const estado    = estadoGasto(g);
    const estadoColor = estado === 'pagado' ? '#166534' : estado === 'parcial' ? '#92400e' : '#888';
    const estadoTxt   = estado === 'pagado' ? 'PAGADO' : estado === 'parcial' ? 'PAGO PARCIAL' : 'PENDIENTE';
    const logoUrl   = `${window.location.origin}/assets/logo%20brume%20vector2.png`;

    // Last payment (hero)
    const lastPago  = g.pagos.length ? g.pagos[g.pagos.length - 1] : null;
    const lastFecha = lastPago
      ? new Date(lastPago.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : fecha;

    // History = all pagos except the last
    const histPagos = g.pagos.length > 1 ? g.pagos.slice(0, g.pagos.length - 1) : [];
    const histRows  = histPagos.map(p => `
      <tr>
        <td>${new Date(p.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td>${p.referencia ?? '—'}</td>
        <td class="tr">${g.moneda} ${fmtM(p.monto)}</td>
      </tr>`).join('');
    const histSection = histPagos.length ? `
      <div class="sep"></div>
      <div class="section-lbl">Pagos anteriores</div>
      <table class="tbl">
        <thead><tr><th>Fecha</th><th>Referencia</th><th class="tr">Monto</th></tr></thead>
        <tbody>${histRows}</tbody>
      </table>` : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comprobante de pago — Brumelab Arch</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;background:#f4f4f2;color:#111;-webkit-font-smoothing:antialiased}

  .bar{position:fixed;top:0;left:0;right:0;height:52px;background:#111;display:flex;align-items:center;
    justify-content:space-between;padding:0 2rem;z-index:10;gap:1rem}
  .bar-brand{color:#fff;font-size:0.72rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;white-space:nowrap}
  .bar-actions{display:flex;gap:0.5rem;flex-shrink:0}
  .btn{padding:0.38rem 1rem;border-radius:6px;font-size:0.78rem;font-weight:600;font-family:inherit;cursor:pointer;border:none}
  .btn-sec{background:transparent;color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.22)}
  .btn-sec:hover{color:#fff;border-color:rgba(255,255,255,0.5)}
  .btn-pri{background:#fff;color:#111}
  .btn-pri:hover{background:#f0f0f0}

  .page{padding:70px 1.5rem 3rem;display:flex;justify-content:center;min-height:100vh}
  .doc{background:#fff;width:100%;max-width:680px;border-radius:16px;padding:2.75rem 3.25rem 2.5rem;
    box-shadow:0 2px 16px rgba(0,0,0,0.07);border:1px solid #e8e8e8;height:fit-content}

  /* Header */
  .doc-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem}
  .brand-logo{height:32px;width:auto;display:block}
  .brand-sub{font-size:0.65rem;color:#bbb;margin-top:0.28rem;font-weight:400}
  .doc-head-right{text-align:right}
  .doc-estado{display:inline-block;font-size:0.6rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;
    padding:0.2rem 0.65rem;border-radius:20px;border:1px solid currentColor;margin-bottom:0.3rem}
  .doc-fecha{font-size:0.72rem;color:#aaa}

  .line{height:2px;background:#111;margin-bottom:1.75rem;border-radius:1px;border:none}
  .sep{height:1px;background:#ebebeb;margin:1.5rem 0;border:none}

  /* Hero — último pago */
  .pago-hero{margin-bottom:1.75rem}
  .pago-hero__label{font-size:0.6rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#aaa;margin-bottom:0.55rem}
  .pago-hero__amount{font-size:2.6rem;font-weight:900;color:#111;font-variant-numeric:tabular-nums;
    letter-spacing:-0.03em;line-height:1;margin-bottom:0.4rem}
  .pago-hero__date{font-size:0.8rem;color:#666;margin-bottom:0.25rem}
  .pago-hero__ref{font-size:0.74rem;color:#aaa;font-style:italic}

  /* Trabajo — concepto + proveedor integrados */
  .trabajo{background:#fafafa;border:1px solid #ebebeb;border-radius:10px;
    padding:1rem 1.25rem;margin-bottom:1.5rem;display:flex;flex-direction:column;gap:0.3rem}
  .trabajo-nombre{font-size:0.92rem;font-weight:800;color:#111}
  .trabajo-code{font-size:0.68rem;font-weight:400;color:#ccc;margin-left:0.3rem;font-variant-numeric:tabular-nums}
  .trabajo-prov{font-size:0.78rem;color:#555;margin-top:0.1rem}
  .trabajo-prov span{font-weight:600;color:#333}
  .trabajo-desc{font-size:0.78rem;color:#666;line-height:1.45;margin-top:0.1rem}
  .trabajo-notes{font-size:0.72rem;color:#aaa;font-style:italic}

  /* Saldo — secondary */
  .saldo{margin-bottom:0.5rem}
  .section-lbl{font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#ccc;margin-bottom:0.55rem}
  .saldo-rows{display:flex;flex-direction:column;gap:0.28rem}
  .saldo-row{display:flex;justify-content:space-between;align-items:baseline;font-size:0.78rem;color:#aaa}
  .saldo-row span:last-child{font-weight:700;font-variant-numeric:tabular-nums;color:#888}
  .saldo-row--highlight span{color:#555}
  .saldo-row--highlight span:last-child{color:#111;font-size:0.86rem}

  /* Historial */
  .tbl{width:100%;border-collapse:collapse;font-size:0.76rem}
  .tbl th{text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;font-size:0.58rem;color:#bbb;
    padding:0.28rem 0.5rem;border-bottom:1px solid #e8e8e8}
  .tbl td{padding:0.38rem 0.5rem;color:#888;border-bottom:1px solid #f5f5f5;font-variant-numeric:tabular-nums}
  .tbl tr:last-child td{border-bottom:none}
  .tr{text-align:right;font-weight:600}

  /* Signatures */
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:3rem;margin:2rem 0 1rem}
  .sig-space{height:3rem}
  .sig-line{height:1px;background:#111;margin-bottom:0.5rem}
  .sig-name{font-size:0.82rem;font-weight:700;color:#111}
  .sig-role{font-size:0.68rem;color:#aaa;margin-top:0.1rem}

  .doc-foot{font-size:0.58rem;color:#ccc;text-align:center;padding-top:1rem;border-top:1px solid #f0f0f0;letter-spacing:0.03em}

  @media print{
    .bar{display:none!important}
    body{background:#fff}
    .page{padding:0}
    .doc{box-shadow:none;border:none;border-radius:0;padding:2cm 2.2cm;max-width:100%}
    @page{margin:0;size:A4}
  }
</style>
</head>
<body>

<div class="bar">
  <span class="bar-brand">Brumelab Arch</span>
  <div class="bar-actions">
    <button class="btn btn-sec" onclick="window.close()">Cerrar</button>
    <button class="btn btn-pri" onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
</div>

<div class="page">
<div class="doc">

  <div class="doc-head">
    <div>
      <img src="${logoUrl}" alt="Brumelab Arch" class="brand-logo" />
      <div class="brand-sub">Arquitectura · Diseño · Construcción</div>
    </div>
    <div class="doc-head-right">
      <div class="doc-estado" style="color:${estadoColor}">${estadoTxt}</div>
      <div class="doc-fecha">${fecha}</div>
      ${this.projectName ? `<div class="doc-fecha" style="margin-top:0.15rem">${this.projectName}</div>` : ''}
    </div>
  </div>

  <hr class="line">

  ${lastPago ? `
  <div class="pago-hero">
    <div class="pago-hero__label">Este pago</div>
    <div class="pago-hero__amount">${g.moneda} ${fmtM(lastPago.monto)}</div>
    <div class="pago-hero__date">${lastFecha}</div>
    ${lastPago.referencia ? `<div class="pago-hero__ref">${lastPago.referencia}</div>` : ''}
    ${lastPago.notas ? `<div class="pago-hero__ref">${lastPago.notas}</div>` : ''}
  </div>` : `
  <div class="pago-hero">
    <div class="pago-hero__label">Monto del gasto</div>
    <div class="pago-hero__amount">${g.moneda} ${fmtM(g.monto)}</div>
    <div class="pago-hero__date">${fecha}</div>
  </div>`}

  <div class="trabajo">
    <div>
      <span class="trabajo-nombre">${g.subrubroId.nombre}</span>
      <span class="trabajo-code">${g.subrubroId.codigo}</span>
    </div>
    ${g.proveedorId ? `<div class="trabajo-prov">Proveedor · <span>${g.proveedorId.nombre}</span></div>` : ''}
    ${g.descripcion ? `<div class="trabajo-desc">${g.descripcion}</div>` : ''}
    ${g.notas ? `<div class="trabajo-notes">${g.notas}</div>` : ''}
  </div>

  <div class="saldo">
    <div class="section-lbl">Resumen del gasto</div>
    <div class="saldo-rows">
      <div class="saldo-row saldo-row--highlight">
        <span>Total presupuestado</span>
        <span>${g.moneda} ${fmtM(g.monto)}</span>
      </div>
      ${totalPag > 0 ? `
      <div class="saldo-row">
        <span>Pagado acumulado</span>
        <span>${g.moneda} ${fmtM(totalPag)}</span>
      </div>` : ''}
      ${restante > 0 ? `
      <div class="saldo-row">
        <span>Saldo pendiente</span>
        <span>${g.moneda} ${fmtM(restante)}</span>
      </div>` : ''}
    </div>
  </div>

  ${histSection}

  <hr class="sep">

  <div class="sigs">
    <div>
      <div class="sig-space"></div>
      <div class="sig-line"></div>
      <div class="sig-name">Brumelab Arch</div>
      <div class="sig-role">Firma del Emisor</div>
    </div>
    <div>
      <div class="sig-space"></div>
      <div class="sig-line"></div>
      <div class="sig-name">${g.proveedorId?.nombre ?? 'Proveedor'}</div>
      <div class="sig-role">Firma del Receptor</div>
    </div>
  </div>

  <div class="doc-foot">
    Emitido el ${fecha} &middot; Brumelab Arch &middot; Conservar original firmado por ambas partes
  </div>

</div>
</div>
</body>
</html>`;
  }

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
      metodoPago: 'efectivo' as MetodoPago | '',
      referencia: '',
      notas:      '',
      reservaId:  '',
      fuente:     '' as '' | 'reserva' | 'cliente',
    };
  }
}
