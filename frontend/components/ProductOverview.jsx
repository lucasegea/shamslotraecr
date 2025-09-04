'use client';

import { useState, useEffect } from 'react';
import { getCategories, getProducts } from '@/lib/database';

export default function ProductOverview() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const categoriesData = await getCategories();
        const productsData = await Promise.all(
          categoriesData.map(async (category) => {
            const result = await getProducts({ categoryId: category.id, limit: 1000 });
            return { ...category, products: result.products };
          })
        );
        setCategories(productsData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return <p>Cargando datos...</p>;
  }

  const totalProducts = categories.reduce((sum, cat) => sum + cat.products.length, 0);
  const totalCategories = categories.length;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Resumen de Productos</h1>
      <p className="mb-4">Total de productos: {totalProducts}</p>
      <p className="mb-4">Total de categorías: {totalCategories}</p>
      <div className="space-y-4">
        {categories.map((category) => (
          <div key={category.id} className="border p-4 rounded">
            <h2 className="text-xl font-semibold mb-2">{category.name} ({category.products.length} productos)</h2>
            <ul className="list-disc pl-5">
              {category.products.map((product) => (
                <li key={product.id}>{product.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
