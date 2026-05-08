export type TipoCuenta     = 'efectivo' | 'mercadopago' | 'banco' | 'otro';
export type TipoMovimiento = 'ingreso'  | 'egreso'      | 'transferencia';
export type MonedaCaja     = 'ARS' | 'USD';

export interface CuentaCliente {
  _id:          string;
  projectId:    string;
  nombre:       string;
  tipo:         TipoCuenta;
  saldoInicial: number;
  moneda:       MonedaCaja;
  balance:      number;
  createdAt:    string;
}

export interface MovimientoCliente {
  _id:              string;
  projectId:        string;
  tipo:             TipoMovimiento;
  monto:            number;
  descripcion:      string;
  fecha:            string;
  cuentaId?:        string | null;
  cuentaOrigenId?:  string | null;
  cuentaDestinoId?: string | null;
  createdAt:        string;
}

export const TIPO_CUENTA_LABELS: Record<TipoCuenta, string> = {
  efectivo:    'Efectivo',
  mercadopago: 'Mercado Pago',
  banco:       'Banco',
  otro:        'Otro',
};

export const TIPO_CUENTA_ICON: Record<TipoCuenta, string> = {
  efectivo:    '💵',
  mercadopago: '💳',
  banco:       '🏦',
  otro:        '📂',
};
