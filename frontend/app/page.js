
'use client'

import { useState, useEffect, useMemo, useRef, createContext } from 'react'
// Simple in-memory cache for paginated product result sets
// Keyed by: {cid, pid, search, page, limit, seed}
const pageDataCache = new Map()
import { v4 as uuidv4 } from 'uuid'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Waves, ShoppingCart, Filter, ChevronDown } from 'lucide-react'

import { getCategories, getProducts, getCategoryTree, getProductsByCategoryIds, getCuratedAllProductsMix, getCuratedAllProductsOrder } from '@/lib/database'
import { supabase } from '@/lib/supabase'
import { useIsMobile } from '@/hooks/use-mobile'
import dynamic from 'next/dynamic'
const CategorySidebar = dynamic(() => import('@/components/CategorySidebar'), { ssr: false, loading: () => null })
const ProductGrid = dynamic(() => import('@/components/ProductGrid'), { ssr: false, loading: () => null })
const ProductPagination = dynamic(() => import('@/components/ProductPagination'), { ssr: false, loading: () => null })
import SearchBar from '@/components/SearchBar'
import CartDrawer from '@/components/CartDrawer'
import ImageViewer from '@/components/ImageViewer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

// Contexto para el visor de imágenes
export const ImageViewerContext = createContext({
  openImageViewer: () => {},
  imageViewerState: { isOpen: false, imageUrl: '', alt: '' }
});

export default function HomePage() {
  const [categories, setCategories] = useState([])
  const [categoryParents, setCategoryParents] = useState([])
  const [childIdsByParent, setChildIdsByParent] = useState(new Map())
  const [totalGlobal, setTotalGlobal] = useState(0)
  const [products, setProducts] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [productsLoading, setProductsLoading] = useState(false)
  
  // Cart state
  const [cartItems, setCartItems] = useState([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCartBouncing, setIsCartBouncing] = useState(false)
  const [cartId, setCartId] = useState(null)
  const cartIdRef = useRef(null)
  const creatingCartRef = useRef(null)
  const isRestoringRef = useRef(false)
  const useSupabaseCartRef = useRef(false)
  const revisionRef = useRef(0)
  const SAVE_ONLY_ON_SHARE = true
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const isMobile = useIsMobile()
  const productsPerPage = isMobile ? 24 : 12
  const searchParams = useSearchParams()
  const categoryIdParam = searchParams?.get('categoryId')
  const parentIdParam = searchParams?.get('parentId')
  // Curated shuffle seed lives in sessionStorage instead of URL
  const router = useRouter()
  const pathname = usePathname()
  const cartUrlCleanedRef = useRef(false)
  const lastCatalogUrlRef = useRef('')
  const isCartRoute = useMemo(() => typeof pathname === 'string' && pathname.startsWith('/cart/'), [pathname])

  // Helper: persist what the catalog URL WOULD be (without touching current URL if on /cart/)
  const savePlannedCatalogUrl = (sp) => {
    try {
      const currentBase = lastCatalogUrlRef.current || (typeof window !== 'undefined' ? `${window.location.origin}/` : '/')
      const baseUrl = new URL(currentBase)
      // preserve base path if it's not a cart route; otherwise default to '/'
      if (baseUrl.pathname.startsWith('/cart/')) baseUrl.pathname = '/'
      baseUrl.search = sp ? `?${sp.toString()}` : ''
      const planned = baseUrl.toString()
      lastCatalogUrlRef.current = planned
      if (typeof window !== 'undefined') sessionStorage.setItem('lastCatalogUrl', planned)
    } catch {}
  }

  const pushCatalogUrl = (sp) => {
    if (isCartRoute) {
      // Don't mutate current /cart URL; store planned catalog URL instead
      savePlannedCatalogUrl(sp)
      return
    }
    const q = sp?.toString?.() || ''
    router.push(q ? `${pathname}?${q}` : pathname)
  }

  const replaceCatalogUrl = (sp) => {
    if (isCartRoute) {
      savePlannedCatalogUrl(sp)
      return
    }
    const q = sp?.toString?.() || ''
    router.replace(q ? `${pathname}?${q}` : pathname)
  }

  // Keep currentPage in sync with URL ?page=, default to 1
  useEffect(() => {
    const p = searchParams?.get('page')
    const n = p ? Number(p) : 1
    const valid = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
    if (valid !== currentPage) setCurrentPage(valid)
  }, [searchParams])
  
  // ImageViewer state
  const [imageViewerState, setImageViewerState] = useState({
    isOpen: false,
    imageUrl: '',
    alt: ''
  })
  const mobileCategoriesRef = useRef(null)
  
  // Función para abrir el visor de imágenes
  const openImageViewer = (imageUrl, alt) => {
    setImageViewerState({
      isOpen: true,
      imageUrl,
      alt
    })
  }

  const closeImageViewer = () => {
    setImageViewerState((prev) => ({
      ...prev,
      isOpen: false
    }))
  }
  
  // Valor del contexto para el visor de imágenes
  const imageViewerContextValue = {
    openImageViewer,
    imageViewerState
  }

  // Load initial data
  useEffect(() => {
    async function loadInitialData() {
      setLoading(true)
      try {
        const [categoriesData, productsData, tree] = await Promise.all([
          getCategories(),
          getProducts({ limit: productsPerPage, page: 1 }),
          getCategoryTree()
        ])

        setCategories(categoriesData)
        setCategoryParents(tree.parents || [])
        setChildIdsByParent(tree.byParent || new Map())
        setTotalGlobal(tree.totalGlobal || 0)
        setProducts(productsData.products)
        setTotalProducts(productsData.totalCount)
      } catch (error) {
        console.error('Error loading initial data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
  }, [])

  // Load products when filters, search, page, or productsPerPage change
  useEffect(() => {
    async function loadProducts() {
      setProductsLoading(true)
      try {
        // Guard against stale responses
        const rid = (loadProducts._rid = (loadProducts._rid || 0) + 1)

  let result
  const trimmed = searchTerm.trim()
  const cidRaw = categoryIdParam ? Number(categoryIdParam) : null
  const pidRaw = parentIdParam ? Number(parentIdParam) : null
  // Si hay búsqueda activa, ignorar filtros de categoría para que sea global
  const cid = trimmed ? null : cidRaw
  const pid = trimmed ? null : pidRaw
  const isCuratedAllNoSearch = !cid && !pid && !trimmed

        // Proactively clamp page when switching to categories with fewer pages
        try {
          let estimateTotal = null
          if (cid) {
            // find child in tree
            for (const p of categoryParents) {
              const c = (p.children || []).find(ch => ch.id === cid)
              if (c) { estimateTotal = Number(c.productCount || 0); break }
            }
          } else if (pid) {
            const pnode = categoryParents.find(p => p.id === pid)
            if (pnode) estimateTotal = Number(pnode.productCount || 0)
          }
          if (estimateTotal != null) {
            const estPages = Math.max(1, Math.ceil(estimateTotal / productsPerPage))
            if (currentPage > estPages) {
              setCurrentPage(1)
              try {
                const sp = new URLSearchParams(searchParams?.toString?.() || '')
                sp.set('page', '1')
                replaceCatalogUrl(sp)
              } catch {}
              return
            }
          }
        } catch {}

        // Determine seed for curated full-catalog order (stable per session)
        let seed = null
        if (isCuratedAllNoSearch) {
          try {
            const s = sessionStorage.getItem('curatedShuffle')
            if (s) seed = Number(s)
            else {
              seed = Date.now()
              sessionStorage.setItem('curatedShuffle', String(seed))
            }
          } catch {
            seed = Date.now()
          }
        }

        // Quick cache hit check
        const cacheKey = JSON.stringify({ cid, pid, search: trimmed, page: currentPage, limit: productsPerPage, seed })
        const cached = pageDataCache.get(cacheKey)
        if (cached && cached.data) {
          const r = cached.data
          setProducts(r.products || [])
          setTotalProducts(r.totalCount || 0)
          const pages = Math.max(1, Math.ceil((r.totalCount || 0) / productsPerPage))
          setTotalPages(pages)
          setProductsLoading(false)
          return
        }

        if (cid) {
          result = await getProducts({
            categoryId: cid,
            searchTerm: trimmed,
            limit: productsPerPage,
            page: currentPage
          })
        } else if (pid) {
          const ids = childIdsByParent.get(pid) || []
          result = await getProductsByCategoryIds(ids, {
            searchTerm: trimmed,
            limit: productsPerPage,
            page: currentPage
          })
        } else {
          if (isCuratedAllNoSearch) {
            // Full catalog in curated random order with pagination, keyed by shuffle seed
            const childMeta = []
            for (const p of categoryParents) {
              if ((p.productCount || 0) > 0) childMeta.push({ id: p.id, productCount: p.productCount })
              for (const c of (p.children || [])) {
                if ((c.productCount || 0) > 0) childMeta.push({ id: c.id, productCount: c.productCount })
              }
            }
            const seedUse = seed ?? Date.now()
            result = await getCuratedAllProductsOrder(childMeta, { page: currentPage, limit: productsPerPage, seed: seedUse })
          } else {
            // Global search with no filters: default search order
            result = await getProducts({
              searchTerm: trimmed,
              limit: productsPerPage,
              page: currentPage
            })
          }
        }

  // Update state (ignore stale)
  if (rid !== loadProducts._rid) return
  setProducts(result.products)
  setTotalProducts(result.totalCount)
  const pages = Math.max(1, Math.ceil(result.totalCount / productsPerPage))
  setTotalPages(pages)

        // Save in cache
        try { pageDataCache.set(cacheKey, { ts: Date.now(), data: result }) } catch {}

        // Clamp page if overflow
        if (currentPage > pages) {
          setCurrentPage(1)
          try {
            const sp = new URLSearchParams(searchParams?.toString?.() || '')
            sp.set('page', '1')
            replaceCatalogUrl(sp)
          } catch {}
        }

        // Prefetch next page in background
        try {
          const nextPage = currentPage + 1
          if (nextPage <= pages) {
            const nextKey = JSON.stringify({ cid, pid, search: trimmed, page: nextPage, limit: productsPerPage, seed })
            if (!pageDataCache.has(nextKey)) {
              ;(async () => {
                try {
                  let res
                  if (cid) {
                    res = await getProducts({ categoryId: cid, searchTerm: trimmed, limit: productsPerPage, page: nextPage })
                  } else if (pid) {
                    const ids = childIdsByParent.get(pid) || []
                    res = await getProductsByCategoryIds(ids, { searchTerm: trimmed, limit: productsPerPage, page: nextPage })
                  } else if (isCuratedAllNoSearch) {
                    const childMeta = []
                    for (const p of categoryParents) {
                      if ((p.productCount || 0) > 0) childMeta.push({ id: p.id, productCount: p.productCount })
                      for (const c of (p.children || [])) {
                        if ((c.productCount || 0) > 0) childMeta.push({ id: c.id, productCount: c.productCount })
                      }
                    }
                    const seedUse = seed ?? Date.now()
                    res = await getCuratedAllProductsOrder(childMeta, { page: nextPage, limit: productsPerPage, seed: seedUse })
                  } else {
                    res = await getProducts({ searchTerm: trimmed, limit: productsPerPage, page: nextPage })
                  }
                  pageDataCache.set(nextKey, { ts: Date.now(), data: res })
                } catch {}
              })()
            }
          }
        } catch {}
      } catch (error) {
        console.error('Error loading products:', error)
        setProducts([])
        setTotalProducts(0)
        setTotalPages(1)
      } finally {
        setProductsLoading(false)
      }
    }

    if (!loading) {
      loadProducts()
    }
  }, [categoryIdParam, parentIdParam, searchTerm, currentPage, loading, productsPerPage, childIdsByParent, searchParams, router, pathname])

  const handleCategorySelect = (category) => {
    setSelectedCategory(category)
    setSearchTerm('')
    setCurrentPage(1) // Reset to first page on category change
  }

  const handleSearch = (term) => {
    setSearchTerm(term)
    setCurrentPage(1) // Reset to first page on search
    if (term.trim()) {
      setSelectedCategory(null)
      // Búsqueda global: limpiar filtros en la URL y setear page=1
      try {
        const sp = new URLSearchParams(searchParams?.toString?.() || '')
        sp.delete('categoryId')
        sp.delete('parentId')
        sp.set('page', '1')
        pushCatalogUrl(sp)
      } catch {}
    }
  }
  
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
      // push page to URL so it persists on reload
      try {
        const sp = new URLSearchParams(searchParams?.toString?.() || '')
        sp.set('page', String(newPage))
        pushCatalogUrl(sp)
      } catch {}
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Cart functions
  const handleAddToCart = async (product, quantity = 1) => {
    const addQuantity = quantity || 1; // Asegurar que sea al menos 1
    
    try {
      // Obtener el producto más actualizado directamente de la base de datos
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
          currency
        `)
        .eq('id', product.id)
  .single();
      
      if (error) {
        console.error('Error al obtener producto actualizado:', error);
        // Continuar con el producto original si hay un error
      }
      
      // Usar el producto actualizado si está disponible, de lo contrario usar el original
      const updatedProduct = data || product;
      
  // Logs removidos
      
      setCartItems(prevItems => {
        const existingItem = prevItems.find(item => item.product.id === updatedProduct.id);
        
        if (existingItem) {
          return prevItems.map(item =>
            item.product.id === updatedProduct.id
              ? { ...item, quantity: item.quantity + addQuantity }
              : item
          );
        } else {
          return [...prevItems, { product: updatedProduct, quantity: addQuantity }];
        }
      });
      
      // Animate cart icon
      setIsCartBouncing(true);
      setTimeout(() => setIsCartBouncing(false), 800);
    } catch (err) {
      console.error('Error en handleAddToCart:', err);
      // Fallback: usar el producto original si algo falla
      setCartItems(prevItems => {
        const existingItem = prevItems.find(item => item.product.id === product.id);
        
        if (existingItem) {
          return prevItems.map(item =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + addQuantity }
              : item
          );
        } else {
          return [...prevItems, { product, quantity: addQuantity }];
        }
      });
      
      setIsCartBouncing(true);
      setTimeout(() => setIsCartBouncing(false), 800);
    }
  }

  const handleUpdateQuantity = (productId, newQuantity) => {
    if (newQuantity === 0) {
      handleRemoveItem(productId)
      return
    }
    
    setCartItems(prevItems =>
      prevItems.map(item =>
        item.product.id === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    )
  }

  const handleRemoveItem = (productId) => {
    setCartItems(prevItems => prevItems.filter(item => item.product.id !== productId))
  }

  // Auto-crear y sembrar carrito: desactivado si sólo se guarda al compartir
  useEffect(() => {
    if (SAVE_ONLY_ON_SHARE) return
    if (!cartItems || cartItems.length === 0) return
    if (cartIdRef.current || cartId) return
    if (creatingCartRef.current) return
    creatingCartRef.current = true
    ;(async () => {
      try {
        const id = uuidv4()
        setCartId(id)
        cartIdRef.current = id
        useSupabaseCartRef.current = true
        try { localStorage.setItem('sharedCartId', id) } catch {}
        const pairs = cartItems
          .filter(ci => ci?.product?.id && ci.quantity > 0)
          .map(ci => [ci.product.id, ci.quantity])
        if (pairs.length) {
          const seedRes = await fetch(`/api/cart/${id}?action=seed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seed: pairs })
          }).catch(() => null)
          // Try to read current revision after seed (avoid 409 on first PATCH)
          try {
            const gr = await fetch(`/api/cart/${id}`, { cache: 'no-store' })
            if (gr.ok) {
              const d = await gr.json()
              if (typeof d.revision === 'number') revisionRef.current = d.revision
            }
          } catch {}
        }
      } finally {
        creatingCartRef.current = false
      }
    })()
  }, [cartItems, SAVE_ONLY_ON_SHARE])

  // Restaurar carrito desde enlace compartido (soporta /cart/:shareId o ?cartId= o ?cart=)
  useEffect(() => {
    async function restoreCartFromQuery() {
      // 1) Restaurar snapshot local al instante si existe
      try {
        const snapshot = localStorage.getItem('cartSnapshot')
        if (snapshot) {
          const arr = JSON.parse(snapshot) // [{product:{...}, quantity}, ...]
          if (Array.isArray(arr) && arr.length) {
            isRestoringRef.current = true
            setCartItems(arr)
            // liberar bandera al siguiente tick
            Promise.resolve().then(() => { isRestoringRef.current = false })
          }
        }
      } catch {}

  isRestoringRef.current = true
      if (typeof window === 'undefined') return
      const sp = new URLSearchParams(window.location.search)
      // Detectar ruta /cart/:shareId como canónica
      let pathId = null
      try {
        const m = window.location.pathname.match(/^\/cart\/([a-f0-9\-]{6,})$/i)
        pathId = m ? m[1] : null
      } catch {}
  const existingIdRaw = pathId || sp.get('cartId')
  const seedEnc = sp.get('seed')
      const existingId = existingIdRaw && existingIdRaw !== 'null' && existingIdRaw !== 'undefined' ? existingIdRaw : null
      if (pathId) useSupabaseCartRef.current = true
      // Si hay cartId en la URL, usarlo y guardarlo para futuras sesiones
      let restored = false
      if (existingId) {
        try {
          if (useSupabaseCartRef.current) {
            const res = await fetch(`/api/cart/${existingId}`, { cache: 'no-store' })
            if (res.ok) {
              const data = await res.json()
              setCartId(existingId)
              cartIdRef.current = existingId
              revisionRef.current = data.revision || 0
              try { localStorage.setItem('sharedCartId', existingId) } catch {}
              const rows = Array.isArray(data.items) ? data.items : []
              const ids = rows.map(r => r.product_id)
              let byId = new Map()
              if (ids.length) {
                const { data: productsData } = await supabase
                  .from('products')
                  .select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency')
                  .in('id', ids)
                byId = new Map((productsData || []).map(p => [p.id, p]))
              }
              const nextItems = rows.map(r => ({ product: byId.get(r.product_id) || r.snapshot, quantity: Number(r.qty) || 1 })).filter(i => i.product)
              setCartItems(nextItems)
              if (nextItems.length) {
                restored = true
                if (seedEnc) { try { const url = new URL(window.location.href); url.searchParams.delete('seed'); window.history.replaceState({}, '', url.toString()) } catch {} }
              } else if (seedEnc) {
                // Sembrar en servidor una sola vez
                try {
                  const json = typeof atob === 'function' ? atob(seedEnc) : decodeURIComponent(seedEnc)
                  const seedPairs = JSON.parse(json)
                  if (Array.isArray(seedPairs) && seedPairs.length) {
                    await fetch(`/api/cart/${existingId}?action=seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: seedPairs }) })
                    // Reintentar GET
                    const again = await fetch(`/api/cart/${existingId}`, { cache: 'no-store' })
                    if (again.ok) {
                      const d2 = await again.json()
                      revisionRef.current = d2.revision || revisionRef.current
                      const rows2 = Array.isArray(d2.items) ? d2.items : []
                      const ids2 = rows2.map(r => r.product_id)
                      let byId2 = new Map()
                      if (ids2.length) {
                        const { data: p2 } = await supabase.from('products').select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency').in('id', ids2)
                        byId2 = new Map((p2 || []).map(p => [p.id, p]))
                      }
                      const seedItems = rows2.map(r => ({ product: byId2.get(r.product_id) || r.snapshot, quantity: Number(r.qty) || 1 })).filter(i => i.product)
                      setCartItems(seedItems)
                      if (seedItems.length) restored = true
                    }
                    try { const url = new URL(window.location.href); url.searchParams.delete('seed'); window.history.replaceState({}, '', url.toString()) } catch {}
                  }
                } catch {
                  // Fallback: si la siembra en servidor falla, al menos poblar el carrito localmente con el seed
                  try {
                    const json = typeof atob === 'function' ? atob(seedEnc) : decodeURIComponent(seedEnc)
                    const seedPairs = JSON.parse(json)
                    if (Array.isArray(seedPairs) && seedPairs.length) {
                      const ids3 = seedPairs.map(([pid]) => pid)
                      const { data: p3 } = await supabase
                        .from('products')
                        .select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency')
                        .in('id', ids3)
                      const byId3 = new Map((p3 || []).map(p => [p.id, p]))
                      const nextLocal = seedPairs.map(([pid, qty]) => ({ product: byId3.get(pid), quantity: Number(qty) || 1 })).filter(i => i.product)
                      if (nextLocal.length) {
                        setCartItems(nextLocal)
                        window.__seedFromCartSnapshot = nextLocal
                      }
                    }
                  } catch {}
                }
              }
            }
          } else {
            const res = await fetch(`/api/cart/${existingId}`, { cache: 'no-store' })
            if (res.ok) {
              const data = await res.json()
              setCartId(data.id)
              cartIdRef.current = data.id
              try { localStorage.setItem('sharedCartId', data.id) } catch {}
              const pairs = Array.isArray(data.items) ? data.items : []
              const ids = pairs.map(([id]) => id)
              const detailsMap = new Map((Array.isArray(data.details) ? data.details : []).map(d => [d.id, d]))
              let nextItems = []
              if (ids.length) {
                const { data: productsData } = await supabase
                  .from('products')
                  .select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency')
                  .in('id', ids)
                const byId = new Map((productsData || []).map(p => [p.id, p]))
                nextItems = pairs
                  .map(([pid, qty]) => ({ product: byId.get(pid) || detailsMap.get(pid), quantity: qty }))
                  .filter(i => i.product)
              }
              setCartItems(nextItems)
              if (nextItems.length) {
                restored = true
                if (seedEnc) { try { const url = new URL(window.location.href); url.searchParams.delete('seed'); window.history.replaceState({}, '', url.toString()) } catch {} }
              }
            }
          }
        } catch {}
      }
      // Si no hay cartId en la URL, intentar restaurar desde localStorage
      let savedId = null
      try { savedId = localStorage.getItem('sharedCartId') || null } catch {}
    if (!restored && savedId) {
        try {
          const res = useSupabaseCartRef.current ? await fetch(`/api/cart/${savedId}`, { cache: 'no-store' }) : await fetch(`/api/cart/${savedId}`, { cache: 'no-store' })
          if (res.ok) {
            const data = await res.json()
            const idSet = useSupabaseCartRef.current ? savedId : data.id
            setCartId(idSet)
            cartIdRef.current = idSet
            // Asegurar que la URL también tenga el cartId restaurado
            try {
              const url = new URL(window.location.href)
              if (useSupabaseCartRef.current) {
                url.pathname = `/cart/${idSet}`
              } else {
                url.searchParams.set('cartId', idSet)
              }
              url.searchParams.delete('cart')
              url.searchParams.delete('seed')
              window.history.replaceState({}, '', url.toString())
            } catch {}
            if (useSupabaseCartRef.current) {
              revisionRef.current = data.revision || 0
              const rows = Array.isArray(data.items) ? data.items : []
              const ids = rows.map(r => r.product_id)
              let byId = new Map()
              if (ids.length) {
                const { data: productsData } = await supabase
                  .from('products')
                  .select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency')
                  .in('id', ids)
                byId = new Map((productsData || []).map(p => [p.id, p]))
              }
              const nextItems = rows.map(r => ({ product: byId.get(r.product_id) || r.snapshot, quantity: Number(r.qty) || 1 })).filter(i => i.product)
              setCartItems(nextItems)
              if (nextItems.length) restored = true
            } else {
              const pairs = Array.isArray(data.items) ? data.items : []
              const ids = pairs.map(([id]) => id)
              const detailsMap = new Map((Array.isArray(data.details) ? data.details : []).map(d => [d.id, d]))
              let nextItems = []
              if (ids.length) {
                const { data: productsData } = await supabase
                  .from('products')
                  .select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency')
                  .in('id', ids)
                const byId = new Map((productsData || []).map(p => [p.id, p]))
                nextItems = pairs
                  .map(([pid, qty]) => ({ product: byId.get(pid) || detailsMap.get(pid), quantity: qty }))
                  .filter(i => i.product)
              }
              setCartItems(nextItems)
              if (nextItems.length) restored = true
            }
          }
        } catch {}
      }
  const enc = sp.get('cart')
    if (!restored && enc) {
        try {
          const json = typeof atob === 'function' ? atob(enc) : decodeURIComponent(enc)
          const pairs = JSON.parse(json) // [[id, qty], ...]
          const ids = pairs.map(([id]) => id)
          if (!ids.length) return
          const { data, error } = await supabase
            .from('products')
            .select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency')
            .in('id', ids)
          if (error) return
          const byId = new Map((data || []).map(p => [p.id, p]))
          const next = pairs.map(([pid, qty]) => ({ product: byId.get(pid), quantity: qty })).filter(i => i.product)
          setCartItems(next)
          // Marcar que debemos sembrar el servidor con este contenido si luego tenemos cartId
          window.__seedFromCartSnapshot = next
        } catch {}
      }
    }
  restoreCartFromQuery().finally(async () => {
    try {
      const seed = window.__seedFromCartSnapshot
      const id = cartIdRef.current || (typeof window !== 'undefined' ? (window.location.pathname.startsWith('/cart/') ? window.location.pathname.split('/').pop() : new URLSearchParams(window.location.search).get('cartId')) : null)
      if (Array.isArray(seed) && seed.length && id) {
        const valid = seed.filter(ci => ci?.product?.id && ci.quantity > 0)
        const items = valid.map(ci => [ci.product.id, ci.quantity])
        if (items.length) {
          if (useSupabaseCartRef.current || (typeof window !== 'undefined' && window.location.pathname.startsWith('/cart/'))) {
            await fetch(`/api/cart/${id}?action=seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: items }) })
          } else {
            const details = valid.map(ci => ({ id: ci.product.id, name: ci.product.name, product_url: ci.product.product_url, image_url: ci.product.image_url, image_file_url: ci.product.image_file_url, final_price: ci.product.final_price, price_raw: ci.product.price_raw, currency: ci.product.currency }))
            await fetch(`/api/cart/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, details }) })
          }
          setCartId(id)
          cartIdRef.current = id
          try { localStorage.setItem('sharedCartId', id) } catch {}
        }
      }
    } catch {}
    isRestoringRef.current = false
  })
  }, [])

  // Polling desactivado cuando sólo se guarda al compartir para evitar movimientos visuales
  useEffect(() => {
    if (SAVE_ONLY_ON_SHARE) return
    if (!cartId) return
    let stop = false
    let lastUpdatedAt = null
    async function tick() {
      try {
        if (useSupabaseCartRef.current || (typeof window !== 'undefined' && window.location.pathname.startsWith('/cart/'))) {
          const res = await fetch(`/api/cart/${cartId}`, { cache: 'no-store' })
          if (res.ok) {
            const data = await res.json()
            const changed = typeof data.revision === 'number' && data.revision !== revisionRef.current
            if (changed) {
              revisionRef.current = data.revision
              const rows = Array.isArray(data.items) ? data.items : []
              const ids = rows.map(r => r.product_id)
              let byId = new Map()
              if (ids.length) {
                const { data: productsData } = await supabase
                  .from('products')
                  .select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency')
                  .in('id', ids)
                byId = new Map((productsData || []).map(p => [p.id, p]))
              }
              const next = rows.map(r => ({ product: byId.get(r.product_id) || r.snapshot, quantity: Number(r.qty) || 1 })).filter(i => i.product)
              isRestoringRef.current = true
              setCartItems(next)
              Promise.resolve().then(() => { isRestoringRef.current = false })
            }
          }
        }
      } catch {}
      if (!stop) setTimeout(tick, 10000)
    }
    const t = setTimeout(tick, 5000)
    return () => { stop = true; clearTimeout(t) }
  }, [cartId, SAVE_ONLY_ON_SHARE])

  // Realtime: cuando estamos en /cart/:id, escuchar cambios en el cart_id interno y recargar la página
  useEffect(() => {
    if (typeof window === 'undefined') return
    const m = window.location.pathname.match(/^\/cart\/([a-f0-9\-]{6,})$/i)
    const pathId = m ? m[1] : null
    if (!pathId) return
    let channel = null
    ;(async () => {
      try {
        // Obtener cart_id interno para suscribirse correctamente
        const res = await fetch(`/api/cart/${pathId}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const internalCartId = data && data.cart && data.cart.id ? data.cart.id : null
        if (!internalCartId) return
        channel = supabase
          .channel(`cart-${internalCartId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items', filter: `cart_id=eq.${internalCartId}` }, () => {
            try { window.location.reload() } catch {}
          })
          .subscribe()
      } catch {}
    })()
    return () => {
      try { if (channel) supabase.removeChannel(channel) } catch {}
    }
  }, [])

  // Limpiar la URL UNA SOLA VEZ cuando entramos a /cart/:id y mantener lastCatalogUrl actualizado cuando no estamos en /cart/
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      // Guardar última URL del catálogo para poder restaurarla sin navegar (track también cambios de query)
      if (!window.location.pathname.startsWith('/cart/')) {
        const href = window.location.href
        lastCatalogUrlRef.current = href
        try { sessionStorage.setItem('lastCatalogUrl', href) } catch {}
      }
      if (cartUrlCleanedRef.current) return
      const isCart = window.location.pathname.startsWith('/cart/')
      if (!isCart) return
      const url = new URL(window.location.href)
      const allowed = new Set(['seed'])
      let changed = false
      for (const key of Array.from(url.searchParams.keys())) {
        if (!allowed.has(key)) { url.searchParams.delete(key); changed = true }
      }
      if (changed) window.history.replaceState({}, '', url.toString())
      cartUrlCleanedRef.current = true
    } catch {}
  }, [pathname, searchParams])

  // Si estamos en /cart/:id, abrir automáticamente el drawer (no navegar)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.pathname.startsWith('/cart/')) {
      setIsCartOpen(true)
    }
  }, [pathname])

  // Sincronización desactivada: sólo se guarda al compartir para evitar saltos visuales
  useEffect(() => {
    if (SAVE_ONLY_ON_SHARE) return
    if (!cartId) return
    if (isRestoringRef.current) return
    const h = setTimeout(async () => {
      try {
        const valid = cartItems.filter(ci => ci?.product?.id && ci.quantity > 0)
        if (useSupabaseCartRef.current || (typeof window !== 'undefined' && window.location.pathname.startsWith('/cart/'))) {
          const currentMap = new Map(valid.map(ci => [ci.product.id, ci]))
          const prev = JSON.parse(sessionStorage.getItem('prevCartItems') || '[]')
          const prevMap = new Map(prev.map(ci => [ci.product.id, ci]))
          const ops = []
          for (const [pid, ci] of currentMap.entries()) {
            ops.push({ op: 'upsert', productId: pid, qty: ci.quantity, snapshot: {
              id: ci.product.id,
              name: ci.product.name,
              product_url: ci.product.product_url,
              image_url: ci.product.image_url,
              image_file_url: ci.product.image_file_url,
              final_price: ci.product.final_price,
              price_raw: ci.product.price_raw,
              currency: ci.product.currency,
            } })
          }
          for (const pid of prevMap.keys()) { if (!currentMap.has(pid)) ops.push({ op: 'remove', productId: pid }) }
          if (ops.length) {
            const res = await fetch(`/api/cart/${cartId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `W/"${revisionRef.current}"` }, body: JSON.stringify({ ifRevision: revisionRef.current, ops }) })
            if (res.status === 409) {
              const data = await res.json().catch(() => null)
              const newRev = data && typeof data.revision === 'number' ? data.revision : null
              if (typeof newRev === 'number') {
                revisionRef.current = newRev
                const retry = await fetch(`/api/cart/${cartId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `W/"${revisionRef.current}"` }, body: JSON.stringify({ ifRevision: revisionRef.current, ops }) })
                if (retry.ok) {
                  const out2 = await retry.json().catch(() => null)
                  if (out2 && typeof out2.revision === 'number') revisionRef.current = out2.revision
                }
              }
            } else if (res.ok) {
              const out = await res.json().catch(() => null)
              if (out && typeof out.revision === 'number') revisionRef.current = out.revision
            }
          }
          try { sessionStorage.setItem('prevCartItems', JSON.stringify(valid.map(ci => ({ product: ci.product, quantity: ci.quantity })))) } catch {}
        }
      } catch {}
    }, 400)
    return () => clearTimeout(h)
  }, [cartItems, cartId, SAVE_ONLY_ON_SHARE])

  // Guardar snapshot local del carrito ante cualquier cambio (para sobrevivir reload / relogueo)
  useEffect(() => {
    try {
      const payload = cartItems.map(ci => ({ product: ci.product, quantity: ci.quantity }))
      localStorage.setItem('cartSnapshot', JSON.stringify(payload))
    } catch {}
  }, [cartItems])

  // Proveer un generador de link persistente para compartir
  const getShareLink = async () => {
    if (typeof window === 'undefined') return ''
    const items = cartItems.filter(ci => ci?.product?.id && ci.quantity > 0).map(ci => [ci.product.id, ci.quantity])
    // Pre-encode seed for robust fallback
    let encodedSeed = ''
    try {
      const json = JSON.stringify(items)
      encodedSeed = typeof btoa === 'function' ? btoa(json) : encodeURIComponent(json)
    } catch {}
    // Reusar siempre un cartId existente, ya sea en ruta, estado o guardado
    let id = cartIdRef.current || cartId
    let createdNow = false
    if (!id) {
      // Preferir el shareId de la ruta /cart/:id si existe
      try {
        const m = window.location.pathname.match(/^\/cart\/([a-f0-9\-]{6,})$/i)
        if (m) id = m[1]
      } catch {}
      // Intentar recuperar desde localStorage
      try { id = localStorage.getItem('sharedCartId') || null } catch {}
      // Intentar recuperar desde la URL actual si aún no hay id
      if (!id) {
        try {
          const spNow = new URLSearchParams(window.location.search)
          const qId = spNow.get('cartId')
          if (qId && qId !== 'null' && qId !== 'undefined') {
            id = qId
            try { localStorage.setItem('sharedCartId', id) } catch {}
          }
        } catch {}
      }
      if (id) {
        setCartId(id)
        cartIdRef.current = id
      }
    }
    try {
      // Si aún no hay id, generamos uno en cliente
      if (!id) {
        id = uuidv4()
        setCartId(id)
        cartIdRef.current = id
        createdNow = true
        try { localStorage.setItem('sharedCartId', id) } catch {}
      }
      // Sembrar o sincronizar en servidor (sólo al compartir). Si falla, usaremos ?seed= en el link.
      let seedOk = true
      try {
        if (items.length) {
          // 1) Asegurar carrito existente
          await fetch(`/api/cart/${id}?action=seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: items, totalQty: items.reduce((s, [,q])=>s+(Number(q)||0),0) }) }).catch(()=>{})
          useSupabaseCartRef.current = true
          // 2) Si sólo guardamos al compartir, sincronizar estado completo con PATCH
          if (SAVE_ONLY_ON_SHARE) {
            // Obtener revision e items del servidor
            let serverRev = 0
            let serverItems = []
            try {
              const gr = await fetch(`/api/cart/${id}`, { cache: 'no-store' })
              if (gr.ok) {
                const d = await gr.json()
                serverRev = typeof d.revision === 'number' ? d.revision : 0
                serverItems = Array.isArray(d.items) ? d.items : []
              }
            } catch {}
            const serverIds = new Set(serverItems.map(r => r.product_id))
            const localIds = new Set(items.map(([pid]) => pid))
            const ops = []
            // Upserts para todos los locales con snapshot
            const byId = new Map(products.map ? products.map(p=>[p.id,p]) : [])
            for (const [pid, qty] of items) {
              // Buscar snapshot del producto en lista actual (puede faltar si no está en la página)
              const local = (cartItems.find(ci=>ci?.product?.id===pid)?.product) || byId.get(pid) || { id: pid }
              ops.push({ op: 'upsert', productId: pid, qty, snapshot: {
                id: local.id,
                name: local.name,
                product_url: local.product_url,
                image_url: local.image_url,
                image_file_url: local.image_file_url,
                final_price: local.final_price,
                price_raw: local.price_raw,
                currency: local.currency,
              } })
            }
            // Remociones para los que están en servidor y no local
            for (const pid of serverIds) { if (!localIds.has(pid)) ops.push({ op: 'remove', productId: pid }) }
            if (ops.length) {
              const doPatch = async (rev) => fetch(`/api/cart/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `W/"${rev}"` }, body: JSON.stringify({ ifRevision: rev, ops }) })
              let pr = await doPatch(serverRev)
              if (pr.status === 409) {
                // Obtener nueva revision y reintentar
                const gr2 = await fetch(`/api/cart/${id}`, { cache: 'no-store' }).catch(()=>null)
                if (gr2 && gr2.ok) {
                  const d2 = await gr2.json().catch(()=>null)
                  const newRev = d2 && typeof d2.revision === 'number' ? d2.revision : serverRev
                  pr = await doPatch(newRev)
                }
              }
              seedOk = pr.ok || pr.status === 200
              if (seedOk) {
                try { const out = await pr.json(); if (out && typeof out.revision==='number') revisionRef.current = out.revision } catch {}
              }
            }
          }
        }
      } catch {
        seedOk = false
      }
    } catch {}
    // URL canónica /cart/:id
    const canonical = `${window.location.origin}/cart/${id}`
    const canonicalWithSeed = encodedSeed ? `${canonical}?seed=${encodedSeed}` : canonical
    try {
      const current = new URL(window.location.href)
      const isCart = current.pathname.startsWith('/cart/')
      if (isCart) {
        const currentId = current.searchParams.get('cartId')
        if (createdNow || currentId !== id) {
          // guardar la última URL de catálogo previa si estamos cambiando desde catálogo a /cart/:id
          try {
            if (!window.location.pathname.startsWith('/cart/')) {
              sessionStorage.setItem('lastCatalogUrl', window.location.href)
              lastCatalogUrlRef.current = window.location.href
            }
          } catch {}
          current.pathname = `/cart/${id}`
          // limpiar cualquier parámetro no relacionado al carrito
          const toDelete = ['cart', 'cartId', 'page', 'categoryId', 'parentId', 'q']
          for (const k of toDelete) current.searchParams.delete(k)
          // Mantener seed sólo si la siembra en servidor falló
          try { if (!seedOk) current.searchParams.set('seed', encodedSeed); else current.searchParams.delete('seed') } catch {}
          window.history.replaceState({}, '', current.toString())
        }
      }
    } catch {}
    if (id) return (seedOk ? canonical : canonicalWithSeed)
    // Fallback: encoded cart in URL so el link nunca sale “común”
    try {
      const json = JSON.stringify(items)
      const encoded = typeof btoa === 'function' ? btoa(json) : encodeURIComponent(json)
      const fallback = new URL(window.location.href)
      fallback.pathname = '/'
      fallback.searchParams.set('cart', encoded)
      fallback.searchParams.delete('cartId')
      return fallback.toString()
    } catch {
      return window.location.href
    }
  }

  const filteredProductsCount = useMemo(() => {
    return totalProducts
  }, [totalProducts])

  const headerTitle = useMemo(() => {
    if (searchTerm) {
      return `Resultados para "${searchTerm}"`
    }
    const cid = categoryIdParam ? Number(categoryIdParam) : null
    const pid = parentIdParam ? Number(parentIdParam) : null
    if (cid) {
      // Try to find child name in tree
      for (const p of categoryParents) {
        const found = (p.children || []).find((c) => c.id === cid)
        if (found) return found.name
      }
    }
    if (pid) {
      const p = categoryParents.find((x) => x.id === pid)
      if (p) return p.name
    }
    return 'Todos los productos'
  }, [searchTerm, categoryIdParam, parentIdParam, categoryParents])

  const selectedCategoryName = useMemo(() => {
    const cid = categoryIdParam ? Number(categoryIdParam) : null
    const pid = parentIdParam ? Number(parentIdParam) : null
    if (cid) {
      for (const p of categoryParents) {
        const found = (p.children || []).find((c) => c.id === cid)
        if (found) return found.name
      }
    }
    if (pid) {
      const p = categoryParents.find((x) => x.id === pid)
      return p?.name || ''
    }
    return ''
  }, [categoryIdParam, parentIdParam, categoryParents])

  const totalCartItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex gap-8">
            <div className="w-80 space-y-4">
              <div className="h-96 bg-card/50 rounded-2xl animate-pulse" />
            </div>
            <div className="flex-1 space-y-6">
              <div className="h-16 bg-card/50 rounded-2xl animate-pulse" />
              <ProductGrid loading={true} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ImageViewerContext.Provider value={imageViewerContextValue}>
      <div className="min-h-screen bg-background">
        {/* Visor de imágenes a nivel global */}
        <ImageViewer 
          isOpen={imageViewerState.isOpen}
          onClose={closeImageViewer}
          imageUrl={imageViewerState.imageUrl}
          alt={imageViewerState.alt}
        />
        
        {/* Hero Header */}
        <motion.header 
          className="sticky top-0 z-40 bg-background/90 supports-[backdrop-filter]:bg-background/60 backdrop-blur border-b border-blue-100/50"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
  <div className="mx-auto w-full lg:w-[96%] max-w-screen-2xl px-0 sm:px-3 py-4 sm:py-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Waves className="h-8 w-8 text-blue-900" />
                </div>
                <div>
                  <Link
                    href={cartId ? ((useSupabaseCartRef.current || (typeof window !== 'undefined' && window.location.pathname.startsWith('/cart/'))) ? `/cart/${cartId}` : `/?cartId=${cartId}`) : '/'}
                    onClick={(e) => {
                      // Forzar reload completo y conservar cartId si existe
                      e.preventDefault()
                      try {
                        const id = cartIdRef.current || cartId || (typeof window !== 'undefined' ? localStorage.getItem('sharedCartId') : null)
                        const href = id ? ((useSupabaseCartRef.current || (typeof window !== 'undefined' && window.location.pathname.startsWith('/cart/'))) ? `/cart/${id}` : `/?cartId=${id}`) : '/'
                        window.location.href = href
                      } catch {
                        window.location.href = '/'
                      }
                    }}
                    className="group inline-flex flex-col focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-md"
                  >
                    <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-blue-900 group-hover:underline cursor-pointer">
                      Shams lo trae!
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Los mejores precios
                    </p>
                  </Link>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <SearchBar 
                onSearch={handleSearch}
                searchTerm={searchTerm}
                placeholder="Buscar productos..."
                className="w-full max-w-md"
              />

              {/* Cart Button */}
              <Button
                variant="outline"
                className="relative"
                onClick={() => setIsCartOpen(true)}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={totalCartItems} // Esto fuerza la reanimación cuando cambia el total
                    initial={isCartBouncing ? { scale: 0.5, rotate: -15 } : { scale: 1, rotate: 0 }}
                    animate={isCartBouncing ? {
                      scale: [0.5, 1.2, 1],
                      rotate: [-15, 15, 0],
                    } : { scale: 1, rotate: 0 }}
                    transition={{ 
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                  >
                    <ShoppingCart className="h-5 w-5" />
                  </motion.div>
                </AnimatePresence>
                <AnimatePresence>
                  {totalCartItems > 0 && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="absolute -top-2 -right-2 z-10 h-5 min-w-[1.25rem] px-1 inline-grid place-items-center rounded-full bg-red-600 text-white text-[11px] leading-none font-semibold tabular-nums shadow ring-1 ring-white pointer-events-none will-change-transform"
                      aria-label={`Productos en el carrito: ${totalCartItems}`}
                    >
                      {totalCartItems}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
  <main className="mx-auto w-full lg:w-[96%] max-w-screen-2xl px-0 sm:px-3 py-5 sm:py-8">
  <div className="flex flex-col lg:flex-row gap-4 lg:gap-7">
          {/* Sidebar - desktop only */}
          <motion.aside
            className="hidden lg:block"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <CategorySidebar 
              parents={categoryParents} 
              totalGlobal={totalGlobal}
              onBeforeSelect={() => {
                // mostrar esqueletos inmediatamente
                setProductsLoading(true)
              }}
            />
          </motion.aside>

          {/* Products */}
          <motion.div 
            className="flex-1 space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {/* Mobile filters */}
            <div className="lg:hidden">
              <details ref={mobileCategoriesRef} className="group rounded-xl border border-blue-200 bg-white/90 shadow-sm px-4 py-3">
                <summary className="list-none cursor-pointer select-none flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-gray-900">Categorías</span>
                    <span className="text-xs text-muted-foreground group-open:hidden">(toca para abrir)</span>
                    <span className="text-xs text-muted-foreground hidden group-open:inline">(toca para cerrar)</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="pt-0 overflow-hidden transition-all duration-200 ease-in-out max-h-0 opacity-0 group-open:max-h-[60vh] group-open:opacity-100">
                  <CategorySidebar 
                    parents={categoryParents} 
                    totalGlobal={totalGlobal} 
                    isMobile={true}
                    onBeforeSelect={() => {
                      setProductsLoading(true)
                      // cerrar el acordeón móvil para ver el grid
                      if (mobileCategoriesRef.current) {
                        try { mobileCategoriesRef.current.open = false } catch {}
                      }
                    }}
                  />
                </div>
              </details>
            </div>
            {/* Products Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">
                  {headerTitle}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalProducts > 0 && (
                    <>
                      {totalProducts} {totalProducts === 1 ? 'producto encontrado' : 'productos encontrados'}
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-4">
                {((categoryIdParam || parentIdParam) || searchTerm) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedCategory(null)
                      setSearchTerm('')
                      setCurrentPage(1)
                      const sp = new URLSearchParams(searchParams.toString())
                      sp.delete('categoryId')
                      sp.delete('parentId')
                      sp.set('page', '1')
                      pushCatalogUrl(sp)
                    }}
                    className="shrink-0"
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>

            {/* Products Grid */}
            <ProductGrid
              products={products}
              loading={productsLoading}
              searchTerm={searchTerm}
              categoryName={selectedCategoryName}
              onAddToCart={handleAddToCart}
            />
            
            {/* Products Pagination - Bottom Center */}
            {totalProducts > productsPerPage && (
              <div className="flex justify-center mt-8 mb-6">
                <ProductPagination 
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  className="pagination-controls"
                />
              </div>
            )}
          </motion.div>
        </div>
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => {
          setIsCartOpen(false)
          // Si estamos en /cart/:id, restaurar la última URL del catálogo sin navegar
          try {
            if (typeof window !== 'undefined' && window.location.pathname.startsWith('/cart/')) {
              const prev = sessionStorage.getItem('lastCatalogUrl') || lastCatalogUrlRef.current || '/'
              window.history.replaceState({}, '', prev)
            }
          } catch {}
        }}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
  getShareLink={getShareLink}
        shareButtonLabel={cartId ? 'Guardar y compartir' : 'Compartir carrito'}
      />
    </div>
    </ImageViewerContext.Provider>
  )
}