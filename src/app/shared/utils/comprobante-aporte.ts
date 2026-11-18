import { Aporte } from '../models/gasto-vario.model';

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const METODO: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', otro: 'Otro' };
const fm = (n: number, mon: string) => `${mon} ${(Math.round(n * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const fecha = (f: string) => new Date(f).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fechaCorta = (f: string) => new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });

/**
 * Detalle de un pago del propietario: cómo se asignó (a qué gastos y proveedores), la utilidad y el saldo.
 * Es un documento INTERNO del estudio: no se le da al propietario. Sirve para verlo, imprimirlo o bajarlo en PDF.
 * Tiene la misma estructura que el comprobante de pagos (un bloque .doc + estilos), así usa la misma descarga a PDF.
 */
export function buildDetalleAporteHtml(a: Aporte, projectName: string): string {
  const mon = a.moneda;
  const asig = a.asignaciones ?? [], util = a.utilidades ?? [];
  const logoUrl = `${window.location.origin}/assets/logo%20brume%20vector2.png`;
  const emision = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

  const filas = asig.map(x => `<tr>
      <td class="f">${fechaCorta(x.fecha)}</td>
      <td><b>${esc(x.gasto?.proveedor || x.gasto?.descripcion || 'Gasto')}</b>${x.gasto?.descripcion && x.gasto?.proveedor ? `<small>${esc(x.gasto.descripcion)}</small>` : ''}</td>
      <td>${esc(x.gasto?.rubro ?? '')}${x.gasto?.subrubro ? `<small>${esc(x.gasto.subrubro)}</small>` : ''}</td>
      <td>${esc(METODO[x.metodoPago ?? ''] ?? '')}</td>
      <td class="r">${fm(x.montoOperacion, x.monedaOperacion)}</td>
      <td class="r">${fm(x.descuenta, mon)}</td></tr>`).join('');
  const filasUtil = util.map(u => `<tr class="u"><td class="f">${fechaCorta(u.fecha)}</td><td colspan="3"><b>Utilidad</b>${u.nota ? `<small>${esc(u.nota)}</small>` : ''}</td><td class="r"></td><td class="r">${fm(u.monto, mon)}</td></tr>`).join('');
  const sinNada = !asig.length && !util.length ? `<tr><td colspan="6" class="vacio">Este pago todavía no se asignó a ningún gasto.</td></tr>` : '';

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Detalle_pago_${a.numero ?? ''}_${esc(projectName).replace(/\s+/g, '_')}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f4f4f2;color:#111;-webkit-font-smoothing:antialiased}
.bar{display:flex;justify-content:space-between;align-items:center;padding:.7rem 1.2rem;background:#111;color:#fff;font-size:.8rem}
.bar button{font:inherit;padding:.4rem .9rem;border-radius:8px;border:0;cursor:pointer;font-weight:600}
.page{padding:1.5rem;display:flex;justify-content:center}
.doc{background:#fff;width:100%;max-width:760px;border-radius:12px;box-shadow:0 2px 20px rgba(0,0,0,.08);padding:2rem 2.2rem}
.head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1.2rem;border-bottom:1px solid #eee}
.head img{height:28px}.meta{text-align:right;font-size:.7rem;color:#999;line-height:1.6}.meta b{display:block;font-size:.68rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#111}
.tit{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;padding:1.3rem 0}
.tit h1{font-size:1.15rem;font-weight:800}.tit p{font-size:.74rem;color:#777;margin-top:.25rem;line-height:1.6}
.tit .m{font-size:1.9rem;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-align:right}.tit .m small{display:block;font-size:.7rem;font-weight:500;color:#888;letter-spacing:0}
table{width:100%;border-collapse:collapse;font-size:.76rem}
th{text-align:left;font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#888;background:#f7f7f5;padding:.55rem .6rem;border-bottom:1px solid #e6e6e2}
th.r,td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td{padding:.65rem .6rem;border-bottom:1px solid #efefec;vertical-align:top}td small{display:block;color:#999;font-size:.64rem;margin-top:.1rem}td.f{color:#777;white-space:nowrap}
tr.u td{background:#fff7f2}tr.u b{color:#d4430a}
td.vacio{text-align:center;color:#999;padding:1.4rem}
tfoot td{border-bottom:0;padding:.4rem .6rem;font-size:.78rem}tfoot tr.t td{padding-top:.9rem;border-top:2px solid #111}
tfoot .lab{text-align:right;color:#666}tfoot .saldo{font-weight:800;font-size:.95rem;color:#15803d}
.foot{margin-top:1.4rem;padding-top:.8rem;border-top:1px solid #eee;font-size:.62rem;color:#aaa;display:flex;justify-content:space-between;gap:1rem}
@media print{body{background:#fff}.bar{display:none}.page{padding:0}.doc{box-shadow:none;border-radius:0;max-width:100%}@page{margin:1.5cm}}
</style></head><body>
<div class="bar"><span>Brume Arch · Detalle de pago</span><button onclick="window.print()">Imprimir / PDF</button></div>
<div class="page"><div class="doc">
  <div class="head"><img src="${logoUrl}" alt="Brume Arch"/><div class="meta"><b>Detalle de pago</b>Emitido el ${emision}${projectName ? `<br>${esc(projectName)}` : ''}</div></div>
  <div class="tit">
    <div><h1>Pago N° ${a.numero ?? ''}${a.concepto ? ' · ' + esc(a.concepto) : ''}</h1>
      <p>${fecha(a.fecha)} · ${esc(METODO[a.metodo ?? ''] ?? '')}${a.origen ? ' · ' + esc(a.origen) : ''}${a.tipoCambio ? `<br>Tipo de cambio de este pago: $ ${a.tipoCambio.toLocaleString('es-AR')}` : ''}</p></div>
    <div class="m">${fm(a.monto, mon)}${mon !== 'ARS' && a.tipoCambio ? `<small>≈ ARS ${Math.round(a.monto * a.tipoCambio).toLocaleString('es-AR')}</small>` : ''}</div>
  </div>
  <table>
    <thead><tr><th>Fecha</th><th>Proveedor / gasto</th><th>Rubro</th><th>Método</th><th class="r">Se pagó</th><th class="r">Descuenta</th></tr></thead>
    <tbody>${filas}${filasUtil}${sinNada}</tbody>
    <tfoot>
      <tr class="t"><td colspan="5" class="lab">Total asignado a gastos</td><td class="r">${fm(a.asignado ?? 0, mon)}</td></tr>
      <tr><td colspan="5" class="lab">Utilidad</td><td class="r">${fm(a.utilidad ?? 0, mon)}</td></tr>
      <tr><td colspan="5" class="lab">Saldo disponible</td><td class="r saldo">${fm(a.saldo ?? 0, mon)}</td></tr>
    </tfoot>
  </table>
  <div class="foot"><span>Documento interno del estudio: no se entrega al propietario.</span><span>Montos en ${mon}</span></div>
</div></div></body></html>`;
}
