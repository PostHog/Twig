import type {
  ActiveFilters,
  FilterCategory,
  FilterValue,
} from "@features/tasks/stores/taskStore";

const normalizeFilters = (filters: ActiveFilters) => {
  const sorted: Record<string, Array<{ value: string; operator: string }>> = {};
  for (const [key, values] of Object.entries(filters)) {
    if (values && values.length > 0) {
      sorted[key] = [...values].sort((a, b) =>
        `${a.value}:${a.operator}`.localeCompare(`${b.value}:${b.operator}`),
      );
    }
  }
  return JSON.stringify(sorted);
};

export function filtersMatch(
  filters1: ActiveFilters,
  filters2: ActiveFilters,
): boolean {
  return normalizeFilters(filters1) === normalizeFilters(filters2);
}

export function filterIsEmpty(filters: ActiveFilters): boolean {
  return Object.values(filters).every(
    (values) => !values || values.length === 0,
  );
}

export function filterHasKey(
  filters: ActiveFilters,
  key: FilterCategory,
): boolean {
  const values = filters[key];
  return Boolean(values && values.length > 0);
}

export function getFilterCount(filters: ActiveFilters): number {
  return Object.values(filters).reduce(
    (count, values) => count + (values?.length ?? 0),
    0,
  );
}

export function addFilterValue(
  filters: ActiveFilters,
  key: FilterCategory,
  value: string,
  operator: string,
): ActiveFilters {
  const existing = filters[key] ?? [];
  const alreadyExists = existing.some(
    (item: FilterValue) => item.value === value && item.operator === operator,
  );

  if (alreadyExists) {
    return filters;
  }

  return {
    ...filters,
    [key]: [...existing, { value, operator }],
  };
}

export function removeFilterValue(
  filters: ActiveFilters,
  key: FilterCategory,
  value: string,
  operator: string,
): ActiveFilters {
  const existing = filters[key];
  if (!existing || existing.length === 0) {
    return filters;
  }

  const updated = existing.filter(
    (item: FilterValue) =>
      !(item.value === value && item.operator === operator),
  );

  if (updated.length === 0) {
    const newFilters = { ...filters };
    delete newFilters[key];
    return newFilters;
  }

  return {
    ...filters,
    [key]: updated,
  };
}

export function clearFilterKey(
  filters: ActiveFilters,
  key: FilterCategory,
): ActiveFilters {
  const newFilters = { ...filters };
  delete newFilters[key];
  return newFilters;
}

export function clearAllFilters(): ActiveFilters {
  return {};
}

export function toggleFilterValue(
  filters: ActiveFilters,
  key: FilterCategory,
  value: string,
  operator: string,
): ActiveFilters {
  const existing = filters[key] ?? [];
  const exists = existing.some(
    (item: FilterValue) => item.value === value && item.operator === operator,
  );

  if (exists) {
    return removeFilterValue(filters, key, value, operator);
  }

  return addFilterValue(filters, key, value, operator);
}

export function mergeFilters(
  filters1: ActiveFilters,
  filters2: ActiveFilters,
): ActiveFilters {
  const merged: ActiveFilters = { ...filters1 };

  for (const [key, values] of Object.entries(filters2) as [
    FilterCategory,
    FilterValue[],
  ][]) {
    if (!values || values.length === 0) {
      continue;
    }

    const existing = merged[key] ?? [];
    const newValues = values.filter(
      (newItem: FilterValue) =>
        !existing.some(
          (existingItem: FilterValue) =>
            existingItem.value === newItem.value &&
            existingItem.operator === newItem.operator,
        ),
    );

    merged[key] = [...existing, ...newValues];
  }

  return merged;
}

export function getFilterValues(
  filters: ActiveFilters,
  key: FilterCategory,
): FilterValue[] {
  return filters[key] ?? [];
}

export function hasFilterValue(
  filters: ActiveFilters,
  key: FilterCategory,
  value: string,
  operator: string,
): boolean {
  const values = filters[key];
  if (!values || values.length === 0) {
    return false;
  }

  return values.some(
    (item: FilterValue) => item.value === value && item.operator === operator,
  );
}

export function getFilterKeys(filters: ActiveFilters): FilterCategory[] {
  return (Object.keys(filters) as FilterCategory[]).filter((key) => {
    const values = filters[key];
    return values && values.length > 0;
  });
}

export function replaceFilterKey(
  filters: ActiveFilters,
  key: FilterCategory,
  values: FilterValue[],
): ActiveFilters {
  if (!values || values.length === 0) {
    return clearFilterKey(filters, key);
  }

  return {
    ...filters,
    [key]: values,
  };
}

export function filtersByOperator(
  filters: ActiveFilters,
  targetOperator: string,
): ActiveFilters {
  const filtered: ActiveFilters = {};

  for (const [key, values] of Object.entries(filters) as [
    FilterCategory,
    FilterValue[],
  ][]) {
    if (!values || values.length === 0) {
      continue;
    }

    const matchingValues = values.filter(
      (item: FilterValue) => item.operator === targetOperator,
    );

    if (matchingValues.length > 0) {
      filtered[key] = matchingValues;
    }
  }

  return filtered;
}

export function excludeFiltersByOperator(
  filters: ActiveFilters,
  excludeOperator: string,
): ActiveFilters {
  const filtered: ActiveFilters = {};

  for (const [key, values] of Object.entries(filters) as [
    FilterCategory,
    FilterValue[],
  ][]) {
    if (!values || values.length === 0) {
      continue;
    }

    const matchingValues = values.filter(
      (item: FilterValue) => item.operator !== excludeOperator,
    );

    if (matchingValues.length > 0) {
      filtered[key] = matchingValues;
    }
  }

  return filtered;
}
