
'use client'

import { useState, useEffect, useMemo, useRef, createContext } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Waves, ShoppingCart, Filter, ChevronDown } from 'lucide-react'

import { getCategories, getProducts } from '@/lib/database'
import { supabase } from '@/lib/supabase'
import { useIsMobile } from '@/hooks/use-mobile'
import CategorySidebar from '@/components/CategorySidebar'
import ProductGrid from '@/components/ProductGrid'
import ProductPagination from '@/components/ProductPagination'
import SearchBar from '@/components/SearchBar'
import CartDrawer from '@/components/CartDrawer'
import ImageViewer from '@/components/ImageViewer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

// Contexto para el visor de imágenes
export const ImageViewerContext = createContext({
  openImageViewer: () => {},
  imageViewerState: { isOpen: false, imageUrl: '', alt: '' }
});

export default function HomePage() {
  const [categories, setCategories] = useState([])
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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const isMobile = useIsMobile()
  const productsPerPage = isMobile ? 24 : 12
  
  // ImageViewer state
  const [imageViewerState, setImageViewerState] = useState({
    isOpen: false,
    imageUrl: '',
    alt: ''
  })
  
  // Ref for mobile categories <details>
  const mobileCategoriesRef = useRef(null)
  
  // Función para abrir el visor de imágenes
  const openImageViewer = (imageUrl, alt) => {
    setImageViewerState({
      isOpen: true,
      imageUrl,
      alt
    })
  }
  
  // Función para cerrar el visor de imágenes
  const closeImageViewer = () => {
    setImageViewerState({
      ...imageViewerState,
      isOpen: false
    })
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
        const [categoriesData, productsData] = await Promise.all([
          getCategories(),
          getProducts({ limit: productsPerPage, page: 1 })
        ])
        
        setCategories(categoriesData)
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

  // Load products when category, search, page, or productsPerPage changes
  useEffect(() => {
    async function loadProducts() {
      setProductsLoading(true)
      try {
        const result = await getProducts({
          categoryId: selectedCategory?.id,
          searchTerm: searchTerm.trim(),
          limit: productsPerPage,
          page: currentPage
        })
        
  // Logs de depuración removidos para producción
        
        // Usar los productos directamente sin modificar
        setProducts(result.products)
        setTotalProducts(result.totalCount)
        
        const pages = Math.max(1, Math.ceil(result.totalCount / productsPerPage))
        setTotalPages(pages)
        
        // Si la página actual es mayor que el total de páginas, volver a la primera
        if (currentPage > pages) {
          setCurrentPage(1)
        }
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
  }, [selectedCategory, searchTerm, currentPage, loading, productsPerPage])

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
    }
  }
  
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
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
            const res = await fetch(`/cart/${existingId}`, { cache: 'no-store' })
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
                    await fetch(`/cart/${existingId}?action=seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: seedPairs }) })
                    // Reintentar GET
                    const again = await fetch(`/cart/${existingId}`, { cache: 'no-store' })
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
                } catch {}
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
          const res = useSupabaseCartRef.current ? await fetch(`/cart/${savedId}`, { cache: 'no-store' }) : await fetch(`/api/cart/${savedId}`, { cache: 'no-store' })
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
            await fetch(`/cart/${id}?action=seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: items }) })
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

  // Polling para sincronizar cambios desde otros usuarios en el mismo cartId
  useEffect(() => {
    if (!cartId) return
    let stop = false
    let lastUpdatedAt = null
    async function tick() {
      try {
        if (useSupabaseCartRef.current || (typeof window !== 'undefined' && window.location.pathname.startsWith('/cart/'))) {
          const res = await fetch(`/cart/${cartId}`, { cache: 'no-store' })
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
        } else {
          const res = await fetch(`/api/cart/${cartId}`, { cache: 'no-store' })
          if (res.ok) {
            const data = await res.json()
            // Si cambió updated_at, refrescar items
            const changed = !lastUpdatedAt || (data.updated_at && data.updated_at !== lastUpdatedAt)
            if (changed) {
              lastUpdatedAt = data.updated_at || lastUpdatedAt
              const pairs = Array.isArray(data.items) ? data.items : []
              const ids = pairs.map(([id]) => id)
              const detailsMap = new Map((Array.isArray(data.details) ? data.details : []).map(d => [d.id, d]))
              if (ids.length) {
                const { data: productsData } = await supabase
                  .from('products')
                  .select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency')
                  .in('id', ids)
                const byId = new Map((productsData || []).map(p => [p.id, p]))
                const next = pairs.map(([pid, qty]) => ({ product: byId.get(pid) || detailsMap.get(pid), quantity: qty })).filter(i => i.product)
                isRestoringRef.current = true
                setCartItems(next)
                Promise.resolve().then(() => { isRestoringRef.current = false })
              } else {
                setCartItems([])
              }
            }
          }
        }
      } catch {}
      if (!stop) setTimeout(tick, 10000)
    }
    const t = setTimeout(tick, 5000)
    return () => { stop = true; clearTimeout(t) }
  }, [cartId])

  // Sincronizar carrito persistente al cambiar items (con debounce ligero)
  useEffect(() => {
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
            const res = await fetch(`/cart/${cartId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `W/"${revisionRef.current}"` }, body: JSON.stringify({ ifRevision: revisionRef.current, ops }) })
            if (res.status === 409) {
              const data = await res.json().catch(() => null)
              if (data && Array.isArray(data.items)) {
                const rows = data.items
                const ids = rows.map(r => r.product_id)
                let byId = new Map()
                if (ids.length) {
                  const { data: productsData } = await supabase
                    .from('products')
                    .select('id, name, product_url, image_url, image_file_url, price_raw, final_price, currency')
                    .in('id', ids)
                  byId = new Map((productsData || []).map(p => [p.id, p]))
                }
                const next = rows.map(r => ({ product: byId.get(r.product_id) || r.snapshot, quantity: Number(r.qty) || 1 }))
                isRestoringRef.current = true
                setCartItems(next)
                Promise.resolve().then(() => { isRestoringRef.current = false })
                revisionRef.current = data.revision || revisionRef.current
              }
            } else if (res.ok) {
              const out = await res.json().catch(() => null)
              if (out && typeof out.revision === 'number') revisionRef.current = out.revision
            }
          }
          try { sessionStorage.setItem('prevCartItems', JSON.stringify(valid.map(ci => ({ product: ci.product, quantity: ci.quantity })))) } catch {}
        } else {
          const items = valid.map(ci => [ci.product.id, ci.quantity])
          const details = valid.map(ci => ({ id: ci.product.id, name: ci.product.name, product_url: ci.product.product_url, image_url: ci.product.image_url, image_file_url: ci.product.image_file_url, final_price: ci.product.final_price, price_raw: ci.product.price_raw, currency: ci.product.currency }))
          await fetch(`/api/cart/${cartId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, details }) })
        }
      } catch {}
    }, 400)
    return () => clearTimeout(h)
  }, [cartItems, cartId])

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
    // Reusar siempre un cartId existente, ya sea en estado o guardado
    let id = cartIdRef.current || cartId
    let createdNow = false
    if (!id) {
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
      // Sembrar en servidor (idempotente)
      try {
        if (items.length) {
          await fetch(`/cart/${id}?action=seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: items }) })
          useSupabaseCartRef.current = true
        }
      } catch {}
    } catch {}
    // URL canónica /cart/:id
    const canonical = `${window.location.origin}/cart/${id}`
    try {
      const current = new URL(window.location.href)
      const currentId = current.searchParams.get('cartId')
      if (createdNow || currentId !== id) {
        current.pathname = `/cart/${id}`
        current.searchParams.delete('cart')
        current.searchParams.delete('cartId')
        current.searchParams.delete('seed')
        window.history.replaceState({}, '', current.toString())
      }
    } catch {}
    if (id) return canonical
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
    if (selectedCategory) {
      return selectedCategory.name
    }
    return 'Todos los productos'
  }, [searchTerm, selectedCategory])

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
          className="sticky top-0 z-40 bg-transparent"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
  <div className="mx-auto w-full max-w-screen-xl px-0 sm:px-4 py-4 sm:py-6">
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
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <Badge 
                        variant="destructive" 
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs"
                      >
                        {totalCartItems}
                      </Badge>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
  <main className="mx-auto w-full max-w-screen-xl px-0 sm:px-4 py-5 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-5 lg:gap-8">
          {/* Sidebar - desktop only */}
          <motion.aside
            className="hidden lg:block"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <CategorySidebar
              categories={categories}
              selectedCategory={selectedCategory}
              onCategorySelect={handleCategorySelect}
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
                    categories={categories}
                    selectedCategory={selectedCategory}
                    onCategorySelect={(cat) => {
                      // Mostrar esqueletos inmediatamente para evitar parpadeos
                      setProductsLoading(true)
                      handleCategorySelect(cat)
                      // Cerrar el acordeón en el siguiente frame para que se vea la transición
                      if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(() => {
                          if (mobileCategoriesRef.current) {
                            mobileCategoriesRef.current.open = false
                          }
                        })
                      } else if (mobileCategoriesRef.current) {
                        mobileCategoriesRef.current.open = false
                      }
                    }}
                    isMobile={true}
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
                {(selectedCategory || searchTerm) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedCategory(null)
                      setSearchTerm('')
                      setCurrentPage(1)
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
              categoryName={selectedCategory?.name}
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
        onClose={() => setIsCartOpen(false)}
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