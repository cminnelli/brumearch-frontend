import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a number using Argentine locale (. as thousands, , as decimal).
 *
 * Usage:
 *   {{ 1500000 | arsNum }}          → "1.500.000"
 *   {{ 1500000 | arsNum:0 }}        → "1.500.000"
 *   {{ 1234.5  | arsNum:2 }}        → "1.234,50"
 *   {{ 1500000 | arsNum:0:'ARS ' }} → "ARS 1.500.000"
 */
@Pipe({ name: 'arsNum', standalone: true, pure: true })
export class ArsNumPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 0, prefix = ''): string {
    if (value == null || isNaN(value)) return '—';
    const formatted = value.toLocaleString('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return prefix ? prefix + formatted : formatted;
  }
}
