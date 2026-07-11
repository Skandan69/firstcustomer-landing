export const DEFAULT_FILTERS = Object.freeze({ website: 'all', rating: 0, reviews: 0, phone: false, source: '', category: '', businessStatus: '', sort: 'website-opportunity' });

export function filterBusinesses(businesses, filters) {
  return [...businesses].filter((business) => {
    const hasWebsite = Boolean(business.website);
    if (filters.website === 'none' && hasWebsite) return false;
    if (filters.website === 'available' && !hasWebsite) return false;
    if (filters.rating && (business.rating === null || business.rating < filters.rating)) return false;
    if (filters.reviews && (business.reviewCount === null || business.reviewCount < filters.reviews)) return false;
    if (filters.phone && !(business.phone || business.internationalPhone)) return false;
    if (filters.source && business.source !== filters.source) return false;
    if (filters.category && business.category !== filters.category) return false;
    if (filters.businessStatus && business.businessStatus !== filters.businessStatus) return false;
    return true;
  }).sort(sorter(filters.sort));
}

function sorter(sort) {
  if (sort === 'rating') return (a, b) => (b.rating ?? -1) - (a.rating ?? -1);
  if (sort === 'reviews') return (a, b) => b.reviewCount - a.reviewCount;
  if (sort === 'name') return (a, b) => a.name.localeCompare(b.name);
  return (a, b) => Number(Boolean(a.website)) - Number(Boolean(b.website)) || (b.rating ?? -1) - (a.rating ?? -1) || b.reviewCount - a.reviewCount;
}
