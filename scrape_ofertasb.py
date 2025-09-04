    def process_product_card(self, product_table: BeautifulSoup, category_id: str) -> Dict:
        """Extract product information from a product table without visiting the product page."""
        try:
            details = {}  # Inicializar details como un diccionario vacío

            # Obtener enlace del producto y extraer el ID
            img_row = product_table.find('tr').find('td').find('a')
            if not img_row or not img_row.get('href'):
                raise ValueError("Could not find product link")
            product_url = urljoin(BASE_URL, img_row['href'])
            external_product_id = product_url.split('id=')[-1]  # Extraer el ID del producto

            # Obtener imagen de la lista primero
            img_elem = img_row.find('img')
            if not img_elem:
                raise ValueError("Could not find product image")
            list_image = urljoin(BASE_URL, img_elem['src'])

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
            details['price_raw'] = price_raw
            _, price_numeric = parse_price(price_raw)
            details['price_numeric'] = price_numeric

            # Validar que price_numeric es válido
            if 'price_numeric' not in details or not isinstance(details['price_numeric'], (int, float)):
                raise ValueError(f"Invalid price_numeric for product {external_product_id}: {details.get('price_numeric')}")

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
                    print(f"Saltando producto {external_product_id} - no hay cambios")
                    return None

            # Retornar datos básicos del producto
            return {
                "external_product_id": external_product_id,
                "product_url": product_url,
                "image_url": list_image,
                "name": product_name,
                "price_raw": price_raw,
                "price_numeric": float(details['price_numeric']),
                "source_html_hash": current_hash,
                "category_id": category_id
            }

        except Exception as e:
            print(f"Error processing product: {str(e)}")
            return None