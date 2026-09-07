(function () {
  "use strict";

  var STORAGE_KEY = "decision-tree-data";
  var NODE_WIDTH = 180;
  var LEVEL_HEIGHT = 160;
  var SIBLING_GAP = 40;
  var MARGIN_X = 120;
  var MARGIN_Y = 60;

  var canvasWrapper = document.getElementById("canvas-wrapper");
  var nodeLayer = document.getElementById("node-layer");
  var labelLayer = document.getElementById("label-layer");
  var edgeLayer = document.getElementById("edge-layer");
  var arrangeBtn = document.getElementById("arrange-btn");
  var resetBtn = document.getElementById("reset-btn");

  var state = null;

  function uid() {
    return "n" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function createDefaultState() {
    var rootId = uid();
    return {
      rootId: rootId,
      nodes: {
        // id: { id, text, x, y }
      },
      edges: [] // { id, from, to, label }
    };
  }

  function makeInitialState() {
    var s = createDefaultState();
    s.nodes[s.rootId] = { id: s.rootId, text: "Thema", x: 0, y: 0 };
    return s;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return makeInitialState();
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.rootId || !parsed.nodes || !parsed.nodes[parsed.rootId]) {
        return makeInitialState();
      }
      if (!Array.isArray(parsed.edges)) parsed.edges = [];
      return parsed;
    } catch (e) {
      console.warn("Konnte gespeicherte Daten nicht laden, starte neu.", e);
      return makeInitialState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

    growCanvasIfNeeded();
  }

  function growCanvasIfNeeded() {
    var maxX = 0, maxY = 0;
    Object.keys(state.nodes).forEach(function (id) {
      var n = state.nodes[id];
      maxX = Math.max(maxX, n.x + NODE_WIDTH + 300);
      maxY = Math.max(maxY, n.y + 300);
    });
    var canvas = document.getElementById("canvas");
    canvas.style.width = Math.max(3000, maxX) + "px";
    canvas.style.height = Math.max(3000, maxY) + "px";
  }

  function renderNode(node) {
    var el = document.createElement("div");
    el.className = "node";
    el.dataset.id = node.id;
    el.style.left = node.x + "px";
    el.style.top = node.y + "px";

    // delete button (root cannot be deleted)
    if (node.id !== state.rootId) {
      var delBtn = document.createElement("button");
      delBtn.className = "delete-btn";
      delBtn.type = "button";
      delBtn.title = "Knoten löschen";
      delBtn.textContent = "×";
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
    textEl.addEventListener("input", function () {
      node.text = textEl.textContent;
      save();
    });
    textEl.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });
    textEl.addEventListener("blur", function () {
      if (textEl.textContent.trim() === "") {
        textEl.textContent = "Thema";
        node.text = "Thema";
        save();
      }
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
    select.addEventListener("mousedown", function (e) { e.stopPropagation(); });
    select.addEventListener("click", function (e) { e.stopPropagation(); });

    var addBtn = document.createElement("button");
    addBtn.className = "add-outputs-btn";
    addBtn.type = "button";
    addBtn.textContent = "Outputs erstellen";
    addBtn.addEventListener("mousedown", function (e) { e.stopPropagation(); });
    addBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var count = parseInt(select.value, 10);
      addOutputs(node.id, count);
    });

    controls.appendChild(select);
    controls.appendChild(addBtn);
    el.appendChild(controls);

    el.addEventListener("mousedown", function (e) {
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

  function renderEdge(edge) {
    var fromNode = state.nodes[edge.from];
    var toNode = state.nodes[edge.to];
    if (!fromNode || !toNode) return;

    var start = nodeCenter(fromNode);
    var end = nodeCenter(toNode);

    var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", start.bottomX);
    line.setAttribute("y1", start.bottomY);
    line.setAttribute("x2", end.topX);
    line.setAttribute("y2", end.topY);
    line.dataset.edgeId = edge.id;
    edgeLayer.appendChild(line);

    var midX = (start.bottomX + end.topX) / 2;
    var midY = (start.bottomY + end.topY) / 2;

    var label = document.createElement("div");
    label.className = "edge-label";
    label.contentEditable = "true";
    label.spellcheck = false;
    label.textContent = edge.label;
    label.style.left = midX + "px";
    label.style.top = midY + "px";
    label.addEventListener("mousedown", function (e) { e.stopPropagation(); });
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
        var lineEl = edgeLayer.querySelector('line[data-edge-id="' + edge.id + '"]');
        var labelEl = null;
        // find matching label by index (rebuild positions)
        var fromNode = state.nodes[edge.from];
        var toNode = state.nodes[edge.to];
        if (!fromNode || !toNode || !lineEl) return;
        var start = nodeCenter(fromNode);
        var end = nodeCenter(toNode);
        lineEl.setAttribute("x1", start.bottomX);
        lineEl.setAttribute("y1", start.bottomY);
        lineEl.setAttribute("x2", end.topX);
        lineEl.setAttribute("y2", end.topY);

        var midX = (start.bottomX + end.topX) / 2;
        var midY = (start.bottomY + end.topY) / 2;
        var labels = labelLayer.querySelectorAll(".edge-label");
        var idx = state.edges.indexOf(edge);
        labelEl = labels[idx];
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
        text: "Thema",
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

  function startDrag(node, el, e) {
    if (e.button !== 0) return;
    var wrapperRect = canvasWrapper.getBoundingClientRect();
    var scrollLeft = canvasWrapper.scrollLeft;
    var scrollTop = canvasWrapper.scrollTop;
    var pointerX = e.clientX - wrapperRect.left + scrollLeft;
    var pointerY = e.clientY - wrapperRect.top + scrollTop;

    dragState = {
      node: node,
      el: el,
      offsetX: pointerX - node.x,
      offsetY: pointerY - node.y
    };
    el.classList.add("dragging");
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!dragState) return;
    var wrapperRect = canvasWrapper.getBoundingClientRect();
    var scrollLeft = canvasWrapper.scrollLeft;
    var scrollTop = canvasWrapper.scrollTop;
    var pointerX = e.clientX - wrapperRect.left + scrollLeft;
    var pointerY = e.clientY - wrapperRect.top + scrollTop;

    var newX = Math.max(0, pointerX - dragState.offsetX);
    var newY = Math.max(0, pointerY - dragState.offsetY);

    dragState.node.x = newX;
    dragState.node.y = newY;
    dragState.el.style.left = newX + "px";
    dragState.el.style.top = newY + "px";

    updateConnectedEdges(dragState.node.id);
  }

  function onDragEnd() {
    if (!dragState) return;
    dragState.el.classList.remove("dragging");
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    dragState = null;
    growCanvasIfNeeded();
    save();
  }

  // ---------- Toolbar ----------
  arrangeBtn.addEventListener("click", function () {
    autoLayout();
    render();
    save();
  });

  resetBtn.addEventListener("click", function () {
    var confirmed = window.confirm("Neuen Baum starten? Der aktuelle Baum wird gelöscht.");
    if (!confirmed) return;
    state = makeInitialState();
    autoLayout();
    render();
    save();
  });

  // ---------- Init ----------
  state = load();
  autoLayout();
  render();
  save();
})();
