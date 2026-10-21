
const STORAGE_KEYS = {
  TASKS: 'studysprint_tasks_v1',
  STATS: 'studysprint_stats_v1'
};

const TIMER_CONFIG = {
  DEFAULT_MINUTES: 25,
  DEFAULT_SECONDS: 25 * 60, // 1500 seconds
  MAX_HOURS: 10,
  MAX_SECONDS: 10 * 3600 // 36,000 seconds (10 hours)
};

// ==========================================
// Application State
// ==========================================
let tasks = [];
let studyStats = {}; // { "YYYY-MM-DD": { sessions: number, minutes: number } }
let currentFilter = 'all'; // 'all' | 'pending' | 'completed'

// Timer State
let configuredDuration = TIMER_CONFIG.DEFAULT_SECONDS;
let timerSecondsLeft = configuredDuration;
let timerIntervalId = null;
let isTimerRunning = false;

// ==========================================
// DOM Element References
// ==========================================
// Date & Stats
const currentDateDisplay = document.getElementById('currentDateDisplay');
const statTasksToday = document.getElementById('statTasksToday');
const statSessionsToday = document.getElementById('statSessionsToday');
const statMinutesToday = document.getElementById('statMinutesToday');
const weeklySummaryList = document.getElementById('weeklySummaryList');
const weeklyTotalSubtitle = document.getElementById('weeklyTotalSubtitle');

// Timer
const timerDisplay = document.getElementById('timerDisplay');
const timerStatus = document.getElementById('timerStatus');
const timerAlert = document.getElementById('timerAlert');
const startTimerBtn = document.getElementById('startTimerBtn');
const pauseTimerBtn = document.getElementById('pauseTimerBtn');
const resetTimerBtn = document.getElementById('resetTimerBtn');
const timerSessionCount = document.getElementById('timerSessionCount');
const timerHoursInput = document.getElementById('timerHoursInput');
const timerMinutesInput = document.getElementById('timerMinutesInput');
const timerSecondsInput = document.getElementById('timerSecondsInput');
const timerPresetButtons = document.querySelectorAll('.btn-preset');

// Task Form & List
const taskForm = document.getElementById('taskForm');
const taskTitleInput = document.getElementById('taskTitleInput');
const taskSubjectInput = document.getElementById('taskSubjectInput');
const formError = document.getElementById('formError');
const taskList = document.getElementById('taskList');
const emptyTasksMessage = document.getElementById('emptyTasksMessage');
const pendingTaskCount = document.getElementById('pendingTaskCount');
const completedTaskCount = document.getElementById('completedTaskCount');
const filterButtons = document.querySelectorAll('.filter-btn');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');

// ==========================================
// Helper Functions: Dates & Formatting
// ==========================================

/**
 * Returns the current date in YYYY-MM-DD format based on local time.
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a Date object or YYYY-MM-DD string into a friendly readable string.
 */
function formatDisplayDate(date) {
  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString(undefined, options);
}

/**
 * Formats seconds into HH:MM:SS format.
 */
function formatTimeDisplay(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ==========================================
// Storage Helpers (Safe LocalStorage)
// ==========================================

/**
 * Safely loads data from localStorage with fallback.
 */
function loadFromStorage(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;
    const parsed = JSON.parse(raw);
    return parsed !== null && parsed !== undefined ? parsed : fallbackValue;
  } catch (err) {
    console.warn(`Could not load key "${key}" from localStorage. Using fallback.`, err);
    return fallbackValue;
  }
}

/**
 * Safely saves data to localStorage.
 */
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Could not save key "${key}" to localStorage:`, err);
  }
}

// ==========================================
// Data Initialization & Sanitization
// ==========================================

function initData() {
  const loadedTasks = loadFromStorage(STORAGE_KEYS.TASKS, []);
  // Ensure loadedTasks is an array of valid task objects
  if (Array.isArray(loadedTasks)) {
    tasks = loadedTasks.filter(item => item && typeof item === 'object' && typeof item.id === 'string');
  } else {
    tasks = [];
  }

  const loadedStats = loadFromStorage(STORAGE_KEYS.STATS, {});
  // Ensure loadedStats is an object
  if (loadedStats && typeof loadedStats === 'object' && !Array.isArray(loadedStats)) {
    studyStats = loadedStats;
  } else {
    studyStats = {};
  }

  // Ensure today's entry in studyStats exists
  const todayKey = getTodayDateString();
  if (!studyStats[todayKey]) {
    studyStats[todayKey] = { sessions: 0, minutes: 0 };
  } else {
    // Sanitize non-negative numbers
    studyStats[todayKey].sessions = Math.max(0, Number(studyStats[todayKey].sessions) || 0);
    studyStats[todayKey].minutes = Math.max(0, Number(studyStats[todayKey].minutes) || 0);
  }
}

// ==========================================
// Task Manager Logic
// ==========================================

/**
 * Adds a new task to state, saves to storage, and re-renders.
 */
function addTask(title, subject) {
  const newTask = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    title: title.trim(),
    subject: subject.trim(),
    completed: false,
    completedAt: null, // YYYY-MM-DD string when completed
    createdAt: new Date().toISOString()
  };

  tasks.unshift(newTask);
  saveToStorage(STORAGE_KEYS.TASKS, tasks);
  renderTasks();
  renderStats();
}

/**
 * Toggles a task's completed status.
 */
function toggleTaskCompletion(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task.completed = !task.completed;
  if (task.completed) {
    task.completedAt = getTodayDateString();
  } else {
    task.completedAt = null;
  }

  saveToStorage(STORAGE_KEYS.TASKS, tasks);
  renderTasks();
  renderStats();
}

/**
 * Deletes a task by ID.
 */
function deleteTask(taskId) {
  tasks = tasks.filter(t => t.id !== taskId);
  saveToStorage(STORAGE_KEYS.TASKS, tasks);
  renderTasks();
  renderStats();
}

/**
 * Clears all completed tasks.
 */
function clearCompletedTasks() {
  const hasCompleted = tasks.some(t => t.completed);
  if (!hasCompleted) return;

  tasks = tasks.filter(t => !t.completed);
  saveToStorage(STORAGE_KEYS.TASKS, tasks);
  renderTasks();
  renderStats();
}

// ==========================================
// Study Timer Logic (Custom Duration up to 10h)
// ==========================================

function updateTimerDisplay() {
  timerDisplay.textContent = formatTimeDisplay(timerSecondsLeft);
}

function setTimerInputsDisabled(disabled) {
  if (timerHoursInput) timerHoursInput.disabled = disabled;
  if (timerMinutesInput) timerMinutesInput.disabled = disabled;
  if (timerSecondsInput) timerSecondsInput.disabled = disabled;
  timerPresetButtons.forEach(btn => btn.disabled = disabled);
}

function syncInputsFromDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (timerHoursInput) timerHoursInput.value = hrs;
  if (timerMinutesInput) timerMinutesInput.value = mins;
  if (timerSecondsInput) timerSecondsInput.value = secs;

  updateActivePreset(hrs, mins, secs);
}

function updateActivePreset(hrs, mins, secs) {
  timerPresetButtons.forEach(btn => {
    const btnH = parseInt(btn.dataset.hours, 10) || 0;
    const btnM = parseInt(btn.dataset.mins, 10) || 0;
    if (btnH === hrs && btnM === mins && secs === 0) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function onTimerInputChange() {
  let h = parseInt(timerHoursInput.value, 10);
  let m = parseInt(timerMinutesInput.value, 10);
  let s = parseInt(timerSecondsInput.value, 10);

  if (isNaN(h) || h < 0) h = 0;
  if (isNaN(m) || m < 0) m = 0;
  if (isNaN(s) || s < 0) s = 0;

  // Max 10 hours limit
  if (h > TIMER_CONFIG.MAX_HOURS) {
    h = TIMER_CONFIG.MAX_HOURS;
  }

  // If 10 hours, clamp minutes and seconds to 0
  if (h === TIMER_CONFIG.MAX_HOURS) {
    m = 0;
    s = 0;
  } else {
    if (m > 59) m = 59;
    if (s > 59) s = 59;
  }

  // Reflect clamped values in the inputs
  timerHoursInput.value = h;
  timerMinutesInput.value = m;
  timerSecondsInput.value = s;

  const totalSecs = (h * 3600) + (m * 60) + s;

  if (totalSecs <= 0) {
    configuredDuration = 0;
    timerSecondsLeft = 0;
    updateTimerDisplay();
    timerStatus.textContent = 'Please enter duration > 0s';
    startTimerBtn.disabled = true;
  } else {
    configuredDuration = Math.min(totalSecs, TIMER_CONFIG.MAX_SECONDS);
    timerSecondsLeft = configuredDuration;
    updateTimerDisplay();
    timerStatus.textContent = 'Ready to focus';
    startTimerBtn.disabled = false;
  }

  updateActivePreset(h, m, s);
}

function startTimer() {
  if (isTimerRunning || timerSecondsLeft <= 0) return;

  isTimerRunning = true;
  timerAlert.style.display = 'none';
  timerStatus.textContent = 'Focusing on your sprint...';

  startTimerBtn.disabled = true;
  pauseTimerBtn.disabled = false;
  resetTimerBtn.disabled = false;
  setTimerInputsDisabled(true);

  timerIntervalId = setInterval(() => {
    if (timerSecondsLeft > 0) {
      timerSecondsLeft--;
      updateTimerDisplay();
    } else {
      completeTimer();
    }
  }, 1000);
}

function pauseTimer() {
  if (!isTimerRunning) return;

  clearInterval(timerIntervalId);
  timerIntervalId = null;
  isTimerRunning = false;

  timerStatus.textContent = 'Timer paused';
  startTimerBtn.disabled = false;
  pauseTimerBtn.disabled = true;
  resetTimerBtn.disabled = false;
  // Keep inputs disabled while paused to protect current countdown progress
}

function resetTimer() {
  clearInterval(timerIntervalId);
  timerIntervalId = null;
  isTimerRunning = false;

  // Ensure configuredDuration is valid
  if (!configuredDuration || configuredDuration <= 0) {
    configuredDuration = TIMER_CONFIG.DEFAULT_SECONDS;
  }

  timerSecondsLeft = configuredDuration;
  syncInputsFromDuration(timerSecondsLeft);
  setTimerInputsDisabled(false);

  updateTimerDisplay();
  timerStatus.textContent = 'Ready to focus';
  timerAlert.style.display = 'none';

  startTimerBtn.disabled = false;
  pauseTimerBtn.disabled = true;
  resetTimerBtn.disabled = false;
}

function completeTimer() {
  clearInterval(timerIntervalId);
  timerIntervalId = null;
  isTimerRunning = false;

  // Record session: calculate actual session minutes
  const sessionMinutes = Math.max(1, Math.round(configuredDuration / 60));
  const todayKey = getTodayDateString();
  if (!studyStats[todayKey]) {
    studyStats[todayKey] = { sessions: 0, minutes: 0 };
  }
  studyStats[todayKey].sessions += 1;
  studyStats[todayKey].minutes += sessionMinutes;

  saveToStorage(STORAGE_KEYS.STATS, studyStats);

  // Reset timer to configured duration
  timerSecondsLeft = configuredDuration;
  setTimerInputsDisabled(false);

  // Update UI
  updateTimerDisplay();
  timerStatus.textContent = 'Session complete! Take a break.';
  timerAlert.textContent = `🎉 Well done! You completed your ${sessionMinutes}-minute study sprint. Take a well-deserved break!`;
  timerAlert.style.display = 'block';

  startTimerBtn.disabled = false;
  pauseTimerBtn.disabled = true;
  resetTimerBtn.disabled = false;

  renderStats();
}

// ==========================================
// Rendering Functions
// ==========================================

/**
 * Renders the task list, filters, and counter badges.
 */
function renderTasks() {
  const pendingCount = tasks.filter(t => !t.completed).length;
  const completedCount = tasks.filter(t => t.completed).length;

  pendingTaskCount.textContent = pendingCount;
  completedTaskCount.textContent = completedCount;

  // Show/Hide Clear Completed button
  clearCompletedBtn.style.display = completedCount > 0 ? 'inline-block' : 'none';

  // Filter tasks
  let visibleTasks = tasks;
  if (currentFilter === 'pending') {
    visibleTasks = tasks.filter(t => !t.completed);
  } else if (currentFilter === 'completed') {
    visibleTasks = tasks.filter(t => t.completed);
  }

  // Handle empty state
  if (visibleTasks.length === 0) {
    taskList.innerHTML = '';
    emptyTasksMessage.style.display = 'block';
    if (tasks.length === 0) {
      emptyTasksMessage.querySelector('.empty-title').textContent = 'No tasks yet!';
      emptyTasksMessage.querySelector('.empty-subtitle').textContent = 'Add your first homework or study goal using the form above.';
    } else {
      emptyTasksMessage.querySelector('.empty-title').textContent = `No ${currentFilter} tasks`;
      emptyTasksMessage.querySelector('.empty-subtitle').textContent = 'Change the filter above to view your other tasks.';
    }
    return;
  }

  emptyTasksMessage.style.display = 'none';
  taskList.innerHTML = '';

  visibleTasks.forEach(task => {
    const li = document.createElement('li');
    li.className = `task-item ${task.completed ? 'completed' : ''}`;
    li.dataset.id = task.id;

    // Checkbox
    const leftDiv = document.createElement('div');
    leftDiv.className = 'task-left';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Mark "${task.title}" as ${task.completed ? 'pending' : 'completed'}`);

    checkbox.addEventListener('change', () => {
      toggleTaskCompletion(task.id);
    });

    // Details: title & meta
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'task-details';

    const textSpan = document.createElement('span');
    textSpan.className = 'task-text';
    textSpan.textContent = task.title;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'task-meta';

    const subjectBadge = document.createElement('span');
    subjectBadge.className = 'subject-tag';
    subjectBadge.textContent = task.subject;

    metaDiv.appendChild(subjectBadge);

    if (task.completed && task.completedAt) {
      const completedInfo = document.createElement('span');
      completedInfo.className = 'task-date-info';
      completedInfo.textContent = `Done on ${task.completedAt}`;
      metaDiv.appendChild(completedInfo);
    }

    detailsDiv.appendChild(textSpan);
    detailsDiv.appendChild(metaDiv);

    leftDiv.appendChild(checkbox);
    leftDiv.appendChild(detailsDiv);

    // Delete Action
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'task-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-delete-task';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', `Delete task "${task.title}"`);

    deleteBtn.addEventListener('click', () => {
      deleteTask(task.id);
    });

    actionsDiv.appendChild(deleteBtn);

    li.appendChild(leftDiv);
    li.appendChild(actionsDiv);
    taskList.appendChild(li);
  });
}

/**
 * Calculates and updates today's stats and the 7-day weekly summary.
 */
function renderStats() {
  const todayKey = getTodayDateString();

  // 1. Tasks completed today
  const tasksCompletedToday = tasks.filter(t => t.completed && t.completedAt === todayKey).length;
  statTasksToday.textContent = tasksCompletedToday;

  // 2. Study sessions today
  const todayStats = studyStats[todayKey] || { sessions: 0, minutes: 0 };
  const sessionsCount = Math.max(0, todayStats.sessions || 0);
  const minutesCount = Math.max(0, todayStats.minutes || 0);

  statSessionsToday.textContent = sessionsCount;
  timerSessionCount.textContent = sessionsCount;
  statMinutesToday.innerHTML = `${minutesCount} <span class="stat-unit">mins</span>`;

  // 3. Weekly Summary (Past 7 days including today)
  renderWeeklySummary();
}

/**
 * Renders the 7-day study breakdown.
 */
function renderWeeklySummary() {
  weeklySummaryList.innerHTML = '';
  let weeklyTotalSessions = 0;
  let weeklyTotalMinutes = 0;

  const dayBoxes = [];
  const today = new Date();

  // Loop back 6 days to today (7 days total)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
    const dayDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const dayStat = studyStats[dateKey] || { sessions: 0, minutes: 0 };
    const sessions = Math.max(0, Number(dayStat.sessions) || 0);
    const minutes = Math.max(0, Number(dayStat.minutes) || 0);

    weeklyTotalSessions += sessions;
    weeklyTotalMinutes += minutes;

    const isToday = i === 0;

    const box = document.createElement('div');
    box.className = `weekly-day-box ${isToday ? 'is-today' : ''}`;

    box.innerHTML = `
      <div class="weekly-day-name">${isToday ? 'Today' : dayName}</div>
      <div class="weekly-day-date">${dayDate}</div>
      <div class="weekly-day-minutes">${minutes}m</div>
      <div class="weekly-day-label">${sessions} ${sessions === 1 ? 'sprint' : 'sprints'}</div>
    `;

    dayBoxes.push(box);
  }

  dayBoxes.forEach(b => weeklySummaryList.appendChild(b));

  weeklyTotalSubtitle.textContent = `${weeklyTotalSessions} sprint${weeklyTotalSessions === 1 ? '' : 's'} (${weeklyTotalMinutes} mins) this week`;
}

// ==========================================
// Event Listeners & Form Validation
// ==========================================

function setupEventListeners() {
  // Form submission
  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const titleValue = taskTitleInput.value.trim();
    const subjectValue = taskSubjectInput.value.trim();

    // Validation
    if (!titleValue && !subjectValue) {
      showError('Please enter both a task description and a subject.');
      taskTitleInput.focus();
      return;
    }
    if (!titleValue) {
      showError('Please enter a task description.');
      taskTitleInput.focus();
      return;
    }
    if (!subjectValue) {
      showError('Please enter or select a subject.');
      taskSubjectInput.focus();
      return;
    }

    // Clear error
    hideError();

    // Add task
    addTask(titleValue, subjectValue);

    // Reset inputs
    taskTitleInput.value = '';
    taskSubjectInput.value = '';
    taskTitleInput.focus();
  });

  // Filter buttons
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  // Clear completed button
  clearCompletedBtn.addEventListener('click', () => {
    clearCompletedTasks();
  });

  // Timer buttons
  startTimerBtn.addEventListener('click', startTimer);
  pauseTimerBtn.addEventListener('click', pauseTimer);
  resetTimerBtn.addEventListener('click', resetTimer);

  // Timer duration inputs (editable up to 10h)
  [timerHoursInput, timerMinutesInput, timerSecondsInput].forEach(input => {
    if (input) {
      input.addEventListener('input', onTimerInputChange);
      input.addEventListener('change', onTimerInputChange);
    }
  });

  // Quick preset buttons
  timerPresetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isTimerRunning) return;
      const h = parseInt(btn.dataset.hours, 10) || 0;
      const m = parseInt(btn.dataset.mins, 10) || 0;
      timerHoursInput.value = h;
      timerMinutesInput.value = m;
      timerSecondsInput.value = 0;
      onTimerInputChange();
    });
  });
}

function showError(msg) {
  formError.textContent = msg;
  formError.style.display = 'block';
}

function hideError() {
  formError.textContent = '';
  formError.style.display = 'none';
}

// ==========================================
// Application Startup
// ==========================================

function initApp() {
  // Show today's human-readable date in header
  if (currentDateDisplay) {
    currentDateDisplay.textContent = formatDisplayDate(new Date());
  }

  // Load and sanitize stored data
  initData();

  // Setup UI and bindings
  updateTimerDisplay();
  renderTasks();
  renderStats();
  setupEventListeners();
}

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
