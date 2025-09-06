'use client'

import { useState, useContext } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, ExternalLink, ImageIcon, Maximize2 } from 'lucide-react'
import { formatPrice } from '@/lib/types'
import { ImageViewerContext } from '@/app/page'

export default function ProductCard({ product, onAddToCart }) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  
  // Usar el contexto del visor de imágenes global
  const { openImageViewer } = useContext(ImageViewerContext)

  // Priorizar image_file_url, luego construir URL, finalmente image_url
  const getImageUrl = () => {
    if (imageError) return null

    // DEBUG: Log de datos para entender qué viene de la DB
    console.group(`🔍 ${product.name}`)
    console.log('image_file_url:', product.image_file_url)
    console.log('image_url:', product.image_url)

    // 1. PRIORIDAD: image_file_url
    if (product.image_file_url) {
      const fileUrl = String(product.image_file_url).trim()
      
      if (fileUrl && fileUrl !== 'null' && fileUrl !== 'undefined' && fileUrl.length > 0) {
        // Si ya es una URL completa de Supabase, usarla directamente (limpiando ?)
        if (fileUrl.includes('supabase.co')) {
          const cleanUrl = fileUrl.replace(/\?+$/, '')
          console.log('✅ Using full Supabase URL:', cleanUrl)
          console.groupEnd()
          return cleanUrl
        }
        
        // Si es solo nombre de archivo, construir URL
        const cleanFile = fileUrl.replace(/^\/+/, '').replace(/\?+$/, '')
        if (cleanFile.length > 0) {
          const constructedUrl = `https://wjgitkxfzdmrblqzwryf.supabase.co/storage/v1/object/public/product-images/${cleanFile}`
          console.log('🔧 Constructed URL:', constructedUrl)
          console.groupEnd()
          return constructedUrl
        }
      }
    }

    // 2. FALLBACK: image_url externa
    if (product.image_url && product.image_url.startsWith('http')) {
      console.log('🔗 Using external URL:', product.image_url)
      console.groupEnd()
      return product.image_url
    }

    console.log('❌ No valid image found')
    console.groupEnd()
    return null
  }

  const imageUrl = getImageUrl()
  const formattedPrice = formatPrice(product.price_numeric, product.price_raw, product.currency)
  
  const handleAddToCart = () => {
    if (onAddToCart) {
      onAddToCart(product, quantity)
    }
  }

  // Funciones para el control de cantidad
  const incrementQuantity = () => setQuantity(prev => prev + 1)
  const decrementQuantity = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1))
  
  const handleQuantityChange = (e) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value) && value > 0) {
      setQuantity(value)
    } else if (e.target.value === '') {
      setQuantity('')
    }
  }
  
  const handleQuantityBlur = () => {
    if (quantity === '' || quantity < 1) {
      setQuantity(1)
    }
  }

  const handleImageError = () => {
    console.log('🚫 Image failed to load:', imageUrl)
    setImageError(true)
    setImageLoading(false)
  }

  const handleImageLoad = () => {
    console.log('✅ Image loaded successfully:', imageUrl)
    setImageLoading(false)
  }

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className="group h-full"
    >
      <Card className="overflow-hidden border-gray-200 hover:border-blue-300 transition-all duration-300 hover:shadow-lg bg-white h-full flex flex-col">
        <CardContent className="p-4 flex flex-col h-full">
          <div className="flex flex-col gap-4 h-full">
            {/* Imagen más grande en la parte superior - usando ImageViewer global */}
            <button
              type="button"
              onClick={() => imageUrl && openImageViewer(imageUrl, product.name)}
              className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200 group cursor-pointer"
            >
              {imageUrl && !imageError ? (
                <div className="relative w-full h-full">
                  {imageLoading && (
                    <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-lg" />
                  )}
                  <Image
                    src={imageUrl}
                    alt={product.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    priority={false}
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                    <Maximize2 className="h-8 w-8 text-white drop-shadow-md" />
                  </div>
                </div>
              ) : (
                <ImageIcon className="h-12 w-12 text-gray-400" />
              )}
            </button>

            {/* Contenido del producto */}
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="font-semibold text-gray-900 line-clamp-2 text-balance leading-tight">
                  {product.name}
                </h3>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-lg font-bold text-blue-600">
                    {formattedPrice}
                  </p>
                  {product.currency && (
                    <Badge className="text-xs bg-gray-100 text-gray-700 border-gray-200">
                      {product.currency}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2 mt-auto pt-2">
                {/* Control de cantidad */}
                <div className="flex items-center justify-center gap-1">
                  <button 
                    onClick={decrementQuantity}
                    className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700"
                    disabled={quantity <= 1}
                    type="button"
                    aria-label="Disminuir cantidad"
                  >
                    <span className="text-sm font-bold">−</span>
                  </button>
                  
                  <input
                    type="number"
                    value={quantity}
                    onChange={handleQuantityChange}
                    onBlur={handleQuantityBlur}
                    min="1"
                    className="w-10 h-7 text-center text-sm font-semibold border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 selection:bg-cyan-200"
                    aria-label="Cantidad"
                    style={{ 
                      appearance: 'textfield',
                      MozAppearance: 'textfield',
                      WebkitAppearance: 'none',
                      margin: 0
                    }}
                  />
                  
                  <button 
                    onClick={incrementQuantity}
                    className="w-7 h-7 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center text-white"
                    type="button"
                    aria-label="Aumentar cantidad"
                  >
                    <span className="text-sm font-bold">+</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleAddToCart}
                    className="flex-1 hover-lift bg-blue-600 hover:bg-blue-700 text-white border-0"
                    size="sm"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Agregar al Carrito
                  </Button>
                  {product.product_url && (
                    <Button
                      asChild
                      className="shrink-0 border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
                      size="sm"
                    >
                      <a
                        href={product.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
