import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MonedaService } from '../../../core/services/moneda.service';

/** Selector "Ver en: Pesos | Dólares" con el tipo de cambio del proyecto (se edita a mano). */
@Component({
  selector: 'app-moneda-toggle',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="mt">
      <div class="seg" role="group" aria-label="Ver los montos en">
        <button type="button" [attr.aria-pressed]="m.vista() === 'ARS'" (click)="m.setVista('ARS')">Pesos</button>
        <button type="button" [attr.aria-pressed]="m.vista() === 'USD'" (click)="m.setVista('USD')">Dólares</button>
      </div>
      @if (editable || m.tcProyecto()) {
        @if (editando()) {
          <form class="mt__edit" (ngSubmit)="guardar()">
            <label for="mt-tc">$ por dólar</label>
            <input id="mt-tc" type="number" min="0" step="any" [(ngModel)]="valor" name="tc" autofocus />
            @if (m.sugerido(); as s) { <button type="button" class="mt__sug" (click)="valor = s.valor" [title]="'Cotización ' + s.nombre + ' de hoy'">Sugerido {{ s.valor }}</button> }
            <button class="btn btn--primary btn--sm" type="submit">Guardar</button>
            <button class="btn btn--ghost btn--sm" type="button" (click)="editando.set(false)">Cancelar</button>
          </form>
        } @else {
          <button type="button" class="mt__tc" (click)="editar()" [disabled]="!editable" [title]="editable ? 'Cambiar el tipo de cambio del proyecto' : 'Tipo de cambio del proyecto'">
            @if (m.tcProyecto(); as tc) { Tipo de cambio <b class="num">$ {{ tc.toLocaleString('es-AR') }}</b> @if (editable) { <span aria-hidden="true">✎</span> } }
            @else { <span class="mt__falta">Cargá el tipo de cambio</span> }
          </button>
        }
      }
    </div>
  `,
  styles: [`
    .mt { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
    .mt__tc { all: unset; box-sizing: border-box; cursor: pointer; font-size: var(--text-sm); color: var(--c-text-sub); padding: .25rem .5rem; border-radius: var(--radius-sm); border: 1px dashed var(--c-border-strong);
      &:hover:not(:disabled) { color: var(--c-text); border-color: var(--c-text); } &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 2px; } &:disabled { cursor: default; border-style: solid; border-color: transparent; padding-left: 0; } b { color: var(--c-text); font-weight: 600; } }
    .mt__falta { color: var(--c-warn); font-weight: 600; }
    .mt__edit { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; label { font-size: var(--text-sm); color: var(--c-text-sub); }
      input { width: 110px; font: inherit; font-size: var(--text-sm); padding: .35rem .5rem; border: 1px solid var(--c-border-strong); border-radius: var(--radius-sm); background: var(--c-bg); color: var(--c-text); } }
    .mt__sug { all: unset; cursor: pointer; font-size: var(--text-xs); font-weight: 600; color: var(--c-brand); &:hover { text-decoration: underline; } &:focus-visible { outline: 2px solid var(--c-brand); } }
  `],
})
export class MonedaToggleComponent implements OnInit {
  m = inject(MonedaService);
  /** Solo editores y superadmin cambian el tipo de cambio del proyecto. */
  @Input() editable = false;
  @Output() tcChange = new EventEmitter<number>();
  editando = signal(false);
  valor: number | null = null;

  ngOnInit() { if (this.editable) this.m.cargarSugerido(); }
  editar() { this.valor = this.m.tcProyecto() ?? this.m.sugerido()?.valor ?? null; this.editando.set(true); this.m.cargarSugerido(); }
  guardar() { if (this.valor && this.valor > 0) { this.tcChange.emit(this.valor); this.editando.set(false); } }
}
