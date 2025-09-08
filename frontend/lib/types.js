// Database types based on the Supabase schema

// Base storage URL for product images
export const PRODUCT_STORAGE_URL = 'https://wjgitkxfzdmrblqzwryf.supabase.co/storage/v1/object/public/product-images/'

export const CategoryType = {
  id: 'number',
  external_id: 'string',
  name: 'string', 
  source_url: 'string',
  last_crawled_at: 'string',
  seller_id: 'number',
  product_count: 'number'
}

export const ProductType = {
  id: 'number',
  category_id: 'number',
  external_product_id: 'number',
  name: 'string',
  product_url: 'string',
  image_url: 'string',
  image_file_url: 'string',
  price_raw: 'string',
  final_price: 'number',
  currency: 'string',
  first_seen_at: 'string',
  last_seen_at: 'string',
  source_html_hash: 'string',
  seller_id: 'number'
}

// Utility function to format Costa Rican prices
export const formatPrice = (finalPrice) => {
  const formatWithThousandsSeparator = (num) => {
    if (!num && num !== 0) return '0';
    const integerPart = Math.floor(Number(num)).toString();
    return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  
  // Identificar el origen de la llamada para diagnóstico
  const stackLines = new Error().stack.split('\n').slice(2);
  const caller = stackLines[0]?.trim() || 'Desconocido';
  
  // Debug log con origen
  console.log(`🔍 FORMATO DE PRECIO [${caller.substring(0, 50)}...]:`);
  console.log(`   - VALOR ENTRADA: ${finalPrice} (${typeof finalPrice})`);
  
  // VALIDACIÓN EXTRA AGRESIVA: Asegurarse que sea un número válido
  let finalPriceNum;
  
  // 1. Si ya es un número, usarlo directamente
  if (typeof finalPrice === 'number' && !isNaN(finalPrice)) {
    finalPriceNum = finalPrice;
    console.log(`   ✓ Ya es un número válido: ${finalPriceNum}`);
  } 
  // 2. Si es string, intentar convertir directamente
  else if (typeof finalPrice === 'string') {
    // Limpiar cualquier caracter no numérico excepto punto decimal
    const cleanedString = finalPrice.replace(/[^\d.-]/g, '');
    finalPriceNum = Number(cleanedString);
    
    if (!isNaN(finalPriceNum)) {
      console.log(`   ✓ Convertido de string: "${finalPrice}" → ${finalPriceNum}`);
    } else {
      console.warn(`   ⚠️ No se pudo convertir string: "${finalPrice}"`);
      finalPriceNum = 0;
    }
  } 
  // 3. Para cualquier otro tipo, intentar Number()
  else {
    finalPriceNum = Number(finalPrice);
    
    if (!isNaN(finalPriceNum)) {
      console.log(`   ✓ Convertido con Number(): ${finalPriceNum}`);
    } else {
      console.warn(`   ⚠️ Conversión fallida: ${String(finalPrice)}`);
      finalPriceNum = 0;
    }
  }
  
  // Formatear con separador de miles
  const formattedResult = `₡${formatWithThousandsSeparator(finalPriceNum)}`;
  console.log(`✅ PRECIO FORMATEADO [${caller.substring(0, 30)}...]: ${formattedResult}`);
  console.log(`   → VALOR FINAL NUMÉRICO: ${finalPriceNum}`);
  
  return formattedResult;
}