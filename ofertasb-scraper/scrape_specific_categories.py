"""
Script para ejecutar el scraper solamente para las categorías seleccionadas
"""
import subprocess
import os
import sys

def main():
    """
    Ejecuta el scraper para las categorías específicas: 193, 212 y 124
    """
    categories = "193,212,124"
    
    print(f"Ejecutando el scraper para las categorías: {categories}")
    print("-----------------------------------------------")
    
    # Construir el comando
    script_path = os.path.join(os.path.dirname(__file__), "scrape_ofertasb.py")
    command = [sys.executable, script_path, "--categories", categories]
    
    # Ejecutar el comando
    try:
        subprocess.run(command, check=True)
        print("\nScraper completado exitosamente.")
    except subprocess.CalledProcessError as e:
        print(f"\nError al ejecutar el scraper: {str(e)}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
