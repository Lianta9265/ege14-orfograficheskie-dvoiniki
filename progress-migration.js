/* Only blocks with explicit migration metadata use this path. */
(() => {
  'use strict';
  function migrate(storage, block) {
    const config = block.progressMigration;
    if (!config) return null;
    const key = 'ege14-doublewords-' + block.version;
    // An existing destination, including a reset, must never be re-imported.
    if (storage.getItem(key) !== null) return null;
    const oldKey = 'ege14-doublewords-' + config.fromVersion;
    const raw = storage.getItem(oldKey);
    if (raw === null) return null;
    const old = JSON.parse(raw);
    if (!old || old.version !== config.fromVersion) return null;
    const oldIds = config.oldExerciseIds;
    const newIndex = new Map(block.exercises.map((ex, i) => [ex.id, i]));
    const removed = new Set(oldIds.filter(id => !newIndex.has(id)));
    const answersById = Object.fromEntries(oldIds.map((id, i) => [id, old.answers?.[i]]));
    const errors = [], archivedErrors = [];
    for (const error of Array.isArray(old.errors) ? old.errors : []) {
      if (!error || !Number.isInteger(error.exercise)) continue;
      const id = oldIds[error.exercise];
      if (newIndex.has(id)) errors.push({...error, exercise: newIndex.get(id)});
      else if (removed.has(id)) archivedErrors.push({...error, cardId: id});
    }
    let index = Number.isInteger(old.index) ? newIndex.get(oldIds[old.index]) : undefined;
    if (index === undefined) {
      // If the current card was removed, continue at the next retained card.
      const next = oldIds.slice(Math.max(0, old.index || 0)).find(id => newIndex.has(id));
      index = next === undefined ? 0 : newIndex.get(next);
    }
    const migrated = {
      ...old, version: block.version, index,
      answers: block.exercises.map(ex => answersById[ex.id] || {
        choices: ex.targets.map(() => null), checked: false
      }),
      errors
    };
    const backupKey = oldKey + '-backup-before-thematic-v2';
    if (storage.getItem(backupKey) === null) storage.setItem(backupKey, raw);
    if (storage.getItem(config.archiveKey) === null) {
      storage.setItem(config.archiveKey, JSON.stringify({
        schemaVersion: 1, sourceKey: oldKey, answerFormat: old.answerFormat,
        originalIndex: old.index, originalCardId: oldIds[old.index] || null,
        answersById: Object.fromEntries([...removed].map(id => [id, answersById[id] || null])),
        errors: archivedErrors
      }));
    }
    // Commit last; a failed archive/backup write leaves the source intact.
    storage.setItem(key, JSON.stringify(migrated));
    return migrated;
  }
  globalThis.EGE14_PROGRESS_MIGRATION = {migrate};
})();
