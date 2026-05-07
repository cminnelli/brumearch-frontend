import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable, { UserOptions } from 'jspdf-autotable';

// ── Brumelab brand constants ────────────────────────────────
const BRAND_DARK   = [30, 30, 30]   as [number, number, number];
const BRAND_MID    = [90, 90, 90]   as [number, number, number];
const BRAND_LIGHT  = [200, 200, 200] as [number, number, number];
const BRAND_ACCENT = [50, 50, 50]   as [number, number, number];
const LOGO_B64     = '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';

export interface PdfBrand {
  projectName: string;
  subtitle?: string;
}

export interface PlanRow {
  subrubro: string;
  rubro:    string;
  cells:    number[];   // ordered same as colHeaders
  total:    number;
}

export interface PlanExportData {
  brand:      PdfBrand;
  etapaHeaders: { label: string; span: number }[];  // row 1 of thead
  colHeaders:   { sem: string; date: string }[];     // row 2 of thead
  rows:         PlanRow[];
  colTotals:    number[];
  grandTotal:   number;
}

@Injectable({ providedIn: 'root' })
export class PdfService {

  private fmtARS(n: number): string {
    return n > 0 ? n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '';
  }

  // ── Generic branded doc ─────────────────────────────────────
  createDoc(landscape = false): jsPDF {
    return new jsPDF({
      orientation: landscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });
  }

  addBrandHeader(doc: jsPDF, brand: PdfBrand): number {
    const W = doc.internal.pageSize.getWidth();
    let y = 12;

    // Logo
    try {
      doc.addImage(LOGO_B64, 'PNG', 10, 8, 22, 7);
    } catch { /* skip if image fails */ }

    // Brand name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_DARK);
    doc.text('brumelab.', 34, 13);

    // Project name (right-aligned)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_MID);
    doc.text(brand.projectName, W - 10, 13, { align: 'right' });

    // Subtitle
    if (brand.subtitle) {
      y = 21;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...BRAND_DARK);
      doc.text(brand.subtitle, 10, y);
      y += 3;
    }

    // Divider line
    y += 3;
    doc.setDrawColor(...BRAND_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(10, y, W - 10, y);
    y += 4;

    return y;
  }

  addPageFooter(doc: jsPDF): void {
    const totalPages = (doc as any).internal.getNumberOfPages();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...BRAND_LIGHT);
      const date = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      doc.text(`Generado el ${date}`, 10, H - 6);
      doc.text(`Página ${i} de ${totalPages}`, W - 10, H - 6, { align: 'right' });
      doc.text('brumelab.', W / 2, H - 6, { align: 'center' });
    }
  }

  // ── Planificación export ────────────────────────────────────
  exportPlanificacion(data: PlanExportData): void {
    const doc = this.createDoc(true);
    const W = doc.internal.pageSize.getWidth();
    let startY = this.addBrandHeader(doc, { ...data.brand, subtitle: 'Planificación de Costos' });

    // Grand total chip below header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_MID);
    doc.text(`Total ARS ${this.fmtARS(data.grandTotal)}`, W - 10, startY - 1, { align: 'right' });
    startY += 1;

    // ── Build table head ─────────────────────────────────────
    // Row 1: etapa group headers with colSpan
    // Row 2: S1 / date headers + Total col
    // autoTable supports this via nested head array

    const headRow1: any[] = [{ content: 'Rubro / Subrubro', rowSpan: 2, styles: { valign: 'middle', fontStyle: 'bold', fillColor: BRAND_DARK, textColor: [255,255,255] } }];
    for (const eg of data.etapaHeaders) {
      headRow1.push({ content: eg.label, colSpan: eg.span, styles: { halign: 'center', fontStyle: 'bold', fillColor: BRAND_ACCENT, textColor: [255,255,255], fontSize: 6 } });
    }
    headRow1.push({ content: 'TOTAL', rowSpan: 2, styles: { valign: 'middle', halign: 'right', fontStyle: 'bold', fillColor: BRAND_DARK, textColor: [255,255,255] } });

    const headRow2: any[] = [];
    for (const c of data.colHeaders) {
      headRow2.push({ content: `S${c.sem}\n${c.date}`, styles: { halign: 'center', fillColor: [60,60,60], textColor: [220,220,220], fontSize: 6 } });
    }

    // ── Body rows ────────────────────────────────────────────
    const body: any[][] = data.rows.map(r => [
      { content: `${r.subrubro}\n${r.rubro}`, styles: { fontSize: 7 } },
      ...r.cells.map(v => ({ content: this.fmtARS(v), styles: { halign: 'right', fontSize: 7 } })),
      { content: this.fmtARS(r.total), styles: { halign: 'right', fontStyle: 'bold', fontSize: 7 } },
    ]);

    // ── Foot row ─────────────────────────────────────────────
    const foot: any[][] = [[
      { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: BRAND_DARK, textColor: [255,255,255] } },
      ...data.colTotals.map(v => ({ content: this.fmtARS(v), styles: { halign: 'right', fontStyle: 'bold', fillColor: BRAND_DARK, textColor: [255,255,255], fontSize: 7 } })),
      { content: this.fmtARS(data.grandTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: BRAND_DARK, textColor: [255,255,255] } },
    ]];

    const tableOptions: UserOptions = {
      startY,
      head: [headRow1, headRow2],
      body,
      foot,
      theme: 'grid',
      margin: { left: 10, right: 10 },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
      },
      headStyles: { fontSize: 7, cellPadding: 2 },
      footStyles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 38 } },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index > 0) {
          const val = parseFloat(hookData.cell.raw as string);
          if (val > 0) hookData.cell.styles.fillColor = [245, 248, 245];
        }
      },
    };

    autoTable(doc, tableOptions);
    this.addPageFooter(doc);

    const filename = `planificacion_${(data.brand.projectName || 'proyecto').replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  }
}
