'use client'

import React, { useState, useContext, useMemo } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, ImageIcon, Maximize2 } from 'lucide-react'
// (formatPrice no se usa directamente aquí para evitar confusiones de logs)
import { logProductPriceData, getPriceToDisplay, formatPriceConsistently } from '@/lib/price-debug'
import { ImageViewerContext } from '@/app/page'

function ProductCard({ product, onAddToCart }) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  // Nota: no hacemos fetch por tarjeta; el precio final se valida al "Agregar al carrito" en el nivel superior
  
  // Usar el contexto del visor de imágenes global
  const { openImageViewer } = useContext(ImageViewerContext)
  
  // Enfoque simplificado para obtener la URL de imagen
  const imageUrl = useMemo(() => {
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
  }, [imageError, product?.image_file_url, product?.image_url])
  
  // Sin logs en producción
  logProductPriceData(product, 'ProductCard v2');

  const fpCandidate = product?.final_price
  let finalPriceValue = 0;
  if (typeof fpCandidate === 'number' && isFinite(fpCandidate)) {
    finalPriceValue = fpCandidate;
  } else if (typeof fpCandidate === 'string') {
    const cleaned = fpCandidate.replace(/[^\d.-]/g, '');
    const num = Number(cleaned);
    if (!isNaN(num) && isFinite(num)) finalPriceValue = num;
  } else {
    finalPriceValue = getPriceToDisplay(product);
  }
  // Formateo final para UI
  const formattedPrice = useMemo(() => formatPriceConsistently(finalPriceValue), [finalPriceValue]);
  
  const handleAddToCart = () => {
    // Disparamos sparkles sutiles y minimalistas
    triggerSparkles()
    if (onAddToCart) onAddToCart(product, quantity)
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

  // Sparkles minimalistas al presionar "Agregar al Carrito"
  const [bursts, setBursts] = useState([])
  const triggerSparkles = () => {
    const id = Math.random().toString(36).slice(2)
    // Partículas un poco más visibles y arcoíris
    const count = 9
    const colors = [
      '#EF4444', // red-500
      '#F97316', // orange-500
      '#F59E0B', // amber-500
      '#EAB308', // yellow-500
      '#84CC16', // lime-500
      '#22C55E', // green-500
      '#06B6D4', // cyan-500
      '#3B82F6', // blue-500
      '#8B5CF6', // violet-500
      '#EC4899', // pink-500
    ]
    const glyphs = ['✦', '✧', '❖', '•']
    const particles = Array.from({ length: count }, (_, i) => {
      // Abanico un poco más amplio y distancia mayor para que suban más
      const angle = (Math.PI / 2.5) * (i / (count - 1)) - Math.PI / 5 // ~[-36°, +36°]
      const dist = 30 + Math.random() * 35 // 30–65px
      const dx = Math.cos(angle) * dist
      const dy = Math.sin(angle) * dist
      const delay = Math.random() * 0.07
      const color = colors[i % colors.length]
      const rotate = (Math.random() * 40 - 20)
      const char = glyphs[i % glyphs.length]
      return { dx, dy: Math.abs(dy), delay, color, rotate, char }
    })
    setBursts((prev) => [...prev, { id, particles }])
    // Limpiar burst luego de la animación
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id))
    }, 900)
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
                
                <div className="relative">
                  {/* Botón */}
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

                  {/* Sparkles overlay */}
                  <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {bursts.map((b) => (
                      <React.Fragment key={b.id}>
                        {b.particles.map((p, idx) => (
                          <motion.span
                            key={`${b.id}-${idx}`}
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
                            initial={{ x: 0, y: 0, scale: 0.7, opacity: 1, rotate: 0 }}
                            animate={{ x: p.dx, y: -p.dy * 1.7, scale: 1.15, opacity: 0, rotate: p.rotate }}
                            transition={{ duration: 0.8, ease: 'easeOut', delay: p.delay }}
                          >
                            <span
                              className="block leading-none"
                              style={{ color: p.color, fontSize: 12, filter: 'drop-shadow(0 1px 0.5px rgba(0,0,0,0.25))' }}
                            >
                              {p.char}
                            </span>
                          </motion.span>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default React.memo(ProductCard)
