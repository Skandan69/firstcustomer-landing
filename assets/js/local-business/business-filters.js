export const DEFAULT_FILTERS = Object.freeze({ website: 'all', rating: 0, reviews: 0, phone: false, category: '', sort: 'opportunity' });

export function filterBusinesses(businesses, filters) {
  const result = businesses.filter((business) => {
    const hasWebsite = Boolean(business.website);
    if (filters.website === 'none' && hasWebsite) return false;
    if (filters.website === 'available' && !hasWebsite) return false;
    if (filters.website === 'unreachable' && business.websiteStatus !== 'unreachable') return false;
    if (filters.rating && Number(business.rating || 0) < filters.rating) return false;
    if (filters.reviews && Number(business.reviewCount || 0) < filters.reviews) return false;
    if (filters.phone && !business.phone) return false;
    if (filters.category && business.category !== filters.category) return false;
    return true;
  });
  return result.sort((a, b) => filters.sort === 'rating' ? Number(b.rating || 0) - Number(a.rating || 0) : filters.sort === 'reviews' ? b.reviewCount - a.reviewCount : filters.sort === 'name' ? a.name.localeCompare(b.name) : opportunityPlaceholder(b) - opportunityPlaceholder(a));
}

// Placeholder only: rewards established businesses with a missing/unverified website; not a final score.
function opportunityPlaceholder(business) { return (business.rating >= 4 ? 2 : 0) + (business.reviewCount >= 20 ? 2 : 0) + (!business.website ? 3 : business.websiteStatus === 'unreachable' ? 2 : 0); }
