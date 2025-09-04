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
import io
import hashlib
from typing import Dict, List, Any, Optional
from bs4 import BeautifulSoup
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv
import uuid
import base64
from utils.price import parse_price

# Cargar variables de entorno
load_dotenv()

# Constantes
BASE_URL = "https://www.ofertasb.com"
SLEEP_MIN = 1.0  # Tiempo mínimo de espera entre solicitudes (segundos)
SLEEP_MAX = 2.0  # Tiempo máximo de espera entre solicitudes (segundos)
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"

# Carpeta de destino para imágenes en Supabase Storage
IMAGE_BUCKET = "product-images"  # Nombre del bucket en Supabase Storage
UNCATEGORIZED_FOLDER = "sin categoria"  # Carpeta específica para productos sin categoría

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
            "errors": 0,
            "images_saved": 0,
            "image_errors": 0
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
            
            # Implementamos paginación para obtener todos los productos
            page_size = 1000
            current_page = 0
            all_products = []
            total_fetched = 0
            
            while True:
                # Calcular offset para esta página
                offset = current_page * page_size
                
                # Consultar esta página de productos
                result = self.supabase.table("products") \
                    .select("external_product_id") \
                    .range(offset, offset + page_size - 1) \
                    .execute()
                
                if not result.data or len(result.data) == 0:
                    # No hay más productos, salir del bucle
                    break
                
                # Agregar productos a la lista
                all_products.extend(result.data)
                total_fetched += len(result.data)
                print(f"  Cargados {total_fetched} productos hasta ahora...")
                
                # Comprobar si hemos llegado al final
                if len(result.data) < page_size:
                    break
                
                # Avanzar a la siguiente página
                current_page += 1
            
            # Convertir a diccionario para búsqueda rápida
            self.existing_products = {
                str(product["external_product_id"]): True 
                for product in all_products
            }
            
            print(f"✅ Total de productos existentes cargados: {len(self.existing_products)}")
            return self.existing_products
            
        except Exception as e:
            print(f"❌ Error cargando productos existentes: {str(e)}")
            return {}
    
    def fetch_page(self, url):
        """Obtener el contenido HTML de una página"""
        try:
            print(f"Descargando: {url}")
            
            # Añadir un retraso aleatorio para evitar detección
            time.sleep(random.uniform(SLEEP_MIN, SLEEP_MAX))
            
            # Hacer la solicitud HTTP
            response = self.session.get(url)
            
            if response.status_code != 200:
                print(f"⚠️ Código de estado HTTP inesperado: {response.status_code}")
                return None
            
            # Comprobar si el HTML es válido
            html_content = response.text
            if not html_content or len(html_content) < 1000:
                print(f"⚠️ Contenido HTML demasiado pequeño: {len(html_content)} bytes")
                return None
            
            return html_content
            
        except Exception as e:
            print(f"❌ Error obteniendo la página {url}: {str(e)}")
            return None
    
    def get_total_pages(self):
        """Determinar el número total de páginas a procesar"""
        try:
            print("Determinando el número total de páginas...")
            first_page_url = f"{BASE_URL}/productos_cat.asp"
            
            html = self.fetch_page(first_page_url)
            if not html:
                return 0
                
            soup = BeautifulSoup(html, 'html.parser')
            
            # Buscar enlaces de paginación
            pagination_links = soup.find_all("a", href=lambda href: href and "pagina=" in href)
            
            if not pagination_links:
                print("⚠️ No se encontraron enlaces de paginación")
                return 1  # Asumimos que solo hay una página
            
            # Encontrar el número de página más alto
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
        if not page_html:
            print("❌ No hay HTML para extraer enlaces de productos")
            return []

        try:
            soup = BeautifulSoup(page_html, 'html.parser')
            
            # Análisis de depuración básico del HTML
            html_size = len(page_html)
            print(f"📊 Tamaño del HTML recibido: {html_size} bytes")

            if html_size < 5000:
                print("⚠️ El HTML es muy pequeño, posiblemente es una página de error o redirección")
                self.debug_page_content(page_html)
                
                # Guardar HTML para análisis
                with open(f"debug_page_{int(time.time())}.html", 'w', encoding='utf-8') as f:
                    f.write(page_html)
                print("💾 Se ha guardado el HTML para análisis")
                return []
                
            # Buscar enlaces a productos de diferentes maneras
            product_links = []
            
            # Método 1: Enlaces directos a productos_det.asp (principal)
            direct_links = soup.find_all("a", href=lambda href: href and "productos_det.asp" in href)
            print(f"Método 1: Encontrados {len(direct_links)} enlaces directos a productos_det.asp")
            
            for a_tag in direct_links:
                href = a_tag.get("href", "")
                if href.startswith("/"):
                    href = f"{BASE_URL}{href}"
                elif not href.startswith("http"):
                    href = f"{BASE_URL}/{href}"
                product_links.append(href)
            
            # Método 2: Enlaces dentro de divs de producto
            product_containers = soup.select(".product, .item, .product-container, .product-item")
            print(f"Método 2: Encontrados {len(product_containers)} contenedores de producto")
            
            for container in product_containers:
                links = container.find_all("a", href=True)
                for link in links:
                    href = link.get("href", "")
                    if "productos_det.asp" in href:
                        if href.startswith("/"):
                            href = f"{BASE_URL}{href}"
                        elif not href.startswith("http"):
                            href = f"{BASE_URL}/{href}"
                        product_links.append(href)
            
            # Método 3: Enlaces con imágenes de producto
            img_links = []
            for img in soup.find_all("img"):
                parent_a = img.find_parent("a", href=lambda href: href and "productos_det.asp" in href)
                if parent_a:
                    href = parent_a.get("href", "")
                    if href.startswith("/"):
                        href = f"{BASE_URL}{href}"
                    elif not href.startswith("http"):
                        href = f"{BASE_URL}/{href}"
                    img_links.append(href)
            
            print(f"Método 3: Encontrados {len(img_links)} enlaces con imágenes de producto")
            product_links.extend(img_links)
            
            # Método 4: Enlaces con texto o contenido relacionado a productos
            product_keywords = ["detalle", "producto", "comprar", "ver", "más info", "más información"]
            potential_product_links = []
            
            for a_tag in soup.find_all("a", href=True):
                text_content = a_tag.get_text().lower()
                
                # Buscar imágenes dentro del enlace
                has_img = a_tag.find("img") is not None
                has_keyword = any(keyword in text_content for keyword in product_keywords)
                
                if has_img or has_keyword:
                    href = a_tag.get("href", "")
                    if href.startswith("/"):
                        href = f"{BASE_URL}{href}"
                    elif not href.startswith("http"):
                        href = f"{BASE_URL}/{href}"
                    potential_product_links.append(href)
            
            print(f"Método 4: Encontrados {len(potential_product_links)} enlaces potenciales por contenido")
            product_links.extend(potential_product_links)
            
            # Método 5: Último recurso - cualquier enlace con parámetros de ID
            if len(product_links) < 5:
                id_links = []
                for a_tag in soup.find_all("a", href=lambda href: href and re.search(r'\?.*id=\d+', href or "")):
                    href = a_tag.get("href", "")
                    # Ignorar enlaces obvios de paginación o categorías
                    if "pagina=" in href and "productos_det.asp" not in href:
                        continue
                        
                    if href.startswith("/"):
                        href = f"{BASE_URL}{href}"
                    elif not href.startswith("http"):
                        href = f"{BASE_URL}/{href}"
                    id_links.append(href)
                
                print(f"Método 5: Encontrados {len(id_links)} enlaces con parámetros ID")
                product_links.extend(id_links)
            
            # Eliminar duplicados
            unique_links = list(set(product_links))
            
            # Imprimir ejemplos para depuración
            if unique_links:
                print(f"📌 Ejemplos de enlaces encontrados ({len(unique_links)} total):")
                for i, link in enumerate(unique_links[:5]):
                    print(f"  {i+1}. {link}")
                if len(unique_links) > 5:
                    print(f"  ... y {len(unique_links) - 5} más")
            else:
                print("⚠️ No se encontraron enlaces de productos usando ningún método")
                self.debug_page_content(page_html)
                
                # Guardar HTML para análisis más detallado
                with open(f"debug_page_{int(time.time())}.html", 'w', encoding='utf-8') as f:
                    f.write(page_html)
                print("💾 Se ha guardado el HTML para análisis detallado")
            
            return unique_links
            
        except Exception as e:
            print(f"❌ Error extrayendo enlaces de productos: {str(e)}")
            import traceback
            traceback.print_exc()
            return []
    
    def process_product_page(self, url):
        """Procesar la página de un producto individual"""
        try:
            print(f"Procesando producto: {url}")
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
            
            # MEJORA 1: Extracción más precisa del nombre del producto
            name = None

            # Método usado en el scraper original
            try:
                # Intentar usar la misma lógica que en el scraper original
                detail_url = f"{BASE_URL}/productos_full.asp?id={product_id}"
                detail_html = self.fetch_page(detail_url)
                if detail_html:
                    detail_soup = BeautifulSoup(detail_html, 'html.parser')
                    
                    # Buscar tablas con contenido de producto
                    product_tables = detail_soup.find_all("table", id="customers")
                    for table in product_tables:
                        name_cell = table.select_one('tr td[colspan="1"]')
                        if name_cell and name_cell.get_text(strip=True):
                            name = name_cell.get_text(strip=True)
                            print(f"Nombre encontrado usando método del scraper original: {name}")
                            break
            except Exception as e:
                print(f"Error intentando extraer nombre con método original: {str(e)}")
                
            # Si el método original falló, usar métodos alternativos
            if not name:
                # Método 1: Buscar en tablas principales (común en OfertasB)
                tables = soup.find_all("table")
                for table in tables:
                    # Buscar celdas con colspan que suelen contener títulos de productos
                    name_cells = table.select('tr td[colspan="1"], tr td[colspan="2"], tr td[colspan="3"]')
                    for cell in name_cells:
                        text = cell.get_text(strip=True)
                        if len(text) > 10 and "ofertasb" not in text.lower():
                            name = text
                            print(f"Nombre encontrado en celda de tabla: {name}")
                            break
                    if name:
                        break
            
            # Método 2: Buscar en h1 o h2 principal
            if not name:
                heading_tags = soup.find_all(['h1', 'h2'], limit=3)
                for tag in heading_tags:
                    # Filtrar textos cortos o genéricos
                    text = tag.text.strip()
                    if len(text) > 10 and text.lower() != "ofertasb" and "oferta" not in text.lower():
                        name = text
                        print(f"Nombre encontrado en elemento {tag.name}: {name}")
                        break
                        
            # Método 3: Buscar en elementos específicos si no se encontró
            if not name:
                # Intentar varios selectores para el nombre
                for selector in [
                    "div.product-name", 
                    "div.title", 
                    "td.product-name", 
                    ".product-info h1",
                    ".product-details h2",
                    "div.producto-nombre",
                    "div.product-title",
                    "span.product-title"
                ]:
                    name_elem = soup.select_one(selector)
                    if name_elem and len(name_elem.text.strip()) > 10:
                        name = name_elem.text.strip()
                        print(f"Nombre encontrado con selector '{selector}': {name}")
                        break
                    
            # Método 4: Buscar por texto en negrita que podría ser un título
            if not name:
                bold_elems = soup.find_all(['b', 'strong'])
                for elem in bold_elems:
                    if len(elem.text.strip()) > 10:  # Suficientemente largo para ser un título
                        name = elem.text.strip()
                        print(f"Nombre encontrado en elemento bold: {name}")
                        break
                        
            # Método 5: Buscar texto cercano a "Título" o "Producto"
            if not name:
                title_labels = soup.find_all(string=lambda s: s and any(x in s.lower() for x in ["título", "titulo", "producto", "nombre"]))
                for label in title_labels:
                    # Buscar el texto adyacente o siguiente elemento
                    next_elem = label.next_element
                    if next_elem and isinstance(next_elem, str):
                        if len(next_elem.strip()) > 10:
                            name = next_elem.strip()
                            print(f"Nombre encontrado tras etiqueta: {name}")
                            break
                    # O buscar en el padre para casos como <td>Título: Producto XYZ</td>
                    parent_text = label.parent.text.strip()
                    if ":" in parent_text:
                        possible_name = parent_text.split(":", 1)[1].strip()
                        if len(possible_name) > 10:
                            name = possible_name
                            print(f"Nombre encontrado tras etiqueta en texto padre: {name}")
                            break
                        
            # Fallback si todavía no se ha encontrado
            if not name:
                name = f"Producto sin nombre {product_id}"
                print(f"⚠️ No se pudo encontrar el nombre del producto {product_id}")
            
            # Asegurarnos de que el nombre no es "Lista de productos" ni otra texto genérico
            if "lista de productos" in name.lower() or "listado de productos" in name.lower():
                name = f"Producto sin categoría {product_id}"
                print(f"⚠️ Nombre genérico detectado, cambiado a: {name}")
            
            # MEJORA 2: Mejor extracción de precio con símbolo ₡
            price_raw = None
            price_numeric = None
            currency = "CRC"  # Por defecto, colones costarricenses
            
            # Método 1: Buscar patrones de precio con símbolo ₡ directamente en el HTML
            price_patterns = [
                r'₡\s?[\d.,]+',  # ₡ seguido de números
                r'¢\s?[\d.,]+',   # ¢ seguido de números (símbolo alternativo)
                r'CRC\s?[\d.,]+',  # CRC seguido de números
                r'colones\s?[\d.,]+',  # "colones" seguido de números
                r'precio:\s?[\d.,]+',  # "precio:" seguido de números
                r'precio\s?[\d.,]+',   # "precio" seguido de números
                r'cuesta\s?[\d.,]+',   # "cuesta" seguido de números
                r'valor\s?[\d.,]+',    # "valor" seguido de números
            ]
            
            for pattern in price_patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    price_raw = match.group(0).strip()
                    print(f"Precio encontrado (regex directo): {price_raw}")
                    break
                    
            # Método 2: Buscar en elementos específicos si no se encontró con regex
            if not price_raw:
                price_selectors = [
                    "div.price", "span.price", "div.precio", "span.precio",
                    ".product-price", ".price-value", ".valor", ".monto"
                ]
                
                for selector in price_selectors:
                    price_elem = soup.select_one(selector)
                    if price_elem:
                        price_text = price_elem.text.strip()
                        # Verificar que contiene dígitos
                        if re.search(r'\d', price_text):
                            price_raw = price_text
                            print(f"Precio encontrado ({selector}): {price_raw}")
                            break
            
            # Método 3: Buscar texto cerca de "Precio" o "Valor"
            if not price_raw:
                price_labels = soup.find_all(string=lambda s: s and any(x in s.lower() for x in ["precio", "valor", "costo"]))
                for label in price_labels:
                    parent = label.parent
                    # Buscar texto adyacente
                    if parent.next_sibling and isinstance(parent.next_sibling, str):
                        text = parent.next_sibling.strip()
                        if re.search(r'\d', text):
                            price_raw = text
                            print(f"Precio encontrado en texto adyacente: {price_raw}")
                            break
                    # Buscar siguiente elemento
                    next_elem = parent.next_sibling
                    while next_elem and isinstance(next_elem, str) and not next_elem.strip():
                        next_elem = next_elem.next_sibling
                    
                    if next_elem and hasattr(next_elem, 'text'):
                        text = next_elem.text.strip()
                        if re.search(r'\d', text):
                            price_raw = text
                            print(f"Precio encontrado en elemento adyacente: {price_raw}")
                            break
            
            # Método 4: Buscar en tablas de información
            if not price_raw:
                price_label = soup.find(["td", "th"], string=lambda s: s and any(x in s.lower() for x in ["precio", "valor", "costo"]))
                if price_label:
                    next_cell = price_label.find_next_sibling("td")
                    if next_cell:
                        price_text = next_cell.text.strip()
                        if re.search(r'\d', price_text):
                            price_raw = price_text
                            print(f"Precio encontrado en tabla: {price_raw}")
            
            # Si encontramos un precio, extraer valor numérico
            if price_raw:
                try:
                    # Añadir el símbolo ₡ si no lo tiene pero contiene números
                    if not any(symbol in price_raw for symbol in ['₡', '¢', '$']) and re.search(r'\d', price_raw):
                        price_raw = f"₡{price_raw}"
                        print(f"Agregado símbolo ₡ al precio: {price_raw}")
                    
                    # Intentar extraer el valor numérico usando nuestra función de utilidad
                    price_raw, price_numeric = parse_price(price_raw)
                    print(f"Precio procesado: {price_raw} -> {price_numeric}")
                    
                except ValueError:
                    # Si falla, intentar extracción directa
                    price_match = re.search(r'[\d\.,]+', price_raw)
                    if price_match:
                        price_str = price_match.group(0).replace(".", "").replace(",", ".")
                        try:
                            price_numeric = float(price_str)
                            print(f"Precio numérico extraído manualmente: {price_numeric}")
                        except ValueError:
                            price_numeric = None
                            print(f"⚠️ No se pudo convertir {price_str} a número")
            
            # Si no se encuentra precio numérico o contiene "negociable", establecer correctamente
            if not price_numeric:
                # Verificar si tiene texto sobre negociación
                if any(term in html.lower() for term in ["negociable", "a convenir", "consultar precio"]):
                    price_raw = "Negociable con vendedor"
                    price_numeric = None
                    print(f"Precio detectado como negociable")
                else:
                    price_raw = "Precio no disponible"
                    price_numeric = None
                    print(f"⚠️ No se pudo encontrar un precio")
            
            # MEJORA 3: Mejor extracción y almacenamiento de imágenes en carpeta específica
            image_url = None
            image_stored_url = None
            
            # Método 1: Buscar en div#content
            main_content = soup.find('div', {'id': 'content'})
            if main_content:
                img = main_content.find('img', src=lambda x: x and ('upload' in x or 'images' in x))
                if img and img.get('src'):
                    image_url = img['src']
                    print(f"Imagen encontrada (content): {image_url}")
            
            # Método 2: Buscar en div.product-image
            if not image_url:
                product_image_div = soup.find('div', class_='product-image')
                if product_image_div:
                    img = product_image_div.find('img', src=True)
                    if img:
                        image_url = img['src']
                        print(f"Imagen encontrada (product-image): {image_url}")
            
            # Método 3: Buscar imágenes grandes que puedan ser de producto
            if not image_url:
                all_images = soup.find_all('img', src=True)
                product_images = [img for img in all_images if any(term in img.get('src', '') for term in 
                                 ['product', 'prod', 'item', 'foto', 'image', 'img', 'upload'])]
                
                if product_images:
                    # Ordenar por tamaño del src (generalmente las imágenes de producto tienen URLs más largas)
                    product_images.sort(key=lambda img: len(img.get('src', '')), reverse=True)
                    image_url = product_images[0]['src']
                    print(f"Imagen encontrada (por nombre): {image_url}")
                elif all_images:
                    # Si no encontramos imágenes específicas de producto, usar la más grande
                    largest_img = max(all_images, key=lambda img: len(img.get('src', '')))
                    image_url = largest_img['src']
                    print(f"Imagen encontrada (la más grande): {image_url}")
            
            # Normalizar URL de imagen
            if image_url:
                if image_url.startswith('/'):
                    image_url = f"{BASE_URL}{image_url}"
                elif not image_url.startswith('http'):
                    image_url = f"{BASE_URL}/{image_url}"
                print(f"URL de imagen normalizada: {image_url}")
                
                # Descargar y guardar la imagen en Supabase Storage en carpeta específica
                try:
                    # Descargar la imagen
                    response = self.session.get(image_url)
                    if response.status_code == 200:
                        # Generar nombre de archivo único
                        image_extension = image_url.split('.')[-1] if '.' in image_url else 'jpg'
                        if len(image_extension) > 4 or not image_extension.isalpha():  # Si la extensión es inválida
                            image_extension = 'jpg'
                            
                        filename = f"{product_id}_{uuid.uuid4().hex[:8]}.{image_extension}"
                        storage_path = f"{UNCATEGORIZED_FOLDER}/{filename}"
                        
                        # Guardar en Supabase Storage
                        image_data = response.content
                        
                        try:
                            # Intentar subir la imagen
                            result = self.supabase.storage.from_(IMAGE_BUCKET).upload(
                                path=storage_path,
                                file=image_data,
                                file_options={"content-type": f"image/{image_extension}"}
                            )
                            
                            # Si llegamos aquí, la carga fue exitosa
                            # Obtener la URL pública
                            try:
                                public_url = self.supabase.storage.from_(IMAGE_BUCKET).get_public_url(storage_path)
                                print(f"✅ Imagen guardada en Supabase: {storage_path}")
                                print(f"URL pública: {public_url}")
                                image_stored_url = public_url
                                self.stats["images_saved"] += 1
                            except Exception as url_error:
                                print(f"⚠️ Error obteniendo URL pública: {str(url_error)}")
                                self.stats["image_errors"] += 1
                                
                        except Exception as upload_error:
                            print(f"⚠️ Error durante la carga: {str(upload_error)}")
                            self.stats["image_errors"] += 1
                    else:
                        print(f"⚠️ Error descargando imagen, status: {response.status_code}")
                        self.stats["image_errors"] += 1
                        
                except Exception as e:
                    print(f"❌ Error procesando imagen: {str(e)}")
                    self.stats["image_errors"] += 1
            
            # VERIFICACIÓN DE CATEGORÍA - PARTE CRÍTICA
            is_uncategorized = False
            category_id = None
            category_name = None
            
            # Método 1: Buscar por texto "Categoría" en tablas
            category_info = soup.find(["td", "th"], string=lambda s: s and "categoría" in s.lower())
            if category_info:
                print("Encontrada referencia a 'Categoría' en una tabla")
                # Encontrar el valor correspondiente
                category_value = category_info.find_next_sibling(["td", "th"])
                if category_value:
                    category_text = category_value.text.strip().lower()
                    print(f"Texto de categoría encontrado: '{category_text}'")
                    
                    # Verificar si es "sin categoría"
                    if "sin categoría" in category_text or "sin categoria" in category_text:
                        is_uncategorized = True
                        print("✅ PRODUCTO SIN CATEGORÍA ENCONTRADO!")
                    
                    # Intentar extraer el ID de categoría de la URL si existe
                    category_link = category_value.find("a", href=lambda href: href and "productos_cat.asp" in href)
                    if category_link:
                        href = category_link.get("href", "")
                        match = re.search(r"id=(\d+)", href)
                        if match:
                            category_id = match.group(1)
                            print(f"ID de categoría extraído de la URL: {category_id}")
                            
                    # Capturar el nombre de la categoría
                    category_name = category_value.get_text(strip=True)
            
            # Método 2: Buscar directamente texto "sin categoría" en la página
            if not is_uncategorized:
                # Buscar en el texto completo de la página
                page_text = soup.get_text().lower()
                if "sin categoría" in page_text or "sin categoria" in page_text:
                    is_uncategorized = True
                    print("✅ Texto 'sin categoría' encontrado en la página!")
                
                # Buscar en elementos específicos que podrían contener la categoría
                category_elements = soup.select(".category, .product-category, .breadcrumb")
                for elem in category_elements:
                    elem_text = elem.get_text().lower()
                    if "sin categoría" in elem_text or "sin categoria" in elem_text:
                        is_uncategorized = True
                        print(f"✅ 'Sin categoría' encontrado en elemento {elem.name}.{elem.get('class', '')}")
                        break
            
            # Método 3: Buscar breadcrumb de navegación
            if not category_id and not is_uncategorized:
                breadcrumbs = soup.find_all(["div", "nav", "ul"], class_=lambda c: c and "breadcrumb" in c.lower())
                for breadcrumb in breadcrumbs:
                    links = breadcrumb.find_all("a")
                    for link in links:
                        href = link.get("href", "")
                        if "categoria" in href.lower() or "productos_cat.asp" in href.lower():
                            match = re.search(r"id=(\d+)", href)
                            if match:
                                category_id = match.group(1)
                                category_name = link.text.strip()
                                print(f"Categoría encontrada en breadcrumb: {category_name} (ID: {category_id})")
                                break
            
            # Si después de todo no se encontró categoría explícita, verificar si tiene marcadores
            # comunes de productos sin categorizar
            if not is_uncategorized and not category_id:
                uncategorized_markers = [
                    "producto sin clasificar",
                    "sin clasificación",
                    "no categorizado",
                    "categoría: n/a",
                    "categoría: ninguna"
                ]
                
                page_text = soup.get_text().lower()
                for marker in uncategorized_markers:
                    if marker in page_text:
                        is_uncategorized = True
                        print(f"✅ Marcador de producto sin categoría encontrado: '{marker}'")
                        break
            
            # Crear datos del producto
            product_data = {
                "external_product_id": product_id,
                "name": name,
                "product_url": url,
                "image_url": image_stored_url or image_url,  # Usar URL de Supabase si está disponible
                "price_raw": price_raw,
                "price_numeric": price_numeric,
                "currency": currency,
                "first_seen_at": datetime.utcnow().isoformat(),
                "last_seen_at": datetime.utcnow().isoformat(),
                "seller_id": 1,
                "source_html_hash": hashlib.md5(html.encode('utf-8')).hexdigest()
            }
            
            # Guardar HTML completo para referencia, pero no en la base de datos
            product_data["source_html"] = html
            
            # Asignar categoría basado en nuestro análisis
            if is_uncategorized:
                product_data["category_id"] = self.uncategorized_category["id"]
                self.stats["uncategorized_products"] += 1
                print(f"🎯 Producto {product_id} confirmado como 'Sin categoría'")
                
                # Guardar una copia del HTML para análisis (solo si es sin categoría, para optimizar espacio)
                with open(f"uncategorized_product_{product_id}.html", 'w', encoding='utf-8') as f:
                    f.write(html)
                print(f"💾 Guardado HTML de producto sin categoría: {product_id}")
                
            elif category_id and category_id in self.category_map:
                # Este producto tiene una categoría válida, lo ignoramos para este scraper específico
                print(f"⏭️ Producto {product_id} tiene categoría asignada: {self.category_map[category_id]['name']}")
                return None
            else:
                # No pudimos determinar si es sin categoría o no, por lo tanto lo consideramos sin categoría
                product_data["category_id"] = self.uncategorized_category["id"]
                self.stats["uncategorized_products"] += 1
                print(f"🔍 Producto {product_id} sin categoría clara, asignado a 'Sin categoría'")
            
            # Actualizar estadísticas solo si vamos a guardarlo (es decir, si es sin categoría)
            self.stats["total_products"] += 1
            self.stats["new_products"] += 1
            
            return product_data
            
        except Exception as e:
            print(f"❌ Error procesando producto {url}: {str(e)}")
            import traceback
            traceback.print_exc()
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
    
    def debug_page_content(self, html):
        """Mostrar información de depuración sobre el contenido de la página"""
        if not html:
            print("⚠️ HTML vacío o nulo")
            return
            
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extraer y mostrar título
        title = soup.title.text if soup.title else "Sin título"
        print(f"📄 Título de la página: {title}")
        
        # Mostrar elementos principales
        print("📋 Elementos principales:")
        for tag_name in ['h1', 'h2', 'form']:
            elements = soup.find_all(tag_name)
            if elements:
                print(f"  - {tag_name}: {len(elements)} elementos")
                for i, elem in enumerate(elements[:3]):
                    print(f"    {i+1}. {elem.get_text().strip()[:50]}")
                if len(elements) > 3:
                    print(f"    ... y {len(elements) - 3} más")
        
        # Mostrar posibles mensajes de error o redirección
        error_indicators = [
            "error", "no encontrado", "not found", "404", "403", 
            "mantenimiento", "maintenance", "redirect", "redirection"
        ]
        
        for indicator in error_indicators:
            if indicator in html.lower():
                print(f"⚠️ Posible problema detectado: '{indicator}'")
    
    def run(self, page_limit=None, start_page=1, debug_mode=False):
        """Ejecutar el scraper completo
        
        Args:
            page_limit (int, optional): Limitar la ejecución a este número de páginas
            start_page (int, optional): Página desde la que comenzar
            debug_mode (bool, optional): Si es True, muestra información adicional de depuración
        """
        start_time = time.time()
        try:
            print("=" * 80)
            print("🔍 INICIANDO SCRAPER DE PRODUCTOS SIN CATEGORÍA")
            print(f"📅 Fecha y hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("=" * 80)
            
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
                
            # Si se especificó un límite, ajustar el número de páginas
            if page_limit and page_limit > 0:
                end_page = min(start_page + page_limit - 1, total_pages)
                print(f"⚠️ Limitando de página {start_page} a {end_page} (de un total de {total_pages})")
                total_pages_to_process = end_page - start_page + 1
            else:
                end_page = total_pages
                total_pages_to_process = total_pages - start_page + 1
            
            print(f"\n🚀 Procesando {total_pages_to_process} páginas (de {start_page} a {end_page})")
            
            # Configurar barra de progreso para las páginas
            page_progress = tqdm.tqdm(total=total_pages_to_process, desc="Procesando páginas", unit="página")
            
            # Variables de control para detección de problemas
            consecutive_empty_pages = 0
            max_consecutive_empty = 5  # Detener después de 5 páginas consecutivas sin productos
            
            # Procesar cada página
            for page_num in range(start_page, end_page + 1):
                page_url = f"{BASE_URL}/productos_cat.asp?pagina={page_num}"
                print(f"\n{'='*40}")
                print(f"🌐 PÁGINA {page_num}/{end_page}: {page_url}")
                print(f"{'='*40}")
                
                page_html = self.fetch_page(page_url)
                if not page_html:
                    page_progress.update(1)
                    consecutive_empty_pages += 1
                    print(f"⚠️ Página {page_num} sin contenido ({consecutive_empty_pages} consecutivas)")
                    
                    if consecutive_empty_pages >= max_consecutive_empty:
                        print(f"⛔ {max_consecutive_empty} páginas consecutivas sin contenido. Finalizando.")
                        break
                        
                    continue
                
                # Análisis previo del HTML
                if debug_mode:
                    print("\n🔬 Análisis previo del HTML de la página:")
                    self.debug_page_content(page_html)
                
                # Extraer links a productos
                product_links = self.extract_product_links(page_html)
                
                if product_links:
                    consecutive_empty_pages = 0  # Reiniciar contador si encontramos productos
                    print(f"✅ Encontrados {len(product_links)} productos en página {page_num}")
                else:
                    consecutive_empty_pages += 1
                    print(f"⚠️ No se encontraron productos en página {page_num} ({consecutive_empty_pages} consecutivas)")
                    
                    # Si tenemos demasiadas páginas consecutivas sin productos, algo puede estar mal
                    if consecutive_empty_pages >= max_consecutive_empty:
                        print(f"⛔ {max_consecutive_empty} páginas consecutivas sin productos. Finalizando.")
                        
                        # Guardar última página para análisis
                        with open(f"debug_empty_page_{page_num}.html", 'w', encoding='utf-8') as f:
                            f.write(page_html)
                        print(f"💾 Guardada página vacía para análisis: debug_empty_page_{page_num}.html")
                        
                        break
                
                # Procesar cada producto
                if product_links:
                    product_progress = tqdm.tqdm(total=len(product_links), desc=f"Productos en página {page_num}", unit="producto")
                    uncategorized_in_page = 0
                    
                    for product_url in product_links:
                        # Procesar producto
                        product_data = self.process_product_page(product_url)
                        
                        # Guardar si es válido (sin categoría)
                        if product_data:
                            self.save_product(product_data)
                            uncategorized_in_page += 1
                        
                        product_progress.update(1)
                    
                    product_progress.close()
                    print(f"📊 Resumen de la página {page_num}: {uncategorized_in_page} productos sin categoría de {len(product_links)} totales")
                
                page_progress.update(1)
                
                # Pequeña pausa entre páginas para evitar sobrecargar el servidor
                time.sleep(random.uniform(1.5, 3.0))
            
            page_progress.close()
            
            # Duración total
            duration = time.time() - start_time
            hours, remainder = divmod(duration, 3600)
            minutes, seconds = divmod(remainder, 60)
            
            # Mostrar estadísticas finales
            print("\n" + "="*50)
            print("📊 ESTADÍSTICAS FINALES")
            print("="*50)
            print(f"✅ Total de productos procesados: {self.stats['total_products']}")
            print(f"📋 Productos sin categoría: {self.stats['uncategorized_products']}")
            print(f"🆕 Productos nuevos: {self.stats['new_products']}")
            print(f"🔄 Productos existentes (ignorados): {self.stats['existing_products']}")
            print(f"🖼️ Imágenes guardadas: {self.stats['images_saved']}")
            print(f"❌ Errores de imágenes: {self.stats['image_errors']}")
            print(f"⚠️ Errores generales: {self.stats['errors']}")
            print(f"⏱️ Duración total: {int(hours)}h {int(minutes)}m {int(seconds)}s")
            print("="*50)
            
        except KeyboardInterrupt:
            print("\n\n⛔ Ejecución interrumpida por el usuario")
            
            # Duración hasta interrupción
            duration = time.time() - start_time
            hours, remainder = divmod(duration, 3600)
            minutes, seconds = divmod(remainder, 60)
            
            # Mostrar estadísticas parciales
            print("\n" + "="*50)
            print("📊 ESTADÍSTICAS PARCIALES")
            print("="*50)
            print(f"✅ Productos procesados: {self.stats['total_products']}")
            print(f"📋 Productos sin categoría: {self.stats['uncategorized_products']}")
            print(f"🆕 Productos nuevos: {self.stats['new_products']}")
            print(f"🔄 Productos existentes: {self.stats['existing_products']}")
            print(f"🖼️ Imágenes guardadas: {self.stats['images_saved']}")
            print(f"❌ Errores de imágenes: {self.stats['image_errors']}")
            print(f"⚠️ Errores: {self.stats['errors']}")
            print(f"⏱️ Duración: {int(hours)}h {int(minutes)}m {int(seconds)}s")
            print("="*50)
            
        except Exception as e:
            print(f"\n❌ Error durante la ejecución: {str(e)}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    # Configurar argumentos de línea de comandos
    parser = argparse.ArgumentParser(description='Scraper de productos sin categoría de OfertasB')
    parser.add_argument('-l', '--limit', type=int, help='Limitar a un número específico de páginas')
    parser.add_argument('-s', '--start', type=int, default=1, help='Página desde la que comenzar')
    parser.add_argument('-d', '--debug', action='store_true', help='Modo debug con información adicional')
    args = parser.parse_args()
    
    # Crear e iniciar el scraper
    scraper = UncategorizedScraper()
    scraper.run(page_limit=args.limit, start_page=args.start, debug_mode=args.debug)
