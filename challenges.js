let currentLevels = [];

// Load challenges.json and initialize
fetch('challenges.json')
  .then(res => res.json())
  .then(data => {
    currentLevels = data;

    // Ensure id field exists and compute rank automatically by KLP
    currentLevels.forEach((lvl, index) => {
      if (!lvl.id) lvl.id = index + 1;
    });
    currentLevels.sort((a, b) => b.klp - a.klp);
    currentLevels.forEach((lvl, index) => lvl.rank = index + 1);

    populateFilters(currentLevels);
    renderFilteredLevels();
  })
  .catch(err => console.error('Error loading challenges.json:', err));

// Everything else (loadLevelsFromJSON, populateFilters, renderFilteredLevels, event listeners)
// stays IDENTICAL to script.js
