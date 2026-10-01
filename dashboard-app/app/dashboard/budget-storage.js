export function getBudgetStorageKey(email) {
  return `hoje-dashboard-monthly-budget-${email || 'guest'}`;
}

export function readLocalBudget(email) {
  const storedBudget = localStorage.getItem(getBudgetStorageKey(email));
  if (storedBudget === null) return null;
  const budget = Number(storedBudget);
  return Number.isFinite(budget) && budget >= 0 ? budget : null;
}

export function saveLocalBudget(email, budget) {
  localStorage.setItem(getBudgetStorageKey(email), String(budget));
  window.dispatchEvent(new CustomEvent('dashboard-budget-updated', { detail: budget }));
}
