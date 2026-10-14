// Vaada: India consumer mode. Deterministic replay of a fictional Hinglish
// support call: every promise keeps its exact source quote, RBI timelines are
// computed from the fixture, and nothing leaves the browser until approved.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Vaada = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DAY = 86400000;

  function parseDate(s) { return new Date(s + "T00:00:00Z"); }
  function addDays(d, n) { return new Date(d.getTime() + n * DAY); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / DAY); }

  function fmtDate(s, lang) {
    var d = typeof s === "string" ? parseDate(s) : s;
    return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }
  function rupees(n) { return "₹" + Number(n).toLocaleString("en-IN"); }

  // RBI TAT: reversal due by T + reversalDays; compensation accrues for each
  // full day of delay beyond that, up to the as-of date.
  function rightsCheck(fx) {
    var t = parseDate(fx.transaction.date);
    var due = addDays(t, fx.rule.reversalDays);
    var asOf = parseDate(fx.asOf);
    var daysLate = Math.max(0, daysBetween(due, asOf));
    return {
      reversalDue: iso(due),
      daysLate: daysLate,
      compensation: daysLate * fx.rule.compensationPerDay,
      missed: daysLate > 0
    };
  }

  function promiseStatus(fx) {
    var start = new Date(fx.call.date + "T" + fx.call.time + ":00+05:30");
    var asOf = new Date(fx.asOf + "T18:00:00+05:30");
    return fx.promises.map(function (p) {
      var due = new Date(start.getTime() + p.dueHours * 3600000);
      return Object.assign({}, p, { due: due.toISOString(), overdue: asOf > due });
    });
  }

  function escalationPlan(fx, complaintDate) {
    var filed = parseDate(complaintDate || fx.asOf);
    return {
      writtenComplaint: iso(filed),
      ombudsmanEligible: iso(addDays(filed, fx.escalation.waitDays))
    };
  }

  function lineById(fx, id) { return fx.transcript.find(function (l) { return l.id === id; }); }

  // Every quoted claim must appear verbatim in its cited transcript line.
  function verifyEvidence(fx) {
    var items = fx.promises.map(function (p) { return { id: p.id, quote: p.quote, line: p.sourceLine }; })
      .concat([{ id: "conflict", quote: fx.conflict.quote, line: fx.conflict.sourceLine }])
      .concat(fx.records.map(function (r) { return { id: r.id, quote: r.value, line: r.sourceLine }; }));
    return items.map(function (it) {
      var l = lineById(fx, it.line);
      return { id: it.id, ok: !!l && l.text.indexOf(it.quote) !== -1 };
    });
  }

  function drafts(fx) {
    var r = rightsCheck(fx);
    var tx = fx.transaction;
    var p1 = fx.promises[0];
    var name = (fx.consumer && fx.consumer.name) || "";
    var said = p1 ? " On a call on " + fmtDate(fx.call.date) + ", your representative told me: \"" + p1.quote + "\"" + (p1.meaning ? " (" + p1.meaning + ")" : "") + " The amount has still not been returned." : " The amount has still not been returned.";
    var saidHi = p1 ? " " + fmtDate(fx.call.date, "hi") + " की कॉल पर आपके प्रतिनिधि ने कहा था: \"" + (p1.quoteHi || p1.quote) + "\" यह राशि अब तक वापस नहीं आई है।" : " यह राशि अब तक वापस नहीं आई है।";
    var kindEn = r.reversalDue && fx.rule.reversalDays === 5 ? "payment to a merchant" : "UPI transfer";
    var en = [
      "Subject: Failed UPI " + (fx.rule.reversalDays === 5 ? "payment" : "transfer") + " of " + rupees(tx.amount) + ", refund not received (complaint " + tx.complaintNumber + ")",
      "",
      "Dear Grievance Redressal Officer,",
      "",
      "On " + fmtDate(tx.date) + ", " + rupees(tx.amount) + " was debited from my account for a " + kindEn + " (UTR " + tx.utr + "), but " + (fx.rule.reversalDays === 5 ? "the merchant did not receive confirmation" : "the beneficiary account was not credited") + "." + said,
      "",
      "Under the RBI circular " + fx.rule.circular + ", a failed UPI transaction of this kind must be reversed by T + " + fx.rule.reversalDays + (fx.rule.reversalDays === 1 ? " day" : " days") + ", that is by " + fmtDate(r.reversalDue) + ", and " + rupees(fx.rule.compensationPerDay) + " a day is payable for each day of delay after that, credited without a claim. As of " + fmtDate(fx.asOf) + ", that is " + r.daysLate + " days, or " + rupees(r.compensation) + ".",
      "",
      "Please credit the amount and the compensation. If this is not resolved within 30 days, I will file a complaint under the RBI Integrated Ombudsman Scheme, 2021.",
      "",
      "Regards,",
      name
    ].join("\n");
    var hi = [
      "विषय: UPI " + (fx.rule.reversalDays === 5 ? "भुगतान" : "ट्रांसफ़र") + " विफल, " + rupees(tx.amount) + " अब तक वापस नहीं मिले (शिकायत संख्या " + tx.complaintNumber + ")",
      "",
      "आदरणीय शिकायत निवारण अधिकारी,",
      "",
      fmtDate(tx.date, "hi") + " को मेरे खाते से " + rupees(tx.amount) + " का UPI " + (fx.rule.reversalDays === 5 ? "भुगतान" : "ट्रांसफ़र") + " (UTR " + tx.utr + ") कट गया, लेकिन " + (fx.rule.reversalDays === 5 ? "व्यापारी को पुष्टि नहीं मिली।" : "प्राप्तकर्ता के खाते में जमा नहीं हुआ।") + saidHi,
      "",
      "RBI सर्कुलर " + fx.rule.circular + " के अनुसार ऐसे विफल UPI लेन-देन का रिवर्सल T + " + fx.rule.reversalDays + " दिन, यानी " + fmtDate(r.reversalDue, "hi") + " तक हो जाना चाहिए था, और उसके बाद हर दिन की देरी के लिए " + rupees(fx.rule.compensationPerDay) + " का मुआवज़ा बिना दावे के खाते में जमा होना चाहिए। " + fmtDate(fx.asOf, "hi") + " तक यह " + r.daysLate + " दिन, यानी " + rupees(r.compensation) + " होता है।",
      "",
      "कृपया राशि और मुआवज़ा जमा करें। 30 दिनों में समाधान न होने पर RBI एकीकृत लोकपाल योजना, 2021 के तहत शिकायत दर्ज की जाएगी।",
      "",
      "धन्यवाद,",
      (fx.consumer && fx.consumer.nameHi) || name
    ].join("\n");
    return { en: en, hi: hi };
  }

  // Find promise-like sentences in pasted notes or a transcript, in English or
  // Hinglish. Every hit keeps the exact sentence it came from.
  var UNIT = { ghante: 1, ghanta: 1, ghanton: 1, hour: 1, hours: 1, hrs: 1, hr: 1, din: 24, dino: 24, dinon: 24, day: 24, days: 24, hafte: 168, week: 168, weeks: 168 };
  var FUTURE = /(jayega|jayegi|jaayega|jaayegi|karenge|karega|karegi|karunga|karungi|hoga|hogi|milega|milegi|aa jayega|will|we'll|shall|within|tak)/i;
  function extractPromises(text) {
    var out = [];
    String(text || "").split(/(?<=[.!?\n])\s+|\n+/).forEach(function (raw) {
      var sent = raw.trim(); if (!sent) return;
      var m = sent.match(/(\d+)\s*(ghante|ghanta|ghanton|hours?|hrs?|din|dino|dinon|days?|hafte|weeks?)/i);
      if (!m || !FUTURE.test(sent)) return;
      var key = m[2].toLowerCase(); var hours = Number(m[1]) * (UNIT[key] || UNIT[key.replace(/s$/, "")] || 1);
      out.push({ id: "u" + (out.length + 1), quote: sent, dueHours: hours, owner: "Company" });
    });
    return out;
  }

  // Build a fixture-shaped case from form inputs so the same rules, drafts and
  // checks run on a user's own dispute.
  function caseFromInputs(inp, todayIso) {
    var merchant = inp.kind === "merchant";
    var promises = extractPromises(inp.notes).map(function (p) { return Object.assign(p, { meaning: "" }); });
    return {
      asOf: todayIso,
      consumer: { name: inp.name || "" },
      company: { name: inp.bank || "the bank" },
      call: { date: inp.callDate || todayIso, time: "12:00", language: "" },
      transaction: { date: inp.txDate, amount: Number(inp.amount) || 0, utr: inp.utr || "[UTR]", complaintNumber: inp.complaint || "[complaint number]" },
      promises: promises,
      rule: { circular: "RBI/2019-20/67, 20 September 2019", reversalDays: merchant ? 5 : 1, compensationPerDay: 100,
        row: merchant ? "UPI: account debited but transaction confirmation not received at merchant location" : "UPI: account debited but the beneficiary account is not credited (transfer of funds)" },
      escalation: { waitDays: 30 }
    };
  }

  return { rightsCheck: rightsCheck, promiseStatus: promiseStatus, escalationPlan: escalationPlan, verifyEvidence: verifyEvidence, drafts: drafts, extractPromises: extractPromises, caseFromInputs: caseFromInputs, fmtDate: fmtDate, rupees: rupees, lineById: lineById };
}));
