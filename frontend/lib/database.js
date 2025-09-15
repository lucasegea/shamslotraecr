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
  const parentOwnCount = new Map()

  rows
    .filter((r) => r.parent_id === null)
    .forEach((r) => {
      const own = Number(r.product_count ?? 0)
      parents[r.id] = { id: r.id, name: r.name, parentId: null, productCount: own, children: [] }
      childrenByParent.set(r.id, [])
      parentOwnCount.set(r.id, own)
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

  Object.values(parents).forEach((p) => {
    p.children.sort((a, b) => a.name.localeCompare(b.name))
  })

  // If a parent has own products, include its id in byParent so selecting the parent
  // includes both its direct products and its children.
  for (const [pid, own] of parentOwnCount.entries()) {
    if (own > 0) {
      const arr = childrenByParent.get(pid) || []
      if (!arr.includes(pid)) arr.push(pid)
      childrenByParent.set(pid, arr)
    }
  }

  // Special case: ensure "Hogar y oficina" is treated as a child of
  // "Hogar, oficina y otros" even if it arrives as a parent.
  const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const findParentByName = (needle) => Object.values(parents).find(p => norm(p.name) === needle)
  const hogarOficinaParent = findParentByName('hogar y oficina')
  const hogarOtrosParent = findParentByName('hogar, oficina y otros') || findParentByName('hogar y oficina y otros')
  if (hogarOficinaParent && hogarOtrosParent) {
    // Do not move if IDs are equal or already a child
    if (hogarOficinaParent.id === hogarOtrosParent.id) {
      // nothing to do
    } else {
    const asChild = {
      id: hogarOficinaParent.id,
      name: hogarOficinaParent.name,
      parentId: hogarOtrosParent.id,
      productCount: hogarOficinaParent.productCount,
      children: []
    }
    hogarOtrosParent.children.push(asChild)
    // update counts and byParent map
    hogarOtrosParent.productCount += asChild.productCount
    const arr = childrenByParent.get(hogarOtrosParent.id) || []
    arr.push(asChild.id)
    childrenByParent.set(hogarOtrosParent.id, arr)
    // remove from parents
    delete parents[hogarOficinaParent.id]
    childrenByParent.delete(hogarOficinaParent.id)
    }
  }

  const ORDER = new Map([
    ['tecnologia', 0],
    ['moda y accesorios', 1],
    ['jugueteria', 2],
    ['hogar, oficina y otros', 3],
    ['sin categoria', 4],
    ['uncategorized', 4],
  ])
  const parentList = Object.values(parents).sort((a, b) => {
    const ai = ORDER.has(norm(a.name)) ? ORDER.get(norm(a.name)) : 10
    const bi = ORDER.has(norm(b.name)) ? ORDER.get(norm(b.name)) : 10
    if (ai !== bi) return ai - bi
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

// Helper: seeded RNG for reproducible-but-random shuffles per invocation
function createRng(seed) {
  let s = typeof seed === 'number' ? seed : (Date.now() % 2147483647) || 1234567
  return function rng() {
    s = (s * 48271) % 2147483647
    return (s - 1) / 2147483646
  }
}

function shuffleInPlace(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

// Build a curated, alternating mix across many subcategories.
// childMeta: Array<{ id: number, productCount: number }>
export async function getCuratedAllProductsMix(childMeta = [], options = {}) {
  const {
    limit = 24,
    perCategoryMax = 3,
    poolSize = 400,
    seed = undefined
  } = options

  const childIds = Array.isArray(childMeta) ? childMeta.map(c => c.id) : []
  if (!childIds.length) return { products: [], totalCount: 0 }

  // 1) Fetch a pool of recent products with images across all subcategories
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
    `)
    .in('category_id', childIds)
    .order('last_seen_at', { ascending: false, nullsLast: true })
    .limit(Math.max(limit * 8, poolSize))

  const { data, error } = await query
  if (error) {
    console.error('Error fetching curated pool:', error)
    return { products: [], totalCount: 0 }
  }
  const pool = (data || []).filter(p => (p.image_url || p.image_file_url))
  if (!pool.length) return { products: [], totalCount: 0 }

  // 2) Price tiers (low/mid/high) via quantiles
  const validPrices = pool
    .map(p => typeof p.final_price === 'number' ? p.final_price : null)
    .filter(v => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b)
  const q1 = validPrices[Math.floor(validPrices.length * 0.33)] || 0
  const q2 = validPrices[Math.floor(validPrices.length * 0.66)] || q1
  const tierOf = (price) => {
    if (typeof price !== 'number' || price <= 0) return 'mid'
    if (price <= q1) return 'low'
    if (price <= q2) return 'mid'
    return 'high'
  }

  // 3) Group products per category and pre-sort by recency/price
  const byCat = new Map()
  for (const p of pool) {
    const cid = p.category_id
    if (!byCat.has(cid)) byCat.set(cid, [])
    byCat.get(cid).push(p)
  }
  const rng = createRng(seed)
  for (const [cid, arr] of byCat) {
    // Prefer recent and appealing prices within each category
    arr.sort((a, b) => {
      const ad = (new Date(b.last_seen_at || 0) - new Date(a.last_seen_at || 0))
      if (ad !== 0) return ad
      const ap = (a.final_price ?? 1e12) - (b.final_price ?? 1e12)
      return ap
    })
    // small shuffle to avoid deterministic ties
    shuffleInPlace(arr, rng)
  }

  // 4) Category priority by productCount descending with slight randomness
  const priorityCats = childMeta
    .filter(c => byCat.has(c.id))
    .sort((a, b) => {
      const diff = (Number(b.productCount || 0) - Number(a.productCount || 0))
      if (diff !== 0) return diff
      return a.id - b.id
    })
  shuffleInPlace(priorityCats, rng) // slight diversity among same counts

  // 5) Build alternating mix using a tier pattern
  const pattern = ['low', 'low', 'mid', 'low', 'mid', 'high']
  let patternIdx = 0
  const picked = []
  const usedIds = new Set()
  const pickedPerCat = new Map()
  let catPointer = 0

  const nextTier = () => {
    const t = pattern[patternIdx % pattern.length]
    patternIdx += 1
    return t
  }

  const pickFromCategory = (cid, desiredTier) => {
    const arr = byCat.get(cid)
    if (!arr || !arr.length) return null
    // Try desired tier first, then fallbacks
    const tiers = desiredTier === 'low' ? ['low', 'mid', 'high']
      : desiredTier === 'mid' ? ['mid', 'low', 'high']
      : ['high', 'mid', 'low']
    for (const t of tiers) {
      const idx = arr.findIndex(p => !usedIds.has(p.id) && tierOf(p.final_price) === t)
      if (idx !== -1) {
        const [p] = arr.splice(idx, 1)
        usedIds.add(p.id)
        return p
      }
    }
    // As last resort, take any unused
    const anyIdx = arr.findIndex(p => !usedIds.has(p.id))
    if (anyIdx !== -1) {
      const [p] = arr.splice(anyIdx, 1)
      usedIds.add(p.id)
      return p
    }
    return null
  }

  const maxGuard = limit * 10 // avoid infinite loops
  let attempts = 0
  while (picked.length < limit && attempts < maxGuard && priorityCats.length > 0) {
    attempts += 1
    const desiredTier = nextTier()
    // Find next category with capacity and stock
    let tries = 0
    let chosenCat = null
    while (tries < priorityCats.length) {
      const cat = priorityCats[catPointer % priorityCats.length]
      catPointer = (catPointer + 1) % priorityCats.length
      const count = pickedPerCat.get(cat.id) || 0
      if (count >= perCategoryMax) { tries += 1; continue }
      if (!byCat.get(cat.id) || byCat.get(cat.id).every(p => usedIds.has(p.id))) { tries += 1; continue }
      chosenCat = cat.id
      break
    }
    if (chosenCat == null) break
    const product = pickFromCategory(chosenCat, desiredTier)
    if (!product) continue
    picked.push(product)
    pickedPerCat.set(chosenCat, (pickedPerCat.get(chosenCat) || 0) + 1)
  }

  return { products: picked, totalCount: picked.length }
}

// Generate a full-length curated order across ALL products for given child categories.
// Returns a function that can page slices consistently using a seed.
export async function getCuratedAllProductsOrder(childMeta = [], options = {}) {
  const {
    page = 1,
    limit = 24,
    seed = undefined
  } = options

  const childIds = Array.isArray(childMeta) ? childMeta.map(c => c.id) : []
  if (!childIds.length) return { products: [], totalCount: 0 }

  // Fetch a large pool (ideally most) to compute an order; if dataset is big, you can raise this.
  // We keep it reasonably high to approximate full set; pagination will slice this order.
  const POOL_LIMIT = 20000
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
    .in('category_id', childIds)
  .order('last_seen_at', { ascending: false, nullsLast: true })
  .range(0, POOL_LIMIT - 1)

  const { data, error, count } = await query
  if (error) {
    console.error('Error fetching curated full pool:', error)
    return { products: [], totalCount: 0 }
  }
  const all = (data || [])
  const totalCount = typeof count === 'number' ? count : all.length
  if (!all.length) return { products: [], totalCount: 0 }

  // Build same tiering and alternating logic, but create a full order
  const validPrices = all
    .map(p => typeof p.final_price === 'number' ? p.final_price : null)
    .filter(v => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b)
  const q1 = validPrices[Math.floor(validPrices.length * 0.33)] || 0
  const q2 = validPrices[Math.floor(validPrices.length * 0.66)] || q1
  const tierOf = (price) => {
    if (typeof price !== 'number' || price <= 0) return 'mid'
    if (price <= q1) return 'low'
    if (price <= q2) return 'mid'
    return 'high'
  }

  const byCat = new Map()
  for (const p of all) {
    const cid = p.category_id
    if (!byCat.has(cid)) byCat.set(cid, [])
    byCat.get(cid).push(p)
  }
  const rng = createRng(seed)
  for (const [cid, arr] of byCat) {
    // Prefer recent then attractive prices
    arr.sort((a, b) => {
      const ad = (new Date(b.last_seen_at || 0) - new Date(a.last_seen_at || 0))
      if (ad !== 0) return ad
      const ap = (a.final_price ?? 1e12) - (b.final_price ?? 1e12)
      return ap
    })
    shuffleInPlace(arr, rng)
  }

  const priorityCats = childMeta
    .filter(c => byCat.has(c.id))
    .sort((a, b) => {
      const diff = (Number(b.productCount || 0) - Number(a.productCount || 0))
      if (diff !== 0) return diff
      return a.id - b.id
    })
  shuffleInPlace(priorityCats, rng)

  const pattern = ['low', 'low', 'mid', 'low', 'mid', 'high']
  let patternIdx = 0
  const nextTier = () => { const t = pattern[patternIdx % pattern.length]; patternIdx += 1; return t }

  const used = new Set()
  const order = []
  const pickedPerCat = new Map()
  let catPointer = 0

  const pickFromCategory = (cid, desiredTier) => {
    const arr = byCat.get(cid)
    if (!arr || !arr.length) return null
    const tiers = desiredTier === 'low' ? ['low', 'mid', 'high'] : desiredTier === 'mid' ? ['mid', 'low', 'high'] : ['high', 'mid', 'low']
    for (const t of tiers) {
      const idx = arr.findIndex(p => !used.has(p.id) && tierOf(p.final_price) === t)
      if (idx !== -1) {
        const [p] = arr.splice(idx, 1)
        used.add(p.id)
        return p
      }
    }
    const anyIdx = arr.findIndex(p => !used.has(p.id))
    if (anyIdx !== -1) { const [p] = arr.splice(anyIdx, 1); used.add(p.id); return p }
    return null
  }

  // Build a long order until we exhaust pool
  const maxGuard = all.length * 3
  let attempts = 0
  while (order.length < all.length && attempts < maxGuard) {
    attempts += 1
    const desiredTier = nextTier()
    let found = null
    // round-robin categories
    for (let i = 0; i < priorityCats.length; i++) {
      const cat = priorityCats[(catPointer + i) % priorityCats.length]
      const p = pickFromCategory(cat.id, desiredTier)
      if (p) { found = p; catPointer = (catPointer + i + 1) % priorityCats.length; break }
    }
    if (!found) {
      // fallback: pick any remaining
      for (const [cid, arr] of byCat) {
        const anyIdx = arr.findIndex(p => !used.has(p.id))
        if (anyIdx !== -1) { const [p] = arr.splice(anyIdx, 1); used.add(p.id); found = p; break }
      }
    }
    if (!found) break
    order.push(found)
    pickedPerCat.set(found.category_id, (pickedPerCat.get(found.category_id) || 0) + 1)
  }

  // Client-side pagination slice from deterministic order
  const from = (page - 1) * limit
  const to = from + limit
  const pageItems = order.slice(from, to)
  const totalPages = Math.max(1, Math.ceil(order.length / limit))
  return { products: pageItems, totalCount, totalPages }
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
