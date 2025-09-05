'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { X, ImageIcon } from 'lucide-react'

export default function ImageViewer({ isOpen, onClose, imageUrl, alt }) {
  // Asegurar que se monte solo del lado del cliente
  const [isMounted, setIsMounted] = useState(false)
  
  useEffect(() => {
    setIsMounted(true)
    
    // Prevenir el scroll cuando el modal está abierto
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      
      // Manejar la tecla escape
      const handleEscape = (e) => {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', handleEscape)
      
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', handleEscape)
      }
    }
  }, [isOpen, onClose])

  // No renderizar nada del lado del servidor
  if (!isMounted) return null
  
  // No renderizar si no está abierto
  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="relative bg-white max-w-5xl w-[95vw] mx-auto rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute right-2 top-2 z-50 rounded-full bg-white/90 p-1 text-gray-600 shadow-md hover:text-gray-900"
          aria-label="Cerrar"
        >
          <X className="h-6 w-6" />
        </button>
        
        {imageUrl ? (
          <div className="relative w-full">
            <div className="relative w-full h-[60vh] md:h-[70vh]">
              <Image
                src={imageUrl}
                alt={alt || "Imagen del producto"}
                fill
                className="object-contain"
                sizes="(max-width: 1280px) 100vw, 1280px"
                priority={true}
              />
            </div>
            {alt && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 text-center text-sm truncate">
                {alt}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <ImageIcon className="h-20 w-20 text-gray-400 mb-4" />
            <p className="text-gray-500">No se pudo cargar la imagen</p>
          </div>
        )}
      </div>
    </div>
  )
}
