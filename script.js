(() => {
  // ---------- Constants ----------
  const barbellWeight = 20; // kg
  const exercises = ['bench','deadlift','overhead','row','squat'];
  const defaultPlates = ['25','20','15','10','5','2.5','1.25']; // initially selected

  // ---------- DOM Elements (Grouped for clarity) ----------
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
    warmupRegion: document.getElementById('warmupRegion'),
    setCount: document.getElementById('setCount'),
    increaseSetBtn: document.getElementById('increaseSet'),
    decreaseSetBtn: document.getElementById('decreaseSet'),
    timerDisplay: document.getElementById('timerDisplay'),
    startTimerBtn: document.getElementById('startTimer'),
    stopTimerBtn: document.getElementById('stopTimer'),
    timerMinutes: document.getElementById('timerMinutes'),
    timerSeconds: document.getElementById('timerSeconds')
  };

  // Utility: debounce
  function debounce(fn, delay=200){
    let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), delay); };
  }

  // ---------- Storage (one JSON blob per exercise) ----------
  const keyFor = (ex) => `exState_${ex}`;
  function defaultState() {
    const plates = {};
    ['25','20','15','10','5','2.5','1.25','1','0.75','0.5','0.25'].forEach(p=>{
      plates[p] = defaultPlates.includes(p);
    });
    return { lastWeight: 20, plates, currentSet: 0, timerMinutes: 3, timerSeconds: 0 };
  }
  function loadState(ex){
    try{
      const raw = localStorage.getItem(keyFor(ex));
      if(!raw) return defaultState();
      const obj = JSON.parse(raw);
      // backward-safe defaults
      if(typeof obj.lastWeight !== 'number') obj.lastWeight = 20;
      if(!obj.plates) obj.plates = defaultState().plates;
      if(typeof obj.currentSet !== 'number') obj.currentSet = 0;
      if(typeof obj.timerMinutes !== 'number') obj.timerMinutes = 3;
      if(typeof obj.timerSeconds !== 'number') obj.timerSeconds = 0;
      return obj;
    }catch{ return defaultState(); }
  }
  const saveState = debounce((ex, state)=>{
    try{ localStorage.setItem(keyFor(ex), JSON.stringify(state)); }catch{}
  }, 150);

  // ---------- Helpers ----------
  function getSelectedPlates(){
    const boxes = DOM.plateGrid.querySelectorAll('input[type="checkbox"]');
    const arr = [];
    boxes.forEach(b => { if(b.checked) arr.push(parseFloat(b.value)); });
    // sort desc for greedy
    arr.sort((a,b)=>b-a);
    return arr;
  }

  function smallestPairIncrement(plates){
    if(!plates.length) return 0;
    const minPlate = Math.min(...plates);
    return 2 * minPlate; // total added to bar from one pair
  }

  function snapTotalToIncrement(total, increment){
    if (increment <= 0) return total;
    // total must be bar + k*increment
    const k = Math.round((total - barbellWeight) / increment);
    return Math.max(barbellWeight, barbellWeight + k * increment);
  }

  function kg(n){ return Number(n.toFixed(2)); }

  // Greedy plate computation in integer grams to avoid FP errors.
  function calculateOptimalWeight(targetWeight, plates){
    if (targetWeight <= barbellWeight) {
      return { weight: barbellWeight, platePairs: [], exact: (targetWeight === barbellWeight), delta: kg(barbellWeight - targetWeight) };
    }
    if (!plates.length) return null;

    const toG = (x)=> Math.round(x*1000);
    const targetPerSideG = Math.max(0, toG((targetWeight - barbellWeight)/2));
    let remainG = targetPerSideG;
    const plateGs = plates.map(p => toG(p));

    const used = [];
    for(const pG of plateGs){
      let count = Math.floor(remainG / pG);
      if (count > 0){
        used.push({ plate: pG, count });
        remainG -= count * pG;
      }
    }

    const achievedPerSideG = targetPerSideG - remainG;
    const totalG = toG(barbellWeight) + achievedPerSideG*2;
    const achieved = totalG/1000;

    const pairs = used.map(u => ({ plate: kg(u.plate/1000), count: u.count }));
    const exact = remainG === 0;
    const delta = kg(achieved - targetWeight);
    return { weight: kg(achieved), platePairs: pairs, exact, delta };
  }

  function platePairsToLines(pairs){
    if (!pairs || pairs.length===0) return 'Bar only';
    return pairs.map(p => `${p.plate}kg × ${p.count}`).join('\n');
  }

  function setStatus(msg){ DOM.statusEl.textContent = msg || ''; }

  // ---------- StrongLifts Warmup Logic ----------
  function generateWarmupSets(workWeight, plates){
    const selectedExercise = DOM.exerciseSelect.value;
    let warmupConfig = [];
    let workSetStructure = '5x5';
    workWeight = Math.max(barbellWeight, workWeight);

    if (selectedExercise === 'squat') {
      warmupConfig.push({ reps: '2x5', fixedWeight: barbellWeight });
      if (workWeight > barbellWeight + 10) warmupConfig.push({ reps: '1x5', percentage: 0.40, min: barbellWeight + 5 });
      if (workWeight > barbellWeight + 20) warmupConfig.push({ reps: '1x3', percentage: 0.60, min: barbellWeight + 10 });
      if (workWeight > barbellWeight + 30) warmupConfig.push({ reps: '1x2', percentage: 0.80, min: barbellWeight + 15 });
    } else if (selectedExercise === 'bench') {
      warmupConfig.push({ reps: '2x5', fixedWeight: barbellWeight });
      if (workWeight > barbellWeight + 5)  warmupConfig.push({ reps: '1x5', percentage: 0.50, min: barbellWeight + 2.5 });
      if (workWeight > barbellWeight + 15) warmupConfig.push({ reps: '1x3', percentage: 0.70, min: barbellWeight + 5 });
      if (workWeight > barbellWeight + 25) warmupConfig.push({ reps: '1x2', percentage: 0.85, min: barbellWeight + 10 });
    } else if (selectedExercise === 'overhead') {
      warmupConfig.push({ reps: '2x5', fixedWeight: barbellWeight });
      if (workWeight > barbellWeight + 2.5) warmupConfig.push({ reps: '1x5', percentage: 0.55, min: barbellWeight + 1.25 });
      if (workWeight > barbellWeight + 10)  warmupConfig.push({ reps: '1x3', percentage: 0.70, min: barbellWeight + 2.5 });
      if (workWeight > barbellWeight + 20)  warmupConfig.push({ reps: '1x2', percentage: 0.85, min: barbellWeight + 5 });
    } else if (selectedExercise === 'row') {
      const firstWarm = Math.max(barbellWeight, workWeight * 0.4, workWeight > 40 ? 30 : barbellWeight);
      if (workWeight > barbellWeight) {
        if (firstWarm < workWeight - 2.5) warmupConfig.push({ reps: '1x5', fixedWeight: firstWarm });
      }
      if (workWeight > firstWarm + 10 && workWeight > 40) warmupConfig.push({ reps: '1x3', percentage: 0.70, min: firstWarm + 5 });
    } else if (selectedExercise === 'deadlift') {
      workSetStructure = '1x5';
      const firstWarm = Math.max(barbellWeight, workWeight * 0.4, workWeight > 60 ? 40 : barbellWeight);
      if (workWeight > barbellWeight) {
        if (firstWarm < workWeight - 5) warmupConfig.push({ reps: '1x5', fixedWeight: firstWarm });
      }
      if (workWeight > firstWarm + 15 && workWeight > 60) warmupConfig.push({ reps: '1x3', percentage: 0.65, min: firstWarm + 10 });
      if (workWeight > firstWarm + 30 && workWeight > 80) warmupConfig.push({ reps: '1x2', percentage: 0.80, min: firstWarm + 20 });
    }

    const sets = [];
    warmupConfig.forEach(cfg=>{
      let target = (cfg.fixedWeight !== undefined) ? cfg.fixedWeight : (workWeight * cfg.percentage);
      if (cfg.min !== undefined) target = Math.max(target, cfg.min);
      target = Math.max(barbellWeight, target);
      target = Math.min(target, workWeight - 0.5);
      if (target < barbellWeight + 0.1 && cfg.fixedWeight === undefined) return;

      const res = calculateOptimalWeight(target, plates);
      if (res){
        sets.push({
          set: cfg.reps,
          weight: res.weight,
          plates: res.platePairs,
          pct: workWeight > 0 ? Math.round((res.weight / workWeight) * 100) + '%' : ''
        });
      }
    });

    const workRes = calculateOptimalWeight(workWeight, plates);
    if (workRes){
      sets.push({
        set: workSetStructure,
        weight: workRes.weight,
        plates: workRes.platePairs,
        pct: 'Work Set'
      });
    }

    const finalSets = [];
    for (let i=0; i<sets.length; i++){
      const curr = sets[i];
      const prev = finalSets[finalSets.length-1];
      if (prev && prev.weight === curr.weight && prev.set === curr.set) continue;
      if (curr.pct === 'Work Set' && prev && prev.weight === curr.weight && prev.pct !== 'Work Set'){
        finalSets.pop();
      }
      finalSets.push(curr);
    }

    if (workWeight === barbellWeight && finalSets.length > 1){
      return [ finalSets[ finalSets.length - 1 ] ];
    }
    return finalSets;
  }

  // ---------- Rendering ----------
  function renderTable(sets, workWeight){
    DOM.warmupRegion.textContent = ''; // clear
    const h2 = document.createElement('h2');
    h2.textContent = 'Warmup & Work Sets';
    DOM.warmupRegion.appendChild(h2);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const thr = document.createElement('tr');
    ['Set','Weight (kg)','Plates (per side)'].forEach(t=>{
      const th = document.createElement('th'); th.textContent = t; thr.appendChild(th);
    });
    thead.appendChild(thr); table.appendChild(thead);

    const tbody = document.createElement('tbody');

    sets.forEach(s=>{
      const tr = document.createElement('tr');
      if (s.pct === 'Work Set') {
        tr.classList.add('work-set');
      }

      const tdSet = document.createElement('td');
      const tdW = document.createElement('td');
      const tdPlates = document.createElement('td');

      tdSet.textContent = s.set + (s.pct ? ` (${s.pct})` : '');
      tdW.textContent = s.weight.toFixed(1);

      const pre = document.createElement('pre');
      pre.textContent = platePairsToLines(s.plates);
      tdPlates.appendChild(pre);

      tr.appendChild(tdSet); tr.appendChild(tdW); tr.appendChild(tdPlates);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    DOM.warmupRegion.appendChild(table);
  }

  // ---------- Updates ----------
  function updateDeload(){
    const desired = parseFloat(DOM.desiredWeightInput.value) || 0;
    const deload = Math.max(0, desired * 0.9);
    DOM.deloadDisplay.textContent = deload.toFixed(1);
  }
  
  function enforcePlateAndStep(){
    const plates = getSelectedPlates();
    const inc = smallestPairIncrement(plates) || 0.5; // fallback
    const incFormatted = parseFloat(inc.toFixed(2)); // Format for display
    
    DOM.desiredWeightInput.step = inc.toString();
    
    DOM.decBtn.textContent = `−${incFormatted} kg`;
    DOM.decBtn.setAttribute('aria-label', `Decrease weight by ${incFormatted} kilograms`);
    DOM.incBtn.textContent = `+${incFormatted} kg`;
    DOM.incBtn.setAttribute('aria-label', `Increase weight by ${incFormatted} kilograms`);

    if (DOM.desiredWeightInput.value.trim() === '') return;

    let dw = parseFloat(DOM.desiredWeightInput.value) || barbellWeight;
    const snapped = snapTotalToIncrement(dw, inc);
    if (Math.abs(snapped - dw) > 1e-9){
      DOM.desiredWeightInput.value = snapped.toFixed(1);
      DOM.desiredWeightInput.classList.add('snapped');
      setTimeout(() => {
        DOM.desiredWeightInput.classList.remove('snapped');
      }, 500);
    }
  }

  function updateAll(){
    updateDeload();
    const current = parseFloat(DOM.desiredWeightInput.value);
    
    if (isNaN(current) || DOM.desiredWeightInput.value.trim() === '') {
        setStatus(`Enter a valid work set weight (at least ${barbellWeight} kg).`);
        DOM.warmupRegion.innerHTML = '';
        return;
    }
    if (current < barbellWeight) {
        setStatus(`Weight must be at least ${barbellWeight} kg (the barbell weight).`);
        DOM.warmupRegion.innerHTML = '';
        return;
    }

    const plates = getSelectedPlates();
    if (!plates.length && current > barbellWeight){
      setStatus('Please select available plates to calculate loads.');
      DOM.warmupRegion.textContent = '';
      return;
    }

    const workRes = calculateOptimalWeight(current, plates);
    if (workRes === null){
      setStatus('Unable to compute load with the selected plates.');
      DOM.warmupRegion.textContent = '';
      return;
    }
    const delta = workRes.delta;
    if (Math.abs(delta) > 0.001){
      const dir = delta > 0 ? '+' : '−';
      setStatus(`Achievable work set: ${workRes.weight.toFixed(1)} kg (${dir}${Math.abs(delta).toFixed(1)} kg from target).`);
    } else {
      setStatus('');
    }

    const sets = generateWarmupSets(current, plates);
    if (!sets.length){
      DOM.warmupRegion.textContent = '';
      setStatus('No warmup sets for this configuration.');
      return;
    }
    renderTable(sets, current);
  }

  const trigger = () => { enforcePlateAndStep(); updateAll(); saveCurrentExerciseState(); };

  // ---------- State wiring ----------
  function readPlateCheckboxesToObject(){
    const obj = {};
    DOM.plateGrid.querySelectorAll('input[type="checkbox"]').forEach(b=>{
      obj[b.value] = !!b.checked;
    });
    return obj;
  }

  function applyPlatesFromObject(platesObj){
    DOM.plateGrid.querySelectorAll('input[type="checkbox"]').forEach(b=>{
      b.checked = !!platesObj[b.value];
    });
  }

  function loadExerciseState(){
    const ex = DOM.exerciseSelect.value;
    const st = loadState(ex);
    DOM.desiredWeightInput.value = Number(st.lastWeight || 20).toFixed(1);
    applyPlatesFromObject(st.plates || defaultState().plates);
    DOM.setCount.textContent = st.currentSet || 0;
    DOM.timerMinutes.value = st.timerMinutes;
    DOM.timerSeconds.value = st.timerSeconds;
    updateTimerDisplay();
  }

  function saveCurrentExerciseState(){
    const ex = DOM.exerciseSelect.value;
    const st = {
      lastWeight: parseFloat(DOM.desiredWeightInput.value) || 20,
      plates: readPlateCheckboxesToObject(),
      currentSet: parseInt(DOM.setCount.textContent, 10) || 0,
      timerMinutes: parseInt(DOM.timerMinutes.value, 10) || 3,
      timerSeconds: parseInt(DOM.timerSeconds.value, 10) || 0
    };
    saveState(ex, st);
  }

  // ---------- Events ----------
  DOM.exerciseSelect.addEventListener('change', () => { loadExerciseState(); trigger(); });
  
  DOM.desiredWeightInput.addEventListener('input', debounce(() => {
    updateAll();
    saveCurrentExerciseState();
  }, 250));
  
  DOM.desiredWeightInput.addEventListener('change', () => {
    enforcePlateAndStep();
    updateAll();
    saveCurrentExerciseState();
  });

  DOM.incBtn.addEventListener('click', () => {
    const inc = parseFloat(DOM.desiredWeightInput.step) || 0.5;
    let val = parseFloat(DOM.desiredWeightInput.value) || barbellWeight;
    val += inc;
    DOM.desiredWeightInput.value = val.toFixed(1);
    trigger();
  });
  DOM.decBtn.addEventListener('click', () => {
    const inc = parseFloat(DOM.desiredWeightInput.step) || 0.5;
    let val = parseFloat(DOM.desiredWeightInput.value) || barbellWeight;
    val = Math.max(barbellWeight, val - inc);
    DOM.desiredWeightInput.value = val.toFixed(1);
    trigger();
  });

  DOM.plateGrid.querySelectorAll('input[type="checkbox"]').forEach(b=>{
    b.addEventListener('change', trigger);
  });
  DOM.selectAllBtn.addEventListener('click', ()=>{
    DOM.plateGrid.querySelectorAll('input[type="checkbox"]').forEach(b=> b.checked = true);
    trigger();
  });
  DOM.resetPlatesBtn.addEventListener('click', ()=>{
    DOM.plateGrid.querySelectorAll('input[type="checkbox"]').forEach(b=> b.checked = false);
    trigger();
  });
  
  // ---------- Set Counter and Timer Logic ----------
  let currentSet = 0;
  
  function updateSetCounter(value) {
    currentSet = Math.max(0, value);
    DOM.setCount.textContent = currentSet;
    saveCurrentExerciseState();
  }

  DOM.increaseSetBtn.addEventListener('click', () => updateSetCounter(currentSet + 1));
  DOM.decreaseSetBtn.addEventListener('click', () => updateSetCounter(currentSet - 1));

  let timerInterval;

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }
  
  function updateTimerDisplay() {
    const minutes = parseInt(DOM.timerMinutes.value, 10) || 0;
    const seconds = parseInt(DOM.timerSeconds.value, 10) || 0;
    DOM.timerDisplay.textContent = formatTime(minutes * 60 + seconds);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    updateTimerDisplay();
    DOM.timerDisplay.classList.remove('timer-active');
  }

  // UPDATED: Now uses the service worker
  async function showNotification() {
    if (Notification.permission !== 'granted' || !navigator.serviceWorker) {
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Rest period over!', {
        body: 'Time to start your next set.',
        icon: 'favicon.ico' // Note: This file doesn't exist yet
      });
    } catch (err) {
      console.error('Notification error:', err);
    }
  }

  DOM.startTimerBtn.addEventListener('click', () => {
    if (timerInterval) return; 

    let minutes = parseInt(DOM.timerMinutes.value, 10) || 0;
    let seconds = parseInt(DOM.timerSeconds.value, 10) || 0;
    let totalSeconds = minutes * 60 + seconds;

    if (totalSeconds <= 0) return;

    DOM.timerDisplay.classList.add('timer-active');
    
    timerInterval = setInterval(() => {
      totalSeconds--;
      DOM.timerDisplay.textContent = formatTime(totalSeconds);

      if (totalSeconds <= 0) {
        stopTimer();
        showNotification();
      }
    }, 1000);
  });
  
  DOM.timerMinutes.addEventListener('change', () => {
    updateTimerDisplay();
    saveCurrentExerciseState();
  });
  DOM.timerSeconds.addEventListener('change', () => {
    updateTimerDisplay();
    saveCurrentExerciseState();
  });

  DOM.stopTimerBtn.addEventListener('click', stopTimer);

  // UPDATED: Now part of the init() function
  async function setupNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('Notifications or Service Workers not supported.');
      return;
    }
    
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (err) {
      console.error('Service Worker registration failed:', err);
    }
    
    if (Notification.permission !== 'denied') {
      await Notification.requestPermission();
    }
  }


  // ---------- Init ----------
  (function init(){
    exercises.forEach(ex=>{
      if (!localStorage.getItem(keyFor(ex))){
        saveState(ex, defaultState());
      }
    });
    loadExerciseState();
    updateSetCounter(parseInt(DOM.setCount.textContent, 10));
    setupNotifications(); // Replaces the old requestNotificationPermission()
    trigger();
  })();
})();
