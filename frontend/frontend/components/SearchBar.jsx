'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SearchBar({ onSearch, searchTerm, placeholder = "Buscar productos..." }) {
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm || '')

  const handleSearch = (e) => {
    e.preventDefault()
    onSearch(localSearchTerm.trim())
  }

  const handleClear = () => {
    setLocalSearchTerm('')
    onSearch('')
  }

  return (
    <motion.form 
      onSubmit={handleSearch}
      className="relative max-w-md w-full"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        
        <Input
          type="text"
          placeholder={placeholder}
          value={localSearchTerm}
          onChange={(e) => setLocalSearchTerm(e.target.value)}
          className={cn(
            "pl-10 pr-20 bg-card/50 border-border/50 focus:border-primary/50 transition-all duration-200",
            "placeholder:text-muted-foreground/70"
          )}
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
          
          <Button 
            type="submit"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={!localSearchTerm.trim()}
          >
            Buscar
          </Button>
        </div>
      </div>
    </motion.form>
  )
}