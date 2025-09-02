from datetime import datetime
import os
from typing import Dict, Any
from supabase import create_client, Client

class SupabaseClient:
    def __init__(self):
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("Missing Supabase environment variables")
        
        self.client: Client = create_client(url, key)
        self._ensure_schema()
    
    def _ensure_schema(self):
        """Ensure the required tables and indexes exist"""
        # Try to query the tables to check if they exist
        try:
            self.client.table("categories").select("id").limit(1).execute()
        except Exception as e:
            print("Creating categories table...")
            # Here you would need to execute the CREATE TABLE SQL through a direct connection
            # Since Supabase's Python client doesn't support DDL, you'll need to create the tables
            # manually in the Supabase dashboard or use a migration tool
            pass

        try:
            self.client.table("products").select("id").limit(1).execute()
        except Exception as e:
            print("Creating products table...")
            # Same as above for products table
            pass
    
    def upsert_category(self, category_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Upsert a category and return the result
        """
        # First try to get existing category
        result = self.client.table("categories").select("*").eq("external_id", category_data["external_id"]).execute()
        
        data = {
            "external_id": category_data["external_id"],
            "name": category_data["name"],
            "source_url": category_data["source_url"],
            "last_crawled_at": datetime.utcnow().isoformat(),
            "seller_id": 1  # ID fijo para OfertasB
        }
        
        # Agregar product_count si está disponible
        if "product_count" in category_data:
            data["product_count"] = category_data["product_count"]
        
        if result.data:
            # Update existing category
            result = self.client.table("categories").update(data).eq("external_id", category_data["external_id"]).execute()
        else:
            # Insert new category
            result = self.client.table("categories").insert(data).execute()
        
        return result.data[0] if result.data else None

    def upsert_product(self, product_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Upsert a product and return the result.
        Uses external_product_id as the unique identifier to prevent duplicates.
        """
        try:
            print(f"\nIntentando upsert del producto {product_data.get('external_product_id')}...")
            
            # Preparar los datos del producto asegurándonos de que son del tipo correcto
            product = {
                "category_id": str(product_data["category_id"]),
                "external_product_id": str(product_data["external_product_id"]),
                "seller_id": 1,  # ID fijo para OfertasB
                "name": str(product_data["name"]),
                "product_url": str(product_data["product_url"]),
                "image_url": str(product_data["image_url"]),
                "price_raw": str(product_data["price_raw"]),
                "price_numeric": float(product_data["price_numeric"]),
                "currency": "CRC",
                "last_seen_at": datetime.utcnow().isoformat(),
                "source_html_hash": str(product_data["source_html_hash"])
            }
            
            # Si hay una URL de archivo de imagen, asegurarnos de que es string
            if "image_file_url" in product_data:
                if product_data["image_file_url"]:
                    product["image_file_url"] = str(product_data["image_file_url"])
                    print(f"Setting image_file_url for product {product_data['external_product_id']}: {product['image_file_url']}")
                else:
                    print(f"Warning: image_file_url is None for product {product_data['external_product_id']}")
            else:
                print(f"Warning: No image_file_url in product_data for {product_data['external_product_id']}")
            
            # Agregar campos adicionales si existen, asegurando que son strings
            if "estado" in product_data:
                product["estado"] = str(product_data["estado"])
            if "peso" in product_data:
                product["peso"] = str(product_data["peso"])
            if "categoria_full" in product_data:
                product["categoria_full"] = str(product_data["categoria_full"])
            
            print("Datos del producto preparados correctamente")
            
            # Realizar el upsert usando external_product_id como clave única
            try:
                result = self.client.table("products").upsert(
                    product,
                    on_conflict="external_product_id"
                ).execute()
                
                if not result.data:
                    print(f"Warning: No data returned after upserting product {product['external_product_id']}")
                    return None
                
                print(f"Producto {product['external_product_id']} guardado exitosamente")
                return result.data[0]
                
            except Exception as e:
                print(f"Error al hacer upsert del producto {product['external_product_id']}: {str(e)}")
                print(f"Response: {getattr(e, 'response', 'No response available')}")
                return None
            
        except Exception as e:
            print(f"Error upserting product {product_data.get('external_product_id', 'unknown')}: {str(e)}")
            return None
        
        return result.data[0] if result.data else None

    def upload_product_image(self, category_id: str, product_id: str, image_data: bytes) -> str:
        """
        Upload a product image to storage and return the public URL
        """
        try:
            if not isinstance(image_data, bytes):
                raise ValueError("Image data must be bytes")
                
            # Asegurarnos de que el nombre del archivo sea seguro
            safe_category_id = str(category_id).strip()
            safe_product_id = str(product_id).strip()
            
            # Construir la ruta del archivo
            bucket_path = f"{safe_category_id}/{safe_product_id}.jpg"
            
            try:
                # Intentar subir la imagen
                result = self.client.storage.from_("product-images").upload(
                    path=bucket_path,
                    file=image_data,
                    file_options={"contentType": "image/jpeg"}
                )
                
                print(f"Upload result for {bucket_path}: {result}")
                
                # Si llegamos aquí, la carga fue exitosa
                # Obtener la URL pública
                try:
                    public_url = self.client.storage.from_("product-images").get_public_url(bucket_path)
                    print(f"Generated public URL for {bucket_path}: {public_url}")
                    
                    if public_url:
                        return public_url
                    else:
                        print(f"Warning: No public URL generated for {bucket_path}")
                        return None
                except Exception as url_error:
                    print(f"Error getting public URL: {str(url_error)}")
                    return None
                    
            except Exception as upload_error:
                print(f"Error during upload: {str(upload_error)}")
                return None
                
        except Exception as e:
            print(f"Error in upload_product_image: {str(e)}")
            return None
            
        except Exception as e:
            print(f"Error uploading image for product {product_id}: {str(e)}")
            return None
