import { Component, Input, signal } from '@angular/core';
import { fileUrl } from '../../utils/file-url';

/**
 * Avatar circular: muestra la foto (subida o de Google) y, si no hay foto o falla la carga,
 * las iniciales de la persona.
 */
@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    @if (url && !failed()) {
      <img [src]="url" alt="" referrerpolicy="no-referrer" (error)="failed.set(true)" />
    } @else {
      <span aria-hidden="true">{{ initials }}</span>
    }
  `,
  styles: [`
    :host {
      display: inline-flex; align-items: center; justify-content: center; flex: none;
      width: var(--av-size, 34px); height: var(--av-size, 34px); border-radius: 50%; overflow: hidden;
      background: var(--c-text); color: #fff; font-weight: 700; font-size: calc(var(--av-size, 34px) * .36);
      letter-spacing: .02em; user-select: none;
    }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
  `],
})
export class AvatarComponent {
  @Input() name: string | null | undefined = '';
  @Input() email: string | null | undefined = '';
  @Input() set src(v: string | null | undefined) { this.url = fileUrl(v); this.failed.set(false); }
  url = '';
  failed = signal(false);

  get initials(): string {
    const base = (this.name || '').trim() || (this.email || '').split('@')[0];
    const parts = base.split(/[\s._-]+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
  }
}
