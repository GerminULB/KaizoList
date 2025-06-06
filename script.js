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
        div.innerHTML = `<span>#${lvl.rank}: ${lvl.name}</span><strong>${lvl.klp} KLP</strong>`;
        container.appendChild(div);
      });
  };

  document.getElementById('search').addEventListener('input', e => {
    render(e.target.value);
  });

  render();
}
loadLevels();
