'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingCart, Plus, Minus, Trash2, ExternalLink, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatPrice } from '@/lib/types'

export default function CartDrawer({ isOpen, onClose, cartItems, onUpdateQuantity, onRemoveItem }) {
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = cartItems.reduce((sum, item) => {
    const price = item.product.price_numeric || 0
    return sum + (price * item.quantity)
  }, 0)

  const formatTotalPrice = (total) => {
    return new Intl.NumberFormat('es-CR', { 
      style: 'currency', 
      currency: 'CRC' 
    }).format(total)
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
                  <span className="text-blue-600">{formatTotalPrice(totalPrice)}</span>
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
  
  const getImageUrl = () => {
    if (imageError) return null
    
    if (product.image_file_url) {
      const cleanUrl = product.image_file_url.replace(/^\/+/, '')
      return `https://wjgitkxfzdmrblqzwryf.supabase.co/storage/v1/object/public/product-images/${cleanUrl}`
    }
    
    if (product.image_url && product.image_url.startsWith('http')) {
      return product.image_url
    }
    
    return null
  }

  const imageUrl = getImageUrl()
  const formattedPrice = formatPrice(product.price_numeric, product.price_raw, product.currency)
  const itemTotal = (product.price_numeric || 0) * quantity

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
                className="object-cover"
                sizes="64px"
                onError={() => setImageError(true)}
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
              {product.product_url && (
                <a 
                  href={product.product_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
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
                  {new Intl.NumberFormat('es-CR', { 
                    style: 'currency', 
                    currency: 'CRC' 
                  }).format(itemTotal)}
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