// --------------------------------------------------
// App State Management
// --------------------------------------------------
let state = {
  tasks: [],
  filters: {
    search: '',
    status: 'all',
    priority: 'all',
    sort: 'custom' // default custom drag-and-drop order
  },
  theme: 'dark', // default theme
  editingId: null,
  lastDeletedTask: null, // used for undo action
  lastDeletedIndex: null
};

// DOM Elements Cache
const body = document.body;
const themeToggleBtn = document.getElementById('theme-toggle');
const moonIcon = document.getElementById('moon-icon');
const sunIcon = document.getElementById('sun-icon');
const shortcutsBtn = document.getElementById('shortcuts-btn');
const shortcutsModal = document.getElementById('shortcuts-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

const statsTotal = document.getElementById('stats-total');
const statsActive = document.getElementById('stats-active');
const statsCompleted = document.getElementById('stats-completed');
const progressPercent = document.getElementById('progress-percent');
const progressRingFill = document.getElementById('progress-ring-fill');

const creatorHeader = document.getElementById('creator-header');
const creatorForm = document.getElementById('creator-form');
const taskTitleInput = document.getElementById('task-title');
const taskDescInput = document.getElementById('task-desc');
const taskDateInput = document.getElementById('task-date');
const prioritySelector = document.getElementById('priority-selector');
const btnCancelTask = document.getElementById('btn-cancel-task');

const searchBar = document.getElementById('search-bar');
const searchClearBtn = document.getElementById('search-clear-btn');
const statusFilterGroup = document.getElementById('status-filter-group');
const priorityFilterSelect = document.getElementById('priority-filter-select');
const sortSelect = document.getElementById('sort-select');

const taskListContainer = document.getElementById('task-list-container');
const footerActionsPanel = document.getElementById('footer-actions-panel');
const tasksLeftCounter = document.getElementById('tasks-left-counter');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const toastContainer = document.getElementById('toast-container');

// --------------------------------------------------
// Initialize Theme
// --------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(systemPrefersDark ? 'dark' : 'light');
  }
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('theme', theme);
  if (theme === 'dark') {
    body.classList.remove('light-theme');
    body.classList.add('dark-theme');
    moonIcon.style.display = 'block';
    sunIcon.style.display = 'none';
  } else {
    body.classList.remove('dark-theme');
    body.classList.add('light-theme');
    moonIcon.style.display = 'none';
    sunIcon.style.display = 'block';
  }
}

themeToggleBtn.addEventListener('click', () => {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
});

// Helper for authenticated HTTP requests
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  
  if (!token && !url.includes('/api/auth/')) {
    window.location.href = '/login.html';
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login.html';
  }
  
  return response;
}

// --------------------------------------------------
// Fetch Tasks from REST API Backend
// --------------------------------------------------
async function loadTasks() {
  try {
    const response = await fetchWithAuth('/api/tasks');
    if (!response.ok) throw new Error('Network response not ok');
    state.tasks = await response.json();
  } catch (err) {
    console.error('Error loading tasks from backend:', err);
    state.tasks = [];
    showToast('Failed to load tasks from server.');
  }
  updateStats();
  renderTasks();
}

// --------------------------------------------------
// Statistics Calculator
// --------------------------------------------------
function updateStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const active = total - completed;

  statsTotal.textContent = total;
  statsActive.textContent = active;
  statsCompleted.textContent = completed;

  // Update remaining counter text
  tasksLeftCounter.textContent = `${active} task${active !== 1 ? 's' : ''} remaining`;
  clearCompletedBtn.disabled = completed === 0;

  // Circular progress calculation
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressPercent.textContent = `${percentage}%`;

  // SVG stroke-dashoffset: radius is 32, circumference is 201
  const circumference = 2 * Math.PI * 32;
  const offset = circumference - (percentage / 100) * circumference;
  progressRingFill.style.strokeDashoffset = offset;
}

// --------------------------------------------------
// Creator Drawer Collapse & Expand
// --------------------------------------------------
function toggleCreatorDrawer(shouldOpen) {
  const isOpen = creatorForm.classList.contains('open');
  const force = typeof shouldOpen === 'boolean' ? shouldOpen : !isOpen;

  if (force) {
    creatorHeader.classList.add('active');
    creatorForm.classList.add('open');
    taskTitleInput.focus();
  } else {
    creatorHeader.classList.remove('active');
    creatorForm.classList.remove('open');
    creatorForm.reset();
    resetPriorityTab();
  }
}

creatorHeader.addEventListener('click', () => toggleCreatorDrawer());
btnCancelTask.addEventListener('click', () => toggleCreatorDrawer(false));

// Priority selector tabs in new task form
let selectedFormPriority = 'low';
prioritySelector.addEventListener('click', (e) => {
  if (e.target.classList.contains('priority-tab')) {
    prioritySelector.querySelectorAll('.priority-tab').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    selectedFormPriority = e.target.dataset.priority;
  }
});

function resetPriorityTab() {
  selectedFormPriority = 'low';
  prioritySelector.querySelectorAll('.priority-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.priority === 'low');
  });
}

// --------------------------------------------------
// CRUD Operations calling REST APIs
// --------------------------------------------------
creatorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const title = taskTitleInput.value.trim();
  if (!title) {
    showToast('Please enter a task title');
    return;
  }

  const taskData = {
    title: title,
    description: taskDescInput.value.trim(),
    dueDate: taskDateInput.value,
    priority: selectedFormPriority,
    completed: false
  };

  try {
    const response = await fetchWithAuth('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
    if (!response.ok) throw new Error('Failed to create task on backend');
    const newTask = await response.json();

    // Prepend to array
    state.tasks.unshift(newTask);
    updateStats();
    renderTasks();
    showToast('Task added successfully');

    // Add animated entry class to the new card
    setTimeout(() => {
      const firstCard = taskListContainer.querySelector(`[data-id="${newTask.id}"]`);
      if (firstCard) {
        firstCard.classList.add('new-task');
        firstCard.addEventListener('animationend', () => {
          firstCard.classList.remove('new-task');
        }, { once: true });
      }
    }, 50);

    toggleCreatorDrawer(false);
  } catch (err) {
    console.error(err);
    showToast('Error saving task to server');
  }
});

async function deleteTask(id) {
  const index = state.tasks.findIndex(t => t.id === id);
  if (index > -1) {
    const card = taskListContainer.querySelector(`[data-id="${id}"]`);
    if (card) {
      card.classList.add('deleting');
      card.addEventListener('animationend', async () => {
        try {
          const response = await fetchWithAuth(`/api/tasks/${id}`, {
            method: 'DELETE'
          });
          if (!response.ok) throw new Error('Failed to delete task on server');
          const data = await response.json();
          
          state.lastDeletedTask = data.task;
          state.lastDeletedIndex = index;
          state.tasks.splice(index, 1);
          
          updateStats();
          renderTasks();
          showToast('Task deleted', 'Undo', undoDelete);
        } catch (err) {
          console.error(err);
          showToast('Error deleting task');
          card.classList.remove('deleting');
        }
      }, { once: true });
    }
  }
}

async function undoDelete() {
  if (state.lastDeletedTask) {
    try {
      const response = await fetchWithAuth('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(state.lastDeletedTask)
      });
      if (!response.ok) throw new Error('Failed to restore task on backend');
      const restored = await response.json();

      // Put it back at its original index
      state.tasks.splice(state.lastDeletedIndex, 0, restored);
      const restoredId = restored.id;
      state.lastDeletedTask = null;
      state.lastDeletedIndex = null;
      
      updateStats();
      renderTasks();
      showToast('Task restored');

      // Highlight restored task
      setTimeout(() => {
        const card = taskListContainer.querySelector(`[data-id="${restoredId}"]`);
        if (card) {
          card.classList.add('new-task');
          card.addEventListener('animationend', () => {
            card.classList.remove('new-task');
          }, { once: true });
        }
      }, 50);
    } catch (err) {
      console.error(err);
      showToast('Error restoring task');
    }
  }
}

async function toggleTaskComplete(event, id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    const nextCompletedState = !task.completed;
    
    // Calculate coordinates for confetti if marking completed
    let x = 0, y = 0;
    if (nextCompletedState && event) {
      const rect = event.currentTarget.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }

    try {
      const response = await fetchWithAuth(`/api/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: nextCompletedState })
      });
      if (!response.ok) throw new Error('Failed to complete task');
      const updated = await response.json();
      
      task.completed = updated.completed;
      updateStats();
      renderTasks();
      showToast(task.completed ? 'Task completed!' : 'Task active');

      if (task.completed && x > 0 && y > 0) {
        triggerConfetti(x, y);
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating task status');
    }
  }
}

// --------------------------------------------------
// Inline Edit Operations
// --------------------------------------------------
function enterEditMode(id) {
  state.editingId = id;
  renderTasks();
  
  // Focus inline input
  const editTitle = document.getElementById(`edit-title-${id}`);
  if (editTitle) {
    editTitle.focus();
    // Place cursor at the end of input
    const length = editTitle.value.length;
    editTitle.setSelectionRange(length, length);
  }
}

function cancelEditMode() {
  state.editingId = null;
  renderTasks();
}

async function saveInlineEdit(id) {
  const editTitle = document.getElementById(`edit-title-${id}`);
  const editDesc = document.getElementById(`edit-desc-${id}`);
  const editDate = document.getElementById(`edit-date-${id}`);
  const editPriority = document.getElementById(`edit-priority-${id}`);

  const title = editTitle.value.trim();
  if (!title) {
    showToast('Task title cannot be empty');
    return;
  }

  const updates = {
    title: title,
    description: editDesc.value.trim(),
    dueDate: editDate.value,
    priority: editPriority.value
  };

  try {
    const response = await fetchWithAuth(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update task details');
    const updated = await response.json();

    const index = state.tasks.findIndex(t => t.id === id);
    if (index > -1) {
      state.tasks[index] = updated;
    }
    
    state.editingId = null;
    updateStats();
    renderTasks();
    showToast('Task updated');
  } catch (err) {
    console.error(err);
    showToast('Error saving task modifications');
  }
}

// --------------------------------------------------
// Filter & Sort UI handlers
// --------------------------------------------------
function getFilteredAndSortedTasks() {
  // 1. Filter
  let result = state.tasks.filter(task => {
    // Keyword Search (title & description)
    const query = state.filters.search.toLowerCase();
    const matchesSearch = query === '' || 
      task.title.toLowerCase().includes(query) || 
      task.description.toLowerCase().includes(query);

    // Completion Status Filter
    let matchesStatus = true;
    if (state.filters.status === 'active') {
      matchesStatus = !task.completed;
    } else if (state.filters.status === 'completed') {
      matchesStatus = task.completed;
    }

    // Priority Filter
    let matchesPriority = true;
    if (state.filters.priority !== 'all') {
      matchesPriority = task.priority === state.filters.priority;
    }

    return matchesSearch && matchesStatus && matchesPriority;
  });

  // 2. Sort
  const priorityWeights = { high: 3, medium: 2, low: 1 };

  if (state.filters.sort === 'due-date') {
    result.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  } else if (state.filters.sort === 'priority') {
    result.sort((a, b) => {
      return priorityWeights[b.priority] - priorityWeights[a.priority];
    });
  } else if (state.filters.sort === 'created-date') {
    result.sort((a, b) => b.createdAt - a.createdAt);
  }
  
  // If sort is 'custom', we keep the natural array order (drag and drop order).
  return result;
}

// Event listeners for Filters
searchBar.addEventListener('input', (e) => {
  state.filters.search = e.target.value;
  searchClearBtn.style.display = e.target.value ? 'flex' : 'none';
  renderTasks();
});

searchClearBtn.addEventListener('click', () => {
  searchBar.value = '';
  state.filters.search = '';
  searchClearBtn.style.display = 'none';
  searchBar.focus();
  renderTasks();
});

statusFilterGroup.addEventListener('click', (e) => {
  if (e.target.classList.contains('filter-btn')) {
    statusFilterGroup.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    state.filters.status = e.target.dataset.status;
    renderTasks();
  }
});

priorityFilterSelect.addEventListener('change', (e) => {
  state.filters.priority = e.target.value;
  renderTasks();
});

sortSelect.addEventListener('change', (e) => {
  state.filters.sort = e.target.value;
  renderTasks();
});

clearCompletedBtn.addEventListener('click', async () => {
  const completedCount = state.tasks.filter(t => t.completed).length;
  try {
    const response = await fetchWithAuth('/api/tasks/clear/completed', {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to clear completed tasks');
    
    state.tasks = state.tasks.filter(t => !t.completed);
    updateStats();
    renderTasks();
    showToast(`Cleared ${completedCount} completed task${completedCount !== 1 ? 's' : ''}`);
  } catch (err) {
    console.error(err);
    showToast('Failed to clear completed tasks on server');
  }
});

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function getDueDateStatus(dueDateStr, isCompleted) {
  if (!dueDateStr || isCompleted) return null;
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const dueDate = new Date(dueDateStr);
  dueDate.setHours(0,0,0,0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  return 'upcoming';
}

function formatFriendlyDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return dateStr;
}

// --------------------------------------------------
// Task Rendering Pipeline
// --------------------------------------------------
function renderTasks() {
  const visibleTasks = getFilteredAndSortedTasks();
  taskListContainer.innerHTML = '';

  if (visibleTasks.length === 0) {
    renderEmptyState();
    return;
  }

  visibleTasks.forEach(task => {
    const isEditing = state.editingId === task.id;
    const card = document.createElement('article');
    card.className = 'task-card';
    card.dataset.id = task.id;
    
    // Add Draggable attribute ONLY if we are in 'custom' order
    const isDraggable = state.filters.sort === 'custom';
    if (isDraggable) {
      card.setAttribute('draggable', 'true');
    }

    const dateStatus = getDueDateStatus(task.dueDate, task.completed);
    if (dateStatus === 'overdue') {
      card.classList.add('is-overdue');
    }
    if (task.completed) {
      card.classList.add('completed');
    }

    if (isEditing) {
      // Edit Mode Card DOM
      card.innerHTML = `
        <div class="task-edit-form">
          <div class="form-group">
            <label>Title</label>
            <input type="text" id="edit-title-${task.id}" class="input-field" value="${escapeHTML(task.title)}" placeholder="Task title">
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea id="edit-desc-${task.id}" class="input-field" placeholder="Optional description">${escapeHTML(task.description || '')}</textarea>
          </div>
          <div class="task-edit-row">
            <div class="form-group">
              <label>Due Date</label>
              <input type="date" id="edit-date-${task.id}" class="input-field" value="${task.dueDate || ''}">
            </div>
            <div class="form-group">
              <label>Priority</label>
              <div class="select-wrapper">
                <select id="edit-priority-${task.id}" style="width:100%;">
                  <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
                  <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
                </select>
              </div>
            </div>
          </div>
          <div class="task-edit-buttons">
            <button type="button" class="btn btn-secondary btn-save-edit" onclick="cancelEditMode()" style="padding:0.55rem 1rem;">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="saveInlineEdit('${task.id}')" style="padding:0.55rem 1rem;">Save</button>
          </div>
        </div>
      `;
      
      const editTitle = card.querySelector(`#edit-title-${task.id}`);
      const editDesc = card.querySelector(`#edit-desc-${task.id}`);
      
      const handleKeydown = (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          saveInlineEdit(task.id);
        }
        if (e.key === 'Escape') {
          cancelEditMode();
        }
      };

      editTitle.addEventListener('keydown', handleKeydown);
      editDesc.addEventListener('keydown', handleKeydown);

    } else {
      // Standard View Mode Card DOM
      let badgeHTML = `<span class="badge badge-priority" data-priority="${task.priority}">${task.priority}</span>`;
      
      if (task.dueDate) {
        let dateClass = 'badge badge-date';
        let calendarLabel = formatFriendlyDate(task.dueDate);
        
        if (dateStatus === 'overdue') {
          dateClass += ' overdue';
          calendarLabel = `Overdue: ${calendarLabel}`;
        } else if (dateStatus === 'today') {
          calendarLabel = 'Due Today';
        } else if (dateStatus === 'tomorrow') {
          calendarLabel = 'Due Tomorrow';
        }

        badgeHTML += `
          <span class="${dateClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${calendarLabel}
          </span>
        `;
      }

      const dragHandleHTML = isDraggable ? `
        <div class="drag-handle" title="Drag to reorder">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="5" r="1"></circle>
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="9" cy="19" r="1"></circle>
            <circle cx="15" cy="5" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="15" cy="19" r="1"></circle>
          </svg>
        </div>
      ` : '';

      card.innerHTML = `
        ${dragHandleHTML}
        
        <div class="checkbox-container">
          <div class="custom-checkbox ${task.completed ? 'checked' : ''}" onclick="toggleTaskComplete(event, '${task.id}')" aria-label="Toggle Complete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>

        <div class="task-card-content" ondblclick="enterEditMode('${task.id}')">
          <h3 class="task-card-title">${escapeHTML(task.title)}</h3>
          ${task.description ? `<p class="task-card-description">${escapeHTML(task.description)}</p>` : ''}
          <div class="task-card-badges">
            ${badgeHTML}
          </div>
        </div>

        <div class="task-card-actions">
          <button class="btn-action" onclick="enterEditMode('${task.id}')" title="Edit Task" aria-label="Edit Task">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-action btn-action-delete" onclick="deleteTask('${task.id}')" title="Delete Task" aria-label="Delete Task">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      `;

      if (isDraggable) {
        setupDragAndDropEvents(card);
      }
    }

    taskListContainer.appendChild(card);
  });
}

function renderEmptyState() {
  const isSearching = state.filters.search !== '';
  const hasFilter = state.filters.priority !== 'all' || state.filters.status !== 'all';
  
  let title = "All caught up!";
  let desc = "Enjoy your day, or create a new task to get started.";
  
  if (isSearching || hasFilter) {
    title = "No matches found";
    desc = "Try modifying your filters or search keywords.";
  }

  taskListContainer.innerHTML = `
    <div class="empty-state">
      <svg class="empty-state-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
        <path d="M9 12l2 2 4-4"></path>
      </svg>
      <h3 class="empty-state-title">${title}</h3>
      <p class="empty-state-text">${desc}</p>
    </div>
  `;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// --------------------------------------------------
// Drag & Drop Implementation
// --------------------------------------------------
function setupDragAndDropEvents(card) {
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    saveNewCustomOrder();
  });
}

// List container listeners for dragging items over
taskListContainer.addEventListener('dragover', (e) => {
  e.preventDefault();
  const draggingCard = document.querySelector('.task-card.dragging');
  if (!draggingCard) return;

  const otherCards = [...taskListContainer.querySelectorAll('.task-card:not(.dragging)')];
  
  const nextCardSibling = otherCards.find(card => {
    const box = card.getBoundingClientRect();
    return e.clientY < box.top + box.height / 2;
  });

  if (nextCardSibling) {
    taskListContainer.insertBefore(draggingCard, nextCardSibling);
  } else {
    taskListContainer.appendChild(draggingCard);
  }
});

async function saveNewCustomOrder() {
  const cardElements = [...taskListContainer.querySelectorAll('.task-card')];
  const orderedIds = cardElements.map(el => el.dataset.id);
  
  // Re-order the state array
  const idMap = new Map(state.tasks.map(t => [t.id, t]));
  const newOrderedTasks = [];

  orderedIds.forEach(id => {
    const task = idMap.get(id);
    if (task) {
      newOrderedTasks.push(task);
      idMap.delete(id);
    }
  });

  idMap.forEach(task => {
    newOrderedTasks.push(task);
  });

  state.tasks = newOrderedTasks;
  updateStats();

  // Save ordering to DB
  try {
    const response = await fetchWithAuth('/api/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds })
    });
    if (!response.ok) throw new Error('Order save error');
  } catch (err) {
    console.error(err);
    showToast('Failed to sync reordered tasks to server.');
  }
}

// --------------------------------------------------
// Toast Notification System
// --------------------------------------------------
function showToast(message, actionText = '', actionCallback = null) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let actionBtnHTML = '';
  if (actionText && actionCallback) {
    actionBtnHTML = `<button class="toast-undo">${actionText}</button>`;
  }

  toast.innerHTML = `
    <span>${message}</span>
    ${actionBtnHTML}
  `;

  if (actionCallback) {
    const btn = toast.querySelector('.toast-undo');
    btn.addEventListener('click', () => {
      actionCallback();
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    });
  }

  toastContainer.appendChild(toast);
  
  toast.offsetHeight; // trigger reflow
  toast.classList.add('show');

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}

// --------------------------------------------------
// Modal Helpers (Shortcuts)
// --------------------------------------------------
function toggleShortcutsModal(show) {
  shortcutsModal.classList.toggle('active', show);
}

shortcutsBtn.addEventListener('click', () => toggleShortcutsModal(true));
modalCloseBtn.addEventListener('click', () => toggleShortcutsModal(false));
shortcutsModal.addEventListener('click', (e) => {
  if (e.target === shortcutsModal) toggleShortcutsModal(false);
});

// --------------------------------------------------
// Global Keyboard Shortcuts
// --------------------------------------------------
window.addEventListener('keydown', (e) => {
  const activeElement = document.activeElement;
  const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT';

  if (e.key === 'Escape') {
    if (shortcutsModal.classList.contains('active')) {
      toggleShortcutsModal(false);
      return;
    }
    if (state.editingId) {
      cancelEditMode();
      return;
    }
    if (creatorForm.classList.contains('open')) {
      toggleCreatorDrawer(false);
      return;
    }
  }

  if (isInputFocused) return;

  if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    toggleCreatorDrawer(true);
  }

  if (e.key === '/' || e.key.toLowerCase() === 's') {
    e.preventDefault();
    searchBar.focus();
    searchBar.select();
  }
});

// --------------------------------------------------
// App Initialization Boot
// --------------------------------------------------
function boot() {
  initTheme();
  loadTasks();
}

boot();

// --------------------------------------------------
// Logout Trigger
// --------------------------------------------------
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetchWithAuth('/api/auth/logout', {
        method: 'POST'
      });
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login.html';
  });
}

// --------------------------------------------------
// Confetti Particle System
// --------------------------------------------------
function triggerConfetti(x, y) {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Set canvas size matching window viewport size
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  let particles = [];
  const colors = ['#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
  
  // Emitting particles
  for (let i = 0; i < 35; i++) {
    particles.push({
      x: x,
      y: y,
      radius: Math.random() * 3 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      angle: Math.random() * Math.PI * 2,
      speed: Math.random() * 4 + 4,
      friction: 0.95,
      gravity: 0.2,
      alpha: 1,
      decay: Math.random() * 0.02 + 0.015
    });
  }
  
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let active = false;
    particles.forEach(p => {
      if (p.alpha <= 0) return;
      
      p.speed *= p.friction;
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed + p.gravity;
      p.alpha -= p.decay;
      
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      if (p.alpha > 0) active = true;
    });
    
    if (active) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  
  animate();
}
