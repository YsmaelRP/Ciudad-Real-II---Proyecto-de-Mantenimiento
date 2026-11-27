import { apiRequest, ApiError } from './client';

export type Category = {
  id: string;
  name: string;
  description: string | null;
};

function parseCategory(value: unknown): Category {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' ||
      !('name' in value) || typeof value.name !== 'string' ||
      !('description' in value) ||
      (value.description !== null && typeof value.description !== 'string')) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'La API devolvió una categoría no válida.');
  }
  return { id: value.id, name: value.name, description: value.description };
}

export async function getCategories(signal?: AbortSignal): Promise<Category[]> {
  const data = await apiRequest<unknown>('/categories', { signal });
  if (!data || typeof data !== 'object' || !('categories' in data) || !Array.isArray(data.categories)) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'La API devolvió una lista de categorías no válida.');
  }
  return data.categories.map(parseCategory);
}
