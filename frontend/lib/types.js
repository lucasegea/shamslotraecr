// Database types based on the Supabase schema

// Supabase storage URL for product images
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
  price_numeric: 'number',  
  currency: 'string',
  first_seen_at: 'string',
  last_seen_at: 'string',
  source_html_hash: 'string',
  seller_id: 'number'
}

// Utility function to format Costa Rican prices
export const formatPrice = (priceNumeric, priceRaw, currency = 'CRC') => {
  if (priceNumeric !== null && priceNumeric !== undefined) {
    return new Intl.NumberFormat('es-CR', { 
      style: 'currency', 
      currency: currency || 'CRC' 
    }).format(priceNumeric)
  }
  return priceRaw || 'Precio no disponible'
}