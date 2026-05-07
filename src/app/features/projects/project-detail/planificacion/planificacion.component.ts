import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { PlanificacionService } from '../../../../core/services/planificacion.service';
import { ConfigService, Rubro, Subrubro } from '../../../../core/services/config.service';
import { PdfService } from '../../../../core/services/pdf.service';
import { PlanLinea } from '../../../../shared/models/obra.model';
import { environment } from '../../../../../environments/environment';

interface ProyectoEtapa {
  _id: string;
  orden: number;
  nombre: string;
  fechaInicio?: string | null;
  duracion?:    number | null;
}

interface ColInfo {
  semana:      number;   // >0 semana real; <0 etapa sin fecha
  label:       string;
  etapaRef:    string;
  etapaNombre: string;
  etapaStart:  boolean;
  etapaSpan:   number;
  undated:     boolean;
}

interface EtapaGroup { etapaRef: string; nombre: string; span: number; undated: boolean; }

type TableRowItem =
  | { kind: 'etapa'; nombre: string; undated: boolean }
  | { kind: 'week';  semana: number; label: string; undated: boolean };

@Component({
  selector: 'app-planificacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './planificacion.component.html',
  styleUrl: './planificacion.component.scss',
})
export class PlanificacionComponent implements OnInit {
  @Input({ required: true }) projectId!: string;
  @Input() projectName = '';

  private planSvc = inject(PlanificacionService);
  private cfgSvc  = inject(ConfigService);
  private http    = inject(HttpClient);
  private pdfSvc  = inject(PdfService);

  lineas    = signal<PlanLinea[]>([]);
  loading   = signal(true);
  saving    = signal(false);
  dirty     = signal(false);

  etapas    = signal<ProyectoEtapa[]>([]);
  rubros    = signal<Rubro[]>([]);
  subrubros = signal<Subrubro[]>([]);

  // edits Map: `${lineaIdx}_${semana}` → monto
  private edits = new Map<string, number>();
  editsV = signal(0);

  // Panel agregar / editar
  panelOpen  = signal(false);
  editIdx    = signal<number | null>(null);  // null = nueva fila

  // Campos del panel
  fRubroId    = signal('');
  fSubrubroId = signal('');
  fConcepto   = signal('');
  fWeekMap    = signal<Record<number, number>>({});
  fModo       = signal<'manual' | 'parejo' | 'semana'>('manual');
  fMonto      = signal<number | null>(null);
  fSemana     = signal<number | null>(null);
  fEtapaRef   = signal<string>('');

  readonly modos = ['manual', 'parejo', 'semana'] as const;
  readonly modoInfo = {
    manual: { label: 'Manual',  desc: 'Completás montos celda a celda en el timeline' },
    parejo: { label: 'Parejo',  desc: 'Distribuye el monto total en semanas iguales' },
    semana: { label: 'Semana',  desc: 'Asigna el monto total a una sola semana' },
  } as const;

  weekMapTotal = computed(() => Object.values(this.fWeekMap()).reduce((s, v) => s + v, 0));

  // ── Computed ─────────────────────────────────────────────

  filteredSubs = computed(() =>
    this.subrubros().filter(s => !this.fRubroId() || s.rubroId._id === this.fRubroId())
  );

  cols = computed<ColInfo[]>(() => {
    const sorted = [...this.etapas()].sort((a, b) => a.orden - b.orden);
    const result: ColInfo[] = [];
    let weekNum = 1, undatedN = -1;
    for (const e of sorted) {
      if (e.fechaInicio && e.duracion) {
        const base = new Date(e.fechaInicio);
        for (let w = 0; w < e.duracion; w++) {
          const d = new Date(base);
          d.setDate(d.getDate() + w * 7);
          result.push({
            semana: weekNum++,
            label: `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`,
            etapaRef: e._id, etapaNombre: e.nombre,
            etapaStart: w === 0, etapaSpan: e.duracion!, undated: false,
          });
        }
      } else {
        result.push({
          semana: undatedN--, label: '—',
          etapaRef: e._id, etapaNombre: e.nombre,
          etapaStart: true, etapaSpan: 1, undated: true,
        });
      }
    }
    return result;
  });

  etapaGroups = computed<EtapaGroup[]>(() => {
    const g: EtapaGroup[] = [];
    for (const c of this.cols()) if (c.etapaStart) g.push({ etapaRef: c.etapaRef, nombre: c.etapaNombre, span: c.etapaSpan, undated: c.undated });
    return g;
  });

  etapasConFechas = computed(() =>
    this.etapas().filter(e => e.fechaInicio && e.duracion).sort((a, b) => a.orden - b.orden)
  );

  datedCols = computed(() => this.cols().filter(c => !c.undated));

  grandTotal = computed(() => {
    this.editsV();
    return this.lineas().reduce((s, _, i) => s + this.rowTotal(i), 0);
  });

  tableRows = computed<TableRowItem[]>(() => {
    const result: TableRowItem[] = [];
    for (const g of this.etapaGroups()) {
      result.push({ kind: 'etapa', nombre: g.nombre, undated: g.undated });
      for (const c of this.cols().filter(c => c.etapaRef === g.etapaRef)) {
        result.push({ kind: 'week', semana: c.semana, label: c.label, undated: c.undated });
      }
    }
    return result;
  });

  formValid = computed(() => {
    if (!this.fSubrubroId()) return false;
    const modo = this.fModo();
    if (modo === 'manual') return true;
    const monto = this.fMonto();
    if (!monto || monto <= 0) return false;
    if (modo === 'semana') return !!this.fSemana();
    return true;
  });

  // ── Init ─────────────────────────────────────────────────

  ngOnInit() {
    this.cfgSvc.getRubros().subscribe(r => this.rubros.set(r));
    this.cfgSvc.getSubrubros().subscribe(s => this.subrubros.set(s));
    this.http.get<any[]>(`${environment.apiUrl}/projects/${this.projectId}/etapas`).subscribe({
      next: data => {
        this.etapas.set(data.map(d => ({
          _id:         d._id,
          orden:       d.orden,
          nombre:      d.nombre || d.etapaId?.nombre || '',
          fechaInicio: d.fechaInicio ? new Date(d.fechaInicio).toISOString().split('T')[0] : null,
          duracion:    d.duracion ?? null,
        })));
        this.planSvc.list(this.projectId).subscribe({
          next: saved => {
            this.lineas.set(saved);
            saved.forEach((l, idx) => l.semanas.forEach(s => this.edits.set(`${idx}_${s.semana}`, s.monto)));
            this.editsV.update(v => v + 1);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  // ── Celda ────────────────────────────────────────────────

  getCell(idx: number, semana: number): number {
    this.editsV();
    return this.edits.get(`${idx}_${semana}`) ?? 0;
  }

  setCell(idx: number, semana: number, raw: string) {
    // Accept es-AR format (1.500,75) or plain (1500): strip dots, swap comma→dot
    const cleaned = raw.trim().replace(/\./g, '').replace(',', '.');
    const val = parseFloat(cleaned) || 0;
    if (val > 0) this.edits.set(`${idx}_${semana}`, val);
    else         this.edits.delete(`${idx}_${semana}`);
    this.editsV.update(v => v + 1);
    this.dirty.set(true);
  }

  rowTotal(idx: number): number {
    this.editsV();
    return this.cols().reduce((s, c) => s + this.getCell(idx, c.semana), 0);
  }

  colTotal(semana: number): number {
    this.editsV();
    return this.lineas().reduce((s, _, i) => s + this.getCell(i, semana), 0);
  }

  // ── Panel ────────────────────────────────────────────────

  openAdd() {
    this.editIdx.set(null);
    this.fRubroId.set('');
    this.fSubrubroId.set('');
    this.fConcepto.set('');
    this.fWeekMap.set({});
    this.fModo.set('manual');
    this.fMonto.set(null);
    this.fSemana.set(null);
    this.fEtapaRef.set('');
    this.panelOpen.set(true);
  }

  openEdit(idx: number) {
    const l = this.lineas()[idx];
    const weekMap: Record<number, number> = {};
    this.cols().forEach(c => {
      const v = this.getCell(idx, c.semana);
      if (v > 0) weekMap[c.semana] = v;
    });
    this.editIdx.set(idx);
    this.fRubroId.set(l.subrubroId.rubroId?._id ?? '');
    this.fSubrubroId.set(l.subrubroId._id);
    this.fConcepto.set(l.concepto ?? '');
    this.fWeekMap.set(weekMap);
    this.fModo.set('manual');
    this.fMonto.set(null);
    this.fSemana.set(null);
    this.fEtapaRef.set('');
    this.panelOpen.set(true);
  }

  applyParejo() {
    const monto = this.fMonto();
    if (!monto || monto <= 0) return;
    const ref   = this.fEtapaRef();
    const scope = this.datedCols().filter(c => !ref || c.etapaRef === ref);
    if (!scope.length) return;
    const each = parseFloat((monto / scope.length).toFixed(2));
    const last  = parseFloat((monto - each * (scope.length - 1)).toFixed(2));
    this.fWeekMap.update(m => {
      const next = { ...m };
      scope.forEach((c, i) => { next[c.semana] = i === scope.length - 1 ? last : each; });
      return next;
    });
  }

  setWeekAmount(semana: number, raw: string) {
    const cleaned = raw.trim().replace(/\./g, '').replace(',', '.');
    const val = parseFloat(cleaned) || 0;
    this.fWeekMap.update(m => {
      const next = { ...m };
      if (val > 0) next[semana] = val;
      else delete next[semana];
      return next;
    });
  }

  closePanel() { this.panelOpen.set(false); }

  savePanel() {
    const sub = this.subrubros().find(s => s._id === this.fSubrubroId());
    if (!sub) return;

    const modo = this.fModo();
    if (modo === 'parejo') {
      this.applyParejo();
    } else if (modo === 'semana') {
      const semana = this.fSemana();
      const monto  = this.fMonto();
      if (semana && monto && monto > 0) this.fWeekMap.set({ [semana]: monto });
    }

    const semanas = Object.entries(this.fWeekMap())
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ semana: Number(k), monto: v }));

    const linea: PlanLinea = {
      project:    this.projectId,
      subrubroId: { _id: sub._id, nombre: sub.nombre, codigo: sub.codigo, rubroId: { _id: sub.rubroId._id, nombre: sub.rubroId.nombre } },
      concepto:   this.fConcepto().trim() || undefined,
      etapaRef: null, etapaNombre: null,
      monto: this.weekMapTotal(), modo: 'manual' as any, hitos: [], semanas,
    };

    const idx = this.editIdx();
    if (idx === null) {
      const newIdx = this.lineas().length;
      this.lineas.update(l => [...l, linea]);
      semanas.forEach(s => this.edits.set(`${newIdx}_${s.semana}`, s.monto));
    } else {
      // Limpiar edits anteriores de esa fila
      this.edits.forEach((_, k) => { if (k.startsWith(`${idx}_`)) this.edits.delete(k); });
      this.lineas.update(l => l.map((x, i) => i === idx ? linea : x));
      semanas.forEach(s => this.edits.set(`${idx}_${s.semana}`, s.monto));
    }

    this.editsV.update(v => v + 1);
    this.dirty.set(true);
    this.panelOpen.set(false);
  }

  removeLinea(idx: number) {
    const newEdits = new Map<string, number>();
    this.edits.forEach((val, key) => {
      const [rowStr, semStr] = key.split('_');
      const row = parseInt(rowStr);
      if (row === idx) return;
      newEdits.set(`${row > idx ? row - 1 : row}_${semStr}`, val);
    });
    this.edits.clear();
    newEdits.forEach((v, k) => this.edits.set(k, v));
    this.lineas.update(l => l.filter((_, i) => i !== idx));
    this.editsV.update(v => v + 1);
    this.dirty.set(true);
    if (this.editIdx() === idx) this.panelOpen.set(false);
  }

  // ── Guardar ──────────────────────────────────────────────

  save() {
    this.saving.set(true);
    const body = this.lineas().map((l, idx) => ({
      subrubroId:  l.subrubroId._id,
      concepto:    l.concepto ?? '',
      etapaRef:    null, etapaNombre: null,
      monto:       this.rowTotal(idx),
      modo:        'manual',
      hitos:       [],
      semanas:     this.cols()
        .map(c => ({ semana: c.semana, monto: this.getCell(idx, c.semana) }))
        .filter(s => s.monto > 0),
    }));
    this.planSvc.save(this.projectId, body).subscribe({
      next: saved => {
        this.lineas.set(saved);
        this.edits.clear();
        saved.forEach((l, i) => l.semanas.forEach(s => this.edits.set(`${i}_${s.semana}`, s.monto)));
        this.editsV.update(v => v + 1);
        this.saving.set(false);
        this.dirty.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  fmt(n: number): string {
    return n > 0 ? n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '';
  }

  // ── PDF export ───────────────────────────────────────────
  exportPdf() {
    const datedCols = this.cols().filter(c => !c.undated);
    this.pdfSvc.exportPlanificacion({
      brand: { projectName: this.projectName || this.projectId },
      etapaHeaders: this.etapaGroups()
        .filter(g => !g.undated)
        .map(g => ({ label: g.nombre, span: g.span })),
      colHeaders: datedCols.map(c => ({ sem: String(c.semana), date: c.label })),
      rows: this.lineas().map((l, idx) => ({
        subrubro: l.subrubroId.nombre,
        rubro:    l.subrubroId.rubroId?.nombre ?? '',
        cells:    datedCols.map(c => this.getCell(idx, c.semana)),
        total:    this.rowTotal(idx),
      })),
      colTotals:  datedCols.map(c => this.colTotal(c.semana)),
      grandTotal: this.grandTotal(),
    });
  }
}
