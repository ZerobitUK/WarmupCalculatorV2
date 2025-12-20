(() => {
  const barbellWeight = 20; 
  const exercises = ['bench','deadlift','overhead','row','squat'];
  const plateWeights = ['25','20','15','10','5','2.5','1.25','1','0.75','0.5','0.25'];

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

  function debounce(fn, delay=200){
    let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), delay); };
  }

  const keyFor = (ex) => `exState_v3_${ex}`;

  function defaultState() {
    const plates = {};
    plateWeights.forEach(p => plates[p] = (parseFloat(p) >= 1.25 ? 1 : 0));
    return { lastWeight: 20, plates };
  }

  function loadState(ex){
    try{
      const raw = localStorage.getItem(keyFor(ex));
      if(!raw) return defaultState();
      return JSON.parse(raw);
    } catch { return defaultState(); }
  }

  const saveState = debounce((ex, state)=>{
    try{ localStorage.setItem(keyFor(ex), JSON.stringify(state)); }catch{}
  }, 150);

  function getPlateInventory(){
    const inputs = DOM.plateGrid.querySelectorAll('input[type="number"]');
    const inv = [];
    inputs.forEach(input => {
      const weight = parseFloat(input.dataset.weight);
      const pairs = parseInt(input.value, 10) || 0;
      if (pairs > 0) inv.push({ weight, pairs, weightG: Math.round(weight * 1000) });
    });
    return inv.sort((a,b) => b.weight - a.weight);
  }

  function smallestPairIncrement(inventory){
    if(!inventory.length) return 0.5;
    return 2 * Math.min(...inventory.map(p => p.weight));
  }

  function calculateOptimalWeight(targetWeight, inventory){
    if (targetWeight <= barbellWeight) {
      return { weight: barbellWeight, platePairs: [], exact: true, delta: 0 };
    }
    const toG = (x) => Math.round(x * 1000);
    let remainG = Math.max(0, toG((targetWeight - barbellWeight) / 2));
    const used = [];

    for(const p of inventory){
      let needed = Math.floor(remainG / p.weightG);
      let actual = Math.min(needed, p.pairs);
      if (actual > 0){
        used.push({ plate: p.weight, count: actual });
        remainG -= actual * p.weightG;
      }
    }

    const achieved = (toG(barbellWeight) + (toG((targetWeight - barbellWeight) / 2) - remainG) * 2) / 1000;
    return { 
      weight: achieved, 
      platePairs: used, 
      exact: remainG === 0, 
      delta: Number((achieved - targetWeight).toFixed(2)) 
    };
  }

  function renderPlateInputs() {
    DOM.plateGrid.innerHTML = '';
    plateWeights.forEach(w => {
      const container = document.createElement('div');
      container.className = 'plate-input-item';
      container.innerHTML = `
        <label>${w}kg</label>
        <input type="number" min="0" value="0" data-weight="${w}" aria-label="${w} kg pairs">
      `;
      DOM.plateGrid.appendChild(container);
    });
    // Re-attach listeners to new inputs
    DOM.plateGrid.querySelectorAll('input').forEach(i => i.addEventListener('input', trigger));
  }

  function applyStateToUI(state) {
    DOM.desiredWeightInput.value = (state.lastWeight || 20).toFixed(1);
    const inputs = DOM.plateGrid.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
      input.value = state.plates[input.dataset.weight] || 0;
    });
  }

  // --- Warmup Logic & Rendering (Unchanged logic, updated for inventory) ---
  function generateWarmupSets(workWeight, inventory){
    const ex = DOM.exerciseSelect.value;
    let config = [];
    let structure = '5x5';

    if (ex === 'squat') {
      config.push({ reps: '2x5', fixed: barbellWeight });
      if (workWeight > barbellWeight + 10) config.push({ reps: '1x5', pct: 0.40, min: barbellWeight + 5 });
      if (workWeight > barbellWeight + 20) config.push({ reps: '1x3', pct: 0.60, min: barbellWeight + 10 });
      if (workWeight > barbellWeight + 30) config.push({ reps: '1x2', pct: 0.80, min: barbellWeight + 15 });
    } else if (ex === 'bench') {
      config.push({ reps: '2x5', fixed: barbellWeight });
      if (workWeight > barbellWeight + 5)  config.push({ reps: '1x5', pct: 0.50, min: barbellWeight + 2.5 });
      if (workWeight > barbellWeight + 15) config.push({ reps: '1x3', pct: 0.70, min: barbellWeight + 5 });
      if (workWeight > barbellWeight + 25) config.push({ reps: '1x2', pct: 0.85, min: barbellWeight + 10 });
    } else if (ex === 'overhead') {
        config.push({ reps: '2x5', fixed: barbellWeight });
        if (workWeight > barbellWeight + 2.5) config.push({ reps: '1x5', pct: 0.55, min: barbellWeight + 1.25 });
        if (workWeight > barbellWeight + 10)  config.push({ reps: '1x3', pct: 0.70, min: barbellWeight + 2.5 });
        if (workWeight > barbellWeight + 20)  config.push({ reps: '1x2', pct: 0.85, min: barbellWeight + 5 });
    } else if (ex === 'row') {
        const first = Math.max(barbellWeight, workWeight * 0.4, workWeight > 40 ? 30 : barbellWeight);
        if (workWeight > barbellWeight && first < workWeight - 2.5) config.push({ reps: '1x5', fixed: first });
        if (workWeight > first + 10 && workWeight > 40) config.push({ reps: '1x3', pct: 0.70, min: first + 5 });
    } else if (ex === 'deadlift') {
        structure = '1x5';
        const first = Math.max(barbellWeight, workWeight * 0.4, workWeight > 60 ? 40 : barbellWeight);
        if (workWeight > barbellWeight && first < workWeight - 5) config.push({ reps: '1x5', fixed: first });
        if (workWeight > first + 15 && workWeight > 60) config.push({ reps: '1x3', pct: 0.65, min: first + 10 });
        if (workWeight > first + 30 && workWeight > 80) config.push({ reps: '1x2', pct: 0.80, min: first + 20 });
    }

    const sets = [];
    config.forEach(cfg => {
      let target = cfg.fixed || (workWeight * cfg.pct);
      if (cfg.min) target = Math.max(target, cfg.min);
      target = Math.min(Math.max(barbellWeight, target), workWeight - 0.5);
      const res = calculateOptimalWeight(target, inventory);
      if (res) sets.push({ set: cfg.reps, weight: res.weight, plates: res.platePairs, pct: Math.round((res.weight/workWeight)*100)+'%' });
    });

    const workRes = calculateOptimalWeight(workWeight, inventory);
    if (workRes) sets.push({ set: structure, weight: workRes.weight, plates: workRes.platePairs, pct: 'Work Set' });
    return sets;
  }

  function renderTable(sets){
    DOM.warmupRegion.innerHTML = '<h2>Warmup & Work Sets</h2>';
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Set</th><th>Weight (kg)</th><th>Plates (per side)</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');

    sets.forEach(s => {
      const tr = document.createElement('tr');
      if (s.pct === 'Work Set') tr.classList.add('work-set');
      tr.innerHTML = `
        <td>${s.set} (${s.pct})</td>
        <td>${s.weight.toFixed(1)}</td>
        <td><pre>${s.plates.length ? s.plates.map(p => `${p.plate}kg × ${p.count}`).join('\n') : 'Bar only'}</pre></td>
      `;
      tbody.appendChild(tr);
    });
    DOM.warmupRegion.appendChild(table);
  }

  function updateAll(){
    const current = parseFloat(DOM.desiredWeightInput.value);
    DOM.deloadDisplay.textContent = (current * 0.9 || 0).toFixed(1);

    if (isNaN(current) || current < barbellWeight) {
        DOM.statusEl.textContent = `Enter weight (min ${barbellWeight}kg).`;
        DOM.warmupRegion.innerHTML = ''; return;
    }

    const inventory = getPlateInventory();
    const inc = smallestPairIncrement(inventory);
    DOM.desiredWeightInput.step = inc;
    DOM.incBtn.textContent = `+${inc} kg`;
    DOM.decBtn.textContent = `-${inc} kg`;

    const workRes = calculateOptimalWeight(current, inventory);
    if (!workRes) { DOM.statusEl.textContent = 'No plates available.'; return; }

    DOM.statusEl.textContent = Math.abs(workRes.delta) > 0.001 
        ? `Achievable: ${workRes.weight.toFixed(1)}kg (${workRes.delta > 0 ? '+' : ''}${workRes.delta}kg from target).` 
        : '';

    renderTable(generateWarmupSets(current, inventory));
  }

  const trigger = () => {
    updateAll();
    const ex = DOM.exerciseSelect.value;
    const plates = {};
    DOM.plateGrid.querySelectorAll('input').forEach(i => plates[i.dataset.weight] = parseInt(i.value,10) || 0);
    saveState(ex, { lastWeight: parseFloat(DOM.desiredWeightInput.value), plates });
  };

  DOM.exerciseSelect.addEventListener('change', () => { applyStateToUI(loadState(DOM.exerciseSelect.value)); trigger(); });
  DOM.desiredWeightInput.addEventListener('input', debounce(trigger, 250));
  DOM.incBtn.addEventListener('click', () => { DOM.desiredWeightInput.value = (parseFloat(DOM.desiredWeightInput.value) + parseFloat(DOM.desiredWeightInput.step)).toFixed(1); trigger(); });
  DOM.decBtn.addEventListener('click', () => { DOM.desiredWeightInput.value = Math.max(barbellWeight, parseFloat(DOM.desiredWeightInput.value) - parseFloat(DOM.desiredWeightInput.step)).toFixed(1); trigger(); });
  DOM.selectAllBtn.addEventListener('click', () => { DOM.plateGrid.querySelectorAll('input').forEach(i => i.value = 1); trigger(); });
  DOM.resetPlatesBtn.addEventListener('click', () => { DOM.plateGrid.querySelectorAll('input').forEach(i => i.value = 0); trigger(); });

  (function init(){
    renderPlateInputs();
    applyStateToUI(loadState(DOM.exerciseSelect.value));
    trigger();
  })();
})();
