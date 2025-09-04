'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ShoppingCart, ExternalLink, ImageIcon, Maximize2 } from 'lucide-react'
import { formatPrice } from '@/lib/types'

export default function ProductCard({ product, onAddToCart }) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  
  // Try multiple image sources with priority on Supabase storage bucket
  const getImageUrl = () => {
    if (imageError) return null
    
    // Priorizar las imágenes del bucket product-images
    if (product.image_file_url) {
      // Clean the URL and ensure it's properly formatted
      const cleanUrl = product.image_file_url.replace(/^\/+/, '')
      return `https://wjgitkxfzdmrblqzwryf.supabase.co/storage/v1/object/public/product-images/${cleanUrl}`
    }
    
    // Fallback a las URLs externas si no hay imagen en el bucket
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
    console.log('Error loading image for product:', product.name, 'URL:', imageUrl)
    // Intentar cargar desde URL alternativa si existe
    if (imageUrl === product.image_file_url && product.image_url && product.image_url.startsWith('http')) {
      console.log('Falling back to external image URL')
      // No marcar como error todavía, intentar la URL alternativa
    } else {
      setImageError(true)
    }
    setImageLoading(false)
  }

  const handleImageLoad = () => {
    console.log('Image loaded successfully for product:', product.name)
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
            {/* Imagen más grande en la parte superior */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button 
                  type="button" 
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
              </DialogTrigger>
              <DialogContent className="max-w-4xl w-[95vw] md:w-auto p-1 sm:p-2 md:p-4">
                {imageUrl && !imageError ? (
                  <div className="relative w-full max-h-[80vh] aspect-auto">
                    <div className="relative w-full h-[60vh] md:h-[70vh]">
                      <Image
                        src={imageUrl}
                        alt={product.name}
                        fill
                        className="object-contain rounded-lg"
                        sizes="(max-width: 1280px) 100vw, 1280px"
                        priority={true}
                        onError={handleImageError}
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 rounded-b text-center text-sm truncate">
                      {product.name}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <ImageIcon className="h-20 w-20 text-gray-400 mb-4" />
                    <p className="text-gray-500">No se pudo cargar la imagen del producto</p>
                    <p className="text-sm text-gray-400 mt-2">{product.name}</p>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            
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
              
              <div className="flex gap-2 mt-auto pt-2">
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