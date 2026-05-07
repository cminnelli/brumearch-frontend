import { Injectable, signal } from '@angular/core';

interface ConfirmState {
  title: string;
  message: string;
  confirmText: string;
  danger: boolean;
  resolve: (value: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly state = signal<ConfirmState | null>(null);

  confirm(
    message: string,
    title = '¿Estás seguro?',
    opts: { confirmText?: string; danger?: boolean } = {}
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({
        title,
        message,
        confirmText: opts.confirmText ?? 'Confirmar',
        danger: opts.danger ?? true,
        resolve,
      });
    });
  }

  respond(value: boolean) {
    const s = this.state();
    this.state.set(null);
    s?.resolve(value);
  }
}
