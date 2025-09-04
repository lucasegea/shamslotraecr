"""
Script para verificar y arreglar problemas con categorías faltantes en Supabase
"""
import os
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

def fix_categories():
    """Verificar y arreglar problemas con categorías faltantes"""
    # Verificar variables de entorno
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("Error: Variables de entorno faltantes")
        print(f"SUPABASE_URL: {'✓ Configurada' if url else '❌ Faltante'}")
        print(f"SUPABASE_SERVICE_ROLE_KEY: {'✓ Configurada' if key else '❌ Faltante'}")
        print("\nSolución: Crear un archivo .env en la carpeta ofertasb-scraper con el siguiente contenido:")
        print("SUPABASE_URL=tu_url_de_supabase")
        print("SUPABASE_SERVICE_ROLE_KEY=tu_clave_de_servicio")
        return
    
    try:
        # Conectar a Supabase
        print("Conectando a Supabase...")
        client = create_client(url, key)
        
        # Verificar conexión
        print("Verificando conexión...")
        test_query = client.table("categories").select("count").limit(1).execute()
        print("Conexión exitosa ✓")
        
        # Buscar categoría 199
        print("\nVerificando categoría 199...")
        category_query = client.table("categories").select("*").eq("external_id", "199").execute()
        
        if category_query.data:
            print(f"Categoría 199 encontrada: {category_query.data[0]['name']}")
        else:
            print("Categoría 199 no encontrada. Creándola...")
            
            # Datos de la categoría
            category_data = {
                "external_id": "199",
                "name": "Accesorios para celular",
                "source_url": "https://www.ofertasb.com/productos_cat.asp?id=199",
                "last_crawled_at": datetime.utcnow().isoformat(),
                "seller_id": 1
            }
            
            # Insertar categoría
            result = client.table("categories").insert(category_data).execute()
            
            if result.data:
                print(f"✅ Categoría 199 creada correctamente con ID interno: {result.data[0]['id']}")
            else:
                print("❌ Error al crear la categoría")
                print(f"Error: {result}")
        
        # Listar todas las categorías
        print("\nListando todas las categorías:")
        all_categories = client.table("categories").select("id, external_id, name").order("id").execute()
        
        if all_categories.data:
            for cat in all_categories.data:
                print(f"- ID: {cat['id']}, External ID: {cat['external_id']}, Nombre: {cat['name']}")
        else:
            print("No se encontraron categorías")
            
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    fix_categories()
