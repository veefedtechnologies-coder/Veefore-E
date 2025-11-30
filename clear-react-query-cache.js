// Script to clear React Query persisted cache from localStorage
// Run this in browser console to clear cached data

console.log('🧹 Clearing React Query persisted cache...');

// Clear all React Query cache
const keysToRemove = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && (key.startsWith('REACT_QUERY_OFFLINE_CACHE') || key.startsWith('tanstack-query'))) {
    keysToRemove.push(key);
  }
}

keysToRemove.forEach(key => {
  console.log(`Removing: ${key}`);
  localStorage.removeItem(key);
});

console.log(`✅ Cleared ${keysToRemove.length} cache entries`);
console.log('🔄 Please refresh the page to see fresh data');

