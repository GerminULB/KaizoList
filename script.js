async function loadLevels() {
  const res = await fetch('levels.json');
  const levels = await res.json();
  const container = document.getElementById('level-list');
  const total = levels.reduce((sum, lvl) => sum + lvl.klp, 0);
  document.getElementById('total-klp').innerText = `Total: ${total.toLocaleString()} KLP`;

  const render = (filter = '') => {
    container.innerHTML = '';
    levels
      .filter(lvl => lvl.name.toLowerCase().includes(filter.toLowerCase()))
      .forEach(lvl => {
        const div = document.createElement('div');
        div.className = 'level';
        div.innerHTML = `
          <div class="level-summary" style="cursor: pointer;">
            <span>#${lvl.rank}: ${lvl.name}</span>
            <strong>${lvl.klp} KLP</strong>
          </div>
          <div class="level-details" style="display:none; margin-top: 8px;">
            <p><strong>ID:</strong> ${lvl.id}</p>
            <p><strong>Creator:</strong> ${lvl.creator}</p>
            <p><strong>Verifier:</strong> ${lvl.verifier}</p>
          </div>
        `;

        // Toggle details visibility when clicking summary
        div.querySelector('.level-summary').addEventListener('click', () => {
          const details = div.querySelector('.level-details');
          details.style.display = details.style.display === 'none' ? 'block' : 'none';
        });

        container.appendChild(div);
      });
  };

  document.getElementById('search').addEventListener('input', e => {
    render(e.target.value);
  });

  render();
}
loadLevels();
