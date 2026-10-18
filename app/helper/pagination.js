// Shared server-side pagination for admin list endpoints.
//
// Opt-in: a list only paginates when the request carries `page`. Callers
// that don't (patient pickers, dashboard stats, the patient app) keep
// getting the full, unpaginated response exactly as before.

const MAX_LIMIT = 100;

// -> { page, limit, skip, all } when pagination was requested, else null.
// `limit: 0` (or "all") means "every matching row on one page" — the list
// still gets its pagination block and search/filters, just no page cut.
const parsePagination = (source = {}) => {
    if (source.page === undefined || source.page === null || source.page === '') return null;
    if (String(source.limit) === '0' || String(source.limit).toLowerCase() === 'all') {
        return { page: 1, limit: 0, skip: 0, all: true };
    }
    const page = Math.max(1, parseInt(source.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(source.limit, 10) || 10));
    return { page, limit, skip: (page - 1) * limit, all: false };
};

// Aggregation stages that cut out the requested page (none for "all").
const pageStages = (pagination) =>
    pagination.all ? [] : [{ $skip: pagination.skip }, { $limit: pagination.limit }];

// Standard pagination block every paginated list returns alongside its rows.
const paginationMeta = ({ page, limit, all }, totalRecords) => ({
    page,
    limit,
    totalRecords,
    totalPages: all ? 1 : Math.max(1, Math.ceil(totalRecords / limit)),
});

// User-typed search text → safe case-insensitive regex (no regex injection).
const searchRegex = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return null;
    return new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
};

module.exports = { parsePagination, paginationMeta, pageStages, searchRegex, MAX_LIMIT };
