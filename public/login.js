const form = document.querySelector('#login-form');
const input = document.querySelector('#access-code');
const message = document.querySelector('#login-message');
const button = form.querySelector('button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  button.disabled = true;
  button.textContent = 'Vérification…';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: input.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Impossible de se connecter.');
    window.location.assign(result.redirect || '/dashboard');
  } catch (error) {
    message.textContent = error.message || 'Une erreur est survenue.';
    input.select();
  } finally {
    button.disabled = false;
    button.innerHTML = 'Accéder au dashboard <span>→</span>';
  }
});
