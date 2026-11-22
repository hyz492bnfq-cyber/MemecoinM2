const titles = {
  overview: 'Vue générale',
  scanner: 'Scanner live',
  opportunities: 'Opportunités',
  security: 'Sécurité',
  alerts: 'Alertes'
};

function showView(name) {
  const selected = titles[name] ? name : 'overview';
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active-view'));
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === selected));
  document.querySelector(`#view-${selected}`).classList.add('active-view');
  document.querySelector('#page-title').textContent = titles[selected];
  if (window.location.hash !== `#${selected}`) history.replaceState(null, '', `#${selected}`);
}

document.querySelectorAll('[data-view]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    showView(link.dataset.view);
  });
});
document.querySelectorAll('[data-go]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.go));
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    window.location.assign('/login');
  }
});

fetch('/api/me').then((response) => {
  if (!response.ok) window.location.assign('/login');
}).catch(() => window.location.assign('/login'));

showView(window.location.hash.replace('#', '') || 'overview');
