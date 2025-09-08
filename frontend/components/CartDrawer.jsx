'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingCart, Plus, Minus, Trash2, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatPrice } from '@/lib/types'
import { logProductPriceData, getPriceToDisplay, formatPriceConsistently } from '@/lib/price-debug'

export default function CartDrawer({ isOpen, onClose, cartItems, onUpdateQuantity, onRemoveItem }) {
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = cartItems.reduce((sum, item) => {
    // Usar final_price robustamente
    const unit = getPriceToDisplay(item.product);
    return sum + unit * item.quantity
  }, 0)

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
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="lg">
                  Proceder al Checkout
                </Button>
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
  // Usar las utilidades de diagnóstico para registrar datos de precios
  logProductPriceData(product, 'CartItem');
  
  console.log('🛒 CARTITEM - Datos de precio:', {
    name: product.name,
    final_price: product.final_price,
    final_price_type: typeof product.final_price
  });
  
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