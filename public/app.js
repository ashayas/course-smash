// Course Smash client. Everything the models write goes in through textContent, never innerHTML.
import { buildingSvg, citySvg, finishedSvg, markSvg, progressOf, stackSvg } from "./city.js";
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

// Illustrations come from city.js: static markup built from numbers and palette colours only.
function art(markup) {
  const wrap = document.createElement("div");
  wrap.innerHTML = markup;
  return wrap.firstElementChild;
}
const plot = (markup, label) => h("div", { class: "plot", ...(label ? { role: "img", "aria-label": label } : {}) }, art(markup));

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
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

/* Home */
const IDEAS = [
  "TCP well enough to debug slow APIs",
  "Enough statistics to read an A/B test",
  "How CRISPR works, for a non-biologist",
];

async function renderHome() {
  const token = ++renderToken;
  const prompt = h("textarea", { id: "prompt", maxlength: "2000", required: true, placeholder: "I want to understand... so that I can..." });
  const error = h("p", { class: "error-text", role: "alert", hidden: true });
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
    h("div", { class: "chips" }, IDEAS.map((idea) => h("button", { class: "chip", type: "button", onclick: () => { prompt.value = `I want to learn ${idea}.`; prompt.focus(); } }, idea))),
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

function libraryCard(course) {
  return h("a", { class: "card course-card", href: `#/library/${course.id}` },
    h("div", { class: "art" }, art(buildingSvg(course, { floors: course.modules, lit: 0, ambient: 0.18 }))),
    h("p", { class: "eyebrow" }, `${course.track_title} · ${course.level}`),
    h("h3", {}, course.title),
    h("p", {}, `${course.modules} modules · ${course.questions} questions`));
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
          h("div", { class: "grid" }, inTrack.slice(0, 3).map(libraryCard)));
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
  let track = params.get("track") || "";
  const search = h("input", { type: "search", class: "search", placeholder: "Search by topic, like KV cache or HPA", "aria-label": "Search the library" });
  const grid = h("div", { class: "grid" });
  const count = h("p", { class: "muted", role: "status" });
  const chips = h("div", { class: "chips" });
  const draw = () => {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = data.courses.filter((c) => (!track || c.track === track) &&
      words.every((w) => `${c.title} ${c.summary} ${c.tags.join(" ")} ${c.level}`.toLowerCase().includes(w)));
    grid.replaceChildren(...shown.map(libraryCard));
    count.textContent = `${shown.length} course${shown.length === 1 ? "" : "s"}`;
    chips.replaceChildren(...[["", "All tracks"], ...Object.entries(data.tracks)].map(([key, title]) =>
      h("button", { class: `chip${key === track ? " chip-on" : ""}`, type: "button", "aria-pressed": String(key === track), onclick: () => { track = key; draw(); } }, title)));
  };
  search.addEventListener("input", draw);
  app.replaceChildren(
    h("header", { class: "course-head" }, h("div", {}, h("h1", {}, "Library"), h("p", {}, "Short courses on AI engineering, infrastructure, security, identity and robotics. Each module has a bank of questions, so follow-ups target exactly what you missed."))),
    h("section", { class: "panel library-tools" }, search, chips, count),
    h("section", { class: "section" }, grid),
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
  app.replaceChildren(
    h("header", { class: "course-head" },
      h("div", {}, h("p", { class: "eyebrow" }, `${course.track_title} · ${course.level}`), h("h1", {}, course.title), h("p", {}, course.summary)),
      h("a", { class: "link-button", href: `#/library?track=${course.track}` }, "Back to the library")),
    h("div", { class: "course-layout" },
      h("section", { class: "panel stage" }, h("h2", {}, "Make it yours"), form),
      h("aside", { class: "side" }, h("section", { class: "card" }, h("h2", {}, "Modules"),
        course.modules.map((m) => h("div", { class: "module locked" },
          h("span", { class: "dot", "aria-hidden": "true" }),
          h("div", {}, h("strong", {}, m.title), h("span", {}, m.concepts.join(" · ")))))))),
  );
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
      h("a", { class: "button button-quiet", href: "#/" }, "Back to courses"))));
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
    h("button", { class: "link-button", onclick: () => removeCourse(view) }, "Delete course"));
  const main = view.status === "complete"
    ? finishedView(view)
    : h("section", { class: "panel stage", "aria-label": "Current question" }, stage);
  app.replaceChildren(head, h("div", { class: "course-layout" }, main, sideView(view)));
}

async function removeCourse(view) {
  if (!confirm(`Delete "${view.title || view.prompt}" and all its answers?`)) return;
  await api(`/api/courses/${view.id}`, { method: "DELETE" });
  location.hash = "#/";
}

function finishedView(view) {
  const strongest = [...view.mastery].sort((a, b) => b.mastery - a.mastery)[0];
  const weakest = [...view.mastery].sort((a, b) => a.mastery - b.mastery)[0];
  return h("section", { class: "done" },
    h("div", {},
      h("h2", {}, "You did it"),
      strongest ? h("p", {}, `You're strongest on ${strongest.concept}.${weakest && weakest.mastery < 0.7 ? ` Come back to ${weakest.concept} when you can.` : ""}`) : null,
      h("div", { class: "actions" }, h("a", { class: "button button-ink", href: "#/" }, "Build another course"))),
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

function questionView(view, token) {
  const q = view.current_question;
  const index = view.round_questions.findIndex((x) => x.id === q.id) + 1;
  const module = view.modules.find((m) => m.status === "active");
  const roundLabel = view.round > 1 ? "Follow-up" : "Question";
  const eyebrow = h("p", { class: "eyebrow" }, `${module.title} · ${roundLabel} ${index} of ${view.round_questions.length}`);
  const prompt = h("h2", { class: "question" }, rich(q.prompt));
  const error = h("p", { class: "error-text", role: "alert", hidden: true });
  const submit = h("button", { class: "button", type: "submit" }, "Check my answer");
  const body = q.options
    ? h("fieldset", { class: "options" },
        h("legend", { class: "visually-hidden" }, "Choose one answer"),
        q.options.map((option, i) => h("label", { class: "option", "data-index": i },
          h("input", { type: "radio", name: "answer", value: String(i), required: true }),
          h("span", { class: "mark", "aria-hidden": "true" }, "ABCD"[i]),
          h("span", {}, rich(option)))))
    : h("div", {},
        h("label", { for: "short", class: "visually-hidden" }, "Your answer"),
        h("textarea", { id: "short", name: "answer", maxlength: "4000", required: true, placeholder: "Answer in your own words, in a sentence or three." }));
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
  }, body, error, h("div", { class: "actions" }, submit));
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
    sure,
    next);
  form.replaceChildren(...parts, block);
  focusFirst(next);
  next.focus();
}

/* Routing */
function route() {
  const [path, query = ""] = location.hash.split("?");
  const course = path.match(/^#\/course\/([\w-]+)$/);
  const library = path.match(/^#\/library(?:\/([\w-]+))?$/);
  window.scrollTo(0, 0);
  if (course) renderCourse(course[1]);
  else if (library?.[1]) renderLibraryCourse(library[1]);
  else if (library) renderLibrary(new URLSearchParams(query));
  else renderHome();
}
document.getElementById("mark").replaceChildren(art(markSvg(40)));
api("/api/me").then(({ username }) => { document.getElementById("who").textContent = username; }).catch(() => {});
window.addEventListener("hashchange", route);
route();
