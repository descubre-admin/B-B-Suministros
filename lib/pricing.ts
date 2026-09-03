export type PricingMode =
  | 'unit'
  | 'meter'
  | 'pack'
  | 'list_discount'
  | 'multiplier_discount'
  | 'manual'

export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  unit: 'Precio por unidad',
  meter: 'Precio por metro × cantidad',
  pack: 'Precio por caja/pack ÷ unidades',
  list_discount: 'Precio de lista − descuento',
  multiplier_discount: 'Precio × multiplicador − descuento',
  manual: 'Costo final manual',
}

export type PricingRule = {
  pricingMode: PricingMode
  basePrice: number
  multiplier?: number
  packQuantity?: number
  discountPercent?: number
  surchargePercent?: number
}

export function calculateSupplierCost(rule: PricingRule) {
  const base = Math.max(0, Number(rule.basePrice) || 0)
  const multiplier = Math.max(0, Number(rule.multiplier) || 0)
  const packQuantity = Math.max(0, Number(rule.packQuantity) || 0)
  const discount = Math.max(0, Number(rule.discountPercent) || 0)
  const surcharge = Math.max(0, Number(rule.surchargePercent) || 0)

  let subtotal = base

  switch (rule.pricingMode) {
    case 'meter':
    case 'multiplier_discount':
      subtotal = base * (multiplier || 1)
      break
    case 'pack':
      subtotal = packQuantity > 0 ? base / packQuantity : base
      break
    case 'unit':
    case 'list_discount':
    case 'manual':
    default:
      subtotal = base
  }

  const afterDiscount = subtotal * (1 - discount / 100)
  const finalCost = afterDiscount * (1 + surcharge / 100)

  return Math.round(Math.max(0, finalCost) * 100) / 100
}
