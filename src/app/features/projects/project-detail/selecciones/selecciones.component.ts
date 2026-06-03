import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SeleccionService } from '../../../../core/services/seleccion.service';
import { ConfigService, Item, Rubro, Subrubro } from '../../../../core/services/config.service';
import {
  Seleccion,
  EstadoSeleccion,
  ESTADO_SELECCION_LABELS,
} from '../../../../shared/models/seleccion.model';

interface AsignacionDraft {
  itemId: string;
  cantidad: number | null;
  unidad: string;
  observacion: string;
}

@Component({
  selector: 'app-selecciones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './selecciones.component.html',
  styleUrl: './selecciones.component.scss',
})
export class SeleccionesComponent implements OnInit {
  @Input({ required: true }) projectId!: string;

  private svc    = inject(SeleccionService);
  private cfgSvc = inject(ConfigService);

  asignadas = signal<Seleccion[]>([]);
  rubros    = signal<Rubro[]>([]);
  subrubros = signal<Subrubro[]>([]);
  items     = signal<Item[]>([]);

  loading  = signal(true);
  saving   = signal(false);
  catOpen  = signal(false);

  // State for catalog browsing
  expandedRubros    = signal<Set<string>>(new Set());
  expandedSubrubros = signal<Set<string>>(new Set());

  // Inline edit for assigned items
  editingId   = signal<string | null>(null);
  editDraft   = signal<Partial<Seleccion>>({});

  // Quick-add draft when clicking an item from catalog
  addingItemId = signal<string | null>(null);
  addDraft     = signal<AsignacionDraft>({ itemId: '', cantidad: null, unidad: '', observacion: '' });

  readonly ESTADO_LABELS = ESTADO_SELECCION_LABELS;

  // Grouped view for the assigned list
  rubroGroups = computed(() => {
    const map = new Map<string, { rubroNombre: string; subrubroGroups: Map<string, { subrubroNombre: string; items: Seleccion[] }> }>();
    for (const s of this.asignadas()) {
      const rId  = s.itemId?.subrubroId?.rubroId?._id   ?? 'otros';
      const rNom = s.itemId?.subrubroId?.rubroId?.nombre ?? 'Otros';
      const sId  = s.itemId?.subrubroId?._id   ?? 'otros';
      const sNom = s.itemId?.subrubroId?.nombre ?? 'Otros';
      if (!map.has(rId)) map.set(rId, { rubroNombre: rNom, subrubroGroups: new Map() });
      const rGroup = map.get(rId)!;
      if (!rGroup.subrubroGroups.has(sId)) rGroup.subrubroGroups.set(sId, { subrubroNombre: sNom, items: [] });
      rGroup.subrubroGroups.get(sId)!.items.push(s);
    }
    return Array.from(map.entries()).map(([rId, g]) => ({
      rubroId: rId,
      rubroNombre: g.rubroNombre,
      subrubroGroups: Array.from(g.subrubroGroups.entries()).map(([sId, sg]) => ({
        subrubroId: sId,
        subrubroNombre: sg.subrubroNombre,
        items: sg.items,
      })),
    }));
  });

  total     = computed(() => this.asignadas().length);
  comprados = computed(() => this.asignadas().filter(s => s.estadoCliente === 'comprado').length);

  // Catalog: rubros that have at least one item not yet assigned
  catalogRubros = computed(() =>
    this.rubros().filter(r =>
      this.subrubrosDe(r._id).some(s => this.itemsDe(s._id).length > 0)
    )
  );

  ngOnInit() {
    this.svc.list(this.projectId).subscribe({
      next: data => { this.asignadas.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.cfgSvc.getRubros().subscribe(d => this.rubros.set(d));
    this.cfgSvc.getSubrubros().subscribe(d => this.subrubros.set(d));
    this.cfgSvc.getItems().subscribe(d => this.items.set(d));
  }

  // Catalog navigation
  toggleCatRubro(id: string) {
    this.expandedRubros.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  isCatRubroOpen(id: string) { return this.expandedRubros().has(id); }

  toggleCatSubrubro(id: string) {
    this.expandedSubrubros.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  isCatSubrubroOpen(id: string) { return this.expandedSubrubros().has(id); }

  subrubrosDe(rubroId: string) { return this.subrubros().filter(s => s.rubroId?._id === rubroId); }
  itemsDe(subrubroId: string)   { return this.items().filter(i => i.subrubroId?._id === subrubroId); }

  isAssigned(itemId: string) { return this.asignadas().some(s => s.itemId?._id === itemId); }

  startAdd(item: Item) {
    this.addingItemId.set(item._id);
    this.addDraft.set({ itemId: item._id, cantidad: null, unidad: item.unidad, observacion: '' });
  }

  cancelAdd() { this.addingItemId.set(null); }

  setAddField(field: keyof AsignacionDraft, value: any) {
    this.addDraft.update(d => ({ ...d, [field]: value }));
  }

  setEditField(field: 'cantidad' | 'unidad' | 'observacion', value: any) {
    this.editDraft.update(d => ({ ...d, [field]: value }));
  }

  confirmAdd() {
    const d = this.addDraft();
    if (!d.itemId) return;
    this.svc.create(this.projectId, {
      itemId: d.itemId,
      cantidad: d.cantidad ?? undefined,
      unidad: d.unidad || undefined,
      observacion: d.observacion || undefined,
      orden: this.asignadas().length + 1,
    }).subscribe({
      next: item => {
        this.asignadas.update(l => [...l, item]);
        this.addingItemId.set(null);
      },
    });
  }

  remove(id: string) {
    if (!confirm('¿Quitar este ítem del proyecto?')) return;
    this.svc.remove(this.projectId, id).subscribe({
      next: () => this.asignadas.update(l => l.filter(s => s._id !== id)),
    });
  }

  startEdit(s: Seleccion) {
    this.editingId.set(s._id);
    this.editDraft.set({ cantidad: s.cantidad, unidad: s.unidad ?? s.itemId?.unidad, observacion: s.observacion });
  }

  commitEdit(s: Seleccion) {
    if (this.editingId() !== s._id) return;
    const d = this.editDraft();
    this.svc.update(this.projectId, s._id, d).subscribe({
      next: updated => {
        this.asignadas.update(l => l.map(i => i._id === updated._id ? updated : i));
        this.editingId.set(null);
      },
    });
  }

  cancelEdit() { this.editingId.set(null); }

  estadoClass(estado: EstadoSeleccion) { return `estado-chip--${estado}`; }

  unidadEfectiva(s: Seleccion): string {
    return s.unidad || s.itemId?.unidad || '';
  }
}
