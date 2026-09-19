(function () {
  if (window.__BaseMindWidgetLoaded) return;
  window.__BaseMindWidgetLoaded = true;

  // Find the current script tag
  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && scripts[i].src.indexOf("widget.js") !== -1) {
          return scripts[i];
        }
      }
      return null;
    })();

  if (!currentScript) return;

  var agentId = currentScript.getAttribute("data-agent-id");
  if (!agentId) {
    console.warn("[BaseMind] Missing data-agent-id on script tag.");
    return;
  }

  var position = currentScript.getAttribute("data-position") || "right";
  var brandColor = currentScript.getAttribute("data-color") || "#0d9488";

  // Derive origin from script src (e.g. https://base-mind.vercel.app or http://localhost:3000)
  var scriptUrl = new URL(currentScript.src, window.location.href);
  var baseUrl = scriptUrl.origin;
  var widgetUrl = baseUrl + "/widget/" + encodeURIComponent(agentId);

  var isOpen = false;

  // 1. Create floating trigger button
  var button = document.createElement("button");
  button.id = "basemind-launcher-btn";
  button.setAttribute("aria-label", "Open Chat Support");
  button.setAttribute("type", "button");

  var isLeft = position === "left";
  var btnBaseStyle =
    "position:fixed;bottom:24px;" +
    (isLeft ? "left:24px;" : "right:24px;") +
    "width:58px;height:58px;border-radius:29px;" +
    "background:" +
    brandColor +
    ";" +
    "color:#ffffff;border:none;cursor:pointer;" +
    "box-shadow:0 8px 24px rgba(0,0,0,0.22);" +
    "display:flex;align-items:center;justify-content:center;" +
    "z-index:2147483647;transition:transform 0.25s cubic-bezier(0.16,1,0.3,1),box-shadow 0.25s ease;" +
    "outline:none;";

  button.style.cssText = btnBaseStyle;

  var chatSvg =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>' +
    "</svg>";

  var closeSvg =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="18" y1="6" x2="6" y2="18"></line>' +
    '<line x1="6" y1="6" x2="18" y2="18"></line>' +
    "</svg>";

  button.innerHTML = chatSvg;

  button.addEventListener("mouseenter", function () {
    button.style.transform = "scale(1.06)";
  });
  button.addEventListener("mouseleave", function () {
    button.style.transform = "scale(1)";
  });

  // 2. Create Iframe Container
  var container = document.createElement("div");
  container.id = "basemind-widget-container";

  var desktopStyle =
    "position:fixed;bottom:96px;" +
    (isLeft ? "left:24px;" : "right:24px;") +
    "width:385px;height:610px;max-height:calc(100vh - 120px);max-width:calc(100vw - 48px);" +
    "border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,0.28);" +
    "z-index:2147483646;overflow:hidden;border:1px solid rgba(128,128,128,0.2);" +
    "opacity:0;pointer-events:none;transform:translateY(24px) scale(0.96);" +
    "transition:opacity 0.28s cubic-bezier(0.16,1,0.3,1),transform 0.28s cubic-bezier(0.16,1,0.3,1);";

  container.style.cssText = desktopStyle;

  var iframe = document.createElement("iframe");
  iframe.src = widgetUrl;
  iframe.title = "BaseMind AI Support";
  iframe.style.cssText =
    "width:100%;height:100%;border:none;display:block;background:transparent;";
  iframe.setAttribute("allow", "clipboard-write");

  container.appendChild(iframe);

  function applyResponsive() {
    var isMobile = window.innerWidth <= 480;
    if (isOpen) {
      if (isMobile) {
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.maxWidth = "100vw";
        container.style.maxHeight = "100vh";
        container.style.bottom = "0px";
        container.style.left = "0px";
        container.style.right = "0px";
        container.style.borderRadius = "0px";
      } else {
        container.style.width = "385px";
        container.style.height = "610px";
        container.style.maxWidth = "calc(100vw - 48px)";
        container.style.maxHeight = "calc(100vh - 120px)";
        container.style.bottom = "96px";
        container.style.left = isLeft ? "24px" : "auto";
        container.style.right = isLeft ? "auto" : "24px";
        container.style.borderRadius = "18px";
      }
    }
  }

  window.addEventListener("resize", applyResponsive);

  function toggleWidget(forceState) {
    isOpen = typeof forceState === "boolean" ? forceState : !isOpen;
    if (isOpen) {
      applyResponsive();
      container.style.opacity = "1";
      container.style.pointerEvents = "auto";
      container.style.transform = "translateY(0) scale(1)";
      button.innerHTML = closeSvg;
    } else {
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
      container.style.transform = "translateY(24px) scale(0.96)";
      button.innerHTML = chatSvg;
    }
  }

  button.addEventListener("click", function () {
    toggleWidget();
  });

  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "basemind:close") {
      toggleWidget(false);
    }
  });

  // Attach to DOM
  function mount() {
    document.body.appendChild(container);
    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
