/* ============================================================
   מוכנים למבין - לוגיקת האתר
   כל הפונקציות הבאות עובדות מול מאגר השאלות שמוגדר ב-questions.js
   ============================================================ */

const STORAGE_KEY = "mevinPrepStats_v1";
const MIXED_KEY = "mixed";
const QUESTIONS_PER_ROUND = 5; // כמה שאלות מוצגות בכל סבב תרגול של קטגוריה בודדת (כדי שלא יהיה עומס/עייפות)
const MIXED_PER_CATEGORY = 5; // כמה שאלות מכל קטגוריה נכנסות לתרגול המעורב

/* ---------------------------------------------------------
   כלים כלליים
   --------------------------------------------------------- */

function getCategoryKeys() {
  return Object.keys(QUESTION_BANK);
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { rounds: [] };
  } catch (e) {
    return { rounds: [] };
  }
}

function saveRoundResult(categoryKey, correctCount, total) {
  const stats = loadStats();
  stats.rounds.push({
    categoryKey,
    correctCount,
    total,
    percent: Math.round((correctCount / total) * 100),
    date: new Date().toISOString()
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    /* localStorage may be unavailable (e.g. private browsing) - fail silently */
  }
}

/* ---------------------------------------------------------
   דף הבית - כרטיסי קטגוריות + סיכום התקדמות
   --------------------------------------------------------- */

function categoryCardHtml(key, opts) {
  const cat = QUESTION_BANK[key];
  const href = opts && opts.href ? opts.href : `practice.html?cat=${key}`;
  const isButton = opts && opts.asButton;
  const tag = isButton ? "button" : "a";
  const hrefAttr = isButton ? `data-cat="${key}"` : `href="${href}"`;
  return `
    <${tag} class="category-card" style="--cat-color:${cat.color}" ${hrefAttr}>
      <span class="icon">${cat.icon}</span>
      <h3>${cat.name}</h3>
      <p>${cat.description}</p>
      <span class="count">${Math.min(QUESTIONS_PER_ROUND, cat.questions.length)} שאלות בכל סבב (מתוך ${cat.questions.length} במאגר)</span>
    </${tag}>
  `;
}

function renderHomeCategories() {
  const grid = document.getElementById("home-category-grid");
  if (!grid) return;
  let html = "";
  getCategoryKeys().forEach((key) => {
    html += categoryCardHtml(key);
  });
  html += `
    <a class="category-card mixed-card" href="practice.html?cat=${MIXED_KEY}">
      <span class="icon">🎯</span>
      <h3>תרגול מעורב</h3>
      <p>שאלות מעורבות מכל התחומים יחד</p>
      <span class="count">${MIXED_PER_CATEGORY * getCategoryKeys().length} שאלות (${MIXED_PER_CATEGORY} מכל תחום)</span>
    </a>
  `;
  grid.innerHTML = html;
}

function renderProgressSummary() {
  const box = document.getElementById("progress-summary");
  if (!box) return;
  const stats = loadStats();
  if (!stats.rounds.length) return;
  const total = stats.rounds.length;
  const avg = Math.round(
    stats.rounds.reduce((sum, r) => sum + r.percent, 0) / total
  );
  const best = Math.max(...stats.rounds.map((r) => r.percent));
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-avg").textContent = avg + "%";
  document.getElementById("stat-best").textContent = best + "%";
  box.style.display = "block";
}

/* ---------------------------------------------------------
   דף התרגול - state המבחן
   --------------------------------------------------------- */

let quizState = null;

function buildQuestionSet(categoryKey) {
  if (categoryKey === MIXED_KEY) {
    let combined = [];
    getCategoryKeys().forEach((key) => {
      const picked = shuffle(QUESTION_BANK[key].questions).slice(0, MIXED_PER_CATEGORY);
      picked.forEach((q) => combined.push(Object.assign({ _catKey: key }, q)));
    });
    return shuffle(combined);
  }
  const shuffled = shuffle(
    QUESTION_BANK[categoryKey].questions.map((q) =>
      Object.assign({ _catKey: categoryKey }, q)
    )
  );
  return shuffled.slice(0, QUESTIONS_PER_ROUND);
}

function startQuiz(categoryKey) {
  quizState = {
    categoryKey,
    questions: buildQuestionSet(categoryKey),
    index: 0,
    correctCount: 0,
    answers: [] // { question, chosenIndex, correct }
  };
  document.getElementById("screen-picker").style.display = "none";
  document.getElementById("screen-results").style.display = "none";
  document.getElementById("screen-quiz").style.display = "block";
  renderQuestion();
}

function renderQuestion() {
  const { questions, index } = quizState;
  const q = questions[index];
  const cat = QUESTION_BANK[q._catKey];

  document.getElementById("question-counter").textContent =
    `שאלה ${index + 1} מתוך ${questions.length}`;
  document.getElementById("progress-fill").style.width =
    Math.round((index / questions.length) * 100) + "%";

  const card = document.getElementById("question-card");

  const tagHtml = `<span class="category-tag" style="background:${cat.color}">${cat.icon} ${cat.name}</span>`;

  if (q.type === "memory") {
    renderMemoryQuestion(card, q, tagHtml);
    return;
  }

  let bodyHtml = tagHtml;
  if (q.type === "reading") {
    bodyHtml += `<div class="passage-box">${q.passage}</div>`;
  }
  bodyHtml += `<div class="question-prompt">${q.prompt}</div>`;
  if (q.diagramSvg) {
    bodyHtml += `<div class="diagram-box">${q.diagramSvg}</div>`;
  }
  bodyHtml += renderOptionsHtml(q);
  card.innerHTML = bodyHtml;
  attachOptionHandlers(q);
}

function renderMemoryQuestion(card, q, tagHtml) {
  card.innerHTML = `
    ${tagHtml}
    <div class="memory-stage">
      <div style="font-weight:700; font-size:17px;">התבוננו היטב וזכרו! 👀</div>
      <div class="memory-stimulus">${q.stimulus.join("&nbsp;&nbsp;")}</div>
      <div class="memory-countdown" id="memory-countdown">מסתיר בעוד ${q.displaySeconds} שניות...</div>
    </div>
  `;
  let remaining = q.displaySeconds;
  const countdownEl = document.getElementById("memory-countdown");
  const interval = setInterval(() => {
    remaining -= 1;
    if (countdownEl) {
      countdownEl.textContent = remaining > 0
        ? `מסתיר בעוד ${remaining} שניות...`
        : "מסתיר...";
    }
    if (remaining <= 0) {
      clearInterval(interval);
      showMemoryQuestionPrompt(card, q, tagHtml);
    }
  }, 1000);
}

function showMemoryQuestionPrompt(card, q, tagHtml) {
  let bodyHtml = tagHtml;
  bodyHtml += `<div class="question-prompt">${q.prompt}</div>`;
  bodyHtml += renderOptionsHtml(q);
  card.innerHTML = bodyHtml;
  attachOptionHandlers(q);
}

function renderOptionsHtml(q) {
  const hasSvgOptions = Array.isArray(q.optionsSvg) && q.optionsSvg.length === q.options.length;
  let html = `<div class="options-grid${hasSvgOptions ? " svg-grid" : ""}" id="options-grid">`;
  q.options.forEach((opt, i) => {
    if (hasSvgOptions) {
      html += `<button class="option-btn svg-option" data-index="${i}" title="${opt}">
        <span class="svg-option-inner">${q.optionsSvg[i]}</span>
      </button>`;
    } else {
      html += `<button class="option-btn" data-index="${i}">${opt}</button>`;
    }
  });
  html += "</div>";
  html += '<div id="feedback-slot"></div>';
  return html;
}

function attachOptionHandlers(q) {
  const buttons = document.querySelectorAll("#options-grid .option-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => handleAnswer(q, parseInt(btn.dataset.index, 10)));
  });
}

function handleAnswer(q, chosenIndex) {
  const buttons = document.querySelectorAll("#options-grid .option-btn");
  const correct = chosenIndex === q.answerIndex;

  buttons.forEach((btn) => {
    btn.disabled = true;
    const idx = parseInt(btn.dataset.index, 10);
    if (idx === q.answerIndex) btn.classList.add("correct");
    else if (idx === chosenIndex) btn.classList.add("incorrect");
  });

  if (correct) quizState.correctCount += 1;
  quizState.answers.push({ question: q, chosenIndex, correct });

  const feedbackSlot = document.getElementById("feedback-slot");
  feedbackSlot.innerHTML = `
    <div class="feedback-box ${correct ? "correct" : "incorrect"}">
      <strong>${correct ? "כל הכבוד, תשובה נכונה! ✅" : "לא מדויק, אבל זה בסדר - כך לומדים 💡"}</strong>
      ${q.explanation}
    </div>
    <button class="next-btn" id="btn-next">
      ${quizState.index + 1 < quizState.questions.length ? "לשאלה הבאה →" : "לתוצאות הסופיות →"}
    </button>
  `;
  document.getElementById("btn-next").addEventListener("click", goToNextQuestion);
}

function goToNextQuestion() {
  quizState.index += 1;
  if (quizState.index >= quizState.questions.length) {
    showResults();
  } else {
    renderQuestion();
  }
}

function showResults() {
  document.getElementById("screen-quiz").style.display = "none";
  document.getElementById("screen-results").style.display = "block";

  const total = quizState.questions.length;
  const correct = quizState.correctCount;
  const percent = Math.round((correct / total) * 100);

  saveRoundResult(quizState.categoryKey, correct, total);

  document.getElementById("results-score").textContent = `${correct} / ${total}`;

  let message;
  if (percent >= 90) message = "מדהים! זו תוצאה מצוינת 🌟";
  else if (percent >= 70) message = "כל הכבוד, עבודה טובה! 👏";
  else if (percent >= 50) message = "התחלה טובה - עוד קצת תרגול וזה יהיה מעולה 💪";
  else message = "זה בסדר לגמרי - התרגול הוא הדרך להשתפר, ננסה עוד פעם? 🙂";
  document.getElementById("results-message").textContent = `${percent}% הצלחה. ${message}`;

  const reviewList = document.getElementById("review-list");
  let html = "<h3>סיכום התשובות</h3>";
  quizState.answers.forEach((a, i) => {
    html += `
      <div class="review-item ${a.correct ? "" : "wrong"}">
        <div class="rq">שאלה ${i + 1}: ${a.question.prompt}</div>
        <div class="ra">${a.correct ? "✅ ענית נכון" : "❌ ענית: " + a.question.options[a.chosenIndex] + " | התשובה הנכונה: " + a.question.options[a.question.answerIndex]}</div>
      </div>
    `;
  });
  reviewList.innerHTML = html;

  document.getElementById("btn-try-again").onclick = () => startQuiz(quizState.categoryKey);
  document.getElementById("btn-choose-other").onclick = () => {
    window.location.href = "practice.html";
  };
}

/* ---------------------------------------------------------
   אתחול דף התרגול
   --------------------------------------------------------- */

function initPracticePage() {
  const grid = document.getElementById("picker-category-grid");
  if (grid) {
    let html = "";
    getCategoryKeys().forEach((key) => {
      html += categoryCardHtml(key, { asButton: true });
    });
    html += `
      <button class="category-card mixed-card" data-cat="${MIXED_KEY}">
        <span class="icon">🎯</span>
        <h3>תרגול מעורב</h3>
        <p>שאלות מעורבות מכל התחומים יחד</p>
        <span class="count">${MIXED_PER_CATEGORY * getCategoryKeys().length} שאלות (${MIXED_PER_CATEGORY} מכל תחום)</span>
      </button>
    `;
    grid.innerHTML = html;
    grid.querySelectorAll("[data-cat]").forEach((el) => {
      el.addEventListener("click", () => startQuiz(el.dataset.cat));
    });
  }

  const params = new URLSearchParams(window.location.search);
  const catParam = params.get("cat");
  if (catParam && (QUESTION_BANK[catParam] || catParam === MIXED_KEY)) {
    startQuiz(catParam);
  }
}
