// Course Smash client. Everything the models write goes in through textContent, never innerHTML.
const app = document.getElementById("app");
const live = document.getElementById("live");
const ACCENTS = ["orange", "yellow", "green", "blue", "purple", "pink"];
const COLORS = { orange: "#E65F2B", yellow: "#F5D556", green: "#469B5B", blue: "#5889F7", purple: "#904CF6", pink: "#E7A0EA", ink: "#141414", paper: "#FBFBFB" };

// Models sometimes write markdown. Only paired markers go, so code like "2 ** 3" survives.
const plainText = (text) => text.replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "$1").replace(/`([^`\n]+)`/g, "$1");

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

// Illustrations are static, trusted markup with palette colours only.
function art(markup) {
  const wrap = document.createElement("div");
  wrap.innerHTML = markup;
  return wrap.firstElementChild;
}
const c = COLORS;
const PLANET = `<svg viewBox="0 0 440 400" role="img" aria-label="A smiling ringed planet with sparkles"><g class="planet">
  <path d="M60 240 C110 300 330 240 382 150" fill="none" stroke="${c.yellow}" stroke-width="22" stroke-linecap="round"/>
  <circle cx="220" cy="195" r="118" fill="${c.purple}"/><path d="M102 195a118 118 0 0 1 236 0z" fill="${c.pink}"/>
  <rect x="104" y="172" width="232" height="24" fill="${c.blue}"/>
  <circle cx="183" cy="222" r="11" fill="${c.ink}"/><circle cx="257" cy="222" r="11" fill="${c.ink}"/>
  <path d="M192 250a28 28 0 0 0 56 0z" fill="${c.ink}"/>
  <path d="M116 300 C190 320 300 290 370 200" fill="none" stroke="${c.orange}" stroke-width="22" stroke-linecap="round"/></g>
  <path d="M70 70q8 28 36 36-28 8-36 36-8-28-36-36 28-8 36-36z" fill="${c.yellow}"/>
  <path d="M376 266q6 20 26 26-20 6-26 26-6-20-26-26 20-6 26-26z" fill="${c.pink}"/>
  <path d="M362 30q5 16 21 21-16 5-21 21-5-16-21-21 16-5 21-21z" fill="${c.green}"/></svg>`;
const shapes = [
  (a, b) => `<svg viewBox="0 0 104 104" aria-hidden="true"><path d="M52 8 96 30 52 52 8 30z" fill="${a}"/><path d="M8 30 52 52V98L8 76z" fill="${b}"/><path d="M96 30 52 52V98L96 76z" fill="${c.paper}"/><circle cx="52" cy="30" r="9" fill="${c.ink}"/></svg>`,
  (a, b) => `<svg viewBox="0 0 104 104" aria-hidden="true"><path d="M12 96V52a40 40 0 0 1 80 0v44z" fill="${a}"/><circle cx="38" cy="54" r="7" fill="${c.ink}"/><circle cx="66" cy="54" r="7" fill="${c.ink}"/><path d="M38 70a14 14 0 0 0 28 0z" fill="${c.ink}"/><circle cx="84" cy="18" r="12" fill="${b}"/></svg>`,
  (a, b) => `<svg viewBox="0 0 104 104" aria-hidden="true"><g fill="${a}"><circle cx="52" cy="20" r="18"/><circle cx="52" cy="84" r="18"/><circle cx="20" cy="52" r="18"/><circle cx="84" cy="52" r="18"/></g><circle cx="52" cy="52" r="20" fill="${b}"/><circle cx="52" cy="52" r="7" fill="${c.ink}"/></svg>`,
];
function cardArt(index) {
  const a = COLORS[ACCENTS[index % 6]];
  const b = COLORS[ACCENTS[(index + 2) % 6]];
  return art(shapes[index % shapes.length](a, b));
}

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
  app.replaceChildren(
    h("section", { class: "panel hero" },
      h("div", {},
        h("h1", { class: "wordmark wordmark-hero", "aria-label": "Course Smash" }, wordTiles()),
        h("p", { class: "lead" }, "Say what you want to learn. I'll build a course of questions, read how you answer, and change what comes next."),
        form),
      h("div", { class: "hero-art" }, art(PLANET))),
    h("section", { class: "section" },
      h("div", { class: "section-head" }, h("h2", {}, "Your courses"), h("p", { class: "muted" }, "Pick up where you left off. Every answer you give shapes the next set of questions.")),
      coursesGrid),
  );
  try {
    const { courses } = await api("/api/courses");
    if (token !== renderToken) return;
    coursesGrid.replaceChildren(...(courses.length ? courses.map(courseCard) : [h("p", { class: "card empty" }, "Nothing here yet. Your first course starts with one sentence.")]));
    if (!courses.length) coursesGrid.className = "";
  } catch (e) {
    if (token === renderToken) coursesGrid.replaceChildren(h("p", { class: "error-text" }, e.message));
  }
}

function wordTiles() {
  const tile = (letter, i) => h("i", { class: `t-${ACCENTS[i % 6]}` }, letter);
  return h("span", { class: "word", "aria-hidden": "true" },
    [..."COURSE"].map((l, i) => (l === "O" ? h("i", { class: "t-yellow t-o" }) : tile(l, i))),
    h("span", { class: "word-break" }),
    [..."SMASH"].map((l, i) => tile(l, i + 3)));
}

function courseCard(course, index) {
  const pips = Array.from({ length: course.modules }, (_, i) => h("span", { class: `pip${i < course.passed ? " on" : ""}` }));
  let status = "The agent is planning this one";
  if (course.status === "complete") status = "Finished";
  else if (course.modules) status = `${course.passed} of ${course.modules} modules done`;
  const average = course.average == null ? "" : ` · ${Math.round(course.average * 100)}% so far`;
  return h("a", { class: "card course-card", href: `#/course/${course.id}` },
    h("div", { class: "art" }, cardArt(index)),
    pips.length ? h("div", { class: "pips", "aria-hidden": "true" }, pips) : null,
    h("h3", {}, course.title || course.prompt),
    h("p", {}, status + average));
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
    h("div", { class: "working-tiles", "aria-hidden": "true" }, ["orange", "yellow", "green", "pink"].map((a) => h("i", { class: `t-${a}` }))),
    h("h2", {}, title),
    detail ? h("p", { class: "muted" }, detail) : null);
}

function drawCourse(view, stage) {
  const head = h("header", { class: "course-head" },
    h("div", {},
      h("h1", {}, view.title || view.prompt),
      view.summary ? h("p", {}, view.summary) : null),
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
    art(shapes[1](COLORS.yellow, COLORS.orange)));
}

function sideView(view) {
  const colorFor = (m) => (m >= 0.7 ? "green" : m >= 0.4 ? "yellow" : "orange");
  return h("aside", { class: "side" },
    view.modules.length ? h("section", { class: "card" }, h("h2", {}, "Modules"),
      view.modules.map((m) => h("div", { class: `module ${m.status}` },
        h("span", { class: "dot", "aria-hidden": "true" }),
        h("div", {}, h("strong", {}, m.title), h("span", {}, m.status === "passed" ? "Done" : m.status === "active" ? `${m.answered} answered` : "Up next"))))) : null,
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
  const prompt = h("h2", { class: "question" }, q.prompt);
  const error = h("p", { class: "error-text", role: "alert", hidden: true });
  const submit = h("button", { class: "button", type: "submit" }, "Check my answer");
  const body = q.options
    ? h("fieldset", { class: "options" },
        h("legend", { class: "visually-hidden" }, "Choose one answer"),
        q.options.map((option, i) => h("label", { class: "option", "data-index": i },
          h("input", { type: "radio", name: "answer", value: String(i), required: true }),
          h("span", { class: "mark", "aria-hidden": "true" }, "ABCD"[i]),
          h("span", {}, option))))
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
  return h("div", {}, eyebrow, q.why ? h("p", { class: "why" }, q.why) : null, prompt, form);
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
    h("p", {}, result.feedback),
    result.verdict !== "correct" && !q.options ? h("p", { class: "reference" }, result.reference) : null,
    sure,
    next);
  form.replaceChildren(...parts, block);
  focusFirst(next);
  next.focus();
}

/* Routing */
function route() {
  const match = location.hash.match(/^#\/course\/([\w-]+)$/);
  window.scrollTo(0, 0);
  if (match) renderCourse(match[1]);
  else renderHome();
}
window.addEventListener("hashchange", route);
route();
