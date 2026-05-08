import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService } from '../../../core/services/client.service';
import {
  CuentaCliente, MovimientoCliente,
  TipoCuenta, TipoMovimiento, MonedaCaja,
  TIPO_CUENTA_LABELS,
} from '../../../shared/models/caja-cliente.model';

interface MovForm {
  tipo:            TipoMovimiento;
  monto:           number | null;
  descripcion:     string;
  fecha:           string;
  cuentaId:        string;
  cuentaOrigenId:  string;
  cuentaDestinoId: string;
}

interface CuentaForm {
  nombre:       string;
  tipo:         TipoCuenta;
  saldoInicial: number | null;
  moneda:       MonedaCaja;
}

interface MovEnriquecido extends MovimientoCliente { cuentaNombre?: string; }
interface MovGroup { label: string; movs: MovEnriquecido[]; }

@Component({
  selector: 'app-client-caja',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-caja.component.html',
  styleUrl: './client-caja.component.scss',
})
export class ClientCajaComponent implements OnInit {
  @Input({ required: true }) projectId!: string;

  private svc = inject(ClientService);

  cuentas     = signal<CuentaCliente[]>([]);
  movimientos = signal<MovimientoCliente[]>([]);
  loading     = signal(true);

  showMovSheet    = signal(false);
  showCuentaSheet = signal(false);
  saving          = signal(false);
  editingMovId    = signal<string | null>(null);
  movError        = signal<string | null>(null);

  activeCuenta = signal<string>('all');

  movForm: MovForm = this.emptyMovForm();
  cuentaForm: CuentaForm = this.emptyCuentaForm();

  readonly TIPO_CUENTA_LABELS = TIPO_CUENTA_LABELS;
  readonly TIPO_CUENTA_TIPOS: TipoCuenta[] = ['efectivo', 'mercadopago', 'banco', 'otro'];
  readonly MOV_TIPOS: { key: TipoMovimiento; label: string }[] = [
    { key: 'ingreso', label: 'Ingreso' },
    { key: 'egreso', label: 'Egreso' },
    { key: 'transferencia', label: 'Transferencia' },
  ];

  totalBalance = computed(() =>
    this.cuentas().reduce((s, c) => s + (c.balance ?? 0), 0)
  );

  movsByDate = computed<MovGroup[]>(() => {
    const cuentaMap = new Map(this.cuentas().map(c => [c._id, c.nombre]));
    const today     = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

    const groups = new Map<string, MovEnriquecido[]>();
    for (const m of this.movimientos()) {
      const d   = new Date(m.fecha); d.setHours(0,0,0,0);
      const key = d.getTime() === today.getTime()     ? 'Hoy'
                : d.getTime() === yesterday.getTime() ? 'Ayer'
                : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
      if (!groups.has(key)) groups.set(key, []);
      const enriched: MovEnriquecido = { ...m, cuentaNombre: m.cuentaId ? cuentaMap.get(m.cuentaId) : undefined };
      groups.get(key)!.push(enriched);
    }
    return Array.from(groups.entries()).map(([label, movs]) => ({ label, movs }));
  });

  ngOnInit() { this.load(); }

  private load() {
    this.loading.set(true);
    this.svc.listCuentas(this.projectId).subscribe(({ cuentas }) => {
      this.cuentas.set(cuentas);
      this.svc.listMovimientos(this.projectId).subscribe(({ movimientos }) => {
        this.movimientos.set(movimientos);
        this.loading.set(false);
      });
    });
  }

  openMovSheet() {
    this.editingMovId.set(null);
    this.movError.set(null);
    this.movForm = this.emptyMovForm();
    this.showMovSheet.set(true);
  }

  openEditMovSheet(m: MovimientoCliente) {
    this.movError.set(null);
    this.editingMovId.set(m._id);
    this.movForm = {
      tipo:            m.tipo,
      monto:           m.monto,
      descripcion:     m.descripcion ?? '',
      fecha:           new Date(m.fecha).toISOString().substring(0, 10),
      cuentaId:        m.cuentaId ?? '',
      cuentaOrigenId:  m.cuentaOrigenId ?? '',
      cuentaDestinoId: m.cuentaDestinoId ?? '',
    };
    this.showMovSheet.set(true);
  }

  openCuentaSheet() {
    this.cuentaForm = this.emptyCuentaForm();
    this.showCuentaSheet.set(true);
  }

  saveMov() {
    if (!this.movForm.monto || this.movForm.monto <= 0) return;
    this.saving.set(true);
    const body: Partial<MovimientoCliente> = {
      tipo:            this.movForm.tipo,
      monto:           this.movForm.monto!,
      descripcion:     this.movForm.descripcion,
      fecha:           this.movForm.fecha,
      cuentaId:        this.movForm.tipo !== 'transferencia' ? this.movForm.cuentaId || undefined : undefined,
      cuentaOrigenId:  this.movForm.tipo === 'transferencia' ? this.movForm.cuentaOrigenId || undefined : undefined,
      cuentaDestinoId: this.movForm.tipo === 'transferencia' ? this.movForm.cuentaDestinoId || undefined : undefined,
    };
    const editId = this.editingMovId();
    const call = editId
      ? this.svc.updateMovimiento(this.projectId, editId, body)
      : this.svc.createMovimiento(this.projectId, body);
    call.subscribe({
      next: () => { this.saving.set(false); this.showMovSheet.set(false); this.editingMovId.set(null); this.movError.set(null); this.load(); },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message ?? 'No se pudo guardar el movimiento.';
        this.movError.set(msg);
      },
    });
  }

  saveCuenta() {
    if (!this.cuentaForm.nombre.trim()) return;
    this.saving.set(true);
    this.svc.createCuenta(this.projectId, {
      nombre:       this.cuentaForm.nombre,
      tipo:         this.cuentaForm.tipo,
      saldoInicial: this.cuentaForm.saldoInicial ?? 0,
      moneda:       this.cuentaForm.moneda,
    }).subscribe({
      next: () => { this.saving.set(false); this.showCuentaSheet.set(false); this.load(); },
      error: () => this.saving.set(false),
    });
  }

  deleteMov(id: string) {
    this.svc.deleteMovimiento(this.projectId, id).subscribe(() => this.load());
  }

  deleteCuenta(id: string) {
    if (!confirm('¿Eliminar esta cuenta y todos sus movimientos?')) return;
    this.svc.deleteCuenta(this.projectId, id).subscribe(() => this.load());
  }

  fmt(n: number): string {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  cuentaNombre(id?: string | null): string {
    if (!id) return '';
    return this.cuentas().find(c => c._id === id)?.nombre ?? '';
  }

  private emptyMovForm(): MovForm {
    return {
      tipo: 'ingreso', monto: null, descripcion: '',
      fecha: new Date().toISOString().substring(0, 10),
      cuentaId: '', cuentaOrigenId: '', cuentaDestinoId: '',
    };
  }

  private emptyCuentaForm(): CuentaForm {
    return { nombre: '', tipo: 'efectivo', saldoInicial: null, moneda: 'ARS' };
  }
}
