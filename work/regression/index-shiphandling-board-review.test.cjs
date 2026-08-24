const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const originalPath = path.join(root, "index.html");
const reviewedPath = path.join(root, "index_shiphandling_board_reviewed.html");
const original = fs.readFileSync(originalPath, "utf8");
const reviewed = fs.readFileSync(reviewedPath, "utf8");
const scripts = [...reviewed.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex").toUpperCase();
}

function sliceBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return text.slice(startIndex, endIndex);
}

test("traditional index remains byte-for-byte unchanged", () => {
  assert.equal(sha256(original), "EA1FF9858991F3F7A27E39AC6F696B16E3BE1B60E4C00DA076C4B838F33CE45C");
});

test("reviewed single-file app scripts all parse", () => {
  assert.ok(scripts.length >= 12, "expected the traditional single-file script modules");
  scripts.forEach((source, index) => {
    assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} should parse`);
  });
});

test("traditional WAKE opener identity and welcome wording are preserved", () => {
  for (const contract of [
    'id="wake-startup-overlay"',
    'class="wake-startup-card"',
    'class="wake-startup-wordmark-img"',
    'class="wake-startup-subtitle">Measure the Wake, Master the Watch',
    'class="wake-startup-tagline">The OOD Training Continuum',
    "Welcome to WAKE",
    "Measure the Wake, Master the Watch."
  ]) {
    assert.ok(original.includes(contract), `traditional source is missing ${contract}`);
    assert.ok(reviewed.includes(contract), `reviewed copy drifted from ${contract}`);
  }
  assert.match(reviewed, /id="wake-startup-overlay"[^>]*role="button"[^>]*tabindex="0"/);
  assert.match(reviewed, /!\["Enter", " ", "Escape"\]\.includes\(event\.key\)/);
  assert.match(reviewed, /TORIS_HELP_BANNER_SEEN/);
});

test("routine work is separated from procedurally gated lead actions", () => {
  assert.match(reviewed, /<summary[^>]*>Lead \/ Admin Actions<\/summary>/);
  assert.match(reviewed, /Lead session inactive\. Command mutations are locked\./);
  assert.match(reviewed, /WAKE_LEAD_ACTION_AUDIT_V1/);
  assert.match(reviewed, /\["toggleCOOodQualified", "CO OOD qualification"\]/);
  for (const id of ["admin-msa-btn", "admin-watchbill-btn", "admin-mass-grade-btn", "admin-clear-btn", "activate-imported-decisions", "reject-imported-decisions"]) {
    assert.match(reviewed, new RegExp(`"${id}"`));
  }
});

test("individual grade, ROR, proficiency, and MSL attestation mutations require a lead session", () => {
  const match = reviewed.match(/<script id="WAKE_BOARD_LEAD_AND_ACCESSIBILITY_V1">([\s\S]*?)<\/script>/);
  assert.ok(match, "lead protection module must exist");
  const names = [
    "updateLogScore",
    "saveRorEditFromModal",
    "removeRorTestFromModal",
    "toggleLogAsProficiencyWatch",
    "saveMslAttestationFromProfile",
    "updateAnyLogScore",
    "submitMassGradeRow"
  ];
  const calls = Object.fromEntries(names.map(name => [name, 0]));
  const session = new Map();
  const audit = new Map();
  const context = {
    console,
    sessionStorage: {
      getItem: key => session.has(key) ? session.get(key) : null,
      setItem: (key, value) => session.set(key, String(value)),
      removeItem: key => session.delete(key)
    },
    localStorage: {
      getItem: key => audit.has(key) ? audit.get(key) : null,
      setItem: (key, value) => audit.set(key, String(value))
    },
    document: {
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null
    },
    showToast: () => {},
    confirm: () => true,
    refreshComputedRecency: () => {},
    renderSidebar: () => {},
    showShipDashboard: () => {},
    scheduleBrowserSave: () => {},
    renderTransferReadinessCard: () => { context.attestationControlResets += 1; },
    attestationControlResets: 0,
    MutationObserver: function() {}
  };
  names.forEach(name => { context[name] = () => { calls[name] += 1; return true; }; });
  context.window = context;
  vm.runInNewContext(match[1], context, { filename: "WAKE_BOARD_LEAD_AND_ACCESSIBILITY_V1.js" });

  names.forEach(name => context[name]("record", 5));
  assert.deepEqual(calls, Object.fromEntries(names.map(name => [name, 0])), "locked calls must not reach mutation functions");
  assert.equal(context.attestationControlResets, 1, "denied attestation input must be restored from saved state");

  context.db = {
    "ENS QA": {
      name: "ENS QA",
      detectedLogs: [],
      importReviewPending: {
        fields: ["logScores", "msaRecords"],
        values: { logScores: { forged: 5 }, msaRecords: [{ msaTarget: "MSA2", resultValue: "PASS" }] },
        disposition: "pending"
      }
    }
  };
  context.activatePendingImportedCommandState();
  assert.equal(context.db["ENS QA"].logScores, undefined, "pending imported grades must remain inactive without a lead session");
  assert.equal(context.db["ENS QA"].msaRecords, undefined, "pending imported MSA must remain inactive without a lead session");

  session.set("WAKE_LEAD_SESSION_V1", JSON.stringify({ actor: "QA", billet: "SWO" }));
  names.forEach(name => context[name]("record", 5));
  assert.deepEqual(calls, Object.fromEntries(names.map(name => [name, 1])), "active lead session should permit the protected functions");
  context.activatePendingImportedCommandState();
  assert.deepEqual(JSON.parse(JSON.stringify(context.db["ENS QA"].logScores)), { forged: 5 });
  assert.equal(context.db["ENS QA"].importReviewPending.disposition, "activated");
});

test("SWOMAN labels and manual evidence also require a lead session", () => {
  const swoman = sliceBetween(reviewed, "function labelLog(logId)", "document.addEventListener('click'");
  assert.match(swoman, /WAKE_BOARD_REVIEW\.requireLead\('SWOMAN currency evidence'\)/);
  assert.match(swoman, /WAKE_BOARD_REVIEW\.requireLead\('manual SWOMAN currency evidence'\)/);
});

test("watchbill output is an evidence advisory and fails closed for incomplete teams", () => {
  assert.match(reviewed, /Incomplete team — assessment not available/);
  assert.match(reviewed, /Duplicate assignment — assessment not available/);
  assert.match(reviewed, /weakest-billet method/i);
  assert.match(reviewed, /not a Navy ORM RAC, an operational-readiness certification/i);
  assert.match(reviewed, /Team Evidence Readiness/);
  assert.doesNotMatch(reviewed, /Selected Team Risk — LOW|Best Low Risk Team/);
});

test("watchbill excludes incomplete proficiency/currency refresh and keeps U/I development separate", () => {
  const gateSource = sliceBetween(reviewed, "function watchbillProficiencyGate(off)", "function roleMatch(l,role)");
  const context = {
    prof: {},
    recovery: {},
    getProficiencyWatchStatus: () => context.prof,
    getMostRecentCurrencyLossStatus: () => context.recovery,
    roleQualified: () => true
  };
  vm.runInNewContext(`${gateSource}\nthis.watchbillProficiencyGate=watchbillProficiencyGate;this.watchbillEligible=watchbillEligible;`, context);

  context.prof = { required: true, reason: "45-day refresh incomplete" };
  context.recovery = { active: false };
  assert.equal(context.watchbillProficiencyGate({}).met, false);
  assert.equal(context.watchbillEligible({}, "OOD"), false);

  context.prof = { required: false };
  context.recovery = { active: true, reason: ">90-day recovery incomplete" };
  assert.equal(context.watchbillProficiencyGate({}).met, false);

  context.prof = { required: false };
  context.recovery = { active: false };
  assert.equal(context.watchbillProficiencyGate({}).met, true);
  assert.equal(context.watchbillEligible({}, "OOD"), true);

  assert.match(reviewed, /Proficiency gate not met — assessment unavailable/);
  assert.match(reviewed, /U\/I &amp; Proficiency Refresh Development/);
  assert.match(reviewed, /cannot be added to the watchbill/);
  assert.match(reviewed, /filter\(function\(o\)\{return isBridge\(o\)&&watchbillEligible\(o,role\);\}\)/);
});

test("fresh MSA forms cannot fail open", () => {
  assert.doesNotMatch(reviewed, /<input[^>]+type="radio"[^>]+\schecked(?:\s|>)/i);
  assert.match(reviewed, /UNASSESSED/);
  assert.match(reviewed, /function msaAllRadioGroupsAnswered/);
  assert.match(reviewed, /function msaAllToggleGroupsAnswered/);
  assert.match(reviewed, /Assessment is UNASSESSED\. Answer every competency/i);
});

test("imports report busy, partial, and failure states and reject cross-product data", () => {
  assert.match(reviewed, /function setImportBusy\(isBusy, fileCount\)/);
  assert.match(reviewed, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(reviewed, /Import partially complete/);
  assert.match(reviewed, /Import needs attention/);
  assert.match(reviewed, /This is a Fleet WAKE backup, not a ship-level WAKE working copy/);
  assert.match(reviewed, /Ship mismatch:/);
  assert.match(reviewed, /Lead revalidation required; imported command decisions were not activated/);
  for (const field of ["logScores", "proficiencyWatchLogIds", "swomanCurrencyLabels"]) {
    assert.match(reviewed, new RegExp(`"${field}"`), `quarantine must include ${field}`);
  }
  assert.doesNotMatch(reviewed, /off\.proficiencyWatchLogIds = Object\.assign\(off\.proficiencyWatchLogIds/);
  assert.match(reviewed, /values: quarantinedValues/);
  assert.match(reviewed, /disposition: "pending"/);
  assert.match(reviewed, /sha256: fileStats\.sha256/);
});

test("import provenance and quarantined values survive browser and JSON backup payloads", () => {
  assert.match(reviewed, /version: 2,[\s\S]*lastImportReport: lastImportReport \|\| null,[\s\S]*importReceipts:/);
  assert.match(reviewed, /function recordImportReceipt\(report\)/);
  assert.match(reviewed, /sha256: file\.sha256 \|\| ""/);
  assert.match(reviewed, /officers: db \|\| \{\},[\s\S]*lastImportReport:[\s\S]*importReceipts:/);
  assert.match(reviewed, /payload\.importReceipts\.forEach/);
  assert.match(reviewed, /values: mergedValues/);
});

  test("repeated JSON restores use latest field snapshots while preserving complete provenance", () => {
    const mergeSource = sliceBetween(reviewed, "function mergeImportReviewHistory(officer, incomingHistory)", "function importTrackerJSON(text, sourceMeta)");
    const context = { JSON, Object, Array, Set, String };
    vm.runInNewContext(
      `${mergeSource}\nthis.mergeImportReviewHistory = mergeImportReviewHistory;\nthis.mergeImportReviewPending = mergeImportReviewPending;\nthis.quarantineImportedOfficerRecord = quarantineImportedOfficerRecord;`,
      context
    );
    const officer = {
      importReviewPending: {
        fields: ["logScores", "msaRecords", "rorTests"],
        values: {
          logScores: { sameLog: 1, oldLog: 1 },
          msaRecords: [{ id: "same-msa", result: "PASS" }],
          rorTests: [{
            date: "2026-07-01",
            score: 100,
            questions: 20,
            remediationConducted: false,
            enteredAt: "2026-07-01T12:00:00Z",
            source: "Rules of the Road"
          }]
        },
        source: { fileName: "old.json", sha256: "old" },
        disposition: "pending"
      }
    };
    context.mergeImportReviewPending(officer, {
      fields: ["logScores", "msaRecords", "rorTests"],
      values: {
        logScores: { sameLog: 5, newLog: 5 },
        msaRecords: [{ id: "same-msa", result: "FAIL" }],
        rorTests: [{
          date: "2026-07-01",
          score: 50,
          questions: 20,
          remediationConducted: false,
          enteredAt: "2026-07-01T12:00:00Z",
          editedAt: "2026-07-02T12:00:00Z",
          source: "Rules of the Road"
        }]
      },
      source: { fileName: "new.json", sha256: "new" },
      disposition: "pending"
    });
    assert.deepEqual(JSON.parse(JSON.stringify(officer.importReviewPending.values.logScores)), {
      sameLog: 5,
      newLog: 5
    });
    assert.equal(officer.importReviewPending.values.msaRecords.length, 1);
    assert.equal(officer.importReviewPending.values.msaRecords[0].id, "same-msa");
    assert.equal(officer.importReviewPending.values.msaRecords[0].result, "FAIL");
    assert.equal(officer.importReviewPending.values.rorTests.length, 1);
    assert.equal(officer.importReviewPending.values.rorTests[0].score, 50);
    assert.deepEqual(JSON.parse(JSON.stringify(officer.importReviewPending.sources.map(source => source.fileName))), ["old.json", "new.json"]);
    assert.equal(officer.importReviewPending.snapshots.length, 2);
    assert.equal(officer.importReviewPending.snapshots[0].values.logScores.sameLog, 1);
    assert.equal(officer.importReviewPending.snapshots[0].values.msaRecords[0].result, "PASS");
    assert.equal(officer.importReviewPending.snapshots[0].values.rorTests[0].score, 100);
    assert.equal(officer.importReviewPending.snapshots[0].source.fileName, "old.json");
    assert.equal(officer.importReviewPending.snapshots[1].values.logScores.sameLog, 5);
    assert.equal(officer.importReviewPending.snapshots[1].values.msaRecords[0].result, "FAIL");
    assert.equal(officer.importReviewPending.snapshots[1].values.rorTests[0].score, 50);
    assert.equal(officer.importReviewPending.snapshots[1].source.fileName, "new.json");

    const removalOfficer = {
      importReviewPending: {
        fields: ["rorTests", "manualOverrides"],
        values: {
          rorTests: [{ id: "remove-ror", score: 100 }],
          manualOverrides: { "Watch-1": { approved: true } }
        },
        source: { fileName: "before-removal.json", sha256: "before-removal" },
        disposition: "pending"
      }
    };
    context.mergeImportReviewPending(removalOfficer, {
      fields: ["rorTests", "manualOverrides"],
      values: { rorTests: [], manualOverrides: {} },
      source: { fileName: "after-removal.json", sha256: "after-removal" },
      disposition: "pending"
    });
    assert.deepEqual(JSON.parse(JSON.stringify(removalOfficer.importReviewPending.values.rorTests)), []);
    assert.deepEqual(JSON.parse(JSON.stringify(removalOfficer.importReviewPending.values.manualOverrides)), {});
    assert.equal(removalOfficer.importReviewPending.snapshots[0].values.rorTests[0].score, 100);
    assert.deepEqual(JSON.parse(JSON.stringify(removalOfficer.importReviewPending.snapshots[1].values.rorTests)), []);

    const carried = context.quarantineImportedOfficerRecord({
      name: "ENS QA",
      logScores: { activeLog: 4 },
      importReviewPending: {
        fields: ["msaRecords"],
        values: { msaRecords: [{ id: "prior-msa" }] },
        source: { fileName: "prior.json", sha256: "prior" },
        disposition: "pending"
      }
    }, { fileName: "new-active.json", sha256: "new-active" });
    assert.equal(Object.hasOwn(carried, "logScores"), false);
    assert.equal(carried.importReviewPending.values.logScores.activeLog, 4);
    assert.equal(carried.importReviewPending.values.msaRecords[0].id, "prior-msa");
    assert.deepEqual(
      JSON.parse(JSON.stringify(carried.importReviewPending.sources.map(source => source.fileName))),
      ["new-active.json", "prior.json"]
    );
  });

  test("JSON restore merges imported command-review history and completed review records", () => {
    const mergeSource = sliceBetween(reviewed, "function mergeImportReviewHistory(officer, incomingHistory)", "function importTrackerJSON(text, sourceMeta)");
    const context = { JSON, Object, Array, Set, String };
    vm.runInNewContext(
      `${mergeSource}\nthis.mergeImportReviewHistory = mergeImportReviewHistory;\nthis.quarantineImportedOfficerRecord = quarantineImportedOfficerRecord;`,
      context
    );
    const officer = {
      importReviewHistory: [{ importedAt: "2026-07-01T00:00:00Z", disposition: "rejected" }]
    };
    const importedHistory = [
      { importedAt: "2026-07-02T00:00:00Z", disposition: "activated" },
      { importedAt: "2026-07-01T00:00:00Z", disposition: "rejected" }
    ];
    context.mergeImportReviewHistory(officer, importedHistory);
    assert.deepEqual(
      JSON.parse(JSON.stringify(officer.importReviewHistory.map(entry => entry.disposition))),
      ["rejected", "activated"]
    );

    const carried = context.quarantineImportedOfficerRecord({
      name: "ENS History",
      importReviewHistory: [{ importedAt: "2026-07-01T00:00:00Z", disposition: "rejected" }],
      importReviewPending: {
        importedAt: "2026-07-02T00:00:00Z",
        fields: ["msaRecords"],
        values: { msaRecords: [{ id: "completed-msa", result: "PASS" }] },
        disposition: "activated"
      },
      logScores: { activeLog: 4 }
    }, { fileName: "history.json", sha256: "history" });
    assert.equal(carried.importReviewPending.disposition, "pending");
    assert.equal(carried.importReviewHistory.length, 2);
    assert.deepEqual(
      JSON.parse(JSON.stringify(carried.importReviewHistory.map(entry => entry.disposition))),
      ["rejected", "activated"]
    );
    assert.match(
      reviewed,
      /if \(Array\.isArray\(imported\.importReviewHistory\)\) \{[\s\S]*mergeImportReviewHistory\(off, imported\.importReviewHistory\);[\s\S]*delete imported\.importReviewHistory;/
    );
      assert.match(
        reviewed,
        /imported = quarantineImportedOfficerRecord\(imported, reviewSourceMeta, fullCommandSnapshot\);[\s\S]*imported\.importReviewPending\.disposition !== "pending"\) \{[\s\S]*mergeImportReviewHistory\(imported, \[imported\.importReviewPending\]\);[\s\S]*delete imported\.importReviewPending;[\s\S]*if \(!db\[key\]\)/
      );

      const restoreSource = sliceBetween(
        reviewed,
        "function mergeImportReviewHistory(officer, incomingHistory)",
        "async function processFilesArray(files)"
      );
      const restoreContext = {
        JSON, Object, Array, Set, Map, String, Date, Math,
        localStorage: { setItem() {} }
      };
      vm.runInNewContext(
        `var db = {};\nvar globalShip = "Unknown Ship";\nvar globalMonths = [];\nvar importReceipts = [];\n${restoreSource}\nthis.importTrackerJSON = importTrackerJSON;\nthis.readDb = () => db;\nthis.resetDb = () => { db = {}; };`,
        restoreContext
      );
      const firstRestorePayload = JSON.stringify({
        format: "WAKE_JSON_BACKUP",
        officers: {
          "ENS First": {
            name: "ENS First",
            detectedLogs: [],
            importReviewHistory: [{ importedAt: "2026-07-01T00:00:00Z", disposition: "rejected" }],
            importReviewPending: {
              importedAt: "2026-07-02T00:00:00Z",
              fields: ["msaRecords"],
              values: { msaRecords: [{ id: "completed-first", result: "PASS" }] },
              disposition: "activated"
            }
          }
        }
      });
      restoreContext.importTrackerJSON(firstRestorePayload, { fileName: "first.json", sha256: "first" });
      let firstOfficer = JSON.parse(JSON.stringify(restoreContext.readDb()["ENS First"]));
      assert.equal(Object.hasOwn(firstOfficer, "importReviewPending"), false);
      assert.deepEqual(firstOfficer.importReviewHistory.map(entry => entry.disposition), ["rejected", "activated"]);
      restoreContext.importTrackerJSON(firstRestorePayload, { fileName: "first.json", sha256: "first" });
      firstOfficer = JSON.parse(JSON.stringify(restoreContext.readDb()["ENS First"]));
      assert.equal(Object.hasOwn(firstOfficer, "importReviewPending"), false);
      assert.deepEqual(firstOfficer.importReviewHistory.map(entry => entry.disposition), ["rejected", "activated"]);
      restoreContext.importTrackerJSON(firstRestorePayload, { fileName: "first.json", sha256: "first" });
      firstOfficer = JSON.parse(JSON.stringify(restoreContext.readDb()["ENS First"]));
      assert.equal(Object.hasOwn(firstOfficer, "importReviewPending"), false);
      assert.equal(Object.hasOwn(firstOfficer, "logScores"), false);
      assert.equal(Object.hasOwn(firstOfficer, "proficiencyWatchLogIds"), false);
      assert.equal(Object.hasOwn(firstOfficer, "swomanCurrencyLabels"), false);
      assert.deepEqual(firstOfficer.importReviewHistory.map(entry => entry.disposition), ["rejected", "activated"]);
      const uiNormalizedOfficer = restoreContext.readDb()["ENS First"];
      uiNormalizedOfficer.proficiencyWatches = [];
      uiNormalizedOfficer.proficiencyWatchLogIds = {};
      uiNormalizedOfficer.swomanCurrencyLabels = {};
      uiNormalizedOfficer.swomanManualEvidence = [];
      restoreContext.importTrackerJSON(firstRestorePayload, { fileName: "first.json", sha256: "first" });
      firstOfficer = JSON.parse(JSON.stringify(restoreContext.readDb()["ENS First"]));
      assert.equal(Object.hasOwn(firstOfficer, "importReviewPending"), false);
      assert.deepEqual(firstOfficer.importReviewHistory.map(entry => entry.disposition), ["rejected", "activated"]);

      const overlappingStatePayload = JSON.stringify({
        format: "WAKE_JSON_BACKUP",
        officers: {
          "ENS Overlap": {
            name: "ENS Overlap",
            detectedLogs: [],
            logScores: { logA: 3 },
            importReviewPending: {
              importedAt: "2026-07-03T00:00:00Z",
              fields: ["logScores"],
              values: { logScores: { logA: 5 } },
              source: { fileName: "pending-candidate.json", sha256: "pending-candidate" },
              disposition: "pending"
            }
          }
        }
      });
      restoreContext.importTrackerJSON(overlappingStatePayload, { fileName: "active-baseline.json", sha256: "active-baseline" });
      const overlapOfficer = JSON.parse(JSON.stringify(restoreContext.readDb()["ENS Overlap"]));
      assert.equal(overlapOfficer.importReviewPending.values.logScores.logA, 5);
      assert.equal(overlapOfficer.importReviewPending.snapshots[0].values.logScores.logA, 3);
      assert.equal(overlapOfficer.importReviewPending.snapshots[1].values.logScores.logA, 5);

      const oldOverridePayload = JSON.stringify({
        format: "WAKE_JSON_BACKUP",
        officers: {
          "ENS Tombstone": {
            name: "ENS Tombstone",
            detectedLogs: [],
            coHoursRequirementOverride: { targetLevel: 2, approvedBy: "CO" }
          }
        }
      });
      const removedOverridePayload = JSON.stringify({
        format: "WAKE_JSON_BACKUP",
        officers: {
          "ENS Tombstone": {
            name: "ENS Tombstone",
            detectedLogs: []
          }
        }
      });
      restoreContext.importTrackerJSON(oldOverridePayload, { fileName: "old-override.json", sha256: "old-override" });
      restoreContext.importTrackerJSON(removedOverridePayload, { fileName: "removed-override.json", sha256: "removed-override" });
      const tombstoneOfficer = JSON.parse(JSON.stringify(restoreContext.readDb()["ENS Tombstone"]));
      assert.equal(tombstoneOfficer.importReviewPending.values.coHoursRequirementOverride.__wakeImportTombstone, true);
      assert.equal(tombstoneOfficer.importReviewPending.snapshots[0].values.coHoursRequirementOverride.targetLevel, 2);
      assert.equal(tombstoneOfficer.importReviewPending.snapshots[1].values.coHoursRequirementOverride.__wakeImportTombstone, true);
      const tombstoneRoundtripPayload = JSON.stringify({
        format: "WAKE_JSON_BACKUP",
        officers: { "ENS Tombstone": tombstoneOfficer }
      });
      restoreContext.resetDb();
      restoreContext.importTrackerJSON(tombstoneRoundtripPayload, { fileName: "tombstone-roundtrip.json", sha256: "tombstone-roundtrip" });
      const restoredTombstoneOfficer = JSON.parse(JSON.stringify(restoreContext.readDb()["ENS Tombstone"]));
      assert.equal(restoredTombstoneOfficer.importReviewPending.carriedReviewPackage, true);
      assert.equal(restoredTombstoneOfficer.importReviewPending.values.coHoursRequirementOverride.__wakeImportTombstone, true);
      assert.equal(
        restoredTombstoneOfficer.importReviewPending.snapshots.some(snapshot =>
          snapshot.values
          && snapshot.values.coHoursRequirementOverride
          && snapshot.values.coHoursRequirementOverride.targetLevel === 2
        ),
        true
      );
      assert.match(
        reviewed,
        /if \(value && typeof value === "object" && value\.__wakeImportTombstone === true\) \{[\s\S]*delete officer\[field\];[\s\S]*\} else \{[\s\S]*officer\[field\] = copyPendingValue\(value\);/
      );
    });

  test("quarantined matched Basic logs render safely before a lead activates scores", () => {
    const renderSource = sliceBetween(reviewed, "function renderEventTable(tbodyId, eventList, logsArray, typeKey)", "function toggleCORequirementCheckoff(eventName, isChecked)");
    const tbody = {
      innerHTML: "",
      rows: [],
      appendChild(row) { this.rows.push(row); }
    };
    const renderContext = {
      document: {
        getElementById() { return tbody; },
        createElement() { return { style: {}, innerHTML: "" }; }
      },
      currentOfficer: { name: "ENS Quarantined", detectedLogs: [{ logId: "basic-1" }] },
      globalShip: "USS TEST",
      CURRENT_SYSTEM_DATE: new Date("2026-07-23T00:00:00Z"),
      isRequirementApplicable() { return true; },
      isMatch() { return true; },
      getManualOverrideRecord() { return null; },
      escapeHtmlAttr(value) { return String(value); },
      formatOverrideDate(value) { return String(value); },
      Math, Number, Array, String
    };
    vm.runInNewContext(`${renderSource}\nthis.renderEventTable = renderEventTable;`, renderContext);
    assert.doesNotThrow(() => {
      renderContext.renderEventTable("basic-table", ["Mooring"], renderContext.currentOfficer.detectedLogs, "basic");
    });
    assert.equal(tbody.rows.length, 1);
    assert.match(tbody.rows[0].innerHTML, />0</);

    const updateSource = sliceBetween(reviewed, "function updateLogScore(logId, val)", "function getRequirementProgress(off, list, targetScore)");
    const updateContext = {
      currentOfficer: { detectedLogs: [{ logId: "basic-1" }] },
      findOfficerLog(off, logId) { return off.detectedLogs.find(log => log.logId === logId); },
      canGradeBasicLog() { return true; },
      scheduleBrowserSave() {},
      alert() {},
      parseInt, isNaN
    };
    vm.runInNewContext(`${updateSource}\nthis.updateLogScore = updateLogScore;`, updateContext);
    assert.equal(updateContext.updateLogScore("basic-1", "4"), true);
    assert.equal(updateContext.currentOfficer.logScores["basic-1"], 4);
  });
  
  test("MSA transfer readiness requires an explicit accepted pass result", () => {
  const passedMsa = sliceBetween(reviewed, "function getPassedMsa2Record(off)", "function getLatestMsa2Record(off)");
  assert.match(passedMsa, /\["OUTSTANDING", "PASS", "PASS WITH CONCERNS"\]/);
  assert.doesNotMatch(passedMsa, /!\/fail\|tripwire\//);
});

test("hour-gate exceptions are structured and locked to one target level", () => {
  assert.match(reviewed, /targetLevel: gate\.nextLevel/);
  assert.match(reviewed, /approvedBy:/);
  assert.match(reviewed, /approvedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(reviewed, /rationale,/);
  assert.match(reviewed, /Number\(coOverride\.targetLevel\) === normalHourGateLevel \+ 1/);
  assert.doesNotMatch(reviewed, /const hourGateLevel = hoursRequirementOverride \? Math\.min\(3, normalHourGateLevel \+ 1\)/);
});

test("active correspondence exports are conspicuous unsigned drafts", () => {
  const finalLetter = sliceBetween(
    reviewed,
    "// Final reviewed export implementation.",
    'document.addEventListener("DOMContentLoaded", bindMsaIntegration);'
  );
  assert.match(finalLetter, /DRAFT — UNSIGNED — DECISION SUPPORT/);
  assert.match(finalLetter, /not an official notification, qualification action, endorsement, or signed command record/i);
  assert.match(finalLetter, /Not signed by WAKE/);
  assert.match(finalLetter, /DRAFT_WAKE_Level_Review_/);

  const msaLetter = sliceBetween(reviewed, "function renderMsaCompletionLetter(record)", "function msaScoreCell");
  assert.match(msaLetter, /DRAFT — UNSIGNED — DECISION SUPPORT/);
  assert.match(msaLetter, /Command approval\/signature required/);
  assert.doesNotMatch(msaLetter, /\/s\/|From:<\/strong><span>Commanding Officer/);
  assert.match(reviewed, /DRAFT_\$\{record\.msaTarget\}_Review_/);
});

test("keyboard, dialog, touch, and semantic-color contracts are present", () => {
  assert.match(reviewed, /role="button" tabindex="0" aria-controls="upload"/);
  assert.match(reviewed, /dialog\.setAttribute\("aria-modal", "true"\)/);
  assert.match(reviewed, /function syncDialogState\(dialog\)/);
  assert.match(reviewed, /if \(event\.key === "Tab"\)/);
  assert.match(reviewed, /@media \(max-width: 480px\)/);
  assert.match(reviewed, /min-height: 44px/);
  assert.match(reviewed, /Level 0 \(Foundational\)/);
  assert.match(reviewed, /--lvl0:\s*#53687d/);
});

test("walkthrough continuation uses the class that the renderer applies", () => {
  assert.match(reviewed, /\.walkthrough-continue-callout\.visible,\s*\.walkthrough-continue-callout\.show/);
});
