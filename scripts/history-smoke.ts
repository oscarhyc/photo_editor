/**
 * History regression test — the risky part of a patch-based undo stack.
 * Run: npx esbuild scripts/history-smoke.ts --bundle --platform=node --format=esm \
 *        --define:import.meta.env='{}' --outfile=/tmp/history-smoke.mjs && node /tmp/history-smoke.mjs
 */
import { useDoc } from '../src/doc/store'
import { addFilter, createDoc, defaultFilter, setFilterParam, addImageLayer } from '../src/doc/ops'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}

const s = () => useDoc.getState()
const chain = () => s().doc.layers[0]?.filter ?? []

// ---- setup
const doc = createDoc(800, 600)
addImageLayer(doc, 'src_a', 'A')
s().load(doc)
const id = s().doc.layers[0].id

check('0 entries after load', s().past.length, 0)

// ---- one discrete action
s().commit((d) => addFilter(d, id, defaultFilter('exposure')), '添加曝光')
check('1 entry after add', s().past.length, 1)
check('label recorded', s().past[0].label, '添加曝光')

// ---- a slider drag: 5 coalesced commits = 1 entry
for (let i = 1; i <= 5; i++) {
  s().commit((d) => setFilterParam(d, id, 0, { value: i * 0.1 }), '曝光', 'slider:exposure')
}
check('drag coalesced into one entry', s().past.length, 2)
check('drag value applied', (chain()[0] as { value: number }).value, 0.5)

// ---- undo the whole drag in one step
s().undo()
check('undo restores pre-drag value', (chain()[0] as { value: number }).value, 0.2)
check('undo pushed to future', s().future.length, 1)

// ---- THE BUG: a new drag right after undo must NOT merge into an older entry
s().commit((d) => setFilterParam(d, id, 0, { value: -1.2 }), '曝光', 'slider:exposure')
check('post-undo edit is a new entry', s().past.length, 2)
check('post-undo edit not merged', (chain()[0] as { value: number }).value, -1.2)
check('post-undo edit cleared redo', s().future.length, 0)

// ---- redo stack is really gone
s().redo()
check('redo is a no-op after new edit', (chain()[0] as { value: number }).value, -1.2)

// ---- jump through history
s().jumpTo(0)
check('jumpTo(0) empties the chain', chain().length, 0)
check('jumpTo(0) moved both to future', s().future.length, 2)

s().jumpTo(2)
check('jumpTo(2) restores the chain', chain().length, 1)
check('jumpTo(2) restores the value', (chain()[0] as { value: number }).value, -1.2)
check('jumpTo(2) empties future', s().future.length, 0)

// ---- undo all the way down is not destructive
for (let i = 0; i < 10; i++) s().undo()
check('extra undos are no-ops', s().past.length, 0)
check('document still exists', s().doc.layers.length, 1)

console.log(`\nfailures: ${failures}`)
process.exit(failures ? 1 : 0)
