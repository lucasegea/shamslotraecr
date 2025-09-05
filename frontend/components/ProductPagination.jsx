'use client'

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function ProductPagination({ 
  currentPage = 1, 
  totalPages = 1, 
  onPageChange,
  className = ''
}) {
  // No mostrar paginación si no hay más de una página
  if (totalPages <= 1) {
    return null;
  }

  // Validación para asegurarnos de que currentPage es válido
  const validCurrentPage = Math.max(1, Math.min(currentPage, totalPages));

  // Generar números de página a mostrar
  const getPageNumbers = () => {
    // Si hay 5 o menos páginas totales, mostrar todas
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    // Si estamos cerca del principio
    if (validCurrentPage <= 3) {
      return [1, 2, 3, 4, 5];
    }
    
    // Si estamos cerca del final
    if (validCurrentPage >= totalPages - 2) {
      return [
        totalPages - 4, 
        totalPages - 3, 
        totalPages - 2, 
        totalPages - 1, 
        totalPages
      ];
    }
    
    // Si estamos en el medio
    return [
      validCurrentPage - 2,
      validCurrentPage - 1,
      validCurrentPage,
      validCurrentPage + 1,
      validCurrentPage + 2
    ];
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Botón Anterior */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="text-gray-500 hover:text-gray-700 px-2"
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
      </Button>
      
      {/* Números de páginas */}
      <div className="flex gap-1">
        {pageNumbers.map(page => (
          <Button
            key={page}
            variant={currentPage === page ? "default" : "ghost"}
            size="sm"
            onClick={() => onPageChange(page)}
            disabled={currentPage === page}
            className={`min-w-[32px] h-8 ${
              currentPage === page 
                ? 'bg-slate-900 text-white hover:bg-slate-800' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {page}
          </Button>
        ))}
      </div>
      
      {/* Botón Siguiente */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="text-gray-500 hover:text-gray-700 px-2"
      >
        Siguiente <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  )
}
