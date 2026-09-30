/* Calendar-month readiness comparisons. Source dates, not upload order, choose each month's observation. */
function commandCalendarMonth(value) {
  const month = String(value == null ? "" : value).trim();
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) && Number(month.slice(0, 4)) > 0 ? month : "";
}

function commandCalendarPreviousMonth(value) {
  const month = commandCalendarMonth(value);
  if (!month) return "";
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5));
  if (year === 1 && number === 1) return "";
  return String(number === 1 ? year - 1 : year).padStart(4, "0") + "-" + String(number === 1 ? 12 : number - 1).padStart(2, "0");
}

function commandCalendarMonthLabel(value) {
  const month = commandCalendarMonth(value);
  if (!month) return "";
  return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(month.slice(5)) - 1] + " " + month.slice(0, 4);
}

function commandCalendarMonths(ship, nowISO) {
  const timeline = commandTimeline(ship, commandNow(nowISO));
  return Array.from(new Set(timeline.snapshots.map(item => item.date.slice(0, 7)))).sort();
}

function commandCalendarEndpoint(timeline, month) {
  const observations = timeline.snapshots.filter(item => item.date.slice(0, 7) === month);
  const wrapper = observations.length ? observations[observations.length - 1] : null;
  return {
    month,
    label: commandCalendarMonthLabel(month),
    available: !!wrapper,
    observation: wrapper,
    sourceDate: wrapper ? wrapper.date : "",
    sourceAt: wrapper ? wrapper.at : "",
    metrics: wrapper ? commandMetrics(wrapper.snapshot) : null,
    observations,
    reportCount: observations.length
  };
}

function commandCalendarCompare(ship, options) {
  const opts = options || {};
  const now = commandNow(opts.nowISO);
  const month = opts.month == null || opts.month === "" ? new Date(now).toISOString().slice(0, 7) : commandCalendarMonth(opts.month);
  const baselineMonth = opts.baselineMonth == null || opts.baselineMonth === "" ? commandCalendarPreviousMonth(month) : commandCalendarMonth(opts.baselineMonth);
  const timeline = commandTimeline(ship, now);
  const empty = commandEmptyChanges();
  const result = {
    available: false,
    reason: "",
    mode: "calendar",
    month,
    baselineMonth,
    monthLabel: commandCalendarMonthLabel(month),
    baselineMonthLabel: commandCalendarMonthLabel(baselineMonth),
    timeline,
    baseline: null,
    end: null,
    before: null,
    after: null,
    baselinePeriod: commandCalendarEndpoint(timeline, baselineMonth),
    period: commandCalendarEndpoint(timeline, month),
    counts: empty.counts,
    rows: empty.rows,
    net: null,
    matchedPeople: 0,
    caveats: timeline.warnings.slice()
  };
  if (!month || !baselineMonth) { result.reason = "Choose valid calendar months."; return result; }
  if (baselineMonth >= month) { result.reason = "Choose a baseline month before the selected month."; return result; }
  result.baseline = result.baselinePeriod.observation;
  result.end = result.period.observation;
  result.before = result.baselinePeriod.metrics;
  result.after = result.period.metrics;
  const missing = [result.baselinePeriod, result.period].filter(period => !period.available).map(period => period.label);
  if (missing.length) {
    result.reason = "No dated source report for " + missing.join(" or ") + ".";
    return result;
  }
  const changes = commandPair(result.baseline, result.end);
  result.counts = changes.counts;
  result.rows = changes.rows;
  result.net = {};
  ["officerCount", "current", "need", "loss", "unknown", "shipQual", "approaching", "totalHours", "totalQ", "totalUI"].forEach(key => {
    result.net[key] = result.after[key] - result.before[key];
  });
  result.matchedPeople = Object.keys(result.baseline.snapshot.officerStates).filter(key => Object.prototype.hasOwnProperty.call(result.end.snapshot.officerStates, key)).length;
  result.available = true;
  result.reason = "Latest dated source report in each calendar month.";
  result.caveats.push("Status is as of each month's displayed source date. Month-end condition and exact change dates are unknown.");
  result.caveats.push("Lost currency, proficiency levels, and roster changes are separate measures.");
  return result;
}

function commandCalendarFleet(ships, options) {
  const opts = options || {};
  const now = commandNow(opts.nowISO);
  const month = opts.month == null || opts.month === "" ? new Date(now).toISOString().slice(0, 7) : commandCalendarMonth(opts.month);
  const baselineMonth = opts.baselineMonth == null || opts.baselineMonth === "" ? commandCalendarPreviousMonth(month) : commandCalendarMonth(opts.baselineMonth);
  const empty = commandEmptyChanges();
  const result = {
    available: false,
    reason: "",
    month,
    baselineMonth,
    monthLabel: commandCalendarMonthLabel(month),
    baselineMonthLabel: commandCalendarMonthLabel(baselineMonth),
    rows: [],
    shipCount: 0,
    comparedShipCount: 0,
    missingShipCount: 0,
    matchedPeople: 0,
    counts: empty.counts,
    changes: empty.rows,
    before: null,
    after: null,
    net: null
  };
  (Array.isArray(ships) ? ships : []).forEach(ship => {
    const comparison = commandCalendarCompare(ship, Object.assign({}, opts, { nowISO: now }));
    result.rows.push({ ship, name: ship && ship.name || "", comparison });
    result.shipCount++;
    if (!comparison.available) { result.missingShipCount++; return; }
    result.comparedShipCount++;
    result.matchedPeople += comparison.matchedPeople;
    Object.keys(result.counts).forEach(key => {
      result.counts[key] += comparison.counts[key];
      result.changes[key].push(...comparison.rows[key].map(row => Object.assign({}, row, { shipName: ship && ship.name || "" })));
    });
    if (!result.before) { result.before = {}; result.after = {}; result.net = {}; }
    Object.keys(comparison.net).forEach(key => {
      result.before[key] = (result.before[key] || 0) + comparison.before[key];
      result.after[key] = (result.after[key] || 0) + comparison.after[key];
      result.net[key] = result.after[key] - result.before[key];
    });
  });
  result.available = result.comparedShipCount > 0;
  result.reason = result.available ? "Compared ships have a dated source report in both months." : !month || !baselineMonth ? "Choose valid calendar months." : baselineMonth >= month ? "Choose a baseline month before the selected month." : "No ship has a dated source report in both months.";
  return result;
}
