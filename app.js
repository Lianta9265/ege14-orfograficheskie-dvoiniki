(() => {
  'use strict';
  const blocks = window.EGE14_BLOCKS;
  let activeBlock = blocks[0];
  try { activeBlock = blocks.find(block => block.id === localStorage.getItem('ege14-active-block')) || activeBlock; } catch { /* Practice also works without storage. */ }
  let { exercises, version } = activeBlock;
  let KEY = 'ege14-doublewords-' + version;
  const ANSWER_FORMAT = 'writing-type-v1';
  const WRITING_OPTIONS = [
    { value: 'solid', label: 'Слитно' },
    { value: 'separate', label: 'Раздельно' },
    { value: 'hyphenated', label: 'Через дефис' }
  ];
  const writingLabel = type => WRITING_OPTIONS.find(option => option.value === type).label;
  const comparison = (chosen, correct) => `Вы выбрали: «${writingLabel(chosen)}». Правильно: «${writingLabel(correct)}».`;
  const $ = (id) => document.getElementById(id);
  const create = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const blank = () => ({ version, answerFormat: ANSWER_FORMAT, index: 0, answers: exercises.map(ex => ({ choices: ex.targets.map(() => null), checked: false })), errors: [] });
  function restoredChoice(value, target, legacy) {
    // All three types are always available by the teacher's release policy.
    // Historical per-card restrictions must not discard a saved distractor choice.
    if (!legacy) return WRITING_OPTIONS.some(option => option.value === value) ? value : null;
    // Only known legacy options are converted. Old words never reach the UI.
    if (!target.choices?.includes(value)) return null;
    if (value === target.answer) return target.writingType;
    return value.includes('-') ? 'hyphenated' : value.includes(' ') ? 'separate' : 'solid';
  }
  let storageAvailable = true;
  function load() {
    const clean = blank();
    try {
      if (activeBlock.progressMigration) EGE14_PROGRESS_MIGRATION.migrate(localStorage, activeBlock);
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s || s.version !== version) return clean;
      const legacy = s.answerFormat !== ANSWER_FORMAT;
      if (Number.isInteger(s.index) && s.index >= 0 && s.index < exercises.length) clean.index = s.index;
      exercises.forEach((ex, i) => {
        const a = s.answers?.[i];
        if (!a || !Array.isArray(a.choices)) return;
        clean.answers[i].choices = ex.targets.map((t,j) => restoredChoice(a.choices[j], t, legacy));
        clean.answers[i].checked = a.checked === true && clean.answers[i].choices.every(v => v !== null);
      });
      if (Array.isArray(s.errors)) clean.errors = s.errors.flatMap(e => {
        if (!e || !Number.isInteger(e.exercise) || !Number.isInteger(e.target)) return [];
        const target = exercises[e.exercise]?.targets[e.target];
        if (!target) return [];
        const chosen = restoredChoice(e.chosen, target, legacy);
        return chosen && chosen !== target.writingType ? [{exercise:e.exercise,target:e.target,chosen}] : [];
      });
    } catch { /* An old or malformed value must not prevent practice. */ }
    return clean;
  }
  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { storageAvailable = false; }
    $('storage-warning').hidden = storageAvailable;
  }
  function allCorrect(i) { const ex = exercises[i]; return state.answers[i].checked && ex.targets.every((t,j) => state.answers[i].choices[j] === t.writingType); }
  function displayAnswer(ex, j, value) {
    const before = ex.parts.slice(0, ex.parts.findIndex(p => typeof p === 'object' && p.target === j)).filter(p => typeof p === 'string').join('');
    return /^[\s«“"(]*$/u.test(before) ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }
  function renderSentence() {
    const ex = exercises[state.index], a = state.answers[state.index];
    const nodes = ex.parts.map(part => {
      if (typeof part === 'string') return document.createTextNode(part);
      const j = part.target, target = ex.targets[j];
      const value = a.checked ? displayAnswer(ex,j,target.answer) : target.raw;
      const mark = create('mark','target-token',value);
      if (a.checked) { mark.classList.add('revealed'); if (a.choices[j] !== target.writingType) mark.classList.add('target-wrong'); }
      return mark;
    });
    $('sentence').replaceChildren(...nodes);
  }
  function renderNavigation() {
    const done = state.answers.filter(a => a.checked).length;
    $('route-total').textContent = done + ' / ' + exercises.length;
    $('progress').max = exercises.length;
    $('progress').value = done;
    $('error-count').textContent = state.errors.length;
    $('exercise-nav').replaceChildren(...exercises.map((ex,i) => {
      const button = create('button','nav-item',String(i+1).padStart(2,'0'));
      button.type = 'button'; button.dataset.index = i;
      const status = state.answers[i].checked ? allCorrect(i) ? 'Без ошибок' : 'Есть ошибки' : 'Не проверен';
      button.setAttribute('aria-label',`Пример ${i+1}. ${status}`);
      if (state.answers[i].checked) button.classList.add(allCorrect(i) ? 'done' : 'revisit');
      if (i === state.index) { button.classList.add('current'); button.setAttribute('aria-current','step'); }
      button.addEventListener('click',() => navigate(i));
      return button;
    }));
    $('completion').hidden = done !== exercises.length;
  }
  function renderFeedback() {
    const ex = exercises[state.index], a = state.answers[state.index];
    $('feedback').hidden = !a.checked;
    $('explanations').replaceChildren();
    $('feedback-title').textContent = '';
    if (!a.checked) return;
    const ok = allCorrect(state.index);
    $('feedback').classList.toggle('has-errors',!ok);
    $('feedback-title').textContent = ok ? (ex.targets.length === 1 ? 'Написание верно' : 'Оба написания верны') : 'Разберём написание';
    ex.targets.forEach((t,j) => {
      const correct = a.choices[j] === t.writingType;
      const block = create('div','explanation' + (correct ? '' : ' wrong'));
      block.append(create('span','result-label',correct ? 'Верно' : 'Нужно исправить'),create('h4','',t.answer));
      if (!correct) block.append(create('p','',comparison(a.choices[j],t.writingType)));
      block.append(create('p','',t.explanation));
      $('explanations').append(block);
    });
  }
  function updateActions() {
    const a = state.answers[state.index], n = a.choices.filter(v => v !== null).length;
    const count = exercises[state.index].targets.length;
    $('check').disabled = n !== count || a.checked;
    $('selection-status').textContent = a.checked ? 'Ответ проверен' : n === count ? 'Можно проверить' : `Выбрано ${n} из ${count}`;
    $('previous').disabled = state.index === 0;
    $('next').disabled = state.index === exercises.length - 1;
  }
  function render() {
    const ex = exercises[state.index], a = state.answers[state.index];
    $('set-size').textContent = exercises.length;
    $('target-count-label').textContent = ex.targets.length === 1 ? 'Один выбор' : 'Два выбора';
    $('choices').classList.toggle('single-target', ex.targets.length === 1);
    $('exercise-title').textContent = activeBlock.title + ' · Пример ' + String(state.index+1).padStart(2,'0');
    document.title = 'Орфографические двойники · ' + activeBlock.title;
    $('position').textContent = String(state.index+1).padStart(2,'0') + ' / ' + exercises.length;
    renderSentence();
    $('choices').replaceChildren(...ex.targets.map((target,j) => {
      const field = create('fieldset'); field.dataset.target = j;
      const legend = create('legend'); legend.append(create('span','target-number',String(j+1).padStart(2,'0')),document.createTextNode(target.raw));field.append(legend);
      WRITING_OPTIONS.forEach(({value:choice,label:choiceLabel},k) => {
        const label = create('label','option');
        const input = create('input');input.type='radio';input.name='target-'+j;input.value=choice;input.id=`choice-${j}-${k}`;
        input.checked = a.choices[j] === choice;input.disabled = a.checked;
        if (a.checked && choice === target.writingType) label.classList.add('correct');
        if (a.checked && input.checked && choice !== target.writingType) label.classList.add('incorrect');
        input.addEventListener('change',() => { a.choices[j]=choice; save();renderSentence();updateActions(); });
        label.append(input,create('span','',choiceLabel));field.append(label);
      });
      return field;
    }));
    renderFeedback();renderNavigation();updateActions();
  }
  function navigate(i) { state.index=i;save();render();$('exercise-title').focus({preventScroll:true}); }
  $('answer-form').addEventListener('submit',(e) => {
    e.preventDefault(); const ex=exercises[state.index],a=state.answers[state.index];
    if (a.checked || a.choices.some(v => v === null)) return;
    a.checked=true;
    ex.targets.forEach((t,j) => { if (a.choices[j]!==t.writingType) state.errors.push({exercise:state.index,target:j,chosen:a.choices[j]}); });
    save();render();$('feedback-title').focus({preventScroll:true});
  });
  $('previous').addEventListener('click',() => { if(state.index>0) navigate(state.index-1); });
  $('next').addEventListener('click',() => { if(state.index<exercises.length-1) navigate(state.index+1); });
  $('retry').addEventListener('click',() => { state.answers[state.index]={choices:exercises[state.index].targets.map(() => null),checked:false};save();render();$('choices').querySelector('input').focus(); });
  function renderJournal() {
    $('journal-block').textContent = activeBlock.title;
    const content=$('journal-content');content.replaceChildren();
    if (!state.errors.length) { content.append(create('p','journal-empty','Здесь появятся написания, к которым стоит вернуться. Пока ошибок нет.'));return; }
    state.errors.slice().reverse().forEach(e => {
      const ex=exercises[e.exercise],t=ex.targets[e.target];
      const item=create('article','journal-item');
      item.append(create('small','',`Пример ${String(e.exercise+1).padStart(2,'0')} · ${ex.id}`));
      item.append(create('h3','',t.answer),create('p','',comparison(e.chosen,t.writingType)),create('p','',t.explanation));
      const button=create('button','text-button','Вернуться к примеру');
      button.addEventListener('click',() => { $('journal').close();navigate(e.exercise); });item.append(button);content.append(item);
    });
  }
  $('open-journal').addEventListener('click',() => { renderJournal();$('journal').showModal(); });
  $('close-journal').addEventListener('click',() => $('journal').close());
  $('reset').addEventListener('click',() => $('reset-dialog').showModal());
  $('cancel-reset').addEventListener('click',() => $('reset-dialog').close());
  $('confirm-reset').addEventListener('click',() => { state=blank();save();$('reset-dialog').close();render();$('exercise-title').focus(); });
  function selectBlock(block) {
    if (block.id === activeBlock.id) return;
    save(); activeBlock = block;
    ({ exercises, version } = activeBlock); KEY = 'ege14-doublewords-' + version;
    state = load();
    try { localStorage.setItem('ege14-active-block', activeBlock.id); } catch { storageAvailable = false; }
    save(); render(); renderBlocks();
  }
  function renderBlocks() {
    $('block-select').value = activeBlock.id;
  }
  $('block-select').replaceChildren(...blocks.map(block => {
    const option = create('option', '', block.title);
    option.value = block.id;
    return option;
  }));
  $('block-select').addEventListener('change', () => {
    const block = blocks.find(item => item.id === $('block-select').value);
    if (block) selectBlock(block);
  });
  renderBlocks();
  save();render();
})();
