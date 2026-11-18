import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SeleccionService } from '../../../../core/services/seleccion.service';
import { ConfigService, Item } from '../../../../core/services/config.service';
import { ConfirmService } from '../../../../core/services/confirm.service';
import { Seleccion, agruparSel, categoriaSel, nombreSel, unidadSel, urgenciaSel, ESTADO_SELECCION_LABELS } from '../../../../shared/models/seleccion.model';

/** Lista de lo que el cliente tiene que comprar por su cuenta. El cliente la ve y la va tildando desde su portal. */
@Component({
  selector: 'app-selecciones',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './selecciones.component.html',
  styleUrl: './selecciones.component.scss',
})
export class SeleccionesComponent implements OnInit {
  @Input({ required: true }) projectId!: string;
  @Input() canEdit = true;
  @Input() projectName = '';

  private svc = inject(SeleccionService);
  private cfg = inject(ConfigService);
  private confirmSvc = inject(ConfirmService);

  items = signal<Seleccion[]>([]);
  loading = signal(true);
  guardando = signal(false);
  error = signal('');

  // alta rápida
  form = { nombre: '', categoria: '', cantidad: null as number | null, fechaLimite: '', observacion: '', link: '' };
  masCampos = signal(false);

  // catálogo (opcional)
  catAbierto = signal(false);
  catalogo = signal<Item[]>([]);
  busca = signal('');
  marcados = signal<Set<string>>(new Set());

  // edición en la misma fila
  editId = signal<string | null>(null);
  draft = { nombre: '', categoria: '', cantidad: null as number | null, fechaLimite: '', observacion: '', link: '' };

  readonly ESTADO = ESTADO_SELECCION_LABELS;
  nombre = nombreSel; categoria = categoriaSel; unidad = unidadSel; urgencia = (s: Seleccion) => urgenciaSel(s);

  grupos = computed(() => agruparSel(this.items()));
  total = computed(() => this.items().length);
  comprados = computed(() => this.items().filter(i => i.estadoCliente === 'comprado').length);
  pct = computed(() => (this.total() ? Math.round(this.comprados() / this.total() * 100) : 0));
  vencidos = computed(() => this.items().filter(i => urgenciaSel(i)?.tono === 'vencido').length);
  categorias = computed(() => [...new Set(this.items().map(categoriaSel))].sort());

  /** Ítems del catálogo que todavía no están en la lista, filtrados por la búsqueda. */
  catalogoFiltrado = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const yaEstan = new Set(this.items().map(i => i.itemId?._id).filter(Boolean));
    return this.catalogo().filter(i => !yaEstan.has(i._id))
      .filter(i => !q || `${i.nombre} ${i.subrubroId?.nombre ?? ''} ${i.subrubroId?.rubroId?.nombre ?? ''}`.toLowerCase().includes(q)).slice(0, 80);
  });

  ngOnInit() {
    this.svc.list(this.projectId).subscribe({ next: d => { this.items.set(d); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  // ── alta rápida ──
  agregar() {
    const f = this.form;
    if (!f.nombre.trim()) { this.error.set('Escribí qué tiene que comprar el cliente.'); return; }
    this.error.set(''); this.guardando.set(true);
    this.svc.create(this.projectId, { nombre: f.nombre.trim(), categoria: f.categoria.trim() || undefined, cantidad: f.cantidad || undefined, fechaLimite: f.fechaLimite || null, observacion: f.observacion || undefined, link: f.link || undefined }).subscribe({
      next: s => {
        this.items.update(l => [...l, s]); this.guardando.set(false);
        // se conserva la categoría y la fecha para cargar varios seguidos
        this.form = { nombre: '', categoria: f.categoria, cantidad: null, fechaLimite: f.fechaLimite, observacion: '', link: '' };
        setTimeout(() => document.getElementById('sel-nombre')?.focus());
      },
      error: e => { this.guardando.set(false); this.error.set(e.error?.message ?? 'No se pudo agregar.'); },
    });
  }

  // ── catálogo ──
  abrirCatalogo() {
    this.catAbierto.set(!this.catAbierto());
    if (this.catAbierto() && !this.catalogo().length) this.cfg.getItems().subscribe(d => this.catalogo.set(d));
  }
  marcar(id: string) { this.marcados.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  agregarDelCatalogo() {
    const ids = [...this.marcados()]; if (!ids.length) return;
    this.guardando.set(true);
    this.svc.createMany(this.projectId, ids).subscribe({
      next: l => { this.items.update(x => [...x, ...l]); this.marcados.set(new Set()); this.guardando.set(false); this.catAbierto.set(false); },
      error: e => { this.guardando.set(false); this.error.set(e.error?.message ?? 'No se pudieron agregar.'); },
    });
  }

  /** Lista típica de cosas que suele comprar el propietario. Se puede editar o quitar después. */
  readonly SUGERIDOS: { nombre: string; categoria: string }[] = [
    { nombre: 'Grifería de cocina', categoria: 'Cocina' }, { nombre: 'Bacha de cocina', categoria: 'Cocina' }, { nombre: 'Mesada de cocina', categoria: 'Cocina' }, { nombre: 'Electrodomésticos', categoria: 'Cocina' },
    { nombre: 'Inodoro y bidet', categoria: 'Baños' }, { nombre: 'Grifería de baño', categoria: 'Baños' }, { nombre: 'Mesada y bacha de baño', categoria: 'Baños' }, { nombre: 'Accesorios de baño', categoria: 'Baños' },
    { nombre: 'Pisos', categoria: 'Pisos y revestimientos' }, { nombre: 'Revestimientos de baños y cocina', categoria: 'Pisos y revestimientos' },
    { nombre: 'Artefactos de iluminación', categoria: 'Iluminación' }, { nombre: 'Llaves y tomas', categoria: 'Iluminación' },
    { nombre: 'Color de pintura', categoria: 'Terminaciones' }, { nombre: 'Manijas y cerraduras', categoria: 'Terminaciones' }, { nombre: 'Cortinas', categoria: 'Terminaciones' },
  ];
  cargarSugeridos() {
    this.guardando.set(true);
    forkJoin(this.SUGERIDOS.map(s => this.svc.create(this.projectId, s))).subscribe({
      next: l => { this.items.update(x => [...x, ...l]); this.guardando.set(false); },
      error: () => { this.guardando.set(false); this.error.set('No se pudo cargar la lista sugerida.'); },
    });
  }

  // ── edición ──
  editar(s: Seleccion) {
    this.editId.set(s._id);
    this.draft = { nombre: nombreSel(s), categoria: categoriaSel(s), cantidad: s.cantidad ?? null, fechaLimite: s.fechaLimite ? s.fechaLimite.substring(0, 10) : '', observacion: s.observacion ?? '', link: s.link ?? '' };
  }
  guardarEdicion(s: Seleccion) {
    const d = this.draft; if (!d.nombre.trim()) return;
    this.svc.update(this.projectId, s._id, { nombre: d.nombre.trim(), categoria: d.categoria.trim() || 'Otros', cantidad: d.cantidad ?? undefined, fechaLimite: d.fechaLimite || null, observacion: d.observacion, link: d.link } as Partial<Seleccion>).subscribe(u => {
      this.items.update(l => l.map(i => (i._id === u._id ? u : i))); this.editId.set(null);
    });
  }
  async quitar(s: Seleccion) {
    if (!await this.confirmSvc.confirm('El cliente deja de verlo en su lista.', `¿Quitar "${nombreSel(s)}"?`)) return;
    this.svc.remove(this.projectId, s._id).subscribe(() => this.items.update(l => l.filter(i => i._id !== s._id)));
  }

  // ── lista para darle al cliente (se imprime o se guarda como PDF) ──
  imprimir() {
    const w = window.open('', '_blank'); if (!w) return;
    const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const fecha = (s: Seleccion) => (s.fechaLimite ? new Date(s.fechaLimite).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');
    const filas = this.grupos().map(g => `<h2>${esc(g.categoria)}</h2><table>${g.items.map(s => `<tr><td class="c">☐</td><td><b>${esc(nombreSel(s))}</b>${s.cantidad ? ` · ${s.cantidad} ${esc(unidadSel(s))}` : ''}${s.observacion ? `<br><small>${esc(s.observacion)}</small>` : ''}</td><td class="f">${fecha(s) ? 'Para el ' + fecha(s) : ''}</td></tr>`).join('')}</table>`).join('');
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista de compras${this.projectName ? ' - ' + esc(this.projectName) : ''}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;color:#111;max-width:760px;margin:2rem auto;padding:0 1rem}h1{font-size:1.5rem;margin:0}p.s{color:#666;margin:.2rem 0 1.5rem}h2{font-size:1rem;text-transform:uppercase;letter-spacing:.08em;border-bottom:2px solid #111;padding-bottom:.3rem;margin:1.6rem 0 .4rem}table{width:100%;border-collapse:collapse}td{padding:.55rem .3rem;border-bottom:1px solid #ddd;vertical-align:top}td.c{width:1.6rem;font-size:1.2rem}td.f{text-align:right;white-space:nowrap;color:#555}small{color:#666}.bar{margin-bottom:1rem}button{padding:.5rem 1rem;font:inherit;cursor:pointer}@media print{.bar{display:none}}</style></head><body>
<div class="bar"><button onclick="window.print()">Imprimir / guardar como PDF</button></div>
<h1>Lo que tenés que comprar${this.projectName ? ' — ' + esc(this.projectName) : ''}</h1><p class="s">Lista de compras a cargo del propietario. Emitida el ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>${filas}</body></html>`);
    w.document.close();
  }
}
