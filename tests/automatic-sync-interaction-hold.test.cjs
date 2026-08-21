const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');
const hold = read('src/lib/automaticSyncInteractionHold.js');
const sync = read('src/store/slices/useSyncSlice.js');
const add = read('src/components/AddTransModal.js');
const tracker = read('src/components/NewItemModal.js');
const lab = read('src/screens/TrackersLabScreen.js');

assert(hold.includes('activeHolds = new Map()'));
assert(sync.includes('isAutomaticSyncInteractionHeld()'));
assert(sync.includes("'editor_closed'"));
assert(add.includes("useAutomaticSyncInteractionHold(visible, 'transaction_editor')"));
assert(tracker.includes("useAutomaticSyncInteractionHold(visible, 'new_tracker_editor')"));
assert(lab.includes("useAutomaticSyncInteractionHold(!!editTrackerDraft || !!editPaymentDraft, 'tracker_editor')"));
console.log('Automatic sync interaction hold contract passed.');
