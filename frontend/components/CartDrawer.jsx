
'use client'

import { useState } from 'react'
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
              <div className="border-t border-gray-200 p-6 space-y-4">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span className="text-gray-900">Total:</span>
                  <span className="text-blue-600">{formatPriceConsistently(totalPrice)}</span>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const link = getShareLink ? await getShareLink() : buildCartShareLink()
                          // Clipboard API with fallback
                          try {
                            await navigator.clipboard.writeText(link)
                          } catch {
                            const ta = document.createElement('textarea')
                            ta.value = link
                            ta.style.position = 'fixed'
                            ta.style.left = '-9999px'
                            document.body.appendChild(ta)
                            ta.focus()
                            ta.select()
                            document.execCommand('copy')
                            document.body.removeChild(ta)
                          }
                          setCopied(true)
                          setTimeout(() => setCopied(false), 1500)
                          toast({ title: 'Link copiado', description: 'El enlace del carrito se copió al portapapeles.' })
                        } catch (e) {
                          toast({ title: 'No se pudo copiar', description: 'Intenta nuevamente o comparte manualmente.', variant: 'destructive' })
                        }
                      }}
                    >
                      <Share2 className="h-4 w-4 mr-2" /> {shareButtonLabel || 'Guardar y compartir'}
                    </Button>
                    {copied && (
                      <span className="text-xs text-green-600">Copiado ✓</span>
                    )}
                  </div>
                  <Button
                    className="w-full bg-[#25D366] hover:bg-[#1fb457] text-white"
                    size="lg"
                    onClick={async () => {
                      const link = getShareLink ? await getShareLink() : buildCartShareLink()
                      const msisdn = '+5491162802566'
                      const msg = `Hola! Quiero finalizar la compra con este carrito: ${link}`
                      const wa = `https://wa.me/${encodeURIComponent(msisdn)}?text=${encodeURIComponent(msg)}`
                      if (typeof window !== 'undefined') window.open(wa, '_blank')
                    }}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" /> Finalizar compra por WhatsApp
                  </Button>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Los precios pueden variar. Verifica en el sitio original antes de comprar.
                </p>
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