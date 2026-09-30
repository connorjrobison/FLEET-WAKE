/* Fleet WAKE command evidence engine. Pure snapshot analytics: no live logs or state reads. */
function commandTimestamp(value) {
  if (value == null || String(value).trim() === "") return null;
  const raw = String(value).trim();
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  // A month or year alone is not evidence for an invented first-day observation.
  if (!parts) return null;
  if (parts) {
    const check = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
    if (check.getUTCFullYear() !== Number(parts[1]) || check.getUTCMonth() + 1 !== Number(parts[2]) || check.getUTCDate() !== Number(parts[3])) return null;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function commandNow(value) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : commandTimestamp(value);
  return parsed == null ? Date.now() : parsed;
}

function commandDay(value) {
  const parsed = commandTimestamp(value);
  return parsed == null ? "" : new Date(parsed).toISOString().slice(0, 10);
}

function commandNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function commandStable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(commandStable).join(",") + "]";
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + commandStable(value[key])).join(",") + "}";
}

function commandSnapshotOrder(a, b) {
  const uploadedA = commandTimestamp(a.snapshot.importedAt);
  const uploadedB = commandTimestamp(b.snapshot.importedAt);
  const sequenceA = commandNumber(a.snapshot.observationSequence) || 0;
  const sequenceB = commandNumber(b.snapshot.observationSequence) || 0;
  return (uploadedA == null ? -Infinity : uploadedA) - (uploadedB == null ? -Infinity : uploadedB) ||
    sequenceA - sequenceB ||
    (a.at === b.at ? Number(!!a.currentSource) - Number(!!b.currentSource) : 0) ||
    a.retainedOrder - b.retainedOrder;
}

function commandCorrectionOrder(selected, prior) {
  if (commandTimestamp(selected.snapshot.importedAt) !== commandTimestamp(prior.snapshot.importedAt)) return "upload";
  if ((commandNumber(selected.snapshot.observationSequence) || 0) !== (commandNumber(prior.snapshot.observationSequence) || 0)) return "sequence";
  if (selected.currentSource !== prior.currentSource) return "current-source";
  return "retained-order";
}

function commandTimeline(ship, nowISO) {
  const now = commandNow(nowISO);
  const result = { snapshots: [], undated: [], excluded: [], duplicates: [], conflicts: [], warnings: [] };
  const candidates = [];
  (Array.isArray(ship && ship.snapshots) ? ship.snapshots : []).forEach((snapshot, retainedOrder) => {
    if (!snapshot || snapshot.authoritativeBridge === false) {
      result.excluded.push({ snapshot, reason: "Not an authoritative bridge roster snapshot." });
      return;
    }
    if (!snapshot.officerStates || typeof snapshot.officerStates !== "object" || Array.isArray(snapshot.officerStates)) {
      result.excluded.push({ snapshot, reason: "Snapshot has no preserved roster evidence." });
      return;
    }
    const sourceTime = commandTimestamp(snapshot.sourceGeneratedAt);
    const uploadTime = commandTimestamp(snapshot.importedAt);
    const time = sourceTime == null ? uploadTime : sourceTime;
    const wrapper = {
      snapshot,
      at: time == null ? "" : new Date(time).toISOString(),
      date: time == null ? "" : new Date(time).toISOString().slice(0, 10),
      basis: sourceTime == null ? "upload" : "source",
      dated: sourceTime != null,
      corrected: false,
      retainedOrder,
      currentSource: sourceTime != null && sourceTime === commandTimestamp(ship && ship.sourceGeneratedAt) &&
        !!String(snapshot.sourceFingerprint || "").trim() && String(snapshot.sourceFingerprint).trim() === String(ship && ship.sourceFingerprint || "").trim()
    };
    if (sourceTime != null && sourceTime > now) {
      result.excluded.push({ snapshot, wrapper, reason: "Source date is in the future; excluded from evidence chronology." });
      return;
    }
    candidates.push(wrapper);
  });
  // A repeated source fingerprint is one observation, however often it was uploaded.
  const seen = new Map();
  candidates.sort((a, b) => Number(b.dated) - Number(a.dated) || commandSnapshotOrder(a, b)).forEach(wrapper => {
    const fingerprint = String(wrapper.snapshot.sourceFingerprint || "").trim();
    if (fingerprint && seen.has(fingerprint)) {
      result.duplicates.push({ selected: seen.get(fingerprint), duplicate: wrapper, reason: "Repeated source fingerprint." });
      return;
    }
    if (fingerprint) seen.set(fingerprint, wrapper);
    if (!wrapper.dated) result.undated.push(wrapper);
    else result.snapshots.push(wrapper);
  });
  const grouped = new Map();
  result.snapshots.forEach(wrapper => {
    if (!grouped.has(wrapper.at)) grouped.set(wrapper.at, []);
    grouped.get(wrapper.at).push(wrapper);
  });
  result.snapshots = Array.from(grouped.values()).map(group => {
    group.sort(commandSnapshotOrder);
    const selected = group[group.length - 1];
    if (group.length > 1) {
      const distinct = new Set(group.map(item => commandStable({ phase: item.snapshot.phase, officerStates: item.snapshot.officerStates })));
      if (distinct.size > 1) {
        selected.corrected = true;
        const selectionBasis = commandCorrectionOrder(selected, group[group.length - 2]);
        const orderAmbiguous = selectionBasis === "retained-order";
        result.conflicts.push({ at: selected.at, date: selected.date, selected, alternatives: group.slice(0, -1), selectionBasis, orderAmbiguous,
          reason: orderAmbiguous ? "Different exports share this source time and upload time without a resolving observation sequence. Retained snapshot order is used provisionally; verify which correction is authoritative." : selectionBasis === "sequence" ? "Different exports share this source time and upload time. The later recorded observation sequence is used; earlier versions remain retained." : selectionBasis === "current-source" ? "Different legacy exports share this source and upload time. The version matching the ship's current source fingerprint is used; earlier versions remain retained." : "Different exports share this source time. The latest uploaded version is used; earlier versions remain retained." });
      } else {
        group.slice(0, -1).forEach(duplicate => result.duplicates.push({ selected, duplicate, reason: "Repeated identical roster at the same source time." }));
      }
    }
    return selected;
  }).sort((a, b) => a.at.localeCompare(b.at));
  result.undated.sort(commandSnapshotOrder);
  if (result.undated.length) result.warnings.push(result.undated.length + " undated export(s) retained separately; upload dates do not establish historical readiness.");
  if (result.conflicts.length) result.warnings.push(result.conflicts.length + " source time(s) have competing versions; the selected correction and ordering basis are flagged.");
  const ambiguous = result.conflicts.filter(conflict => conflict.orderAmbiguous).length;
  if (ambiguous) result.warnings.push(ambiguous + " source correction(s) have unresolved import order. Retained order is provisional; confirm the authoritative version before relying on its changes.");
  if (result.duplicates.length) result.warnings.push(result.duplicates.length + " repeated observation(s) excluded from change totals.");
  if (result.excluded.length) result.warnings.push(result.excluded.length + " snapshot(s) excluded from usable chronology.");
  return result;
}

function commandCategory(officer) {
  const value = String(officer && officer.currencyCategory || "").trim();
  if (["Current", "Need", "Loss", "Unknown"].includes(value)) return value;
  const days = commandNumber(officer && officer.daysSinceWatch);
  return days == null ? "Unknown" : days > 90 ? "Loss" : days >= 45 ? "Need" : "Current";
}

function commandLevel(value) {
  const raw = String(value == null ? "" : value).trim();
  return /^[0-3]$/.test(raw) ? Number(raw) : null;
}

function commandMetrics(snapshot) {
  const roster = snapshot && snapshot.officerStates || {};
  const metrics = { officerCount: 0, current: 0, need: 0, loss: 0, unknown: 0, currencyAssessed: 0, stale: 0, shipQual: 0, approaching: 0, readyToLevelUp: 0, totalHours: 0, totalQ: 0, totalUI: 0, levels: { Blank: 0, "0": 0, "1": 0, "2": 0, "3": 0 } };
  Object.values(roster).forEach(officer => {
    const off = officer || {};
    metrics.officerCount++;
    const category = commandCategory(off);
    metrics[{ Current: "current", Need: "need", Loss: "loss", Unknown: "unknown" }[category]]++;
    const level = commandLevel(off.level);
    metrics.levels[level == null ? "Blank" : String(level)]++;
    if (off.shipQual === true) metrics.shipQual++;
    if (off.approaching === true) metrics.approaching++;
    metrics.totalHours += commandNumber(off.cumulativeBridgeHours) || 0;
    metrics.totalQ += commandNumber(off.totalQHrs) || 0;
    metrics.totalUI += commandNumber(off.totalUIHrs) || 0;
  });
  metrics.currencyAssessed = metrics.current + metrics.need + metrics.loss;
  metrics.stale = metrics.need + metrics.loss;
  metrics.readyToLevelUp = metrics.approaching;
  return metrics;
}

function commandEmptyChanges() {
  const rows = { lost: [], restored: [], requiresWatch: [], levelUp: [], levelDown: [], joined: [], departed: [], unknownCurrency: [], unknownLevel: [] };
  const counts = {};
  Object.keys(rows).forEach(key => { counts[key] = 0; });
  return { counts, rows };
}

function commandPair(beforeWrapper, afterWrapper) {
  const changes = commandEmptyChanges();
  const beforeStates = beforeWrapper && beforeWrapper.snapshot.officerStates || {};
  const afterStates = afterWrapper && afterWrapper.snapshot.officerStates || {};
  const beforeKeys = new Set(Object.keys(beforeStates));
  const afterKeys = new Set(Object.keys(afterStates));
  const keys = Array.from(new Set([...beforeKeys, ...afterKeys])).sort();
  const add = (kind, row, from, to) => {
    changes.rows[kind].push(Object.assign({}, row, { type: kind, from, to }));
    changes.counts[kind]++;
  };
  keys.forEach(officerKey => {
    const previous = beforeStates[officerKey] || null;
    const current = afterStates[officerKey] || null;
    const person = current || previous || {};
    const row = {
      officerKey, name: person.name || officerKey, rank: person.rank || "", before: previous, after: current,
      observedFrom: beforeWrapper ? beforeWrapper.at : "", observedAt: afterWrapper ? afterWrapper.at : "",
      fromDate: beforeWrapper ? beforeWrapper.date : "", toDate: afterWrapper ? afterWrapper.date : ""
    };
    if (!beforeKeys.has(officerKey)) { add("joined", row, "Absent", "Present"); return; }
    if (!afterKeys.has(officerKey)) { add("departed", row, "Present", "Absent"); return; }
    const beforeCategory = commandCategory(previous);
    const afterCategory = commandCategory(current);
    if (beforeCategory === "Unknown" || afterCategory === "Unknown") {
      // Includes unresolved Unknown -> Unknown: no affirmative performance claim is supported.
      add("unknownCurrency", row, beforeCategory, afterCategory);
    } else {
      if (beforeCategory !== "Loss" && afterCategory === "Loss") add("lost", row, beforeCategory, afterCategory);
      if ((beforeCategory === "Need" || beforeCategory === "Loss") && afterCategory === "Current") add("restored", row, beforeCategory, afterCategory);
      if (beforeCategory === "Current" && afterCategory === "Need") add("requiresWatch", row, beforeCategory, afterCategory);
    }
    const beforeLevel = commandLevel(previous && previous.level);
    const afterLevel = commandLevel(current && current.level);
    if (beforeLevel == null || afterLevel == null) add("unknownLevel", row, previous && previous.level, current && current.level);
    else if (afterLevel > beforeLevel) add("levelUp", row, String(beforeLevel), String(afterLevel));
    else if (afterLevel < beforeLevel) add("levelDown", row, String(beforeLevel), String(afterLevel));
  });
  return changes;
}

function commandAccumulate(target, changes) {
  Object.keys(target.counts).forEach(key => {
    target.counts[key] += changes.counts[key];
    target.rows[key].push(...changes.rows[key]);
  });
  return target;
}

function commandDateEnd(value) {
  const day = commandDay(value);
  return day ? Date.parse(day + "T23:59:59.999Z") : null;
}

function commandSubtractMonths(day, count) {
  const date = new Date(day + "T00:00:00.000Z");
  const desiredDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - count);
  const finalDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(desiredDay, finalDay));
  return date.toISOString().slice(0, 10);
}

function commandCompare(ship, options) {
  const opts = options || {};
  const now = commandNow(opts.nowISO);
  const timeline = commandTimeline(ship, now);
  const mode = ["previous", "date", "3m", "6m", "12m"].includes(opts.mode) ? opts.mode : "previous";
  const requestedTo = opts.to ? commandDay(opts.to) : new Date(now).toISOString().slice(0, 10);
  const empty = commandEmptyChanges();
  const result = {
    available: false, reason: "", mode, timeline, baseline: null, end: null,
    requestedFrom: "", requestedTo, before: null, after: null,
    counts: empty.counts, rows: empty.rows, net: null,
    observed: Object.assign(commandEmptyChanges(), { intervals: [] }),
    caveats: timeline.warnings.slice()
  };
  result.caveats.push("Changes are observed between dated exports. Exact change dates and activity between observations are not established.");
  result.caveats.push("Currency and proficiency level are separate measures. Roster additions and removals are not performance changes; a renamed identity may appear as a roster change.");
  if (!requestedTo || (opts.from && !commandDay(opts.from))) { result.reason = "Choose valid calendar dates."; return result; }
  const eligible = timeline.snapshots.filter(wrapper => Date.parse(wrapper.at) <= commandDateEnd(requestedTo));
  result.end = eligible.length ? eligible[eligible.length - 1] : null;
  if (!result.end) { result.reason = "No dated source snapshot is available on or before the selected end date."; return result; }
  result.after = commandMetrics(result.end.snapshot);
  if (mode === "previous") {
    result.baseline = eligible.length >= 2 ? eligible[eligible.length - 2] : null;
    result.requestedFrom = result.baseline ? result.baseline.date : "";
    if (!result.baseline) { result.reason = "Upload a second dated source snapshot to compare with the previous observation."; return result; }
  } else {
    result.requestedFrom = mode === "date" ? commandDay(opts.from) : commandSubtractMonths(requestedTo, Number(mode.slice(0, -1)));
    if (!result.requestedFrom) { result.reason = "Choose a baseline date."; return result; }
    if (result.requestedFrom > requestedTo) { result.reason = "The baseline date must be on or before the end date."; return result; }
    const baselineCandidates = eligible.filter(wrapper => Date.parse(wrapper.at) <= commandDateEnd(result.requestedFrom));
    result.baseline = baselineCandidates.length ? baselineCandidates[baselineCandidates.length - 1] : null;
    if (!result.baseline) { result.reason = "No dated source snapshot exists on or before the selected baseline date."; return result; }
    if (result.baseline === result.end) { result.reason = "There is no later observation in the selected interval."; return result; }
  }
  result.before = commandMetrics(result.baseline.snapshot);
  const changes = commandPair(result.baseline, result.end);
  result.counts = changes.counts;
  result.rows = changes.rows;
  result.net = {};
  ["officerCount", "current", "need", "loss", "unknown", "shipQual", "approaching", "totalHours", "totalQ", "totalUI"].forEach(key => {
    result.net[key] = result.after[key] - result.before[key];
  });
  const inPeriod = eligible.filter(wrapper => wrapper.at >= result.baseline.at && wrapper.at <= result.end.at);
  for (let index = 1; index < inPeriod.length; index++) {
    const interval = commandPair(inPeriod[index - 1], inPeriod[index]);
    const intervalDays = (Date.parse(inPeriod[index].at) - Date.parse(inPeriod[index - 1].at)) / 86400000;
    commandAccumulate(result.observed, interval);
    result.observed.intervals.push({ baseline: inPeriod[index - 1], end: inPeriod[index], days: intervalDays, counts: interval.counts, rows: interval.rows });
  }
  if (result.baseline.date !== result.requestedFrom || result.end.date !== requestedTo) result.caveats.push("Actual observation dates are shown; no snapshot is invented for a requested date.");
  if (result.observed.intervals.some(interval => interval.days > 31)) result.caveats.push("One or more observations are more than 31 days apart. Intervening changes may be unobserved.");
  result.available = true;
  result.reason = "Comparison uses preserved source observations.";
  return result;
}

// This is deliberately narrower than a generic before/after comparison. It
// answers whether a change was observed wholly inside the most recent 30-day
// window. A pair that crosses the window boundary is retained as a coverage
// warning, rather than being attributed to the last 30 days.
function commandLast30Days(ship, nowISO) {
  const now = commandNow(nowISO);
  const endAt = now;
  const startAt = now - (30 * 86400000);
  const timeline = commandTimeline(ship, now);
  const empty = commandEmptyChanges();
  const result = {
    available: false,
    reason: "",
    timeline,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    startDate: new Date(startAt).toISOString().slice(0, 10),
    endDate: new Date(endAt).toISOString().slice(0, 10),
    reports: [],
    intervals: [],
    boundaryIntervals: [],
    counts: empty.counts,
    rows: empty.rows,
    caveats: timeline.warnings.slice()
  };
  const snapshots = timeline.snapshots.filter(wrapper => {
    const time = Date.parse(wrapper.at);
    return time >= startAt && time <= endAt;
  });
  result.reports = snapshots;
  for (let index = 1; index < timeline.snapshots.length; index++) {
    const previous = timeline.snapshots[index - 1];
    const current = timeline.snapshots[index];
    const currentTime = Date.parse(current.at);
    if (currentTime < startAt || currentTime > endAt) continue;
    const interval = commandPair(previous, current);
    const entry = {
      baseline: previous,
      end: current,
      days: (currentTime - Date.parse(previous.at)) / 86400000,
      counts: interval.counts,
      rows: interval.rows
    };
    if (Date.parse(previous.at) < startAt) result.boundaryIntervals.push(entry);
    else {
      result.intervals.push(entry);
      commandAccumulate(result, interval);
    }
  }
  if (result.intervals.length) {
    result.available = true;
    result.reason = "Changes below were observed between dated source reports both inside the last 30 days.";
  } else if (!snapshots.length) {
    result.reason = "No dated source report falls inside the last 30 days.";
  } else if (result.boundaryIntervals.length) {
    result.reason = "A current-period report exists, but its prior comparison begins before the last 30 days. The change interval crosses the boundary, so no change is attributed to this period.";
  } else {
    result.reason = "Only one dated source report falls inside the last 30 days. A second report is needed to observe change during this period.";
  }
  result.caveats.push("Only changes between two dated reports inside this 30-day window are counted. A report pair that crosses the window boundary is shown as a coverage gap, not as a confirmed last-30-day change.");
  return result;
}

function commandMonthly(ship, from, to, nowISO) {
  const now = commandNow(nowISO);
  const timeline = commandTimeline(ship, now);
  const endDay = to ? commandDay(to) : new Date(now).toISOString().slice(0, 10);
  const startDay = from ? commandDay(from) : timeline.snapshots.length ? timeline.snapshots[0].date : endDay;
  const result = { months: [], from: startDay, to: endDay, timeline, available: false, reason: "", caveats: timeline.warnings.slice() };
  result.caveats.push("Monthly status is the last export observed that month, not an inferred month-end condition. Changes are assigned to the month first observed; the exact change date is unknown.");
  if (!startDay || !endDay || startDay > endDay) { result.reason = "Choose a valid start and end date."; result.caveats.push(result.reason); return result; }
  const start = Date.parse(startDay + "T00:00:00.000Z");
  const end = commandDateEnd(endDay);
  const firstMonth = startDay.slice(0, 7);
  const lastMonth = endDay.slice(0, 7);
  const monthCount = (Number(lastMonth.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12 + Number(lastMonth.slice(5)) - Number(firstMonth.slice(5)) + 1;
  if (monthCount > 1200) {
    result.reason = "Monthly history is limited to 1,200 months per review. Choose a shorter interval; no months were silently omitted.";
    result.caveats.push(result.reason);
    return result;
  }
  const monthCursor = new Date(firstMonth + "-01T00:00:00.000Z");
  while (monthCursor.toISOString().slice(0, 7) <= lastMonth) {
    const month = monthCursor.toISOString().slice(0, 7);
    const observations = timeline.snapshots.filter(wrapper => wrapper.date.slice(0, 7) === month && Date.parse(wrapper.at) >= start && Date.parse(wrapper.at) <= end);
    const snapshot = observations.length ? observations[observations.length - 1] : null;
    const changes = commandEmptyChanges();
    let gap = !snapshot;
    let intervalCount = 0;
    observations.forEach(observation => {
      const index = timeline.snapshots.indexOf(observation);
      if (index === 0) return;
      const previous = timeline.snapshots[index - 1];
      intervalCount++;
      // Include an interval crossing the start date, explicitly labelled with its actual baseline.
      if ((Date.parse(observation.at) - Date.parse(previous.at)) / 86400000 > 31 || Date.parse(previous.at) < start) gap = true;
      commandAccumulate(changes, commandPair(previous, observation));
    });
    result.months.push({
      month, label: month, hasObservation: !!snapshot, snapshot,
      metrics: snapshot ? commandMetrics(snapshot.snapshot) : null,
      counts: changes.counts, rows: changes.rows, observations, intervalCount, hasComparison: intervalCount > 0, baselineOnly: !!snapshot && intervalCount === 0, gap,
      caveat: !snapshot ? "No source snapshot this month; monthly condition and changes are unknown." : intervalCount === 0 ? "This first dated observation establishes a baseline; prior changes are unknown, not zero." : gap ? "Observed changes span a gap or begin before this reporting period; they cannot be assigned an exact occurrence date." : "Status is as observed on " + snapshot.date + "; changes occurred sometime between the dated observations."
    });
    monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1);
  }
  result.available = true;
  result.reason = "Every calendar month in the selected interval is included.";
  return result;
}

function commandCurrent(ship, nowISO) {
  const now = commandNow(nowISO);
  const timeline = commandTimeline(ship, now);
  const snapshot = timeline.snapshots.length ? timeline.snapshots[timeline.snapshots.length - 1] : null;
  const undated = timeline.undated.length ? timeline.undated[timeline.undated.length - 1] : null;
  const sourceImported = snapshot ? commandTimestamp(snapshot.snapshot.importedAt) : null;
  const newerUndated = snapshot ? timeline.undated.filter(item => {
    const uploaded = commandTimestamp(item.snapshot.importedAt);
    return uploaded != null && (sourceImported == null || uploaded > sourceImported);
  }) : [];
  const undatedConflict = !!snapshot && newerUndated.some(item => commandStable(item.snapshot.officerStates) !== commandStable(snapshot.snapshot.officerStates));
  const states = snapshot ? snapshot.snapshot.officerStates : undated ? undated.snapshot.officerStates : ship && ship.officers || {};
  const ageDays = snapshot ? Math.max(0, Math.floor((now - Date.parse(snapshot.at)) / 86400000)) : null;
  const counts = { officerCount: 0, current: 0, need: 0, loss: 0, unknown: 0, currencyAssessed: 0, stale: 0 };
  const severity = { Current: 0, Need: 1, Loss: 2 };
  const roster = Object.entries(states).map(([officerKey, person]) => {
    const off = person || {};
    const sourceDays = commandNumber(off.daysSinceWatch);
    const days = snapshot && sourceDays != null ? sourceDays + ageDays : null;
    const sourceCategory = commandCategory(off);
    let category = days == null ? "Unknown" : days > 90 ? "Loss" : days >= 45 ? "Need" : "Current";
    // Aging cannot reverse a documented requirement or loss in the absence of a new observation.
    if (category !== "Unknown" && sourceCategory !== "Unknown" && severity[sourceCategory] > severity[category]) category = sourceCategory;
    counts.officerCount++;
    counts[{ Current: "current", Need: "need", Loss: "loss", Unknown: "unknown" }[category]]++;
    return {
      officerKey, name: off.name || officerKey, rank: off.rank || "", level: off.level == null ? "" : String(off.level),
      sourceCategory, category, sourceDays, days, ageDays, sourceAt: snapshot ? snapshot.at : "",
      evidence: !snapshot ? "Unknown: no dated source roster." : days == null ? "Unknown: source days since qualifying watch are unavailable." : "Aged from the last source snapshot, assuming no subsequent qualifying watch."
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  counts.currencyAssessed = counts.current + counts.need + counts.loss;
  counts.stale = counts.need + counts.loss;
  const caveats = timeline.warnings.slice();
  if (undatedConflict) caveats.push("A later-uploaded undated roster differs from the latest dated source. The projection below uses only the dated roster; current roster membership and intervening status are unverified until a dated export resolves the conflict.");
  caveats.push("Aging assumes no qualifying watch after the source export. It does not establish new watches, actual losses since export, or proficiency level changes; upload a new source to confirm.");
  if (counts.unknown) caveats.push(counts.unknown + " officer(s) lack dated numeric evidence for current currency.");
  return {
    available: !!snapshot, reason: snapshot ? "Currency aged from the latest dated source snapshot." : "No dated source snapshot is available; current currency is unverified.",
    snapshot, sourceAt: snapshot ? snapshot.at : "", sourceDate: snapshot ? snapshot.date : "",
    asOf: new Date(now).toISOString(), ageDays, counts, roster, caveats, timeline, newerUndated, undatedConflict
  };
}
