'use client'

import Image from 'next/image'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, ExternalLink, ImageIcon } from 'lucide-react'
import { formatPrice } from '@/lib/types'

export default function ProductCard({ product, onAddToCart }) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  
  // Try multiple image sources with better URL handling
  const getImageUrl = () => {
    if (imageError) return null
    
    if (product.image_file_url) {
      // Clean the URL and ensure it's properly formatted
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
  
  const handleAddToCart = () => {
    if (onAddToCart) {
      onAddToCart(product)
    }
  }

  const handleImageError = () => {
    console.log('Image error for product:', product.name, 'URL:', imageUrl)
    setImageError(true)
    setImageLoading(false)
  }

  const handleImageLoad = () => {
    setImageLoading(false)
  }

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className="group"
    >
      <Card className="overflow-hidden border-gray-200 hover:border-blue-300 transition-all duration-300 hover:shadow-lg bg-white">
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Imagen en miniatura */}
            <div className="relative w-20 h-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
              {imageUrl && !imageError ? (
                <>
                  {imageLoading && (
                    <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-lg" />
                  )}
                  <Image
                    src={imageUrl}
                    alt={product.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-110"
                    sizes="80px"
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    priority={false}
                  />
                </>
              ) : (
                <ImageIcon className="h-8 w-8 text-gray-400" />
              )}
            </div>
            
            {/* Contenido del producto */}
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="font-semibold text-gray-900 line-clamp-2 text-balance leading-tight text-sm">
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
        </CardContent>
      </Card>
    </motion.div>
  )
}