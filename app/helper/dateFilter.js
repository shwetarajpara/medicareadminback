const moment = require('moment');

// Shared date filter for the admin lists (Patients, Billing, IPD,
// Certificates). Input — from the request body or query string:
//   dateFilter       'today' | 'week' | 'month' | 'lastMonth' | 'custom' | '' (all time)
//   fromDate/toDate  'YYYY-MM-DD', used when dateFilter is 'custom' (either may be blank)
//   tzOffsetMinutes  the browser's new Date().getTimezoneOffset() (IST = -330), so
//                    "today" is the clinic's today, not the server's UTC day.
//                    Without it the server's own timezone is used, as before.
//
// Returns a Mongo range ({ $gte, $lte }) for the date field, or null when no
// filter applies.
const parseDateFilter = (src = {}) => {
    const { dateFilter, fromDate, toDate } = src;
    if (!dateFilter) return null;

    const offsetRaw = Number(src.tzOffsetMinutes);
    const hasOffset = src.tzOffsetMinutes !== undefined && src.tzOffsetMinutes !== '' && Number.isFinite(offsetRaw);
    // moment's utcOffset is minutes AHEAD of UTC — the opposite sign of getTimezoneOffset().
    const now = () => (hasOffset ? moment().utcOffset(-offsetRaw) : moment());
    const day = (value) => {
        const m = hasOffset
            ? moment.utc(value, 'YYYY-MM-DD', true).utcOffset(-offsetRaw, true)
            : moment(value, 'YYYY-MM-DD', true);
        return m.isValid() ? m : null;
    };

    let start;
    let end;
    switch (dateFilter) {
        case 'today':
            start = now().startOf('day'); end = now().endOf('day');
            break;
        case 'week':
            start = now().startOf('week'); end = now().endOf('week');
            break;
        case 'month':
            start = now().startOf('month'); end = now().endOf('month');
            break;
        case 'lastMonth':
            start = now().subtract(1, 'month').startOf('month'); end = now().subtract(1, 'month').endOf('month');
            break;
        case 'custom': {
            start = fromDate ? day(fromDate) : null;
            end = toDate ? day(toDate) : null;
            if (!start && !end) return null;
            if (start && end && start.isAfter(end)) [start, end] = [end, start];
            start = start ? start.clone().startOf('day') : null;
            end = end ? end.clone().endOf('day') : null;
            break;
        }
        default:
            return null;
    }

    const range = {};
    if (start) range.$gte = start.toDate();
    if (end) range.$lte = end.toDate();
    return range;
};

module.exports = { parseDateFilter };
