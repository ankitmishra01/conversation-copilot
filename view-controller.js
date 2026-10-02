(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ProductViews = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var VALID_VIEWS = ["live", "coach", "loop"];
  var TITLES = { live: "Live copilot", coach: "Answer coach", loop: "Close the Loop" };

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
      title: TITLES[active]
    };
  }

  function init(doc, location, history) {
    if (!doc || !location) return null;
    var buttons = Array.prototype.slice.call(doc.querySelectorAll("[data-view-target]"));
    var panels = Array.prototype.slice.call(doc.querySelectorAll("[data-view-panel]"));

    function activate(view, options) {
      var state = viewState(view);
      var active = state.live ? "live" : state.coach ? "coach" : "loop";
      doc.body.dataset.activeView = active;
      buttons.forEach(function (button) {
        var selected = button.dataset.viewTarget === active;
        button.setAttribute("aria-selected", selected ? "true" : "false");
        button.tabIndex = selected ? 0 : -1;
        button.href = viewHref(button.dataset.viewTarget, location.search);
      });
      panels.forEach(function (panel) {
        var visible = panel.dataset.viewPanel === active;
        panel.hidden = !visible;
        panel.setAttribute("aria-hidden", visible ? "false" : "true");
      });
      if (options && options.push && history && history.pushState) {
        history.pushState({ view: active }, "", viewHref(active, location.search));
      }
      doc.title = state.title + " — an independent Ghost concept";
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
    root.addEventListener("popstate", function () { activate(resolveView(location.search)); });
    return { activate: activate, active: activate(resolveView(location.search)) };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(document, root.location, root.history); });
    else init(document, root.location, root.history);
  }

  return { VALID_VIEWS: VALID_VIEWS, resolveView: resolveView, viewHref: viewHref, viewState: viewState, init: init };
}));
