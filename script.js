(() => {
  const barbellWeight = 20; 
  const weights = ['25','20','15','10','5','2.5','1.25','1','0.75','0.5','0.25'];

  const DOM = {
    exerciseSelect: document.getElementById('exercise'),
    desiredWeightInput: document.getElementById('desiredWeight'),
    incBtn: document.getElementById('increaseWeight'),
    decBtn: document.getElementById('decreaseWeight'),
    plateGrid: document.getElementById('plateGrid'),
    selectAllBtn: document.getElementById('selectAllPlates'),
    resetPlatesBtn: document.getElementById('resetPlates'),
    deloadDisplay: document.getElementById('minus10PercentWeight'),
    statusEl: document.getElementById('status'),
    warmupRegion: document.getElementById('warmupRegion')
  };

  const debounce = (fn, delay=200) => {
    let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), delay); };
  };

  const keyFor = (ex) => `exState_v3_${ex}`;
  function defaultState() {
    const plates = {};
    weights.forEach(w => plates[w] = (parseFloat(w) >= 1.25 ? 1 : 0));
    return { lastWeight: 20, plates };
  }

  function loadState(ex) {
    try {
      const raw = localStorage.getItem(keyFor(ex));
      return raw ? JSON.parse(raw) : defaultState();
    } catch { return defaultState(); }
  }

  const saveState = debounce((ex, state) => {
    try { localStorage.setItem(keyFor(ex), JSON.stringify(state)); } catch {}
  }, 150);

  function getInventory() {
    const inputs = DOM.plateGrid.querySelectorAll('input');
    const inv = [];
    inputs.forEach(i => {
      const qty = parseInt(i.value, 10) || 0;
      if (qty > 0) inv.push({ w: parseFloat(i.dataset.weight), qty, wG: Math.round(parseFloat(i.dataset.weight)*1000) });
    });
    return inv.sort((a,b) => b.w - a.w);
  }

  /**
   * Minimal Change Logic:
   * Tries to reach targetG by adding to currentPlateCounts.
   * If impossible (e.g., target is lighter), it resets and does a greedy calculation.
   */
  function calculateMinimalChange(target, inventory, currentPlateCounts) {
    const targetG = Math.round(((target - barbellWeight) / 2) * 1000);
    let currentG = 0;
    Object.entries(currentPlateCounts).forEach(([w, count]) => currentG += Math.round(parseFloat(w) * 1000) * count);

    let workingCounts = { ...currentPlateCounts };
    let additions = {};

    if (targetG < currentG) {
        // Reset if we need to take weight OFF (rare in warmup sequence)
        workingCounts = {};
        currentG = 0;
    }

    let remainG = targetG - currentG;
    
    // Greedily add plates to fill the gap
    for (const p of inventory) {
        const alreadyUsed = workingCounts[p.w] || 0;
        const available = p.qty - alreadyUsed;
        if (available > 0) {
            const needed = Math.floor(remainG / p.wG);
            const toAdd = Math.min(needed, available);
            if (toAdd > 0) {
                workingCounts[p.w] = alreadyUsed + toAdd;
                additions[p.w] = toAdd;
                remainG -= toAdd * p.wG;
            }
        }
    }

    const achieved = (Math.round(barbellWeight * 1000) + (targetG - remainG) * 2) / 1000;
    return { weight: achieved, totalPlates: workingCounts, additions };
  }

  function generateSets(workWeight, inventory) {
    const ex = DOM.exerciseSelect.value;
    let config = [];
    let structure = '5x5';

    // Warmup configurations based on exercise
    if (ex === 'squat') {
      config.push({ r: '2x5', f: 20 });
      if (workWeight > 30) config.push({ r: '1x5', p: 0.4, m: 25 });
      if (workWeight > 40) config.push({ r: '1x3', p: 0.6, m: 30 });
      if (workWeight > 50) config.push({ r: '1x2', p: 0.8, m: 35 });
    } else if (ex === 'bench' || ex === 'overhead') {
      config.push({ r: '2x5', f: 20 });
      if (workWeight > 25) config.push({ r: '1x5', p: 0.5, m: 22.5 });
      if (workWeight > 35) config.push({ r: '1x3', p: 0.7, m: 25 });
      if (workWeight > 45) config.push({ r: '1x2', p: 0.85, m: 30 });
    } else if (ex === 'row') {
      const start = Math.max(20, workWeight * 0.4, workWeight > 40 ? 30 : 20);
      if (workWeight > 20) config.push({ r: '1x5', f: start });
      if (workWeight > start + 10) config.push({ r: '1x3', p: 0.7, m: start + 5 });
    } else if (ex === 'deadlift') {
      structure = '1x5';
      const start = Math.max(20, workWeight * 0.4, workWeight > 60 ? 40 : 20);
      if (workWeight > 20) config.push({ r: '1x5', f: start });
      if (workWeight > start + 15) config.push({ r: '1x3', p: 0.65, m: start + 10 });
    }

    let results = [];
    let currentBar = {}; // Track what's on the bar

    config.forEach(cfg => {
        let t = cfg.f || (workWeight * cfg.p);
        if (cfg.m) t = Math.max(t, cfg.m);
        t = Math.min(t, workWeight - 0.5);
        const res = calculateMinimalChange(t, inventory, currentBar);
        currentBar = res.totalPlates;
        results.push({ ...res, set: cfg.r, pct: Math.round((res.weight/workWeight)*100)+'%' });
    });

    const workRes = calculateMinimalChange(workWeight, inventory, currentBar);
    results.push({ ...workRes, set: structure, pct: 'Work Set' });
    
    return results;
  }

  function render(sets) {
    DOM.warmupRegion.innerHTML = '<h2>Warmup & Work Sets</h2>';
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Set</th><th>Load</th><th>Add to Bar</th><th>Total per Side</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');

    sets.forEach(s => {
      const tr = document.createElement('tr');
      if (s.pct === 'Work Set') tr.classList.add('work-set');
      
      const adds = Object.entries(s.additions).map(([w, c]) => `+ ${w}kg × ${c}`).join('\n') || 'No change';
      const total = Object.entries(s.totalPlates).filter(([w, c]) => c > 0).map(([w, c]) => `${w}kg × ${c}`).join('\n') || 'Bar only';

      tr.innerHTML = `
        <td>${s.set}<br><small>(${s.pct})</small></td>
        <td><strong>${s.weight.toFixed(1)}kg</strong></td>
        <td><pre class="additions">${adds}</pre></td>
        <td><pre class="total-plates">${total}</pre></td>
      `;
      tbody.appendChild(tr);
    });
    DOM.warmupRegion.appendChild(table);
  }

  function update() {
    const current = parseFloat(DOM.desiredWeightInput.value) || 20;
    DOM.deloadDisplay.textContent = (current * 0.9).toFixed(1);
    const inventory = getInventory();
    
    const sets = generateSets(current, inventory);
    render(sets);

    const plates = {};
    DOM.plateGrid.querySelectorAll('input').forEach(i => plates[i.dataset.weight] = parseInt(i.value,10) || 0);
    saveState(DOM.exerciseSelect.value, { lastWeight: current, plates });
  }

  function initUI() {
    weights.forEach(w => {
      const div = document.createElement('div');
      div.className = 'plate-input-item';
      div.innerHTML = `<label>${w}kg</label><input type="number" min="0" data-weight="${w}" value="0">`;
      DOM.plateGrid.appendChild(div);
      div.querySelector('input').addEventListener('input', update);
    });
    const state = loadState(DOM.exerciseSelect.value);
    DOM.desiredWeightInput.value = state.lastWeight.toFixed(1);
    DOM.plateGrid.querySelectorAll('input').forEach(i => i.value = state.plates[i.dataset.weight] || 0);
    update();
  }

  DOM.exerciseSelect.addEventListener('change', () => {
    const state = loadState(DOM.exerciseSelect.value);
    DOM.desiredWeightInput.value = state.lastWeight.toFixed(1);
    DOM.plateGrid.querySelectorAll('input').forEach(i => i.value = state.plates[i.dataset.weight] || 0);
    update();
  });
  DOM.desiredWeightInput.addEventListener('input', debounce(update));
  DOM.incBtn.addEventListener('click', () => { DOM.desiredWeightInput.value = (parseFloat(DOM.desiredWeightInput.value) + 2.5).toFixed(1); update(); });
  DOM.decBtn.addEventListener('click', () => { DOM.desiredWeightInput.value = Math.max(20, parseFloat(DOM.desiredWeightInput.value) - 2.5).toFixed(1); update(); });
  DOM.selectAllBtn.addEventListener('click', () => { DOM.plateGrid.querySelectorAll('input').forEach(i => i.value = 1); update(); });
  DOM.resetPlatesBtn.addEventListener('click', () => { DOM.plateGrid.querySelectorAll('input').forEach(i => i.value = 0); update(); });

  initUI();
})();
