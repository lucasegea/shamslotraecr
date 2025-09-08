'use client'

import { useState, useContext, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, ImageIcon, Maximize2 } from 'lucide-react'
// (formatPrice no se usa directamente aquí para evitar confusiones de logs)
import { logProductPriceData, getPriceToDisplay, formatPriceConsistently } from '@/lib/price-debug'
import { supabase } from '@/lib/supabase'
import { ImageViewerContext } from '@/app/page'

export default function ProductCard({ product, onAddToCart }) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [liveProduct, setLiveProduct] = useState(product)

  // Obtener el producto más actualizado como hace el carrito
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
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
          .single()

        if (!error && data && active) {
          setLiveProduct(prev => ({ ...prev, ...data }))
        } else if (error) {
          // swallow
        }
      } catch (err) {
        // swallow
      }
    })()
    return () => { active = false }
  }, [product?.id])
  
  // Usar el contexto del visor de imágenes global
  const { openImageViewer } = useContext(ImageViewerContext)
  
  // Enfoque simplificado para obtener la URL de imagen
  const getImageUrl = () => {
    if (imageError) return null
    
    // Lista de posibles URLs en orden de prioridad
    const possibleUrls = []
    
    // 1. Si tiene image_file_url, intentar construir URL de Supabase
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
    
    // 2. Si tiene image_url, agregarlo como fallback
    if (product.image_url) {
      const extUrl = String(product.image_url).trim()
      if (extUrl && extUrl.startsWith('http')) {
        possibleUrls.push({ type: 'external_url', url: extUrl })
      }
    }
    
    if (possibleUrls.length > 0) {
      const selected = possibleUrls[0]
      return selected.url
    }
    return null
  }

  const imageUrl = getImageUrl()
  
  // Sin logs en producción
  logProductPriceData(product, 'ProductCard v2');

  const fpCandidate = (liveProduct?.final_price ?? product?.final_price);
  let finalPriceValue = 0;
  if (typeof fpCandidate === 'number' && isFinite(fpCandidate)) {
    finalPriceValue = fpCandidate;
  } else if (typeof fpCandidate === 'string') {
    const cleaned = fpCandidate.replace(/[^\d.-]/g, '');
    const num = Number(cleaned);
    if (!isNaN(num) && isFinite(num)) finalPriceValue = num;
  } else {
    finalPriceValue = getPriceToDisplay(liveProduct ?? product);
  }
  // Formateo final para UI
  const formattedPrice = formatPriceConsistently(finalPriceValue);
  
  const handleAddToCart = () => {
    if (onAddToCart) {
      onAddToCart(liveProduct ?? product, quantity)
    }
  }
  
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
      className="group h-full"
    >
      <Card className="overflow-hidden border-gray-200 hover:border-blue-300 transition-all duration-300 hover:shadow-lg bg-white h-full flex flex-col isolate">
  <CardContent className="p-2.5 sm:p-4 flex flex-col h-full relative">
          <div className="flex flex-col gap-3 h-full isolate">
            {/* Imagen más grande en la parte superior */}
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
            <div className="flex-1 flex flex-col justify-between space-y-2">
              <div className="mb-1">
                <h3 className="font-semibold text-gray-900 line-clamp-2 text-balance leading-tight text-[13px] sm:text-sm">
                  {product.name}
                </h3>
              </div>
              
              <div>
                <p className="text-[15px] sm:text-base font-bold text-blue-600 mb-0.5">
                  {formattedPrice}
                </p>
                
                {product.currency && (
                  <Badge className="text-xs bg-gray-100 text-gray-700 border-gray-200 mt-1">
                    {product.currency}
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-col gap-2 mt-auto pt-2">
        <div className="flex items-center justify-center gap-1">
                  <button 
                    onClick={decrementQuantity}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700"
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
                    className="w-10 h-7 sm:w-12 sm:h-8 text-center text-sm font-semibold border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 selection:bg-cyan-200"
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
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center text-white"
                    type="button"
                    aria-label="Aumentar cantidad"
                  >
                    <span className="text-sm font-bold">+</span>
                  </button>
                </div>
                
                <motion.button
                  onClick={handleAddToCart}
                  className="w-full h-9 sm:h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center justify-center gap-1.5 text-sm"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  animate={{
                    rotate: [0, -1, 1, -1, 0],
                    transition: {
                      duration: 0.4,
                      repeat: 0,
                      ease: "easeInOut",
                    }
                  }}
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span className="whitespace-nowrap text-sm">Agregar al Carrito</span>
                </motion.button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
