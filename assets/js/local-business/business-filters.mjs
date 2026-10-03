export const DEFAULT_FILTERS = Object.freeze({ website: 'all', rating: 0, reviews: 0, phone: false, opportunity: 0, source: '', category: '', businessStatus: '', sort: 'opportunity' });

export function filterBusinesses(businesses, filters) {
  return [...businesses].filter((business) => {
    const hasWebsite = Boolean(business.website);
    if (filters.website === 'none' && hasWebsite) return false;
    if (filters.website === 'available' && !hasWebsite) return false;
    if (filters.rating && (business.rating === null || business.rating < filters.rating)) return false;
    if (filters.reviews && (business.reviewCount === null || business.reviewCount < filters.reviews)) return false;
    if (filters.phone && !business.phone) return false;
    if (filters.opportunity && Number(business.opportunity?.score || 0) < filters.opportunity) return false;
    if (filters.source && business.provider !== filters.source) return false;
    if (filters.category && business.category !== filters.category) return false;
    if (filters.businessStatus && business.businessStatus !== filters.businessStatus) return false;
    return true;
  }).sort(sorter(filters.sort));
}

function sorter(sort) {
  if (sort === 'rating') return (a, b) => (b.rating ?? -1) - (a.rating ?? -1);
  if (sort === 'reviews') return (a, b) => (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
  if (sort === 'name') return (a, b) => a.name.localeCompare(b.name);
  if (sort === 'website-opportunity') sort = 'opportunity';
  if (sort === 'opportunity') return (a, b) =>
    Number(b.opportunity?.score || 0) - Number(a.opportunity?.score || 0)
    || Number(Boolean(a.website)) - Number(Boolean(b.website))
    || (b.rating ?? -1) - (a.rating ?? -1)
    || (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
  return () => 0;
}
