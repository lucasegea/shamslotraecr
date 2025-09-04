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
import tqdm  # Asegúrate de tener tqdm instalado para la barra de progreso
import logging

from supabase_client import SupabaseClient
from utils.price import parse_price
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://www.ofertasb.com"
HEADERS = {
    "User-Agent": f"OfertasBScraper/1.0 (Contact: {os.getenv('CONTACT_EMAIL')})"
}

# Configurar el logger para guardar en un archivo
logging.basicConfig(
    filename='scraper_log.txt',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class OfertasBScraper:
    def __init__(self):
        self.supabase = SupabaseClient()
        self.session = httpx.Client(
            timeout=30.0,
            headers=HEADERS,
            follow_redirects=True
        )
        # Cache de productos existentes
        self.existing_products = {}
        
    def _load_existing_products(self, category_id: Optional[str] = None):
        """Carga los external_product_id y source_html_hash existentes en la base de datos"""
        try:
            query = self.supabase.client.table("products").select("external_product_id,source_html_hash")
            if category_id:
                query = query.eq("category_id", category_id)

            # Establecer un límite alto para asegurarnos de obtener todos los productos
            query = query.limit(100000)
            result = query.execute()

            # Almacenar solo los hashes como valores
            self.existing_products = {
                product['external_product_id']: str(product['source_html_hash'])
                for product in result.data if product.get('source_html_hash')
            }
            print(f"Cargados {len(self.existing_products)} productos existentes en cache")
        except Exception as e:
            print(f"Error cargando productos existentes: {str(e)}")
            self.existing_products = {}

    def close(self):
        self.session.close()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def _fetch_page(self, url: str) -> str:
        """Fetch a page with retry logic"""
        try:
            response = self.session.get(url)
            response.raise_for_status()
            return response.text
        except httpx.HTTPStatusError as e:
            print(f"Error al obtener la página: {url}")
            print(f"Código de estado HTTP: {response.status_code}")
            print(f"Contenido de la respuesta: {response.text[:500]}...")  # Limitar el contenido para depuración
            raise e

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

    def fetch_categories(self) -> List[Dict]:
        """Fetch all categories from the main page"""
        try:
            url = urljoin(BASE_URL, "productos_cat.asp")
            page_content = self._fetch_page(url)
            print(page_content[:500])  # Imprimir parte del contenido para depuración
            soup = BeautifulSoup(page_content, "html.parser")
            categories = []

            # Buscar el elemento <select> que contiene las categorías
            category_select = soup.find("select")  # Ajustar para buscar cualquier <select>
            if not category_select:
                raise ValueError("No se encontró el formulario de categorías")

            # Extraer las opciones dentro del <select>
            for option in category_select.find_all("option"):
                if option.get("value"):
                    categories.append({
                        "name": option.get_text(strip=True),
                        "external_id": option["value"],
                        "url": f"{BASE_URL}/productos_cat.asp?id={option['value']}"
                    })

            print(f"Categorías encontradas: {len(categories)}")
            return categories
        except Exception as e:
            print(f"Error fetching categories: {str(e)}")
            return []

    def get_category_pages(self, category_id: str) -> List[str]:
        """Get all pagination URLs for a category"""
        base_url = f"{BASE_URL}/productos_cat.asp?id={category_id}"
        pages = set([base_url])  # Usamos un set para evitar duplicados
        
        def extract_page_links(url):
            try:
                html = self._fetch_page(url)
                soup = BeautifulSoup(html, 'html.parser')
                new_links = set()
                
                # Método 1: Buscar la tabla de paginación (la que no tiene imágenes)
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
                        # También capturamos "Siguiente" para asegurar la navegación completa
                        if text.isdigit() or text == "Siguiente":
                            print(f"Encontrado enlace de paginación: {text} -> {full_url}")
                            new_links.add(full_url)
                
                # Método 2: Usar selectores CSS específicos para buscar enlaces de paginación
                # Esto proporciona una capa adicional de robustez
                pagination_links = soup.select(f"a[href*='productos_cat.asp?id={category_id}&pagina=']")
                for link in pagination_links:
                    href = link.get("href")
                    if href:
                        full_url = urljoin(BASE_URL, href)
                        new_links.add(full_url)
                
                # Método 3: Buscar cualquier enlace que contenga la palabra "pagina="
                pagination_links = soup.select("a[href*='pagina=']")
                for link in pagination_links:
                    href = link.get("href")
                    # Verificar que el enlace pertenece a la misma categoría
                    if href and f"id={category_id}" in href:
                        full_url = urljoin(BASE_URL, href)
                        new_links.add(full_url)
                
                # Método 4: Detectar específicamente los enlaces numéricos y "Siguiente" que pueden tener formato especial
                # como los que aparecen en la imagen: <1>, <2>, etc.
                for link in soup.find_all('a'):
                    href = link.get('href', '')
                    if not href or 'productos_cat.asp' not in href:
                        continue
                    
                    # Verificar si es un enlace de página numérico o "Siguiente"
                    text = link.text.strip()
                    if text == "Siguiente" or text.isdigit() or (text.startswith('<') and text.endswith('>') and text[1:-1].isdigit()):
                        # Asegurarnos que pertenece a la categoría correcta
                        if f"id={category_id}" in href:
                            full_url = urljoin(BASE_URL, href)
                            print(f"Detectado enlace de navegación: '{text}' -> {full_url}")
                            new_links.add(full_url)
                
                # Si hay un enlace "Siguiente", lo registramos específicamente
                siguiente_link = soup.find('a', string="Siguiente")
                if siguiente_link and siguiente_link.get('href'):
                    siguiente_url = urljoin(BASE_URL, siguiente_link['href'])
                    if siguiente_url not in new_links:
                        print(f"Enlace 'Siguiente' encontrado: {siguiente_url}")
                        new_links.add(siguiente_url)
                
                return new_links
            except Exception as e:
                print(f"Error extrayendo enlaces de paginación de {url}: {str(e)}")
                return set()
        
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

    def fetch_category_pages(self, category_url: str, category_id: str):
        """Fetch all pages for a given category and process products."""
        try:
            # Validar que category_id esté presente
            if not category_id:
                raise ValueError("category_id is required")

            # Usar el método get_category_pages que es más robusto para encontrar todas las páginas
            # ya que implementa una búsqueda recursiva de enlaces de paginación
            pages = self.get_category_pages(category_id)
            
            if not pages:
                # Como respaldo, usar el método directo de búsqueda de enlaces
                base_url = f"{BASE_URL}/productos_cat.asp?id={category_id}"
                pages = [base_url]  # Página inicial
                
                # Obtener el contenido de la página inicial
                page_content = self._fetch_page(base_url)
                soup = BeautifulSoup(page_content, "html.parser")
                
                # Buscar enlaces de paginación usando un selector CSS con el ID de categoría
                pagination_links = soup.select(f"a[href*='productos_cat.asp?id={category_id}&pagina=']")
                for link in pagination_links:
                    href = link.get("href")
                    if href:
                        full_url = urljoin(BASE_URL, href)
                        if full_url not in pages:  # Evitar duplicados
                            pages.append(full_url)
                
                # Buscar específicamente el enlace "Siguiente" para asegurarnos de no perder páginas
                siguiente_link = soup.find('a', string="Siguiente")
                if siguiente_link and siguiente_link.get('href'):
                    siguiente_url = urljoin(BASE_URL, siguiente_link['href'])
                    if siguiente_url not in pages:
                        print(f"Añadiendo enlace 'Siguiente' a las páginas a procesar: {siguiente_url}")
                        pages.append(siguiente_url)
                            
            # Eliminar duplicados y ordenar para procesar las páginas en orden
            # La ordenación asegura que procesamos las páginas numéricamente (1, 2, 3...)
            pages = sorted(list(set(pages)))
            
            # Determinar el número máximo de páginas encontradas (útil para depuración)
            max_page_num = 1
            for page in pages:
                if 'pagina=' in page:
                    try:
                        page_num = int(page.split('pagina=')[-1].split('&')[0])
                        max_page_num = max(max_page_num, page_num)
                    except ValueError:
                        pass
            
            print(f"Páginas encontradas para la categoría {category_id}: {len(pages)} (máximo número de página: {max_page_num})")
            
            # Mantener el progreso de categorías visible en la consola
            with tqdm.tqdm(total=len(pages), desc=f"Procesando categoría {category_id}", position=0, leave=True) as pbar:
                for page_url in pages:
                    print(f"Processing page: {page_url}")
                    html = self._fetch_page(page_url)
                    soup = BeautifulSoup(html, 'html.parser')

                    # Buscar las tablas que contienen los productos
                    product_tables = [
                        table for table in soup.find_all('table')
                        if table.get('width') == '200' and table.get('id') == 'customers'
                        and table.find('a') and table.find('img')
                        and len(table.find_all('tr')) >= 3
                    ]

                    if not product_tables:
                        print(f"Warning: No product tables found on page {page_url}")
                        continue

                    # Generar hashes para todos los productos en la página
                    page_hashes = {}
                    for product_table in product_tables:
                        try:
                            # Extraer datos básicos del producto
                            img_row = product_table.find('tr').find('td').find('a')
                            img_elem = img_row.find('img')
                            list_image = urljoin(BASE_URL, img_elem['src'])

                            name_cell = product_table.select_one('tr td[colspan="1"]')
                            product_name = name_cell.get_text(strip=True)

                            price_row = product_table.find_all('tr')[2]
                            price_cell = price_row.find('td')
                            price_raw = price_cell.text.strip()

                            # Generar hash para el producto
                            hash_data = f"{product_name}:{price_raw}:{list_image}"
                            product_hash = hashlib.md5(hash_data.encode('utf-8')).hexdigest()

                            # Asociar hash con la tabla del producto
                            page_hashes[product_hash] = product_table
                        except Exception as e:
                            print(f"Error generating hash for product: {str(e)}")

                    # Comparar hashes de la página con los existentes
                    existing_hashes = set(self.existing_products.values())
                    new_hashes = set(page_hashes.keys()) - existing_hashes

                    if not new_hashes:
                        print(f"Saltando página {page_url} - todos los productos ya existen y no han cambiado")
                        continue

                    # Inicializar barra de progreso para los productos de la página
                    total_products = len(new_hashes)
                    product_progress = tqdm.tqdm(total=total_products, desc=f"Página {page_url}", unit="producto")

                    # Procesar solo los productos necesarios
                    for product_hash in new_hashes:
                        product_table = page_hashes[product_hash]
                        try:
                            product_data = self.process_product_card(product_table, category['external_id'])
                            if not product_data:
                                product_progress.update(1)
                                continue

                            # Upsert product
                            result = self.supabase.upsert_product(product_data)
                            if result:
                                if result.get('inserted'):
                                    print(f"Producto {product_data['external_product_id']} insertado como nuevo.")
                                else:
                                    print(f"Producto {product_data['external_product_id']} actualizado.")
                                    
                                added_products.append(product_data['external_product_id'])
                            else:
                                print(f"Error al insertar/actualizar el producto {product_data['external_product_id']}")
                        except Exception as e:
                            print(f"Error procesando el producto: {str(e)}")
                        finally:
                            product_progress.update(1)

                    product_progress.close()
                    
            return pages
        except Exception as e:
            print(f"Error fetching pages for category {category_id}: {str(e)}")
            return []

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

    def process_product_card(self, product_table: BeautifulSoup, category_id: int) -> Dict:
        """Extract product information from a product table without visiting the product page."""
        try:
            # Obtener enlace del producto y extraer el ID
            img_row = product_table.find('tr').find('td').find('a')
            if img_row and img_row.get('href'):
                product_url = urljoin(BASE_URL, img_row['href'])
                try:
                    external_product_id = int(product_url.split('id=')[-1])  # Convertir a entero
                except ValueError:
                    raise ValueError(f"Invalid external_product_id extracted from URL: {product_url}")
            else:
                raise ValueError("Could not find product link")

            # Obtener imagen en miniatura como fallback
            img_elem = img_row.find('img')
            if not img_elem or not img_elem.get('src'):
                logging.warning(f"No thumbnail image for product {external_product_id}")
                list_image = None
            else:
                list_image = urljoin(BASE_URL, img_elem['src'])
                
            # Obtener imagen de alta calidad de la página de detalle del producto
            try:
                print(f"Obteniendo imagen de alta calidad para producto {external_product_id}")
                detail_url = f"{BASE_URL}/productos_full.asp?id={external_product_id}"
                detail_html = self._fetch_page(detail_url)
                detail_soup = BeautifulSoup(detail_html, 'html.parser')
                
                # Buscar la imagen de alta resolución en la página de detalle
                main_content = detail_soup.find('div', {'id': 'content'}) or detail_soup
                img = main_content.find('img', src=lambda x: x and ('upload' in x or 'images' in x))
                
                if img and img.get('src'):
                    high_res_image = urljoin(BASE_URL, img['src'])
                    print(f"Imagen de alta calidad encontrada: {high_res_image}")
                    list_image = high_res_image  # Reemplazar la miniatura con la imagen de alta calidad
                else:
                    print(f"No se encontró imagen de alta calidad, usando miniatura: {list_image}")
            except Exception as img_error:
                print(f"Error al obtener imagen de alta calidad: {str(img_error)}")
                # Mantener la imagen en miniatura como respaldo

            # Obtener nombre y precio desde la tabla de la categoría
            name_cell = product_table.select_one('tr td[colspan="1"]')
            if not name_cell or not name_cell.get_text(strip=True):
                raise ValueError("Could not find product name")
            product_name = name_cell.get_text(strip=True)

            price_row = product_table.find_all('tr')[2]
            if not price_row:
                raise ValueError("Could not find price row")
            price_cell = price_row.find('td')
            if not price_cell or not any(symbol in price_cell.text for symbol in ['₡', '¢']):
                raise ValueError("Could not find price element")
            price_raw = price_cell.text.strip()
            _, price_numeric = parse_price(price_raw)

            # Validar que price_numeric es válido
            if not isinstance(price_numeric, (int, float)):
                raise ValueError(f"Invalid price_numeric for product {external_product_id}: {price_numeric}")

            # Generar el hash del producto actual usando solo datos de la categoría
            hash_components = {
                'name': str(product_name),
                'price': str(price_raw),
                'image': str(list_image)
            }
            hash_data = f"{hash_components['name']}:{hash_components['price']}:{hash_components['image']}"
            current_hash = hashlib.md5(hash_data.encode('utf-8')).hexdigest()

            # Si el producto existe y su hash no ha cambiado, lo saltamos
            if external_product_id in self.existing_products:
                existing_hash = self.existing_products[external_product_id]
                if existing_hash == current_hash:
                    logging.info(f"Skipping product {external_product_id} - no changes detected")
                    return None

            # Imprimir y guardar en el log los datos del producto para depuración
            log_message = f"Procesando producto {external_product_id}: {product_name}, Precio: {price_raw}, Imagen: {list_image}"
            print(log_message)
            logging.info(log_message)

            # Retornar datos básicos del producto
            return {
                "external_product_id": external_product_id,
                "product_url": product_url,
                "image_url": list_image,
                "name": product_name,
                "price_raw": price_raw,
                "price_numeric": float(price_numeric),
                "source_html_hash": current_hash,
                "category_id": category_id
            }

        except Exception as e:
            error_message = f"Error processing product: {str(e)}"
            print(error_message)
            logging.error(error_message)
            return None
    
    def scrape_category(self, category_id: Optional[str] = None):
        """Scrape a single category or all categories"""
        categories = ([c for c in self.get_categories() if c['external_id'] == category_id] 
                     if category_id else self.get_categories())

        # Verificar y utilizar categorías existentes en Supabase
        for category in categories:
            try:
                existing_category = self.supabase.client.table("categories").select("id").eq("external_id", category["external_id"]).execute()
                if existing_category.data:
                    print(f"Categoría existente encontrada: {category['name']} (ID: {category['external_id']})")
                    # Asegurarse de que category tenga el campo 'id' de Supabase
                    category['supabase_id'] = existing_category.data[0]['id']
                    print(f"ID en Supabase para categoría {category['external_id']}: {category['supabase_id']}")
                else:
                    print(f"Insertando nueva categoría: {category['name']} (ID: {category['external_id']})")
                    result = self.supabase.client.table("categories").insert({
                        "external_id": category["external_id"],
                        "name": category["name"],
                        "source_url": category["source_url"],
                        "last_crawled_at": datetime.utcnow().isoformat(),
                        "seller_id": 1
                    }).execute()
                    
                    if result.data:
                        category['supabase_id'] = result.data[0]['id']
                        print(f"Nueva categoría insertada con ID en Supabase: {category['supabase_id']}")
                    else:
                        print(f"⚠️ Advertencia: No se pudo obtener ID después de insertar categoría {category['external_id']}")
            except Exception as e:
                print(f"Error al procesar categoría {category['external_id']}: {str(e)}")

        # Cargar productos existentes
        self._load_existing_products(category_id)

        # Inicializar barra de progreso para las categorías
        total_categories = len(categories)
        category_progress = tqdm.tqdm(total=total_categories, desc="Procesando categorías", unit="categoría")

        for category in categories:
            print(f"\nProcesando categoría: {category['name']} ({category['external_id']})")

            # Primero contar productos totales
            total_products = 0
            added_products = []  # Lista para registrar productos añadidos
            pages = self.get_category_pages(category['external_id'])
            print(f"Encontradas {len(pages)} páginas")

            # Inicializar barra de progreso para las páginas de la categoría
            total_pages = len(pages)
            page_progress = tqdm.tqdm(total=total_pages, desc=f"Categoría {category['name']}", unit="página")

            for page_url in pages:
                print(f"Processing page: {page_url}")
                html = self._fetch_page(page_url)
                soup = BeautifulSoup(html, 'html.parser')

                # Buscar las tablas que contienen los productos
                product_tables = [
                    table for table in soup.find_all('table')
                    if table.get('width') == '200' and table.get('id') == 'customers'
                    and table.find('a') and table.find('img')
                    and len(table.find_all('tr')) >= 3
                ]

                if not product_tables:
                    print(f"Warning: No product tables found on page {page_url}")
                    continue

                # Generar hashes para todos los productos en la página
                page_hashes = {}
                for product_table in product_tables:
                    try:
                        # Extraer datos básicos del producto
                        img_row = product_table.find('tr').find('td').find('a')
                        img_elem = img_row.find('img')
                        list_image = urljoin(BASE_URL, img_elem['src'])

                        name_cell = product_table.select_one('tr td[colspan="1"]')
                        product_name = name_cell.get_text(strip=True)

                        price_row = product_table.find_all('tr')[2]
                        price_cell = price_row.find('td')
                        price_raw = price_cell.text.strip()

                        # Generar hash para el producto
                        hash_data = f"{product_name}:{price_raw}:{list_image}"
                        product_hash = hashlib.md5(hash_data.encode('utf-8')).hexdigest()

                        # Asociar hash con la tabla del producto
                        page_hashes[product_hash] = product_table
                    except Exception as e:
                        print(f"Error generating hash for product: {str(e)}")

                # Comparar hashes de la página con los existentes
                existing_hashes = set(self.existing_products.values())
                new_hashes = set(page_hashes.keys()) - existing_hashes

                if not new_hashes:
                    print(f"Saltando página {page_url} - todos los productos ya existen y no han cambiado")
                    continue

                # Inicializar barra de progreso para los productos de la página
                total_products = len(new_hashes)
                product_progress = tqdm.tqdm(total=total_products, desc=f"Página {page_url}", unit="producto")

                # Procesar solo los productos necesarios
                for product_hash in new_hashes:
                    product_table = page_hashes[product_hash]
                    try:
                        product_data = self.process_product_card(product_table, category['external_id'])
                        if not product_data:
                            product_progress.update(1)
                            continue

                        # Upsert product
                        result = self.supabase.upsert_product(product_data)
                        if result:
                            if result.get('inserted'):
                                print(f"Producto {product_data['external_product_id']} insertado como nuevo.")
                            else:
                                print(f"Producto {product_data['external_product_id']} actualizado.")
                                
                            added_products.append(product_data['external_product_id'])
                        else:
                            print(f"Error al insertar/actualizar el producto {product_data['external_product_id']}")
                    except Exception as e:
                        print(f"Error procesando el producto: {str(e)}")
                    finally:
                        product_progress.update(1)

                product_progress.close()
                
            page_progress.close()

            # Actualizar el cache local con los nuevos productos añadidos
            for product_id in added_products:
                product_hash = hashlib.md5(f"{product_id}".encode('utf-8')).hexdigest()
                self.existing_products[product_id] = product_hash
            
            category_progress.update(1)

        category_progress.close()

    def scrape_all(self):
        """Scrape all categories"""
        self.scrape_category()

    def fetch_category(self, category_id: str) -> Dict:
        """Fetch a specific category by its external_id"""
        try:
            categories = self.fetch_categories()
            for category in categories:
                if category["external_id"] == category_id:
                    print(f"Categoría encontrada: {category['name']} ({category['external_id']})")
                    return category
            raise ValueError(f"Categoría con ID {category_id} no encontrada")
        except Exception as e:
            print(f"Error fetching category {category_id}: {str(e)}")
            return {}

    def process_page(self, page_url: str, category: Dict):
        """Process a specific page of a category"""
        try:
            print(f"Procesando página: {page_url}")
            page_content = self._fetch_page(page_url)
            soup = BeautifulSoup(page_content, "html.parser")

            # Ajustar el selector para buscar productos
            product_tables = soup.find_all("table")  # Buscar todas las tablas como punto de partida
            if not product_tables:
                print(f"No se encontraron productos en la página: {page_url}")
                return

            # Inicializar barra de progreso
            total_products = len(product_tables)
            product_progress = tqdm.tqdm(total=total_products, desc=f"Procesando productos en {page_url}", unit="producto")

            for product_table in product_tables:
                # Antes de procesar el producto, asegurémonos de que la categoría existe en Supabase
                try:
                    # Usamos el external_id para encontrar la categoría en Supabase
                    cat_response = self.supabase.client.table("categories").select("id, external_id").eq("external_id", category['external_id']).execute()
                    
                    if not cat_response.data:
                        print(f"⚠️ La categoría {category['external_id']} no existe en Supabase. Insertándola...")
                        cat_result = self.supabase.client.table("categories").insert({
                            "external_id": category['external_id'],
                            "name": category['name'],
                            "source_url": category.get('source_url', ''),
                            "last_crawled_at": datetime.utcnow().isoformat(),
                            "seller_id": 1
                        }).execute()
                        
                        if cat_result.data:
                            internal_cat_id = cat_result.data[0]['id']  # ID interno en Supabase
                            print(f"✅ Categoría {category['external_id']} insertada con ID interno: {internal_cat_id}")
                        else:
                            print(f"❌ Error al insertar categoría {category['external_id']}")
                            continue
                    else:
                        internal_cat_id = cat_response.data[0]['id']  # ID interno en Supabase
                        print(f"✅ Categoría {category['external_id']} ya existe con ID interno: {internal_cat_id}")
                    
                    # Procesamos el producto pasando el ID interno de la categoría
                    product_data = self.process_product_card(product_table, internal_cat_id)
                    if product_data:
                        result = self.supabase.upsert_product(product_data)
                        if result:
                            print(f"Producto {product_data['external_product_id']} procesado exitosamente.")
                except Exception as e:
                    print(f"Error al procesar categoría {category['external_id']}: {str(e)}")
                product_progress.update(1)

            product_progress.close()
        except Exception as e:
            print(f"Error procesando la página {page_url}: {str(e)}")

def find_product_category(product_id: int):
    """Buscar la categoría de un producto específico por su ID."""
    try:
        url = f"{BASE_URL}/productos_full.asp?id={product_id}"
        print(f"Buscando producto en: {url}")
        response = httpx.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Depuración: Imprimir parte del contenido HTML
        print("Contenido HTML de la página del producto (primeros 500 caracteres):")
        print(response.text[:500])

        # Buscar la categoría en la página del producto
        category_label = soup.find(text=lambda text: text and "sin categoria" in text.lower())
        if category_label:
            print(f"Producto {product_id} pertenece a la categoría: 'sin categoría'")
            return {"category_name": "sin categoría", "category_url": None}

        category_link = soup.find("a", href=lambda href: href and "productos_cat.asp?id=" in href)
        if category_link:
            category_url = urljoin(BASE_URL, category_link["href"])
            category_name = category_link.get_text(strip=True)
            print(f"Producto {product_id} pertenece a la categoría: {category_name} ({category_url})")
            return {"category_name": category_name, "category_url": category_url}
        else:
            print(f"No se encontró la categoría para el producto {product_id}")
            return None
    except Exception as e:
        print(f"Error buscando la categoría del producto {product_id}: {str(e)}")
        return None

def main():
    print("Iniciando el script...")

    parser = argparse.ArgumentParser(description='Scrape OfertasB products')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--all', action='store_true', help='Scrape all categories')
    group.add_argument('--category', type=str, help='Scrape specific category ID')
    group.add_argument('--categories', type=str, help='Scrape specific category IDs separated by commas (e.g., 193,212,124)')

    args = parser.parse_args()

    scraper = OfertasBScraper()
    try:
        print("Cargando categorías...")
        if args.all:
            categories = scraper.fetch_categories()
        elif args.categories:
            category_ids = args.categories.split(',')
            categories = []
            for cat_id in category_ids:
                try:
                    cat = scraper.fetch_category(cat_id.strip())
                    if cat:
                        categories.append(cat)
                except Exception as e:
                    print(f"Error cargando la categoría {cat_id}: {str(e)}")
        else:
            categories = [scraper.fetch_category(args.category)]
        print(f"Categorías cargadas: {len(categories)}")

        # Inicializar barra de progreso para las categorías
        total_categories = len(categories)
        category_progress = tqdm.tqdm(total=total_categories, desc="Procesando categorías", unit="categoría")

        for category in categories:
            print(f"Procesando categoría: {category['name']} ({category['external_id']})")
            pages = scraper.fetch_category_pages(category['url'], category['external_id'])
            print(f"Páginas encontradas para la categoría {category['name']}: {len(pages)}")

            # Inicializar barra de progreso para las páginas
            total_pages = len(pages)
            page_progress = tqdm.tqdm(total=total_pages, desc=f"Categoría {category['name']}", unit="página")

            for page_url in pages:
                print(f"Analizando página: {page_url}")
                # Asegurar que la categoría no sea None
                category = next((c for c in categories if c['external_id'] == category['external_id']), None)
                if not category:
                    raise ValueError("La categoría no está definida al procesar la página")
                scraper.process_page(page_url, category)
                page_progress.update(1)

            page_progress.close()
            category_progress.update(1)

        category_progress.close()
        print("Script completado.")
    except Exception as e:
        print(f"Error en la ejecución del script: {str(e)}")

# Ejecución directa
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ejecutar funciones específicas del scraper.")
    parser.add_argument("--all", action="store_true", help="Ejecutar el scraper para todas las categorías.")
    parser.add_argument("--categories", type=str, help="Ejecutar el scraper para categorías específicas, separadas por comas (ej: 193,212,124).")
    parser.add_argument("--find-product", type=int, help="Buscar un producto por su external_product_id.")
    args = parser.parse_args()

    if args.find_product:
        find_product_category(args.find_product)
    elif args.categories:
        print(f"Ejecutando el scraper para categorías específicas: {args.categories}")
        main()
    elif args.all:
        # Lógica existente para ejecutar el scraper completo
        print("Ejecutando el scraper para todas las categorías...")
        main()
