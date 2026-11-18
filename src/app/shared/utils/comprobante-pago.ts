import { Gasto, Pago } from '../models/obra.model';

/**
 * Comprobante de pago / de gasto: HTML con el formato del estudio y descarga directa en PDF.
 * Lo usan Compras (desde el gasto o un pago) y Ingresos (desde un pago asignado a un aporte).
 */
// ── Descarga PDF directa (sin diálogo de impresión) ─────
export async function descargarPdf(htmlStr: string): Promise<void> {
  const parser  = new DOMParser();
  const parsed  = parser.parseFromString(htmlStr, 'text/html');
  const filename = (parsed.querySelector('title')?.textContent ?? 'Comprobante') + '.pdf';

  // Montar estilos + .doc en un contenedor oculto fuera de la pantalla
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:-99999px;left:0;width:680px;background:#fff;z-index:-1';

  const styleTag = document.createElement('style');
  styleTag.textContent = parsed.querySelector('style')?.textContent ?? '';
  wrapper.appendChild(styleTag);

  const docEl = parsed.querySelector('.doc') as HTMLElement;
  docEl.style.borderRadius = '0';
  docEl.style.boxShadow    = 'none';
  docEl.style.border       = 'none';
  docEl.style.maxWidth     = '100%';
  wrapper.appendChild(docEl);
  document.body.appendChild(wrapper);

  // Esperar un tick para que el DOM pinte
  await new Promise(r => setTimeout(r, 80));

  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF }   = await import('jspdf');

  const canvas = await html2canvas(docEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  document.body.removeChild(wrapper);

  const imgData  = canvas.toDataURL('image/png');
  const pdf      = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW    = pdf.internal.pageSize.getWidth();
  const pageH    = pdf.internal.pageSize.getHeight();
  // scale=2 → cada px CSS = 2px canvas → dividir por 2 para mm reales
  const mmPerPx  = pageW / (canvas.width / 2);
  const totalH   = (canvas.height / 2) * mmPerPx;

  let yRendered = 0;
  while (yRendered < totalH) {
    if (yRendered > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, -yRendered, pageW, totalH);
    yRendered += pageH;
  }

  pdf.save(filename);
}

export function buildComprobanteHtml(g: Gasto, projectName: string, heroPago?: Pago): string {
  const fmtM = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  const fmtFechaLocal = (f: string) => {
    const [y, m, d] = f.substring(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const fechaEmision = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const rubroNombre  = g.subrubroId.rubroId?.nombre ?? '';
  const logoUrl = `${window.location.origin}/assets/logo%20brume%20vector2.png`;

  const metodoLabel: Record<string, string> = {
    efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque',
    tarjeta_credito: 'Tarjeta crédito', tarjeta_debito: 'Tarjeta débito',
  };

  // El código interno del subrubro no se muestra en el comprobante

  // Si se imprime un pago específico, cortar el historial hasta ese pago (inclusive)
  // y recalcular los totales al momento de ese pago — no mostrar pagos futuros
  const lastPago = heroPago ?? (g.pagos.length ? g.pagos[g.pagos.length - 1] : null);
  const heroPagoIdx = heroPago ? g.pagos.findIndex(p => p._id === heroPago._id) : -1;
  const pagosHasta  = heroPagoIdx >= 0 ? g.pagos.slice(0, heroPagoIdx + 1) : g.pagos;

  const totalPag = pagosHasta.reduce((s, p) => s + p.monto, 0);
  const restante = Math.max(0, g.monto - totalPag);

  // Estado al momento del comprobante (no el estado actual del gasto)
  const estadoSnap = totalPag === 0 ? 'sin_pago' : totalPag < g.monto ? 'parcial' : 'pagado';
  const eColor = estadoSnap === 'pagado' ? '#166534' : estadoSnap === 'parcial' ? '#92400e' : '#666';
  const eBg    = estadoSnap === 'pagado' ? '#f0fdf4' : estadoSnap === 'parcial' ? '#fffbeb' : '#f5f5f5';
  const eTxt   = estadoSnap === 'pagado' ? 'Pagado' : estadoSnap === 'parcial' ? 'Pago parcial' : 'Pendiente';

  const lastFecha = lastPago ? fmtFechaLocal(lastPago.fecha) : fechaEmision;

  // Nombre del archivo PDF (lo usa el browser como título de pestaña → nombre al guardar)
  const provSlug  = (g.proveedorId?.nombre ?? 'SinProveedor').replace(/\s+/g, '_');
  const fechaSlug = (lastPago?.fecha ?? new Date().toISOString()).substring(0, 10);
  const pdfTitle  = `Comprobante_${provSlug}_${fechaSlug}`;

  const MAX_HIST = 8;
  const pagosReversed = [...pagosHasta].reverse();
  const pagosToShow   = pagosReversed.slice(0, MAX_HIST);
  const pagosOmitidos = pagosReversed.slice(MAX_HIST);
  const montoOmitidos = pagosOmitidos.reduce((s, p) => s + p.monto, 0);

  const histRows = pagosToShow.map(p => `
    <tr>
      <td>${fmtFechaLocal(p.fecha)}</td>
      <td>${metodoLabel[p.metodoPago] ?? p.metodoPago}</td>
      <td>${p.notas ?? '—'}</td>
      <td class="tr">${g.moneda} ${fmtM(p.monto)}</td>
    </tr>`).join('');

  const omitidosRow = pagosOmitidos.length ? `
    <tr>
      <td colspan="3" style="font-size:0.65rem;color:#bbb;font-style:italic;padding-top:0.2rem">
        + ${pagosOmitidos.length} pago${pagosOmitidos.length > 1 ? 's' : ''} anteriores
      </td>
      <td class="tr" style="font-size:0.65rem;color:#bbb">${g.moneda} ${fmtM(montoOmitidos)}</td>
    </tr>` : '';

  const histSection = pagosHasta.length ? `
    <div class="sec">
      <div class="sec-lbl">Historial de pagos</div>
      <table class="tbl">
        <thead><tr><th>Fecha</th><th>Método</th><th>Observación</th><th class="tr">Monto</th></tr></thead>
        <tbody>${histRows}${omitidosRow}</tbody>
      </table>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${pdfTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;background:#f2f2f0;color:#111;-webkit-font-smoothing:antialiased}

/* ── Top bar ── */
.bar{position:fixed;top:0;left:0;right:0;height:48px;background:#111;display:flex;align-items:center;
  justify-content:space-between;padding:0 1.75rem;z-index:10}
.bar-brand{color:#fff;font-size:0.68rem;font-weight:800;letter-spacing:0.16em;text-transform:uppercase}
.bar-actions{display:flex;gap:0.4rem}
.btn{padding:0.32rem 0.85rem;border-radius:5px;font-size:0.72rem;font-weight:600;font-family:inherit;cursor:pointer;border:none;line-height:1}
.btn-sec{background:transparent;color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.18)}
.btn-sec:hover{color:#fff;border-color:rgba(255,255,255,0.4)}
.btn-pri{background:#fff;color:#111}
.btn-pri:hover{background:#efefef}

/* ── Page wrapper ── */
.page{padding:60px 1.25rem 3rem;display:flex;justify-content:center;min-height:100vh}
.doc{background:#fff;width:100%;max-width:620px;border-radius:12px;
  box-shadow:0 1px 14px rgba(0,0,0,0.08);border:1px solid #e4e4e4;height:fit-content;overflow:hidden}

/* ── Doc header ── */
.doc-head{display:flex;justify-content:space-between;align-items:flex-start;
  padding:1.5rem 2rem 1.25rem;border-bottom:1px solid #f0f0f0}
.brand-logo{height:26px;width:auto;display:block;margin-bottom:0.3rem}
.brand-sub{font-size:0.58rem;color:#ccc;font-weight:400;letter-spacing:0.02em}
.doc-meta{text-align:right}
.doc-title{font-size:0.68rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#111;margin-bottom:0.22rem}
.doc-info{font-size:0.65rem;color:#bbb;line-height:1.6}
.doc-project{font-size:0.7rem;font-weight:600;color:#555;margin-top:0.12rem}

/* ── Sections ── */
.sec{padding:1.25rem 2rem;border-bottom:1px solid #f0f0f0}
.sec:last-child{border-bottom:none}
.sec-lbl{font-size:0.55rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#ccc;margin-bottom:0.75rem}

/* ── Concepto ── */
.concept-row{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
.concept-rubro{display:inline-block;font-size:0.57rem;font-weight:700;text-transform:uppercase;
  letter-spacing:0.1em;color:#888;background:#f4f4f2;padding:0.16rem 0.5rem;
  border-radius:20px;margin-bottom:0.45rem}
.concept-nombre{font-size:1rem;font-weight:800;color:#111;line-height:1.2;margin-bottom:0.3rem}
.concept-codigo{font-size:0.65rem;color:#ccc;font-weight:400;margin-left:0.3rem}
.concept-prov{font-size:0.73rem;color:#777;margin-top:0.18rem}
.concept-prov strong{font-weight:600;color:#444}
.concept-desc{font-size:0.72rem;color:#999;line-height:1.5;margin-top:0.18rem}
.concept-notes{font-size:0.66rem;color:#bbb;font-style:italic;margin-top:0.1rem}
.estado-pill{display:inline-flex;align-items:center;gap:0.28rem;font-size:0.58rem;font-weight:700;
  letter-spacing:0.08em;text-transform:uppercase;padding:0.2rem 0.6rem;border-radius:20px;
  white-space:nowrap;flex-shrink:0;margin-top:0.15rem}
.estado-dot{width:4px;height:4px;border-radius:50%;background:currentColor}

/* ── Pago hero ── */
.pago-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.25rem 2rem;border-bottom:1px solid #f0f0f0}
.pago-lbl{font-size:0.55rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#ccc;margin-bottom:0.28rem}
.pago-amount{font-size:1.9rem;font-weight:900;color:#111;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;line-height:1}
.pago-right{text-align:right;flex-shrink:0}
.pago-fecha{font-size:0.78rem;font-weight:600;color:#444;margin-bottom:0.18rem}
.pago-metodo{font-size:0.68rem;color:#999}
.pago-extra{display:flex;flex-direction:column;gap:0.22rem;padding:0.75rem 2rem;
  border-bottom:1px solid #f0f0f0;background:#fafafa}
.pago-extra-row{display:flex;align-items:baseline;gap:0.5rem;font-size:0.74rem}
.pago-extra-lbl{font-size:0.57rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
  color:#bbb;white-space:nowrap;flex-shrink:0;padding-top:0.05rem}
.pago-extra-val{color:#444;line-height:1.4}

/* ── Resumen ── */
.resumen-grid{display:grid;grid-template-columns:1fr auto;row-gap:0.3rem;column-gap:2rem}
.r-label{font-size:0.74rem;color:#aaa}
.r-val{font-size:0.74rem;font-weight:600;font-variant-numeric:tabular-nums;color:#888;text-align:right}
.r-label--main{color:#444;font-weight:500}
.r-val--main{color:#111;font-size:0.82rem;font-weight:700}
.r-divider{grid-column:1/-1;height:1px;background:#f4f4f4;margin:0.2rem 0}

/* ── Historial table ── */
.tbl{width:100%;border-collapse:collapse}
.tbl th{text-align:left;font-size:0.54rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;
  color:#ccc;padding:0 0.35rem 0.55rem;border-bottom:1px solid #f0f0f0}
.tbl td{font-size:0.72rem;padding:0.4rem 0.35rem;color:#999;border-bottom:1px solid #f8f8f8;font-variant-numeric:tabular-nums}
.tbl tr:last-child td{border-bottom:none}
.tr{text-align:right;font-weight:600;color:#555!important}

/* ── Firmas ── */
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:2.5rem;padding:1.5rem 2rem 1.25rem;border-bottom:1px solid #f0f0f0}
.sig-space{height:2.5rem}
.sig-line{height:1px;background:#ddd;margin-bottom:0.4rem}
.sig-name{font-size:0.76rem;font-weight:700;color:#111}
.sig-role{font-size:0.6rem;color:#bbb;margin-top:0.08rem}

/* ── Footer ── */
.doc-foot{padding:0.7rem 2rem;background:#fafafa;font-size:0.55rem;color:#ccc;
  text-align:center;letter-spacing:0.04em}

@media print{
  .bar{display:none!important}
  body{background:#fff}
  .page{padding:0}
  .doc{box-shadow:none;border:none;border-radius:0;max-width:100%}
  @page{margin:1.5cm 2cm;size:A4}
}
</style>
</head>
<body>

<div class="bar">
<span class="bar-brand">Brumelab Arch</span>
<div class="bar-actions">
  <button class="btn btn-sec" onclick="window.close()">Cerrar</button>
  <button class="btn btn-pri" onclick="window.print()">Imprimir / PDF</button>
</div>
</div>

<div class="page"><div class="doc">

<!-- Header -->
<div class="doc-head">
  <div>
    <img src="${logoUrl}" alt="Brumelab Arch" class="brand-logo" />
  </div>
  <div class="doc-meta">
    <div class="doc-title">Comprobante de pago</div>
    <div class="doc-info">Emitido el ${fechaEmision}</div>
    ${projectName ? `<div class="doc-project">${projectName}</div>` : ''}
  </div>
</div>

<!-- Concepto -->
<div class="sec">
  <div class="concept-row">
    <div>
      ${rubroNombre ? `<span class="concept-rubro">${rubroNombre}</span>` : ''}
      <div class="concept-nombre">${g.subrubroId.nombre}</div>
      ${g.proveedorId ? `<div class="concept-prov">Proveedor · <strong>${g.proveedorId.nombre}</strong></div>` : ''}
    </div>
    <div class="estado-pill" style="color:${eColor};background:${eBg}">
      <span class="estado-dot"></span>${eTxt}
    </div>
  </div>
</div>

<!-- Pago hero -->
<div class="pago-row">
  <div>
    <div class="pago-lbl">${lastPago ? 'Este pago' : 'Total del gasto'}</div>
    <div class="pago-amount">${g.moneda} ${fmtM(lastPago ? lastPago.monto : g.monto)}</div>
  </div>
  <div class="pago-right">
    <div class="pago-fecha">${lastFecha}</div>
    ${lastPago ? `<div class="pago-metodo">${metodoLabel[lastPago.metodoPago] ?? lastPago.metodoPago}</div>` : ''}
  </div>
</div>
${lastPago?.notas ? `
<div class="pago-extra">
  <div class="pago-extra-row"><span class="pago-extra-lbl">Observación</span><span class="pago-extra-val">${lastPago.notas}</span></div>
</div>` : ''}

<!-- Resumen -->
<div class="sec">
  <div class="sec-lbl">Resumen del gasto</div>
  <div class="resumen-grid">
    <span class="r-label r-label--main">Total del gasto</span>
    <span class="r-val r-val--main">${g.moneda} ${fmtM(g.monto)}</span>
    ${totalPag > 0 ? `<div class="r-divider"></div>
    <span class="r-label">Pagado acumulado</span>
    <span class="r-val">${g.moneda} ${fmtM(totalPag)}</span>` : ''}
    ${restante > 0 ? `
    <span class="r-label">Saldo pendiente</span>
    <span class="r-val">${g.moneda} ${fmtM(restante)}</span>` : ''}
  </div>
</div>

<!-- Historial -->
${histSection}

<!-- Firmas -->
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

<!-- Footer -->
<div class="doc-foot">
  Emitido el ${fechaEmision} &middot; Brumelab Arch &middot; Conservar original firmado por ambas partes
</div>

</div></div>
</body>
</html>`;
}
