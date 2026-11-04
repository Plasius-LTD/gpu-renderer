// Explicit internal specialization: disabled source is byte-for-byte unchanged.
// Fails closed if the canonical complete-path contract changes underneath it.
export function withPersistentRadiance(source,enabled=false) {
 if(!enabled)return source;
 const replacements=[
  ['config.tilePixelCount > arrayLength(&sums)','config.canvasWidth * config.canvasHeight > arrayLength(&sums)'],
  [`let expected = min(requested, phase.firstSample);
    let covered = requested <= phase.firstSample || requested >= phase.sampleLimit;
    let valid = shared_word_valid(word) && ((word >> 9u) & 511u) == expected && covered;
    if (!valid) { atomicOr(&control.failure, 2u); }
    eligible = select(0u, 1u, valid && requested >= phase.sampleLimit);`,
   `let completed = (word >> 9u) & 511u;
    let alreadyDone = completed >= phase.sampleLimit || requested <= phase.firstSample;
    let ready = completed == phase.firstSample && requested >= phase.sampleLimit;
    let valid = shared_word_valid(word) && (alreadyDone || ready);
    if (!valid) { atomicOr(&control.failure, 2u); }
    eligible = select(0u, 1u, valid && ready);`],
  ['prior = sums[root].xyz','prior = sums[pixel].xyz'],
  ['sums[root] = vec4<f32>(next, 0.0)','sums[pixel] = vec4<f32>(next, 0.0)'],
  [`let word = pixels.words[shared_pixel(id.x)];
  let requested = word & 511u;
  if (!shared_word_valid(word) || ((word >> 9u) & 511u) != requested || !path_radiance_valid(sums[id.x].xyz)) { return; }
  resolved[id.x] = vec4<f32>(sums[id.x].xyz / f32(requested), 1.0);`,
   `let pixel = shared_pixel(id.x);
  let word = pixels.words[pixel];
  let completed = (word >> 9u) & 511u;
  if (!shared_word_valid(word) || completed == 0u || !path_radiance_valid(sums[pixel].xyz)) { return; }
  resolved[id.x] = vec4<f32>(sums[pixel].xyz / f32(completed), 1.0);`],
 ];
 for(const [before,after] of replacements){
  if(source.split(before).length!==2)throw new Error('Persistent radiance specialization no longer matches canonical WGSL.');
  source=source.replace(before,after);
 }
 return source;
}
