/**
 * Este archivo contiene utilidades para manejar y formatear precios de productos
 * de forma consistente en toda la aplicación.
 */
import { formatPrice } from './types';

/**
 * Log detallado para depuración de datos de precio de un producto
 */
export function logProductPriceData(_product, _prefix = '') {
  // No-op en producción: se mantiene la firma para evitar romper imports
}

/**
 * Obtiene el precio a mostrar de un producto de forma consistente
 * usando siempre final_price
 */
export function getPriceToDisplay(valueOrProduct) {
  // Permite recibir directamente un número/string o un objeto producto
  const val = valueOrProduct && typeof valueOrProduct === 'object'
    ? valueOrProduct.final_price
    : valueOrProduct;

  // 1) Número directo
  if (typeof val === 'number' && isFinite(val)) {
    return val;
  }

  // 2) String: limpiar símbolos de moneda y separadores (₡, ¢, puntos, comas, espacios)
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^\d.-]/g, '');
    const num = Number(cleaned);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
  }

  // 3) Si vino un producto y final_price no fue usable, intentar con price_raw
  if (valueOrProduct && typeof valueOrProduct === 'object') {
    const raw = valueOrProduct.price_raw;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      const cleaned = raw.replace(/[^\d.-]/g, '');
      const num = Number(cleaned);
      if (!isNaN(num) && isFinite(num)) {
        return num;
      }
    }
  }

  // 4) Fallback definitivo
  return 0;
}

/**
 * Formatea un precio de forma consistente para mostrar
 */
export function formatPriceConsistently(input) {
  // Acepta un producto o un número directo
  if (input == null) return formatPrice(0);
  const priceNumber = typeof input === 'number' ? input : getPriceToDisplay(input);
  return formatPrice(priceNumber);
}
