import { supabase } from './supabase'

// Fetch all categories with product counts
export async function getCategories() {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, external_id, name, product_count')
      .eq('seller_id', 1)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
      return []
    }

    // Remove duplicates by name
    const categoriesMap = new Map()
    
    for (const category of data || []) {
      const key = category.name
      if (categoriesMap.has(key)) {
        const existing = categoriesMap.get(key)
        existing.product_count = (existing.product_count || 0) + (category.product_count || 0)
      } else {
        categoriesMap.set(key, { ...category })
      }
    }

    // Get actual product counts
    const categoriesWithActualCounts = []
    for (const [name, category] of categoriesMap) {
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', category.id)
        .eq('seller_id', 1)

      categoriesWithActualCounts.push({
        ...category,
        product_count: count || 0
      })
    }

    return categoriesWithActualCounts
  } catch (error) {
    console.error('Error in getCategories:', error)
    return []
  }
}

// Fetch products with filtering and pagination
export async function getProducts(options = {}) {
  try {
    const { 
      categoryId = null, 
      searchTerm = '', 
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1, 
      limit = 24 
    } = options

    // Base query for fetching records with count
    let query = supabase
      .from('products')
      .select(`
        id,
        category_id,
        external_product_id,
        name,
        product_url,
        image_url,
        image_file_url,
        price_raw,
        final_price,
        currency,
        first_seen_at,
        last_seen_at,
        seller_id
      `, { count: 'exact' })
      .eq('seller_id', 1)

    // Category filter
    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    // Search filter
    if (searchTerm) {
      query = query.ilike('name', `%${searchTerm}%`)
    }

    // Sorting
    if (sortBy === 'price') {
      query = query.order('final_price', { ascending: sortOrder === 'asc', nullsLast: true })
    } else if (sortBy === 'date') {
      query = query.order('last_seen_at', { ascending: sortOrder === 'asc', nullsLast: true })
    } else {
      query = query.order('name', { ascending: sortOrder === 'asc' })
    }

    // Pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    
    // Apply pagination to query
    query = query.range(from, to)
    
    // Execute query
    const { data, error, count } = await query
    
    if (error) {
      console.error('Error fetching products:', error)
      return { products: [], totalCount: 0 }
    }

    // Log de los datos exactamente como vienen de Supabase antes de procesarlos
    console.log('📊 DATOS RAW DE SUPABASE:', data ? data.slice(0, 3).map(p => ({
      id: p.id,
      name: p.name, 
      final_price: p.final_price,
      final_price_type: typeof p.final_price,
      price_raw: p.price_raw
    })) : 'Sin datos');
    
    // GARANTIZAR QUE SIEMPRE HAYA UN VALOR NUMÉRICO EN FINAL_PRICE
    const productsWithPrice = (data || []).map(product => {
      console.log(`🔍 Procesando producto: ${product.name} (ID: ${product.id})`);
      console.log(`  - final_price original: ${product.final_price} (${typeof product.final_price})`);
      
      // Crear una copia del producto para modificar
      const processedProduct = { ...product };
      
      // IMPORTANTE: Garantizar que final_price sea un valor numérico
      // 1. Si final_price existe y es válido, usarlo
      if (product.final_price !== undefined && product.final_price !== null) {
        const numericValue = Number(product.final_price);
        if (!isNaN(numericValue)) {
          console.log(`  ✅ Usando final_price existente: ${numericValue}`);
          processedProduct.final_price = numericValue;
          return processedProduct;
        } else {
          console.log(`  ⚠️ final_price no es un número válido: ${product.final_price}`);
        }
      } else {
        console.log(`  ⚠️ final_price no está disponible para este producto`);
      }
      
      // 2. Si final_price no es válido, intentar extraer el valor numérico de price_raw
      if (product.price_raw) {
        const cleanedString = String(product.price_raw).replace(/[^\d.-]/g, '');
        const numericValue = Number(cleanedString);
        if (!isNaN(numericValue) && numericValue > 0) {
          console.log(`  ✅ Extrayendo valor de price_raw: ${numericValue}`);
          processedProduct.final_price = numericValue;
          return processedProduct;
        }
      }
      
      // 3. Si llegamos aquí, establecer final_price a 0
      console.log(`  ⚠️ No se encontró un precio válido para el producto: ${product.name}`);
      processedProduct.final_price = 0;
      return processedProduct;
    });
    
    // Log de los datos procesados
    console.log('📋 DATOS PROCESADOS:', productsWithPrice.slice(0, 3).map(p => ({
      id: p.id,
      name: p.name, 
      final_price: p.final_price,
      final_price_type: typeof p.final_price
    })));

    // No modificamos los valores de final_price, solo usamos los productos tal como están
    const finalProducts = productsWithPrice;
    
    // Verificar explícitamente que haya productos
    console.log(`📦 Retornando ${finalProducts.length} productos procesados`);
    
    // Verificar explícitamente el primer producto
    if (finalProducts.length > 0) {
      const firstProduct = finalProducts[0];
      console.log('🥇 Primer producto:', {
        id: firstProduct.id,
        name: firstProduct.name,
        final_price: firstProduct.final_price,
        final_price_type: typeof firstProduct.final_price
      });
    }
    
    return { 
      products: finalProducts, 
      totalCount: count || 0 
    }
  } catch (error) {
    console.error('Error in getProducts:', error)
    return { products: [], totalCount: 0 }
  }
}

// Get a single product by ID
export async function getProduct(id) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories!inner(id, name)
      `)
      .eq('id', id)
      .eq('seller_id', 1)
      .single()

    if (error) {
      console.error('Error fetching product:', error)
      return null
    }

    // GARANTIZAR QUE EL PRODUCTO TENGA UN VALOR NUMÉRICO EN FINAL_PRICE
    if (!data) return null;
    
    // Log para depuración
    console.log(`🛒 getProduct: Obteniendo producto ID ${id}`);
    console.log(`  - final_price original: ${data.final_price} (${typeof data.final_price})`);
    
    // Crear una copia del producto para modificar
    const processedProduct = { ...data };
    
    // 1. Si final_price existe y es válido, usarlo
    if (data.final_price !== undefined && data.final_price !== null) {
      const numericValue = Number(data.final_price);
      if (!isNaN(numericValue)) {
        console.log(`  ✅ getProduct: Usando final_price existente: ${numericValue}`);
        processedProduct.final_price = numericValue;
        return processedProduct;
      } else {
        console.log(`  ⚠️ getProduct: final_price no es un número válido: ${data.final_price}`);
      }
    } else {
      console.log(`  ⚠️ getProduct: final_price no está disponible para este producto`);
    }
    
    // 2. Si final_price no es válido, intentar extraer el valor numérico de price_raw
    if (data.price_raw) {
      const cleanedString = String(data.price_raw).replace(/[^\d.-]/g, '');
      const numericValue = Number(cleanedString);
      if (!isNaN(numericValue) && numericValue > 0) {
        console.log(`  ✅ getProduct: Extrayendo valor de price_raw: ${numericValue}`);
        processedProduct.final_price = numericValue;
        return processedProduct;
      }
    }
    
    // 3. Si llegamos aquí, establecer final_price a 0
    console.log(`  ⚠️ getProduct: No se encontró un precio válido para el producto ID ${id}`);
    processedProduct.final_price = 0;
    return processedProduct;
  } catch (error) {
    console.error('Error in getProduct:', error)
    return null
  }
}

// Search products globally
export async function searchProducts(searchTerm, limit = 20) {
  try {
    if (!searchTerm.trim()) {
      return []
    }

    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        product_url,
        image_url,
        image_file_url,
        price_raw,
        final_price,
        currency,
        last_seen_at,
        categories!inner(id, name)
      `)
      .eq('seller_id', 1)
      .ilike('name', `%${searchTerm}%`)
      .order('name', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('Error searching products:', error)
      return []
    }

    // GARANTIZAR QUE TODOS LOS PRODUCTOS TENGAN UN VALOR NUMÉRICO EN FINAL_PRICE
    console.log(`🔍 searchProducts: Encontrados ${data?.length || 0} productos para "${searchTerm}"`);
    
    // Procesar cada producto para asegurar que final_price sea un valor numérico
    const processedProducts = (data || []).map(product => {
      // Crear una copia del producto
      const processedProduct = { ...product };
      
      // 1. Si final_price existe y es válido, usarlo
      if (product.final_price !== undefined && product.final_price !== null) {
        const numericValue = Number(product.final_price);
        if (!isNaN(numericValue)) {
          processedProduct.final_price = numericValue;
        } else {
          // 2. Si final_price no es válido, intentar extraer de price_raw
          if (product.price_raw) {
            const cleanedString = String(product.price_raw).replace(/[^\d.-]/g, '');
            const numericRawValue = Number(cleanedString);
            if (!isNaN(numericRawValue) && numericRawValue > 0) {
              processedProduct.final_price = numericRawValue;
            } else {
              // 3. Si nada funciona, usar 0
              processedProduct.final_price = 0;
            }
          } else {
            // Si no hay price_raw, usar 0
            processedProduct.final_price = 0;
          }
        }
      } else {
        // Si no hay final_price, intentar extraer de price_raw
        if (product.price_raw) {
          const cleanedString = String(product.price_raw).replace(/[^\d.-]/g, '');
          const numericRawValue = Number(cleanedString);
          if (!isNaN(numericRawValue) && numericRawValue > 0) {
            processedProduct.final_price = numericRawValue;
          } else {
            // Si la extracción no funciona, usar 0
            processedProduct.final_price = 0;
          }
        } else {
          // Si no hay price_raw, usar 0
          processedProduct.final_price = 0;
        }
      }
      
      return processedProduct;
    });
    
    // Log para depuración de los primeros productos procesados
    if (processedProducts.length > 0) {
      console.log('  Muestra de productos procesados:');
      processedProducts.slice(0, 2).forEach(p => {
        console.log(`  - ${p.name}: final_price=${p.final_price} (${typeof p.final_price})`);
      });
    }
    
    return processedProducts
  } catch (error) {
    console.error('Error in searchProducts:', error)
    return []
  }
}
