
'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingCart, Plus, Minus, Trash2, ImageIcon, Share2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatPrice } from '@/lib/types'
import { logProductPriceData, getPriceToDisplay, formatPriceConsistently } from '@/lib/price-debug'
import { toast } from '@/hooks/use-toast'

export default function CartDrawer({ isOpen, onClose, cartItems, onUpdateQuantity, onRemoveItem, getShareLink, shareButtonLabel }) {
  const [copied, setCopied] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [isWhatsApping, setIsWhatsApping] = useState(false)
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = cartItems.reduce((sum, item) => {
    // Usar final_price robustamente
    const unit = getPriceToDisplay(item.product);
    return sum + unit * item.quantity
  }, 0)

  function buildCartShareLink() {
    if (typeof window === 'undefined') return ''
    // Compact payload: [[id,qty], ...]
    const pairs = cartItems
      .filter(ci => ci?.product?.id && ci.quantity > 0)
      .map(ci => [ci.product.id, ci.quantity])
    const json = JSON.stringify(pairs)
    // json uses only ascii characters (digits, brackets, commas), safe for btoa
    const encoded = typeof btoa === 'function' ? btoa(json) : encodeURIComponent(json)
    const url = new URL(window.location.href)
    url.searchParams.set('cart', encoded)
    // Keep only cart param to make it shorter (optional): stay with full URL to preserve filters
    return url.toString()
  }

  function handleClearCart() {
    try {
      // Vaciar items localmente (no toca la DB)
      const ids = Array.from(new Set((cartItems || []).map(ci => ci?.product?.id).filter(Boolean)))
      ids.forEach(id => {
        try { onRemoveItem && onRemoveItem(id) } catch {}
      })
      // Forzar nuevo link para el próximo carrito
      if (typeof window !== 'undefined') {
        try { localStorage.removeItem('sharedCartId') } catch {}
        try {
          const url = new URL(window.location.href)
          // Volver a home si estamos en /cart/:id
          if (/^\/cart\//.test(url.pathname)) url.pathname = '/'
          url.searchParams.delete('cart')
          url.searchParams.delete('cartId')
          url.searchParams.delete('seed')
          window.history.replaceState({}, '', url.toString())
        } catch {}
      }
      toast({ title: 'Carrito vaciado', description: 'Se vació localmente. El link anterior permanece guardado.' })
    } catch {}
  }

  // Lock background scroll only during share flows
  useEffect(() => {
    if (typeof document === 'undefined') return
    const prevOverflow = document.body.style.overflow
    if (isSharing || isWhatsApping) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = prevOverflow || ''
    }
    return () => {
      document.body.style.overflow = prevOverflow || ''
    }
  }, [isSharing, isWhatsApping])

  async function handleWhatsAppClick() {
    setIsWhatsApping(true)
    if (typeof window === 'undefined') return
    // 1) Obtener/crear un shareId estable inmediatamente
    let shareId = null
    try {
      const m = window.location.pathname.match(/^\/cart\/([a-f0-9\-]{6,})$/i)
      shareId = m ? m[1] : null
    } catch {}
    if (!shareId) {
      try { shareId = localStorage.getItem('sharedCartId') || null } catch {}
    }
    if (!shareId) {
      try {
        const url = new URL(window.location.href)
        const v = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + '-' + Date.now()
        shareId = v
        url.pathname = `/cart/${shareId}`
        url.searchParams.delete('cart')
        url.searchParams.delete('cartId')
        url.searchParams.delete('seed')
        window.history.replaceState({}, '', url.toString())
        try { localStorage.setItem('sharedCartId', shareId) } catch {}
      } catch {}
    }
    const link = `${window.location.origin}/cart/${shareId}`
    // 2) Abrir WhatsApp inmediatamente (sin await para no ser bloqueado)
  const msisdn = '5492216083824' // sin '+' según docs de wa.me
    const msg = `Hola! Quiero finalizar la compra con este carrito: ${link}`
    const wa = `https://wa.me/${msisdn}?text=${encodeURIComponent(msg)}`
    try { window.open(wa, '_blank', 'noopener,noreferrer') } catch {}
    // 3) Guardar el carrito en background con ese mismo id
    try {
      const pairs = cartItems.filter(ci => ci?.product?.id && ci.quantity > 0).map(ci => [ci.product.id, ci.quantity])
      const totalQty = cartItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
      if (pairs.length) {
        await fetch(`/api/cart/${shareId}?action=seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: pairs, totalQty }) })
        let serverItems = []
        let rev = 0
        try {
          const res = await fetch(`/api/cart/${shareId}`, { cache: 'no-store' })
          if (res.ok) {
            const d = await res.json()
            serverItems = Array.isArray(d.items) ? d.items : []
            rev = typeof d.revision === 'number' ? d.revision : 0
          }
        } catch {}
        const serverSet = new Set(serverItems.map(r => r.product_id))
        const localMap = new Map(pairs.map(([pid, qty]) => [pid, qty]))
        const ops = []
        for (const [pid, qty] of localMap.entries()) {
          ops.push({ op: 'upsert', productId: pid, qty, snapshot: null })
        }
        for (const pid of serverSet.values()) {
          if (!localMap.has(pid)) ops.push({ op: 'remove', productId: pid })
        }
        if (ops.length) {
          const r = await fetch(`/api/cart/${shareId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `W/"${rev}"` }, body: JSON.stringify({ ifRevision: rev, ops }) })
          if (r.status === 409) {
            const data = await r.json().catch(() => null)
            const newRev = data && typeof data.revision === 'number' ? data.revision : rev
            await fetch(`/api/cart/${shareId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `W/"${newRev}"` }, body: JSON.stringify({ ifRevision: newRev, ops }) }).catch(() => {})
          }
        }
      }
    } catch {}
    finally {
      setIsWhatsApping(false)
    }
  }
  async function handleShareClick() {
    setIsSharing(true)
    try {
      if (typeof window === 'undefined') return
      // 1) Determine/share canonical link immediately using a stable id
      let shareId = null
      try {
        const m = window.location.pathname.match(/^\/cart\/([a-f0-9\-]{6,})$/i)
        shareId = m ? m[1] : null
      } catch {}
      if (!shareId) {
        try { shareId = localStorage.getItem('sharedCartId') || null } catch {}
      }
      if (!shareId) {
        // Generate a deterministic id by reusing existing link generator which also updates history
        // But avoid awaiting network; if still no id, create a uuid locally
        try {
          const url = new URL(window.location.href)
          // lightweight uuid (not importing): use crypto if available
          const v = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + '-' + Date.now()
          shareId = v
          url.pathname = `/cart/${shareId}`
          url.searchParams.delete('cart')
          url.searchParams.delete('cartId')
          url.searchParams.delete('seed')
          window.history.replaceState({}, '', url.toString())
          try { localStorage.setItem('sharedCartId', shareId) } catch {}
        } catch {}
      }
      const link = `${window.location.origin}/cart/${shareId}`
      // 2) Copy to clipboard with fallbacks
      let copiedOk = false
      try {
        await navigator.clipboard.writeText(link)
        copiedOk = true
      } catch {
        try {
          const ta = document.createElement('textarea')
          ta.value = link
          ta.style.position = 'fixed'
          ta.style.left = '-9999px'
          document.body.appendChild(ta)
          ta.focus()
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
          copiedOk = true
        } catch {}
      }
      if (!copiedOk) {
        try { window.prompt('Copia este enlace', link) } catch {}
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast({ title: 'Link copiado', description: 'El enlace del carrito se copió al portapapeles.' })

      // 3) Save current cart to Supabase in the background using the same id
      try {
        const pairs = cartItems.filter(ci => ci?.product?.id && ci.quantity > 0).map(ci => [ci.product.id, ci.quantity])
        const totalQty = cartItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
        if (pairs.length) {
          // Seed to create/update quantity
          await fetch(`/api/cart/${shareId}?action=seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: pairs, totalQty }) })
          // Fetch server state and revision to compute exact diff ops
          let serverItems = []
          let rev = 0
          try {
            const res = await fetch(`/api/cart/${shareId}`, { cache: 'no-store' })
            if (res.ok) {
              const d = await res.json()
              serverItems = Array.isArray(d.items) ? d.items : []
              rev = typeof d.revision === 'number' ? d.revision : 0
            }
          } catch {}
          const serverSet = new Set(serverItems.map(r => r.product_id))
          const localMap = new Map(pairs.map(([pid, qty]) => [pid, qty]))
          const ops = []
          for (const [pid, qty] of localMap.entries()) {
            ops.push({ op: 'upsert', productId: pid, qty, snapshot: null })
          }
          for (const pid of serverSet.values()) {
            if (!localMap.has(pid)) ops.push({ op: 'remove', productId: pid })
          }
          if (ops.length) {
            const r = await fetch(`/api/cart/${shareId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `W/"${rev}"` }, body: JSON.stringify({ ifRevision: rev, ops }) })
            if (r.status === 409) {
              const data = await r.json().catch(() => null)
              const newRev = data && typeof data.revision === 'number' ? data.revision : rev
              await fetch(`/api/cart/${shareId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `W/"${newRev}"` }, body: JSON.stringify({ ifRevision: newRev, ops }) }).catch(() => {})
            }
          }
        }
      } catch {}
    } catch (e) {
      toast({ title: 'No se pudo copiar', description: 'Intenta nuevamente o comparte manualmente.', variant: 'destructive' })
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white border-l border-gray-200 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">
                  Carrito ({totalItems})
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingCart className="h-16 w-16 text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Tu carrito está vacío
                  </h3>
                  <p className="text-gray-600">
                    Agrega productos para comenzar tu compra
                  </p>
                </div>
              ) : (
                cartItems.map((item) => (
                  <CartItem
                    key={item.product.id}
                    item={item}
                    onUpdateQuantity={onUpdateQuantity}
                    onRemoveItem={onRemoveItem}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            {cartItems.length > 0 && (
              <div className="relative border-t border-gray-200 p-6 space-y-4 bg-white shadow-[0_-6px_12px_rgba(0,0,0,0.06)]">
                {/* Desvanecido superior para que el contenido no se vea superpuesto al scrollear */}
                <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-white to-transparent" />
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span className="text-gray-900">Total:</span>
                  <span className="text-blue-600">{formatPriceConsistently(totalPrice)}</span>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={handleShareClick}
                      disabled={isSharing || isWhatsApping}
                    >
                      <Share2 className="h-4 w-4 mr-2" /> {shareButtonLabel || 'Guardar y compartir'}
                    </Button>
                    {copied && (
                      <span className="text-xs text-green-600">Copiado ✓</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-red-600 hover:bg-red-50"
                      onClick={handleClearCart}
                      title="Vaciar carrito (local)"
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Vaciar carrito
                    </Button>
                  </div>
                  <Button
                    className="w-full bg-[#25D366] hover:bg-[#1fb457] text-white"
                    size="lg"
                    onClick={handleWhatsAppClick}
                    disabled={isWhatsApping || isSharing}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" /> Finalizar compra por WhatsApp
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function CartItem({ item, onUpdateQuantity, onRemoveItem }) {
  const { product, quantity } = item
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  
  const getImageUrl = () => {
    if (imageError) return null
    
    const possibleUrls = []
    
    if (product.image_file_url) {
      const fileUrl = String(product.image_file_url).trim()
      
      if (fileUrl && fileUrl !== 'null' && fileUrl !== 'undefined' && fileUrl.length > 0) {
        if (fileUrl.includes('http')) {
          const cleanUrl = fileUrl.replace(/\?+$/, '').trim()
          possibleUrls.push({ type: 'full_url_cleaned', url: cleanUrl })
        } else {
          const cleanFile = fileUrl.replace(/^\/+/, '').replace(/\?+$/, '')
          if (cleanFile) {
            const supabaseUrl = `https://wjgitkxfzdmrblqzwryf.supabase.co/storage/v1/object/public/product-images/${cleanFile}`
            possibleUrls.push({ type: 'supabase_constructed', url: supabaseUrl })
          }
        }
      }
    }
    
    if (product.image_url) {
      const extUrl = String(product.image_url).trim()
      if (extUrl && extUrl.startsWith('http')) {
        possibleUrls.push({ type: 'external_url', url: extUrl })
      }
    }
    
    return possibleUrls.length > 0 ? possibleUrls[0].url : null
  }

  const imageUrl = getImageUrl()
  // No-op logs removed for producción
  logProductPriceData(product, 'CartItem');
  
  // Precio unitario y total basados en final_price (robusto)
  const finalPriceNum = getPriceToDisplay(product);
  const formattedPrice = formatPriceConsistently(finalPriceNum);
  const itemTotal = finalPriceNum * quantity;
  const formattedTotal = formatPriceConsistently(itemTotal);

  return (
    <Card className="bg-gray-50 border-gray-200">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Imagen */}
          <div className="relative w-16 h-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
            {imageUrl && !imageError ? (
              <Image
                src={imageUrl}
                alt={product.name}
                fill
                className={`object-cover transition-opacity duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                sizes="64px"
                onError={() => setImageError(true)}
                onLoad={() => setImageLoading(false)}
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-gray-400" />
            )}
          </div>

          {/* Detalles */}
          <div className="flex-1 space-y-2">
            <h4 className="font-medium text-gray-900 text-sm line-clamp-2">
              {product.name}
            </h4>
            
            <div className="flex items-center justify-between">
              <span className="text-blue-600 font-semibold">{formattedPrice}</span>
            </div>

            {/* Controles de cantidad */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 border-gray-300"
                  onClick={() => onUpdateQuantity(product.id, Math.max(0, quantity - 1))}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                
                <Badge variant="secondary" className="min-w-[2rem] text-center bg-gray-100 text-gray-900">
                  {quantity}
                </Badge>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 border-gray-300"
                  onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {formattedTotal}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => onRemoveItem(product.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}