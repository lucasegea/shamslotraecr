import { supabase } from './supabase'

// Fetch all categories with product counts - Fixed duplicates
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

    // Remove duplicates by name and fix product counts
    const categoriesMap = new Map()
    
    for (const category of data || []) {
      const key = category.name
      if (categoriesMap.has(key)) {
        // If duplicate, combine product counts
        const existing = categoriesMap.get(key)
        existing.product_count = (existing.product_count || 0) + (category.product_count || 0)
      } else {
        categoriesMap.set(key, { ...category })
      }
    }

    // Get actual product counts from products table
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

    return categoriesWithActualCounts.filter(cat => cat.product_count > 0)
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
        price_numeric,
        currency,
        first_seen_at,
        last_seen_at,
        seller_id
      `)
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
      query = query.order('price_numeric', { ascending: sortOrder === 'asc', nullsLast: true })
    } else if (sortBy === 'date') {
      query = query.order('last_seen_at', { ascending: sortOrder === 'asc', nullsLast: true })
    } else {
      query = query.order('name', { ascending: sortOrder === 'asc' })
    }

    // Pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching products:', error)
      return { products: [], totalCount: 0 }
    }

    return { 
      products: data || [], 
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

    return data
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
        price_numeric,
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

    return data || []
  } catch (error) {
    console.error('Error in searchProducts:', error)
    return []
  }
}