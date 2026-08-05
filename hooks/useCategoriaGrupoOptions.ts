import { useMemo } from 'react';

/**
 * Deriva, memoizado, la lista de categorias presentes en `rows` y la lista
 * de grupos de la categoria activa. Centraliza un patron duplicado en
 * AdminPanel/AdminPartidos/OrganizadorTorneoDetail (`[...new Set(rows.map(...))].sort()`),
 * que ademas se usaba sin useMemo como dependencia de otros useEffect,
 * generando reejecuciones por identidad de array nueva en cada render.
 */
export function useCategoriaGrupoOptions<T>(
  rows: T[],
  getCategoria: (row: T) => string | null | undefined,
  getGrupo: (row: T) => string | null | undefined,
  activeCategoria: string
): { categorias: string[]; gruposDeCategoria: string[] } {
  const categorias = useMemo(
    () => [...new Set(rows.map(getCategoria).filter((c): c is string => Boolean(c)))].sort(),
    [rows, getCategoria]
  );

  const gruposDeCategoria = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter((row) => getCategoria(row) === activeCategoria)
            .map(getGrupo)
            .filter((g): g is string => Boolean(g))
        ),
      ].sort(),
    [rows, getCategoria, getGrupo, activeCategoria]
  );

  return { categorias, gruposDeCategoria };
}
