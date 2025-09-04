"""
Script para scrapear los productos sin categoría de OfertasB
Este script:
1. Crea una categoría "Sin categoría" en Supabase
2. Recorre todas las páginas de productos
3. Identifica productos "sin categoría"
4. Cuenta el total de productos y actualiza la base de datos
"""
import os
import time
import re
import sys
import random
import argparse
import httpx
import tqdm
from typing import Dict, List, Any, Optional
from bs4 import BeautifulSoup
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Constantes
BASE_URL = "https://www.ofertasb.com"
SLEEP_MIN = 1.0  # Tiempo mínimo de espera entre solicitudes (segundos)
SLEEP_MAX = 2.0  # Tiempo máximo de espera entre solicitudes (segundos)
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"

class UncategorizedScraper:
    def __init__(self):
        """Inicializar el scraper y la conexión a Supabase"""
        print("Inicializando scraper...")
        
        # Inicializar la sesión HTTP con timeout y reintentos
        self.session = httpx.Client(
            timeout=30.0,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True
        )
        
        # Inicializar conexión a Supabase
        self.setup_supabase()
        
        # Mapeo para IDs internos de categorías
        self.category_map = {}
        
        # Cache de productos existentes para evitar duplicados
        self.existing_products = {}
        
        # Estadísticas
        self.stats = {
            "total_products": 0,
            "uncategorized_products": 0,
            "new_products": 0,
            "existing_products": 0,
            "errors": 0
        }
    
    def setup_supabase(self):
        """Configurar la conexión a Supabase"""
        try:
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            
            if not url or not key:
                raise ValueError("Las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas")
            
            self.supabase = create_client(url, key)
            print("✅ Conexión a Supabase establecida")
            
        except Exception as e:
            print(f"❌ Error al conectar con Supabase: {str(e)}")
            sys.exit(1)

    def create_uncategorized_category(self):
        """Crear la categoría 'Sin categoría' si no existe"""
        try:
            # Verificar si ya existe la categoría
            result = self.supabase.table("categories").select("*").eq("name", "Sin categoría").execute()
            
            if result.data:
                print(f"✅ La categoría 'Sin categoría' ya existe con ID: {result.data[0]['id']}")
                uncategorized_category = result.data[0]
            else:
                # Crear la categoría
                category_data = {
                    "external_id": "uncategorized",
                    "name": "Sin categoría",
                    "source_url": f"{BASE_URL}/productos_cat.asp",
                    "last_crawled_at": datetime.utcnow().isoformat(),
                    "seller_id": 1
                }
                
                result = self.supabase.table("categories").insert(category_data).execute()
                
                if not result.data:
                    raise ValueError("Error al crear la categoría 'Sin categoría'")
                
                uncategorized_category = result.data[0]
                print(f"✅ Categoría 'Sin categoría' creada con ID: {uncategorized_category['id']}")
            
            # Guardar la referencia a la categoría
            self.uncategorized_category = uncategorized_category
            return uncategorized_category
            
        except Exception as e:
            print(f"❌ Error creando la categoría 'Sin categoría': {str(e)}")
            sys.exit(1)
    
    def load_categories_map(self):
        """Cargar mapa de IDs externos a IDs internos de categorías"""
        try:
            result = self.supabase.table("categories").select("id, external_id, name").execute()
            
            if not result.data:
                print("⚠️ No se encontraron categorías en la base de datos")
                return {}
            
            # Crear el mapa de IDs
            self.category_map = {
                category["external_id"]: {
                    "id": category["id"],
                    "name": category["name"]
                }
                for category in result.data
            }
            
            print(f"✅ Se cargaron {len(self.category_map)} categorías")
            return self.category_map
            
        except Exception as e:
            print(f"❌ Error cargando categorías: {str(e)}")
            return {}
    
    def load_existing_products(self):
        """Cargar productos existentes para evitar duplicados"""
        try:
            print("Cargando productos existentes...")
            result = self.supabase.table("products").select("external_product_id").execute()
            
            if not result.data:
                print("⚠️ No se encontraron productos existentes")
                return {}
            
            self.existing_products = {str(product["external_product_id"]): True for product in result.data}
            print(f"✅ Se cargaron {len(self.existing_products)} productos existentes")
            return self.existing_products
            
        except Exception as e:
            print(f"❌ Error cargando productos existentes: {str(e)}")
            return {}
    
    def fetch_page(self, url):
        """Obtener el contenido de una página con manejo de errores y esperas"""
        try:
            # Esperar un tiempo aleatorio para ser amigable con el servidor
            sleep_time = random.uniform(SLEEP_MIN, SLEEP_MAX)
            time.sleep(sleep_time)
            
            response = self.session.get(url)
            response.raise_for_status()
            return response.text
            
        except Exception as e:
            print(f"❌ Error obteniendo la página {url}: {str(e)}")
            return None
    
    def get_total_pages(self):
        """Obtener el número total de páginas de productos"""
        try:
            html = self.fetch_page(f"{BASE_URL}/productos_cat.asp")
            if not html:
                return 0
                
            soup = BeautifulSoup(html, 'html.parser')
            
            # Buscar links de paginación
            pagination_links = soup.find_all("a", href=lambda href: href and "productos_cat.asp" in href and "pagina=" in href)
            
            max_page = 1
            for link in pagination_links:
                href = link.get("href", "")
                match = re.search(r"pagina=(\d+)", href)
                if match:
                    page_num = int(match.group(1))
                    if page_num > max_page:
                        max_page = page_num
            
            print(f"✅ Total de páginas detectadas: {max_page}")
            return max_page
            
        except Exception as e:
            print(f"❌ Error detectando número de páginas: {str(e)}")
            return 0
    
    def extract_product_links(self, page_html):
        """Extraer links a productos individuales de una página"""
        try:
            soup = BeautifulSoup(page_html, 'html.parser')
            
            # Buscar enlaces a productos
            product_links = []
            for a_tag in soup.find_all("a", href=lambda href: href and "productos_det.asp" in href):
                href = a_tag.get("href", "")
                if href.startswith("/"):
                    href = f"{BASE_URL}{href}"
                else:
                    href = f"{BASE_URL}/{href}"
                
                product_links.append(href)
            
            return list(set(product_links))  # Eliminar duplicados
            
        except Exception as e:
            print(f"❌ Error extrayendo enlaces de productos: {str(e)}")
            return []
    
    def process_product_page(self, url):
        """Procesar la página de un producto individual"""
        try:
            html = self.fetch_page(url)
            if not html:
                self.stats["errors"] += 1
                return None
                
            soup = BeautifulSoup(html, 'html.parser')
            
            # Extraer ID del producto
            product_id = None
            if "id=" in url:
                product_id = url.split("id=")[1].split("&")[0]
            
            if not product_id:
                print(f"⚠️ No se pudo determinar el ID del producto para {url}")
                self.stats["errors"] += 1
                return None
            
            # Verificar si ya existe
            if product_id in self.existing_products:
                self.stats["existing_products"] += 1
                print(f"✅ Producto {product_id} ya existe en la base de datos")
                return None
            
            # Extraer nombre del producto
            name_elem = soup.find("h1")
            name = name_elem.text.strip() if name_elem else "Producto sin nombre"
            
            # Extraer precio
            price_raw = None
            price_numeric = None
            currency = "CRC"  # Por defecto, colones costarricenses
            
            price_elem = soup.find("div", class_="price")
            if price_elem:
                price_raw = price_elem.text.strip()
                # Extraer valor numérico
                price_match = re.search(r'[\d\.,]+', price_raw)
                if price_match:
                    price_str = price_match.group(0).replace(".", "").replace(",", ".")
                    try:
                        price_numeric = float(price_str)
                    except ValueError:
                        price_numeric = None
            
            # Extraer imagen
            image_url = None
            main_content = soup.find('div', {'id': 'content'})
            if main_content:
                img = main_content.find('img', src=lambda x: x and ('upload' in x or 'images' in x))
                if img and img.get('src'):
                    image_url = img['src']
                    if image_url.startswith('/'):
                        image_url = f"{BASE_URL}{image_url}"
                    elif not image_url.startswith('http'):
                        image_url = f"{BASE_URL}/{image_url}"
            
            # Verificar si tiene "sin categoría" en el contenido
            is_uncategorized = False
            category_info = soup.find("td", string="Categoría")
            
            category_id = None
            if category_info:
                category_value = category_info.find_next_sibling("td")
                if category_value:
                    category_text = category_value.text.strip().lower()
                    if "sin categoría" in category_text or "sin categoria" in category_text:
                        is_uncategorized = True
                    
                    # Intentar extraer el ID de categoría de la URL si existe
                    category_link = category_value.find("a", href=lambda href: href and "productos_cat.asp" in href)
                    if category_link:
                        href = category_link.get("href", "")
                        match = re.search(r"id=(\d+)", href)
                        if match:
                            category_id = match.group(1)
            
            # Si no se encontró categoría, marcar como sin categoría
            if not category_id:
                is_uncategorized = True
            
            # Crear datos del producto
            product_data = {
                "external_product_id": product_id,
                "name": name,
                "product_url": url,
                "image_url": image_url,
                "price_raw": price_raw,
                "price_numeric": price_numeric,
                "currency": currency,
                "first_seen_at": datetime.utcnow().isoformat(),
                "last_seen_at": datetime.utcnow().isoformat(),
                "seller_id": 1,
                "source_html": html,  # Guardar HTML completo para procesamiento futuro
            }
            
            # Asignar categoría
            if is_uncategorized:
                product_data["category_id"] = self.uncategorized_category["id"]
                self.stats["uncategorized_products"] += 1
                print(f"🔍 Producto {product_id} marcado como 'Sin categoría'")
            elif category_id and category_id in self.category_map:
                product_data["category_id"] = self.category_map[category_id]["id"]
                print(f"✅ Producto {product_id} asignado a categoría: {self.category_map[category_id]['name']}")
            else:
                product_data["category_id"] = self.uncategorized_category["id"]
                self.stats["uncategorized_products"] += 1
                print(f"🔍 Producto {product_id} sin categoría reconocida, asignado a 'Sin categoría'")
            
            # Actualizar estadísticas
            self.stats["total_products"] += 1
            self.stats["new_products"] += 1
            
            return product_data
            
        except Exception as e:
            print(f"❌ Error procesando producto {url}: {str(e)}")
            self.stats["errors"] += 1
            return None
    
    def save_product(self, product_data):
        """Guardar un producto en Supabase"""
        if not product_data:
            return False
            
        try:
            # Quitar el HTML completo para el upsert (lo guardamos separado)
            html_content = product_data.pop("source_html", None)
            
            # Insertar el producto
            result = self.supabase.table("products").insert(product_data).execute()
            
            if not result.data:
                print(f"❌ Error guardando producto {product_data.get('external_product_id')}")
                return False
                
            # Marcar como existente en nuestro cache
            self.existing_products[product_data["external_product_id"]] = True
            
            return True
            
        except Exception as e:
            print(f"❌ Error guardando producto {product_data.get('external_product_id')}: {str(e)}")
            return False
    
    def run(self):
        """Ejecutar el scraper completo"""
        try:
            # Crear categoría "Sin categoría"
            self.create_uncategorized_category()
            
            # Cargar mapeo de categorías
            self.load_categories_map()
            
            # Cargar productos existentes
            self.load_existing_products()
            
            # Obtener el número total de páginas
            total_pages = self.get_total_pages()
            if total_pages == 0:
                print("❌ No se pudieron detectar las páginas. Abortando.")
                return
            
            # Configurar barra de progreso para las páginas
            page_progress = tqdm.tqdm(total=total_pages, desc="Procesando páginas", unit="página")
            
            # Procesar cada página
            for page_num in range(1, total_pages + 1):
                page_url = f"{BASE_URL}/productos_cat.asp?pagina={page_num}"
                print(f"\nProcesando página {page_num}/{total_pages}: {page_url}")
                
                page_html = self.fetch_page(page_url)
                if not page_html:
                    page_progress.update(1)
                    continue
                
                # Extraer links a productos
                product_links = self.extract_product_links(page_html)
                print(f"🔍 Encontrados {len(product_links)} productos en página {page_num}")
                
                # Procesar cada producto
                product_progress = tqdm.tqdm(total=len(product_links), desc=f"Productos en página {page_num}", unit="producto")
                
                for product_url in product_links:
                    # Procesar producto
                    product_data = self.process_product_page(product_url)
                    
                    # Guardar si es válido
                    if product_data:
                        self.save_product(product_data)
                    
                    product_progress.update(1)
                
                product_progress.close()
                page_progress.update(1)
            
            page_progress.close()
            
            # Mostrar estadísticas finales
            print("\n📊 ESTADÍSTICAS FINALES")
            print(f"Total de productos procesados: {self.stats['total_products']}")
            print(f"Productos nuevos: {self.stats['new_products']}")
            print(f"Productos ya existentes: {self.stats['existing_products']}")
            print(f"Productos sin categoría: {self.stats['uncategorized_products']}")
            print(f"Errores: {self.stats['errors']}")
            
        except Exception as e:
            print(f"❌ Error general en el scraper: {str(e)}")
    
    def close(self):
        """Cerrar la sesión y liberar recursos"""
        if hasattr(self, 'session'):
            self.session.close()

def main():
    """Función principal"""
    parser = argparse.ArgumentParser(description="Scrapear productos sin categoría de OfertasB")
    parser.add_argument("--limit", type=int, help="Límite de páginas a procesar (para pruebas)")
    args = parser.parse_args()
    
    scraper = UncategorizedScraper()
    
    try:
        scraper.run()
    finally:
        scraper.close()

if __name__ == "__main__":
    main()
