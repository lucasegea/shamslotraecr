import { supabase } from './supabase'

// Fetch all categories with product counts
export async function getCategories() {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, external_id, name, product_count')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
      return []
    }

  // Unificar categorías con el mismo nombre y sumar sus contadores sin N+1 queries
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

  return Array.from(categoriesMap.values())
  } catch (error) {
    console.error('Error in getCategories:', error)
    return []
  }
}

// Types (JS Doc style for editor help)
/**
 * @typedef {Object} Cat
 * @property {number} id
 * @property {string} name
 * @property {number|null} parent_id
 * @property {number|null} product_count
 */

/**
 * @typedef {Object} CategoryNode
 * @property {number} id
 * @property {string} name
 * @property {number|null} parentId
 * @property {number} productCount
 * @property {CategoryNode[]} children
 */

/**
 * Build a tree of categories from flat rows
 * @param {Cat[]} rows
 * @returns {{ parents: CategoryNode[]; byParent: Map<number, number[]> }}
 */
export function buildCategoryTree(rows) {
  const parents = {}
  const childrenByParent = new Map()

  rows
    .filter((r) => r.parent_id === null)
    .forEach((r) => {
      parents[r.id] = { id: r.id, name: r.name, parentId: null, productCount: 0, children: [] }
      childrenByParent.set(r.id, [])
    })

  rows
    .filter((r) => r.parent_id !== null)
    .forEach((r) => {
      const child = {
        id: r.id,
        name: r.name,
        parentId: r.parent_id,
        productCount: Number(r.product_count ?? 0),
        children: []
      }
      const p = parents[r.parent_id]
      if (p) {
        p.children.push(child)
        p.productCount += child.productCount
        childrenByParent.get(p.id).push(child.id)
      }
    })

  Object.values(parents).forEach((p) => p.children.sort((a, b) => a.name.localeCompare(b.name)))

  const PINNED_PARENT_ID = 36
  const parentList = Object.values(parents).sort((a, b) => {
    if (a.id === PINNED_PARENT_ID) return -1
    if (b.id === PINNED_PARENT_ID) return 1
    const diff = (Number(b.productCount || 0) - Number(a.productCount || 0))
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })
  return { parents: parentList, byParent: childrenByParent }
}

// Fetch categories and return parent tree and map in one request
export async function getCategoryTree() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, parent_id, product_count')
    .order('parent_id', { nullsFirst: true })
    .order('name')

  if (error) {
    console.error('Error fetching category tree:', error)
    return { parents: [], byParent: new Map(), totalGlobal: 0 }
  }

  const rows = data || []
  const { parents, byParent } = buildCategoryTree(rows)
  const totalGlobal = rows
    .filter((r) => r.parent_id !== null)
    .reduce((sum, r) => sum + Number(r.product_count || 0), 0)

  return { parents, byParent, totalGlobal }
}

// Fetch products that belong to any of the provided category IDs
export async function getProductsByCategoryIds(ids = [], options = {}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { products: [], totalCount: 0 }
  }

  const {
    searchTerm = '',
    sortBy = 'name',
    sortOrder = 'asc',
    page = 1,
    limit = 24
  } = options

  let query = supabase
    .from('products')
    .select(
      `
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
      `,
      { count: 'exact' }
    )
    .in('category_id', ids)

  if (searchTerm) {
    query = query.ilike('name', `%${searchTerm}%`)
  }

  if (sortBy === 'price') {
    query = query.order('final_price', { ascending: sortOrder === 'asc', nullsLast: true })
  } else if (sortBy === 'date') {
    query = query.order('last_seen_at', { ascending: sortOrder === 'asc', nullsLast: true })
  } else {
    query = query.order('name', { ascending: sortOrder === 'asc' })
  }

  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) {
    console.error('Error fetching products by category ids:', error)
    return { products: [], totalCount: 0 }
  }

  return { products: data || [], totalCount: count || 0 }
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

  // Debug logs removidos para producción

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
        final_price,
        currency,
        last_seen_at,
        categories!inner(id, name)
      `)
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
