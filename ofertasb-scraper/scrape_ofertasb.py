import argparse
import hashlib
import os
import time
from typing import Dict, List, Optional
import httpx
from bs4 import BeautifulSoup
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_exponential
from urllib.parse import urljoin

from supabase_client import SupabaseClient
from utils.price import parse_price
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://www.ofertasb.com"
HEADERS = {
    "User-Agent": f"OfertasBScraper/1.0 (Contact: {os.getenv('CONTACT_EMAIL')})"
}

class OfertasBScraper:
    def __init__(self):
        self.supabase = SupabaseClient()
        self.session = httpx.Client(
            timeout=30.0,
            headers=HEADERS,
            follow_redirects=True
        )
        # Cache de productos existentes
        self.existing_products = set()
        
    def _load_existing_products(self, category_id: Optional[str] = None):
        """Carga los external_product_id existentes en la base de datos"""
        try:
            query = self.supabase.client.table("products").select("external_product_id")
            if category_id:
                result = query.eq("category_id", category_id).execute()
            else:
                result = query.execute()
                
            self.existing_products = {str(product['external_product_id']) for product in result.data}
            print(f"Cargados {len(self.existing_products)} productos existentes en cache")
        except Exception as e:
            print(f"Error cargando productos existentes: {str(e)}")
            self.existing_products = set()

    def close(self):
        self.session.close()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def _fetch_page(self, url: str) -> str:
        """Fetch a page with retry logic"""
        response = self.session.get(url)
        response.raise_for_status()
        return response.text

    def get_categories(self) -> List[Dict[str, str]]:
        """Fetch all categories from the main page"""
        html = self._fetch_page(f"{BASE_URL}/productos_cat.asp")
        soup = BeautifulSoup(html, 'html.parser')
        
        categories = []
        select = soup.find('select', {'name': 'id'})
        if not select:
            raise ValueError("Could not find category select element")
            
        print("\nEncontrando categorías disponibles...")
        for option in select.find_all('option'):
            if option.get('value'):
                cat_data = {
                    'external_id': option['value'],
                    'name': option.text.strip(),
                    'source_url': f"{BASE_URL}/productos_cat.asp?id={option['value']}"
                }
                categories.append(cat_data)
                print(f"- Categoría encontrada: {cat_data['name']} (ID: {cat_data['external_id']})")
                
        print(f"\nTotal de categorías encontradas: {len(categories)}\n")
        return categories

    def get_category_pages(self, category_id: str) -> List[str]:
        """Get all pagination URLs for a category"""
        base_url = f"{BASE_URL}/productos_cat.asp?id={category_id}"
        pages = set([base_url])  # Usamos un set para evitar duplicados
        
        def extract_page_links(url):
            html = self._fetch_page(url)
            soup = BeautifulSoup(html, 'html.parser')
            new_links = set()
            
            # Buscar la tabla de paginación (la que no tiene imágenes)
            pagination_table = None
            for table in soup.find_all('table', id='customers'):
                if not table.find('img'):
                    pagination_table = table
                    break
            
            if pagination_table:
                for link in pagination_table.find_all('a'):
                    href = link.get('href', '')
                    if not href:
                        continue
                        
                    text = link.text.strip()
                    full_url = urljoin(BASE_URL, href)
                    
                    # Agregar todos los enlaces numéricos y el "Siguiente"
                    if text.isdigit() or text == "Siguiente":
                        new_links.add(full_url)
            
            return new_links
        
        # Comenzar con la primera página
        pages_to_check = set([base_url])
        checked_pages = set()
        
        print(f"\nBuscando páginas para categoría {category_id}...")
        
        while pages_to_check:
            current_url = pages_to_check.pop()
            if current_url in checked_pages:
                continue
                
            print(f"Analizando página: {current_url}")
            new_pages = extract_page_links(current_url)
            checked_pages.add(current_url)
            pages.update(new_pages)
            
            # Agregar nuevas páginas no revisadas a la cola
            pages_to_check.update(new_pages - checked_pages)
            
            # Pequeña pausa para no sobrecargar el servidor
            time.sleep(0.5)
        
        pages_list = sorted(list(pages))
        print(f"Encontradas {len(pages_list)} páginas para categoría {category_id}")
        return pages_list

    def get_product_details(self, product_id: str) -> Dict:
        """Get detailed product information from the product page"""
        url = f"{BASE_URL}/productos_full.asp?id={product_id}"
        html = self._fetch_page(url)
        soup = BeautifulSoup(html, 'html.parser')
        
        # Buscar la tabla principal que contiene los detalles
        details = {}
        
        # Buscar la imagen de alta calidad
        # Primero buscamos en la tabla principal
        main_content = soup.find('div', {'id': 'content'})
        if main_content:
            img = main_content.find('img', src=lambda x: x and ('upload' in x or 'images' in x))
            if img and img.get('src'):
                # Asegurarnos de que es una URL absoluta
                img_src = img['src']
                if img_src.startswith('/'):
                    details['high_res_image'] = urljoin(BASE_URL, img_src)
                else:
                    details['high_res_image'] = img_src
            
        # Buscar el nombre del producto
        title = soup.find('td', class_='arial16')
        if title:
            name_text = title.get_text(strip=True)
            if name_text:  # Asegurarnos de que no está vacío
                details['full_name'] = name_text
            
        # Buscar precio y otros detalles
        rows = soup.find_all('tr')
        for row in rows:
            # Buscar precio
            if row.find(string=lambda x: x and isinstance(x, str) and 'Precio.' in x):
                price_cell = row.find_all('td')[-1]
                if price_cell and any(symbol in price_cell.text for symbol in ['₡', '¢']):
                    price_raw = price_cell.get_text(strip=True)
                    if price_raw:  # Asegurarnos de que no está vacío
                        details['price_raw'] = price_raw
                        _, price_numeric = parse_price(price_raw)
                        details['price_numeric'] = price_numeric
                    
            # Buscar estado
            if row.find(string='Estado'):
                estado = row.find_all('td')[-1]
                if estado:
                    details['estado'] = estado.get_text(strip=True)
                    
            # Buscar peso
            if row.find(string='Peso Gramos'):
                peso = row.find_all('td')[-1]
                if peso:
                    details['peso'] = peso.get_text(strip=True)
                    
            # Buscar categoría completa
            if row.find(string='Categoria'):
                categoria = row.find_all('td')[-1]
                if categoria:
                    details['categoria_full'] = categoria.get_text(strip=True)
        
        return details

    def process_product_card(self, product_table: BeautifulSoup, category_id: str) -> Dict:
        """Extract product information from a product table and its detail page"""
        try:
            # Primera fila: imagen y enlace
            # El enlace puede estar con o sin la clase 'displayed'
            img_row = product_table.find('tr').find('td').find('a')
            if not img_row:
                raise ValueError("Could not find product link")
                
            # Extraer URL del producto y su ID
            product_url = urljoin(BASE_URL, img_row['href'])
            external_product_id = product_url.split('id=')[-1]
            
            # Si el producto ya existe, lo saltamos
            if external_product_id in self.existing_products:
                print(f"Saltando producto {external_product_id} - ya existe en la base de datos")
                return None
            
            # Obtener imagen de la lista primero
            img_elem = img_row.find('img')
            if not img_elem:
                raise ValueError("Could not find product image")
            list_image = urljoin(BASE_URL, img_elem['src'])
            
            # Obtener detalles completos del producto
            details = self.get_product_details(external_product_id)
            
            # Si no se encontró una imagen de alta calidad, usar la de la lista
            if 'high_res_image' not in details:
                details['high_res_image'] = list_image
            elif details['high_res_image'] == list_image:
                # Si la imagen es la misma que en la lista, intentar buscar una mejor
                alt_img = img_elem.get('src', '').replace('/upload/', '/upload/hq/')
            
            # Usar el nombre de la lista si no se encontró el nombre completo
            if 'full_name' not in details:
                name_cell = product_table.select_one('tr td[colspan="1"]')
                if not name_cell or not name_cell.get_text(strip=True):
                    raise ValueError("Could not find product name")
                details['full_name'] = name_cell.get_text(strip=True)
            
            # Si no se encontró el precio en la página de detalles, usar el de la lista
            if 'price_raw' not in details:
                price_row = product_table.find_all('tr')[2]
                if not price_row:
                    raise ValueError("Could not find price row")
                    
                price_cell = price_row.find('td')
                if not price_cell or not any(symbol in price_cell.text for symbol in ['₡', '¢']):
                    raise ValueError("Could not find price element")
                    
                price_raw = price_cell.text.strip()
                details['price_raw'] = price_raw
                _, price_numeric = parse_price(price_raw)
                details['price_numeric'] = price_numeric
            
            # Asegurarnos de que todos los datos son strings
            hash_components = {
                'id': str(external_product_id),
                'name': str(details['full_name']),
                'price': str(details['price_raw']),
                'image': str(details['high_res_image'])
            }
            
            # Log para debug
            print(f"Hash components for product {external_product_id}:")
            for k, v in hash_components.items():
                print(f"  {k}: {v} (type: {type(v)})")
            
            # Generate hash from components
            hash_data = f"{hash_components['id']}:{hash_components['name']}:{hash_components['price']}:{hash_components['image']}"
            html_hash = hashlib.md5(hash_data.encode('utf-8')).hexdigest()
            
            # Imprimir la URL de la imagen para debug
            print(f"Product {external_product_id} image URL: {details['high_res_image']}")
            
            # Validar y convertir datos
            product_data = {
                "external_product_id": str(external_product_id),
                "product_url": str(product_url),
                "image_url": str(details['high_res_image']),
                "name": str(details['full_name']),
                "price_raw": str(details['price_raw']),
                "price_numeric": float(details['price_numeric']),
                "source_html_hash": str(html_hash),
                "category_id": str(category_id)
            }
            
            # Verificar que tenemos todos los datos necesarios
            if not all(product_data.values()):
                raise ValueError("Missing required product data")
            
            # Agregar campos adicionales si existen
            if 'estado' in details:
                product_data['estado'] = details['estado']
            if 'peso' in details:
                product_data['peso'] = details['peso']
            if 'categoria_full' in details:
                product_data['categoria_full'] = details['categoria_full']
            
            return product_data
        except Exception as e:
            raise ValueError(f"Error processing product: {str(e)}")
        
        # Generate HTML hash
        card_html = str(product_table)
        html_hash = hashlib.md5(card_html.encode('utf-8')).hexdigest()
        
        return {
            "external_product_id": external_product_id,
            "product_url": product_url,
            "image_url": image_url,
            "name": product_name,
            "price_raw": price_raw,
            "price_numeric": price_numeric,
            "source_html_hash": html_hash,
            "category_id": category_id
        }

    def scrape_category(self, category_id: Optional[str] = None):
        """Scrape a single category or all categories"""
        categories = ([c for c in self.get_categories() if c['external_id'] == category_id] 
                     if category_id else self.get_categories())
                     
        # Cargar productos existentes
        self._load_existing_products(category_id)
        
        for category in categories:
            print(f"\nProcesando categoría: {category['name']} ({category['external_id']})")
            
            # Primero contar productos totales
            total_products = 0
            pages = self.get_category_pages(category['external_id'])
            print(f"Encontradas {len(pages)} páginas")
            
            # Contar productos en todas las páginas
            for page_url in pages:
                html = self._fetch_page(page_url)
                soup = BeautifulSoup(html, 'html.parser')
                product_tables = [
                    table for table in soup.find_all('table')
                    if table.get('width') == '200' and table.get('id') == 'customers'
                    and table.find('a') and table.find('img')
                    and len(table.find_all('tr')) >= 3
                ]
                total_products += len(product_tables)
            
            # Actualizar categoría con el conteo de productos
            category['product_count'] = total_products
            print(f"Total de productos en categoría: {total_products}")
            
            # Upsert category con el conteo actualizado
            db_category = self.supabase.upsert_category(category)
            if not db_category:
                print(f"Error al actualizar categoría {category['external_id']}")
                continue
            
            products_processed = 0
            products_updated = 0
            
            for page_url in pages:
                print(f"Processing page: {page_url}")
                html = self._fetch_page(page_url)
                soup = BeautifulSoup(html, 'html.parser')
                
                # Buscar las tablas que contienen los productos
                # La estructura es:
                # 1. Tabla principal
                # 2. tr > td > tabla grande
                # 3. tr > td > tabla de producto individual
                product_tables = []
                
                # Buscar las tablas de productos que tienen una imagen y un enlace
                for table in soup.find_all('table'):
                    # Las tablas de productos tienen un ancho fijo
                    if table.get('width') == '200' and table.get('id') == 'customers':
                        # Verificar que contiene los elementos esperados
                        if (table.find('a') and 
                            table.find('img') and 
                            len(table.find_all('tr')) >= 3):  # Al menos 3 filas (imagen, nombre, precio)
                            product_tables.append(table)
                
                if not product_tables:
                    print(f"Warning: No product tables found on page {page_url}")
                    continue
                    
                print(f"Found {len(product_tables)} valid product tables on page")
                    
                print(f"Found {len(product_tables)} products on page")
                
                print(f"Encontrados {len(product_tables)} productos en esta página")
                
                for idx, product_table in enumerate(product_tables, 1):
                    try:
                        print(f"\nProcesando producto {idx}/{len(product_tables)}")
                        product_data = self.process_product_card(product_table, db_category['id'])
                        
                        if not product_data:
                            print("Warning: Could not process product card")
                            continue
                            
                        # Download and upload image if needed
                        if product_data.get('image_url'):
                            try:
                                print(f"Downloading image from: {product_data['image_url']}")
                                image_resp = self.session.get(product_data['image_url'])
                                
                                if image_resp.status_code != 200:
                                    print(f"Warning: Image download failed with status {image_resp.status_code}")
                                    continue
                                    
                                if not image_resp.content:
                                    print(f"Warning: Empty image content received")
                                    continue
                                    
                                # Verificar que tenemos datos de imagen válidos
                                if not isinstance(image_resp.content, bytes):
                                    print(f"Warning: Invalid image data type: {type(image_resp.content)}")
                                    continue
                                
                                # Verificar que la imagen tiene un tamaño razonable
                                content_length = len(image_resp.content)
                                if content_length < 100:  # Muy pequeña para ser una imagen válida
                                    print(f"Warning: Image content too small ({content_length} bytes)")
                                    continue
                                    
                                print(f"Uploading image for product {product_data['external_product_id']} ({content_length} bytes)")
                                image_file_url = self.supabase.upload_product_image(
                                    category['external_id'],
                                    product_data['external_product_id'],
                                    image_resp.content
                                )
                                
                                if image_file_url:
                                    product_data['image_file_url'] = str(image_file_url)
                                else:
                                    print(f"Warning: Could not get image URL for product {product_data['external_product_id']}")
                            except Exception as img_e:
                                print(f"Warning: Could not process image for product {product_data.get('external_product_id')}: {str(img_e)}")
                        
                        # Upsert product
                        result = self.supabase.upsert_product(product_data)
                        if result:
                            products_processed += 1
                            if result.get('updated_at'):
                                products_updated += 1
                                
                    except Exception as e:
                        print(f"Error processing product: {str(e)}")
                
                # Rate limiting
                time.sleep(1)
            
            print(f"Category complete. Processed: {products_processed}, Updated: {products_updated}")

def main():
    parser = argparse.ArgumentParser(description='Scrape OfertasB products')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--all', action='store_true', help='Scrape all categories')
    group.add_argument('--category', type=str, help='Scrape specific category ID')
    
    args = parser.parse_args()
    
    scraper = OfertasBScraper()
    try:
        if args.all:
            scraper.scrape_category()
        else:
            scraper.scrape_category(args.category)
    finally:
        scraper.close()

if __name__ == "__main__":
    main()
