document.addEventListener('DOMContentLoaded', () => {
  // Sync Theme first
  initTheme();

  const authForm = document.getElementById('auth-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const btnSubmit = document.getElementById('btn-submit');
  const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
  const toggleText = document.getElementById('toggle-text');
  const formTagline = document.getElementById('form-tagline');
  const alertBox = document.getElementById('alert-box');

  let mode = 'login'; // 'login' or 'register'

  // If already authenticated, redirect to index.html immediately
  if (localStorage.getItem('token')) {
    window.location.href = '/index.html';
    return;
  }

  // Toggle Mode Handler
  toggleAuthModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    hideAlert();
    authForm.reset();

    if (mode === 'login') {
      mode = 'register';
      formTagline.textContent = 'Join Taskify today and boost your productivity';
      btnSubmit.textContent = 'Create Account';
      toggleText.textContent = 'Already have an account?';
      toggleAuthModeBtn.textContent = 'Sign In';
    } else {
      mode = 'login';
      formTagline.textContent = 'Sign in to organize your tasks';
      btnSubmit.textContent = 'Sign In';
      toggleText.textContent = 'New to Taskify?';
      toggleAuthModeBtn.textContent = 'Create an Account';
    }
  });

  // Form Submission Handler
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    // Validation
    if (!username) {
      showAlert('Username is required');
      return;
    }
    if (!password) {
      showAlert('Password is required');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      showAlert('Password must be at least 6 characters long');
      return;
    }

    // Prepare API URL
    const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      btnSubmit.disabled = true;
      btnSubmit.textContent = mode === 'login' ? 'Signing In...' : 'Registering...';

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Success: Save token and user details to localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.user.username);

      // Redirect to dashboard
      window.location.href = '/index.html';

    } catch (err) {
      console.error(err);
      showAlert(err.message || 'An error occurred during authentication');
      
      // Reset submit button text
      btnSubmit.disabled = false;
      btnSubmit.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    }
  });

  // Helpers
  function showAlert(msg) {
    alertBox.textContent = msg;
    alertBox.style.display = 'block';
  }

  function hideAlert() {
    alertBox.textContent = '';
    alertBox.style.display = 'none';
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    
    if (savedTheme) {
      body.className = savedTheme === 'dark' ? 'dark-theme' : 'light-theme';
    } else {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.className = systemPrefersDark ? 'dark-theme' : 'light-theme';
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('[Service Worker] Registered successfully:', reg.scope))
          .catch((err) => console.error('[Service Worker] Registration failed:', err));
      });
    }
  }

  registerServiceWorker();
});
