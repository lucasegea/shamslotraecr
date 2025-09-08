'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { X, ImageIcon } from 'lucide-react'

export default function ImageViewer({ isOpen, onClose, imageUrl, alt }) {
  // Asegurar que se monte solo del lado del cliente
  const [isMounted, setIsMounted] = useState(false)
  
  useEffect(() => {
    setIsMounted(true)
  }, [])
  
  useEffect(() => {
    // Prevenir el scroll cuando el modal está abierto
    if (isOpen && isMounted) {
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
  }, [isOpen, onClose, isMounted])

  // No renderizar nada del lado del servidor
  if (!isMounted) return null
  
  // No renderizar si no está abierto
  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black bg-opacity-80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999
      }}
    >
      <div 
        className="relative bg-white max-w-4xl w-[90vw] max-h-[90vh] mx-auto rounded-lg overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 z-[100000] rounded-full bg-white bg-opacity-90 p-2 text-gray-600 shadow-lg hover:text-gray-900 hover:bg-opacity-100 transition-all"
          aria-label="Cerrar"
        >
          <X className="h-6 w-6" />
        </button>
        
        {imageUrl ? (
          <div className="relative w-full">
            <div className="relative w-full h-[70vh]">
              <Image
                src={imageUrl}
                alt={alt || "Imagen del producto"}
                fill
                className="object-contain"
                sizes="90vw"
                priority={true}
                onError={() => {}}
                onLoad={() => {}}
              />
            </div>
            {alt && (
              <div className="bg-gray-100 px-4 py-3 text-center text-sm text-gray-700">
                {alt}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <ImageIcon className="h-20 w-20 text-gray-400 mb-4" />
            <p className="text-gray-500 text-lg">No se pudo cargar la imagen</p>
          </div>
        )}
      </div>
    </div>
  )
}
