(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ProductViews = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var VALID_VIEWS = ["live", "coach", "loop", "evals"];
  var TITLES = { live: "Live copilot", coach: "Answer coach", loop: "Close the Loop", evals: "Eval Control Tower" };

  function paramsFor(search) {
    return new URLSearchParams(String(search || "").replace(/^\?/, ""));
  }

  function resolveView(search) {
    var params = paramsFor(search);
    var requested = params.get("view");
    if (VALID_VIEWS.indexOf(requested) !== -1) return requested;
    if (params.get("demo") === "commitment-loop") return "loop";
    return "live";
  }

  function viewHref(view, search) {
    var next = VALID_VIEWS.indexOf(view) === -1 ? "live" : view;
    var params = paramsFor(search);
    params.set("view", next);
    return "?" + params.toString();
  }

  function viewState(view) {
    var active = VALID_VIEWS.indexOf(view) === -1 ? "live" : view;
    return {
      live: active === "live",
      coach: active === "coach",
      loop: active === "loop",
      evals: active === "evals",
      title: TITLES[active]
    };
  }

  var START_HERE_KEY = "conversation-copilot:start-here-dismissed:v1";

  // The "start here" strip points first-time visitors at the verified replay. It hides on the
  // loop view itself (the replay is already one click away there) and once dismissed.
  function startHereVisible(view, dismissed) {
    if (dismissed) return false;
    return viewState(view).loop === false;
  }

  function readDismissed(storage) {
    try { return Boolean(storage && storage.getItem(START_HERE_KEY)); } catch (error) { return false; }
  }

  function init(doc, location, history, storage) {
    if (!doc || !location) return null;
    var buttons = Array.prototype.slice.call(doc.querySelectorAll("[data-view-target]"));
    var panels = Array.prototype.slice.call(doc.querySelectorAll("[data-view-panel]"));
    var startHere = Array.prototype.slice.call(doc.querySelectorAll("[data-start-here]"));
    var store = storage || (root && root.localStorage) || null;
    var dismissed = readDismissed(store);

    function activate(view, options) {
      var state = viewState(view);
      var active = state.live ? "live" : state.coach ? "coach" : state.loop ? "loop" : "evals";
      doc.body.dataset.activeView = active;
      buttons.forEach(function (button) {
        var selected = button.dataset.viewTarget === active;
        button.setAttribute("aria-selected", selected ? "true" : "false");
        button.tabIndex = selected ? 0 : -1;
        button.href = viewHref(button.dataset.viewTarget, location.search);
        if (selected && typeof button.scrollIntoView === "function") {
          try { button.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (error) { /* older browsers */ }
        }
      });
      startHere.forEach(function (strip) { strip.hidden = !startHereVisible(active, dismissed); });
      panels.forEach(function (panel) {
        var visible = panel.dataset.viewPanel === active;
        panel.hidden = !visible;
        panel.setAttribute("aria-hidden", visible ? "false" : "true");
      });
      if (options && options.push && history && history.pushState) {
        history.pushState({ view: active }, "", viewHref(active, location.search));
      }
      doc.title = state.title + " — AM Consulting Group";
      if (typeof root.CustomEvent === "function") {
        root.dispatchEvent(new root.CustomEvent("productviewchange", { detail: { view: active } }));
      }
      return active;
    }

    buttons.forEach(function (button, index) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        activate(button.dataset.viewTarget, { push: true });
      });
      button.addEventListener("keydown", function (event) {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) === -1) return;
        event.preventDefault();
        var nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
          (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[nextIndex].focus();
        buttons[nextIndex].click();
      });
    });
    Array.prototype.slice.call(doc.querySelectorAll("[data-start-here-dismiss]")).forEach(function (button) {
      button.addEventListener("click", function () {
        dismissed = true;
        try { if (store) store.setItem(START_HERE_KEY, "1"); } catch (error) { /* storage is optional */ }
        startHere.forEach(function (strip) { strip.hidden = true; });
      });
    });
    root.addEventListener("popstate", function () { activate(resolveView(location.search)); });
    return { activate: activate, active: activate(resolveView(location.search)) };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(document, root.location, root.history); });
    else init(document, root.location, root.history);
  }

  return { VALID_VIEWS: VALID_VIEWS, resolveView: resolveView, viewHref: viewHref, viewState: viewState, startHereVisible: startHereVisible, START_HERE_KEY: START_HERE_KEY, init: init };
}));
