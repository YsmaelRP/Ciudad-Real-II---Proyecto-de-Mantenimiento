export type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
};

export type Category = {
  id: string;
  name: string;
  description: string | null;
};

export interface CategoryRepository {
  listActive(): Promise<Category[]>;
}

// Los identificadores se exponen como texto, igual que en las respuestas de usuario.
export function publicCategory(row: CategoryRow): Category {
  return { id: String(row.id), name: row.name, description: row.description };
}
