export const productCategoryGroups = [
  {
    id: 'departments',
    label: 'Departamentos e tipos',
    categories: ['Hortifruti', 'Açougue', 'Padaria', 'Mercearia', 'Sucos e Refrigerantes', 'Água', 'Vinhos', 'Bebidas Alcoólicas', 'Cervejas', 'Produtos de Limpeza', 'Lavanderia', 'Pet Shop', 'Higiene Pessoal', 'Bomboniere', 'Laticínios', 'Bebês'],
  },
  {
    id: 'brands',
    label: 'Marcas',
    categories: ['Triex', 'Nestlé', 'Bauducco', 'Fini', 'Sanjer', 'Sadia', 'Marba', 'Lacta', 'Heineken', 'Stella', 'Casillero del Diablo', 'Casa Valduga'],
  },
];

export const productMainCategories = productCategoryGroups.flatMap((group) => group.categories);
