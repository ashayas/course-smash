// Course Smash client. Everything the models write goes in through textContent, never innerHTML.
import { buildingSvg, citySvg, finishedSvg, markSvg, progressOf, specFor, stackSvg } from "./city.js";
const app = document.getElementById("app");
const live = document.getElementById("live");

// Models sometimes write markdown. Only paired markers go, so code like "2 ** 3" survives.
const plainText = (text) => text.replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "$1").replace(/`([^`\n]+)`/g, "$1");

// Formulas are LaTeX inside \( \) or \[ \]. Dollar signs stay literal, since prices are common.
// KaTeX builds MathML nodes itself, so model text still never reaches innerHTML.
const MATH = /\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]/g;
function rich(text) {
  if (!text) return [];
  const nodes = [];
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(formula(m[1] ?? m[2], m[2] != null));
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
function formula(tex, display) {
  const span = document.createElement("span");
  span.className = display ? "math math-display" : "math";
  try {
    window.katex.render(tex, span, { output: "mathml", displayMode: display, throwOnError: false, trust: false, maxSize: 20, maxExpand: 200 });
  } catch {
    span.textContent = tex;
  }
  return span;
}

// Figures are model-drawn SVG, sanitized on the server and shown through <img>, where SVG can't run scripts.
function figureView(q) {
  if (!q.figure) return null;
  const img = h("img", { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(q.figure)}`, alt: q.figure_alt || "Diagram for this question", decoding: "async" });
  const wrap = h("figure", { class: "figure" }, img);
  img.addEventListener("error", () => wrap.remove());
  return wrap;
}

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else if (value === true) el.setAttribute(key, "");
    else if (value !== false && value != null) el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false).map((c) => (typeof c === "string" ? plainText(c) : c)));
  return el;
}

/** replaceChildren that, like h(), flattens arrays and skips null and false. The native method would print them as text. */
function mount(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
}

// Illustrations come from city.js: static markup built from numbers and palette colours only.
function art(markup) {
  const wrap = document.createElement("div");
  wrap.innerHTML = markup;
  return wrap.firstElementChild;
}
const plot = (markup, label) => h("div", { class: "plot", ...(label ? { role: "img", "aria-label": label } : {}) }, art(markup));

const TIME_ZONE = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    // The learner's time zone decides which day an answer belongs to.
    headers: { "X-Time-Zone": TIME_ZONE, ...(options.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (response.status === 401) {
    location.href = "/login";
    throw new Error("Please log in.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !(path.endsWith("/advance") && data.status)) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let renderToken = 0; // Ignore async work from a screen the learner has already left.

function focusFirst(el) {
  if (!el) return;
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

// Starter ideas and the building picker's choices come from the server, so the iOS app shows the same ones.
let appConfig = null;
const loadConfig = async () => (appConfig ??= await api("/api/app"));

/* Courses: the city, the composer and the learner's courses */

async function renderHome() {
  const token = ++renderToken;
  const prompt = h("textarea", { id: "prompt", maxlength: "2000", required: true, placeholder: "I want to understand... so that I can..." });
  const error = h("p", { class: "error-text", role: "alert", hidden: true });
  const chips = h("div", { class: "chips" });
  loadConfig().then(({ ideas }) => chips.replaceChildren(...ideas.map((idea) => h("button", { class: "chip", type: "button", onclick: () => { prompt.value = `I want to learn ${idea}.`; prompt.focus(); } }, idea)))).catch(() => {});
  const submit = h("button", { class: "button", type: "submit" }, "Build my course");
  const form = h("form", {
    class: "composer",
    onsubmit: async (event) => {
      event.preventDefault();
      error.hidden = true;
      submit.disabled = true;
      submit.textContent = "Starting...";
      try {
        const { id } = await api("/api/courses", { method: "POST", body: JSON.stringify({ prompt: prompt.value }) });
        location.hash = `#/course/${id}`;
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = "Build my course";
      }
    },
  },
    h("label", { for: "prompt", class: "visually-hidden" }, "What do you want to learn?"),
    prompt,
    chips,
    error,
    h("div", { class: "composer-row" }, submit),
  );
  const coursesGrid = h("div", { class: "grid" }, h("p", { class: "muted" }, "Loading your courses..."));
  const cityView = h("div", { class: "hero-art" });
  const drawCity = (courses) => {
    cityView.replaceChildren(art(citySvg(courses)));
    // Course buildings link to their course; the building site starts a new one.
    for (const lot of cityView.querySelectorAll("[data-lot]")) {
      const course = courses[Number(lot.dataset.lot)];
      const link = document.createElementNS("http://www.w3.org/2000/svg", "a");
      link.setAttribute("href", course ? `#/course/${course.id}` : "#prompt");
      link.setAttribute("aria-label", course ? (course.title || course.prompt) : "Start a new course");
      const tip = document.createElementNS("http://www.w3.org/2000/svg", "title");
      tip.textContent = course ? (course.title || course.prompt) : "Your next building: start a course";
      if (!course) link.addEventListener("click", (event) => { event.preventDefault(); prompt.focus(); });
      lot.replaceWith(link);
      link.append(tip, lot);
    }
  };
  drawCity([]);
  const librarySection = h("section", { class: "section", hidden: true });
  app.replaceChildren(
    h("section", { class: "panel hero" },
      h("div", { class: "hero-copy" },
        h("h1", { class: "hero-title" }, "Course Smash"),
        h("p", { class: "lead" }, "Say what you want to learn. I'll build a course of questions, read how you answer, and change what comes next."),
        h("p", { class: "hero-note" }, "Every course goes up as a building in your city, one floor per module. Pass a module and its floor lights up."),
        form),
      cityView),
    h("section", { class: "section" },
      h("div", { class: "section-head" }, h("h2", {}, "Your courses"), h("p", { class: "muted" }, "Pick up where you left off. Every answer you give shapes the next set of questions.")),
      coursesGrid),
    librarySection,
  );
  loadLibraryTeaser(librarySection, token);
  try {
    const { courses } = await api("/api/courses");
    if (token !== renderToken) return;
    drawCity(courses);
    coursesGrid.replaceChildren(...(courses.length ? courses.map(courseCard) : [h("p", { class: "card empty" }, "Nothing here yet. Your first building starts with one sentence.")]));
    if (!courses.length) coursesGrid.className = "";
  } catch (e) {
    if (token === renderToken) coursesGrid.replaceChildren(h("p", { class: "error-text" }, e.message));
  }
}

function courseCard(course) {
  const pips = Array.from({ length: course.modules }, (_, i) => h("span", { class: `pip${i < course.passed ? " on" : ""}` }));
  let status = "The agent is planning this one";
  if (course.status === "complete") status = "Finished";
  else if (course.modules) status = `${course.passed} of ${course.modules} modules done`;
  const average = course.average == null ? "" : ` · ${Math.round(course.average * 100)}% so far`;
  return h("a", { class: "card course-card", href: `#/course/${course.id}` },
    h("div", { class: "art" }, art(buildingSvg(course, progressOf(course)))),
    pips.length ? h("div", { class: "pips", "aria-hidden": "true" }, pips) : null,
    h("h3", {}, course.title || course.prompt),
    h("p", {}, status + average));
}

/* Library */
let libraryCache = null;
const loadLibrary = async () => (libraryCache ??= await api("/api/catalog"));

/** `after`: titles of the library courses this one builds on, shown when the card sits in a learning path. */
function libraryCard(course, after = []) {
  return h("a", { class: "card course-card", href: `#/library/${course.id}` },
    h("div", { class: "art" }, art(buildingSvg(course, { floors: course.modules, lit: 0, ambient: 0.18 }))),
    h("p", { class: "eyebrow" }, `${course.track_title} · ${course.level}`),
    h("h3", {}, course.title),
    h("p", {}, `${course.modules} modules · ${course.questions} questions`),
    after.length ? h("p", { class: "after" }, `After ${after.join(", ")}`) : null);
}

async function loadLibraryTeaser(section, token) {
  try {
    const { tracks, courses } = await loadLibrary();
    if (token !== renderToken || !courses.length) return;
    section.hidden = false;
    section.replaceChildren(
      h("div", { class: "section-head" },
        h("h2", {}, "Library"),
        h("div", {}, h("p", { class: "muted" }, `${courses.length} ready-made courses with a question bank behind each module. Start one and it adapts to you like any other.`),
          h("div", { class: "actions" }, h("a", { class: "button button-quiet", href: "#/library" }, "Browse the library")))),
      ...Object.entries(tracks).filter(([key]) => courses.some((c) => c.track === key)).map(([key, title]) => {
        const inTrack = courses.filter((c) => c.track === key);
        return h("div", { class: "track" },
          h("div", { class: "track-head" }, h("h3", {}, title), h("a", { class: "link-button", href: `#/library?track=${key}` }, `All ${inTrack.length}`)),
          h("div", { class: "grid" }, inTrack.slice(0, 3).map((c) => libraryCard(c))));
      }),
    );
  } catch {
    // The library is optional on the home page.
  }
}

async function renderLibrary(params) {
  const token = ++renderToken;
  app.replaceChildren(h("div", { class: "panel stage" }, workingView("Opening the library")));
  let data;
  try {
    data = await loadLibrary();
  } catch (e) {
    if (token === renderToken) app.replaceChildren(h("p", { class: "error-text", role: "alert" }, e.message));
    return;
  }
  if (token !== renderToken) return;
  // Tracks are how the library was written; topics are clusters by meaning, across tracks (see /api/topics).
  let track = params.get("track") || "";
  let topic = Number(params.get("topic")) || 0;
  let groupBy = data.topics.length && !params.get("track") ? "topic" : "track";
  const byId = new Map(data.courses.map((c) => [c.id, c]));
  const card = (c) => libraryCard(c, c.requires.map((id) => byId.get(id)?.title).filter(Boolean));
  const sections = h("div", {});
  const search = h("input", { type: "search", class: "search", placeholder: "Search by topic, like KV cache or HPA", "aria-label": "Search the library" });
  const grid = h("div", { class: "grid" });
  const count = h("p", { class: "muted", role: "status" });
  const chips = h("div", { class: "chips" });
  const modes = h("div", { class: "chips", role: "group", "aria-label": "Group the library" });
  const chip = (label, on, onclick) => h("button", { class: `chip${on ? " chip-on" : ""}`, type: "button", "aria-pressed": String(on), onclick }, label);
  const draw = () => {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (c) => words.every((w) => `${c.title} ${c.summary} ${c.tags.join(" ")} ${c.level} ${c.topic ?? ""}`.toLowerCase().includes(w));
    // By topic, courses come in study order, so each one follows the courses it builds on.
    const inTopic = (t) => t.course_ids.map((id) => byId.get(id)).filter((c) => c && matches(c));
    const shown = groupBy === "track"
      ? data.courses.filter((c) => (!track || c.track === track) && matches(c))
      : topic ? inTopic(data.topics.find((t) => t.id === topic) ?? { course_ids: [] }) : data.topics.flatMap(inTopic);
    const sectioned = groupBy === "topic" && !topic;
    grid.hidden = sectioned;
    grid.replaceChildren(...(sectioned ? [] : shown.map(groupBy === "topic" ? card : (c) => libraryCard(c))));
    mount(sections, sectioned ? data.topics.map((t) => {
      const list = inTopic(t);
      return list.length ? h("div", { class: "track" },
        h("div", { class: "track-head" }, h("div", {}, h("h3", {}, t.name), h("p", { class: "muted" }, t.summary)),
          h("button", { class: "link-button", type: "button", onclick: () => { topic = t.id; draw(); } }, `Path of ${list.length}`)),
        h("div", { class: "grid" }, list.map(card))) : null;
    }) : []);
    const about = groupBy === "topic" && topic ? data.topics.find((t) => t.id === topic)?.summary : "";
    count.textContent = `${shown.length} course${shown.length === 1 ? "" : "s"}${about ? `. ${about}` : ""}`;
    modes.replaceChildren(
      chip("By track", groupBy === "track", () => { groupBy = "track"; draw(); }),
      chip("By topic", groupBy === "topic", () => { groupBy = "topic"; draw(); }));
    modes.hidden = !data.topics.length;
    chips.replaceChildren(...(groupBy === "track"
      ? [["", "All tracks"], ...Object.entries(data.tracks)].map(([key, title]) => chip(title, key === track, () => { track = key; draw(); }))
      : [chip("All topics", !topic, () => { topic = 0; draw(); }),
        ...data.topics.map((t) => chip(`${t.name} · ${t.courses}`, t.id === topic, () => { topic = t.id; draw(); }))]));
  };
  search.addEventListener("input", draw);
  app.replaceChildren(
    h("header", { class: "course-head" }, h("div", {}, h("h1", {}, "Library"), h("p", {}, "Short courses on AI engineering, infrastructure, security, identity, robotics and AI policy. Each module has a bank of questions, so follow-ups target exactly what you missed."))),
    h("section", { class: "panel library-tools" }, search, modes, chips, count),
    h("section", { class: "section" }, grid, sections),
  );
  draw();
}

async function renderLibraryCourse(id) {
  const token = ++renderToken;
  app.replaceChildren(h("div", { class: "panel stage" }, workingView("Opening the course")));
  let course;
  try {
    course = await api(`/api/catalog/${id}`);
  } catch (e) {
    if (token === renderToken) app.replaceChildren(h("p", { class: "error-text", role: "alert" }, e.message), h("a", { class: "button button-quiet", href: "#/library" }, "Back to the library"));
    return;
  }
  if (token !== renderToken) return;
  const path = [
    course.prerequisites.length ? pathSection("Take these first", "This course builds on them. Skip any you already know.", course.prerequisites) : null,
    course.leads_to.length ? pathSection("Leads to", "Courses that build on this one.", course.leads_to) : null,
  ];
  const onPath = new Set([...course.prerequisites, ...course.leads_to].map((c) => c.id));
  const similar = h("section", { class: "section", hidden: true, "aria-live": "polite" });
  const slips = h("section", { class: "card", hidden: true });
  loadSimilar(id, similar, token, onPath);
  loadSlips(id, slips, token);
  const goal = h("textarea", { id: "goal", maxlength: "1000", placeholder: "Optional: what you want out of it, like \"I'm on call for our GPU cluster\". It sets how well you need to know each module." });
  const error = h("p", { class: "error-text", role: "alert", hidden: true });
  const submit = h("button", { class: "button", type: "submit" }, "Start this course");
  const form = h("form", {
    class: "composer",
    onsubmit: async (event) => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = "Starting...";
      error.hidden = true;
      try {
        const { id: courseId } = await api(`/api/catalog/${id}/start`, { method: "POST", body: JSON.stringify({ goal: goal.value }) });
        location.hash = `#/course/${courseId}`;
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = "Start this course";
      }
    },
  }, h("label", { for: "goal", class: "visually-hidden" }, "What you want out of this course"), goal, error, h("div", { class: "composer-row" }, submit));
  mount(app,
    h("header", { class: "course-head" },
      h("div", {}, h("p", { class: "eyebrow" }, [course.track_title, course.topic, course.level].filter(Boolean).join(" · ")), h("h1", {}, course.title), h("p", {}, course.summary)),
      h("a", { class: "link-button", href: `#/library?track=${course.track}` }, "Back to the library")),
    h("div", { class: "course-layout" },
      h("section", { class: "panel stage" }, h("h2", {}, "Make it yours"), form),
      h("aside", { class: "side" }, h("section", { class: "card" }, h("h2", {}, "Modules"),
        course.modules.map((m) => h("div", { class: "module locked" },
          h("span", { class: "dot", "aria-hidden": "true" }),
          h("div", {}, h("strong", {}, m.title), h("span", {}, m.concepts.join(" · "))))),
      ), slips)),
    path,
    similar,
  );
}

function pathSection(title, lead, courses) {
  return h("section", { class: "section" },
    h("div", { class: "section-head" }, h("h2", {}, title), h("p", { class: "muted" }, lead)),
    h("div", { class: "grid" }, courses.map((c) => libraryCard(c))));
}

/** Library courses closest in meaning to this one, from /api/catalog/:id/similar. */
async function loadSimilar(id, section, token, skip = new Set()) {
  try {
    const { pending, courses: all } = await api(`/api/catalog/${id}/similar`);
    const courses = all.filter((c) => !skip.has(c.id));
    if (token !== renderToken || (!pending && !courses.length)) return;
    section.hidden = false;
    mount(section,
      h("div", { class: "section-head" },
        h("h2", {}, "Similar courses"),
        h("p", { class: "muted" }, pending
          ? "Still reading this course. Courses that cover similar ground will show here in a few minutes."
          : "Courses that cover similar ground, closest first, from any track.")),
      courses.length ? h("div", { class: "grid" }, courses.map((c) => libraryCard(c))) : null);
  } catch {
    // Similar courses are optional.
  }
}

/** The subtopics and questions learners miss most in this course, from /api/catalog/:id/misses. */
async function loadSlips(id, card, token) {
  try {
    const { concepts, questions } = await api(`/api/catalog/${id}/misses`);
    if (token !== renderToken || !concepts.length) return;
    card.hidden = false;
    mount(card,
      h("h2", {}, "Where learners slip"),
      h("p", { class: "muted slip-lead" }, "Missed most often. Follow-ups pick questions close to the ones you get wrong."),
      concepts.map((c) => {
        const percent = Math.round(c.miss_rate * 100);
        const fill = h("div", { class: "meter-fill t-orange" });
        fill.style.width = `${Math.max(percent, 3)}%`;
        return h("div", { class: "meter" },
          h("div", { class: "meter-label" }, h("span", {}, c.concept), h("span", { class: "muted" }, `${percent}% missed`)),
          h("div", { class: "meter-track" }, fill));
      }),
      questions.length ? h("p", { class: "muted slip-lead" }, `Hardest question: “${questions[0].prompt}”`) : null);
  } catch {
    // Optional, like similar courses.
  }
}

/* Course */
async function renderCourse(id) {
  const token = ++renderToken;
  app.replaceChildren(h("div", { class: "panel stage" }, workingView("Opening your course")));
  try {
    await syncCourse(id, token);
  } catch (e) {
    if (token === renderToken) showFatal(id, e.message);
  }
}

function showFatal(id, message) {
  app.replaceChildren(h("div", { class: "panel stage" },
    h("p", { class: "error-text", role: "alert" }, message),
    h("div", { class: "actions" },
      h("button", { class: "button", onclick: () => renderCourse(id) }, "Try again"),
      h("a", { class: "button button-quiet", href: "#/courses" }, "Back to courses"))));
}

/** Show the course, running the agent whenever it has work to do. */
async function syncCourse(id, token) {
  let view = await api(`/api/courses/${id}`);
  while (token === renderToken && view.needs_agent) {
    drawCourse(view, workingView(workingLabel(view), workingDetail(view)));
    if (view.error && !view.agent_busy && !syncCourse.retried) {
      // Show the failure and wait for the learner, rather than spending tokens in a loop.
      drawCourse(view, h("div", {},
        h("p", { class: "error-text", role: "alert" }, view.error),
        h("div", { class: "actions" }, h("button", { class: "button", onclick: () => { syncCourse.retried = true; syncCourse(id, token).catch((e) => showFatal(id, e.message)); } }, "Try again"))));
      return;
    }
    syncCourse.retried = false;
    const result = await api(`/api/courses/${id}/advance`, { method: "POST" });
    if (result.status === "busy") await pause(2500);
    view = await api(`/api/courses/${id}`);
  }
  if (token !== renderToken) return;
  if (view.status === "complete") {
    drawCourse(view, null);
    live.textContent = "Course finished.";
    return;
  }
  drawCourse(view, questionView(view, token));
  live.textContent = "New question ready.";
  focusFirst(app.querySelector(".question"));
}

function workingLabel(view) {
  if (!view.modules.length) return "Planning your course";
  const answered = view.round_questions.length > 0;
  return answered ? "Reading your answers" : "Writing your questions";
}
function workingDetail(view) {
  if (!view.modules.length) return "This usually takes under a minute. You can leave and come back.";
  return view.round_questions.length ? "Deciding whether to follow up or move on, then writing what's next." : "Using what I know about you so far.";
}

function workingView(title, detail) {
  return h("div", { class: "working", role: "status" },
    h("div", { class: "working-stack", "aria-hidden": "true" }, art(stackSvg())),
    h("h2", {}, title),
    detail ? h("p", { class: "muted" }, detail) : null);
}

function drawCourse(view, stage) {
  const passed = view.modules.filter((m) => m.status === "passed").length;
  const progress = progressOf({ status: view.modules.length ? view.status : "building", modules: view.modules.length, passed });
  const head = h("header", { class: "course-head" },
    h("div", { class: "course-title" },
      h("div", { class: "course-building", "aria-hidden": "true" }, art(buildingSvg(view, progress))),
      h("div", {},
      h("h1", {}, view.title || view.prompt),
      view.summary ? h("p", {}, view.summary) : null)),
    h("div", { class: "head-actions" },
      view.modules.length ? h("button", { class: "button button-quiet", onclick: () => loadConfig().then(() => pickBuilding(view)).catch(() => {}) }, "Change building") : null,
      h("button", { class: "link-button", onclick: () => removeCourse(view) }, "Delete course")));
  const main = view.status === "complete"
    ? finishedView(view)
    : h("section", { class: "panel stage", "aria-label": "Current question" }, stage);
  app.replaceChildren(head, h("div", { class: "course-layout" }, main, sideView(view)));
}

async function removeCourse(view) {
  if (!confirm(`Delete "${view.title || view.prompt}" and all its answers?`)) return;
  await api(`/api/courses/${view.id}`, { method: "DELETE" });
  location.hash = "#/courses";
}

function finishedView(view) {
  const strongest = [...view.mastery].sort((a, b) => b.mastery - a.mastery)[0];
  const weakest = [...view.mastery].sort((a, b) => a.mastery - b.mastery)[0];
  return h("section", { class: "done" },
    h("div", {},
      h("h2", {}, "You did it"),
      strongest ? h("p", {}, `You're strongest on ${strongest.concept}.${weakest && weakest.mastery < 0.7 ? ` Come back to ${weakest.concept} when you can.` : ""}`) : null,
      h("div", { class: "actions" }, h("a", { class: "button button-ink", href: "#/courses" }, "Build another course"))),
    plot(finishedSvg(view), "Your building with every floor lit"));
}

function sideView(view) {
  const colorFor = (m) => (m >= 0.7 ? "green" : m >= 0.4 ? "yellow" : "orange");
  return h("aside", { class: "side" },
    view.modules.length ? h("section", { class: "card" }, h("h2", {}, "Modules"),
      view.modules.map((m) => h("div", { class: `module ${m.status}` },
        h("span", { class: "dot", "aria-hidden": "true" }),
        h("div", {}, h("strong", {}, m.title), h("span", {}, (m.status === "passed" ? "Done" : m.status === "active" ? `${m.answered} answered` : "Up next") + (m.mastery_target ? ` · bar ${Math.round(m.mastery_target * 100)}%` : "")))))) : null,
    view.mastery.length ? h("section", { class: "card" }, h("h2", {}, "What you know"),
      view.mastery.map((m) => {
        const percent = Math.round(m.mastery * 100);
        const fill = h("div", { class: `meter-fill t-${colorFor(m.mastery)}` });
        fill.style.width = `${Math.max(percent, 3)}%`;
        return h("div", { class: "meter" },
          h("div", { class: "meter-label" }, h("span", {}, m.concept), h("span", { class: "muted" }, `${percent}%`)),
          h("div", { class: "meter-track" }, fill));
      })) : null,
    view.events.length ? h("section", { class: "card" }, h("h2", {}, "What the agent did"),
      h("ol", { class: "log" }, view.events.slice(0, 6).map((e) => h("li", {}, e.message)))) : null);
}

/** The options of a multiple-choice question, or the box for a short answer. */
function answerFields(q) {
  return q.options
    ? h("fieldset", { class: "options" },
        h("legend", { class: "visually-hidden" }, "Choose one answer"),
        q.options.map((option, i) => h("label", { class: "option", "data-index": i },
          h("input", { type: "radio", name: "answer", value: String(i), required: true }),
          h("span", { class: "mark", "aria-hidden": "true" }, "ABCD"[i]),
          h("span", {}, rich(option)))))
    : h("div", {},
        h("label", { for: "short", class: "visually-hidden" }, "Your answer"),
        h("textarea", { id: "short", name: "answer", maxlength: "4000", required: true, placeholder: "Answer in your own words, in a sentence or three." }));
}

function questionView(view, token) {
  const q = view.current_question;
  const index = view.round_questions.findIndex((x) => x.id === q.id) + 1;
  const module = view.modules.find((m) => m.status === "active");
  const roundLabel = view.round > 1 ? "Follow-up" : "Question";
  const eyebrow = h("p", { class: "eyebrow" }, `${module.title} · ${roundLabel} ${index} of ${view.round_questions.length}`);
  const prompt = h("h2", { class: "question" }, rich(q.prompt));
  const error = h("p", { class: "error-text", role: "alert", hidden: true });
  const submit = h("button", { class: "button", type: "submit" }, "Check my answer");
  const form = h("form", {
    onsubmit: async (event) => {
      event.preventDefault();
      const value = new FormData(form).get("answer");
      if (!value || !String(value).trim()) return;
      error.hidden = true;
      submit.disabled = true;
      submit.textContent = "Checking...";
      try {
        const result = await api(`/api/questions/${q.id}/answer`, { method: "POST", body: JSON.stringify({ response: String(value) }) });
        if (token !== renderToken) return;
        showResult(view, q, form, result, token);
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = "Check my answer";
      }
    },
  }, answerFields(q), error, h("div", { class: "actions" }, submit));
  return h("div", {}, eyebrow, q.why ? h("p", { class: "why" }, rich(q.why)) : null, prompt, figureView(q), form);
}

const VERDICTS = {
  correct: ["You got it", "green"],
  partial: ["Part of the way there", "yellow"],
  incorrect: ["Not quite", "orange"],
};

function showResult(view, q, form, result, token) {
  const [title] = VERDICTS[result.verdict];
  const next = h("button", { class: "button button-ink", onclick: () => { next.disabled = true; syncCourse(view.id, token).catch((e) => showFatal(view.id, e.message)); } }, "Keep going");
  const parts = [];
  if (q.options) {
    for (const label of form.querySelectorAll(".option")) {
      const i = Number(label.dataset.index);
      label.classList.add("locked");
      if (i === result.correct_index) label.classList.add("is-correct");
      else if (label.querySelector("input").checked) label.classList.add("is-wrong");
      label.querySelector("input").disabled = true;
    }
    parts.push(form.querySelector(".options"));
  } else {
    parts.push(h("p", { class: "your-answer" }, result.response));
  }
  const sure = result.confidence == null ? null : h("p", { class: "small" }, `Graded by ${view.models.grader}, ${Math.round(result.confidence * 100)}% sure.`);
  const block = h("div", { class: `verdict verdict-${result.verdict}`, role: "status" },
    h("h3", {}, title),
    h("p", {}, rich(result.feedback)),
    result.verdict !== "correct" && !q.options ? h("p", { class: "reference" }, rich(result.reference)) : null,
    sourceLink(result.source_url),
    sure,
    next);
  form.replaceChildren(...parts, block);
  focusFirst(next);
  next.focus();
}


/** Where the answer comes from, when the question has a source. Only https links are shown. */
function sourceLink(url) {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return null;
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
  return h("p", { class: "small source" }, "Source: ", h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, host));
}

/* Building picker: the learner restyles a course's building. Choices come from the fixed lists in city.js. */

function pickBuilding(view) {
  // The choices and their names come from /api/app, so the iOS app offers the same ones.
  const { archetypes, materials, roofs, accents } = appConfig.buildings;
  const start = specFor(view);
  let spec = { archetype: start.archetype, material: start.material, roof: start.roof, accent: start.accent };
  const progress = progressOf({ status: view.status, modules: view.modules.length, passed: view.modules.filter((m) => m.status === "passed").length });
  const course = (icon) => ({ id: view.id, title: view.title, icon });
  const preview = h("div", { class: "picker-preview", "aria-hidden": "true" });
  const groups = h("div", { class: "picker-groups" });
  const error = h("p", { class: "error-text", role: "alert", hidden: true });
  const save = h("button", { class: "button", type: "submit" }, "Save building");
  const choice = (key, { id, label }, content, extra = "") => h("button", {
    type: "button", class: `pick ${extra}${spec[key] === id ? " pick-on" : ""}`, "aria-pressed": String(spec[key] === id),
    "aria-label": label, title: label, onclick: () => { spec = { ...spec, [key]: id }; draw(); },
  }, content);
  const group = (title, key, items) => h("fieldset", { class: "picker-group" }, h("legend", {}, title), h("div", { class: `picks picks-${key}` }, items));
  const draw = () => {
    preview.replaceChildren(art(buildingSvg(course(spec), progress)));
    groups.replaceChildren(
      group("Building", "archetype", archetypes.map((a) => choice("archetype", a, [art(buildingSvg(course({ ...spec, archetype: a.id, roof: "none" }), { floors: 4, lit: 2 })), h("span", {}, a.label)], "pick-art"))),
      group("Material", "material", materials.map((m) => choice("material", m, [art(buildingSvg(course({ archetype: "tower", material: m.id, roof: "none", accent: spec.accent }), { floors: 3, lit: 0 })), h("span", {}, m.label)], "pick-art pick-small"))),
      group("Roof", "roof", roofs.map((r) => choice("roof", r, r.label, "pick-chip"))),
      group("Trim colour", "accent", accents.map((c) => choice("accent", c, h("span", { class: `swatch t-${c.id}` }), "pick-swatch"))),
    );
  };
  const shuffle = () => {
    const any = (list) => list[Math.floor(Math.random() * list.length)].id;
    spec = { archetype: any(archetypes), material: any(materials), roof: any(roofs), accent: any(accents) };
    draw();
  };
  const dialog = h("dialog", { class: "picker", "aria-labelledby": "picker-title" });
  const close = () => { dialog.close(); dialog.remove(); };
  const form = h("form", {
    onsubmit: async (event) => {
      event.preventDefault();
      save.disabled = true;
      error.hidden = true;
      try {
        const { icon } = await api(`/api/courses/${view.id}/icon`, { method: "PUT", body: JSON.stringify({ icon: spec }) });
        view.icon = icon;
        close();
        const building = app.querySelector(".course-building");
        if (building) building.replaceChildren(art(buildingSvg(view, progress)));
        live.textContent = "Building saved.";
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        save.disabled = false;
      }
    },
  },
    h("div", { class: "picker-head" },
      h("div", {}, h("h2", { id: "picker-title" }, "Change building"), h("p", { class: "muted" }, view.title || view.prompt)),
      h("button", { class: "link-button", type: "button", onclick: close }, "Close")),
    h("div", { class: "picker-body" },
      h("div", { class: "picker-side" }, preview, h("button", { class: "button button-ink", type: "button", onclick: shuffle }, "Surprise me")),
      groups),
    error,
    h("div", { class: "actions picker-actions" }, save, h("button", { class: "button button-ink", type: "button", onclick: close }, "Cancel")));
  dialog.append(form);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  draw();
  document.body.append(dialog);
  dialog.showModal();
}

/* Today: daily recall, the streak, and what to do next. Everything shown comes from /api/today. */

// Keys while a recall question or verdict is on screen: 1 to 4 pick an option, Enter checks or goes on, S skips.
let hotkeys = null;
document.addEventListener("keydown", (event) => {
  if (!hotkeys || event.metaKey || event.ctrlKey || event.altKey || document.querySelector("dialog[open]")) return;
  const tag = event.target.tagName;
  const typing = tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && event.target.type !== "radio");
  if (typing) return;
  if (/^[1-4]$/.test(event.key) && hotkeys.pick) {
    hotkeys.pick(Number(event.key) - 1);
    event.preventDefault();
  } else if (event.key.toLowerCase() === "s" && hotkeys.skip) {
    hotkeys.skip();
  } else if (event.key === "Enter" && tag !== "BUTTON" && tag !== "A" && tag !== "SUMMARY" && hotkeys.enter) {
    hotkeys.enter();
    event.preventDefault();
  }
});

const DAY_STATES = { done: "done", rest: "a rest day", missed: "missed", today: "today", future: "", none: "" };

/** The streak in the header: a lit window and the number of days. */
function showStreak(streak) {
  const chip = document.getElementById("streak");
  chip.hidden = !streak.current;
  chip.replaceChildren(h("i", { class: "window is-done", "aria-hidden": "true" }), String(streak.current));
  chip.setAttribute("aria-label", `${plural(streak.current, "day")} in a row. Open your stats.`);
}

/** This week as seven windows, Monday first: lit for a day done, blue for a rest day. */
function weekStrip(streak) {
  const done = streak.week.filter((d) => d.state === "done").length;
  return h("div", { class: "week", role: "img", "aria-label": `This week: ${plural(done, "day")} done` },
    streak.week.map((d, i) => h("span", { class: `week-day is-${d.state}${d.day === streak.day ? " is-now" : ""}` }, h("i", {}), "MTWTFSS"[i])));
}

/** The streak as a card. With `calendar`, the last 4 weeks; otherwise this week. */
function streakCard(streak, { calendar = false } = {}) {
  return h("section", { class: "card streak-card" },
    h("div", { class: "streak-head" },
      h("div", {}, h("strong", { class: "streak-number" }, String(streak.current)), h("span", {}, streak.current === 1 ? "day in a row" : "days in a row")),
      h("div", { class: "streak-notes muted" }, h("span", {}, `Longest ${streak.longest}`), streak.rest_label ? h("span", {}, streak.rest_label) : null)),
    calendar
      ? [h("p", { class: "muted small" }, "The last 4 weeks"),
        h("div", { class: "calendar", role: "img", "aria-label": `${plural(streak.calendar.filter((d) => d.state === "done").length, "day")} done in the last 4 weeks` },
          streak.calendar.map((d) => h("i", { class: `window is-${d.state}`, title: [shortDate(d.day), DAY_STATES[d.state]].filter(Boolean).join(": ") })))]
      : weekStrip(streak),
    streak.today.counted ? null : h("p", { class: "muted small" }, streak.label));
}

const thumb = (course, progress, large) => h("div", { class: `thumb${large ? " thumb-lg" : ""}`, "aria-hidden": "true" }, art(buildingSvg(course, progress ?? progressOf(course))));

function continueCard(data, token) {
  const next = data.continue;
  if (!next) return null;
  const { recall, streak } = data;
  const more = recall.status === "done" && recall.more_available
    ? h("button", { class: "button button-ink", type: "button", onclick: (event) => moreRecall(data, token, event.currentTarget) }, "5 more recall") : null;
  let meter = null;
  if (recall.status === "empty") {
    const fill = h("div", { class: "meter-fill t-yellow" });
    fill.style.width = `${Math.min(100, (streak.today.answered / streak.today.needed) * 100)}%`;
    meter = h("div", { class: "meter" }, h("div", { class: "meter-track" }, fill), h("p", { class: "muted small" }, `${Math.min(streak.today.answered, streak.today.needed)} of ${streak.today.needed} today`));
  }
  return h("section", { class: "card next-card" },
    h("div", { class: "next-row" }, thumb(next.course, null, true),
      h("div", {}, h("p", { class: "eyebrow" }, "Continue"), h("h2", {}, next.course.title || next.course.prompt), h("p", { class: "muted" }, next.detail))),
    meter,
    h("div", { class: "actions" }, h("a", { class: "button", href: `#/course/${next.course.id}` }, "Continue"), more));
}

function upNextCard(next) {
  if (!next) return null;
  return h("a", { class: "card next-card next-link", href: `#/library/${next.course.id}` },
    h("div", { class: "next-row" }, thumb(next.course, { floors: next.course.modules, lit: 0, ambient: 0.18 }, true),
      h("div", {}, h("p", { class: "eyebrow" }, "Up next"), h("h2", {}, next.course.title), h("p", { class: "muted" }, next.detail))));
}

async function renderToday() {
  const token = ++renderToken;
  app.replaceChildren(h("div", { class: "panel stage" }, workingView("Getting today ready")));
  try {
    const data = await api("/api/today");
    if (token === renderToken) drawToday(data, token);
  } catch (e) {
    if (token === renderToken) app.replaceChildren(h("p", { class: "error-text", role: "alert" }, e.message), h("div", { class: "actions" }, h("button", { class: "button", onclick: renderToday }, "Try again")));
  }
}

/**
 * `view.session` is true once the learner has started answering: the stage then shows progress and carries on
 * from question to question. `view.verdict` is the answer just graded.
 */
function drawToday(data, token, view = {}) {
  hotkeys = null;
  showStreak(data.streak);
  const { recall, streak } = data;
  const asking = Boolean(view.verdict) || (recall.question && (view.session || recall.status === "ready"));
  const finished = view.session && !view.verdict && !recall.question;
  const restore = recall.status === "skipped" && !view.session
    ? h("button", { class: "link-button", type: "button", onclick: (event) => skipDay(data, token, false, event.currentTarget) }, "Do it anyway") : null;
  const lead = view.session ? null : recall.status === "empty" ? streak.label : [recall.lead, recall.status !== "ready" && streak.rest_label ? `${streak.rest_label}.` : null].filter(Boolean).join(" ");
  const head = h("header", { class: "course-head" },
    h("div", {}, h("h1", {}, asking || finished ? "Daily recall" : "Today"), lead ? h("p", {}, lead) : null), restore);

  let main, side;
  if (view.verdict) main = recallVerdict(data, token, view.verdict);
  else if (finished) main = recallDone(data, token);
  else if (asking) main = recallQuestion(data, token, Boolean(view.session));
  if (main) {
    side = [streakCard(streak), finished ? null : continueCard(data, token), upNextCard(data.up_next)];
  } else {
    side = [streakCard(streak)];
    main = h("div", { class: "today-main" },
      continueCard(data, token),
      upNextCard(data.up_next),
      recall.status === "empty" && data.continue ? h("section", { class: "card" }, h("h2", { class: "card-title" }, "Recall starts soon"), h("p", { class: "muted" }, recall.lead)) : null,
      data.continue ? null : h("section", { class: "card" },
        h("h2", { class: "card-title" }, "Start your first course"),
        h("p", { class: "muted" }, "Say what you want to learn, or pick a ready-made course. Questions you get right come back here a few days later."),
        h("div", { class: "actions" }, h("a", { class: "button", href: "#/courses" }, "Plan a course"), h("a", { class: "button button-ink", href: "#/library" }, "Browse the library"))),
      data.picks.length ? h("div", { class: "grid" }, data.picks.map((c) => libraryCard(c))) : null);
  }
  mount(app, head, h("div", { class: "course-layout" }, main, h("aside", { class: "side" }, side)));
}

/** One pip per question of the set: its verdict, skipped, the one on screen, or still to come. */
function marksView(recall, current) {
  const now = current ? recall.marks.indexOf("open") : -1;
  return h("div", { class: "marks", role: "img", "aria-label": `${recall.answered} of ${recall.total} answered` },
    recall.marks.map((mark, i) => h("i", { class: `is-${i === now ? "current" : mark}` })));
}

const recallSource = (q) => h("div", { class: "recall-source" },
  q.course ? thumb(q.course) : null,
  h("div", {}, h("strong", {}, q.course?.title || q.course?.prompt || "Your course"), h("span", { class: "muted" }, q.detail)));

function recallQuestion(data, token, session) {
  const { recall } = data;
  const q = recall.question;
  const error = h("p", { class: "error-text", role: "alert", hidden: true });
  const submit = h("button", { class: "button", type: "submit" }, "Check");
  const skip = session
    ? h("button", { class: "link-button", type: "button", onclick: () => skipQuestion(data, token, q, controls) }, "Skip question")
    : h("button", { class: "link-button", type: "button", onclick: (event) => skipDay(data, token, true, event.currentTarget) }, "Skip for today");
  const controls = { error, buttons: [submit, skip] };
  const form = h("form", {
    onsubmit: async (event) => {
      event.preventDefault();
      const value = new FormData(form).get("answer");
      if (!value || !String(value).trim()) return;
      error.hidden = true;
      // Skip is off while the answer is being graded, so one question can't be both answered and skipped.
      submit.disabled = skip.disabled = true;
      submit.textContent = "Checking...";
      try {
        const answer = await api(`/api/recall/${q.id}/answer`, { method: "POST", body: JSON.stringify({ response: String(value) }) });
        if (token !== renderToken) return;
        Object.assign(data, { streak: answer.streak, recall: answer.recall });
        drawToday(data, token, { session: true, verdict: { q, response: String(value), result: answer.result, schedule: answer.schedule } });
        live.textContent = VERDICTS[answer.result.verdict][0];
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        submit.disabled = skip.disabled = false;
        submit.textContent = "Check";
      }
    },
  }, answerFields(q), error,
    h("div", { class: "actions" }, submit, skip),
    q.options ? h("p", { class: "muted small keys-hint" }, session ? "Press 1 to 4, then Enter. S skips." : "Press 1 to 4, then Enter.") : null);
  hotkeys = {
    pick: q.options ? (i) => { const input = form.querySelectorAll("input[name=answer]")[i]; if (input) { input.checked = true; input.focus(); } } : null,
    enter: () => form.requestSubmit(submit),
    skip: session ? () => skipQuestion(data, token, q, controls) : null,
  };
  return h("section", { class: "panel stage", "aria-label": "Recall question" },
    h("div", { class: "recall-top" }, session ? marksView(recall, true) : null, h("span", { class: "muted" }, `${q.number} of ${recall.total}`)),
    recallSource(q),
    q.why ? h("p", { class: "why" }, rich(q.why)) : null,
    h("h2", { class: "question" }, rich(q.prompt)),
    figureView(q),
    form);
}

function recallVerdict(data, token, { q, response, result, schedule }) {
  const { recall } = data;
  const last = !recall.question;
  const go = async () => {
    next.disabled = true;
    // The set is finished, so read Today again: the course to continue may have moved on.
    if (last) Object.assign(data, await api("/api/today").catch(() => data));
    if (token === renderToken) drawToday(data, token, { session: true });
  };
  const next = h("button", { class: "button button-ink", type: "button", onclick: go }, last ? "Finish" : "Next");
  const shown = q.options
    ? h("div", { class: "options" }, q.options.map((option, i) =>
        h("div", { class: `option locked${i === result.correct_index ? " is-correct" : String(i) === response ? " is-wrong" : ""}` },
          h("span", { class: "mark", "aria-hidden": "true" }, "ABCD"[i]), h("span", {}, rich(option)))))
    : h("p", { class: "your-answer" }, result.response);
  hotkeys = { enter: go };
  queueMicrotask(() => next.focus());
  return h("section", { class: "panel stage", "aria-label": "Your answer" },
    h("div", { class: "recall-top" }, marksView(recall, false), h("span", { class: "muted" }, `${q.number} of ${recall.total}`)),
    recallSource(q),
    h("h2", { class: "question" }, rich(q.prompt)),
    figureView(q),
    shown,
    h("div", { class: `verdict verdict-${result.verdict}`, role: "status" },
      h("h3", {}, VERDICTS[result.verdict][0]),
      h("p", {}, rich(result.feedback)),
      result.verdict !== "correct" && !q.options && result.reference ? h("p", { class: "reference" }, rich(result.reference)) : null,
      schedule ? h("p", { class: "comes-back" }, schedule.label) : null,
      sourceLink(result.source_url),
      next));
}

function recallDone(data, token) {
  const { recall, streak } = data;
  const next = data.continue;
  return h("section", { class: "panel stage", "aria-label": "Recall done" },
    h("div", { class: "recall-top" }, marksView(recall, false)),
    h("h2", { class: "question" }, streak.today.counted ? `Day ${streak.current}` : "Recall done"),
    h("p", {}, recall.lead),
    h("p", { class: "muted" }, streak.label),
    recall.coming_back.length ? h("div", { class: "coming-back" }, h("p", { class: "muted" }, "Coming back"),
      recall.coming_back.map((c) => h("div", {}, h("span", {}, c.concept), h("span", { class: "muted" }, c.when)))) : null,
    next ? h("div", { class: "recall-source" }, thumb(next.course), h("div", {}, h("strong", {}, next.course.title || next.course.prompt), h("span", { class: "muted" }, next.detail))) : null,
    h("div", { class: "actions" },
      next ? h("a", { class: "button", href: `#/course/${next.course.id}` }, "Continue your course") : null,
      recall.more_available ? h("button", { class: "button button-ink", type: "button", onclick: (event) => moreRecall(data, token, event.currentTarget) }, "5 more questions") : null,
      h("button", { class: "link-button", type: "button", onclick: () => drawToday(data, token) }, "Done")));
}

/** A recall action that returns the streak and the state of the set. */
async function recallAction(data, token, path, body, button, view) {
  if (button) button.disabled = true;
  try {
    const state = await api(path, { method: "POST", body: JSON.stringify(body ?? {}) });
    if (token !== renderToken) return;
    Object.assign(data, state);
    drawToday(data, token, view);
  } catch (e) {
    if (button) button.disabled = false;
    live.textContent = e.message;
  }
}
const skipDay = (data, token, skipped, button) => recallAction(data, token, "/api/recall/skip-day", { skipped }, button, {});
const moreRecall = (data, token, button) => recallAction(data, token, "/api/recall/more", {}, button, { session: true });
function skipQuestion(data, token, q, controls) {
  // Nothing happens while an answer or another skip is on its way.
  if (controls.buttons.some((b) => b.disabled)) return;
  for (const b of controls.buttons) b.disabled = true;
  return recallAction(data, token, `/api/recall/${q.id}/skip`, {}, null, { session: true }).finally(() => { for (const b of controls.buttons) b.disabled = false; });
}

/* Settings */
async function renderSettings() {
  const token = ++renderToken;
  app.replaceChildren(h("div", { class: "panel stage" }, workingView("Opening your settings")));
  let settings;
  try {
    settings = await api("/api/settings");
  } catch (e) {
    if (token === renderToken) app.replaceChildren(h("p", { class: "error-text", role: "alert" }, e.message));
    return;
  }
  if (token !== renderToken) return;
  const error = h("p", { class: "error-text", role: "alert", hidden: true });
  const save = async (change) => {
    error.hidden = true;
    try {
      settings = await api("/api/settings", { method: "PUT", body: JSON.stringify(change) });
      if (token !== renderToken) return;
      draw();
      live.textContent = "Saved.";
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    }
  };
  const chip = (label, on, change) => h("button", { class: `chip${on ? " chip-on" : ""}`, type: "button", "aria-pressed": String(on), onclick: () => save(change) }, label);
  const group = (title, note, ...content) => h("div", { class: "setting" }, h("h2", {}, title), h("p", { class: "muted" }, note), content);
  const draw = () => mount(app,
    h("header", { class: "course-head" }, h("div", {}, h("h1", {}, "Settings"), h("p", {}, "How daily recall works for you."))),
    h("section", { class: "panel settings" },
      group("Daily goal", "How many questions are in a day's recall. A change starts with the next set.",
        h("div", { class: "chips", role: "group", "aria-label": "Daily goal" }, settings.goals.map((g) => chip(`${g} questions`, g === settings.daily_goal, { daily_goal: g })))),
      group("Short answers in recall", "A couple of questions a day that you answer in your own words. They take a few seconds to grade.",
        h("div", { class: "chips", role: "group", "aria-label": "Short answers in recall" }, chip("On", settings.short_answers, { short_answers: true }), chip("Off", !settings.short_answers, { short_answers: false }))),
      group("Time zone", "Your days and your streak follow this zone. It comes from your device.", h("p", {}, settings.time_zone)),
      error));
  draw();
}

/* Stats */
const pct = (v) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Answers per day for 30 days, stacked by verdict. Built from numbers only. `max` is the top of the scale, from /api/stats. */
function activitySvg(days, max) {
  const W = 900, H = 172, top = 12, base = 170, gap = 2;
  const step = W / days.length, bw = Math.max(6, step - 8);
  const y = (v) => ((base - top) * v) / max;
  const fills = { correct: "var(--bio-green)", partial: "var(--bio-yellow)", incorrect: "var(--bio-orange)" };
  const grid = [0.5, 1].map((t) => `<line x1="0" x2="${W}" y1="${(base - y(Math.round(max * t))).toFixed(1)}" y2="${(base - y(Math.round(max * t))).toFixed(1)}" class="grid-line"/>`).join("");
  let bars = "";
  days.forEach((d, i) => {
    const x = i * step + (step - bw) / 2;
    let z = base;
    const parts = ["correct", "partial", "incorrect"].filter((k) => d[k] > 0);
    parts.forEach((k, j) => {
      const hgt = Math.max(2, y(d[k]) - (j < parts.length - 1 ? gap : 0));
      const isTop = j === parts.length - 1;
      bars += isTop
        ? `<path d="M${x.toFixed(1)},${z}V${(z - hgt + 4).toFixed(1)}Q${x.toFixed(1)},${(z - hgt).toFixed(1)} ${(x + 4).toFixed(1)},${(z - hgt).toFixed(1)}H${(x + bw - 4).toFixed(1)}Q${(x + bw).toFixed(1)},${(z - hgt).toFixed(1)} ${(x + bw).toFixed(1)},${(z - hgt + 4).toFixed(1)}V${z}Z" fill="${fills[k]}"/>`
        : `<rect x="${x.toFixed(1)}" y="${(z - hgt).toFixed(1)}" width="${bw.toFixed(1)}" height="${hgt.toFixed(1)}" fill="${fills[k]}"/>`;
      z -= hgt + gap;
    });
    if (!parts.length) bars += `<rect x="${x.toFixed(1)}" y="${base - 2}" width="${bw.toFixed(1)}" height="2" class="empty-bar"/>`;
    bars += `<rect x="${(i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" class="hit" data-day="${i}"/>`;
  });
  // Labels are HTML (see activityChart), so they keep their shape when the bars stretch to fit.
  return `<svg viewBox="0 0 ${W} ${H}" class="activity" preserveAspectRatio="none">${grid}<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="base-line"/>${bars}</svg>`;
}
function shortDate(iso) {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function verdictBar(c) {
  const bar = h("div", { class: "verdict-bar", role: "img", "aria-label": `${c.correct} right, ${c.partial} partly right, ${c.incorrect} wrong` });
  for (const [k, cls] of [["correct", "t-green"], ["partial", "t-yellow"], ["incorrect", "t-orange"]]) {
    if (!c[k]) continue;
    const seg = h("span", { class: cls });
    seg.style.flexGrow = String(c[k]);
    bar.append(seg);
  }
  if (!c.answered) bar.append(h("span", { class: "verdict-empty" }));
  return bar;
}

function statCourse(c) {
  const progress = progressOf(c);
  const status = c.status === "complete" ? "Finished" : c.modules ? `${c.passed} of ${c.modules} modules done` : "Being planned";
  const concepts = (title, list) => list.length ? h("div", { class: "concepts" }, h("h4", {}, title),
    h("ul", {}, list.map((m) => h("li", {}, h("span", {}, m.concept), h("span", { class: "muted" }, pct(m.mastery)))))) : null;
  return h("article", { class: "card stat-course" },
    h("a", { class: "stat-course-head", href: `#/course/${c.id}` },
      h("div", { class: "stat-art", "aria-hidden": "true" }, art(buildingSvg(c, progress))),
      h("div", {}, h("h3", {}, c.title || c.prompt), h("p", { class: "muted" }, status))),
    h("div", { class: "stat-numbers" },
      h("div", {}, h("strong", {}, pct(c.average)), h("span", {}, "average score")),
      h("div", {}, h("strong", {}, String(c.answered)), h("span", {}, "answered")),
      h("div", {}, h("strong", {}, c.answered ? pct(c.correct / c.answered) : "–"), h("span", {}, "fully right"))),
    verdictBar(c),
    c.trend_label ? h("p", { class: "small muted" }, c.trend_label) : null,
    c.module_stats.length ? h("div", { class: "module-stats" }, c.module_stats.map((m) => {
      const fill = h("div", { class: `meter-fill ${m.average == null ? "" : m.average >= 0.7 ? "t-green" : m.average >= 0.4 ? "t-yellow" : "t-orange"}` });
      fill.style.width = `${m.average == null ? 0 : Math.max(3, Math.round(m.average * 100))}%`;
      return h("div", { class: `meter module-meter ${m.status}` },
        h("div", { class: "meter-label" }, h("span", {}, m.title), h("span", { class: "muted" }, m.answered ? `${pct(m.average)} · ${m.answered}` : m.status === "locked" ? "Up next" : "Not started")),
        h("div", { class: "meter-track" }, fill));
    })) : null,
    h("div", { class: "concept-cols" }, concepts("Strongest", c.strongest), concepts("Needs work", c.weakest)));
}

async function renderStats() {
  const token = ++renderToken;
  app.replaceChildren(h("div", { class: "panel stage" }, workingView("Counting your answers")));
  let data;
  try {
    data = await api("/api/stats");
  } catch (e) {
    if (token === renderToken) app.replaceChildren(h("p", { class: "error-text", role: "alert" }, e.message));
    return;
  }
  if (token !== renderToken) return;
  showStreak(data.streak);
  const t = data.totals;
  const tile = (value, title, note) => h("div", { class: "card stat-tile" }, h("strong", {}, value), h("span", {}, title), note ? h("span", { class: "muted small" }, note) : null);
  const max = data.chart_max;
  const yLabel = (v) => { const el = h("span", { class: "y-label" }, String(v)); el.style.top = `${(12 + (158 * (max - v)) / max) / 172 * 100}%`; return el; };
  const chart = h("div", { class: "activity-wrap" }, art(activitySvg(data.days, max)), yLabel(max), yLabel(max / 2));
  const tip = h("div", { class: "chart-tip", hidden: true, role: "status" });
  chart.append(tip);
  for (const hit of chart.querySelectorAll(".hit")) {
    const d = data.days[Number(hit.dataset.day)];
    const show = () => {
      tip.replaceChildren(h("strong", {}, shortDate(d.date)), h("span", {}, d.answered ? `${plural(d.answered, "answer")} · ${d.correct} right, ${d.partial} partly, ${d.incorrect} wrong` : "No answers"));
      tip.hidden = false;
      const box = chart.getBoundingClientRect(), r = hit.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(r.left - box.left + r.width / 2, 90), box.width - 90)}px`;
    };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; });
  }
  const answered = data.courses.filter((c) => c.answered);
  app.replaceChildren(
    h("header", { class: "course-head" }, h("div", {}, h("h1", {}, "Your stats"), h("p", {}, "How you're doing on every course. Scores count partly right answers as half."))),
    h("section", { class: "stat-tiles" },
      tile(String(t.answered), "questions answered", t.active_days ? `over ${plural(t.active_days, "day")}` : null),
      tile(pct(t.average), "average score", t.answered ? `${t.correct} right, ${t.partial} partly, ${t.incorrect} wrong` : null),
      tile(`${t.modules_passed}`, "modules passed", `${t.finished} of ${plural(t.courses, "course")} finished`),
      tile(String(t.streak), "day streak", data.streak.today.counted ? `Longest ${data.streak.longest}` : data.streak.label)),
    h("section", { class: "stat-streak" }, streakCard(data.streak, { calendar: true })),
    h("section", { class: "panel stat-activity" },
      h("div", { class: "track-head" }, h("h2", {}, "Last 30 days"),
        h("div", { class: "legend", "aria-hidden": "true" }, [["t-green", "Right"], ["t-yellow", "Partly"], ["t-orange", "Wrong"]].map(([cls, text]) => h("span", {}, h("i", { class: `swatch ${cls}` }), text)))),
      chart,
      h("div", { class: "chart-axis", "aria-hidden": "true" }, h("span", {}, shortDate(data.days[0]?.date)), h("span", {}, "Today")),
      h("table", { class: "visually-hidden" }, h("caption", {}, "Answers per day"),
        h("tr", {}, h("th", {}, "Day"), h("th", {}, "Right"), h("th", {}, "Partly"), h("th", {}, "Wrong")),
        data.days.filter((d) => d.answered).map((d) => h("tr", {}, h("td", {}, d.date), h("td", {}, String(d.correct)), h("td", {}, String(d.partial)), h("td", {}, String(d.incorrect)))))),
    h("section", { class: "section stat-section" },
      h("div", { class: "section-head" }, h("h2", {}, "By course"), h("p", { class: "muted" }, answered.length ? "Most recently studied first. Open a course to keep going." : "Answer a few questions and your scores show up here.")),
      data.courses.length ? h("div", { class: "grid stat-grid" }, data.courses.map(statCourse)) : h("p", { class: "card empty" }, "No courses yet. ", h("a", { href: "#/courses" }, "Start one."))),
  );
}

/* Routing */
function route() {
  const [path, query = ""] = location.hash.split("?");
  const course = path.match(/^#\/course\/([\w-]+)$/);
  const library = path.match(/^#\/library(?:\/([\w-]+))?$/);
  window.scrollTo(0, 0);
  hotkeys = null;
  document.getElementById("account-menu").open = false;
  for (const link of document.querySelectorAll(".nav a")) link.toggleAttribute("aria-current", link.getAttribute("href") === (path || "#/"));
  if (path === "#/stats") renderStats();
  else if (path === "#/courses") renderHome();
  else if (path === "#/settings") renderSettings();
  else if (course) renderCourse(course[1]);
  else if (library?.[1]) renderLibraryCourse(library[1]);
  else if (library) renderLibrary(new URLSearchParams(query));
  else renderToday();
}
document.getElementById("mark").replaceChildren(art(markSvg(40)));
api("/api/me").then(({ username }) => { document.getElementById("who").textContent = username; }).catch(() => {});
// The account menu closes when the learner clicks elsewhere or presses Escape.
const menu = document.getElementById("account-menu");
document.addEventListener("click", (event) => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); } });
window.addEventListener("hashchange", route);
route();
// Today and Stats fill in the streak in the header. Anywhere else, ask for it once.
if (!["", "#/", "#/stats"].includes(location.hash.split("?")[0])) api("/api/today").then((data) => showStreak(data.streak)).catch(() => {});
