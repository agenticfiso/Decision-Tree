(function () {
  "use strict";

  var STORAGE_KEY = "decision-tree-workspace";
  var NODE_WIDTH = 180;
  var LEVEL_HEIGHT = 160;
  var SIBLING_GAP = 40;
  var MARGIN_X = 120;
  var MARGIN_Y = 60;

  var canvasWrapper = document.getElementById("canvas-wrapper");
  var canvasEl = document.getElementById("canvas");
  var nodeLayer = document.getElementById("node-layer");
  var labelLayer = document.getElementById("label-layer");
  var edgeLayer = document.getElementById("edge-layer");
  var arrangeBtn = document.getElementById("arrange-btn");
  var tabList = document.getElementById("tab-list");
  var newTabBtn = document.getElementById("new-tab-btn");

  var workspace = null; // { activeId, order: [diagramId...], diagrams: { id: diagram } }
  var state = null; // reference to workspace.diagrams[workspace.activeId]

  // ---------- Pan & zoom ----------
  var MIN_SCALE = 0.2;
  var MAX_SCALE = 2.5;
  var view = { x: 0, y: 0, scale: 1 };

  function applyView() {
    canvasEl.style.transform = "translate(" + view.x + "px, " + view.y + "px) scale(" + view.scale + ")";
  }

  function uid() {
    return "n" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // ---------- Diagram / workspace model ----------
  function makeDiagram(name) {
    var rootId = uid();
    var diagram = {
      id: uid(),
      name: name,
      rootId: rootId,
      nodes: {},
      edges: []
    };
    diagram.nodes[rootId] = { id: rootId, text: "", x: 0, y: 0 };
    return diagram;
  }

  function makeInitialWorkspace() {
    var diagram = makeDiagram("Diagramm 1");
    var diagrams = {};
    diagrams[diagram.id] = diagram;
    return { activeId: diagram.id, order: [diagram.id], diagrams: diagrams };
  }

  function setActiveState() {
    state = workspace.diagrams[workspace.activeId];
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return makeInitialWorkspace();
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.diagrams || !Array.isArray(parsed.order)) {
        return makeInitialWorkspace();
      }
      var validOrder = parsed.order.filter(function (id) {
        var d = parsed.diagrams[id];
        return d && d.rootId && d.nodes && d.nodes[d.rootId];
      });
      if (validOrder.length === 0) return makeInitialWorkspace();
      validOrder.forEach(function (id) {
        var d = parsed.diagrams[id];
        if (!Array.isArray(d.edges)) d.edges = [];
        if (!d.name || !String(d.name).trim()) d.name = "Diagramm";
      });
      var activeId = parsed.activeId && validOrder.indexOf(parsed.activeId) !== -1
        ? parsed.activeId
        : validOrder[0];
      return { activeId: activeId, order: validOrder, diagrams: parsed.diagrams };
    } catch (e) {
      console.warn("Konnte gespeicherte Daten nicht laden, starte neu.", e);
      return makeInitialWorkspace();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch (e) {
      console.warn("Konnte Daten nicht speichern.", e);
    }
  }

  function childrenOf(nodeId) {
    return state.edges.filter(function (e) { return e.from === nodeId; }).map(function (e) { return e.to; });
  }

  function edgesFrom(nodeId) {
    return state.edges.filter(function (e) { return e.from === nodeId; });
  }

  function descendantsOf(nodeId) {
    var result = [];
    var stack = childrenOf(nodeId).slice();
    while (stack.length) {
      var id = stack.pop();
      result.push(id);
      stack = stack.concat(childrenOf(id));
    }
    return result;
  }

  // ---------- Layout ----------
  function autoLayout() {
    var depths = {};
    var positions = {};
    var leafCounter = 0;

    function assignDepth(id, depth) {
      depths[id] = depth;
      childrenOf(id).forEach(function (c) { assignDepth(c, depth + 1); });
    }
    assignDepth(state.rootId, 0);

    function assignX(id) {
      var kids = childrenOf(id);
      if (kids.length === 0) {
        var x = leafCounter * (NODE_WIDTH + SIBLING_GAP);
        leafCounter++;
        positions[id] = x;
        return x;
      }
      var xs = kids.map(assignX);
      var val = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
      positions[id] = val;
      return val;
    }
    assignX(state.rootId);

    Object.keys(depths).forEach(function (id) {
      var node = state.nodes[id];
      if (!node) return;
      node.x = positions[id] + MARGIN_X;
      node.y = depths[id] * LEVEL_HEIGHT + MARGIN_Y;
    });
  }

  // ---------- Tabs ----------
  function renderTabs() {
    tabList.innerHTML = "";

    workspace.order.forEach(function (id) {
      var diagram = workspace.diagrams[id];
      var tab = document.createElement("div");
      tab.className = "tab" + (id === workspace.activeId ? " active" : "");
      tab.dataset.id = id;

      var nameEl = document.createElement("span");
      nameEl.className = "tab-name";
      nameEl.contentEditable = "false";
      nameEl.spellcheck = false;
      nameEl.textContent = diagram.name;
      nameEl.title = diagram.name;
      nameEl.addEventListener("input", function () {
        diagram.name = nameEl.textContent;
        nameEl.title = diagram.name;
        save();
      });
      nameEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          nameEl.blur();
        }
      });
      nameEl.addEventListener("blur", function () {
        if (nameEl.textContent.trim() === "") {
          nameEl.textContent = "Diagramm";
          diagram.name = "Diagramm";
        }
        nameEl.contentEditable = "false";
        save();
      });
      tab.appendChild(nameEl);

      var closeBtn = document.createElement("button");
      closeBtn.className = "tab-close";
      closeBtn.type = "button";
      closeBtn.title = "Diagramm schließen";
      closeBtn.textContent = "×";
      closeBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeDiagram(id);
      });
      tab.appendChild(closeBtn);

      tab.addEventListener("click", function (e) {
        if (id !== workspace.activeId) {
          switchDiagram(id);
          return;
        }
        if (e.target === nameEl && nameEl.contentEditable !== "true") {
          nameEl.contentEditable = "true";
          nameEl.focus();
          document.execCommand("selectAll", false, null);
        }
      });

      tabList.appendChild(tab);
    });
  }

  function switchDiagram(id) {
    if (!workspace.diagrams[id] || id === workspace.activeId) return;
    workspace.activeId = id;
    setActiveState();
    renderTabs();
    render();
    save();
  }

  function addDiagram() {
    var diagram = makeDiagram("Diagramm " + (workspace.order.length + 1));
    workspace.diagrams[diagram.id] = diagram;
    workspace.order.push(diagram.id);
    workspace.activeId = diagram.id;
    setActiveState();
    autoLayout();
    renderTabs();
    render();
    save();
  }

  function closeDiagram(id) {
    var diagram = workspace.diagrams[id];
    if (!diagram) return;
    var confirmed = window.confirm(
      'Diagramm "' + diagram.name + '" wirklich schließen? Es wird dauerhaft gelöscht.'
    );
    if (!confirmed) return;

    var idx = workspace.order.indexOf(id);
    workspace.order.splice(idx, 1);
    delete workspace.diagrams[id];

    if (workspace.order.length === 0) {
      var fresh = makeDiagram("Diagramm 1");
      workspace.diagrams[fresh.id] = fresh;
      workspace.order.push(fresh.id);
      workspace.activeId = fresh.id;
    } else if (workspace.activeId === id) {
      var nextIdx = Math.min(idx, workspace.order.length - 1);
      workspace.activeId = workspace.order[nextIdx];
    }

    setActiveState();
    autoLayout();
    renderTabs();
    render();
    save();
  }

  // ---------- Rendering ----------
  function render() {
    nodeLayer.innerHTML = "";
    labelLayer.innerHTML = "";
    edgeLayer.innerHTML = "";

    Object.keys(state.nodes).forEach(function (id) {
      renderNode(state.nodes[id]);
    });

    state.edges.forEach(function (edge) {
      renderEdge(edge);
    });
  }

  function renderNode(node) {
    var el = document.createElement("div");
    el.className = "node";
    el.dataset.id = node.id;
    el.style.left = node.x + "px";
    el.style.top = node.y + "px";

    if (node.id !== state.rootId) {
      var delBtn = document.createElement("button");
      delBtn.className = "delete-btn";
      delBtn.type = "button";
      delBtn.title = "Knoten löschen";
      delBtn.textContent = "×";
      delBtn.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
      });
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteNode(node.id);
      });
      el.appendChild(delBtn);
    }

    var textEl = document.createElement("div");
    textEl.className = "node-text";
    textEl.contentEditable = "true";
    textEl.spellcheck = false;
    textEl.textContent = node.text;
    if (node.text.trim() === "") textEl.classList.add("is-empty");
    textEl.addEventListener("input", function () {
      node.text = textEl.textContent;
      textEl.classList.toggle("is-empty", textEl.textContent.trim() === "");
      save();
    });
    textEl.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
    });
    el.appendChild(textEl);

    var controls = document.createElement("div");
    controls.className = "node-controls";

    var select = document.createElement("select");
    select.className = "output-count";
    for (var i = 1; i <= 6; i++) {
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      select.appendChild(opt);
    }
    select.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    select.addEventListener("click", function (e) { e.stopPropagation(); });

    var addBtn = document.createElement("button");
    addBtn.className = "add-outputs-btn";
    addBtn.type = "button";
    addBtn.textContent = "Outputs erstellen";
    addBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    addBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var count = parseInt(select.value, 10);
      addOutputs(node.id, count);
    });

    controls.appendChild(select);
    controls.appendChild(addBtn);
    el.appendChild(controls);

    el.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      startDrag(node, el, e);
    });

    nodeLayer.appendChild(el);
  }

  function nodeCenter(node) {
    var el = nodeLayer.querySelector('.node[data-id="' + node.id + '"]');
    var height = el ? el.offsetHeight : 64;
    return {
      topX: node.x + NODE_WIDTH / 2,
      topY: node.y,
      bottomX: node.x + NODE_WIDTH / 2,
      bottomY: node.y + height
    };
  }

  var MARKER_SIZE = 5;

  function elbowPath(start, end) {
    var midY = (start.bottomY + end.topY) / 2;
    return "M " + start.bottomX + " " + start.bottomY +
      " L " + start.bottomX + " " + midY +
      " L " + end.topX + " " + midY +
      " L " + end.topX + " " + end.topY;
  }

  function setMarkerPos(rect, x, y) {
    rect.setAttribute("x", x - MARKER_SIZE / 2);
    rect.setAttribute("y", y - MARKER_SIZE / 2);
  }

  function makeMarker(edgeId, role) {
    var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("class", "edge-marker");
    rect.setAttribute("width", MARKER_SIZE);
    rect.setAttribute("height", MARKER_SIZE);
    rect.dataset.edgeId = edgeId;
    rect.dataset.role = role;
    return rect;
  }

  function renderEdge(edge) {
    var fromNode = state.nodes[edge.from];
    var toNode = state.nodes[edge.to];
    if (!fromNode || !toNode) return;

    var start = nodeCenter(fromNode);
    var end = nodeCenter(toNode);

    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", elbowPath(start, end));
    path.dataset.edgeId = edge.id;
    edgeLayer.appendChild(path);

    var startMarker = makeMarker(edge.id, "start");
    setMarkerPos(startMarker, start.bottomX, start.bottomY);
    edgeLayer.appendChild(startMarker);

    var endMarker = makeMarker(edge.id, "end");
    setMarkerPos(endMarker, end.topX, end.topY);
    edgeLayer.appendChild(endMarker);

    var midX = (start.bottomX + end.topX) / 2;
    var midY = (start.bottomY + end.topY) / 2;

    var label = document.createElement("div");
    label.className = "edge-label";
    label.contentEditable = "true";
    label.spellcheck = false;
    label.textContent = edge.label;
    label.style.left = midX + "px";
    label.style.top = midY + "px";
    label.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    label.addEventListener("input", function () {
      edge.label = label.textContent;
      save();
    });
    label.addEventListener("blur", function () {
      if (label.textContent.trim() === "") {
        label.textContent = "Output";
        edge.label = "Output";
        save();
      }
    });
    labelLayer.appendChild(label);
  }

  function updateConnectedEdges(nodeId) {
    state.edges.forEach(function (edge) {
      if (edge.from === nodeId || edge.to === nodeId) {
        var pathEl = edgeLayer.querySelector('path[data-edge-id="' + edge.id + '"]');
        var fromNode = state.nodes[edge.from];
        var toNode = state.nodes[edge.to];
        if (!fromNode || !toNode || !pathEl) return;
        var start = nodeCenter(fromNode);
        var end = nodeCenter(toNode);
        pathEl.setAttribute("d", elbowPath(start, end));

        var startMarker = edgeLayer.querySelector('rect[data-edge-id="' + edge.id + '"][data-role="start"]');
        var endMarker = edgeLayer.querySelector('rect[data-edge-id="' + edge.id + '"][data-role="end"]');
        if (startMarker) setMarkerPos(startMarker, start.bottomX, start.bottomY);
        if (endMarker) setMarkerPos(endMarker, end.topX, end.topY);

        var midX = (start.bottomX + end.topX) / 2;
        var midY = (start.bottomY + end.topY) / 2;
        var labels = labelLayer.querySelectorAll(".edge-label");
        var idx = state.edges.indexOf(edge);
        var labelEl = labels[idx];
        if (labelEl) {
          labelEl.style.left = midX + "px";
          labelEl.style.top = midY + "px";
        }
      }
    });
  }

  // ---------- Actions ----------
  function addOutputs(parentId, count) {
    var parent = state.nodes[parentId];
    if (!parent) return;
    var existingCount = edgesFrom(parentId).length;
    for (var i = 0; i < count; i++) {
      var childId = uid();
      state.nodes[childId] = {
        id: childId,
        text: "",
        x: parent.x,
        y: parent.y + LEVEL_HEIGHT
      };
      state.edges.push({
        id: uid(),
        from: parentId,
        to: childId,
        label: "Output " + (existingCount + i + 1)
      });
    }
    autoLayout();
    render();
    save();
  }

  function deleteNode(nodeId) {
    if (nodeId === state.rootId) return;
    var toRemove = [nodeId].concat(descendantsOf(nodeId));
    toRemove.forEach(function (id) {
      delete state.nodes[id];
    });
    state.edges = state.edges.filter(function (e) {
      return toRemove.indexOf(e.from) === -1 && toRemove.indexOf(e.to) === -1;
    });
    autoLayout();
    render();
    save();
  }

  // ---------- Dragging ----------
  var dragState = null;

  function screenToCanvas(clientX, clientY) {
    var wrapperRect = canvasWrapper.getBoundingClientRect();
    return {
      x: (clientX - wrapperRect.left - view.x) / view.scale,
      y: (clientY - wrapperRect.top - view.y) / view.scale
    };
  }

  function startDrag(node, el, e) {
    if (e.button !== undefined && e.button !== 0) return;
    var pointer = screenToCanvas(e.clientX, e.clientY);
    var pointerX = pointer.x;
    var pointerY = pointer.y;

    dragState = {
      node: node,
      el: el,
      pointerId: e.pointerId,
      offsetX: pointerX - node.x,
      offsetY: pointerY - node.y
    };
    el.classList.add("dragging");
    if (el.setPointerCapture && e.pointerId !== undefined) {
      el.setPointerCapture(e.pointerId);
    }
    el.addEventListener("pointermove", onDragMove);
    el.addEventListener("pointerup", onDragEnd);
    el.addEventListener("pointercancel", onDragEnd);
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!dragState) return;
    var pointer = screenToCanvas(e.clientX, e.clientY);

    var newX = pointer.x - dragState.offsetX;
    var newY = pointer.y - dragState.offsetY;

    dragState.node.x = newX;
    dragState.node.y = newY;
    dragState.el.style.left = newX + "px";
    dragState.el.style.top = newY + "px";

    updateConnectedEdges(dragState.node.id);
  }

  function onDragEnd() {
    if (!dragState) return;
    var el = dragState.el;
    el.classList.remove("dragging");
    el.removeEventListener("pointermove", onDragMove);
    el.removeEventListener("pointerup", onDragEnd);
    el.removeEventListener("pointercancel", onDragEnd);
    dragState = null;
    save();
  }

  // ---------- Canvas pan & zoom ----------
  var panState = null;

  canvasWrapper.addEventListener("wheel", function (e) {
    e.preventDefault();
    var wrapperRect = canvasWrapper.getBoundingClientRect();
    var mx = e.clientX - wrapperRect.left;
    var my = e.clientY - wrapperRect.top;
    var canvasX = (mx - view.x) / view.scale;
    var canvasY = (my - view.y) / view.scale;

    var factor = Math.exp(-e.deltaY * 0.001);
    var newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));

    view.x = mx - canvasX * newScale;
    view.y = my - canvasY * newScale;
    view.scale = newScale;
    applyView();
  }, { passive: false });

  function onPanMove(e) {
    if (!panState) return;
    view.x = panState.startViewX + (e.clientX - panState.startX);
    view.y = panState.startViewY + (e.clientY - panState.startY);
    applyView();
  }

  function onPanEnd() {
    if (!panState) return;
    panState = null;
    canvasWrapper.classList.remove("panning");
    canvasWrapper.removeEventListener("pointermove", onPanMove);
    canvasWrapper.removeEventListener("pointerup", onPanEnd);
    canvasWrapper.removeEventListener("pointercancel", onPanEnd);
  }

  canvasWrapper.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    panState = {
      startX: e.clientX,
      startY: e.clientY,
      startViewX: view.x,
      startViewY: view.y
    };
    canvasWrapper.classList.add("panning");
    if (canvasWrapper.setPointerCapture && e.pointerId !== undefined) {
      canvasWrapper.setPointerCapture(e.pointerId);
    }
    canvasWrapper.addEventListener("pointermove", onPanMove);
    canvasWrapper.addEventListener("pointerup", onPanEnd);
    canvasWrapper.addEventListener("pointercancel", onPanEnd);
  });

  // ---------- Toolbar ----------
  arrangeBtn.addEventListener("click", function () {
    autoLayout();
    render();
    save();
  });

  newTabBtn.addEventListener("click", function () {
    addDiagram();
  });

  // ---------- Init ----------
  applyView();
  workspace = load();
  setActiveState();
  autoLayout();
  renderTabs();
  render();
  save();
})();
