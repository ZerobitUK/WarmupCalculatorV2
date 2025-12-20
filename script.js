(() => {
  const barbellWeight = 20; // kg
  const exercises = ['bench','deadlift','overhead','row','squat'];
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

  // State Management (using a v3 key to distinguish from your old checkbox-based data)
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

  // Core Calculations
  function getInventory() {
    const inputs = DOM.plateGrid.querySelectorAll('input');
    const inv = [];
    inputs.forEach(i => {
      const qty = parseInt(i.value, 10) || 0;
      if (qty > 0) inv.push({ w: parseFloat(i.dataset.weight), qty, wG: Math.round(parseFloat(i.dataset.weight)*1000) });
    });
    return inv.sort((a,b) => b.w - a.w);
  }

  function calculateOptimalWeight(target, inventory) {
    if (target <= barbellWeight) return { weight: barbellWeight, plates: [], delta: 0 };
    
    let remainG = Math.round(((target - barbellWeight) / 2) * 1000);
    const used = [];

    for (const p of inventory) {
      const needed = Math.floor(remainG / p.wG);
      const actual = Math.min(needed, p.qty);
      if (actual > 0) {
        used.push({ weight: p.w, count: actual });
        remainG -= actual * p.wG;
      }
    }

    const achieved = (Math.round(barbellWeight * 1000) + (Math.round(((target - barbellWeight) / 2) * 1000) - remainG) * 2) / 1000;
    return { weight: achieved, plates: used, delta: Number((achieved - target).toFixed(2)) };
  }

  // StrongLifts 5x5 Warmup Generation
  function generateSets(workWeight, inventory) {
    const ex = DOM.exerciseSelect.value;
    let config = [];
    let structure = '5x5';

    if (ex === 'squat') {
      config.push({ r: '2x5', f: barbellWeight });
      if (workWeight > barbellWeight + 10) config.push({ r: '1x5', p: 0.4, m: barbellWeight + 5 });
      if (workWeight > barbellWeight + 20) config.push({ r: '1x3', p: 0.6, m: barbellWeight + 10 });
      if (workWeight > barbellWeight + 30) config.push({ r: '1x2', p: 0.8, m: barbellWeight + 15 });
    } else if (ex === 'bench') {
      config.push({ r: '2x5', f: barbellWeight });
      if (workWeight > barbellWeight + 5)  config.push({ r: '1x5', p: 0.5, m: barbellWeight + 2.5 });
      if (workWeight > barbellWeight + 15) config.push({ r: '1x3', p: 0.7, m: barbellWeight + 5 });
      if (workWeight > barbellWeight + 25) config.push({ r: '1x2', p: 0.85, m: barbellWeight + 10 });
    } else if (ex === 'overhead') {
      config.push({ r: '2x5', f: barbellWeight });
      if (workWeight > barbellWeight + 2.5) config.push({ r: '1x5', p: 0.55, m: barbellWeight + 1.25 });
      if (workWeight > barbellWeight + 10)  config.push({ r: '1x3', p: 0.7, m: barbellWeight + 2.5 });
      if (workWeight > barbellWeight + 20)  config.push({ r: '1x2', p: 0.85, m: barbellWeight + 5 });
    } else if (ex === 'row') {
      const start = Math.max(barbellWeight, workWeight * 0.4, workWeight > 40 ? 30 : barbellWeight);
      if (workWeight > barbellWeight && start < workWeight - 2.5) config.push({ r: '1x5', f: start });
      if (workWeight > start + 10 && workWeight > 40) config.push({ r: '1x3', p: 0.7, m: start + 5 });
    } else if (ex === 'deadlift') {
      structure = '1x5';
      const start = Math.max(barbellWeight, workWeight * 0.4, workWeight > 60 ? 40 : barbellWeight);
      if (workWeight > barbellWeight && start < workWeight - 5) config.push({ r: '1x5', f: start });
      if (workWeight > start + 15 && workWeight > 60) config.push({ r: '1x3', p: 0.65, m: start + 10 });
      if (workWeight > start + 30 && workWeight > 80) config.push({ r: '1x2', p: 0.8, m: start + 20 });
    }

    const sets = config.map(cfg => {
      let t = cfg.f || (workWeight * cfg.p);
      if (cfg.m) t = Math.max(t, cfg.m);
      t = Math.min(Math.max(barbellWeight, t), workWeight - 0.5);
      const res = calculateOptimalWeight(t, inventory);
      return res ? { set: cfg.r, w: res.weight, p: res.plates, pct: Math.round((res.weight/workWeight)*100)+'%' } : null;
    }).filter(x => x);

    const workRes = calculateOptimalWeight(workWeight, inventory);
    if (workRes) sets.push({ set: structure, w: workRes.weight, p: workRes.plates, pct: 'Work Set' });
    return sets;
  }

  // UI Updates
  function update() {
    const current = parseFloat(DOM.desiredWeightInput.value) || barbellWeight;
    DOM.deloadDisplay.textContent = (current * 0.9).toFixed(1);

    const inventory = getInventory();
    const minPlate = inventory.length ? Math.min(...inventory.map(i => i.w)) : 0.5;
    const step = minPlate * 2;

    DOM.desiredWeightInput.step = step;
    DOM.incBtn.textContent = `+${step} kg`;
    DOM.decBtn.textContent = `-${step} kg`;

    const sets = generateSets(current, inventory);
    render(sets, current);
    
    // Save State
    const plates = {};
    DOM.plateGrid.querySelectorAll('input').forEach(i => plates[i.dataset.weight] = parseInt(i.value,10) || 0);
    saveState(DOM.exerciseSelect.value, { lastWeight: current, plates });
  }

  function render(sets, workWeight) {
    DOM.warmupRegion.innerHTML = '<h2>Warmup & Work Sets</h2>';
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Set</th><th>Weight</th><th>Plates (per side)</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');

    sets.forEach(s => {
      const tr = document.createElement('tr');
      if (s.pct === 'Work Set') tr.classList.add('work-set');
      tr.innerHTML = `
        <td>${s.set} (${s.pct})</td>
        <td>${s.w.toFixed(1)}kg</td>
        <td><pre>${s.p.length ? s.p.map(p => `${p.weight}kg × ${p.count}`).join('\n') : 'Bar only'}</pre></td>
      `;
      tbody.appendChild(tr);
    });
    DOM.warmupRegion.appendChild(table);
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
  DOM.incBtn.addEventListener('click', () => { DOM.desiredWeightInput.value = (parseFloat(DOM.desiredWeightInput.value) + parseFloat(DOM.desiredWeightInput.step)).toFixed(1); update(); });
  DOM.decBtn.addEventListener('click', () => { DOM.desiredWeightInput.value = Math.max(barbellWeight, parseFloat(DOM.desiredWeightInput.value) - parseFloat(DOM.desiredWeightInput.step)).toFixed(1); update(); });
  DOM.selectAllBtn.addEventListener('click', () => { DOM.plateGrid.querySelectorAll('input').forEach(i => i.value = 1); update(); });
  DOM.resetPlatesBtn.addEventListener('click', () => { DOM.plateGrid.querySelectorAll('input').forEach(i => i.value = 0); update(); });

  initUI();
})();
