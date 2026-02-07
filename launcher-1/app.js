const RANDOM_WORKS_X3 = ["nebula", "prism", "tide"];
const animationMode = RANDOM_WORKS_X3[Math.floor(Math.random() * RANDOM_WORKS_X3.length)];
console.log(`Fluxline animation mode: ${animationMode}`);

const state = {
  data: [],
  filtered: [],
  fuse: null,
  activeIndex: 0,
  lastQuery: "",
  driftTimers: [],
};

const constellation = document.getElementById("constellation");
const searchInput = document.getElementById("search");
const modeToggle = document.getElementById("modeToggle");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const addBtn = document.getElementById("addBtn");
const panel = document.getElementById("editor");
const closePanel = document.getElementById("closePanel");
const itemForm = document.getElementById("itemForm");
const hotkeys = document.getElementById("hotkeys");

const storedTheme = localStorage.getItem("fluxline-theme");
if (storedTheme) {
  document.documentElement.dataset.theme = storedTheme;
}

const debounce = (fn, delay = 150) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

const persist = () => {
  localStorage.setItem("fluxline-data", JSON.stringify(state.data));
};

const createIcon = (iconValue) => {
  const icon = document.createElement("div");
  icon.className = "node__icon";
  if (iconValue && /^(https?:)?\/\//.test(iconValue)) {
    const img = document.createElement("img");
    img.src = iconValue;
    img.alt = "";
    img.loading = "lazy";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.borderRadius = "12px";
    icon.appendChild(img);
  } else {
    icon.textContent = iconValue || "✨";
  }
  return icon;
};

const buildNode = (item) => {
  const node = document.createElement("article");
  node.className = "node";
  node.dataset.id = item.id;

  const icon = createIcon(item.icon);
  const meta = document.createElement("div");
  meta.className = "node__meta";

  const title = document.createElement("div");
  title.className = "node__title";
  title.textContent = item.name;

  const tags = document.createElement("div");
  tags.className = "node__tags";
  tags.textContent = item.tags || "";

  const description = document.createElement("div");
  description.className = "node__description";
  description.textContent = item.description || item.group || "";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "node__delete";
  deleteBtn.type = "button";
  deleteBtn.textContent = "✕";
  deleteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    removeItem(item.id, node);
  });

  meta.appendChild(title);
  meta.appendChild(tags);
  if (description.textContent) {
    meta.appendChild(description);
  }

  node.appendChild(icon);
  node.appendChild(meta);
  node.appendChild(deleteBtn);

  node.addEventListener("click", () => {
    window.open(item.url, "_blank");
  });

  return node;
};

const computePositions = (count) => {
  const positions = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const radius = Math.sqrt((i + 1) / (count + 3));
    const angle = i * goldenAngle;
    const wobble = Math.sin(i * 0.9) * 0.12;
    const r = (0.2 + radius * 0.75 + wobble) * 45;
    const x = 50 + Math.cos(angle) * r + Math.sin(angle * 1.3) * 6;
    const y = 50 + Math.sin(angle) * r + Math.cos(angle * 0.7) * 8;
    positions.push({ x, y });
  }
  return positions;
};

const layoutNodes = () => {
  const nodes = Array.from(constellation.children);
  const positions = computePositions(nodes.length);
  nodes.forEach((node, index) => {
    const { x, y } = positions[index];
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
  });
};

const applyDrift = () => {
  state.driftTimers.forEach((timer) => timer.kill());
  state.driftTimers = [];
  const nodes = Array.from(constellation.children);
  nodes.forEach((node, index) => {
    const drift = gsap.to(node, {
      x: `+=${Math.sin(index) * 18}`,
      y: `+=${Math.cos(index) * 18}`,
      duration: 5 + (index % 5),
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
    state.driftTimers.push(drift);
  });
};

const animationFor = {
  nebula: {
    hide: (targets) =>
      anime({
        targets,
        opacity: 0,
        scale: 0.2,
        translateX: () => anime.random(-120, 120),
        translateY: () => anime.random(-120, 120),
        duration: 500,
        easing: "easeInQuad",
      }),
    show: (targets) =>
      anime({
        targets,
        opacity: [0, 1],
        scale: [0.2, 1],
        translateX: [0, 0],
        translateY: [0, 0],
        duration: 700,
        easing: "easeOutElastic(1, .6)",
      }),
  },
  prism: {
    hide: (targets) =>
      anime({
        targets,
        opacity: 0,
        rotate: 45,
        translateX: () => anime.random(-80, 80),
        translateY: () => anime.random(-80, 80),
        duration: 420,
        easing: "easeInCubic",
      }),
    show: (targets) =>
      anime({
        targets,
        opacity: [0, 1],
        rotate: [45, 0],
        translateX: [0, 0],
        translateY: [0, 0],
        duration: 620,
        easing: "easeOutBack(1.2)",
      }),
  },
  tide: {
    hide: (targets) =>
      anime({
        targets,
        opacity: 0,
        scaleX: 0.4,
        scaleY: 0.4,
        translateY: () => anime.random(80, 160),
        duration: 480,
        easing: "easeInSine",
      }),
    show: (targets) =>
      anime({
        targets,
        opacity: [0, 1],
        scale: [0.4, 1],
        translateY: [0, 0],
        duration: 640,
        easing: "easeOutSine",
      }),
  },
};

const renderNodes = () => {
  constellation.innerHTML = "";
  const fragment = document.createDocumentFragment();
  state.data.forEach((item) => fragment.appendChild(buildNode(item)));
  constellation.appendChild(fragment);
  layoutNodes();
  applyDrift();
};

const updateHotkeys = (list) => {
  hotkeys.innerHTML = "";
  if (list.length > 0 && list.length <= 9) {
    list.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "hotkey";
      row.innerHTML = `<span>${index + 1}</span> ${item.name}`;
      hotkeys.appendChild(row);
    });
    hotkeys.classList.add("visible");
  } else {
    hotkeys.classList.remove("visible");
  }
};

const setActive = (index) => {
  const nodes = Array.from(constellation.children);
  nodes.forEach((node) => node.classList.remove("node--active"));
  if (nodes[index]) {
    nodes[index].classList.add("node--active");
    state.activeIndex = index;
  }
};

const filterNodes = (query, isReset = false) => {
  const normalized = query.trim();
  const prevLength = state.lastQuery.length;
  state.lastQuery = normalized;
  const matches = normalized
    ? state.fuse.search(normalized).map((result) => result.item)
    : state.data;

  state.filtered = matches;
  updateHotkeys(matches);
  const matchIds = new Set(matches.map((item) => item.id));
  const nodes = Array.from(constellation.children);

  nodes.forEach((node) => {
    const shouldShow = matchIds.has(node.dataset.id);
    if (!shouldShow) {
      animationFor[animationMode].hide(node);
      setTimeout(() => {
        node.style.display = "none";
      }, 420);
    } else {
      node.style.display = "flex";
      if (normalized.length < prevLength || isReset) {
        animationFor[animationMode].show(node);
      }
    }
  });

  if (matches.length) {
    setActive(0);
  }

  if (isReset) {
    gsap.fromTo(
      constellation,
      { scale: 0.98, opacity: 0.7 },
      { scale: 1, opacity: 1, duration: 0.6, ease: "power3.out" }
    );
  }
};

const debouncedFilter = debounce((event) => {
  filterNodes(event.target.value);
});

const removeItem = (id, node) => {
  anime({
    targets: node,
    opacity: 0,
    scale: 0,
    duration: 400,
    easing: "easeInBack",
    complete: () => {
      state.data = state.data.filter((item) => item.id !== id);
      persist();
      renderNodes();
      filterNodes(searchInput.value);
    },
  });
};

const openPanel = () => {
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
};

const closePanelUI = () => {
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  itemForm.reset();
};

const handleExport = () => {
  const payload = JSON.stringify(state.data, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "launcher-export.json";
  link.click();
  URL.revokeObjectURL(url);
};

const handleImport = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (Array.isArray(parsed)) {
        state.data = parsed;
        persist();
        renderNodes();
        filterNodes(searchInput.value, true);
      }
    } catch (error) {
      console.error("Import failed", error);
    }
  };
  reader.readAsText(file);
};

const handleSubmit = (event) => {
  event.preventDefault();
  const formData = new FormData(itemForm);
  const newItem = {
    id: crypto.randomUUID(),
    name: formData.get("name"),
    tags: formData.get("tags"),
    url: formData.get("url"),
    icon: formData.get("icon"),
    group: formData.get("group"),
    description: formData.get("description"),
  };
  state.data.unshift(newItem);
  persist();
  renderNodes();
  filterNodes(searchInput.value, true);
  closePanelUI();
};

const loadData = async () => {
  const cached = localStorage.getItem("fluxline-data");
  if (cached) {
    state.data = JSON.parse(cached);
  } else {
    const response = await fetch("data.json");
    state.data = await response.json();
  }

  state.fuse = new Fuse(state.data, {
    threshold: 0.4,
    keys: ["name", "tags", "url", "group", "description"],
  });
  renderNodes();
  state.filtered = state.data;
  updateHotkeys(state.filtered);
};

modeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = isDark ? "light" : "dark";
  localStorage.setItem("fluxline-theme", document.documentElement.dataset.theme);
  gsap.fromTo(document.body, { opacity: 0.8 }, { opacity: 1, duration: 0.5 });
});

searchInput.addEventListener("input", debouncedFilter);

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    searchInput.value = "";
    filterNodes("", true);
  }
  if (event.key === "Enter") {
    if (state.filtered.length === 1) {
      window.open(state.filtered[0].url, "_blank");
    } else if (state.filtered[state.activeIndex]) {
      window.open(state.filtered[state.activeIndex].url, "_blank");
    }
  }
  if (["ArrowRight", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const next = (state.activeIndex + 1) % state.filtered.length;
    setActive(next);
  }
  if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    const prev = (state.activeIndex - 1 + state.filtered.length) % state.filtered.length;
    setActive(prev);
  }
  if (/^[1-9]$/.test(event.key) && state.filtered.length <= 9) {
    const index = Number(event.key) - 1;
    if (state.filtered[index]) {
      window.open(state.filtered[index].url, "_blank");
    }
  }
});

exportBtn.addEventListener("click", handleExport);
importInput.addEventListener("change", handleImport);
addBtn.addEventListener("click", openPanel);
closePanel.addEventListener("click", closePanelUI);
itemForm.addEventListener("submit", handleSubmit);

window.addEventListener("resize", layoutNodes);

loadData().then(() => {
  searchInput.focus();
  gsap.fromTo(
    constellation.children,
    { opacity: 0, scale: 0.6 },
    { opacity: 1, scale: 1, duration: 0.8, stagger: 0.02, ease: "power3.out" }
  );
});
