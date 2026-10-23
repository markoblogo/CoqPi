const words = text => text.replace(/\[\[slnc \d+\]\]/g, '').normalize('NFKC')
  // Grouped thousands are formatting, not changed amounts (15 000 === 15000).
  .replace(/\b\d{1,3}(?:[ \u00a0\u202f]\d{3})+\b/g, value => value.replace(/\s/g, ''))
  .toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []

const wordErrors = (reference, actual) => {
  let row = Array.from({length:actual.length + 1}, (_, i) => i)
  for (let i = 0; i < reference.length; i++) {
    const next = [i + 1]
    for (let j = 0; j < actual.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(reference[i] !== actual[j])))
    row = next
  }
  return row[actual.length]
}

module.exports = {words, wordErrors}
