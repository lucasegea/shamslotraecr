'use client'

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SearchBar({ onSearch, searchTerm, placeholder = "Buscar productos..." }) {
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm || '')
  const [debounceTimeout, setDebounceTimeout] = useState(null)
  const inputRef = useRef(null); // Referencia para el input

  // Función para manejar el foco en el campo de búsqueda
  const focusSearchField = () => {
    if (inputRef && inputRef.current) {
      inputRef.current.focus();
      
      // Para un textarea, seleccionar todo el texto es más simple
      if (inputRef.current.select) {
        // Pequeño tiempo de espera para garantizar que el focus ha ocurrido
        setTimeout(() => inputRef.current.select(), 10);
      }
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    // Prevenir el comportamiento por defecto del formulario
  }

  const handleClear = () => {
    setLocalSearchTerm('')
    onSearch('')
    
    // Reenfoque el campo después de limpiar
    setTimeout(focusSearchField, 10);
  }

  return (
    <motion.div 
  className="relative max-w-md w-full"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={focusSearchField}
    >
      <div className="relative">
  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        
        {/* Volver a un input nativo pero con un envoltorio para personalizar eventos */}
  <textarea
          ref={inputRef}
          value={localSearchTerm}
          onChange={(e) => {
            const newValue = e.target.value;
            setLocalSearchTerm(newValue);
            
            // Ejecutar la búsqueda con debounce
            if (debounceTimeout) clearTimeout(debounceTimeout);
            const timeout = setTimeout(() => onSearch(newValue), 300);
            setDebounceTimeout(timeout);
          }}
          placeholder={placeholder}
          className={cn(
            "flex h-9 sm:h-10 w-full rounded-lg sm:rounded-xl border border-input bg-background pl-10 pr-12 py-2 text-sm resize-none",
            "bg-card/50 border-border/50 focus:border-primary/50 transition-all duration-200",
            "placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30",
            "[&::selection]:bg-sky-300 [&::selection]:text-sky-900" // Selección celeste con texto en azul oscuro
          )}
          style={{ overflow: 'hidden', userSelect: 'text' }}
          onClick={(e) => e.target.select()}
          rows={1}
        />
        
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
          {localSearchTerm && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-muted"
              onClick={handleClear}
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Limpiar búsqueda</span>
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}